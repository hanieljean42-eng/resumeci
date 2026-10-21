const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const adminModule = require('firebase-admin');
const admin = adminModule.default || adminModule;

// Résout un fichier que le serveur tourne depuis la racine du repo ou depuis payment-api/ (Render: rootDir ./payment-api)
function resolveLocal(...candidates) {
  return candidates.map(p => path.resolve(__dirname, p)).find(p => fs.existsSync(p)) || null;
}

// Charger .env si existant
try {
  const envPath = resolveLocal('.env', 'payment-api/.env', '../.env');
  if (envPath) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(l => {
      const p = l.trim().split('=');
      if (p.length >= 2 && !p[0].startsWith('#') && !process.env[p[0].trim()]) {
        process.env[p[0].trim()] = p.slice(1).join('=').trim();
      }
    });
  }
} catch (e) {}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

let db = null;
let authService = null;
let FieldValue = null;

try {
  let certFn = null;
  let initializeAppFn = null;
  let getFirestoreFn = null;
  let getAuthFn = null;

  try {
    const appMod = require('firebase-admin/app');
    initializeAppFn = appMod.initializeApp;
    certFn = appMod.cert;
    const fsMod = require('firebase-admin/firestore');
    getFirestoreFn = fsMod.getFirestore;
    FieldValue = fsMod.FieldValue;
    const authMod = require('firebase-admin/auth');
    getAuthFn = authMod.getAuth;
  } catch (modErr) {
    initializeAppFn = admin.initializeApp ? admin.initializeApp.bind(admin) : null;
    certFn = admin.credential && admin.credential.cert ? admin.credential.cert.bind(admin.credential) : null;
    getFirestoreFn = admin.firestore ? admin.firestore.bind(admin) : null;
    FieldValue = admin.firestore && admin.firestore.FieldValue ? admin.firestore.FieldValue : null;
    getAuthFn = admin.auth ? admin.auth.bind(admin) : null;
  }

  let credential = null;
  let saObj = null;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      saObj = typeof process.env.FIREBASE_SERVICE_ACCOUNT === 'string'
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        : process.env.FIREBASE_SERVICE_ACCOUNT;
    } catch (e) {
      console.warn('⚠️ Erreur parsing FIREBASE_SERVICE_ACCOUNT JSON:', e.message);
    }
  } else {
    const saPath = resolveLocal('firebase-admin.json', 'payment-api/firebase-admin.json', '../payment-api/firebase-admin.json');
    if (saPath) {
      saObj = require(saPath);
    }
  }

  if (saObj) {
    if (typeof certFn === 'function') {
      credential = certFn(saObj);
    } else if (admin.credential && typeof admin.credential.cert === 'function') {
      credential = admin.credential.cert(saObj);
    }
  }

  if (credential && typeof initializeAppFn === 'function') {
    const firebaseApp = initializeAppFn({ credential });
    db = typeof getFirestoreFn === 'function' ? getFirestoreFn(firebaseApp) : (typeof admin.firestore === 'function' ? admin.firestore() : null);
    authService = typeof getAuthFn === 'function' ? getAuthFn(firebaseApp) : (typeof admin.auth === 'function' ? admin.auth() : null);
    console.log('✅ Firebase Admin connecté (Firestore & Auth)');
  } else {
    console.warn('⚠️ Aucun compte de service Firebase valide trouvé (FIREBASE_SERVICE_ACCOUNT ou firebase-admin.json). Firestore désactivé.');
  }
} catch (e) {
  console.warn('⚠️ Firebase Admin non connecté:', e.message);
}

const app = express();
// Render place l'API derrière un proxy : nécessaire pour que le rate limiting utilise la vraie IP client
app.set('trust proxy', 1);
app.disable('x-powered-by');
// CSP gérée par Firebase Hosting pour le frontend ; l'API ne renvoie que du JSON
app.use(helmet({ contentSecurityPolicy: false }));

const ALLOWED_ORIGINS = [
  'https://resumeci.me',
  'https://www.resumeci.me',
  'https://resumeci-d5c9a.web.app',
  'https://resumeci-d5c9a.firebaseapp.com'
];
const LOCALHOST_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(cors({
  origin(origin, callback) {
    // Requêtes serveur à serveur (webhook GeniusPay, health checks) : pas d'en-tête Origin
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (!IS_PRODUCTION && LOCALHOST_ORIGIN.test(origin)) return callback(null, true);
    return callback(null, false);
  }
}));
app.use(express.json({ limit: '100kb' }));

function limiter(windowMs, max) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: "Trop de tentatives. Réessaie plus tard." }
  });
}
const loginLimiter = limiter(15 * 60 * 1000, 10);
const registerLimiter = limiter(60 * 60 * 1000, 5);
const paymentLimiter = limiter(15 * 60 * 1000, 30);
// Vérification de statut : appelée en boucle après Wave, souvent derrière un même NAT opérateur.
const checkPaymentLimiter = limiter(15 * 60 * 1000, 300);
app.use('/api/login', loginLimiter);
app.use('/api/register', registerLimiter);
app.use('/api/pay', paymentLimiter);
app.use('/api/check-payment', checkPaymentLimiter);
const publicDir = resolveLocal('public', '../public');
if (publicDir) app.use(express.static(publicDir));

// Clés d'API GeniusPay
const GENIUSPAY_PUBLIC_KEY = process.env.GENIUSPAY_PUBLIC_KEY || '';
const GENIUSPAY_SECRET_KEY = process.env.GENIUSPAY_SECRET_KEY || '';
const GENIUSPAY_API_URL = process.env.GENIUSPAY_API_URL || 'https://geniuspay.ci/api/v1/merchant/payments';

// Webhook : jeton secret partagé, transmis à GeniusPay dans l'URL de callback et vérifié à la réception
const WEBHOOK_SECRET = String(process.env.WEBHOOK_SECRET || '').trim();
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || 'https://resumeci-payment-api.onrender.com').replace(/\/$/, '');
const WEBHOOK_URL = `${PUBLIC_API_URL}/api/webhook${WEBHOOK_SECRET ? `?token=${encodeURIComponent(WEBHOOK_SECRET)}` : ''}`;
if (!WEBHOOK_SECRET) {
  if (IS_PRODUCTION) {
    console.error('❌ WEBHOOK_SECRET doit être défini en production. Arrêt du serveur.');
    process.exit(1);
  }
  console.warn('⚠️ WEBHOOK_SECRET non défini : le webhook GeniusPay accepte toute requête (le statut est tout de même re-vérifié auprès de GeniusPay).');
}

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

// Masque un numéro dans les logs (RGPD-lite : pas de numéro en clair dans les logs Render)
const maskPhone = (p) => {
  const s = String(p || '');
  return s.length > 6 ? s.slice(0, 5) + '•••••' + s.slice(-2) : '•••';
};
// Plans reconnus par la plateforme (école + université)
const KNOWN_PLANS = new Set(['free', 'starter', 'pro', 'vip', 'annual', 'annuel', 'elite', 'uni_starter', 'uni_pro', 'uni_elite']);
const CLASS_KEY_RE = /^[A-Za-z0-9_]{1,50}$/;
const clampStr = (v, max) => String(v || '').slice(0, max);

// Jeton de session signé (HMAC) remis au login/inscription : protège les données personnelles de /api/user-status
const SESSION_SECRET = String(process.env.SESSION_SECRET || WEBHOOK_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');
const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
function sessionSignature(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(`session:${payload}`).digest('base64url');
}
function signSession(uid) {
  const payload = `${String(uid)}.${Date.now() + SESSION_TTL_MS}`;
  return `${Buffer.from(payload).toString('base64url')}.${sessionSignature(payload)}`;
}
function verifySession(token) {
  const [encoded, sig] = String(token || '').split('.');
  if (!encoded || !sig) return null;
  const payload = Buffer.from(encoded, 'base64url').toString();
  const a = Buffer.from(sig);
  const b = Buffer.from(sessionSignature(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const i = payload.lastIndexOf('.');
  const uid = payload.slice(0, i);
  if (!uid || !(Number(payload.slice(i + 1)) > Date.now())) return null;
  return uid;
}
const INVALID_CREDENTIALS = "Identifiants invalides. Vérifie ton numéro WhatsApp et ton mot de passe.";

// Forfaits
const PLANS = {
  starter: { name: 'Starter (Mensuel)', price: 500, days: 30, available: true },
  pro: { name: 'Pro (Mensuel)', price: 1000, days: 30, available: true },
  annual: { name: 'Annuel (365 jours)', price: 10000, days: 365, available: true },
  elite: { name: 'Élite', price: 2000, days: 30, available: true },
  // Forfaits Espace Universitaire (étudiants — minimum 1 000 F)
  uni_starter: { name: 'Pass Étudiant (Mensuel)', price: 1000, days: 30, available: true },
  uni_pro: { name: 'Pass Licence Pro (Mensuel)', price: 2000, days: 30, available: true },
  uni_elite: { name: 'Pass Excellence (Mensuel)', price: 3000, days: 30, available: true }
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Emails autorisés à utiliser les routes /api/admin/* (séparés par des virgules).
// Aucune valeur par défaut : sans ADMIN_EMAILS, les routes admin sont inaccessibles (fail-closed).
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
if (ADMIN_EMAILS.length === 0) {
  console.warn('⚠️ ADMIN_EMAILS non défini : les routes /api/admin/* seront inaccessibles.');
}

// Middleware : vérifie le jeton Firebase Auth (Authorization: Bearer <idToken>) et l'email admin
async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: "Authentification administrateur requise." });
  }
  try {
    const authToUse = authService || (admin.auth && admin.auth());
    if (!authToUse) throw new Error("Service d'authentification non initialisé");
    const decoded = await authToUse.verifyIdToken(token);
    const email = String(decoded.email || '').toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) {
      console.warn(`[Admin] Tentative d'accès refusée pour ${email || decoded.uid}`);
      return res.status(403).json({ error: "Accès refusé." });
    }
    req.adminUser = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Jeton administrateur invalide ou expiré." });
  }
}
app.use('/api/admin', requireAdmin);

// Helper : retrouve un compte par n'importe quel identifiant connu —
// doc ID, champ uid, whatsapp, contact ou phone, dans tous les formats
// courants (10 chiffres, 225XXXXXXXXXX, +225XXXXXXXXXX). Indispensable car
// d'anciens comptes ont des doc IDs ou des champs qui ne correspondent pas
// au numéro à 10 chiffres (sinon premium/fiches introuvables pour eux).
async function findUserByAnyId(rawId) {
  if (!db || rawId === undefined || rawId === null || rawId === '') return null;
  const users = db.collection('users');
  const id = String(rawId).trim();
  const digits = id.replace(/\D/g, '');
  const phone10 = digits.length >= 10 ? digits.slice(-10) : '';
  const candidates = new Set([id]);
  if (phone10.length === 10) {
    candidates.add(phone10);
    candidates.add('225' + phone10);
    candidates.add('+225' + phone10);
  }
  for (const cand of candidates) {
    try {
      const d = await users.doc(cand).get();
      if (d.exists) return { ...d.data(), uid: d.data().uid || d.id, _docId: d.id };
    } catch (e) {}
  }
  // Préférence doc réel > fantôme : un doc canonique (ID = numéro, ou avec
  // identité) gagne toujours contre un doc technique user_*/admin_* hérité.
  const scoreDoc = (id, u) =>
    (/^\d{10}$/.test(id) ? 4 : 0) +
    ((u.fullName || u.firstName || u.lastName) ? 2 : 0) +
    ((u.passwordHash || u.password) ? 1 : 0) +
    (u.isPremium ? 1 : 0) +
    (/^(user_|admin_|test_)/.test(id) ? -8 : 0);
  for (const field of ['uid', 'whatsapp', 'contact', 'phone']) {
    for (const cand of candidates) {
      try {
        const snap = await users.where(field, '==', cand).limit(5).get();
        if (!snap.empty) {
          const best = snap.docs.reduce((a, b) =>
            scoreDoc(b.id, b.data()) > scoreDoc(a.id, a.data()) ? b : a);
          return { ...best.data(), uid: best.data().uid || best.id, _docId: best.id };
        }
      } catch (e) {}
    }
  }
  return null;
}

// Helper : retrouve le compte unique associé à un numéro (doc ID = numéro, puis champs whatsapp / contact pour les anciens comptes)
async function findUserByPhone(cleanPhone) {
  if (!cleanPhone || String(cleanPhone).length !== 10) return null;
  return findUserByAnyId(cleanPhone);
}

// Un "doc fantôme" est un document technique sans identité (créé par un ancien
// flux : uid user_*/admin_*/test_* posé par /api/pay, ou doc sans nom ni mot de
// passe dont l'ID n'est pas un numéro). Il ne doit jamais masquer le vrai
// compte identifié par le numéro de téléphone.
function isGhostUserDoc(u) {
  if (!u || !u._docId) return false;
  const id = String(u._docId);
  if (/^(user_|admin_|test_)/.test(id)) return true;
  const hasIdentity = Boolean(u.fullName || u.firstName || u.lastName || u.passwordHash || u.password);
  return !hasIdentity && !/^\d{10}$/.test(id);
}

// Résolution combinée uid + téléphone. Le téléphone est l'identité canonique
// du projet (un numéro WhatsApp = un compte) : quand l'uid tombe sur un doc
// fantôme alors que le téléphone désigne un vrai compte, le vrai compte gagne.
// `extra` contient les autres docs résolus (ex. fantôme porteur du pendingPayment).
async function resolveUserDocs(rawUid, rawPhone) {
  const byUid = (rawUid !== undefined && rawUid !== null && rawUid !== '')
    ? await findUserByAnyId(rawUid).catch(() => null) : null;
  const cleanP = rawPhone ? String(rawPhone).replace(/\D/g, '').slice(-10) : '';
  const byPhone = cleanP.length === 10 ? await findUserByAnyId(cleanP).catch(() => null) : null;
  let primary = byUid || byPhone;
  if (byUid && byPhone && byUid._docId !== byPhone._docId && isGhostUserDoc(byUid)) {
    primary = byPhone;
  }
  const extra = [];
  for (const u of [byUid, byPhone]) {
    if (u && u._docId && u._docId !== (primary && primary._docId) && !extra.some(e => e._docId === u._docId)) extra.push(u);
  }
  return { primary, extra };
}

// Statut premium consolidé : un Pass accordé (par l'admin ou un paiement) sur
// N'IMPORTE QUEL doc du même compte compte — y compris sur un doc fantôme
// hérité. Renvoie le statut le plus favorable parmi les docs résolus.
function mergedPremiumStatus(users) {
  const now = Date.now();
  let best = null;
  for (const u of users) {
    if (!u) continue;
    const exp = Number(u.premiumExpiresAt) || 0;
    if (u.isPremium && (exp === 0 || exp > now)) {
      if (!best || exp === 0 || exp > (Number(best.premiumExpiresAt) || 0)) best = u;
    }
  }
  if (!best) return { isPremium: false, premiumPlan: 'free', premiumExpiresAt: 0 };
  return {
    isPremium: true,
    premiumPlan: best.premiumPlan || best.plan || 'pro',
    premiumExpiresAt: Number(best.premiumExpiresAt) || 0
  };
}

// Helpers mots de passe : stockage haché (bcrypt). Les anciens comptes ont un champ `password` en clair,
// accepté une dernière fois puis migré vers `passwordHash` lors de la connexion.
const BCRYPT_ROUNDS = 10;
function hashPassword(pwd) {
  return bcrypt.hash(String(pwd), BCRYPT_ROUNDS);
}
// Hash factice : compte inexistant => même coût bcrypt qu'un mauvais mot de passe (pas d'énumération par le temps de réponse)
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), BCRYPT_ROUNDS);
async function burnPasswordCheck(pwd) {
  await bcrypt.compare(String(pwd || ''), DUMMY_PASSWORD_HASH);
}
async function verifyPassword(pwd, user) {
  const candidate = String(pwd || '').trim();
  if (!candidate) return false;
  if (user.passwordHash) return bcrypt.compare(candidate, user.passwordHash);
  if (user.password) return String(user.password).trim() === candidate;
  return false;
}
async function migrateLegacyPassword(user, pwd) {
  if (!db || user.passwordHash || !user._docId) return;
  try {
    const fv = FieldValue || admin.firestore?.FieldValue;
    await db.collection('users').doc(user._docId).set({
      passwordHash: await hashPassword(pwd),
      password: fv ? fv.delete() : undefined,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (e) {
    console.warn('[Auth] Migration mot de passe impossible:', e.message);
  }
}
function stripSecrets(user) {
  const { password, passwordHash, _docId, ...rest } = user;
  return rest;
}

// Helper : profil normalisé renvoyé au client (statut premium recalculé)
function buildProfile(user, cleanPhone) {
  const now = Date.now();
  const expiresAt = Number(user.premiumExpiresAt) || 0;
  const isPremium = Boolean(user.isPremium && (expiresAt === 0 || expiresAt > now));
  const premiumPlan = isPremium ? (user.premiumPlan || user.plan || 'pro') : 'free';
  const fName = user.firstName || (user.fullName ? user.fullName.split(' ')[0] : 'Élève');
  const lName = user.lastName || (user.fullName ? user.fullName.split(' ').slice(1).join(' ') : '');
  return {
    uid: user.uid || cleanPhone,
    firstName: fName,
    lastName: lName,
    fullName: user.fullName || `${fName} ${lName}`.trim() || 'Élève',
    selectedClass: user.selectedClass || user.classe || '3eme',
    whatsapp: cleanPhone,
    phone: cleanPhone,
    isPremium,
    premiumPlan,
    premiumExpiresAt: isPremium ? (expiresAt > now ? expiresAt : (now + THIRTY_DAYS_MS)) : 0,
    subscriptionType: user.subscriptionType || 'monthly',
    createdAt: user.createdAt || new Date().toISOString(),
    sessionToken: signSession(user.uid || cleanPhone)
  };
}

// Helper: Débloquer un compte dans Firestore de façon universelle (par UID et/ou Téléphone)
async function unlockUserInFirestore(uid, phone, tierKey, durationDays = 30, extra = {}) {
  if (!db) {
    console.warn('[Unlock] Firestore non initialisé.');
    return null;
  }
  const durationMs = durationDays * 24 * 60 * 60 * 1000;
  const expiresAt = Date.now() + durationMs;
  const fv = FieldValue || admin.firestore?.FieldValue;
  const updateData = {
    premiumPlan: tierKey || 'pro',
    plan: tierKey || 'pro',
    isPremium: true,
    premiumExpiresAt: expiresAt,
    subscriptionType: durationDays >= 300 ? 'yearly' : 'monthly',
    lastPaymentDate: fv ? fv.serverTimestamp() : new Date().toISOString(),
    updatedAt: fv ? fv.serverTimestamp() : new Date().toISOString(),
    pendingPayment: fv ? fv.delete() : undefined,
    ...extra
  };

  // 1. Résoudre le VRAI document du compte — l'uid est prioritaire (c'est le
  // compte qui a initié le paiement) ; le téléphone sert de repli (ex. metadata
  // perdue). Ne jamais écrire doc(uid) à l'aveugle : un uid exotique créerait
  // un doc fantôme premium sans toucher le vrai compte.
  const targets = new Map();
  const resolvedUid = uid ? await findUserByAnyId(uid).catch(() => null) : null;
  const cleanPhone = phone ? String(phone).replace(/\D/g, '').slice(-10) : '';
  // Le téléphone est toujours résolu aussi : si l'uid désigne un doc fantôme
  // (user_*), le vrai compte trouvé par numéro doit recevoir le premium.
  const resolvedPhone = cleanPhone.length === 10
    ? await findUserByAnyId(cleanPhone).catch(() => null)
    : null;
  for (const u of [resolvedUid, resolvedPhone]) {
    if (u && u._docId) targets.set(u._docId, db.collection('users').doc(u._docId));
  }

  const uidDigits = String(uid || '').replace(/\D/g, '');
  const canonicalPhone = cleanPhone.length === 10 ? cleanPhone
    : (uidDigits.length >= 10 ? uidDigits.slice(-10) : '');

  if (targets.size === 0) {
    // Aucun compte existant : créer un doc canonique identifié par le numéro
    // (sinon par l'uid fourni — le paiement EST vérifié à ce stade).
    const newId = canonicalPhone || String(uid || cleanPhone);
    targets.set(newId, db.collection('users').doc(newId));
  }

  for (const ref of targets.values()) {
    try {
      await ref.set({
        ...updateData,
        ...(canonicalPhone ? { whatsapp: canonicalPhone, contact: canonicalPhone } : {})
      }, { merge: true });
    } catch (e) {
      console.warn('[Unlock] Erreur MAJ doc:', e.message);
    }
  }

  // 2. Doublons hérités : aligner tous les docs qui partagent le même contact
  if (canonicalPhone) {
    for (const field of ['whatsapp', 'contact']) {
      try {
        const snap = await db.collection('users').where(field, '==', canonicalPhone).get();
        const batch = db.batch();
        let n = 0;
        snap.forEach(doc => { if (!targets.has(doc.id)) { batch.set(doc.ref, updateData, { merge: true }); n++; } });
        if (n) await batch.commit();
      } catch (e) {
        console.warn('[Unlock] Erreur MAJ batch:', e.message);
      }
    }
  }

  console.log(`[Unlock] ✅ Compte débloqué: ${maskPhone(phone || uid)} -> Pass ${tierKey} (${durationDays}j)`);
  return { expiresAt, tierKey };
}

// Helper : traitement idempotent d'un paiement GeniusPay déjà vérifié "completed".
// Chaque référence est enregistrée dans `payments/{reference}` : une référence déjà traitée
// ne débloque plus rien (pas de réinitialisation de premiumExpiresAt par rejeu).
const ALREADY_EXISTS = 6;
async function processVerifiedPayment(reference, { uid, phone, tierKey, amount, paymentMethod, source }) {
  if (!db) throw new Error('Firestore non initialisé');
  const ref = db.collection('payments').doc(String(reference));
  try {
    await ref.create({
      reference: String(reference),
      uid: uid || null,
      phone: phone || null,
      tierKey,
      amount,
      paymentMethod: paymentMethod || null,
      source,
      status: 'processing',
      createdAt: FieldValue.serverTimestamp()
    });
  } catch (e) {
    if (e.code === ALREADY_EXISTS) {
      const existing = (await ref.get()).data() || {};
      return { alreadyProcessed: true, tierKey: existing.tierKey || tierKey, expiresAt: existing.expiresAt || null };
    }
    throw e;
  }
  try {
    const result = await unlockUserInFirestore(uid, phone, tierKey, PLANS[tierKey]?.days || 30, {
      lastPaymentRef: String(reference),
      paymentAmount: amount,
      paymentMethod: paymentMethod || 'wave'
    });
    const expiresAt = result ? result.expiresAt : null;
    await ref.set({ status: 'processed', expiresAt, processedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { alreadyProcessed: false, tierKey, expiresAt };
  } catch (e) {
    // Échec du déblocage : libérer la référence pour permettre un nouvel essai
    await ref.delete().catch(() => {});
    throw e;
  }
}

// Helper: Requête de consultation d'une transaction GeniusPay
// L'API GeniusPay met parfois 40+ secondes à répondre : timeout généreux
// (75s) + cache de requête en vol pour éviter les appels doublons.
const GP_QUERY_TIMEOUT_MS = 75000;
const gpInflight = new Map(); // ref -> Promise
function queryGeniusPayPayment(reference) {
  const key = String(reference);
  if (gpInflight.has(key)) return gpInflight.get(key);
  const promise = new Promise((resolve, reject) => {
    const req = https.get(`${GENIUSPAY_API_URL}/${key}`, {
      family: 4,
      headers: {
        'X-API-Key': GENIUSPAY_PUBLIC_KEY,
        'X-API-Secret': GENIUSPAY_SECRET_KEY,
        'Accept': 'application/json'
      },
      timeout: GP_QUERY_TIMEOUT_MS
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 500) {
            const err = new Error(`GeniusPay HTTP ${res.statusCode}`);
            err.retryable = true;
            return reject(err);
          }
          resolve(parsed);
        } catch (e) {
          const err = new Error(`Réponse GeniusPay invalide (HTTP ${res.statusCode}): ${data.slice(0, 200)}`);
          err.retryable = true;
          reject(err);
        }
      });
    });
    req.on('error', (err) => { err.retryable = true; reject(err); });
    req.on('timeout', () => req.destroy(Object.assign(new Error('Timeout GeniusPay'), { retryable: true })));
  });
  gpInflight.set(key, promise);
  promise.then(
    () => setTimeout(() => gpInflight.delete(key), 60000), // succès : résultat servi en cache 1 min
    () => setTimeout(() => gpInflight.delete(key), 5000)   // échec : nouvel essai possible vite
  );
  return promise;
}

// Attend la réponse GeniusPay sans bloquer le client plus de `waitMs`.
// Renvoie null si GeniusPay n'a pas encore répondu (la promesse reste en cache :
// le prochain appel la reprendra et trouvera le résultat déjà disponible).
async function queryGeniusPayPaymentBounded(reference, waitMs = 25000) {
  const p = queryGeniusPayPayment(reference);
  let timer;
  const result = await Promise.race([
    p.then(r => ({ done: true, value: r })).catch(e => ({ done: true, error: e })),
    new Promise(r => { timer = setTimeout(() => r({ done: false }), waitMs); })
  ]);
  clearTimeout(timer);
  if (!result.done) return { slow: true };
  if (result.error) return { error: result.error };
  return { data: result.value };
}

const PENDING_STATUSES = new Set(['pending', 'initiated', 'created', 'processing']);
const FAILED_STATUSES = new Set(['failed', 'cancelled', 'canceled', 'expired', 'refunded', 'rejected']);
const PENDING_REUSE_MS = 10 * 60 * 1000;
const PENDING_MAX_AGE_MS = 48 * 60 * 60 * 1000;

// Paiement en attente mémorisé sur le profil : permet le déblocage même si l'élève revient
// de Wave dans un autre onglet (référence perdue côté navigateur) ou si le webhook n'arrive pas.
async function resolvePendingPayment(userRef, userData) {
  const pending = userData && userData.pendingPayment;
  if (!db || !pending || !pending.reference) return null;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(String(pending.reference))) return null;
  const clear = () => userRef.update({ pendingPayment: FieldValue.delete() }).catch(() => {});
  if (Date.now() - (Number(pending.createdAt) || 0) > PENDING_MAX_AGE_MS) { await clear(); return null; }

  const gpRes = await queryGeniusPayPayment(pending.reference).catch(() => null);
  const pay = gpRes && gpRes.success ? gpRes.data : null;
  if (!pay) return null;
  if (FAILED_STATUSES.has(pay.status)) { await clear(); return null; }
  if (pay.status !== 'completed' && pay.status !== 'success') return null;

  const meta = pay.metadata || {};
  const amount = Number(pay.amount) || 0;
  const tierKey = meta.tierKey || pending.tierKey || (amount >= 1000 ? 'pro' : 'starter');
  const result = await processVerifiedPayment(pending.reference, {
    uid: meta.uid || userData.uid || userRef.id,
    phone: pay.customer?.phone || meta.phone || null,
    tierKey, amount, paymentMethod: pay.payment_method || 'wave', source: 'user-status'
  });
  if (result.alreadyProcessed) await clear();
  return result;
}

// Helper: Lister les paiements récents GeniusPay
function fetchGeniusPayPayments(page = 1, perPage = 30) {
  return new Promise((resolve, reject) => {
    const req = https.get(`${GENIUSPAY_API_URL}?page=${page}&per_page=${perPage}`, {
      family: 4,
      headers: {
        'X-API-Key': GENIUSPAY_PUBLIC_KEY,
        'X-API-Secret': GENIUSPAY_SECRET_KEY,
        'Accept': 'application/json'
      },
      timeout: 60000
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
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Timeout GeniusPay')));
  });
}

// --------------------------------------------------------------------------
// ROUTE 1 : INITIER LE PAIEMENT (Frontend)
// --------------------------------------------------------------------------
app.post('/api/pay', async (req, res) => {
  try {
    const { uid, tierKey, customerName, customerPhone, customerEmail, paymentMethod, returnOrigin } = req.body;
    const safeUid = clampStr(uid, 64);
    const safeCustomerName = clampStr(customerName, 120);

    if (!safeUid || !tierKey || !PLANS[tierKey]) {
      return res.status(400).json({ error: "Données invalides (uid ou tierKey manquant)" });
    }

    if (!PLANS[tierKey].available) {
      return res.status(403).json({
        error: "Cette formule est actuellement en cours de finalisation."
      });
    }

    const plan = PLANS[tierKey];
    // returnOrigin doit rester un domaine autorisé : sinon un attaquant pourrait
    // rediriger l'élève vers un site de phishing après le paiement (open redirect).
    const origin = ALLOWED_ORIGINS.includes(returnOrigin) ? returnOrigin : 'https://resumeci.me';
    const redirectUrl = `${origin}/?payment=success&tier=${tierKey}&uid=${safeUid}`;

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

    const requestedMethod = String(paymentMethod || 'wave').toLowerCase();
    const chosenMethod = ['wave', 'orange_money', 'mtn_money', 'moov_money'].includes(requestedMethod) ? requestedMethod : 'wave';

    // Réutilise la transaction encore en attente (double clic, retour arrière, serveur lent)
    // au lieu d'en créer une nouvelle chez GeniusPay à chaque tentative.
    // On résout le VRAI doc du compte : uid + téléphone du payeur (un uid hérité
    // user_* peut désigner un doc fantôme pendant que le numéro désigne le vrai).
    const { primary: payingUser } = db ? await resolveUserDocs(safeUid, cleanPhone) : { primary: null };
    const accountDocId = payingUser ? payingUser._docId : safeUid;
    const userRef = db ? db.collection('users').doc(accountDocId) : null;
    if (userRef) {
      const userSnap = await userRef.get().catch(() => null);
      const pending = userSnap && userSnap.exists ? userSnap.data().pendingPayment : null;
      if (pending && pending.tierKey === tierKey && pending.checkoutUrl &&
          Date.now() - (Number(pending.createdAt) || 0) < PENDING_REUSE_MS) {
        const gp = await queryGeniusPayPayment(pending.reference).catch(() => null);
        const st = gp && gp.success && gp.data ? gp.data.status : null;
        if (PENDING_STATUSES.has(st)) {
          return res.json({
            success: true,
            reused: true,
            checkout_url: pending.checkoutUrl,
            payment_url: pending.checkoutUrl,
            payment_reference: pending.reference,
            payment_method: chosenMethod
          });
        }
      }
    }

    // Pass Élite/Excellence : réservé aux classes ayant du contenu "Sujets &
    // Interros" au catalogue (actuellement Terminale D uniquement). Le contrôle
    // est basé sur le catalogue — une nouvelle classe débloque sa formule dès
    // que ses premiers sujets sont publiés.
    if (tierKey === 'elite' || tierKey === 'uni_elite') {
      const cls = String((payingUser && (payingUser.selectedClass || payingUser.classe)) || '');
      const hasContent = getInterrosCatalog().some(d => d.classe === cls);
      if (!hasContent) {
        console.log(`[Paiement] Refus ${tierKey} pour classe sans contenu Élite: ${cls || 'inconnue'} (${maskPhone(safeUid)})`);
        return res.status(403).json({ success: false, error: 'elite_unavailable_for_class', classe: cls });
      }
    }

    // Payload GeniusPay avec Côte d'Ivoire par défaut et URLs de webhook explicites
    const payload = {
      amount: plan.price,
      currency: "XOF",
      description: `Pass Réussite ${plan.name} - ResumeCI`,
      country: "CI",
      customer: {
        name: safeCustomerName || 'Élève',
        email: customerEmail || 'eleve@resumeci.me',
        phone: formattedPhone,
        country: "CI"
      },
      metadata: {
        uid: accountDocId,
        phone: formattedPhone,
        customerPhone: cleanPhone.slice(-10),
        tierKey: tierKey,
        type: 'monthly',
        method: chosenMethod
      },
      webhook_url: WEBHOOK_URL,
      callback_url: WEBHOOK_URL,
      success_url: redirectUrl,
      return_url: redirectUrl,
      cancel_url: `${origin}/?payment=cancelled`
    };

    // Si Wave est choisi (par défaut), GeniusPay déclenche le paiement direct Wave
    if (chosenMethod === 'wave') {
      payload.payment_method = 'wave';
    }

    console.log(`[Paiement] Transaction GeniusPay ${maskPhone(safeUid)} - Forfait ${tierKey} (${plan.price} FCFA) - Tel: ${maskPhone(formattedPhone)} - Méthode: ${chosenMethod}`);

    const result = await new Promise((resolve, reject) => {
      const postData = JSON.stringify(payload);
      const req = https.request(GENIUSPAY_API_URL, {
        method: 'POST',
        family: 4,
        headers: {
          'X-API-Key': GENIUSPAY_PUBLIC_KEY,
          'X-API-Secret': GENIUSPAY_SECRET_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 90000
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
      if (userRef && result.data.reference) {
        // set+merge (et non update) : fonctionne aussi si le doc vient d'être résolu
        userRef.set({
          pendingPayment: { reference: String(result.data.reference), tierKey, checkoutUrl: targetUrl, createdAt: Date.now() }
        }, { merge: true }).catch(() => {});
      }
      res.json({
        success: true,
        checkout_url: targetUrl,
        payment_url: targetUrl,
        payment_reference: result.data.reference || null,
        payment_method: result.data.payment_method || chosenMethod
      });
    } else {
      console.error("[Paiement] Erreur GeniusPay:", result && (result.message || result.error || 'réponse inattendue'));
      res.status(500).json({ error: "Impossible d'initier le paiement chez GeniusPay" });
    }

  } catch (error) {
    console.error("[Paiement] Erreur interne:", error);
    res.status(500).json({ error: "Erreur serveur lors de la création du paiement." });
  }
});

// --------------------------------------------------------------------------
// ROUTE 2 : VÉRIFICATION DYNAMIQUE D'UN PAIEMENT (Appelée en continu pour Wave)
// --------------------------------------------------------------------------
app.get('/api/check-payment/:ref', async (req, res) => {
  try {
    const ref = String(req.params.ref || '').trim();
    if (!ref || !/^[A-Za-z0-9_-]{1,100}$/.test(ref)) return res.status(400).json({ error: "Référence de transaction invalide." });
    if (!db) return res.status(503).json({ error: "Service temporairement indisponible." });

    const gpRes = await queryGeniusPayPaymentBounded(ref, 25000);
    if (gpRes.slow) {
      // GeniusPay est lent (parfois 40s+) : le client repasse plus tard,
      // la promesse reste en cache et sera déjà résolue.
      return res.json({ success: true, status: 'pending', verifying: true });
    }
    if (gpRes.error) {
      const retryable = gpRes.error.retryable;
      console.error(`[CheckPayment] ${ref}:`, gpRes.error.message);
      if (retryable) return res.json({ success: true, status: 'pending', verifying: true });
      return res.status(502).json({ success: false, error: "Vérification GeniusPay impossible." });
    }
    const gpData = gpRes.data;
    if (!gpData.success || !gpData.data) {
      return res.status(404).json({ success: false, error: "Paiement non trouvé chez GeniusPay." });
    }

    const pay = gpData.data;
    const isCompleted = pay.status === 'completed' || pay.status === 'success';
    const amount = Number(pay.amount) || 0;
    const meta = pay.metadata || {};
    const tierKey = meta.tierKey || (amount >= 1000 ? 'pro' : 'starter');
    const uid = meta.uid || null;
    const phone = pay.customer?.phone || meta.phone || null;

    if (isCompleted) {
      const result = await processVerifiedPayment(ref, {
        uid, phone, tierKey, amount, paymentMethod: pay.payment_method || 'wave', source: 'check-payment'
      });

      return res.json({
        success: true,
        status: 'completed',
        alreadyProcessed: result.alreadyProcessed,
        tierKey: result.tierKey,
        isPremium: true,
        premiumExpiresAt: result.expiresAt || (Date.now() + THIRTY_DAYS_MS),
        customerName: pay.customer?.name || 'Élève',
        amount: amount
      });
    }

    return res.json({
      success: true,
      status: pay.status || 'pending',
      amount: amount
    });
  } catch (err) {
    console.error('[CheckPayment] Erreur:', err.message);
    res.status(500).json({ error: "Erreur vérification paiement" });
  }
});

// --------------------------------------------------------------------------
// ROUTE 2.5 : CONFIRMER ET DÉBLOQUER L'ABONNEMENT (Appelée au retour de navigation)
// --------------------------------------------------------------------------
app.post('/api/confirm-payment', async (req, res) => {
  try {
    const { uid, tierKey, reference } = req.body;

    if (!uid) {
      return res.status(400).json({ error: "UID requis" });
    }
    // Aucun déblocage sans preuve de paiement : la référence GeniusPay est obligatoire et vérifiée côté serveur.
    if (!reference) {
      return res.status(400).json({
        success: false,
        error: "Référence de paiement requise. Si tu as déjà payé, ton Pass sera activé automatiquement dès confirmation par l'opérateur."
      });
    }
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(String(reference))) {
      return res.status(400).json({ success: false, error: "Référence de paiement invalide." });
    }
    if (!db) return res.status(503).json({ success: false, error: "Service temporairement indisponible." });

    const gpRes = await queryGeniusPayPayment(reference);
    const pay = gpRes && gpRes.success ? gpRes.data : null;
    if (!pay) {
      return res.status(404).json({ success: false, error: "Paiement introuvable chez GeniusPay." });
    }
    if (pay.status !== 'completed' && pay.status !== 'success') {
      return res.status(402).json({ success: false, status: pay.status || 'pending', error: "Paiement non encore confirmé." });
    }
    if (pay.metadata?.uid && pay.metadata.uid !== uid) {
      // Tolérance anciens comptes : l'uid local (ex. user_*) peut différer de
      // l'uid enregistré au paiement. Accepté si les deux identifiants résolvent
      // le même doc, ou si le téléphone du compte correspond à celui du paiement.
      const claimer = await findUserByAnyId(uid).catch(() => null);
      const owner = await findUserByAnyId(pay.metadata.uid).catch(() => null);
      const sameDoc = Boolean(claimer && owner && claimer._docId === owner._docId);
      const claimerPhones = new Set(
        [claimer && claimer.whatsapp, claimer && claimer.contact, claimer && claimer.phone, uid]
          .filter(Boolean).map(p => String(p).replace(/\D/g, '').slice(-10))
      );
      const metaPhone = String(
        (pay.customer && pay.customer.phone) || pay.metadata.customerPhone || pay.metadata.phone || ''
      ).replace(/\D/g, '').slice(-10);
      if (!sameDoc && !(metaPhone && claimerPhones.has(metaPhone))) {
        console.warn(`[ConfirmPayment] UID ${uid} ne correspond pas au paiement ${reference} (${pay.metadata.uid})`);
        return res.status(403).json({ success: false, error: "Ce paiement est associé à un autre compte." });
      }
    }

    const amt = Number(pay.amount) || 0;
    const actualTier = pay.metadata?.tierKey || tierKey || (amt >= 1000 ? 'pro' : 'starter');
    const unl = await processVerifiedPayment(reference, {
      uid,
      phone: pay.customer?.phone || pay.metadata?.phone,
      tierKey: actualTier,
      amount: amt,
      paymentMethod: pay.payment_method || 'wave',
      source: 'confirm-payment'
    });
    res.json({
      success: true,
      isPremium: true,
      alreadyProcessed: unl.alreadyProcessed,
      tierKey: unl.tierKey,
      premiumExpiresAt: unl.expiresAt || (Date.now() + THIRTY_DAYS_MS),
      message: `Pass ${unl.tierKey} activé avec succès.`
    });

  } catch (error) {
    console.error("[Activation] Erreur confirmation:", error);
    res.status(500).json({ error: "Erreur serveur lors de l'activation." });
  }
});

// --------------------------------------------------------------------------
// ROUTE 3 : WEBHOOK (GeniusPay serveur à serveur en temps réel)
// --------------------------------------------------------------------------
app.post('/api/webhook', async (req, res) => {
  try {
    // 1. Jeton secret : ?token=WEBHOOK_SECRET (URL transmise à GeniusPay) ou en-tête x-webhook-token
    if (WEBHOOK_SECRET) {
      const provided = String(req.headers['x-webhook-token'] || req.query.token || '');
      const a = Buffer.from(provided), b = Buffer.from(WEBHOOK_SECRET);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        console.warn('[Webhook] Jeton invalide, requête ignorée.');
        return res.status(401).send('Unauthorized');
      }
    }

    const event = req.body || {};
    const pay = event.data || event;
    const ref = pay.reference || null;
    console.log(`[Webhook] Événement reçu (référence: ${ref || 'aucune'}, type: ${event.event || event.type || 'inconnu'})`);

    if (!ref || !/^[A-Za-z0-9_-]{1,100}$/.test(String(ref))) {
      return res.status(200).send('Webhook ignoré (référence absente ou invalide)');
    }

    // 2. Ne jamais faire confiance au contenu du webhook : re-vérification du statut auprès de l'API GeniusPay
    const gpRes = await queryGeniusPayPayment(ref);
    const verified = gpRes && gpRes.success ? gpRes.data : null;
    if (!verified || (verified.status !== 'completed' && verified.status !== 'success')) {
      console.log(`[Webhook] Paiement ${ref} non confirmé par GeniusPay (statut: ${verified ? verified.status : 'inconnu'}).`);
      return res.status(200).send('Webhook reçu, paiement non confirmé');
    }

    const metadata = verified.metadata || {};
    const amount = Number(verified.amount) || 0;
    const tierKey = metadata.tierKey || (amount >= 1000 ? 'pro' : 'starter');
    const uid = metadata.uid || null;
    const phone = verified.customer?.phone || metadata.phone || null;

    if (!db) return res.status(503).send('Service indisponible');
    const result = await processVerifiedPayment(ref, {
      uid, phone, tierKey, amount, paymentMethod: verified.payment_method || 'wave', source: 'webhook'
    });
    if (result.alreadyProcessed) {
      console.log(`[Webhook] Paiement ${ref} déjà traité, ignoré.`);
      return res.status(200).send('Webhook déjà traité');
    }
    console.log(`[Webhook] Paiement ${ref} traité (forfait ${tierKey}).`);

    res.status(200).send('Webhook traité avec succès');
  } catch (error) {
    console.error("[Webhook] Erreur serveur Webhook:", error);
    res.status(500).send('Erreur serveur Webhook');
  }
});

// --------------------------------------------------------------------------
// ROUTE 4 : ENREGISTREMENT ÉLÈVE
// --------------------------------------------------------------------------
app.post('/api/register', async (req, res) => {
  try {
    const { firstName, lastName, selectedClass, whatsapp, password, plan, userAgent } = req.body;
    const cleanWa = String(whatsapp || '').replace(/\D/g, '').slice(-10);
    const cleanPwd = String(password || '').trim();
    const safeFirst = clampStr(firstName, 60).trim();
    const safeLast = clampStr(lastName, 60).trim();
    const safeClass = CLASS_KEY_RE.test(String(selectedClass || '')) ? selectedClass : 'Non précisé';
    if (cleanWa.length !== 10) {
      return res.status(400).json({ error: "Numéro WhatsApp à 10 chiffres obligatoire." });
    }
    if (cleanPwd.length < MIN_PASSWORD_LENGTH || cleanPwd.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Le mot de passe doit comporter entre ${MIN_PASSWORD_LENGTH} et ${MAX_PASSWORD_LENGTH} caractères.` });
    }
    if (!db) {
      return res.status(503).json({ error: "Service d'inscription temporairement indisponible. Réessaie dans quelques instants." });
    }

    // Un numéro = un seul compte : le document est identifié par le numéro de téléphone
    const existing = await findUserByPhone(cleanWa);
    if (existing) {
      if (await verifyPassword(cleanPwd, existing)) {
        await migrateLegacyPassword(existing, cleanPwd);
        console.log(`[Register] Compte déjà existant pour ${maskPhone(cleanWa)}, reconnexion.`);
        return res.json({ success: true, existing: true, user: buildProfile(existing, cleanWa) });
      }
      return res.status(401).json({ success: false, error: INVALID_CREDENTIALS });
    }

    const userDoc = {
      uid: cleanWa,
      firstName: safeFirst,
      lastName: safeLast,
      fullName: `${safeFirst} ${safeLast}`.trim() || (String(safeClass).startsWith('Licence_') ? 'Étudiant(e)' : 'Élève'),
      selectedClass: safeClass,
      whatsapp: cleanWa,
      contact: cleanWa,
      passwordHash: await hashPassword(cleanPwd),
      plan: 'free',
      premiumPlan: 'free',
      isPremium: false,
      premiumExpiresAt: 0,
      pendingPlan: plan && plan !== 'free' && PLANS[plan] ? plan : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userAgent: userAgent || req.headers['user-agent'] || 'Web'
    };

    await db.collection('users').doc(cleanWa).set(userDoc);
    console.log(`[Register] ✅ Nouveau compte créé pour ${userDoc.fullName} (${maskPhone(cleanWa)})`);
    res.json({ success: true, existing: false, user: buildProfile(userDoc, cleanWa) });
  } catch (err) {
    console.error('[Register] Erreur:', err);
    res.status(500).json({ error: "Erreur enregistrement" });
  }
});


// --------------------------------------------------------------------------
// ROUTE 4.6 : STATUT UTILISATEUR & SYNCHRONISATION EN DIRECT
// --------------------------------------------------------------------------
const userStatusHandler = async (req, res) => {
  try {
    // Paramètres acceptés en query (compatibilité anciennes versions) ou en body POST
    // (recommandé : évite d'exposer le numéro de téléphone dans les URL et les logs).
    const body = req.body || {};
    const rawPhone = req.query.phone || req.query.whatsapp || req.query.contact || body.phone || body.whatsapp || body.contact || '';
    const rawUid = req.query.uid || body.uid || '';
    const cleanPhone = String(rawPhone).replace(/\D/g, '').slice(-10);

    if (!cleanPhone && !rawUid) {
      return res.status(400).json({ error: "Numéro de téléphone ou UID requis." });
    }

    let foundUser = null;
    let foundRef = null;

    // Résolution universelle : doc ID, champ uid, whatsapp/contact/phone
    // dans tous les formats. uid ET téléphone sont essayés : un doc fantôme
    // (user_* hérité) ne doit jamais masquer le vrai compte du numéro.
    const extraRefs = [];
    let extraUsers = [];
    if (db) {
      const { primary, extra } = await resolveUserDocs(rawUid, cleanPhone);
      foundUser = primary;
      extraUsers = extra;
      if (foundUser && foundUser._docId) {
        foundRef = db.collection('users').doc(foundUser._docId);
      }
      for (const u of extra) {
        if (u.pendingPayment) extraRefs.push({ ref: db.collection('users').doc(u._docId), data: u });
      }
    }

    if (!foundUser) {
      return res.status(404).json({ success: false, error: "Utilisateur non trouvé" });
    }

    // Paiement en attente : sur le doc principal ET sur un éventuel doc
    // fantôme qui porterait le pendingPayment (uid hérité user_*).
    const pendingTargets = [];
    if (foundRef && foundUser.pendingPayment) pendingTargets.push({ ref: foundRef, data: foundUser });
    pendingTargets.push(...extraRefs);
    for (const t of pendingTargets) {
      try {
        // 8s max ici : si GeniusPay est lent, la vérification continue en
        // arrière-plan (promesse mise en cache) et débloque le compte dès
        // que la réponse arrive — l'utilisateur la verra au prochain appel.
        const resolved = await Promise.race([
          resolvePendingPayment(t.ref, t.data).catch(() => null),
          new Promise(r => setTimeout(() => r(null), 8000))
        ]);
        if (resolved) {
          const fresh = await foundRef.get();
          if (fresh.exists) foundUser = { ...fresh.data(), uid: fresh.data().uid || fresh.id, _docId: fresh.id };
        }
      } catch (e) {
        console.warn('[User Status] Vérification paiement en attente impossible:', e.message);
      }
    }

    const now = Date.now();
    // Premium consolidé : un Pass posé sur n'importe quel doc du compte
    // (vrai doc OU fantôme hérité) débloque l'utilisateur.
    const merged = mergedPremiumStatus([foundUser, ...extraUsers]);
    const isPremium = merged.isPremium;
    const premiumPlan = merged.premiumPlan;
    const effectiveExpiresAt = isPremium ? (merged.premiumExpiresAt > now ? merged.premiumExpiresAt : (now + THIRTY_DAYS_MS)) : 0;

    // Sans jeton de session valide pour ce compte : statut d'abonnement uniquement (aucune donnée personnelle)
    const sessionUid = verifySession(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    const ownerIds = [foundUser.uid, foundUser.whatsapp, foundUser.contact, foundRef && foundRef.id].filter(Boolean).map(String);
    if (!sessionUid || !ownerIds.includes(sessionUid)) {
      return res.json({
        success: true,
        limited: true,
        user: { isPremium, premiumPlan, premiumExpiresAt: effectiveExpiresAt }
      });
    }

    res.json({
      success: true,
      user: {
        uid: foundUser.uid || rawUid,
        whatsapp: cleanPhone || foundUser.whatsapp,
        fullName: foundUser.fullName || `${foundUser.firstName || ''} ${foundUser.lastName || ''}`.trim() || 'Élève',
        firstName: foundUser.firstName || 'Élève',
        lastName: foundUser.lastName || '',
        selectedClass: foundUser.selectedClass || '3eme',
        isPremium: isPremium,
        premiumPlan: premiumPlan,
        premiumExpiresAt: effectiveExpiresAt,
        subscriptionType: foundUser.subscriptionType || 'monthly'
      }
    });
  } catch (err) {
    console.error('[User Status] Erreur:', err);
    res.status(500).json({ error: "Erreur serveur vérification statut" });
  }
};
app.get('/api/user-status', userStatusHandler);
app.post('/api/user-status', userStatusHandler);

// --------------------------------------------------------------------------
// ROUTE 4.6 : FICHES SÉCURISÉES (toutes les classes)
// Aucun fichier de fiche n'est hébergé publiquement : ils vivent dans
// payment-api/fiches/ et ne sont servis qu'aux comptes authentifiés
// (sessionToken). La 1re fiche de chaque matière est en essai gratuit ;
// les autres exigent un Pass actif (école : dès 500 F ; Licence : uni_*).
// --------------------------------------------------------------------------
const SECURE_FICHES_DIR = path.join(__dirname, 'fiches');
const SECURE_FICHES_INDEX_PATH = path.join(__dirname, 'fiches-index.json');
let secureFichesIndexCache = null;
function getSecureFichesIndex() {
  if (secureFichesIndexCache) return secureFichesIndexCache;
  try {
    secureFichesIndexCache = JSON.parse(fs.readFileSync(SECURE_FICHES_INDEX_PATH, 'utf8'));
  } catch (e) {
    console.warn('[Fiches] fiches-index.json introuvable : essai gratuit désactivé.');
    secureFichesIndexCache = {};
  }
  return secureFichesIndexCache;
}
// Quota généreux : le pack hors-ligne télécharge toute une classe (~150 fiches) en une rafale
const ficheLimiter = limiter(15 * 60 * 1000, 1200);
app.get('/api/fiche/:cls/:sub/:file', ficheLimiter, async (req, res) => {
  try {
    const { cls, sub, file } = req.params;
    const unsafe = p => !p || p.includes('..') || p.includes('/') || p.includes('\\');
    if (unsafe(cls) || unsafe(sub) || unsafe(file) || !file.endsWith('.html')) {
      return res.status(404).json({ success: false, error: 'Fiche introuvable.' });
    }
    const filePath = path.join(SECURE_FICHES_DIR, cls, sub, file);
    if (!filePath.startsWith(SECURE_FICHES_DIR + path.sep) || !fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Fiche introuvable.' });
    }
    const sessionUid = verifySession(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!sessionUid) {
      return res.status(401).json({ success: false, error: 'auth_required' });
    }
    const subFiches = (getSecureFichesIndex()[cls] || {})[sub] || [];
    const isTrialFiche = subFiches.length > 0 && subFiches[0] === file;
    if (!isTrialFiche) {
      let user = db ? await findUserByAnyId(sessionUid).catch(() => null) : null;
      const candidates = [user];
      // Session héritée pointant un doc fantôme ou non premium : suivre le
      // téléphone du doc vers le vrai compte (premium accordé sur users/{numéro}).
      if (user) {
        const ghostPhone = String(user.whatsapp || user.contact || user.phone || '').replace(/\D/g, '').slice(-10);
        if (ghostPhone.length === 10) {
          const real = await findUserByAnyId(ghostPhone).catch(() => null);
          if (real && real._docId !== user._docId) candidates.push(real);
        }
      }
      const status = mergedPremiumStatus(candidates);
      // Université : Pass étudiant (uni_*) requis. École : n'importe quel Pass actif (dès 500 F).
      const isPremium = status.isPremium && (cls.startsWith('Licence_') ? status.premiumPlan.startsWith('uni_') : true);
      if (!isPremium) {
        return res.status(403).json({ success: false, error: 'premium_required' });
      }
    }
    res.set('Cache-Control', 'private, max-age=300');
    res.sendFile(filePath);
  } catch (e) {
    console.error('[Fiche] Erreur:', e);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// --------------------------------------------------------------------------
// ROUTE 4.6b : SUJETS & INTERROS PDF (réservés Pass Élite / Excellence / VIP / Annuel)
// Les PDF vivent dans payment-api/interros/ et ne sont jamais exposés en statique :
// chaque téléchargement exige un sessionToken valide + un plan de niveau Élite.
// --------------------------------------------------------------------------
const INTERROS_DIR = path.join(__dirname, 'interros');
const INTERROS_CATALOG_PATH = path.join(INTERROS_DIR, 'catalog.json');
const ELITE_PLANS = new Set(['elite', 'uni_elite', 'vip', 'annual', 'annuel']);
let interrosCatalogCache = null;
function getInterrosCatalog() {
  if (interrosCatalogCache) return interrosCatalogCache;
  try {
    interrosCatalogCache = JSON.parse(fs.readFileSync(INTERROS_CATALOG_PATH, 'utf8'));
  } catch (e) {
    console.warn('[Interros] catalog.json introuvable : section désactivée.');
    interrosCatalogCache = [];
  }
  return interrosCatalogCache;
}

// Catalogue public (métadonnées uniquement — aucun contenu) : sert à l'affichage
// de la liste et à l'upsell auprès des comptes non-Élite.
app.get('/api/interros/catalog', limiter(15 * 60 * 1000, 120), (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  const items = getInterrosCatalog().map(d => ({
    ...d,
    playable: !!d.code && fs.existsSync(path.join(INTERROS_DIR, '..', 'exams', `${d.code}.json`))
  }));
  res.json({ success: true, interros: items });
});

const interroLimiter = limiter(15 * 60 * 1000, 300);
app.get('/api/interro/:code/:part', interroLimiter, async (req, res) => {
  try {
    const { code, part } = req.params;
    if (!/^[A-Z0-9-]{4,40}$/i.test(code) || !['enonce', 'corrige'].includes(part)) {
      return res.status(404).json({ success: false, error: 'Document introuvable.' });
    }
    const filePath = path.join(INTERROS_DIR, `${code}_${part}.pdf`);
    if (!filePath.startsWith(INTERROS_DIR + path.sep) || !fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Document introuvable.' });
    }
    const sessionUid = verifySession(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!sessionUid) {
      return res.status(401).json({ success: false, error: 'auth_required' });
    }
    let user = db ? await findUserByAnyId(sessionUid).catch(() => null) : null;
    const candidates = [user];
    if (user) {
      const ghostPhone = String(user.whatsapp || user.contact || user.phone || '').replace(/\D/g, '').slice(-10);
      if (ghostPhone.length === 10) {
        const real = await findUserByAnyId(ghostPhone).catch(() => null);
        if (real && real._docId !== user._docId) candidates.push(real);
      }
    }
    const status = mergedPremiumStatus(candidates);
    if (!status.isPremium || !ELITE_PLANS.has(String(status.premiumPlan || '').toLowerCase())) {
      return res.status(403).json({ success: false, error: 'elite_required' });
    }
    res.set('Cache-Control', 'private, max-age=300');
    res.sendFile(filePath);
  } catch (e) {
    console.error('[Interro] Erreur:', e);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// --------------------------------------------------------------------------
// ROUTE 4.6c : MODE EXAMEN EN LIGNE (Pass Élite uniquement)
// L'épreuve est générée à la volée : chaque tentative pioche des valeurs
// différentes (sujets « infinis »), les réponses et corrigés ne quittent JAMAIS
// le serveur avant le rendu de copie. Bloc interactif (V/F, QCM, calculs)
// corrigé automatiquement ; exercices à rédiger auto-évalués via grille.
// --------------------------------------------------------------------------
const EXAMS_DIR = path.join(__dirname, 'exams');
const examSpecCache = {};
function getExamSpec(code) {
  if (examSpecCache[code]) return examSpecCache[code];
  try {
    const spec = JSON.parse(fs.readFileSync(path.join(EXAMS_DIR, `${code}.json`), 'utf8'));
    examSpecCache[code] = spec;
    return spec;
  } catch (e) { return null; }
}

let katexLib = null;
try { katexLib = require('katex'); } catch (e) {
  try { katexLib = require(path.join(__dirname, '..', 'node_modules', 'katex')); } catch (e2) {}
}
// $...$ et $$...$$ -> HTML KaTeX : aucun code LaTeX brut n'arrive au client.
function texify(html) {
  const s = String(html || '');
  if (!katexLib) return s;
  return s
    .replace(/\$\$([\s\S]+?)\$\$/g, (m, t) => { try { return katexLib.renderToString(t, { displayMode: true, throwOnError: false, strict: 'ignore' }); } catch (e) { return m; } })
    .replace(/\$([^$]+?)\$/g, (m, t) => { try { return katexLib.renderToString(t, { displayMode: false, throwOnError: false, strict: 'ignore' }); } catch (e) { return m; } });
}

// RNG déterministe (mulberry32) : la variante d'un élève est reproductible à la correction.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFrom(str) {
  let h = 2166136261;
  for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function drawParams(defs, rng) {
  const out = {};
  for (const [k, d] of Object.entries(defs || {})) {
    if (Array.isArray(d.choices)) out[k] = d.choices[Math.floor(rng() * d.choices.length)];
    else if (typeof d.min === 'number') {
      const step = Number(d.step) || 1;
      const n = Math.floor((Number(d.max) - Number(d.min)) / step);
      out[k] = Number(d.min) + step * Math.floor(rng() * (n + 1));
    }
  }
  return out;
}
// Expressions des specs : contenu maison uniquement (jamais d'entrée utilisateur).
function evalExamExpr(expr, scope) {
  try { return Function(...Object.keys(scope), `"use strict";return (${expr});`)(...Object.values(scope)); }
  catch (e) { return NaN; }
}
function fmtExamNum(x, decimals) {
  if (typeof x !== 'number' || !isFinite(x)) return String(x);
  let s = decimals != null ? x.toFixed(decimals) : (Math.round(x * 10000) / 10000).toString();
  if (decimals == null) s = s.replace(/\.?0+$/, '');
  return s.replace('.', ',');
}
// {{name}} brut · {{num:name}} décimale française · {{d2:}} / {{d3:}} arrondis · {{pct:name}} ×100
function substExam(str, scope) {
  return String(str || '').replace(/\{\{(num|d2|d3|pct)?(?::)?(\w+)\}\}/g, (m, f, k) => {
    const v = scope[k];
    if (v === undefined) return m;
    if (f === 'pct') return fmtExamNum(Math.round(v * 10000) / 100, null);
    if (f === 'd2') return fmtExamNum(v, 2);
    if (f === 'd3') return fmtExamNum(v, 3);
    return fmtExamNum(v, null);
  });
}
function renderExamText(str, scope) { return texify(substExam(str, scope)); }

// Tentatives d'examen : Firestore (prod) ou mémoire (local sans base).
const memExamAttempts = new Map();
function saveExamAttempt(id, data) {
  if (db) return db.collection('examAttempts').doc(id).set(data).catch(() => {});
  memExamAttempts.set(id, data); return Promise.resolve();
}
async function loadExamAttempt(id) {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(id || ''))) return null;
  if (db) { const d = await db.collection('examAttempts').doc(id).get().catch(() => null); return d && d.exists ? d.data() : null; }
  return memExamAttempts.get(id) || null;
}

// Construit la variante : tire les paramètres, calcule les dérivés, sépare
// partie publique (énoncés) / partie secrète (réponses + corrigés).
function buildExamVariant(spec, seed) {
  const rng = mulberry32(seed);
  const scope = drawParams(spec.params, rng);
  for (const [k, expr] of Object.entries(spec.derived || {})) scope[k] = evalExamExpr(expr, scope);
  const keys = {};
  const blocs = (spec.blocs || []).map(b => ({
    titre: renderExamText(b.titre, scope),
    consigne: renderExamText(b.consigne || '', scope),
    questions: (b.questions || []).map(q => {
      const pub = {
        id: q.id, type: q.type, points: q.points, chapitre: q.chapitre || '',
        enonce: renderExamText(q.enonce, scope),
        svg: q.svg ? substExam(q.svg, scope) : null,
        precision: q.precision ? renderExamText(q.precision, scope) : null,
        choix: Array.isArray(q.choix) ? q.choix.map(c => renderExamText(c, scope)) : null
      };
      if (q.type === 'vrai_faux') {
        const ok = q.correctExpr !== undefined ? Boolean(evalExamExpr(q.correctExpr, scope)) : Boolean(q.correct);
        keys[q.id] = { t: 'vf', v: ok, pts: q.points, chapitre: q.chapitre || '', enonce: pub.enonce, corrige: renderExamText(ok ? (q.corrigeVrai || q.corrige || '') : (q.corrigeFaux || q.corrige || ''), scope) };
      } else if (q.type === 'qcm') {
        keys[q.id] = { t: 'qcm', v: Number(q.correct), pts: q.points, chapitre: q.chapitre || '', enonce: pub.enonce, corrige: renderExamText(q.corrige || '', scope) };
      } else if (q.type === 'numeric') {
        keys[q.id] = { t: 'num', v: evalExamExpr(q.answer || '0', scope), tol: Number(q.tol) || 0.001, pts: q.points, chapitre: q.chapitre || '', enonce: pub.enonce, corrige: renderExamText(q.corrige || '', scope) };
      } else if (q.type === 'papier') {
        keys[q.id] = { t: 'papier', pts: q.points, chapitre: q.chapitre || '', enonce: pub.enonce, steps: (q.steps || []).map(s => ({ titre: renderExamText(s.titre, scope), points: s.points, texte: renderExamText(s.texte, scope) })) };
      }
      if (pub.choix === null) delete pub.choix;
      return pub;
    })
  }));
  return { scope, keys, blocs };
}

const examLimiter = limiter(15 * 60 * 1000, 90);
app.post('/api/exam/:code/start', examLimiter, async (req, res) => {
  try {
    const code = String(req.params.code || '');
    if (!/^[A-Z0-9-]{4,40}$/i.test(code)) return res.status(404).json({ success: false, error: 'Épreuve introuvable.' });
    const spec = getExamSpec(code);
    if (!spec) return res.status(404).json({ success: false, error: 'Épreuve introuvable.' });
    const sessionUid = verifySession(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!sessionUid) return res.status(401).json({ success: false, error: 'auth_required' });
    let user = db ? await findUserByAnyId(sessionUid).catch(() => null) : null;
    const candidates = [user];
    if (user) {
      const ghostPhone = String(user.whatsapp || user.contact || user.phone || '').replace(/\D/g, '').slice(-10);
      if (ghostPhone.length === 10) {
        const real = await findUserByAnyId(ghostPhone).catch(() => null);
        if (real && real._docId !== user._docId) candidates.push(real);
      }
    }
    const status = mergedPremiumStatus(candidates);
    if (!status.isPremium || !ELITE_PLANS.has(String(status.premiumPlan || '').toLowerCase())) {
      return res.status(403).json({ success: false, error: 'elite_required' });
    }
    const attemptId = crypto.randomUUID();
    const { keys, blocs } = buildExamVariant(spec, seedFrom(attemptId));
    const startedAt = Date.now();
    const endsAt = startedAt + (Number(spec.dureeMin) || 60) * 60000;
    const autoQuestions = [];
    const paperQuestions = [];
    for (const b of blocs) for (const q of b.questions) (q.type === 'papier' ? paperQuestions : autoQuestions).push(q.id);
    await saveExamAttempt(attemptId, {
      uid: sessionUid, code, keys, paperKeys: Object.fromEntries(paperQuestions.map(id => [id, keys[id]])),
      startedAt, endsAt, submitted: false
    });
    // Épreuve publique : aucune réponse ni corrigé ne quitte le serveur.
    const publicBlocs = blocs.map(b => ({
      titre: b.titre, consigne: b.consigne,
      questions: b.questions.map(q => ({ id: q.id, type: q.type, points: q.points, chapitre: q.chapitre, enonce: q.enonce, svg: q.svg, precision: q.precision, choix: q.choix }))
    }));
    res.json({ success: true, attemptId, endsAt, exam: { titre: spec.titre, classeLabel: spec.classeLabel, matiere: spec.matiere, dureeMin: spec.dureeMin, noteSur: spec.noteSur, consignes: texify(spec.consignes), blocs: publicBlocs } });
  } catch (e) {
    console.error('[Exam] Erreur start:', e);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.post('/api/exam/submit', examLimiter, async (req, res) => {
  try {
    const { attemptId, answers } = req.body || {};
    const sessionUid = verifySession(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!sessionUid) return res.status(401).json({ success: false, error: 'auth_required' });
    const att = await loadExamAttempt(attemptId);
    if (!att || String(att.uid) !== String(sessionUid)) return res.status(404).json({ success: false, error: 'Tentative introuvable.' });
    if (att.submitted && att.cachedResult) return res.json({ success: true, ...att.cachedResult, alreadySubmitted: true });
    const ans = (answers && typeof answers === 'object') ? answers : {};
    const late = Date.now() > (Number(att.endsAt) || 0) + 10 * 60000; // 10 min de grâce
    let autoScore = 0, autoMax = 0;
    const detail = [];
    for (const [qid, k] of Object.entries(att.keys || {})) {
      if (k.t === 'papier') continue;
      autoMax += Number(k.pts) || 0;
      let ok = false, given = ans[qid];
      if (k.t === 'vf') ok = given === true || given === false ? given === k.v : false;
      else if (k.t === 'qcm') ok = given !== undefined && Number(given) === k.v;
      else if (k.t === 'num') {
        const num = typeof given === 'string' ? parseFloat(given.replace(',', '.').replace(/\s/g, '')) : Number(given);
        ok = isFinite(num) && Math.abs(num - k.v) <= (k.tol || 0.001);
      }
      if (ok) autoScore += Number(k.pts) || 0;
      detail.push({ id: qid, ok, points: ok ? k.pts : 0, maxPts: k.pts, chapitre: k.chapitre, enonce: k.enonce, corrige: k.corrige });
    }
    const paper = Object.entries(att.paperKeys || {}).map(([qid, k]) => ({ id: qid, points: k.pts, chapitre: k.chapitre, enonce: k.enonce, steps: k.steps }));
    const result = { autoScore, autoMax, detail, paper, late };
    att.submitted = true; att.cachedResult = result; att.finishedAt = Date.now();
    await saveExamAttempt(attemptId, att);
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('[Exam] Erreur submit:', e);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// --------------------------------------------------------------------------
// ROUTE 4.7 : AUTHENTIFICATION / CONNEXION ÉLÈVE & RESTAURATION ABONNEMENT
// --------------------------------------------------------------------------
app.post('/api/login', async (req, res) => {
  try {
    const rawPhone = req.body.whatsapp || req.body.phone || req.body.contact || '';
    const cleanPhone = String(rawPhone).replace(/\D/g, '').slice(-10);
    const password = String(req.body.password || '').trim();

    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ success: false, error: "Numéro WhatsApp à 10 chiffres requis." });
    }
    if (!password) {
      return res.status(400).json({ success: false, error: "Mot de passe requis." });
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      return res.status(401).json({ success: false, error: INVALID_CREDENTIALS });
    }

    if (!db) {
      return res.status(503).json({ success: false, error: "Service de connexion temporairement indisponible. Réessaie dans quelques instants." });
    }

    const foundUser = await findUserByPhone(cleanPhone);

    // Même réponse (code + message) pour compte inexistant et mauvais mot de passe
    if (!foundUser) {
      await burnPasswordCheck(password);
      return res.status(401).json({ success: false, error: INVALID_CREDENTIALS });
    }

    // Vérification du mot de passe (hash bcrypt, ou ancien mot de passe en clair migré à la volée)
    if (!(await verifyPassword(password, foundUser))) {
      return res.status(401).json({ success: false, error: INVALID_CREDENTIALS });
    }
    await migrateLegacyPassword(foundUser, password);

    const profile = buildProfile(foundUser, cleanPhone);

    console.log(`[Login] ✅ Connexion réussie (${maskPhone(profile.uid)}) - Pass: ${profile.premiumPlan}`);

    res.json({
      success: true,
      profile: profile,
      message: "Connexion réussie !"
    });
  } catch (err) {
    console.error('[Login] Erreur:', err);
    res.status(500).json({ success: false, error: "Erreur serveur lors de la connexion." });
  }
});

// --------------------------------------------------------------------------
// ROUTE 4.9 : MODIFICATION DU PROFIL (prénom + mot de passe uniquement)
// Authentifiée par le sessionToken HMAC — seul le titulaire du compte agit.
// --------------------------------------------------------------------------
const profileLimiter = limiter(15 * 60 * 1000, 30);
app.post('/api/update-profile', profileLimiter, async (req, res) => {
  try {
    const sessionUid = verifySession(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!sessionUid) {
      return res.status(401).json({ success: false, error: 'Session expirée. Reconnecte-toi puis réessaie.' });
    }
    if (!db) {
      return res.status(503).json({ success: false, error: 'Service temporairement indisponible.' });
    }

    const user = await findUserByAnyId(sessionUid);
    if (!user || !user._docId) {
      return res.status(404).json({ success: false, error: 'Compte introuvable.' });
    }

    const update = {};
    if (req.body.firstName !== undefined) {
      const firstName = clampStr(req.body.firstName, 60).trim();
      if (!firstName) {
        return res.status(400).json({ success: false, error: 'Prénom requis (60 caractères max).' });
      }
      update.firstName = firstName;
      update.fullName = `${firstName} ${user.lastName || ''}`.trim();
    }

    const pwd = String(req.body.password || '');
    if (pwd) {
      if (pwd.length < MIN_PASSWORD_LENGTH || pwd.length > MAX_PASSWORD_LENGTH) {
        return res.status(400).json({ success: false, error: `Le mot de passe doit comporter entre ${MIN_PASSWORD_LENGTH} et ${MAX_PASSWORD_LENGTH} caractères.` });
      }
      const fv = FieldValue || admin.firestore?.FieldValue;
      update.passwordHash = await hashPassword(pwd);
      update.password = fv ? fv.delete() : undefined;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, error: 'Aucune modification demandée.' });
    }
    update.updatedAt = new Date().toISOString();

    const ref = db.collection('users').doc(user._docId);
    await ref.set(update, { merge: true });
    const fresh = await ref.get();
    const freshUser = { ...fresh.data(), uid: fresh.data().uid || fresh.id, _docId: fresh.id };
    const acctPhone = String(freshUser.whatsapp || freshUser.contact || fresh.id).replace(/\D/g, '').slice(-10) || fresh.id;
    console.log(`[Profile] ✏️ Profil mis à jour (${maskPhone(sessionUid)})`);
    res.json({ success: true, profile: buildProfile(freshUser, acctPhone) });
  } catch (err) {
    console.error('[UpdateProfile] Erreur:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur lors de la mise à jour.' });
  }
});

// --------------------------------------------------------------------------
// ROUTE 4.10 : SUPPRESSION RÉELLE DU COMPTE (session requise)
// --------------------------------------------------------------------------
app.post('/api/delete-account', profileLimiter, async (req, res) => {
  try {
    const sessionUid = verifySession(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!sessionUid) {
      return res.status(401).json({ success: false, error: 'Session expirée. Reconnecte-toi puis réessaie.' });
    }
    if (!db) {
      return res.status(503).json({ success: false, error: 'Service temporairement indisponible.' });
    }
    const user = await findUserByAnyId(sessionUid);
    if (!user || !user._docId) {
      return res.status(404).json({ success: false, error: 'Compte introuvable.' });
    }
    await db.collection('users').doc(user._docId).delete();
    console.log(`[DeleteAccount] 🗑️ Compte supprimé (${maskPhone(sessionUid)})`);
    res.json({ success: true });
  } catch (err) {
    console.error('[DeleteAccount] Erreur:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur lors de la suppression.' });
  }
});

// --------------------------------------------------------------------------
// ROUTE 5 : API ADMIN - UTILISATEURS UNIFIÉS (users + waitlist)
// --------------------------------------------------------------------------
app.get('/api/admin/users', async (req, res) => {
  try {
    const userMap = new Map();
    if (db) {
      const snapUsers = await db.collection('users').get();
      snapUsers.forEach(doc => {
        const d = doc.data();
        const phone = String(d.whatsapp || d.contact || '').replace(/\D/g, '').slice(-10);
        if (phone) {
          userMap.set(phone, { ...stripSecrets(d), contact: phone, whatsapp: phone, id: doc.id });
        }
      });

      const snapWait = await db.collection('waitlist').get();
      snapWait.forEach(doc => {
        const d = doc.data();
        const phone = String(d.contact || '').replace(/\D/g, '').slice(-10);
        if (phone && !userMap.has(phone)) {
          userMap.set(phone, {
            fullName: 'Inscrit VIP',
            firstName: 'Élève',
            lastName: 'VIP',
            contact: phone,
            whatsapp: phone,
            selectedClass: 'Non précisé',
            plan: 'free',
            isPremium: false,
            createdAt: d.timestamp ? (d.timestamp.toDate ? d.timestamp.toDate().toISOString() : d.timestamp) : new Date().toISOString(),
            userAgent: d.userAgent || 'Web',
            id: doc.id
          });
        }
      });
    }

    const users = Array.from(userMap.values());
    res.json({ success: true, users, count: users.length });
  } catch (err) {
    console.error("[Admin Users] Erreur:", err);
    res.status(500).json({ error: "Erreur récupération utilisateurs" });
  }
});

// --------------------------------------------------------------------------
// ROUTE 6-A : API ADMIN - CRÉER UN COMPTE ÉLÈVE DIRECTEMENT (100% GRATUIT ADMIN)
// --------------------------------------------------------------------------
app.post('/api/admin/create-user', async (req, res) => {
  try {
    const { fullName, firstName, lastName, phone, whatsapp, selectedClass, password, plan, days, reason } = req.body;
    const rawPhone = phone || whatsapp || '';
    const cleanPhone = String(rawPhone).replace(/\D/g, '').slice(-10);

    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ error: "Numéro de téléphone à 10 chiffres requis (ex: 0708091011)." });
    }

    const chosenPlan = KNOWN_PLANS.has(String(plan || '')) ? plan : 'pro';
    const isFree = chosenPlan === 'free';
    const durationDays = Math.min(Math.max(Number(days) || 0, 0), 3650) || (chosenPlan === 'annual' ? 365 : (chosenPlan === 'vip' ? 3650 : 30));
    const expiresAt = isFree ? 0 : (Date.now() + durationDays * 24 * 60 * 60 * 1000);
    const fName = clampStr(firstName || (fullName ? fullName.split(' ')[0] : 'Élève'), 60);
    const lName = clampStr(lastName || (fullName ? fullName.split(' ').slice(1).join(' ') : ''), 60);
    const full = clampStr(fullName || `${fName} ${lName}`.trim() || 'Élève', 120);
    const providedPassword = String(password || '').trim();
    if (providedPassword && providedPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Le mot de passe doit comporter au moins ${MIN_PASSWORD_LENGTH} caractères.` });
    }
    const clearPassword = providedPassword || crypto.randomBytes(9).toString('base64url');

    // Un numéro = un seul document (doc ID = numéro). Si le compte existe, on le met à jour sans changer son mot de passe.
    const existing = await findUserByPhone(cleanPhone);
    const docId = existing ? existing._docId : cleanPhone;

    const userData = {
      uid: existing ? (existing.uid || docId) : cleanPhone,
      fullName: full,
      firstName: fName,
      lastName: lName,
      whatsapp: cleanPhone,
      contact: cleanPhone,
      selectedClass: CLASS_KEY_RE.test(String(selectedClass || '')) ? selectedClass : 'Non précisé',
      plan: chosenPlan,
      premiumPlan: chosenPlan,
      isPremium: !isFree,
      premiumExpiresAt: expiresAt,
      subscriptionType: durationDays >= 300 ? 'yearly' : 'monthly',
      adminCreated: true,
      adminGrantReason: reason || 'Compte créé par l\'administrateur (Accès accordé)',
      createdAt: existing ? (existing.createdAt || new Date().toISOString()) : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (!existing) userData.passwordHash = await hashPassword(clearPassword);

    if (db) {
      await db.collection('users').doc(docId).set(userData, { merge: true });
    }

    console.log(`[Admin CreateUser] ✅ Compte ${existing ? 'mis à jour' : 'créé'} pour ${full} (${cleanPhone}) - Forfait: ${chosenPlan}`);
    // Le mot de passe en clair n'est renvoyé qu'une seule fois, à la création, pour être transmis à l'élève.
    res.json({
      success: true,
      existing: Boolean(existing),
      user: { ...stripSecrets(userData), ...(existing ? {} : { password: clearPassword }) },
      message: existing
        ? `Compte ${full} déjà existant : forfait mis à jour (mot de passe inchangé).`
        : `Compte ${full} créé avec succès.`
    });
  } catch (err) {
    console.error('[Admin CreateUser] Erreur:', err);
    res.status(500).json({ error: "Erreur création compte" });
  }
});

// --------------------------------------------------------------------------
// ROUTE 6-B : API ADMIN - ATTRIBUER, MODIFIER OU ARRÊTER UN ABONNEMENT EN 1 CLIC
// --------------------------------------------------------------------------
app.post('/api/admin/set-plan', async (req, res) => {
  try {
    const { target, plan, days, reason, fullName, selectedClass } = req.body;
    if (!target) {
      return res.status(400).json({ error: "Numéro WhatsApp ou UID requis." });
    }

    const cleanTarget = String(target).replace(/\D/g, '').slice(-10);
    const chosenPlan = KNOWN_PLANS.has(String(plan || '')) ? plan : 'pro';
    const isFree = chosenPlan === 'free';
    const durationDays = isFree ? 0 : (Math.min(Math.max(Number(days) || 0, 0), 3650) || (chosenPlan === 'annual' ? 365 : (chosenPlan === 'vip' ? 3650 : 30)));
    const durationMs = durationDays * 24 * 60 * 60 * 1000;
    const expiresAt = isFree ? 0 : (Date.now() + durationMs);

    const fv = FieldValue || admin.firestore?.FieldValue;
    const updateData = {
      isPremium: !isFree,
      plan: chosenPlan,
      premiumPlan: chosenPlan,
      premiumExpiresAt: expiresAt,
      subscriptionType: durationDays >= 300 ? 'yearly' : 'monthly',
      adminGranted: true,
      adminGrantReason: reason || (isFree ? 'Abonnement arrêté par l\'administrateur' : 'Attribué par l\'administrateur'),
      adminGrantedAt: fv ? fv.serverTimestamp() : new Date().toISOString(),
      updatedAt: fv ? fv.serverTimestamp() : new Date().toISOString()
    };

    if (isFree) {
      updateData.status = 'suspended';
      updateData.adminRevoked = true;
    } else {
      updateData.status = 'active';
      updateData.adminRevoked = false;
    }

    if (fullName) updateData.fullName = clampStr(fullName, 120);
    if (selectedClass && CLASS_KEY_RE.test(String(selectedClass))) updateData.selectedClass = selectedClass;

    if (db) {
      // Résoudre le vrai doc (doc ID ≠ uid/whatsapp possible sur anciens comptes)
      const resolvedUser = await findUserByAnyId(target).catch(() => null);
      const docIds = new Set([String(target)]);
      if (resolvedUser && resolvedUser._docId) docIds.add(resolvedUser._docId);
      if (cleanTarget.length === 10) docIds.add(cleanTarget);
      for (const id of docIds) {
        await db.collection('users').doc(id).set({
          ...updateData,
          ...(cleanTarget.length === 10 ? { whatsapp: cleanTarget, contact: cleanTarget } : {})
        }, { merge: true }).catch(() => {});
      }

      if (cleanTarget.length === 10) {
        // Aligner aussi les doublons partageant le même contact
        for (const field of ['whatsapp', 'contact', 'uid']) {
          try {
            const snap = await db.collection('users').where(field, '==', cleanTarget).get();
            const batch = db.batch();
            let n = 0;
            snap.forEach(doc => { if (!docIds.has(doc.id)) { batch.set(doc.ref, updateData, { merge: true }); n++; } });
            if (n) await batch.commit();
          } catch (e) {}
        }
      }
    }

    const actionText = isFree ? `Abonnement ARRÊTÉ pour ${target}` : `Forfait '${chosenPlan}' accordé à ${target} (${durationDays} jours)`;
    console.log(`[Admin SetPlan] 👑 ${actionText}`);

    res.json({
      success: true,
      plan: chosenPlan,
      isPremium: !isFree,
      premiumExpiresAt: expiresAt,
      message: isFree ? `Abonnement arrêté avec succès pour ${target}.` : `Formule ${chosenPlan} activée avec succès pour ${durationDays} jours.`
    });
  } catch (err) {
    console.error('[Admin SetPlan] Erreur:', err);
    res.status(500).json({ error: "Erreur attribution abonnement" });
  }
});

// --------------------------------------------------------------------------
// ROUTE 6-C : API ADMIN - SUPPRIMER UN INSCRIT (users ou waitlist)
// --------------------------------------------------------------------------
app.post('/api/admin/delete-user', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "Base de données indisponible" });
    const { target, docId } = req.body || {};
    const candidates = [...new Set([docId, target].filter(Boolean).map(String))];
    if (!candidates.length || candidates.some(id => id.length > 128 || id.includes('/'))) {
      return res.status(400).json({ error: "Identifiant de l'inscrit invalide." });
    }

    let deleted = null;
    for (const id of candidates) {
      const ref = db.collection('users').doc(id);
      const snap = await ref.get();
      if (snap.exists) { await ref.delete(); deleted = `users/${id}`; break; }
    }
    if (!deleted) {
      for (const id of candidates) {
        const ref = db.collection('waitlist').doc(id);
        const snap = await ref.get();
        if (snap.exists) { await ref.delete(); deleted = `waitlist/${id}`; break; }
      }
    }
    if (!deleted) return res.status(404).json({ error: "Inscrit introuvable" });

    console.log(`[Admin Delete] 🗑️ ${deleted} supprimé`);
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('[Admin Delete] Erreur:', err);
    res.status(500).json({ error: "Erreur suppression inscrit" });
  }
});

// --------------------------------------------------------------------------
// ROUTE 6-D : API ADMIN - PURGER TOUTE LA WAITLIST (inscrits VIP)
// --------------------------------------------------------------------------
app.post('/api/admin/purge-waitlist', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "Base de données indisponible" });
    const snap = await db.collection('waitlist').get();
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    console.log(`[Admin Purge] 🗑️ ${docs.length} inscrit(s) VIP (waitlist) supprimé(s)`);
    res.json({ success: true, deleted: docs.length });
  } catch (err) {
    console.error('[Admin Purge] Erreur:', err);
    res.status(500).json({ error: "Erreur purge waitlist" });
  }
});

// --------------------------------------------------------------------------
// ROUTE 6-E : API ADMIN - SUPPRIMER TOUS LES INSCRITS D'UNE CLASSE / FILIÈRE
// --------------------------------------------------------------------------
app.post('/api/admin/delete-class', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "Base de données indisponible" });
    const { selectedClass } = req.body || {};
    if (!selectedClass) {
      return res.status(400).json({ error: "Classe à supprimer requise." });
    }
    const cls = String(selectedClass);
    if (cls.length > 60 || cls.includes('/')) {
      return res.status(400).json({ error: "Classe invalide." });
    }
    const toDelete = new Map();
    for (const field of ['selectedClass', 'classe']) {
      const snap = await db.collection('users').where(field, '==', cls).get();
      snap.forEach(d => toDelete.set(d.id, d.ref));
    }
    const refs = Array.from(toDelete.values());
    for (let i = 0; i < refs.length; i += 400) {
      const batch = db.batch();
      refs.slice(i, i + 400).forEach(r => batch.delete(r));
      await batch.commit();
    }
    console.log(`[Admin DeleteClass] 🗑️ ${refs.length} inscrit(s) de « ${cls} » supprimé(s)`);
    res.json({ success: true, deleted: refs.length });
  } catch (err) {
    console.error('[Admin DeleteClass] Erreur:', err);
    res.status(500).json({ error: "Erreur suppression de la classe" });
  }
});

// --------------------------------------------------------------------------
// ROUTE 7 : API ADMIN - SUIVI DES PAIEMENTS RÉELS GENIUSPAY & WAVE EN DIRECT
// --------------------------------------------------------------------------
app.get('/api/admin/transactions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 40;
    const result = await fetchGeniusPayPayments(page, perPage);
    res.json(result);
  } catch (err) {
    console.error('[Admin Transactions] Erreur:', err.message);
    res.status(500).json({ error: "Impossible de récupérer les transactions GeniusPay" });
  }
});

// --------------------------------------------------------------------------
// ROUTES 8 : AVIS DES ÉLÈVES — lecture publique (approuvés), dépôt authentifié,
// modération exclusivement par l'admin (validation + suppression).
// --------------------------------------------------------------------------
const REVIEW_STATUS = { PENDING: 'pending', APPROVED: 'approved' };
const reviewsLimiter = limiter(15 * 60 * 1000, 10);

function reviewPublicView(d) {
  const r = d.data();
  return {
    id: d.id,
    firstName: String(r.firstName || 'Élève').slice(0, 60),
    classe: String(r.classe || '').slice(0, 60),
    stars: Math.max(1, Math.min(5, parseInt(r.stars, 10) || 5)),
    text: String(r.text || '').slice(0, 600),
    createdAt: r.createdAt || null
  };
}

// Lecture publique : uniquement les avis validés par l'admin.
app.get('/api/reviews', async (req, res) => {
  try {
    if (!db) return res.json({ success: true, reviews: [] });
    const lim = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const snap = await db.collection('reviews').where('status', '==', REVIEW_STATUS.APPROVED).get();
    const reviews = snap.docs
      .map(reviewPublicView)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, lim);
    res.json({ success: true, reviews });
  } catch (err) {
    console.error('[Reviews] Erreur lecture:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// Dépôt d'un avis : sessionToken requis. L'avis part en « pending » — invisible
// tant que l'admin ne l'a pas validé.
app.post('/api/reviews', reviewsLimiter, async (req, res) => {
  try {
    const sessionUid = verifySession(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!sessionUid) {
      return res.status(401).json({ success: false, error: 'Connecte-toi pour laisser ton avis.' });
    }
    if (!db) {
      return res.status(503).json({ success: false, error: 'Service temporairement indisponible.' });
    }
    const user = await findUserByAnyId(sessionUid);
    if (!user || !user._docId) {
      return res.status(404).json({ success: false, error: 'Compte introuvable.' });
    }
    const stars = parseInt(req.body.stars, 10);
    const text = String(req.body.text || '').trim();
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ success: false, error: 'Note entre 1 et 5 étoiles requise.' });
    }
    if (text.length < 10 || text.length > 600) {
      return res.status(400).json({ success: false, error: 'Ton avis doit contenir entre 10 et 600 caractères.' });
    }
    // Un seul avis en attente à la fois par compte (anti-spam).
    const own = await db.collection('reviews').where('uid', '==', user._docId).get();
    if (own.docs.some(d => d.data().status === REVIEW_STATUS.PENDING)) {
      return res.status(409).json({ success: false, error: 'Tu as déjà un avis en attente de validation.' });
    }
    const fv = FieldValue || admin.firestore?.FieldValue;
    const doc = {
      uid: user._docId,
      firstName: String(user.firstName || (user.fullName ? user.fullName.split(' ')[0] : 'Élève')).slice(0, 60),
      classe: String(user.selectedClass || user.classe || '').slice(0, 60),
      stars,
      text,
      status: REVIEW_STATUS.PENDING,
      createdAt: new Date().toISOString(),
      createdTs: fv ? fv.serverTimestamp() : null
    };
    const ref = await db.collection('reviews').add(doc);
    console.log(`[Reviews] 📝 Nouvel avis en attente (${stars}★) de ${maskPhone(user._docId)} → ${ref.id}`);
    res.json({ success: true, pending: true, message: 'Avis envoyé ! Il sera visible après validation par notre équipe.' });
  } catch (err) {
    console.error('[Reviews] Erreur dépôt:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// --- Admin : liste complète (en attente d'abord, puis récents) ---
app.get('/api/admin/reviews', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Base de données indisponible' });
    const snap = await db.collection('reviews').limit(300).get();
    const reviews = snap.docs.map(d => ({ ...reviewPublicView(d), status: d.data().status || 'pending', uid: d.data().uid || '' }));
    const rank = r => (r.status === 'pending' ? 0 : 1);
    reviews.sort((a, b) => rank(a) - rank(b) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    res.json({ success: true, reviews });
  } catch (err) {
    console.error('[Admin Reviews] Erreur liste:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// --- Admin : publier un avis ---
app.post('/api/admin/reviews/:id/approve', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Base de données indisponible' });
    const id = String(req.params.id || '');
    if (!id || id.includes('/')) return res.status(400).json({ error: 'Identifiant invalide.' });
    const ref = db.collection('reviews').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Avis introuvable.' });
    const fv = FieldValue || admin.firestore?.FieldValue;
    await ref.update({
      status: REVIEW_STATUS.APPROVED,
      approvedAt: new Date().toISOString(),
      approvedBy: String(req.adminUser.email || 'admin').toLowerCase(),
      ...(fv ? { approvedTs: fv.serverTimestamp() } : {})
    });
    console.log(`[Admin Reviews] ✅ Avis ${id} publié par ${req.adminUser.email}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin Reviews] Erreur approbation:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// --- Admin : supprimer un avis (refus ou retrait d'un avis déjà publié) ---
app.delete('/api/admin/reviews/:id', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Base de données indisponible' });
    const id = String(req.params.id || '');
    if (!id || id.includes('/')) return res.status(400).json({ error: 'Identifiant invalide.' });
    const ref = db.collection('reviews').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Avis introuvable.' });
    await ref.delete();
    console.log(`[Admin Reviews] 🗑️ Avis ${id} supprimé par ${req.adminUser.email}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin Reviews] Erreur suppression:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur ResumeCI actif sur http://0.0.0.0:${PORT}`);
});
