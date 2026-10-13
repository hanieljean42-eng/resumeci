/**
 * Copie les fiches Premiere_D réutilisables vers Premiere_A / Premiere_C.
 * Pour chaque PDF de Cours_Premiere_{A,C} dont le hash existe dans le dossier
 * Premiere_D, on retrouve la fiche D correspondante (même contenu), on la copie
 * en remplaçant « Première D » par la classe cible.
 * Usage : node _copy_fiches_d.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const h = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const norm = s => s.replace(/\.(pdf|html)$/i, '').normalize('NFD')
  .replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const tail = s => norm(s).replace(/^(fiche_)?(lecon|l|maths_1[acd]_l?|svt_1ere_[a-z]_l?|1ere_[gh]?|ee|pl|eoi|s|cours)*/g, '');
const ficheName = pdf => 'Fiche_' + pdf.replace(/\.pdf$/i, '').replace(/ /g, '_').replace(/[^0-9A-Za-z_À-ɏ]/g, '_') + '.html';

const D = 'Cours_Premiere_D_ancien/PREMIERE D';
const dHash = {};
for (const f of fs.readdirSync(D).filter(x => x.endsWith('.pdf'))) dHash[h(path.join(D, f))] = f;

const fiches = [];
for (const m of fs.readdirSync('Fiches_Resume/Premiere_D')) {
  const md = 'Fiches_Resume/Premiere_D/' + m;
  if (fs.statSync(md).isDirectory())
    for (const f of fs.readdirSync(md)) fiches.push({ m, f, t: tail(f), p: path.join(md, f) });
}
const findFiche = dName => {
  const t = tail(dName);
  if (!t) return null;
  return fiches.find(x => x.t === t) || fiches.find(x => x.t.includes(t) || t.includes(x.t)) || null;
};

const SUB_MAP = {
  'Français': 'Francais', 'Histoire-Géographie': 'Histoire-Geographie',
  'Mathématiques': 'Mathematiques', 'Physique-Chimie': 'Physique-Chimie',
  'Sciences de la vie et de la terre': 'SVT', 'Philosophie': 'Philosophie',
  'Allemand': 'Allemand', 'Espagnol': 'Espagnol',
};

const TARGETS = { Cours_Premiere_A: 'Première A', Cours_Premiere_C: 'Première C' };
let copied = 0; const missed = [];

for (const [cls, label] of Object.entries(TARGETS)) {
  const destRoot = path.join('Fiches_Resume', cls.replace('Cours_', ''));
  for (const sub of fs.readdirSync(cls)) {
    const sd = path.join(cls, sub);
    if (!fs.statSync(sd).isDirectory()) continue;
    for (const f of fs.readdirSync(sd).filter(x => x.endsWith('.pdf'))) {
      const dName = dHash[h(path.join(sd, f))];
      const fiche = dName ? findFiche(dName) : null;
      if (!fiche) { missed.push(`${cls}/${sub}/${f}`); continue; }
      const destDir = path.join(destRoot, SUB_MAP[sub] || sub);
      fs.mkdirSync(destDir, { recursive: true });
      const html = fs.readFileSync(fiche.p, 'utf8')
        .replace(/Première D/g, label).replace(/Premiere_D/g, cls.replace('Cours_', ''))
        .replace(/MATHS[_ ]1D/g, 'MATHS 1' + label.slice(-1)).replace(/1ère D/g, '1ère ' + label.slice(-1));
      fs.writeFileSync(path.join(destDir, ficheName(f)), html);
      copied++;
    }
  }
}
console.log(`✅ ${copied} fiches copiées`);
console.log(`⚠️ ${missed.length} sans fiche D (à rédiger) :`);
missed.forEach(m => console.log('   ' + m));
