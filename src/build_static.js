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

function addCreatorCredit(html) {
  const credit = '<div style="text-align:center;color:#94a3b8;font-size:10px;margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb">Créé par <strong style="color:#64748b">Haniel_dev</strong></div>';
  if (html.includes('Créé par <strong style="color:#64748b">Haniel_dev</strong>')) return html;
  if (html.includes('</body>')) return html.replace('</body>', `${credit}</body>`);
  return `${html}${credit}`;
}

function copyHtmlFile(srcPath, destPath) {
  const html = fs.readFileSync(srcPath, 'utf8');
  fs.writeFileSync(destPath, addCreatorCredit(html), 'utf8');
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) copyDir(srcPath, destPath);
    else if (item.endsWith('.html')) copyHtmlFile(srcPath, destPath);
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

function generateSeoFiles(structure) {
  const siteUrl = (process.env.SITE_URL || 'https://resumeci.onrender.com').replace(/\/$/, '');
  const urls = [
    '/',
    '/quiz.html',
    '/flashcards.html',
    '/about.html',
    '/contact.html',
    '/privacy.html',
    ...Object.values(structure).flatMap(subjects =>
      Object.values(subjects).flatMap(fiches => fiches.map(fiche => fiche.url))
    ),
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${siteUrl}${url}</loc></url>`).join('\n')}\n</urlset>\n`;
  const robots = `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`;
  fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemap, 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DIR, 'robots.txt'), robots, 'utf8');
}

function generateSearchIndex(structure) {
  const entries = [];
  for (const [cls, subjects] of Object.entries(structure)) {
    for (const [subject, fiches] of Object.entries(subjects)) {
      for (const fiche of fiches) {
        const filePath = path.join(OUT_FICHES_DIR, cls, subject, fiche.file);
        const html = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
        const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1600);
        entries.push({ cls, subject, file: fiche.file, name: fiche.name, path: fiche.path, text });
      }
    }
  }
  fs.writeFileSync(path.join(OUT_DATA_DIR, 'search-index.json'), JSON.stringify(entries), 'utf8');
}

function main() {
  if (fs.existsSync(OUT_FICHES_DIR)) fs.rmSync(OUT_FICHES_DIR, { recursive: true, force: true });
  ensureDir(OUT_FICHES_DIR);
  ensureDir(OUT_DATA_DIR);

  copyDir(SOURCE_DIR, OUT_FICHES_DIR);
  const { structure, stats } = buildStructure();

  fs.writeFileSync(path.join(OUT_DATA_DIR, 'structure.json'), JSON.stringify(structure, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DATA_DIR, 'stats.json'), JSON.stringify(stats, null, 2), 'utf8');
  generateSearchIndex(structure);
  generateSeoFiles(structure);

  console.log(`Static build complete: ${stats.totalFiches} fiches copied.`);
}

main();
