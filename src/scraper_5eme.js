/**
 * ═══════════════════════════════════════════════════════════
 * 📚 RésuméCI — Scraper ecole-ci.org pour 5ème
 * ═══════════════════════════════════════════════════════════
 * 1. S'inscrit automatiquement comme visiteur (Collège - 5ème)
 * 2. Se connecte
 * 3. Navigue dans la classe 5ème
 * 4. Télécharge TOUS les PDFs organisés par matière
 * 5. EXCLUT: Arts Plastiques, Musique, Anglais
 * ═══════════════════════════════════════════════════════════
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ═══════════════════════════════════════════════════════════
// ⚙️ CONFIGURATION 5ÈME
// ═══════════════════════════════════════════════════════════

const CONFIG = {
  chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  
  baseUrl: 'https://ecole-ci.org',
  loginUrl: 'https://ecole-ci.org/co/loginvisiteur.php',
  registerUrl: 'https://ecole-ci.org/co/inscriptionvisiteur.php',
  
  outputDir: path.join(__dirname, '..', 'Cours_5eme'),
  dataDir: path.join(__dirname, '..', 'data_5eme'),
  
  // Compte visiteur pour Collège 5ème
  visitor: {
    phone: '0700000005',
    lastname: 'Kouassi',
    firstname: 'Ama',
    genre: 'Féminin',
    age: '10 à 14 ans',
    pays: "Côte d'Ivoire",
    niveau: 'Collège',
    classe: '5ème',
  },
  
  // Matières à EXCLURE
  excludedSubjects: [
    'arts plastiques',
    'art plastique',
    'plastique',
    'musique',
    'education musicale',
    'éducation musicale',
    'anglais',
    'english'
  ],
  
  // Matières du Collège à inclure (tout sauf les exclus)
  targetSubjects: [
    'français',
    'mathématiques',
    'math',
    'physique',
    'chimie',
    'physique-chimie',
    'pc',
    'svt',
    'sciences de la vie',
    'sciences vie terre',
    'histoire',
    'géographie',
    'hg',
    'histoire-géographie',
    'eps',
    'éducation physique',
    'allemand',
    'espagnol',
    'latin',
    'informatique',
    'technologie',
    'ci',
    'civisme'
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
      maxRedirects: 5,
      httpsAgent,
    });
    fs.writeFileSync(outputPath, resp.data);
    return resp.data.length;
  } catch (e) {
    log('❌', `Download err: ${e.message}`);
    return 0;
  }
}

// Vérifie si une matière doit être exclue
function isExcludedSubject(text) {
  const lowerText = text.toLowerCase();
  return CONFIG.excludedSubjects.some(excluded => lowerText.includes(excluded));
}

// Détecte la matière à partir du texte
function detectSubject(text) {
  const lowerText = text.toLowerCase();
  
  const subjectMap = {
    'français': 'Français',
    'francais': 'Français',
    'mathématiques': 'Mathematiques',
    'mathematiques': 'Mathematiques',
    'mathématique': 'Mathematiques',
    'math': 'Mathematiques',
    'algèbre': 'Mathematiques',
    'géométrie': 'Mathematiques',
    'physique-chimie': 'Physique-Chimie',
    'physique chimie': 'Physique-Chimie',
    'pc': 'Physique-Chimie',
    'physique': 'Physique-Chimie',
    'chimie': 'Physique-Chimie',
    'svt': 'SVT',
    'sciences de la vie': 'SVT',
    'sciences vie': 'SVT',
    'biologie': 'SVT',
    'histoire-géographie': 'Histoire-Geographie',
    'histoire-géo': 'Histoire-Geographie',
    'histoire géographie': 'Histoire-Geographie',
    'hg': 'Histoire-Geographie',
    'histoire': 'Histoire-Geographie',
    'géographie': 'Histoire-Geographie',
    'eps': 'EPS',
    'éducation physique': 'EPS',
    'sport': 'EPS',
    'allemand': 'Allemand',
    'espagnol': 'Espagnol',
    'latin': 'Latin',
    'informatique': 'Informatique',
    'technologie': 'Technologie',
    'civisme': 'Civisme',
    'civique': 'Civisme',
    'instruction civique': 'Civisme'
  };
  
  for (const [key, value] of Object.entries(subjectMap)) {
    if (lowerText.includes(key)) return value;
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════
// 🌐 SCRAPER 5ÈME
// ═══════════════════════════════════════════════════════════

class EcoleCI5emeScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookies = [];
    this.coursIndex = [];
    this.stats = { pages: 0, pdfs: 0, downloaded: 0, errors: 0, totalSize: 0, excluded: 0 };
    this.coursesBySubject = {};
  }

  async init() {
    log('🚀', 'Lancement Chrome pour 5ème...');
    this.browser = await puppeteer.launch({
      executablePath: CONFIG.chromePath,
      headless: CONFIG.headless,
      defaultViewport: { width: 1366, height: 900 },
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security',
             '--ignore-certificate-errors', '--ignore-certificate-errors-spki-list',
             '--ignore-ssl-errors', '--allow-insecure-localhost', '--allow-running-insecure-content'],
    });
    this.page = await this.browser.newPage();
    this.page.setDefaultTimeout(CONFIG.timeout);
    this.page.on('dialog', async d => { await d.accept(); });
    
    const client = await this.page.createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: CONFIG.outputDir,
    });
    
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
  // ÉTAPE 1 : INSCRIPTION VISITEUR (Collège 5ème)
  // ══════════════════════════════════════════════════════════
  async registerVisitor() {
    log('📝', 'Inscription comme visiteur (Collège 5ème)...');
    await this.page.goto(CONFIG.registerUrl, { waitUntil: 'networkidle2' });
    await sleep(2000);
    await this.screenshot('01_register');

    try {
      // Sélectionner niveau : Collège
      await this.page.select('#niveauenseignement', CONFIG.visitor.niveau);
      await sleep(2000);
      await this.screenshot('02_niveau_selected');
      
      // Voir quelles classes sont disponibles
      const classes = await this.page.evaluate(() => {
        const sel = document.querySelector('#classe');
        if (!sel) return [];
        return [...sel.options].map(o => ({ value: o.value, text: o.text }));
      });
      log('📋', `Classes disponibles: ${classes.map(c => c.text).join(', ')}`);
      saveJSON('available_classes.json', classes);

      // Sélectionner 5ème (CINQUIÈME spécifiquement)
      const cinquieme = classes.find(c => {
        const txt = c.text.toLowerCase();
        const val = c.value.toLowerCase();
        return txt.includes('cinqui') ||
               val.includes('cinqui') ||
               txt === '5ème' || txt === '5eme' ||
               val === '5ème' || val === '5eme' ||
               txt.match(/^5\s*[èe]me/) ||
               val.match(/^5\s*[èe]me/);
      });
      
      if (cinquieme) {
        await this.page.select('#classe', cinquieme.value);
        log('📋', `Classe sélectionnée: ${cinquieme.text}`);
        CONFIG.visitor.classe = cinquieme.text;
      } else if (classes.length > 1) {
        // Prendre la première classe disponible qui semble être du collège
        const collegeClass = classes.find(c => 
          c.text.toLowerCase().includes('eme') || 
          c.text.toLowerCase().includes('collège') ||
          c.text.toLowerCase().includes('4') ||
          c.text.toLowerCase().includes('3')
        ) || classes[1];
        await this.page.select('#classe', collegeClass.value);
        log('📋', `Classe sélectionnée: ${collegeClass.text}`);
      }
      await sleep(1000);

      // Remplir le formulaire
      await this.page.type('#lastname', CONFIG.visitor.lastname, { delay: 50 });
      await this.page.type('#firstname', CONFIG.visitor.firstname, { delay: 50 });
      await this.page.select('#genre', CONFIG.visitor.genre);
      await this.page.select('#ages', CONFIG.visitor.age);
      await this.page.select('#pays', CONFIG.visitor.pays);
      
      await sleep(1000);
      
      // Ville
      const villeInput = await this.page.$('#autoComplete');
      if (villeInput) {
        await villeInput.click();
        await villeInput.type('Abidjan', { delay: 80 });
        await sleep(2000);
        const firstResult = await this.page.$('.autoComplete_result, [class*="autoComplete"] li, ul[id*="autoComplete"] li');
        if (firstResult) {
          await firstResult.click();
          log('📍', 'Ville sélectionnée');
        } else {
          await this.page.evaluate(() => {
            const input = document.querySelector('#autoComplete');
            if (input) input.value = 'Abidjan - Cocody';
          });
        }
      }
      await sleep(500);
      
      // Numéro de téléphone
      const phoneInput = await this.page.$('#telephone');
      if (phoneInput) {
        await phoneInput.click({ clickCount: 3 });
        await phoneInput.type(CONFIG.visitor.phone, { delay: 50 });
      }
      
      // Zone urbaine
      const urbanRadio = await this.page.$('#zoneurbaine');
      if (urbanRadio) await urbanRadio.click();
      
      // École publique
      const publicRadio = await this.page.$('#ecolepublic');
      if (publicRadio) await publicRadio.click();
      
      await sleep(500);
      await this.screenshot('03_form_filled');
      
      // Soumettre
      log('📤', 'Soumission du formulaire...');
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
        this.page.click('input[name="submit"], button[name="submit"], button.btn-success, input.btn-success').catch(() => 
          this.page.evaluate(() => document.querySelector('#authentification')?.submit())
        ),
      ]);
      
      await sleep(3000);
      await this.screenshot('04_after_register');
      
      const afterUrl = this.page.url();
      log('🌐', `Après inscription: ${afterUrl}`);
      
      const html = await this.page.content();
      fs.writeFileSync(path.join(CONFIG.dataDir, 'after_register.html'), html);
      
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
      if (phoneInput) {
        await phoneInput.click({ clickCount: 3 });
        await phoneInput.type(CONFIG.visitor.phone, { delay: 50 });
      }

      await this.screenshot('05_login_filled');
      
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
        this.page.click('#submit, button[name="submit"]').catch(() =>
          this.page.evaluate(() => document.querySelector('#formlogin')?.submit())
        ),
      ]);
      await sleep(2000);
      await this.screenshot('06_phone_validated');
      
      const stillOnLogin = this.page.url().includes('login');
      if (stillOnLogin) {
        log('🔄', 'Étape 2: deuxième clic...');
        const phoneInput2 = await this.page.$('#telephone');
        if (phoneInput2) {
          const val = await this.page.evaluate(() => document.querySelector('#telephone')?.value);
          if (!val || val.length < 5) {
            await phoneInput2.click({ clickCount: 3 });
            await phoneInput2.type(CONFIG.visitor.phone, { delay: 50 });
          }
        }
        
        await Promise.all([
          this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
          this.page.click('#submit, button[name="submit"]').catch(() =>
            this.page.evaluate(() => document.querySelector('#formlogin')?.submit())
          ),
        ]);
        await sleep(3000);
      }
      
      await this.screenshot('07_after_login');
      
      const afterUrl = this.page.url();
      log('🌐', `Après connexion: ${afterUrl}`);
      
      this.cookies = await this.page.cookies();
      saveJSON('cookies.json', this.cookies);
      
      const html = await this.page.content();
      fs.writeFileSync(path.join(CONFIG.dataDir, 'after_login.html'), html);
      
      const isLoggedIn = !afterUrl.includes('login');
      if (isLoggedIn) {
        log('✅', 'CONNEXION RÉUSSIE !');
      }
      return isLoggedIn;
    } catch (e) {
      log('❌', `Erreur connexion: ${e.message}`);
      await this.screenshot('login_error');
      return false;
    }
  }

  // ══════════════════════════════════════════════════════════
  // ÉTAPE 3 : EXPLORER MOODLE COLLÈGE 5ÈME
  // ══════════════════════════════════════════════════════════
  async exploreCollegeCourses() {
    log('🏫', 'Exploration des cours du Collège...');
    
    // URL Moodle pour le collège
    const collegeUrl = 'https://coll.ecole-ci.org/course/';
    log('🌐', `Accès au catalogue Collège: ${collegeUrl}`);
    
    await this.page.goto(collegeUrl, { waitUntil: 'networkidle2' });
    await sleep(2000);
    await this.screenshot('08_course_list');
    this.cookies = await this.page.cookies();
    
    // Récupérer toutes les catégories et cours
    const moodleInfo = await this.page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        categories: [...document.querySelectorAll('.category, .categoryname, a[href*="category"], .coursebox, .course-category')].map(el => ({
          text: (el.textContent || '').trim().substring(0, 200),
          href: el.href || el.querySelector('a')?.href || null,
          tag: el.tagName, cls: el.className?.substring(0, 100)
        })),
        courseLinks: [...document.querySelectorAll('a[href*="/course/view.php"], a[href*="/course/index.php"]')].map(a => ({
          text: (a.textContent || '').trim().substring(0, 200),
          href: a.href
        })),
        allLinks: [...document.querySelectorAll('a')].map(a => ({
          text: (a.textContent || '').trim().substring(0, 200),
          href: a.href,
          cls: a.className?.substring(0, 50)
        })).filter(l => l.href && !l.href.startsWith('javascript') && !l.href.includes('#')),
      };
    });
    
    saveJSON('moodle_course_list.json', moodleInfo);
    log('📋', `Catégories: ${moodleInfo.categories.length}`);
    log('📋', `Liens cours: ${moodleInfo.courseLinks.length}`);
    
    // Explorer chaque catégorie pour trouver la 5ème
    const visited = new Set();
    const coursePages = new Set();
    const courseSubjects = {}; // url -> subject
    
    // Chercher les liens de catégories
    const categoryLinks = moodleInfo.allLinks.filter(l =>
      l.href.includes('course/index.php?categoryid=') ||
      l.href.includes('course/')
    );
    
    log('📂', `Liens catégories/cours: ${categoryLinks.length}`);
    
    // ÉTAPE 1: Trouver la catégorie CINQUIEME et y entrer
    const cinquiemeCategory = categoryLinks.find(cat => {
      const t = cat.text.toLowerCase();
      return t.includes('cinqui') || t === '5ème' || t === '5eme' || t.match(/^5\s*[èe]me/);
    });
    
    if (!cinquiemeCategory) {
      log('❌', 'Catégorie CINQUIEME introuvable');
      return;
    }
    
    log('✅', `Catégorie CINQUIEME trouvée: ${cinquiemeCategory.href}`);
    
    // ÉTAPE 2: Explorer récursivement la 5ème (matières + cours)
    const queue = [{ url: cinquiemeCategory.href, label: 'CINQUIEME', subject: null }];
    
    while (queue.length > 0) {
      const { url, label, subject: parentSubject } = queue.shift();
      if (visited.has(url) || !url.includes('ecole-ci.org')) continue;
      visited.add(url);
      
      log('📂', `Exploration: "${label}"`);
      
      // Vérifier exclusion de matière
      if (isExcludedSubject(label)) {
        log('🚫', `EXCLU (matière): "${label}"`);
        this.stats.excluded++;
        continue;
      }
      
      try {
        await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
        await sleep(1500);
        
        const subInfo = await this.page.evaluate(() => ({
          title: document.title,
          courses: [...document.querySelectorAll('a[href*="/course/view.php"]')].map(a => ({
            text: (a.textContent || '').trim().substring(0, 200),
            href: a.href
          })),
          subCats: [...document.querySelectorAll('a[href*="course/index.php?categoryid="]')].map(a => ({
            text: (a.textContent || '').trim().substring(0, 200),
            href: a.href
          })),
        }));
        
        log('📚', `  ${subInfo.courses.length} cours, ${subInfo.subCats.length} sous-catégories`);
        
        // Ajouter les cours de cette catégorie
        for (const course of subInfo.courses) {
          if (isExcludedSubject(course.text)) {
            log('🚫', `  EXCLU: "${course.text}"`);
            this.stats.excluded++;
            continue;
          }
          
          // Le sujet vient du parent (matière) ou détecté à partir du nom du cours
          const subject = parentSubject || detectSubject(course.text) || detectSubject(label) || 'Autres';
          
          coursePages.add(course.href);
          courseSubjects[course.href] = subject;
          
          if (!this.coursesBySubject[subject]) this.coursesBySubject[subject] = [];
          this.coursesBySubject[subject].push(course);
          log('  📖', `[${subject}] ${course.text}`);
        }
        
        // Ajouter les sous-catégories à explorer
        for (const subCat of subInfo.subCats) {
          if (visited.has(subCat.href)) continue;
          if (isExcludedSubject(subCat.text)) {
            log('🚫', `  Sous-cat EXCLUE: "${subCat.text}"`);
            this.stats.excluded++;
            continue;
          }
          // Le subject est la sous-catégorie elle-même (matière)
          const subjectName = parentSubject || detectSubject(subCat.text) || subCat.text;
          queue.push({ url: subCat.href, label: subCat.text, subject: subjectName });
        }
        
      } catch(e) { 
        log('❌', `  Erreur: ${e.message}`); 
      }
    }
    
    // Explorer chaque page de cours pour trouver les PDFs
    log('📚', `Exploration de ${coursePages.size} cours...`);
    
    for (const courseUrl of coursePages) {
      if (visited.has(courseUrl)) continue;
      visited.add(courseUrl);
      
      try {
        await this.page.goto(courseUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await sleep(1500);
        this.stats.pages++;
        
        const courseInfo = await this.page.evaluate(() => {
          const title = document.querySelector('h1, .page-header-headings h1, .course-title')?.textContent?.trim() || document.title;
          return {
            title,
            resources: [...document.querySelectorAll(
              'a[href*="/pluginfile.php"], a[href*="/mod/resource/view.php"], a[href*=".pdf"], a[href*="/mod/folder/"], a[href*="/mod/url/"]'
            )].map(a => ({
              text: (a.textContent || '').trim().substring(0, 200),
              href: a.href,
              isPdf: a.href.includes('.pdf') || a.querySelector('img[src*="pdf"]') !== null
            })),
            sections: [...document.querySelectorAll('.section .sectionname, .course-section-header')].map(s => 
              s.textContent?.trim().substring(0, 200)
            )
          };
        });
        
        // Vérifier exclusion
        if (isExcludedSubject(courseInfo.title)) {
          log('🚫', `EXCLU: "${courseInfo.title}"`);
          this.stats.excluded++;
          continue;
        }
        
        const subject = courseSubjects[courseUrl] || detectSubject(courseInfo.title) || 'Autres';
        
        log('📖', `Cours: "${courseInfo.title}" — ${courseInfo.resources.length} ressources`);
        
        for (const res of courseInfo.resources) {
          // Vérifier si la ressource est exclue
          if (isExcludedSubject(res.text)) {
            log('🚫', `  → EXCLU: "${res.text}"`);
            this.stats.excluded++;
            continue;
          }
          
          this.coursIndex.push({ 
            url: res.href, 
            text: res.text || courseInfo.title, 
            source: courseUrl, 
            course: courseInfo.title, 
            isPdf: res.isPdf,
            subject: subject,
            className: '5eme'
          });
          this.stats.pdfs++;
          log('📄', `  → [${subject}] ${res.text || 'Ressource'}`);
        }
        
      } catch(e) { 
        log('❌', `  Erreur: ${e.message}`); 
      }
    }
    
    saveJSON('courses_by_subject.json', this.coursesBySubject);
  }

  // ══════════════════════════════════════════════════════════
  // ÉTAPE 4 : TÉLÉCHARGER LES PDFs ORGANISÉS PAR MATIÈRE
  // ══════════════════════════════════════════════════════════
  async downloadFoundPDFs() {
    if (this.coursIndex.length === 0) {
      log('📭', 'Aucun PDF trouvé.');
      return;
    }

    log('📥', `Téléchargement de ${this.coursIndex.length} PDF(s)...`);
    ensureDir(CONFIG.outputDir);

    for (let i = 0; i < this.coursIndex.length; i++) {
      const cours = this.coursIndex[i];
      
      // Déterminer le dossier de destination par matière
      const subject = cours.subject || detectSubject(cours.text) || detectSubject(cours.course) || 'Autres';
      const subjectDir = path.join(CONFIG.outputDir, sanitize(subject));
      ensureDir(subjectDir);
      
      // Utiliser le titre du cours (pas le texte du lien qui est souvent "Je lis le résumé")
      const baseName = cours.course || cours.text || `cours_${i + 1}`;
      const fileName = sanitize(baseName) + '.pdf';
      const outputPath = path.join(subjectDir, fileName);

      if (fs.existsSync(outputPath)) {
        log('⏭️', `[${i+1}/${this.coursIndex.length}] Déjà: ${subject}/${fileName}`);
        continue;
      }

      log('📥', `[${i+1}/${this.coursIndex.length}] ${subject}/${fileName}`);
      const size = await downloadFile(cours.url, outputPath, this.cookies);
      
      if (size > 0) {
        this.stats.downloaded++;
        this.stats.totalSize += size;
        cours.localPath = outputPath;
        cours.size = size;
      } else {
        this.stats.errors++;
      }
      
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
      console.log('║  📚 SCRAPER 5ÈME - ecole-ci.org                      ║');
      console.log('║  Classe: 5ème                                        ║');
      console.log('║  Exclus: Arts Plastiques, Musique, Anglais          ║');
      console.log('═══════════════════════════════════════════════════════\n');

      // Phase 1 : Inscription
      console.log('\n═══ PHASE 1: INSCRIPTION ═══');
      await this.registerVisitor();
      await sleep(2000);

      // Phase 2 : Connexion
      console.log('\n═══ PHASE 2: CONNEXION ═══');
      const logged = await this.loginVisitor();
      
      if (!logged) {
        log('⚠️', 'Connexion échouée. Exploration sans auth...');
      }

      // Phase 3 : Explorer les cours 5ème
      console.log('\n═══ PHASE 3: EXPLORATION 5ÈME ═══');
      await this.exploreCollegeCourses();

      // Phase 4 : Téléchargement
      console.log('\n═══ PHASE 4: TÉLÉCHARGEMENT ═══');
      await this.downloadFoundPDFs();

      // Rapport
      console.log('\n');
      console.log('╔════════════════════════════════════════════════════╗');
      console.log('║           📊 RAPPORT FINAL - 5ÈME                  ║');
      console.log('╠════════════════════════════════════════════════════╣');
      console.log(`║ 🌐 Pages explorées: ${String(this.stats.pages).padStart(5)}                      ║`);
      console.log(`║ 📄 PDFs trouvés:    ${String(this.stats.pdfs).padStart(5)}                      ║`);
      console.log(`║ 🚫 Exclus:          ${String(this.stats.excluded).padStart(5)}                      ║`);
      console.log(`║ ✅ Téléchargés:     ${String(this.stats.downloaded).padStart(5)}                      ║`);
      console.log(`║ ❌ Erreurs:         ${String(this.stats.errors).padStart(5)}                      ║`);
      console.log(`║ 💾 Taille totale:   ${(this.stats.totalSize/1024/1024).toFixed(1).padStart(5)} MB                   ║`);
      console.log('╚════════════════════════════════════════════════════╝');
      
      // Afficher les matières trouvées
      console.log('\n📚 Matières trouvées:');
      for (const [subject, courses] of Object.entries(this.coursesBySubject)) {
        console.log(`   📂 ${subject}: ${courses.length} cours`);
      }
      
      saveJSON('cours_index.json', this.coursIndex);
      saveJSON('final_stats.json', this.stats);
      
      console.log('\n📁 PDFs organisés par matière dans: ' + CONFIG.outputDir);
      console.log('📁 Analyses dans: ' + CONFIG.dataDir);

    } catch (e) {
      log('❌', `ERREUR FATALE: ${e.message}`);
      console.error(e);
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
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  📚 RésuméCI — Scraper 5ème ecole-ci.org            ║');
  console.log('║  Téléchargement auto des cours PDF                  ║');
  console.log('║  Exclus: Arts Plastiques, Musique, Anglais         ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const scraper = new EcoleCI5emeScraper();
  await scraper.run();
})();
