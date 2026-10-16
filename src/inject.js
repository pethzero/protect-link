// รันใน MAIN world (โลกเดียวกับสคริปต์ของเว็บ) ตั้งแต่ document_start
// หน้าที่: ดักการเปลี่ยนหน้า/เปิดป๊อปอัปที่ผู้ใช้ไม่ได้กดเอง แล้วแจ้ง content.js (isolated world)
//
// การสื่อสารข้ามโลกใช้ CustomEvent บน document และแนบ nonce ทุกข้อความ
// nonce ถูกส่งตอนเริ่มต้น ก่อนที่สคริปต์ของเว็บจะได้รัน เว็บจึงปลอมข้อความไม่ได้

(() => {
  const EV_HELLO = '__protectlink_hello';
  const EV_HELLO_REQ = '__protectlink_hello_req';
  const EV_TO_MAIN = '__protectlink_to_main';
  const EV_TO_ISOLATED = '__protectlink_to_isolated';

  // shared.js ถูกโหลดก่อนไฟล์นี้ใน world เดียวกัน: เก็บอ้างอิงไว้แล้วลบออกจาก global ไม่ให้เว็บแก้ได้
  const { siteOf, hostMatches } = globalThis.ProtectLink;
  delete globalThis.ProtectLink;

  const nonce = crypto.randomUUID();
  const isTop = window === window.top;

  // ค่าเริ่มต้นแบบปลอดภัย: เปิดการป้องกันไว้ จนกว่าจะได้ค่าจริงจาก storage
  const settings = { enabled: true, siteTrusted: false, trustedDestinations: [] };

  const pending = new Map(); // id → { url, form }
  let allowNextUrl = null;
  let lastSubmittedForm = null;

  // อ้างอิงฟังก์ชันจริงไว้ก่อนเว็บจะแก้ได้
  const origOpen = window.open;
  const origSubmit = HTMLFormElement.prototype.submit;
  const origRequestSubmit = HTMLFormElement.prototype.requestSubmit;
  const dispatch = EventTarget.prototype.dispatchEvent.bind(document);
  const stringify = JSON.stringify;
  const parse = JSON.parse;

  // ---------- handshake ----------
  dispatch(new CustomEvent(EV_HELLO, { detail: nonce }));
  let helloAnswered = false;
  document.addEventListener(EV_HELLO_REQ, () => {
    // ตอบครั้งเดียว: content.js ถามมาก่อนสคริปต์ของเว็บจะรันเสมอ
    if (helloAnswered) return;
    helloAnswered = true;
    dispatch(new CustomEvent(EV_HELLO, { detail: nonce }));
  });

  document.addEventListener(EV_TO_MAIN, (e) => {
    let msg;
    try { msg = parse(e.detail); } catch { return; }
    if (!msg || msg.nonce !== nonce) return;

    if (msg.type === 'settings') {
      Object.assign(settings, msg.settings);
    } else if (msg.type === 'allow') {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      allowNextUrl = p.url;
      if (p.form && p.form.isConnected) origSubmit.call(p.form); // ส่งฟอร์มเดิมอีกครั้ง (เช่น 3DS ของธนาคาร)
      else location.assign(p.url);
    }
  });

  function report(kind, url) {
    const id = crypto.randomUUID();
    dispatch(new CustomEvent(EV_TO_ISOLATED, {
      detail: stringify({ nonce, type: 'blocked', id, kind, url, from: location.href }),
    }));
    return id;
  }

  function hasUserGesture() {
    // true ภายในไม่กี่วินาทีหลังผู้ใช้คลิก/กดแป้น
    return !!(navigator.userActivation && navigator.userActivation.isActive);
  }

  function shouldBlock(destUrl) {
    if (!settings.enabled || settings.siteTrusted) return false;
    let dest;
    try { dest = new URL(destUrl, location.href); } catch { return false; }
    if (dest.protocol === 'javascript:') return false;
    if (dest.protocol === 'http:' || dest.protocol === 'https:') {
      if (siteOf(dest.hostname) === siteOf(location.hostname)) return false;
      if (hostMatches(dest.hostname, settings.trustedDestinations)) return false;
    }
    return true; // ข้ามโดเมน หรือ scheme แปลก ๆ (เช่น intent:, tg:, line:)
  }

  // ---------- 1) JavaScript / meta refresh / auto-submit form ----------
  // Navigation API (Chrome/Edge 102+) ยิง event ก่อนการเปลี่ยนหน้าทุกครั้ง และยกเลิกได้
  if (isTop && window.navigation) {
    const trackForm = (form) => { lastSubmittedForm = form; };
    HTMLFormElement.prototype.submit = function () { trackForm(this); return origSubmit.call(this); };
    if (origRequestSubmit) {
      HTMLFormElement.prototype.requestSubmit = function (...a) { trackForm(this); return origRequestSubmit.apply(this, a); };
    }

    navigation.addEventListener('navigate', (e) => {
      const url = e.destination.url;
      if (allowNextUrl && url === allowNextUrl) { allowNextUrl = null; return; }
      if (e.hashChange || e.navigationType === 'traverse') return; // ปุ่ม back/forward หรือ #anchor
      if (e.userInitiated || hasUserGesture()) return;             // ผู้ใช้กดเอง
      if (!e.cancelable || !shouldBlock(url)) return;

      e.preventDefault();
      const id = report(e.formData ? 'form' : 'redirect', url);
      pending.set(id, { url, form: e.formData ? lastSubmittedForm : null });
    });
  }

  // ---------- 2) window.open (ป๊อปอัป / pop-under) ----------
  window.open = function (url, ...rest) {
    const dest = url == null || url === '' ? 'about:blank' : String(url);
    if (!hasUserGesture() && dest !== 'about:blank' && shouldBlock(dest)) {
      report('popup', new URL(dest, location.href).href);
      return null;
    }
    return origOpen.call(this, url, ...rest);
  };
})();
