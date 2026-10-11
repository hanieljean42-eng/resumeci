import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBxw83mK-UNubhekwCQsFzBvM4zTvMuq5o",
  authDomain: "resumeci-d5c9a.firebaseapp.com",
  projectId: "resumeci-d5c9a",
  storageBucket: "resumeci-d5c9a.firebasestorage.app",
  messagingSenderId: "1004356929699",
  appId: "1:1004356929699:web:c1842aaf3f2d98247a1716",
  measurementId: "G-EM0XDJRND9"
};

// Initialisation
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// Les profils élèves (collection `users`) ne sont jamais lus ni écrits depuis le navigateur :
// les règles Firestore les réservent à l'admin, tout passe par l'API (/api/login, /api/register, /api/user-status).

// Nettoyage des anciens profils locaux qui contenaient le mot de passe en clair
const PROFILE_STORAGE_KEYS = ['resumeci_profile', 'user_profile', 'resumeci_user', 'resumeci_student_user'];
window.stripProfileSecrets = function(profile) {
  if (!profile || typeof profile !== 'object') return profile;
  const { password, passwordHash, ...safe } = profile;
  return safe;
};
try {
  PROFILE_STORAGE_KEYS.forEach(key => {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && ('password' in parsed || 'passwordHash' in parsed)) {
      localStorage.setItem(key, JSON.stringify(window.stripProfileSecrets(parsed)));
    }
  });
} catch (e) {}

// Vérification de la présence d'un abonnement actif
window.hasActiveSubscription = function() {
  if (!window.USER_PROFILE) {
    try {
      const raw = localStorage.getItem('resumeci_profile') || localStorage.getItem('user_profile') || localStorage.getItem('resumeci_user');
      if (raw) window.USER_PROFILE = JSON.parse(raw);
    } catch(e) {}
  }
  if (!window.USER_PROFILE) return null;
  const p = window.USER_PROFILE;
  const isPrem = Boolean(p.isPremium);
  const plan = (p.premiumPlan || p.plan || 'free').toLowerCase();
  const expiresAt = Number(p.premiumExpiresAt) || 0;
  const now = Date.now();
  if (isPrem && plan !== 'free' && (expiresAt === 0 || expiresAt > now)) {
    const daysLeft = expiresAt > 0 ? Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000)) : 30;
    return {
      tier: plan,
      plan: plan,
      expiresAt: expiresAt,
      daysLeft: daysLeft,
      planName: plan === 'starter' ? 'Starter' : (plan === 'pro' ? 'Pro' : (plan === 'vip' ? 'VIP ⭐' : plan.toUpperCase()))
    };
  }
  return null;
};

// Modal d'affichage et de gestion d'un abonnement actif
window.showActiveSubscriptionModal = function(subData, tierKey) {
  const sub = subData || (window.hasActiveSubscription ? window.hasActiveSubscription() : null);
  const planName = sub ? sub.planName : 'Pro';
  const daysLeft = sub ? sub.daysLeft : 30;
  const expDateStr = sub && sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('fr-FR') : 'Permanent';
  
  let modal = document.getElementById('activeSubscriptionModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'activeSubscriptionModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(5px);z-index:100060;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(modal);
  }
  
  modal.innerHTML = `
    <div style="background:#0f172a; border:1px solid #1e293b; border-radius:20px; max-width:440px; width:100%; padding:26px; box-shadow:0 25px 60px rgba(0,0,0,0.6); color:#f8fafc; font-family:'Plus Jakarta Sans',sans-serif; text-align:center;">
      <div style="width:56px; height:56px; border-radius:50%; background:rgba(16,185,129,0.2); color:#10b981; display:inline-flex; align-items:center; justify-content:center; font-size:26px; margin-bottom:14px;">
        <i class="fas fa-crown"></i>
      </div>
      <h3 style="font-size:20px; font-weight:800; margin:0 0 6px;">Pass ${planName} Actif ✨</h3>
      <p style="font-size:13px; color:#94a3b8; margin:0 0 18px;">Toutes tes fonctionnalités avancées sont débloquées sur ton compte.</p>
      
      <div style="background:#1e293b; border-radius:14px; padding:16px; text-align:left; margin-bottom:20px; font-size:13px; border:1px solid #334155;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span style="color:#94a3b8;">Formule active :</span>
          <strong style="color:#34d399;">Pass ${planName}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span style="color:#94a3b8;">Validité :</span>
          <strong style="color:#f8fafc;">${daysLeft} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''}</strong>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span style="color:#94a3b8;">Expire le :</span>
          <span style="color:#cbd5e1;">${expDateStr}</span>
        </div>
      </div>
      
      <div style="display:flex; flex-direction:column; gap:10px;">
        <a href="https://wa.me/2250150252467?text=Bonjour%20ResumeCI,%20j'ai%20une%20question%20concernant%20mon%20Pass%20${encodeURIComponent(planName)}" target="_blank" rel="noopener" style="background:#1e293b; border:1px solid #334155; color:#38bdf8; padding:12px; border-radius:10px; font-size:13px; font-weight:700; text-decoration:none; display:flex; align-items:center; justify-content:center; gap:8px;">
          <i class="fab fa-whatsapp" style="color:#25d366;"></i> Contacter l'assistance pour mon Pass
        </a>
        <button onclick="document.getElementById('activeSubscriptionModal').remove()" style="background:linear-gradient(135deg, #10b981, #059669); color:#fff; border:none; padding:12px; border-radius:10px; font-size:13.5px; font-weight:800; cursor:pointer;">
          Continuer mes révisions 🚀
        </button>
      </div>
    </div>
  `;
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
};


// Fonction globale pour traquer les clics
window.trackPremiumClick = function(featureName) {
  try {
    logEvent(analytics, 'premium_click', { feature_name: featureName });
  } catch(e) {
    console.warn("Analytics error", e);
  }
};

// Fonction globale pour s'inscrire à la liste d'attente (optimisée, ultra-rapide)
window.joinWaitlist = async function(contact, featureName) {
  try {
    // 1. Sauvegarde locale immédiate pour aucune perte
    try {
      const list = JSON.parse(localStorage.getItem('resumeci_waitlist_local') || '[]');
      list.push({ contact, feature: featureName || 'General', timestamp: new Date().toISOString() });
      localStorage.setItem('resumeci_waitlist_local', JSON.stringify(list));
      localStorage.setItem('resumeci_user_registered', contact);
    } catch(err){}

    // 2. Envoi Firestore avec timeout de 3.5s pour éviter tout ralentissement réseau
    const firestorePromise = addDoc(collection(db, "waitlist"), {
      contact: contact,
      feature: featureName || 'General',
      timestamp: serverTimestamp(),
      userAgent: navigator.userAgent
    });

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Timeout")), 3500)
    );

    await Promise.race([firestorePromise, timeoutPromise]);
    return true;
  } catch (e) {
    console.warn("Firestore save (sauvegardé en local):", e);
    // On confirme à l'utilisateur car ses données sont sécurisées
    return true;
  }
};

export { db };
