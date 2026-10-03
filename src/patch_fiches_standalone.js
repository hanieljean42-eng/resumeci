// Ajoute la feuille de style + le script "standalone" à toutes les fiches HTML (idempotent).
// Usage : node src/patch_fiches_standalone.js
const fs = require('fs');
const path = require('path');

const FICHES_DIR = path.join(__dirname, '..', 'public', 'fiches');
const STANDALONE_TAGS = '<link rel="stylesheet" href="/fiche-standalone.css?v=1"><script src="/fiche-standalone.js?v=1"></script>';
const OLD_FIREBASE_TAG = /<script type="module" src="\/firebase-config\.js(\?v=[\d.]+)?"><\/script>/;
const EXISTING_TAGS = /<link rel="stylesheet" href="\/fiche-standalone\.css[^"]*"><script src="\/fiche-standalone\.js[^"]*"><\/script>/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

let patched = 0, skipped = 0;
for (const file of walk(FICHES_DIR)) {
  const html = fs.readFileSync(file, 'utf8');
  let next = html.replace(EXISTING_TAGS, '').replace(OLD_FIREBASE_TAG, '');
  if (!next.includes('</head>')) { skipped++; continue; }
  next = next.replace('</head>', STANDALONE_TAGS + '</head>');
  if (next !== html) { fs.writeFileSync(file, next); patched++; } else skipped++;
}
console.log(`Fiches patchées : ${patched}, inchangées/ignorées : ${skipped}`);
