const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const admin = require('firebase-admin');

let db = null;
try {
  let credential = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    credential = admin.credential.cert(sa);
  } else {
    const fs = require('fs');
    const saPath = path.join(__dirname, 'firebase-admin.json');
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
app.use(express.static(path.join(__dirname, '../public')));

// Charger .env si existant
try {
  const fs = require('fs');
  const envPath = fs.existsSync(path.join(__dirname, '.env')) ? path.join(__dirname, '.env') : path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(l => {
      const p = l.trim().split('=');
      if (p.length >= 2 && !p[0].startsWith('#') && !process.env[p[0].trim()]) {
        process.env[p[0].trim()] = p.slice(1).join('=').trim();
      }
    });
  }
} catch (e) {}

// Clés d'API GeniusPay (lues depuis l'environnement ou .env)
const GENIUSPAY_PUBLIC_KEY = process.env.GENIUSPAY_PUBLIC_KEY || '';
const GENIUSPAY_SECRET_KEY = process.env.GENIUSPAY_SECRET_KEY || '';
const GENIUSPAY_API_URL = process.env.GENIUSPAY_API_URL || 'https://geniuspay.ci/api/v1/merchant/payments';

// Forfaits mensuels (30 jours)
const PLANS = {
  starter: { name: 'Starter (Mensuel)', price: 500, available: true },
  pro: { name: 'Pro (Mensuel)', price: 1000, available: true },
  elite: { name: 'Élite', price: 2000, available: false } // Bloqué
};

// Durée de l'abonnement en millisecondes (30 jours)
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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
        error: "Cette formule (Professeur IA & Sujets d'examen) est actuellement en cours de finalisation. Veuillez choisir le Pack Starter (500F/mois) ou Pro (1000F/mois)."
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

    // Payload GeniusPay avec Côte d'Ivoire par défaut
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
      metadata: {
        uid: uid,
        tierKey: tierKey,
        type: 'monthly',
        method: chosenMethod
      },
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

// --------------------------------------------------------------------------
// ROUTE 2 : CONFIRMER ET DÉBLOQUER L'ABONNEMENT (Appelée au retour de paiement)
// --------------------------------------------------------------------------
app.post('/api/confirm-payment', async (req, res) => {
  try {
    const { uid, tierKey } = req.body;

    if (!uid || !tierKey || !['starter', 'pro'].includes(tierKey)) {
      return res.status(400).json({ error: "Paramètres manquants ou invalides" });
    }

    const expiresAt = Date.now() + THIRTY_DAYS_MS;

    console.log(`[Activation] Déblocage manuel/retour pour ${uid} : Pass ${tierKey} pour 30 jours (Expire le ${new Date(expiresAt).toLocaleDateString()})`);

    await db.collection('users').doc(uid).set({
      premiumPlan: tierKey,
      isPremium: true,
      premiumExpiresAt: expiresAt,
      subscriptionType: 'monthly',
      lastPaymentDate: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.json({
      success: true,
      tierKey: tierKey,
      premiumExpiresAt: expiresAt,
      message: `Pass ${tierKey} activé avec succès pour 30 jours.`
    });

  } catch (error) {
    console.error("[Activation] Erreur lors de la confirmation:", error);
    res.status(500).json({ error: "Erreur serveur lors de l'activation." });
  }
});

// --------------------------------------------------------------------------
// ROUTE 3 : WEBHOOK (GeniusPay serveur à serveur en production)
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
      const metadata = event.data?.metadata || event.metadata;

      if (metadata && metadata.uid && metadata.tierKey) {
        const { uid, tierKey } = metadata;
        const expiresAt = Date.now() + THIRTY_DAYS_MS;

        console.log(`[Webhook] Déblocage de ${uid} pour le forfait ${tierKey} (30 jours)`);

        await db.collection('users').doc(uid).set({
          premiumPlan: tierKey,
          isPremium: true,
          premiumExpiresAt: expiresAt,
          subscriptionType: 'monthly',
          lastPaymentDate: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        console.log("[Webhook] Profil Firestore mis à jour avec succès !");
      }
    }

    res.status(200).send('Webhook traité');
  } catch (error) {
    console.error("[Webhook] Erreur serveur Webhook:", error);
    res.status(500).send('Erreur serveur Webhook');
  }
});
// ROUTE 4 : ENREGISTREMENT ÉLÈVE
app.post('/api/register', async (req, res) => {
  try {
    const { uid, firstName, lastName, selectedClass, whatsapp, plan, isPremium, userAgent } = req.body;
    if (!whatsapp) {
      return res.status(400).json({ error: "Numéro WhatsApp obligatoire" });
    }
    const cleanWa = String(whatsapp).replace(/\D/g, '');
    const userDoc = {
      uid: uid || ('user_' + Date.now()),
      firstName: (firstName || '').trim(),
      lastName: (lastName || '').trim(),
      fullName: `${firstName || ''} ${lastName || ''}`.trim() || 'Élève',
      selectedClass: selectedClass || 'Non précisé',
      whatsapp: cleanWa,
      contact: cleanWa,
      plan: plan || 'free',
      isPremium: Boolean(isPremium && plan !== 'free'),
      createdAt: new Date().toISOString(),
      userAgent: userAgent || req.headers['user-agent'] || 'Web'
    };

    if (db) {
      try {
        await db.collection('users').doc(userDoc.uid).set(userDoc, { merge: true });
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

// ROUTE 4.5 : CONNEXION ÉLÈVE & RESTAURATION ABONNEMENT PAYÉ
app.post('/api/login', async (req, res) => {
  try {
    const { whatsapp, password } = req.body;
    if (!whatsapp) return res.status(400).json({ error: "Numéro WhatsApp obligatoire." });
    const cleanWa = String(whatsapp).replace(/\D/g, '').slice(-10);

    let foundUser = null;
    if (db) {
      const snap = await db.collection('users').get();
      snap.forEach(doc => {
        const data = doc.data();
        const dWa = String(data.whatsapp || data.contact || '').replace(/\D/g, '').slice(-10);
        if (dWa === cleanWa) {
          foundUser = { ...data, uid: data.uid || doc.id };
        }
      });
    }

    if (!foundUser) {
      return res.status(404).json({ error: "Aucun compte trouvé avec ce numéro WhatsApp." });
    }

    if (foundUser.password && password && foundUser.password !== password) {
      return res.status(401).json({ error: "Mot de passe incorrect." });
    }

    const now = Date.now();
    const expiresAt = Number(foundUser.premiumExpiresAt) || 0;
    const isPremium = Boolean(foundUser.isPremium && (expiresAt === 0 || expiresAt > now));
    const premiumPlan = isPremium ? (foundUser.premiumPlan || foundUser.plan || 'pro') : 'free';
    const effectiveExpiresAt = isPremium ? (expiresAt > now ? expiresAt : (now + THIRTY_DAYS_MS)) : 0;

    res.json({
      success: true,
      profile: {
        uid: foundUser.uid || ('user_' + Date.now()),
        firstName: foundUser.firstName || 'Élève',
        lastName: foundUser.lastName || '',
        selectedClass: foundUser.selectedClass || '3eme',
        whatsapp: cleanWa,
        password: password || foundUser.password || '',
        isPremium: isPremium,
        premiumPlan: premiumPlan,
        premiumExpiresAt: effectiveExpiresAt,
        subscriptionType: foundUser.subscriptionType || 'monthly'
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Erreur connexion" });
  }
});

// ROUTE 5 : API ADMIN UTILISATEURS
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = [];
    if (db) {
      const snap = await db.collection('users').get();
      snap.forEach(doc => users.push(doc.data()));
    }
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ error: "Erreur admin" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur ResumeCI actif sur http://0.0.0.0:${PORT}`);
});
