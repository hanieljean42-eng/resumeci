const fs = require('fs');
const path = require('path');

// Dossiers de fiches à nettoyer (on NE touche PAS Terminale ni 5eme)
const ROOT = path.join(__dirname, '..', 'Fiches_Resume');
const TARGET_CLASSES = ['6eme', '3eme', 'Seconde_A', 'Seconde_C'];

const FOOTER_SNIPPET = '<div class="footer">Créé par <strong>Haniel_dev</strong> — ResumeCI</div>';

function cleanFile(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  if (!html.includes(FOOTER_SNIPPET)) return false;

  const cleaned = html.replace(FOOTER_SNIPPET, '');
  if (cleaned !== html) {
    fs.writeFileSync(filePath, cleaned, 'utf8');
    return true;
  }
  return false;
}

function walkDir(dir, cb) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walkDir(full, cb);
    else if (stat.isFile() && full.endsWith('.html')) cb(full);
  }
}

function main() {
  let cleanedCount = 0;

  for (const cls of TARGET_CLASSES) {
    const baseDir = path.join(ROOT, cls);
    if (!fs.existsSync(baseDir)) continue;
    console.log(`🔍 Nettoyage des footers dans ${cls}...`);

    walkDir(baseDir, file => {
      if (cleanFile(file)) {
        cleanedCount++;
        console.log(`  ✅ Footer supprimé : ${path.relative(ROOT, file)}`);
      }
    });
  }

  console.log(`\n✅ Nettoyage terminé. Footers supprimés dans ${cleanedCount} fiche(s).`);
}

main();
