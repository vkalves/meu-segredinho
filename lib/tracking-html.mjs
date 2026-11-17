export function withTracking(html, site) {
  if (!/^[a-z0-9][a-z0-9-]{0,29}$/.test(site)) throw new Error('Invalid tracking site');
  const clean = html.replace(/<script\b[^>]*src=["']\/(?:juju|site)-tracking\.js["'][^>]*>\s*<\/script>(?:\r?\n)?/gi, '');
  const script = `<script defer src="/site-tracking.js" data-site="${site}"></script>`;
  return /<\/body>/i.test(clean) ? clean.replace(/<\/body>/i,script+'\n</body>') : clean+script;
}
