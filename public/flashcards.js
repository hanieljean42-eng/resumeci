// --- MODULE FLASHCARDS PREMIUM (v3 — Répétition Espacée FSRS) ---
// Planificateur FSRS (algorithme d'Anki moderne) via le bundle UMD
// /vendor/ts-fsrs.min.js exposant window.FSRS. État de chaque carte
// (stabilité, difficulté, échéance) persisté par fiche dans localStorage.

const FC_STORAGE_KEY = 'resumeci_fc_scores'; // legacy (import)
const FC_FSRS_KEY = 'resumeci_fc_fsrs';

const fcScheduler = (window.FSRS && FSRS.fsrs) ? FSRS.fsrs() : null;

// ---------- Persistance FSRS ----------
function fcFsrsStore() {
  try { return JSON.parse(localStorage.getItem(FC_FSRS_KEY) || '{}'); }
  catch { return {}; }
}
function fcReviveCard(raw) {
  try {
    const c = JSON.parse(raw);
    if (!c || !c.due) return null;
    c.due = new Date(c.due);
    if (c.last_review) c.last_review = new Date(c.last_review);
    return c;
  } catch { return null; }
}
function fcGetCard(ficheKey, front) {
  const all = fcFsrsStore();
  return all[ficheKey] && all[ficheKey][front] ? fcReviveCard(all[ficheKey][front]) : null;
}
function fcSaveCard(ficheKey, front, card) {
  const all = fcFsrsStore();
  if (!all[ficheKey]) all[ficheKey] = {};
  all[ficheKey][front] = JSON.stringify(card);
  try { localStorage.setItem(FC_FSRS_KEY, JSON.stringify(all)); } catch (e) {}
}
// Une carte est "due" quand sa date de revue est passée
function fcIsDue(card, now) {
  return !!card && card.due instanceof Date && card.due <= now;
}

// ---------- Migration douce de l'ancien système (hard/good/easy) ----------
// Les cartes marquées "hard" redeviennent dues immédiatement ; les autres
// seront replanifiées à leur première note FSRS.
function fcLegacyHint(ficheKey, front) {
  try {
    const scores = JSON.parse(localStorage.getItem(FC_STORAGE_KEY) || '{}');
    return (scores[ficheKey] || {})[front] || '';
  } catch { return ''; }
}

function fcShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Intervalle affiché sous chaque bouton (10m, 6h, 4j, 2mo)
function fcFmtInterval(from, to) {
  const ms = Math.max(0, new Date(to) - new Date(from));
  const min = ms / 60000;
  if (min < 60) return Math.max(1, Math.round(min)) + ' min';
  const h = min / 60;
  if (h < 48) return Math.round(h) + ' h';
  const d = h / 24;
  if (d < 30) return Math.round(d) + ' j';
  const mo = d / 30.44;
  if (mo < 12) return Math.round(mo) + ' mo';
  return (Math.round((mo / 12) * 10) / 10) + ' an';
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

  const now = new Date();
  cards.forEach(c => { c.fsrs = fcGetCard(ficheKey, c.front); });

  let orderedCards;
  if (fcScheduler) {
    // FSRS : 1) cartes dues (échéance dépassée, plus anciennes d'abord)
    //       2) jamais vues (mélange)  3) pas encore dues (proche échéance d'abord)
    const due = cards.filter(c => fcIsDue(c.fsrs, now)).sort((a, b) => a.fsrs.due - b.fsrs.due);
    const fresh = fcShuffle(cards.filter(c => !c.fsrs));
    const future = cards.filter(c => c.fsrs && !fcIsDue(c.fsrs, now)).sort((a, b) => a.fsrs.due - b.fsrs.due);
    orderedCards = [...due, ...fresh, ...future];
  } else {
    // Repli sans la lib : ancienne logique (difficiles en premier)
    const hard = fcShuffle(cards.filter(c => fcLegacyHint(ficheKey, c.front) === 'hard'));
    const easy = fcShuffle(cards.filter(c => fcLegacyHint(ficheKey, c.front) === 'easy'));
    const rest = fcShuffle(cards.filter(c => !['hard', 'easy'].includes(fcLegacyHint(ficheKey, c.front))));
    orderedCards = [...hard, ...rest, ...easy];
  }

  const dueCount = cards.filter(c => !c.fsrs || fcIsDue(c.fsrs, now)).length;

  window.FC_STATE = {
    cards: orderedCards,
    index: 0,
    ficheKey,
    dueCount,
    session: { again: 0, hard: 0, good: 0, easy: 0 }
  };

  renderFlashcardOverlay();
};

// Intervalles prévus par le planificateur pour la carte courante
function fcIntervalPreview(card) {
  if (!fcScheduler || !window.FSRS) return null;
  const now = new Date();
  const base = card.fsrs || FSRS.createEmptyCard(now);
  try {
    const outcomes = fcScheduler.repeat(base, now);
    return {
      again: fcFmtInterval(now, outcomes[FSRS.Rating.Again].card.due),
      hard: fcFmtInterval(now, outcomes[FSRS.Rating.Hard].card.due),
      good: fcFmtInterval(now, outcomes[FSRS.Rating.Good].card.due),
      easy: fcFmtInterval(now, outcomes[FSRS.Rating.Easy].card.due)
    };
  } catch (e) { return null; }
}

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

  const { cards, index, dueCount } = window.FC_STATE;
  const card = cards[index];
  const progressPct = Math.min(100, (index / cards.length) * 100);
  const iv = fcIntervalPreview(card);

  overlay.innerHTML = `
    <div class="fc-container">
      <div class="fc-header">
        <h3>🎴 Flashcards ${fcScheduler ? '<span style="font-size:11px;font-weight:600;background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:3px 8px;border-radius:8px;vertical-align:middle;">FSRS</span>' : ''}</h3>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="fc-progress-text">${index + 1} / ${cards.length}${dueCount ? ` • <span title="Cartes à réviser (échéance atteinte)">🔁 ${dueCount} dues</span>` : ''}</span>
          <button class="fc-close" onclick="closeFlashcards()"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div class="fc-progress-bar"><div class="fc-progress-fill" style="width:${progressPct}%"></div></div>

      <div class="fc-card" id="fcCard" onclick="flipFlashcard(this)">
        <div class="fc-card-inner">
          <div class="fc-card-front">
            <div class="fc-card-num">${index + 1}</div>
            <h4>${card.front}</h4>
            ${card.fsrs ? `<div style="font-size:10px;color:#94a3b8;margin-bottom:4px;">${card.fsrs.reps > 0 ? `révisée ${card.fsrs.reps}×` : 'en apprentissage'}</div>` : '<div style="font-size:10px;color:#10b981;margin-bottom:4px;">✨ nouvelle carte</div>'}
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
          <button class="fc-btn" style="background:#fef2f2;color:#b91c1c;border:2px solid #fecaca;" onclick="nextFlashcard('again')">
            😰 À revoir${iv ? `<br><span style="font-size:10px;opacity:.75">${iv.again}</span>` : ''}
          </button>
          <button class="fc-btn fc-btn-hard" onclick="nextFlashcard('hard')">
            😓 Difficile${iv ? `<br><span style="font-size:10px;opacity:.75">${iv.hard}</span>` : ''}
          </button>
          <button class="fc-btn fc-btn-good" onclick="nextFlashcard('good')">
            🙂 Correct${iv ? `<br><span style="font-size:10px;opacity:.75">${iv.good}</span>` : ''}
          </button>
          <button class="fc-btn fc-btn-easy" onclick="nextFlashcard('easy')">
            😄 Facile${iv ? `<br><span style="font-size:10px;opacity:.75">${iv.easy}</span>` : ''}
          </button>
        </div>
        ${fcScheduler ? '<p style="font-size:10px;color:#94a3b8;margin-top:10px;">🧠 La répétition espacée programme chaque carte au bon moment — les intervalles s\'allongent à chaque réussite.</p>' : ''}
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

window.nextFlashcard = function(grade) {
  const state = window.FC_STATE;
  const card = state.cards[state.index];
  const now = new Date();

  if (fcScheduler && window.FSRS) {
    // Planification FSRS : la carte obtient sa prochaine échéance réelle
    const ratingMap = { again: FSRS.Rating.Again, hard: FSRS.Rating.Hard, good: FSRS.Rating.Good, easy: FSRS.Rating.Easy };
    const current = card.fsrs || FSRS.createEmptyCard(now);
    try {
      const res = fcScheduler.next(current, now, ratingMap[grade] || FSRS.Rating.Good);
      card.fsrs = res.card;
      fcSaveCard(state.ficheKey, card.front, res.card);
    } catch (e) {}
    state.session[grade]++;
    // « À revoir » : la carte repasse en fin de session (re-apprentissage)
    if (grade === 'again') state.cards.push({ ...card });
  } else {
    // Repli : compatibilité avec l'ancien stockage
    const map = { again: 'hard', hard: 'hard', good: 'good', easy: 'easy' };
    fcSaveScore(state.ficheKey, card.front, map[grade]);
    state.session[grade]++;
    if (grade === 'again') state.cards.push({ ...card });
  }

  state.index++;
  if (state.index >= state.cards.length) {
    finishFlashcards();
  } else {
    renderFlashcardOverlay();
  }
};

// Ancien stockage (conservé pour le mode dégradé)
function fcGetScores() {
  try { return JSON.parse(localStorage.getItem(FC_STORAGE_KEY) || '{}'); }
  catch { return {}; }
}
function fcSaveScore(ficheKey, cardTitle, difficulty) {
  const scores = fcGetScores();
  if (!scores[ficheKey]) scores[ficheKey] = {};
  scores[ficheKey][cardTitle] = difficulty;
  localStorage.setItem(FC_STORAGE_KEY, JSON.stringify(scores));
}

window.finishFlashcards = function() {
  const overlay = document.getElementById('flashcardOverlay');
  const { session, cards } = window.FC_STATE;
  const total = session.again + session.hard + session.good + session.easy;
  const score = Math.round(((session.good + session.easy) / Math.max(1, total)) * 100);

  // Prochaine échéance globale : quand reviendra la prochaine carte ?
  let nextDue = null;
  if (fcScheduler) {
    const dues = cards.map(c => c.fsrs && c.fsrs.due).filter(d => d instanceof Date);
    if (dues.length) nextDue = new Date(Math.min.apply(null, dues.map(d => d.getTime())));
  }
  const nextTxt = nextDue ? (nextDue <= new Date() ? 'maintenant' : fcFmtInterval(new Date(), nextDue)) : null;

  overlay.innerHTML = `
    <div class="fc-container" style="text-align:center;justify-content:center;">
      <div style="font-size:48px;margin-bottom:12px;">${score >= 80 ? '🏆' : score >= 50 ? '💪' : '📚'}</div>
      <h3 style="margin-bottom:6px;">Session terminée !</h3>
      <p style="color:#64748b;margin-bottom:20px;">Tu as fait <strong>${total}</strong> passage${total > 1 ? 's' : ''}.</p>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px;">
        <div style="background:#fef2f2;border-radius:12px;padding:10px;">
          <div style="font-size:20px;font-weight:800;color:#b91c1c">${session.again}</div>
          <div style="font-size:10px;color:#64748b">À revoir</div>
        </div>
        <div style="background:#fff7ed;border-radius:12px;padding:10px;">
          <div style="font-size:20px;font-weight:800;color:#ea580c">${session.hard}</div>
          <div style="font-size:10px;color:#64748b">Difficile</div>
        </div>
        <div style="background:#eff6ff;border-radius:12px;padding:10px;">
          <div style="font-size:20px;font-weight:800;color:#3b82f6">${session.good}</div>
          <div style="font-size:10px;color:#64748b">Correct</div>
        </div>
        <div style="background:#f0fdf4;border-radius:12px;padding:10px;">
          <div style="font-size:20px;font-weight:800;color:#10b981">${session.easy}</div>
          <div style="font-size:10px;color:#64748b">Facile</div>
        </div>
      </div>

      ${nextTxt ? `<p style="font-size:12px;color:#6366f1;margin-bottom:16px;">🧠 Prochaine carte programmée ${nextTxt === 'maintenant' ? '<strong>maintenant</strong>' : 'dans <strong>' + nextTxt + '</strong>'} — la répétition espacée te rappellera au bon moment.</p>` : (session.again > 0 ? `<p style="font-size:12px;color:#f59e0b;margin-bottom:16px;">💡 Les cartes « À revoir » repasseront dans ta prochaine session.</p>` : '')}

      <div style="display:flex;flex-direction:column;gap:8px;">
        ${session.again > 0 ? `<button class="fc-btn fc-btn-hard" style="width:100%;" onclick="window.FC_STATE.index=0;window.FC_STATE.session={again:0,hard:0,good:0,easy:0};renderFlashcardOverlay()">🔁 Refaire la session</button>` : ''}
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
