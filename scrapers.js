// ============================================================
// Telenor Daily Quiz — Web Scraper
// ============================================================
// Parses public "Telenor Play & Win" answer pages (Kadence/WordPress
// theme used by mytelenoranswertoday.pk and siblings) into the 5-question
// quiz JSON shape used by the rest of the app.
//
// Used by BOTH:
//   - scrape-server.js   (admin "Fetch" buttons)
//   - auto-fetch.js      (daily 12 AM run)
// ============================================================

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { pathToFileURL } from 'url';
import { getTodayStr, log } from './quiz-io.js';

// Sources tried in order by autoFetchLatest(). These are independent
// info sites that publish the daily 5-question quiz answers publicly.
export const SOURCE_URLS = [
  'https://mytelenoranswertoday.pk/',
  'https://mytelenerquiztoday.pk/',
  'https://telenorquiztoday.com.pk/',
  'https://todaytelenorquiz.com.pk/',
  'https://teleanswertoday.pk/',
  'https://theiq.pk/telenor-daily-quiz-answers-today/',
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const MAX_Q_LENGTH = 240;
const MAX_OPTION_LENGTH = 180;

export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Capitalize the first letter of each alphabetic word so proper names that the
// source site renders in lowercase (e.g. "wasim akram") are restored to
// "Wasim Akram". Existing capitals, numbers, and non-letter characters (like
// apostrophes in "Lord's") are preserved.
export function normalizeOptionText(text) {
  return String(text || '').replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

export function looksLikeGarbage(text) {
  if (typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_Q_LENGTH) return true;
  const codeSymbols = (trimmed.match(/[;{}()[\]=]/g) || []).length;
  if (trimmed.length > 0 && codeSymbols / trimmed.length > 0.15) return true;
  return /(?:=|\(|\[)\s*function\s*\(|var\s+[a-zA-Z_$][\w$]*\s*=|for\s*\(.*;;.*\)|while\s*\(|if\s*\(.*\)\s*\{|\)\s*(?:\?|:)\s*[a-zA-Z_$]|===|!==|===[^=]|new\s+[A-Z][a-zA-Z]+|\.call\(|\.apply\(|\.bind\(|prototype\.[\w$]+|[\w$]+\.[a-zA-Z]\s*=/.test(trimmed);
}

export function validateQuestions(questions) {
  const valid = ['A', 'B', 'C', 'D'];
  if (!Array.isArray(questions) || questions.length !== 5) return false;
  for (const q of questions) {
    if (!q || typeof q.question !== 'string') return false;
    if (looksLikeGarbage(q.question)) return false;
    const opts = q.options || {};
    for (const k of ['A', 'B', 'C', 'D']) {
      if (typeof opts[k] !== 'string' || opts[k].trim() === '' || opts[k].trim().length > MAX_OPTION_LENGTH) return false;
      if (looksLikeGarbage(opts[k])) return false;
    }
    if (!valid.includes(q.correctAnswer)) return false;
  }
  return true;
}

// True when a scraped quiz is dated earlier than today (Pakistan time).
// Daily answer pages often keep yesterday's post up until the sites update,
// so we refuse to publish a stale quiz as today's.
export function isStaleQuiz(dateStr) {
  if (!dateStr) return false;
  return dateStr !== getTodayStr();
}

// Strip a leading "Question N" marker, leaving the real question text.
function cleanQuestionText(text) {
  return String(text || '').replace(/^question\s*\d+\s*[:.\)]*\s*/i, '').trim();
}

// Match a correct-answer label/letter, e.g. "Answer: D", "Correct Answer: B - X", "Option C".
function extractAnswerLetter(text) {
  const m = String(text).match(/\b(answer|correct\s*answer|option)\s*[:.]?\s*([A-D])\b/i);
  return m ? m[2].toUpperCase() : null;
}

// Match a correct-answer letter given the answer text and the option labels.
function matchAnswerToLetter(answerText, options) {
  const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const at = norm(answerText);

  // 1) explicit letter in the answer line
  const letter = extractAnswerLetter(answerText);
  if (letter && options[letter]) return letter;

  // 2) exact option match
  const keys = ['A', 'B', 'C', 'D'];
  let idx = keys.findIndex(k => norm(options[k]) === at);
  if (idx !== -1) return keys[idx];

  // 3) option contains the answer text, or answer contains the option text
  idx = keys.findIndex(k => norm(options[k]).includes(at) && at.length > 0);
  if (idx !== -1) return keys[idx];
  idx = keys.findIndex(k => at.includes(norm(options[k])) && norm(options[k]).length > 0);
  if (idx !== -1) return keys[idx];

  // No reliable match — return null so the caller treats the source as unusable
  // instead of silently guessing 'A' and publishing a wrong answer.
  return null;
}

// Parse a single source's HTML into a quiz, or return null.
export function parseQuizHtml(html, sourceUrl = '') {
  if (!html || typeof html !== 'string') return null;
  const $ = cheerio.load(html);
  const $root = $('.entry-content').length ? $('.entry-content') : $(html.includes('<article') ? 'article' : 'body');

  // --- Question headings (text like "Question 1") ---
  const questionTexts = [];
  $root.find('p').each((_, el) => {
    const t = $(el).text().trim();
    if (/question\s*\d+/i.test(t)) {
      questionTexts.push(cleanQuestionText(t));
    }
  });

  // --- Options: runs of <span class="kt-svg-icon-list-text"> grouped x4 ---
  const optionSpans = [];
  $root.find('span.kt-svg-icon-list-text').each((_, el) => {
    optionSpans.push(normalizeOptionText($(el).text().trim()));
  });

  // --- Correct answers: <span class="kt-btn-inner-text"> (one per question) ---
  let answerSpans = [];
  $root.find('span.kt-btn-inner-text').each((_, el) => {
    answerSpans.push($(el).text().trim());
  });

  // Fallback: "kb-adv-text-inner" cells, skipping the literal "Answer" label
  if (answerSpans.length < 5) {
    answerSpans = [];
    let lastWasLabel = false;
    $root.find('span.kb-adv-text-inner').each((_, el) => {
      const t = $(el).text().trim();
      if (/^answer$/i.test(t)) { lastWasLabel = true; return; }
      // skip the label; keep the value that follows it
      if (lastWasLabel || answerSpans.length === 0) {
        lastWasLabel = false;
        answerSpans.push(t);
      }
    });
  }

  // Fallback: "Answer: X" or "Correct Answer: X" labels at the start of
  // individual paragraph/list-item/div elements. This is more targeted than
  // scanning allText (which can match answer keywords inside question text
  // or option descriptions), and avoids false positives like matching the
  // letter from "Answer: A, B, C, or D".
  if (answerSpans.length < 5) {
    answerSpans = [];
    const elRx = /^(?:Correct\s*Answer|Answer)\s*(?::|\.|-)?\s*([A-D])(?:\s|$)/i;
    $root.find('p, li, div').each((_, el) => {
      const t = $(el).text().trim();
      const m = t.match(elRx);
      if (m && answerSpans.length < 5) {
        answerSpans.push(m[1].toUpperCase());
      }
    });
  }

  const MIN_QS = 5;
  if (questionTexts.length >= MIN_QS && optionSpans.length >= MIN_QS * 4 && answerSpans.length >= MIN_QS) {
    const questions = [];
    let ok = true;
    for (let i = 0; i < MIN_QS; i++) {
      const opts = optionSpans.slice(i * 4, i * 4 + 4);
      if (opts.length !== 4) { ok = false; break; }
      // Reject groups with empty or duplicate options (layout drift often
      // produces repeated/blank spans that would silently map to A-D).
      const optSet = new Set(opts.map((o) => String(o || '').trim().toLowerCase()));
      if (optSet.size !== 4) { ok = false; break; }
      const optMap = { A: opts[0], B: opts[1], C: opts[2], D: opts[3] };
      const correctAnswer = matchAnswerToLetter(answerSpans[i], optMap);
      if (!correctAnswer) { ok = false; break; }
      questions.push({
        id: i + 1,
        questionNumber: i + 1,
        question: questionTexts[i] || `Question ${i + 1}`,
        options: optMap,
        correctAnswer,
        reward: '20 MBs',
      });
    }
    if (!ok) return null;
    if (!validateQuestions(questions)) return null;
    const dateInfo = extractDate($root, $);
    return { questions, date: dateInfo.date, formattedDate: dateInfo.formattedDate, source: sourceUrl };
  }

  return null;
}

// Try to read the quiz date from the page (h1/h2/og:title) — falls back to today PK time.
// Built from raw components so it is immune to the runtime's local timezone.
function extractDate($root, $) {
  const now = new Date();

  let dateText = '';
  $('h1, h2').each((_, el) => { if (!dateText) dateText = $(el).text(); });
  if (!dateText) dateText = $('title').text();
  const m = dateText.match(/(\d{1,2})\s+([A-Za-z]+)\s*[,\s]*(\d{4})/);
  if (m) {
    const day = parseInt(m[1], 10);
    const mon = MONTHS.findIndex(mm => mm.toLowerCase() === m[2].toLowerCase());
    const year = parseInt(m[3], 10);
    if (mon !== -1) {
      const iso = `${year}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const d = new Date(Date.UTC(year, mon, day));
      const fmt = `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${day}, ${year}`;
      return { date: iso, formattedDate: fmt };
    }
  }

  // Fallback: today in Pakistan (quiz resets at PK midnight).
  const pk = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  const iso = `${pk.getFullYear()}-${String(pk.getMonth() + 1).padStart(2, '0')}-${String(pk.getDate()).padStart(2, '0')}`;
  const fmt = `${WEEKDAYS[pk.getDay()]}, ${MONTHS[pk.getMonth()]} ${pk.getDate()}, ${pk.getFullYear()}`;
  return { date: iso, formattedDate: fmt };
}

function makeHeaders() {
  return { 'user-agent': USER_AGENT, 'accept': 'text/html,application/xhtml+xml' };
}

// Fetch & parse a single source URL.
export async function scrapeQuiz(url, { signal } = {}) {
  let res;
  try {
    res = await fetch(url, { headers: makeHeaders(), redirect: 'follow', signal });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const html = await res.text();
  const result = parseQuizHtml(html, url);
  return result;
}

// Try sources in order until one yields 5 valid, today-dated questions.
export async function autoFetchLatest({ signal } = {}) {
  for (const url of SOURCE_URLS) {
    try {
      const result = await scrapeQuiz(url, { signal });
      if (!result) continue;
      if (isStaleQuiz(result.date)) {
        log(`⚠️ Skipping ${url} — quiz dated ${result.date} is not today's (PK time).`);
        continue;
      }
      return result;
    } catch {
      continue;
    }
  }
  return null;
}

// CLI: `node scrapers.js` scrapes sources and prints the JSON result.
// This must ONLY run when scrapers.js is the direct entry module, not when it
// is merely imported by auto-fetch.js / scrape-server.js.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  autoFetchLatest().then((r) => {
    if (!r) { console.log(JSON.stringify({ ok: false, error: 'no source yielded 5 questions' }, null, 2)); process.exit(0); }
    console.log(JSON.stringify({ ok: true, source: r.source, quiz: { id: 'quiz-latest', date: r.date, formattedDate: r.formattedDate, category: 'MyTelenor App - Play & Win', questions: r.questions } }, null, 2));
  }).catch((e) => { console.error('scrape error:', e.message); process.exit(1); });
}
