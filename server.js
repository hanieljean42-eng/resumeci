const express = require('express');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const app = express();
const PORT = process.env.PORT || 3000;

const FICHES_DIR = path.join(__dirname, 'Fiches_Resume');
const COURS_DIR = path.join(__dirname, 'Cours_Terminale');
const ALLOWED_SUBJECTS = {
  '6eme': ['Anglais', 'EDHC', 'Francais', 'Histoire-Geographie', 'Mathematiques', 'Physique-Chimie', 'SVT', 'TIC'],
  '5eme': ['Mathematiques', 'SVT', 'EDHC', 'Histoire-Geographie', 'Physique-Chimie', 'Technologie', 'Francais'],
  '3eme': ['EDHC', 'EPS', 'Francais', 'Histoire-Geographie', 'Mathematiques', 'Physique-Chimie', 'SVT', 'TIC'],
  Seconde_A: ['Francais', 'Histoire-Geographie', 'Mathematiques', 'Physique-Chimie', 'SVT'],
  Seconde_C: ['Francais', 'Histoire-Geographie', 'Mathematiques', 'Physique-Chimie', 'SVT'],
  Premiere_D: ['Francais', 'Histoire-Geographie', 'Mathematiques', 'Physique-Chimie', 'SVT', 'Philosophie'],
  Terminale_C: ['Mathématiques', 'Physique - Chimie'], // ← AJOUT ICI AUSSI
  Terminale_D: ['Mathématiques', 'SVT', 'Physique - Chimie', 'Philosophie', 'Histoire - Géographie'],
  Terminale_A: ['Français', 'Anglais', 'Allemand', 'Mathématiques', 'Philosophie', 'Histoire - Géographie'],
};
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Language', 'fr-CI');
  next();
});
app.use('/public', express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  etag: true,
}));
app.use('/pdfs', express.static(COURS_DIR, {
  maxAge: '1d',
  etag: true,
}));

// Ensure HTML sitemap is not indexed (keep for users only)
app.get('/sitemap.html', (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, follow');
  res.sendFile(path.join(__dirname, 'public', 'sitemap.html'));
});

// API: Get structure (classes > matières > leçons)
app.get('/api/structure', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  const structure = {};
  
  if (!fs.existsSync(FICHES_DIR)) return res.json({});
  
  const classes = fs.readdirSync(FICHES_DIR).filter(d => 
    fs.statSync(path.join(FICHES_DIR, d)).isDirectory() && ALLOWED_SUBJECTS[d]
  );

  for (const cls of classes) {
    structure[cls] = {};
    const clsDir = path.join(FICHES_DIR, cls);
    const subjects = fs.readdirSync(clsDir).filter(d => 
      fs.statSync(path.join(clsDir, d)).isDirectory() && ALLOWED_SUBJECTS[cls].includes(d)
    );

    for (const subject of subjects) {
      const subDir = path.join(clsDir, subject);
      const fiches = fs.readdirSync(subDir)
        .filter(f => f.endsWith('.html'))
        .map(f => ({
          file: f,
          name: f.replace('Fiche_', '').replace('.html', ''),
          path: `${cls}/${subject}/${f}`,
        }));
      structure[cls][subject] = fiches;
    }
  }

  res.json(structure);
});

// API: Get a specific fiche content (HTML direct)
app.get('/api/fiche/:cls/:subject/:file', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  const { cls, subject, file } = req.params;
  const fichePath = path.join(FICHES_DIR, cls, subject, file);
  
  if (!fs.existsSync(fichePath)) {
    return res.status(404).json({ error: 'Fiche non trouvée' });
  }

  const rawHtml = fs.readFileSync(fichePath, 'utf8');
  // Extract just the body content (between <body> and </body>)
  const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/);
  const html = bodyMatch ? bodyMatch[1] : rawHtml;
  
  // Check if PDF exists
  const pdfName = file.replace('Fiche_', '').replace('.html', '.pdf');
  const pdfPath = path.join(COURS_DIR, cls, subject, pdfName);
  const hasPdf = fs.existsSync(pdfPath);

  res.json({ 
    html, 
    hasPdf,
    pdfUrl: hasPdf ? `/pdfs/${encodeURIComponent(cls)}/${encodeURIComponent(subject)}/${encodeURIComponent(pdfName)}` : null,
  });
});

// API: Stats
app.get('/api/stats', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  let totalFiches = 0;
  let totalPdfs = 0;
  const classStats = {};

  if (!fs.existsSync(FICHES_DIR)) return res.json({ totalFiches: 0, totalPdfs: 0, classStats: {} });

  const classes = fs.readdirSync(FICHES_DIR).filter(d => 
    fs.statSync(path.join(FICHES_DIR, d)).isDirectory() && ALLOWED_SUBJECTS[d]
  );

  for (const cls of classes) {
    classStats[cls] = { subjects: 0, fiches: 0, pdfs: 0 };
    const clsDir = path.join(FICHES_DIR, cls);
    const subjects = fs.readdirSync(clsDir).filter(d => 
      fs.statSync(path.join(clsDir, d)).isDirectory() && ALLOWED_SUBJECTS[cls].includes(d)
    );
    classStats[cls].subjects = subjects.length;

    for (const subject of subjects) {
      const subDir = path.join(clsDir, subject);
      const fiches = fs.readdirSync(subDir).filter(f => f.endsWith('.html'));
      classStats[cls].fiches += fiches.length;
      totalFiches += fiches.length;

      const pdfDir = path.join(COURS_DIR, cls, subject);
      if (fs.existsSync(pdfDir)) {
        const pdfs = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
        classStats[cls].pdfs += pdfs.length;
        totalPdfs += pdfs.length;
      }
    }
  }

  res.json({ totalFiches, totalPdfs, classStats });
});

// API: Download fiche as PDF (printable)
app.get('/api/download/:cls/:subject/:file', async (req, res) => {
  const { cls, subject, file } = req.params;
  const fichePath = path.join(FICHES_DIR, cls, subject, file);
  
  if (!fs.existsSync(fichePath)) {
    return res.status(404).send('Fiche non trouvée');
  }

  try {
    const fullHtml = fs.readFileSync(fichePath, 'utf8');

    const browser = await puppeteer.launch({
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
      args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 15000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
      printBackground: true,
    });
    await browser.close();

    const downloadName = file.replace('.html', '.pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdfBuffer);
  } catch (e) {
    console.error('PDF error:', e.message);
    res.status(500).send('Erreur lors de la génération du PDF');
  }
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  etag: false,
}));

// SPA fallback — serve index.html for non-file routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Interface disponible sur http://localhost:${PORT}`);
});
