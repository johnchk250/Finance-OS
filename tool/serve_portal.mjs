import http from 'node:http';
import fs from 'node:fs';

// A loopback-only demo server. It never serves private assets or arbitrary paths.
const files = new Map([
  ['/', 'build/portal-preview/index.html'],
  ['/index.html', 'build/portal-preview/index.html'],
  ['/checks.html', 'tool/check_portal_browser.html'],
  ['/performance.html', 'tool/check_portal_performance.html'],
]);
http.createServer((request, response) => {
  const file = files.get(new URL(request.url, 'http://127.0.0.1').pathname);
  if (!file || !fs.existsSync(file)) {
    response.writeHead(404); response.end('Build the demo portal first.'); return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(fs.readFileSync(file));
}).listen(43990, '127.0.0.1', () => {
  console.log('Demo: http://127.0.0.1:43990 — export checks: /checks.html');
});
