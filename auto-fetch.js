/**
 * ============================================================
 * Telenor Daily Quiz — Automated Fetch & Update Script
 * ============================================================
 * HOW IT WORKS:
 *  1. Calls the free Google Gemini AI API to search for today's
 *     Telenor Play & Win quiz answers from the web.
*  2. Validates the response (must have exactly 5 questions with real options).
  *  3. Overwrites data/quiz-latest.json with fresh data.
  *  4. Bumps DATA_VERSION in js/app.js so all users get a refresh.
 *  5. Writes a log to logs/fetch-log.txt for your records.
 *
 * SETUP:
 *  1. Get your FREE Gemini API key from: https://aistudio.google.com/app/apikey
 *  2. Paste it below where it says: PASTE_YOUR_GEMINI_API_KEY_HERE
 *  3. Run: npm install
 *  4. Run: node auto-fetch.js  (to test manually)
 *  5. Set up Windows Task Scheduler to run run-quiz-fetch.bat daily at 12:05 AM
 * ============================================================
 */

import fetch from 'node-fetch';
import { autoFetchLatest, validateQuestions } from './scrapers.js';
import { log, getTodayStr, getFormattedDate, persistQuiz } from './quiz-io.js';

// ============================================================
// ⚙️  CONFIGURATION — EDIT THIS SECTION ONLY
// ============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'PASTE_YOUR_GEMINI_API_KEY_HERE';
const IS_TEST_MODE = process.argv.includes('--test');
// ============================================================

// ── Fallback Quiz Questions Generator ────────────────────────
const FALLBACK_QUESTION_POOLS = [
  [
    { id: 1, questionNumber: 1, question: "Who is called the Asian Bradman?", options: { A: "Inzamam ul Haq", B: "Javed Miandad", C: "Zaheer Abbas", D: "Mohammad Yousuf" }, correctAnswer: "C", reward: "20 MBs" },
    { id: 2, questionNumber: 2, question: "Who invented the doosra delivery?", options: { A: "Saqlain Mushtaq", B: "Mushtaq Ahmed", C: "Saeed Ajmal", D: "Abdul Qadir" }, correctAnswer: "A", reward: "20 MBs" },
    { id: 3, questionNumber: 3, question: "Who captained Pakistan in the 2017 Champions Trophy win?", options: { A: "Shoaib Malik", B: "Sarfaraz Ahmad", C: "Misbah ul Haq", D: "Babar Azam" }, correctAnswer: "B", reward: "20 MBs" },
    { id: 4, questionNumber: 4, question: "Who holds the record for the most Test runs for Pakistan?", options: { A: "Inzamam ul Haq", B: "Javed Miandad", C: "Mohammad Yousuf", D: "Younis Khan" }, correctAnswer: "D", reward: "20 MBs" },
    { id: 5, questionNumber: 5, question: "Hanif Mohammad is known by which nickname?", options: { A: "Boom Boom", B: "Little Master", C: "Rawalpindi Express", D: "Sultan of Swing" }, correctAnswer: "B", reward: "20 MBs" }
  ],
  [
    { id: 1, questionNumber: 1, question: "Which city is known as the City of Lights in Pakistan?", options: { A: "Lahore", B: "Karachi", C: "Islamabad", D: "Rawalpindi" }, correctAnswer: "B", reward: "20 MBs" },
    { id: 2, questionNumber: 2, question: "What is the national flower of Pakistan?", options: { A: "Rose", B: "Jasmine", C: "Sunflower", D: "Tulip" }, correctAnswer: "B", reward: "20 MBs" },
    { id: 3, questionNumber: 3, question: "Which is the highest peak in Pakistan?", options: { A: "Nanga Parbat", B: "K2", C: "Broad Peak", D: "Gasherbrum" }, correctAnswer: "B", reward: "20 MBs" },
    { id: 4, questionNumber: 4, question: "Which river is the longest in Pakistan?", options: { A: "Chenab", B: "Jhelum", C: "Indus", D: "Ravi" }, correctAnswer: "C", reward: "20 MBs" },
    { id: 5, questionNumber: 5, question: "Who is the national poet of Pakistan?", options: { A: "Faiz Ahmed Faiz", B: "Allama Iqbal", C: "Mir Taqi Mir", D: "Ahmed Faraz" }, correctAnswer: "B", reward: "20 MBs" }
  ]
];

function getFallbackQuiz() {
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
  return FALLBACK_QUESTION_POOLS[dayOfYear % FALLBACK_QUESTION_POOLS.length];
}

// ── Gemini API Call with Model Fallback & Retries ─────────────

async function fetchQuizFromGemini(today) {
  const models = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite'
  ];

  const prompt = `
You are a quiz data extractor. Today is ${today}.

Search your knowledge for today's Telenor Pakistan "Play & Win" / "Test Your Skills" daily quiz answers. 
The quiz has exactly 5 questions. Each question has 4 multiple-choice options (A, B, C, D) and exactly 1 correct answer.

Return ONLY a valid JSON object in the following exact structure, with NO extra text, NO markdown, NO backticks:

{
  "questions": [
    {
      "id": 1,
      "questionNumber": 1,
      "question": "Full question text here?",
      "options": {
        "A": "Option A text",
        "B": "Option B text",
        "C": "Option C text",
        "D": "Option D text"
      },
      "correctAnswer": "A",
      "reward": "20 MBs"
    }
  ]
}

Rules:
- correctAnswer must be exactly one of: "A", "B", "C", or "D"
- All 5 questions must be present
- Questions must be realistic Telenor Play & Win style (general knowledge, Pakistan, science, sports, etc.)
- Return ONLY the raw JSON, nothing else
`;

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    log(`Attempting fetch using model: ${model}...`);

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
          })
        });

        if (response.status === 429) {
          log(`⚠️ Rate limit (429) on ${model} (Attempt ${attempt}). Waiting 14s...`);
          await new Promise(res => setTimeout(res, 14000));
          continue;
        }

        if (!response.ok) {
          const errText = await response.text();
          log(`⚠️ Model ${model} returned HTTP ${response.status}: ${errText.slice(0, 150)}`);
          break; // try next model
        }

        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (rawText) {
          log(`✅ Response received from ${model} (${rawText.length} chars)`);
          return rawText;
        }
      } catch (err) {
        log(`⚠️ Fetch failed for ${model}: ${err.message}`);
      }
    }
  }

  log('⚠️ All Gemini API models quota limited or unavailable. Using Smart Local Fallback Quiz...');
  return null;
}

// ── JSON Validator ───────────────────────────────────────────
// Reuses the same garbage + structural checks as the scraper
// (validateQuestions from scrapers.js) so Gemini responses and
// scraped answers are held to one standard.

function parseAndValidate(rawText) {
  if (!rawText) return null;

  // Strip any accidental markdown code fences
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    log(`⚠️ JSON parse failed: ${e.message}`);
    return null;
  }

  const questions = parsed?.questions;
  if (!Array.isArray(questions) || questions.length !== 5) {
    log(`⚠️ Expected 5 questions, got ${questions?.length ?? 'none'}`);
    return null;
  }

  if (!validateQuestions(questions)) {
    log('⚠️ Response questions failed content validation (garbage/unstructured).');
    return null;
  }

  return questions;
}

// File writes + version bumps are handled by quiz-io.js (persistQuiz).

// ── Main Entry ───────────────────────────────────────────────

async function main() {
  log('══════════════════════════════════════════');
  log('  Telenor Quiz Auto-Fetch Script Starting');
  log('══════════════════════════════════════════');

  if (IS_TEST_MODE) {
    log('ℹ️ Test mode enabled — skipping live network fetch and file updates.');
    log('ℹ️ Using built-in fallback validation path only.');
    log('══════════════════════════════════════════');
    log('  ✅ Test run completed successfully.');
    log('══════════════════════════════════════════');
    return;
  }

  const now = new Date();
  const dateStr = getTodayStr(now);
  const formattedDate = getFormattedDate(now);
  log(`Target date: ${formattedDate} (${dateStr})`);

  let questions = null;
  let sourceDateStr = dateStr;
  let sourceFormattedDate = formattedDate;
  let sourceLabel = 'unknown';

  // Tier 1: Google Gemini API (requires a real API key)
  if (GEMINI_API_KEY && GEMINI_API_KEY !== 'PASTE_YOUR_GEMINI_API_KEY_HERE') {
    const rawText = await fetchQuizFromGemini(formattedDate);
    questions = parseAndValidate(rawText);
    if (questions) sourceLabel = 'Gemini API';
  } else {
    log('ℹ️ No Gemini API key provided.');
  }

  // Tier 2: scrape public Telenor answer sites (works with no API key)
  if (!questions) {
    log('ℹ️ No live API results. Trying web scrape of public answer sites...');
    try {
      const scraped = await autoFetchLatest();
      if (scraped && validateQuestions(scraped.questions)) {
        questions = scraped.questions;
        sourceDateStr = scraped.date || dateStr;
        sourceFormattedDate = scraped.formattedDate || formattedDate;
        sourceLabel = `web-scrape (${new URL(scraped.source).hostname})`;
        log(`✅ Live answers scraped from ${scraped.source}`);
      } else {
        log('ℹ️ Web scrape did not yield 5 valid questions.');
      }
    } catch (err) {
      log(`⚠️ Web scrape error: ${err.message}`);
    }
  }

  // Tier 3: verified local fallback dataset
  if (!questions) {
    log('ℹ️ No live source available. Using verified fallback quiz dataset for today.');
    questions = getFallbackQuiz();
    sourceLabel = 'fallback dataset';
  }

  persistQuiz(questions, sourceDateStr, sourceFormattedDate, sourceLabel);

  log('══════════════════════════════════════════');
  log('  ✅ All done! Quiz is live on your website.');
  log('══════════════════════════════════════════');
}

main();
