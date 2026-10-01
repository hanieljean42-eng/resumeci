// --- MODULE QUIZ (PREMIUM) ---

const QUIZ_STORAGE_KEY = 'resumeci_quiz_scores';

// Shuffle array
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

window.startQuiz = async function(cls, sub, file) {
  if (!window.userHasFeature || !window.userHasFeature('Quiz Interactif')) {
    if (typeof window.openPremiumTeaser === 'function') {
      window.openPremiumTeaser('Quiz Interactif');
    } else if (typeof window.openElitePassModal === 'function') {
      window.openElitePassModal('Pass Pro');
    }
    return;
  }

  if (window.toast) toast("Chargement du quiz...", "info");
  
  try {
    const response = await fetch(`/data/quizzes/${encodeURIComponent(cls)}/${encodeURIComponent(sub)}.json`);
    if (!response.ok) throw new Error("Quiz non trouvé pour cette matière");
    
    const quizzes = await response.json();
    const fileKey = file.replace(/\.(html|md)$/, '');
    let quizData = quizzes[fileKey];
    if (!quizData) {
      const lowerKey = fileKey.toLowerCase();
      const matchedKey = Object.keys(quizzes).find(k => k.toLowerCase() === lowerKey);
      if (matchedKey) quizData = quizzes[matchedKey];
    }
    
    if (!quizData || !quizData.questions || quizData.questions.length === 0) {
      throw new Error("Aucun quiz disponible pour cette fiche");
    }
    
    // Prepare state
    window.QUIZ_STATE = {
      title: quizData.title,
      questions: shuffleArray(quizData.questions),
      currentIndex: 0,
      score: 0,
      fileKey: fileKey,
      cls: cls,
      sub: sub
    };
    
    renderQuizOverlay();
    
  } catch (error) {
    console.error("Quiz Error:", error);
    if (window.toast) toast("Le quiz pour cette fiche sera bientôt disponible !", "warn");
  }
};

window.renderQuizOverlay = function() {
  let overlay = document.getElementById('quizOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'quizOverlay';
    document.body.appendChild(overlay);
  }
  
  const state = window.QUIZ_STATE;
  const question = state.questions[state.currentIndex];
  const progressPct = ((state.currentIndex) / state.questions.length) * 100;
  
  // Shuffle options if it's a qcm (vrai_faux keeps order)
  let optionsHtml = '';
  if (question.type === 'qcm') {
    // Keep track of original index to know which is the correct answer
    const optionsWithIndex = question.options.map((opt, idx) => ({ text: opt, originalIndex: idx }));
    const shuffledOptions = shuffleArray(optionsWithIndex);
    
    shuffledOptions.forEach((opt, displayIndex) => {
      const isCorrect = (opt.originalIndex === question.answer);
      optionsHtml += `<button class="quiz-option" onclick="handleQuizAnswer(this, ${isCorrect})">${opt.text}</button>`;
    });
  } else if (question.type === 'vrai_faux') {
    question.options.forEach((opt, idx) => {
      const isCorrect = (idx === question.answer);
      optionsHtml += `<button class="quiz-option" onclick="handleQuizAnswer(this, ${isCorrect})">${opt}</button>`;
    });
  }

  overlay.innerHTML = `
    <div class="quiz-container">
      <div class="quiz-header">
        <h3>🎯 Quiz : ${state.title}</h3>
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="quiz-progress-text">Question ${state.currentIndex + 1}/${state.questions.length}</span>
          <button class="quiz-close" onclick="closeQuiz()"><i class="fas fa-times"></i></button>
        </div>
      </div>
      
      <div class="quiz-progress-bar">
        <div class="quiz-progress-fill" style="width: ${progressPct}%"></div>
      </div>
      
      <div class="quiz-question-text">${question.text}</div>
      
      <div class="quiz-options" id="quizOptions">
        ${optionsHtml}
      </div>
      
      <div class="quiz-explanation" id="quizExplanation">
        ${question.explanation || ''}
      </div>
      
      <button class="quiz-next-btn" id="quizNextBtn" onclick="nextQuizQuestion()">Suivant <i class="fas fa-arrow-right"></i></button>
    </div>
  `;
  
  overlay.classList.add('show');
  try {
    if (typeof renderInlineMath === 'function') renderInlineMath(overlay);
    if (window.renderMathInElement) window.renderMathInElement(overlay);
  } catch (e) {}
};

window.handleQuizAnswer = function(btn, isCorrect) {
  // Disable all options
  const options = document.querySelectorAll('#quizOptions .quiz-option');
  options.forEach(opt => {
    opt.disabled = true;
    // Reveal correct answer if they clicked the wrong one
    if (opt.getAttribute('onclick').includes('true')) {
      opt.classList.add('correct');
    }
  });
  
  // Highlight clicked answer
  if (isCorrect) {
    btn.classList.add('correct');
    window.QUIZ_STATE.score++;
    
    // Confetti effect on correct answer
    const emojis = ['🌟', '✨', '🎉', '👏', '🎯'];
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    if (window.toast) toast(`${emoji} Bonne réponse !`, 'success', 2000);
  } else {
    btn.classList.add('wrong');
  }
  
  // Show explanation and next button
  const explanation = document.getElementById('quizExplanation');
  if (explanation && explanation.innerText.trim()) {
    explanation.style.display = 'block';
  }
  
  document.getElementById('quizNextBtn').style.display = 'block';
};

window.nextQuizQuestion = function() {
  window.QUIZ_STATE.currentIndex++;
  
  if (window.QUIZ_STATE.currentIndex >= window.QUIZ_STATE.questions.length) {
    finishQuiz();
  } else {
    renderQuizOverlay();
  }
};

window.finishQuiz = function() {
  const overlay = document.getElementById('quizOverlay');
  const state = window.QUIZ_STATE;
  const score = state.score;
  const total = state.questions.length;
  const percentage = score / total;
  
  let emoji = '📚';
  let message = 'Passable. Relis la fiche et réessaie !';
  
  if (percentage === 1) {
    emoji = '🏆';
    message = 'Parfait ! Maître de la leçon !';
  } else if (percentage >= 0.8) {
    emoji = '🌟';
    message = 'Excellent ! Presque parfait !';
  } else if (percentage >= 0.6) {
    emoji = '👍';
    message = 'Bien ! Revois les points ratés.';
  } else if (percentage <= 0.2) {
    emoji = '💪';
    message = 'Courage ! Relis attentivement la leçon.';
  }
  
  // Save score locally
  try {
    let scores = JSON.parse(localStorage.getItem(QUIZ_STORAGE_KEY) || '{}');
    if (!scores[state.fileKey] || scores[state.fileKey] < score) {
      scores[state.fileKey] = score;
      localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(scores));
    }
  } catch (e) {}
  
  overlay.innerHTML = `
    <div class="quiz-container quiz-score-container">
      <div class="quiz-score-emoji">${emoji}</div>
      <h2 class="quiz-score-title">Quiz Terminé !</h2>
      <p class="quiz-score-desc">${message}</p>
      
      <div class="quiz-score-number">
        ${score} / ${total}
      </div>
      
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:16px;">
        <button class="quiz-next-btn" style="display:block;margin:0;" onclick="startQuiz('${state.cls}', '${state.sub}', '${state.fileKey}.html')">
          <i class="fas fa-redo"></i> Refaire le quiz
        </button>
        <button class="quiz-option" style="text-align:center;" onclick="closeQuiz()">
          Retourner à la leçon
        </button>
      </div>
    </div>
  `;
};

window.closeQuiz = function() {
  const overlay = document.getElementById('quizOverlay');
  if (overlay) {
    overlay.classList.remove('show');
    setTimeout(() => { overlay.remove(); }, 300);
  }
};
