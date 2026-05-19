/**
 * ═══════════════════════════════════════════════════════════
 * 📥 RésuméCI — Re-download PDFs from saved cours_index.json
 * ═══════════════════════════════════════════════════════════
 * Uses Puppeteer to resolve Moodle resource URLs to actual
 * PDF files, then downloads them with proper SSL handling.
 * ═══════════════════════════════════════════════════════════
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const CONFIG = {
  chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  baseUrl: 'https://ecole-ci.org',
  loginUrl: 'https://ecole-ci.org/co/loginvisiteur.php',
  outputDir: path.join(__dirname, '..', 'pdfs'),
  dataDir: path.join(__dirname, '..', 'data'),
  indexFile: path.join(__dirname, '..', 'data', 'cours_index.json'),
  headless: false,
  timeout: 30000,
  delay: 500,
  visitor: {
    telephone: '0700000001',
  },
};

function log(icon, msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${icon} ${msg}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sanitize(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/_{2,}/g, '_').substring(0, 120);
}

async function downloadWithAxios(url, outputPath, cookies) {
  try {
    const cookieStr = (cookies || []).map(c => `${c.name}=${c.value}`).join('; ');
    
    // For Moodle resource URLs, append redirect=1 to force direct file download
    let downloadUrl = url;
    if (url.includes('mod/resource/view.php') && !url.includes('redirect=1')) {
      downloadUrl = url + (url.includes('?') ? '&' : '?') + 'redirect=1';
    }
    
    const resp = await axios({
      method: 'GET', url: downloadUrl, responseType: 'arraybuffer', timeout: 60000,
      headers: {
        'Cookie': cookieStr,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': CONFIG.baseUrl,
      },
      maxRedirects: 10,
      httpsAgent,
    });

    // Check if it's actually a PDF (not HTML error page)
    const contentType = resp.headers['content-type'] || '';
    const data = resp.data;

    if (contentType.includes('pdf') || (data.length > 100 && data[0] === 0x25 && data[1] === 0x50)) {
      fs.writeFileSync(outputPath, data);
      return data.length;
    } else if (contentType.includes('octet-stream') && data.length > 5000) {
      // Some servers send PDFs as octet-stream
      fs.writeFileSync(outputPath, data);
      return data.length;
    } else {
      return -1; // Not a PDF
    }
  } catch (e) {
    log('❌', `Axios err: ${e.message}`);
    return 0;
  }
}

(async () => {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║  📥 RésuméCI — Re-download PDFs       ║');
  console.log('╚═══════════════════════════════════════╝\n');

  // Load cours_index.json
  if (!fs.existsSync(CONFIG.indexFile)) {
    console.error('❌ cours_index.json not found! Run scraper.js first.');
    process.exit(1);
  }

  const coursIndex = JSON.parse(fs.readFileSync(CONFIG.indexFile, 'utf8'));
  log('📋', `${coursIndex.length} ressources dans cours_index.json`);

  ensureDir(CONFIG.outputDir);

  // Launch browser
  log('🚀', 'Lancement Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CONFIG.chromePath,
    headless: CONFIG.headless,
    defaultViewport: { width: 1366, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(CONFIG.timeout);
  page.on('dialog', async d => { await d.accept(); });

  // Login: the full 2-step visitor login on ecole-ci.org
  log('🔐', 'Connexion visiteur...');
  await page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle2' });
  await sleep(2000);

  try {
    // Fill phone number
    const phoneInput = await page.$('#telephone');
    if (phoneInput) {
      await phoneInput.click({ clickCount: 3 });
      await phoneInput.type(CONFIG.visitor.telephone, { delay: 50 });
    }
    log('📱', 'Phone filled, clicking submit (step 1)...');
    
    // Step 1: Click submit to validate phone
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
      page.click('#submit, button[name="submit"]').catch(() =>
        page.evaluate(() => document.querySelector('#formlogin')?.submit())
      ),
    ]);
    await sleep(2000);
    log('📱', `After step 1: ${page.url()}`);
    
    // Step 2: If still on login page, click again
    if (page.url().includes('login')) {
      log('🔄', 'Step 2: re-clicking submit...');
      const phoneInput2 = await page.$('#telephone');
      if (phoneInput2) {
        const val = await page.evaluate(() => document.querySelector('#telephone')?.value);
        if (!val || val.length < 5) {
          await phoneInput2.click({ clickCount: 3 });
          await phoneInput2.type(CONFIG.visitor.telephone, { delay: 50 });
        }
      }
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
        page.click('#submit, button[name="submit"]').catch(() =>
          page.evaluate(() => document.querySelector('#formlogin')?.submit())
        ),
      ]);
      await sleep(3000);
    }
    
    log('🌐', `After login: ${page.url()}`);
  } catch (e) {
    log('⚠️', `Login issue: ${e.message}`);
  }

  // Should now be on lyc.ecole-ci.org/course/ with Moodle session
  const currentUrl = page.url();
  if (!currentUrl.includes('lyc.ecole-ci.org')) {
    log('🌐', 'Navigating to Moodle...');
    await page.goto('https://lyc.ecole-ci.org/course/', { waitUntil: 'networkidle2' });
    await sleep(2000);
  }
  
  const cookies = await page.cookies();
  log('🍪', `${cookies.length} cookies récupérés`);
  const moodleCookie = cookies.find(c => c.name === 'MoodleSession');
  if (moodleCookie) {
    log('✅', `MoodleSession: ${moodleCookie.value.substring(0, 10)}...`);
  } else {
    log('❌', 'No MoodleSession cookie! Downloads will likely fail.');
    log('💡', 'Cookies found: ' + cookies.map(c => c.name).join(', '));
  }

  // Now download PDFs by navigating to each resource URL with Puppeteer
  let downloaded = 0;
  let errors = 0;
  let skipped = 0;
  let totalSize = 0;

  // Deduplicate by URL
  const seen = new Set();
  const uniqueCours = coursIndex.filter(c => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
  log('📋', `${uniqueCours.length} ressources uniques (${coursIndex.length - uniqueCours.length} doublons retirés)`);

  for (let i = 0; i < uniqueCours.length; i++) {
    const cours = uniqueCours[i];
    const courseName = cours.course || cours.text || `cours_${i + 1}`;
    const fileName = sanitize(courseName) + '.pdf';
    const outputPath = path.join(CONFIG.outputDir, fileName);

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
      skipped++;
      continue;
    }

    log('📥', `[${i + 1}/${uniqueCours.length}] ${courseName}`);

    try {
      // Method 1: Try axios with redirect=1 (fast, no browser needed)
      let size = await downloadWithAxios(cours.url, outputPath, cookies);
      
      if (size > 0) {
        downloaded++;
        totalSize += size;
        log('✅', `  → ${(size / 1024).toFixed(0)} KB`);
      } else {
        // Method 2: Use Puppeteer to navigate and find the actual PDF URL
        let pdfUrl = null;
        
        const responseHandler = (response) => {
          const url = response.url();
          const ct = response.headers()['content-type'] || '';
          if ((url.includes('pluginfile.php') || url.endsWith('.pdf')) && (ct.includes('pdf') || ct.includes('octet'))) {
            pdfUrl = url;
          }
        };
        page.on('response', responseHandler);

        try {
          await page.goto(cours.url, { waitUntil: 'networkidle2', timeout: 15000 });
          await sleep(500);
        } catch (e) { /* timeout OK */ }

        page.off('response', responseHandler);

        // Check current URL
        const currentUrl = page.url();
        if (currentUrl.includes('pluginfile.php') || currentUrl.endsWith('.pdf')) {
          pdfUrl = currentUrl;
        }

        // Look for PDF links/embeds in the page
        if (!pdfUrl) {
          try {
            const links = await page.evaluate(() => {
              const selectors = 'a[href*="pluginfile.php"], a[href*=".pdf"], object[data*="pluginfile"], embed[src*="pluginfile"], iframe[src*="pluginfile"], a.resourceworkaround';
              return [...document.querySelectorAll(selectors)]
                .map(el => el.href || el.getAttribute('data') || el.getAttribute('src'))
                .filter(Boolean);
            });
            if (links.length > 0) pdfUrl = links[0];
          } catch (e) { /* page might have navigated away */ }
        }

        if (pdfUrl) {
          size = await downloadWithAxios(pdfUrl, outputPath, cookies);
          if (size > 0) {
            downloaded++;
            totalSize += size;
            log('✅', `  → ${(size / 1024).toFixed(0)} KB (via page)`);
          } else {
            errors++;
            log('❌', `  → PDF URL trouvé mais échec DL: ${pdfUrl.substring(0, 80)}`);
          }
        } else {
          errors++;
          log('❌', `  → Pas de PDF trouvé`);
        }
      }

    } catch (e) {
      errors++;
      log('❌', `  → Erreur: ${e.message}`);
    }

    await sleep(CONFIG.delay);

    // Progress report every 50
    if ((i + 1) % 50 === 0) {
      log('📊', `Progression: ${downloaded} téléchargés, ${errors} erreurs, ${skipped} déjà existants / ${uniqueCours.length} total`);
    }
  }

  // Final report
  console.log('\n');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║     📊 RAPPORT FINAL                  ║');
  console.log('╠═══════════════════════════════════════╣');
  console.log(`║ 📄 Ressources:     ${String(uniqueCours.length).padStart(5)}           ║`);
  console.log(`║ ✅ Téléchargés:    ${String(downloaded).padStart(5)}           ║`);
  console.log(`║ ⏭️  Déjà existants: ${String(skipped).padStart(5)}           ║`);
  console.log(`║ ❌ Erreurs:        ${String(errors).padStart(5)}           ║`);
  console.log(`║ 💾 Taille totale:  ${(totalSize / 1024 / 1024).toFixed(1).padStart(5)} MB        ║`);
  console.log('╚═══════════════════════════════════════╝');
  console.log(`\n📁 PDFs dans: ${CONFIG.outputDir}\n`);

  await sleep(3000);
  await browser.close();
  log('🔒', 'Chrome fermé');
})();
