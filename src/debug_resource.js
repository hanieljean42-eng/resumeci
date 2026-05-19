const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: false,
    defaultViewport: { width: 1366, height: 900 },
    args: ['--no-sandbox', '--ignore-certificate-errors'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  // First go to course list (this seemed to work in original scraper without login)
  console.log('1. Navigate to Moodle course list...');
  await page.goto('https://lyc.ecole-ci.org/course/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  
  const cookies1 = await page.cookies();
  console.log(`Cookies after course list: ${cookies1.length}`);
  for (const c of cookies1) console.log(`  ${c.name}=${c.value.substring(0, 20)}... (domain: ${c.domain})`);
  
  // Take test URL from cours_index.json
  const index = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cours_index.json'), 'utf8'));
  const testUrl = index[0].url;
  console.log(`\n2. Navigate to resource: ${testUrl}`);

  // Intercept all responses
  page.on('response', (resp) => {
    const url = resp.url();
    const status = resp.status();
    const ct = resp.headers()['content-type'] || '';
    if (url.includes('ecole-ci') || url.includes('pluginfile') || url.includes('.pdf')) {
      console.log(`  RESPONSE: [${status}] ${ct.substring(0, 40)} — ${url.substring(0, 120)}`);
    }
  });

  await page.goto(testUrl, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  console.log(`\n3. Current URL: ${page.url()}`);
  
  // Get page content
  const pageInfo = await page.evaluate(() => ({
    title: document.title,
    bodyText: document.body.innerText.substring(0, 1000),
    links: [...document.querySelectorAll('a')].map(a => ({ text: a.textContent.trim().substring(0, 100), href: a.href })).filter(l => l.href.includes('pluginfile') || l.href.includes('.pdf') || l.href.includes('resource')),
    objects: [...document.querySelectorAll('object, embed, iframe')].map(el => ({
      tag: el.tagName,
      src: el.src || el.getAttribute('data') || '',
      type: el.type || ''
    })),
    allLinks: [...document.querySelectorAll('a')].map(a => ({ text: a.textContent.trim().substring(0, 80), href: a.href })).slice(0, 30),
  }));

  console.log(`\nTitle: ${pageInfo.title}`);
  console.log(`\nBody text (first 500):\n${pageInfo.bodyText.substring(0, 500)}`);
  console.log(`\nPDF/Resource links: ${pageInfo.links.length}`);
  for (const l of pageInfo.links) console.log(`  → "${l.text}" = ${l.href}`);
  console.log(`\nEmbeds: ${pageInfo.objects.length}`);
  for (const o of pageInfo.objects) console.log(`  → <${o.tag}> src=${o.src} type=${o.type}`);
  console.log(`\nAll links:`);
  for (const l of pageInfo.allLinks) console.log(`  → "${l.text}" = ${l.href}`);

  await page.screenshot({ path: path.join(__dirname, '..', 'data', 'debug_resource.png'), fullPage: true });
  console.log('\nScreenshot saved to data/debug_resource.png');

  // Try with redirect=1
  const redirectUrl = testUrl + '&redirect=1';
  console.log(`\n4. Try redirect: ${redirectUrl}`);
  await page.goto(redirectUrl, { waitUntil: 'networkidle2', timeout: 15000 }).catch(e => console.log(`  Nav error: ${e.message}`));
  await new Promise(r => setTimeout(r, 2000));
  console.log(`Current URL after redirect: ${page.url()}`);
  await page.screenshot({ path: path.join(__dirname, '..', 'data', 'debug_redirect.png'), fullPage: true });

  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
})();
