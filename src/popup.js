const { siteOf } = globalThis.ProtectLink;
const $ = (id) => document.getElementById(id);

const KIND_LABEL = {
  redirect: 'เด้งอัตโนมัติ',
  form: 'ส่งฟอร์มอัตโนมัติ',
  popup: 'ป๊อปอัป',
  server: 'เซิร์ฟเวอร์ redirect (แจ้งเตือน)',
};

let currentSite = '';

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function emptyRow(text) {
  return el('li', { className: 'empty' }, text);
}

async function render() {
  const s = await chrome.storage.local.get(['enabled', 'trustedSites', 'blockedDomains', 'log']);
  const trustedSites = s.trustedSites || [];

  $('enabled').checked = s.enabled !== false;
  $('site').textContent = currentSite ? `(${currentSite})` : '';
  $('trustSite').disabled = !currentSite;
  $('trustSite').checked = trustedSites.includes(currentSite);

  const log = s.log || [];
  $('log').replaceChildren(...(log.length ? log.slice(0, 30).map((e) => {
    let host = e.url;
    try { host = new URL(e.url).hostname || e.url; } catch { /* ใช้ค่าดิบ */ }
    return el('li', {},
      el('div', { className: 'item' },
        el('span', { className: 'tag' }, KIND_LABEL[e.kind] || e.kind),
        el('span', { className: 'muted' }, new Date(e.time).toLocaleTimeString('th-TH')),
        el('button', { className: 'link', textContent: 'บล็อกถาวร', onclick: () => send('blockDomain', { domain: host }) })),
      el('div', { className: 'dest', title: e.url }, e.url),
      el('div', { className: 'muted' }, 'จาก ' + safeHost(e.from)));
  }) : [emptyRow('ยังไม่มี')]));

  const blocked = s.blockedDomains || [];
  $('blocked').replaceChildren(...(blocked.length ? blocked.map((d) =>
    el('li', { className: 'item' }, d.domain,
      el('button', { className: 'link', textContent: 'เลิกบล็อก', onclick: () => send('unblockDomain', { domain: d.domain }) })),
  ) : [emptyRow('ยังไม่มี')]));

  $('trusted').replaceChildren(...(trustedSites.length ? trustedSites.map((site) =>
    el('li', { className: 'item' }, site,
      el('button', { className: 'link', textContent: 'ลบ', onclick: () => send('untrustSite', { site }) })),
  ) : [emptyRow('ยังไม่มี')]));
}

function safeHost(url) {
  try { return new URL(url).hostname; } catch { return url || '-'; }
}

async function send(type, data) {
  await chrome.runtime.sendMessage({ type, ...data });
  render();
}

$('enabled').addEventListener('change', (e) => chrome.storage.local.set({ enabled: e.target.checked }));
$('trustSite').addEventListener('change', (e) => send(e.target.checked ? 'trustSite' : 'untrustSite', { site: currentSite }));
$('clearLog').addEventListener('click', async () => { await chrome.storage.local.set({ log: [] }); render(); });

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const url = new URL(tab.url);
    if (/^https?:$/.test(url.protocol)) currentSite = siteOf(url.hostname);
  } catch { /* แท็บพิเศษ เช่น chrome:// */ }
  render();
})();
