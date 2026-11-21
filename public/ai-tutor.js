// --- TUTEUR IA « HANI » — Professeur IA 24/7 (Pass Élite) ---
// Chat streaming SSE avec le tuteur IA (/api/ai/chat). Discussions persistées
// par fiche dans localStorage : chaque fiche a son propre fil, le chat libre
// a le sien. Réservé aux Pass Élite / Excellence / VIP / Annuel (serveur).
(function () {
  'use strict';

  const AI_FEATURE = 'Professeur IA';
  const els = {};
  let context = null;    // {cls, subject, file, label} — fiche ouverte
  let history = [];      // {role:'user'|'model', text} — fil courant (max 40)
  let sending = false;
  let remaining = null;  // questions restantes aujourd'hui

  function profile() {
    try { return JSON.parse(localStorage.getItem('resumeci_profile') || 'null'); } catch (e) { return null; }
  }
  function hasAccess() {
    return !!(profile() && window.userHasFeature && window.userHasFeature(AI_FEATURE));
  }
  function apiBase() {
    return typeof window.getPaymentApiBase === 'function'
      ? window.getPaymentApiBase()
      : 'https://resumeci-payment-api.onrender.com';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmtReply(text) {
    let h = esc(text);
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/\n/g, '<br>');
    return h;
  }

  // ---------- Persistance : un fil de discussion par fiche ----------
  function threadKey() {
    if (!context) return 'hani_thread_global';
    const safe = s => String(s || '').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80);
    return `hani_thread_${safe(context.cls)}_${safe(context.subject)}_${safe(context.file)}`;
  }
  function loadThreads() {
    try { return JSON.parse(localStorage.getItem('hani_threads') || '{}'); } catch (e) { return {}; }
  }
  function loadThread() {
    const t = loadThreads()[threadKey()];
    return (t && Array.isArray(t.history)) ? t : null;
  }
  function saveThread() {
    try {
      const all = loadThreads();
      all[threadKey()] = { history: history.slice(-40), label: context ? context.label : '', updatedAt: Date.now() };
      const keys = Object.keys(all).sort((a, b) => (all[b].updatedAt || 0) - (all[a].updatedAt || 0)).slice(0, 30);
      const trimmed = {};
      keys.forEach(k => { trimmed[k] = all[k]; });
      localStorage.setItem('hani_threads', JSON.stringify(trimmed));
    } catch (e) {}
  }
  function clearThread() {
    history = [];
    try {
      const all = loadThreads();
      delete all[threadKey()];
      localStorage.setItem('hani_threads', JSON.stringify(all));
    } catch (e) {}
    els.msgs.innerHTML = '';
    remaining = null;
    updateQuota();
  }

  // ---------- DOM ----------
  function ensureDom() {
    if (els.fab) return;
    const style = document.createElement('style');
    style.textContent = `
.ai-tutor-fab{position:fixed;right:18px;bottom:86px;z-index:950;width:54px;height:54px;border-radius:50%;border:none;cursor:pointer;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-size:20px;box-shadow:0 8px 24px rgba(124,58,237,.45);display:none;align-items:center;justify-content:center;transition:transform .15s ease}
.ai-tutor-fab.show{display:flex}
.ai-tutor-fab:active{transform:scale(.92)}
.ai-tutor-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:1200;display:none;align-items:flex-end;justify-content:center;backdrop-filter:blur(2px)}
.ai-tutor-overlay.show{display:flex}
.ai-tutor-panel{background:#fff;width:100%;max-width:640px;height:min(86%,720px);border-radius:20px 20px 0 0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -10px 40px rgba(15,23,42,.25);animation:aiSlideUp .22s ease;font-family:'Poppins','Inter',sans-serif;max-height:100%}
@keyframes aiSlideUp{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}
.ai-tutor-head{background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 55%,#a855f7 100%);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px;flex-shrink:0;position:relative;overflow:hidden}
.ai-tutor-head::after{content:'';position:absolute;right:-30px;top:-30px;width:130px;height:130px;border-radius:50%;background:rgba(255,255,255,.08)}
.ai-tutor-head .ai-ico{width:42px;height:42px;border-radius:14px;background:rgba(255,255,255,.16);border:1.5px solid rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0;font-family:'Poppins',sans-serif;font-weight:800;letter-spacing:.5px}
.ai-tutor-head .ai-title{font-family:'Poppins',sans-serif;font-weight:800;font-size:17px;line-height:1.15;letter-spacing:.2px}
.ai-tutor-head .ai-sub{font-size:11px;opacity:.85;margin-top:3px;font-weight:500}
.ai-tutor-head .ai-actions{margin-left:auto;display:flex;gap:6px;position:relative;z-index:1}
.ai-tutor-head .ai-close,.ai-tutor-head .ai-clear{background:rgba(255,255,255,.15);border:none;color:#fff;width:32px;height:32px;border-radius:10px;font-size:15px;cursor:pointer;flex-shrink:0}
.ai-tutor-head .ai-clear{font-size:13px}
.ai-tutor-ctx{background:#f5f3ff;color:#6d28d9;font-size:11px;font-weight:700;padding:7px 14px;display:none;align-items:center;gap:6px;flex-shrink:0;border-bottom:1px solid #ede9fe}
.ai-tutor-ctx.show{display:flex}
.ai-tutor-msgs{flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:10px;background:#f8fafc;min-height:0}
.ai-msg{max-width:85%;padding:11px 14px;border-radius:16px;font-size:13.5px;line-height:1.6;white-space:normal;word-wrap:break-word;font-family:'Inter',sans-serif}
.ai-msg.user{align-self:flex-end;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;border-bottom-right-radius:5px;font-weight:500}
.ai-msg.bot{align-self:flex-start;background:#fff;color:#1e293b;border:1px solid #e9e4f5;border-bottom-left-radius:5px;box-shadow:0 1px 4px rgba(76,29,149,.07);position:relative}
.ai-msg.bot::before{content:'H';position:absolute;left:-9px;bottom:-9px;width:20px;height:20px;border-radius:7px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font-family:'Poppins',sans-serif;font-weight:800;font-size:10px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(124,58,237,.35)}
.ai-msg.bot code{background:#f3efff;color:#5b21b6;padding:1px 6px;border-radius:6px;font-size:12px;font-family:'JetBrains Mono',monospace}
.ai-msg.sys{align-self:center;background:transparent;color:#94a3b8;font-size:11.5px;padding:4px;text-align:center;font-style:italic}
.ai-typing{align-self:flex-start;display:none;gap:5px;padding:12px 14px;background:#fff;border:1px solid #e9e4f5;border-radius:16px;border-bottom-left-radius:5px}
.ai-typing.show{display:flex}
.ai-typing i{width:7px;height:7px;border-radius:50%;background:#8b5cf6;animation:aiBlink 1.2s infinite}
.ai-typing i:nth-child(2){animation-delay:.2s}.ai-typing i:nth-child(3){animation-delay:.4s}
.ai-cursor{display:inline-block;width:8px;height:14px;background:#7c3aed;border-radius:2px;vertical-align:-2px;margin-left:3px;animation:aiBlink 1s infinite}
@keyframes aiBlink{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
.ai-tutor-foot{display:flex;gap:8px;padding:11px 12px calc(11px + env(safe-area-inset-bottom,0px));background:#fff;border-top:1px solid #f1eefc;flex-shrink:0}
.ai-tutor-foot input{flex:1;min-width:0;border:1.5px solid #e6e1f7;border-radius:13px;padding:11px 15px;font-size:14px;font-family:'Inter',sans-serif;outline:none;background:#faf9ff;color:#1e293b;transition:border-color .15s ease}
.ai-tutor-foot input:focus{border-color:#8b5cf6;box-shadow:0 0 0 3px rgba(139,92,246,.12)}
.ai-tutor-foot button{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;border:none;border-radius:13px;padding:0 18px;font-family:'Poppins',sans-serif;font-weight:700;font-size:13.5px;cursor:pointer;display:flex;align-items:center;gap:7px;letter-spacing:.2px;transition:transform .12s ease,box-shadow .15s ease;box-shadow:0 4px 14px rgba(124,58,237,.35)}
.ai-tutor-foot button:hover{box-shadow:0 6px 18px rgba(124,58,237,.45)}
.ai-tutor-foot button:active{transform:scale(.96)}
.ai-tutor-foot button:disabled{opacity:.5;cursor:default}
.ai-quota{font-size:10.5px;color:#94a3b8;text-align:center;padding:2px 0 8px;background:#fff;flex-shrink:0;font-weight:600}
@media(min-width:641px){.ai-tutor-overlay{align-items:center}.ai-tutor-panel{border-radius:22px;height:min(78%,700px)}}
`;
    document.head.appendChild(style);

    const fab = document.createElement('button');
    fab.className = 'ai-tutor-fab';
    fab.id = 'aiTutorFab';
    fab.title = 'Hani — ton Professeur IA';
    fab.setAttribute('aria-label', 'Ouvrir Hani, le tuteur IA');
    fab.innerHTML = '<span style="font-family:Poppins,sans-serif;font-weight:800;font-size:20px">H</span>';
    fab.addEventListener('click', () => openAiTutor(null));

    const overlay = document.createElement('div');
    overlay.className = 'ai-tutor-overlay';
    overlay.id = 'aiTutorOverlay';
    overlay.innerHTML = `
      <div class="ai-tutor-panel" role="dialog" aria-modal="true" aria-label="Hani, tuteur IA">
        <div class="ai-tutor-head">
          <div class="ai-ico">H</div>
          <div>
            <div class="ai-title">Hani</div>
            <div class="ai-sub">Ton Professeur IA — toujours là pour t'aider 📚</div>
          </div>
          <div class="ai-actions">
            <button class="ai-clear" id="aiTutorClear" title="Effacer cette discussion" aria-label="Effacer la discussion">🗑</button>
            <button class="ai-close" id="aiTutorClose" aria-label="Fermer">&times;</button>
          </div>
        </div>
        <div class="ai-tutor-ctx" id="aiTutorCtx"></div>
        <div class="ai-tutor-msgs" id="aiTutorMsgs"></div>
        <div class="ai-quota" id="aiTutorQuota"></div>
        <div class="ai-tutor-foot">
          <input id="aiTutorInput" type="text" maxlength="1000" placeholder="Pose ta question à Hani…" autocomplete="off">
          <button id="aiTutorSend"><i class="fas fa-paper-plane"></i> Envoyer</button>
        </div>
      </div>`;
    document.body.appendChild(fab);
    document.body.appendChild(overlay);

    els.fab = fab; els.overlay = overlay;
    els.msgs = overlay.querySelector('#aiTutorMsgs');
    els.input = overlay.querySelector('#aiTutorInput');
    els.sendBtn = overlay.querySelector('#aiTutorSend');
    els.ctx = overlay.querySelector('#aiTutorCtx');
    els.quota = overlay.querySelector('#aiTutorQuota');
    els.closeBtn = overlay.querySelector('#aiTutorClose');
    els.clearBtn = overlay.querySelector('#aiTutorClear');

    els.closeBtn.addEventListener('click', closeAiTutor);
    els.clearBtn.addEventListener('click', clearThread);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeAiTutor(); });
    els.sendBtn.addEventListener('click', sendMessage);
    els.input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
  }

  // ---------- Affichage ----------
  function addMsg(role, text, isHtml) {
    const div = document.createElement('div');
    div.className = 'ai-msg ' + (role === 'user' ? 'user' : role === 'sys' ? 'sys' : 'bot');
    div.innerHTML = isHtml ? text : fmtReply(text);
    els.msgs.appendChild(div);
    els.msgs.scrollTop = els.msgs.scrollHeight;
    return div;
  }

  function setTyping(on) {
    let t = els.msgs.querySelector('.ai-typing');
    if (on && !t) {
      t = document.createElement('div');
      t.className = 'ai-typing show';
      t.innerHTML = '<i></i><i></i><i></i>';
      els.msgs.appendChild(t);
      els.msgs.scrollTop = els.msgs.scrollHeight;
    } else if (!on && t) t.remove();
  }

  function updateQuota() {
    if (remaining == null) { els.quota.textContent = ''; return; }
    els.quota.textContent = remaining > 0
      ? `💬 ${remaining} question${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''} aujourd'hui`
      : '💬 Limite quotidienne atteinte — reviens demain !';
  }

  function scrollDown() { els.msgs.scrollTop = els.msgs.scrollHeight; }

  function finishReply(rawText, rem) {
    const replyText = String(rawText || '').trim();
    if (replyText) {
      history.push({ role: 'model', text: replyText });
      if (history.length > 40) history = history.slice(-40);
      saveThread();
    }
    if (typeof rem === 'number') { remaining = rem; updateQuota(); }
  }

  function apiErrorText(status, data) {
    if (status === 401) return 'Session expirée : reconnecte-toi pour continuer.';
    if (status === 403) return 'Hani est réservé au Pass Élite (2 000 F) et Pass Excellence (3 000 F).';
    if (status === 429 || (data && data.error === 'ai_quota')) return 'Tu as atteint ta limite de questions pour aujourd\'hui. Reviens demain !';
    if (data && data.error === 'ai_busy') return 'Hani est très sollicité : réessaie dans une minute.';
    return 'Hani est momentanément indisponible. Réessaie plus tard.';
  }

  // ---------- Envoi : streaming SSE mot à mot ----------
  async function sendMessage() {
    if (sending) return;
    const text = (els.input.value || '').trim();
    if (!text) return;
    const p = profile();
    if (!p || !p.sessionToken) {
      addMsg('sys', 'Ta session a expiré : reconnecte-toi pour poser ta question.');
      return;
    }
    sending = true;
    els.sendBtn.disabled = true;
    els.input.value = '';
    addMsg('user', text);
    history.push({ role: 'user', text });
    if (history.length > 40) history = history.slice(-40);
    saveThread();
    setTyping(true);

    const bubble = addMsg('bot', '', true);
    bubble.innerHTML = '<span class="ai-cursor"></span>';
    let acc = '';
    let gotStream = false;

    const paint = () => { bubble.innerHTML = fmtReply(acc) + '<span class="ai-cursor"></span>'; scrollDown(); };

    try {
      const res = await fetch(apiBase() + '/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + p.sessionToken,
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          message: text,
          cls: context ? context.cls : undefined,
          subject: context ? context.subject : undefined,
          file: context ? context.file : undefined,
          stream: true,
          history: history.slice(-9, -1) // le message courant est ajouté côté serveur
        })
      });

      if (res.ok && res.body && (res.headers.get('content-type') || '').includes('text/event-stream')) {
        gotStream = true;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        let streamError = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const evt = buf.slice(0, i);
            buf = buf.slice(i + 2);
            for (const line of evt.split('\n')) {
              if (!line.startsWith('data:')) continue;
              let j;
              try { j = JSON.parse(line.slice(5).trim()); } catch (e) { continue; }
              if (j.type === 'token') { acc += j.text; paint(); }
              else if (j.type === 'done') {
                finishReply(j.reply || acc, j.remaining);
                bubble.innerHTML = fmtReply(acc || j.reply || '');
                if (typeof window.renderInlineMath === 'function') {
                  try { window.renderInlineMath(bubble); } catch (e) {}
                }
                return;
              } else if (j.type === 'error') {
                streamError = j.error || 'ai_failed';
              }
            }
          }
        }
        // Flux terminé sans événement done
        if (acc.trim()) {
          finishReply(acc, null);
          bubble.innerHTML = fmtReply(acc);
          return;
        }
        throw Object.assign(new Error(streamError || 'stream_empty'), { apiErr: streamError });
      }

      // Réponse JSON (erreur ou fallback non-stream)
      const data = await res.json().catch(() => ({}));
      if (data.success && data.reply) {
        if (typeof data.remaining === 'number') { remaining = data.remaining; updateQuota(); }
        bubble.remove();
        addMsg('bot', data.reply);
        const last = els.msgs.lastElementChild;
        if (typeof window.renderInlineMath === 'function') { try { window.renderInlineMath(last); } catch (e) {} }
        history.push({ role: 'model', text: String(data.reply) });
        if (history.length > 40) history = history.slice(-40);
        saveThread();
        return;
      }
      bubble.remove();
      if (data.error === 'ai_quota' || res.status === 429) remaining = 0;
      updateQuota();
      addMsg('sys', apiErrorText(res.status, data));
    } catch (e) {
      if (e && e.apiErr === 'ai_quota') remaining = 0;
      updateQuota();
      bubble.remove();
      addMsg('sys', apiErrorText(0, e && e.apiErr ? { error: e.apiErr } : null));
    } finally {
      sending = false;
      setTyping(false);
      els.sendBtn.disabled = false;
      els.input.focus();
    }
  }

  // ---------- Ajustement viewport (clavier Android) ----------
  function fitViewport() {
    const vv = window.visualViewport;
    if (vv && els.overlay && els.overlay.classList.contains('show')) {
      els.overlay.style.height = Math.round(vv.height) + 'px';
      els.overlay.style.top = Math.round(vv.offsetTop) + 'px';
    }
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitViewport);
    window.visualViewport.addEventListener('scroll', fitViewport);
  }
  window.addEventListener('orientationchange', () => setTimeout(fitViewport, 300));

  // ---------- API publique ----------
  window.openAiTutor = function (ctx) {
    ensureDom();
    context = ctx || null;

    // Restaure le fil de discussion de ce contexte (fiche ou chat libre)
    const saved = loadThread();
    history = saved ? saved.history.slice(-40) : [];
    remaining = null;
    els.msgs.innerHTML = '';

    if (context && context.label) {
      els.ctx.textContent = '📄 ' + context.label;
      els.ctx.classList.add('show');
    } else {
      els.ctx.classList.remove('show');
    }

    if (history.length) {
      // Réaffiche les 20 derniers échanges du fil sauvegardé
      history.slice(-20).forEach(m => addMsg(m.role === 'user' ? 'user' : 'bot', m.text));
      if (context && context.label) {
        addMsg('sys', '💬 Discussion reprise — retrouve tes échanges sur cette fiche.');
      } else {
        addMsg('sys', '💬 Discussion reprise.');
      }
    } else if (context && context.label) {
      addMsg('sys', 'Pose ta question sur cette fiche : je réponds à partir de son contenu.');
    } else {
      addMsg('sys', 'Bonjour ! Je suis Hani, ton Professeur IA. Pose-moi une question de cours, je t\'aide à comprendre.');
    }
    updateQuota();
    els.overlay.classList.add('show');
    fitViewport();
    setTimeout(() => els.input.focus(), 250);
  };

  window.closeAiTutor = function () {
    ensureDom();
    els.overlay.classList.remove('show');
    els.overlay.style.height = '';
    els.overlay.style.top = '';
  };

  // Bouton « Expliquer avec Hani » dans les fiches : HTML prêt à insérer.
  window.getAiTutorButtonHtml = function (cls, sub, file, label) {
    const ctxJson = esc(JSON.stringify({ cls, subject: sub, file, label: label || '' }));
    if (hasAccess()) {
      return `<button onclick="window.openAiTutor(${ctxJson})" style="display:inline-flex;align-items:center;gap:8px;padding:12px 22px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:none;border-radius:12px;font-weight:700;font-size:13.5px;cursor:pointer;box-shadow:0 4px 12px rgba(124,58,237,0.3);font-family:Poppins,sans-serif;"><i class="fas fa-wand-magic-sparkles"></i> Expliquer avec Hani</button>`;
    }
    return `<button onclick="if(typeof openPremiumTeaser==='function') openPremiumTeaser('Professeur IA');" style="display:inline-flex;align-items:center;gap:8px;padding:12px 22px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:none;border-radius:12px;font-weight:700;font-size:13.5px;cursor:pointer;box-shadow:0 4px 12px rgba(124,58,237,0.3);font-family:Poppins,sans-serif;"><i class="fas fa-wand-magic-sparkles"></i> Hani IA 🔒</button>`;
  };

  // Affiche/masque le bouton flottant selon le profil (appelé par app.js).
  window.refreshAiTutorFab = function () {
    ensureDom();
    els.fab.classList.toggle('show', hasAccess());
  };

  ensureDom();
  window.refreshAiTutorFab();
  // Le profil peut arriver après le chargement du script : revérifier périodiquement.
  let tries = 0;
  const t = setInterval(() => {
    window.refreshAiTutorFab();
    if (++tries > 30) clearInterval(t);
  }, 2000);
})();
