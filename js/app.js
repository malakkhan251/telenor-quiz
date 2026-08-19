/**
 * Telenor Daily Quiz Answers - Main Application Logic (5 Questions Support)
 */

// Initial Default 5 Quiz Questions
const DEFAULT_QUESTIONS = [
  {
    id: 1,
    questionNumber: 1,
    question: 'Who is called the Asian Bradman?',
    options: {
      A: 'Inzamam ul Haq',
      B: 'Javed Miandad',
      C: 'Zaheer Abbas',
      D: 'Mohammad Yousuf'
    },
    correctAnswer: 'C',
    reward: '20 MBs'
  },
  {
    id: 2,
    questionNumber: 2,
    question: 'Who invented the doosra delivery?',
    options: {
      A: 'Saqlain Mushtaq',
      B: 'Mushtaq Ahmed',
      C: 'Saeed Ajmal',
      D: 'Abdul Qadir'
    },
    correctAnswer: 'A',
    reward: '20 MBs'
  },
  {
    id: 3,
    questionNumber: 3,
    question: 'Who captained Pakistan in the 2017 Champions Trophy win?',
    options: {
      A: 'Shoaib Malik',
      B: 'Sarfaraz Ahmad',
      C: 'Misbah ul Haq',
      D: 'Babar Azam'
    },
    correctAnswer: 'B',
    reward: '20 MBs'
  },
  {
    id: 4,
    questionNumber: 4,
    question: 'Who holds the record for the most Test runs for Pakistan?',
    options: {
      A: 'Inzamam ul Haq',
      B: 'Javed Miandad',
      C: 'Mohammad Yousuf',
      D: 'Younis Khan'
    },
    correctAnswer: 'D',
    reward: '20 MBs'
  },
  {
    id: 5,
    questionNumber: 5,
    question: 'Hanif Mohammad is known by which nickname?',
    options: {
      A: 'Boom Boom',
      B: 'Little Master',
      C: 'Rawalpindi Express',
      D: 'Sultan of Swing'
    },
    correctAnswer: 'B',
    reward: '20 MBs'
  }
];

// Default Quiz Package — August 4, 2026
const DEFAULT_QUIZ = {
  id: 'quiz-latest',
  date: '2026-08-04',
  formattedDate: 'Tuesday, August 4, 2026',
  category: 'MyTelenor App - Play & Win',
  totalReward: '100 MBs Free Internet',
  lastUpdated: 'Today at 12:15 AM',
  updatedTimestamp: 1785956000000,
  questions: DEFAULT_QUESTIONS
};

// Helper: Format Current Date nicely (Pakistan timezone for consistency with server)
function getFormattedCurrentDate() {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return new Date().toLocaleString('en-US', { ...options, timeZone: 'Asia/Karachi' });
}

// Today's date string (YYYY-MM-DD) in Pakistan time, matching server-side
// data/quiz-latest.json so date comparisons are consistent across timezones.
function getTodayPkStr() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' })).toISOString().split('T')[0];
}

// Active State
let activeQIndex = 0; // 0 to 4
let currentViewMode = 'tab'; // 'tab' | 'all'

// Data version fingerprint — updated by the fetch script whenever the quiz is
const DATA_VERSION = 'aug20-2026-v1';
// republished. It is tracked for traceability but does NOT force a reset:
// localStorage keeps the last published quiz until a new one arrives.

// Store Management
class QuizStore {
  constructor() {
    this.storageKey = 'telenor_daily_quiz_data';
    this.adminPassKey = 'telenor_admin_password';
    this.versionKey = 'telenor_data_version';
    this.init();
  }

  init() {
    const todayStr = getTodayPkStr();
    const stored = this._safeGet(this.storageKey);

    // Reset ONLY if there is no usable data at all. We deliberately do NOT
    // reset on a stale date or a DATA_VERSION mismatch: when the date rolls
    // over (e.g. 12th -> 13th) before the new quiz is published, the previous
    // day's quiz keeps showing until data/quiz-latest.json is updated.
    const needsReset =
      !stored ||
      !Array.isArray(stored.questions) ||
      stored.questions.length !== 5;

    if (needsReset) {
      const freshQuiz = {
        ...DEFAULT_QUIZ,
        date: todayStr,
        formattedDate: getFormattedCurrentDate(),
        updatedTimestamp: Date.now()
      };
      localStorage.setItem(this.storageKey, JSON.stringify(freshQuiz));
      localStorage.setItem(this.versionKey, DATA_VERSION);
    }

    // Keep the admin password in sync with the current default. Legacy
    // browsers may still hold the old 'admin123' value from an earlier build,
    // which would otherwise shadow the real password and block login.
    const storedPass = localStorage.getItem(this.adminPassKey);
    if (!storedPass || storedPass === 'admin123') {
      localStorage.setItem(this.adminPassKey, 'Mine1212');
    }
  }

  // Admin password: Mine1212 (updated from default admin123)
  // Stored in localStorage per browser
  // Force rebuild trigger comment
  // Safe localStorage parse helper
  _safeGet(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (e) {
      return null;
    }
  }

  getQuiz() {
    try {
      const data = JSON.parse(localStorage.getItem(this.storageKey));
      if (data && Array.isArray(data.questions) && data.questions.length === 5) {
        return data;
      }
      return DEFAULT_QUIZ;
    } catch (e) {
      return DEFAULT_QUIZ;
    }
  }

  saveQuiz(quizData, { silent = false } = {}) {
    const updated = {
      ...quizData,
      lastUpdated: `Today at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' })}`,
      updatedTimestamp: Date.now()
    };
    localStorage.setItem(this.storageKey, JSON.stringify(updated));
    // Trigger custom event for real-time app update (skipped for silent syncs
    // like a plain page refresh where the data has not actually changed)
    if (!silent) {
      window.dispatchEvent(new CustomEvent('quizUpdated', { detail: updated }));
    }
    return updated;
  }

  getAdminPassword() {
    return localStorage.getItem(this.adminPassKey) || 'Mine1212';
  }

  setAdminPassword(newPassword) {
    localStorage.setItem(this.adminPassKey, newPassword);
  }
}

const store = new QuizStore();

// Live Automatic Sync Engine
async function syncLiveQuizData(force = false) {
  try {
    const response = await fetch('./data/quiz-latest.json?t=' + Date.now(), { cache: 'no-store' });
    if (response.ok) {
      const liveData = await response.json();
      if (liveData && Array.isArray(liveData.questions) && liveData.questions.length === 5) {
        const currentLocal = store.getQuiz();
        const todayStr = getTodayPkStr();
        const liveTimestamp = Number(liveData.updatedTimestamp || 0);
        const currentTimestamp = Number(currentLocal.updatedTimestamp || 0);

        // Detect an actual content/date change so a plain page refresh does not
        // fire the "quiz updated" toast for data that is already shown.
        const contentChanged =
          liveData.date !== currentLocal.date ||
          JSON.stringify(liveData.questions) !== JSON.stringify(currentLocal.questions);

        // Sync if forced, or the quiz changed, or local is older than today,
        // or the live file is newer.
        const shouldSync =
          force || contentChanged || currentLocal.date !== todayStr || liveTimestamp > currentTimestamp;

        if (shouldSync) {
          // Toast only when the quiz really changed; keep identical refreshes silent.
          store.saveQuiz(liveData, { silent: !contentChanged });
          renderQuiz();
          return true;
        }
      }
    }
  } catch (err) {
    console.log('Live sync fallback to local store:', err);
  }
  return false;
}

// Application UI Controller
document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  renderQuiz();
  startCountdownTimer();
  setupEventListeners();
  syncLiveQuizData(true); // Force a fresh live read from data/quiz-latest.json on every page open

  // Auto-update an open tab: re-check the live file periodically so the quiz
  // refreshes automatically after the 12 AM task (or an admin scrape) writes
  // a new quiz. Skipped for file:// pages, which can't fetch local JSON.
  if (window.location.protocol !== 'file:') {
    setInterval(() => syncLiveQuizData(false), 60000);
  }
});

// Dark Mode Handler
function initDarkMode() {
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const sunIcon = document.getElementById('sun-icon');
  const moonIcon = document.getElementById('moon-icon');

  const savedTheme = localStorage.getItem('telenor_theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
    document.documentElement.classList.add('dark');
    if (sunIcon && moonIcon) {
      sunIcon.classList.remove('hidden');
      moonIcon.classList.add('hidden');
    }
  } else {
    document.documentElement.classList.remove('dark');
    if (sunIcon && moonIcon) {
      sunIcon.classList.add('hidden');
      moonIcon.classList.remove('hidden');
    }
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('telenor_theme', isDark ? 'dark' : 'light');
      
      if (sunIcon && moonIcon) {
        if (isDark) {
          sunIcon.classList.remove('hidden');
          moonIcon.classList.add('hidden');
        } else {
          sunIcon.classList.add('hidden');
          moonIcon.classList.remove('hidden');
        }
      }
      showToast(isDark ? 'Dark mode enabled' : 'Light mode enabled', 'info');
    });
  }
}

// Render Main Today's Quiz (5 Questions Support)
function renderQuiz() {
  const quiz = store.getQuiz();
  const questions = quiz.questions || DEFAULT_QUESTIONS;

  // Header Details
  const quizDateEl = document.getElementById('quiz-date');
  if (quizDateEl) quizDateEl.textContent = quiz.formattedDate || getFormattedCurrentDate();

  const lastUpdatedEl = document.getElementById('last-updated-text');
  if (lastUpdatedEl) lastUpdatedEl.textContent = quiz.lastUpdated || 'Today at 8:00 AM';

  // Render Q1 to Q5 Navigation Tabs
  renderQuestionTabs(questions.length);

  // Render View Mode Text
  const viewModeText = document.getElementById('view-mode-text');
  if (viewModeText) {
    viewModeText.textContent = currentViewMode === 'tab' ? 'View All 5 Questions' : 'Single Question View';
  }

  // Render Main Quiz Content (Tab vs All List)
  const contentArea = document.getElementById('quiz-content-area');
  if (!contentArea) return;

   // Toggle Quick Action Bar buttons based on view mode
  const copyCurrentBtn = document.getElementById('copy-current-btn');
  const copyAllBtn = document.getElementById('copy-all-btn');
  const shareBtn = document.getElementById('share-btn');

  if (currentViewMode === 'all') {
    // Hide navigation tabs in "View All" mode
    const navTabs = document.getElementById('q-nav-tabs');
    if (navTabs) navTabs.classList.add('hidden');

    // In "View All" mode there is no single current answer, so only keep
    // the "Copy All 5 Answers" (and Share) buttons visible.
    if (copyCurrentBtn) copyCurrentBtn.classList.add('hidden');
    if (copyAllBtn) copyAllBtn.classList.remove('hidden');
    if (shareBtn) shareBtn.classList.remove('hidden');

    contentArea.innerHTML = renderAllQuestionsView(questions);
  } else {
    // Show navigation tabs in "Tab View" mode
    const navTabs = document.getElementById('q-nav-tabs');
    if (navTabs) navTabs.classList.remove('hidden');

    // In "Tab" mode a single question is active, so show the
    // "Copy Current Answer" button and hide the "Copy All" button.
    if (copyCurrentBtn) copyCurrentBtn.classList.remove('hidden');
    if (copyAllBtn) copyAllBtn.classList.add('hidden');
    if (shareBtn) shareBtn.classList.remove('hidden');

    const currentQ = questions[activeQIndex] || questions[0];
    contentArea.innerHTML = renderSingleQuestionView(currentQ, activeQIndex, questions.length);
    attachStepNavigationEvents();
  }
}

// Render Navigation Tabs (Q1 - Q5)
function renderQuestionTabs(totalQuestions) {
  const navTabs = document.getElementById('q-nav-tabs');
  if (!navTabs) return;

  let html = '';
  for (let i = 0; i < totalQuestions; i++) {
    const isActive = i === activeQIndex && currentViewMode === 'tab';
    html += `
      <button type="button" data-qindex="${i}" class="q-tab-btn flex-1 py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 border ${
        isActive
          ? 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/25 scale-[1.02]'
          : 'bg-white/60 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:border-emerald-400 dark:hover:border-emerald-500/50'
      }">
        <span>Q${i + 1}</span>
        ${isActive ? `<span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>` : ''}
      </button>
    `;
  }
  navTabs.innerHTML = html;

  // Add tab click listeners
  const tabBtns = navTabs.querySelectorAll('.q-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      activeQIndex = parseInt(btn.getAttribute('data-qindex'), 10);
      currentViewMode = 'tab';
      renderQuiz();
    });
  });
}

// Render Single Question View Markup
function renderSingleQuestionView(q, index, total) {
  const correctLetter = q.correctAnswer;
  const correctText = q.options[correctLetter];

  return `
    <div class="py-2 space-y-6 animate-fadeIn">
      <!-- Question Banner -->
      <div class="flex items-center justify-between">
        <span class="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs">
          Question ${index + 1} of ${total}
        </span>
      </div>

      <!-- Question Text -->
      <div>
        <h3 class="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white leading-snug">
          ${escapeHtml(q.question)}
        </h3>
      </div>

      <!-- Options Grid -->
      <div class="grid grid-cols-1 gap-3 sm:gap-3.5">
        ${renderOptionsGrid(q)}
      </div>

      <!-- Highlighted Correct Answer Summary Box -->
      <div class="rounded-2xl bg-gradient-to-r from-emerald-500/15 via-emerald-500/10 to-teal-500/15 border-2 border-emerald-500 p-4 sm:p-5 flex items-center justify-between gap-4 shadow-lg shadow-emerald-500/10">
        <div class="flex items-center space-x-3.5">
          <div class="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-emerald-500/30">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <span class="text-[11px] font-extrabold uppercase tracking-widest text-emerald-700 dark:text-emerald-300 block">Verified Correct Answer</span>
            <div class="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
              <span class="text-emerald-600 dark:text-emerald-400">${correctLetter}.</span> ${escapeHtml(correctText)}
            </div>
          </div>
        </div>
      </div>

      <!-- Question Stepper Navigation Controls -->
      <div class="flex items-center justify-between pt-2">
        <button id="prev-q-btn" type="button" class="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all ${index === 0 ? 'opacity-40 cursor-not-allowed' : ''}" ${index === 0 ? 'disabled' : ''}>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/>
          </svg>
          <span>Previous</span>
        </button>

        <span class="text-xs font-bold text-slate-500 dark:text-slate-400">
          ${index + 1} / ${total}
        </span>

        <button id="next-q-btn" type="button" class="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-600/20 transition-all ${index === total - 1 ? 'opacity-40 cursor-not-allowed' : ''}" ${index === total - 1 ? 'disabled' : ''}>
          <span>Next Question</span>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

// Render All 5 Questions Stacked View Markup
function renderAllQuestionsView(questions) {
  return `
    <div class="space-y-8 animate-fadeIn">
      <div class="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
        <h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>All 5 Today's Telenor Questions & Answers</span>
        </h3>
        <span class="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
          100% Verified
        </span>
      </div>

      <div class="space-y-4">
        ${questions.map((q, idx) => `
          <div class="space-y-4 ${idx > 0 ? 'pt-5 border-t border-slate-200 dark:border-slate-800' : ''}">
            <div class="flex items-center justify-between">
              <span class="px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs">
                Question ${idx + 1}
              </span>
            </div>

            <h4 class="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug">
              ${escapeHtml(q.question)}
            </h4>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              ${renderOptionsGrid(q, idx)}
            </div>

            <div class="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-2">
              <span class="text-xs font-extrabold uppercase text-emerald-700 dark:text-emerald-300">Verified Answer:</span>
              <span class="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1">
                <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                </svg>
                <strong class="text-emerald-600 dark:text-emerald-400">${q.correctAnswer}.</strong> ${escapeHtml(q.options[q.correctAnswer])}
              </span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Render Options Grid Helper
function renderOptionsGrid(q, qIndex = activeQIndex) {
  const optionKeys = ['A', 'B', 'C', 'D'];
  return optionKeys.map(key => {
    const val = q.options[key];
    const isCorrect = key === q.correctAnswer;

    return `
      <div class="quiz-option relative flex items-center justify-between p-3.5 rounded-xl border transition-all ${
        isCorrect
          ? 'quiz-option-correct border-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/20'
          : 'border-slate-200 dark:border-slate-700/80 bg-white/70 dark:bg-slate-800/60'
      }">
        <div class="flex items-center space-x-3">
          <span class="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
            isCorrect
              ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
          }">
            ${key}
          </span>
          <span class="font-semibold text-sm ${
            isCorrect
              ? 'text-emerald-950 dark:text-emerald-200 font-bold'
              : 'text-slate-800 dark:text-slate-200'
          }">
            ${escapeHtml(val)}
          </span>
        </div>

        ${
          isCorrect
            ? `<div class="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-500 text-white font-bold text-[10px] shadow-sm">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                </svg>
                <span>Correct</span>
               </div>`
            : ''
        }
      </div>
    `;
  }).join('');
}



// Attach Step Navigation Buttons (Prev / Next)
function attachStepNavigationEvents() {
  const prevBtn = document.getElementById('prev-q-btn');
  const nextBtn = document.getElementById('next-q-btn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (activeQIndex > 0) {
        activeQIndex--;
        renderQuiz();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const quiz = store.getQuiz();
      const total = (quiz.questions || DEFAULT_QUESTIONS).length;
      if (activeQIndex < total - 1) {
        activeQIndex++;
        renderQuiz();
      }
    });
  }
}

// Countdown Timer to Next Quiz (Daily 12:00 AM Midnight)
function startCountdownTimer() {
  const timerHours = document.getElementById('timer-hours');
  const timerMinutes = document.getElementById('timer-minutes');
  const timerSeconds = document.getElementById('timer-seconds');

  if (!timerHours || !timerMinutes || !timerSeconds) return;

  let hasTriggeredAutoSync = false;

  // Absolute timestamp of the next Pakistan (Asia/Karachi) midnight, when the
  // quiz actually resets. Computed from PK wall-clock so it is correct for
  // visitors in any browser timezone.
  function getNextPkMidnight() {
    const pkNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
    const pkToday = Date.UTC(pkNow.getUTCFullYear(), pkNow.getUTCMonth(), pkNow.getUTCDate());
    return pkToday + 24 * 60 * 60 * 1000;
  }

  function update() {
    const now = new Date();
    const target = getNextPkMidnight();

    const diff = target - now;

    // Trigger auto-sync at 12:00 AM reset
    if (diff <= 2000 && !hasTriggeredAutoSync) {
      hasTriggeredAutoSync = true;
      syncLiveQuizData(true);
      setTimeout(() => { hasTriggeredAutoSync = false; }, 5000);
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    timerHours.textContent = String(hours).padStart(2, '0');
    timerMinutes.textContent = String(minutes).padStart(2, '0');
    timerSeconds.textContent = String(seconds).padStart(2, '0');
  }

  update();
  setInterval(update, 1000);
}

// Setup Main Event Listeners
function setupEventListeners() {
  // Realtime Quiz update listener
  window.addEventListener('quizUpdated', () => {
    renderQuiz();
    showToast('All 5 Quiz questions updated successfully!', 'success');
  });

  // View Mode Toggle Button
  const viewModeBtn = document.getElementById('view-mode-toggle');
  if (viewModeBtn) {
    viewModeBtn.addEventListener('click', () => {
      currentViewMode = currentViewMode === 'tab' ? 'all' : 'tab';
      renderQuiz();
      showToast(currentViewMode === 'all' ? 'Showing all 5 questions' : 'Switched to tab view', 'info');
    });
  }

  // Copy Current Question Answer Button
  const copyCurrentBtn = document.getElementById('copy-current-btn');
  if (copyCurrentBtn) {
    copyCurrentBtn.addEventListener('click', () => {
      const quiz = store.getQuiz();
      const questions = quiz.questions || DEFAULT_QUESTIONS;
      const currentQ = questions[activeQIndex] || questions[0];
      const answerText = `${currentQ.correctAnswer}. ${currentQ.options[currentQ.correctAnswer]}`;
      const textToCopy = `Today's Telenor Quiz Q${activeQIndex + 1} Answer (${quiz.formattedDate}):\nQ: ${currentQ.question}\n✅ Answer: ${answerText}\nSource: Telenor Daily Quiz Answers`;

      navigator.clipboard.writeText(textToCopy).then(() => {
        showToast(`Q${activeQIndex + 1} answer copied!`, 'success');
      }).catch(() => {
        showToast(`Answer: ${answerText}`, 'info');
      });
    });
  }

  // Copy All 5 Answers Button
  const copyAllBtn = document.getElementById('copy-all-btn');
  if (copyAllBtn) {
    copyAllBtn.addEventListener('click', () => {
      const quiz = store.getQuiz();
      const questions = quiz.questions || DEFAULT_QUESTIONS;
      let textToCopy = `Today's Telenor Daily Quiz Answers (${quiz.formattedDate}):\n\n`;

      questions.forEach((q, idx) => {
        textToCopy += `Q${idx + 1}: ${q.question}\n✅ Answer: ${q.correctAnswer}. ${q.options[q.correctAnswer]}\n\n`;
      });
      textToCopy += `Source: Telenor Daily Quiz Answers`;

      navigator.clipboard.writeText(textToCopy).then(() => {
        showToast('All 5 quiz answers copied to clipboard!', 'success');
      }).catch(() => {
        showToast('All 5 answers copied!', 'info');
      });
    });
  }

  // Share Answer Button
  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      const quiz = store.getQuiz();
      const questions = quiz.questions || DEFAULT_QUESTIONS;
      let shareText = `Today's Telenor Quiz Answers (${quiz.formattedDate}):\n`;
      questions.forEach((q, idx) => {
        shareText += `Q${idx + 1}: ${q.correctAnswer}. ${q.options[q.correctAnswer]} | `;
      });

      const shareData = {
        title: 'Today\'s Telenor 5 Quiz Answers',
        text: shareText,
        url: window.location.href
      };

      if (navigator.share) {
        navigator.share(shareData).catch(() => {});
      } else {
        navigator.clipboard.writeText(`${shareData.text}\nCheck full quiz: ${shareData.url}`).then(() => {
          showToast('All quiz answers & link copied to share!', 'success');
        }).catch(() => {
          showToast('Could not copy automatically. Long-press the text to copy.', 'info');
        });
      }
    });
  }

  // Admin Modal Triggers
  const openAdminBtn = document.getElementById('open-admin-btn');
  const closeAdminBtn = document.getElementById('close-admin-btn');
  const adminModal = document.getElementById('admin-modal');

  if (openAdminBtn && adminModal) {
    openAdminBtn.addEventListener('click', () => {
      adminModal.classList.remove('hidden');
      adminModal.classList.add('flex');
    });
  }

  if (closeAdminBtn && adminModal) {
    closeAdminBtn.addEventListener('click', () => {
      adminModal.classList.add('hidden');
      adminModal.classList.remove('flex');
    });
  }

  // Modals (Privacy, Terms, Contact)
  setupModal('privacy-link', 'privacy-modal', 'close-privacy-btn');
  setupModal('contact-link', 'contact-modal', 'close-contact-btn');
  setupModal('terms-link', 'terms-modal', 'close-terms-btn');
}

function setupModal(triggerId, modalId, closeId) {
  const trigger = document.getElementById(triggerId);
  const modal = document.getElementById(modalId);
  const closeBtn = document.getElementById(closeId);

  if (trigger && modal) {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    });
  }
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    });
  }
}

// Toast Notification System
function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  
  let bgColors = 'bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-100 border-slate-700';
  let iconSvg = `<svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;

  if (type === 'success') {
    bgColors = 'bg-emerald-950 text-emerald-100 border-emerald-500/50';
    iconSvg = `<svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`;
  } else if (type === 'warning') {
    bgColors = 'bg-amber-950 text-amber-100 border-amber-500/50';
    iconSvg = `<svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
  }

  toast.className = `toast-animate pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border ${bgColors} text-sm font-medium w-full`;
  toast.innerHTML = `
    <div class="flex-shrink-0">${iconSvg}</div>
    <div class="flex-grow">${escapeHtml(message)}</div>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// Utility HTML escape
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
