const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '..', 'Fiches_Resume', 'Premiere_D', 'PREMIERE D');
const targetDir = path.join(__dirname, '..', 'Fiches_Resume', 'Premiere_D');

// Créer les dossiers de matière
const subjects = {
  'Mathematiques': ['MATHS'],
  'Physique-Chimie': ['LECON', 'LEÇON', 'leçon', 'CHAMP', 'CONDENSATEUR', 'LENTILLES', 'ETHANOL', 'ENERGIE'],
  'SVT': ['SVT'],
  'Histoire-Geographie': ['1ère G', '1ère H'],
  'Philosophie': ['Leçon'],
  'Francais': ['EE', 'PL', 'EXPRESSION', 'Savoir-faire']
};

// Créer les dossiers
Object.keys(subjects).forEach(subject => {
  const dir = path.join(targetDir, subject);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Lire les fichiers
const files = fs.readdirSync(sourceDir);

files.forEach(file => {
  const filePath = path.join(sourceDir, file);
  if (!fs.statSync(filePath).isFile()) return;

  let targetSubject = null;
  
  for (const [subject, keywords] of Object.entries(subjects)) {
    for (const keyword of keywords) {
      if (file.includes(keyword)) {
        targetSubject = subject;
        break;
      }
    }
    if (targetSubject) break;
  }

  if (targetSubject) {
    const destPath = path.join(targetDir, targetSubject, file);
    fs.renameSync(filePath, destPath);
    console.log(`✅ ${file} → ${targetSubject}`);
  } else {
    console.log(`⚠️ ${file} non classé`);
  }
});

console.log('🎉 Organisation terminée');
