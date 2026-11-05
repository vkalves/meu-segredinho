const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const LEGACY_PROJECTS = new Set(['bianca', 'eliane', 'juju', 'nicolle', 'privame']);
const ROOT_ASSETS = new Set(['biancaperfil.jpeg', 'elianeperfil.jpg', 'imagem.jpg', 'jujup.jpg', 'nicollep.jpg']);
const APP_FILES = new Map([
  ['/app-shell.html', ['app-shell.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);

function mimeType(file) {
  const extension = path.extname(file).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  }[extension] || 'application/octet-stream';
}

function writeFile(res, file, { cache = 'no-cache', appShell = false } = {}) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  const headers = {
    'Content-Type': mimeType(file),
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff',
  };
  if (appShell) headers['Content-Security-Policy'] = "default-src 'self' data: https:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
  return true;
}

function serveLegacy(res, rawPathname) {
  if (rawPathname === '/') return writeFile(res, path.join(ROOT, 'index.html'));
  const segments = rawPathname.split('/').filter(Boolean);
  if (!segments.length || segments.some((part) => part === '.' || part === '..' || !/^[a-zA-Z0-9_.-]+$/.test(part))) return false;
  let file;
  if (segments.length === 1 && ROOT_ASSETS.has(segments[0])) {
    file = path.join(ROOT, segments[0]);
  } else if (LEGACY_PROJECTS.has(segments[0])) {
    if (segments.length === 1 && !rawPathname.endsWith('/')) {
      res.writeHead(301, { Location: `${rawPathname}/`, 'Cache-Control': 'no-cache' });
      res.end();
      return true;
    }
    file = path.resolve(ROOT, ...segments);
    const projectRoot = path.resolve(ROOT, segments[0]);
    const relative = path.relative(projectRoot, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  } else {
    return false;
  }
  const allowed = ['.html', '.css', '.js', '.svg', '.jpg', '.jpeg', '.png', '.webp'];
  if (!allowed.includes(path.extname(file).toLowerCase())) return false;
  if (path.dirname(file) === ROOT && file !== path.join(ROOT, 'index.html') && !ROOT_ASSETS.has(path.basename(file))) return false;
  return writeFile(res, file, { cache: file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600' });
}

function isAppPath(pathname) {
  return pathname === '/dashboard' || pathname === '/login' || pathname === '/register' ||
    pathname === '/create' || pathname === '/auth/callback' || /^\/editor\/[0-9a-f-]{36}$/i.test(pathname) ||
    /^\/[a-z0-9-]{1,30}$/i.test(pathname);
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readRequestBuffer(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4_000_000) throw Object.assign(new Error('A solicitação excede o limite permitido.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function serveApi(req, res, url) {
  const body = ['GET', 'HEAD'].includes(req.method) ? Buffer.alloc(0) : await readRequestBuffer(req);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  const request = new Request(url, { method: req.method, headers, body: body.length ? body : undefined });
  const { handleApi } = await import('./lib/api-handler.mjs');
  const response = await handleApi(request);
  const outgoing = {};
  response.headers.forEach((value, name) => {
    if (name.toLowerCase() !== 'set-cookie') outgoing[name] = value;
  });
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  if (cookies.length) outgoing['Set-Cookie'] = cookies;
  res.writeHead(response.status, outgoing);
  res.end(Buffer.from(await response.arrayBuffer()));
}

const server = http.createServer(async (req, res) => {
  try {
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    const url = new URL(req.url, `${proto}://${host}`);
    const rawPathname = decodeURIComponent(url.pathname);
    const pathname = rawPathname.replace(/\/+$/, '') || '/';

    if (pathname.startsWith('/api/')) return await serveApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Método não permitido.' });
    if (APP_FILES.has(pathname)) {
      const [file] = APP_FILES.get(pathname);
      return writeFile(res, path.join(PUBLIC_DIR, file), { appShell: pathname === '/app-shell.html' });
    }
    if (serveLegacy(res, rawPathname)) return;
    if (isAppPath(pathname)) return writeFile(res, path.join(PUBLIC_DIR, 'app-shell.html'), { appShell: true });
    return sendJson(res, 404, { error: 'Rota não encontrada.' });
  } catch (error) {
    if (res.headersSent || res.destroyed) return;
    sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'Não foi possível concluir a solicitação.' });
  }
});

server.listen(PORT, () => console.log(`Privame Links: http://localhost:${PORT}/dashboard`));
