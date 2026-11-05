import { randomUUID } from 'node:crypto';

const COOKIE_NAME = 'privame_session';
const COOKIE_AGE = 60 * 60 * 24 * 30;
const BUCKET = 'privame-avatars';
const MAX_JSON_BYTES = 3_800_000;
const RESERVED_SLUGS = new Set([
  'api', 'app', 'assets', 'dashboard', 'editor', 'login', 'register', 'logout', 'go',
  'create', 'settings', 'bianca', 'eliane', 'juju', 'nicolle', 'privame',
  'favicon.ico', 'favicon.svg', 'robots.txt', 'sitemap.xml',
]);
const PAGE_FIELDS = [
  'id', 'user_id', 'slug', 'profile_name', 'title', 'subtitle', 'button_label',
  'destination_url', 'avatar_url', 'primary_color', 'secondary_color',
  'background_color', 'card_color', 'text_color', 'verified', 'show_online',
  'online_label', 'secure_label', 'clicks', 'created_at', 'updated_at',
].join(',');
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

function cleanPage(input) {
  let destinationUrl = '';
  try {
    const parsed = new URL(cleanText(input.destinationUrl, 2048));
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') destinationUrl = parsed.href;
  } catch {}
  const avatarUrl = cleanText(input.avatarUrl, 2048);
  if (avatarUrl && !/^https:\/\//i.test(avatarUrl)) throw new ApiError(400, 'Envie a foto pelo campo de imagem ou use um endereço HTTPS.');
  return {
    slug: cleanText(input.slug, 30).toLowerCase(),
    profile_name: cleanText(input.profileName, 50),
    title: cleanText(input.title, 70),
    subtitle: cleanText(input.subtitle, 180),
    button_label: cleanText(input.buttonLabel, 36),
    destination_url: destinationUrl,
    avatar_url: avatarUrl,
    primary_color: cleanColor(input.primaryColor, '#2AABEE'),
    secondary_color: cleanColor(input.secondaryColor, '#229ED9'),
    background_color: cleanColor(input.backgroundColor, '#eaf6fd'),
    card_color: cleanColor(input.cardColor, '#ffffff'),
    text_color: cleanColor(input.textColor, '#343434'),
    verified: Boolean(input.verified),
    show_online: Boolean(input.showOnline),
    online_label: cleanText(input.onlineLabel, 32),
    secure_label: cleanText(input.secureLabel, 48),
    updated_at: new Date().toISOString(),
  };
}

function pageFromRow(row) {
  return {
    id: row.id, slug: row.slug, profileName: row.profile_name, title: row.title,
    subtitle: row.subtitle, buttonLabel: row.button_label, destinationUrl: row.destination_url,
    avatarUrl: row.avatar_url, primaryColor: row.primary_color, secondaryColor: row.secondary_color,
    backgroundColor: row.background_color, cardColor: row.card_color, textColor: row.text_color,
    verified: row.verified, showOnline: row.show_online, onlineLabel: row.online_label,
    secureLabel: row.secure_label, clicks: Number(row.clicks || 0), updatedAt: row.updated_at,
  };
}

function publicPageFromRow(row) {
  return {
    id: row.id, slug: row.slug, profileName: row.profile_name, title: row.title,
    subtitle: row.subtitle, buttonLabel: row.button_label, avatarUrl: row.avatar_url,
    primaryColor: row.primary_color, secondaryColor: row.secondary_color,
    backgroundColor: row.background_color, cardColor: row.card_color, textColor: row.text_color,
    verified: row.verified, showOnline: row.show_online, onlineLabel: row.online_label,
    secureLabel: row.secure_label, updatedAt: row.updated_at,
  };
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

async function handlePageApi(request, config, pathname, cookies) {
  const publicMatch = pathname.match(/^\/api\/public\/([a-z0-9-]{1,30})$/);
  if (request.method === 'GET' && publicMatch) {
    const slug = publicMatch[1];
    const rows = await databaseRequest(config, `pages?select=${PUBLIC_FIELDS}&slug=eq.${encodeURIComponent(slug)}&limit=1`);
    if (!rows?.length) throw new ApiError(404, 'Esta página ainda não existe.');
    return responseJson({ page: publicPageFromRow(rows[0]), baseUrl: baseUrl(request) });
  }

  const goMatch = pathname.match(/^\/api\/go\/([a-z0-9-]{1,30})$/);
  if (request.method === 'GET' && goMatch) {
    const destination = await databaseRequest(config, 'rpc/increment_page_clicks', {
      method: 'POST', body: { page_slug: goMatch[1] },
    });
    let target;
    try { target = new URL(destination); } catch { throw new ApiError(404, 'Este link não está disponível.'); }
    if (!['http:', 'https:'].includes(target.protocol)) throw new ApiError(404, 'Este link não está disponível.');
    return new Response(null, { status: 302, headers: { Location: target.href, 'Cache-Control': 'no-store' } });
  }

  const auth = await requireUser(request, config, cookies);
  if (request.method === 'GET' && pathname === '/api/pages') {
    const rows = await databaseRequest(config, `pages?select=${PAGE_FIELDS}&user_id=eq.${auth.user.id}&order=updated_at.desc`, { accessToken: auth.accessToken });
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
      throw new ApiError(400, 'Preencha nome, título, texto do botão e o endereço que ele vai abrir.');
    }
    const rows = await databaseRequest(config, `pages?select=${PAGE_FIELDS}`, {
      method: 'POST', accessToken: auth.accessToken,
      headers: { Prefer: 'return=representation' }, body: { ...page, user_id: auth.user.id },
    });
    if (!rows?.length) throw new ApiError(500, 'A página não foi salva. Confira as permissões do banco.');
    return responseJson({ page: pageFromRow(rows[0]), baseUrl: baseUrl(request) }, 201, cookies);
  }
  const pageMatch = pathname.match(/^\/api\/pages\/([0-9a-f-]{36})$/i);
  if (pageMatch && request.method === 'PUT') {
    const page = cleanPage(await readJson(request));
    const invalidSlug = slugError(page.slug);
    if (invalidSlug) throw new ApiError(400, invalidSlug);
    if (!page.profile_name || !page.title || !page.destination_url || !page.button_label) {
      throw new ApiError(400, 'Preencha nome, título, texto do botão e o endereço que ele vai abrir.');
    }
    const rows = await databaseRequest(config, `pages?id=eq.${pageMatch[1]}&user_id=eq.${auth.user.id}&select=${PAGE_FIELDS}`, {
      method: 'PATCH', accessToken: auth.accessToken,
      headers: { Prefer: 'return=representation' }, body: page,
    });
    if (!rows?.length) throw new ApiError(404, 'Não encontramos essa página na sua conta.');
    return responseJson({ page: pageFromRow(rows[0]), baseUrl: baseUrl(request) }, 200, cookies);
  }
  if (pageMatch && request.method === 'DELETE') {
    const rows = await databaseRequest(config, `pages?id=eq.${pageMatch[1]}&user_id=eq.${auth.user.id}&select=id`, {
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
