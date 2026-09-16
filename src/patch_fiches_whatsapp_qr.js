/**
 * Ajoute le QR WhatsApp sur toutes les fiches HTML existantes (source + public)
 * Usage: node src/patch_fiches_whatsapp_qr.js
 */
const fs = require('fs');
const path = require('path');
const { injectWhatsappQr, QR_MARKER } = require('./fiche_whatsapp_qr');

const ROOT = path.join(__dirname, '..');
const DIRS = [
  path.join(ROOT, 'Fiches_Resume'),
  path.join(ROOT, 'public', 'fiches'),
];

function walkHtml(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkHtml(full, out);
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

let updated = 0;
let skipped = 0;

for (const dir of DIRS) {
  for (const file of walkHtml(dir)) {
    const raw = fs.readFileSync(file, 'utf8');
    if (raw.includes(QR_MARKER)) {
      skipped++;
      continue;
    }
    fs.writeFileSync(file, injectWhatsappQr(raw), 'utf8');
    updated++;
  }
}

console.log(`✅ Fiches mises à jour : ${updated}`);
console.log(`⏭️  Déjà présentes : ${skipped}`);
