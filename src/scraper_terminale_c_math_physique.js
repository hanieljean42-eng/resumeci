/**
 * 📚 RésuméCI — Scraper ecole-ci.org pour Terminale C
 *   - Va directement sur les catégories Terminale
 *   - Ne garde que les cours Terminale C
 *   - Filtre uniquement Mathématiques et Physique-Chimie
 *   - Télécharge les PDFs dans Cours_Terminale/Terminale_C/{Mathematiques,Physique_Chimie}
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const axios = require('axios');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const CONFIG = {
  chromePath: 'C\\\Program Files\\Google\\Chrome\\Application\\chrome.exe'.replace(/\\\\/g, '\\\\\\\\'),
  registerUrl: 'https://ecole-ci.org/co/inscriptionvisiteur.php',
  loginUrl: 'https://ecole-ci.org/co/loginvisiteur.php',
  lyceeUrl: 'https://lyc.ecole-ci.org/course/',
  outputDir: path.join(__dirname, '..', 'Cours_Terminale', 'Terminale_C'),
  dataDir: path.join(__dirname, '..', 'data_terminale_c'),
  visitor: {
    phone: '0700000032',
    lastname: 'Kone',
    firstname: 'Yao',
    genre: 'Masculin',
    age: '15 à 19 ans',
    pays: "Côte d'Ivoire",
    niveau: 'Lycée',
  },
  delay: 600,
  headless: false,
  timeout: 30000,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sanitize = name => name.replace(/[<>:"/\\\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim().substring(0, 160);
const ensureDir = dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };
const log = (emoji, msg) => console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ${emoji} ${msg}`);
const saveJSON = (file, data) => { ensureDir(CONFIG.dataDir); fs.writeFileSync(path.join(CONFIG.dataDir, file), JSON.stringify(data, null, 2), 'utf8'); };

function isTerminaleLabel(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return t.includes('terminale') || t.includes('tle');
}

function isTerminaleCLabel(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return t.includes('terminale c') || t.includes('tle c') || t.includes('tc ');
}

function detectSubject(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  if (t.includes('math') || t.includes('mathématique') || t.includes('mathematique')) return 'Mathematiques';
  if (t.includes('physique') || t.includes('chimie')) return 'Physique_Chimie';
  return null;
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
      if (resp.data.length < 500) return 0;
      fs.writeFileSync(outputPath, resp.data);
      return resp.data.length;
    } catch (e) {
      log('⚠️', `Download échec (${attempt}/3): ${e.message.substring(0, 100)}`);
      if (attempt === 3) return 0;
      await sleep(1500);
    }
  }
  return 0;
}

class EcoleCITerminaleCScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookies = [];
    this.courses = [];
    this.pdfs = [];
    this.stats = { pages: 0, pdfs: 0, downloaded: 0, errors: 0, totalSize: 0 };
  }

  async init() {
    log('🚀', 'Lancement Chrome (Terminale C)...');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scraper_term_c_'));
    this.browser = await puppeteer.launch({
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
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

    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
      this.page.click('#submit, button[name="submit"], .btn-success').catch(() =>
        this.page.evaluate(() => document.querySelector('form')?.submit())
      ),
    ]);
    await sleep(2000);

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
    log('🏫', 'Exploration du catalogue lycée (Terminale C Maths + Physique-Chimie)...');

    // Aller directement sur la catégorie TERMINALE (id = 8)
    const terminaleUrl = 'https://lyc.ecole-ci.org/course/index.php?categoryid=8';
    if (!await this.goto(terminaleUrl)) {
      log('❌', 'Impossible d\'accéder à la catégorie TERMINALE (id=8)');
      return;
    }
    this.stats.pages++;

    // Récupérer les sous-catégories sous TERMINALE pour trouver Terminale C
    const subCats = await this.page.evaluate(() => {
      return [...document.querySelectorAll('a[href*="course/index.php?categoryid="]')]
        .map(a => ({ text: (a.textContent || '').trim().substring(0, 200), href: a.href }))
        .filter(a => a.text.length > 0);
    });
    saveJSON('terminale_subcats.json', subCats);

    // Chercher explicitement la catégorie Terminale C (id=10 connue dans map_categories2)
    let termC = subCats.find(c => c.href.includes('categoryid=10'));
    if (!termC) {
      // fallback: chercher par label texte
      termC = subCats.find(c => isTerminaleCLabel(c.text));
    }

    if (!termC) {
      log('❌', 'Impossible de trouver la sous-catégorie Terminale C (id=10)');
      return;
    }

    log('✅', `Sous-catégorie Terminale C: ${termC.text} → ${termC.href}`);

    // Aller sur la page Terminale C
    if (!await this.goto(termC.href)) {
      log('❌', 'Impossible d\'accéder à la page Terminale C');
      return;
    }
    this.stats.pages++;

    // Depuis Terminale C, on va récursivement collecter les cours, mais uniquement Maths / Physique-Chimie
    const visited = new Set();
    const queue = [{ url: termC.href, label: termC.text, subject: null }];
    const collected = [];

    while (queue.length > 0) {
      const { url, label, subject: parentSubject } = queue.shift();
      if (visited.has(url)) continue;
      visited.add(url);

      if (!await this.goto(url)) continue;
      this.stats.pages++;

      const subInfo = await this.page.evaluate(() => ({
        courses: [...document.querySelectorAll('a[href*="/course/view.php?id="]')].map(a => ({
          text: (a.textContent || '').trim().substring(0, 200),
          href: a.href,
        })),
        subCats: [...document.querySelectorAll('a[href*="course/index.php?categoryid="]')].map(a => ({
          text: (a.textContent || '').trim().substring(0, 200),
          href: a.href,
        })),
      }));

      // Ajouter les cours de Maths / Physique-Chimie uniquement
      for (const course of subInfo.courses) {
        const subject = parentSubject || detectSubject(course.text) || detectSubject(label);
        if (!(subject === 'Mathematiques' || subject === 'Physique_Chimie')) continue;
        collected.push({ ...course, subject });
      }

      // Descendre dans les sous-catégories Terminale C (éviter Seconde/Première)
      for (const subCat of subInfo.subCats) {
        if (visited.has(subCat.href)) continue;
        const t = (subCat.text || '').toLowerCase();
        if (t.includes('seconde') || t.includes('premiere') || t.includes('1ère') || t.includes('1ere')) continue;
        // rester dans l'univers Terminale C : on ne vérifie pas A/D ici, on reste sous categoryid=10
        queue.push({ url: subCat.href, label: subCat.text, subject: parentSubject || detectSubject(subCat.text) || null });
      }
    }

    this.courses = collected;
    saveJSON('terminale_c_courses.json', this.courses);
    log('📚', `Cours Terminale C (Maths + Physique-Chimie) collectés: ${this.courses.length}`);
  }

  async collectResources() {
    if (!this.courses.length) {
      log('📭', 'Aucun cours Terminale C à explorer');
      return;
    }

    log('📄', 'Collecte des ressources PDF Terminale C Maths + Physique-Chimie...');
    const pdfs = [];

    for (const [index, course] of this.courses.entries()) {
      log('🔍', `[${index + 1}/${this.courses.length}] ${course.text.substring(0, 120)}`);
      if (!await this.goto(course.href)) continue;
      this.stats.pages++;

      const resources = await this.page.evaluate(() =>
        [...document.querySelectorAll('a[href*="/pluginfile.php"], a[href*="/mod/resource/view.php"], a[href*=".pdf"]')]
          .map(a => ({ text: (a.textContent || '').trim(), href: a.href }))
          .filter(r => r.href && r.text)
      );

      for (const res of resources) {
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
    saveJSON('terminale_c_resources.json', this.pdfs);
    log('📄', `Ressources PDF à télécharger: ${this.pdfs.length}`);
  }

  async download() {
    if (!this.pdfs.length) {
      log('📭', 'Aucun PDF Terminale C à télécharger');
      return;
    }

    for (const [index, pdf] of this.pdfs.entries()) {
      const baseName = sanitize(pdf.course || pdf.text || `terminale_c_${index + 1}`);
      const fileName = `${baseName}.pdf`;
      const subjectDir = pdf.subject === 'Mathematiques' ? 'Mathematiques' : 'Physique_Chimie';
      const outputPath = path.join(CONFIG.outputDir, subjectDir, fileName);

      if (fs.existsSync(outputPath)) {
        log('⏭️', `[${index + 1}/${this.pdfs.length}] Déjà présent: ${fileName}`);
        continue;
      }

      log('📥', `[${index + 1}/${this.pdfs.length}] ${subjectDir} → ${fileName}`);
      const size = await downloadPDF(pdf.url, outputPath, this.cookies);
      if (size > 0) {
        this.stats.downloaded++;
        this.stats.totalSize += size;
      } else {
        this.stats.errors++;
      }

      await sleep(CONFIG.delay);
    }

    saveJSON('final_stats.json', this.stats);
  }

  async run() {
    try {
      ensureDir(CONFIG.outputDir);
      ensureDir(CONFIG.dataDir);

      await this.init();
      await this.registerVisitor();
      await this.loginVisitor();

      await this.explore();
      await this.collectResources();
      await this.download();

      console.log('\n╔══════════════════════════════════════════╗');
      console.log('║ 📊 RAPPORT FINAL — Terminale C (Math/PC) ║');
      console.log('╠══════════════════════════════════════════╣');
      console.log(`║ 🌐 Pages explorées : ${String(this.stats.pages).padStart(5)}         ║`);
      console.log(`║ 📄 PDFs trouvés   : ${String(this.stats.pdfs).padStart(5)}         ║`);
      console.log(`║ ✅ Téléchargés    : ${String(this.stats.downloaded).padStart(5)}         ║`);
      console.log(`║ ❌ Erreurs        : ${String(this.stats.errors).padStart(5)}         ║`);
      console.log(`║ 💾 Taille totale  : ${(this.stats.totalSize / 1024 / 1024).toFixed(1).padStart(5)} MB   ║`);
      console.log('╚══════════════════════════════════════════╝');
      console.log(`\n📁 Cours Terminale C: ${CONFIG.outputDir}`);
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
  console.log('║  📚 RésuméCI — Scraper Terminale C       ║');
  console.log('║    Maths + Physique-Chimie uniquement   ║');
  console.log('╚══════════════════════════════════════════╝\n');
  const scraper = new EcoleCITerminaleCScraper();
  await scraper.run();
})();
