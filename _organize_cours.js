/**
 * Réorganisation des PDF locaux par matière + dédoublonnage SHA-1.
 * Source (intacte) : Cours_Premiere_D_ancien/<CLASSE>/*.pdf
 * Destinations     : Cours_Premiere_A/<Matière>/, Cours_Premiere_C/<Matière>/
 * Usage : node _organize_cours.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC = 'Cours_Premiere_D_ancien';
const TC_PDF_REAL_NAME = 'LEÇON 13_ NOMBRES COMPLEXES ET GEOMETRIE DU PLAN (Tle C).pdf';
const TC_DEST = path.join('Cours_Terminale_C', 'Mathématiques');

// Ordre important : première règle qui matche gagne.
const CLASSES = {
  'PREMIERE A': {
    dest: 'Cours_Premiere_A',
    subjects: [
      ['Allemand', [/^LECON \d+ FICHE \d+/i]],
      ['Espagnol', [/^(L\d+ |Cours_ESP_)/i]],
      ['Français', [/^(EE |EOI|PL|Savoir-faire|GT)/i]],
      ['Histoire-Géographie', [/^1ère/i]],
      ['Mathématiques', [/^MATHS_1A/i]],
      ['Philosophie', [/^Leçon \d+_[LP]/i]],
      ['Sciences de la vie et de la terre', [/^SVT 1ère A/i]],
    ],
  },
  'PREMIERE C': {
    dest: 'Cours_Premiere_C',
    subjects: [
      ['Histoire-Géographie', [/^1ère [GH]/i]],
      ['Mathématiques', [/^(MATHS_1C|Cours_MATHS_1C)/i]],
      ['TICE', [/^Cours_TICE_1C/i]],
      ['Philosophie', [/^Leçon \d+_[LP]/i]],
      ['Français', [/^(EE |EOI|PL|Savoir-faire|GT)/i]],
      ['Sciences de la vie et de la terre', [/^SVT 1ère C/i]],
      ['Physique-Chimie', [/^(lecon|leçon)/i]], // attrape LECON/LEÇON/leçon
    ],
  },
};

const sha1 = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const report = {};
const tcHash = sha1(path.join(SRC, 'PREMIERE C', 'Cours_MATHS_1C_18.pdf'));
let tcSaved = false;

for (const [classe, cfg] of Object.entries(CLASSES)) {
  const srcDir = path.join(SRC, classe);
  const seen = {}; // hash -> {subject, file}
  const r = { matieres: {}, doublons: [], tcMauvaisPDF: [], nonClasses: [] };

  for (const file of fs.readdirSync(srcDir).filter(f => f.endsWith('.pdf'))) {
    const full = path.join(srcDir, file);
    const hash = sha1(full);

    // Le faux PDF (maths Tle C) : une seule copie conservée dans Cours_Terminale_C
    if (tcHash && hash === tcHash) {
      r.tcMauvaisPDF.push(file);
      if (!tcSaved) {
        fs.mkdirSync(TC_DEST, { recursive: true });
        fs.copyFileSync(full, path.join(TC_DEST, TC_PDF_REAL_NAME));
        tcSaved = true;
      }
      continue;
    }

    if (seen[hash]) { r.doublons.push(`${file}  ==  ${seen[hash]}`); continue; }

    let subject = null;
    for (const [name, patterns] of cfg.subjects) {
      if (patterns.some(p => p.test(file))) { subject = name; break; }
    }
    if (!subject) {
      r.nonClasses.push(file);
      subject = '_a_classer';
    }

    const destDir = path.join(cfg.dest, subject);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(full, path.join(destDir, file));
    seen[hash] = `${subject}/${file}`;
    r.matieres[subject] = (r.matieres[subject] || 0) + 1;
  }
  report[classe] = r;
}

console.log(JSON.stringify(report, null, 2));
