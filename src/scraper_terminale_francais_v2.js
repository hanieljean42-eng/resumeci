/**
 * 📚 RésuméCI — Scraper ecole-ci.org pour Terminale (Français Terminale A)
 *
 * - Inscription + connexion automatique (niveau Lycée, Terminale)
 * - Exploration ciblée du catalogue Moodle lycée
 * - Récupération des cours de FRANÇAIS niveau Terminale uniquement
 * - Filtrage des intitulés contenant "lecture méthodique" (exclus)
 * - Téléchargement des PDFs dans Cours_Terminale/Terminale_A/Français
 *
 * Utilisation (dans le dossier du projet) :
 *   node src/scraper_terminale_francais_v2.js
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const axios = require('axios');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const CONFIG = {
  // Chemin par défaut de Chrome sur Windows ; adapte si besoin
  chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  registerUrl: 'https://ecole-ci.org/co/inscriptionvisiteur.php',
  loginUrl: 'https://ecole-ci.org/co/loginvisiteur.php',
  lyceeUrl: 'https://lyc.ecole-ci.org/course/',

  // Dossier des cours Terminale pour l'extraction (_extracts)
  // → Cours_Terminale/Terminale_A/Français/*.pdf
  coursDir: path.join(__dirname, '..', 'Cours_Terminale', 'Terminale_A', 'Français'),

  // Dossier de debug (JSON + captures)
  dataDir: path.join(__dirname, '..', 'data_terminale_francais'),

  visitor: {
    phone: '0700000031',
    lastname: 'Kouadio',
    firstname: 'Awa',
    genre: 'Féminin',
    age: '15 à 19 ans',
    pays: 'Côte d\'Ivoire',
    niveau: 'Lycée',
  },

  headless: false,
  timeout: 30000,
  delay: 700,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sanitize = name => name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim().substring(0, 160);
const ensureDir = dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };
const log = (emoji, msg) => console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ${emoji} ${msg}`);
const saveJSON = (file, data) => { ensureDir(CONFIG.dataDir); fs.writeFileSync(path.join(CONFIG.dataDir, file), JSON.stringify(data, null, 2), 'utf8'); };

function detectSubject(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  if (t.includes('français') || t.includes('francais')) return 'Francais';
  return null;
}

function isLectureMethodique(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return t.includes('lecture méthodique') || t.includes('lecture methodique');
}

function isTerminaleLabel(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return t.includes('terminale') || t.includes('tle');
}

async function downloadPDF(url, outputPath, cookies) {
  ensureDir(path.dirname(outputPath));
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const cookieStr = (cookies || []).map(c => `${c.name}=${c.value}`).join('; ');
      const resp = await axios({
        method: 'GET',
        url,
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          Cookie: cookieStr,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          Referer: CONFIG.lyceeUrl,
        },
        maxRedirects: 5,
        httpsAgent,
      });
      if (resp.data.length < 500) return 0; // trop petit pour être un vrai PDF
      fs.writeFileSync(outputPath, resp.data);
      return resp.data.length;
    } catch (e) {
      log('⚠️', `Download échec (${attempt}/3) : ${e.message.substring(0, 80)}`);
      if (attempt === 3) return 0;
      await sleep(1500);
    }
  }
  return 0;
}

class EcoleCITerminaleFrancaisScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookies = [];
    this.queue = []; // pages de cours FR Terminale
    this.pdfs = [];  // ressources PDF à télécharger
    this.stats = { pages: 0, pdfs: 0, downloaded: 0, errors: 0, totalSize: 0 };
  }

  async init() {
    log('🚀', 'Lancement Chrome (Terminale Français)...');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scraper_term_fr_'));
    this.browser = await puppeteer.launch({
      executablePath: CONFIG.chromePath,
      headless: CONFIG.headless,
      userDataDir: tmpDir,
      defaultViewport: { width: 1366, height: 900 },
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--ignore-certificate-errors'],
    });
    this.page = await this.browser.newPage();
    this.page.setDefaultTimeout(CONFIG.timeout);
    this.page.on('dialog', async d => { try { await d.accept(); } catch {} });
    log('✅', 'Chrome prêt');
  }

  async close() {
    if (this.browser) await this.browser.close();
    log('🔒', 'Chrome fermé');
  }

  async goto(url) {
    for (let i = 1; i <= 3; i++) {
      try {
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout });
        await sleep(800);
        return true;
      } catch (e) {
        log('⚠️', `Tentative ${i}/3 échouée pour ${url.substring(0, 100)}`);
        if (i === 3) return false;
        await sleep(2000);
      }
    }
    return false;
  }

  async registerVisitor() {
    log('📝', 'Inscription visiteur (Lycée / Terminale)...');
    await this.page.goto(CONFIG.registerUrl, { waitUntil: 'networkidle2' });
    await sleep(1500);

    await this.page.select('#niveauenseignement', CONFIG.visitor.niveau);
    await sleep(1200);

    const classes = await this.page.evaluate(() => {
      const sel = document.querySelector('#classe');
      if (!sel) return [];
      return [...sel.options].map(o => ({ value: o.value, text: o.text }));
    });

    const terminale = classes.find(c => /terminale|tle/i.test(c.text)) || classes[1] || classes[0];
    if (terminale) {
      await this.page.select('#classe', terminale.value);
      log('📋', `Classe sélectionnée: ${terminale.text}`);
    }

    await sleep(800);
    await this.page.type('#lastname', CONFIG.visitor.lastname, { delay: 40 });
    await this.page.type('#firstname', CONFIG.visitor.firstname, { delay: 40 });
    await this.page.select('#genre', CONFIG.visitor.genre);
    await this.page.select('#ages', CONFIG.visitor.age);
    await this.page.select('#pays', CONFIG.visitor.pays);

    const city = await this.page.$('#autoComplete');
    if (city) {
      await city.click();
      await city.type('Abidjan', { delay: 60 });
      await sleep(1500);
      const result = await this.page.$('.autoComplete_result, [class*="autoComplete"] li');
      if (result) await result.click();
    }

    const phone = await this.page.$('#telephone');
    if (phone) {
      await phone.click({ clickCount: 3 });
      await phone.type(CONFIG.visitor.phone, { delay: 40 });
    }

    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
      this.page.click('input[name="submit"], button[name="submit"], .btn-success').catch(() =>
        this.page.evaluate(() => document.querySelector('form')?.submit())
      ),
    ]);

    await sleep(2000);
    log('✅', 'Inscription effectuée (ou déjà existante)');
  }

  async loginVisitor() {
    log('🔑', 'Connexion visiteur...');
    await this.page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle2' });
    await sleep(1500);

    const phone = await this.page.$('#telephone');
    if (phone) {
      await phone.click({ clickCount: 3 });
      await phone.type(CONFIG.visitor.phone, { delay: 40 });
    }

    // Premier clic
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
      this.page.click('#submit, button[name="submit"], .btn-success').catch(() =>
        this.page.evaluate(() => document.querySelector('form')?.submit())
      ),
    ]);
    await sleep(2000);

    // Si toujours sur la page de login, tenter un second clic
    if (this.page.url().includes('login')) {
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
        this.page.click('#submit, button[name="submit"], .btn-success').catch(() =>
          this.page.evaluate(() => document.querySelector('form')?.submit())
        ),
      ]);
      await sleep(2000);
    }

    this.cookies = await this.page.cookies();
    saveJSON('cookies.json', this.cookies);
    log('✅', `URL après connexion: ${this.page.url()}`);
  }

  async explore() {
    log('🏫', 'Exploration du catalogue lycée (Terminale Français)...');
    if (!await this.goto(CONFIG.lyceeUrl)) {
      log('❌', 'Impossible d\'accéder au catalogue lycée');
      return;
    }

    const moodleInfo = await this.page.evaluate(() => ({
      allLinks: [...document.querySelectorAll('a')].map(a => ({
        text: (a.textContent || '').trim().substring(0, 200),
        href: a.href,
      })).filter(l => l.href && !l.href.startsWith('javascript') && !l.href.includes('#')),
    }));
    saveJSON('moodle_all_links.json', moodleInfo.allLinks);

    const categoryLinks = moodleInfo.allLinks.filter(l =>
      l.href.includes('course/index.php?categoryid=') || l.href.includes('/course/')
    );

    const terminaleCategories = categoryLinks.filter(cat => isTerminaleLabel(cat.text));
    if (terminaleCategories.length === 0) {
      log('❌', 'Aucune catégorie Terminale détectée');
      categoryLinks.slice(0, 40).forEach(c => log('  📂', `${c.text} → ${c.href}`));
      saveJSON('terminale_categories_debug.json', categoryLinks);
      return;
    }

    log('✅', `${terminaleCategories.length} catégorie(s) Terminale détectée(s)`);
    terminaleCategories.forEach(c => log('  📂', `${c.text} → ${c.href}`));

    const visited = new Set();
    const queue = [...terminaleCategories.map(c => ({ url: c.href, label: c.text, subject: null }))];
    const collected = [];

    while (queue.length > 0) {
      const { url, label, subject: parentSubject } = queue.shift();
      if (visited.has(url) || !url.includes('ecole-ci.org')) continue;
      visited.add(url);

      if (!await this.goto(url)) continue;
      this.stats.pages++;

      const subInfo = await this.page.evaluate(() => ({
        courses: [...document.querySelectorAll('a[href*="/course/view.php"]')].map(a => ({
          text: (a.textContent || '').trim().substring(0, 200),
          href: a.href,
        })),
        subCats: [...document.querySelectorAll('a[href*="course/index.php?categoryid="]')].map(a => ({
          text: (a.textContent || '').trim().substring(0, 200),
          href: a.href,
        })),
      }));

      // Ajouter les cours Français uniquement
      for (const course of subInfo.courses) {
        const subject = parentSubject || detectSubject(course.text) || detectSubject(label);
        if (subject !== 'Francais') continue;
        if (isLectureMethodique(course.text)) {
          log('⏭️', `  Skip (lecture méthodique): ${course.text}`);
          continue;
        }
        collected.push({ ...course, subject });
      }

      // Explorer récursivement les sous-catégories Terminale
      for (const subCat of subInfo.subCats) {
        const t = (subCat.text || '').toLowerCase();
        if (visited.has(subCat.href)) continue;
        if (!isTerminaleLabel(subCat.text)) continue; // rester dans l'univers Terminale
        if (t.includes('seconde') || t.includes('premiere') || t.includes('1ère') || t.includes('1ere')) continue;
        queue.push({ url: subCat.href, label: subCat.text, subject: parentSubject || detectSubject(subCat.text) || null });
      }
    }

    this.queue = collected;
    saveJSON('terminale_francais_courses.json', this.queue);
    log('📚', `Cours Français Terminale collectés: ${this.queue.length}`);
  }

  async collectResources() {
    if (!this.queue.length) {
      log('📭', 'Aucun cours Français Terminale à explorer');
      return;
    }

    log('📄', 'Collecte des ressources PDF Français Terminale...');
    const pdfs = [];

    for (const [index, course] of this.queue.entries()) {
      log('🔍', `[${index + 1}/${this.queue.length}] ${course.text.substring(0, 120)}`);
      if (!await this.goto(course.href)) continue;
      this.stats.pages++;

      const resources = await this.page.evaluate(() =>
        [...document.querySelectorAll('a[href*="/pluginfile.php"], a[href*="/mod/resource/view.php"], a[href*=".pdf"]')]
          .map(a => ({ text: (a.textContent || '').trim(), href: a.href }))
          .filter(r => r.href && r.text)
      );

      for (const res of resources) {
        if (isLectureMethodique(res.text)) {
          continue;
        }
        pdfs.push({
          url: res.href,
          text: res.text,
          course: course.text,
          subject: course.subject,
        });
        this.stats.pdfs++;
      }
    }

    this.pdfs = pdfs;
    saveJSON('terminale_francais_resources.json', this.pdfs);
    log('📄', `Ressources PDF à télécharger: ${this.pdfs.length}`);
  }

  async download() {
    if (!this.pdfs.length) {
      log('📭', 'Aucun PDF Français Terminale à télécharger');
      return;
    }

    ensureDir(CONFIG.coursDir);
    for (const [index, pdf] of this.pdfs.entries()) {
      const baseName = sanitize(pdf.course || pdf.text || `fr_terminale_${index + 1}`);
      const fileName = `${baseName}.pdf`;
      const outputPath = path.join(CONFIG.coursDir, fileName);

      if (fs.existsSync(outputPath)) {
        log('⏭️', `[${index + 1}/${this.pdfs.length}] Déjà présent: ${fileName}`);
        continue;
      }

      log('📥', `[${index + 1}/${this.pdfs.length}] ${fileName}`);
      const size = await downloadPDF(pdf.url, outputPath, this.cookies);
      if (size > 0) {
        this.stats.downloaded++;
        this.stats.totalSize += size;
      } else {
        this.stats.errors++;
      }

      await sleep(CONFIG.delay);
    }
  }

  async run() {
    try {
      ensureDir(CONFIG.coursDir);
      ensureDir(CONFIG.dataDir);

      await this.init();
      await this.registerVisitor();
      await this.loginVisitor();

      await this.explore();
      await this.collectResources();
      await this.download();

      saveJSON('final_stats.json', this.stats);
      console.log('\n╔══════════════════════════════════════════╗');
      console.log('║    📊 RAPPORT FINAL — Terminale FR      ║');
      console.log('╠══════════════════════════════════════════╣');
      console.log(`║ 🌐 Pages explorées : ${String(this.stats.pages).padStart(5)}               ║`);
      console.log(`║ 📄 PDFs trouvés   : ${String(this.stats.pdfs).padStart(5)}               ║`);
      console.log(`║ ✅ Téléchargés    : ${String(this.stats.downloaded).padStart(5)}               ║`);
      console.log(`║ ❌ Erreurs        : ${String(this.stats.errors).padStart(5)}               ║`);
      console.log(`║ 💾 Taille totale  : ${(this.stats.totalSize / 1024 / 1024).toFixed(1).padStart(5)} MB           ║`);
      console.log('╚══════════════════════════════════════════╝');
      console.log(`\n📁 Cours Terminale Français : ${CONFIG.coursDir}`);
    } catch (e) {
      log('❌', `ERREUR FATALE: ${e.message}`);
    } finally {
      await sleep(3000);
      await this.close();
    }
  }
}

(async () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  📚 RésuméCI — Scraper Terminale Français ║');
  console.log('╚══════════════════════════════════════════╝\n');
  const scraper = new EcoleCITerminaleFrancaisScraper();
  await scraper.run();
})();
