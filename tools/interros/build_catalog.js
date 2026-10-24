// Construit le catalogue des interros et copie les PDF vers payment-api/interros/.
// Usage : node tools/interros/build_catalog.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SPECS_DIR = path.join(__dirname, 'specs');
const PDF_DIR = path.join(ROOT, '_interros');
const DEST_DIR = path.join(ROOT, 'payment-api', 'interros');

const TYPE_LABELS = { interro: 'Interrogation', devoir: 'Devoir surveillé', bac: 'Examen type BAC', bepc: 'BEPC blanc', td: 'TD corrigé', partiel: "Sujet d'examen corrigé" };

const catalog = [];
for (const f of fs.readdirSync(SPECS_DIR).filter(f => f.endsWith('.json')).sort()) {
  const spec = JSON.parse(fs.readFileSync(path.join(SPECS_DIR, f), 'utf8'));
  const hasCorr = spec.exercices.some(e => e.correction);
  for (const part of ['enonce', ...(hasCorr ? ['corrige'] : [])]) {
    const src = path.join(PDF_DIR, `${spec.code}_${part}.pdf`);
    if (!fs.existsSync(src)) { console.error(`MANQUANT ${src} — lancer render_interro.js`); process.exitCode = 1; continue; }
    fs.mkdirSync(DEST_DIR, { recursive: true });
    fs.copyFileSync(src, path.join(DEST_DIR, `${spec.code}_${part}.pdf`));
  }
  const classes = spec.classes || [spec.classe_key || spec.classe.replace(/ /g, '_')];
  for (const cls of classes) {
    catalog.push({
      code: spec.code,
      type: spec.type,
      typeLabel: TYPE_LABELS[spec.type] || spec.type,
      matiere: spec.matiere,
      classe: cls,
      classeLabel: spec.classe,
      duree: spec.duree,
      bareme: spec.bareme,
      chapitre: spec.chapitre || '',
      exercices: spec.exercices.length,
      corrige: hasCorr
    });
  }
}

fs.mkdirSync(DEST_DIR, { recursive: true });
fs.writeFileSync(path.join(DEST_DIR, 'catalog.json'), JSON.stringify(catalog, null, 2));
console.log(`OK catalogue : ${catalog.length} documents → payment-api/interros/`);
