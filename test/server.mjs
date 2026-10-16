// เซิร์ฟเวอร์ทดสอบ: พอร์ต 8080 = เว็บต้นทาง, พอร์ต 8081 (ผ่าน 127.0.0.1) = เว็บ "อันตราย" คนละโดเมน
import http from 'node:http';

const EVIL = 'http://127.0.0.1:8081/evil';
const pages = {
  '/js': `<script>setTimeout(() => location.href = '${EVIL}?js', 300)</script>`,
  '/replace': `<script>location.replace('${EVIL}?replace')</script>`,
  '/meta': `<meta http-equiv="refresh" content="0;url=${EVIL}?meta">`,
  '/form': `<form id=f method=post action="${EVIL}?form"><input name=a value=1></form><script>f.submit()</script>`,
  '/popup': `<script>setTimeout(() => window.__popup = window.open('${EVIL}?popup'), 300)</script>`,
  '/scheme': `<script>setTimeout(() => location.href = 'intent://scan/#Intent;scheme=zxing;end', 300)</script>`,
  '/same': `<script>setTimeout(() => location.href = '/landed', 300)</script>`,
  '/click': `<a id=a href="${EVIL}?click">go</a>`,
  '/server': '',
  '/landed': 'landed',
};

const handler = (req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/evil') { res.end('EVIL PAGE'); return; }
  if (path === '/server') { res.writeHead(302, { Location: EVIL + '?server' }); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><title>t</title><body>${pages[path] ?? 'index'}</body>`);
};
http.createServer(handler).listen(8080);
http.createServer(handler).listen(8081);
console.log('test server on :8080 and :8081');
