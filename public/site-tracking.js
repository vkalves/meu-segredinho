(() => {
  if (window.PrivameTracking) return;
  const script = document.currentScript;
  const uuid = () => crypto.randomUUID();
  let visitorId;
  try {
    // Preserve the existing Juju visitor identity when expanding to the site.
    const stored = JSON.parse(localStorage.getItem('privame-visitor') || localStorage.getItem('privame-juju-visitor') || 'null');
    if (stored && stored.expires > Date.now() && /^[0-9a-f-]{36}$/i.test(stored.id)) visitorId = stored.id;
    const value = visitorId ? stored : { id: uuid(), expires: Date.now() + 30 * 86400000 };
    visitorId = value.id;
    localStorage.setItem('privame-visitor', JSON.stringify(value));
  } catch { visitorId = uuid(); }
  let active;
  const send = (type) => {
    if (!active || active.sent.has(type)) return;
    active.sent.add(type);
    const params = new URLSearchParams(location.search);
    const body = JSON.stringify({ site:active.site, visitorId, eventId:uuid(), type,
      locale:document.documentElement.lang || 'pt-BR', source:params.get('utm_source'),
      medium:params.get('utm_medium'), campaign:params.get('utm_campaign'), referrer:document.referrer });
    fetch('/api/tracking/event', { method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true,credentials:'omit' }).catch(()=>{});
  };
  const trackPage = (site) => {
    if (!/^[a-z0-9][a-z0-9-]{0,29}$/.test(site || '')) return;
    if (active?.site === site && active.path === location.pathname + location.search) return;
    active = { site, path:location.pathname + location.search, sent:new Set() };
    send('view');
  };
  document.addEventListener('click', (event) => {
    const target = event.target.closest?.('a, [data-track-click]');
    if (!target || !active) return;
    let outbound=false;
    try { const url=new URL(target.href,location.href); outbound=['http:','https:'].includes(url.protocol) && url.origin !== location.origin; } catch {}
    const internalDestination = target.getAttribute('href')?.startsWith('/api/go/');
    if (outbound || internalDestination || target.hasAttribute('data-url') || target.hasAttribute('data-track-click')) send('click');
  }, true);
  window.PrivameTracking = { trackPage, stop: () => { active = null; } };
  if (script?.dataset.site) trackPage(script.dataset.site);
})();
