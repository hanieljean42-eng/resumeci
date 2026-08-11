/**
 * ═══════════════════════════════════════════════════════════
 * 📚 RésuméCI — Scraper ecole-ci.org pour Première D
 * ═══════════════════════════════════════════════════════════
 * 1. S'inscrit automatiquement comme visiteur (Lycée - Première)
 * 2. Se connecte
 * 3. Navigue dans la classe Première D
 * 4. Télécharge TOUS les PDFs organisés par matière
 * 5. Matières cibles : Maths, Physique-Chimie, SVT, Histoire-Géo, Philo, Français
 * ═══════════════════════════════════════════════════════════
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const axios = require('axios');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ═══════════════════════════════════════════════════════════
// ⚙️ CONFIGURATION PREMIÈRE D
// ═══════════════════════════════════════════════════════════

const CONFIG = {
  chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  
  baseUrl: 'https://ecole-ci.org',
  loginUrl: 'https://ecole-ci.org/co/loginvisiteur.php',
  registerUrl: 'https://ecole-ci.org/co/inscriptionvisiteur.php',
  
  outputDir: path.join(__dirname, '..', 'Cours_Premiere_D'),
  dataDir: path.join(__dirname, '..', 'data_premiere'),
  
  visitor: {
    phone: '0700000015',
    lastname: 'Touré',
    firstname: 'Ibrahim',
    genre: 'Masculin',
    age: '15 à 19 ans',
    pays: "Côte d'Ivoire",
    niveau: 'Lycée',
    classe: 'Première',
  },
  
  excludedSubjects: [
    'arts plastiques', 'art plastique', 'plastique',
    'musique', 'education musicale', 'éducation musicale',
    'anglais', 'english',
    'eps', 'éducation physique', 'sport',
    'edhc', 'civisme', 'civique',
  ],
  
  // Matières cibles Première D
  targetSubjects: [
    'français', 'francais',
    'mathématiques', 'mathematiques', 'math',
    'physique', 'chimie', 'physique-chimie', 'pc',
    'svt', 'sciences de la vie', 'sciences vie terre',
    'histoire', 'géographie', 'hg', 'histoire-géographie',
    'philosophie', 'philo',
  ],
  
  delay: 2000,
  headless: false,
  timeout: 30000,
};

// ═══════════════════════════════════════════════════════════
// 🛠️ UTILITAIRES
// ═══════════════════════════════════════════════════════════

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sanitize = name => name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim();
const ensureDir = dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };
const log = (emoji, msg) => console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ${emoji} ${msg}`);
const saveJSON = (file, data) => {
  ensureDir(CONFIG.dataDir);
  fs.writeFileSync(path.join(CONFIG.dataDir, file), JSON.stringify(data, null, 2), 'utf8');
};

async function downloadFile(url, outputPath, cookies) {
  try {
    const cookieStr = (cookies || []).map(c => `${c.name}=${c.value}`).join('; ');
    const resp = await axios({
      method: 'GET', url, responseType: 'arraybuffer', timeout: 60000,
      headers: { 'Cookie': cookieStr, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Referer': CONFIG.baseUrl },
      maxRedirects: 5, httpsAgent,
    });
    fs.writeFileSync(outputPath, resp.data);
    return resp.data.length;
  } catch (e) {
    log('❌', `Download err: ${e.message}`);
    return 0;
  }
}

function isExcludedSubject(text) {
  const lowerText = text.toLowerCase();
  return CONFIG.excludedSubjects.some(excluded => lowerText.includes(excluded));
}

function isTargetSubject(text) {
  const lowerText = text.toLowerCase();
  return CONFIG.targetSubjects.some(target => lowerText.includes(target));
}

function detectSubject(text) {
  const lowerText = text.toLowerCase();
  const subjectMap = {
    'français': 'Francais', 'francais': 'Francais',
    'mathématiques': 'Mathematiques', 'mathematiques': 'Mathematiques',
    'mathématique': 'Mathematiques', 'math': 'Mathematiques',
    'physique-chimie': 'Physique-Chimie', 'physique chimie': 'Physique-Chimie',
    'pc': 'Physique-Chimie', 'physique': 'Physique-Chimie', 'chimie': 'Physique-Chimie',
    'svt': 'SVT', 'sciences de la vie': 'SVT', 'sciences vie': 'SVT', 'biologie': 'SVT',
    'histoire-géographie': 'Histoire-Geographie', 'histoire-géo': 'Histoire-Geographie',
    'histoire géographie': 'Histoire-Geographie', 'hg': 'Histoire-Geographie',
    'histoire': 'Histoire-Geographie', 'géographie': 'Histoire-Geographie',
    'philosophie': 'Philosophie', 'philo': 'Philosophie',
  };
  for (const [key, value] of Object.entries(subjectMap)) {
    if (lowerText.includes(key)) return value;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// 🌐 SCRAPER PREMIÈRE D
// ═══════════════════════════════════════════════════════════

class EcoleCIPremiereScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookies = [];
    this.coursIndex = [];
    this.stats = { pages: 0, pdfs: 0, downloaded: 0, errors: 0, totalSize: 0, excluded: 0 };
    this.coursesBySubject = {};
  }

  async init() {
    log('🚀', 'Lancement Chrome pour Première D...');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scraper_premiere_'));
    this.browser = await puppeteer.launch({
      executablePath: CONFIG.chromePath,
      headless: CONFIG.headless,
      userDataDir: tmpDir,
      defaultViewport: { width: 1366, height: 900 },
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security',
             '--ignore-certificate-errors', '--ignore-certificate-errors-spki-list',
             '--ignore-ssl-errors', '--allow-insecure-localhost', '--allow-running-insecure-content'],
    });
    this.page = await this.browser.newPage();
    this.page.setDefaultTimeout(CONFIG.timeout);
    this.page.on('dialog', async d => { await d.accept(); });
    const client = await this.page.createCDPSession();
    await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: CONFIG.outputDir });
    log('✅', 'Chrome prêt');
  }

  async close() { if (this.browser) await this.browser.close(); log('🔒', 'Chrome fermé'); }

  async screenshot(name) {
    ensureDir(CONFIG.dataDir);
    await this.page.screenshot({ path: path.join(CONFIG.dataDir, `${name}.png`), fullPage: true });
  }

  async registerVisitor() {
    log('📝', 'Inscription comme visiteur (Lycée Première)...');
    await this.page.goto(CONFIG.registerUrl, { waitUntil: 'networkidle2' });
    await sleep(2000);

    try {
      await this.page.select('#niveauenseignement', CONFIG.visitor.niveau);
      await sleep(2000);

      const classes = await this.page.evaluate(() => {
        const sel = document.querySelector('#classe');
        if (!sel) return [];
        return [...sel.options].map(o => ({ value: o.value, text: o.text }));
      });
      log('📋', `Classes disponibles: ${classes.map(c => c.text).join(', ')}`);
      saveJSON('available_classes.json', classes);

      const premiere = classes.find(c => {
        const txt = c.text.toLowerCase();
        const val = c.value.toLowerCase();
        return txt.includes('premier') || val.includes('premier') ||
               txt === '1ère' || txt === '1ere' || txt === 'première' ||
               val === '1ère' || val === '1ere' || val === 'première' ||
               txt.match(/^1\s*[èe]re/) || val.match(/^1\s*[èe]re/);
      });

      if (premiere) {
        await this.page.select('#classe', premiere.value);
        log('📋', `Classe sélectionnée: ${premiere.text}`);
      } else if (classes.length > 1) {
        await this.page.select('#classe', classes[1].value);
      }
      await sleep(1000);

      await this.page.type('#lastname', CONFIG.visitor.lastname, { delay: 50 });
      await this.page.type('#firstname', CONFIG.visitor.firstname, { delay: 50 });
      await this.page.select('#genre', CONFIG.visitor.genre);
      await this.page.select('#ages', CONFIG.visitor.age);
      await this.page.select('#pays', CONFIG.visitor.pays);
      await sleep(1000);

      const villeInput = await this.page.$('#autoComplete');
      if (villeInput) {
        await villeInput.click(); await villeInput.type('Abidjan', { delay: 80 }); await sleep(2000);
        const firstResult = await this.page.$('.autoComplete_result, [class*="autoComplete"] li');
        if (firstResult) await firstResult.click();
        else await this.page.evaluate(() => { const i = document.querySelector('#autoComplete'); if(i) i.value = 'Abidjan - Cocody'; });
      }

      const phoneInput = await this.page.$('#telephone');
      if (phoneInput) { await phoneInput.click({ clickCount: 3 }); await phoneInput.type(CONFIG.visitor.phone, { delay: 50 }); }
      const urbanRadio = await this.page.$('#zoneurbaine'); if (urbanRadio) await urbanRadio.click();
      const publicRadio = await this.page.$('#ecolepublic'); if (publicRadio) await publicRadio.click();

      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
        this.page.click('input[name="submit"], button[name="submit"], button.btn-success, input.btn-success').catch(() =>
          this.page.evaluate(() => document.querySelector('#authentification')?.submit())
        ),
      ]);
      await sleep(3000);
      return true;
    } catch (e) {
      log('❌', `Erreur inscription: ${e.message}`);
      return false;
    }
  }

  async loginVisitor() {
    log('🔑', 'Connexion visiteur...');
    await this.page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle2' });
    await sleep(2000);
    try {
      const phoneInput = await this.page.$('#telephone');
      if (phoneInput) { await phoneInput.click({ clickCount: 3 }); await phoneInput.type(CONFIG.visitor.phone, { delay: 50 }); }
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
        this.page.click('#submit, button[name="submit"]').catch(() => this.page.evaluate(() => document.querySelector('#formlogin')?.submit())),
      ]);
      await sleep(2000);
      if (this.page.url().includes('login')) {
        const p2 = await this.page.$('#telephone');
        if(p2){ const v=await this.page.evaluate(()=>document.querySelector('#telephone')?.value); if(!v||v.length<5){await p2.click({clickCount:3}); await p2.type(CONFIG.visitor.phone,{delay:50});} }
        await Promise.all([
          this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
          this.page.click('#submit, button[name="submit"]').catch(() => this.page.evaluate(() => document.querySelector('#formlogin')?.submit())),
        ]);
        await sleep(3000);
      }
      this.cookies = await this.page.cookies();
      saveJSON('cookies.json', this.cookies);
      const isLoggedIn = !this.page.url().includes('login');
      if (isLoggedIn) log('✅', 'CONNEXION RÉUSSIE !');
      return isLoggedIn;
    } catch (e) { log('❌', `Erreur connexion: ${e.message}`); return false; }
  }

  async exploreLyceeCourses() {
    log('🏫', 'Exploration des cours du Lycée Première D...');
    const lyceeUrl = 'https://lyc.ecole-ci.org/course/';
    await this.page.goto(lyceeUrl, { waitUntil: 'networkidle2' });
    await sleep(2000);
    this.cookies = await this.page.cookies();

    const moodleInfo = await this.page.evaluate(() => ({
      allLinks: [...document.querySelectorAll('a')].map(a => ({
        text: (a.textContent || '').trim().substring(0, 200), href: a.href,
      })).filter(l => l.href && !l.href.startsWith('javascript') && !l.href.includes('#')),
    }));
    saveJSON('moodle_course_list.json', moodleInfo);

    const categoryLinks = moodleInfo.allLinks.filter(l =>
      l.href.includes('course/index.php?categoryid=') || l.href.includes('course/')
    );

    // Chercher la catégorie PREMIERE (contient A, C, D)
    const premiereCategory = categoryLinks.find(cat => {
      const t = cat.text.toLowerCase();
      return t.includes('premier') || t.includes('1ère') || t.includes('1ere') || t.includes('première');
    });

    if (!premiereCategory) {
      log('❌', 'Catégorie PREMIÈRE introuvable. Catégories trouvées:');
      categoryLinks.slice(0, 30).forEach(c => log('  ', `${c.text} → ${c.href}`));
      return;
    }

    log('✅', `Catégorie PREMIÈRE trouvée: ${premiereCategory.href}`);

    const visited = new Set();
    const coursePages = new Set();
    const courseSubjects = {};

    // Explorer la catégorie Première
    const queue = [{ url: premiereCategory.href, label: premiereCategory.text, subject: null }];

    while (queue.length > 0) {
      const { url, label, subject: parentSubject } = queue.shift();
      if (visited.has(url) || !url.includes('ecole-ci.org')) continue;
      visited.add(url);
      if (isExcludedSubject(label)) { this.stats.excluded++; continue; }

      try {
        await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
        await sleep(1500);
        const subInfo = await this.page.evaluate(() => ({
          courses: [...document.querySelectorAll('a[href*="/course/view.php"]')].map(a => ({
            text: (a.textContent || '').trim().substring(0, 200), href: a.href
          })),
          subCats: [...document.querySelectorAll('a[href*="course/index.php?categoryid="]')].map(a => ({
            text: (a.textContent || '').trim().substring(0, 200), href: a.href
          })),
        }));

        for (const course of subInfo.courses) {
          if (isExcludedSubject(course.text)) { this.stats.excluded++; continue; }
          const subject = parentSubject || detectSubject(course.text) || detectSubject(label) || 'Autres';
          // TEMPORAIRE : ne pas filtrer par matières cibles pour récupérer tous les PDFs
          coursePages.add(course.href);
          courseSubjects[course.href] = subject;
          if (!this.coursesBySubject[subject]) this.coursesBySubject[subject] = [];
          this.coursesBySubject[subject].push(course);
        }

        for (const subCat of subInfo.subCats) {
          if (visited.has(subCat.href) || isExcludedSubject(subCat.text)) continue;
          queue.push({ url: subCat.href, label: subCat.text, subject: parentSubject || detectSubject(subCat.text) || subCat.text });
        }
      } catch(e) { log('❌', `  Erreur: ${e.message}`); }
    }

    log('📚', `Exploration de ${coursePages.size} cours...`);
    for (const courseUrl of coursePages) {
      try {
        await this.page.goto(courseUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await sleep(1500);
        this.stats.pages++;
        const courseInfo = await this.page.evaluate(() => ({
          title: document.querySelector('h1')?.textContent?.trim() || document.title,
          resources: [...document.querySelectorAll('a[href*="/pluginfile.php"], a[href*="/mod/resource/view.php"], a[href*=".pdf"]')].map(a => ({
            text: (a.textContent || '').trim().substring(0, 200), href: a.href,
            isPdf: a.href.includes('.pdf') || a.querySelector('img[src*="pdf"]') !== null
          })),
        }));
        if (isExcludedSubject(courseInfo.title)) { this.stats.excluded++; continue; }
        const subject = courseSubjects[courseUrl] || detectSubject(courseInfo.title) || 'Autres';
        // TEMPORAIRE : ne pas filtrer par matières cibles pour récupérer tous les PDFs
        for (const res of courseInfo.resources) {
          if (isExcludedSubject(res.text)) { this.stats.excluded++; continue; }
          this.coursIndex.push({ url: res.href, text: res.text || courseInfo.title, course: courseInfo.title, isPdf: res.isPdf, subject, className: 'Premiere_D' });
          this.stats.pdfs++;
        }
      } catch(e) { log('❌', `  Erreur: ${e.message}`); }
    }
    saveJSON('courses_by_subject.json', this.coursesBySubject);
  }

  async downloadFoundPDFs() {
    if (this.coursIndex.length === 0) { log('📭', 'Aucun PDF trouvé.'); return; }
    log('📥', `Téléchargement de ${this.coursIndex.length} PDF(s)...`);
    ensureDir(CONFIG.outputDir);
    for (let i = 0; i < this.coursIndex.length; i++) {
      const cours = this.coursIndex[i];
      const subject = cours.subject || detectSubject(cours.text) || 'Autres';
      const subjectDir = path.join(CONFIG.outputDir, sanitize(subject));
      ensureDir(subjectDir);
      const fileName = sanitize(cours.course || cours.text || `cours_${i+1}`) + '.pdf';
      const outputPath = path.join(subjectDir, fileName);
      if (fs.existsSync(outputPath)) continue;
      log('📥', `[${i+1}/${this.coursIndex.length}] ${subject}/${fileName}`);
      const size = await downloadFile(cours.url, outputPath, this.cookies);
      if (size > 0) { this.stats.downloaded++; this.stats.totalSize += size; }
      else { this.stats.errors++; }
      await sleep(CONFIG.delay);
    }
  }

  async run() {
    try {
      await this.init();
      ensureDir(CONFIG.outputDir);
      ensureDir(CONFIG.dataDir);

      console.log('\n═══════════════════════════════════════════════════════');
      console.log('║  📚 SCRAPER PREMIÈRE D - ecole-ci.org               ║');
      console.log('║  Matières: Maths, PC, SVT, HG, Philo, Français      ║');
      console.log('═══════════════════════════════════════════════════════\n');

      console.log('\n═══ PHASE 1: INSCRIPTION ═══');
      await this.registerVisitor();
      await sleep(2000);

      console.log('\n═══ PHASE 2: CONNEXION ═══');
      const logged = await this.loginVisitor();
      if (!logged) log('⚠️', 'Connexion échouée.');

      console.log('\n═══ PHASE 3: EXPLORATION PREMIÈRE D ═══');
      await this.exploreLyceeCourses();

      console.log('\n═══ PHASE 4: TÉLÉCHARGEMENT ═══');
      await this.downloadFoundPDFs();

      console.log('\n╔════════════════════════════════════════════════════╗');
      console.log('║           📊 RAPPORT FINAL - PREMIÈRE D            ║');
      console.log(`║ 🌐 Pages: ${this.stats.pages} | 📄 PDFs: ${this.stats.pdfs} | ✅ DL: ${this.stats.downloaded} | ❌ Err: ${this.stats.errors}`);
      console.log('╚════════════════════════════════════════════════════╝');

      saveJSON('cours_index.json', this.coursIndex);
      saveJSON('final_stats.json', this.stats);
    } catch (e) {
      log('❌', `ERREUR FATALE: ${e.message}`);
    } finally {
      await sleep(5000);
      await this.close();
    }
  }
}

(async () => {
  const scraper = new EcoleCIPremiereScraper();
  await scraper.run();
})();
