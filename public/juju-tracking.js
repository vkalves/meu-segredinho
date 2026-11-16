(() => {
  const uuid = () => crypto.randomUUID();
  let visitorId;
  try {
    const stored = JSON.parse(localStorage.getItem('privame-juju-visitor') || 'null');
    if (stored && stored.expires > Date.now() && /^[0-9a-f-]{36}$/i.test(stored.id)) visitorId = stored.id;
    if (!visitorId) {
      visitorId = uuid();
      localStorage.setItem('privame-juju-visitor', JSON.stringify({ id: visitorId, expires: Date.now() + 30 * 86400000 }));
    }
  } catch { visitorId = uuid(); }
  const params = new URLSearchParams(location.search);
  const metadata = { site: 'juju', visitorId, source: params.get('utm_source'), medium: params.get('utm_medium'), campaign: params.get('utm_campaign'), referrer: document.referrer };
  const ids = { view: uuid(), click: uuid() };
  let clicked = false;
  const send = (type) => {
    const body = JSON.stringify({ ...metadata, eventId: ids[type], type });
    // Analytics never delays opening the destination; no secret or IP is sent by the browser.
    fetch('/api/tracking/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'omit' }).catch(() => {});
  };
  send('view');
  document.getElementById('telegramBtn')?.addEventListener('click', () => {
    if (!clicked) { clicked = true; send('click'); }
  });
})();
