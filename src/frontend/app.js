window.DATA = {};
window.CURRENT_FICHE = null;
window.SEARCH_INDEX = [];
let deferredInstallPrompt = null;
const PRIMARY_DOMAIN = 'https://resumeci.me';
const DATA = window.DATA;
let CURRENT_FICHE = null;
let SEARCH_INDEX = [];
const subjectIcons = {
  Allemand: '🇩🇪',
  Anglais: '🇬🇧',
  Espagnol: '🇪🇸',
  Français: '🇫🇷',
  Mathématiques: '📐',
  Philosophie: '💭',
  Histoire: '📜',
  Géo: '🌍',
  SVT: '🧬',
  Sciences: '🧬',
  Physique: '⚛️',
  Arts: '🎨',
  'Education Musicale': '🎵',
  'Education musicale': '🎵',
  'Education Physique': '🏃',
  EPS: '🏃',
};
const CLASS_ORDER = ['6eme', '5eme', '3eme', 'Seconde_A', 'Seconde_C', 'Terminale_A', 'Terminale_C', 'Terminale_D'];
function getOrderedClasses(structure) {
  const entries = [];
  const seen = new Set();
  CLASS_ORDER.forEach(cls => {
    if (structure[cls]) {
      entries.push([cls, structure[cls]]);
      seen.add(cls);
    }
  });
  for (const [cls, subjects] of Object.entries(structure)) {
    if (!seen.has(cls)) entries.push([cls, subjects]);
  }
  return entries;
}
const subjectColors = ['color-blue', 'color-green', 'color-orange', 'color-purple'];
function getIcon(n) {
  for (const [k, v] of Object.entries(subjectIcons)) if (n.includes(k)) return v;
  return '📖';
}
function getColor(i) {
  return subjectColors[i % subjectColors.length];
}
function esc(s) {
  return s.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

window.getPaymentApiBase = function() {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://127.0.0.1:3000';
  }
  return window.RESUMECI_API_URL || 'https://resumeci-payment-api.onrender.com';
};

window.syncUserProfileFromRemote = async function() {
  if (!window.USER_PROFILE) return null;
  const phone = String(window.USER_PROFILE.whatsapp || window.USER_PROFILE.contact || window.USER_PROFILE.phone || '').replace(/\D/g, '').slice(-10);
  const uid = window.USER_PROFILE.uid || '';
  if (!phone && !uid) return null;

  // Statut premium fourni uniquement par l'API (la collection Firestore `users` est réservée à l'admin)
  try {
    const apiBase = typeof window.getPaymentApiBase === 'function' ? window.getPaymentApiBase() : 'https://resumeci-payment-api.onrender.com';
    const res = await fetch(`${apiBase}/api/user-status?phone=${encodeURIComponent(phone)}&uid=${encodeURIComponent(uid)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.success && data.user) {
      const u = data.user;
      let changed = false;
      if (typeof u.isPremium !== 'undefined' && window.USER_PROFILE.isPremium !== u.isPremium) {
        window.USER_PROFILE.isPremium = Boolean(u.isPremium);
        changed = true;
      }
      if (u.premiumPlan && window.USER_PROFILE.premiumPlan !== u.premiumPlan) {
        window.USER_PROFILE.premiumPlan = u.premiumPlan;
        changed = true;
      }
      if (u.premiumExpiresAt && window.USER_PROFILE.premiumExpiresAt !== u.premiumExpiresAt) {
        window.USER_PROFILE.premiumExpiresAt = u.premiumExpiresAt;
        changed = true;
      }
      if (changed) {
        localStorage.setItem('resumeci_profile', JSON.stringify(window.USER_PROFILE));
        if (typeof updateAudioFabVisual === 'function') updateAudioFabVisual();
        if (typeof updateSidebarPassBtn === 'function') updateSidebarPassBtn();
      }
      return window.USER_PROFILE;
    }
  } catch (err) {
    console.warn("Erreur synchronisation profil distant:", err);
  }
  return null;
};

// ==================== GESTION DU PROFIL UTILISATEUR & PASS ====================
window.loadUserProfile = async function() {
  try {
    let raw = localStorage.getItem('resumeci_profile');
    if (!raw) {
      // Aucun profil trouvé — l'utilisateur doit s'inscrire
      window.USER_PROFILE = null;
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed && ('password' in parsed || 'passwordHash' in parsed)) {
      delete parsed.password;
      delete parsed.passwordHash;
      localStorage.setItem('resumeci_profile', JSON.stringify(parsed));
    }
    window.USER_PROFILE = parsed;
    setTimeout(() => {
      if (typeof window.syncUserProfileFromRemote === 'function') {
        window.syncUserProfileFromRemote();
      }
    }, 150);
    return window.USER_PROFILE;
  } catch(e) {
    console.warn("Erreur chargement profil:", e);
  }
  return null;
};

window.saveUserProfile = async function(firstName, lastName, selectedClass, whatsapp, password, tierKey) {
  try {
    // Le tier est déterminé par le choix de l'utilisateur lors de l'inscription
    const isPaid = tierKey && tierKey !== 'free';
    const profile = {
      uid: 'user_' + Date.now(),
      firstName: firstName,
      lastName: lastName,
      selectedClass: selectedClass,
      whatsapp: whatsapp,
      isPremium: isPaid,
      premiumPlan: tierKey || 'free',
      premiumExpiresAt: isPaid ? Date.now() + (30 * 24 * 60 * 60 * 1000) : 0,
      createdAt: new Date().toISOString()
    };
    window.USER_PROFILE = profile;
    localStorage.setItem('resumeci_profile', JSON.stringify(profile));

    try {
      if (typeof window.joinWaitlist === 'function') {
        window.joinWaitlist(whatsapp, `Profil: ${selectedClass} - ${firstName} ${lastName}`);
      }
    } catch(e){}

    try {
      const today = getLocalDateStr();
      saveStreakData({ count: 1, lastDay: today, lastActiveAt: Date.now() });
      if (typeof updateTopbarStreak === 'function') updateTopbarStreak();
    } catch(e){}

    if (typeof updateSidebarPassBtn === 'function') updateSidebarPassBtn();
    if (typeof updateAudioFabVisual === 'function') updateAudioFabVisual();

    return { success: true, profile: profile };
  } catch(e) {
    console.error("Erreur saveUserProfile:", e);
    return { error: "Erreur lors de l'enregistrement de ton profil." };
  }
};

window.loginUserProfile = async function(firstName, lastName, whatsapp, password) {
  // Authentification uniquement côté serveur : aucun mot de passe n'est stocké ni comparé dans le navigateur
  try {
    const cleanWa = String(whatsapp || '').replace(/\D/g, '').slice(-10);
    const res = await fetch(`${window.getPaymentApiBase()}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ whatsapp: cleanWa, password: password })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.success || !data.profile) {
      return { error: (data && data.error) || "Identifiants invalides." };
    }
    const { password: _pw, passwordHash: _ph, ...profile } = data.profile;
    window.USER_PROFILE = profile;
    localStorage.setItem('resumeci_profile', JSON.stringify(profile));
    if (typeof updateSidebarPassBtn === 'function') updateSidebarPassBtn();
    if (typeof updateAudioFabVisual === 'function') updateAudioFabVisual();
    return { success: true, profile: profile };
  } catch(e) {
    return { error: "Impossible de joindre le serveur de connexion. Réessaie dans quelques secondes." };
  }
};

window.updateUserProfile = async function(firstName, lastName, selectedClass, whatsapp) {
  try {
    if (!window.USER_PROFILE) window.USER_PROFILE = {};
    window.USER_PROFILE.firstName = firstName;
    window.USER_PROFILE.lastName = lastName;
    window.USER_PROFILE.selectedClass = selectedClass;
    window.USER_PROFILE.whatsapp = whatsapp;
    localStorage.setItem('resumeci_profile', JSON.stringify(window.USER_PROFILE));
    if (typeof updateSidebarPassBtn === 'function') updateSidebarPassBtn();
    if (typeof updateAudioFabVisual === 'function') updateAudioFabVisual();
    return { success: true, profile: window.USER_PROFILE };
  } catch(e) {
    return { error: "Erreur lors de la modification du profil." };
  }
};

window.logoutUser = function() {
  ['resumeci_profile', 'user_profile', 'resumeci_user', 'resumeci_student_user'].forEach(k => localStorage.removeItem(k));
  window.USER_PROFILE = null;
  document.getElementById('viewProfileModalOverlay')?.classList.remove('show');
  if (typeof updateSidebarPassBtn === 'function') updateSidebarPassBtn();
  if (typeof updateAudioFabVisual === 'function') updateAudioFabVisual();
  // Redirection automatique vers la page de connexion
  window.location.href = '/connexion.html';
};

window.userHasFeature = function(featureName) {
  if (!window.USER_PROFILE) return false;
  
  // Vérification de la validité de l'abonnement
  const isPremium = !!window.USER_PROFILE.isPremium;
  const expiresAt = Number(window.USER_PROFILE.premiumExpiresAt) || 0;
  if (!isPremium || (expiresAt > 0 && expiresAt < Date.now())) {
    return false; // Pas d'abonnement actif
  }

  const plan = (window.USER_PROFILE.premiumPlan || 'free').toLowerCase();
  const fn = String(featureName || '').toLowerCase();

  // Fonctionnalités incluses dès le Pass Starter (500 F/mois) :
  const isStarterFeature = 
    fn.includes('hors-ligne') || 
    fn.includes('pack') || 
    fn.includes('pdf') || 
    fn.includes('surlign') || 
    fn.includes('note') || 
    fn.includes('stat');

  // Fonctionnalités réservées au Pass Pro (1 000 F/mois) :
  const isProFeature = 
    fn.includes('récitation') || 
    fn.includes('recitation') || 
    fn.includes('recall') || 
    fn.includes('piège') || 
    fn.includes('piege') || 
    fn.includes('audio') || 
    fn.includes('podcast') || 
    fn.includes('flashcard') || 
    fn.includes('quiz') ||
    fn.includes('plan') ||
    fn.includes('planning');

  // Fonctionnalités réservées au Pass Élite (2 000 F/mois) :
  const isEliteFeature = 
    fn.includes('professeur') || 
    fn.includes('ia') || 
    fn.includes('sujet') || 
    fn.includes('examen') || 
    fn.includes('annale') || 
    fn.includes('simulateur');

  if (plan === 'starter') {
    return isStarterFeature;
  }
  if (plan === 'pro') {
    return isStarterFeature || isProFeature;
  }
  if (plan === 'elite') {
    return isStarterFeature || isProFeature || isEliteFeature;
  }
  // VIP et Annuel : accès TOTAL à toutes les fonctionnalités
  if (plan === 'vip' || plan === 'annual' || plan === 'annuel') {
    return true;
  }

  return false;
};

async function loadData() {
  redirectToPrimaryDomain();
  if (window.loadUserProfile) {
    await window.loadUserProfile();
  }
  const [struct, stats] = await Promise.all([
    fetch('/data/structure.json').then(r => r.json()),
    fetch('/data/stats.json').then(r => r.json()),
  ]);
  DATA.structure = struct;
  DATA.stats = stats;
  window.DATA = DATA;
  if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');
  renderSidebar();
  renderFavsSidebar();
  checkAutoNight();
  if (typeof checkStreakValidity === 'function') {
    checkStreakValidity();
  }
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme)
    document.querySelectorAll('.theme-dot').forEach(d => d.classList.toggle('active', d.dataset.theme === savedTheme));
  if (typeof handleInitialRoute === 'function') handleInitialRoute();
  else showDashboard();
  if (typeof updateTopbarStreak === 'function') {
    updateTopbarStreak();
  }
  window.getPaymentApiBase = function() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://127.0.0.1:3000';
    }
    return window.RESUMECI_API_URL || 'https://resumeci-payment-api.onrender.com';
  };
  checkForUpdates();
  const urlParams = new URLSearchParams(window.location.search);
  const paymentStatus = urlParams.get('payment');
  const storedPendingRef = sessionStorage.getItem('last_payment_reference');
  const storedPendingTier = sessionStorage.getItem('last_payment_tier') || 'pro';

  if (paymentStatus === 'success' || urlParams.get('payment_success') || storedPendingRef) {
    const tier = urlParams.get('tier') || storedPendingTier || 'starter';
    const targetUid = urlParams.get('uid') || window.USER_PROFILE?.uid;
    const reference = urlParams.get('reference') || urlParams.get('payment_reference') || urlParams.get('ref') || storedPendingRef || '';
    if (paymentStatus === 'success') {
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (targetUid || reference) {
      setTimeout(async () => {
        try {
          const apiBase = window.getPaymentApiBase();
          // 1. Si référence présente, interroger directement check-payment
          let confirmData = null;
          if (reference) {
            try {
              const chkRes = await fetch(`${apiBase}/api/check-payment/${encodeURIComponent(reference)}`);
              confirmData = await chkRes.json();
            } catch(e) {}
          }

          // 2. Si pas encore validé, tenter confirm-payment
          if (!confirmData || !confirmData.success || confirmData.status !== 'completed') {
            const confirmRes = await fetch(`${apiBase}/api/confirm-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ uid: targetUid || window.USER_PROFILE?.uid, tierKey: tier, reference: reference })
            });
            confirmData = await confirmRes.json();
          }

          if (confirmData && confirmData.success && (confirmData.isPremium || confirmData.status === 'completed')) {
            sessionStorage.removeItem('last_payment_reference');
            sessionStorage.removeItem('last_payment_tier');
            const unlockedTier = confirmData.tierKey || tier;
            if (window.USER_PROFILE) {
              window.USER_PROFILE.premiumPlan = unlockedTier;
              window.USER_PROFILE.isPremium = true;
              window.USER_PROFILE.premiumExpiresAt = confirmData.premiumExpiresAt;
              localStorage.setItem('resumeci_profile', JSON.stringify(window.USER_PROFILE));
            }
            updateAudioFabVisual();
            updateSidebarPassBtn();
            showSubscriptionSuccessModal(unlockedTier, confirmData.premiumExpiresAt);
          } else if (storedPendingRef) {
            // L'élève revient de Wave : lancer une vérification discrète toutes les 4s pendant 40s
            let pollAttempts = 0;
            const pollInterval = setInterval(async () => {
              pollAttempts++;
              const curRef = sessionStorage.getItem('last_payment_reference');
              if (!curRef || pollAttempts > 10) {
                clearInterval(pollInterval);
                return;
              }
              try {
                const pRes = await fetch(`${apiBase}/api/check-payment/${encodeURIComponent(curRef)}`);
                const pData = await pRes.json();
                if (pData.success && pData.status === 'completed') {
                  clearInterval(pollInterval);
                  sessionStorage.removeItem('last_payment_reference');
                  sessionStorage.removeItem('last_payment_tier');
                  const pTier = pData.tierKey || tier;
                  if (window.USER_PROFILE) {
                    window.USER_PROFILE.premiumPlan = pTier;
                    window.USER_PROFILE.isPremium = true;
                    window.USER_PROFILE.premiumExpiresAt = pData.premiumExpiresAt;
                    localStorage.setItem('resumeci_profile', JSON.stringify(window.USER_PROFILE));
                  }
                  updateAudioFabVisual();
                  updateSidebarPassBtn();
                  showSubscriptionSuccessModal(pTier, pData.premiumExpiresAt);
                }
              } catch(e) {}
            }, 4000);
          }
        } catch(e) {
          console.error("Erreur confirmation paiement:", e);
        }
      }, 500);
    }
  }
  updateAudioFabVisual();
  updateSidebarPassBtn();
  if (!window.USER_PROFILE) {
    window.location.href = '/connexion.html';
    return;
  }
}

function showSubscriptionSuccessModal(tier, expiresAt) {
  const modal = document.getElementById('subscriptionSuccessModal');
  if (!modal) return;
  const planName = tier === 'pro' ? 'Pro' : 'Starter';
  const name = window.USER_PROFILE?.firstName || 'Champion';
  
  const titleEl = document.getElementById('subSuccessTitle');
  if (titleEl) titleEl.textContent = `Félicitations ${name} ! 🎉`;
  
  const subEl = document.getElementById('subSuccessSubtitle');
  if (subEl) subEl.textContent = `Ton abonnement Pass ${planName} (Mensuel) est activé !`;
  
  const expEl = document.getElementById('subSuccessExpiryBadge');
  if (expEl) {
    const d = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 30*24*3600*1000);
    expEl.textContent = `⏳ Valable 30 jours • Jusqu'au ${d.toLocaleDateString('fr-FR')}`;
  }

  const proPerks = document.getElementById('subSuccessProPerks');
  if (proPerks) {
    proPerks.style.display = tier === 'pro' ? 'flex' : 'none';
  }

  modal.classList.add('show');
}
window.showSubscriptionSuccessModal = showSubscriptionSuccessModal;

function closeSubscriptionSuccessModal() {
  document.getElementById('subscriptionSuccessModal')?.classList.remove('show');
  updateAudioFabVisual();
  if (typeof showDashboard === 'function') {
    showDashboard();
  }
  if (window.toast) toast('🚀 Toutes tes fonctionnalités sont débloquées ! Bonnes révisions !', 'success', 5000);
}
window.closeSubscriptionSuccessModal = closeSubscriptionSuccessModal;

function updateAudioFabVisual() {
  const fab = document.getElementById('audioFab');
  if (!fab) return;
  const hasAudio = window.userHasFeature ? window.userHasFeature('Audio (Podcast)') : false;
  if (!hasAudio) {
    fab.setAttribute('title', '🔒 Lecture Audio — Pass Pro requis');
    fab.style.background = '#64748b';
    fab.innerHTML =
      '<i class="fas fa-volume-up"></i><span style="position:absolute;top:-4px;right:-4px;background:#f59e0b;border-radius:50%;width:16px;height:16px;font-size:9px;display:flex;align-items:center;justify-content:center;">🔒</span>';
    fab.style.overflow = 'visible';
  } else {
    fab.setAttribute('title', 'Lire la fiche à voix haute');
    fab.style.background = '#2563eb';
    fab.innerHTML = '<i class="fas fa-volume-up"></i>';
    fab.style.overflow = '';
  }
}

function updateSidebarPassBtn() {
  const btn = document.getElementById('sidebarPassBtn');
  if (!btn) return;
  const activeSub = window.hasActiveSubscription ? window.hasActiveSubscription() : null;
  if (activeSub) {
    btn.style.background = 'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(5,150,105,0.25))';
    btn.style.borderColor = 'rgba(16,185,129,0.5)';
    btn.style.color = '#6ee7b7';
    btn.innerHTML = `<i class="fas fa-check-circle" style="color:#10b981"></i> Mon Pass ${activeSub.tier.toUpperCase()} Actif ✓`;
    btn.onclick = () => { if (typeof showActiveSubscriptionModal === 'function') showActiveSubscriptionModal(); };
  } else {
    btn.style.background = 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(217,119,6,0.2))';
    btn.style.borderColor = 'rgba(245,158,11,0.4)';
    btn.style.color = '#fde68a';
    btn.innerHTML = `<i class="fas fa-crown"></i> Activer mon Pass Réussite 🔒`;
    btn.onclick = () => { if (typeof openElitePassModal === 'function') openElitePassModal('Pass Réussite'); };
  }
}
window.updateSidebarPassBtn = updateSidebarPassBtn;
const CURRENT_APP_VERSION = '3.3.4';
const VERSION_KEY = 'resumeci_last_version';
const UPDATE_DISMISSED_KEY = 'resumeci_update_dismissed';
let isAppReloading = false;

async function forcePurgeAndReload(newVersion) {
  if (isAppReloading) return;
  isAppReloading = true;
  console.log('🚀 [ResumeCI] Mise à jour forcée vers v' + newVersion + ' — Purge complète du cache...');
  try {
    localStorage.setItem(VERSION_KEY, newVersion);
    localStorage.setItem('rci_app_v', newVersion);
    if ('caches' in window) {
      const ks = await caches.keys();
      await Promise.all(ks.map(k => caches.delete(k)));
    }
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'PURGE_ALL_CACHE' });
    }
  } catch (e) {
    console.error('Erreur purge cache:', e);
  }
  window.location.reload(true);
}

async function checkForUpdates() {
  try {
    const versionData = await fetch('/data/version.json?v=' + Date.now(), { cache: 'no-store' })
      .then(r => r.json())
      .catch(() => null);
    if (!versionData) return;
    const lastVersion = localStorage.getItem(VERSION_KEY);
    
    if (versionData.version !== lastVersion) {
      if (versionData.forceReload || versionData.forcePurgeCache) {
        await forcePurgeAndReload(versionData.version);
        return;
      }
      const dismissedVersion = localStorage.getItem(UPDATE_DISMISSED_KEY);
      if (versionData.forceShow || dismissedVersion !== versionData.version) {
        showUpdateNotification(versionData);
      }
      localStorage.setItem(VERSION_KEY, versionData.version);
    }
    updateUpdateBadge(versionData.version !== lastVersion);
  } catch (e) {
    console.warn('Update check failed', e);
  }
}
function showUpdateNotification(data) {
  const overlay = document.createElement('div');
  overlay.id = 'updateOverlay';
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(10px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn .3s ease';
  const features = data.features
    ? data.features
        .map(
          f =>
            `<li style="margin:6px 0;padding-left:20px;position:relative"><span style="position:absolute;left:0;color:#10b981">✓</span>${f}</li>`
        )
        .join('')
    : '';
  overlay.innerHTML = `\n        <div style="width:100%;max-width:420px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.3);animation:slideUp .5s cubic-bezier(.2,1,.3,1)">\n          <div style="background:linear-gradient(135deg,#7c3aed,#2563eb);padding:24px 20px;text-align:center;color:#fff">\n            <div style="font-size:40px;margin-bottom:10px">🎉</div>\n            <h2 style="font-size:20px;font-weight:800;margin:0 0 6px">${data.title || 'Mise à jour disponible !'}</h2>\n            <p style="font-size:13px;opacity:.9;margin:0">Version ${data.version} • ${data.date || ''}</p>\n          </div>\n          <div style="padding:20px">\n            <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 16px">${data.message || 'Nouvelles fonctionnalités disponibles !'}</p>\n            ${features ? `<ul style="list-style:none;padding:0;margin:0 0 20px;font-size:13px;color:#334155;background:#f8fafc;border-radius:12px;padding:16px">${features}</ul>` : ''}\n            <div style="display:flex;gap:10px">\n              <button id="updateDismiss" style="flex:1;padding:12px;border:1px solid #e2e8f0;background:#fff;border-radius:10px;font-size:13px;font-weight:600;color:#64748b;cursor:pointer;transition:.2s">Plus tard</button>\n              <button id="updateReload" style="flex:1;padding:12px;border:none;background:linear-gradient(135deg,#7c3aed,#2563eb);border-radius:10px;font-size:13px;font-weight:700;color:#fff;cursor:pointer;transition:.2s">Actualiser</button>\n            </div>\n          </div>\n        </div>\n      `;
  document.body.appendChild(overlay);
  document.getElementById('updateDismiss').addEventListener('click', () => {
    localStorage.setItem(UPDATE_DISMISSED_KEY, data.version);
    overlay.remove();
  });
  document.getElementById('updateReload').addEventListener('click', async () => {
    try {
      if ('caches' in window) {
        const ks = await caches.keys();
        await Promise.all(ks.map(k => caches.delete(k)));
      }
    } catch (e) {}
    location.reload(true);
  });
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      localStorage.setItem(UPDATE_DISMISSED_KEY, data.version);
      overlay.remove();
    }
  });
}
function updateUpdateBadge(hasUpdate) {
  const logo = document.querySelector('.sidebar-header h1');
  if (!logo) return;
  let badge = logo.querySelector('.update-badge');
  if (hasUpdate) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'update-badge';
      badge.style.cssText =
        'background:#ef4444;color:#fff;font-size:9px;padding:2px 6px;border-radius:10px;margin-left:6px;animation:pulse-badge 2s infinite';
      badge.textContent = '1';
      logo.appendChild(badge);
    }
  } else if (badge) {
    badge.remove();
  }
}
async function loadSearchIndex() {
  if (SEARCH_INDEX.length) return;
  SEARCH_INDEX = await fetch('/data/search-index.json')
    .then(r => r.json())
    .catch(() => []);
  window.SEARCH_INDEX = SEARCH_INDEX;
}
window.loadSearchIndex = loadSearchIndex;
function renderSidebar() {
  const nav = document.getElementById('sidebarNav');
  let h = '';
  let classesToRender = getOrderedClasses(DATA.structure);
  if (window.USER_PROFILE && window.USER_PROFILE.selectedClass) {
    classesToRender = classesToRender.filter(([cls]) => cls === window.USER_PROFILE.selectedClass);
  }
  for (const [cls, subjects] of classesToRender) {
    const total = Object.values(subjects).reduce((s, a) => s + a.length, 0);
    const clsIcon =
      cls === 'Terminale_A' ? '🅰️' : cls === 'Terminale_D' ? '🅳' : cls === '5eme' ? '5️⃣' : cls === '3eme' ? '3️⃣' : '📘';
    h += `<div class="nav-class"><div class="nav-class-header" onclick="this.parentElement.classList.toggle('open')"><i class="fas fa-chevron-right chevron"></i><span>${clsIcon} ${cls.replace('_', ' ')}</span><span class="badge">${total}</span></div><div class="nav-subjects">`;
    for (const [sub, fiches] of Object.entries(subjects)) {
      h += `<div class="nav-subject"><div class="nav-subject-header" onclick="this.parentElement.classList.toggle('open')"><i class="fas fa-chevron-right chevron"></i><span>${getIcon(sub)} ${sub}</span><span class="count">${fiches.length}</span></div><div class="nav-lessons">`;
      for (let fi = 0; fi < fiches.length; fi++) {
        const f = fiches[fi];
        h += `<a class="nav-lesson" data-cls="${cls}" data-sub="${sub}" data-idx="${fi}" data-path="${f.path}" title="${f.name}">${f.name}</a>`;
      }
      h += `</div></div>`;
    }
    h += `</div></div>`;
  }
  nav.innerHTML = h;
  nav.querySelectorAll('.nav-lesson').forEach(el => {
    el.addEventListener('click', () => {
      const cls = el.dataset.cls,
        sub = el.dataset.sub,
        idx = parseInt(el.dataset.idx);
      const file = DATA.structure[cls][sub][idx].file;
      document.querySelector('.sidebar')?.classList.remove('mobile-open');
      document.getElementById('mobileOverlay')?.classList.remove('show');
      showFiche(cls, sub, file);
    });
  });
}
window.submitProfile = async function () {
  const btn = document.getElementById('pmSubmitBtn');
  const isEditing = !!(window.USER_PROFILE && window.USER_PROFILE.uid && document.getElementById('pmPasswordGroup')?.style.display === 'none');

  const fName = document.getElementById('pmFirstName').value.trim();
  const lName = document.getElementById('pmLastName').value.trim();
  const cls = document.getElementById('pmClass').value;
  const wa = document.getElementById('pmWhatsapp').value.trim();
  const pwd = document.getElementById('pmPassword').value;

  // Validation stricte de tous les champs
  if (!fName || !lName || !cls || !wa) {
    window.showActionNotice({
      type: 'warning',
      icon: '⚠️',
      title: 'Champs Incomplets',
      subtitle: 'Inscription & Profil',
      message: 'Tous les champs (Prénom, Nom, Classe et WhatsApp) sont impérativement obligatoires pour enregistrer ton profil.',
      primaryBtnText: 'Compléter mes informations'
    });
    return;
  }
  const cleanWa = wa.replace(/\D/g, '');
  if (cleanWa.length < 10) {
    window.showActionNotice({
      type: 'warning',
      icon: '📱',
      title: 'Numéro WhatsApp Invalide',
      subtitle: `${cleanWa.length}/10 chiffres saisis`,
      message: "En Côte d'Ivoire, les numéros mobiles comportent exactement 10 chiffres (ex: 0708091011 ou 0102030405).\n\nVérifie et corrige ton numéro pour valider ton compte.",
      primaryBtnText: 'Modifier le numéro'
    });
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = isEditing ? 'Sauvegarde en cours...' : 'Création du profil...';
  }

  // Mode Édition du profil existant
  if (isEditing) {
    if (window.updateUserProfile) {
      const res = await window.updateUserProfile(fName, lName, cls, wa);
      if (res && res.error) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Enregistrer les modifications 💾';
        }
        window.showActionNotice({
          type: 'error',
          icon: '❌',
          title: 'Erreur de mise à jour',
          subtitle: 'Modification de profil',
          message: res.error,
          primaryBtnText: 'Réessayer'
        });
        return;
      }
    }
    closeProfileEditModal();
    renderSidebar();
    showDashboard(false);
    openProfileView();
    if (window.toast) toast("✅ Profil mis à jour avec succès !", "success");
    return;
  }

  // Mode Inscription initiale
  if (!pwd || pwd.length < 8) {
    window.showActionNotice({
      type: 'warning',
      icon: '🔒',
      title: 'Mot de passe trop court',
      subtitle: 'Sécurité de ton compte',
      message: 'Le mot de passe doit comporter au moins 8 caractères pour sécuriser tes fiches et tes statistiques.',
      primaryBtnText: 'Modifier le mot de passe'
    });
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Commencer à réviser 🚀';
    }
    return;
  }

  if (window.saveUserProfile) {
    const res = await window.saveUserProfile(fName, lName, cls, wa, pwd);
    if (!res || res.error) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Commencer à réviser 🚀';
      }
      window.showActionNotice({
        type: 'error',
        icon: '⚠️',
        title: 'Échec de l\'inscription',
        subtitle: 'Création de compte',
        message: res?.error || "Erreur lors de l'inscription. Vérifie tes informations ou connecte-toi si tu as déjà un compte.",
        primaryBtnText: 'Vérifier'
      });
      return;
    }
  }
  document.getElementById('profileModalOverlay')?.classList.remove('show');
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Commencer à réviser 🚀';
  }
  renderSidebar();
  showDashboard(false);
  showStreakWelcomeModal();
};

window.openProfileEditModal = function() {
  document.getElementById('viewProfileModalOverlay')?.classList.remove('show');
  window.location.href = '/inscription.html?edit=1';
};

window.closeProfileEditModal = function() {
  document.getElementById('viewProfileModalOverlay')?.classList.remove('show');
};

window.submitLogin = async function () {
  const btn = document.getElementById('lmSubmitBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Connexion...';
  }
  const fName = document.getElementById('lmFirstName').value.trim();
  const lName = document.getElementById('lmLastName').value.trim();
  const wa = document.getElementById('lmWhatsapp').value.trim();
  const pwd = document.getElementById('lmPassword').value;

  if (!fName || !lName || !wa || !pwd) {
    window.showActionNotice({
      type: 'warning',
      icon: '⚠️',
      title: 'Champs Manquants',
      subtitle: 'Connexion à ton compte',
      message: 'Tous les champs sont obligatoires pour te connecter à ton espace élève.',
      primaryBtnText: 'Remplir mes identifiants'
    });
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Se Connecter';
    }
    return;
  }

  if (window.loginUserProfile) {
    const res = await window.loginUserProfile(fName, lName, wa, pwd);
    if (res && res.profile) {
      document.getElementById('loginModalOverlay')?.classList.remove('show');
      renderSidebar();
      showDashboard(false);
      if (window.toast) toast('Content de te revoir !', 'success');
    } else {
      window.showActionNotice({
        type: 'error',
        icon: '🔑',
        title: 'Connexion Impossible',
        subtitle: 'Identifiants non reconnus',
        message: res?.error || "Nom, prénom, numéro WhatsApp ou mot de passe incorrect. Vérifie tes informations et réessaie.",
        primaryBtnText: 'Réessayer'
      });
    }
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Se Connecter';
  }
};

window.openLoginModal = function () {
  window.location.href = '/connexion.html';
};

window.openProfileView = function () {
  if (!window.USER_PROFILE) {
    window.location.href = '/connexion.html';
    return;
  }

  function renderProfileDetails() {
    if (!window.USER_PROFILE) return;
    const fullName = `${window.USER_PROFILE.firstName || ''} ${window.USER_PROFILE.lastName || ''}`.trim() || 'Élève';
    const clsDisplay = (window.USER_PROFILE.selectedClass || '').replace('_', ' ') || 'Non définie';
    const waDisplay = window.USER_PROFILE.whatsapp || 'Non renseigné';
    
    const fnEl = document.getElementById('vpFullName');
    if (fnEl) fnEl.textContent = fullName;
    
    const clsEl = document.getElementById('vpClass');
    if (clsEl) clsEl.textContent = clsDisplay;

    const waEl = document.getElementById('vpWhatsapp');
    if (waEl) waEl.textContent = waDisplay;

    const badgeEl = document.getElementById('vpPlanBadge');
    if (badgeEl) {
      const isPrem = Boolean(window.USER_PROFILE.isPremium);
      const plan = (window.USER_PROFILE.premiumPlan || 'free').toLowerCase();
      const expiresAt = Number(window.USER_PROFILE.premiumExpiresAt) || 0;
      const now = Date.now();
      const isActive = isPrem && plan !== 'free' && (expiresAt === 0 || expiresAt > now);
      if (isActive) {
        const planNames = {
          'starter': 'Starter',
          'pro': 'Pro',
          'elite': 'Élite',
          'vip': 'VIP ⭐',
          'annual': 'Annuel',
          'annuel': 'Annuel'
        };
        const pName = planNames[plan] || plan.toUpperCase();
        let daysLeft = '';
        if (expiresAt > 0) {
          const d = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));
          daysLeft = ` - ${d}j restants`;
        }
        badgeEl.textContent = `👑 Pass ${pName} (Actif${daysLeft})`;
        badgeEl.style.background = plan === 'vip' ? '#f59e0b' : '#10b981';
        badgeEl.style.color = '#fff';
      } else {
        badgeEl.textContent = 'Gratuit (Limité)';
        badgeEl.style.background = '#e2e8f0';
        badgeEl.style.color = '#475569';
      }
    }

    const manageSubBtn = document.getElementById('vpManageSubBtn');
    if (manageSubBtn) {
      const hasSub = window.hasActiveSubscription ? window.hasActiveSubscription() : null;
      manageSubBtn.style.display = hasSub ? 'inline-block' : 'none';
    }
  }

  renderProfileDetails();

  const messages = [
    'Continue tes efforts, la réussite est au bout du chemin ! 🚀',
    'Chaque fiche lue te rapproche de ton objectif. Ne lâche rien ! 💪',
    "C'est la régularité qui fait la différence. Bonnes révisions ! 📚",
    'Tu es sur la bonne voie, crois en toi ! ✨',
  ];
  const msg = messages[Math.floor(Math.random() * messages.length)];
  const msgEl = document.getElementById('vpMessage');
  if (msgEl) msgEl.innerHTML = msg;

  const streakVal = typeof getStreak === 'function' ? getStreak() : 0;
  const streakEl = document.getElementById('vpStreakDays');
  if (streakEl) {
    streakEl.textContent = streakVal === 0 ? '0 jour (Éteinte)' : `${streakVal} jour${streakVal > 1 ? 's' : ''} d'affilée`;
  }

  document.getElementById('viewProfileModalOverlay')?.classList.add('show');

  // Synchronisation en direct depuis Firestore / Serveur
  if (typeof window.syncUserProfileFromRemote === 'function') {
    window.syncUserProfileFromRemote().then(() => {
      renderProfileDetails();
    });
  }
};

/* ==================== MOTEUR DE FLAMME D'ASSIDUITÉ (CYCLE 24H) ==================== */
const STREAK_KEY = 'resumeci_streak';

function getLocalDateStr(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getYesterdayDateStr() {
  return getLocalDateStr(new Date(Date.now() - 864e5));
}

function getStreakData() {
  try {
    let raw = localStorage.getItem(STREAK_KEY);
    if (!raw) {
      const today = getLocalDateStr();
      const initial = { count: 1, lastDay: today, lastActiveAt: Date.now() };
      localStorage.setItem(STREAK_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    return {
      count: Number(parsed.count) || 0,
      lastDay: parsed.lastDay || '',
      lastActiveAt: Number(parsed.lastActiveAt) || 0
    };
  } catch (e) {
    return { count: 1, lastDay: getLocalDateStr(), lastActiveAt: Date.now() };
  }
}

function saveStreakData(data) {
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Erreur sauvegarde streak:', e);
  }
}

function checkStreakValidity() {
  const today = getLocalDateStr();
  const yesterday = getYesterdayDateStr();
  let streak = getStreakData();

  // Si aucune révision n'a jamais été faite
  if (!streak.lastDay || streak.count <= 0) {
    return {
      count: 0,
      isExtinguished: true,
      revisedToday: false,
      hoursLeftToday: 0,
      minutesLeftToday: 0
    };
  }

  // Si la dernière révision date d'avant-hier ou plus vieux (> 24h à 48h sans révision) : Flamme éteinte !
  if (streak.lastDay !== today && streak.lastDay !== yesterday) {
    if (streak.count !== 0) {
      streak.count = 0;
      saveStreakData(streak);
    }
    return {
      count: 0,
      isExtinguished: true,
      revisedToday: false,
      hoursLeftToday: 0,
      minutesLeftToday: 0
    };
  }

  // Calcul du temps restant aujourd'hui avant minuit pour réviser
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  const diffMs = Math.max(0, midnight.getTime() - now.getTime());
  const hoursLeft = Math.floor(diffMs / (1000 * 3600));
  const minutesLeft = Math.floor((diffMs % (1000 * 3600)) / (1000 * 60));

  const revisedToday = (streak.lastDay === today);
  return {
    count: streak.count,
    isExtinguished: false,
    revisedToday,
    hoursLeftToday: hoursLeft,
    minutesLeftToday: minutesLeft
  };
}

function getStreak() {
  const validity = checkStreakValidity();
  return validity.count;
}
window.getStreak = getStreak;

function updateStreak() {
  const today = getLocalDateStr();
  const yesterday = getYesterdayDateStr();
  let streak = getStreakData();
  const now = Date.now();
  let advanced = false;
  let restarted = false;

  // Si déjà révisé aujourd'hui : on met à jour l'heure de révision sans incrémenter le jour (respect des 24h)
  if (streak.lastDay === today) {
    streak.lastActiveAt = now;
    saveStreakData(streak);
    updateTopbarStreak();
    return streak.count;
  }

  // Si révisé hier consécutivement : la série avance de 1 jour !
  if (streak.lastDay === yesterday && streak.count > 0) {
    streak.count++;
    streak.lastDay = today;
    streak.lastActiveAt = now;
    advanced = true;
  } else {
    // Première révision ou flamme qui s'était éteinte : redémarre à 1 jour
    restarted = (streak.count === 0 && streak.lastDay !== '');
    streak.count = 1;
    streak.lastDay = today;
    streak.lastActiveAt = now;
    advanced = true;
  }

  saveStreakData(streak);
  updateTopbarStreak();

  if (advanced && window.toast) {
    if (restarted) {
      toast(`🔥 Flamme rallumée : 1 jour ! Révise demain pour continuer ta série !`, 'success', 4500);
    } else if (streak.count > 1) {
      toast(`🔥 Flamme d'assiduité : ${streak.count} jours consécutifs ! Bravo !`, 'success', 4500);
    } else {
      toast(`🔥 Flamme allumée : 1 jour ! Révise demain pour passer à 2 jours !`, 'success', 4500);
    }
  }

  return streak.count;
}
window.updateStreak = updateStreak;

function getTopbarStreakAndProfileHtml() {
  const s = getStreak();
  const isExtinguished = (s === 0);
  const streakText = `${s} j`;
  const btnClass = isExtinguished ? 'btn btn-streak extinguished' : 'btn btn-streak';
  const btnTitle = isExtinguished
    ? "Flamme éteinte (0 j) - Révise une fiche pour rallumer ta flamme !"
    : `Flamme d'assiduité : ${s} jour${s > 1 ? 's' : ''} consécutif${s > 1 ? 's' : ''} - Clique pour voir tes détails`;
  const name = window.USER_PROFILE?.firstName || 'Profil';
  return `
    <button class="${btnClass}" id="topbarStreakBtn" onclick="openStreakInfoModal()" title="${btnTitle}">
      <span class="flame-icon">🔥</span> <span id="topbarStreakText">${streakText}</span>
    </button>
    <button class="btn btn-profile" id="topbarProfileBtn" onclick="openProfileView()" title="Mon profil">
      <i class="fas fa-user-circle"></i> <span style="max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</span>
    </button>
  `;
}
window.getTopbarStreakAndProfileHtml = getTopbarStreakAndProfileHtml;

function updateTopbarStreak() {
  const s = getStreak();
  const isExtinguished = (s === 0);
  const streakText = `${s} j`;
  const btn = document.getElementById('topbarStreakBtn');
  if (btn) {
    btn.classList.toggle('extinguished', isExtinguished);
    btn.title = isExtinguished
      ? "Flamme éteinte (0 j) - Révise une fiche pour rallumer ta flamme !"
      : `Flamme d'assiduité : ${s} jour${s > 1 ? 's' : ''} consécutif${s > 1 ? 's' : ''} - Clique pour voir tes détails`;
  }
  const el = document.getElementById('topbarStreakText');
  if (el) el.textContent = streakText;
  const profileNameEl = document.querySelector('#topbarProfileBtn span');
  if (profileNameEl && window.USER_PROFILE?.firstName) {
    profileNameEl.textContent = window.USER_PROFILE.firstName;
  }
}
window.updateTopbarStreak = updateTopbarStreak;

function openStreakInfoModal() {
  const info = checkStreakValidity();
  const s = info.count;
  const revisedToday = info.revisedToday;
  const hoursLeft = info.hoursLeftToday;
  const minutesLeft = info.minutesLeftToday;

  const headerEl = document.getElementById('simStreakHeader');
  const iconEl = document.getElementById('simStreakIcon');
  const countTitleEl = document.getElementById('simStreakCountTitle');
  const subtitleEl = document.getElementById('simStreakSubtitle');
  const statusBoxEl = document.getElementById('simStreakStatusBox');
  const statusTextEl = document.getElementById('simStreakStatusText');
  const actionBtnEl = document.getElementById('simStreakBtn');

  if (s === 0) {
    // Flamme éteinte
    if (headerEl) headerEl.style.background = 'linear-gradient(135deg, #475569, #334155)';
    if (iconEl) iconEl.textContent = '💨';
    if (countTitleEl) countTitleEl.textContent = 'Flamme éteinte : 0 jour';
    if (subtitleEl) subtitleEl.textContent = 'Aucune révision enregistrée depuis plus de 24h';
    if (statusBoxEl) {
      statusBoxEl.style.background = '#f8fafc';
      statusBoxEl.style.borderColor = '#cbd5e1';
      statusBoxEl.style.color = '#334155';
    }
    if (statusTextEl) {
      statusTextEl.innerHTML = `
        <div style="font-weight: 800; color: #0f172a; margin-bottom: 6px; font-size: 14px;">❄️ Ta flamme d'assiduité est éteinte</div>
        Pour maintenir ta flamme allumée, le cycle d'apprentissage exige de réviser au moins <strong>une fiche de cours chaque jour (toutes les 24h)</strong>.<br><br>
        📖 <em>Lis une fiche de cours dès aujourd'hui pour allumer ta flamme à 1 jour et relancer ta série !</em>
      `;
    }
    if (actionBtnEl) {
      actionBtnEl.style.background = 'linear-gradient(135deg, #2563eb, #1d4ed8)';
      actionBtnEl.innerHTML = '📖 Rallumer ma flamme (Lire une fiche)';
      actionBtnEl.onclick = function() {
        document.getElementById('streakInfoModal')?.classList.remove('show');
        if (typeof showDashboard === 'function') showDashboard();
      };
    }
  } else if (revisedToday) {
    // Révisé aujourd'hui : flamme protégée
    if (headerEl) headerEl.style.background = 'linear-gradient(135deg, #ea580c, #c2410c)';
    if (iconEl) iconEl.textContent = '🔥';
    if (countTitleEl) countTitleEl.textContent = `Ta Flamme : ${s} jour${s > 1 ? 's' : ''}`;
    if (subtitleEl) subtitleEl.textContent = 'Série d’assiduité active & protégée aujourd’hui';
    if (statusBoxEl) {
      statusBoxEl.style.background = '#fff7ed';
      statusBoxEl.style.borderColor = '#fdba74';
      statusBoxEl.style.color = '#7c2d12';
    }
    if (statusTextEl) {
      statusTextEl.innerHTML = `
        <div style="font-weight: 800; color: #9a3412; margin-bottom: 6px; font-size: 14px;">✅ Cycle du jour validé !</div>
        Tu as révisé aujourd'hui et ta flamme brille de <strong>${s} jour${s > 1 ? 's' : ''} consécutif${s > 1 ? 's' : ''}</strong> ! 🔥<br><br>
        ⏳ <strong>Prochain cycle :</strong> Reviens demain pour lire une nouvelle fiche et faire progresser ta flamme à <strong>${s + 1} jours</strong>.<br>
        <span style="font-size: 12px; opacity: 0.85;">Ta flamme reste sécurisée jusqu'à demain soir.</span>
      `;
    }
    if (actionBtnEl) {
      actionBtnEl.style.background = '#ea580c';
      actionBtnEl.innerHTML = '🔥 Continuer mes révisions';
      actionBtnEl.onclick = function() {
        document.getElementById('streakInfoModal')?.classList.remove('show');
        if (typeof showDashboard === 'function') showDashboard();
      };
    }
  } else {
    // Série en cours mais pas encore révisé aujourd'hui (urgent !)
    if (headerEl) headerEl.style.background = 'linear-gradient(135deg, #d97706, #b45309)';
    if (iconEl) iconEl.textContent = '⏳';
    if (countTitleEl) countTitleEl.textContent = `Ta Flamme : ${s} jour${s > 1 ? 's' : ''}`;
    if (subtitleEl) subtitleEl.textContent = `Attention : Il te reste ${hoursLeft}h ${minutesLeft}min aujourd'hui`;
    if (statusBoxEl) {
      statusBoxEl.style.background = '#fef3c7';
      statusBoxEl.style.borderColor = '#f59e0b';
      statusBoxEl.style.color = '#78350f';
    }
    if (statusTextEl) {
      statusTextEl.innerHTML = `
        <div style="font-weight: 800; color: #b45309; margin-bottom: 6px; font-size: 14px;">⚠️ Ta flamme risque de s'éteindre !</div>
        Tu as une série active de <strong>${s} jour${s > 1 ? 's' : ''}</strong>, mais tu n'as pas encore révisé aujourd'hui.<br><br>
        ⏰ <strong>Temps restant :</strong> Il te reste environ <strong>${hoursLeft}h ${minutesLeft}min</strong> (avant minuit) pour lire au moins une fiche de cours.<br>
        Si tu ne révises pas aujourd'hui, ta flamme retombera à 0 !
      `;
    }
    if (actionBtnEl) {
      actionBtnEl.style.background = 'linear-gradient(135deg, #d97706, #b45309)';
      actionBtnEl.innerHTML = '⚡ Sauver ma flamme maintenant';
      actionBtnEl.onclick = function() {
        document.getElementById('streakInfoModal')?.classList.remove('show');
        if (typeof showDashboard === 'function') showDashboard();
      };
    }
  }

  document.getElementById('streakInfoModal')?.classList.add('show');
}
window.openStreakInfoModal = openStreakInfoModal;

function showStreakWelcomeModal() {
  const today = getLocalDateStr();
  let streak = getStreakData();
  if (streak.count < 1) {
    streak.count = 1;
    streak.lastDay = today;
    streak.lastActiveAt = Date.now();
    saveStreakData(streak);
  }
  updateTopbarStreak();

  const titleEl = document.getElementById('streakWelcomeTitle');
  if (titleEl && window.USER_PROFILE?.firstName) {
    titleEl.textContent = `${window.USER_PROFILE.firstName}, ta flamme est allumée ! 🔥`;
  }
  document.getElementById('streakWelcomeModal')?.classList.add('show');
}
window.showStreakWelcomeModal = showStreakWelcomeModal;

function closeStreakWelcomeModal() {
  document.getElementById('streakWelcomeModal')?.classList.remove('show');
  if (window.toast) {
    toast("🔥 Ta flamme est active ! Révise chaque jour pour ne pas la perdre.", "success", 5000);
  }
}
window.closeStreakWelcomeModal = closeStreakWelcomeModal;

window.initiatePremiumPayment = function (btn, tierKey = 'pro') {
  window.openPaymentCheckoutModal(tierKey);
};

let currentCheckoutTier = 'starter';
let currentCheckoutMethod = 'wave';

window.openPaymentCheckoutModal = function(tierKey = 'pro') {
  if (!window.USER_PROFILE) {
    if (window.toast) toast("Connecte-toi ou crée ton compte en 30 secondes pour activer ton Pass.", 'info');
    window.location.href = '/connexion.html';
    return;
  }

  const TIER_LEVELS = { starter: 1, pro: 2, elite: 3 };
  const activeSub = window.hasActiveSubscription ? window.hasActiveSubscription() : null;
  const currentLevel = activeSub ? (TIER_LEVELS[activeSub.tier] || 0) : 0;
  const targetLevel = TIER_LEVELS[tierKey] || 0;

  // 1. Si l'utilisateur clique sur son forfait déjà actif
  if (activeSub && currentLevel === targetLevel) {
    window.showActiveSubscriptionModal(activeSub, tierKey);
    return;
  }

  // 2. Si l'utilisateur possède déjà une formule supérieure (ex: a Pro et clique sur Starter)
  if (activeSub && currentLevel > targetLevel) {
    window.showActionNotice({
      type: 'info',
      icon: '👑',
      title: 'Formule Supérieure Déjà Active',
      subtitle: `Pass ${activeSub.tier.toUpperCase()} actif`,
      message: `Tu es déjà abonné(e) au Pass ${activeSub.tier === 'pro' ? 'Pro' : 'Élite'}.\n\nCette formule inclut déjà l'intégralité des avantages du Pass Starter et bien plus encore !\n\nTu n'as aucun paiement supplémentaire à effectuer.`,
      primaryBtnText: 'Continuer mes révisions'
    });
    return;
  }

  // 3. Formule Élite (en finalisation)
  if (tierKey === 'elite') {
    if (typeof window.openElitePassModal === 'function') {
      window.openElitePassModal('elite');
    } else if (typeof window.showActionNotice === 'function') {
      window.showActionNotice({
        type: 'vip',
        icon: '👑',
        title: 'Pack Élite en finalisation',
        subtitle: 'Professeur IA & Sujets d\'examen',
        message: "Le Pack Élite (Professeur IA & Sujets d'examen du BAC/BEPC) est actuellement en cours de finalisation par nos professeurs partenaires.\n\n👉 Nous t'invitons à choisir le Pack Starter (500 FCFA/mois) ou le Pack Pro (1000 FCFA/mois) pour réviser dès aujourd'hui !",
        primaryBtnText: '👑 Découvrir Starter & Pro',
        primaryBtnAction: () => {
          if (typeof openPremiumTeaser === 'function') openPremiumTeaser('Pass Réussite Pro');
        },
        secondaryBtnText: 'Continuer'
      });
    }
    return;
  }

  currentCheckoutTier = tierKey;
  currentCheckoutMethod = 'wave'; // Wave 100% par défaut

  const modal = document.getElementById('paymentCheckoutModal');
  if (!modal) return;

  const isPro = tierKey === 'pro';
  const price = isPro ? '1 000' : '500';
  const title = isPro ? 'Pass Pro (1 000 FCFA)' : 'Pass Starter (500 FCFA)';

  const titleEl = document.getElementById('checkoutPlanTitle');
  if (titleEl) titleEl.textContent = `Activer ${title}`;

  const priceBadge = document.getElementById('checkoutPriceBadge');
  if (priceBadge) priceBadge.textContent = `${price} FCFA / 30 jours`;

  // Pré-remplir le numéro si existant dans le profil
  const phoneInput = document.getElementById('checkoutPhoneInput');
  const existingPhone = window.USER_PROFILE?.whatsapp || window.USER_PROFILE?.phone || '';
  if (phoneInput) {
    phoneInput.value = '';
    if (existingPhone) {
      phoneInput.value = existingPhone;
      window.handleCheckoutPhoneInput(phoneInput);
    } else {
      const counter = document.getElementById('checkoutDigitCounter');
      if (counter) counter.textContent = '0 / 10 chiffres';
    }
  }

  // Activer Wave par défaut
  window.selectPaymentMethod('wave');

  // S'assurer que le panneau de paiement s'affiche au-dessus de tout panneau déjà présent
  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }
  modal.style.zIndex = '100050';
  modal.classList.add('show');
};

window.closePaymentCheckoutModal = function() {
  const modal = document.getElementById('paymentCheckoutModal');
  if (modal) {
    modal.classList.remove('show');
  }
};

window.selectPaymentMethod = function(method) {
  currentCheckoutMethod = method;
  document.querySelectorAll('.pm-method-card').forEach(card => {
    card.classList.toggle('active', card.dataset.method === method);
  });

  const isPro = currentCheckoutTier === 'pro';
  const price = isPro ? '1 000' : '500';
  const textEl = document.getElementById('checkoutSubmitText');
  const btn = document.getElementById('checkoutSubmitBtn');

  const names = {
    wave: 'Wave',
    orange_money: 'Orange Money',
    mtn_money: 'MTN MoMo',
    moov_money: 'Moov Money'
  };

  const icons = {
    wave: '🌊',
    orange_money: '🟠',
    mtn_money: '🟡',
    moov_money: '🔵'
  };

  if (textEl) {
    textEl.innerHTML = `${icons[method] || '💳'} Payer ${price} FCFA avec ${names[method] || 'Wave'}`;
  }

  if (btn) {
    if (method === 'wave') {
      btn.style.background = 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)';
      btn.style.boxShadow = '0 4px 15px rgba(2, 132, 199, 0.35)';
    } else if (method === 'orange_money') {
      btn.style.background = 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)';
      btn.style.boxShadow = '0 4px 15px rgba(234, 88, 12, 0.35)';
    } else if (method === 'mtn_money') {
      btn.style.background = 'linear-gradient(135deg, #ca8a04 0%, #a16207 100%)';
      btn.style.boxShadow = '0 4px 15px rgba(202, 138, 4, 0.35)';
    } else if (method === 'moov_money') {
      btn.style.background = 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)';
      btn.style.boxShadow = '0 4px 15px rgba(37, 99, 235, 0.35)';
    }
  }
};

window.handleCheckoutPhoneInput = function(el) {
  if (!el) return;
  let raw = el.value.replace(/\D/g, '');
  if (raw.startsWith('225') && raw.length > 10) {
    raw = raw.slice(3);
  }
  raw = raw.slice(0, 10);

  let formatted = '';
  for (let i = 0; i < raw.length; i++) {
    if (i > 0 && i % 2 === 0) formatted += ' ';
    formatted += raw[i];
  }
  el.value = formatted;

  const count = raw.length;
  const counter = document.getElementById('checkoutDigitCounter');
  const wrap = document.getElementById('checkoutPhoneWrap');

  if (counter) {
    if (count === 10) {
      counter.textContent = '✅ 10/10 (Valide)';
      counter.style.color = '#10b981';
    } else {
      counter.textContent = count + ' / 10 chiffres';
      counter.style.color = '#64748b';
    }
  }

  if (wrap) {
    if (count === 10) {
      wrap.style.borderColor = '#10b981';
    } else {
      wrap.style.borderColor = '';
    }
  }
};

window.submitCheckoutPayment = async function() {
  const btn = document.getElementById('checkoutSubmitBtn');
  const textEl = document.getElementById('checkoutSubmitText');
  const phoneInput = document.getElementById('checkoutPhoneInput');

  let rawPhone = phoneInput ? phoneInput.value.replace(/\D/g, '') : '';
  if (rawPhone.startsWith('225') && rawPhone.length > 10) {
    rawPhone = rawPhone.slice(3);
  }

  if (rawPhone.length < 10) {
    if (window.toast) toast("Veuillez saisir votre numéro à 10 chiffres (ex: 07 12 34 56 78)", "warn");
    phoneInput?.focus();
    return;
  }

  const originalContent = textEl ? textEl.innerHTML : '';
  if (btn) btn.disabled = true;
  if (textEl) {
    textEl.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px"></div> Connexion sécurisée en cours...';
  }

  const name = (window.USER_PROFILE?.firstName || '') + ' ' + (window.USER_PROFILE?.lastName || '');
  const uid = window.USER_PROFILE?.uid || '';
  const email = 'eleve@resumeci.me';
  const fullPhone = '+225' + rawPhone;
  const returnOrigin = window.location.origin;

  try {
    const apiBase = typeof window.getPaymentApiBase === 'function' ? window.getPaymentApiBase() : 'https://resumeci-payment-api.onrender.com';
    const res = await fetch(`${apiBase}/api/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: uid,
        tierKey: currentCheckoutTier,
        paymentMethod: currentCheckoutMethod,
        customerName: name.trim() || 'Élève',
        customerPhone: fullPhone,
        customerEmail: email,
        returnOrigin: returnOrigin
      })
    });

    if (!res.ok) throw new Error("GATEWAY_UNAVAILABLE");
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) throw new Error("GATEWAY_RESPONSE_INVALID");

    const data = await res.json();
    const checkoutUrl = data.checkout_url || data.payment_url;

    if (data.success && checkoutUrl) {
      if (data.reference || data.payment_reference) {
        sessionStorage.setItem('last_payment_reference', data.reference || data.payment_reference);
      }
      window.location.href = checkoutUrl;
      return;
    } else {
      throw new Error(data.error || 'Erreur de paiement');
    }
  } catch (err) {
    console.error("Erreur checkout:", err);
    if (btn) btn.disabled = false;
    if (textEl) textEl.innerHTML = originalContent;

    const pTierLabel = currentCheckoutTier === 'pro' ? 'Pro (1 000 FCFA)' : 'Starter (500 FCFA)';
    window.showActionNotice({
      type: 'error',
      icon: '💳',
      title: 'Paiement temporairement indisponible',
      subtitle: `Pass ${pTierLabel}`,
      message: "La caisse de paiement automatique rencontre une latence. Tu peux régler directement par Wave ou Orange Money et faire activer ton compte immédiatement.",
      primaryBtnText: '📲 Payer par Wave / Orange Money direct',
      onPrimary: () => {
        const waMsg = encodeURIComponent(`Bonjour Haniel_dev, je souhaite activer le Pass ${pTierLabel}. Mon nom: ${name}. Mon numéro: ${fullPhone}.`);
        window.open(`https://wa.me/2250150252467?text=${waMsg}`, '_blank');
      },
      secondaryBtnText: 'Réessayer en ligne'
    });
  }
};
document.addEventListener('DOMContentLoaded', () => {
  const introSeen = localStorage.getItem('rci_intro_seen');
  if (introSeen === '1' || window.USER_PROFILE) {
    const intro = document.getElementById('introScreen');
    if (intro) intro.style.display = 'none';
    const appLayout = document.getElementById('appLayout');
    if (appLayout) appLayout.classList.remove('is-hidden');
  }
  document.getElementById('continueBtn')?.addEventListener('click', () => {
    localStorage.setItem('rci_intro_seen', '1');
    const intro = document.getElementById('introScreen');
    if (intro) intro.style.display = 'none';
    const appLayout = document.getElementById('appLayout');
    if (appLayout) appLayout.classList.remove('is-hidden');
    maybeShowInstallPrompt();
  });
  document.getElementById('installClose').addEventListener('click', dismissInstallPrompt);
  document.getElementById('installBtn').addEventListener('click', installApp);
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('mobileOverlay');
  const menuBtn = document.getElementById('mobileMenuBtn');
  const closeMobileMenu = () => {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('show');
  };
  menuBtn.addEventListener('click', () => {
    sidebar.classList.add('mobile-open');
    overlay.classList.add('show');
  });
  overlay.addEventListener('click', closeMobileMenu);
  document.getElementById('searchInput').addEventListener('input', e => searchLessons(e.target.value));
});
function isStandaloneApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function maybeShowInstallPrompt() {
  if (isStandaloneApp()) return;
  setTimeout(() => {
    if (!isStandaloneApp()) {
      document.getElementById('installPrompt')?.classList.add('show');
    }
  }, 2000);
}
function dismissInstallPrompt() {
  document.getElementById('installPrompt')?.classList.remove('show');
  localStorage.setItem('installPromptDismissedAt', String(Date.now()));
}
function openInstallPrompt() {
  showPwaInstallModal();
}
window.openInstallPrompt = openInstallPrompt;

function refreshInstallButton() {
  const btn = document.getElementById('topbarInstallBtn');
  if (!btn) return;
  btn.style.display = isStandaloneApp() ? 'none' : 'inline-flex';
}

function showPwaInstallModal() {
  const modal = document.getElementById('pwaInstallGuideModal');
  const body = document.getElementById('pwaGuideBody');
  if (!modal || !body) return;

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIos) {
    body.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 38px; margin-bottom: 6px;">🍎</div>
        <h3 style="font-size: 16px; font-weight: 800; margin-bottom: 12px; color: var(--text);">Sur iPhone & iPad (Safari)</h3>
        
        <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 14px; text-align: left; font-size: 13px; line-height: 1.6; color: #334155; margin-bottom: 14px;">
          <div style="display: flex; gap: 10px; margin-bottom: 12px; align-items: flex-start;">
            <span style="background: #2563eb; color: #fff; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; flex-shrink: 0;">1</span>
            <div>En bas de l'écran Safari, appuie sur l'icône <strong>Partager</strong> <span style="font-size: 15px; background: #e2e8f0; padding: 2px 6px; border-radius: 6px;">⎋ / 📤</span></div>
          </div>
          <div style="display: flex; gap: 10px; margin-bottom: 12px; align-items: flex-start;">
            <span style="background: #2563eb; color: #fff; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; flex-shrink: 0;">2</span>
            <div>Fais défiler vers le bas et appuie sur <strong>« Sur l'écran d'accueil »</strong> <span style="color: #2563eb; font-weight: 800; font-size: 15px;">➕</span></div>
          </div>
          <div style="display: flex; gap: 10px; align-items: flex-start;">
            <span style="background: #2563eb; color: #fff; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; flex-shrink: 0;">3</span>
            <div>En haut à droite, appuie sur <strong>« Ajouter »</strong>.</div>
          </div>
        </div>
        
        <p style="font-size: 12px; color: #64748b; margin-bottom: 14px;">✨ L'icône ResumeCI apparaîtra sur ton écran d'accueil comme une application native !</p>
        <button class="pm-btn" onclick="document.getElementById('pwaInstallGuideModal').classList.remove('show');" style="background: #0284c7; margin-top: 0;">J'ai compris 👍</button>
      </div>
    `;
  } else {
    // Android or Chrome
    body.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 38px; margin-bottom: 6px;">🤖</div>
        <h3 style="font-size: 16px; font-weight: 800; margin-bottom: 12px; color: var(--text);">Sur Android (Google Chrome)</h3>
        
        ${deferredInstallPrompt ? `
          <button class="pm-btn" onclick="triggerPwaPrompt()" style="background: linear-gradient(135deg, #10b981, #059669); margin-bottom: 14px; font-size: 14px;">
            📲 Installer l'application en 1 clic
          </button>
          <div style="font-size: 12px; color: #64748b; margin-bottom: 12px;">Ou suis ces 3 étapes simples :</div>
        ` : ''}

        <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 14px; text-align: left; font-size: 13px; line-height: 1.6; color: #334155; margin-bottom: 14px;">
          <div style="display: flex; gap: 10px; margin-bottom: 12px; align-items: flex-start;">
            <span style="background: #10b981; color: #fff; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; flex-shrink: 0;">1</span>
            <div>Dans Chrome, appuie sur les <strong>3 petits points ⋮</strong> en haut à droite.</div>
          </div>
          <div style="display: flex; gap: 10px; margin-bottom: 12px; align-items: flex-start;">
            <span style="background: #10b981; color: #fff; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; flex-shrink: 0;">2</span>
            <div>Sélectionne <strong>« Installer l'application »</strong> ou <strong>« Ajouter à l'écran d'accueil »</strong>.</div>
          </div>
          <div style="display: flex; gap: 10px; align-items: flex-start;">
            <span style="background: #10b981; color: #fff; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; flex-shrink: 0;">3</span>
            <div>Confirme en appuyant sur <strong>« Installer »</strong>.</div>
          </div>
        </div>

        <button class="pm-btn" onclick="document.getElementById('pwaInstallGuideModal').classList.remove('show');" style="background: #10b981; margin-top: 0;">Fermer</button>
      </div>
    `;
  }

  modal.classList.add('show');
}
window.showPwaInstallModal = showPwaInstallModal;

async function triggerPwaPrompt() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice && choice.outcome === 'accepted') {
      document.getElementById('pwaInstallGuideModal')?.classList.remove('show');
      document.getElementById('installPrompt')?.classList.remove('show');
    }
    deferredInstallPrompt = null;
  }
}
window.triggerPwaPrompt = triggerPwaPrompt;

async function installApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const res = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById('installPrompt')?.classList.remove('show');
    return;
  }
  showPwaInstallModal();
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  refreshInstallButton();
  maybeShowInstallPrompt();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  localStorage.setItem('installPromptDismissedAt', String(Date.now()));
  document.getElementById('installPrompt')?.classList.remove('show');
  refreshInstallButton();
});
function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
}
async function shareSite() {
  const title = CURRENT_FICHE ? CURRENT_FICHE.file.replace(/\.html$/, '') : 'ResumeCI — 714 Fiches BAC & BEPC';
  const text = "🚀 La mise à jour ResumeCI est enfin disponible ! Retrouve 714 fiches de cours gratuites, résumés officiels et outils pour réussir ton année scolaire. Inscris-toi ici : https://resumeci.me/inscription.html";
  const url = 'https://resumeci.me/inscription.html';
  if (navigator.share) await navigator.share({ title: title, text: text, url: url }).catch(() => {});
  else {
    await navigator.clipboard?.writeText(text);
    window.showActionNotice({
      type: 'success',
      icon: '🔗',
      title: 'Message Copié !',
      subtitle: 'Partager ResumeCI',
      message: "Le message et le lien d'inscription (https://resumeci.me/inscription.html) ont été copiés dans ton presse-papier.\n\nTu peux le coller directement sur WhatsApp pour inviter tes camarades de classe !",
      primaryBtnText: 'Super !'
    });
  }
}
function redirectToPrimaryDomain() {
  if (location.hostname === 'resumeci.onrender.com') {
    location.replace(PRIMARY_DOMAIN + location.pathname + location.search + location.hash);
  }
}
function openSearchResult(cls, subject, file) {
  document.querySelector('.sidebar')?.classList.remove('mobile-open');
  document.getElementById('mobileOverlay')?.classList.remove('show');
  showFiche(cls, subject, file);
}
window.showFiche = showFiche;
window.openSearchResult = openSearchResult;
async function searchLessons(query) {
  const q = query.trim().toLowerCase();
  document
    .querySelectorAll('.nav-lesson')
    .forEach(l => (l.style.display = !q || l.textContent.toLowerCase().includes(q) ? '' : 'none'));
  if (q) document.querySelectorAll('.nav-class,.nav-subject').forEach(e => e.classList.add('open'));
  if (q.length < 2) {
    document.querySelector('.search-results')?.remove();
    return;
  }
  await loadSearchIndex();
  const userClass = window.USER_PROFILE?.selectedClass;
  const matches = SEARCH_INDEX.filter(
    item =>
      (!userClass || item.cls === userClass) &&
      (item.name.toLowerCase().includes(q) ||
        item.subject.toLowerCase().includes(q) ||
        item.text.toLowerCase().includes(q))
  ).slice(0, 8);
  const box = document.querySelector('.search-results') || document.createElement('div');
  box.className = 'search-results';
  box.innerHTML = `<h3>Résultats de recherche</h3>${matches.length ? matches.map(item => `<a class="search-result" href="#" onclick="openSearchResult('${esc(item.cls)}','${esc(item.subject)}','${esc(item.file)}');return false"><strong>${item.name}</strong><span>${item.cls.replace('_', ' ')} · ${item.subject}</span></a>`).join('') : '<p style="color:var(--text-muted);font-size:13px;margin-top:8px">Aucun résultat trouvé pour ta classe.</p>'}`;
  document.getElementById('content').prepend(box);
}
function showDashboard(push = true) {
  if (push && window.location.pathname !== '/') history.pushState(null, '', '/');
  CURRENT_FICHE = null;
  window.CURRENT_FICHE = null;
  updatePageTitle('ResumeCI — Fiches de Résumé | Collège & Lycée CI');
  const { stats: stats, structure: structure } = DATA;
  document.getElementById('breadcrumb').innerHTML =
    `<i class="fas fa-home" style="color:var(--accent)"></i><span class="current">Accueil</span>`;
  document.getElementById('topbarActions').innerHTML =
    `<button class="btn" id="topbarInstallBtn" onclick="openInstallPrompt()" style="display:none"><i class="fas fa-download"></i> Installer</button><button class="btn" onclick="toggleDarkMode()"><i class="fas fa-moon"></i> Mode</button><button class="btn" onclick="shareSite()"><i class="fas fa-share-nodes"></i> Partager</button>${getTopbarStreakAndProfileHtml()}`;
  refreshInstallButton();
  let cards = '';
  let classesToRender = getOrderedClasses(structure);
  if (window.USER_PROFILE && window.USER_PROFILE.selectedClass) {
    classesToRender = classesToRender.filter(([cls]) => cls === window.USER_PROFILE.selectedClass);
  }
  for (const [cls, subjects] of classesToRender) {
    const tags = Object.entries(subjects)
      .map(([s, f]) => `<span class="subject-tag">${getIcon(s)} ${s} (${f.length})</span>`)
      .join('');
    const cIcon =
      cls === 'Terminale_A' ? '🅰️' : cls === 'Terminale_D' ? '🅳' : cls === '5eme' ? '5️⃣' : cls === '3eme' ? '3️⃣' : '📘';
    const total = Object.values(subjects).reduce((s, a) => s + a.length, 0);
    const hasOfflinePack = window.userHasFeature ? window.userHasFeature('Pack Hors-Ligne Complet') : false;
    const isDownloaded = isClassDownloaded(cls);
    let dlBtnHtml = '';
    const clsCleanName = cls.replace(/_/g, ' ');
    if (hasOfflinePack) {
      if (isDownloaded) {
        dlBtnHtml = `<button class="dl-btn dl-btn-unlocked downloaded" data-class="${cls}" onclick="event.stopPropagation();downloadClassOffline('${cls}')"><i class="fas fa-check-circle" style="color:#10b981"></i> Pack prêt (${total} fiches) ✓</button>`;
      } else {
        dlBtnHtml = `<button class="dl-btn dl-btn-unlocked" data-class="${cls}" onclick="event.stopPropagation();downloadClassOffline('${cls}')"><i class="fas fa-cloud-arrow-down" style="color:#10b981"></i> Pack Hors-Ligne (${total} fiches)</button>`;
      }
    } else {
      dlBtnHtml = `<button class="dl-btn dl-btn-locked" data-class="${cls}" onclick="event.stopPropagation();window.openPremiumTeaser('Pack Hors-Ligne Complet (${clsCleanName})')"><i class="fas fa-lock"></i> Pack Hors-Ligne (${total} fiches) 🔒</button>`;
    }
    cards += `<div class="class-card" data-cls="${cls}"><h3>${cIcon} ${clsCleanName}</h3><div class="subject-list">${tags}</div>${dlBtnHtml}</div>`;
  }
  let heroTitle = 'Fiches de Résumé';
  let heroDesc = "Collège & Lycée — Côte d'Ivoire";
  if (window.USER_PROFILE && window.USER_PROFILE.firstName) {
    heroTitle = 'Bonjour ' + window.USER_PROFILE.firstName + ' !';
    heroDesc = 'Tes fiches de révision pour la ' + window.USER_PROFILE.selectedClass.replace('_', ' ');
  }
  const totalFichesInView = classesToRender.reduce(
    (s, [_, c]) => s + Object.values(c).reduce((sum, f) => sum + f.length, 0),
    0
  );
  document.getElementById('content').innerHTML =
    `<div class="dashboard"><div class="dashboard-hero"><div class="hero-icon">📚</div><h2>${heroTitle}</h2><p>${heroDesc}</p></div>${getToolsBar()}<div class="stats-grid"><div class="stat-card"><div class="stat-icon color-blue"><i class="fas fa-file-alt"></i></div><div class="stat-number" style="color:var(--accent)">${totalFichesInView}</div><div class="stat-label">Fiches</div></div><div class="stat-card"><div class="stat-icon color-orange"><i class="fas fa-graduation-cap"></i></div><div class="stat-number" style="color:var(--orange)">${classesToRender.length}</div><div class="stat-label">Classes</div></div><div class="stat-card"><div class="stat-icon color-purple"><i class="fas fa-book"></i></div><div class="stat-number" style="color:var(--purple)">${classesToRender.reduce((s, [_, c]) => s + Object.keys(c).length, 0)}</div><div class="stat-label">Matières</div></div></div><div class="class-cards">${cards}</div></div>`;
  document.querySelectorAll('.class-card').forEach(el => el.addEventListener('click', () => showClass(el.dataset.cls)));
  clearActive();
  refreshOfflineStatus();
  if (typeof updateSidebarPassBtn === 'function') updateSidebarPassBtn();
  if (typeof updateAudioFabVisual === 'function') updateAudioFabVisual();
}
function updatePageTitle(title) {
  document.title = title + ' | ResumeCI';
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc && title.includes('Fiche')) {
    metaDesc.setAttribute(
      'content',
      title + ". Fiche de résumé gratuite pour le Collège et Lycée en Côte d'Ivoire. Révisions BAC et BEPC."
    );
  }
}
function showClass(cls, push = true) {
  if (push && window.location.pathname !== '/classes/' + cls) history.pushState(null, '', '/classes/' + cls);
  CURRENT_FICHE = null;
  window.CURRENT_FICHE = null;
  updatePageTitle('Fiches ' + cls.replace('_', ' ') + ' - Toutes matières');
  const subjects = DATA.structure[cls];
  const cIcon =
    cls === 'Terminale_A' ? '🅰️' : cls === 'Terminale_D' ? '🅳' : cls === '5eme' ? '5️⃣' : cls === '3eme' ? '3️⃣' : '📘';
  document.getElementById('breadcrumb').innerHTML =
    `<i class="fas fa-home clickable" style="color:var(--accent)" onclick="showDashboard()"></i><span>/</span><span class="current">${cIcon} ${cls.replace('_', ' ')}</span>`;
  document.getElementById('topbarActions').innerHTML =
    `<button class="btn" onclick="showDashboard()"><i class="fas fa-arrow-left"></i> Retour</button>${getTopbarStreakAndProfileHtml()}`;
  let totalFiches = Object.values(subjects).reduce((s, a) => s + a.length, 0);
  const hasOfflinePack = window.userHasFeature ? window.userHasFeature('Pack Hors-Ligne Complet') : false;
  const isDownloaded = isClassDownloaded(cls);
  const clsCleanName = cls.replace(/_/g, ' ');
  let offlineBannerHtml = '';
  if (hasOfflinePack) {
    if (isDownloaded) {
      offlineBannerHtml = `<div class="class-offline-banner unlocked" onclick="downloadClassOffline('${cls}')" style="border-color:#10b981;background:#ecfdf5;"><div class="cob-left"><span class="cob-badge" style="background:#10b981;color:#fff;">✓ Déjà Enregistré</span><div class="cob-title" style="color:#065f46;"><i class="fas fa-check-circle" style="color:#10b981"></i> Pack Hors-Ligne Prêt (${totalFiches} fiches)</div><div class="cob-desc" style="color:#047857;">Toutes les fiches de ${clsCleanName} sont enregistrées sur ton téléphone. Clique pour synchroniser.</div></div><button class="cob-btn" style="background:#10b981;"><i class="fas fa-check"></i> Prêt hors-ligne</button></div>`;
    } else {
      offlineBannerHtml = `<div class="class-offline-banner unlocked" onclick="downloadClassOffline('${cls}')"><div class="cob-left"><span class="cob-badge" style="background:#10b981;color:#fff;">✨ Pass Débloqué</span><div class="cob-title"><i class="fas fa-cloud-arrow-down" style="color:#10b981"></i> Pack Hors-Ligne • ${totalFiches} fiches</div><div class="cob-desc">Télécharge toutes les fiches de ${clsCleanName} pour réviser sans connexion Internet</div></div><button class="cob-btn" style="background:#10b981;"><i class="fas fa-download"></i> Télécharger</button></div>`;
    }
  } else {
    offlineBannerHtml = `<div class="class-offline-banner" onclick="window.openPremiumTeaser('Pack Hors-Ligne Complet (${clsCleanName})')"><div class="cob-left"><span class="cob-badge">👑 Inclus dès le Pass Starter (500 F)</span><div class="cob-title"><i class="fas fa-lock" style="color:#f59e0b"></i> Pack Hors-Ligne • ${totalFiches} fiches 🔒</div><div class="cob-desc">Télécharge toutes les fiches de ${clsCleanName} pour réviser sans connexion Internet</div></div><button class="cob-btn" onclick="event.stopPropagation();window.openPremiumTeaser('Pack Hors-Ligne Complet (${clsCleanName})')"><i class="fas fa-lock"></i> Télécharger 🔒</button></div>`;
  }
  let h = `<div class="subject-grid"><h2>${cIcon} ${cls.replace('_', ' ')}</h2><p class="subtitle">${Object.keys(subjects).length} matières — ${totalFiches} leçons</p>${offlineBannerHtml}`;
  let i = 0;
  for (const [sub, fiches] of Object.entries(subjects)) {
    h += `<h3 style="margin:20px 0 10px;font-size:15px;color:var(--text-muted)">${getIcon(sub)} ${sub} (${fiches.length})</h3><div class="lessons-grid">`;
    for (let fi = 0; fi < fiches.length; fi++) {
      const f = fiches[fi];
      h += `<div class="lesson-card" data-cls="${cls}" data-sub="${sub}" data-idx="${fi}"><div class="lesson-icon ${getColor(i)}">${getIcon(sub)}</div><div><div class="lesson-name">${f.name}</div><div class="lesson-meta">${sub}</div></div></div>`;
    }
    h += `</div>`;
    i++;
  }
  h += `</div>`;
  document.getElementById('content').innerHTML = h;
  document.querySelectorAll('.lesson-card').forEach(el =>
    el.addEventListener('click', () => {
      const c = el.dataset.cls,
        s = el.dataset.sub,
        idx = parseInt(el.dataset.idx);
      showFiche(c, s, DATA.structure[c][s][idx].file);
    })
  );
  clearActive();
}
async function showFiche(cls, sub, file, push = true) {
  if (push) {
    const url = '/fiches/' + cls + '/' + sub + '/' + file;
    if (window.location.pathname !== url) history.pushState(null, '', url);
  }
  document.getElementById('content').innerHTML = '<div class="loading"><div class="spinner"></div>Chargement...</div>';
  const name = file.replace('Fiche_', '').replace('.md', '');
  updatePageTitle(name + ' - ' + cls.replace('_', ' ') + ' ' + sub);
  document.getElementById('breadcrumb').innerHTML =
    `<i class="fas fa-home clickable" style="color:var(--accent)" onclick="showDashboard()"></i><span>/</span><span class="clickable" onclick="showClass('${esc(cls)}')">${cls.replace('_', ' ')}</span><span>/</span><span style="color:var(--text-muted)">${sub}</span><span>/</span><span class="current">${name}</span>`;
  CURRENT_FICHE = { cls: cls, sub: sub, file: file };
  window.CURRENT_FICHE = CURRENT_FICHE;
  trackFicheRead(cls, sub, file);
  preloadNextFiche(cls, sub, file);
  try {
    const ficheUrl = `/fiches/${encodeURIComponent(cls)}/${encodeURIComponent(sub)}/${encodeURIComponent(file)}`;
    const rawHtml = await fetch(ficheUrl).then(r => r.text());
    const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/);
    const data = { html: bodyMatch ? bodyMatch[1] : rawHtml };
    const favActive = isFavorite(cls, sub, file) ? 'active' : '';
    const hasPdf = window.userHasFeature ? window.userHasFeature('Téléchargement PDF') : false;
    const pdfBtnHtml = hasPdf
      ? `<button class="btn" style="background:#dc2626;color:#fff;border:none;font-weight:700" onclick="downloadCurrentFichePdf()" title="Télécharger PDF officiel"><i class="fas fa-file-pdf"></i> Télécharger PDF</button>`
      : `<button class="btn" style="background:#f59e0b;color:#fff;border:none" onclick="openPremiumTeaser('Téléchargement PDF')" title="PDF (Premium)"><i class="fas fa-file-pdf"></i> PDF 🔒</button>`;
    document.getElementById('topbarActions').innerHTML =
      `<button class="btn" onclick="showClass('${esc(cls)}')"><i class="fas fa-arrow-left"></i> Retour</button><button class="fav-btn ${favActive}" id="favBtn" onclick="const on=toggleFavorite('${esc(cls)}','${esc(sub)}','${esc(file)}');this.classList.toggle('active',on);renderFavsSidebar()" title="Ajouter aux favoris"><i class="fas fa-star"></i></button><button class="btn" onclick="shareSite()"><i class="fas fa-share-nodes"></i> Partager</button>${pdfBtnHtml}${getTopbarStreakAndProfileHtml()}`;
    let html = data.html;
    html = html.replace(
      /<blockquote>\s*<p>📌\s*<strong>(.*?)<\/strong><\/p>\s*<\/blockquote>/g,
      (m, f) => `<div class="formula-block">${f}</div>`
    );
    html = html.replace(
      /<div[^>]*>[^<]{0,20}Créé par[^<]*<strong[^>]*>[^<]*Haniel_dev[^<]*<\/strong>[^<]*<\/div>/gi,
      ''
    );
    html = html.replace(/<div[^>]*>[^<]{0,20}ResumeCI[^<]*Fiches de résumé[^<]*<\/div>/gi, '');
    html = html.replace(/<p[^>]*>[^<]{0,20}Créé par[^<]*Haniel_dev[^<]*<\/p>/gi, '');
    html = html.replace(/<footer[^>]*>[^<]*<\/footer>/gi, '');
    html = preprocessTextFractions(html);
    const hasFlashcards = window.userHasFeature ? window.userHasFeature('Flashcards (Répétition Espacée)') : false;
    const flashcardsBtn = hasFlashcards
      ? `<button onclick="if(typeof startFlashcards==='function') startFlashcards();" style="display:inline-flex;align-items:center;gap:8px;padding:12px 22px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border-radius:12px;font-weight:700;font-size:13.5px;border:none;cursor:pointer;box-shadow:0 4px 12px rgba(16,185,129,0.25);transition:all .2s ease;"><i class="fas fa-clone"></i> Réviser en Flashcards</button>`
      : `<button onclick="if(typeof openPremiumTeaser==='function') openPremiumTeaser('Flashcards (Répétition Espacée)');" style="display:inline-flex;align-items:center;gap:8px;padding:12px 22px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border-radius:12px;font-weight:700;font-size:13.5px;border:none;cursor:pointer;box-shadow:0 4px 12px rgba(16,185,129,0.25);transition:all .2s ease;"><i class="fas fa-clone"></i> Réviser en Flashcards 🔒</button>`;
    const hasQuiz = window.userHasFeature ? window.userHasFeature('Quiz Interactif') : false;
    const quizBtn = hasQuiz
      ? `<button onclick="if(typeof startQuiz==='function') startQuiz('${esc(cls)}', '${esc(sub)}', '${esc(file)}');" style="display:inline-flex;align-items:center;gap:8px;padding:12px 22px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border-radius:12px;font-weight:700;font-size:13.5px;border:none;cursor:pointer;box-shadow:0 4px 12px rgba(99,102,241,0.25);transition:all .2s ease;"><i class="fas fa-gamepad"></i> Quiz de la fiche</button>`
      : `<button onclick="if(typeof openPremiumTeaser==='function') openPremiumTeaser('Quiz Interactif');" style="display:inline-flex;align-items:center;gap:8px;padding:12px 22px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border-radius:12px;font-weight:700;font-size:13.5px;border:none;cursor:pointer;box-shadow:0 4px 12px rgba(99,102,241,0.25);transition:all .2s ease;"><i class="fas fa-gamepad"></i> Quiz de la fiche 🔒</button>`;
    
    // 1 A, 1 B, 1 C: Outils d'Étude & Pièges d'Examen
    const studyBarHtml = typeof window.getFicheStudyBarHtml === 'function' ? window.getFicheStudyBarHtml(cls, sub, file) : '';
    const examTrapsHtml = typeof window.getExamTrapsHtml === 'function' ? window.getExamTrapsHtml(cls, sub, file) : '';

    document.getElementById('content').innerHTML =
      `<div class="fiche-view">${studyBarHtml}<div class="fiche-content" style="position:relative">${html}${examTrapsHtml}</div><div class="fiche-actions" style="margin-top:24px;display:flex;gap:10px;flex-wrap:wrap;justify-content:center">${flashcardsBtn}${quizBtn}<button onclick="shareSite()" style="display:inline-flex;align-items:center;gap:8px;padding:12px 22px;background:#0f172a;color:#fff;border:none;border-radius:12px;font-weight:700;font-size:13.5px;cursor:pointer;box-shadow:0 4px 12px rgba(15,23,42,0.2);"><i class="fas fa-share-nodes"></i> Partager</button></div><div style="margin-top:16px;text-align:center"><a href="https://wa.me/2250150252467?text=Bonjour%20Haniel_dev%20!%20J'ai%20une%20question%20sur%20la%20fiche%20:%20${encodeURIComponent(name)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#25d366;color:#fff;border-radius:20px;font-weight:600;font-size:12px;text-decoration:none;transition:.2s"><i class="fab fa-whatsapp"></i> Haniel_dev</a><a href="https://wa.me/2250104911010?text=Bonjour%20Assistance%20ResumeCI%20!%20J'ai%20une%20question%20sur%20la%20fiche%20:%20${encodeURIComponent(name)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#10b981;color:#fff;border-radius:20px;font-weight:600;font-size:12px;text-decoration:none;transition:.2s;margin-left:8px"><i class="fab fa-whatsapp"></i> Assistance</a><p style="margin-top:8px;font-size:11px;color:var(--text-dim)">Une question sur cette fiche ? Contacte-nous sur WhatsApp</p><p style="margin-top:4px;font-size:11px;color:var(--text-dim)"><a href="https://whatsapp.com/channel/0029Vb8u2u0KrWQxKOhaDZ1F" target="_blank" rel="noopener" style="color:#25d366;text-decoration:none;font-weight:600">📺 Chaîne WhatsApp</a></p></div></div>`;
    try {
      const ficheEl = document.querySelector('.fiche-content');
      renderInlineMath(ficheEl);
      autoFractionsInElement(ficheEl);
      autoVectorsInElement(ficheEl);
    } catch (e) {
      console.warn('auto-math error', e);
    }
    
    // Initialisation des outils d'étude (Récitation Active, Surlignage, Notes)
    if (typeof window.initFicheStudyFeatures === 'function') {
      window.initFicheStudyFeatures(cls, sub, file);
    }
    if (typeof updateAudioFabVisual === 'function') updateAudioFabVisual();
    clearActive();
    const el = document.querySelector(`.nav-lesson[data-path="${cls}/${sub}/${file}"]`);
    if (el) {
      el.classList.add('active');
      el.closest('.nav-class')?.classList.add('open');
      el.closest('.nav-subject')?.classList.add('open');
    }
  } catch (e) {
    document.getElementById('content').innerHTML =
      `<div class="loading" style="color:var(--red)"><i class="fas fa-exclamation-triangle"></i> Erreur</div>`;
  }
}
function clearActive() {
  document.querySelectorAll('.nav-lesson.active').forEach(e => e.classList.remove('active'));
}
function renderInlineMath(rootEl) {
  if (!rootEl || !window.katex) return;
  rootEl.querySelectorAll('.math-inline[data-tex]').forEach(el => {
    if (el.dataset.rendered === '1') return;
    window.katex.render(el.getAttribute('data-tex'), el, { throwOnError: false, output: 'html', strict: 'ignore' });
    el.dataset.rendered = '1';
  });
}
function preprocessTextFractions(html) {
  return html;
}
function isInsideExclusion(node) {
  let p = node.parentNode;
  while (p && p.nodeType === 1) {
    const tag = p.tagName.toLowerCase();
    if (['code', 'pre', 'a', 'script', 'style', 'math', 'textarea', 'input', 'button'].includes(tag)) return true;
    if (
      p.classList &&
      (p.classList.contains('katex') ||
        p.classList.contains('katex-display') ||
        p.classList.contains('formula-block') ||
        p.classList.contains('formule') ||
        p.classList.contains('math-inline') ||
        p.classList.contains('auto-frac') ||
        p.classList.contains('auto-vector') ||
        p.classList.contains('no-frac'))
    )
      return true;
    p = p.parentNode;
  }
  return false;
}
const UNI2TEX = {
  π: '\\pi ',
  ω: '\\omega ',
  θ: '\\theta ',
  φ: '\\varphi ',
  ϕ: '\\phi ',
  α: '\\alpha ',
  β: '\\beta ',
  γ: '\\gamma ',
  δ: '\\delta ',
  ε: '\\varepsilon ',
  λ: '\\lambda ',
  μ: '\\mu ',
  ν: '\\nu ',
  ρ: '\\rho ',
  σ: '\\sigma ',
  τ: '\\tau ',
  Δ: '\\Delta ',
  Φ: '\\Phi ',
  Ψ: '\\Psi ',
  Ω: '\\Omega ',
  Σ: '\\Sigma ',
  Π: '\\Pi ',
  Λ: '\\Lambda ',
  Θ: '\\Theta ',
  ℓ: '\\ell ',
  '∞': '\\infty ',
  '·': ' \\cdot ',
  '×': ' \\times ',
  '÷': '\\div ',
  '²': '^{2}',
  '³': '^{3}',
  '⁴': '^{4}',
  '⁵': '^{5}',
  '⁶': '^{6}',
  '⁻': '^{-}',
  '⁰': '^{0}',
  '¹': '^{1}',
  '⁹': '^{9}',
  '⁸': '^{8}',
  '⁷': '^{7}',
  '₀': '_{0}',
  '₁': '_{1}',
  '₂': '_{2}',
  '₃': '_{3}',
  '₄': '_{4}',
  ₙ: '_{n}',
  ₓ: '_{x}',
  '′': "'",
  '″': "''",
  '°': '^{\\circ}',
};
function uniToTex(s) {
  return String(s).replace(/[πωθφϕαβγδελμνρστΔΦΨΩΣΠΛΘℓ∞·×÷²³⁴⁵⁶⁷⁸⁹⁰¹⁻₀₁₂₃₄ₙₓ′″°ε]/g, c => UNI2TEX[c] || c);
}
function tokenToTex(t) {
  t = t.trim();
  if (!t) return '';
  if (/^\d+(?:[.,]\d+)?$/.test(t)) return t.replace(',', '.');
  let m = t.match(/^√(\d+)$/);
  if (m) return `\\sqrt{${m[1]}}`;
  m = t.match(/^√\(([^)]+)\)$/);
  if (m) return `\\sqrt{${uniToTex(m[1])}}`;
  m = t.match(/^([A-Za-zα-ωΑ-Ω])_([A-Za-z0-9]{1,5})$/);
  if (m) return `${uniToTex(m[1])}_{\\text{${m[2]}}}`;
  return uniToTex(t);
}
function autoFractionsInElement(rootEl) {
  if (!rootEl || !window.katex) return;
  const GREEK = 'α-ωΑ-ΩπωθφϕαβγδελμνρστΔΦΨΩΣΠΛΘℓ';
  const SUP = '²³⁴⁵⁶⁷⁸⁹⁰¹⁻';
  const SUB = '₀₁₂₃₄ₙₓ';
  const TOK = `(?:√(?:\\d+|\\([^)]+\\))|\\d+(?:[.,]\\d+)?|[A-Za-z${GREEK}]_(?:[A-Za-z0-9]{1,5})|[A-Za-z${GREEK}\\d${SUP}${SUB}]{1,10})`;
  const FRAC = new RegExp(`(^|[\\s(\\[=,;:>«"'+\\-*])(${TOK})\\s*/\\s*(${TOK})(?=$|[\\s).,;:?!\\]<»"'+\\-*=])`, 'g');
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
    acceptNode: n => {
      if (!n.nodeValue || !n.nodeValue.includes('/')) return NodeFilter.FILTER_REJECT;
      if (isInsideExclusion(n)) return NodeFilter.FILTER_REJECT;
      if (/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(n.nodeValue) && !/[A-Za-zα-ωΑ-Ωπωθφαβ√]/.test(n.nodeValue))
        return NodeFilter.FILTER_REJECT;
      if (/https?:\/\//i.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const targets = [];
  let n;
  while ((n = walker.nextNode())) targets.push(n);
  targets.forEach(node => {
    const text = node.nodeValue;
    let lastIdx = 0,
      out = null,
      changed = false;
    let m;
    const frag = document.createDocumentFragment();
    FRAC.lastIndex = 0;
    while ((m = FRAC.exec(text))) {
      const before = m[1],
        num = m[2],
        den = m[3];
      if (/^\d{1,2}$/.test(num) && /^\d{1,2}$/.test(den) && parseInt(num) < 32 && parseInt(den) < 32) {
        continue;
      }
      const start = m.index + before.length;
      const end = FRAC.lastIndex;
      frag.appendChild(document.createTextNode(text.slice(lastIdx, start)));
      const span = document.createElement('span');
      span.className = 'auto-frac';
      try {
        window.katex.render(`\\frac{${tokenToTex(num)}}{${tokenToTex(den)}}`, span, {
          throwOnError: false,
          output: 'html',
          strict: 'ignore',
        });
        frag.appendChild(span);
      } catch (e) {
        frag.appendChild(document.createTextNode(num + '/' + den));
      }
      lastIdx = end;
      changed = true;
    }
    if (changed) {
      frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      node.parentNode.replaceChild(frag, node);
    }
  });
}
function autoVectorsInElement(rootEl) {
  if (!rootEl || !window.katex) return;
  const VEC_ARROW = /([A-Za-z])\u20D7/g;
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
    acceptNode: n => {
      if (!n.nodeValue || n.nodeValue.indexOf('⃗') < 0) return NodeFilter.FILTER_REJECT;
      if (isInsideExclusion(n)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  nodes.forEach(node => {
    const text = node.nodeValue;
    const frag = document.createDocumentFragment();
    let last = 0,
      changed = false,
      m;
    VEC_ARROW.lastIndex = 0;
    while ((m = VEC_ARROW.exec(text))) {
      frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const span = document.createElement('span');
      span.className = 'auto-vector';
      try {
        window.katex.render(`\\vec{${m[1]}}`, span, { throwOnError: false, output: 'html', strict: 'ignore' });
        frag.appendChild(span);
        changed = true;
      } catch (e) {
        frag.appendChild(document.createTextNode(m[0]));
      }
      last = m.index + m[0].length;
    }
    if (changed) {
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    }
  });
}
function preloadNextFiche(cls, sub, file) {
  const fiches = DATA.structure?.[cls]?.[sub];
  if (!fiches) return;
  const idx = fiches.findIndex(f => f.file === file);
  if (idx >= 0 && idx < fiches.length - 1) {
    const next = fiches[idx + 1];
    const url = `/fiches/${encodeURIComponent(cls)}/${encodeURIComponent(sub)}/${encodeURIComponent(next.file)}`;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    link.as = 'document';
    document.head.appendChild(link);
  }
}
function getMonthlyPdfQuota() {
  const currentMonth = new Date().toISOString().slice(0, 7); // Ex: '2026-09'
  const uid = window.USER_PROFILE?.uid || 'guest';
  const key = `resumeci_pdf_quota_${uid}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.month === currentMonth) {
        return parsed;
      }
    }
  } catch (e) {}
  return { month: currentMonth, count: 0 };
}

function saveMonthlyPdfQuota(quota) {
  const uid = window.USER_PROFILE?.uid || 'guest';
  const key = `resumeci_pdf_quota_${uid}`;
  localStorage.setItem(key, JSON.stringify(quota));
}

function showPdfQuotaReachedModal(quota) {
  const badgeEl = document.getElementById('pqrResetDateBadge');
  if (badgeEl) {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const dayStr = nextMonth.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    badgeEl.textContent = `${dayStr}`;
  }
  document.getElementById('pdfQuotaReachedModal')?.classList.add('show');
}
window.showPdfQuotaReachedModal = showPdfQuotaReachedModal;

window.showActionNotice = function({
  type = 'info', // 'info' | 'warning' | 'vip' | 'success' | 'error'
  icon = '✨',
  title = 'Information',
  subtitle = '',
  message = '',
  detailsHtml = '',
  primaryBtnText = "D'accord",
  primaryBtnAction = null,
  secondaryBtnText = null,
  secondaryBtnAction = null,
} = {}) {
  const modal = document.getElementById('actionNoticeModal');
  if (!modal) {
    if (window.toast) toast(title + (message ? ' : ' + message : ''), type === 'error' ? 'error' : (type === 'warning' ? 'warn' : 'info'));
    return;
  }
  const header = document.getElementById('anHeader');
  const iconEl = document.getElementById('anIcon');
  const titleEl = document.getElementById('anTitle');
  const subtitleEl = document.getElementById('anSubtitle');
  const contentEl = document.getElementById('anContent');
  const primaryBtn = document.getElementById('anPrimaryBtn');
  const secondaryBtn = document.getElementById('anSecondaryBtn');

  if (header) {
    header.className = 'notice-modal-header type-' + type;
  }
  if (iconEl) iconEl.innerHTML = icon;
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) {
    subtitleEl.textContent = subtitle;
    subtitleEl.style.display = subtitle ? 'block' : 'none';
  }

  if (contentEl) {
    let bodyHtml = '';
    if (message) {
      bodyHtml += `<div class="notice-modal-body-box">${message.replace(/\n/g, '<br>')}</div>`;
    }
    if (detailsHtml) {
      bodyHtml += detailsHtml;
    }
    contentEl.innerHTML = bodyHtml;
  }

  if (primaryBtn) {
    primaryBtn.textContent = primaryBtnText;
    primaryBtn.onclick = () => {
      modal.classList.remove('show');
      if (typeof primaryBtnAction === 'function') primaryBtnAction();
    };
  }

  if (secondaryBtn) {
    if (secondaryBtnText) {
      secondaryBtn.style.display = 'block';
      secondaryBtn.textContent = secondaryBtnText;
      secondaryBtn.onclick = () => {
        modal.classList.remove('show');
        if (typeof secondaryBtnAction === 'function') secondaryBtnAction();
      };
    } else {
      secondaryBtn.style.display = 'none';
    }
  }

  modal.classList.add('show');
};
window.closeActionNotice = function() {
  document.getElementById('actionNoticeModal')?.classList.remove('show');
};

/* ==================== PASS ÉLITE VIP MODAL CONTROLLER ==================== */
window.openElitePassModal = function(featureName = 'elite') {
  const modal = document.getElementById('eliteComingSoonModal');
  if (!modal) {
    if (typeof window.showActionNotice === 'function') {
      window.showActionNotice({
        type: 'vip',
        icon: '👑',
        title: 'Pass Élite en préparation',
        subtitle: 'Professeur IA & Sujets d\'examen',
        message: 'Cette formule suprême est en cours de déploiement. Découvre nos Pass Starter et Pro dès 500 FCFA pour réviser dès aujourd\'hui !'
      });
    }
    return;
  }

  const iconEl = document.getElementById('eliteHeroIcon');
  const titleEl = document.getElementById('eliteHeroTitle');
  const subtitleEl = document.getElementById('eliteHeroSubtitle');
  const cardIA = document.getElementById('eliteCardIA');
  const cardAnnales = document.getElementById('eliteCardAnnales');
  const cardSimulateur = document.getElementById('eliteCardSimulateur');

  // Réinitialiser les surbrillances
  [cardIA, cardAnnales, cardSimulateur].forEach(card => card && card.classList.remove('active-target'));

  const fLower = (featureName || '').toLowerCase();

  if (fLower.includes('ia') || fLower.includes('professeur')) {
    if (iconEl) iconEl.textContent = '🤖';
    if (titleEl) titleEl.textContent = 'Professeur IA 24h/24 🔒';
    if (subtitleEl) subtitleEl.textContent = 'Ton tuteur particulier intelligent est en cours de calibrage avec nos professeurs !';
    if (cardIA) {
      cardIA.classList.add('active-target');
      cardIA.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } else if (fLower.includes('sujet') || fLower.includes('annale') || fLower.includes('bac') || fLower.includes('bepc')) {
    if (iconEl) iconEl.textContent = '📜';
    if (titleEl) titleEl.textContent = 'Sujets BAC & BEPC Corrigés 🔒';
    if (subtitleEl) subtitleEl.textContent = 'Toutes les épreuves officielles décortiquées avec barèmes et corrigés types.';
    if (cardAnnales) {
      cardAnnales.classList.add('active-target');
      cardAnnales.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } else if (fLower.includes('simulateur') || fLower.includes('examen') || fLower.includes('blanc')) {
    if (iconEl) iconEl.textContent = '⏱️';
    if (titleEl) titleEl.textContent = 'Simulateur d\'Examens Blancs 🔒';
    if (subtitleEl) subtitleEl.textContent = 'Entraîne-toi en conditions réelles avec épreuves chronométrées et score prédictif.';
    if (cardSimulateur) {
      cardSimulateur.classList.add('active-target');
      cardSimulateur.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } else {
    // Par défaut : Présentation Globale du Pass Élite
    if (iconEl) iconEl.textContent = '👑';
    if (titleEl) titleEl.textContent = 'Pass Élite : La Formule Suprême';
    if (subtitleEl) subtitleEl.textContent = 'L\'excellence absolue : Professeur IA, annales BAC/BEPC et simulateurs d\'examens.';
  }

  modal.classList.add('show');
};

window.closeElitePassModal = function() {
  document.getElementById('eliteComingSoonModal')?.classList.remove('show');
};

// Fermeture ergonomique au clic sur l'arrière-plan et touche Echap (iOS & Android)
document.addEventListener('DOMContentLoaded', () => {
  const dismissibleModalIds = [
    'actionNoticeModal',
    'eliteComingSoonModal',
    'activeSubscriptionModal',
    'paymentCheckoutModal',
    'pdfQuotaReachedModal',
    'packAlreadyDownloadedModal',
    'packDownloadSuccessModal',
    'streakWelcomeModal',
    'streakInfoModal',
    'subscriptionSuccessModal',
    'pwaInstallGuideModal',
    'viewProfileModalOverlay'
  ];

  dismissibleModalIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', (e) => {
      if (e.target === el) {
        el.classList.remove('show');
      }
    });
  });

  // Touche Escape pour fermer le modal actif
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dismissibleModalIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.classList.contains('show')) {
          el.classList.remove('show');
        }
      });
      if (profileOverlay && profileOverlay.classList.contains('show')) {
        const closeBtn = document.getElementById('pmCloseBtn');
        if (closeBtn && closeBtn.style.display !== 'none') {
          profileOverlay.classList.remove('show');
        }
      }
    }
  });
});

/* ==================== GESTION ABONNEMENT ACTIF & RESILIATION ==================== */
window.hasActiveSubscription = function() {
  const profile = window.USER_PROFILE;
  if (!profile || !profile.premiumPlan || profile.premiumPlan === 'free' || !profile.isPremium) return null;
  if (profile.premiumExpiresAt && Number(profile.premiumExpiresAt) < Date.now()) {
    return null; // Abonnement expiré
  }
  return {
    tier: profile.premiumPlan,
    expiresAt: profile.premiumExpiresAt,
    isPremium: true
  };
};

window.showActiveSubscriptionModal = function(subInfo, targetTier) {
  const modal = document.getElementById('activeSubscriptionModal');
  if (!modal) return;

  const currentSub = subInfo || window.hasActiveSubscription();
  const tier = currentSub?.tier || 'pro';
  const planInfo = (window.PREMIUM_PLANS && window.PREMIUM_PLANS[tier]) 
    ? window.PREMIUM_PLANS[tier] 
    : { name: tier.toUpperCase(), price: tier === 'starter' ? 500 : 1000, emoji: '👑' };

  const nameEl = document.getElementById('asPlanName');
  if (nameEl) {
    nameEl.innerHTML = `${planInfo.emoji || '👑'} Pass ${planInfo.name} <span style="font-size:12px;font-weight:normal;opacity:0.85">(${planInfo.price} FCFA/mois)</span>`;
  }

  const expirySpan = document.getElementById('asExpiryDateSpan');
  if (expirySpan) {
    if (currentSub?.expiresAt) {
      const expDate = new Date(Number(currentSub.expiresAt));
      const daysRemaining = Math.max(0, Math.ceil((expDate - Date.now()) / (24 * 3600 * 1000)));
      expirySpan.textContent = `Valable jusqu'au ${expDate.toLocaleDateString('fr-FR')} (${daysRemaining} jour${daysRemaining > 1 ? 's' : ''} restant${daysRemaining > 1 ? 's' : ''})`;
    } else {
      expirySpan.textContent = 'Valable 30 jours (Renouvellement mensuel)';
    }
  }

  const featsList = document.getElementById('asFeaturesList');
  if (featsList) {
    if (tier === 'starter') {
      featsList.innerHTML = `
        <li><i class="fas fa-check-circle" style="color:#10b981;"></i> Fiches et résumés officiels en lecture illimitée</li>
        <li><i class="fas fa-check-circle" style="color:#10b981;"></i> Pack Hors-Ligne dans l'application (PWA)</li>
        <li><i class="fas fa-check-circle" style="color:#10b981;"></i> Téléchargement PDF (Quota mensuel : 3 fiches)</li>
        <li><i class="fas fa-check-circle" style="color:#10b981;"></i> Statistiques et suivi d'apprentissage complet</li>
        <li><i class="fas fa-check-circle" style="color:#10b981;"></i> Surligneur multi-couleurs & Mode Tap</li>
        <li><i class="fas fa-check-circle" style="color:#10b981;"></i> Mes Notes Personnelles sur chaque fiche</li>
      `;
    } else {
      featsList.innerHTML = `
        <li><i class="fas fa-check-circle" style="color:#10b981;"></i> <b>Tout le Pass Starter inclus</b></li>
        <li><i class="fas fa-check-circle" style="color:#10b981;"></i> Récitation Active (Active Recall sur tout le cours)</li>
        <li><i class="fas fa-check-circle" style="color:#10b981;"></i> Pièges d'Examen & Astuces des correcteurs</li>
        <li><i class="fas fa-check-circle" style="color:#10b981;"></i> Podcasts Audio (lecture vocale de toutes les leçons)</li>
        <li><i class="fas fa-check-circle" style="color:#10b981;"></i> Flashcards illimitées avec mémorisation espacée</li>
        <li><i class="fas fa-check-circle" style="color:#10b981;"></i> Mode Quiz interactif complet</li>
        <li><i class="fas fa-check-circle" style="color:#10b981;"></i> Plan de Révision Intelligent</li>
      `;
    }
  }

  // Section Upgrade / Passer à la formule supérieure
  const upgradeSection = document.getElementById('asUpgradeSection');
  const upgradeBadge = document.getElementById('asUpgradeBadge');
  const upgradeTitle = document.getElementById('asUpgradeTitle');
  const upgradeDesc = document.getElementById('asUpgradeDesc');
  const upgradeBtn = document.getElementById('asUpgradeBtn');

  if (upgradeSection) {
    if (tier === 'starter') {
      upgradeSection.style.display = 'block';
      if (upgradeBadge) upgradeBadge.textContent = '🚀 AMÉLIORATION DISPONIBLE';
      if (upgradeTitle) upgradeTitle.textContent = 'Envie de débloquer la Récitation Active, les Pièges & Podcasts ?';
      if (upgradeDesc) {
        upgradeDesc.innerHTML = 'Passe au <strong>Pass Pro (1 000 FCFA/mois)</strong> pour profiter de la récitation active, des pièges d\'examen, de la lecture vocale, des flashcards de mémorisation et de tous les quiz interactifs.';
      }
      if (upgradeBtn) {
        upgradeBtn.innerHTML = '⚡ Passer au Pass Pro (1 000 FCFA / mois)';
        upgradeBtn.onclick = function() {
          window.closeActiveSubscriptionModal();
          window.initiatePremiumPayment(this, 'pro');
        };
      }
    } else if (tier === 'pro') {
      upgradeSection.style.display = 'block';
      if (upgradeBadge) upgradeBadge.textContent = '🥇 FORMULE SUPRÊME';
      if (upgradeTitle) upgradeTitle.textContent = 'Pass Élite : Professeur IA & Examens';
      if (upgradeDesc) {
        upgradeDesc.innerHTML = 'La formule suprême avec tuteur IA 24h/24 et annales officielles corrigées du BAC/BEPC arrive très bientôt.';
      }
      if (upgradeBtn) {
        upgradeBtn.innerHTML = '👑 Découvrir les fonctionnalités Élite';
        upgradeBtn.onclick = function() {
          window.closeActiveSubscriptionModal();
          window.openElitePassModal('elite');
        };
      }
    } else {
      upgradeSection.style.display = 'none';
    }
  }

  modal.classList.add('show');
};

window.closeActiveSubscriptionModal = function() {
  document.getElementById('activeSubscriptionModal')?.classList.remove('show');
};

window.promptCancelSubscription = function() {
  const currentSub = window.hasActiveSubscription();
  const planName = currentSub ? (currentSub.tier === 'starter' ? 'Starter' : 'Pro') : '';

  // Fermer immédiatement la fenêtre d'abonnement actif pour que la boîte de confirmation apparaisse directement devant l'utilisateur
  if (typeof window.closeActiveSubscriptionModal === 'function') {
    window.closeActiveSubscriptionModal();
  }

  if (typeof window.showActionNotice === 'function') {
    window.showActionNotice({
      type: 'warning',
      icon: '⚠️',
      title: 'Confirmer la résiliation définitive ?',
      subtitle: 'Attention : Aucun remboursement possible',
      message: `Tu t'apprêtes à résilier ton Pass ${planName}.\n\n⛔ RÈGLE STRICTE : Conformément à nos conditions générales d'utilisation, l'annulation est immédiate et ne donne droit à AUCUN REMBOURSEMENT (ni total, ni partiel).\n\nTes fonctionnalités premium seront immédiatement désactivées. Souhaites-tu vraiment résilier ?`,
      primaryBtnText: 'Oui, résilier sans remboursement',
      primaryBtnAction: async () => {
        await executeCancelSubscription();
      },
      secondaryBtnText: 'Non, garder mon Pass',
      secondaryBtnAction: () => {
        if (typeof window.showActiveSubscriptionModal === 'function') {
          window.showActiveSubscriptionModal();
        }
      }
    });
  } else {
    if (confirm("Attention : La résiliation est définitive et aucun remboursement ne sera effectué. Continuer ?")) {
      executeCancelSubscription();
    }
  }
};

window.executeCancelSubscription = async function() {
  const uid = window.USER_PROFILE?.uid;
  try {
    if (uid) {
      await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: uid })
      }).catch(e => console.warn("Erreur API cancel:", e));
    }
  } catch (err) {
    console.warn("Erreur réseau cancel-subscription:", err);
  }

  // Réinitialiser le profil localement
  if (window.USER_PROFILE) {
    window.USER_PROFILE.premiumPlan = null;
    window.USER_PROFILE.isPremium = false;
    window.USER_PROFILE.premiumExpiresAt = null;
    localStorage.setItem('resumeci_profile', JSON.stringify(window.USER_PROFILE));
  }

  closeActiveSubscriptionModal();
  updateAudioFabVisual();
  if (typeof showDashboard === 'function') showDashboard();

  if (typeof window.showActionNotice === 'function') {
    window.showActionNotice({
      type: 'info',
      icon: '👋',
      title: 'Abonnement Résilié',
      subtitle: 'Accès premium désactivés',
      message: "Ton abonnement a été résilié avec succès.\n\nConformément aux conditions d'utilisation, aucun remboursement n'a été effectué.\n\nTu peux à tout moment souscrire à une nouvelle formule pour débloquer à nouveau tes fonctionnalités !",
      primaryBtnText: 'D\'accord'
    });
  } else if (window.toast) {
    toast("Abonnement résilié sans remboursement. Accès premium révoqués.", "info", 5000);
  }
};

async function downloadCurrentFichePdf() {
  if (!window.userHasFeature || !window.userHasFeature('Téléchargement PDF')) {
    if (typeof window.openPremiumTeaser === 'function') {
      window.openPremiumTeaser('Téléchargement PDF');
    }
    return;
  }

  const ficheContent = document.querySelector('.fiche-content');
  if (!ficheContent || !CURRENT_FICHE) return;

  // --- VÉRIFICATION DU QUOTA MENSUEL (MAX 3 PAR MOIS) ---
  const quota = getMonthlyPdfQuota();
  if (quota.count >= 3) {
    showPdfQuotaReachedModal(quota);
    return;
  }

  // Incrémenter le quota
  quota.count += 1;
  saveMonthlyPdfQuota(quota);

  if (window.toast) {
    toast(`📥 Téléchargement PDF en cours... (Fiche ${quota.count}/3 pour ce mois)`, 'info', 4000);
  }

  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'padding:0;margin:0;background:#ffffff;color:#1e293b;font-family:Inter,sans-serif;line-height:1.75;max-width:700px';
  const clone = ficheContent.cloneNode(true);
  clone.style.cssText =
    'background:#fff;color:#1e293b;border:none;box-shadow:none;padding:20px;margin:0;page-break-before:avoid';
  clone.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') {
      const rgb = cs.backgroundColor;
      const match = rgb.match(/\d+/g);
      if (match && parseInt(match[0]) < 100 && parseInt(match[1]) < 100 && parseInt(match[2]) < 100) {
        el.style.backgroundColor = '#ffffff';
      }
    }
    if (cs.color) {
      const match = cs.color.match(/\d+/g);
      if (match && parseInt(match[0]) > 200 && parseInt(match[1]) > 200 && parseInt(match[2]) > 200) {
        el.style.color = '#1e293b';
      }
    }
  });
  clone.querySelectorAll('h1').forEach(el => {
    el.style.cssText =
      'color:#2563eb;font-size:20px;font-weight:800;margin-bottom:16px;margin-top:0;padding-top:0;text-align:center';
  });
  clone.querySelectorAll('h2').forEach(el => {
    el.style.cssText =
      'color:#1e293b;font-size:16px;font-weight:700;margin:20px 0 12px;padding:10px 16px;background:linear-gradient(135deg,#eff6ff,#f5f3ff);border-left:4px solid #2563eb;border-radius:0 8px 8px 0;page-break-after:avoid;page-break-inside:avoid';
  });
  clone.querySelectorAll('h3').forEach(el => {
    el.style.cssText =
      'color:#1e293b;font-size:14px;font-weight:600;margin:16px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px';
  });
  clone.querySelectorAll('p').forEach(el => {
    if (!el.style.color || el.style.color === '#1e293b') el.style.color = '#475569';
    el.style.fontSize = '13px';
  });
  clone.querySelectorAll('li').forEach(el => {
    el.style.cssText = 'color:#475569;font-size:13px;margin-bottom:4px';
  });
  clone.querySelectorAll('strong').forEach(el => {
    el.style.color = '#1e293b';
  });
  clone.querySelectorAll('table').forEach(el => {
    el.style.cssText = 'width:100%;border-collapse:collapse;margin:12px 0;font-size:12px';
  });
  clone.querySelectorAll('th').forEach(el => {
    el.style.cssText =
      'padding:8px 10px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;text-align:left;color:#1e293b';
  });
  clone.querySelectorAll('td').forEach(el => {
    el.style.cssText = 'padding:8px 10px;border:1px solid #e2e8f0;color:#475569';
  });
  clone.querySelectorAll('blockquote').forEach(el => {
    el.style.cssText =
      'border-left:4px solid #2563eb;padding:10px 16px;margin:10px 0;background:#eff6ff;border-radius:0 8px 8px 0;color:#1e293b';
  });
  clone.querySelectorAll('.definition').forEach(el => {
    el.style.cssText =
      'background:#ecfdf5;border-left:4px solid #22c55e;padding:12px 16px;border-radius:0 8px 8px 0;margin:10px 0;color:#1e293b';
  });
  clone.querySelectorAll('.important').forEach(el => {
    el.style.cssText =
      'background:#eff6ff;border-left:4px solid #2563eb;padding:12px 16px;border-radius:0 8px 8px 0;margin:10px 0;color:#1e293b';
  });
  clone.querySelectorAll('.schema').forEach(el => {
    el.style.cssText =
      'background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:0 8px 8px 0;margin:10px 0;font-weight:700;color:#92400e';
  });
  clone.querySelectorAll('.meta').forEach(el => {
    el.style.cssText =
      'display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin:8px 0 16px;color:#64748b;font-size:12px';
  });
  clone.querySelectorAll('.meta span').forEach(el => {
    el.style.cssText = 'background:#f1f5f9;padding:4px 10px;border-radius:16px;color:#475569';
  });
  clone.querySelectorAll('.header').forEach(el => {
    el.style.cssText = 'text-align:center;border-bottom:3px solid #16a34a;padding-bottom:16px;margin-bottom:24px';
  });
  clone.querySelectorAll('*').forEach(el => {
    if (el.children.length === 0 && el.textContent) {
      el.textContent = el.textContent
        .replace(/Créé par\s*Haniel_dev/gi, '')
        .replace(/ResumeCI\s*[—–-]\s*Fiches de résumé[^]*/gi, '');
    }
  });
  const children = [...clone.children];
  for (let i = children.length - 1; i >= 0; i--) {
    if (!children[i].textContent.trim() && !children[i].querySelector('table,img')) children[i].remove();
    else break;
  }
  wrapper.appendChild(clone);
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  wrapper.style.width = '700px';
  document.body.appendChild(wrapper);
  const totalH = wrapper.scrollHeight;
  document.body.removeChild(wrapper);
  wrapper.style.position = 'relative';
  wrapper.style.left = '0';
  wrapper.style.top = '0';
  wrapper.style.width = '700px';
  const pageH = 1032;
  const pages = Math.max(1, Math.ceil(totalH / pageH));
  clone.style.position = 'relative';

  // --- FILIGRANE ANTI-PARTAGE PERSONNALISÉ (Watermark nominatif) ---
  const studentName = window.USER_PROFILE ? `${window.USER_PROFILE.firstName || ''} ${window.USER_PROFILE.lastName || ''}`.trim() : 'Élève';
  const studentWa = window.USER_PROFILE?.whatsapp || '';
  
  for (let i = 0; i < pages; i++) {
    // Grand filigrane diagonal
    const wm = document.createElement('div');
    wm.textContent = 'ResumeCI';
    wm.style.cssText = `position:absolute;left:50%;top:${i * pageH + pageH * 0.45}px;transform:translateX(-50%) rotate(-35deg);font-size:68px;font-weight:900;color:rgba(37,99,235,0.035);pointer-events:none;z-index:0;letter-spacing:8px;white-space:nowrap;font-family:Inter,sans-serif`;
    clone.appendChild(wm);

    // Filigrane de sécurité légal au bas de chaque page
    const footerMark = document.createElement('div');
    footerMark.style.cssText = `position:absolute;left:20px;right:20px;top:${i * pageH + pageH - 24}px;text-align:center;font-size:8.5px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:4px;font-family:Inter,sans-serif;pointer-events:none;`;
    footerMark.textContent = `Document officiel ResumeCI • Édité pour : ${studentName}${studentWa ? ' (' + studentWa + ')' : ''} • Usage strictement personnel • Reproduction & partage interdits (Fiche ${quota.count}/3 du mois)`;
    clone.appendChild(footerMark);
  }

  const fileName = CURRENT_FICHE.file.replace(/\.html?$/i, '.pdf').replace(/[\\/:*?"<>|]/g, '-');
  if (window.html2pdf) {
    await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename: fileName,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, y: 0, scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: {
          mode: ['css'],
          before: '.pdf-page-break-before',
          after: '.pdf-page-break-after',
          avoid: ['.definition', '.important', '.schema', 'table', 'blockquote'],
        },
      })
      .from(wrapper)
      .save();
  } else {
    window.print();
  }
}
window.downloadCurrentFichePdf = downloadCurrentFichePdf;

const DOWNLOADED_CLASSES_KEY = 'resumeci_downloaded_classes';

function getDownloadedClasses() {
  try {
    return JSON.parse(localStorage.getItem(DOWNLOADED_CLASSES_KEY) || '[]');
  } catch(e) {
    return [];
  }
}

function isClassDownloaded(cls) {
  if (!cls) return false;
  const list = getDownloadedClasses();
  const normalized = cls.trim().toLowerCase().replace(/\s+/g, '_');
  return list.some(item => (typeof item === 'string' ? item : '').toLowerCase().replace(/\s+/g, '_') === normalized);
}
window.isClassDownloaded = isClassDownloaded;

function markClassAsDownloaded(cls) {
  if (!cls) return;
  const list = getDownloadedClasses();
  const normalized = cls.trim().toLowerCase().replace(/\s+/g, '_');
  if (!list.some(item => (typeof item === 'string' ? item : '').toLowerCase().replace(/\s+/g, '_') === normalized)) {
    list.push(cls);
    localStorage.setItem(DOWNLOADED_CLASSES_KEY, JSON.stringify(list));
  }
}
window.markClassAsDownloaded = markClassAsDownloaded;

function showPackAlreadyDownloadedModal(clsTarget) {
  const clsName = (clsTarget || '').replace(/_/g, ' ');
  const titleEl = document.getElementById('padTitle');
  if (titleEl) {
    titleEl.textContent = `Pack ${clsName} Déjà Prêt ! ✓`;
  }
  const subEl = document.getElementById('padSubtitle');
  if (subEl) {
    subEl.textContent = `Toutes les fiches de ${clsName} sont déjà enregistrées sur ton téléphone`;
  }
  const forceBtn = document.getElementById('padForceUpdateBtn');
  if (forceBtn) {
    forceBtn.onclick = () => {
      document.getElementById('packAlreadyDownloadedModal')?.classList.remove('show');
      downloadClassOffline(clsTarget, true);
    };
  }
  document.getElementById('packAlreadyDownloadedModal')?.classList.add('show');
}
window.showPackAlreadyDownloadedModal = showPackAlreadyDownloadedModal;

function showPackDownloadSuccessModal(clsTarget, count) {
  const clsName = (clsTarget || '').replace(/_/g, ' ');
  const titleEl = document.getElementById('pdsTitle');
  if (titleEl) {
    titleEl.textContent = `Pack ${clsName} Enregistré ! 🎉`;
  }
  const countBadge = document.getElementById('pdsFichesCountBadge');
  if (countBadge) {
    countBadge.textContent = `✓ ${count} fiches de ${clsName} prêtes hors-ligne`;
  }
  document.getElementById('packDownloadSuccessModal')?.classList.add('show');
}
window.showPackDownloadSuccessModal = showPackDownloadSuccessModal;

async function downloadClassOffline(cls, force = false) {
  const clsTarget = cls || window.USER_PROFILE?.selectedClass || '3eme';
  const clsDisplayName = clsTarget.replace(/_/g, ' ');
  const btn = document.querySelector(`.dl-btn[data-class="${clsTarget}"]`) || document.querySelector('.cob-btn');

  // Verify feature permission
  const hasFeature = window.userHasFeature ? window.userHasFeature('Pack Hors-Ligne Complet') : false;
  if (!hasFeature) {
    if (typeof openPremiumTeaser === 'function') {
      openPremiumTeaser('Pack Hors-Ligne Complet (' + clsDisplayName + ')');
    }
    return;
  }

  // If already downloaded, warn the user with a beautiful modal!
  if (isClassDownloaded(clsTarget) && !force) {
    showPackAlreadyDownloadedModal(clsTarget);
    return;
  }

  if (window.toast) toast(`📥 Préparation du pack hors-ligne pour la ${clsDisplayName}...`, 'info', 4000);
  if (btn) {
    btn.classList.add('downloading');
    btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px"></div> Téléchargement en cours...';
  }

  try {
    const structureRes = await fetch('/data/structure.json');
    const structure = await structureRes.json();
    const clsKey = Object.keys(structure).find(k => k.replace(/_/g, ' ') === clsTarget || k === clsTarget.replace(/\s+/g, '_') || k === clsTarget);
    
    if (!clsKey || !structure[clsKey]) {
      throw new Error("Classe introuvable dans le programme.");
    }

    const urls = ['/data/structure.json'];
    const subjects = structure[clsKey];
    for (const sub of Object.keys(subjects)) {
      for (const fileObj of subjects[sub]) {
        const fileName = typeof fileObj === 'string' ? fileObj : (fileObj.file || fileObj.name);
        if (fileName) {
          urls.push(`/fiches/${clsKey}/${sub}/${fileName}`);
        }
      }
    }

    const total = urls.length;
    let cachedCount = 0;

    let cacheObj = null;
    if ('caches' in window) {
      try {
        cacheObj = await caches.open('resumeci-fiches-v3');
      } catch(e) {
        console.warn("caches.open error", e);
      }
    }

    for (let idx = 0; idx < urls.length; idx++) {
      const url = urls[idx];
      try {
        const resp = await fetch(url);
        if (resp && resp.ok) {
          if (cacheObj) {
            await cacheObj.put(url, resp.clone());
          }
          cachedCount++;
        }
      } catch(err) {
        console.warn("Failed caching:", url, err);
      }

      if (idx % 4 === 0 || idx === total - 1) {
        if (window.toast) {
          toast(`📥 Téléchargement : ${cachedCount}/${total} fiches (${Math.round((idx+1)/total*100)}%)`, 'info', 1500);
        }
        if (btn) {
          btn.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px"></div> ${cachedCount}/${total} fiches...`;
        }
      }
    }

    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CACHE_FICHES', urls });
    }

    // Mark as downloaded
    markClassAsDownloaded(clsTarget);

    if (btn) {
      btn.classList.remove('downloading');
      btn.classList.add('downloaded');
      btn.innerHTML = `<i class="fas fa-check-circle" style="color:#10b981"></i> Pack hors-ligne prêt (${cachedCount} fiches)`;
    }

    showPackDownloadSuccessModal(clsTarget, cachedCount);
    if (window.toast) toast(`✅ ${cachedCount} fiches enregistrées hors-ligne !`, 'success', 6000);

  } catch(err) {
    console.error("Erreur cache hors-ligne:", err);
    if (btn) {
      btn.classList.remove('downloading');
      btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Réessayer le téléchargement';
    }
    if (window.toast) {
      toast("❌ Impossible de télécharger le pack hors-ligne. Vérifie ta connexion Internet.", 'warn', 5000);
    }
  }
}
window.downloadClassOffline = downloadClassOffline;

function getToolsBar() {
  const hasStats = window.userHasFeature ? window.userHasFeature('Statistiques Avancées') : false;
  const hasPlanner = window.userHasFeature ? window.userHasFeature("Planning d'Examen") : false;
  const activeSub = window.hasActiveSubscription ? window.hasActiveSubscription() : null;

  const statsCard = hasStats
    ? `<a class="tool-card" href="#" onclick="openStatistiquesModal(); return false;"><div class="tool-icon">📊</div><h4>Mes Statistiques</h4><p>Progression & Données en cache</p></a>`
    : `<a class="tool-card" href="#" onclick="openPremiumTeaser('Statistiques Avancées'); return false;"><div class="tool-icon">📊</div><h4>Mes Statistiques 🔒</h4><p>Progression & Cache (Dès 500 F)</p></a>`;

  const passCard = activeSub
    ? `<a class="tool-card" href="#" onclick="if(typeof showActiveSubscriptionModal==='function'){showActiveSubscriptionModal();}else if(typeof openElitePassModal==='function'){openElitePassModal('Pass Réussite');} return false;"><div class="tool-icon">👑</div><h4 style="color:#10b981;">Pass ${activeSub.tier.toUpperCase()} Actif ✓</h4><p>Toutes formules débloquées</p></a>`
    : `<a class="tool-card" href="#" onclick="if(typeof openElitePassModal==='function')openElitePassModal('Pass Réussite'); return false;"><div class="tool-icon">👑</div><h4>Pass Réussite 🔒</h4><p>Activer les formules élèves</p></a>`;

  const plannerCard = hasPlanner
    ? `<a class="tool-card" href="#" onclick="if(typeof openPlanner==='function')openPlanner(); return false;"><div class="tool-icon">📅</div><h4>Planning d'Examen</h4><p>Plan personnalisé (Actif ✓)</p></a>`
    : `<a class="tool-card" href="#" onclick="if(typeof openPlanner==='function')openPlanner(); return false;"><div class="tool-icon">📅</div><h4>Planning d'Examen 🔒</h4><p>Plan personnalisé (Pass Pro)</p></a>`;

  return `<div class="tools-bar">
    ${passCard}
    <a class="tool-card" href="#" onclick="if(typeof openCalculator==='function')openCalculator(); return false;"><div class="tool-icon">🧮</div><h4>Calculatrice</h4><p>Calculatrice scientifique</p></a>
    <a class="tool-card" href="#" onclick="if(typeof openPomodoro==='function')openPomodoro(); return false;"><div class="tool-icon">⏱️</div><h4>Timer Pomodoro</h4><p>25 min révision active</p></a>
    ${plannerCard}
    ${statsCard}
  </div>`;
}
const TTS = {
  chunks: [],
  index: 0,
  active: false,
  paused: false,
  rate: parseFloat(localStorage.getItem('tts-rate') || '1'),
  pitch: parseFloat(localStorage.getItem('tts-pitch') || '1'),
  voiceName: localStorage.getItem('tts-voice') || '',
  sleepTimer: null,
  sleepEndsAt: 0,
  wakeLock: null,
  currentUtter: null,
  panel: null,
  highlightEl: null,
};
function ttsGetVoices() {
  return speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith('fr'));
}
function ttsGetVoice() {
  const list = ttsGetVoices();
  if (!list.length) return null;
  if (TTS.voiceName) {
    const v = list.find(x => x.name === TTS.voiceName);
    if (v) return v;
  }
  return list[0];
}
function ttsBuildChunks() {
  const fc = document.querySelector('.fiche-content');
  if (!fc) return [];
  const blocks = fc.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,td,div.definition,div.important');
  const out = [];
  blocks.forEach(node => {
    const text = (node.innerText || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 2) return;
    if (text.length <= 220) {
      out.push({ text: text, node: node });
      return;
    }
    const parts = text.match(/[^.!?]+[.!?]+|.+$/g) || [text];
    let buf = '';
    parts.forEach(p => {
      if ((buf + ' ' + p).trim().length > 220 && buf) {
        out.push({ text: buf.trim(), node: node });
        buf = p;
      } else buf = (buf + ' ' + p).trim();
    });
    if (buf) out.push({ text: buf.trim(), node: node });
  });
  return out.slice(0, 300);
}
function ttsHighlight(node) {
  if (TTS.highlightEl) TTS.highlightEl.classList.remove('tts-highlight');
  if (node) {
    node.classList.add('tts-highlight');
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    TTS.highlightEl = node;
  } else TTS.highlightEl = null;
}
function ttsSpeakNext() {
  if (!TTS.active || TTS.index >= TTS.chunks.length) {
    ttsStop();
    return;
  }
  const c = TTS.chunks[TTS.index];
  const u = new SpeechSynthesisUtterance(c.text);
  const voice = ttsGetVoice();
  u.lang = 'fr-FR';
  u.rate = TTS.rate;
  u.pitch = TTS.pitch;
  if (voice) u.voice = voice;
  u.onstart = () => {
    ttsHighlight(c.node);
    ttsUpdatePanel();
  };
  u.onend = () => {
    TTS.index++;
    ttsUpdatePanel();
    if (TTS.active && !TTS.paused) setTimeout(ttsSpeakNext, 80);
  };
  u.onerror = () => {
    TTS.index++;
    if (TTS.active && !TTS.paused) setTimeout(ttsSpeakNext, 150);
  };
  TTS.currentUtter = u;
  speechSynthesis.speak(u);
}
function ttsStart() {
  if (window.userHasFeature && window.userHasFeature('Audio (Podcast)')) {
    if (typeof window.executeTtsStart === 'function') {
      window.executeTtsStart();
    }
    return;
  }
  if (typeof window.openPremiumTeaser === 'function') {
    window.openPremiumTeaser('Audio (Podcast)');
  } else if (typeof openPremiumTeaser === 'function') {
    openPremiumTeaser('Audio (Podcast)');
  } else if (typeof window.openElitePassModal === 'function') {
    window.openElitePassModal('Pass Pro');
  }
}
window.executeTtsStart = function () {
  if (!window.userHasFeature || !window.userHasFeature('Audio (Podcast)')) {
    if (typeof window.openPremiumTeaser === 'function') {
      window.openPremiumTeaser('Audio (Podcast)');
    }
    return;
  }

  if (!('speechSynthesis' in window)) {
    if (window.toast) toast('Audio non supporté sur ce navigateur', 'error');
    return;
  }
  const fc = document.querySelector('.fiche-content');
  if (!fc) {
    if (window.toast) toast("Ouvre une fiche d'abord", 'warn');
    return;
  }
  TTS.chunks = ttsBuildChunks();
  if (!TTS.chunks.length) {
    if (window.toast) toast('Aucun texte lisible', 'warn');
    return;
  }
  TTS.index = 0;
  TTS.active = true;
  TTS.paused = false;
  speechSynthesis.cancel();
  const btn = document.getElementById('audioFab');
  btn.classList.add('speaking');
  btn.innerHTML = '<i class="fas fa-stop"></i>';
  TTS.wakeLock = setInterval(() => {
    if (TTS.active && !TTS.paused && speechSynthesis.paused) speechSynthesis.resume();
  }, 800);
  document.body.classList.add('tts-on');
  if (localStorage.getItem('tts-mini') === '1') document.body.classList.add('tts-mini');
  setTimeout(ttsSpeakNext, 100);
  ttsShowPanel();
};
function ttsStop() {
  speechSynthesis.cancel();
  TTS.active = false;
  TTS.paused = false;
  TTS.index = 0;
  TTS.chunks = [];
  ttsHighlight(null);
  const btn = document.getElementById('audioFab');
  btn.classList.remove('speaking');
  btn.innerHTML = '<i class="fas fa-volume-up"></i>';
  if (TTS.wakeLock) {
    clearInterval(TTS.wakeLock);
    TTS.wakeLock = null;
  }
  if (TTS.sleepTimer) {
    clearTimeout(TTS.sleepTimer);
    TTS.sleepTimer = null;
    TTS.sleepEndsAt = 0;
  }
  document.body.classList.remove('tts-on');
  ttsHidePanel();
}
function ttsToggleMini() {
  document.body.classList.toggle('tts-mini');
  const mini = document.body.classList.contains('tts-mini');
  localStorage.setItem('tts-mini', mini ? '1' : '0');
  const icon = TTS.panel?.querySelector('.ap-mini-btn i');
  if (icon)
    icon.className = mini ? 'fas fa-up-right-and-down-left-from-center' : 'fas fa-down-left-and-up-right-to-center';
  if (window.toast) toast(mini ? 'Lecteur réduit — le texte est visible' : 'Lecteur étendu', 'info', 2e3);
}
function ttsPause() {
  if (!TTS.active || TTS.paused) return;
  TTS.paused = true;
  speechSynthesis.pause();
  ttsUpdatePanel();
}
function ttsResume() {
  if (!TTS.active || !TTS.paused) return;
  TTS.paused = false;
  speechSynthesis.resume();
  ttsUpdatePanel();
}
function ttsTogglePause() {
  TTS.paused ? ttsResume() : ttsPause();
}
function ttsSkip(delta) {
  if (!TTS.active) return;
  speechSynthesis.cancel();
  TTS.index = Math.max(0, Math.min(TTS.chunks.length - 1, TTS.index + delta));
  if (!TTS.paused) setTimeout(ttsSpeakNext, 80);
  ttsUpdatePanel();
}
function ttsSetRate(r) {
  TTS.rate = r;
  localStorage.setItem('tts-rate', r);
  if (TTS.active) {
    speechSynthesis.cancel();
    setTimeout(ttsSpeakNext, 80);
  }
  ttsUpdatePanel();
}
function ttsSetPitch(p) {
  TTS.pitch = p;
  localStorage.setItem('tts-pitch', p);
  if (TTS.active) {
    speechSynthesis.cancel();
    setTimeout(ttsSpeakNext, 80);
  }
}
function ttsSetVoice(name) {
  TTS.voiceName = name;
  localStorage.setItem('tts-voice', name);
  if (TTS.active) {
    speechSynthesis.cancel();
    setTimeout(ttsSpeakNext, 80);
  }
}
function ttsSetSleep(min) {
  if (TTS.sleepTimer) {
    clearTimeout(TTS.sleepTimer);
    TTS.sleepTimer = null;
    TTS.sleepEndsAt = 0;
  }
  if (!min) {
    ttsUpdatePanel();
    return;
  }
  TTS.sleepEndsAt = Date.now() + min * 60 * 1e3;
  TTS.sleepTimer = setTimeout(
    () => {
      if (window.toast) toast('💤 Lecture arrêtée (sleep timer)', 'info');
      ttsStop();
    },
    min * 60 * 1e3
  );
  if (window.toast) toast(`⏲️ Arrêt automatique dans ${min} min`, 'info');
  ttsUpdatePanel();
}
function ttsBuildPanel() {
  if (TTS.panel) return TTS.panel;
  const p = document.createElement('div');
  p.className = 'audio-player';
  p.id = 'audioPlayer';
  const isMini = document.body.classList.contains('tts-mini');
  p.innerHTML = `\n        <div class="ap-header"><i class="fas fa-headphones"></i> Lecteur audio<button class="ap-mini-btn" id="apMini" title="Réduire/Agrandir"><i class="fas ${isMini ? 'fa-up-right-and-down-left-from-center' : 'fa-down-left-and-up-right-to-center'}"></i></button><button class="ap-close" id="apClose" title="Fermer"><i class="fas fa-times"></i></button></div>\n        <div class="ap-mini-bar">\n          <button class="ap-mini-play" id="apMiniPlay" title="Pause/Lecture"><i class="fas fa-pause"></i></button>\n          <button id="apMiniPrev" title="Précédent"><i class="fas fa-backward-step"></i></button>\n          <button id="apMiniNext" title="Suivant"><i class="fas fa-forward-step"></i></button>\n          <div class="ap-mini-progress" id="apMiniProgress"><div class="ap-mini-progress-bar" id="apMiniProgressBar"></div></div>\n          <span class="ap-mini-pos" id="apMiniPos">0%</span>\n        </div>\n        <div class="ap-body">\n          <div class="ap-progress" id="apProgress"><div class="ap-progress-bar" id="apProgressBar"></div></div>\n          <div class="ap-info"><span id="apPos">0/0</span><span id="apSleep"></span></div>\n          <div class="ap-controls">\n            <button class="ap-btn" id="apPrev" title="Précédent (←)"><i class="fas fa-backward-step"></i></button>\n            <button class="ap-btn" id="apBack10" title="-10s"><i class="fas fa-backward"></i></button>\n            <button class="ap-btn ap-play" id="apPlay" title="Pause/Lecture (Espace)"><i class="fas fa-pause"></i></button>\n            <button class="ap-btn" id="apFwd10" title="+10s"><i class="fas fa-forward"></i></button>\n            <button class="ap-btn" id="apNext" title="Suivant (→)"><i class="fas fa-forward-step"></i></button>\n          </div>\n          <div class="ap-settings">\n            <div class="ap-setting"><label>Vitesse <span class="ap-rate-val" id="apRateVal">${TTS.rate}x</span></label><input type="range" id="apRate" min="0.5" max="2" step="0.1" value="${TTS.rate}"></div>\n            <div class="ap-setting"><label>Voix</label><select id="apVoice"></select></div>\n          </div>\n          <div class="ap-sleep">💤 Sleep timer :\n            <select id="apSleepSel">\n              <option value="0">Désactivé</option>\n              <option value="5">5 min</option>\n              <option value="10">10 min</option>\n              <option value="15">15 min</option>\n              <option value="30">30 min</option>\n              <option value="60">60 min</option>\n            </select>\n          </div>\n        </div>`;
  document.body.appendChild(p);
  TTS.panel = p;
  p.querySelector('#apClose').onclick = ttsStop;
  p.querySelector('#apMini').onclick = ttsToggleMini;
  p.querySelector('#apMiniPlay').onclick = ttsTogglePause;
  p.querySelector('#apMiniPrev').onclick = () => ttsSkip(-1);
  p.querySelector('#apMiniNext').onclick = () => ttsSkip(1);
  p.querySelector('#apMiniProgress').onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - r.left) / r.width;
    if (TTS.chunks.length) {
      speechSynthesis.cancel();
      TTS.index = Math.floor(pct * TTS.chunks.length);
      if (!TTS.paused) setTimeout(ttsSpeakNext, 80);
    }
  };
  p.querySelector('#apPlay').onclick = ttsTogglePause;
  p.querySelector('#apPrev').onclick = () => ttsSkip(-1);
  p.querySelector('#apNext').onclick = () => ttsSkip(1);
  p.querySelector('#apBack10').onclick = () => ttsSkip(-3);
  p.querySelector('#apFwd10').onclick = () => ttsSkip(3);
  p.querySelector('#apProgress').onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - r.left) / r.width;
    if (TTS.chunks.length) {
      speechSynthesis.cancel();
      TTS.index = Math.floor(pct * TTS.chunks.length);
      if (!TTS.paused) setTimeout(ttsSpeakNext, 80);
    }
  };
  const rateEl = p.querySelector('#apRate');
  rateEl.oninput = e => {
    const v = parseFloat(e.target.value);
    p.querySelector('#apRateVal').textContent = v.toFixed(1) + 'x';
    ttsSetRate(v);
  };
  p.querySelector('#apSleepSel').onchange = e => ttsSetSleep(parseInt(e.target.value));
  ttsPopulateVoices();
  return p;
}
function ttsPopulateVoices() {
  if (!TTS.panel) return;
  const sel = TTS.panel.querySelector('#apVoice');
  if (!sel) return;
  const list = ttsGetVoices();
  sel.innerHTML = list.length
    ? list
        .map(
          v =>
            `<option value="${v.name}" ${v.name === TTS.voiceName ? 'selected' : ''}>${v.name.replace(/\s*\(.*\)\s*/, '')} (${v.lang})</option>`
        )
        .join('')
    : '<option>Aucune voix française</option>';
  sel.onchange = e => ttsSetVoice(e.target.value);
}
function ttsShowPanel() {
  ttsBuildPanel().classList.add('show');
  ttsUpdatePanel();
}
function ttsHidePanel() {
  if (TTS.panel) TTS.panel.classList.remove('show');
}
function ttsUpdatePanel() {
  if (!TTS.panel) return;
  const total = TTS.chunks.length || 1;
  const pct = Math.min(100, Math.round((TTS.index / total) * 100));
  TTS.panel.querySelector('#apProgressBar').style.width = pct + '%';
  TTS.panel.querySelector('#apMiniProgressBar').style.width = pct + '%';
  TTS.panel.querySelector('#apPos').textContent = `${TTS.index}/${TTS.chunks.length} • ${pct}%`;
  TTS.panel.querySelector('#apMiniPos').textContent = pct + '%';
  const cls = TTS.paused ? 'fas fa-play' : 'fas fa-pause';
  TTS.panel.querySelector('#apPlay i').className = cls;
  TTS.panel.querySelector('#apMiniPlay i').className = cls;
  const sleepEl = TTS.panel.querySelector('#apSleep');
  if (TTS.sleepEndsAt) {
    const left = Math.max(0, Math.round((TTS.sleepEndsAt - Date.now()) / 6e4));
    sleepEl.textContent = '💤 ' + left + ' min restantes';
    sleepEl.className = 'ap-sleep-active';
  } else {
    sleepEl.textContent = '';
    sleepEl.className = '';
  }
}
document.addEventListener('keydown', e => {
  if (!TTS.active) return;
  if (e.target.matches('input,textarea,select')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    ttsTogglePause();
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    ttsSkip(-1);
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    ttsSkip(1);
  } else if (e.code === 'Escape') {
    ttsStop();
  }
});
document.getElementById('audioFab').addEventListener('click', () => {
  if (TTS.active) {
    ttsStop();
  } else {
    ttsStart();
  }
});
setInterval(() => {
  if (TTS.active && TTS.sleepEndsAt) ttsUpdatePanel();
}, 3e4);
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = ttsPopulateVoices;
}
window.addEventListener('beforeunload', () => {
  if (TTS.active) speechSynthesis.cancel();
});
let swReady = null;
if ('serviceWorker' in navigator) {
  // Écoute du changement de contrôleur SW (Standard PWA : reload immédiat lors de skipWaiting)
  navigator.serviceWorker.addEventListener('controllerchange', async () => {
    if (isAppReloading) return;
    isAppReloading = true;
    console.log('🔄 Nouveau contrôleur Service Worker actif -> Actualisation automatique');
    try {
      if ('caches' in window) {
        const ks = await caches.keys();
        await Promise.all(ks.map(k => caches.delete(k)));
      }
    } catch(e) {}
    window.location.reload();
  });

  navigator.serviceWorker.register('/sw.js').then(reg => {
    swReady = reg;
    console.log('SW registered');
    try { reg.update(); } catch(e) {}
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('Nouvelle version Service Worker installée -> actualisation automatique');
            if (!isAppReloading) {
              isAppReloading = true;
              window.location.reload();
            }
          }
        });
      }
    });
    navigator.serviceWorker.addEventListener('message', async e => {
      if (e.data && (e.data.type === 'SW_UPDATED' || e.data.type === 'FORCE_UPDATE_RELOAD' || e.data.type === 'FORCE_REFRESH_NEW_VERSION')) {
        console.log('[SW] Mise à jour disponible en arrière-plan:', e.data.version);
      }
      if (e.data.type === 'CACHE_DONE') {
        document.querySelectorAll('.dl-btn.downloading').forEach(btn => {
          btn.classList.remove('downloading');
          btn.classList.add('downloaded');
          btn.innerHTML = '<i class="fas fa-check-circle"></i> Disponible hors-ligne';
        });
        refreshOfflineStatus();
      }
      if (e.data.type === 'CACHED_LIST') {
        window._cachedUrls = new Set(e.data.urls);
        refreshOfflineStatus();
      }
      if (e.data.type === 'CACHE_CLEARED') {
        window._cachedUrls = new Set();
        refreshOfflineStatus();
      }
    });
    setTimeout(() => {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'GET_CACHED' });
      }
    }, 1e3);
  });

  // Polling automatique pour les PWA installées (toutes les 30s + au focus/visibilitychange)
  setInterval(() => {
    checkForUpdates();
    if (swReady) { try { swReady.update(); } catch(e){} }
  }, 30000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForUpdates();
      if (swReady) { try { swReady.update(); } catch(e){} }
    }
  });

  window.addEventListener('focus', () => {
    checkForUpdates();
    if (swReady) { try { swReady.update(); } catch(e){} }
  });
}
window._cachedUrls = new Set();

function clearOfflineCache() {
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
  if (window.toast) toast('Cache hors-ligne vidé', 'info');
}
function showStorageInfo() {
  if (typeof openStatistiquesModal === 'function') {
    openStatistiquesModal('storage');
  }
}
window.showStorageInfo = showStorageInfo;
function refreshOfflineStatus() {
  return;
}
const PROGRESS_KEY = 'resumeci_progress';
const FAVS_KEY = 'resumeci_favorites';
const THEME_KEY = 'resumeci_theme';
function getProgress() {
  return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{"fiches":{},"daily":{}}');
}
function saveProgress(p) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
}
function getFavorites() {
  return JSON.parse(localStorage.getItem(FAVS_KEY) || '[]');
}
function saveFavorites(f) {
  localStorage.setItem(FAVS_KEY, JSON.stringify(f));
}
function trackFicheRead(cls, sub, file) {
  const p = getProgress();
  const key = `${cls}/${sub}/${file}`;
  if (!p.fiches[key]) {
    p.fiches[key] = { first: Date.now() };
  }
  p.fiches[key].last = Date.now();
  const today = typeof getLocalDateStr === 'function' ? getLocalDateStr() : new Date().toISOString().slice(0, 10);
  p.daily[today] = (p.daily[today] || 0) + 1;
  saveProgress(p);
  if (typeof updateStreak === 'function') updateStreak();
}
function getWeekData() {
  const p = getProgress();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = typeof getLocalDateStr === 'function' 
      ? getLocalDateStr(new Date(Date.now() - i * 864e5))
      : new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    days.push({
      day: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][new Date(d).getDay()],
      count: p.daily[d] || 0,
      isToday: i === 0,
    });
  }
  return days;
}
function renderProgressPanel() {
  const p = getProgress();
  const streak = typeof getStreak === 'function' ? getStreak() : 0;
  const totalRead = Object.keys(p.fiches).length;
  const structure = DATA.structure;
  const weekData = getWeekData();
  const maxW = Math.max(...weekData.map(d => d.count), 1);
  let bars = '';
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
  let ci = 0;
  let classesToRender = Object.entries(structure);
  if (window.USER_PROFILE && window.USER_PROFILE.selectedClass) {
    classesToRender = classesToRender.filter(([c]) => c === window.USER_PROFILE.selectedClass);
  }
  for (const [cls, subjects] of classesToRender) {
    const total = Object.values(subjects).reduce((s, a) => s + a.length, 0);
    const read = Object.keys(p.fiches).filter(k => k.startsWith(cls + '/')).length;
    const pct = total ? Math.round((read / total) * 100) : 0;
    const color = colors[ci % colors.length];
    bars += `<div class="prog-row"><span class="prog-label">${cls.replace('_', ' ')}</span><div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:${color}"></div></div><span class="prog-count">${read}/${total}</span></div>`;
    ci++;
  }
  let weekBars = '';
  weekData.forEach(d => {
    const h = d.count ? Math.max(15, Math.round((d.count / maxW) * 100)) : 4;
    weekBars += `<div class="week-bar${d.isToday ? ' active' : ''}" style="height:${h}%"><span class="week-bar-label">${d.day}</span></div>`;
  });
  const streakBadgeHtml = streak > 0 
    ? `<span class="streak-badge"><i class="fas fa-fire"></i> ${streak} jour${streak > 1 ? 's' : ''}</span>`
    : `<span class="streak-badge" style="background:#64748b;opacity:0.85"><i class="fas fa-fire" style="filter:grayscale(1)"></i> 0 jour</span>`;
  return `<div class="progress-panel"><h3><i class="fas fa-chart-line" style="color:var(--accent)"></i> Ma progression${streakBadgeHtml}</h3><div class="progress-bars">${bars}</div><div class="week-chart">${weekBars}</div></div>`;
}

let currentStatsTab = 'progression';

function closeStatistiquesModal() {
  const m = document.getElementById('statistiquesModal');
  if (m) {
    m.classList.remove('show');
    m.classList.remove('active');
  }
}
window.closeStatistiquesModal = closeStatistiquesModal;

function switchStatsTab(tab) {
  openStatistiquesModal(tab);
}
window.switchStatsTab = switchStatsTab;

async function openStatistiquesModal(tab = 'progression') {
  // Vérification de l'abonnement Pass Starter (500 FCFA)
  const hasStats = window.userHasFeature ? window.userHasFeature('Statistiques Avancées') : false;
  if (!hasStats) {
    if (typeof openPremiumTeaser === 'function') {
      openPremiumTeaser('Statistiques Avancées');
    }
    return;
  }

  currentStatsTab = tab;
  const modal = document.getElementById('statistiquesModal');
  if (!modal) return;

  modal.classList.add('show');
  modal.classList.add('active');

  const btnProg = document.getElementById('statsTabBtnProgression');
  const btnStore = document.getElementById('statsTabBtnStorage');
  if (btnProg) btnProg.classList.toggle('active', tab === 'progression');
  if (btnStore) btnStore.classList.toggle('active', tab === 'storage');

  const titleEl = document.getElementById('statsModalTitle');
  const subtitleEl = document.getElementById('statsModalSubtitle');
  if (titleEl) {
    titleEl.textContent = tab === 'progression' ? 'Statistiques & Progression' : 'Mémoire & Données en Cache';
  }
  if (subtitleEl) {
    subtitleEl.textContent = tab === 'progression'
      ? "Suivi d'apprentissage & Programme scolaire"
      : "Stockage local de ton téléphone & Mode hors-ligne";
  }

  const bodyEl = document.getElementById('statsModalBody');
  if (!bodyEl) return;

  if (tab === 'progression') {
    renderStatsProgression(bodyEl);
  } else {
    await renderStatsStorage(bodyEl);
  }
}
window.openStatistiquesModal = openStatistiquesModal;

function renderStatsProgression(container) {
  const p = getProgress();
  const streak = typeof getStreak === 'function' ? getStreak() : 0;
  const structure = (window.DATA && window.DATA.structure) ? window.DATA.structure : {};
  const selectedCls = (window.USER_PROFILE && window.USER_PROFILE.selectedClass) || '3eme';
  const clsClean = selectedCls.replace(/_/g, ' ');

  const classSubjects = structure[selectedCls] || (Object.keys(structure).length > 0 ? structure[Object.keys(structure)[0]] : {});

  let totalClassFiches = 0;
  let readClassFiches = 0;
  const subjectsData = [];

  const subjectIcons = {
    'Mathematiques': '📐',
    'Mathématiques': '📐',
    'Physique - Chimie': '⚡',
    'Physique-Chimie': '⚡',
    'SVT': '🧬',
    'Français': '📚',
    'Francais': '📚',
    'Histoire - Géographie': '🌍',
    'Histoire-Geographie': '🌍',
    'EDHC': '⚖️',
    'Philosophie': '💡',
    'Anglais': '🇬🇧',
    'Allemand': '🇩🇪',
    'Espagnol': '🇪🇸',
    'TIC': '💻'
  };

  const subjectColors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#6366f1'];
  let cIdx = 0;

  for (const [sub, files] of Object.entries(classSubjects)) {
    const subTotal = Array.isArray(files) ? files.length : 0;
    totalClassFiches += subTotal;
    const subRead = Object.keys(p.fiches || {}).filter(k => k.startsWith(`${selectedCls}/${sub}/`)).length;
    readClassFiches += subRead;
    const pct = subTotal ? Math.round((subRead / subTotal) * 100) : 0;
    const icon = subjectIcons[sub] || '📖';
    const color = subjectColors[cIdx % subjectColors.length];
    cIdx++;

    subjectsData.push({
      name: sub,
      icon,
      total: subTotal,
      read: subRead,
      pct,
      color
    });
  }

  const globalPct = totalClassFiches ? Math.round((readClassFiches / totalClassFiches) * 100) : 0;
  const weekData = getWeekData();
  const maxW = Math.max(...weekData.map(d => d.count), 1);
  const weekTotal = weekData.reduce((acc, d) => acc + (d.count || 0), 0);

  let subjectsHtml = '';
  if (subjectsData.length === 0) {
    subjectsHtml = `<div style="text-align:center;padding:15px;color:#64748b;font-size:12px;">Aucune matière chargée pour ${clsClean}.</div>`;
  } else {
    subjectsData.forEach(s => {
      subjectsHtml += `
        <div class="stats-subject-row">
          <div class="stats-sub-icon">${s.icon}</div>
          <div class="stats-sub-info">
            <div class="stats-sub-title-row">
              <span class="stats-sub-name">${s.name}</span>
              <span class="stats-sub-count">${s.read}/${s.total} (${s.pct}%)</span>
            </div>
            <div class="stats-prog-track" style="margin:2px 0 0;height:6px;">
              <div class="stats-prog-fill" style="width:${s.pct}%;background:${s.color};"></div>
            </div>
          </div>
        </div>`;
    });
  }

  let weekColsHtml = '';
  weekData.forEach(d => {
    const h = d.count ? Math.max(16, Math.min(100, Math.round((d.count / maxW) * 100))) : 4;
    weekColsHtml += `
      <div class="stats-week-col">
        <span class="stats-week-val">${d.count > 0 ? d.count : ''}</span>
        <div class="stats-week-bar-wrap">
          <div class="stats-week-bar ${d.isToday ? 'today' : ''}" style="height:${h}%;"></div>
        </div>
        <span class="stats-week-day ${d.isToday ? 'today' : ''}">${d.day}</span>
      </div>`;
  });

  const hasAdvancedStats = window.userHasFeature ? window.userHasFeature('Statistiques Avancées') : false;
  const premiumInsightHtml = hasAdvancedStats
    ? `<div style="background:linear-gradient(135deg,#eff6ff,#f0fdf4);border:1px solid #bfdbfe;border-radius:12px;padding:10px 12px;font-size:11.5px;color:#1e3a8a;display:flex;align-items:center;gap:8px;margin-top:10px;">
        <span style="font-size:18px;">✨</span>
        <div><strong>Pass Élite Actif :</strong> Tes performances sont enregistrées. Objectif recommandé : 2 fiches par jour.</div>
      </div>`
    : `<div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;padding:10px 12px;font-size:11.5px;color:#475569;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;">
        <div><span>🎯</span> Débloque les conseils ciblés et points faibles avec le <strong>Pass Élite</strong>.</div>
        <button onclick="closeStatistiquesModal();openElitePassModal('Statistiques Avancées');" style="background:#2563eb;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">Découvrir</button>
      </div>`;

  container.innerHTML = `
    <!-- Grille 3 Chiffres clés -->
    <div class="stats-summary-grid">
      <div class="stats-summary-card">
        <span class="ssc-val" style="color:#2563eb;">${readClassFiches}/${totalClassFiches}</span>
        <span class="ssc-lbl">Fiches Lues</span>
      </div>
      <div class="stats-summary-card">
        <span class="ssc-val" style="color:#f59e0b;">🔥 ${streak} j</span>
        <span class="ssc-lbl">Flamme Active</span>
      </div>
      <div class="stats-summary-card">
        <span class="ssc-val" style="color:#10b981;">${globalPct}%</span>
        <span class="ssc-lbl">Progression</span>
      </div>
    </div>

    <!-- Carte Progression Globale -->
    <div class="stats-global-card">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;color:#065f46;">
        <span>Progression globale (${clsClean})</span>
        <span style="font-weight:800;color:#10b981;">${globalPct}%</span>
      </div>
      <div class="stats-prog-track">
        <div class="stats-prog-fill" style="width:${globalPct}%;background:linear-gradient(90deg,#10b981,#059669);"></div>
      </div>
      <div style="font-size:11px;color:#047857;display:flex;justify-content:space-between;">
        <span>${readClassFiches} fiches lues</span>
        <span>${Math.max(0, totalClassFiches - readClassFiches)} fiches restantes</span>
      </div>
    </div>

    <!-- Détail par matière -->
    <div style="font-size:12px;font-weight:800;color:var(--text, #1e293b);margin:10px 0 6px;display:flex;align-items:center;gap:6px;">
      <i class="fas fa-layer-group" style="color:#3b82f6;"></i> Détail par matière (${clsClean})
    </div>
    <div class="stats-subjects-list">
      ${subjectsHtml}
    </div>

    <!-- Activité des 7 derniers jours -->
    <div class="stats-week-box">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:800;color:var(--text, #1e293b);margin-bottom:6px;">
        <span><i class="fas fa-calendar-check" style="color:#2563eb;"></i> Activité des 7 derniers jours</span>
        <span style="font-size:10.5px;font-weight:700;color:#2563eb;">${weekTotal} fiches</span>
      </div>
      <div class="stats-week-chart">
        ${weekColsHtml}
      </div>
    </div>

    ${premiumInsightHtml}
  `;
}

async function renderStatsStorage(container) {
  container.innerHTML = `
    <div style="text-align:center;padding:24px;color:#64748b;">
      <div class="spinner" style="width:22px;height:22px;border-width:2.5px;margin:0 auto 10px;"></div>
      Analyse du stockage local et des données en cache...
    </div>`;

  let usedMb = '0.0';
  let quotaMb = '0';
  let usedPercent = 0;
  let cachedFichesCount = 0;

  if (navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      const u = (est.usage || 0) / (1024 * 1024);
      const q = (est.quota || 0) / (1024 * 1024);
      usedMb = u.toFixed(1);
      quotaMb = q >= 1024 ? (q / 1024).toFixed(1) + ' Go' : q.toFixed(0) + ' Mo';
      usedPercent = q > 0 ? Math.min(100, Math.round((u / q) * 100)) : 1;
    } catch(err) {
      console.warn("Storage estimate error", err);
    }
  }

  if ('caches' in window) {
    try {
      const cache = await caches.open('resumeci-fiches-v3');
      const keys = await cache.keys();
      cachedFichesCount = keys.length;
    } catch(e) {
      console.warn("caches.open error", e);
    }
  }

  const downloadedClasses = typeof getDownloadedClasses === 'function' ? getDownloadedClasses() : [];
  const selectedCls = (window.USER_PROFILE && window.USER_PROFILE.selectedClass) || '3eme';
  const clsClean = selectedCls.replace(/_/g, ' ');

  let packsHtml = '';
  if (downloadedClasses.length > 0) {
    packsHtml = downloadedClasses.map(c => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <i class="fas fa-check-circle" style="color:#10b981;font-size:14px;"></i>
          <span style="font-size:12px;font-weight:700;color:#065f46;">Pack ${c.replace(/_/g, ' ')}</span>
        </div>
        <span style="font-size:10.5px;color:#047857;background:#dcfce7;padding:2px 8px;border-radius:999px;font-weight:700;">Prêt hors-ligne</span>
      </div>
    `).join('');
  } else {
    packsHtml = `
      <div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;padding:12px;text-align:center;">
        <p style="font-size:12px;color:#64748b;margin:0 0 8px 0;">Aucun pack de cours complet n'a encore été téléchargé sur cet appareil.</p>
        <button onclick="closeStatistiquesModal();downloadClassOffline('${selectedCls}');" style="background:#10b981;color:#fff;border:none;padding:7px 14px;border-radius:8px;font-size:11.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
          <i class="fas fa-cloud-arrow-down"></i> Télécharger le pack ${clsClean}
        </button>
      </div>
    `;
  }

  const swStatus = (navigator.serviceWorker && navigator.serviceWorker.controller)
    ? `<span style="color:#10b981;font-weight:700;"><i class="fas fa-circle-check"></i> Actif & synchronisé</span>`
    : `<span style="color:#f59e0b;font-weight:700;"><i class="fas fa-clock"></i> En cours d'initialisation</span>`;

  container.innerHTML = `
    <!-- Grille Résumé Stockage -->
    <div class="stats-summary-grid">
      <div class="stats-summary-card">
        <span class="ssc-val" style="color:#2563eb;">${usedMb} Mo</span>
        <span class="ssc-lbl">Mémoire Utilisée</span>
      </div>
      <div class="stats-summary-card">
        <span class="ssc-val" style="color:#10b981;">${cachedFichesCount}</span>
        <span class="ssc-lbl">Fiches en Cache</span>
      </div>
      <div class="stats-summary-card">
        <span class="ssc-val" style="color:#0f172a;">${quotaMb}</span>
        <span class="ssc-lbl">Quota Alloué</span>
      </div>
    </div>

    <!-- Carte Jauge Stockage -->
    <div class="stats-storage-card">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;color:#1e3a8a;">
        <span><i class="fas fa-mobile-screen"></i> Espace RésuméCI sur l'appareil</span>
        <span style="font-weight:800;">${usedMb} Mo / ${quotaMb}</span>
      </div>
      <div class="stats-storage-jauge">
        <div class="stats-storage-jauge-fill" style="width:${Math.max(4, usedPercent)}%;"></div>
      </div>
      <div style="font-size:11px;color:#3b82f6;margin-top:5px;line-height:1.4;">
        <i class="fas fa-shield-alt"></i> Les fiches sont mises en mémoire dans le navigateur de ton téléphone pour s'ouvrir instantanément et fonctionner hors-connexion.
      </div>
    </div>

    <!-- État Service Worker & Mode Hors-ligne -->
    <div class="stats-cache-box" style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;margin-bottom:6px;">
        <span style="color:#64748b;font-weight:600;"><i class="fas fa-wifi"></i> Moteur hors-ligne (Service Worker) :</span>
        <span>${swStatus}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;">
        <span style="color:#64748b;font-weight:600;"><i class="fas fa-database"></i> Cache actif :</span>
        <span style="font-weight:700;color:var(--text, #1e293b);">${cachedFichesCount} ressources hors-ligne</span>
      </div>
    </div>

    <!-- Packs Téléchargés -->
    <div class="stats-cache-box">
      <div style="font-size:12px;font-weight:800;color:var(--text, #1e293b);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
        <i class="fas fa-box-archive" style="color:#10b981;"></i> Packs Hors-Ligne enregistrés
      </div>
      ${packsHtml}
    </div>

    <!-- Boutons d'Action -->
    <div style="display:flex;gap:8px;flex-direction:column;margin-top:12px;">
      <button class="btn" onclick="openStatistiquesModal('storage')" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 14px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:12px;font-size:12px;font-weight:700;cursor:pointer;">
        <i class="fas fa-sync-alt"></i> Actualiser l'état du cache
      </button>
      <button class="btn" onclick="promptClearOfflineCache()" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 14px;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;border-radius:12px;font-size:12px;font-weight:700;cursor:pointer;">
        <i class="fas fa-trash-alt"></i> Vider le cache hors-ligne
      </button>
    </div>
  `;
}

async function promptClearOfflineCache() {
  const confirmed = confirm("Voulez-vous vraiment effacer les fiches et données enregistrées hors-ligne sur cet appareil pour libérer de la mémoire ?");
  if (!confirmed) return;

  try {
    if ('caches' in window) {
      await caches.delete('resumeci-fiches-v3');
    }
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
    }
    localStorage.removeItem('resumeci_downloaded_classes');
    if (window.toast) toast('🧹 Cache hors-ligne vidé avec succès !', 'success', 3500);
    openStatistiquesModal('storage');
    if (typeof refreshOfflineStatus === 'function') refreshOfflineStatus();
  } catch(err) {
    console.warn("Erreur lors du vidage du cache:", err);
    if (window.toast) toast("Impossible de vider le cache.", 'warn');
  }
}
window.promptClearOfflineCache = promptClearOfflineCache;

// Event listeners for closing Statistiques Modal
document.addEventListener('DOMContentLoaded', () => {
  const sm = document.getElementById('statistiquesModal');
  if (sm) {
    sm.addEventListener('click', (e) => {
      if (e.target === sm) closeStatistiquesModal();
    });
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeStatistiquesModal();
});

function toggleFavorite(cls, sub, file) {
  let favs = getFavorites();
  const key = `${cls}/${sub}/${file}`;
  const idx = favs.findIndex(f => f.key === key);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push({ key: key, cls: cls, sub: sub, file: file, added: Date.now() });
  saveFavorites(favs);
  return idx < 0;
}
function isFavorite(cls, sub, file) {
  return getFavorites().some(f => f.key === `${cls}/${sub}/${file}`);
}
function renderFavsSidebar() {
  const favs = getFavorites();
  const el = document.getElementById('favsList');
  if (!el) return;
  if (!favs.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<div class="favs-section"><h3><i class="fas fa-star" style="color:#f59e0b"></i> Favoris</h3>${favs
    .slice(0, 8)
    .map(
      f =>
        `<div class="fav-item" onclick="showFiche('${esc(f.cls)}','${esc(f.sub)}','${esc(f.file)}')"><i class="fas fa-bookmark" style="color:#f59e0b;font-size:10px"></i>${f.file.replace('Fiche_', '').replace('.html', '').replace(/_/g, ' ').substring(0, 30)}</div>`
    )
    .join('')}</div>`;
}
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  document.querySelectorAll('.theme-dot').forEach(d => d.classList.toggle('active', d.dataset.theme === theme));
}
(function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) document.documentElement.setAttribute('data-theme', saved);
})();
let voiceRecognition = null;
function setVoiceListening(on) {
  const btn = document.querySelector('.voice-btn');
  const input = document.getElementById('searchInput');
  if (on) {
    btn.classList.add('listening');
    btn.innerHTML = '<i class="fas fa-stop"></i>';
    input.placeholder = '🎙️ Parle maintenant...';
    input.style.borderColor = '#ef4444';
  } else {
    btn.classList.remove('listening');
    btn.innerHTML = '<i class="fas fa-microphone"></i>';
    input.placeholder = 'Rechercher une leçon...';
    input.style.borderColor = '';
    voiceRecognition = null;
  }
}
async function startVoiceSearch() {
  if (voiceRecognition) {
    voiceRecognition.abort();
    setVoiceListening(false);
    return;
  }
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    window.showActionNotice({
      type: 'warning',
      icon: '🎙️',
      title: 'Micro Non Supporté',
      subtitle: 'Recherche Vocale',
      message: 'La reconnaissance vocale n\'est pas supportée par ce navigateur.\n\nUtilise Google Chrome ou Microsoft Edge pour faire des recherches à la voix.',
      primaryBtnText: 'Compris'
    });
    return;
  }
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    window.showActionNotice({
      type: 'warning',
      icon: '🔒',
      title: 'Connexion Sécurisée Requise',
      subtitle: 'Recherche Vocale',
      message: 'La recherche vocale nécessite une connexion HTTPS pour accéder au micro.',
      primaryBtnText: 'D\'accord'
    });
    return;
  }
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    }
  } catch (err) {
    if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
      window.showActionNotice({
        type: 'warning',
        icon: '🎙️',
        title: 'Permission Micro Refusée',
        subtitle: 'Accès Microphone',
        message: "Pour activer la recherche vocale :\n1. Clique sur l'icône de cadenas 🔒 dans ta barre d'adresse\n2. Active l'option « Microphone »\n3. Recharge la page",
        primaryBtnText: 'J\'ai compris'
      });
    } else if (err && err.name === 'NotFoundError') {
      window.showActionNotice({
        type: 'warning',
        icon: '🎧',
        title: 'Microphone Introuvable',
        subtitle: 'Périphérique Audio',
        message: 'Aucun microphone n\'a été détecté sur ton appareil.',
        primaryBtnText: 'D\'accord'
      });
    } else {
      window.showActionNotice({
        type: 'error',
        icon: '⚠️',
        title: 'Accès Micro Impossible',
        subtitle: 'Erreur Périphérique',
        message: "Impossible d'accéder au micro : " + (err && err.message ? err.message : err),
        primaryBtnText: 'Fermer'
      });
    }
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();
  voiceRecognition = rec;
  rec.lang = 'fr-FR';
  rec.continuous = false;
  rec.interimResults = true;
  setVoiceListening(true);
  rec.onresult = e => {
    const result = e.results[0];
    const txt = result[0].transcript;
    document.getElementById('searchInput').value = txt;
    if (result.isFinal) {
      setVoiceListening(false);
      searchLessons(txt);
    }
  };
  rec.onerror = e => {
    setVoiceListening(false);
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      window.showActionNotice({
        type: 'warning',
        icon: '🎙️',
        title: 'Permission Micro Refusée',
        subtitle: 'Paramètres du navigateur',
        message: 'L\'accès au micro a été refusé. Tu peux l\'activer dans les réglages de ton navigateur.',
        primaryBtnText: 'Compris'
      });
    } else if (e.error === 'no-speech') {
      if (window.toast) toast('Aucune parole détectée. Appuie sur 🎙️ et parle plus fort.', 'warn');
    } else if (e.error !== 'aborted') {
      if (window.toast) toast('Erreur vocale : ' + e.error, 'error');
    }
  };
  rec.onend = () => {
    setVoiceListening(false);
  };
  try {
    rec.start();
  } catch (err) {
    setVoiceListening(false);
    console.error('SpeechRecognition start error', err);
  }
}
function checkAutoNight() {
  const h = new Date().getHours();
  if (h >= 21 || h < 6) {
    if (!document.body.classList.contains('dark-mode')) toggleDarkMode();
  }
}
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === '/' || (e.key === 's' && !e.ctrlKey)) {
    e.preventDefault();
    document.getElementById('searchInput').focus();
  }
  if (e.key === 'Escape') {
    showDashboard();
  }
});
loadData();
window.submitAnnVip = async function(btn) {
  const input = document.getElementById('annVipPhone');
  const feedback = document.getElementById('annVipFeedback');
  const group = document.getElementById('annVipInputGroup');
  if (!input) return;
  
  let raw = input.value.replace(/\D/g, '');
  if (raw.startsWith('225') && raw.length > 10) raw = raw.slice(3);
  
  if (raw.length !== 10) {
    if (window.haptic) window.haptic([50, 50, 50]);
    if (feedback) {
      feedback.style.color = '#ef4444';
      feedback.innerHTML = '⚠️ Veuillez entrer votre numéro WhatsApp à 10 chiffres (ex: 0104911010)';
    }
    input.focus();
    return;
  }
  
  const oldText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  
  try {
    if (typeof window.joinWaitlist === 'function') {
      await window.joinWaitlist(raw, 'Liste VIP 01 Octobre');
    }
    if (window.haptic) window.haptic([100, 50, 100]);
    if (window.confetti) window.confetti();
    if (group) group.style.display = 'none';
    if (feedback) {
      feedback.style.color = '#059669';
      feedback.innerHTML = '🎉 <b>Félicitations !</b> Ton numéro est enregistré sur la liste VIP.<br>Tu recevras ton accès prioritaire le <b>01 Octobre à 00h00</b> sur le <b>+225 ' + raw + '</b>.';
    }
    if (window.toast) {
      window.toast('🎉 Inscription VIP confirmée pour le 01 Octobre !', 'success', 5000);
    }
  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = oldText;
    if (feedback) feedback.innerHTML = '⚠️ Erreur lors de l\'enregistrement. Réessayez.';
  }
};

function showAnnouncement() {
  if (sessionStorage.getItem('announcePlatformLive_v300')) return;
  const overlay = document.createElement('div');
  overlay.id = 'announceOverlay';
  overlay.innerHTML = `
    <div class="ann-card" style="max-width:440px;">
      <button class="ann-x" id="announceClose" aria-label="Fermer"><i class="fas fa-times"></i></button>
      <div class="ann-hero" style="padding:22px 18px;text-align:center;">
        <div class="ann-spark"></div>
        <div class="ann-spark s2"></div>
        <div class="ann-spark s3"></div>
        <div class="ann-label" style="background:#10b981;color:#fff;font-weight:800;">✨ NOUVELLE PLATEFORME EN LIGNE</div>
        <h2 style="font-size:22px;margin:6px 0 4px;">Bienvenue sur ResumeCI ! 🎓</h2>
        <p style="font-size:12.5px;opacity:0.95;margin:0 0 6px;">714 fiches de cours, Flashcards scientifiques, Quiz d'examen et outils de révision sont prêts pour ton année scolaire.</p>
      </div>
      <div class="ann-body" style="padding:16px;">
        <div style="font-size:12px;font-weight:800;color:#0f172a;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.3px;">
          🚀 Tes outils de révision disponibles :
        </div>
        <div class="ann-highlights" style="grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
          <div class="ann-hi"><div class="ann-hi-icon" style="background:#10b981"><i class="fas fa-clone"></i></div><div><strong>Flashcards</strong><span>Mémorisation 3x plus vite</span></div></div>
          <div class="ann-hi"><div class="ann-hi-icon" style="background:#6366f1"><i class="fas fa-gamepad"></i></div><div><strong>Quiz &amp; Chrono</strong><span>QCM interactifs</span></div></div>
          <div class="ann-hi"><div class="ann-hi-icon" style="background:#f59e0b"><i class="fas fa-mobile-screen"></i></div><div><strong>Pack Hors-Ligne</strong><span>Sans connexion internet</span></div></div>
          <div class="ann-hi"><div class="ann-hi-icon" style="background:#ec4899"><i class="fas fa-brain"></i></div><div><strong>Récitation Active</strong><span>Floutage intelligent</span></div></div>
          <div class="ann-hi" style="grid-column:span 2"><div class="ann-hi-icon" style="background:#ef4444"><i class="fas fa-triangle-exclamation"></i></div><div><strong>Pièges d'Examen</strong><span>Astuces des correcteurs</span></div></div>
        </div>

        <button type="button" onclick="document.getElementById('announceOverlay')?.remove(); if(typeof openElitePassModal==='function') openElitePassModal('Pass Réussite');" style="width:100%;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;border:none;border-radius:12px;padding:12px 14px;font-weight:800;font-size:13.5px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 14px rgba(37,99,235,0.3);margin-bottom:8px;">
          👑 Découvrir les Pass dès 500 F / mois
        </button>

        <a href="https://wa.me/2250104911010?text=Bonjour%20Assistance%20ResumeCI%20!%20Je%20souhaite%20des%20informations%20sur%20la%20plateforme." class="ann-wa-btn" target="_blank" rel="noopener" style="background:#10b981;font-size:12px;padding:10px;display:flex;align-items:center;justify-content:center;gap:8px;border-radius:10px;color:#fff;text-decoration:none;font-weight:700;">
          <i class="fab fa-whatsapp"></i> Assistance WhatsApp (01 04 91 10 10)
        </a>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('announceClose')?.addEventListener('click', () => {
    overlay.remove();
    sessionStorage.setItem('announcePlatformLive_v300', '1');
  });
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      overlay.remove();
      sessionStorage.setItem('announcePlatformLive_v300', '1');
    }
  });
}
// Annonce désactivée pour la version en production
// setTimeout(showAnnouncement, 500);
function handleInitialRoute() {
  // Fiche ouverte directement (rechargement / lien partagé) puis renvoyée vers l'app via ?fiche=/fiches/...
  const requestedFiche = new URLSearchParams(window.location.search).get('fiche');
  if (requestedFiche) {
    const fParts = requestedFiche.replace(/^\//, '').split('/').map(decodeURIComponent);
    if (fParts.length >= 4 && fParts[0] === 'fiches') {
      showFiche(fParts[1], fParts[2], fParts[3], true);
      return;
    }
  }
  const path = window.location.pathname.replace(/^\//, '');
  if (path && path !== 'index.html') {
    const parts = path.split('/').map(decodeURIComponent);
    if (parts.length >= 4 && parts[0] === 'fiches') {
      showFiche(parts[1], parts[2], parts[3], false);
      return;
    } else if (parts.length >= 2 && parts[0] === 'classes') {
      showClass(parts[1], false);
      return;
    }
  }
  showDashboard(false);
}
window.addEventListener('popstate', () => {
  const path = window.location.pathname.replace(/^\//, '');
  if (!path || path === 'index.html') {
    showDashboard(false);
  } else if (path.startsWith('classes/')) {
    const cls = path.split('/')[1];
    showClass(decodeURIComponent(cls), false);
  } else if (path.startsWith('fiches/')) {
    const parts = path.split('/').map(decodeURIComponent);
    if (parts.length >= 4) {
      showFiche(parts[1], parts[2], parts[3], false);
    }
  }
});

// Vérification automatique du cycle 24h lors du réveil de l'onglet ou chaque heure
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && typeof checkStreakValidity === 'function') {
    checkStreakValidity();
    if (typeof updateTopbarStreak === 'function') updateTopbarStreak();
  }
});
setInterval(() => {
  if (typeof checkStreakValidity === 'function') {
    checkStreakValidity();
    if (typeof updateTopbarStreak === 'function') updateTopbarStreak();
  }
}, 600000); // Toutes les 10 minutes

// Écouteur global de sécurité pour intercepter tous les clics sur les boutons Pack Hors-Ligne avec cadenas
document.addEventListener('click', (e) => {
  // 1. Bouton Pack Hors-Ligne verrouillé sur la grille des classes (.dl-btn-locked)
  const lockedDlBtn = e.target.closest('.dl-btn-locked');
  if (lockedDlBtn) {
    e.preventDefault();
    e.stopPropagation();
    const cls = lockedDlBtn.dataset.class || window.USER_PROFILE?.selectedClass || '';
    const clsName = cls ? cls.replace(/_/g, ' ') : '';
    const featName = clsName ? `Pack Hors-Ligne Complet (${clsName})` : 'Pack Hors-Ligne Complet';
    if (typeof window.openPremiumTeaser === 'function') {
      window.openPremiumTeaser(featName);
    }
    return;
  }

  // 2. Bannière ou bouton Télécharger dans la page d'une classe (.class-offline-banner verrouillée ou .cob-btn)
  const cobLocked = e.target.closest('.class-offline-banner:not(.unlocked)');
  if (cobLocked) {
    e.preventDefault();
    e.stopPropagation();
    let cls = window.CURRENT_FICHE?.cls || (window.location.pathname.startsWith('/classes/') ? window.location.pathname.split('/')[2] : '') || window.USER_PROFILE?.selectedClass || '';
    const clsName = cls ? decodeURIComponent(cls).replace(/_/g, ' ') : '';
    const featName = clsName ? `Pack Hors-Ligne Complet (${clsName})` : 'Pack Hors-Ligne Complet';
    if (typeof window.openPremiumTeaser === 'function') {
      window.openPremiumTeaser(featName);
    }
    return;
  }
}, true);

// Détection des redirections d'activation de Pass depuis d'autres pages (ex: quiz.html, flashcards.html)
(function checkOpenPassParam() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const passTarget = urlParams.get('openPass') || urlParams.get('upgrade');
    if (passTarget) {
      setTimeout(() => {
        if (typeof window.openPremiumTeaser === 'function') {
          if (passTarget.includes('starter')) {
            window.openPremiumTeaser('Pack Hors-Ligne');
          } else if (passTarget.includes('quiz')) {
            window.openPremiumTeaser('Quiz Interactif');
          } else if (passTarget.includes('flashcard')) {
            window.openPremiumTeaser('Flashcards (Répétition Espacée)');
          } else {
            window.openPremiumTeaser('Pass Réussite Pro');
          }
        }
      }, 700);
    }
  } catch(e) {}
})();
