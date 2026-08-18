/**
 * Telenor Daily Quiz Answers - Admin Panel Logic (5 Questions Support)
 */

document.addEventListener('DOMContentLoaded', () => {
  setupAdminPanel();

  // ── Reveal Admin Button for this session only (hidden from casual visitors) ──
  // Method 1: secret URL param  →  index.html?admin=true
  // Method 2: click the site title 3 times quickly
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('admin') === 'true') {
    const adminBtn = document.getElementById('open-admin-btn');
    if (adminBtn) adminBtn.classList.remove('hidden');
  }

  let titleClickCount = 0;
  let titleClickTimer = null;
  const siteTitle = document.getElementById('site-title');
  if (siteTitle) {
    siteTitle.addEventListener('click', () => {
      titleClickCount++;
      if (titleClickCount === 1) {
        titleClickTimer = setTimeout(() => { titleClickCount = 0; }, 3000);
      }
      if (titleClickCount >= 3) {
        clearTimeout(titleClickTimer);
        titleClickCount = 0;
        const adminBtnEl = document.getElementById('open-admin-btn');
        if (adminBtnEl) adminBtnEl.classList.remove('hidden');
        if (typeof showToast === 'function') {
          showToast('Admin button revealed — click it in the header to open the editor.', 'success');
        }
      }
    });
  }
});

let adminQuestionsCopy = [];
let adminActiveQIndex = 0;

// Preset Sets for 5 Questions
const PRESET_SETS = {
  set1: [
    { id: 1, question: 'Which planet is known as the Red Planet?', options: { A: 'Earth', B: 'Mars', C: 'Venus', D: 'Jupiter' }, correctAnswer: 'B', reward: '20 MBs' },
    { id: 2, question: 'What is the capital city of Pakistan?', options: { A: 'Karachi', B: 'Lahore', C: 'Islamabad', D: 'Peshawar' }, correctAnswer: 'C', reward: '20 MBs' },
    { id: 3, question: 'Which is the largest ocean on Earth?', options: { A: 'Atlantic Ocean', B: 'Indian Ocean', C: 'Pacific Ocean', D: 'Arctic Ocean' }, correctAnswer: 'C', reward: '20 MBs' },
    { id: 4, question: 'How many days are there in a leap year?', options: { A: '365', B: '366', C: '364', D: '360' }, correctAnswer: 'B', reward: '20 MBs' },
    { id: 5, question: 'Which gas do plants absorb from the atmosphere?', options: { A: 'Oxygen', B: 'Carbon Dioxide', C: 'Nitrogen', D: 'Hydrogen' }, correctAnswer: 'B', reward: '20 MBs' }
  ],
  set2: [
    { id: 1, question: 'What element has the chemical symbol "O"?', options: { A: 'Gold', B: 'Oxygen', C: 'Osmium', D: 'Silver' }, correctAnswer: 'B', reward: '20 MBs' },
    { id: 2, question: 'How many continents are there on Earth?', options: { A: '5', B: '6', C: '7', D: '8' }, correctAnswer: 'C', reward: '20 MBs' },
    { id: 3, question: 'What is the fastest land animal?', options: { A: 'Lion', B: 'Cheetah', C: 'Leopard', D: 'Horse' }, correctAnswer: 'B', reward: '20 MBs' },
    { id: 4, question: 'Which device is used to measure temperature?', options: { A: 'Barometer', B: 'Thermometer', C: 'Speedometer', D: 'Altimeter' }, correctAnswer: 'B', reward: '20 MBs' },
    { id: 5, question: 'What is the hardest natural substance on Earth?', options: { A: 'Gold', B: 'Iron', C: 'Diamond', D: 'Quartz' }, correctAnswer: 'C', reward: '20 MBs' }
  ],
  set3: [
    { id: 1, question: 'What is the national language of Pakistan?', options: { A: 'Punjabi', B: 'Urdu', C: 'Sindhi', D: 'Pashto' }, correctAnswer: 'B', reward: '20 MBs' },
    { id: 2, question: 'Which is the longest river in Pakistan?', options: { A: 'Jhelum', B: 'Chenab', C: 'Indus River', D: 'Ravi' }, correctAnswer: 'C', reward: '20 MBs' },
    { id: 3, question: 'Who is the national poet of Pakistan?', options: { A: 'Faiz Ahmed Faiz', B: 'Allama Iqbal', C: 'Mir Taqi Mir', D: 'Ghalib' }, correctAnswer: 'B', reward: '20 MBs' },
    { id: 4, question: 'Which year did Pakistan gain Independence?', options: { A: '1945', B: '1947', C: '1950', D: '1948' }, correctAnswer: 'B', reward: '20 MBs' },
    { id: 5, question: 'What is the highest mountain peak in Pakistan?', options: { A: 'Nanga Parbat', B: 'K2', C: 'Broad Peak', D: 'Rakaposhi' }, correctAnswer: 'B', reward: '20 MBs' }
  ]
};

function setupAdminPanel() {
  const adminLoginStep = document.getElementById('admin-login-step');
  const adminFormStep = document.getElementById('admin-form-step');
  const adminAuthForm = document.getElementById('admin-auth-form');
  const adminPassInput = document.getElementById('admin-password-input');
  const adminAuthError = document.getElementById('admin-auth-error');

  const editQuestion = document.getElementById('edit-question');
  const editOptionA = document.getElementById('edit-option-a');
  const editOptionB = document.getElementById('edit-option-b');
  const editOptionC = document.getElementById('edit-option-c');
  const editOptionD = document.getElementById('edit-option-d');
  const editCategory = document.getElementById('edit-category');
  const adminSaveBtn = document.getElementById('admin-save-btn');
  const adminResetBtn = document.getElementById('admin-reset-btn');

  const preset1Btn = document.getElementById('preset-1');
  const preset2Btn = document.getElementById('preset-2');
  const preset3Btn = document.getElementById('preset-3');
  const importJsonBtn = document.getElementById('admin-import-json-btn');
  const jsonFileInput = document.getElementById('admin-json-file-input');

  // These were referenced below but never declared, causing a ReferenceError that
  // aborted setupAdminPanel() (and the admin reveal logic). Declaring them fixes it.
  const autoSyncBtn = document.getElementById('admin-auto-sync-btn');
  const fetchUrlBtn = document.getElementById('admin-fetch-url-btn');
  const sourceUrlInput = document.getElementById('admin-source-url-input');

  // Handle Login Authentication
  if (adminAuthForm) {
    adminAuthForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const enteredPass = adminPassInput ? adminPassInput.value.trim() : '';
      const currentPass = store.getAdminPassword();

      if (enteredPass === currentPass) {
        adminLoginStep.classList.add('hidden');
        adminFormStep.classList.remove('hidden');
        if (adminAuthError) adminAuthError.classList.add('hidden');
        
        // Load current 5 questions into draft copy
        const currentQuiz = store.getQuiz();
        adminQuestionsCopy = JSON.parse(JSON.stringify(currentQuiz.questions || DEFAULT_QUESTIONS));
        adminActiveQIndex = 0;
        
        renderAdminQTabs();
        populateAdminForm(adminActiveQIndex);
        showToast('Admin authenticated successfully!', 'success');
      } else {
        if (adminAuthError) {
          adminAuthError.textContent = 'Incorrect password! (Default is Mine1212)';
          adminAuthError.classList.remove('hidden');
        }
        showToast('Invalid admin password', 'warning');
      }
    });
  }

  // Render Admin Question Selection Tabs (Q1 to Q5)
  function renderAdminQTabs() {
    const adminQTabsContainer = document.getElementById('admin-q-tabs');
    if (!adminQTabsContainer) return;

    let html = '';
    for (let i = 0; i < 5; i++) {
      const isActive = i === adminActiveQIndex;
      html += `
        <button type="button" data-qidx="${i}" class="admin-q-tab-btn py-2 rounded-xl text-xs font-bold transition-all border ${
          isActive
            ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/30'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
        }">
          Q${i + 1}
        </button>
      `;
    }
    adminQTabsContainer.innerHTML = html;

    const tabBtns = adminQTabsContainer.querySelectorAll('.admin-q-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetIdx = parseInt(btn.getAttribute('data-qidx'), 10);
        if (targetIdx !== adminActiveQIndex) {
          stashCurrentAdminForm();
          adminActiveQIndex = targetIdx;
          renderAdminQTabs();
          populateAdminForm(adminActiveQIndex);
        }
      });
    });
  }

  // Stash input fields into in-memory array for active question index
  function stashCurrentAdminForm() {
    if (!adminQuestionsCopy[adminActiveQIndex]) return;

    const qText = editQuestion ? editQuestion.value.trim() : '';
    const optA = editOptionA ? editOptionA.value.trim() : '';
    const optB = editOptionB ? editOptionB.value.trim() : '';
    const optC = editOptionC ? editOptionC.value.trim() : '';
    const optD = editOptionD ? editOptionD.value.trim() : '';
    const checkedRadio = document.querySelector('input[name="correct-answer-radio"]:checked');
    const correctAnswer = checkedRadio ? checkedRadio.value : adminQuestionsCopy[adminActiveQIndex].correctAnswer;

    adminQuestionsCopy[adminActiveQIndex] = {
      ...adminQuestionsCopy[adminActiveQIndex],
      id: adminActiveQIndex + 1,
      questionNumber: adminActiveQIndex + 1,
      question: qText || `Question ${adminActiveQIndex + 1}`,
      options: {
        A: optA || 'Option A',
        B: optB || 'Option B',
        C: optC || 'Option C',
        D: optD || 'Option D'
      },
      correctAnswer
    };
  }

  // Populate input fields for question index
  function populateAdminForm(qIndex) {
    const q = adminQuestionsCopy[qIndex] || DEFAULT_QUESTIONS[qIndex];

    const labelEl = document.getElementById('admin-question-label');
    if (labelEl) labelEl.textContent = `Question ${qIndex + 1} Text`;

    if (editQuestion) editQuestion.value = q.question || '';
    if (editOptionA) editOptionA.value = q.options.A || '';
    if (editOptionB) editOptionB.value = q.options.B || '';
    if (editOptionC) editOptionC.value = q.options.C || '';
    if (editOptionD) editOptionD.value = q.options.D || '';

    const radioBtn = document.querySelector(`input[name="correct-answer-radio"][value="${q.correctAnswer}"]`);
    if (radioBtn) radioBtn.checked = true;
  }

  // Handle Preset Generator Buttons
  if (preset1Btn) {
    preset1Btn.addEventListener('click', () => {
      adminQuestionsCopy = JSON.parse(JSON.stringify(PRESET_SETS.set1));
      populateAdminForm(adminActiveQIndex);
      showToast('Set 1 loaded into form!', 'info');
    });
  }

  if (preset2Btn) {
    preset2Btn.addEventListener('click', () => {
      adminQuestionsCopy = JSON.parse(JSON.stringify(PRESET_SETS.set2));
      populateAdminForm(adminActiveQIndex);
      showToast('Set 2 loaded into form!', 'info');
    });
  }

  if (preset3Btn) {
    preset3Btn.addEventListener('click', () => {
      adminQuestionsCopy = JSON.parse(JSON.stringify(PRESET_SETS.set3));
      populateAdminForm(adminActiveQIndex);
      showToast('Set 3 loaded into form!', 'info');
    });
  }

  if (autoSyncBtn) {
    autoSyncBtn.addEventListener('click', async () => {
      showToast('Triggering auto-scraper refresh...', 'info');
      try {
        const response = await fetch('http://localhost:3000/api/trigger-scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (result.ok && result.payload) {
          store.saveQuiz(result.payload); // dispatches 'quizUpdated' → app.js re-renders
          showToast('Auto-scraper refreshed quiz data successfully.', 'success');
        } else {
          showToast(result.message || 'Auto-scraper could not run.', 'warning');
        }
      } catch (err) {
        showToast('Scraper server is not running. Start it with npm run serve.', 'warning');
      }
    });
  }

  if (fetchUrlBtn && sourceUrlInput) {
    fetchUrlBtn.addEventListener('click', async () => {
      const sourceUrl = sourceUrlInput.value.trim();
      if (!sourceUrl) {
        showToast('Please paste a source URL first.', 'warning');
        return;
      }

      showToast('Fetching live quiz page from source URL...', 'info');
      try {
        const response = await fetch('http://localhost:3000/api/fetch-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: sourceUrl })
        });
        const result = await response.json();
        if (!result.ok || !result.payload) {
          throw new Error(result.message || 'Fetch failed.');
        }

        const currentQuiz = store.getQuiz();
        const importedQuiz = {
          ...currentQuiz,
          ...result.payload,
          updatedTimestamp: Date.now(),
          lastUpdated: `Today at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
        };

        store.saveQuiz(importedQuiz);
        showToast('Fetched quiz data has replaced the current live quiz.', 'success');
        sourceUrlInput.value = '';
      } catch (err) {
        showToast('Could not fetch quiz from the supplied URL. Try a different public page.', 'warning');
      }
    });
  }

  if (importJsonBtn && jsonFileInput) {
    importJsonBtn.addEventListener('click', async () => {
      const file = jsonFileInput.files && jsonFileInput.files[0];
      if (!file) {
        showToast('Please choose a JSON file first.', 'warning');
        return;
      }

      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        const questions = payload.questions || payload.quiz?.questions;

        if (!Array.isArray(questions) || questions.length !== 5) {
          showToast('Selected JSON must contain exactly 5 questions.', 'warning');
          return;
        }

        const validatedQuestions = questions.map((q, idx) => ({
          id: idx + 1,
          questionNumber: idx + 1,
          question: q.question,
          options: {
            A: q.options?.A || '',
            B: q.options?.B || '',
            C: q.options?.C || '',
            D: q.options?.D || ''
          },
          correctAnswer: q.correctAnswer,
          reward: q.reward || '20 MBs'
        }));

        const currentQuiz = store.getQuiz();
        const importedQuiz = {
          ...currentQuiz,
          id: payload.id || 'quiz-latest',
          date: payload.date || new Date().toISOString().split('T')[0],
          formattedDate: payload.formattedDate || getFormattedCurrentDate(),
          category: payload.category || currentQuiz.category,
          lastUpdated: `Today at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
          updatedTimestamp: Date.now(),
          questions: validatedQuestions
        };

        store.saveQuiz(importedQuiz);
        showToast('Imported quiz JSON has replaced the current live quiz.', 'success');
        jsonFileInput.value = '';
      } catch (err) {
        showToast('Could not import the JSON file. Check its structure.', 'warning');
      }
    });
  }

  // Handle Save All 5 Questions Button
  if (adminSaveBtn) {
    adminSaveBtn.addEventListener('click', (e) => {
      e.preventDefault();

      // Stash current active tab values first
      stashCurrentAdminForm();

      // Validate all 5 questions
      for (let i = 0; i < 5; i++) {
        const q = adminQuestionsCopy[i];
        if (!q || !q.question || !q.options.A || !q.options.B || !q.options.C || !q.options.D) {
          showToast(`Please fill out all fields for Question ${i + 1}.`, 'warning');
          adminActiveQIndex = i;
          renderAdminQTabs();
          populateAdminForm(i);
          return;
        }
      }

      const category = editCategory ? editCategory.value.trim() : 'MyTelenor App - Play & Win';
      const currentQuiz = store.getQuiz();

      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const lastUpdatedText = `Today at ${timeStr}`;

      const updatedQuiz = {
        ...currentQuiz,
        category,
        lastUpdated: lastUpdatedText,
        updatedTimestamp: Date.now(),
        questions: adminQuestionsCopy
      };

      store.saveQuiz(updatedQuiz);

      // Close modal
      const adminModal = document.getElementById('admin-modal');
      if (adminModal) {
        adminModal.classList.add('hidden');
        adminModal.classList.remove('flex');
      }

      showToast('All 5 Telenor Quiz questions updated live!', 'success');
    });
  }

  // Handle Reset Defaults
  if (adminResetBtn) {
    adminResetBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all 5 questions to defaults?')) {
        store.saveQuiz(DEFAULT_QUIZ);
        adminQuestionsCopy = JSON.parse(JSON.stringify(DEFAULT_QUESTIONS));
        adminActiveQIndex = 0;
        renderAdminQTabs();
        populateAdminForm(0);
        showToast('Reset all 5 questions to defaults', 'info');
      }
    });
  }
}
