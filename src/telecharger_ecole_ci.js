#!/usr/bin/env node
/**
 * Téléchargeur automatique « Mon École à la Maison » (ecole-ci.org / lyc.ecole-ci.org, Moodle).
 *
 * Usage :
 *   node src/telecharger_ecole_ci.js --classe "PREMIERE A" --matieres "Français,Histoire-Géographie" --dest ./Telechargements
 *
 * Options :
 *   --classe <nom>        Classe cible telle qu'affichée sur le site (ex. "PREMIERE A", "TERMINALE D", "SECONDE C"). Obligatoire.
 *   --matieres <liste>    Matières séparées par des virgules, ou "all" (défaut) pour toutes.
 *   --dest <dossier>      Dossier racine (défaut : ./Telechargements).
 *   --phone <numéro>      Numéro visiteur (défaut : $ECOLE_CI_PHONE ou 0594889379).
 *   --site <url>          Moodle cible (défaut : https://lyc.ecole-ci.org ; collège : https://col.ecole-ci.org).
 *   --sous-dossiers       Crée un sous-dossier par sous-catégorie (Lecture, Expression Orale…) au lieu d'aplatir.
 *   --dry-run             Liste les leçons sans rien télécharger.
 *   --force               Re-télécharge même si le PDF existe déjà.
 *   --delai-min/--delai-max <ms>  Temporisation entre deux requêtes (défaut 1500–2500 ms).
 *   --navigateur          Force la connexion via Chrome (puppeteer-core) au lieu de HTTP.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_PHONE = '0594889379';
const PORTAL = 'https://ecole-ci.org';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function parseArgs(argv) {
  const opts = { matieres: 'all', dest: './Telechargements', site: 'https://lyc.ecole-ci.org', delaiMin: 1500, delaiMax: 2500 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--classe': opts.classe = next(); break;
      case '--matieres': opts.matieres = next(); break;
      case '--dest': opts.dest = next(); break;
      case '--phone': opts.phone = next(); break;
      case '--site': opts.site = next().replace(/\/+$/, ''); break;
      case '--sous-dossiers': opts.sousDossiers = true; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--force': opts.force = true; break;
      case '--navigateur': opts.navigateur = true; break;
      case '--delai-min': opts.delaiMin = Number(next()); break;
      case '--delai-max': opts.delaiMax = Number(next()); break;
      case '-h': case '--help': opts.help = true; break;
      default: throw new Error(`Option inconnue : ${a}`);
    }
  }
  opts.phone = (opts.phone || process.env.ECOLE_CI_PHONE || DEFAULT_PHONE).replace(/\D/g, '');
  return opts;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (emoji, msg) => console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ${emoji} ${msg}`);
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/gi, 'oe').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sanitize = s => String(s).replace(/[\/\x5c:*?"<>|\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 150) || 'sans_titre';
const decode = s => String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
const stripTags = s => decode(String(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

class Session {
  constructor(opts) {
    this.opts = opts;
    this.cookies = new Map();
    this.lastRequest = 0;
  }

  storeCookies(res, url) {
    const host = new URL(url).hostname;
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair, ...attrs] = c.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const domAttr = attrs.find(x => /^\s*domain=/i.test(x));
      const domain = domAttr ? domAttr.split('=')[1].trim().replace(/^\./, '') : host;
      this.cookies.set(`${domain}|${name}`, { domain, name, value });
    }
  }

  cookieHeader(url) {
    const host = new URL(url).hostname;
    return [...this.cookies.values()].filter(c => host === c.domain || host.endsWith('.' + c.domain)).map(c => `${c.name}=${c.value}`).join('; ');
  }

  async throttle() {
    const { delaiMin, delaiMax } = this.opts;
    const wait = delaiMin + Math.random() * Math.max(0, delaiMax - delaiMin);
    const elapsed = Date.now() - this.lastRequest;
    if (elapsed < wait) await sleep(wait - elapsed);
    this.lastRequest = Date.now();
  }

  async request(url, { method = 'GET', body, headers = {}, throttle = true } = {}, attempt = 1) {
    if (throttle) await this.throttle();
    try {
      let current = url;
      let opts = { method, body };
      for (let hop = 0; hop < 10; hop++) {
        const res = await fetch(current, {
          ...opts,
          redirect: 'manual',
          signal: AbortSignal.timeout(90000),
          headers: { 'User-Agent': UA, Cookie: this.cookieHeader(current), ...headers, ...(opts.body && typeof opts.body === 'string' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        });
        this.storeCookies(res, current);
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
          current = new URL(res.headers.get('location'), current).href;
          opts = { method: 'GET' };
          continue;
        }
        if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
        return { res, url: current };
      }
      throw new Error('Trop de redirections');
    } catch (e) {
      if (attempt >= 4) throw e;
      log('🔁', `Nouvelle tentative (${attempt}/3) ${url} : ${e.message}`);
      await sleep(2000 * attempt);
      return this.request(url, { method, body, headers, throttle: false }, attempt + 1);
    }
  }

  async html(url) {
    const { res, url: finalUrl } = await this.request(url);
    const text = await res.text();
    if (/\/login\/index\.php/.test(finalUrl) && !/\/login\/index\.php/.test(url)) throw new Error('Session expirée (redirigé vers la page de connexion)');
    return { text, url: finalUrl };
  }

  // Étape 1 — connexion visiteur (même logique que le formulaire « Je suis un visiteur » du site)
  async loginHttp() {
    const phone = this.opts.phone;
    const check = await this.request(`${PORTAL}/co/resp/visiteur_moodle.php`, { method: 'POST', body: new URLSearchParams({ telephone: phone, submit: 'true' }).toString() });
    const data = await check.res.json().catch(() => ({}));
    if (!data.url) throw new Error(`Numéro visiteur ${phone} non enregistré sur ecole-ci.org`);
    const loginUrl = data.url;
    const jsPass = await (await this.request(`${PORTAL}/js/codepassphone.js`, { throttle: false })).res.text();
    const suffix = (jsPass.match(/usernamecorrect\s*\+\s*"([^"]+)"/) || [])[1];
    if (!suffix) throw new Error('Impossible de lire la règle de mot de passe dans codepassphone.js');
    const page = await (await this.request(loginUrl, { throttle: false })).res.text();
    const token = (page.match(/name="logintoken"\s+value="([^"]+)"/) || [])[1];
    const form = new URLSearchParams({ username: phone, password: phone + suffix });
    if (token) form.set('logintoken', token);
    const { url } = await this.request(loginUrl, { method: 'POST', body: form.toString() });
    if (/login\/index\.php/.test(url)) throw new Error('Connexion Moodle refusée');
    this.site = new URL(url).origin;
    log('✅', `Connecté en visiteur (${phone}) → ${url}`);
  }

  async loginBrowser() {
    const puppeteer = require('puppeteer-core');
    const candidates = [
      process.env.CHROME_PATH,
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      'C:/devin/chrome/chrome-win64/chrome.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].filter(Boolean);
    const executablePath = candidates.find(p => fs.existsSync(p));
    if (!executablePath) throw new Error('Chrome introuvable (variable CHROME_PATH)');
    const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage();
      await page.goto(`${PORTAL}/co/loginvisiteur.php`, { waitUntil: 'networkidle2' });
      await page.type('#telephone', this.opts.phone, { delay: 40 });
      await page.waitForFunction(
        () => /ecole-ci[.]org/.test(document.formconnexion.action) && !/loginvisiteur/.test(document.formconnexion.action),
        { timeout: 30000 }
      );
      await sleep(1500);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
        page.evaluate(() => HTMLFormElement.prototype.submit.call(document.formconnexion)),
      ]);
      if (/login/.test(page.url())) throw new Error('Connexion refusée');
      for (const c of await page.cookies()) {
        const domain = c.domain.replace(/^[.]/, '');
        this.cookies.set(`${domain}|${c.name}`, { domain, name: c.name, value: c.value });
      }
      this.site = new URL(page.url()).origin;
      log('✅', `Connecté via Chrome (${this.opts.phone}) → ${page.url()}`);
    } finally {
      await browser.close();
    }
  }

  async login() {
    if (!this.opts.navigateur) {
      try {
        return await this.loginHttp();
      } catch (e) {
        log('⚠️', `Connexion HTTP échouée (${e.message}), essai via Chrome…`);
      }
    }
    return this.loginBrowser();
  }

  // Page catégorie Moodle : sous-catégories + cours
  async category(id) {
    const { text } = await this.html(`${this.opts.site}/course/index.php?categoryid=${id}&perpage=all`);
    const subcats = [];
    const reCat = /data-categoryid="(\d+)"[^>]*>[\s\S]*?<a[^>]*href="[^"]*categoryid=(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = reCat.exec(text))) {
      if (m[1] === m[2] && m[1] !== String(id) && !subcats.some(s => s.id === m[1])) subcats.push({ id: m[1], name: stripTags(m[3]) });
    }
    const courses = [];
    const reCourse = /data-courseid="(\d+)"[\s\S]*?<a[^>]*href="[^"]*course\/view[.]php\?id=(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
    while ((m = reCourse.exec(text))) {
      if (m[1] === m[2] && !courses.some(c => c.id === m[1])) courses.push({ id: m[1], title: stripTags(m[3]) });
    }
    return { subcats, courses };
  }

  async rootCategories() {
    const { text } = await this.html(`${this.opts.site}/course/index.php`);
    const out = [];
    const re = /data-categoryid="(\d+)"[^>]*>[\s\S]*?<a[^>]*href="[^"]*categoryid=(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(text))) if (m[1] === m[2] && !out.some(c => c.id === m[1])) out.push({ id: m[1], name: stripTags(m[3]) });
    return out;
  }

  // Étape 3 — catégorie de la classe (ex. PREMIERE → PREMIERE A)
  async findClass(name) {
    const target = norm(name);
    const compact = s => norm(s).replace(/ /g, '');
    const roots = await this.rootCategories();
    const direct = roots.find(c => compact(c.name) === compact(name));
    if (direct) return direct;
    const ordered = [...roots].sort((a, b) => Number(target.startsWith(norm(b.name))) - Number(target.startsWith(norm(a.name))));
    const seen = [];
    for (const root of ordered) {
      const { subcats } = await this.category(root.id);
      seen.push(...subcats.map(s => s.name));
      const hit = subcats.find(s => compact(s.name) === compact(name));
      if (hit) return hit;
    }
    throw new Error(`Classe "${name}" introuvable. Classes vues : ${seen.join(', ')}`);
  }

  // Étape 4 — toutes les leçons d'une matière (sous-catégories incluses)
  async collectCourses(cat, rel = []) {
    const { subcats, courses } = await this.category(cat.id);
    const list = courses.map(c => ({ ...c, rel }));
    for (const sc of subcats) list.push(...(await this.collectCourses(sc, [...rel, sc.name])));
    return list;
  }

  // Lien « Je lis le résumé de la leçon » de la page du cours
  async findSummaryLink(courseId) {
    const { text } = await this.html(`${this.opts.site}/course/view.php?id=${courseId}`);
    const links = [];
    const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(text))) links.push({ href: decode(m[1]), text: stripTags(m[2]) });
    const isRes = l => /mod\/(resource|url|folder)\/view[.]php|pluginfile[.]php/.test(l.href);
    return (
      links.find(l => /r[ée]sum[ée]/i.test(l.text) && isRes(l)) ||
      links.find(l => /mod\/resource\/view[.]php/.test(l.href)) ||
      links.find(l => /pluginfile[.]php.*[.]pdf/i.test(l.href)) ||
      null
    );
  }

  // Télécharge le PDF d'une ressource Moodle (redirections + pages intermédiaires)
  async downloadPdf(href) {
    let url = /mod\/resource\/view[.]php/.test(href) && !/redirect=1/.test(href) ? `${href}&redirect=1` : href;
    for (let step = 0; step < 3; step++) {
      const { res, url: finalUrl } = await this.request(url);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.subarray(0, 5).toString() === '%PDF-') return { buf, url: finalUrl };
      const html = buf.toString('utf8');
      const next = (html.match(/(?:href|src|data)="([^"]*pluginfile[.]php[^"]*)"/i) || [])[1];
      if (!next) throw new Error(`Pas de PDF (type ${res.headers.get('content-type')}) sur ${finalUrl}`);
      url = new URL(decode(next), finalUrl).href;
    }
    throw new Error('PDF introuvable après 3 étapes');
  }
}

function isValidPdf(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(5);
    fs.readSync(fd, b, 0, 5, 0);
    fs.closeSync(fd);
    return b.toString() === '%PDF-' && fs.statSync(file).size > 1000;
  } catch {
    return false;
  }
}

function pickSubjects(wantedRaw, available, classeName) {
  if (/^(all|[*]|toutes)$/i.test(wantedRaw.trim())) return available;
  const wanted = wantedRaw.split(',').map(x => x.trim()).filter(Boolean);
  return wanted
    .map(w => {
      const hit =
        available.find(m => norm(m.name) === norm(w)) ||
        available.find(m => norm(m.name).startsWith(norm(w)) || norm(w).startsWith(norm(m.name)));
      if (!hit) log('❌', `Matière "${w}" introuvable dans ${classeName}`);
      return hit;
    })
    .filter(Boolean);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.classe) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
    process.exit(opts.help ? 0 : 1);
  }
  const s = new Session(opts);
  await s.login();

  const classe = await s.findClass(opts.classe);
  log('🏫', `Classe : ${classe.name} (catégorie ${classe.id})`);
  const { subcats: matieresSite } = await s.category(classe.id);
  log('📚', `Matières disponibles : ${matieresSite.map(m => m.name).join(', ')}`);
  const matieres = pickSubjects(opts.matieres, matieresSite, classe.name);

  const destRoot = path.resolve(opts.dest);
  const classDir = path.join(destRoot, sanitize(opts.classe));
  const report = { classe: classe.name, date: new Date().toISOString(), matieres: [] };
  const totals = { ok: 0, skip: 0, err: 0, none: 0, bytes: 0 };

  for (const mat of matieres) {
    const matDir = path.join(classDir, sanitize(mat.name));
    const courses = await s.collectCourses(mat);
    log('📂', `${mat.name} : ${courses.length} leçon(s)`);
    const entry = { matiere: mat.name, categoryId: mat.id, lecons: [] };
    report.matieres.push(entry);
    const usedNames = new Set();

    for (const [i, c] of courses.entries()) {
      const dir = opts.sousDossiers ? path.join(matDir, ...c.rel.map(sanitize)) : matDir;
      let base = sanitize(c.title);
      if (usedNames.has(path.join(dir, base).toLowerCase())) base = `${base}_${c.id}`;
      usedNames.add(path.join(dir, base).toLowerCase());
      const file = path.join(dir, `${base}.pdf`);
      const rec = {
        id: c.id,
        titre: c.title,
        sousCategorie: c.rel.join(' / ') || null,
        cours: `${opts.site}/course/view.php?id=${c.id}`,
        fichier: path.relative(destRoot, file),
      };
      entry.lecons.push(rec);
      const tag = `[${mat.name} ${i + 1}/${courses.length}]`;

      if (opts.dryRun) {
        log('📝', `${tag} ${c.rel.length ? c.rel.join(' / ') + ' › ' : ''}${c.title}`);
        continue;
      }
      if (!opts.force && isValidPdf(file)) {
        rec.statut = 'deja_present';
        totals.skip++;
        log('⏭️', `${tag} déjà présent : ${base}.pdf`);
        continue;
      }
      try {
        const link = await s.findSummaryLink(c.id);
        if (!link) {
          rec.statut = 'pas_de_resume';
          totals.none++;
          log('➖', `${tag} pas de résumé : ${c.title}`);
          continue;
        }
        rec.ressource = link.href;
        const { buf, url } = await s.downloadPdf(link.href);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, buf);
        Object.assign(rec, { statut: 'ok', pdf: url, octets: buf.length });
        totals.ok++;
        totals.bytes += buf.length;
        log('📥', `${tag} ${base}.pdf (${(buf.length / 1024).toFixed(0)} Ko)`);
      } catch (e) {
        if (/Session expirée/.test(e.message)) {
          log('🔐', 'Reconnexion…');
          await s.login();
        }
        rec.statut = 'erreur';
        rec.erreur = e.message;
        totals.err++;
        log('❌', `${tag} ${c.title} : ${e.message}`);
      }
    }
  }

  // Étape 5 — vérification sur disque + rapport
  const reportFile = path.join(classDir, opts.dryRun ? '_liste.json' : '_rapport.json');
  if (!opts.dryRun) {
    let invalid = 0;
    for (const m of report.matieres) {
      for (const l of m.lecons) {
        if (['ok', 'deja_present'].includes(l.statut) && !isValidPdf(path.join(destRoot, l.fichier))) {
          l.statut = 'invalide';
          invalid++;
        }
      }
    }
    if (invalid) log('⚠️', `${invalid} fichier(s) absent(s) ou invalide(s) après vérification`);
  }
  fs.mkdirSync(classDir, { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  log('🧾', `Rapport : ${reportFile}`);
  log('🏁', `Terminé — ${totals.ok} téléchargé(s) (${(totals.bytes / 1048576).toFixed(1)} Mo), ${totals.skip} déjà présent(s), ${totals.none} sans résumé, ${totals.err} erreur(s)`);
  process.exitCode = totals.err ? 2 : 0;
}

if (require.main === module) {
  main().catch(e => {
    log('💥', e.message);
    process.exit(1);
  });
}

module.exports = { Session, sanitize, norm, parseArgs, pickSubjects };
