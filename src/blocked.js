let target = location.hash.slice(1);
try { target = decodeURI(target); } catch { /* ใช้ค่าดิบ */ }
document.getElementById('url').textContent = target || '(ไม่ทราบ URL)';

document.getElementById('back').addEventListener('click', () => {
  if (history.length > 1) history.back();
  else window.close();
});

document.getElementById('close').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'closeTab' });
});

document.getElementById('unblock').addEventListener('click', async () => {
  let host;
  try { host = new URL(target).hostname; } catch { return; }
  const { blockedDomains = [] } = await chrome.storage.local.get('blockedDomains');
  // หากฎที่ตรงกับ host นี้ (อาจเป็น subdomain ของโดเมนที่บล็อก)
  const match = blockedDomains.find((d) => host === d.domain || host.endsWith('.' + d.domain));
  if (match) await chrome.runtime.sendMessage({ type: 'unblockDomain', domain: match.domain });
  location.replace(target);
});
