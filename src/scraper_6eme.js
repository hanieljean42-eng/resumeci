/**
 * ═══════════════════════════════════════════════════════════
 * 📚 RésuméCI — Scraper ecole-ci.org pour 6ème
 * ═══════════════════════════════════════════════════════════
 * 1. S'inscrit automatiquement comme visiteur (Collège - 6ème)
 * 2. Se connecte
 * 3. Navigue dans la classe 6ème
 * 4. Télécharge TOUS les PDFs organisés par matière
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
// ⚙️ CONFIGURATION 6ÈME
// ═══════════════════════════════════════════════════════════

const CONFIG = {
  chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  
  baseUrl: 'https://ecole-ci.org',
  loginUrl: 'https://ecole-ci.org/co/loginvisiteur.php',
  registerUrl: 'https://ecole-ci.org/co/inscriptionvisiteur.php',
  
  outputDir: path.join(__dirname, '..', 'Cours_6eme'),
  dataDir: path.join(__dirname, '..', 'data_6eme'),
  
  // Compte visiteur pour Collège 6ème
  visitor: {
    phone: '0700000006',
    lastname: 'Konan',
    firstname: 'Yao',
    genre: 'Masculin',
    age: '10 à 14 ans',
    pays: "Côte d'Ivoire",
    niveau: 'Collège',
    classe: '6ème',
  },
  
  // Matières à EXCLURE
  excludedSubjects: [
    'arts plastiques',
    'art plastique',
    'plastique',
    'musique',
    'education musicale',
    'éducation musicale',
  ],
  
  // Matières cibles 6ème
  targetSubjects: [
    'français', 'francais',
    'mathématiques', 'mathematiques', 'math',
    'physique', 'chimie', 'physique-chimie', 'pc',
    'svt', 'sciences de la vie', 'sciences vie terre',
    'histoire', 'géographie', 'hg', 'histoire-géographie',
    'anglais', 'english',
    'edhc', 'civisme', 'civique', 'droits de l\'homme',
    'technologie', 'informatique', 'tic',
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

function detectSubject(text) {
  const lowerText = text.toLowerCase();
  const subjectMap = {
    'français': 'Francais', 'francais': 'Francais',
    'mathématiques': 'Mathematiques', 'mathematiques': 'Mathematiques',
    'mathématique': 'Mathematiques', 'math': 'Mathematiques',
    'algèbre': 'Mathematiques', 'géométrie': 'Mathematiques',
    'physique-chimie': 'Physique-Chimie', 'physique chimie': 'Physique-Chimie',
    'pc': 'Physique-Chimie', 'physique': 'Physique-Chimie', 'chimie': 'Physique-Chimie',
    'svt': 'SVT', 'sciences de la vie': 'SVT', 'sciences vie': 'SVT', 'biologie': 'SVT',
    'histoire-géographie': 'Histoire-Geographie', 'histoire-géo': 'Histoire-Geographie',
    'histoire géographie': 'Histoire-Geographie', 'hg': 'Histoire-Geographie',
    'histoire': 'Histoire-Geographie', 'géographie': 'Histoire-Geographie',
    'anglais': 'Anglais', 'english': 'Anglais',
    'edhc': 'EDHC', 'civisme': 'EDHC', 'civique': 'EDHC',
    'droits de l\'homme': 'EDHC', 'instruction civique': 'EDHC',
    'technologie': 'TIC', 'informatique': 'TIC', 'tic': 'TIC',
  };
  for (const [key, value] of Object.entries(subjectMap)) {
    if (lowerText.includes(key)) return value;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// 🌐 SCRAPER 6ÈME
// ═══════════════════════════════════════════════════════════

class EcoleCI6emeScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookies = [];
    this.coursIndex = [];
    this.stats = { pages: 0, pdfs: 0, downloaded: 0, errors: 0, totalSize: 0, excluded: 0 };
    this.coursesBySubject = {};
  }

  async init() {
    log('🚀', 'Lancement Chrome pour 6ème...');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scraper_6eme_'));
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

  async close() {
    if (this.browser) await this.browser.close();
    log('🔒', 'Chrome fermé');
  }

  async screenshot(name) {
    ensureDir(CONFIG.dataDir);
    await this.page.screenshot({ path: path.join(CONFIG.dataDir, `${name}.png`), fullPage: true });
  }

  // ══════════════════════════════════════════════════════════
  // ÉTAPE 1 : INSCRIPTION VISITEUR (Collège 6ème)
  // ══════════════════════════════════════════════════════════
  async registerVisitor() {
    log('📝', 'Inscription comme visiteur (Collège 6ème)...');
    await this.page.goto(CONFIG.registerUrl, { waitUntil: 'networkidle2' });
    await sleep(2000);
    await this.screenshot('01_register');

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

      // Sélectionner 6ème (SIXIÈME)
      const sixieme = classes.find(c => {
        const txt = c.text.toLowerCase();
        const val = c.value.toLowerCase();
        return txt.includes('sixi') || val.includes('sixi') ||
               txt === '6ème' || txt === '6eme' ||
               val === '6ème' || val === '6eme' ||
               txt.match(/^6\s*[èe]me/) || val.match(/^6\s*[èe]me/);
      });

      if (sixieme) {
        await this.page.select('#classe', sixieme.value);
        log('📋', `Classe sélectionnée: ${sixieme.text}`);
        CONFIG.visitor.classe = sixieme.text;
      } else if (classes.length > 1) {
        await this.page.select('#classe', classes[1].value);
        log('⚠️', `6ème non trouvée, sélection: ${classes[1].text}`);
      }
      await sleep(1000);

      // Remplir le formulaire
      await this.page.type('#lastname', CONFIG.visitor.lastname, { delay: 50 });
      await this.page.type('#firstname', CONFIG.visitor.firstname, { delay: 50 });
      await this.page.select('#genre', CONFIG.visitor.genre);
      await this.page.select('#ages', CONFIG.visitor.age);
      await this.page.select('#pays', CONFIG.visitor.pays);
      await sleep(1000);

      const villeInput = await this.page.$('#autoComplete');
      if (villeInput) {
        await villeInput.click();
        await villeInput.type('Abidjan', { delay: 80 });
        await sleep(2000);
        const firstResult = await this.page.$('.autoComplete_result, [class*="autoComplete"] li');
        if (firstResult) await firstResult.click();
        else await this.page.evaluate(() => { const i = document.querySelector('#autoComplete'); if(i) i.value = 'Abidjan - Cocody'; });
      }
      await sleep(500);

      const phoneInput = await this.page.$('#telephone');
      if (phoneInput) { await phoneInput.click({ clickCount: 3 }); await phoneInput.type(CONFIG.visitor.phone, { delay: 50 }); }

      const urbanRadio = await this.page.$('#zoneurbaine');
      if (urbanRadio) await urbanRadio.click();
      const publicRadio = await this.page.$('#ecolepublic');
      if (publicRadio) await publicRadio.click();

      await sleep(500);
      await this.screenshot('03_form_filled');

      log('📤', 'Soumission du formulaire...');
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
        this.page.click('input[name="submit"], button[name="submit"], button.btn-success, input.btn-success').catch(() =>
          this.page.evaluate(() => document.querySelector('#authentification')?.submit())
        ),
      ]);
      await sleep(3000);
      await this.screenshot('04_after_register');
      log('🌐', `Après inscription: ${this.page.url()}`);
      return true;
    } catch (e) {
      log('❌', `Erreur inscription: ${e.message}`);
      await this.screenshot('register_error');
      return false;
    }
  }

  // ══════════════════════════════════════════════════════════
  // ÉTAPE 2 : CONNEXION
  // ══════════════════════════════════════════════════════════
  async loginVisitor() {
    log('🔑', 'Connexion visiteur...');
    await this.page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle2' });
    await sleep(2000);

    try {
      const phoneInput = await this.page.$('#telephone');
      if (phoneInput) { await phoneInput.click({ clickCount: 3 }); await phoneInput.type(CONFIG.visitor.phone, { delay: 50 }); }

      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
        this.page.click('#submit, button[name="submit"]').catch(() =>
          this.page.evaluate(() => document.querySelector('#formlogin')?.submit())
        ),
      ]);
      await sleep(2000);

      if (this.page.url().includes('login')) {
        const p2 = await this.page.$('#telephone');
        if (p2) { const val = await this.page.evaluate(() => document.querySelector('#telephone')?.value); if(!val||val.length<5){ await p2.click({clickCount:3}); await p2.type(CONFIG.visitor.phone,{delay:50}); }}
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
    } catch (e) {
      log('❌', `Erreur connexion: ${e.message}`);
      return false;
    }
  }

  // ══════════════════════════════════════════════════════════
  // ÉTAPE 3 : EXPLORER MOODLE COLLÈGE 6ÈME
  // ══════════════════════════════════════════════════════════
  async exploreCollegeCourses() {
    log('🏫', 'Exploration des cours du Collège 6ème...');
    const collegeUrl = 'https://coll.ecole-ci.org/course/';
    await this.page.goto(collegeUrl, { waitUntil: 'networkidle2' });
    await sleep(2000);
    this.cookies = await this.page.cookies();

    const moodleInfo = await this.page.evaluate(() => ({
      title: document.title,
      url: window.location.href,
      categories: [...document.querySelectorAll('.category, .categoryname, a[href*="category"], .coursebox')].map(el => ({
        text: (el.textContent || '').trim().substring(0, 200),
        href: el.href || el.querySelector('a')?.href || null,
      })),
      courseLinks: [...document.querySelectorAll('a[href*="/course/view.php"], a[href*="/course/index.php"]')].map(a => ({
        text: (a.textContent || '').trim().substring(0, 200), href: a.href
      })),
      allLinks: [...document.querySelectorAll('a')].map(a => ({
        text: (a.textContent || '').trim().substring(0, 200), href: a.href,
      })).filter(l => l.href && !l.href.startsWith('javascript') && !l.href.includes('#')),
    }));
    saveJSON('moodle_course_list.json', moodleInfo);

    const categoryLinks = moodleInfo.allLinks.filter(l =>
      l.href.includes('course/index.php?categoryid=') || l.href.includes('course/')
    );

    // Trouver la catégorie SIXIÈME
    const sixiemeCategory = categoryLinks.find(cat => {
      const t = cat.text.toLowerCase();
      return t.includes('sixi') || t === '6ème' || t === '6eme' || t.match(/^6\s*[èe]me/);
    });

    if (!sixiemeCategory) {
      log('❌', 'Catégorie SIXIÈME introuvable. Catégories trouvées:');
      categoryLinks.slice(0, 20).forEach(c => log('  ', c.text));
      return;
    }

    log('✅', `Catégorie SIXIÈME trouvée: ${sixiemeCategory.href}`);

    const visited = new Set();
    const coursePages = new Set();
    const courseSubjects = {};
    const queue = [{ url: sixiemeCategory.href, label: 'SIXIÈME', subject: null }];

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
          coursePages.add(course.href);
          courseSubjects[course.href] = subject;
          if (!this.coursesBySubject[subject]) this.coursesBySubject[subject] = [];
          this.coursesBySubject[subject].push(course);
        }

        for (const subCat of subInfo.subCats) {
          if (visited.has(subCat.href) || isExcludedSubject(subCat.text)) continue;
          const subjectName = parentSubject || detectSubject(subCat.text) || subCat.text;
          queue.push({ url: subCat.href, label: subCat.text, subject: subjectName });
        }
      } catch(e) { log('❌', `  Erreur: ${e.message}`); }
    }

    // Explorer chaque page de cours pour trouver les PDFs
    log('📚', `Exploration de ${coursePages.size} cours...`);
    for (const courseUrl of coursePages) {
      try {
        await this.page.goto(courseUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await sleep(1500);
        this.stats.pages++;
        const courseInfo = await this.page.evaluate(() => {
          const title = document.querySelector('h1, .page-header-headings h1')?.textContent?.trim() || document.title;
          return {
            title,
            resources: [...document.querySelectorAll('a[href*="/pluginfile.php"], a[href*="/mod/resource/view.php"], a[href*=".pdf"]')].map(a => ({
              text: (a.textContent || '').trim().substring(0, 200), href: a.href,
              isPdf: a.href.includes('.pdf') || a.querySelector('img[src*="pdf"]') !== null
            })),
          };
        });
        if (isExcludedSubject(courseInfo.title)) { this.stats.excluded++; continue; }
        const subject = courseSubjects[courseUrl] || detectSubject(courseInfo.title) || 'Autres';
        for (const res of courseInfo.resources) {
          if (isExcludedSubject(res.text)) { this.stats.excluded++; continue; }
          this.coursIndex.push({ url: res.href, text: res.text || courseInfo.title, course: courseInfo.title, isPdf: res.isPdf, subject, className: '6eme' });
          this.stats.pdfs++;
        }
      } catch(e) { log('❌', `  Erreur: ${e.message}`); }
    }
    saveJSON('courses_by_subject.json', this.coursesBySubject);
  }

  // ══════════════════════════════════════════════════════════
  // ÉTAPE 4 : TÉLÉCHARGER LES PDFs
  // ══════════════════════════════════════════════════════════
  async downloadFoundPDFs() {
    if (this.coursIndex.length === 0) { log('📭', 'Aucun PDF trouvé.'); return; }
    log('📥', `Téléchargement de ${this.coursIndex.length} PDF(s)...`);
    ensureDir(CONFIG.outputDir);

    for (let i = 0; i < this.coursIndex.length; i++) {
      const cours = this.coursIndex[i];
      const subject = cours.subject || detectSubject(cours.text) || detectSubject(cours.course) || 'Autres';
      const subjectDir = path.join(CONFIG.outputDir, sanitize(subject));
      ensureDir(subjectDir);
      const fileName = sanitize(cours.course || cours.text || `cours_${i + 1}`) + '.pdf';
      const outputPath = path.join(subjectDir, fileName);
      if (fs.existsSync(outputPath)) { continue; }
      log('📥', `[${i+1}/${this.coursIndex.length}] ${subject}/${fileName}`);
      const size = await downloadFile(cours.url, outputPath, this.cookies);
      if (size > 0) { this.stats.downloaded++; this.stats.totalSize += size; }
      else { this.stats.errors++; }
      await sleep(CONFIG.delay);
    }
  }

  // ══════════════════════════════════════════════════════════
  // 🚀 RUN
  // ══════════════════════════════════════════════════════════
  async run() {
    try {
      await this.init();
      ensureDir(CONFIG.outputDir);
      ensureDir(CONFIG.dataDir);

      console.log('\n═══════════════════════════════════════════════════════');
      console.log('║  📚 SCRAPER 6ÈME - ecole-ci.org                      ║');
      console.log('═══════════════════════════════════════════════════════\n');

      console.log('\n═══ PHASE 1: INSCRIPTION ═══');
      await this.registerVisitor();
      await sleep(2000);

      console.log('\n═══ PHASE 2: CONNEXION ═══');
      const logged = await this.loginVisitor();
      if (!logged) log('⚠️', 'Connexion échouée. Exploration sans auth...');

      console.log('\n═══ PHASE 3: EXPLORATION 6ÈME ═══');
      await this.exploreCollegeCourses();

      console.log('\n═══ PHASE 4: TÉLÉCHARGEMENT ═══');
      await this.downloadFoundPDFs();

      console.log('\n╔════════════════════════════════════════════════════╗');
      console.log('║           📊 RAPPORT FINAL - 6ÈME                  ║');
      console.log('╠════════════════════════════════════════════════════╣');
      console.log(`║ 🌐 Pages: ${this.stats.pages} | 📄 PDFs: ${this.stats.pdfs} | ✅ DL: ${this.stats.downloaded} | ❌ Err: ${this.stats.errors}`);
      console.log(`║ 💾 Taille: ${(this.stats.totalSize/1024/1024).toFixed(1)} MB`);
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

// ═══════════════════════════════════════════════════════════
// ▶️ LANCEMENT
// ═══════════════════════════════════════════════════════════
(async () => {
  const scraper = new EcoleCI6emeScraper();
  await scraper.run();
})();
