import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

// Récupération instantanée directe du statut utilisateur depuis Firestore (temps de réponse < 100ms)
window.fetchUserProfileFromFirestore = async function(phone, uid) {
  const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
  try {
    let userSnap = null;
    if (cleanPhone.length === 10) {
      userSnap = await getDoc(doc(db, "users", cleanPhone));
    }
    if ((!userSnap || !userSnap.exists()) && uid) {
      userSnap = await getDoc(doc(db, "users", uid));
    }
    if (userSnap && userSnap.exists()) {
      return { id: userSnap.id, ...userSnap.data() };
    }
  } catch(e) {
    console.warn("[Firebase] fetchUserProfileFromFirestore error:", e);
  }
  return null;
};

// Synchronisation du profil étudiant dans Firestore
window.syncUserProfileToFirestore = async function(profile) {
  if (!profile || !profile.uid) return;
  try {
    const docRef = doc(db, "users", profile.uid);
    await setDoc(docRef, {
      ...profile,
      updatedAt: serverTimestamp()
    }, { merge: true });
    console.log("[Firebase] Profil synchronisé avec succès:", profile.uid);
  } catch(e) {
    console.warn("[Firebase] Erreur synchronisation profil:", e);
  }
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
