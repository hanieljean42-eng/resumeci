// Réconciliation : toutes les transactions GeniusPay complétées non traitées
// -> appelle /api/check-payment en production pour chacune (idempotent).
const fs = require('fs');
const https = require('https');
const env = fs.readFileSync('C:/Users/DJEBLE/OneDrive/Desktop/CIRESUME/resumeci/payment-api/.env', 'utf8');
const E = {};
env.split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) E[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); });
const GP = E.GENIUSPAY_API_URL || 'https://geniuspay.ci/api/v1/merchant/payments';
const API = 'https://resumeci-payment-api.onrender.com';
const EXEC = process.argv.includes('--exec');

const gpGet = url => new Promise((res, rej) => {
  https.get(url, { family: 4, headers: { 'X-API-Key': E.GENIUSPAY_PUBLIC_KEY, 'X-API-Secret': E.GENIUSPAY_SECRET_KEY }, timeout: 30000 }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej).on('timeout', function () { this.destroy(new Error('timeout')); });
});
const apiGet = url => new Promise((res, rej) => {
  https.get(url, { family: 4, timeout: 60000 }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej).on('timeout', function () { this.destroy(new Error('timeout')); });
});
const { createRequire } = require('module');
const rq = createRequire('C:/Users/DJEBLE/OneDrive/Desktop/CIRESUME/resumeci/payment-api/package.json');
const { initializeApp, cert } = rq('firebase-admin/app');
const fsMod = rq('firebase-admin/firestore');
initializeApp({ credential: cert(require('C:/Users/DJEBLE/OneDrive/Desktop/CIRESUME/resumeci/payment-api/firebase-admin.json')) });
const db = fsMod.getFirestore();

(async () => {
  const processed = new Set((await db.collection('payments').get()).docs.map(d => d.id));
  console.log(`${processed.size} paiements déjà enregistrés: ${[...processed].join(', ') || 'aucun'}`);

  // Paginer toutes les transactions GeniusPay
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const j = await gpGet(`${GP}?page=${page}&per_page=50`).catch(() => null);
    const arr = j?.data?.data || j?.data || [];
    if (!Array.isArray(arr) || !arr.length) break;
    all.push(...arr);
    if (arr.length < 50) break;
  }
  console.log(`${all.length} transactions GeniusPay au total`);

  const done = all.filter(p => p.status === 'completed' || p.status === 'success');
  const todo = done.filter(p => !processed.has(p.reference));
  console.log(`${done.length} complétées, ${todo.length} NON traitées à réconcilier\n`);

  for (const p of todo) {
    const det = await gpGet(`${GP}/${p.reference}`).catch(() => null);
    const pay = det?.data || {};
    const meta = pay.metadata || {};
    console.log(`--- ${p.reference} | ${pay.amount || p.amount} F | ${meta.tierKey || '?'} | uid=${meta.uid || '?'} | tel=${pay.customer?.phone || meta.customerPhone || '?'} | statut=${pay.status}`);
    if (!EXEC) continue;
    try {
      const r = await apiGet(`${API}/api/check-payment/${p.reference}`);
      console.log(`    => API: ${JSON.stringify(r).slice(0, 220)}`);
    } catch (e) { console.log(`    => API ERREUR: ${e.message}`); }
  }
  if (!EXEC) console.log('\nMode dry-run. Relance avec --exec pour activer les comptes.');
  process.exit(0);
})();
