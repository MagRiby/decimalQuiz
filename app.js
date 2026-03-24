// === VERSION CHECK — must be OUTSIDE the IIFE, runs first ===
const APP_VERSION = '1.3.0';
(function checkVersion() {
  const stored = localStorage.getItem('bp_quiz_version');
  if (stored && stored !== APP_VERSION) {
    localStorage.setItem('bp_quiz_version', APP_VERSION);
    location.reload(true);
    return;
  }
  localStorage.setItem('bp_quiz_version', APP_VERSION);
})();

(() => {
  // Config — set from start screen
  let TOTAL_QUESTIONS = 40;
  let TIME_PER_QUESTION = 20;
  let GLOBAL_TIME = 600;

  // === SCORE HISTORY (localStorage) ===
  const HISTORY_KEY = 'bp_quiz_history';
  const MAX_HISTORY = 50;

  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch { return []; }
  }

  function saveSession(data) {
    const history = loadHistory();
    history.unshift(data);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
  }

  function renderHistory() {
    const panel = document.getElementById('history-panel');
    if (!panel) return;
    const list = document.getElementById('history-list');
    if (!list) return;
    const history = loadHistory();
    if (history.length === 0) {
      list.innerHTML = '<li class="history-empty">Aucun historique</li>';
      return;
    }
    list.innerHTML = history.map(h => {
      const d = new Date(h.date);
      const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const pct = h.answered > 0 ? Math.round((h.score / h.answered) * 100) : 0;
      const weak = h.weakest ? `<span class="h-weak">⚠️ ${h.weakest} (${h.weakestCount}×)</span>` : '';
      return `<li>
        <span class="h-date">${dateStr} ${timeStr}</span>
        <span class="h-score">${h.score}/${h.answered} (${pct}%)</span>
        <span class="h-streak">🔥${h.streak}</span>
        <span class="h-mode">${h.questions}Q · ${h.timePerQ > 0 ? h.timePerQ + 's' : '∞'}</span>
        ${weak}
      </li>`;
    }).join('');
  }

  // === AUDIO ENGINE ===
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  function playNote(freq, type, start, dur, vol, vibrato) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (vibrato) {
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      lfo.frequency.value = vibrato.rate || 6;
      lfoGain.gain.value = vibrato.depth || 8;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(start);
      lfo.stop(start + dur);
    }
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.start(start);
    osc.stop(start + dur);
  }

  function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;
    if (type === 'correct') {
      const notes = [784, 988, 1175, 1319, 1568, 1976];
      notes.forEach((f, i) => {
        playNote(f, 'sine', t + i * 0.07, 0.35, 0.13);
        playNote(f * 2, 'sine', t + i * 0.07, 0.2, 0.04);
      });
      playNote(2637, 'sine', t + 0.3, 0.4, 0.06, { rate: 12, depth: 15 });
      playNote(3520, 'sine', t + 0.4, 0.3, 0.04, { rate: 14, depth: 10 });
      playNote(4186, 'sine', t + 0.5, 0.25, 0.03);
      playNote(392, 'triangle', t, 0.8, 0.06);
      playNote(494, 'triangle', t, 0.8, 0.04);
    } else if (type === 'wrong') {
      playNote(523, 'sawtooth', t, 0.15, 0.07);
      playNote(466, 'sawtooth', t + 0.15, 0.15, 0.07);
      playNote(349, 'sawtooth', t + 0.3, 0.25, 0.08);
      playNote(262, 'sawtooth', t + 0.5, 0.4, 0.09);
      playNote(262, 'triangle', t + 0.5, 0.5, 0.06, { rate: 4, depth: 20 });
      playNote(80, 'sine', t + 0.55, 0.3, 0.1);
    } else if (type === 'timeout') {
      for (let i = 0; i < 5; i++) playNote(1200, 'square', t + i * 0.08, 0.04, 0.05);
      playNote(130, 'sine', t + 0.45, 1.0, 0.12, { rate: 2, depth: 5 });
      playNote(196, 'triangle', t + 0.45, 0.8, 0.06);
    }
  }

  // === BACKGROUND MUSIC ===
  let bgMusic = null;
  let bgMusicGain = null;

  function startBgMusic() {
    if (bgMusic) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    bgMusicGain = audioCtx.createGain();
    bgMusicGain.gain.value = 0.04;
    bgMusicGain.connect(audioCtx.destination);
    const melody = [523, 587, 659, 784, 880, 784, 659, 587];
    const noteDur = 0.35;
    let noteIndex = 0;
    function scheduleNote() {
      if (!bgMusic) return;
      const osc = audioCtx.createOscillator();
      const noteGain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = melody[noteIndex % melody.length];
      osc.connect(noteGain);
      noteGain.connect(bgMusicGain);
      noteGain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      noteGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + noteDur);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + noteDur);
      noteIndex++;
      bgMusic = setTimeout(scheduleNote, noteDur * 1000);
    }
    bgMusic = setTimeout(scheduleNote, 100);
  }

  function stopBgMusic() {
    if (bgMusic) { clearTimeout(bgMusic); bgMusic = null; }
  }

  // === STATE ===
  let questions = [];
  let currentIndex = 0;
  let score = 0;
  let timer = null;
  let timeLeft = 0;
  let retryItems = [];
  let retryIdCounter = 0;
  let isRetryRound = false;
  let globalTimer = null;
  let globalTimeLeft = 0;
  let currentStreak = 0;
  let bestStreak = 0;
  let quizActive = false;
  let mistakes = {}; // { "m→dm": 3, "cm→mm": 1, ... }

  // DOM
  const startScreen = document.getElementById('start-screen');
  const quizScreen = document.getElementById('quiz-screen');
  const endScreen = document.getElementById('end-screen');
  const btnStart = document.getElementById('btn-start');
  const btnValidate = document.getElementById('btn-validate');
  const btnRestart = document.getElementById('btn-restart');
  const questionText = document.getElementById('question-text');
  const answerInput = document.getElementById('answer-input');
  const answerUnit = document.getElementById('answer-unit');
  const scoreDisplay = document.getElementById('score');
  const qNum = document.getElementById('q-num');
  const qTotal = document.getElementById('q-total');
  const timerDisplay = document.getElementById('timer');
  const timerBarFill = document.getElementById('timer-bar-fill');
  const celebration = document.getElementById('celebration');
  const retryList = document.getElementById('retry-list');
  const globalTimerDisplay = document.getElementById('global-timer');

  function showScreen(screen) {
    [startScreen, quizScreen, endScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
  }

  function generateQuestions() {
    const qs = [];
    const conversions = [
      { from: 'm', to: 'dm', factor: 10 },
      { from: 'm', to: 'cm', factor: 100 },
      { from: 'm', to: 'mm', factor: 1000 },
      { from: 'dm', to: 'cm', factor: 10 },
      { from: 'dm', to: 'mm', factor: 100 },
      { from: 'cm', to: 'mm', factor: 10 },
    ];
    for (let i = 0; i < TOTAL_QUESTIONS; i++) {
      const conv = conversions[Math.floor(Math.random() * conversions.length)];
      const reverse = Math.random() < 0.5;
      if (!reverse) {
        const val = randomInt(1, 30);
        qs.push({ text: `Combien font ${val} ${conv.from} en ${conv.to} ?`, answer: val * conv.factor, unit: conv.to, convType: `${conv.from}→${conv.to}` });
      } else {
        const val = randomInt(1, 30) * conv.factor;
        qs.push({ text: `Combien font ${val} ${conv.to} en ${conv.from} ?`, answer: val / conv.factor, unit: conv.from, convType: `${conv.to}→${conv.from}` });
      }
    }
    for (let i = qs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [qs[i], qs[j]] = [qs[j], qs[i]];
    }
    return qs;
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Global timer
  function startGlobalTimer() {
    clearInterval(globalTimer);
    if (GLOBAL_TIME === 0) { globalTimerDisplay.textContent = ''; return; }
    globalTimeLeft = GLOBAL_TIME;
    updateGlobalTimerDisplay();
    globalTimer = setInterval(() => {
      globalTimeLeft--;
      updateGlobalTimerDisplay();
      if (globalTimeLeft <= 0) {
        clearInterval(globalTimer);
        clearInterval(timer);
        playSound('timeout');
        endQuiz();
      }
    }, 1000);
  }

  function updateGlobalTimerDisplay() {
    const m = Math.floor(globalTimeLeft / 60);
    const s = globalTimeLeft % 60;
    globalTimerDisplay.textContent = `🕐 ${m}:${s.toString().padStart(2, '0')}`;
    globalTimerDisplay.classList.toggle('warning', globalTimeLeft <= 60 && globalTimeLeft > 0);
  }

  // Save current session
  function saveCurrentSession() {
    if (!quizActive) return;
    const answered = Math.min(currentIndex, TOTAL_QUESTIONS);
    if (answered === 0) return;
    // Find the conversion type with most mistakes
    let worstConv = '';
    let worstCount = 0;
    for (const [conv, count] of Object.entries(mistakes)) {
      if (count > worstCount) { worstCount = count; worstConv = conv; }
    }
    saveSession({
      date: new Date().toISOString(),
      score,
      answered,
      questions: TOTAL_QUESTIONS,
      timePerQ: TIME_PER_QUESTION,
      globalTime: GLOBAL_TIME,
      streak: bestStreak,
      weakest: worstConv,
      weakestCount: worstCount
    });
    quizActive = false;
  }

  // Start
  function startQuiz() {
    TOTAL_QUESTIONS = parseInt(document.getElementById('cfg-questions').value);
    TIME_PER_QUESTION = parseInt(document.getElementById('cfg-time-per-q').value);
    GLOBAL_TIME = parseInt(document.getElementById('cfg-global-time').value) * 60;

    questions = generateQuestions();
    currentIndex = 0;
    score = 0;
    currentStreak = 0;
    bestStreak = 0;
    mistakes = {};
    retryItems = [];
    retryIdCounter = 0;
    isRetryRound = false;
    quizActive = true;
    retryList.innerHTML = '';
    scoreDisplay.textContent = '0';
    qTotal.textContent = TOTAL_QUESTIONS;
    showScreen(quizScreen);
    stopBgMusic();
    startGlobalTimer();
    timerDisplay.style.display = TIME_PER_QUESTION === 0 ? 'none' : '';
    document.querySelector('.timer-bar').style.display = TIME_PER_QUESTION === 0 ? 'none' : '';
    showQuestion();
  }

  function showQuestion() {
    celebration.classList.add('hidden');
    answerInput.value = '';
    answerInput.focus();
    let q;
    if (!isRetryRound) {
      q = questions[currentIndex];
      qNum.textContent = currentIndex + 1;
    } else {
      q = retryItems[0];
      qNum.textContent = '🔄';
    }
    questionText.textContent = q.text;
    answerUnit.textContent = q.unit;
    if (TIME_PER_QUESTION > 0) startTimer();
    else { clearInterval(timer); timerDisplay.textContent = ''; }
  }

  function startTimer() {
    clearInterval(timer);
    timeLeft = TIME_PER_QUESTION;
    timerBarFill.style.transition = 'none';
    timerBarFill.style.width = '100%';
    void timerBarFill.offsetWidth;
    timerBarFill.style.transition = `width ${TIME_PER_QUESTION}s linear`;
    timerBarFill.style.width = '0%';
    updateTimerDisplay();
    timer = setInterval(() => {
      timeLeft--;
      updateTimerDisplay();
      if (timeLeft <= 0) { clearInterval(timer); handleTimeout(); }
    }, 1000);
  }

  function updateTimerDisplay() {
    timerDisplay.textContent = `⏱ ${timeLeft}s`;
    timerDisplay.style.color = timeLeft <= 5 ? '#ff4444' : '';
  }

  function handleTimeout() {
    playSound('timeout');
    currentStreak = 0;
    if (!isRetryRound) {
      const q = questions[currentIndex];
      mistakes[q.convType] = (mistakes[q.convType] || 0) + 1;
      addToRetry(q.text, q.answer, q.unit);
    }
    shakeCard();
    setTimeout(nextQuestion, 800);
  }

  function validateAnswer() {
    clearInterval(timer);
    const userAnswer = parseFloat(answerInput.value);
    let q = !isRetryRound ? questions[currentIndex] : retryItems[0];
    if (isNaN(userAnswer)) { if (TIME_PER_QUESTION > 0) startTimer(); return; }

    if (userAnswer === q.answer) {
      score++;
      currentStreak++;
      if (currentStreak > bestStreak) bestStreak = currentStreak;
      scoreDisplay.textContent = score;
      playSound('correct');
      celebrate();
      if (isRetryRound) { removeFromRetry(retryItems[0].id); retryItems.shift(); }
      setTimeout(nextQuestion, 3500);
    } else {
      currentStreak = 0;
      mistakes[q.convType] = (mistakes[q.convType] || 0) + 1;
      playSound('wrong');
      shakeCard();
      if (!isRetryRound) addToRetry(q.text, q.answer, q.unit);
      setTimeout(nextQuestion, 800);
    }
  }

  function nextQuestion() {
    if (!isRetryRound) {
      currentIndex++;
      if (currentIndex >= TOTAL_QUESTIONS) {
        if (retryItems.length > 0) { isRetryRound = true; qTotal.textContent = '🔄'; showQuestion(); }
        else endQuiz();
        return;
      }
      showQuestion();
    } else {
      if (retryItems.length > 0) showQuestion();
      else endQuiz();
    }
  }

  function addToRetry(text, answer, unit) {
    const id = retryIdCounter++;
    retryItems.push({ text, answer, unit, id });
    const li = document.createElement('li');
    li.id = `retry-${id}`;
    li.textContent = text;
    retryList.appendChild(li);
  }

  function removeFromRetry(id) {
    const li = document.getElementById(`retry-${id}`);
    if (li) { li.classList.add('correct'); setTimeout(() => li.remove(), 500); }
  }

  const CELEBRATION_GIFS = [
    'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExM2YwODZxZnNmOWpkZTJ1OHMzdjB5OG0xazJ3bnNvYTE4MnF2YWI3NiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/QX81mZCxbGlqFtxqYn/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3Z3U2OWU2emc0ZTY2YnJ4ODZnMTJsMjJ3MGlha2UxaXEyNnZqaGEzeSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/FWAcpJsFT9mvrv0e7a/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3Z3U2OWU2emc0ZTY2YnJ4ODZnMTJsMjJ3MGlha2UxaXEyNnZqaGEzeSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Xw6yFn7frR3Y4/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3Z3U2OWU2emc0ZTY2YnJ4ODZnMTJsMjJ3MGlha2UxaXEyNnZqaGEzeSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/17jVBLoVp76WR1Phwh/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3bzQzaTB1azZraTRrdjk2bnE2bXc4NDhocm1zMTgzaDA5Y2lldnFwaCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/OvpA7YvA9INE7bgGOy/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3Nmh3bmxkcXgwcmt0MW95d3Fka2NnOHR4ZmtpcjBhM3Vqd29mbzZ6ZSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/T70hpBP1L0N7U0jtkq/giphy.gif'
  ];

  const KOREAN_CHEERS = [
    '잘했어! (Bien joué !)',
    '대박! (Génial !)',
    '화이팅! (Courage !)',
    '최고! (Tu es le/la meilleur(e) !)'
  ];

  function celebrate() {
    const cheer = KOREAN_CHEERS[Math.floor(Math.random() * KOREAN_CHEERS.length)];
    document.querySelector('.celebration-text').textContent = `🎉 ${cheer} 🎉`;
    celebration.classList.remove('hidden', 'fading');
    celebration.style.animation = 'none';
    void celebration.offsetWidth;
    celebration.style.animation = '';
    document.getElementById('celebration-gif').src = CELEBRATION_GIFS[Math.floor(Math.random() * CELEBRATION_GIFS.length)];
    spawnConfetti();
    setTimeout(() => { celebration.classList.add('fading'); }, 2500);
  }

  function shakeCard() {
    const card = document.querySelector('.question-card');
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 500);
  }

  function spawnConfetti() {
    let canvas = document.getElementById('confetti');
    if (!canvas) { canvas = document.createElement('canvas'); canvas.id = 'confetti'; document.body.appendChild(canvas); }
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const pieces = [], colors = ['#ff006e', '#ff69b4', '#ffd700', '#fff', '#c9004e'];
    for (let i = 0; i < 40; i++) {
      pieces.push({ x: Math.random() * canvas.width, y: -10, w: Math.random() * 8 + 4, h: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)], vy: Math.random() * 4 + 2, vx: (Math.random() - 0.5) * 4, rot: Math.random() * 360 });
    }
    let frames = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.y += p.vy; p.x += p.vx; p.rot += 3;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (++frames < 60) requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    draw();
  }

  function endQuiz() {
    clearInterval(timer);
    clearInterval(globalTimer);
    stopBgMusic();
    saveCurrentSession();
    showScreen(endScreen);
    const answered = Math.min(currentIndex, TOTAL_QUESTIONS);
    const pct = answered > 0 ? Math.round((score / answered) * 100) : 0;
    let msg;
    if (pct === 100) msg = '🏆 Parfait ! Tu es une vraie BLINK ! 🏆';
    else if (pct >= 70) msg = '💗 Super travail ! Continue comme ça !';
    else if (pct >= 40) msg = '✨ Pas mal ! Encore un peu d\'entraînement !';
    else msg = '💪 Courage ! Tu vas y arriver !';
    document.getElementById('end-message').textContent = msg;
    document.getElementById('end-score').textContent = `Score : ${score} / ${answered} (${pct}%) · 🔥 Meilleure série : ${bestStreak}`;
    if (pct >= 70) spawnConfetti();
  }

  // Events
  btnStart.addEventListener('click', startQuiz);
  btnRestart.addEventListener('click', () => { stopBgMusic(); showScreen(startScreen); startBgMusic(); });
  btnValidate.addEventListener('click', validateAnswer);
  answerInput.addEventListener('keydown', e => { if (e.key === 'Enter') validateAnswer(); });

  // Save on page unload (user closes tab / navigates away)
  window.addEventListener('beforeunload', saveCurrentSession);

  // Start music on first interaction
  document.addEventListener('click', function initMusic() { startBgMusic(); }, { once: true });

  answerInput.setAttribute('readonly', true);
  document.getElementById('numpad').addEventListener('click', e => {
    const btn = e.target.closest('.numpad-btn');
    if (!btn) return;
    const val = btn.dataset.val;
    if (val === 'del') answerInput.value = answerInput.value.slice(0, -1);
    else if (val === '.') { if (!answerInput.value.includes('.')) answerInput.value += '.'; }
    else answerInput.value += val;
  });

  // Init history panel (desktop only)
  if (!isMobileDevice() && window.innerWidth >= 900) {
    document.getElementById('history-panel').style.display = 'flex';
    renderHistory();
  }
})();
