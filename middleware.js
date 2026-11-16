import { geolocation, next, rewrite } from '@vercel/functions';

export const config = { matcher: ['/juju', '/juju/:path*'] };

export default function middleware(request) {
  const url = new URL(request.url);
  if (!['/juju', '/juju/', '/juju/index.html'].includes(url.pathname)) return next();
  const country = geolocation(request).country;
  // Unknown locations keep the original Brazilian experience.
  if (!country || !/^[A-Z]{2}$/.test(country) || country === 'BR' || country === 'XX') return next();
  url.pathname = '/juju/international.html';
  return rewrite(url);
}
