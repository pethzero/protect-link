// ทดสอบอัตโนมัติ: node test/run.mjs (ต้อง npm i puppeteer ก่อน)
import './server.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(process.env.PUPPETEER_DIR ? path.join(process.env.PUPPETEER_DIR, 'x.js') : import.meta.url);
const puppeteer = require('puppeteer');
const ext = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  pipe: true,
  enableExtensions: [ext],
});
await sleep(1000);
const page = await browser.newPage();
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
// หน้าเตือนอยู่ใน closed shadow root (เว็บแตะไม่ได้) จึงกดด้วยคีย์บอร์ดเหมือนผู้ใช้จริง
// ปุ่มเรียงตามนี้: อยู่หน้านี้ต่อ(โฟกัสอยู่) → ไปต่อครั้งนี้ → เชื่อถือเว็บนี้ → บล็อกถาวร
const pressButton = async (index) => {
  for (let i = 0; i < index; i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
};
const hasWarning = () => page.evaluate(() => !!document.querySelector('protect-link-warning'));

for (const [name, expectBlocked] of [
  ['/js', true], ['/replace', true], ['/meta', true], ['/form', true], ['/scheme', true],
  ['/same', false],
]) {
  await page.goto('http://localhost:8080' + name);
  await sleep(1200);
  const url = page.url();
  const blocked = !url.includes('8081') && !url.endsWith('/landed') && url.includes(name);
  const warn = blocked ? await hasWarning() : false;
  check(`${name} ${expectBlocked ? 'ต้องถูกบล็อก' : 'ต้องผ่าน'}`, expectBlocked ? blocked && warn : !blocked, `→ ${url}`);
}

// ป๊อปอัปที่ผู้ใช้ไม่ได้กด
await page.goto('http://localhost:8080/popup');
await sleep(1000);
check('/popup ต้องถูกบล็อก', (await page.evaluate(() => window.__popup)) === null && (await hasWarning()));

// ผู้ใช้คลิกลิงก์เอง → ต้องผ่าน
await page.goto('http://localhost:8080/click');
await Promise.all([page.waitForNavigation(), page.click('#a')]);
check('คลิกลิงก์เอง ต้องผ่าน', page.url().includes('8081'), `→ ${page.url()}`);

// กด "ไปต่อครั้งนี้" ในหน้าเตือน → ต้องไปถึงปลายทาง (ฟอร์มต้องส่งซ้ำแบบ POST)
for (const name of ['/js', '/form']) {
  await page.goto('http://localhost:8080' + name);
  await sleep(1000);
  await Promise.all([
    page.waitForNavigation({ timeout: 5000 }).catch(() => {}),
    pressButton(1),
  ]);
  check(`${name} กดไปต่อ แล้วต้องไปถึง`, page.url().includes('8081'), `→ ${page.url()}`);
}

// บล็อกโดเมนถาวร → แม้แต่ redirect จากเซิร์ฟเวอร์ก็ต้องโดน
await page.goto('http://localhost:8080/js');
await sleep(1000);
await pressButton(3);
await sleep(500);
await page.goto('http://localhost:8080/server').catch(() => {});
await sleep(500);
check('บล็อกถาวร ใช้กับ HTTP 302 ได้', page.url().includes('blocked.html'), `→ ${page.url()}`);

console.log(`\n${results.filter(Boolean).length}/${results.length} ผ่าน`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
