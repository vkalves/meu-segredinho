// Build both languages from the same layout so future design changes stay in sync.
export function internationalJujuHtml(original) {
  const translations = [
    ['lang="pt-BR"', 'lang="en"'],
    ['juju abacate | Exclusivo', 'juju abacate | Exclusive'],
    ['Ficou Curioso?', 'Feeling curious?'],
    ['sim, eu tenho... vem ver meus conteúd0s que nao posto em nenhum outro lugar', "Yes, I do... come see the content I don't post anywhere else"],
    ['online agora', 'online now'],
    ['MEU TELEGRAM', 'MY TELEGRAM'],
    ['site seguro e anônimo', 'safe and anonymous site'],
    ['abrindo t3legram...', 'opening Telegram...'],
    ['Conta verificada', 'Verified account'],
    ['Alternar modo escuro', 'Toggle dark mode'],
    ['Ativar modo claro', 'Enable light mode'],
    ['Ativar modo escuro', 'Enable dark mode'],
    ['https://abrir.link/rauEa', 'https://t.me/jujugringbot'],
    // Absolute assets work at /juju as well as /juju/ and /juju/index.html.
    ['"jujup.jpg"', '"/juju/jujup.jpg"'],
  ];
  return translations.reduce((html, [from, to]) => {
    if (!html.includes(from)) throw new Error(`Juju translation source missing: ${from}`);
    return html.replaceAll(from, to);
  }, original);
}
