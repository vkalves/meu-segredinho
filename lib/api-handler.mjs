import { randomUUID } from 'node:crypto';
import { APP_SHELL_CSP, APP_SHELL_HTML, renderGraycepngHtml } from './graycepng-template.mjs';

const COOKIE_NAME = 'privame_session';
const COOKIE_AGE = 60 * 60 * 24 * 30;
const BUCKET = 'privame-avatars';
const MAX_JSON_BYTES = 3_800_000;
const GRAYCE_MODEL_MARKER = '__model:graycepng__';
const COUNTRY_DESTINATION_CODES = new Set(['BR', 'EU', 'US', 'GB']);
const COUNTRY_VARIANT_TEXT_FIELDS = {
  profileName: { column: 'profile_name', limit: 50 },
  title: { column: 'title', limit: 70 },
  subtitle: { column: 'subtitle', limit: 180 },
  buttonLabel: { column: 'button_label', limit: 36 },
  avatarUrl: { column: 'avatar_url', limit: 2048, https: true },
  onlineLabel: { column: 'online_label', limit: 32 },
  secureLabel: { column: 'secure_label', limit: 48 },
};
const COUNTRY_VARIANT_COLOR_FIELDS = {
  primaryColor: 'primary_color',
  secondaryColor: 'secondary_color',
  backgroundColor: 'background_color',
  cardColor: 'card_color',
  textColor: 'text_color',
};
const COUNTRY_VARIANT_BOOLEAN_FIELDS = {
  verified: 'verified',
  showOnline: 'show_online',
};
const RESERVED_SLUGS = new Set([
  'api', 'app', 'assets', 'dashboard', 'editor', 'login', 'register', 'logout', 'go',
  'create', 'settings', 'bianca', 'eliane', 'juju', 'nicolle', 'privame', 'vejamais', 'b',
  'favicon.ico', 'favicon.svg', 'robots.txt', 'sitemap.xml',
]);
const BASE_PAGE_FIELDS = [
  'id', 'user_id', 'slug', 'profile_name', 'title', 'subtitle', 'button_label',
  'destination_url', 'avatar_url', 'primary_color', 'secondary_color',
  'background_color', 'card_color', 'text_color', 'verified', 'show_online',
  'online_label', 'secure_label', 'clicks', 'created_at', 'updated_at',
].join(',');
const COUNTRY_DEST_PAGE_FIELDS = `${BASE_PAGE_FIELDS},country_destinations`;
const PAGE_FIELDS = `${COUNTRY_DEST_PAGE_FIELDS},country_variants`;
const PUBLIC_FIELDS = [
  'id', 'slug', 'profile_name', 'title', 'subtitle', 'button_label', 'avatar_url',
  'primary_color', 'secondary_color', 'background_color', 'card_color', 'text_color',
  'verified', 'show_online', 'online_label', 'secure_label', 'updated_at',
].join(',');

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function configuration() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !publishableKey) {
    throw new ApiError(503, 'A conexão com o Supabase ainda precisa ser configurada no projeto Vercel.');
  }
  return { url, publishableKey };
}

function baseUrl(request) {
  const configured = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (configured && (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'production')) return configured;
  return new URL(request.url).origin;
}

function secureCookie(request) {
  return new URL(request.url).protocol === 'https:' || process.env.NODE_ENV === 'production';
}

function sessionCookie(request, accessToken, refreshToken) {
  const payload = Buffer.from(JSON.stringify({ accessToken, refreshToken })).toString('base64url');
  return `${COOKIE_NAME}=${payload}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_AGE}${secureCookie(request) ? '; Secure' : ''}`;
}

function clearedCookie(request) {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie(request) ? '; Secure' : ''}`;
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const piece of header.split(';')) {
    const separator = piece.indexOf('=');
    if (separator < 0 || piece.slice(0, separator).trim() !== name) continue;
    try {
      const parsed = JSON.parse(Buffer.from(decodeURIComponent(piece.slice(separator + 1).trim()), 'base64url').toString('utf8'));
      if (parsed && typeof parsed.accessToken === 'string' && typeof parsed.refreshToken === 'string') return parsed;
    } catch {}
  }
  return null;
}

function responseJson(data, status = 200, cookies = [], extraHeaders = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(JSON.stringify(data), { status, headers });
}

function responseError(error, cookies = []) {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof ApiError ? error.message : 'Não foi possível concluir a solicitação.';
  return responseJson({ error: message }, status, cookies);
}

async function readJson(request) {
  const size = Number(request.headers.get('content-length') || 0);
  if (size > MAX_JSON_BYTES) throw new ApiError(413, 'Os dados enviados excedem o limite permitido.');
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, 'Os dados enviados não são válidos.');
  }
}

function userInfo(user) {
  if (!user) return null;
  const metadata = user.user_metadata || {};
  return {
    id: user.id,
    name: String(metadata.name || metadata.full_name || user.email || 'Sua conta').slice(0, 50),
    email: user.email || '',
  };
}

function supabaseMessage(data, status) {
  if (data?.code === '23505') return new ApiError(409, 'Este endereço já está em uso. Tente outro.');
  if (status === 401 || status === 400 && /invalid login credentials/i.test(data?.message || data?.msg || '')) {
    return new ApiError(401, 'E-mail ou senha incorretos.');
  }
  if (/already registered|user already exists/i.test(data?.message || data?.msg || '')) {
    return new ApiError(409, 'Este e-mail já tem uma conta.');
  }
  const message = data?.message || data?.msg || data?.error_description || data?.hint;
  return new ApiError(status >= 400 && status < 600 ? status : 502, message || 'O Supabase recusou a solicitação.');
}

async function supabaseRequest(config, path, { method = 'GET', body, token, key, headers = {} } = {}) {
  const apiKey = key || config.publishableKey;
  const requestHeaders = new Headers({ apikey: apiKey, ...headers });
  if (token) requestHeaders.set('Authorization', `Bearer ${token}`);
  if (body !== undefined && !(body instanceof Uint8Array)) requestHeaders.set('Content-Type', 'application/json');
  const response = await fetch(`${config.url}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : (body instanceof Uint8Array ? body : JSON.stringify(body)),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw supabaseMessage(data, response.status);
  return data;
}

async function authUser(config, accessToken) {
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: { apikey: config.publishableKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return response.json();
}

async function authContext(request, config, cookies) {
  const stored = readCookie(request, COOKIE_NAME);
  if (!stored) return { user: null, accessToken: '' };
  let user = await authUser(config, stored.accessToken);
  if (user) return { user: userInfo(user), accessToken: stored.accessToken };
  if (!stored.refreshToken) {
    cookies.push(clearedCookie(request));
    return { user: null, accessToken: '' };
  }
  try {
    const refreshed = await supabaseRequest(config, '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: { refresh_token: stored.refreshToken },
    });
    if (!refreshed.access_token || !refreshed.refresh_token) throw new Error('A renovação não retornou uma sessão.');
    user = refreshed.user || await authUser(config, refreshed.access_token);
    if (!user) throw new Error('A sessão renovada não foi reconhecida.');
    cookies.push(sessionCookie(request, refreshed.access_token, refreshed.refresh_token));
    return { user: userInfo(user), accessToken: refreshed.access_token };
  } catch {
    cookies.push(clearedCookie(request));
    return { user: null, accessToken: '' };
  }
}

function cleanText(value, limit, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, limit);
}

function cleanColor(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function slugError(slug) {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(slug)) {
    return 'Escolha um endereço de 3 a 30 caracteres: letras, números e hífen.';
  }
  if (RESERVED_SLUGS.has(slug)) return 'Este endereço é reservado para uma página ou função existente do site.';
  return '';
}

function cleanCountryDestinations(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'Informe os destinos por país em um formato válido.');
  }
  const entries = Object.entries(value);
  if (entries.length > COUNTRY_DESTINATION_CODES.size) {
    throw new ApiError(400, 'Configure no máximo um destino para cada opção: Brasil, Europa, Estados Unidos e GBP.');
  }
  const destinations = Object.create(null);
  for (const [rawCountryCode, rawUrl] of entries) {
    const countryCode = rawCountryCode.toUpperCase();
    if (!COUNTRY_DESTINATION_CODES.has(countryCode)) {
      throw new ApiError(400, 'Use apenas Brasil, Europa, Estados Unidos ou GBP nos destinos personalizados.');
    }
    if (Object.hasOwn(destinations, countryCode)) throw new ApiError(400, 'Cada país pode ter apenas um destino personalizado.');
    if (typeof rawUrl !== 'string' || rawUrl.trim().length > 2048) {
      throw new ApiError(400, 'Use endereços de até 2.048 caracteres para os destinos por país.');
    }
    let destination;
    try { destination = new URL(rawUrl.trim()); } catch {}
    if (!destination || !['http:', 'https:'].includes(destination.protocol)) {
      throw new ApiError(400, 'Cada destino por país precisa começar com http:// ou https://.');
    }
    destinations[countryCode] = destination.href;
  }
  return destinations;
}

function cleanCountryVariants(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'As personalizações por região não estão em um formato válido.');
  }
  const entries = Object.entries(value);
  if (entries.length > COUNTRY_DESTINATION_CODES.size) {
    throw new ApiError(400, 'Use somente Brasil, Europa, Estados Unidos e GBP — Reino Unido.');
  }
  const variants = Object.create(null);
  const allowedFields = new Set([
    ...Object.keys(COUNTRY_VARIANT_TEXT_FIELDS),
    ...Object.keys(COUNTRY_VARIANT_COLOR_FIELDS),
    ...Object.keys(COUNTRY_VARIANT_BOOLEAN_FIELDS),
  ]);
  for (const [group, rawVariant] of entries) {
    if (!COUNTRY_DESTINATION_CODES.has(group)) throw new ApiError(400, 'Escolha uma das quatro regiões disponíveis.');
    if (!rawVariant || typeof rawVariant !== 'object' || Array.isArray(rawVariant)) {
      throw new ApiError(400, 'Os campos de cada página regional precisam estar em um formato válido.');
    }
    for (const field of Object.keys(rawVariant)) {
      if (!allowedFields.has(field)) throw new ApiError(400, 'Há um campo regional não reconhecido.');
    }
    const variant = Object.create(null);
    for (const [field, definition] of Object.entries(COUNTRY_VARIANT_TEXT_FIELDS)) {
      if (!Object.hasOwn(rawVariant, field)) continue;
      const raw = rawVariant[field];
      if (typeof raw !== 'string' || raw.length > definition.limit) {
        throw new ApiError(400, `O campo regional "${field}" excede o limite permitido.`);
      }
      const clean = raw.trim();
      if (!clean) continue;
      if (definition.https) {
        let url;
        try { url = new URL(clean); } catch {}
        if (!url || url.protocol !== 'https:') {
          throw new ApiError(400, 'A foto regional precisa usar um endereço HTTPS.');
        }
        variant[definition.column] = url.href;
      } else {
        variant[definition.column] = clean;
      }
    }
    for (const [field, column] of Object.entries(COUNTRY_VARIANT_COLOR_FIELDS)) {
      if (!Object.hasOwn(rawVariant, field) || rawVariant[field] === '') continue;
      if (typeof rawVariant[field] !== 'string' || !/^#[0-9a-f]{6}$/i.test(rawVariant[field].trim())) {
        throw new ApiError(400, 'Use cores no formato hexadecimal, como #2AABEE.');
      }
      variant[column] = rawVariant[field].trim();
    }
    for (const [field, column] of Object.entries(COUNTRY_VARIANT_BOOLEAN_FIELDS)) {
      if (!Object.hasOwn(rawVariant, field) || rawVariant[field] === '') continue;
      const raw = rawVariant[field];
      if (raw === true || raw === 'true') variant[column] = true;
      else if (raw === false || raw === 'false') variant[column] = false;
      else throw new ApiError(400, 'Escolha usar o padrão, mostrar ou ocultar nos campos regionais.');
    }
    if (Object.keys(variant).length) variants[group] = variant;
  }
  return variants;
}

function normalizeHttpUrl(value) {
  const raw = cleanText(value, 2048);
  if (!raw) return '';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
  } catch {}
  return '';
}

function cleanPage(input) {
  const isGrayce = input.model === 'graycepng' || input.secureLabel === GRAYCE_MODEL_MARKER;
  const destinationUrl = normalizeHttpUrl(input.destinationUrl);
  const countryDestinations = cleanCountryDestinations(input.countryDestinations);
  const countryVariants = cleanCountryVariants(input.countryVariants);
  const rawSlug = cleanText(input.slug, 30).toLowerCase();

  let avatarUrl = '';
  if (isGrayce) {
    avatarUrl = destinationUrl;
    for (const group of Object.keys(countryVariants)) {
      delete countryVariants[group].secure_label;
      delete countryVariants[group].avatar_url;
      if (!Object.keys(countryVariants[group]).length) delete countryVariants[group];
    }
    for (const [code, url] of Object.entries(countryDestinations)) {
      countryVariants[code] = { ...(countryVariants[code] || {}), avatar_url: url };
    }
  } else {
    avatarUrl = cleanText(input.avatarUrl, 2048);
    if (avatarUrl && !/^https:\/\//i.test(avatarUrl)) throw new ApiError(400, 'Envie a foto pelo campo de imagem ou use um endereço HTTPS.');
  }

  const legacyTemplate = input.title === 'Seu título aqui'
    && input.subtitle === 'Escreva uma frase para receber as pessoas que chegam pela sua bio.'
    && input.buttonLabel === 'ACESSE MEU LINK';

  const profileName = isGrayce
    ? (cleanText(input.profileName, 50) || rawSlug || 'Links')
    : cleanText(input.profileName, 50);
  const title = isGrayce
    ? (cleanText(input.title, 70) || 'Restrito (+18)')
    : cleanText(legacyTemplate ? 'Ficou Curioso?' : input.title, 70);
  const buttonLabel = isGrayce
    ? (cleanText(input.buttonLabel, 36) || 'SIM, TENHO 18+')
    : cleanText(legacyTemplate ? 'MEU TLEGRAM' : input.buttonLabel, 36);
  const secureLabel = isGrayce
    ? GRAYCE_MODEL_MARKER
    : (input.secureLabel === GRAYCE_MODEL_MARKER ? 'site seguro e anônimo' : cleanText(input.secureLabel, 48));

  return {
    slug: rawSlug,
    profile_name: profileName,
    title,
    subtitle: cleanText(legacyTemplate ? 'sim, eu tenho... vem ver meus conteúd0s que nao posto em nenhum outro lugar' : input.subtitle, 180),
    button_label: buttonLabel,
    destination_url: destinationUrl,
    country_destinations: countryDestinations,
    country_variants: countryVariants,
    avatar_url: avatarUrl,
    primary_color: cleanColor(input.primaryColor, '#2AABEE'),
    secondary_color: cleanColor(input.secondaryColor, '#229ED9'),
    background_color: cleanColor(input.backgroundColor, '#eaf6fd'),
    card_color: cleanColor(input.cardColor, '#ffffff'),
    text_color: cleanColor(input.textColor, '#343434'),
    verified: Boolean(input.verified),
    show_online: Boolean(input.showOnline),
    online_label: cleanText(input.onlineLabel, 32),
    secure_label: secureLabel,
    updated_at: new Date().toISOString(),
  };
}

function countryVariantsFromRow(value) {
  const variants = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return variants;
  for (const [group, row] of Object.entries(value)) {
    if (!COUNTRY_DESTINATION_CODES.has(group) || !row || typeof row !== 'object' || Array.isArray(row)) continue;
    const variant = {};
    for (const [field, definition] of Object.entries(COUNTRY_VARIANT_TEXT_FIELDS)) {
      if (Object.hasOwn(row, definition.column)) variant[field] = row[definition.column];
    }
    for (const [field, column] of Object.entries(COUNTRY_VARIANT_COLOR_FIELDS)) {
      if (Object.hasOwn(row, column)) variant[field] = row[column];
    }
    for (const [field, column] of Object.entries(COUNTRY_VARIANT_BOOLEAN_FIELDS)) {
      if (Object.hasOwn(row, column)) variant[field] = row[column];
    }
    if (Object.keys(variant).length) variants[group] = variant;
  }
  return variants;
}

function isGrayceRow(row) {
  return Boolean(row && row.secure_label === GRAYCE_MODEL_MARKER);
}

function pageFromRow(row) {
  const isGrayce = isGrayceRow(row);
  const countryDestinations = row.country_destinations || {};
  const countryVariants = countryVariantsFromRow(row.country_variants);
  if (isGrayce) {
    for (const [code, variant] of Object.entries(countryVariants)) {
      if (variant.avatarUrl && variant.avatarUrl === countryDestinations[code]) {
        delete variant.avatarUrl;
      }
      if (!Object.keys(variant).length) delete countryVariants[code];
    }
  }
  return {
    id: row.id, slug: row.slug,
    model: isGrayce ? 'graycepng' : 'profile',
    profileName: row.profile_name, title: row.title,
    subtitle: row.subtitle, buttonLabel: row.button_label,
    destinationUrl: row.destination_url || (isGrayce ? row.avatar_url : ''),
    countryDestinations, countryVariants,
    avatarUrl: isGrayce ? '' : row.avatar_url,
    primaryColor: row.primary_color, secondaryColor: row.secondary_color,
    backgroundColor: row.background_color, cardColor: row.card_color, textColor: row.text_color,
    verified: row.verified, showOnline: row.show_online, onlineLabel: row.online_label,
    secureLabel: isGrayce ? 'site seguro e anônimo' : row.secure_label,
    clicks: Number(row.clicks || 0), updatedAt: row.updated_at,
  };
}

function publicPageFromRow(row) {
  const isGrayce = isGrayceRow(row);
  return {
    id: row.id, slug: row.slug,
    model: isGrayce ? 'graycepng' : 'profile',
    profileName: row.profile_name, title: row.title,
    subtitle: row.subtitle, buttonLabel: row.button_label,
    destinationUrl: isGrayce ? (row.destination_url || row.avatar_url || '') : undefined,
    avatarUrl: isGrayce ? '' : row.avatar_url,
    primaryColor: row.primary_color, secondaryColor: row.secondary_color,
    backgroundColor: row.background_color, cardColor: row.card_color, textColor: row.text_color,
    verified: row.verified, showOnline: row.show_online, onlineLabel: row.online_label,
    secureLabel: isGrayce ? '' : row.secure_label,
    updatedAt: row.updated_at,
  };
}

function responseAppShell() {
  return new Response(APP_SHELL_HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Content-Security-Policy': APP_SHELL_CSP,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function responseGrayceHtml(destinationUrl) {
  return new Response(renderGraycepngHtml(destinationUrl), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function databaseRequest(config, path, { method = 'GET', body, accessToken, headers = {} } = {}) {
  const requestHeaders = new Headers({ apikey: config.publishableKey, ...headers });
  if (accessToken) requestHeaders.set('Authorization', `Bearer ${accessToken}`);
  if (body !== undefined && !(body instanceof Uint8Array)) requestHeaders.set('Content-Type', 'application/json');
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : (body instanceof Uint8Array ? body : JSON.stringify(body)),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw supabaseMessage(data, response.status);
  return data;
}

async function requireUser(request, config, cookies) {
  const auth = await authContext(request, config, cookies);
  if (!auth.user) throw new ApiError(401, 'Entre na sua conta para continuar.');
  return auth;
}

function validateSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  let requestOrigin;
  try { requestOrigin = new URL(request.url).origin; } catch { throw new ApiError(400, 'Origem da solicitação inválida.'); }
  if (origin !== requestOrigin) throw new ApiError(403, 'A origem desta solicitação não foi autorizada.');
}

async function handleAuth(request, config, pathname, cookies) {
  if (request.method === 'GET' && pathname === '/api/session') {
    const auth = await authContext(request, config, cookies);
    return responseJson({ user: auth.user, baseUrl: baseUrl(request) }, 200, cookies);
  }
  if (request.method === 'POST' && pathname === '/api/auth/register') {
    const body = await readJson(request);
    const name = cleanText(body.name, 50);
    const email = cleanText(body.email, 254).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    if (name.length < 2) throw new ApiError(400, 'Informe seu nome.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Informe um e-mail válido.');
    if (password.length < 8 || password.length > 128) throw new ApiError(400, 'Use uma senha com pelo menos 8 caracteres.');
    const redirectTo = `${baseUrl(request)}/auth/callback`;
    const data = await supabaseRequest(config, `/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: 'POST', body: { email, password, data: { name } },
    });
    if (data.access_token && data.refresh_token) cookies.push(sessionCookie(request, data.access_token, data.refresh_token));
    const user = userInfo(data.user);
    if (!data.access_token) {
      return responseJson({ user: null, needsEmailConfirmation: true, email, baseUrl: baseUrl(request) }, 201, cookies);
    }
    return responseJson({ user, baseUrl: baseUrl(request) }, 201, cookies);
  }
  if (request.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readJson(request);
    const email = cleanText(body.email, 254).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const data = await supabaseRequest(config, '/auth/v1/token?grant_type=password', {
      method: 'POST', body: { email, password },
    });
    if (!data.access_token || !data.refresh_token) throw new ApiError(401, 'E-mail ou senha incorretos.');
    cookies.push(sessionCookie(request, data.access_token, data.refresh_token));
    return responseJson({ user: userInfo(data.user), baseUrl: baseUrl(request) }, 200, cookies);
  }
  if (request.method === 'POST' && pathname === '/api/auth/callback') {
    const body = await readJson(request);
    if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string') throw new ApiError(400, 'Não encontramos uma sessão de confirmação válida.');
    const user = await authUser(config, body.access_token);
    if (!user) throw new ApiError(401, 'O link de confirmação expirou. Peça um novo e-mail de confirmação.');
    cookies.push(sessionCookie(request, body.access_token, body.refresh_token));
    return responseJson({ user: userInfo(user), baseUrl: baseUrl(request) }, 200, cookies);
  }
  if (request.method === 'POST' && pathname === '/api/auth/logout') {
    const stored = readCookie(request, COOKIE_NAME);
    if (stored?.accessToken) {
      try {
        await fetch(`${config.url}/auth/v1/logout`, {
          method: 'POST', headers: { apikey: config.publishableKey, Authorization: `Bearer ${stored.accessToken}` },
        });
      } catch {}
    }
    cookies.push(clearedCookie(request));
    return responseJson({ ok: true }, 200, cookies);
  }
  return null;
}

async function uploadAvatar(request, config, auth) {
  const body = await readJson(request);
  if (typeof body.dataUrl !== 'string' || body.dataUrl.length > 2_850_000) throw new ApiError(400, 'A imagem precisa ter até 2 MB.');
  const match = body.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new ApiError(400, 'Envie uma imagem JPEG, PNG ou WebP.');
  const mimeType = match[1];
  const image = Buffer.from(match[2], 'base64');
  if (!image.length || image.length > 2 * 1024 * 1024) throw new ApiError(400, 'A imagem precisa ter até 2 MB.');
  const signatures = {
    'image/jpeg': image.length > 2 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff,
    'image/png': image.length > 8 && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/webp': image.length > 12 && image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP',
  };
  if (!signatures[mimeType]) throw new ApiError(400, 'O arquivo enviado não corresponde ao tipo de imagem informado.');
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mimeType];
  const objectPath = `${auth.user.id}/${randomUUID()}.${extension}`;
  const uploaded = await fetch(`${config.url}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${auth.accessToken}`,
      'Content-Type': mimeType,
      'x-upsert': 'false',
    },
    body: image,
  });
  if (!uploaded.ok) {
    const details = await uploaded.json().catch(() => ({}));
    throw supabaseMessage(details, uploaded.status);
  }
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  return `${config.url}/storage/v1/object/public/${BUCKET}/${encodedPath}`;
}

function countryDestinationGroup(request) {
  const countryHeader = (request.headers.get('x-vercel-ip-country') || '').trim().toUpperCase();
  const continentHeader = (request.headers.get('x-vercel-ip-continent') || '').trim().toUpperCase();
  const countryCode = /^[A-Z]{2}$/.test(countryHeader) ? countryHeader : '';
  const continentCode = /^[A-Z]{2}$/.test(continentHeader) ? continentHeader : '';
  return ['BR', 'US', 'GB'].includes(countryCode)
    ? countryCode
    : continentCode === 'EU' ? 'EU' : '';
}

function isMissingRegionalColumnError(error) {
  return Boolean(error && /country_variants|country_destinations/i.test(error.message || ''));
}

async function fetchPublicPageRow(config, slug, countryGroup) {
  const cleanSlug = String(slug || '').trim().toLowerCase();
  if (!cleanSlug) return null;
  try {
    const row = await databaseRequest(config, 'rpc/get_public_page_for_region', {
      method: 'POST',
      body: { page_slug: cleanSlug, country_group: countryGroup },
    });
    if (row && typeof row === 'object' && !Array.isArray(row) && row.id) return row;
    if (Array.isArray(row) && row[0]?.id) return row[0];
    if (row === null) return null;
  } catch {}
  const rows = await databaseRequest(config, `pages?select=${PUBLIC_FIELDS}&slug=eq.${encodeURIComponent(cleanSlug)}&limit=1`);
  return rows?.[0] || null;
}

async function resolveGoDestination(config, slug, countryCode) {
  const cleanSlug = String(slug || '').trim().toLowerCase();
  if (!cleanSlug) return '';
  try {
    const destination = await databaseRequest(config, 'rpc/increment_page_clicks', {
      method: 'POST',
      body: { page_slug: cleanSlug, country_code: countryCode },
    });
    if (typeof destination === 'string' && destination.trim()) return destination.trim();
  } catch {
    try {
      const destination = await databaseRequest(config, 'rpc/increment_page_clicks', {
        method: 'POST',
        body: { page_slug: cleanSlug },
      });
      if (typeof destination === 'string' && destination.trim()) return destination.trim();
    } catch {}
  }
  try {
    const row = await fetchPublicPageRow(config, cleanSlug, countryCode);
    const fallbackUrl = row?.destination_url || (isGrayceRow(row) ? row?.avatar_url : '');
    if (typeof fallbackUrl === 'string' && fallbackUrl.trim()) return fallbackUrl.trim();
  } catch {}
  return '';
}

async function listUserPages(config, userId, accessToken) {
  for (const fields of [PAGE_FIELDS, COUNTRY_DEST_PAGE_FIELDS, BASE_PAGE_FIELDS]) {
    try {
      return await databaseRequest(config, `pages?select=${fields}&user_id=eq.${userId}&order=updated_at.desc`, { accessToken });
    } catch (error) {
      if (!isMissingRegionalColumnError(error) || fields === BASE_PAGE_FIELDS) throw error;
    }
  }
  return [];
}

async function saveUserPage(config, { method, query = '', body, accessToken }) {
  const attempts = [
    { fields: PAGE_FIELDS, payload: body },
    {
      fields: COUNTRY_DEST_PAGE_FIELDS,
      payload: Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'country_variants')),
    },
    {
      fields: BASE_PAGE_FIELDS,
      payload: Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'country_variants' && key !== 'country_destinations')),
    },
  ];
  for (let i = 0; i < attempts.length; i += 1) {
    const { fields, payload } = attempts[i];
    try {
      const prefix = query ? `${query}&` : '';
      return await databaseRequest(config, `pages?${prefix}select=${fields}`, {
        method,
        accessToken,
        headers: { Prefer: 'return=representation' },
        body: payload,
      });
    } catch (error) {
      if (!isMissingRegionalColumnError(error) || i === attempts.length - 1) throw error;
    }
  }
  return [];
}

async function handleBeacon(request) {
  if (request.method === 'POST') {
    try {
      const text = await request.text();
      const payload = text ? JSON.parse(text) : null;
      if (payload?.p === 'attempt') {
        const referer = request.headers.get('referer') || '';
        const refPath = referer ? new URL(referer).pathname.replace(/\/+$/, '') : '';
        const slugMatch = refPath.match(/^\/([a-z0-9-]{1,30})$/i);
        if (slugMatch && !RESERVED_SLUGS.has(slugMatch[1].toLowerCase())) {
          const config = configuration();
          await resolveGoDestination(config, slugMatch[1].toLowerCase(), countryDestinationGroup(request));
        }
      }
    } catch {}
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

async function handlePublicHtmlRender(request, slug) {
  try {
    const config = configuration();
    const row = await fetchPublicPageRow(config, slug, countryDestinationGroup(request));
    if (row && isGrayceRow(row)) {
      return responseGrayceHtml(row.destination_url || row.avatar_url || '');
    }
  } catch {}
  return responseAppShell();
}

async function handlePageApi(request, config, pathname, cookies) {
  const url = new URL(request.url);
  const publicMatch = pathname.match(/^\/api\/public(?:\/([a-z0-9-]{1,30}))?$/i);
  const publicSlug = (publicMatch?.[1] || (publicMatch ? url.searchParams.get('slug') : '') || '').toLowerCase();
  if (request.method === 'GET' && publicSlug) {
    const row = await fetchPublicPageRow(config, publicSlug, countryDestinationGroup(request));
    if (!row) throw new ApiError(404, 'Esta página ainda não existe.');
    return responseJson({ page: publicPageFromRow(row), baseUrl: baseUrl(request) });
  }

  const goMatch = pathname.match(/^\/api\/go(?:\/([a-z0-9-]{1,30}))?$/i);
  const goSlug = (goMatch?.[1] || (goMatch ? url.searchParams.get('slug') : '') || '').toLowerCase();
  if (['GET', 'HEAD'].includes(request.method) && goSlug) {
    const destinationCode = countryDestinationGroup(request);
    const destination = await resolveGoDestination(config, goSlug, destinationCode);
    let target;
    try { target = new URL(destination); } catch { throw new ApiError(404, 'Este link não está disponível.'); }
    if (!['http:', 'https:'].includes(target.protocol)) throw new ApiError(404, 'Este link não está disponível.');
    return new Response(null, { status: 302, headers: { Location: target.href, 'Cache-Control': 'no-store' } });
  }

  const auth = await requireUser(request, config, cookies);
  if (request.method === 'GET' && pathname === '/api/pages') {
    const rows = await listUserPages(config, auth.user.id, auth.accessToken);
    return responseJson({ pages: (rows || []).map(pageFromRow), baseUrl: baseUrl(request) }, 200, cookies);
  }
  if (request.method === 'POST' && pathname === '/api/uploads') {
    const avatarUrl = await uploadAvatar(request, config, auth);
    return responseJson({ avatarUrl }, 201, cookies);
  }
  if (request.method === 'POST' && pathname === '/api/pages') {
    const page = cleanPage(await readJson(request));
    const invalidSlug = slugError(page.slug);
    if (invalidSlug) throw new ApiError(400, invalidSlug);
    if (!page.profile_name || !page.title || !page.destination_url || !page.button_label) {
      throw new ApiError(400, 'Preencha os campos obrigatórios e o endereço do link final.');
    }
    const rows = await saveUserPage(config, {
      method: 'POST',
      accessToken: auth.accessToken,
      body: { ...page, user_id: auth.user.id },
    });
    if (!rows?.length) throw new ApiError(500, 'A página não foi salva. Confira as permissões do banco.');
    return responseJson({ page: pageFromRow(rows[0]), baseUrl: baseUrl(request) }, 201, cookies);
  }
  const pageMatch = pathname.match(/^\/api\/pages(?:\/([0-9a-f-]{36}))?$/i);
  const pageId = pageMatch?.[1] || (pageMatch ? url.searchParams.get('id') : '');
  if (pageId && /^[0-9a-f-]{36}$/i.test(pageId) && request.method === 'PUT') {
    const page = cleanPage(await readJson(request));
    const invalidSlug = slugError(page.slug);
    if (invalidSlug) throw new ApiError(400, invalidSlug);
    if (!page.profile_name || !page.title || !page.destination_url || !page.button_label) {
      throw new ApiError(400, 'Preencha os campos obrigatórios e o endereço do link final.');
    }
    const rows = await saveUserPage(config, {
      method: 'PATCH',
      query: `id=eq.${pageId}&user_id=eq.${auth.user.id}`,
      accessToken: auth.accessToken,
      body: page,
    });
    if (!rows?.length) throw new ApiError(404, 'Não encontramos essa página na sua conta.');
    return responseJson({ page: pageFromRow(rows[0]), baseUrl: baseUrl(request) }, 200, cookies);
  }
  if (pageId && /^[0-9a-f-]{36}$/i.test(pageId) && request.method === 'DELETE') {
    const rows = await databaseRequest(config, `pages?id=eq.${pageId}&user_id=eq.${auth.user.id}&select=id`, {
      method: 'DELETE', accessToken: auth.accessToken,
      headers: { Prefer: 'return=representation' },
    });
    if (!rows?.length) throw new ApiError(404, 'Não encontramos essa página na sua conta.');
    return responseJson({ ok: true }, 200, cookies);
  }
  return null;
}

export async function handleApi(request) {
  const cookies = [];
  try {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    if (pathname === '/b' || pathname === '/api/b') {
      return await handleBeacon(request);
    }
    const directSlugMatch = !pathname.startsWith('/api/') ? pathname.match(/^\/([a-z0-9-]{1,30})$/i) : null;
    const publicApiSlugMatch = pathname.match(/^\/api\/public(?:\/([a-z0-9-]{1,30}))?$/i);
    const candidateSlug = (directSlugMatch?.[1] || publicApiSlugMatch?.[1] || (publicApiSlugMatch ? url.searchParams.get('slug') : '') || '').toLowerCase();
    const wantsHtml = Boolean(directSlugMatch) || url.searchParams.get('render') === '1' || (request.headers.get('accept') || '').includes('text/html');
    if (['GET', 'HEAD'].includes(request.method) && candidateSlug && wantsHtml) {
      return await handlePublicHtmlRender(request, candidateSlug);
    }
    if (!pathname.startsWith('/api/')) return responseJson({ error: 'Rota não encontrada.' }, 404);
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) validateSameOrigin(request);
    const config = configuration();
    const authResponse = await handleAuth(request, config, pathname, cookies);
    if (authResponse) return authResponse;
    if (request.method === 'GET' && pathname === '/api/session') {
      const auth = await authContext(request, config, cookies);
      return responseJson({ user: auth.user, baseUrl: baseUrl(request) }, 200, cookies);
    }
    const result = await handlePageApi(request, config, pathname, cookies);
    if (result) return result;
    return responseJson({ error: 'Rota não encontrada.' }, 404, cookies);
  } catch (error) {
    return responseError(error, cookies);
  }
}

export default { fetch: handleApi };

