const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'Fiches_Resume');
const PUBLIC_DIR = path.join(ROOT, 'public');
const OUT_FICHES_DIR = path.join(PUBLIC_DIR, 'fiches');
const OUT_DATA_DIR = path.join(PUBLIC_DIR, 'data');
const SITE_URL = (process.env.SITE_URL || 'https://resumeci.me').replace(/\/$/, '');
const ALLOWED_SUBJECTS = {
  '6eme': ['Anglais', 'EDHC', 'Francais', 'Histoire-Geographie', 'Mathematiques', 'Physique-Chimie', 'SVT', 'TIC'],
  '5eme': ['Mathematiques', 'SVT', 'EDHC', 'Histoire-Geographie', 'Physique-Chimie', 'Technologie', 'Francais'],
  '3eme': ['EDHC', 'EPS', 'Francais', 'Histoire-Geographie', 'Mathematiques', 'Physique-Chimie', 'SVT', 'TIC'],
  Seconde_A: ['Francais', 'Histoire-Geographie', 'Mathematiques', 'Physique-Chimie', 'SVT'],
  Seconde_C: ['Francais', 'Histoire-Geographie', 'Mathematiques', 'Physique-Chimie', 'SVT'],
  Terminale_C: ['Mathématiques', 'Physique - Chimie'], // ← TES DOSSIERS Terminale_C
  Terminale_D: ['Français', 'Mathématiques', 'SVT', 'Physique - Chimie', 'Philosophie', 'Histoire - Géographie'],
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

function getLessonMetaFromFile(file) {
  const base = file.replace('Fiche_', '').replace('.html', '');
  const normalized = base.replace(/\s+/g, ' ');

  let name = base
    .replace(/_/g, ' ')
    .replace(/Lecon(\d)/gi, 'Leçon $1')
    .replace(/^L(\d)/i, 'Leçon $1');
  let order = 3000;

  // Collège / Seconde : "Lecon10_...", "Leçon 3 ...", "L1_..."
  let m = normalized.match(/^(?:Lecon|Leçon|L)\s*0*(\d+)[ _-]*(.*)/i);
  if (m) {
    const num = parseInt(m[1], 10) || 0;
    const rest = (m[2] || '').replace(/_/g, ' ').trim();
    name = `Leçon ${num}${rest ? ' — ' + rest : ''}`;
    order = 1000 + num;
    return { name, order };
  }

  // Collège Français: "S11_..." (Séance)
  m = normalized.match(/^S\s*0*(\d+)[ _-]*(.*)/i);
  if (m) {
    const num = parseInt(m[1], 10) || 0;
    const rest = (m[2] || '').replace(/_/g, ' ').trim();
    name = `Séance ${num}${rest ? ' — ' + rest : ''}`;
    order = 2000 + num;
    return { name, order };
  }

  // Terminale Histoire / Géographie: "GEOGRAPHIE T1 L1_ ...", "HISTOIRE T2 L3_ ..."
  m = normalized.match(/^(?:GEOGRAPHIE|HISTOIRE)\s*T\s*0*(\d+)\s*L\s*0*(\d+)[ _-]*(.*)/i);
  if (m) {
    const theme = parseInt(m[1], 10) || 0;
    const lesson = parseInt(m[2], 10) || 0;
    const rest = (m[3] || '').replace(/_/g, ' ').trim();
    name = `Thème ${theme} — Leçon ${lesson}${rest ? ' — ' + rest : ''}`;
    // On place les Terminales après les leçons classiques mais avec ordre interne clair
    order = 4000 + theme * 100 + lesson;
    return { name, order };
  }

  // Terminale D Maths: fichiers déjà nommés "Fiche_leçon 01 ..." → on garde le nom mais on essaie de détecter le numéro
  m = normalized.match(/^leçon\s*0*(\d+)/i);
  if (m) {
    const num = parseInt(m[1], 10) || 0;
    order = 5000 + num;
    // name est déjà correctement formaté plus haut (avec accents)
    return { name, order };
  }

  return { name, order };
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
  const today = new Date().toISOString().split('T')[0];
  const breadcrumb = {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"ResumeCI","item":SITE_URL},{"@type":"ListItem","position":2,"name":meta.cls.replace('_',' '),"item":`${SITE_URL}/#${meta.cls}`},{"@type":"ListItem","position":3,"name":meta.subject,"item":`${SITE_URL}/#${meta.cls}/${meta.subject}`},{"@type":"ListItem","position":4,"name":meta.name,"item":url}]};
  const article = {"@context":"https://schema.org","@type":"Article","headline":title,"description":description,"url":url,"datePublished":today,"dateModified":today,"author":{"@type":"Person","name":"Haniel_dev"},"publisher":{"@type":"Organization","name":"ResumeCI","url":SITE_URL},"inLanguage":"fr-CI","educationalLevel":meta.cls.replace('_',' '),"about":meta.subject,"learningResourceType":"Fiche de résumé"};
  const head = `<head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><title>${escapeHtml(title)}</title><meta name=\"description\" content=\"${escapeHtml(description)}\"><meta name=\"robots\" content=\"index, follow\"><link rel=\"canonical\" href=\"${url}\"><link rel=\"alternate\" hreflang=\"fr-CI\" href=\"${url}\"><link rel=\"alternate\" hreflang=\"x-default\" href=\"${url}\"><meta property=\"og:title\" content=\"${escapeHtml(title)}\"><meta property=\"og:description\" content=\"${escapeHtml(description)}\"><meta property=\"og:type\" content=\"article\"><meta property=\"og:url\" content=\"${url}\"><meta property=\"og:image\" content=\"${SITE_URL}/og-image.png\"><script type=\"application/ld+json\">${JSON.stringify(breadcrumb)}</script><script type=\"application/ld+json\">${JSON.stringify(article)}</script></head>`;
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
      const lessonMeta = getLessonMetaFromFile(item);
      const meta = cls && subject ? { cls, subject, file: item, name: lessonMeta.name, url: `/fiches/${encodeURIComponent(cls)}/${encodeURIComponent(subject)}/${encodeURIComponent(item)}` } : null;
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
        .map(file => {
          const lessonMeta = getLessonMetaFromFile(file);
          return {
            file,
            name: lessonMeta.name,
            order: lessonMeta.order,
            path: `${cls}/${subject}/${file}`,
            url: `/fiches/${encodeURIComponent(cls)}/${encodeURIComponent(subject)}/${encodeURIComponent(file)}`,
          };
        })
        .sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          return a.name.localeCompare(b.name, 'fr');
        });

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
    // Landing pages
    { url: '/fiches-bac-ci.html', priority: '0.8', changefreq: 'monthly' },
    { url: '/fiches-terminale-d.html', priority: '0.8', changefreq: 'monthly' },
    { url: '/fiches-bepc-ci.html', priority: '0.7', changefreq: 'monthly' },
    { url: '/fiches-college-ci.html', priority: '0.6', changefreq: 'monthly' },
  ];
  const ficheUrls = Object.values(structure).flatMap(subjects =>
    Object.values(subjects).flatMap(fiches => fiches.map(fiche => ({ url: fiche.url, priority: '0.8', changefreq: 'monthly' })))
  );
  const allUrls = [...mainPages, ...ficheUrls];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allUrls.map(u => `  <url>\n    <loc>${SITE_URL}${u.url}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')}\n</urlset>\n`;
  const robots = `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\nDisallow: /sitemap.html\n`;
  fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemap, 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DIR, 'robots.txt'), robots, 'utf8');
}

function generateHtmlSitemap(structure) {
  const sections = Object.entries(structure).map(([cls, subjects]) => `<h2>${escapeHtml(cls.replace('_', ' '))}</h2>${Object.entries(subjects).map(([subject, fiches]) => `<h3>${escapeHtml(subject)}</h3><ul>${fiches.map(fiche => `<li><a href="${fiche.url}">${escapeHtml(fiche.name)}</a></li>`).join('')}</ul>`).join('')}`).join('');
  const html = `<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><meta name=\"robots\" content=\"noindex, follow\"><title>Plan du site — ResumeCI</title><meta name=\"description\" content=\"Plan du site ResumeCI : toutes les fiches de résumé Terminale A et Terminale D pour réviser le BAC en Côte d'Ivoire.\"><link rel=\"canonical\" href=\"${SITE_URL}/sitemap.html\"><style>body{font-family:Inter,Arial,sans-serif;background:#f8fafc;color:#1e293b;line-height:1.7;margin:0}main{max-width:980px;margin:auto;padding:28px 18px}a{color:#2563eb;text-decoration:none;font-weight:700}.card{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:24px;box-shadow:0 8px 30px rgba(15,23,42,.08)}h1{margin-top:0}h2{margin-top:28px;color:#0f172a}h3{color:#475569}li{margin:6px 0}</style></head><body><main><p><a href=\"/\">← Retour à l'accueil</a></p><div class=\"card\"><h1>Plan du site ResumeCI</h1><p>Toutes les fiches de résumé disponibles pour réviser le BAC en Côte d'Ivoire.</p>${sections}</div></main></body></html>`;
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

function injectIndexSeoBlock(structure, stats) {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) return;
  const html = fs.readFileSync(indexPath, 'utf8');

  const subjectIntros = {
    'Mathématiques': 'fonctions, limites, dérivées, primitives, suites numériques, exponentielles, logarithmes, nombres complexes, probabilités et statistiques',
    'SVT': 'tissu nerveux, fonctionnement du cœur, muscle squelettique, immunité, VIH, reproduction, génétique, hérédité',
    'Physique - Chimie': 'cinématique, dynamique, loi de Laplace, induction électromagnétique, alcools, acides aminés, dosage, pH, oscillations',
    'Philosophie': 'dissertation, conscience, inconscient, liberté, vérité, science, langage, État, politique, morale',
    'Histoire - Géographie': 'ONU, guerre froide, décolonisation, Côte d\'Ivoire, CEDEAO, Union Africaine, Corée du Sud, Algérie',
    'Français': 'dissertation, commentaire, figures de style, analyse littéraire',
    'Anglais': 'grammaire, vocabulaire, compréhension, expression écrite',
    'Allemand': 'grammaire, vocabulaire, compréhension, expression écrite',
  };

  const subjectSections = [];
  for (const [cls, subjects] of Object.entries(structure)) {
    const clsLabel = cls.replace('_', ' ');
    for (const [subject, fiches] of Object.entries(subjects)) {
      if (!fiches.length) continue;
      const intro = subjectIntros[subject] || 'leçons et résumés du programme';
      const links = fiches.map(f => `<li><a href="${f.url}">${escapeHtml(f.name)}</a></li>`).join('');
      subjectSections.push(
        `<article><h3>${escapeHtml(subject)} — ${escapeHtml(clsLabel)}</h3>` +
        `<p>Fiches de résumé et cours de ${escapeHtml(subject)} pour la ${escapeHtml(clsLabel)} au BAC ivoirien : ${intro}.</p>` +
        `<ul>${links}</ul></article>`
      );
    }
  }

  const block = `<!-- SEO_BLOCK_START -->
<aside class="seo-static" aria-label="Plan détaillé du site">
  <style>.seo-static{max-width:1100px;margin:0 auto;padding:48px 20px;background:#f8fafc;color:#1e293b;font-family:Inter,Arial,sans-serif;line-height:1.7}.seo-static h2{font-size:24px;margin:0 0 12px;color:#0f172a}.seo-static h3{font-size:17px;margin:24px 0 8px;color:#1d4ed8}.seo-static p{font-size:14px;color:#475569;margin:6px 0}.seo-static ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:6px;list-style:none;padding:0;margin:8px 0}.seo-static li{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px}.seo-static a{color:#2563eb;text-decoration:none;font-weight:600}.seo-static a:hover{text-decoration:underline}.seo-static .seo-intro{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px;margin-bottom:18px}.seo-static nav a{color:#475569;margin-right:14px;font-weight:600}</style>
  <div class="seo-intro">
    <h2>ResumeCI — Fiches de résumé pour le BAC en Côte d'Ivoire</h2>
    <p>ResumeCI est une plateforme gratuite de révision pour les élèves de Terminale A et Terminale D en Côte d'Ivoire. Retrouvez ${stats.totalFiches} fiches de résumé en Mathématiques, SVT, Physique-Chimie, Philosophie et Histoire-Géographie, ainsi que des quiz gamifiés (QCM, Vrai/Faux, Quiz des dates) et des flashcards à répétition espacée pour préparer efficacement le baccalauréat ivoirien.</p>
    <p>Cours BAC Côte d'Ivoire, résumé Terminale D, fiches Terminale A, programme BAC ivoirien, révision baccalauréat Côte d'Ivoire, exercices BAC CI, annales BAC CI, quiz BAC, flashcards BAC.</p>
    <nav><a href="/quiz.html">Quiz BAC</a><a href="/flashcards.html">Flashcards</a><a href="/sitemap.html">Plan du site</a><a href="/about.html">À propos</a><a href="/faq.html">FAQ</a><a href="/contact.html">Contact</a></nav>
  </div>
  ${subjectSections.join('\n  ')}
</aside>
<!-- SEO_BLOCK_END -->`;

  const updated = html.replace(/<!-- SEO_BLOCK_START -->[\s\S]*?<!-- SEO_BLOCK_END -->/, block);
  fs.writeFileSync(indexPath, updated, 'utf8');
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
  // SEO block injection disabled

  console.log(`Static build complete: ${stats.totalFiches} fiches copied.`);
}

main();
