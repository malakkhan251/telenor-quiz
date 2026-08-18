/**
 * scrape-server.js
 * ============================================================
 * Local HTTP server that powers the Admin panel's scrape buttons:
 *   GET  /api/trigger-scrape   → scrape all known sources, pick the best,
 *                                 write data/quiz-latest.json, bump DATA_VERSION.
 *   POST /api/fetch-url        → { url: "..." } → scrape that page only,
 *                                 write data/quiz-latest.json, bump DATA_VERSION.
 *   GET  /                     → serves the static site (index.html etc.) so you
 *                                 can run `npm start` to preview locally too.
 *
 * Run:  npm start        (listens on http://localhost:3000)
 * ============================================================
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { autoFetchLatest, scrapeQuiz, validateQuestions } from './scrapers.js';
import { log, persistQuiz } from './quiz-io.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

// IO helpers (log, persistQuiz) are imported from quiz-io.js to avoid duplication.

// ── Request handlers ─────────────────────────────────────────

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(body);
}

async function handleTriggerScrape(_req, res) {
  try {
    log('▶ /api/trigger-scrape: scanning sources...');
    const scraped = await autoFetchLatest();
    if (!scraped || !validateQuestions(scraped.questions)) {
      sendJson(res, 502, { ok: false, message: 'No source yielded 5 valid questions.' });
      return;
    }
    const payload = persistQuiz(scraped.questions, scraped.date, scraped.formattedDate, scraped.source);
    sendJson(res, 200, { ok: true, message: 'Quiz scraped and saved.', source: scraped.source, payload });
  } catch (err) {
    log(`✖ /api/trigger-scrape error: ${err.message}`);
    sendJson(res, 500, { ok: false, message: err.message });
  }
}

async function handleFetchUrl(req, res) {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    let url;
    try { url = JSON.parse(body || '{}').url; } catch { url = null; }
    // Allow ?url=... too (handy for testing in a browser)
    if (!url) url = new URL(req.url, `http://localhost:${PORT}`).searchParams.get('url');
    if (!url) { sendJson(res, 400, { ok: false, message: 'Missing "url" in request body.' }); return; }

    try {
      log(`▶ /api/fetch-url: scraping ${url}`);
      const scraped = await scrapeQuiz(url);
      if (!scraped || !validateQuestions(scraped.questions)) {
        sendJson(res, 502, { ok: false, message: 'Scrape did not yield 5 valid questions.' });
        return;
      }
      const payload = persistQuiz(scraped.questions, scraped.date, scraped.formattedDate, scraped.source);
      sendJson(res, 200, { ok: true, message: 'Quiz scraped and saved.', source: scraped.source, payload });
    } catch (err) {
      log(`✖ /api/fetch-url error: ${err.message}`);
      sendJson(res, 500, { ok: false, message: err.message });
    }
  });
}

// ── Static file serving ──────────────────────────────────────

function safeJoin(target) {
  const decoded = decodeURIComponent(target);
  let resolved = path.normalize(path.join(__dirname, decoded));
  if (!resolved.startsWith(__dirname + path.sep) && resolved !== __dirname) {
    resolved = __dirname;
  }
  return resolved;
}

function serveStatic(req, res) {
  let pathname = new URL(req.url, `http://localhost:${PORT}`).pathname;
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const filePath = safeJoin(pathname);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const index = path.join(filePath, 'index.html');
    if (fs.existsSync(index)) return serveFile(index, res);
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  serveFile(filePath, res);
}

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(filePath).pipe(res);
}

// ── Server bootstrap ─────────────────────────────────────────

const server = http.createServer((req, res) => {
  // Permissive CORS so the Admin panel (opened from file:// or any origin) can call the API.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const pathname = new URL(req.url, `http://localhost:${PORT}`).pathname;

  if (pathname === '/api/trigger-scrape') {
    return handleTriggerScrape(req, res);
  }
  if (pathname === '/api/fetch-url') {
    return handleFetchUrl(req, res);
  }
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  log(`══════════════════════════════════════════`);
  log(`  Telenor Quiz Scrape Server`);
  log(`  Listening on http://localhost:${PORT}`);
  log(`  API: GET  /api/trigger-scrape`);
  log(`  API: POST /api/fetch-url  { url }`);
  log(`  Static: /  → index.html`);
  log(`══════════════════════════════════════════`);
  // Auto-open the admin panel in your default browser so the
  // "Auto Scrap" button has a live server to talk to.
  // Disable with OPEN_ADMIN_PANEL=false (or any falsey value).
  if (process.env.OPEN_ADMIN_PANEL !== 'false' && process.env.OPEN_ADMIN_PANEL !== '0') {
    const adminUrl = `http://localhost:${PORT}/?admin=true`;
    try {
      if (process.platform === 'win32') exec(`start "" "${adminUrl}"`);
      else if (process.platform === 'darwin') exec(`open "${adminUrl}"`);
      else exec(`xdg-open "${adminUrl}"`);
    } catch (_) { /* non-fatal: server still works */ }
  }
});
