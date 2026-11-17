import { jujuLocale } from './juju-locale.cjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = (value, limit) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit);
function geoHeader(request, name, limit) {
  let value = request.headers.get(name) || '';
  try { value = decodeURIComponent(value); } catch {}
  return clean(value, limit);
}
export function trackingEvent(request, input) {
  if (!input || !/^[a-z0-9][a-z0-9-]{0,29}$/.test(input.site || '') || !UUID.test(input.eventId || '') || !UUID.test(input.visitorId || '') || !['view', 'click'].includes(input.type)) {
    throw new Error('Evento de rastreamento inválido.');
  }
  const code = geoHeader(request, 'x-vercel-ip-country', 80).toUpperCase();
  const country = /^[A-Z]{2}$/.test(code) && code !== 'XX' ? code : '';
  let referrer = '';
  try { const url = new URL(input.referrer); if (['https:', 'http:'].includes(url.protocol)) referrer = url.hostname; } catch {}
  return {
    event_id: input.eventId, site_id: input.site, visitor_id: input.visitorId,
    event_type: input.type, country,
    region: geoHeader(request, 'x-vercel-ip-country-region', 80),
    city: geoHeader(request, 'x-vercel-ip-city', 120), locale: input.site === 'juju' ? jujuLocale(country) : (['pt-BR','en','es','ar'].includes(input.locale) ? input.locale : 'pt-BR'),
    utm_source: clean(input.source, 100), utm_medium: clean(input.medium, 100),
    utm_campaign: clean(input.campaign, 150), referrer_host: clean(referrer, 253),
  };
}
