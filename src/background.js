import './shared.js';

const { siteOf } = globalThis.ProtectLink;
const LOG_LIMIT = 100;

// ปลายทางที่เด้งไปบ่อยแบบถูกต้อง (login / จ่ายเงิน) — ผู้ใช้แก้ได้ใน popup
const DEFAULT_TRUSTED_DESTINATIONS = [
  'accounts.google.com', 'login.microsoftonline.com', 'login.live.com', 'appleid.apple.com',
  'facebook.com', 'line.me', 'github.com', 'paypal.com', 'stripe.com', 'omise.co',
];

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await chrome.storage.local.set({
      enabled: true,
      trustedSites: [],
      trustedDestinations: DEFAULT_TRUSTED_DESTINATIONS,
      blockedDomains: [],
      log: [],
    });
  }
});

// ---------- บันทึก + badge ----------
const tabCounts = new Map();

async function addLog(entry) {
  const { log = [] } = await chrome.storage.local.get('log');
  log.unshift({ ...entry, time: Date.now() });
  await chrome.storage.local.set({ log: log.slice(0, LOG_LIMIT) });
}

function bumpBadge(tabId) {
  if (tabId == null || tabId < 0) return;
  const n = (tabCounts.get(tabId) || 0) + 1;
  tabCounts.set(tabId, n);
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#b42318' });
  chrome.action.setBadgeText({ tabId, text: String(n) });
}

chrome.tabs.onRemoved.addListener((tabId) => tabCounts.delete(tabId));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading' && info.url) tabCounts.delete(tabId);
});

// ---------- ข้อความจาก content script / popup ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'blocked': {
        const tabId = sender.tab?.id;
        bumpBadge(tabId);
        await addLog({ kind: msg.kind, url: msg.url, from: msg.from });
        if (sender.frameId && tabId != null) {
          chrome.tabs.sendMessage(tabId, { type: 'showWarning', payload: msg }, { frameId: 0 }).catch(() => {});
        }
        return { ok: true };
      }
      case 'trustSite': {
        const { trustedSites = [] } = await chrome.storage.local.get('trustedSites');
        if (!trustedSites.includes(msg.site)) trustedSites.push(msg.site);
        await chrome.storage.local.set({ trustedSites });
        return { ok: true };
      }
      case 'untrustSite': {
        const { trustedSites = [] } = await chrome.storage.local.get('trustedSites');
        await chrome.storage.local.set({ trustedSites: trustedSites.filter((s) => s !== msg.site) });
        return { ok: true };
      }
      case 'closeTab':
        if (sender.tab?.id != null) await chrome.tabs.remove(sender.tab.id);
        return { ok: true };
      case 'blockDomain':
        return blockDomain(msg.domain);
      case 'unblockDomain':
        return unblockDomain(msg.domain);
      default:
        return { ok: false };
    }
  })().then(sendResponse);
  return true; // ตอบกลับแบบ async
});

// ---------- บล็อกโดเมนถาวรด้วย declarativeNetRequest ----------
// ใช้ได้กับทุกวิธีที่พาไปโดเมนนั้น รวมถึง redirect จากฝั่งเซิร์ฟเวอร์ (HTTP 30x)
async function blockDomain(domain) {
  domain = (domain || '').toLowerCase();
  if (!domain) return { ok: false };
  const { blockedDomains = [] } = await chrome.storage.local.get('blockedDomains');
  if (blockedDomains.some((d) => d.domain === domain)) return { ok: true };

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const id = Math.max(0, ...existing.map((r) => r.id)) + 1;
  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [{
      id,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: { regexSubstitution: chrome.runtime.getURL('src/blocked.html') + '#\\0' },
      },
      condition: {
        regexFilter: '^.*$',
        requestDomains: [domain],
        resourceTypes: ['main_frame', 'sub_frame'],
      },
    }],
  });
  blockedDomains.push({ domain, ruleId: id });
  await chrome.storage.local.set({ blockedDomains });
  return { ok: true };
}

async function unblockDomain(domain) {
  const { blockedDomains = [] } = await chrome.storage.local.get('blockedDomains');
  const entry = blockedDomains.find((d) => d.domain === domain);
  if (entry) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [entry.ruleId] });
  await chrome.storage.local.set({ blockedDomains: blockedDomains.filter((d) => d.domain !== domain) });
  return { ok: true };
}

// ---------- บันทึก redirect ฝั่งเซิร์ฟเวอร์ (HTTP 30x) ข้ามโดเมน ----------
// MV3 บล็อกแบบ real-time ไม่ได้ แต่บันทึกไว้ให้ผู้ใช้เห็นและกด "บล็อกถาวร" ได้จาก popup
chrome.webRequest.onBeforeRedirect.addListener(
  (d) => {
    try {
      const from = new URL(d.url);
      const to = new URL(d.redirectUrl);
      if (siteOf(from.hostname) === siteOf(to.hostname)) return;
      addLog({ kind: 'server', url: d.redirectUrl, from: d.url });
    } catch { /* URL แปลก ๆ ข้ามไป */ }
  },
  { urls: ['<all_urls>'], types: ['main_frame'] },
);
