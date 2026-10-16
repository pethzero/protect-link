// ฟังก์ชันที่ใช้ร่วมกันระหว่าง content script, background และ popup
// (โหลดแบบ classic script ใน content script และ import ใน module ได้ผ่าน globalThis)

(() => {
  // โดเมนที่มีนามสกุล 2 ชั้น เช่น example.co.th → "site" คือ example.co.th ไม่ใช่ co.th
  const TWO_LEVEL_SUFFIXES = new Set([
    'co.th', 'ac.th', 'go.th', 'in.th', 'or.th', 'ne.th', 'mi.th',
    'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au',
    'co.jp', 'ne.jp', 'or.jp', 'co.kr', 'or.kr', 'com.cn', 'com.hk', 'com.tw',
    'com.sg', 'com.my', 'co.id', 'com.vn', 'com.ph', 'co.in', 'com.br', 'co.nz',
  ]);

  // โดเมนนามสกุลที่พบบ่อยในเว็บหลอกลวง/สแปม (ใช้เป็นแค่ "สัญญาณเตือน" ไม่ใช่ตัวตัดสิน)
  const RISKY_TLDS = new Set([
    'top', 'xyz', 'click', 'icu', 'buzz', 'rest', 'cfd', 'sbs', 'monster', 'quest',
    'bond', 'zip', 'mov', 'cam', 'lol', 'tk', 'ml', 'ga', 'cf', 'gq', 'pw', 'work', 'online', 'site',
  ]);

  function siteOf(hostname) {
    if (!hostname) return '';
    const host = hostname.toLowerCase().replace(/\.$/, '');
    if (/^[\d.]+$/.test(host) || host.includes(':')) return host; // IP address
    const parts = host.split('.');
    if (parts.length <= 2) return host;
    const lastTwo = parts.slice(-2).join('.');
    return TWO_LEVEL_SUFFIXES.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
  }

  // hostname ตรงกับรายการโดเมนไหม (รวม subdomain)
  function hostMatches(hostname, domains) {
    const host = (hostname || '').toLowerCase();
    return domains.some((d) => host === d || host.endsWith('.' + d));
  }

  function riskHints(urlString) {
    const hints = [];
    let url;
    try { url = new URL(urlString); } catch { return ['URL ไม่ถูกต้อง']; }
    if (!/^https?:$/.test(url.protocol)) hints.push(`ไม่ใช่ลิงก์เว็บปกติ (${url.protocol})`);
    if (url.protocol === 'http:') hints.push('ไม่ได้เข้ารหัส (http)');
    const host = url.hostname;
    if (/^[\d.]+$/.test(host) || host.startsWith('[')) hints.push('ใช้ IP address แทนชื่อโดเมน');
    if (host.split('.').some((p) => p.startsWith('xn--'))) hints.push('ชื่อโดเมนมีอักขระพิเศษ (punycode) อาจปลอมเป็นเว็บดัง');
    const tld = host.split('.').pop();
    if (RISKY_TLDS.has(tld)) hints.push(`นามสกุลโดเมน .${tld} พบบ่อยในเว็บสแปม`);
    if (host.split('.').length > 4) hints.push('subdomain ซ้อนกันหลายชั้น');
    if (urlString.length > 300) hints.push('URL ยาวผิดปกติ');
    if (/[?&](url|redirect|redir|goto|target|dest|r|u)=https?%3A/i.test(url.search)) hints.push('มีการส่งต่อไปอีกลิงก์หนึ่ง (redirect chain)');
    return hints;
  }

  globalThis.ProtectLink = { siteOf, hostMatches, riskHints };
})();
