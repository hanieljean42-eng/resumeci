// --- MODULE FLASHCARDS PREMIUM (v2 — Répétition Espacée) ---

const FC_STORAGE_KEY = 'resumeci_fc_scores';

// Récupère les scores de difficulté stockés localement
function fcGetScores() {
  try { return JSON.parse(localStorage.getItem(FC_STORAGE_KEY) || '{}'); } 
  catch { return {}; }
}

// Sauvegarde un score pour une carte identifiée par son titre
function fcSaveScore(ficheKey, cardTitle, difficulty) {
  const scores = fcGetScores();
  if (!scores[ficheKey]) scores[ficheKey] = {};
  scores[ficheKey][cardTitle] = difficulty;
  localStorage.setItem(FC_STORAGE_KEY, JSON.stringify(scores));
}

// Mélange un tableau (algorithme Fisher-Yates)
function fcShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

window.startFlashcards = function() {
  if (!window.userHasFeature || !window.userHasFeature('Flashcards (Répétition Espacée)')) {
    if (typeof window.openPremiumTeaser === 'function') {
      window.openPremiumTeaser('Flashcards (Répétition Espacée)');
    } else if (typeof window.openElitePassModal === 'function') {
      window.openElitePassModal('Pass Pro');
    }
    return;
  }

  const content = document.querySelector('.fiche-content');
  if (!content) {
    if (window.toast) toast("Ouvre une fiche d'abord !", 'warn');
    return;
  }

  const ficheKey = window.CURRENT_FICHE
    ? `${window.CURRENT_FICHE.cls}/${window.CURRENT_FICHE.file}`
    : 'unknown';

  const cards = [];
  let currentTitle = '';
  let currentContent = '';
  const elements = content.children;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.tagName.match(/^H[2-5]$/i)) {
      if (currentTitle && currentContent.trim()) {
        cards.push({ front: currentTitle, back: currentContent.trim() });
      }
      const rawTitle = el.innerText.replace(/^[IVX]+\.\s*|^\d+\.\s*/i, '').trim();
      // Ignorer les titres vides ou trop courts
      currentTitle = rawTitle.length > 2 ? rawTitle : '';
      currentContent = '';
    } else if (['P', 'UL', 'OL', 'BLOCKQUOTE', 'TABLE', 'DIV', 'DL'].includes(el.tagName)) {
      if (!el.classList.contains('header') && !el.classList.contains('resume-ci-whatsapp-qr') && !el.classList.contains('fiche-actions') && !el.classList.contains('loading')) {
        currentContent += el.outerHTML;
      }
    }
  }
  if (currentTitle && currentContent.trim()) {
    cards.push({ front: currentTitle, back: currentContent.trim() });
  }

  if (cards.length === 0) {
    if (window.toast) toast('Pas assez de contenu structuré pour créer des flashcards.', 'warn');
    return;
  }

  // Répétition espacée : trier les cartes "Difficile" en premier, mélanger les autres
  const scores = fcGetScores()[ficheKey] || {};
  const hard = fcShuffle(cards.filter(c => scores[c.front] === 'hard'));
  const good = fcShuffle(cards.filter(c => scores[c.front] === 'good'));
  const easy = fcShuffle(cards.filter(c => scores[c.front] === 'easy'));
  const unseen = fcShuffle(cards.filter(c => !scores[c.front]));

  // Ordre : Difficile → Jamais vues → Correctes → Faciles
  const orderedCards = [...hard, ...unseen, ...good, ...easy];

  window.FC_STATE = {
    cards: orderedCards,
    index: 0,
    ficheKey,
    session: { hard: 0, good: 0, easy: 0 }
  };

  renderFlashcardOverlay();
};

window.renderFlashcardOverlay = function() {
  let overlay = document.getElementById('flashcardOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'flashcardOverlay';
    overlay.className = 'overlay';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeFlashcards();
      }
    });
  }

  const { cards, index } = window.FC_STATE;
  const card = cards[index];
  const progressPct = ((index + 1) / cards.length) * 100;
  const isDark = document.body.classList.contains('dark-mode');

  overlay.innerHTML = `
    <div class="fc-container${isDark ? ' fc-dark' : ''}">
      <div class="fc-header">
        <h3>🎴 Flashcards</h3>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="fc-progress-text">${index + 1} / ${cards.length}</span>
          <button class="fc-close" onclick="closeFlashcards()"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div class="fc-progress-bar"><div class="fc-progress-fill" style="width:${progressPct}%"></div></div>

      <div class="fc-card" id="fcCard" onclick="flipFlashcard(this)">
        <div class="fc-card-inner">
          <div class="fc-card-front">
            <div class="fc-card-num">${index + 1}</div>
            <h4>${card.front}</h4>
            <div class="fc-hint"><i class="fas fa-hand-pointer"></i> Appuyer pour révéler</div>
          </div>
          <div class="fc-card-back">
            <div class="fc-back-content">${card.back}</div>
          </div>
        </div>
      </div>

      <div class="fc-actions" id="fcActions" style="display:none;opacity:0;transition:opacity 0.3s ease;">
        <p class="fc-eval-text">Comment as-tu trouvé cette carte ?</p>
        <div class="fc-buttons">
          <button class="fc-btn fc-btn-hard" onclick="nextFlashcard('hard')">
            😓 Difficile
          </button>
          <button class="fc-btn fc-btn-good" onclick="nextFlashcard('good')">
            🙂 Correct
          </button>
          <button class="fc-btn fc-btn-easy" onclick="nextFlashcard('easy')">
            😄 Facile !
          </button>
        </div>
      </div>
    </div>
  `;
  overlay.classList.add('show');
  try {
    if (typeof renderInlineMath === 'function') renderInlineMath(overlay);
    if (window.renderMathInElement) window.renderMathInElement(overlay);
  } catch (e) {}
};

window.flipFlashcard = function(cardEl) {
  if (cardEl.classList.contains('flipped')) return;
  cardEl.classList.add('flipped');
  const actions = document.getElementById('fcActions');
  if (actions) {
    actions.style.display = 'block';
    setTimeout(() => { actions.style.opacity = '1'; }, 50);
  }
};

window.nextFlashcard = function(difficulty) {
  const state = window.FC_STATE;
  const card = state.cards[state.index];

  // Sauvegarder le score
  fcSaveScore(state.ficheKey, card.front, difficulty);
  state.session[difficulty]++;

  state.index++;
  if (state.index >= state.cards.length) {
    finishFlashcards();
  } else {
    renderFlashcardOverlay();
  }
};

window.finishFlashcards = function() {
  const overlay = document.getElementById('flashcardOverlay');
  const { session, cards } = window.FC_STATE;
  const total = session.hard + session.good + session.easy;
  const score = Math.round(((session.good + session.easy) / total) * 100);
  const isDark = document.body.classList.contains('dark-mode');

  overlay.innerHTML = `
    <div class="fc-container${isDark ? ' fc-dark' : ''}" style="text-align:center;justify-content:center;">
      <div style="font-size:48px;margin-bottom:12px;">${score >= 80 ? '🏆' : score >= 50 ? '💪' : '📚'}</div>
      <h3 style="margin-bottom:6px;">Session terminée !</h3>
      <p style="color:#64748b;margin-bottom:24px;">Tu as révisé <strong>${total}</strong> carte${total > 1 ? 's' : ''}.</p>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:24px;">
        <div style="background:#fef2f2;border-radius:12px;padding:12px;">
          <div style="font-size:22px;font-weight:800;color:#ef4444">${session.hard}</div>
          <div style="font-size:11px;color:#64748b">Difficile</div>
        </div>
        <div style="background:#eff6ff;border-radius:12px;padding:12px;">
          <div style="font-size:22px;font-weight:800;color:#3b82f6">${session.good}</div>
          <div style="font-size:11px;color:#64748b">Correct</div>
        </div>
        <div style="background:#f0fdf4;border-radius:12px;padding:12px;">
          <div style="font-size:22px;font-weight:800;color:#10b981">${session.easy}</div>
          <div style="font-size:11px;color:#64748b">Facile</div>
        </div>
      </div>

      ${session.hard > 0 ? `<p style="font-size:12px;color:#f59e0b;margin-bottom:16px;">💡 ${session.hard} carte${session.hard > 1 ? 's difficiles seront' : ' difficile sera'} prioritaire${session.hard > 1 ? 's' : ''} à ta prochaine session.</p>` : ''}

      <div style="display:flex;flex-direction:column;gap:8px;">
        ${session.hard > 0 ? `<button class="fc-btn fc-btn-hard" style="width:100%;" onclick="window.FC_STATE.index=0;window.FC_STATE.session={hard:0,good:0,easy:0};renderFlashcardOverlay()">🔁 Refaire les cartes difficiles</button>` : ''}
        <button class="fc-btn fc-btn-good" style="width:100%;" onclick="closeFlashcards()">✅ Retourner à la leçon</button>
      </div>
    </div>
  `;
};

window.closeFlashcards = function() {
  const overlay = document.getElementById('flashcardOverlay');
  if (overlay) {
    overlay.classList.remove('show');
    setTimeout(() => { overlay.remove(); }, 300);
  }
};

