import { geolocation, next, rewrite } from '@vercel/functions';

export const config = { matcher: ['/juju', '/juju/:path*'] };

export default function middleware(request) {
  const url = new URL(request.url);
  if (!['/juju', '/juju/', '/juju/index.html'].includes(url.pathname)) return next();
  const country = geolocation(request).country;
  const international = Boolean(country && /^[A-Z]{2}$/.test(country) && country !== 'BR' && country !== 'XX');
  if (international) url.pathname = '/juju/international.html';
  const response = international ? rewrite(url) : next();
  response.headers.set('Content-Language', international ? 'en' : 'pt-BR');
  response.headers.set('X-Juju-Country', country || 'unknown');
  return response;
}
