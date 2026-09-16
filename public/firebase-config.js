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

// Fonction globale pour traquer les clics
window.trackPremiumClick = function(featureName) {
  try {
    logEvent(analytics, 'premium_click', { feature_name: featureName });
    console.log("Analytics: Clic enregistré pour", featureName);
  } catch(e) {
    console.warn("Analytics error", e);
  }
};

// Fonction globale pour s'inscrire à la liste d'attente
window.joinWaitlist = async function(contact, featureName) {
  try {
    await addDoc(collection(db, "waitlist"), {
      contact: contact,
      feature: featureName || 'General',
      timestamp: serverTimestamp(),
      userAgent: navigator.userAgent
    });
    return true;
  } catch (e) {
    console.error("Erreur Firestore: ", e);
    return false;
  }
};

export { db };
