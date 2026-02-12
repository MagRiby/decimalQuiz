(() => {
  // Config
  const TOTAL_QUESTIONS = 40;
  const TIME_PER_QUESTION = 20; // seconds

  // State
  let questions = [];
  let currentIndex = 0;
  let score = 0;
  let timer = null;
  let timeLeft = 0;
  let retryItems = []; // { question, correctAnswer, unit, id }
  let retryIdCounter = 0;
  let isRetryRound = false;

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
  const robot = document.getElementById('robot');
  const robotMouth = document.getElementById('robot-mouth');
  const robotLabel = document.getElementById('robot-label');

  // Robot helper
  function setRobot(state, label, mouth) {
    robot.className = 'robot ' + state;
    robotLabel.textContent = label;
    if (mouth) robotMouth.textContent = mouth;
    else if (state === 'happy') robotMouth.textContent = '◡';
    else if (state === 'sad') robotMouth.textContent = '︵';
    else robotMouth.textContent = '‿';
  }

  // Generate questions — m, dm, cm, mm conversions
  function generateQuestions() {
    const qs = [];
    // Conversion pairs: [fromUnit, toUnit, factor] where fromValue * factor = toValue
    const conversions = [
      { from: 'm',  to: 'dm', factor: 10 },
      { from: 'm',  to: 'cm', factor: 100 },
      { from: 'm',  to: 'mm', factor: 1000 },
      { from: 'dm', to: 'cm', factor: 10 },
      { from: 'dm', to: 'mm', factor: 100 },
      { from: 'cm', to: 'mm', factor: 10 },
    ];

    for (let i = 0; i < TOTAL_QUESTIONS; i++) {
      const conv = conversions[Math.floor(Math.random() * conversions.length)];
      const reverse = Math.random() < 0.5;

      if (!reverse) {
        // bigger → smaller (multiply)
        const val = randomInt(1, 30);
        qs.push({
          text: `Combien font ${val} ${conv.from} en ${conv.to} ?`,
          answer: val * conv.factor,
          unit: conv.to
        });
      } else {
        // smaller → bigger (divide) — pick a value that divides cleanly
        const val = randomInt(1, 30) * conv.factor;
        qs.push({
          text: `Combien font ${val} ${conv.to} en ${conv.from} ?`,
          answer: val / conv.factor,
          unit: conv.from
        });
      }
    }
    // Shuffle
    for (let i = qs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [qs[i], qs[j]] = [qs[j], qs[i]];
    }
    return qs;
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Screens
  function showScreen(screen) {
    [startScreen, quizScreen, endScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
  }

  // Start
  function startQuiz() {
    questions = generateQuestions();
    currentIndex = 0;
    score = 0;
    retryItems = [];
    retryIdCounter = 0;
    isRetryRound = false;
    retryList.innerHTML = '';
    scoreDisplay.textContent = '0';
    qTotal.textContent = TOTAL_QUESTIONS;
    showScreen(quizScreen);
    showQuestion();
  }

  // Show question
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
    setRobot('thinking', 'Hmm... 🤔', '○');
    startTimer();
  }

  // Timer
  function startTimer() {
    clearInterval(timer);
    timeLeft = TIME_PER_QUESTION;
    timerBarFill.style.transition = 'none';
    timerBarFill.style.width = '100%';
    // Force reflow
    void timerBarFill.offsetWidth;
    timerBarFill.style.transition = `width ${TIME_PER_QUESTION}s linear`;
    timerBarFill.style.width = '0%';

    updateTimerDisplay();
    timer = setInterval(() => {
      timeLeft--;
      updateTimerDisplay();
      if (timeLeft <= 0) {
        clearInterval(timer);
        handleTimeout();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    timerDisplay.textContent = `⏱ ${timeLeft}s`;
    timerDisplay.style.color = timeLeft <= 5 ? '#ff4444' : '';
    if (timeLeft <= 5 && timeLeft > 0) {
      setRobot('thinking', 'Vite vite ! ⏱', '○');
    }
  }

  // Timeout — treat as wrong
  function handleTimeout() {
    if (!isRetryRound) {
      const q = questions[currentIndex];
      addToRetry(q.text, q.answer, q.unit);
    }
    setRobot('sad', 'Trop tard ! ⏰', '︵');
    shakeCard();
    setTimeout(nextQuestion, 800);
  }

  // Validate answer
  function validateAnswer() {
    clearInterval(timer);
    const userAnswer = parseFloat(answerInput.value);
    let q;

    if (!isRetryRound) {
      q = questions[currentIndex];
    } else {
      q = retryItems[0];
    }

    if (isNaN(userAnswer)) {
      startTimer(); // restart timer, ignore empty
      return;
    }

    if (userAnswer === q.answer) {
      // Correct
      score++;
      scoreDisplay.textContent = score;
      setRobot('happy', 'Bravo ! 💗', '◡');
      celebrate();

      if (isRetryRound) {
        removeFromRetry(retryItems[0].id);
        retryItems.shift();
      }

      setTimeout(nextQuestion, 3500);
    } else {
      // Wrong
      setRobot('sad', 'Oups ! Essaie encore 💪', '︵');
      shakeCard();
      if (!isRetryRound) {
        addToRetry(q.text, q.answer, q.unit);
      }
      setTimeout(nextQuestion, 800);
    }
  }

  function nextQuestion() {
    if (!isRetryRound) {
      currentIndex++;
      if (currentIndex >= TOTAL_QUESTIONS) {
        // Check if retry items remain
        if (retryItems.length > 0) {
          isRetryRound = true;
          qTotal.textContent = '🔄';
          showQuestion();
        } else {
          endQuiz();
        }
        return;
      }
      showQuestion();
    } else {
      if (retryItems.length > 0) {
        showQuestion();
      } else {
        endQuiz();
      }
    }
  }

  // Retry panel
  function addToRetry(text, answer, unit) {
    const id = retryIdCounter++;
    retryItems.push({ text, answer, unit, id });
    const li = document.createElement('li');
    li.id = `retry-${id}`;
    li.textContent = `${text} → ${answer} ${unit}`;
    retryList.appendChild(li);
  }

  function removeFromRetry(id) {
    const li = document.getElementById(`retry-${id}`);
    if (li) {
      li.classList.add('correct');
      setTimeout(() => li.remove(), 500);
    }
  }

  // Celebration GIFs
  const CELEBRATION_GIFS = [
    'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExM2YwODZxZnNmOWpkZTJ1OHMzdjB5OG0xazJ3bnNvYTE4MnF2YWI3NiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/QX81mZCxbGlqFtxqYn/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3Z3U2OWU2emc0ZTY2YnJ4ODZnMTJsMjJ3MGlha2UxaXEyNnZqaGEzeSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/FWAcpJsFT9mvrv0e7a/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3Z3U2OWU2emc0ZTY2YnJ4ODZnMTJsMjJ3MGlha2UxaXEyNnZqaGEzeSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Xw6yFn7frR3Y4/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3Z3U2OWU2emc0ZTY2YnJ4ODZnMTJsMjJ3MGlha2UxaXEyNnZqaGEzeSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/17jVBLoVp76WR1Phwh/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3bzQzaTB1azZraTRrdjk2bnE2bXc4NDhocm1zMTgzaDA5Y2lldnFwaCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/OvpA7YvA9INE7bgGOy/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3Nmh3bmxkcXgwcmt0MW95d3Fka2NnOHR4ZmtpcjBhM3Vqd29mbzZ6ZSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/T70hpBP1L0N7U0jtkq/giphy.gif'
  ];

  // Korean encouragement phrases
  const KOREAN_CHEERS = [
    '잘했어! (Bien joué !)',
    '대박! (Génial !)',
    '화이팅! (Courage !)',
    '최고! (Tu es le/la meilleur(e) !)'
  ];

  // Effects
  function celebrate() {
    const cheer = KOREAN_CHEERS[Math.floor(Math.random() * KOREAN_CHEERS.length)];
    document.querySelector('.celebration-text').textContent = `🎉 ${cheer} 🎉`;
    celebration.classList.remove('hidden', 'fading');
    celebration.style.animation = 'none';
    void celebration.offsetWidth;
    celebration.style.animation = '';
    // Random GIF
    const gif = document.getElementById('celebration-gif');
    gif.src = CELEBRATION_GIFS[Math.floor(Math.random() * CELEBRATION_GIFS.length)];
    spawnConfetti();
    // Start fade-out after 2.5s, animation lasts 1s
    setTimeout(() => {
      celebration.classList.add('fading');
    }, 2500);
  }

  function shakeCard() {
    const card = document.querySelector('.question-card');
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 500);
  }

  // Mini confetti
  function spawnConfetti() {
    let canvas = document.getElementById('confetti');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'confetti';
      document.body.appendChild(canvas);
    }
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = [];
    const colors = ['#ff006e', '#ff69b4', '#ffd700', '#fff', '#c9004e'];
    for (let i = 0; i < 40; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: -10,
        w: Math.random() * 8 + 4,
        h: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        vy: Math.random() * 4 + 2,
        vx: (Math.random() - 0.5) * 4,
        rot: Math.random() * 360
      });
    }

    let frames = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.y += p.vy;
        p.x += p.vx;
        p.rot += 3;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frames++;
      if (frames < 60) requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    draw();
  }

  // End
  function endQuiz() {
    clearInterval(timer);
    showScreen(endScreen);
    const pct = Math.round((score / TOTAL_QUESTIONS) * 100);
    let msg;
    if (pct === 100) msg = '🏆 Parfait ! Tu es une vraie BLINK ! 🏆';
    else if (pct >= 70) msg = '💗 Super travail ! Continue comme ça !';
    else if (pct >= 40) msg = '✨ Pas mal ! Encore un peu d\'entraînement !';
    else msg = '💪 Courage ! Tu vas y arriver !';

    document.getElementById('end-message').textContent = msg;
    document.getElementById('end-score').textContent = `Score : ${score} / ${TOTAL_QUESTIONS} (${pct}%)`;

    if (pct >= 70) spawnConfetti();
  }

  // Events
  btnStart.addEventListener('click', startQuiz);
  btnRestart.addEventListener('click', startQuiz);
  btnValidate.addEventListener('click', validateAnswer);
  answerInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') validateAnswer();
  });

  // Numpad
  answerInput.setAttribute('readonly', true);
  document.getElementById('numpad').addEventListener('click', e => {
    const btn = e.target.closest('.numpad-btn');
    if (!btn) return;
    const val = btn.dataset.val;
    if (val === 'del') {
      answerInput.value = answerInput.value.slice(0, -1);
    } else if (val === '.') {
      if (!answerInput.value.includes('.')) answerInput.value += '.';
    } else {
      answerInput.value += val;
    }
  });
})();
