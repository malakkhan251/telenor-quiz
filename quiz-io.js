// ============================================================
// quiz-io.js — shared file I / O helpers for the Telenor quiz project
// ============================================================
// Used by: auto-fetch.js (daily 12 AM run) and scrape-server.js (admin API).
// Importing this module has NO side effects (no main() runs).
// ============================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const JSON_PATH = path.join(__dirname, 'data', 'quiz-latest.json');
export const APP_JS_PATH = path.join(__dirname, 'js', 'app.js');
export const LOG_DIR = path.join(__dirname, 'logs');
export const LOG_PATH = path.join(LOG_DIR, 'fetch-log.txt');

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// Append a timestamped line to the console + logs/fetch-log.txt (Pakistan time).
export function log(message) {
  const timestamp = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, line + '\n');
  } catch (_) { }
}

export function getTodayStr(date = new Date()) {
  const pk = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  const y = pk.getFullYear();
  const m = String(pk.getMonth() + 1).padStart(2, '0');
  const d = String(pk.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getFormattedDate(date = new Date()) {
  const pk = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  return `${DAYS[pk.getDay()]}, ${MONTHS[pk.getMonth()]} ${pk.getDate()}, ${pk.getFullYear()}`;
}

// e.g. "aug05-2026-v1"
export function buildVersionTag(dateStr) {
  const d = new Date(dateStr);
  const mon = MONTHS[d.getMonth()].slice(0, 3).toLowerCase();
  return `${mon}${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}-v1`;
}

export function writeQuizJSON(questions, dateStr, formattedDate) {
  const now = new Date();
  const pk = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  const payload = {
    id: 'quiz-latest',
    date: dateStr,
    formattedDate,
    category: 'MyTelenor App - Play & Win',
    lastUpdated: `Today at ${pk.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
    updatedTimestamp: Date.now(),
    questions,
  };
  if (!fs.existsSync(path.dirname(JSON_PATH))) fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true });
  fs.writeFileSync(JSON_PATH, JSON.stringify(payload, null, 2), 'utf8');
  log(`✅ data/quiz-latest.json updated for ${formattedDate}`);
  return payload;
}

// Set DATA_VERSION in js/app.js to a single, unique declaration.
// Robust against re-runs (same-day) and pre-existing duplicates.
export function bumpVersionInAppJS(dateStr) {
  if (!fs.existsSync(APP_JS_PATH)) {
    log('⚠️ js/app.js not found — skipping DATA_VERSION bump');
    return;
  }
  const newVersion = buildVersionTag(dateStr);
  let content = fs.readFileSync(APP_JS_PATH, 'utf8');

  // Remove ALL existing DATA_VERSION declarations so we never end up with duplicates.
  content = content.replace(/[^\n]*const\s+DATA_VERSION\s*=\s*(['"])[^'"]*(['"]);[^\n]*\n?/g, '');

  // Insert exactly one declaration right after the fingerprint comment.
  const decl = `const DATA_VERSION = '${newVersion}';\n`;
  if (/\/\/ Data version fingerprint[^\n]*\n/.test(content)) {
    content = content.replace(/(\/\/ Data version fingerprint[^\n]*\n)/, `$1${decl}`);
  } else {
    content = `${decl}\n${content}`;
  }

  fs.writeFileSync(APP_JS_PATH, content, 'utf8');
  log(`✅ DATA_VERSION set to "${newVersion}" in js/app.js`);
}

// Write the quiz file AND bump the version in one call.
export function persistQuiz(questions, dateStr, formattedDate, sourceLabel = '') {
  const payload = writeQuizJSON(questions, dateStr, formattedDate);
  bumpVersionInAppJS(dateStr);
  if (sourceLabel) log(`ℹ️ Answers sourced from: ${sourceLabel}`);
  return payload;
}
