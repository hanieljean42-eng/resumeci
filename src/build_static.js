const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'Fiches_Resume');
const PUBLIC_DIR = path.join(ROOT, 'public');
const OUT_FICHES_DIR = path.join(PUBLIC_DIR, 'fiches');
const OUT_DATA_DIR = path.join(PUBLIC_DIR, 'data');
const SITE_URL = (process.env.SITE_URL || 'https://resumeci.me').replace(/\/$/, '');
const ALLOWED_SUBJECTS = {
  Terminale_D: ['Mathématiques', 'SVT', 'Physique - Chimie', 'Philosophie', 'Histoire - Géographie'],
  Terminale_A: ['Français', 'Anglais', 'Allemand', 'Mathématiques', 'Philosophie', 'Histoire - Géographie'],
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function stripHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function addCreatorCredit(html) {
  const credit = '<div style="text-align:center;color:#94a3b8;font-size:10px;margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb">Créé par <strong style="color:#64748b">Haniel_dev</strong></div>';
  if (html.includes('Créé par <strong style="color:#64748b">Haniel_dev</strong>')) return html;
  if (html.includes('</body>')) return html.replace('</body>', `${credit}</body>`);
  return `${html}${credit}`;
}

function addFicheSeo(html, meta) {
  const title = `${meta.name} — ${meta.subject} ${meta.cls.replace('_', ' ')} | ResumeCI`;
  const description = stripHtml(html).slice(0, 150) || `Fiche de résumé ${meta.name} en ${meta.subject} pour réviser le BAC en ${meta.cls.replace('_', ' ')}.`;
  const url = `${SITE_URL}${meta.url}`;
  const head = `<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index, follow"><link rel="canonical" href="${url}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:type" content="article"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE_URL}/og-image.svg"><script type="application/ld+json">${JSON.stringify({"@context":"https://schema.org","@type":"LearningResource",name:title,description,url,inLanguage:"fr-CI",learningResourceType:"Fiche de résumé",educationalLevel:meta.cls.replace('_',' '),about:meta.subject,creator:{"@type":"Person",name:"Haniel_dev",affiliation:{"@type":"CollegeOrUniversity",name:"Institut universitaire d'Abidjan"}}})}</script></head>`;
  if (/<head[\s\S]*?<\/head>/i.test(html)) return html.replace(/<head[\s\S]*?<\/head>/i, head);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, match => `${match}${head}`);
  return `<!DOCTYPE html><html lang="fr">${head}<body>${html}</body></html>`;
}

function copyHtmlFile(srcPath, destPath, meta) {
  const html = fs.readFileSync(srcPath, 'utf8');
  const withCredit = addCreatorCredit(html);
  fs.writeFileSync(destPath, meta ? addFicheSeo(withCredit, meta) : withCredit, 'utf8');
}

function copyDir(src, dest, cls = '', subject = '') {
  ensureDir(dest);
  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) copyDir(srcPath, destPath, cls || item, cls ? item : '');
    else if (item.endsWith('.html')) {
      const name = item.replace('Fiche_', '').replace('.html', '');
      const meta = cls && subject ? { cls, subject, file: item, name, url: `/fiches/${encodeURIComponent(cls)}/${encodeURIComponent(subject)}/${encodeURIComponent(item)}` } : null;
      copyHtmlFile(srcPath, destPath, meta);
    }
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
  const today = new Date().toISOString().split('T')[0];
  const mainPages = [
    { url: '/', priority: '1.0', changefreq: 'weekly' },
    { url: '/quiz.html', priority: '0.9', changefreq: 'weekly' },
    { url: '/flashcards.html', priority: '0.9', changefreq: 'weekly' },
    { url: '/faq.html', priority: '0.7', changefreq: 'monthly' },
    { url: '/about.html', priority: '0.5', changefreq: 'monthly' },
    { url: '/contact.html', priority: '0.5', changefreq: 'monthly' },
    { url: '/privacy.html', priority: '0.3', changefreq: 'yearly' },
    { url: '/sitemap.html', priority: '0.4', changefreq: 'weekly' },
  ];
  const ficheUrls = Object.values(structure).flatMap(subjects =>
    Object.values(subjects).flatMap(fiches => fiches.map(fiche => ({ url: fiche.url, priority: '0.8', changefreq: 'monthly' })))
  );
  const allUrls = [...mainPages, ...ficheUrls];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allUrls.map(u => `  <url>\n    <loc>${SITE_URL}${u.url}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')}\n</urlset>\n`;
  const robots = `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`;
  fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemap, 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DIR, 'robots.txt'), robots, 'utf8');
}

function generateHtmlSitemap(structure) {
  const sections = Object.entries(structure).map(([cls, subjects]) => `<h2>${escapeHtml(cls.replace('_', ' '))}</h2>${Object.entries(subjects).map(([subject, fiches]) => `<h3>${escapeHtml(subject)}</h3><ul>${fiches.map(fiche => `<li><a href="${fiche.url}">${escapeHtml(fiche.name)}</a></li>`).join('')}</ul>`).join('')}`).join('');
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Plan du site — ResumeCI</title><meta name="description" content="Plan du site ResumeCI : toutes les fiches de résumé Terminale A et Terminale D pour réviser le BAC en Côte d'Ivoire."><link rel="canonical" href="${SITE_URL}/sitemap.html"><style>body{font-family:Inter,Arial,sans-serif;background:#f8fafc;color:#1e293b;line-height:1.7;margin:0}main{max-width:980px;margin:auto;padding:28px 18px}a{color:#2563eb;text-decoration:none;font-weight:700}.card{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:24px;box-shadow:0 8px 30px rgba(15,23,42,.08)}h1{margin-top:0}h2{margin-top:28px;color:#0f172a}h3{color:#475569}li{margin:6px 0}</style></head><body><main><p><a href="/">← Retour à l'accueil</a></p><div class="card"><h1>Plan du site ResumeCI</h1><p>Toutes les fiches de résumé disponibles pour réviser le BAC en Côte d'Ivoire.</p>${sections}</div></main></body></html>`;
  fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.html'), html, 'utf8');
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
  generateHtmlSitemap(structure);

  console.log(`Static build complete: ${stats.totalFiches} fiches copied.`);
}

main();
