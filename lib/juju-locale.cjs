const SPANISH_COUNTRIES = new Set([
  'ES', 'MX', 'AR', 'BO', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'SV',
  'GQ', 'GT', 'HN', 'NI', 'PA', 'PY', 'PE', 'PR', 'UY', 'VE',
]);
const ARABIC_COUNTRIES = new Set([
  'DZ', 'BH', 'KM', 'DJ', 'EG', 'IQ', 'JO', 'KW', 'LB', 'LY', 'MR',
  'MA', 'OM', 'PS', 'QA', 'SA', 'SO', 'SD', 'SY', 'TN', 'AE', 'YE',
]);

exports.jujuLocale = function jujuLocale(country) {
  const code = String(country || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === 'XX' || code === 'BR') return 'pt-BR';
  if (SPANISH_COUNTRIES.has(code)) return 'es';
  if (ARABIC_COUNTRIES.has(code)) return 'ar';
  return 'en';
}

exports.JUJU_LOCALE_PATHS = {
  en: '/juju/international.html',
  es: '/juju/es.html',
  ar: '/juju/ar.html',
};
