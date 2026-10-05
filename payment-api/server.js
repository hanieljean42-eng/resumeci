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
try {
  let credential = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    credential = admin.credential.cert(sa);
  } else {
    const saPath = resolveLocal('firebase-admin.json', 'payment-api/firebase-admin.json', '../payment-api/firebase-admin.json');
    if (saPath) {
      credential = admin.credential.cert(require(saPath));
    }
  }
  if (credential) {
    admin.initializeApp({ credential });
    db = admin.firestore();
    console.log('✅ Firebase Admin connecté (Firestore)');
  } else {
    console.warn('⚠️ Aucun compte de service Firebase trouvé (FIREBASE_SERVICE_ACCOUNT ou firebase-admin.json). Firestore désactivé.');
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
const INVALID_CREDENTIALS = "Identifiants invalides. Vérifie ton numéro WhatsApp et ton mot de passe.";

// Forfaits
const PLANS = {
  starter: { name: 'Starter (Mensuel)', price: 500, days: 30, available: true },
  pro: { name: 'Pro (Mensuel)', price: 1000, days: 30, available: true },
  annual: { name: 'Annuel (365 jours)', price: 10000, days: 365, available: true },
  elite: { name: 'Élite', price: 2000, days: 30, available: false }
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Emails autorisés à utiliser les routes /api/admin/* (séparés par des virgules)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'djeble.haniel@gmail.com')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

// Middleware : vérifie le jeton Firebase Auth (Authorization: Bearer <idToken>) et l'email admin
async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: "Authentification administrateur requise." });
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
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

// Helper : retrouve le compte unique associé à un numéro (doc ID = numéro, puis champs whatsapp / contact pour les anciens comptes)
async function findUserByPhone(cleanPhone) {
  if (!db || !cleanPhone || cleanPhone.length !== 10) return null;
  const users = db.collection('users');
  const direct = await users.doc(cleanPhone).get();
  if (direct.exists) return { ...direct.data(), uid: direct.data().uid || direct.id, _docId: direct.id };
  for (const field of ['whatsapp', 'contact']) {
    const snap = await users.where(field, '==', cleanPhone).limit(1).get();
    if (!snap.empty) {
      const d = snap.docs[0];
      return { ...d.data(), uid: d.data().uid || d.id, _docId: d.id };
    }
  }
  return null;
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
    await db.collection('users').doc(user._docId).set({
      passwordHash: await hashPassword(pwd),
      password: admin.firestore.FieldValue.delete(),
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
    createdAt: user.createdAt || new Date().toISOString()
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
  const updateData = {
    premiumPlan: tierKey || 'pro',
    plan: tierKey || 'pro',
    isPremium: true,
    premiumExpiresAt: expiresAt,
    subscriptionType: durationDays >= 300 ? 'yearly' : 'monthly',
    lastPaymentDate: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    pendingPayment: admin.firestore.FieldValue.delete(),
    ...extra
  };

  // 1. Débloquer par UID si renseigné
  if (uid) {
    try {
      await db.collection('users').doc(uid).set(updateData, { merge: true });
    } catch (e) {
      console.warn('[Unlock] Erreur doc UID:', e.message);
    }
  }

  // 2. Débloquer par Téléphone (format 10 chiffres ivoirien)
  if (phone) {
    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
    if (cleanPhone.length === 10) {
      try {
        await db.collection('users').doc(cleanPhone).set({
          ...updateData,
          whatsapp: cleanPhone,
          contact: cleanPhone
        }, { merge: true });
      } catch (e) {}

      // Mettre à jour tous les profils existants associés à ce contact
      try {
        const snap = await db.collection('users').where('whatsapp', '==', cleanPhone).get();
        const batch = db.batch();
        snap.forEach(doc => {
          batch.set(doc.ref, updateData, { merge: true });
        });
        await batch.commit();
      } catch (e) {
        console.warn('[Unlock] Erreur MAJ batch:', e.message);
      }
    }
  }

  console.log(`[Unlock] ✅ Compte débloqué avec succès: UID=${uid} / Phone=${phone} -> Pass ${tierKey} (${durationDays}j)`);
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
      createdAt: admin.firestore.FieldValue.serverTimestamp()
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
    await ref.set({ status: 'processed', expiresAt, processedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { alreadyProcessed: false, tierKey, expiresAt };
  } catch (e) {
    // Échec du déblocage : libérer la référence pour permettre un nouvel essai
    await ref.delete().catch(() => {});
    throw e;
  }
}

// Helper: Requête de consultation d'une transaction GeniusPay
function queryGeniusPayPayment(reference) {
  return new Promise((resolve, reject) => {
    const req = https.get(`${GENIUSPAY_API_URL}/${reference}`, {
      family: 4,
      headers: {
        'X-API-Key': GENIUSPAY_PUBLIC_KEY,
        'X-API-Secret': GENIUSPAY_SECRET_KEY
      },
      timeout: 20000
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
  const clear = () => userRef.update({ pendingPayment: admin.firestore.FieldValue.delete() }).catch(() => {});
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
        'X-API-Secret': GENIUSPAY_SECRET_KEY
      },
      timeout: 20000
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

    if (!uid || !tierKey || !PLANS[tierKey]) {
      return res.status(400).json({ error: "Données invalides (uid ou tierKey manquant)" });
    }

    if (!PLANS[tierKey].available) {
      return res.status(403).json({
        error: "Cette formule est actuellement en cours de finalisation."
      });
    }

    const plan = PLANS[tierKey];
    const origin = returnOrigin || 'https://resumeci.me';
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

    // Réutilise la transaction encore en attente (double clic, retour arrière, serveur lent)
    // au lieu d'en créer une nouvelle chez GeniusPay à chaque tentative.
    const userRef = db ? db.collection('users').doc(String(uid)) : null;
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

    // Payload GeniusPay avec Côte d'Ivoire par défaut et URLs de webhook explicites
    const payload = {
      amount: plan.price,
      currency: "XOF",
      description: `Pass Réussite ${plan.name} - ResumeCI`,
      country: "CI",
      customer: {
        name: customerName || 'Élève',
        email: customerEmail || 'eleve@resumeci.me',
        phone: formattedPhone,
        country: "CI"
      },
      metadata: {
        uid: uid,
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

    console.log(`[Paiement] Création transaction GeniusPay pour ${uid} - Forfait ${tierKey} (${plan.price} FCFA) - Tel: ${formattedPhone} - Méthode: ${chosenMethod}`);

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
      if (userRef && result.data.reference) {
        userRef.update({
          pendingPayment: { reference: String(result.data.reference), tierKey, checkoutUrl: targetUrl, createdAt: Date.now() }
        }).catch(() => {});
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

    const gpRes = await queryGeniusPayPayment(ref);
    if (!gpRes.success || !gpRes.data) {
      return res.status(404).json({ success: false, error: "Paiement non trouvé chez GeniusPay." });
    }

    const pay = gpRes.data;
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
      console.warn(`[ConfirmPayment] UID ${uid} ne correspond pas au paiement ${reference} (${pay.metadata.uid})`);
      return res.status(403).json({ success: false, error: "Ce paiement est associé à un autre compte." });
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
    if (cleanWa.length !== 10) {
      return res.status(400).json({ error: "Numéro WhatsApp à 10 chiffres obligatoire." });
    }
    if (cleanPwd.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Le mot de passe doit comporter au moins ${MIN_PASSWORD_LENGTH} caractères.` });
    }
    if (!db) {
      return res.status(503).json({ error: "Service d'inscription temporairement indisponible. Réessaie dans quelques instants." });
    }

    // Un numéro = un seul compte : le document est identifié par le numéro de téléphone
    const existing = await findUserByPhone(cleanWa);
    if (existing) {
      if (await verifyPassword(cleanPwd, existing)) {
        await migrateLegacyPassword(existing, cleanPwd);
        console.log(`[Register] Compte déjà existant pour ${cleanWa}, reconnexion.`);
        return res.json({ success: true, existing: true, user: buildProfile(existing, cleanWa) });
      }
      return res.status(401).json({ success: false, error: INVALID_CREDENTIALS });
    }

    const userDoc = {
      uid: cleanWa,
      firstName: (firstName || '').trim(),
      lastName: (lastName || '').trim(),
      fullName: `${firstName || ''} ${lastName || ''}`.trim() || 'Élève',
      selectedClass: selectedClass || 'Non précisé',
      whatsapp: cleanWa,
      contact: cleanWa,
      passwordHash: await hashPassword(cleanPwd),
      plan: 'free',
      premiumPlan: 'free',
      isPremium: false,
      premiumExpiresAt: 0,
      pendingPlan: plan && plan !== 'free' ? plan : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userAgent: userAgent || req.headers['user-agent'] || 'Web'
    };

    await db.collection('users').doc(cleanWa).set(userDoc);
    console.log(`[Register] ✅ Nouveau compte créé pour ${userDoc.fullName} (${cleanWa})`);
    res.json({ success: true, existing: false, user: buildProfile(userDoc, cleanWa) });
  } catch (err) {
    console.error('[Register] Erreur:', err);
    res.status(500).json({ error: "Erreur enregistrement" });
  }
});


// --------------------------------------------------------------------------
// ROUTE 4.6 : STATUT UTILISATEUR & SYNCHRONISATION EN DIRECT
// --------------------------------------------------------------------------
app.get('/api/user-status', async (req, res) => {
  try {
    const rawPhone = req.query.phone || req.query.whatsapp || req.query.contact || '';
    const rawUid = req.query.uid || '';
    const cleanPhone = String(rawPhone).replace(/\D/g, '').slice(-10);

    if (!cleanPhone && !rawUid) {
      return res.status(400).json({ error: "Numéro de téléphone ou UID requis." });
    }

    let foundUser = null;
    let foundRef = null;

    if (db) {
      // 1. Recherche par numéro à 10 chiffres (doc ID)
      if (cleanPhone.length === 10) {
        try {
          const docSnap = await db.collection('users').doc(cleanPhone).get();
          if (docSnap.exists) {
            foundUser = { ...docSnap.data(), uid: docSnap.data().uid || docSnap.id }; foundRef = docSnap.ref;
          }
        } catch (e) {}
      }

      // 2. Recherche par UID (doc ID)
      if (!foundUser && rawUid) {
        try {
          const docSnap = await db.collection('users').doc(rawUid).get();
          if (docSnap.exists) {
            foundUser = { ...docSnap.data(), uid: docSnap.data().uid || docSnap.id }; foundRef = docSnap.ref;
          }
        } catch (e) {}
      }

      // 3. Recherche par champ whatsapp == cleanPhone
      if (!foundUser && cleanPhone.length === 10) {
        try {
          const qSnap = await db.collection('users').where('whatsapp', '==', cleanPhone).limit(1).get();
          if (!qSnap.empty) {
            const doc = qSnap.docs[0];
            foundUser = { ...doc.data(), uid: doc.data().uid || doc.id }; foundRef = doc.ref;
          }
        } catch (e) {}
      }

      // 4. Recherche par champ contact == cleanPhone
      if (!foundUser && cleanPhone.length === 10) {
        try {
          const qSnap = await db.collection('users').where('contact', '==', cleanPhone).limit(1).get();
          if (!qSnap.empty) {
            const doc = qSnap.docs[0];
            foundUser = { ...doc.data(), uid: doc.data().uid || doc.id }; foundRef = doc.ref;
          }
        } catch (e) {}
      }
    }

    if (!foundUser) {
      return res.status(404).json({ success: false, error: "Utilisateur non trouvé" });
    }

    if (foundRef && foundUser.pendingPayment) {
      try {
        const resolved = await resolvePendingPayment(foundRef, foundUser);
        if (resolved) {
          const fresh = await foundRef.get();
          if (fresh.exists) foundUser = { ...fresh.data(), uid: fresh.data().uid || fresh.id };
        }
      } catch (e) {
        console.warn('[User Status] Vérification paiement en attente impossible:', e.message);
      }
    }

    const now = Date.now();
    const expiresAt = Number(foundUser.premiumExpiresAt) || 0;
    const isPremium = Boolean(foundUser.isPremium && (expiresAt === 0 || expiresAt > now));
    const premiumPlan = isPremium ? (foundUser.premiumPlan || foundUser.plan || 'pro') : 'free';
    const effectiveExpiresAt = isPremium ? (expiresAt > now ? expiresAt : (now + THIRTY_DAYS_MS)) : 0;

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

    console.log(`[Login] ✅ Connexion réussie (uid: ${profile.uid}) - Pass: ${profile.premiumPlan}`);

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

    const chosenPlan = plan || 'pro';
    const isFree = chosenPlan === 'free';
    const durationDays = Number(days) || (chosenPlan === 'annual' ? 365 : (chosenPlan === 'vip' ? 3650 : 30));
    const expiresAt = isFree ? 0 : (Date.now() + durationDays * 24 * 60 * 60 * 1000);
    const fName = firstName || (fullName ? fullName.split(' ')[0] : 'Élève');
    const lName = lastName || (fullName ? fullName.split(' ').slice(1).join(' ') : '');
    const full = fullName || `${fName} ${lName}`.trim() || 'Élève';
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
      selectedClass: selectedClass || '3eme',
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
    const chosenPlan = plan || 'pro';
    const isFree = chosenPlan === 'free';
    const durationDays = isFree ? 0 : (Number(days) || (chosenPlan === 'annual' ? 365 : (chosenPlan === 'vip' ? 3650 : 30)));
    const durationMs = durationDays * 24 * 60 * 60 * 1000;
    const expiresAt = isFree ? 0 : (Date.now() + durationMs);

    const updateData = {
      isPremium: !isFree,
      plan: chosenPlan,
      premiumPlan: chosenPlan,
      premiumExpiresAt: expiresAt,
      subscriptionType: durationDays >= 300 ? 'yearly' : 'monthly',
      adminGranted: true,
      adminGrantReason: reason || (isFree ? 'Abonnement arrêté par l\'administrateur' : 'Attribué par l\'administrateur'),
      adminGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (isFree) {
      updateData.status = 'suspended';
      updateData.adminRevoked = true;
    } else {
      updateData.status = 'active';
      updateData.adminRevoked = false;
    }

    if (fullName) updateData.fullName = fullName;
    if (selectedClass) updateData.selectedClass = selectedClass;

    if (db) {
      await db.collection('users').doc(target).set(updateData, { merge: true });

      if (cleanTarget.length === 10) {
        await db.collection('users').doc(cleanTarget).set({
          ...updateData,
          whatsapp: cleanTarget,
          contact: cleanTarget
        }, { merge: true });

        const snap = await db.collection('users').where('whatsapp', '==', cleanTarget).get();
        const batch = db.batch();
        snap.forEach(doc => {
          batch.set(doc.ref, updateData, { merge: true });
        });
        await batch.commit();
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

// Santé du serveur
// --------------------------------------------------------------------------
// ROUTE 8 : CHATBOT IA VIA CODECRAFT API
// --------------------------------------------------------------------------
app.post('/api/ask-ai', limiter(15 * 60 * 1000, 30), async (req, res) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.slice(0, 4000) : '';
    if (!message) {
      return res.status(400).json({ error: "Message requis" });
    }

    const CODECRAFT_API_KEY = process.env.CODECRAFT_API_KEY;
    if (!CODECRAFT_API_KEY) {
      console.error('[Ask AI] CODECRAFT_API_KEY non configurée.');
      return res.status(503).json({ error: "Assistant IA non configuré sur ce serveur." });
    }

    const response = await fetch('https://codecraftapi.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CODECRAFT_API_KEY}`
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        messages: [
          { role: "system", content: "Tu es l'assistant virtuel officiel de ResumeCI..." },
          { role: "user", content: message }
        ],
        temperature: 0.7,
      })
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.choices?.[0]?.message) {
      console.error("[CodeCraft API] Erreur HTTP", response.status);
      return res.status(502).json({ error: "Erreur de communication avec l'IA CodeCraft" });
    }

    res.json({ success: true, reply: data.choices[0].message.content });
  } catch (error) {
    console.error("[Ask AI] Erreur interceptée:", error.message);
    res.status(500).json({ error: "Erreur interne de l'assistant IA" });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur ResumeCI actif sur http://0.0.0.0:${PORT}`);
});
