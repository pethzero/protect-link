// รันใน isolated world: เป็นตัวกลางระหว่าง inject.js (MAIN world) กับ background
// และแสดงหน้าต่างเตือนเมื่อมีการเด้งถูกบล็อก

(() => {
  const EV_HELLO = '__protectlink_hello';
  const EV_HELLO_REQ = '__protectlink_hello_req';
  const EV_TO_MAIN = '__protectlink_to_main';
  const EV_TO_ISOLATED = '__protectlink_to_isolated';

  // Chrome ฉีดไฟล์เดียวกันได้แค่ครั้งเดียวต่อหน้า และ shared.js ถูกใช้ใน MAIN world แล้ว จึงโหลดแบบ import แทน
  let siteOf, hostMatches, riskHints;
  const sharedReady = import(chrome.runtime.getURL('src/shared.js')).then(() => {
    ({ siteOf, hostMatches, riskHints } = globalThis.ProtectLink);
  });
  const isTop = window === window.top;

  let nonce = null;
  let settings = null;
  const queued = []; // event ที่ถูกบล็อกก่อนโหลด settings เสร็จ

  // ---------- handshake กับ inject.js ----------
  const onHello = (e) => {
    if (nonce || typeof e.detail !== 'string') return;
    nonce = e.detail;
    document.removeEventListener(EV_HELLO, onHello);
    pushSettings();
  };
  document.addEventListener(EV_HELLO, onHello);
  document.dispatchEvent(new CustomEvent(EV_HELLO_REQ)); // เผื่อ inject.js รันก่อนเรา

  function toMain(msg) {
    if (!nonce) return;
    document.dispatchEvent(new CustomEvent(EV_TO_MAIN, { detail: JSON.stringify({ ...msg, nonce }) }));
  }

  // ---------- settings ----------
  async function loadSettings() {
    await sharedReady;
    const s = await chrome.storage.local.get(['enabled', 'trustedSites', 'trustedDestinations']);
    const site = siteOf(location.hostname);
    settings = {
      enabled: s.enabled !== false,
      siteTrusted: hostMatches(site, s.trustedSites || []),
      trustedDestinations: s.trustedDestinations || [],
    };
    pushSettings();
    queued.splice(0).forEach(handleBlocked);
  }

  function pushSettings() {
    if (settings) toMain({ type: 'settings', settings });
  }

  loadSettings();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.enabled || changes.trustedSites || changes.trustedDestinations)) loadSettings();
  });

  // ---------- รับรายงานการบล็อกจาก inject.js ----------
  document.addEventListener(EV_TO_ISOLATED, (e) => {
    let msg;
    try { msg = JSON.parse(e.detail); } catch { return; }
    if (!nonce || msg.nonce !== nonce || msg.type !== 'blocked') return;
    if (!settings) queued.push(msg);
    else handleBlocked(msg);
  });

  function handleBlocked(msg) {
    // ถูกบล็อกก่อนรู้ว่าเว็บนี้อยู่ในรายการเชื่อถือ → ปล่อยไปต่อเลย
    if (!settings.enabled || settings.siteTrusted ||
        (/^https?:/.test(msg.url) && hostMatches(new URL(msg.url).hostname, settings.trustedDestinations))) {
      allow(msg);
      return;
    }
    chrome.runtime.sendMessage({ type: 'blocked', kind: msg.kind, url: msg.url, from: msg.from }).catch(() => {});
    // ป๊อปอัปจาก iframe ให้ background ส่งไปแสดงที่เฟรมบนสุด ไม่งั้นหน้าเตือนจะไปโผล่ในกรอบโฆษณาเล็ก ๆ
    if (isTop) showWarning(msg);
  }

  function allow(msg) {
    if (msg.kind === 'popup') window.open(msg.url, '_blank', 'noopener');
    else toMain({ type: 'allow', id: msg.id });
  }

  chrome.runtime.onMessage.addListener((m) => {
    if (m.type === 'showWarning' && isTop) showWarning({ ...m.payload, fromFrame: true });
  });

  // ---------- หน้าต่างเตือน ----------
  const KIND_TEXT = {
    redirect: 'พยายามพาคุณไปเว็บอื่นอัตโนมัติ',
    form: 'พยายามส่งข้อมูลไปเว็บอื่นอัตโนมัติ',
    popup: 'พยายามเปิดหน้าต่าง/แท็บใหม่ไปเว็บอื่น',
  };

  let host = null;
  function showWarning(msg) {
    const mount = () => {
      host?.remove();
      host = document.createElement('protect-link-warning');
      const root = host.attachShadow({ mode: 'closed' });
      const hints = riskHints(msg.url);
      const destHost = (() => { try { return new URL(msg.url).hostname || msg.url; } catch { return msg.url; } })();

      root.innerHTML = `
        <style>
          :host { all: initial; }
          .wrap { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: flex-start;
                  justify-content: center; padding: 16px; background: rgba(0,0,0,.35);
                  font: 14px/1.5 system-ui, "Segoe UI", Tahoma, sans-serif; }
          .card { margin-top: 8vh; max-width: 520px; width: 100%; background: #fff; color: #1a1a1a;
                  border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.3); overflow: hidden; }
          .head { background: #b42318; color: #fff; padding: 14px 18px; font-weight: 600; font-size: 16px; }
          .body { padding: 16px 18px; }
          .url { margin: 8px 0 12px; padding: 8px 10px; background: #f4f4f5; border-radius: 6px;
                 word-break: break-all; font-family: ui-monospace, Consolas, monospace; font-size: 12px;
                 max-height: 96px; overflow: auto; }
          ul { margin: 0 0 12px; padding-left: 20px; color: #b42318; }
          .btns { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 18px 16px; }
          button { font: inherit; border-radius: 8px; padding: 8px 12px; cursor: pointer; border: 1px solid #d4d4d8;
                   background: #fff; color: #1a1a1a; }
          button.primary { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
          button.danger { color: #b42318; border-color: #f2b8b5; }
          @media (prefers-color-scheme: dark) {
            .card { background: #1f1f23; color: #f4f4f5; }
            .url { background: #2a2a30; }
            button { background: #2a2a30; color: #f4f4f5; border-color: #3f3f46; }
            button.primary { background: #f4f4f5; color: #1a1a1a; }
            ul, button.danger { color: #ff8a80; }
          }
        </style>
        <div class="wrap">
          <div class="card" role="alertdialog" aria-labelledby="t">
            <div class="head" id="t">🛡️ Protect Link บล็อกการเด้งไว้</div>
            <div class="body">
              <div>เว็บ <b></b> ${KIND_TEXT[msg.kind] || KIND_TEXT.redirect} โดยที่คุณไม่ได้กด</div>
              <div class="url"></div>
              ${hints.length ? '<div>สัญญาณที่น่าสงสัย:</div><ul></ul>' : ''}
            </div>
            <div class="btns">
              <button class="primary" data-a="stay">อยู่หน้านี้ต่อ</button>
              <button data-a="once">ไปต่อครั้งนี้</button>
              <button data-a="trust">เชื่อถือเว็บนี้เสมอ</button>
              <button data-a="close">ปิดแท็บนี้</button>
              <button class="danger" data-a="block">บล็อก ${destHost.replace(/[<>&"]/g, '')} ถาวร</button>
            </div>
          </div>
        </div>`;

      root.querySelector('b').textContent = location.hostname;
      root.querySelector('.url').textContent = msg.url;
      const ul = root.querySelector('ul');
      hints.forEach((h) => { const li = document.createElement('li'); li.textContent = h; ul.append(li); });

      root.querySelector('.btns').addEventListener('click', async (ev) => {
        const a = ev.target.closest('button')?.dataset.a;
        if (!a) return;
        host.remove(); host = null;
        if (a === 'once') {
          if (msg.fromFrame) window.open(msg.url, '_blank', 'noopener'); // ป๊อปอัปจาก iframe
          else allow(msg);
        } else if (a === 'trust') {
          await chrome.runtime.sendMessage({ type: 'trustSite', site: siteOf(location.hostname) });
          await loadSettings();
          if (msg.fromFrame) window.open(msg.url, '_blank', 'noopener');
          else allow(msg);
        } else if (a === 'close') {
          chrome.runtime.sendMessage({ type: 'closeTab' });
        } else if (a === 'block') {
          chrome.runtime.sendMessage({ type: 'blockDomain', domain: destHost });
        }
      });

      (document.body || document.documentElement).append(host);
      root.querySelector('button.primary').focus();
    };
    sharedReady.then(() => {
      if (document.documentElement) mount();
      else document.addEventListener('DOMContentLoaded', mount, { once: true });
    });
  }
})();
