import { geolocation, next, redirect, rewrite } from '@vercel/functions';
import { jujuLocale, JUJU_LOCALE_PATHS } from './lib/juju-locale.cjs';

export const config = { matcher: ['/juju', '/juju/:path*', '/biancay', '/biancay/'] };

export default function middleware(request) {
  const url = new URL(request.url);
  if (url.pathname === '/biancay' || url.pathname === '/biancay/') {
    const country = String(geolocation(request).country || '').toUpperCase();
    if (/^[A-Z]{2}$/.test(country) && country !== 'XX' && country !== 'BR') {
      return redirect('https://t.me/biancarossi1_bot', 307);
    }
    return next();
  }
  if (!['/juju', '/juju/', '/juju/index.html'].includes(url.pathname)) return next();
  const country = geolocation(request).country;
  const locale = jujuLocale(country);
  const destination = JUJU_LOCALE_PATHS[locale];
  if (destination) url.pathname = destination;
  const response = destination ? rewrite(url) : next();
  response.headers.set('Content-Language', locale);
  response.headers.set('X-Juju-Country', country || 'unknown');
  return response;
}
