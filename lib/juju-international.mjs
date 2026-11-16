// Generate translated pages from the original layout, including accessible labels.
const SOURCE = [
  'juju abacate | Exclusivo', 'Ficou Curioso?',
  'sim, eu tenho... vem ver meus conteúd0s que nao posto em nenhum outro lugar',
  'online agora', 'MEU TELEGRAM', 'site seguro e anônimo', 'abrindo t3legram...',
  'Conta verificada', 'Alternar modo escuro', 'Ativar modo claro', 'Ativar modo escuro',
];
const COPY = {
  en: [
    'juju abacate | Exclusive', 'Feeling curious?',
    "Yes, I do... come see the content I don't post anywhere else",
    'online now', 'MY TELEGRAM', 'safe and anonymous site', 'opening Telegram...',
    'Verified account', 'Toggle dark mode', 'Enable light mode', 'Enable dark mode',
  ],
  es: [
    'juju abacate | Exclusivo', '¿Te da curiosidad?',
    'Sí, tengo... ven a ver el contenido que no publico en ningún otro lugar',
    'en línea ahora', 'MI TELEGRAM', 'sitio seguro y anónimo', 'abriendo Telegram...',
    'Cuenta verificada', 'Alternar modo oscuro', 'Activar modo claro', 'Activar modo oscuro',
  ],
  ar: [
    'juju abacate | محتوى حصري', 'هل أنت فضولي؟',
    'نعم، لدي المزيد... تعال وشاهد محتواي الذي لا أنشره في أي مكان آخر',
    'متصلة الآن', 'حسابي على تيليجرام', 'موقع آمن ومجهول الهوية', 'جارٍ فتح تيليجرام...',
    'حساب موثّق', 'تبديل الوضع الداكن', 'تفعيل الوضع الفاتح', 'تفعيل الوضع الداكن',
  ],
};

export function internationalJujuHtml(original, locale = 'en') {
  if (!Object.hasOwn(COPY, locale)) throw new Error(`Unsupported Juju locale: ${locale}`);
  const translations = [
    ['lang="pt-BR"', `lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"`],
    ...SOURCE.map((source, index) => [source, COPY[locale][index]]),
    ['https://abrir.link/rauEa', 'https://abrir.link/BBiZW'],
    ['"jujup.jpg"', '"/juju/jujup.jpg"'],
  ];
  let html = translations.reduce((result, [from, to]) => {
    if (!result.includes(from)) throw new Error(`Juju translation source missing: ${from}`);
    return result.replaceAll(from, to);
  }, original);
  if (locale === 'ar') {
    html = html.replace('</head>', '<style>html[lang="ar"] body {font-family: Tahoma, Arial, sans-serif;} html[lang="ar"] .btn, html[lang="ar"] .title {letter-spacing: normal;}</style></head>');
  }
  return html;
}
