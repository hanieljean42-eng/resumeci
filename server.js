// TODO: This server.js is used only on Render (not Firebase Hosting).
// The puppeteer-core Chrome path on line ~167 is hardcoded for Windows.
// For Linux deployment, use: executablePath: '/usr/bin/google-chrome-stable'
// or switch to 'puppeteer' (not puppeteer-core) for auto-downloaded Chromium.
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const puppeteer = require('puppeteer-core');

const app = express();
const PORT = process.env.PORT || 3000;

const FICHES_DIR = path.join(__dirname, 'Fiches_Resume');
const COURS_DIR = path.join(__dirname, 'Cours_Terminale');
const ALLOWED_SUBJECTS = {
  '6eme': ['Anglais', 'EDHC', 'Francais', 'Histoire-Geographie', 'Mathematiques', 'Physique-Chimie', 'SVT', 'TIC'],
  '5eme': ['Mathematiques', 'SVT', 'EDHC', 'Histoire-Geographie', 'Physique-Chimie', 'Technologie', 'Francais'],
  '3eme': ['EDHC', 'EPS', 'Francais', 'Histoire-Geographie', 'Mathematiques', 'Physique-Chimie', 'SVT', 'TIC'],
  Seconde_A: ['Francais', 'Histoire-Geographie', 'Mathematiques', 'Physique-Chimie', 'SVT'],
  Seconde_C: ['Francais', 'Histoire-Geographie', 'Mathematiques', 'Physique-Chimie', 'SVT'],
  Premiere_D: ['Francais', 'Histoire-Geographie', 'Mathematiques', 'Physique-Chimie', 'SVT', 'Philosophie'],
  Terminale_C: ['Mathématiques', 'Physique - Chimie'], // ← AJOUT ICI AUSSI
  Terminale_D: ['Mathématiques', 'SVT', 'Physique - Chimie', 'Philosophie', 'Histoire - Géographie'],
  Terminale_A: ['Français', 'Anglais', 'Allemand', 'Mathématiques', 'Philosophie', 'Histoire - Géographie'],
};
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Language', 'fr-CI');
  next();
});

// Middlewares JSON & URL-encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialisation Firebase Admin
let db = null;
let admin = null;
try {
  admin = require('./payment-api/node_modules/firebase-admin');
  const serviceAccount = require('./payment-api/firebase-admin.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  db = admin.firestore();
  console.log('✅ Firebase Admin connecté (Projet: resumeci-d5c9a)');
} catch (e) {
  console.warn('⚠️ Firebase Admin non connecté:', e.message);
}

// Charger .env si existant
try {
  const envPath = fs.existsSync(path.join(__dirname, '.env')) ? path.join(__dirname, '.env') : path.join(__dirname, 'payment-api/.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(l => {
      const p = l.trim().split('=');
      if (p.length >= 2 && !p[0].startsWith('#') && !process.env[p[0].trim()]) {
        process.env[p[0].trim()] = p.slice(1).join('=').trim();
      }
    });
  }
} catch (e) {}

// Configuration GeniusPay (lues depuis l'environnement ou .env)
const GENIUSPAY_PUBLIC_KEY = process.env.GENIUSPAY_PUBLIC_KEY || '';
const GENIUSPAY_SECRET_KEY = process.env.GENIUSPAY_SECRET_KEY || '';
const GENIUSPAY_API_URL = process.env.GENIUSPAY_API_URL || 'https://geniuspay.ci/api/v1/merchant/payments';

const PAYMENT_PLANS = {
  starter: { name: 'Starter (Mensuel)', price: 500, available: true },
  pro: { name: 'Pro (Mensuel)', price: 1000, available: true },
  elite: { name: 'Élite', price: 2000, available: false }
};
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Fichier de stockage local des utilisateurs pour sauvegarde et hors-ligne
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const content = fs.readFileSync(USERS_FILE, 'utf8');
      return content ? JSON.parse(content) : [];
    }
  } catch (e) {
    console.warn('Erreur lecture users.json:', e.message);
  }
  return [];
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) {
    console.warn('Erreur écriture users.json:', e.message);
  }
}

function updateUserPlanLocal(uid, tierKey, expiresAt = null) {
  try {
    const users = loadUsers();
    const exp = expiresAt || (Date.now() + THIRTY_DAYS_MS);
    const cleanId = String(uid || '').replace(/\D/g, '').slice(-10);
    const idx = users.findIndex(u => {
      if (u.uid === uid) return true;
      if (cleanId) {
        const uWa = String(u.whatsapp || u.contact || '').replace(/\D/g, '').slice(-10);
        if (uWa === cleanId) return true;
      }
      return false;
    });
    if (idx >= 0) {
      users[idx].plan = tierKey;
      users[idx].isPremium = true;
      users[idx].premiumPlan = tierKey;
      users[idx].premiumExpiresAt = exp;
      saveUsers(users);
    }
  } catch (e) {
    console.warn('Erreur updateUserPlanLocal:', e.message);
  }
}

// ROUTE 1 : INITIER PAIEMENT
app.post('/api/pay', async (req, res) => {
  try {
    const { uid, tierKey, customerName, customerPhone, customerEmail, paymentMethod, returnOrigin } = req.body;
    if (!uid || !tierKey || !PAYMENT_PLANS[tierKey]) {
      return res.status(400).json({ error: "Données invalides (uid ou tierKey manquant)" });
    }
    if (!PAYMENT_PLANS[tierKey].available) {
      return res.status(403).json({ error: "Cette formule est en cours de finalisation." });
    }
    const plan = PAYMENT_PLANS[tierKey];
    const origin = returnOrigin || `http://localhost:${PORT}`;
    const redirectUrl = `${origin}/?payment=success&tier=${tierKey}&uid=${uid}`;

    // Formatage strict du téléphone ivoirien au format international +225XXXXXXXXXX
    let cleanPhone = customerPhone ? String(customerPhone).replace(/\D/g, '') : '';
    let formattedPhone = '+2250700000000';
    if (cleanPhone.startsWith('225') && cleanPhone.length >= 12) {
      formattedPhone = '+' + cleanPhone;
    } else if (cleanPhone.length === 10) {
      formattedPhone = '+225' + cleanPhone;
    } else if (cleanPhone.length > 0) {
      formattedPhone = '+225' + cleanPhone.slice(-10);
    }

    const chosenMethod = (paymentMethod || 'wave').toLowerCase();

    const payload = {
      amount: plan.price,
      currency: "XOF",
      description: `Pass Réussite ${plan.name} - 30 jours`,
      country: "CI",
      customer: {
        name: customerName || 'Élève',
        email: customerEmail || 'eleve@resumeci.me',
        phone: formattedPhone,
        country: "CI"
      },
      metadata: { uid, tierKey, type: 'monthly', method: chosenMethod },
      success_url: redirectUrl,
      return_url: redirectUrl,
      cancel_url: `${origin}/?payment=cancelled`
    };

    if (chosenMethod === 'wave') {
      payload.payment_method = 'wave';
    }

    console.log(`[Paiement] Création transaction GeniusPay pour ${uid} - Forfait ${tierKey} (${plan.price} FCFA) - Tel: ${formattedPhone} - Méthode: ${chosenMethod}`);

    const result = await new Promise((resolve, reject) => {
      const postData = JSON.stringify(payload);
      const req = https.request(GENIUSPAY_API_URL, {
        method: 'POST',
        family: 4, // Forcer IPv4 pour éviter les timeouts DNS
        headers: {
          'X-API-Key': GENIUSPAY_PUBLIC_KEY,
          'X-API-Secret': GENIUSPAY_SECRET_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 45000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Réponse GeniusPay invalide: ${data}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error('Délai d\'attente dépassé vers GeniusPay (timeout)'));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(postData);
      req.end();
    });

    const targetUrl = result.data?.payment_url || result.data?.checkout_url;
    if (result.success && result.data && targetUrl) {
      res.json({
        success: true,
        checkout_url: targetUrl,
        payment_url: targetUrl,
        payment_reference: result.data.reference || null,
        payment_method: result.data.payment_method || chosenMethod
      });
    } else {
      console.error("[Paiement] Erreur GeniusPay:", result);
      res.status(500).json({ error: "Impossible d'initier le paiement chez GeniusPay", details: result });
    }
  } catch (error) {
    console.error("[Paiement] Erreur interne:", error);
    res.status(500).json({ error: "Erreur serveur lors de la création du paiement." });
  }
});

// ROUTE 2 : CONFIRMER ET DÉBLOQUER L'ABONNEMENT
app.post('/api/confirm-payment', async (req, res) => {
  try {
    const { uid, tierKey } = req.body;
    if (!uid || !tierKey || !['starter', 'pro'].includes(tierKey)) {
      return res.status(400).json({ error: "Paramètres manquants ou invalides" });
    }
    const expiresAt = Date.now() + THIRTY_DAYS_MS;
    console.log(`[Activation] Déblocage pour ${uid} : Pass ${tierKey} pour 30 jours`);

    // Mise à jour locale (data/users.json)
    updateUserPlanLocal(uid, tierKey, expiresAt);

    if (db) {
      await db.collection('users').doc(uid).set({
        premiumPlan: tierKey,
        plan: tierKey,
        isPremium: true,
        premiumExpiresAt: expiresAt,
        subscriptionType: 'monthly',
        lastPaymentDate: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    res.json({
      success: true,
      tierKey,
      premiumExpiresAt: expiresAt,
      message: `Pass ${tierKey} activé avec succès pour 30 jours.`
    });
  } catch (error) {
    console.error("[Activation] Erreur lors de la confirmation:", error);
    res.status(500).json({ error: "Erreur serveur lors de l'activation." });
  }
});

// ROUTE 3 : WEBHOOK GENIUSPAY
app.post('/api/webhook', async (req, res) => {
  try {
    const event = req.body;
    console.log('[Webhook] Événement reçu de GeniusPay:', JSON.stringify(event));
    const isSuccess =
      (event && event.data && (event.data.status === 'success' || event.data.status === 'completed')) ||
      (event && event.status === 'success') ||
      (event && event.event === 'payment.successful');

    if (isSuccess) {
      const metadata = event.data?.metadata || event.metadata;
      if (metadata && metadata.uid && metadata.tierKey) {
        const { uid, tierKey } = metadata;
        const expiresAt = Date.now() + THIRTY_DAYS_MS;
        
        // Mise à jour locale
        updateUserPlanLocal(uid, tierKey);

        if (db) {
          await db.collection('users').doc(uid).set({
            premiumPlan: tierKey,
            plan: tierKey,
            isPremium: true,
            premiumExpiresAt: expiresAt,
            subscriptionType: 'monthly',
            lastPaymentDate: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
        console.log(`[Webhook] Déblocage Firestore effectué pour ${uid}`);
      }
    }
    res.status(200).send('Webhook traité');
  } catch (error) {
    console.error("[Webhook] Erreur:", error);
    res.status(500).send('Erreur Webhook');
  }
});

// ROUTE 4 : ENREGISTREMENT ÉLÈVE (Formule Gratuite ou Payante)
app.post('/api/register', async (req, res) => {
  try {
    const { uid, firstName, lastName, selectedClass, whatsapp, password, plan, isPremium, userAgent, premiumPlan, premiumExpiresAt } = req.body;
    if (!whatsapp) {
      return res.status(400).json({ error: "Numéro WhatsApp obligatoire" });
    }

    const cleanWa = String(whatsapp).replace(/\D/g, '');
    const isPrem = Boolean(isPremium && plan !== 'free');
    const expAt = isPrem ? (Number(premiumExpiresAt) || (Date.now() + THIRTY_DAYS_MS)) : 0;

    const userDoc = {
      uid: uid || ('user_' + Date.now()),
      firstName: (firstName || '').trim(),
      lastName: (lastName || '').trim(),
      fullName: `${firstName || ''} ${lastName || ''}`.trim() || 'Élève',
      selectedClass: selectedClass || 'Non précisé',
      whatsapp: cleanWa,
      contact: cleanWa,
      password: password || '',
      plan: plan || 'free',
      premiumPlan: isPrem ? (premiumPlan || plan) : 'free',
      isPremium: isPrem,
      premiumExpiresAt: expAt,
      subscriptionType: 'monthly',
      createdAt: new Date().toISOString(),
      userAgent: userAgent || req.headers['user-agent'] || 'Web',
      ip: req.ip
    };

    // 1. Sauvegarde Firestore
    if (db) {
      try {
        await db.collection('users').doc(userDoc.uid).set(userDoc, { merge: true });
        await db.collection('inscriptions').doc(userDoc.uid).set(userDoc, { merge: true });
      } catch (err) {
        console.warn('[Register] Erreur Firestore:', err.message);
      }
    }

    // 2. Sauvegarde JSON local (data/users.json)
    try {
      const users = loadUsers();
      const existingIdx = users.findIndex(u => u.uid === userDoc.uid || (u.whatsapp && u.whatsapp === cleanWa));
      if (existingIdx >= 0) {
        users[existingIdx] = { ...users[existingIdx], ...userDoc };
      } else {
        users.unshift(userDoc);
      }
      saveUsers(users);
    } catch (e) {
      console.warn('[Register] Erreur fichier local:', e.message);
    }

    console.log(`[Inscription] Nouvel élève : ${userDoc.fullName} (${userDoc.selectedClass}) - Formule : ${userDoc.plan} - Tel: ${userDoc.whatsapp}`);
    res.json({ success: true, user: userDoc });
  } catch (err) {
    console.error('[Register] Erreur:', err);
    res.status(500).json({ error: "Erreur enregistrement" });
  }
});

// ROUTE 4.5 : CONNEXION ÉLÈVE & RESTAURATION ABONNEMENT PAYÉ
app.post('/api/login', async (req, res) => {
  try {
    const { whatsapp, password } = req.body;
    if (!whatsapp) {
      return res.status(400).json({ error: "Numéro WhatsApp obligatoire." });
    }
    const cleanWa = String(whatsapp).replace(/\D/g, '').slice(-10);

    let foundUser = null;

    // 1. Recherche dans data/users.json local
    const localUsers = loadUsers();
    foundUser = localUsers.find(u => {
      const uWa = String(u.whatsapp || u.contact || '').replace(/\D/g, '').slice(-10);
      return uWa === cleanWa;
    });

    // 2. Recherche dans Firestore si non trouvé ou pour actualiser le statut
    if (db) {
      try {
        const snap = await db.collection('users').get();
        snap.forEach(doc => {
          const data = doc.data();
          const dWa = String(data.whatsapp || data.contact || '').replace(/\D/g, '').slice(-10);
          if (dWa === cleanWa) {
            foundUser = { ...(foundUser || {}), ...data, uid: data.uid || doc.id };
          }
        });
      } catch (err) {
        console.warn('[Login] Erreur lecture Firestore:', err.message);
      }
    }

    if (!foundUser) {
      return res.status(404).json({ error: "Aucun compte trouvé avec ce numéro WhatsApp. Veuillez vous inscrire d'abord." });
    }

    // Vérification mot de passe si disponible
    if (foundUser.password && password && foundUser.password !== password) {
      return res.status(401).json({ error: "Mot de passe incorrect. Veuillez réessayer." });
    }

    // Restauration de l'abonnement actif
    const now = Date.now();
    const expiresAt = Number(foundUser.premiumExpiresAt) || 0;
    const isPremium = Boolean(foundUser.isPremium && (expiresAt === 0 || expiresAt > now));
    const premiumPlan = isPremium ? (foundUser.premiumPlan || foundUser.plan || 'pro') : 'free';
    const effectiveExpiresAt = isPremium ? (expiresAt > now ? expiresAt : (now + THIRTY_DAYS_MS)) : 0;

    const safeProfile = {
      uid: foundUser.uid || ('user_' + Date.now()),
      firstName: foundUser.firstName || 'Élève',
      lastName: foundUser.lastName || '',
      selectedClass: foundUser.selectedClass || '3eme',
      whatsapp: cleanWa,
      password: password || foundUser.password || '',
      isPremium: isPremium,
      premiumPlan: premiumPlan,
      premiumExpiresAt: effectiveExpiresAt,
      subscriptionType: foundUser.subscriptionType || 'monthly',
      createdAt: foundUser.createdAt || new Date().toISOString()
    };

    console.log(`[Connexion] ${safeProfile.firstName} ${safeProfile.lastName} connecté (+225 ${cleanWa}) - Statut: ${isPremium ? 'Pass ' + premiumPlan + ' ACTIF' : 'Gratuit'}`);
    res.json({ success: true, profile: safeProfile });
  } catch (err) {
    console.error('[Login] Erreur:', err);
    res.status(500).json({ error: "Erreur serveur lors de la connexion." });
  }
});

// ROUTE 5 : API ADMIN POUR LE TABLEAU DE BORD (Liste, Plans, Classes)
app.get('/api/admin/users', async (req, res) => {
  try {
    const userMap = new Map();

    // 1. Lecture locale d'abord
    const localUsers = loadUsers();
    localUsers.forEach(u => {
      const key = (u.whatsapp || u.contact || u.uid || '').slice(-10);
      if (key) userMap.set(key, u);
    });

    // 2. Lecture Firestore si disponible
    if (db) {
      try {
        const snap = await db.collection('users').get();
        snap.forEach(doc => {
          const data = doc.data();
          const key = (data.whatsapp || data.contact || data.uid || doc.id).slice(-10);
          if (key) {
            const existing = userMap.get(key) || {};
            userMap.set(key, { ...existing, ...data });
          }
        });
      } catch (err) {
        console.warn('[Admin API] Erreur Firestore users:', err.message);
      }
    }

    const allUsers = Array.from(userMap.values());
    allUsers.sort((a,b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dbDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dbDate - da;
    });

    // Statistiques par formule
    let freeCount = 0;
    let starterCount = 0;
    let proCount = 0;
    const byClass = {};

    allUsers.forEach(u => {
      const p = (u.plan || (u.isPremium ? (u.premiumPlan || 'pro') : 'free')).toLowerCase();
      if (p === 'starter') starterCount++;
      else if (p === 'pro') proCount++;
      else freeCount++;

      const cls = u.selectedClass || 'Autre';
      byClass[cls] = (byClass[cls] || 0) + 1;
    });

    res.json({
      success: true,
      stats: {
        total: allUsers.length,
        free: freeCount,
        starter: starterCount,
        pro: proCount,
        byClass
      },
      users: allUsers
    });
  } catch (err) {
    console.error('[Admin API] Erreur:', err);
    res.status(500).json({ error: "Erreur récupération utilisateurs" });
  }
});

app.use('/public', express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  etag: true,
}));
app.use('/pdfs', express.static(COURS_DIR, {
  maxAge: '1d',
  etag: true,
}));

// Ensure HTML sitemap is not indexed (keep for users only)
app.get('/sitemap.html', (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, follow');
  res.sendFile(path.join(__dirname, 'public', 'sitemap.html'));
});

// API: Get structure (classes > matières > leçons)
app.get('/api/structure', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  const structure = {};
  
  if (!fs.existsSync(FICHES_DIR)) return res.json({});
  
  const classes = fs.readdirSync(FICHES_DIR).filter(d => 
    fs.statSync(path.join(FICHES_DIR, d)).isDirectory() && ALLOWED_SUBJECTS[d]
  );

  for (const cls of classes) {
    structure[cls] = {};
    const clsDir = path.join(FICHES_DIR, cls);
    const subjects = fs.readdirSync(clsDir).filter(d => 
      fs.statSync(path.join(clsDir, d)).isDirectory() && ALLOWED_SUBJECTS[cls].includes(d)
    );

    for (const subject of subjects) {
      const subDir = path.join(clsDir, subject);
      const fiches = fs.readdirSync(subDir)
        .filter(f => f.endsWith('.html'))
        .map(f => ({
          file: f,
          name: f.replace('Fiche_', '').replace('.html', ''),
          path: `${cls}/${subject}/${f}`,
        }));
      structure[cls][subject] = fiches;
    }
  }

  res.json(structure);
});

// API: Get a specific fiche content (HTML direct)
app.get('/api/fiche/:cls/:subject/:file', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  const { cls, subject, file } = req.params;
  
  if (!ALLOWED_SUBJECTS[cls] || !ALLOWED_SUBJECTS[cls].includes(subject) || !/^[a-zA-Z0-9_.-]+$/.test(file) || file.includes('..')) {
    return res.status(400).json({ error: 'Paramètres invalides' });
  }

  const fichePath = path.join(FICHES_DIR, cls, subject, file);
  
  if (!fs.existsSync(fichePath)) {
    return res.status(404).json({ error: 'Fiche non trouvée' });
  }

  const rawHtml = fs.readFileSync(fichePath, 'utf8');
  const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/);
  const html = bodyMatch ? bodyMatch[1] : rawHtml;
  
  const pdfName = file.replace('Fiche_', '').replace('.html', '.pdf');
  const pdfPath = path.join(COURS_DIR, cls, subject, pdfName);
  const hasPdf = fs.existsSync(pdfPath);

  res.json({ 
    html, 
    hasPdf,
    pdfUrl: hasPdf ? `/pdfs/${encodeURIComponent(cls)}/${encodeURIComponent(subject)}/${encodeURIComponent(pdfName)}` : null,
  });
});

// API: Stats
app.get('/api/stats', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  let totalFiches = 0;
  let totalPdfs = 0;
  const classStats = {};

  if (!fs.existsSync(FICHES_DIR)) return res.json({ totalFiches: 0, totalPdfs: 0, classStats: {} });

  const classes = fs.readdirSync(FICHES_DIR).filter(d => 
    fs.statSync(path.join(FICHES_DIR, d)).isDirectory() && ALLOWED_SUBJECTS[d]
  );

  for (const cls of classes) {
    classStats[cls] = { subjects: 0, fiches: 0, pdfs: 0 };
    const clsDir = path.join(FICHES_DIR, cls);
    const subjects = fs.readdirSync(clsDir).filter(d => 
      fs.statSync(path.join(clsDir, d)).isDirectory() && ALLOWED_SUBJECTS[cls].includes(d)
    );
    classStats[cls].subjects = subjects.length;

    for (const subject of subjects) {
      const subDir = path.join(clsDir, subject);
      const fiches = fs.readdirSync(subDir).filter(f => f.endsWith('.html'));
      classStats[cls].fiches += fiches.length;
      totalFiches += fiches.length;

      const pdfDir = path.join(COURS_DIR, cls, subject);
      if (fs.existsSync(pdfDir)) {
        const pdfs = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
        classStats[cls].pdfs += pdfs.length;
        totalPdfs += pdfs.length;
      }
    }
  }

  res.json({ totalFiches, totalPdfs, classStats });
});

// API: Download fiche as PDF (printable)
app.get('/api/download/:cls/:subject/:file', async (req, res) => {
  const { cls, subject, file } = req.params;
  
  if (!ALLOWED_SUBJECTS[cls] || !ALLOWED_SUBJECTS[cls].includes(subject) || !/^[a-zA-Z0-9_.-]+$/.test(file) || file.includes('..')) {
    return res.status(400).send('Paramètres invalides');
  }

  const fichePath = path.join(FICHES_DIR, cls, subject, file);
  
  if (!fs.existsSync(fichePath)) {
    return res.status(404).send('Fiche non trouvée');
  }

  try {
    const fullHtml = fs.readFileSync(fichePath, 'utf8');

    const browser = await puppeteer.launch({
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
      args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 15000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
      printBackground: true,
    });
    await browser.close();

    const downloadName = file.replace('.html', '.pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdfBuffer);
  } catch (e) {
    console.error('PDF error:', e.message);
    res.status(500).send('Erreur lors de la génération du PDF');
  }
});

// Clean routes for dedicated pages
app.get(['/inscription', '/register', '/pass'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'inscription.html'));
});

app.get(['/connexion', '/login'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'connexion.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  etag: false,
}));

// SPA fallback — serve index.html for non-file routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur ResumeCI actif sur http://0.0.0.0:${PORT} (http://localhost:${PORT})`);
});
