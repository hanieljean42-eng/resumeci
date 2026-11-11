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

// Base de secours MongoDB (MONGODB_URI) : prend le relais si le quota Firestore est épuisé.
let backupStore = null;
if (db && process.env.MONGODB_URI) {
  try {
    const { withMongoBackup } = require('./lib/dualstore');
    const fsMod = require('firebase-admin/firestore');
    db = withMongoBackup(db, {
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB || 'resumeci',
      FieldValue: FieldValue || fsMod.FieldValue,
      Timestamp: fsMod.Timestamp,
      FieldPath: fsMod.FieldPath,
      forceFallback: process.env.BACKUP_FORCE_FALLBACK === '1'
    });
    backupStore = db;
  } catch (e) {
    console.warn('⚠️ Base de secours MongoDB non initialisée:', e.message);
  }
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

// Quota gratuit Firestore épuisé (gRPC 8 RESOURCE_EXHAUSTED) : message explicite
// au lieu de « Erreur serveur ». Les routes journalisent leurs erreurs via
// console.error ; on y détecte le quota, puis on réécrit les réponses 500.
const FIRESTORE_QUOTA_MSG = 'Quota gratuit Firestore épuisé pour aujourd\'hui : les données reviennent automatiquement vers 08h00 GMT.';
let firestoreQuotaUntil = 0;
function isQuotaError(err) {
  return !!err && typeof err === 'object' && (err.code === 8 || err.code === 'resource-exhausted'
    || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(String(err.message || '')));
}
const consoleErrorOrig = console.error.bind(console);
console.error = (...args) => {
  if (args.some(isQuotaError)) firestoreQuotaUntil = Date.now() + 10 * 60 * 1000;
  consoleErrorOrig(...args);
};
app.use((req, res, next) => {
  const json = res.json.bind(res);
  res.json = body => {
    if (res.statusCode === 500 && firestoreQuotaUntil > Date.now() && body && typeof body === 'object') {
      res.status(429);
      body = { ...body, success: false, error: FIRESTORE_QUOTA_MSG, code: 'firestore_quota' };
    }
    return json(body);
  };
  next();
});

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

app.get('/api/admin/backup', async (req, res) => {
  if (!backupStore) return res.json({ success: true, enabled: false });
  res.json({ success: true, enabled: true, ...(await backupStore.status()) });
});
app.post('/api/admin/backup/sync', async (req, res) => {
  if (!backupStore) return res.status(400).json({ success: false, error: 'MONGODB_URI non configuré.' });
  backupStore.fullSync();
  res.json({ success: true, started: true });
});

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
    } catch (e) { if (isQuotaError(e)) throw e; }
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
      } catch (e) { if (isQuotaError(e)) throw e; }
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

// Normalise une date d'expiration stockée sous n'importe quelle forme
// (ms epoch, chaîne numérique, ISO, Timestamp Firestore). Number() sur un
// Timestamp ou une date ISO donne NaN → le compte était traité comme expiré
// alors qu'il était premium.
function toMsEpoch(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'object') {
    if (typeof v.toMillis === 'function') { const t = v.toMillis(); return isFinite(t) ? t : 0; }
    if (typeof v.toDate === 'function') { const t = v.toDate().getTime(); return isFinite(t) ? t : 0; }
    if (typeof v._seconds === 'number') return v._seconds * 1000 + Math.floor((v._nanoseconds || 0) / 1e6);
    return 0;
  }
  const n = Number(v);
  if (isFinite(n)) return n;
  const t = Date.parse(String(v));
  return isFinite(t) ? t : 0;
}
// Un plan 'free' ne compte jamais comme premium. Plan absent + isPremium=true
// (anciens docs sans champ plan) → 'pro' par défaut, comme avant.
function effectivePlanName(u) {
  const p = String((u && (u.premiumPlan || u.plan)) || '').toLowerCase();
  if (p === 'free') return '';
  if (p) return p;
  return (u && u.isPremium) ? 'pro' : '';
}
// Statut premium consolidé : un Pass accordé (par l'admin ou un paiement) sur
// N'IMPORTE QUEL doc du même compte compte — y compris sur un doc fantôme
// hérité. Renvoie le statut le plus favorable parmi les docs résolus.
function mergedPremiumStatus(users) {
  const now = Date.now();
  let best = null;
  let bestExp = -1;
  for (const u of users) {
    if (!u || !u.isPremium) continue;
    if (!effectivePlanName(u)) continue;
    const exp = toMsEpoch(u.premiumExpiresAt);
    if (!(exp === 0 || exp > now)) continue;
    // exp === 0 = accès à vie : prioritaire sur toute expiration datée.
    const rank = exp === 0 ? Infinity : exp;
    if (!best || rank > bestExp) { best = u; bestExp = rank; }
  }
  if (!best) return { isPremium: false, premiumPlan: 'free', premiumExpiresAt: 0 };
  const plan = effectivePlanName(best) || 'pro';
  const exp = toMsEpoch(best.premiumExpiresAt);
  return { isPremium: true, premiumPlan: plan, premiumExpiresAt: exp };
}
// Contenu Licence_* : toutes les formules payantes à partir de 1 000 FCFA
// donnent accès aux fiches de la classe (uni_* + équivalents école
// pro/elite/annual/vip). Seul le Starter 500 F reste réservé au scolaire :
// un étudiant qui a payé ne doit JAMAIS être ramené à l'essai pour ça.
const LICENCE_OK_PLANS = new Set(['uni_starter', 'uni_pro', 'uni_elite', 'pro', 'elite', 'annual', 'annuel', 'vip']);
function planAllowsClass(premiumPlan, cls) {
  if (!String(cls || '').startsWith('Licence_')) return true;
  return LICENCE_OK_PLANS.has(String(premiumPlan || '').toLowerCase());
}
// Tous les docs du compte (doc IDs candidats + champs uid/whatsapp/contact/phone
// dans tous les formats de numéro). Sert à rattraper un premium posé sur un
// doc doublon/fantôme que la résolution "meilleur doc" ne voit pas.
async function findAllAccountDocs(rawUid, rawPhone) {
  if (!db) return [];
  const users = db.collection('users');
  const byId = new Map();
  const ids = new Set();
  const addId = v => { const s = String(v ?? '').trim(); if (s) ids.add(s); };
  addId(rawUid);
  addId(rawPhone);
  const dig = v => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };
  const phone10 = dig(rawPhone) || dig(rawUid);
  if (phone10.length === 10) { addId(phone10); addId('225' + phone10); addId('+225' + phone10); }
  for (const id of ids) {
    try {
      const d = await users.doc(id).get();
      if (d.exists) byId.set(d.id, { ...d.data(), uid: d.data().uid || d.id, _docId: d.id });
    } catch (e) { if (isQuotaError(e)) throw e; }
  }
  const cands = phone10.length === 10 ? [phone10, '225' + phone10, '+225' + phone10] : [...ids];
  for (const field of ['uid', 'whatsapp', 'contact', 'phone']) {
    for (const cand of cands) {
      try {
        const snap = await users.where(field, '==', cand).limit(4).get();
        snap.forEach(d => {
          if (!byId.has(d.id)) byId.set(d.id, { ...d.data(), uid: d.data().uid || d.id, _docId: d.id });
        });
      } catch (e) { if (isQuotaError(e)) throw e; }
    }
  }
  return [...byId.values()];
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
  const expiresAt = toMsEpoch(user.premiumExpiresAt);
  const planName = effectivePlanName(user);
  const isPremium = Boolean(user.isPremium && planName && (expiresAt === 0 || expiresAt > now));
  const premiumPlan = isPremium ? planName : 'free';
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

  // 2. Doublons hérités : aligner TOUS les docs qui partagent le même numéro,
  // dans tous les formats stockés (10 chiffres, 225…, +225…) et tous les
  // champs (whatsapp/contact/phone/uid). Le whatsapp/contact est normalisé
  // au format 10 chiffres pour que les prochaines résolutions convergent.
  if (canonicalPhone) {
    const phoneCands = [canonicalPhone, '225' + canonicalPhone, '+225' + canonicalPhone];
    for (const field of ['whatsapp', 'contact', 'phone', 'uid']) {
      for (const cand of phoneCands) {
        try {
          const snap = await db.collection('users').where(field, '==', cand).limit(10).get();
          const batch = db.batch();
          let n = 0;
          snap.forEach(doc => {
            if (!targets.has(doc.id)) {
              batch.set(doc.ref, { ...updateData, whatsapp: canonicalPhone, contact: canonicalPhone }, { merge: true });
              n++;
            }
          });
          if (n) await batch.commit();
        } catch (e) {
          console.warn('[Unlock] Erreur MAJ batch:', e.message);
        }
      }
    }
  }

  invalidateUserCaches();
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
    let merged = mergedPremiumStatus([foundUser, ...extraUsers]);
    if (!merged.isPremium && cleanPhone) {
      // Statut négatif : scan complet du compte (tous les docs liés au numéro,
      // tous formats) pour rattraper un premium posé sur un doublon/fantôme
      // que la résolution "meilleur doc" ne voit pas. Coûteux → réservé aux
      // comptes qui semblent gratuits (sinon chaque visite alourdit le quota).
      try {
        const all = await findAllAccountDocs(rawUid, cleanPhone);
        const known = new Set([foundUser, ...extraUsers].filter(Boolean).map(u => u._docId));
        const fresh = all.filter(u => u._docId && !known.has(u._docId));
        if (fresh.length) merged = mergedPremiumStatus([foundUser, ...extraUsers, ...fresh]);
      } catch (e) {
        console.warn('[User Status] Scan compte complet impossible:', e.message);
      }
    }
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
// les autres exigent un Pass actif (école : dès 500 F ; Licence : formule ≥ 1 000 FCFA).
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
    const premHit = memCache.get(`prem:${sessionUid}`);
    if (!isTrialFiche && premHit && premHit.exp > Date.now()
      && (!premHit.val.premiumExpiresAt || premHit.val.premiumExpiresAt > Date.now())
      && planAllowsClass(premHit.val.premiumPlan, cls)) {
      // Pass actif déjà vérifié récemment : pas de relecture Firestore à chaque fiche.
    } else if (!isTrialFiche) {
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
      let status = mergedPremiumStatus(candidates);
      if (!status.isPremium && db) {
        // Statut négatif : scan complet du compte (tous les docs liés au
        // numéro, tous formats) — un premium posé sur un doublon/fantôme
        // ne doit jamais renvoyer l'élève à l'essai. Réservé aux refus
        // pour ne pas alourdir le quota sur les comptes premium.
        try {
          const scanPhone = user
            ? String(user.whatsapp || user.contact || user.phone || sessionUid)
            : sessionUid;
          const all = await findAllAccountDocs(sessionUid, scanPhone);
          const known = new Set(candidates.filter(Boolean).map(u => u._docId));
          const fresh = all.filter(u => u._docId && !known.has(u._docId));
          if (fresh.length) status = mergedPremiumStatus([...candidates, ...fresh]);
        } catch (e) {
          console.warn('[Fiche] Scan compte complet impossible:', e.message);
        }
      }
      if (status.isPremium) memCache.set(`prem:${sessionUid}`, { exp: Date.now() + 10 * 60 * 1000, val: status, hasVal: true });
      // Licence : toute formule payante ≥ 1 000 FCFA (uni_* ou équivalent école).
      // École : n'importe quel Pass actif (dès 500 F).
      const isPremium = status.isPremium && planAllowsClass(status.premiumPlan, cls);
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
// ROUTE 4.6c : SYNTHÈSE VOCALE NEURALE (Audio Podcast — Pass requis)
// Texte court → MP3 via les voix neurales Microsoft Edge (msedge-tts).
// Cache disque par sha1(voix|texte) : chaque segment n'est synthétisé qu'une
// fois. GET pour permettre le cache navigateur/SW (hors-ligne).
// --------------------------------------------------------------------------
const TTS_VOICES = new Set([
  'fr-FR-DeniseNeural', 'fr-FR-EloiseNeural', 'fr-FR-HenriNeural',
  'fr-FR-VivienneMultilingualNeural', 'fr-FR-RemyMultilingualNeural',
  'fr-CA-SylvieNeural', 'fr-CA-ThierryNeural', 'fr-CA-AntoineNeural',
  'fr-BE-CharlineNeural', 'fr-BE-GerardNeural',
  'fr-CH-ArianeNeural', 'fr-CH-FabriceNeural'
]);
const TTS_CACHE_DIR = path.join(__dirname, 'data', 'tts-cache');
try { fs.mkdirSync(TTS_CACHE_DIR, { recursive: true }); } catch (e) {}
let MsEdgeTTSClass = null;
let TTS_AUDIO_FORMAT = null;
try {
  const m = require('msedge-tts');
  MsEdgeTTSClass = m.MsEdgeTTS;
  TTS_AUDIO_FORMAT = m.OUTPUT_FORMAT && m.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3;
} catch (e) {
  console.warn('[TTS] msedge-tts indisponible :', e.message);
}
// Déduplique les synthèses concurrentes du même segment
const ttsInflight = new Map();
const ttsLimiter = limiter(15 * 60 * 1000, 800);
app.get('/api/tts', ttsLimiter, async (req, res) => {
  try {
    const text = String(req.query.text || '').replace(/\s+/g, ' ').trim();
    const voice = TTS_VOICES.has(String(req.query.v)) ? String(req.query.v) : 'fr-FR-DeniseNeural';
    if (!text || text.length > 400) {
      return res.status(400).json({ success: false, error: 'text_invalid' });
    }
    const sessionUid = verifySession(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!sessionUid) {
      return res.status(401).json({ success: false, error: 'auth_required' });
    }
    if (db) {
      const user = await findUserByAnyId(sessionUid).catch(() => null);
      if (!mergedPremiumStatus([user]).isPremium) {
        return res.status(403).json({ success: false, error: 'premium_required' });
      }
    }
    const key = crypto.createHash('sha1').update(voice + '|' + text).digest('hex');
    const file = path.join(TTS_CACHE_DIR, key + '.mp3');
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    if (fs.existsSync(file) && fs.statSync(file).size > 500) {
      return res.sendFile(file);
    }
    if (!MsEdgeTTSClass || !TTS_AUDIO_FORMAT) {
      return res.status(503).json({ success: false, error: 'tts_unavailable' });
    }
    if (ttsInflight.has(key)) {
      try { await ttsInflight.get(key); } catch (e) {}
      if (fs.existsSync(file) && fs.statSync(file).size > 500) return res.sendFile(file);
      return res.status(502).json({ success: false, error: 'tts_failed' });
    }
    const job = (async () => {
      const tts = new MsEdgeTTSClass();
      const tmp = file + '.tmp-' + process.pid + '-' + Date.now();
      try {
        await tts.setMetadata(voice, TTS_AUDIO_FORMAT);
        const { audioStream } = tts.toStream(text);
        await new Promise((resolve, reject) => {
          const w = fs.createWriteStream(tmp);
          audioStream.pipe(w);
          audioStream.on('error', reject);
          w.on('error', reject);
          w.on('finish', resolve);
          setTimeout(() => reject(new Error('tts_timeout')), 25000).unref();
        });
        if (fs.statSync(tmp).size < 500) throw new Error('tts_empty');
        fs.renameSync(tmp, file);
      } finally {
        try { fs.existsSync(tmp) && fs.unlinkSync(tmp); } catch (e) {}
        try { tts.close(); } catch (e) {}
      }
    })();
    ttsInflight.set(key, job);
    try { await job; } finally { ttsInflight.delete(key); }
    if (!fs.existsSync(file) || fs.statSync(file).size < 500) {
      return res.status(502).json({ success: false, error: 'tts_failed' });
    }
    res.sendFile(file);
  } catch (e) {
    console.error('[TTS] Erreur:', e.message);
    res.status(502).json({ success: false, error: 'tts_failed' });
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

// Classe effective d'un compte (candidats fusionnés : le « vrai » profil peut
// être lié via le numéro WhatsApp d'un compte fantôme).
function firstUserClasse(candidates) {
  for (const u of (candidates || [])) {
    const cls = String((u && (u.selectedClass || u.classe)) || '');
    if (cls) return cls;
  }
  return '';
}

// Un document n'est accessible qu'aux élèves de SA classe. Les sujets communs
// aux Terminales (ex. RC-T-FRAN) existent comme entrées par classe au catalogue
// → le filtrage par classe les garde visibles pour chaque classe concernée.
function docAllowedForClasse(code, cls) {
  if (!cls) return false;
  return getInterrosCatalog().some(d => d.code === code && d.classe === cls);
}

// Catalogue : métadonnées uniquement. Avec session + classe → uniquement les
// documents de SA classe (chaque élève ne voit que ses sujets). Sans session,
// catalogue complet (upsell + vérification de disponibilité Élite).
app.get('/api/interros/catalog', limiter(15 * 60 * 1000, 120), async (req, res) => {
  try {
    const sessionUid = verifySession(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    let cls = '';
    if (sessionUid && db) {
      const user = await findUserByAnyId(sessionUid).catch(() => null);
      cls = firstUserClasse([user]);
    }
    res.set('Cache-Control', sessionUid ? 'private, max-age=120' : 'public, max-age=300');
    const items = getInterrosCatalog()
      .filter(d => !cls || d.classe === cls)
      .map(d => ({
        ...d,
        playable: !!d.code && fs.existsSync(path.join(INTERROS_DIR, '..', 'exams', `${d.code}.json`))
      }));
    res.json({ success: true, interros: items });
  } catch (e) {
    console.error('[Interros] Erreur catalogue:', e);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
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
    const cls = firstUserClasse(candidates);
    if (!docAllowedForClasse(code, cls)) {
      return res.status(403).json({ success: false, error: 'wrong_class' });
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
  // Ne supprimer les zéros finaux qu'APRÈS la virgule (4.50 → 4.5) — jamais
  // dans un entier (20 → « 2 » cassait l'énoncé affiché vs la clé serveur).
  if (decimals == null && s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
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
    const cls = firstUserClasse(candidates);
    if (!docAllowedForClasse(code, cls)) {
      return res.status(403).json({ success: false, error: 'wrong_class' });
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
    invalidateUserCaches();
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
    invalidateUserCaches();
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
      invalidateUserCaches();
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
      invalidateUserCaches();
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
      if (snap.exists) { await ref.delete(); invalidateUserCaches(); deleted = `users/${id}`; break; }
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

// Cache mémoire (TTL) des lectures Firestore les plus fréquentes : le quota
// gratuit (50 000 lectures/jour) était épuisé par les appels répétés de
// l'accueil (avis, tirage) et des notifications. En cas d'erreur Firestore
// (ex. quota), la dernière valeur connue est resservie plutôt qu'un 500.
const memCache = new Map();
// Tous les appelants concurrents partagent la même promesse (repli inclus) ;
// une lecture invalidée pendant son vol ne réécrit pas le cache.
function cached(key, ttlMs, fn) {
  const hit = memCache.get(key);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.val);
  if (hit && hit.pending) return hit.pending;
  const prev = hit && hit.hasVal ? hit : null;
  const entry = { exp: 0, val: prev ? prev.val : undefined, hasVal: !!prev };
  const current = () => memCache.get(key) === entry;
  entry.pending = Promise.resolve().then(fn).then(val => {
    if (current()) memCache.set(key, { exp: Date.now() + ttlMs, val, hasVal: true });
    return val;
  }, err => {
    if (prev) {
      if (current()) memCache.set(key, { exp: Date.now() + 60 * 1000, val: prev.val, hasVal: true });
      console.warn(`[Cache] ${key} : valeur précédente resservie (${err.code || err.message})`);
      return prev.val;
    }
    if (current()) memCache.delete(key);
    throw err;
  });
  memCache.set(key, entry);
  return entry.pending;
}
function invalidateCache(prefix) {
  for (const k of memCache.keys()) if (k.startsWith(prefix)) memCache.delete(k);
}
// Suppression de compte (rare) : on oublie toutes les résolutions de session et Pass en cache.
function invalidateUserCaches() {
  invalidateCache('uid:');
  invalidateCache('prem:');
}
// Résolution session → doc utilisateur (l'ID du doc ne change pas).
async function findUserDocIdCached(sessionUid) {
  const user = await cached(`uid:${sessionUid}`, 30 * 60 * 1000, () => findUserByAnyId(sessionUid));
  if (!user) invalidateCache(`uid:${sessionUid}`);
  return user;
}
const reviewsLimiter = limiter(15 * 60 * 1000, 10);

// Centre de notifications in-app : target = 'all' (tous les élèves) ou un uid.
async function createNotification(n) {
  if (!db) return;
  try {
    const fv = FieldValue || admin.firestore?.FieldValue;
    await db.collection('notifications').add({
      target: String(n.target || 'all').slice(0, 80),
      icon: String(n.icon || 'fa-bell').slice(0, 40),
      title: String(n.title || '').slice(0, 120),
      body: String(n.body || '').slice(0, 300),
      createdAt: new Date().toISOString(),
      createdTs: fv ? fv.serverTimestamp() : null
    });
    invalidateCache(`notifs:${String(n.target || 'all').slice(0, 80)}`);
  } catch (err) {
    console.error('[Notifs] Erreur création:', err.message || err);
  }
}

// Lecture élève : notifications globales + celles qui le ciblent personnellement.
app.get('/api/notifications', async (req, res) => {
  try {
    const sessionUid = verifySession(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!sessionUid) return res.status(401).json({ success: false, error: 'Session requise.' });
    if (!db) return res.status(503).json({ success: false, error: 'Service temporairement indisponible.' });
    const user = await findUserDocIdCached(sessionUid);
    if (!user || !user._docId) return res.status(404).json({ success: false, error: 'Compte introuvable.' });
    const readTarget = target => db.collection('notifications').where('target', '==', target).get()
      .then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));
    const [globalNotifs, personalNotifs] = await Promise.all([
      cached('notifs:all', 5 * 60 * 1000, () => readTarget('all')),
      cached(`notifs:${user._docId}`, 5 * 60 * 1000, () => readTarget(user._docId))
    ]);
    const notifications = [...globalNotifs, ...personalNotifs].map(n => {
      return {
        id: n.id,
        icon: String(n.icon || 'fa-bell').slice(0, 40),
        title: String(n.title || '').slice(0, 120),
        body: String(n.body || '').slice(0, 300),
        personal: n.target === user._docId,
        createdAt: n.createdAt || null
      };
    }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 30);
    res.json({ success: true, notifications });
  } catch (err) {
    console.error('[Notifs] Erreur lecture:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

function reviewPublicView(d) {
  const r = d.data();
  return {
    id: d.id,
    firstName: String(r.firstName || 'Élève').slice(0, 60),
    classe: String(r.classe || '').slice(0, 60),
    stars: Math.max(1, Math.min(5, parseInt(r.stars, 10) || 5)),
    text: String(r.text || '').slice(0, 600),
    reply: String(r.reply || '').slice(0, 600),
    repliedAt: r.repliedAt || null,
    createdAt: r.createdAt || null
  };
}

// Lecture publique : uniquement les avis validés par l'admin.
app.get('/api/reviews', async (req, res) => {
  try {
    if (!db) return res.json({ success: true, reviews: [] });
    const lim = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const all = await cached('reviews:approved', 10 * 60 * 1000, async () => {
      const snap = await db.collection('reviews').where('status', '==', REVIEW_STATUS.APPROVED).get();
      return snap.docs.map(reviewPublicView)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    });
    const reviews = all.slice(0, lim);
    res.json({ success: true, reviews });
  } catch (err) {
    console.error('[Reviews] Erreur lecture:', err);
    if (isQuotaError(err)) return res.json({ success: true, reviews: [] });
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
    invalidateCache(`reviews:mine:${user._docId}`);
    console.log(`[Reviews] 📝 Nouvel avis en attente (${stars}★) de ${maskPhone(user._docId)} → ${ref.id}`);
    res.json({ success: true, pending: true, message: 'Avis envoyé ! Il sera visible après validation par notre équipe.' });
  } catch (err) {
    console.error('[Reviews] Erreur dépôt:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// Statut de l'avis de l'utilisateur connecté : le front s'en sert pour
// afficher le portail « laisse ton avis » tant qu'aucun avis n'existe
// (pending ou approved = considéré comme rempli).
app.get('/api/reviews/mine', async (req, res) => {
  try {
    const sessionUid = verifySession(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!sessionUid) return res.status(401).json({ success: false, error: 'Session requise.' });
    if (!db) return res.status(503).json({ success: false, error: 'Service temporairement indisponible.' });
    const user = await findUserDocIdCached(sessionUid);
    if (!user || !user._docId) return res.status(404).json({ success: false, error: 'Compte introuvable.' });
    const rv = await cached(`reviews:mine:${user._docId}`, 30 * 60 * 1000, async () => {
      const own = await db.collection('reviews').where('uid', '==', user._docId).limit(1).get();
      return own.empty ? null : own.docs[0].data();
    });
    if (!rv) return res.json({ success: true, submitted: false });
    res.json({
      success: true,
      submitted: true,
      status: rv.status || REVIEW_STATUS.PENDING,
      stars: Math.max(1, Math.min(5, parseInt(rv.stars, 10) || 5)),
      text: String(rv.text || '').slice(0, 600),
      reply: String(rv.reply || '').slice(0, 600)
    });
  } catch (err) {
    console.error('[Reviews] Erreur statut avis:', err);
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
    const rd = doc.data();
    invalidateCache('reviews:');
    // Un avis publié = un ticket au tirage de la semaine (anti-spam : modération + 1/compte).
    let drawEntered = false;
    try { drawEntered = await addDrawEntry(id, rd); } catch (e) { console.warn('[Draw] Entry KO:', e.message); }
    if (rd.uid) {
      await createNotification({
        target: rd.uid, icon: 'fa-star',
        title: '⭐ Ton avis est publié !',
        body: `Ton avis (${rd.stars || 5}/5 ★) est maintenant visible par tous les élèves de ResumeCI.${drawEntered ? ' 🎁 Il te fait aussi participer au tirage de la semaine : un Pass à gagner, gagnant annoncé dimanche à 20h !' : ''}`
      });
    }
    await createNotification({
      target: 'all', icon: 'fa-star',
      title: '⭐ Nouvel avis publié — à ton tour !',
      body: `${rd.firstName || 'Un élève'}${rd.classe ? ' (' + rd.classe + ')' : ''} a donné ${rd.stars || 5}/5 ★ à ResumeCI. Sois le prochain : laisse aussi ton avis !`
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin Reviews] Erreur approbation:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// --- Admin : répondre à un avis (possible avant ou après publication) ---
app.post('/api/admin/reviews/:id/reply', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Base de données indisponible' });
    const id = String(req.params.id || '');
    if (!id || id.includes('/')) return res.status(400).json({ error: 'Identifiant invalide.' });
    const reply = String(req.body.reply || '').trim().slice(0, 600);
    const ref = db.collection('reviews').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Avis introuvable.' });
    const fv = FieldValue || admin.firestore?.FieldValue;
    invalidateCache('reviews:');
    if (!reply) {
      // Réponse vide = retirer la réponse existante.
      await ref.update({ reply: '', repliedAt: '', repliedBy: '' });
      console.log(`[Admin Reviews] 💬 Réponse retirée sur l'avis ${id} par ${req.adminUser.email}`);
    } else {
      await ref.update({
        reply,
        repliedAt: new Date().toISOString(),
        repliedBy: String(req.adminUser.email || 'admin').toLowerCase(),
        ...(fv ? { repliedTs: fv.serverTimestamp() } : {})
      });
      console.log(`[Admin Reviews] 💬 Réponse à l'avis ${id} (${doc.data().status}) par ${req.adminUser.email}`);
      const rd = doc.data();
      if (rd.uid) {
        await createNotification({
          target: rd.uid, icon: 'fa-reply',
          title: '💬 ResumeCI a répondu à ton avis',
          body: reply.slice(0, 200)
        });
      }
      if (rd.status === REVIEW_STATUS.APPROVED) {
        await createNotification({
          target: 'all', icon: 'fa-reply',
          title: '💬 ResumeCI a répondu à un avis',
          body: `Réponse officielle à l'avis de ${rd.firstName || 'un élève'} : « ${reply.slice(0, 80)} »`
        });
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin Reviews] Erreur réponse:', err);
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
    invalidateCache('reviews:');
    console.log(`[Admin Reviews] 🗑️ Avis ${id} supprimé par ${req.adminUser.email}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin Reviews] Erreur suppression:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ==================== TIRAGE AU SORT HEBDO + CODES CADEAUX ====================
// Cycle hebdo (GMT = heure d'Abidjan) : la semaine démarre dimanche 20h et
// les participations se clôturent le dimanche suivant à 16h. L'admin tire au
// sort entre 16h et 20h, le gagnant est annoncé à 20h — et la semaine
// suivante s'ouvre à 20h. Un avis publié entre 16h et 20h compte quand même
// pour la semaine suivante (aucun ticket perdu). Le prix est un code cadeau
// à usage unique notifié au gagnant : il l'utilise ou l'offre à un camarade.
const DRAW_CLOSE_HOUR_GMT = 16; // clôture des participations
const DRAW_OPEN_HOUR_GMT = 20;  // ouverture officielle de la semaine suivante

function currentWeekId(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7; // lundi = 0
  t.setUTCDate(t.getUTCDate() - day + 3); // jeudi de la semaine ISO 8601
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  firstThu.setUTCDate(firstThu.getUTCDate() - ((firstThu.getUTCDay() + 6) % 7) + 3);
  const w = 1 + Math.round((t - firstThu) / 604800000);
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
}
function weekWindow(weekId) {
  const [y, w] = String(weekId).split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (w - 1) * 7);
  const end = new Date(monday);
  end.setUTCDate(monday.getUTCDate() + 6);
  end.setUTCHours(DRAW_CLOSE_HOUR_GMT, 0, 0, 0);            // dim. 16h : clôture
  const start = new Date(end.getTime() - 164 * 3600000);    // dim. 20h précédent : ouverture
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}
// Semaine « active » : dès la clôture (dim. 16h), les participations vont à la
// semaine suivante (ouverte officiellement à 20h — aucun ticket perdu).
function activeWeekId(d = new Date()) {
  const cur = currentWeekId(d);
  if (d.getTime() <= Date.parse(weekWindow(cur).endAt)) return cur;
  return currentWeekId(new Date(d.getTime() + 7 * 86400000));
}
// Dernier tirage clôturé et non encore effectué — cible du pick entre 16h et 20h.
async function pendingDrawToPick() {
  const snap = await db.collection('draws').where('status', '==', 'open').limit(20).get();
  const now = Date.now();
  return snap.docs.map(d => ({ ref: d.ref, ...d.data() }))
    .filter(x => x.endAt && Date.parse(x.endAt) <= now && (x.entries || []).length > 0)
    .sort((a, b) => String(b.weekId || '').localeCompare(String(a.weekId || '')))[0] || null;
}
async function getOrCreateDraw(weekId = activeWeekId()) {
  const ref = db.collection('draws').doc(weekId);
  const doc = await ref.get();
  if (doc.exists) return { ref, ...doc.data() };
  const data = { weekId, status: 'open', ...weekWindow(weekId), entries: [] };
  await ref.set(data, { merge: true });
  return { ref, ...data };
}
// 1 avis publié = 1 ticket (1 par compte par semaine — l'anti-spam avis fait le reste).
async function addDrawEntry(reviewId, rd, weight = 1) {
  const weekId = activeWeekId();
  const ref = db.collection('draws').doc(weekId);
  let entered = false;
  await db.runTransaction(async t => {
    const doc = await t.get(ref);
    const data = doc.exists ? doc.data() : { weekId, status: 'open', ...weekWindow(weekId), entries: [] };
    if (data.status !== 'open') return;
    const entries = Array.isArray(data.entries) ? data.entries : [];
    if (entries.some(e => e.uid === rd.uid)) return;
    entries.push({
      reviewId,
      uid: String(rd.uid || ''),
      firstName: clampStr(rd.firstName || 'Élève', 60),
      classe: clampStr(rd.classe || '', 60),
      stars: Math.max(1, Math.min(5, parseInt(rd.stars, 10) || 5)),
      weight: Math.min(Math.max(Number(weight) || 1, 1), 5),
      addedAt: new Date().toISOString()
    });
    t.set(ref, { ...data, entries }, { merge: true });
    entered = true;
  });
  if (entered) invalidateCache('draw:');
  return entered;
}
const isUniversityClass = c => /^Licence/i.test(String(c || ''));
function prizeFor(classe) {
  return isUniversityClass(classe)
    ? { plan: 'uni_pro', days: 30, label: 'Pass Licence Pro (1 mois)' }
    : { plan: 'pro', days: 30, label: 'Pass Pro (1 mois)' };
}
function genGiftCode() {
  return `RC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}
async function createGift({ plan, days, maxUses = 1, expiresAt = null, note = '', createdBy = 'admin' }) {
  const code = genGiftCode();
  const doc = {
    code, kind: 'days',
    plan: KNOWN_PLANS.has(String(plan)) ? plan : 'pro',
    days: Math.min(Math.max(Number(days) || 30, 1), 365),
    maxUses: Math.min(Math.max(Number(maxUses) || 1, 1), 500),
    usedBy: [],
    expiresAt: expiresAt || null,
    note: String(note || '').slice(0, 120),
    createdBy: String(createdBy || 'admin'),
    createdAt: new Date().toISOString()
  };
  await db.collection('gifts').doc(code).set(doc);
  return doc;
}
// Applique un cadeau : prolonge le Pass (base = max(maintenant, fin actuelle)
// — un gagnant déjà abonné ne perd jamais de jours).
async function grantGiftDays(uid, plan, days) {
  const user = await findUserByAnyId(uid);
  if (!user || !user._docId) return null;
  const now = Date.now();
  const base = Math.max(now, Number(user.premiumExpiresAt) || 0);
  const expiresAt = base + days * 24 * 60 * 60 * 1000;
  const fv = FieldValue || admin.firestore?.FieldValue;
  await db.collection('users').doc(user._docId).set({
    isPremium: true,
    plan,
    premiumPlan: plan,
    premiumExpiresAt: expiresAt,
    subscriptionType: days >= 300 ? 'yearly' : 'monthly',
    lastGiftAt: fv ? fv.serverTimestamp() : new Date().toISOString(),
    updatedAt: fv ? fv.serverTimestamp() : new Date().toISOString()
  }, { merge: true });
  invalidateUserCaches();
  return { expiresAt, user };
}

// Statut public du tirage (connecté ou non — `entered` exige la session).
app.get('/api/draw', async (req, res) => {
  try {
    if (!db) return res.json({ success: true, open: false, entriesCount: 0 });
    const { draw, past } = await cached(`draw:public:${activeWeekId()}`, 3 * 60 * 1000, async () => {
      const { ref, ...d } = await getOrCreateDraw();
      const snap = await db.collection('draws').where('status', '==', 'drawn').limit(10).get();
      const drawn = snap.docs.map(x => x.data()).sort((a, b) => String(b.weekId || '').localeCompare(String(a.weekId || '')));
      return { draw: d, past: drawn };
    });
    const uid = verifySession(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    const entries = Array.isArray(draw.entries) ? draw.entries : [];
    let lastWinner = null;
    const w = past.find(p => p.winner);
    if (w) {
      lastWinner = { firstName: w.winner.firstName, classe: w.winner.classe, weekId: w.weekId, prizeLabel: w.winner.prizeLabel || 'Pass offert' };
    }
    res.json({
      success: true,
      open: draw.status === 'open',
      weekId: draw.weekId,
      startAt: draw.startAt, endAt: draw.endAt,
      entriesCount: entries.length,
      entered: uid ? entries.some(e => e.uid === uid) : false,
      lastWinner
    });
  } catch (err) {
    console.error('[Draw] Erreur statut:', err);
    if (isQuotaError(err)) return res.json({ success: true, open: false, entriesCount: 0 });
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// Utiliser un code cadeau (session requise — l'élève OU le camarade à qui il l'a offert).
app.post('/api/gifts/redeem', async (req, res) => {
  try {
    const sessionUid = verifySession(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!sessionUid) return res.status(401).json({ success: false, error: 'Connecte-toi pour utiliser un code cadeau.' });
    if (!db) return res.status(503).json({ success: false, error: 'Service temporairement indisponible.' });
    const user = await findUserByAnyId(sessionUid);
    if (!user || !user._docId) return res.status(404).json({ success: false, error: 'Compte introuvable.' });
    const code = String(req.body.code || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 30);
    if (code.length < 6) return res.status(400).json({ success: false, error: 'Entre ton code cadeau.' });

    const ref = db.collection('gifts').doc(code);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Code inconnu. Vérifie les caractères.' });
    const g = doc.data();
    const usedBy = Array.isArray(g.usedBy) ? g.usedBy : [];
    if (usedBy.includes(user._docId)) return res.status(409).json({ success: false, error: 'Tu as déjà utilisé ce code.' });
    if (usedBy.length >= (Number(g.maxUses) || 1)) return res.status(410).json({ success: false, error: 'Ce code a déjà été utilisé.' });
    if (g.expiresAt && Date.parse(g.expiresAt) < Date.now()) return res.status(410).json({ success: false, error: 'Ce code a expiré.' });

    const grant = await grantGiftDays(user._docId, g.plan, Number(g.days) || 30);
    if (!grant) return res.status(404).json({ success: false, error: 'Compte introuvable.' });
    await ref.set({ usedBy: [...usedBy, user._docId], lastUsedAt: new Date().toISOString() }, { merge: true });
    console.log(`[Gifts] 🎁 Code ${code} utilisé par ${maskPhone(user._docId)} → ${g.days}j Pass ${g.plan}`);
    await createNotification({
      target: user._docId, icon: 'fa-gift',
      title: '🎁 Code cadeau activé !',
      body: `Ton Pass a été prolongé de ${g.days} jour${Number(g.days) > 1 ? 's' : ''}. Bonnes révisions !`
    });
    res.json({ success: true, days: g.days, plan: g.plan, expiresAt: grant.expiresAt, message: `🎁 ${g.days} jour${Number(g.days) > 1 ? 's' : ''} de Pass offerts !` });
  } catch (err) {
    console.error('[Gifts] Erreur redeem:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// --- Admin : tirage en cours (participants complets) + historique ---
app.get('/api/admin/draw', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Base de données indisponible' });
    const current = await getOrCreateDraw();
    const pending = await pendingDrawToPick();
    const draw = pending || current;
    const snap = await db.collection('draws').where('status', '==', 'drawn').limit(12).get();
    const past = snap.docs.map(d => d.data())
      .sort((a, b) => String(b.weekId || '').localeCompare(String(a.weekId || '')))
      .map(p => ({ weekId: p.weekId, entriesCount: (p.entries || []).length, drawnAt: p.drawnAt, drawnBy: p.drawnBy, winner: p.winner ? { firstName: p.winner.firstName, classe: p.winner.classe, prizeLabel: p.winner.prizeLabel, code: p.winner.code } : null }));
    res.json({
      success: true,
      draw: { ...draw, ref: undefined, due: !!pending },
      current: { weekId: current.weekId, entriesCount: (current.entries || []).length, endAt: current.endAt },
      past
    });
  } catch (err) {
    console.error('[Admin Draw] Erreur lecture:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// --- Admin : booster un avis « vedette » (compte ×N au tirage) ---
app.post('/api/admin/draw/entry/weight', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Base de données indisponible' });
    const reviewId = String(req.body.reviewId || '');
    const weight = Math.min(Math.max(parseInt(req.body.weight, 10) || 1, 1), 5);
    const draw = (await pendingDrawToPick()) || await getOrCreateDraw();
    const entries = Array.isArray(draw.entries) ? draw.entries : [];
    const e = entries.find(x => x.reviewId === reviewId);
    if (!e) return res.status(404).json({ error: 'Participant introuvable dans le tirage en cours.' });
    e.weight = weight;
    await draw.ref.set({ entries }, { merge: true });
    invalidateCache('draw:');
    res.json({ success: true, weight });
  } catch (err) {
    console.error('[Admin Draw] Erreur boost:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// --- Admin : lancer le tirage (pondéré) → génère le code prix + notifications ---
app.post('/api/admin/draw/pick', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Base de données indisponible' });
    const draw = await pendingDrawToPick();
    if (!draw) {
      const cur = await getOrCreateDraw();
      return res.status(409).json({ error: `Participations ouvertes jusqu'à la clôture (${String(cur.endAt || '').slice(0, 16).replace('T', ' ')} GMT) — le tirage se fait après 16h dimanche.` });
    }
    const entries = Array.isArray(draw.entries) ? draw.entries : [];

    const pool = [];
    entries.forEach(e => { for (let i = 0; i < (e.weight || 1); i++) pool.push(e); });
    const winner = pool[Math.floor(Math.random() * pool.length)];
    const prize = prizeFor(winner.classe);
    const gift = await createGift({ plan: prize.plan, days: prize.days, maxUses: 1, note: `Tirage ${draw.weekId} — gagnant ${maskPhone(winner.uid)}`, createdBy: req.adminUser.email });

    const winnerDoc = {
      reviewId: winner.reviewId, uid: winner.uid, firstName: winner.firstName,
      classe: winner.classe, stars: winner.stars,
      prizePlan: prize.plan, prizeDays: prize.days, prizeLabel: prize.label, code: gift.code
    };
    await draw.ref.set({
      status: 'drawn', winner: winnerDoc,
      drawnAt: new Date().toISOString(),
      drawnBy: String(req.adminUser.email || 'admin').toLowerCase()
    }, { merge: true });
    invalidateCache('draw:');
    await db.collection('reviews').doc(winner.reviewId).set({ drawWinner: draw.weekId }, { merge: true }).catch(() => {});

    await createNotification({
      target: winner.uid, icon: 'fa-trophy',
      title: '🏆 Tu as gagné le tirage de la semaine !',
      body: `Bravo ${winner.firstName} ! Ton avis a été tiré au sort : ${prize.label} offert. Ton code cadeau : ${gift.code} — entre-le dans « Mon Profil ». Déjà abonné ? Tu peux l'offrir à un camarade, il prolongera ton Pass ou le sien.`
    });
    await createNotification({
      target: 'all', icon: 'fa-trophy',
      title: '🏆 Tirage de la semaine — résultat !',
      body: `${winner.firstName}${winner.classe ? ' (' + String(winner.classe).replace(/_/g, ' ') + ')' : ''} a gagné ${prize.label} ! Laisse ton avis toi aussi pour participer au prochain tirage.`
    });
    console.log(`[Admin Draw] 🏆 Gagnant ${maskPhone(winner.uid)} (${winner.firstName}) → code ${gift.code}`);
    res.json({ success: true, winner: winnerDoc, code: gift.code, entriesCount: entries.length });
  } catch (err) {
    console.error('[Admin Draw] Erreur tirage:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// --- Admin : générer un code cadeau (concours, parrainage, compensation…) ---
app.post('/api/admin/gifts', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Base de données indisponible' });
    const { plan, days, maxUses, expiresAt, note } = req.body || {};
    if (!KNOWN_PLANS.has(String(plan)) || plan === 'free') {
      return res.status(400).json({ error: 'Formule invalide (pro, elite, uni_starter, uni_pro, uni_elite…).' });
    }
    let exp = null;
    if (expiresAt) {
      const t = Date.parse(expiresAt);
      if (!Number.isFinite(t)) return res.status(400).json({ error: 'Date d\'expiration invalide.' });
      exp = new Date(t).toISOString();
    }
    const gift = await createGift({ plan, days, maxUses, expiresAt: exp, note, createdBy: req.adminUser.email });
    console.log(`[Admin Gifts] 🎁 Code ${gift.code} créé (${gift.days}j ${gift.plan}, ${gift.maxUses} usage) par ${req.adminUser.email}`);
    res.json({ success: true, gift });
  } catch (err) {
    console.error('[Admin Gifts] Erreur création:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// --- Admin : liste des codes cadeaux ---
app.get('/api/admin/gifts', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Base de données indisponible' });
    const snap = await db.collection('gifts').limit(200).get();
    const gifts = snap.docs.map(d => d.data())
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .map(g => ({ code: g.code, plan: g.plan, days: g.days, maxUses: g.maxUses, used: (g.usedBy || []).length, expiresAt: g.expiresAt, note: g.note, createdAt: g.createdAt }));
    res.json({ success: true, gifts });
  } catch (err) {
    console.error('[Admin Gifts] Erreur liste:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// --- Admin : notification personnalisée — tous / une classe / un numéro ---
app.post('/api/admin/notifications', requireAdmin, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Base de données indisponible' });
    const { target, classe, phone, icon, title, body } = req.body || {};
    const t = String(title || '').trim();
    const b = String(body || '').trim();
    if (t.length < 3 || t.length > 120) return res.status(400).json({ error: 'Titre requis (3-120 caractères).' });
    if (b.length < 5 || b.length > 300) return res.status(400).json({ error: 'Message requis (5-300 caractères).' });
    const safeIcon = /^fa-[a-z0-9-]{1,38}$/i.test(String(icon || '')) ? String(icon) : 'fa-bell';
    let sent = 0;
    if (target === 'all') {
      await createNotification({ target: 'all', icon: safeIcon, title: t, body: b });
      sent = -1;
    } else if (target === 'classe') {
      const cls = String(classe || '').trim();
      if (!cls || cls.length > 60) return res.status(400).json({ error: 'Classe invalide.' });
      const snap = await db.collection('users').where('selectedClass', '==', cls).limit(1000).get();
      if (snap.empty) return res.status(404).json({ error: 'Aucun utilisateur dans cette classe.' });
      for (const d of snap.docs) {
        await createNotification({ target: d.id, icon: safeIcon, title: t, body: b });
        sent++;
      }
    } else if (target === 'phone') {
      const user = await findUserByAnyId(String(phone || '').trim());
      if (!user || !user._docId) return res.status(404).json({ error: 'Numéro introuvable.' });
      await createNotification({ target: user._docId, icon: safeIcon, title: t, body: b });
      sent = 1;
    } else {
      return res.status(400).json({ error: 'Cible invalide (all / classe / phone).' });
    }
    res.json({ success: true, sent });
  } catch (err) {
    console.error('[Admin Notifs] Erreur envoi:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// --------------------------------------------------------------------------
// OUTILS DE TEST LOCAL — actifs uniquement si DEV_MODE=1 et hors production.
// Permet de créer un compte de test avec n'importe quel forfait, sans paiement.
// Outil : http://127.0.0.1:3000/dev
// --------------------------------------------------------------------------
const DEV_MODE = process.env.DEV_MODE === '1' && !IS_PRODUCTION;
if (DEV_MODE) {
  const DEV_CLASSES = ['6eme', '5eme', '4eme', '3eme', 'Seconde_A', 'Seconde_C', 'Premiere_A', 'Premiere_C', 'Premiere_D', 'Terminale_A', 'Terminale_C', 'Terminale_D', 'Licence_1_Droit', 'Licence_1_Miage', 'Licence_1_ADA'];
  const DEV_PLANS = ['free', 'starter', 'pro', 'vip', 'annual', 'elite', 'uni_starter', 'uni_pro', 'uni_elite'];

  app.get('/dev', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>ResumeCI — Outils de test</title>
<style>body{font-family:sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#1e293b}h1{font-size:20px;color:#2563eb}h2{font-size:15px;margin:26px 0 8px;padding-bottom:6px;border-bottom:2px solid #e2e8f0}label{display:block;font-size:13px;font-weight:600;margin:14px 0 4px}input,select{width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;box-sizing:border-box}button{margin-top:18px;width:100%;padding:12px;background:#2563eb;color:#fff;border:0;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}.grid button{margin:0;padding:9px 4px;font-size:12px;background:#f1f5f9;color:#1e293b;border:1px solid #cbd5e1}.grid button:hover{background:#dbeafe;border-color:#2563eb}#out{margin-top:16px;padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:13px;white-space:pre-wrap;display:none}.warn{background:#fef3c7;border:1px solid #fde68a;padding:10px;border-radius:8px;font-size:12px;margin-top:18px}</style></head><body>
<h1>🧪 ResumeCI — Outils de test local</h1>
<p style="font-size:13px;color:#64748b">Après chaque action : reconnecte-toi sur <a href="http://localhost:8080/connexion.html" target="_blank">localhost:8080/connexion.html</a> pour recharger classe/forfait.</p>

<h2>🔄 Changement rapide de classe (forfait conservé)</h2>
<label>Numéro du compte de test</label><input id="phone" value="0700000001" maxlength="10">
<div class="grid">${DEV_CLASSES.map(c => `<button onclick="switchCls('${c}')">${c.replace(/_/g, ' ')}</button>`).join('')}</div>

<h2>👤 Compte complet (créer ou forfait)</h2>
<label>Nom complet</label><input id="name" value="Testeur ResumeCI">
<label>Classe</label><select id="cls">${DEV_CLASSES.map(c => `<option>${c}</option>`).join('')}</select>
<label>Forfait</label><select id="plan"><option value="keep">— forfait inchangé —</option>${DEV_PLANS.map(p => `<option>${p}</option>`).join('')}</select>
<label>Mot de passe (min 8 car., optionnel — défaut : test1234)</label><input id="pwd" placeholder="test1234">
<label>Durée en jours (optionnel)</label><input id="days" placeholder="365">
<button onclick="go()">Appliquer</button>
<div id="out"></div>
<div class="warn">⚠️ Outil de test local uniquement (DEV_MODE=1). Écrit dans la vraie base — utilise des numéros de test (07000000xx).</div>
<script>
async function call(body){
  const r = await fetch('/api/dev/test-account', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
  const j = await r.json(); out.style.display='block';
  out.textContent = j.error ? ('❌ ' + j.error) : ('✅ ' + j.message + '\\n\\nTél : ' + body.phone + (j.password ? '\\nMot de passe : ' + j.password : '') + '\\n\\n→ Reconnecte-toi sur http://localhost:8080/connexion.html');
}
function switchCls(c){ call({phone:phone.value, selectedClass:c, plan:'keep'}); }
function go(){ call({phone:phone.value, fullName:name.value, selectedClass:cls.value, plan:plan.value, password:pwd.value, days:days.value}); }
</script></body></html>`);
  });

  app.post('/api/dev/test-account', async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: 'Base de données indisponible' });
      const { phone, fullName, selectedClass, plan, days, password } = req.body || {};
      const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
      if (cleanPhone.length < 10) return res.status(400).json({ error: 'Numéro à 10 chiffres requis.' });
      const existing = await findUserByPhone(cleanPhone);
      const docId = existing ? existing._docId : cleanPhone;
      const keepPlan = !plan || plan === 'keep';
      const chosenPlan = (keepPlan && existing)
        ? (existing.premiumPlan || existing.plan || 'pro')
        : (KNOWN_PLANS.has(String(plan || '')) ? plan : 'pro');
      const isFree = chosenPlan === 'free';
      const keepExpiry = keepPlan && existing && Number(existing.premiumExpiresAt) > Date.now();
      const durationDays = Math.min(Math.max(Number(days) || 0, 0), 3650) || (chosenPlan === 'annual' ? 365 : (chosenPlan === 'vip' ? 3650 : 30));
      const pwd = String(password || '').trim();
      if (pwd && pwd.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `Mot de passe : ${MIN_PASSWORD_LENGTH} caractères min.` });
      const generatedPwd = pwd || 'test1234';
      const full = clampStr(fullName || 'Testeur ResumeCI', 120);
      const userData = {
        uid: existing ? (existing.uid || docId) : cleanPhone,
        fullName: full,
        firstName: clampStr(full.split(' ')[0] || 'Test', 60),
        lastName: clampStr(full.split(' ').slice(1).join(' '), 60),
        whatsapp: cleanPhone,
        contact: cleanPhone,
        selectedClass: CLASS_KEY_RE.test(String(selectedClass || '')) ? selectedClass : 'Terminale_D',
        plan: chosenPlan,
        premiumPlan: chosenPlan,
        isPremium: !isFree,
        premiumExpiresAt: isFree ? 0 : (keepExpiry ? Number(existing.premiumExpiresAt) : (Date.now() + durationDays * 24 * 60 * 60 * 1000)),
        subscriptionType: durationDays >= 300 ? 'yearly' : 'monthly',
        status: 'active',
        adminCreated: true,
        adminGrantReason: 'Compte de test local (DEV_MODE)',
        devTestAccount: true,
        createdAt: existing ? (existing.createdAt || new Date().toISOString()) : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (pwd || !existing) userData.passwordHash = await hashPassword(generatedPwd);
      await db.collection('users').doc(docId).set(userData, { merge: true });
      console.log(`[DEV] Compte test ${existing ? 'mis à jour' : 'créé'} : ${cleanPhone} → ${chosenPlan}`);
      res.json({
        success: true,
        password: (pwd || !existing) ? generatedPwd : undefined,
        profile: {
          uid: userData.uid,
          firstName: userData.firstName,
          lastName: userData.lastName,
          fullName: userData.fullName,
          selectedClass: userData.selectedClass,
          whatsapp: cleanPhone,
          phone: cleanPhone,
          isPremium: userData.isPremium,
          premiumPlan: chosenPlan,
          premiumExpiresAt: userData.premiumExpiresAt,
          subscriptionType: userData.subscriptionType,
          createdAt: userData.createdAt,
          sessionToken: signSession(userData.uid)
        },
        message: (keepPlan && existing)
          ? `Classe → ${userData.selectedClass.replace(/_/g, ' ')} (forfait ${chosenPlan} conservé)`
          : `Compte ${existing ? 'mis à jour' : 'créé'} — forfait ${chosenPlan} (${isFree ? 'gratuit' : durationDays + ' jours'})`
      });
    } catch (err) {
      console.error('[DEV] Erreur:', err);
      res.status(500).json({ error: 'Erreur dev' });
    }
  });
  console.log('🧪 DEV_MODE actif — outils de test sur /dev');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur ResumeCI actif sur http://0.0.0.0:${PORT}`);
});
