/**
 * 📚 RésuméCI — Scraper ecole-ci.org pour Seconde A/C (Mathématiques only)
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const axios = require('axios');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const CONFIG = {
  chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  registerUrl: 'https://ecole-ci.org/co/inscriptionvisiteur.php',
  loginUrl: 'https://ecole-ci.org/co/loginvisiteur.php',
  lyceeUrl: 'https://lyc.ecole-ci.org/course/',
  outputDir: path.join(__dirname, '..', 'Cours_Seconde_Math'),
  dataDir: path.join(__dirname, '..', 'data_seconde_math'),
  visitor: {
    phone: '0700000020', lastname: 'Diallo', firstname: 'Mariam', genre: 'Féminin',
    age: '15 à 19 ans', pays: "Côte d'Ivoire", niveau: 'Lycée', classe: 'Seconde',
  },
  targetSubject: 'Mathematiques',
  excludedSubjects: ['arts plastiques', 'art plastique', 'plastique', 'musique', 'education musicale', 'éducation musicale'],
  delay: 500, headless: false, timeout: 30000,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sanitize = name => name.replace(/[<>:\"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim();
const ensureDir = dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };
const log = (emoji, msg) => console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ${emoji} ${msg}`);
const saveJSON = (file, data) => { ensureDir(CONFIG.dataDir); fs.writeFileSync(path.join(CONFIG.dataDir, file), JSON.stringify(data, null, 2), 'utf8'); };

function detectSubject(text) {
  if (!text) return null;
  return text.toLowerCase().includes('math') ? 'Mathematiques' : null;
}

function detectSerie(text) {
  if (!text) return 'BOTH';
  const lower = text.toLowerCase();
  if (lower.includes('seconde a') || lower.includes('2nde a') || lower.includes('2de a') || lower.includes('_2a')) return 'A';
  if (lower.includes('seconde c') || lower.includes('2nde c') || lower.includes('2de c') || lower.includes('_2c')) return 'C';
  return 'BOTH';
}

function isExcluded(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return CONFIG.excludedSubjects.some(excluded => lower.includes(excluded));
}

async function downloadPDF(url, outputPath, cookies) {
  ensureDir(path.dirname(outputPath));
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const cookieStr = (cookies || []).map(c => `${c.name}=${c.value}`).join('; ');
      const resp = await axios({ method: 'GET', url, responseType: 'arraybuffer', timeout: 30000,
        headers: { 'Cookie': cookieStr, 'User-Agent': 'Mozilla/5.0', 'Referer': CONFIG.lyceeUrl }, maxRedirects: 5, httpsAgent });
      if (resp.data.length < 500) return 0;
      fs.writeFileSync(outputPath, resp.data);
      return resp.data.length;
    } catch (e) {
      if (attempt === 3) return 0;
      await sleep(1000);
    }
  }
  return 0;
}

class EcoleCISecondeMathScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookies = [];
    this.queue = [];
    this.pdfs = [];
    this.stats = { pages: 0, pdfs: 0, downloaded: 0, errors: 0, totalSize: 0 };
  }

  async init() {
    log('🚀', 'Lancement Chrome Seconde math...');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scraper_seconde_math_'));
    this.browser = await puppeteer.launch({ executablePath: CONFIG.chromePath, headless: CONFIG.headless,
      userDataDir: tmpDir, defaultViewport: { width: 1366, height: 900 },
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--ignore-certificate-errors'],
    });
    this.page = await this.browser.newPage();
    this.page.setDefaultTimeout(CONFIG.timeout);
    this.page.on('dialog', async d => await d.accept());
    log('✅', 'Chrome prêt');
  }

  async close() { if (this.browser) await this.browser.close(); log('🔒', 'Chrome fermé'); }

  async goto(url) {
    for (let i = 1; i <= 3; i++) {
      try { await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout }); await sleep(800); return true; }
      catch (e) { log('⚠️', `Tentative ${i}/3 échouée pour ${url}`); if (i === 3) return false; await sleep(2000); }
    }
    return false;
  }

  async registerVisitor() {
    log('📝', 'Inscription (Seconde Lycée)');
    await this.page.goto(CONFIG.registerUrl, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await this.page.select('#niveauenseignement', CONFIG.visitor.niveau);
    await sleep(1000);
    const classes = await this.page.evaluate(() => {
      const select = document.querySelector('#classe');
      if (!select) return [];
      return [...select.options].map(o => ({ value: o.value, text: o.text }));
    });
    const seconde = classes.find(c => /seconde|2nde|2de/i.test(c.text));
    if (seconde) await this.page.select('#classe', seconde.value);
    await sleep(500);
    await this.page.type('#lastname', CONFIG.visitor.lastname, { delay: 30 });
    await this.page.type('#firstname', CONFIG.visitor.firstname, { delay: 30 });
    await this.page.select('#genre', CONFIG.visitor.genre);
    await this.page.select('#ages', CONFIG.visitor.age);
    await this.page.select('#pays', CONFIG.visitor.pays);
    const city = await this.page.$('#autoComplete');
    if (city) { city.click(); await city.type('Abidjan', { delay: 50 }); await sleep(1500); const result = await this.page.$('.autoComplete_result, [class*="autoComplete"] li'); if (result) await result.click(); }
    const phone = await this.page.$('#telephone'); if (phone) { await phone.click({ clickCount: 3 }); await phone.type(CONFIG.visitor.phone, { delay: 40 }); }
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
      this.page.click('input[name="submit"], button[name="submit"], .btn-success').catch(() => this.page.evaluate(() => document.querySelector('form')?.submit())),
    ]);
    await sleep(2000);
    log('✅', 'Inscription effectuée');
  }

  async loginVisitor() {
    log('🔑', 'Connexion visiteur');
    await this.page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle2' });
    await sleep(1500);
    const phone = await this.page.$('#telephone');
    if (phone) { await phone.click({ clickCount: 3 }); await phone.type(CONFIG.visitor.phone, { delay: 35 }); }
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
      this.page.click('#submit, button[name="submit"], .btn-success').catch(() => this.page.evaluate(() => document.querySelector('form')?.submit())),
    ]);
    await sleep(2000);
    this.cookies = await this.page.cookies();
    log('✅', 'Connexion réussie');
  }

  async explore() {
    log('🏫', 'Exploration des cours Seconde (Maths uniquement)...');
    if (!await this.goto(CONFIG.lyceeUrl)) {
      log('❌', 'Impossible d\'accéder au catalogue lycée');
      return;
    }

    // Récupérer tous les liens de la page d\'accueil du lycée
    const moodleInfo = await this.page.evaluate(() => ({
      allLinks: [...document.querySelectorAll('a')].map(a => ({
        text: (a.textContent || '').trim().substring(0, 200),
        href: a.href,
      })).filter(l => l.href && !l.href.startsWith('javascript') && !l.href.includes('#')),
    }));
    saveJSON('moodle_course_list.json', moodleInfo);

    const categoryLinks = moodleInfo.allLinks.filter(l =>
      l.href.includes('course/index.php?categoryid=') || l.href.includes('/course/')
    );

    // Chercher les catégories Seconde (A et C)
    const secondeCategories = categoryLinks.filter(cat => {
      const t = cat.text.toLowerCase();
      return t.includes('seconde') || t.includes('2nde') || t.includes('2de');
    });

    if (secondeCategories.length === 0) {
      log('❌', 'Catégories SECONDE introuvables. Quelques catégories détectées :');
      categoryLinks.slice(0, 30).forEach(c => log('  📂', `${c.text} → ${c.href}`));
      saveJSON('seconde_categories_debug.json', categoryLinks);
      return;
    }

    log('✅', `${secondeCategories.length} catégorie(s) SECONDE trouvée(s)`);
    secondeCategories.forEach(c => log('  📂', `${c.text} → ${c.href}`));

    const visited = new Set();
    const queue = secondeCategories.map(c => ({ url: c.href, label: c.text, subject: null }));

    this.queue = [];

    while (queue.length > 0) {
      const { url, label, subject: parentSubject } = queue.shift();
      if (visited.has(url) || !url.includes('ecole-ci.org')) continue;
      visited.add(url);
      if (isExcluded(label)) continue;

      const ok = await this.goto(url);
      if (!ok) continue;

      const subInfo = await this.page.evaluate(() => ({
        courses: [...document.querySelectorAll('a[href*="/course/view.php"]')].map(a => ({
          text: (a.textContent || '').trim().substring(0, 200), href: a.href,
        })),
        subCats: [...document.querySelectorAll('a[href*="course/index.php?categoryid="]')].map(a => ({
          text: (a.textContent || '').trim().substring(0, 200), href: a.href,
        })),
      }));

      for (const course of subInfo.courses) {
        if (isExcluded(course.text)) continue;
        const subject = parentSubject || detectSubject(course.text) || detectSubject(label) || null;
        if (subject !== CONFIG.targetSubject) continue; // garder uniquement les maths
        const serie = detectSerie(course.text) || detectSerie(label);
        this.queue.push({ ...course, subject, serie });
      }

      for (const subCat of subInfo.subCats) {
        if (visited.has(subCat.href) || isExcluded(subCat.text)) continue;
        queue.push({ url: subCat.href, label: subCat.text, subject: parentSubject || detectSubject(subCat.text) || null });
      }
    }

    log('📚', `Cours de mathématiques Seconde collectés: ${this.queue.length}`);
    saveJSON('math_courses.json', this.queue);
  }

  async collectResources() {
    log('📄', 'Collecte des ressources PDF Mathématiques');
    const enriched = [];
    for (const [index, course] of this.queue.entries()) {
      if (!await this.goto(course.href)) continue;
      this.stats.pages++;
      const resources = await this.page.evaluate(() =>
        [...document.querySelectorAll('a[href*="/pluginfile.php"], a[href*="/mod/resource/view.php"], a[href*=".pdf"]')].map(a => ({ text: (a.textContent || '').trim(), href: a.href })).filter(r => r.href && r.text)
      );
      resources.forEach(resource => {
        if (isExcluded(resource.text)) return;
        enriched.push({ url: resource.href, text: resource.text, course: course.text, subject: course.subject, serie: course.serie });
        this.stats.pdfs++;
      });
    }
    this.pdfs = enriched;
    saveJSON('math_resources.json', this.pdfs);
    log('📄', `Ressources à télécharger: ${this.pdfs.length}`);
  }

  async download() {
    if (this.pdfs.length === 0) { log('📭', 'Aucun PDF mathématique'); return; }
    ensureDir(CONFIG.outputDir);
    for (const [index, pdf] of this.pdfs.entries()) {
      const fileName = sanitize(pdf.course || pdf.text || `math_${index + 1}`) + '.pdf';
      const dirs = [];
      if (pdf.serie === 'A' || pdf.serie === 'BOTH') dirs.push(path.join(CONFIG.outputDir, 'Seconde_A', pdf.subject));
      if (pdf.serie === 'C' || pdf.serie === 'BOTH') dirs.push(path.join(CONFIG.outputDir, 'Seconde_C', pdf.subject));
      for (const dir of dirs) {
        const outputPath = path.join(dir, fileName);
        if (fs.existsSync(outputPath)) continue;
        const size = await downloadPDF(pdf.url, outputPath, this.cookies);
        if (size > 0) { this.stats.downloaded++; this.stats.totalSize += size; }
        else { this.stats.errors++; }
      }
      await sleep(CONFIG.delay);
    }
    saveJSON('final_stats.json', this.stats);
    log('📦', `Téléchargement terminé (${this.stats.downloaded} fiches).`);
  }

  async run() {
    try {
      await this.init();
      ensureDir(CONFIG.outputDir);
      ensureDir(CONFIG.dataDir);
      await this.registerVisitor();
      await sleep(500);
      await this.loginVisitor();
      await this.explore();
      await this.collectResources();
      await this.download();
    } catch (e) {
      log('❌', `Erreur fatale: ${e.message}`);
    } finally {
      await sleep(2000);
      await this.close();
    }
  }
}

(async () => {
  const scraper = new EcoleCISecondeMathScraper();
  await scraper.run();
})();
