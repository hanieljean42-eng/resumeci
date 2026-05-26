const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'Resumes_5eme');
const PUBLIC_DIR = path.join(ROOT, 'public');
const OUT_FICHES_DIR = path.join(PUBLIC_DIR, 'fiches_5eme');
const OUT_DATA_DIR = path.join(PUBLIC_DIR, 'data_5eme');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function stripHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Convert Markdown fiche to HTML
function markdownToHtml(mdContent, meta) {
  const htmlContent = marked(mdContent);
  
  const css = `
    body { font-family: Inter, system-ui, -apple-system, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.7; margin: 0; padding: 20px; }
    .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    h1 { color: #0f172a; border-bottom: 3px solid #3b82f6; padding-bottom: 12px; }
    h2 { color: #1e40af; margin-top: 32px; }
    h3 { color: #334155; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    td, th { border: 1px solid #e2e8f0; padding: 12px; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; }
    blockquote { border-left: 4px solid #3b82f6; margin: 20px 0; padding: 12px 20px; background: #f8fafc; font-style: italic; }
    code { background: #f1f5f9; padding: 2px 8px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 0.9em; }
    ul { padding-left: 24px; }
    li { margin: 8px 0; }
    hr { border: none; border-top: 2px solid #e2e8f0; margin: 32px 0; }
    .back-link { display: inline-block; margin-bottom: 20px; color: #3b82f6; text-decoration: none; font-weight: 500; }
    .back-link:hover { text-decoration: underline; }
    .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
  `;
  
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(meta.name)} — ${escapeHtml(meta.subject)} 5ème | ResumeCI</title>
  <meta name="description" content="Fiche de résumé ${escapeHtml(meta.name)} en ${escapeHtml(meta.subject)} pour la classe de 5ème en Côte d'Ivoire.">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${css}</style>
</head>
<body>
  <div class="container">
    <a href="/fiches_5eme.html" class="back-link">← Retour aux fiches 5ème</a>
    ${htmlContent}
    <div class="footer">Créé par <strong>Haniel_dev</strong> | ResumeCI 5ème</div>
  </div>
</body>
</html>`;
}

function buildStructure() {
  const structure = {};
  let totalFiches = 0;

  if (!fs.existsSync(SOURCE_DIR)) {
    console.log('⚠️ Dossier Resumes_5eme introuvable. Exécutez d\'abord: npm run write:5eme puis rédigez les résumés manuellement.');
    return { structure, stats: { totalFiches: 0, subjects: 0 } };
  }

  for (const subject of fs.readdirSync(SOURCE_DIR)) {
    const subDir = path.join(SOURCE_DIR, subject);
    if (!fs.statSync(subDir).isDirectory()) continue;

    const fiches = fs.readdirSync(subDir)
      .filter(file => file.endsWith('.md'))
      .sort((a, b) => a.localeCompare(b, 'fr'))
      .map(file => ({
        file: file.replace('.md', '.html'),
        name: file.replace('Fiche_', '').replace('.md', ''),
        path: `${subject}/${file.replace('.md', '.html')}`,
        url: `/fiches_5eme/${encodeURIComponent(subject)}/${encodeURIComponent(file.replace('.md', '.html'))}`,
      }));

    if (fiches.length > 0) {
      structure[subject] = fiches;
      totalFiches += fiches.length;
    }
  }

  return { structure, stats: { totalFiches, subjects: Object.keys(structure).length } };
}

function convertFiches(structure) {
  for (const [subject, fiches] of Object.entries(structure)) {
    const subjectOutDir = path.join(OUT_FICHES_DIR, subject);
    ensureDir(subjectOutDir);

    for (const fiche of fiches) {
      const mdPath = path.join(SOURCE_DIR, subject, fiche.file.replace('.html', '.md'));
      if (!fs.existsSync(mdPath)) continue;

      const mdContent = fs.readFileSync(mdPath, 'utf8');
      const html = markdownToHtml(mdContent, { subject, name: fiche.name, file: fiche.file });
      
      const htmlPath = path.join(subjectOutDir, fiche.file);
      fs.writeFileSync(htmlPath, html, 'utf8');
    }
  }
}

function generateIndexPage(structure) {
  const subjectsHtml = Object.entries(structure).map(([subject, fiches]) => {
    const fichesHtml = fiches.map(f => 
      `<li><a href="${f.url}">${escapeHtml(f.name)}</a></li>`
    ).join('');
    
    return `
      <div class="subject-card">
        <h3>${escapeHtml(subject)}</h3>
        <ul>${fichesHtml}</ul>
      </div>
    `;
  }).join('');

  const css = `
    body { font-family: Inter, system-ui, -apple-system, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #1e293b; margin: 0; min-height: 100vh; }
    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
    h1 { color: white; text-align: center; margin-bottom: 10px; text-shadow: 0 2px 10px rgba(0,0,0,0.2); }
    .subtitle { color: rgba(255,255,255,0.9); text-align: center; margin-bottom: 40px; }
    .back-link { display: inline-block; margin-bottom: 20px; color: white; text-decoration: none; font-weight: 500; }
    .subjects-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
    .subject-card { background: white; border-radius: 16px; padding: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
    .subject-card h3 { margin-top: 0; color: #4f46e5; border-bottom: 2px solid #e0e7ff; padding-bottom: 10px; }
    .subject-card ul { list-style: none; padding: 0; }
    .subject-card li { margin: 10px 0; padding: 8px; border-radius: 8px; transition: background 0.2s; }
    .subject-card li:hover { background: #f1f5f9; }
    .subject-card a { color: #334155; text-decoration: none; font-weight: 500; }
    .subject-card a:hover { color: #4f46e5; }
    .stats { background: rgba(255,255,255,0.2); color: white; padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 30px; }
    .footer { text-align: center; color: rgba(255,255,255,0.8); margin-top: 40px; padding-top: 20px; }
  `;

  const stats = Object.values(structure).reduce((acc, fiches) => acc + fiches.length, 0);
  const subjectCount = Object.keys(structure).length;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fiches de Résumé 5ème | ResumeCI</title>
  <meta name="description" content="Fiches de résumé pour la classe de 5ème en Côte d'Ivoire. Toutes les matières sauf Arts Plastiques, Musique et Anglais.">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${css}</style>
</head>
<body>
  <div class="container">
    <a href="/" class="back-link">← Retour à l'accueil</a>
    <h1>📚 Fiches de Résumé 5ème</h1>
    <p class="subtitle">Toutes les matières disponibles (Arts Plastiques, Musique et Anglais exclus)</p>
    
    <div class="stats">
      <strong>${stats}</strong> fiches de résumé disponibles dans <strong>${subjectCount}</strong> matières
    </div>
    
    <div class="subjects-grid">
      ${subjectsHtml}
    </div>
    
    <div class="footer">Créé par <strong>Haniel_dev</strong></div>
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(PUBLIC_DIR, 'fiches_5eme.html'), html, 'utf8');
}

function generateSearchIndex(structure) {
  const entries = [];
  for (const [subject, fiches] of Object.entries(structure)) {
    for (const fiche of fiches) {
      const mdPath = path.join(SOURCE_DIR, subject, fiche.file.replace('.html', '.md'));
      const text = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8').slice(0, 1000) : '';
      entries.push({ subject, file: fiche.file, name: fiche.name, path: fiche.path, text });
    }
  }
  fs.writeFileSync(path.join(OUT_DATA_DIR, 'search-index.json'), JSON.stringify(entries), 'utf8');
}

function main() {
  console.log('🏗️  Construction des fiches 5ème...\n');
  
  if (fs.existsSync(OUT_FICHES_DIR)) fs.rmSync(OUT_FICHES_DIR, { recursive: true, force: true });
  ensureDir(OUT_FICHES_DIR);
  ensureDir(OUT_DATA_DIR);

  const { structure, stats } = buildStructure();
  
  if (stats.totalFiches === 0) {
    console.log('❌ Aucune fiche à construire. Workflow: npm run scrape:5eme → npm run extract:5eme → npm run write:5eme → [rédaction manuelle] → npm run build:5eme');
    return;
  }

  convertFiches(structure);
  generateIndexPage(structure);
  generateSearchIndex(structure);

  fs.writeFileSync(path.join(OUT_DATA_DIR, 'structure.json'), JSON.stringify(structure, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DATA_DIR, 'stats.json'), JSON.stringify(stats, null, 2), 'utf8');

  console.log(`✅ Build 5ème terminé:`);
  console.log(`   📊 ${stats.totalFiches} fiches générées`);
  console.log(`   📚 ${stats.subjects} matières`);
  console.log(`   📁 Sortie: ${OUT_FICHES_DIR}`);
}

main();
