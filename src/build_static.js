const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'Fiches_Resume');
const PUBLIC_DIR = path.join(ROOT, 'public');
const OUT_FICHES_DIR = path.join(PUBLIC_DIR, 'fiches');
const OUT_DATA_DIR = path.join(PUBLIC_DIR, 'data');
const ALLOWED_SUBJECTS = {
  Terminale_D: ['Mathématiques', 'SVT', 'Physique - Chimie', 'Philosophie', 'Histoire - Géographie'],
  Terminale_A: ['Français', 'Anglais', 'Allemand', 'Mathématiques', 'Philosophie', 'Histoire - Géographie'],
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) copyDir(srcPath, destPath);
    else if (item.endsWith('.html')) fs.copyFileSync(srcPath, destPath);
  }
}

function buildStructure() {
  const structure = {};
  let totalFiches = 0;
  const classStats = {};

  if (!fs.existsSync(SOURCE_DIR)) return { structure, stats: { totalFiches: 0, totalPdfs: 0, classStats: {} } };

  for (const cls of fs.readdirSync(SOURCE_DIR)) {
    const clsDir = path.join(SOURCE_DIR, cls);
    if (!fs.statSync(clsDir).isDirectory() || !ALLOWED_SUBJECTS[cls]) continue;

    structure[cls] = {};
    classStats[cls] = { subjects: 0, fiches: 0, pdfs: 0 };

    for (const subject of fs.readdirSync(clsDir)) {
      const subDir = path.join(clsDir, subject);
      if (!fs.statSync(subDir).isDirectory() || !ALLOWED_SUBJECTS[cls].includes(subject)) continue;

      const fiches = fs.readdirSync(subDir)
        .filter(file => file.endsWith('.html'))
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .map(file => ({
          file,
          name: file.replace('Fiche_', '').replace('.html', ''),
          path: `${cls}/${subject}/${file}`,
          url: `/fiches/${encodeURIComponent(cls)}/${encodeURIComponent(subject)}/${encodeURIComponent(file)}`,
        }));

      structure[cls][subject] = fiches;
      classStats[cls].subjects++;
      classStats[cls].fiches += fiches.length;
      totalFiches += fiches.length;
    }
  }

  return { structure, stats: { totalFiches, totalPdfs: 0, classStats } };
}

function main() {
  if (fs.existsSync(OUT_FICHES_DIR)) fs.rmSync(OUT_FICHES_DIR, { recursive: true, force: true });
  ensureDir(OUT_FICHES_DIR);
  ensureDir(OUT_DATA_DIR);

  copyDir(SOURCE_DIR, OUT_FICHES_DIR);
  const { structure, stats } = buildStructure();

  fs.writeFileSync(path.join(OUT_DATA_DIR, 'structure.json'), JSON.stringify(structure, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DATA_DIR, 'stats.json'), JSON.stringify(stats, null, 2), 'utf8');

  console.log(`Static build complete: ${stats.totalFiches} fiches copied.`);
}

main();
