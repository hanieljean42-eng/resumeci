const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const adminModule = require('firebase-admin');
const admin = adminModule.default || adminModule;

let db = null;
try {
  let credential = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    credential = admin.credential.cert(sa);
  } else {
    const fs = require('fs');
    const saPath = path.join(__dirname, 'payment-api/firebase-admin.json');
    if (fs.existsSync(saPath)) {
      const sa = require(saPath);
      credential = admin.credential.cert(sa);
    }
  }
  if (credential) {
    admin.initializeApp({ credential });
    db = admin.firestore();
    console.log('✅ Firebase Admin connecté (Firestore)');
  }
} catch (e) {
  console.warn('⚠️ Firebase Admin non connecté:', e.message);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Charger .env si existant
try {
  const fs = require('fs');
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

// Clés d'API GeniusPay
const GENIUSPAY_PUBLIC_KEY = process.env.GENIUSPAY_PUBLIC_KEY || '';
const GENIUSPAY_SECRET_KEY = process.env.GENIUSPAY_SECRET_KEY || '';
const GENIUSPAY_API_URL = process.env.GENIUSPAY_API_URL || 'https://geniuspay.ci/api/v1/merchant/payments';

// Forfaits
const PLANS = {
  starter: { name: 'Starter (Mensuel)', price: 500, days: 30, available: true },
  pro: { name: 'Pro (Mensuel)', price: 1000, days: 30, available: true },
  annual: { name: 'Annuel (365 jours)', price: 10000, days: 365, available: true },
  elite: { name: 'Élite', price: 2000, days: 30, available: false }
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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
      webhook_url: 'https://resumeci-payment-api.onrender.com/api/webhook',
      callback_url: 'https://resumeci-payment-api.onrender.com/api/webhook',
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

// --------------------------------------------------------------------------
// ROUTE 2 : VÉRIFICATION DYNAMIQUE D'UN PAIEMENT (Appelée en continu pour Wave)
// --------------------------------------------------------------------------
app.get('/api/check-payment/:ref', async (req, res) => {
  try {
    const ref = req.params.ref;
    if (!ref) return res.status(400).json({ error: "Référence de transaction requise." });

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
      const result = await unlockUserInFirestore(uid, phone, tierKey, 30, {
        lastPaymentRef: ref,
        paymentAmount: amount,
        paymentMethod: pay.payment_method || 'wave'
      });

      return res.json({
        success: true,
        status: 'completed',
        tierKey: tierKey,
        isPremium: true,
        premiumExpiresAt: result ? result.expiresAt : (Date.now() + THIRTY_DAYS_MS),
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
    res.status(500).json({ error: "Erreur vérification paiement", details: err.message });
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

    if (reference) {
      try {
        const gpRes = await queryGeniusPayPayment(reference);
        if (gpRes.success && gpRes.data && (gpRes.data.status === 'completed' || gpRes.data.status === 'success')) {
          const pay = gpRes.data;
          const amt = Number(pay.amount) || 0;
          const actualTier = pay.metadata?.tierKey || tierKey || (amt >= 1000 ? 'pro' : 'starter');
          const unl = await unlockUserInFirestore(uid, pay.customer?.phone, actualTier, 30, {
            lastPaymentRef: reference,
            paymentAmount: amt,
            paymentMethod: pay.payment_method || 'wave'
          });
          return res.json({
            success: true,
            tierKey: actualTier,
            premiumExpiresAt: unl ? unl.expiresAt : (Date.now() + THIRTY_DAYS_MS),
            message: `Pass ${actualTier} activé avec succès.`
          });
        }
      } catch (err) {
        console.warn('[ConfirmPayment] Erreur vérification référence:', err.message);
      }
    }

    const actualTier = tierKey || 'starter';
    const expiresAt = Date.now() + THIRTY_DAYS_MS;

    console.log(`[Activation] Déblocage manuel/retour pour ${uid} : Pass ${actualTier} pour 30 jours`);

    await unlockUserInFirestore(uid, null, actualTier, 30);

    res.json({
      success: true,
      tierKey: actualTier,
      premiumExpiresAt: expiresAt,
      message: `Pass ${actualTier} activé avec succès pour 30 jours.`
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
    const event = req.body;
    console.log('[Webhook] Événement reçu de GeniusPay:', JSON.stringify(event));

    const isSuccess =
      (event && event.data && (event.data.status === 'success' || event.data.status === 'completed')) ||
      (event && event.status === 'success') ||
      (event && event.event === 'payment.successful');

    if (isSuccess) {
      const pay = event.data || event;
      const metadata = pay.metadata || {};
      const amount = Number(pay.amount) || 0;
      const tierKey = metadata.tierKey || (amount >= 1000 ? 'pro' : 'starter');
      const uid = metadata.uid || null;
      const phone = pay.customer?.phone || metadata.phone || null;
      const ref = pay.reference || null;

      console.log(`[Webhook] Déblocage automatique de ${uid || phone} pour le forfait ${tierKey} (30 jours)`);
      await unlockUserInFirestore(uid, phone, tierKey, 30, {
        lastPaymentRef: ref,
        paymentAmount: amount,
        paymentMethod: pay.payment_method || 'wave'
      });
      console.log("[Webhook] Profil Firestore mis à jour avec succès !");
    }

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
    const { uid, firstName, lastName, selectedClass, whatsapp, password, plan, isPremium, userAgent } = req.body;
    if (!whatsapp) {
      return res.status(400).json({ error: "Numéro WhatsApp obligatoire" });
    }
    const cleanWa = String(whatsapp).replace(/\D/g, '').slice(-10);
    const cleanPwd = String(password || '123456').trim();
    const userDoc = {
      uid: uid || ('user_' + Date.now()),
      firstName: (firstName || '').trim(),
      lastName: (lastName || '').trim(),
      fullName: `${firstName || ''} ${lastName || ''}`.trim() || 'Élève',
      selectedClass: selectedClass || 'Non précisé',
      whatsapp: cleanWa,
      contact: cleanWa,
      password: cleanPwd,
      plan: plan || 'free',
      isPremium: Boolean(isPremium && plan !== 'free'),
      createdAt: new Date().toISOString(),
      userAgent: userAgent || req.headers['user-agent'] || 'Web'
    };

    if (db) {
      try {
        await db.collection('users').doc(userDoc.uid).set(userDoc, { merge: true });
        await db.collection('users').doc(cleanWa).set(userDoc, { merge: true });
      } catch (err) {
        console.warn('[Register] Erreur Firestore:', err.message);
      }
    }
    res.json({ success: true, user: userDoc });
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

    if (db) {
      // 1. Recherche par numéro à 10 chiffres (doc ID)
      if (cleanPhone.length === 10) {
        try {
          const docSnap = await db.collection('users').doc(cleanPhone).get();
          if (docSnap.exists) {
            foundUser = { ...docSnap.data(), uid: docSnap.data().uid || docSnap.id };
          }
        } catch (e) {}
      }

      // 2. Recherche par UID (doc ID)
      if (!foundUser && rawUid) {
        try {
          const docSnap = await db.collection('users').doc(rawUid).get();
          if (docSnap.exists) {
            foundUser = { ...docSnap.data(), uid: docSnap.data().uid || docSnap.id };
          }
        } catch (e) {}
      }

      // 3. Recherche par champ whatsapp == cleanPhone
      if (!foundUser && cleanPhone.length === 10) {
        try {
          const qSnap = await db.collection('users').where('whatsapp', '==', cleanPhone).limit(1).get();
          if (!qSnap.empty) {
            const doc = qSnap.docs[0];
            foundUser = { ...doc.data(), uid: doc.data().uid || doc.id };
          }
        } catch (e) {}
      }

      // 4. Recherche par champ contact == cleanPhone
      if (!foundUser && cleanPhone.length === 10) {
        try {
          const qSnap = await db.collection('users').where('contact', '==', cleanPhone).limit(1).get();
          if (!qSnap.empty) {
            const doc = qSnap.docs[0];
            foundUser = { ...doc.data(), uid: doc.data().uid || doc.id };
          }
        } catch (e) {}
      }
    }

    if (!foundUser) {
      return res.status(404).json({ success: false, error: "Utilisateur non trouvé" });
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

    let foundUser = null;

    if (db) {
      // 1. Recherche directe par doc ID = numéro de téléphone
      try {
        const docSnap = await db.collection('users').doc(cleanPhone).get();
        if (docSnap.exists) {
          foundUser = { ...docSnap.data(), uid: docSnap.data().uid || docSnap.id };
        }
      } catch (e) {}

      // 2. Recherche par champ whatsapp == cleanPhone
      if (!foundUser) {
        try {
          const qSnap = await db.collection('users').where('whatsapp', '==', cleanPhone).limit(1).get();
          if (!qSnap.empty) {
            const doc = qSnap.docs[0];
            foundUser = { ...doc.data(), uid: doc.data().uid || doc.id };
          }
        } catch (e) {}
      }

      // 3. Recherche par champ contact == cleanPhone
      if (!foundUser) {
        try {
          const qSnap = await db.collection('users').where('contact', '==', cleanPhone).limit(1).get();
          if (!qSnap.empty) {
            const doc = qSnap.docs[0];
            foundUser = { ...doc.data(), uid: doc.data().uid || doc.id };
          }
        } catch (e) {}
      }

      // 4. Recherche dans la waitlist si l'utilisateur s'y était inscrit
      if (!foundUser) {
        try {
          const wSnap = await db.collection('waitlist').doc(cleanPhone).get();
          if (wSnap.exists) {
            foundUser = { ...wSnap.data(), uid: wSnap.data().uid || wSnap.id };
          }
        } catch (e) {}
      }
    }

    if (!foundUser) {
      return res.status(404).json({
        success: false,
        error: "Aucun compte trouvé avec ce numéro WhatsApp (+225 " + cleanPhone + "). Vérifie le numéro ou inscris-toi."
      });
    }

    // Vérification du mot de passe
    if (foundUser.password && String(foundUser.password).trim() !== password) {
      return res.status(401).json({
        success: false,
        error: "Mot de passe incorrect. Vérifie ta saisie ou contacte l'assistance."
      });
    }

    const now = Date.now();
    const expiresAt = Number(foundUser.premiumExpiresAt) || 0;
    const isPremium = Boolean(foundUser.isPremium && (expiresAt === 0 || expiresAt > now));
    const premiumPlan = isPremium ? (foundUser.premiumPlan || foundUser.plan || 'pro') : 'free';
    const effectiveExpiresAt = isPremium ? (expiresAt > now ? expiresAt : (now + 30 * 24 * 60 * 60 * 1000)) : 0;

    const fName = foundUser.firstName || (foundUser.fullName ? foundUser.fullName.split(' ')[0] : 'Élève');
    const lName = foundUser.lastName || (foundUser.fullName ? foundUser.fullName.split(' ').slice(1).join(' ') : '');
    const fullName = foundUser.fullName || `${fName} ${lName}`.trim() || 'Élève';

    const profile = {
      uid: foundUser.uid || `user_${cleanPhone}`,
      firstName: fName,
      lastName: lName,
      fullName: fullName,
      selectedClass: foundUser.selectedClass || foundUser.classe || '3eme',
      whatsapp: cleanPhone,
      phone: cleanPhone,
      password: foundUser.password || password,
      isPremium: isPremium,
      premiumPlan: premiumPlan,
      premiumExpiresAt: effectiveExpiresAt,
      subscriptionType: foundUser.subscriptionType || 'monthly',
      createdAt: foundUser.createdAt || new Date().toISOString()
    };

    console.log(`[Login] ✅ Connexion réussie pour ${fullName} (${cleanPhone}) - Pass: ${premiumPlan} (isPremium: ${isPremium})`);

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
          userMap.set(phone, { ...d, contact: phone, whatsapp: phone, id: doc.id });
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
    const uid = 'admin_user_' + Date.now();
    const fName = firstName || (fullName ? fullName.split(' ')[0] : 'Élève');
    const lName = lastName || (fullName ? fullName.split(' ').slice(1).join(' ') : '');
    const full = fullName || `${fName} ${lName}`.trim() || 'Élève';

    const userData = {
      uid,
      fullName: full,
      firstName: fName,
      lastName: lName,
      whatsapp: cleanPhone,
      contact: cleanPhone,
      selectedClass: selectedClass || '3eme',
      password: password || '123456',
      plan: chosenPlan,
      premiumPlan: chosenPlan,
      isPremium: !isFree,
      premiumExpiresAt: expiresAt,
      subscriptionType: durationDays >= 300 ? 'yearly' : 'monthly',
      adminCreated: true,
      adminGrantReason: reason || 'Compte créé par l\'administrateur (Accès accordé)',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (db) {
      await db.collection('users').doc(cleanPhone).set(userData, { merge: true });
      await db.collection('users').doc(uid).set(userData, { merge: true });
    }

    console.log(`[Admin CreateUser] ✅ Compte créé avec succès pour ${full} (${cleanPhone}) - Forfait: ${chosenPlan}`);
    res.json({ success: true, user: userData, message: `Compte ${full} créé avec succès.` });
  } catch (err) {
    console.error('[Admin CreateUser] Erreur:', err);
    res.status(500).json({ error: "Erreur création compte", details: err.message });
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
    res.status(500).json({ error: "Erreur attribution abonnement", details: err.message });
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
    res.status(500).json({ error: "Impossible de récupérer les transactions GeniusPay", details: err.message });
  }
});

// Santé du serveur
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur ResumeCI actif sur http://0.0.0.0:${PORT}`);
});
