const app = document.getElementById('app');
const state = { user: null, pages: [], baseUrl: window.location.origin, toastTimer: null };
const DEFAULTS = {
  primaryColor: '#2AABEE', secondaryColor: '#229ED9', backgroundColor: '#eaf6fd',
  cardColor: '#ffffff', textColor: '#343434', verified: true, showOnline: true,
  onlineLabel: 'online agora', secureLabel: 'site seguro e anônimo', buttonLabel: 'MEU LINK',
};

const COUNTRY_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'.split(' ');
const COUNTRY_NAMES = typeof Intl.DisplayNames === 'function'
  ? new Intl.DisplayNames(['pt-BR'], { type: 'region' })
  : null;
const COUNTRY_OPTIONS = COUNTRY_CODES.map((code) => ({
  code,
  name: COUNTRY_NAMES?.of(code) || code,
})).sort((left, right) => left.name.localeCompare(right.name, 'pt-BR') || left.code.localeCompare(right.code));


function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function toSlug(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/g, '');
}

function initials(value) {
  return String(value || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || '?';
}

function profileImageUrl(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  if (/^data:image\//i.test(candidate)) return candidate;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (url.hostname.toLowerCase() === 'mail.google.com' && url.pathname.startsWith('/mail/')) return '';
    return candidate;
  } catch {
    return '';
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir. Tente novamente.');
  if (data.baseUrl) state.baseUrl = data.baseUrl;
  return data;
}

function go(path, replace = false) {
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  renderRoute();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showToast(message) {
  document.querySelector('.toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  document.body.append(toast);
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.remove(), 2700);
}

function showFormMessage(message, type = 'error') {
  const node = document.querySelector('.form-message');
  if (!node) return;
  node.textContent = message;
  node.className = `form-message show ${type}`;
}

function bindInternalLinks() {
  document.querySelectorAll('[data-link]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      go(link.getAttribute('href'));
    });
  });
}

function logo() {
  return `<a class="brand" href="/dashboard" data-link aria-label="Privame Links, painel"><span class="brand-mark">p</span><span class="brand-name">privame</span><span class="brand-tag">links</span></a>`;
}

function renderAuth(register = false) {
  document.body.classList.remove('legacy-profile-active');
  document.title = `${register ? 'Criar conta' : 'Entrar'} — Privame`;
  app.innerHTML = `
    <main class="auth-layout">
      <section class="auth-showcase" aria-label="Sobre o Privame">
        ${logo()}
        <div class="auth-copy">
          <span class="eyebrow">Sua presença, em um só lugar</span>
          <h1>Um link.<br>Todo o seu <em>mundo.</em></h1>
          <p>Crie uma página bonita para sua bio, reúna o que importa e compartilhe um endereço fácil de lembrar.</p>
        </div>
        <div class="auth-footnote">Seu espaço digital, com a sua identidade.</div>
      </section>
      <section class="auth-panel">
        <div class="auth-form-wrap">
          <div class="auth-mobile-brand">${logo()}</div>
          <h2>${register ? 'Crie seu espaço' : 'Que bom ter você de volta'}</h2>
          <p class="auth-lead">${register ? 'Cadastre-se para criar suas páginas de links.' : 'Entre para editar suas páginas e acompanhar os acessos.'}</p>
          <form id="authForm" novalidate>
            ${register ? `<div class="form-field"><label for="name">Como podemos chamar você?</label><input id="name" name="name" autocomplete="name" placeholder="Seu nome" maxlength="50" required></div>` : ''}
            <div class="form-field"><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="email" placeholder="voce@email.com" maxlength="254" required></div>
            <div class="form-field"><label for="password">Senha</label><div class="input-wrap"><button class="password-toggle" type="button" aria-label="Mostrar senha">Mostrar</button><input id="password" name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" placeholder="${register ? 'Pelo menos 8 caracteres' : 'Sua senha'}" minlength="8" maxlength="128" required></div></div>
            <button class="btn-primary full-width" type="submit">${register ? 'Criar minha conta' : 'Entrar na minha conta'} <span class="arrow" aria-hidden="true">→</span></button>
            <div class="form-message" role="alert"></div>
          </form>
          <p class="auth-switch">${register ? `Já tem uma conta? <a href="/login" data-link>Entrar</a>` : `Ainda não tem uma conta? <a href="/register" data-link>Criar conta</a>`}</p>
        </div>
      </section>
    </main>`;
  bindInternalLinks();
  const password = document.getElementById('password');
  document.querySelector('.password-toggle').addEventListener('click', (event) => {
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    event.currentTarget.textContent = visible ? 'Ocultar' : 'Mostrar';
    event.currentTarget.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
  });
  document.getElementById('authForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector('[type=submit]');
    button.disabled = true;
    try {
      const endpoint = register ? '/api/auth/register' : '/api/auth/login';
      const data = await api(endpoint, { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
      if (data.needsEmailConfirmation) {
        showFormMessage('Enviamos um link de confirmação para seu e-mail. Abra a mensagem para ativar sua conta e entrar.', 'success');
        button.disabled = false;
        button.innerHTML = `${register ? 'Criar minha conta' : 'Entrar na minha conta'} <span class="arrow" aria-hidden="true">→</span>`;
        return;
      }
      state.user = data.user;
      showFormMessage('Pronto! Abrindo seu espaço…', 'success');
      go('/dashboard', true);
      await loadPages();
      renderDashboard();
    } catch (error) {
      showFormMessage(error.message);
      button.disabled = false;
    }
  });
}

function userShortName() {
  return (state.user?.name || 'Olá').trim().split(/\s+/)[0];
}

function sidebar(active = 'overview') {
  const name = state.user?.name || 'Sua conta';
  return `<aside class="sidebar">
    ${logo()}
    <div class="sidebar-label">Seu espaço</div>
    <nav class="side-nav" aria-label="Navegação principal">
      <a class="side-link ${active === 'overview' ? 'active' : ''}" href="/dashboard" data-link><span class="side-icon">◫</span>Visão geral</a>
      <a class="side-link ${active === 'pages' ? 'active' : ''}" href="/dashboard#pages" data-link><span class="side-icon">↗</span>Minhas páginas</a>
    </nav>
    <div class="sidebar-bottom">
      <div class="sidebar-help"><strong>Feito para compartilhar</strong><p>Seu endereço curto fica pronto para colocar na bio das suas redes.</p></div>
      <div class="account-card"><div class="account-avatar">${escapeHtml(initials(name))}</div><div class="account-copy"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(state.user?.email || '')}</span></div><button class="account-menu" type="button" data-logout aria-label="Sair da conta" title="Sair">⋯</button></div>
    </div>
  </aside>`;
}

function shell(content, active = 'overview') {
  app.innerHTML = `<div class="dashboard">${sidebar(active)}<main class="main-area"><header class="topbar"><span class="crumb">Privame <span aria-hidden="true">/</span> ${active === 'pages' ? 'Minhas páginas' : 'Seu espaço'}</span><div class="topbar-right"><span class="topbar-note">Um lugar só seu para compartilhar</span></div></header>${content}</main></div>`;
  bindInternalLinks();
  document.querySelector('[data-logout]')?.addEventListener('click', logout);
}

function pageUrl(page) {
  return `${state.baseUrl.replace(/\/$/, '')}/${encodeURIComponent(page.slug)}`;
}

function linkRow(page) {
  const url = pageUrl(page);
  return `<article class="link-row">
    <div class="link-symbol" aria-hidden="true">↗</div>
    <div class="link-row-copy"><strong>${escapeHtml(page.profileName)} · ${escapeHtml(page.title)}</strong><a class="link-url" href="/${encodeURIComponent(page.slug)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></div>
    <div class="link-row-stats">${Number(page.clicks || 0).toLocaleString('pt-BR')} cliques</div>
    <div class="link-row-actions"><button class="icon-button" type="button" data-copy="${escapeHtml(url)}" aria-label="Copiar link" title="Copiar link">⧉</button><a class="icon-button" href="/editor/${encodeURIComponent(page.id)}" data-link aria-label="Editar página" title="Editar página">✎</a></div>
  </article>`;
}

async function loadPages() {
  const result = await api('/api/pages');
  state.pages = result.pages;
  return state.pages;
}

function dashboardContent(active = 'overview') {
  const totalClicks = state.pages.reduce((sum, page) => sum + Number(page.clicks || 0), 0);
  const pageList = state.pages.length
    ? `<div class="link-list">${state.pages.map(linkRow).join('')}</div>`
    : `<div class="empty-state"><div class="empty-art" aria-hidden="true">↗</div><h3>Seu primeiro link começa aqui</h3><p>Monte sua página, escolha seu endereço e tenha um link pronto para a bio das suas redes.</p><button class="btn-primary" type="button" data-action="create">Criar minha página <span class="arrow" aria-hidden="true">→</span></button></div>`;
  return `<div class="content">
    <section class="page-heading"><div><h1>${active === 'pages' ? 'Minhas páginas' : `Olá, ${escapeHtml(userShortName())}`}</h1><p>${active === 'pages' ? 'Edite seus endereços e compartilhe sua presença.' : 'Tudo que você compartilha, organizado em um só lugar.'}</p></div><div class="page-heading-actions"><button class="btn-primary" type="button" data-action="create">+ Nova página</button></div></section>
    <section class="stat-grid" aria-label="Resumo"><article class="stat-card"><div class="stat-label">Páginas publicadas</div><div class="stat-value">${state.pages.length}</div><div class="stat-note">${state.pages.length === 1 ? 'Seu link está pronto para compartilhar' : 'Seus espaços personalizados'}</div></article><article class="stat-card"><div class="stat-label">Cliques nos botões</div><div class="stat-value">${totalClicks.toLocaleString('pt-BR')}</div><div class="stat-note">Acessos aos destinos configurados</div></article><article class="stat-card"><div class="stat-label">Endereço principal</div><div class="stat-value" style="font-size:19px;letter-spacing:-.5px">${escapeHtml(new URL(state.baseUrl).hostname)}</div><div class="stat-note">Sua marca em cada link</div></article></section>
    <section aria-labelledby="pagesHeading"><div class="section-head"><h2 id="pagesHeading">${active === 'pages' ? 'Todas as páginas' : 'Suas páginas'}</h2><span>${state.pages.length} ${state.pages.length === 1 ? 'página' : 'páginas'}</span></div>${pageList}</section>
    <div class="notice-bar"><span class="notice-icon" aria-hidden="true">✳</span><div><strong>Seu endereço já pode ir para a bio.</strong>Personalize nome, texto, imagem, cores e botão. Você pode criar mais de uma página para usar em contextos diferentes.</div></div>
  </div>`;
}

function renderDashboard(active = 'overview') {
  document.body.classList.remove('legacy-profile-active');
  document.title = 'Seu espaço — Privame';
  shell(dashboardContent(active), active);
  document.querySelectorAll('[data-action="create"]').forEach((button) => button.addEventListener('click', () => go('/create')));
  document.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', () => copyLink(button.dataset.copy)));
}

async function copyLink(value) {
  try {
    await navigator.clipboard.writeText(value);
    showToast('Link copiado para a área de transferência.');
  } catch {
    const temporary = document.createElement('textarea');
    temporary.value = value;
    temporary.style.position = 'fixed';
    temporary.style.opacity = '0';
    document.body.append(temporary);
    temporary.select();
    const copied = document.execCommand('copy');
    temporary.remove();
    showToast(copied ? 'Link copiado para a área de transferência.' : value);
  }
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch {}
  state.user = null;
  state.pages = [];
  go('/login', true);
}

function defaultPage() {
  const requested = toSlug(state.user?.name) || 'meu-link';
  let base = requested;
  let suffix = 2;
  while (state.pages.some((page) => page.slug === base)) {
    base = `${requested.slice(0, 27)}-${suffix}`;
    suffix += 1;
  }
  return {
    ...DEFAULTS,
    slug: base,
    profileName: state.user?.name || '',
    title: 'Ficou Curioso?',
    subtitle: 'sim, eu tenho... vem ver meus conteúd0s que nao posto em nenhum outro lugar',
    buttonLabel: 'MEU TLEGRAM',
    destinationUrl: '', avatarUrl: '', clicks: 0,
  };
}

function cleanColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
}

function styleVars(page) {
  return `--public-primary:${cleanColor(page.primaryColor, DEFAULTS.primaryColor)};--public-secondary:${cleanColor(page.secondaryColor, DEFAULTS.secondaryColor)};--public-bg:${cleanColor(page.backgroundColor, DEFAULTS.backgroundColor)};--public-card:${cleanColor(page.cardColor, DEFAULTS.cardColor)};--public-text:${cleanColor(page.textColor, DEFAULTS.textColor)}`;
}

function publicMark() {
  return `<svg class="verified-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8 14.5 3.2l2.8-.1 1.1 2.5 2.5 1.1-.1 2.8 1.4 2.5-1.4 2.5.1 2.8-2.5 1.1-1.1 2.5-2.8-.1L12 22.2l-2.5-1.4-2.8.1-1.1-2.5-2.5-1.1.1-2.8L1.8 12l1.4-2.5-.1-2.8 2.5-1.1 1.1-2.5 2.8.1L12 1.8Z" fill="#3897F0"/><path d="m8.1 12.1 2.4 2.3 5.4-5.3" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>`;
}

function moonIcon() {
  return `<svg class="moon-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.1A8.7 8.7 0 0 1 8.9 3.5 9.2 9.2 0 1 0 20.5 15.1Z" fill="currentColor"/></svg><svg class="sun-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.7"/></svg>`;
}

function profileMarkup(page, { preview = false, theme = 'light' } = {}) {
  const name = page.profileName || 'Seu nome';
  const imageUrl = profileImageUrl(page.avatarUrl);
  const darkClass = theme === 'dark' ? ' dark-mode' : '';
  const previewClass = preview ? ' preview-mode' : '';
  const colorStyle = theme === 'dark' ? '' : ' style="--privacy-grad-start:' + cleanColor(page.primaryColor, DEFAULTS.primaryColor)
    + ';--privacy-grad-end:' + cleanColor(page.secondaryColor, DEFAULTS.secondaryColor)
    + ';--bg-grad-start:' + cleanColor(page.backgroundColor, DEFAULTS.backgroundColor)
    + ';--card-bg:' + cleanColor(page.cardColor, DEFAULTS.cardColor)
    + ';--privacy-text:' + cleanColor(page.textColor, DEFAULTS.textColor) + '"';
  const avatar = imageUrl
    ? '<img src="' + escapeHtml(imageUrl) + '" class="avatar" id="avatarImg" alt="Foto de ' + escapeHtml(name) + '" width="126" height="126" loading="eager" fetchpriority="high" decoding="async" draggable="false">'
    : '<div class="avatar avatar-fallback" id="avatarImg" role="img" aria-label="Foto de ' + escapeHtml(name) + '">' + escapeHtml(initials(name)) + '</div>';
  const telegramIcon = '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.665 3.717l-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l-.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.434z"/></svg>';
  const buttonLabel = escapeHtml(page.buttonLabel || 'MEU LINK');
  const button = preview
    ? '<button class="btn btn-telegram" id="telegramBtn" type="button" tabindex="-1">' + telegramIcon + buttonLabel + '</button>'
    : '<a href="/api/go/' + encodeURIComponent(page.slug || '') + '" class="btn btn-telegram" id="telegramBtn" rel="noopener noreferrer">' + telegramIcon + buttonLabel + '</a>';
  const themeControl = preview ? '' : '<div class="theme-toggle-wrap"><button class="theme-toggle" id="themeToggle" data-theme type="button" aria-label="Ativar modo escuro"><svg class="icon-moon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="#4a4a4a"/></svg><svg class="icon-sun" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="#f2c94c"/><g stroke="#f2c94c" stroke-width="1.8" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22"/><line x1="2" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="6.6" y2="6.6"/><line x1="17.4" y1="17.4" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="6.6" y2="17.4"/><line x1="17.4" y1="6.6" x2="19.1" y2="4.9"/></g></svg></button></div>';
  const verified = page.verified
    ? '<span class="verified-icon" id="verifiedIcon" aria-label="Conta verificada">' + publicMark() + '</span>'
    : '';
  const online = page.showOnline
    ? '<div class="online-status"><span class="dot"></span>' + escapeHtml(page.onlineLabel || 'online agora') + '</div>'
    : '';
  const secure = page.secureLabel
    ? '<div class="secure-badge"><svg class="lock-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' + escapeHtml(page.secureLabel) + '</div>'
    : '';
  const lightbox = imageUrl
    ? '<div class="avatar-lightbox" id="avatarLightbox" role="dialog" aria-label="Foto de perfil ampliada"><div class="lightbox-inner"><div class="lightbox-shimmer"></div><div class="lightbox-ring"></div><img src="' + escapeHtml(imageUrl) + '" class="avatar-lightbox-img" id="lightboxImg" alt="Foto de ' + escapeHtml(name) + '" width="330" height="330" decoding="async" draggable="false"></div></div>'
    : '';
  return '<div class="legacy-profile-page' + darkClass + previewClass + '"' + colorStyle + '>'
    + '<main class="card">' + themeControl
    + '<button class="avatar-ring" id="avatarRing" type="button" aria-label="Ampliar foto de ' + escapeHtml(name) + '">' + avatar
    + '<svg class="story-ring-svg" viewBox="0 0 136 136" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><mask id="storyRingReveal" maskUnits="userSpaceOnUse" x="0" y="0" width="136" height="136"><rect x="0" y="0" width="136" height="136" fill="black"/><circle class="story-ring-reveal" id="ringReveal" cx="68" cy="68" r="64"/></mask></defs><circle class="story-ring-track" cx="68" cy="68" r="64"/><circle class="story-ring-arc" id="ringArc" cx="68" cy="68" r="64" mask="url(#storyRingReveal)"/><circle class="story-ring-solid" id="ringSolid" cx="68" cy="68" r="64"/></svg></button>'
    + '<div class="badge"><span class="badge-name"><span id="profile-name">' + escapeHtml(name) + '</span>' + verified + '</span></div>'
    + '<div class="title">' + escapeHtml(page.title || 'Seu título') + '</div>'
    + (page.subtitle ? '<div class="subtitle">' + escapeHtml(page.subtitle) + '</div>' : '')
    + online + button + secure + '</main>' + lightbox
    + '<div class="redirect-screen" id="redirectScreen" aria-live="polite"><div class="redirect-text">abrindo seu link...</div><div class="redirect-progress-track"><div class="redirect-progress-fill" id="redirectProgressFill"></div></div></div>'
    + '</div>';
}

function bindPreviewLightbox(container, page) {
  const avatar = container.querySelector('#avatarImg');
  if (avatar?.tagName === 'IMG') {
    const showFallback = () => {
      if (!avatar.isConnected) return;
      const fallback = document.createElement('div');
      fallback.className = 'avatar avatar-fallback';
      fallback.id = 'avatarImg';
      fallback.setAttribute('role', 'img');
      fallback.setAttribute('aria-label', 'Foto indisponível para ' + (page.profileName || 'este perfil'));
      fallback.textContent = initials(page.profileName);
      avatar.replaceWith(fallback);
      container.querySelector('#avatarLightbox')?.remove();
      container.querySelector('#avatarRing')?.setAttribute('aria-label', 'Foto de perfil indisponível');
    };
    avatar.addEventListener('error', showFallback, { once: true });
    if (avatar.complete && avatar.naturalWidth === 0) showFallback();
  }
  const ring = container.querySelector('#avatarRing');
  const lightbox = container.querySelector('#avatarLightbox');
  if (!ring || !lightbox || !page.avatarUrl) return;
  let autoClose;
  let holdTimer;
  const closeLightbox = () => {
    lightbox.classList.remove('open');
    clearTimeout(autoClose);
  };
  const openLightbox = () => {
    lightbox.classList.add('open');
    clearTimeout(autoClose);
    autoClose = setTimeout(closeLightbox, 2000);
  };
  ring.addEventListener('click', openLightbox);
  ring.addEventListener('contextmenu', (event) => event.preventDefault());
  ring.addEventListener('touchstart', () => {
    clearTimeout(holdTimer);
    holdTimer = setTimeout(openLightbox, 280);
  }, { passive: true });
  ring.addEventListener('touchend', () => clearTimeout(holdTimer));
  ring.addEventListener('touchcancel', () => clearTimeout(holdTimer));
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) closeLightbox();
  });
}
function editorField(label, name, value, { type = 'text', placeholder = '', hint = '', max = '', required = false } = {}) {
  const id = `field-${name}`;
  const maxLength = max ? `maxlength="${max}"` : '';
  const req = required ? 'required' : '';
  const hintHtml = hint ? `<span class="field-hint">${hint}</span>` : '';
  const control = type === 'textarea'
    ? `<textarea id="${id}" name="${name}" placeholder="${escapeHtml(placeholder)}" ${maxLength} ${req}>${escapeHtml(value)}</textarea>`
    : `<input id="${id}" name="${name}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${maxLength} ${req}>`;
  return `<div class="form-field"><label for="${id}">${label}</label>${control}${hintHtml}</div>`;
}

function colorInput(name, label, value) {
  return `<label class="color-field"><span>${label}</span><input type="color" name="${name}" value="${cleanColor(value, DEFAULTS[name])}" aria-label="${label}"></label>`;
}

function countryDestinationRowMarkup(countryCode = '', destinationUrl = '') {
  const options = COUNTRY_OPTIONS.map(({ code, name }) =>
    `<option value="${code}" ${code === countryCode ? 'selected' : ''}>${escapeHtml(name)}</option>`
  ).join('');
  return `<div class="country-destination-row">
    <select class="country-destination-country" aria-label="País do destino">
      <option value="" ${countryCode ? '' : 'selected'}>Selecione um país</option>${options}
    </select>
    <input class="country-destination-url" type="url" maxlength="2048" value="${escapeHtml(destinationUrl)}" placeholder="https://destino-do-pais.com" aria-label="Endereço para o país selecionado">
    <button class="country-destination-remove" type="button" aria-label="Remover destino do país" title="Remover país">×</button>
  </div>`;
}

function countryDestinationsMarkup(page) {
  const destinations = page.countryDestinations && typeof page.countryDestinations === 'object'
    ? page.countryDestinations
    : {};
  const rows = Object.entries(destinations)
    .filter(([code, url]) => /^[A-Z]{2}$/.test(code) && typeof url === 'string')
    .map(([code, url]) => countryDestinationRowMarkup(code, url))
    .join('');
  return `<div class="country-destinations">
    <div class="country-destinations-heading"><strong>Personalizar por país</strong><span>O país é identificado pelo IP. Quem não tiver uma regra usa o endereço padrão.</span></div>
    <div class="country-destinations-list" id="countryDestinationsList">${rows}</div>
    <button class="btn-secondary country-destination-add" id="addCountryDestination" type="button">+ Adicionar país</button>
  </div>`;
}

function editorFormMarkup(page, isNew) {
  const profileName = page.profileName || state.user.name;
  const initialsLabel = page.avatarUrl ? '' : escapeHtml(initials(profileName));
  const imagePreview = page.avatarUrl ? `<img src="${escapeHtml(page.avatarUrl)}" alt="">` : initialsLabel;
  return `<div class="content editor-content">
    <div class="editor-heading"><a class="back-link" href="/dashboard" data-link><span aria-hidden="true">←</span> Voltar para minhas páginas</a><section class="page-heading"><div><h1>${isNew ? 'Crie sua página' : 'Personalize sua página'}</h1><p>Monte a experiência que as pessoas vão encontrar no seu link.</p></div></section></div>
    <div class="editor-layout">
      <form class="editor-form" id="editorForm" novalidate>
        <section class="editor-card"><div class="editor-card-head"><span class="step-number">01</span><div><h2>Seu endereço e perfil</h2><p>Escolha um endereço simples para colocar na bio.</p></div></div>
          <div class="form-field"><label for="field-slug">Endereço da sua página</label><div class="slug-input-wrap"><span class="slug-prefix">${escapeHtml(state.baseUrl.replace(/\/$/, ''))}/</span><input id="field-slug" name="slug" value="${escapeHtml(page.slug)}" maxlength="30" minlength="3" pattern="[a-zA-Z0-9-]+" autocomplete="off" required aria-describedby="slugHint"></div><span class="field-hint" id="slugHint">Use de 3 a 30 letras, números ou hífens. ${isNew ? 'Você pode trocar depois.' : 'Trocar o endereço antigo pode quebrar links já compartilhados.'}</span></div>
          <div class="avatar-upload"><div class="avatar-upload-preview" id="avatarPreview">${imagePreview}</div><div class="avatar-upload-text"><strong>Foto de perfil</strong><p>PNG, JPG ou WebP. Até 2 MB.</p><label class="btn-secondary" for="avatarFile" style="min-height:32px;padding:0 11px;font-size:10px;cursor:pointer">Escolher imagem</label><input class="file-picker" id="avatarFile" name="avatarFile" type="file" accept="image/png,image/jpeg,image/webp"></div></div>
          ${editorField('Ou cole o endereço da imagem', 'avatarUrl', page.avatarUrl || '', { type: 'url', placeholder: 'https://...', hint: 'Use um link direto para o arquivo da imagem. Links de Gmail ou de páginas não exibem a foto.' })}
          ${editorField('Nome no perfil', 'profileName', profileName, { max: 50, required: true })}
        </section>
        <section class="editor-card"><div class="editor-card-head"><span class="step-number">02</span><div><h2>O que as pessoas vão ver</h2><p>Conteúdo principal e destino do seu botão.</p></div></div>
          ${editorField('Título', 'title', page.title, { max: 70, required: true, placeholder: 'Ex.: Ficou curioso?' })}
          ${editorField('Subtítulo', 'subtitle', page.subtitle, { type: 'textarea', max: 180, placeholder: 'Uma frase curta para apresentar seu conteúdo.' })}
          ${editorField('Endereço padrão do botão', 'destinationUrl', page.destinationUrl || '', { type: 'url', required: true, placeholder: 'https://seusite.com' , hint: 'Destino usado quando o país não tem uma regra personalizada. Cole um endereço completo, começando com https://.' })}
          ${countryDestinationsMarkup(page)}
          ${editorField('Texto do botão', 'buttonLabel', page.buttonLabel, { max: 36, required: true, placeholder: 'ACESSAR MEU LINK' })}
          <div class="switch-row"><div class="switch-copy"><strong>Mostrar selo verificado</strong><span>Exibe o selo azul ao lado do nome.</span></div><label class="switch"><input type="checkbox" name="verified" ${page.verified ? 'checked' : ''}><span class="switch-track"></span></label></div>
          <div class="switch-row"><div class="switch-copy"><strong>Mostrar status online</strong><span>Exibe um pequeno status acima do botão.</span></div><label class="switch"><input type="checkbox" name="showOnline" ${page.showOnline ? 'checked' : ''}><span class="switch-track"></span></label></div>
          ${editorField('Texto do status', 'onlineLabel', page.onlineLabel || 'online agora', { max: 32 })}
          ${editorField('Texto de segurança no rodapé', 'secureLabel', page.secureLabel || '', { max: 48 })}
        </section>
        <section class="editor-card"><div class="editor-card-head"><span class="step-number">03</span><div><h2>Cores da página</h2><p>Escolha uma combinação que tenha a sua cara.</p></div></div><div class="color-grid">
          ${colorInput('primaryColor', 'Cor principal', page.primaryColor)}
          ${colorInput('secondaryColor', 'Cor do gradiente', page.secondaryColor)}
          ${colorInput('backgroundColor', 'Fundo da página', page.backgroundColor)}
          ${colorInput('cardColor', 'Fundo do cartão', page.cardColor)}
          ${colorInput('textColor', 'Texto do título', page.textColor)}
        </div></section>
        <div class="editor-actions"><div class="editor-feedback" id="editorFeedback" aria-live="polite"></div><div class="editor-actions-right">${!isNew ? '<button class="btn-danger" type="button" data-delete>Excluir</button>' : ''}<button class="btn-primary" type="submit" id="savePage">${isNew ? 'Criar minha página' : 'Salvar alterações'} <span class="arrow" aria-hidden="true">→</span></button></div></div>
        <div class="form-message" role="alert"></div>
      </form>
      <aside class="preview-panel" aria-label="Prévia da página"><div class="preview-head"><strong>Prévia ao vivo</strong><span>Como vai aparecer no celular</span></div><div class="preview-stage"><div class="preview-device" id="previewDevice"></div></div></aside>
    </div>
  </div>`;
}

function refreshCountryDestinationOptions(form) {
  const selects = Array.from(form.querySelectorAll('.country-destination-country'));
  for (const select of selects) {
    const selectedElsewhere = new Set(selects.filter((other) => other !== select).map((other) => other.value).filter(Boolean));
    for (const option of select.options) {
      option.disabled = Boolean(option.value && selectedElsewhere.has(option.value));
    }
  }
}

function collectPage(form, previous) {
  const data = Object.fromEntries(new FormData(form).entries());
  return {
    ...previous,
    slug: data.slug.trim(), profileName: data.profileName.trim(), title: data.title.trim(),
    subtitle: data.subtitle.trim(), destinationUrl: data.destinationUrl.trim(),
    buttonLabel: data.buttonLabel.trim(), avatarUrl: data.avatarUrl.trim(),
    countryDestinations: Array.from(form.querySelectorAll('.country-destination-row')).reduce((destinations, row) => {
      const countryCode = row.querySelector('.country-destination-country').value.trim().toUpperCase();
      const destinationUrl = row.querySelector('.country-destination-url').value.trim();
      if (countryCode && destinationUrl) destinations[countryCode] = destinationUrl;
      return destinations;
    }, {}),
    onlineLabel: data.onlineLabel.trim(), secureLabel: data.secureLabel.trim(),
    verified: form.elements.verified.checked, showOnline: form.elements.showOnline.checked,
    primaryColor: data.primaryColor, secondaryColor: data.secondaryColor,
    backgroundColor: data.backgroundColor, cardColor: data.cardColor, textColor: data.textColor,
  };
}

function bindEditor(page, isNew) {
  const form = document.getElementById('editorForm');
  const preview = document.getElementById('previewDevice');
  let draft = { ...page };
  const refreshPreview = () => {
    draft = collectPage(form, draft);
    preview.innerHTML = profileMarkup(draft, { preview: true });
    bindPreviewLightbox(preview, draft);
  };
  form.addEventListener('input', (event) => {
    if (event.target.name === 'avatarFile') return;
    refreshPreview();
  });
  form.addEventListener('change', (event) => {
    if (event.target.matches('.country-destination-country')) refreshCountryDestinationOptions(form);
    refreshPreview();
  });
  const countryDestinationList = form.querySelector('#countryDestinationsList');
  form.querySelector('#addCountryDestination').addEventListener('click', () => {
    const selected = new Set(Array.from(form.querySelectorAll('.country-destination-country'))
      .map((select) => select.value).filter(Boolean));
    const countryCode = !selected.has('BR') ? 'BR' : COUNTRY_CODES.find((code) => !selected.has(code));
    if (!countryCode) return showToast('Todos os países já têm um destino configurado.');
    countryDestinationList.insertAdjacentHTML('beforeend', countryDestinationRowMarkup(countryCode));
    refreshCountryDestinationOptions(form);
    refreshPreview();
    countryDestinationList.lastElementChild?.querySelector('.country-destination-url')?.focus();
  });
  countryDestinationList.addEventListener('click', (event) => {
    const removeButton = event.target.closest('.country-destination-remove');
    if (!removeButton) return;
    removeButton.closest('.country-destination-row').remove();
    refreshCountryDestinationOptions(form);
    refreshPreview();
  });
  refreshCountryDestinationOptions(form);
  form.elements.slug.addEventListener('blur', () => {
    form.elements.slug.value = toSlug(form.elements.slug.value);
    refreshPreview();
  });
  form.elements.avatarUrl.addEventListener('input', () => {
    document.getElementById('avatarPreview').innerHTML = draft.avatarUrl
      ? `<img src="${escapeHtml(draft.avatarUrl)}" alt="">`
      : escapeHtml(initials(form.elements.profileName.value));
  });
  form.elements.profileName.addEventListener('input', () => {
    if (!draft.avatarUrl) document.getElementById('avatarPreview').textContent = initials(form.elements.profileName.value);
  });
  document.getElementById('avatarFile').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return showToast('Escolha uma imagem PNG, JPG ou WebP.');
    if (file.size > 2 * 1024 * 1024) return showToast('A imagem precisa ter até 2 MB.');
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = async () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', .86);
      try {
        showToast('Enviando sua foto…');
        const uploaded = await api('/api/uploads', { method: 'POST', body: JSON.stringify({ dataUrl }) });
        form.elements.avatarUrl.value = uploaded.avatarUrl;
        document.getElementById('avatarPreview').innerHTML = `<img src="${escapeHtml(uploaded.avatarUrl)}" alt="">`;
        refreshPreview();
        showToast('Foto adicionada.');
      } catch (error) {
        showToast(error.message);
      }
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); showToast('Não foi possível abrir essa imagem.'); };
    image.src = objectUrl;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const current = collectPage(form, draft);
    current.slug = toSlug(current.slug);
    form.elements.slug.value = current.slug;
    draft = current;
    if (current.slug.length < 3) return showFormMessage('O endereço precisa ter pelo menos 3 caracteres.');
    if (!current.profileName || !current.title || !current.destinationUrl || !current.buttonLabel) return showFormMessage('Preencha nome, título, texto do botão e o endereço padrão que ele vai abrir.');
    const destinationRows = Array.from(form.querySelectorAll('.country-destination-row'));
    const incompleteDestination = destinationRows.some((row) => {
      const countryCode = row.querySelector('.country-destination-country').value;
      const destinationUrl = row.querySelector('.country-destination-url').value.trim();
      return Boolean(countryCode) !== Boolean(destinationUrl);
    });
    if (incompleteDestination) return showFormMessage('Cada destino personalizado precisa ter um país e um endereço.');
    const countryCodes = destinationRows.map((row) => row.querySelector('.country-destination-country').value).filter(Boolean);
    if (new Set(countryCodes).size !== countryCodes.length) return showFormMessage('Escolha um país diferente em cada regra.');
    for (const destinationUrl of Object.values(current.countryDestinations)) {
      try {
        const destination = new URL(destinationUrl);
        if (!['http:', 'https:'].includes(destination.protocol)) throw new Error();
      } catch { return showFormMessage('Informe um endereço válido para cada país, começando com https://.'); }
    }
    if (current.avatarUrl && !/^https:\/\//i.test(current.avatarUrl) && !/^data:image\/(jpeg|png|webp);base64,/i.test(current.avatarUrl)) return showFormMessage('Use uma imagem HTTPS ou escolha um arquivo do seu dispositivo.');
    try {
      const destination = new URL(current.destinationUrl);
      if (!['http:', 'https:'].includes(destination.protocol)) throw new Error();
    } catch { return showFormMessage('Cole um endereço válido começando com https://.'); }
    const submit = document.getElementById('savePage');
    submit.disabled = true;
    submit.innerHTML = 'Salvando…';
    try {
      const result = await api(isNew ? '/api/pages' : `/api/pages/${encodeURIComponent(page.id)}`, {
        method: isNew ? 'POST' : 'PUT', body: JSON.stringify(current),
      });
      const saved = result.page;
      state.pages = isNew ? [saved, ...state.pages] : state.pages.map((item) => item.id === saved.id ? saved : item);
      showToast(isNew ? 'Sua página está pronta para compartilhar.' : 'Alterações salvas com sucesso.');
      if (isNew) go(`/editor/${encodeURIComponent(saved.id)}`, true);
      else {
        draft = { ...saved };
        form.elements.slug.value = saved.slug;
        refreshPreview();
      }
    } catch (error) {
      showFormMessage(error.message);
    } finally {
      if (document.getElementById('savePage')) {
        const button = document.getElementById('savePage');
        button.disabled = false;
        button.innerHTML = `${isNew ? 'Criar minha página' : 'Salvar alterações'} <span class="arrow" aria-hidden="true">→</span>`;
      }
    }
  });
  document.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!window.confirm('Excluir esta página? O endereço deixará de abrir.')) return;
    try {
      await api(`/api/pages/${encodeURIComponent(page.id)}`, { method: 'DELETE', body: '{}' });
      state.pages = state.pages.filter((item) => item.id !== page.id);
      showToast('Página excluída.');
      go('/dashboard');
    } catch (error) { showFormMessage(error.message); }
  });
  refreshPreview();
}

function renderEditor(page, isNew) {
  document.body.classList.add('legacy-profile-active');
  document.title = `${isNew ? 'Nova página' : 'Editar página'} — Privame`;
  shell(editorFormMarkup(page, isNew), 'pages');
  bindEditor(page, isNew);
}

function renderPublicPage(page, theme = 'light') {
  document.body.classList.add('legacy-profile-active');
  document.title = (page.profileName || 'Perfil') + ' | ' + (page.title || 'Privame');
  app.innerHTML = profileMarkup(page, { theme });
  const root = app.querySelector('.legacy-profile-page');
  const card = app.querySelector('.card');
  const themeButton = app.querySelector('#themeToggle');
  const verified = app.querySelector('#verifiedIcon');
  const arc = app.querySelector('#ringArc');
  const solid = app.querySelector('#ringSolid');
  const reveal = app.querySelector('#ringReveal');

  bindPreviewLightbox(app, page);

  if (themeButton) {
    const syncThemeLabel = () => themeButton.setAttribute('aria-label', root.classList.contains('dark-mode') ? 'Ativar modo claro' : 'Ativar modo escuro');
    syncThemeLabel();
    themeButton.addEventListener('click', () => {
      const nextTheme = root.classList.contains('dark-mode') ? 'light' : 'dark';
      try { localStorage.setItem('privame-theme-' + page.slug, nextTheme); } catch {}
      renderPublicPage(page, nextTheme);
    });
  }

  if (verified) {
    setTimeout(() => {
      verified.classList.add('pulse');
      verified.addEventListener('animationend', function removePulse() {
        verified.classList.remove('pulse');
        verified.removeEventListener('animationend', removePulse);
      }, { once: true });
    }, 3000);
  }

  if (arc && solid && reveal) {
    const circumference = 402.1;
    let stopped = false;
    const setReveal = (value) => { reveal.style.strokeDashoffset = value; };
    const setOpacity = (element, value) => { element.style.opacity = value; };
    const easeInOut = (value) => value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
    const easeOutQuart = (value) => 1 - Math.pow(1 - value, 4);
    const startCycle = () => {
      setOpacity(arc, 1);
      setOpacity(solid, 0);
      setReveal(circumference);
      arc.style.strokeDasharray = '6 5';
      let start = null;
      const draw = (time) => {
        if (stopped) return;
        if (start === null) start = time;
        const progress = Math.min((time - start) / 430, 1);
        setReveal(circumference * (1 - easeInOut(progress)));
        if (progress < 1) {
          requestAnimationFrame(draw);
          return;
        }
        setReveal(0);
        let closeStart = null;
        const closeRing = (now) => {
          if (stopped) return;
          if (closeStart === null) closeStart = now;
          const progressClose = Math.min((now - closeStart) / 340, 1);
          const eased = easeOutQuart(progressClose);
          setOpacity(arc, 1 - eased);
          setOpacity(solid, eased);
          arc.style.strokeDasharray = '6 ' + (5 * (1 - eased)).toFixed(2);
          if (progressClose < 1) {
            requestAnimationFrame(closeRing);
            return;
          }
          setOpacity(arc, 0);
          setOpacity(solid, 1);
          stopped = true;
          solid.classList.add('ring-blink');
          solid.addEventListener('animationend', () => solid.classList.remove('ring-blink'), { once: true });
        };
        requestAnimationFrame(closeRing);
      };
      requestAnimationFrame(draw);
    };
    setReveal(circumference);
    setOpacity(arc, 1);
    setOpacity(solid, 0);
    setTimeout(startCycle, 300);
    window.addEventListener('pageshow', (event) => {
      if (event.persisted && !stopped) {
        stopped = true;
        setReveal(0);
        setOpacity(arc, 0);
        setOpacity(solid, 1);
      }
    });
  }

  const button = app.querySelector('#telegramBtn');
  const screen = app.querySelector('#redirectScreen');
  const fill = app.querySelector('#redirectProgressFill');
  if (button && button.tagName === 'A' && screen && fill && card) {
    let redirecting = false;
    const resetRedirectUI = () => {
      redirecting = false;
      fill.style.width = '0%';
      screen.classList.remove('open');
      card.classList.remove('card-hidden');
    };
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (redirecting) return;
      redirecting = true;
      const destination = button.getAttribute('href');
      card.classList.add('card-hidden');
      screen.classList.add('open');
      fill.style.width = '0%';
      let start = null;
      const progress = (time) => {
        if (start === null) start = time;
        const percent = Math.min((time - start) / 1000, 1);
        fill.style.width = (percent * 100) + '%';
        if (percent < 1) requestAnimationFrame(progress);
        else window.location.href = destination;
      };
      requestAnimationFrame(progress);
    });
    window.addEventListener('pageshow', resetRedirectUI);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resetRedirectUI();
    });
  }
}
function notFound() {
  document.body.classList.remove('legacy-profile-active');
  document.title = 'Página não encontrada — Privame';
  app.innerHTML = `<main class="not-found"><div class="not-found-card"><div class="empty-art" style="margin:0 auto 18px">↗</div><h1>Esse link ainda não existe</h1><p>Confira se o endereço está certo ou volte ao início.</p><a class="btn-primary" href="/dashboard" data-link>Ir para o Privame</a></div></main>`;
  bindInternalLinks();
}

async function finishAuthCallback() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const authError = params.get('error_description') || params.get('error');
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (authError || !accessToken || !refreshToken) {
    history.replaceState({}, '', '/login');
    renderAuth(false);
    showFormMessage(authError ? authError : 'O link está incompleto ou expirou. Peça um novo e-mail de confirmação.');
    return;
  }
  try {
    const data = await api('/api/auth/callback', {
      method: 'POST',
      body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
    });
    history.replaceState({}, '', '/dashboard');
    state.user = data.user;
    await loadPages();
    renderDashboard();
    showToast('E-mail confirmado. Sua conta está pronta.');
  } catch (error) {
    history.replaceState({}, '', '/login');
    renderAuth(false);
    showFormMessage(error.message);
  }
}

async function renderPublicSlug(slug) {
  try {
    const result = await api(`/api/public/${encodeURIComponent(slug)}`);
    let theme = 'light';
    try { theme = localStorage.getItem(`privame-theme-${slug}`) === 'dark' ? 'dark' : 'light'; } catch {}
    renderPublicPage(result.page, theme);
  } catch { notFound(); }
}

async function renderRoute() {
  document.body.classList.remove('legacy-profile-active');
  const pathname = decodeURIComponent(window.location.pathname.replace(/\/$/, '') || '/');
  const route = pathname === '/' ? '/' : pathname;
  if (route === '/auth/callback') return finishAuthCallback();
  if (/^\/api(?:\/|$)/.test(route) || /^\/go(?:\/|$)/.test(route)) return;
  if (/^\/[a-z0-9-]{1,30}$/i.test(route) && !['/login', '/register', '/dashboard', '/create'].includes(route.toLowerCase())) {
    return renderPublicSlug(route.slice(1).toLowerCase());
  }
  try {
    const session = await api('/api/session');
    state.user = session.user;
    if (session.baseUrl) state.baseUrl = session.baseUrl;
  } catch { state.user = null; }


  if (route === '/login' || route === '/register' || route === '/') {
    if (state.user) {
      go('/dashboard', true);
      return;
    }
    renderAuth(route === '/register');
    return;
  }
  if (route === '/dashboard') {
    if (!state.user) return go('/login', true);
    try {
      await loadPages();
      renderDashboard(window.location.hash === '#pages' ? 'pages' : 'overview');
    } catch (error) { showToast(error.message); renderDashboard(); }
    return;
  }
  if (route === '/create') {
    if (!state.user) return go('/login', true);
    if (!state.pages.length) {
      try { await loadPages(); } catch {}
    }
    renderEditor(defaultPage(), true);
    return;
  }
  const editorMatch = route.match(/^\/editor\/([0-9a-f-]{36})$/i);
  if (editorMatch) {
    if (!state.user) return go('/login', true);
    try {
      await loadPages();
      const page = state.pages.find((item) => item.id === editorMatch[1]);
      if (!page) return notFound();
      renderEditor(page, false);
    } catch (error) { showToast(error.message); go('/dashboard', true); }
    return;
  }

  notFound();
}

window.addEventListener('popstate', renderRoute);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') document.querySelectorAll('.avatar-lightbox.open').forEach((lightbox) => lightbox.classList.remove('open'));
});
renderRoute();
