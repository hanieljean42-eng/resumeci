// Scrape libraryui.com : liste des composants disponibles
const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require(path.join('C:/Users/DJEBLE/OneDrive/Desktop/CIRESUME/resumeci', 'node_modules', 'puppeteer-core'));

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto('https://libraryui.com', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => ({ t: a.textContent.trim().slice(0, 60), h: a.href })).filter(l => l.t));
  console.log('=== LIENS ===');
  [...new Map(links.map(l => [l.h, l])).values()].slice(0, 60).forEach(l => console.log(l.t, '->', l.h));
  await page.screenshot({ path: 'C:/Users/DJEBLE/OneDrive/Desktop/CIRESUME/resumeci/_video/sheets/lui_home.jpg', quality: 80, type: 'jpeg' });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
