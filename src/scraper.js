/**
 * ═══════════════════════════════════════════════════════════
 * 📚 RésuméCI — Scraper ecole-ci.org (COMPLET)
 * ═══════════════════════════════════════════════════════════
 * 1. S'inscrit automatiquement comme visiteur
 * 2. Se connecte
 * 3. Navigue dans chaque classe (3ème, Tle A/C/D)
 * 4. Télécharge TOUS les PDFs organisés par matière
 * ═══════════════════════════════════════════════════════════
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ═══════════════════════════════════════════════════════════
// ⚙️ CONFIGURATION
// ═══════════════════════════════════════════════════════════

const CONFIG = {
  chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  
  baseUrl: 'https://ecole-ci.org',
  loginUrl: 'https://ecole-ci.org/co/loginvisiteur.php',
  registerUrl: 'https://ecole-ci.org/co/inscriptionvisiteur.php',
  
  outputDir: path.join(__dirname, '..', 'pdfs'),
  dataDir: path.join(__dirname, '..', 'data'),
  
  // Compte visiteur (sera créé automatiquement)
  visitor: {
    phone: '0700000001', // Numéro fictif pour inscription
    lastname: 'Diallo',
    firstname: 'Moussa',
    genre: 'Masculin',
    age: '14 à 18 ans',
    pays: "Côte d'Ivoire",
    niveau: 'Lycée',
  },
  
  delay: 1500,
  headless: false, // false = tu vois Chrome (utile pour debug)
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

// ═══════════════════════════════════════════════════════════
// 🌐 SCRAPER
// ═══════════════════════════════════════════════════════════

class EcoleCIScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cookies = [];
    this.coursIndex = [];
    this.stats = { pages: 0, pdfs: 0, downloaded: 0, errors: 0, totalSize: 0 };
  }

  async init() {
    log('🚀', 'Lancement Chrome...');
    this.browser = await puppeteer.launch({
      executablePath: CONFIG.chromePath,
      headless: CONFIG.headless,
      defaultViewport: { width: 1366, height: 900 },
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
    });
    this.page = await this.browser.newPage();
    this.page.setDefaultTimeout(CONFIG.timeout);
    this.page.on('dialog', async d => { await d.accept(); });
    
    // Intercepter les téléchargements
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
  // ÉTAPE 1 : INSCRIPTION VISITEUR
  // ══════════════════════════════════════════════════════════
  async registerVisitor() {
    log('📝', 'Inscription comme visiteur...');
    await this.page.goto(CONFIG.registerUrl, { waitUntil: 'networkidle2' });
    await sleep(2000);
    await this.screenshot('01_register');

    try {
      // Sélectionner niveau : Lycée
      await this.page.select('#niveauenseignement', CONFIG.visitor.niveau);
      await sleep(1500); // Attendre le chargement dynamique des classes
      
      await this.screenshot('02_niveau_selected');
      
      // Voir quelles classes sont disponibles après sélection du niveau
      const classes = await this.page.evaluate(() => {
        const sel = document.querySelector('#classe');
        if (!sel) return [];
        return [...sel.options].map(o => ({ value: o.value, text: o.text }));
      });
      log('📋', `Classes disponibles: ${classes.map(c => c.text).join(', ')}`);
      saveJSON('available_classes.json', classes);

      // Sélectionner une classe (Terminale D par défaut)
      const tleD = classes.find(c => c.value.includes('Tle') || c.value.includes('Terminale') || c.text.includes('Tle'));
      if (tleD) {
        await this.page.select('#classe', tleD.value);
        log('📋', `Classe sélectionnée: ${tleD.text}`);
      } else if (classes.length > 1) {
        await this.page.select('#classe', classes[1].value);
        log('📋', `Classe sélectionnée: ${classes[1].text}`);
      }
      await sleep(1000);

      // Remplir le formulaire
      await this.page.type('#lastname', CONFIG.visitor.lastname, { delay: 50 });
      await this.page.type('#firstname', CONFIG.visitor.firstname, { delay: 50 });
      await this.page.select('#genre', CONFIG.visitor.genre);
      await this.page.select('#ages', CONFIG.visitor.age);
      await this.page.select('#pays', CONFIG.visitor.pays);
      
      await sleep(1000);
      
      // Ville — champ autocomplete, taper "Abidjan" puis sélectionner
      const villeInput = await this.page.$('#autoComplete');
      if (villeInput) {
        await villeInput.click();
        await villeInput.type('Abidjan', { delay: 80 });
        await sleep(2000); // Attendre dropdown
        // Cliquer sur le premier résultat
        const firstResult = await this.page.$('.autoComplete_result, [class*="autoComplete"] li, ul[id*="autoComplete"] li');
        if (firstResult) {
          await firstResult.click();
          log('📍', 'Ville sélectionnée');
        } else {
          // Forcer la valeur
          await this.page.evaluate(() => {
            const input = document.querySelector('#autoComplete');
            if (input) input.value = 'Abidjan - Cocody';
          });
          log('📍', 'Ville forcée: Abidjan - Cocody');
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
      
      // Soumettre — le bouton s'appelle "Enregistrer"
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
      
      // Sauvegarder le HTML pour analyse
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
      // Le login ne demande que le téléphone
      const phoneInput = await this.page.$('#telephone');
      if (phoneInput) {
        await phoneInput.click({ clickCount: 3 });
        await phoneInput.type(CONFIG.visitor.phone, { delay: 50 });
      }

      await this.screenshot('05_login_filled');
      
      // ÉTAPE 1 : Cliquer "Je me connecte" → valide le numéro
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
        this.page.click('#submit, button[name="submit"]').catch(() =>
          this.page.evaluate(() => document.querySelector('#formlogin')?.submit())
        ),
      ]);
      await sleep(2000);
      await this.screenshot('06_phone_validated');
      log('📱', `Après validation téléphone: ${this.page.url()}`);
      
      // ÉTAPE 2 : Le site dit "N° Téléphone correct !" — il faut recliquer
      // Vérifier si on est toujours sur la page de login
      const stillOnLogin = this.page.url().includes('login');
      if (stillOnLogin) {
        log('🔄', 'Étape 2: deuxième clic sur "Je me connecte"...');
        // Le téléphone est peut-être déjà dans le champ, sinon le remettre
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
      
      // Sauvegarder cookies
      this.cookies = await this.page.cookies();
      saveJSON('cookies.json', this.cookies);
      
      // Sauvegarder la page d'accueil connecté
      const html = await this.page.content();
      fs.writeFileSync(path.join(CONFIG.dataDir, 'after_login.html'), html);
      
      // Analyser la page connectée
      const pageInfo = await this.page.evaluate(() => ({
        title: document.title,
        url: window.location.href,
        links: [...document.querySelectorAll('a')].map(a => ({
          text: a.textContent?.trim().substring(0, 150),
          href: a.href
        })).filter(l => l.href && !l.href.startsWith('javascript')),
        iframes: [...document.querySelectorAll('iframe')].map(f => ({ src: f.src })),
        images: [...document.querySelectorAll('img')].map(i => ({ src: i.src, alt: i.alt })).slice(0, 20),
      }));
      
      saveJSON('connected_page.json', pageInfo);
      log('📊', `Page connectée: ${pageInfo.links.length} liens trouvés`);
      
      // Afficher les liens intéressants
      const interestingLinks = pageInfo.links.filter(l => 
        l.text && (l.text.length > 3) &&
        !l.href.includes('login') && !l.href.includes('inscription')
      );
      log('🔗', `Liens intéressants: ${interestingLinks.length}`);
      for (const link of interestingLinks.slice(0, 20)) {
        console.log(`   → "${link.text}" : ${link.href}`);
      }

      // Vérifier si on est bien connecté (plus sur la page login)
      const isLoggedIn = !afterUrl.includes('login');
      if (isLoggedIn) {
        log('✅', 'CONNEXION RÉUSSIE !');
      } else {
        log('⚠️', 'Toujours sur la page login...');
        // Vérifier si la page contient un indice de connexion
        const pageText = await this.page.evaluate(() => document.body.innerText.substring(0, 500));
        log('📄', `Contenu: ${pageText.substring(0, 200)}`);
      }
      return isLoggedIn;
    } catch (e) {
      log('❌', `Erreur connexion: ${e.message}`);
      await this.screenshot('login_error');
      return false;
    }
  }

  // ══════════════════════════════════════════════════════════
  // ÉTAPE 3 : EXPLORER ET TROUVER LES COURS
  // ══════════════════════════════════════════════════════════
  async explorePage(url, depth = 0, visited = new Set()) {
    if (depth > 3 || visited.has(url)) return;
    visited.add(url);
    
    log('🔍', `${'  '.repeat(depth)}Exploration: ${url}`);
    this.stats.pages++;
    
    try {
      await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
      await sleep(CONFIG.delay);
      this.cookies = await this.page.cookies();
      
      const info = await this.page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          // Tous les liens
          links: [...document.querySelectorAll('a')].map(a => ({
            text: (a.textContent || '').trim().substring(0, 200),
            href: a.href,
            classes: a.className,
          })).filter(l => l.href && !l.href.startsWith('javascript') && !l.href.startsWith('mailto')),
          // PDFs spécifiquement
          pdfLinks: [...document.querySelectorAll('a')].filter(a => 
            a.href && (a.href.toLowerCase().includes('.pdf') || a.href.toLowerCase().includes('pdf'))
          ).map(a => ({ text: (a.textContent || '').trim(), href: a.href })),
          // Embeds (parfois les PDFs sont dans des iframe/embed)
          embeds: [...document.querySelectorAll('iframe, embed, object')].map(el => ({
            tag: el.tagName, src: el.src || el.data || '', type: el.type || ''
          })).filter(e => e.src),
          // Boutons/liens de matières
          matiereLinks: [...document.querySelectorAll('a, button, .card, [onclick]')].filter(el => {
            const t = (el.textContent || '').toLowerCase();
            return t.includes('math') || t.includes('français') || t.includes('physique') || 
                   t.includes('chimie') || t.includes('svt') || t.includes('histoire') ||
                   t.includes('philo') || t.includes('anglais') || t.includes('espagnol') ||
                   t.includes('leçon') || t.includes('lecon') || t.includes('cours') ||
                   t.includes('chapitre') || t.includes('matière') || t.includes('matiere');
          }).map(el => ({
            text: (el.textContent || '').trim().substring(0, 100),
            href: el.href || null,
            onclick: el.getAttribute?.('onclick')?.substring(0, 100) || null,
            tag: el.tagName
          }))
        };
      });

      // PDFs trouvés !
      if (info.pdfLinks.length > 0) {
        log('📄', `${'  '.repeat(depth)}🎯 ${info.pdfLinks.length} PDF(s) sur cette page!`);
        for (const pdf of info.pdfLinks) {
          log('📥', `${'  '.repeat(depth)}  → ${pdf.text || 'PDF'}: ${pdf.href}`);
          this.coursIndex.push({ url: pdf.href, text: pdf.text, source: url, depth });
          this.stats.pdfs++;
        }
      }

      // Embeds avec PDFs
      if (info.embeds.length > 0) {
        for (const embed of info.embeds) {
          if (embed.src.includes('.pdf') || embed.type.includes('pdf')) {
            log('📄', `${'  '.repeat(depth)}🎯 PDF embed: ${embed.src}`);
            this.coursIndex.push({ url: embed.src, text: `Embed ${embed.tag}`, source: url, depth });
            this.stats.pdfs++;
          }
        }
      }

      // Liens de matières
      if (info.matiereLinks.length > 0) {
        log('📚', `${'  '.repeat(depth)}${info.matiereLinks.length} liens de matières`);
        for (const ml of info.matiereLinks) {
          console.log(`   ${'  '.repeat(depth)}→ [${ml.tag}] "${ml.text}" ${ml.href || ml.onclick || ''}`);
        }
      }

      // Explorer les sous-liens intéressants (cours, matières, etc.)
      const subLinks = info.links.filter(l => {
        const t = l.text.toLowerCase();
        const h = l.href.toLowerCase();
        return (
          h.includes('cours') || h.includes('lecon') || h.includes('matiere') ||
          h.includes('chapitre') || h.includes('classe') || h.includes('pdf') ||
          h.includes('fichier') || h.includes('ressource') || h.includes('contenu') ||
          t.includes('cours') || t.includes('leçon') || t.includes('voir') ||
          t.includes('accéder') || t.includes('télécharger') || t.includes('ouvrir')
        ) && !h.includes('login') && !h.includes('inscription') && !h.includes('logout');
      });

      if (subLinks.length > 0 && depth < 3) {
        log('🔗', `${'  '.repeat(depth)}${subLinks.length} sous-liens à explorer`);
        for (const sub of subLinks) {
          await this.explorePage(sub.href, depth + 1, visited);
        }
      }

      // Sauvegarder les infos
      const safeName = url.replace(/[^a-z0-9]/gi, '_').substring(0, 80);
      saveJSON(`page_${safeName}.json`, info);

    } catch (e) {
      log('❌', `${'  '.repeat(depth)}Erreur: ${e.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // ÉTAPE 4 : TÉLÉCHARGER LES PDFs
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
      const fileName = sanitize(cours.text || `cours_${i + 1}`) + '.pdf';
      const outputPath = path.join(CONFIG.outputDir, fileName);

      if (fs.existsSync(outputPath)) {
        log('⏭️', `[${i+1}/${this.coursIndex.length}] Déjà: ${fileName}`);
        continue;
      }

      log('📥', `[${i+1}/${this.coursIndex.length}] ${fileName}`);
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

      // ── Phase 1 : Inscription ──
      console.log('\n═══ PHASE 1: INSCRIPTION ═══');
      await this.registerVisitor();
      await sleep(2000);

      // ── Phase 2 : Connexion ──
      console.log('\n═══ PHASE 2: CONNEXION ═══');
      const logged = await this.loginVisitor();
      
      if (!logged) {
        log('⚠️', 'Connexion échouée. Exploration sans auth...');
      }

      // ── Phase 3 : Explorer le catalogue Moodle ──
      console.log('\n═══ PHASE 3: EXPLORATION MOODLE ═══');
      
      // Le site est un Moodle ! L'URL des cours est:
      const courseListUrl = 'https://lyc.ecole-ci.org/course/';
      log('🌐', `Accès au catalogue: ${courseListUrl}`);
      
      await this.page.goto(courseListUrl, { waitUntil: 'networkidle2' });
      await sleep(2000);
      await this.screenshot('08_course_list');
      this.cookies = await this.page.cookies();
      
      // Récupérer les catégories et cours
      const moodleInfo = await this.page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          // Catégories de cours
          categories: [...document.querySelectorAll('.category, .categoryname, a[href*="category"], .coursebox, .course-category')].map(el => ({
            text: (el.textContent || '').trim().substring(0, 200),
            href: el.href || el.querySelector('a')?.href || null,
            tag: el.tagName, cls: el.className?.substring(0, 100)
          })),
          // Liens vers les cours
          courseLinks: [...document.querySelectorAll('a[href*="/course/view.php"], a[href*="/course/index.php"]')].map(a => ({
            text: (a.textContent || '').trim().substring(0, 200),
            href: a.href
          })),
          // Tous les liens
          allLinks: [...document.querySelectorAll('a')].map(a => ({
            text: (a.textContent || '').trim().substring(0, 200),
            href: a.href,
            cls: a.className?.substring(0, 50)
          })).filter(l => l.href && !l.href.startsWith('javascript') && !l.href.includes('#')),
          // Contenu texte brut pour debug
          bodyText: document.body.innerText.substring(0, 3000)
        };
      });
      
      saveJSON('moodle_course_list.json', moodleInfo);
      log('📋', `Catégories: ${moodleInfo.categories.length}`);
      log('📋', `Liens cours: ${moodleInfo.courseLinks.length}`);
      log('📋', `Total liens: ${moodleInfo.allLinks.length}`);
      
      // Afficher les liens cours
      for (const c of moodleInfo.courseLinks.slice(0, 30)) {
        console.log(`   📚 "${c.text}" → ${c.href}`);
      }
      
      // Si pas de courseLinks directs, chercher dans les catégories
      const categoryLinks = moodleInfo.allLinks.filter(l =>
        l.href.includes('course/index.php?categoryid=') ||
        l.href.includes('course/view.php?id=') ||
        l.href.includes('course/')
      );
      log('📂', `Liens catégories/cours Moodle: ${categoryLinks.length}`);
      for (const c of categoryLinks.slice(0, 30)) {
        console.log(`   📂 "${c.text}" → ${c.href}`);
      }
      
      // Explorer chaque catégorie puis chaque cours pour trouver les PDFs
      const visited = new Set();
      const coursePages = new Set();
      
      // D'abord les catégories
      for (const cat of categoryLinks) {
        if (visited.has(cat.href) || !cat.href.includes('ecole-ci.org')) continue;
        visited.add(cat.href);
        
        log('📂', `Catégorie: "${cat.text}"`);
        try {
          await this.page.goto(cat.href, { waitUntil: 'networkidle2', timeout: 20000 });
          await sleep(1000);
          
          const subInfo = await this.page.evaluate(() => ({
            courses: [...document.querySelectorAll('a[href*="/course/view.php"]')].map(a => ({
              text: (a.textContent || '').trim().substring(0, 200),
              href: a.href
            })),
            subCats: [...document.querySelectorAll('a[href*="course/index.php?categoryid="]')].map(a => ({
              text: (a.textContent || '').trim().substring(0, 200),
              href: a.href
            })),
            pdfs: [...document.querySelectorAll('a[href*=".pdf"], a[href*="/pluginfile.php"], a[href*="/mod/resource"]')].map(a => ({
              text: (a.textContent || '').trim().substring(0, 200),
              href: a.href
            }))
          }));
          
          // Ajouter les sous-catégories à explorer
          for (const sc of subInfo.subCats) {
            if (!visited.has(sc.href)) categoryLinks.push(sc);
          }
          
          // Ajouter les cours à explorer
          for (const course of subInfo.courses) {
            coursePages.add(course.href);
          }
          
          // PDFs directs
          for (const pdf of subInfo.pdfs) {
            this.coursIndex.push({ url: pdf.href, text: pdf.text, source: cat.href, category: cat.text });
            this.stats.pdfs++;
          }
          
          if (subInfo.pdfs.length > 0) log('📄', `  🎯 ${subInfo.pdfs.length} PDF(s)!`);
          if (subInfo.courses.length > 0) log('📚', `  ${subInfo.courses.length} cours à explorer`);
          
        } catch(e) { log('❌', `  Erreur: ${e.message}`); }
      }
      
      // Ensuite explorer chaque page de cours
      log('📚', `Exploration de ${coursePages.size} cours...`);
      for (const courseUrl of coursePages) {
        if (visited.has(courseUrl)) continue;
        visited.add(courseUrl);
        
        try {
          await this.page.goto(courseUrl, { waitUntil: 'networkidle2', timeout: 20000 });
          await sleep(1000);
          this.stats.pages++;
          
          const courseInfo = await this.page.evaluate(() => {
            const title = document.querySelector('h1, .page-header-headings h1, .course-title')?.textContent?.trim() || document.title;
            return {
              title,
              // PDFs et ressources dans Moodle
              resources: [...document.querySelectorAll(
                'a[href*="/pluginfile.php"], a[href*="/mod/resource/view.php"], a[href*=".pdf"], ' +
                'a[href*="/mod/folder/"], a[href*="/mod/url/"]'
              )].map(a => ({
                text: (a.textContent || '').trim().substring(0, 200),
                href: a.href,
                isPdf: a.href.includes('.pdf') || a.querySelector('img[src*="pdf"]') !== null
              })),
              // Toutes les activités Moodle
              activities: [...document.querySelectorAll('.activity, .activityinstance a')].map(a => ({
                text: (a.textContent || '').trim().substring(0, 200),
                href: a.href || null
              })),
              // Sections
              sections: [...document.querySelectorAll('.section .sectionname, .course-section-header')].map(s => 
                s.textContent?.trim().substring(0, 200)
              )
            };
          });
          
          log('📖', `Cours: "${courseInfo.title}" — ${courseInfo.resources.length} ressources, ${courseInfo.sections.length} sections`);
          
          for (const res of courseInfo.resources) {
            this.coursIndex.push({ 
              url: res.href, text: res.text || courseInfo.title, 
              source: courseUrl, course: courseInfo.title, isPdf: res.isPdf 
            });
            this.stats.pdfs++;
            log('📄', `  → ${res.text || 'Ressource'}`);
          }
          
        } catch(e) { log('❌', `  Erreur: ${e.message}`); }
      }

      // ── Phase 4 : Téléchargement ──
      console.log('\n═══ PHASE 4: TÉLÉCHARGEMENT ═══');
      await this.downloadFoundPDFs();

      // ── Rapport ──
      console.log('\n');
      console.log('╔═══════════════════════════════════════╗');
      console.log('║     📊 RAPPORT FINAL                  ║');
      console.log('╠═══════════════════════════════════════╣');
      console.log(`║ 🌐 Pages explorées: ${String(this.stats.pages).padStart(5)}           ║`);
      console.log(`║ 📄 PDFs trouvés:    ${String(this.stats.pdfs).padStart(5)}           ║`);
      console.log(`║ ✅ Téléchargés:     ${String(this.stats.downloaded).padStart(5)}           ║`);
      console.log(`║ ❌ Erreurs:         ${String(this.stats.errors).padStart(5)}           ║`);
      console.log(`║ 💾 Taille totale:   ${(this.stats.totalSize/1024/1024).toFixed(1).padStart(5)} MB        ║`);
      console.log('╚═══════════════════════════════════════╝');
      
      saveJSON('cours_index.json', this.coursIndex);
      saveJSON('final_stats.json', this.stats);
      
      console.log('\n📁 PDFs dans:     ' + CONFIG.outputDir);
      console.log('📁 Analyses dans: ' + CONFIG.dataDir);
      console.log('\n📸 Screenshots dans data/ pour voir chaque étape');
      console.log('💡 Ouvre les fichiers .json dans data/ pour comprendre la structure du site\n');

    } catch (e) {
      log('❌', `ERREUR FATALE: ${e.message}`);
      console.error(e);
    } finally {
      // Attendre 5s avant de fermer (pour voir le résultat)
      await sleep(5000);
      await this.close();
    }
  }
}

// ═══════════════════════════════════════════════════════════
// ▶️ LANCEMENT
// ═══════════════════════════════════════════════════════════

(async () => {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║  📚 RésuméCI — Scraper ecole-ci.org   ║');
  console.log('║  Téléchargement auto des cours PDF    ║');
  console.log('╚═══════════════════════════════════════╝\n');

  const scraper = new EcoleCIScraper();
  await scraper.run();
})();
