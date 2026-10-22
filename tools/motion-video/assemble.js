// Assemble un projet : segments (écran du téléphone incrusté pour les démos)
// -> transitions xfade -> musique originale -> <projet>/<nom>.mp4
//   node tools/motion-video/assemble.js <dossierProjet> [NomSortie]
// Fichiers intermédiaires dans workDir (hors OneDrive), segments encodés en parallèle.
const { execFile, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { clipSpeed, projectTheme, THEMES, workDir } = require('./lib');

const FPS = 30, T = 0.45;
const P = path.resolve(process.argv[2] || '.');
const NAME = process.argv[3] || 'ResumeCI_Video';
const SCENES = require(path.join(P, 'scenes.js'));
const W = workDir(P);
const p = (...a) => path.join(P, ...a);   // projet (sources, sortie)
const w = (...a) => path.join(W, ...a);   // travail (images, segments)
const PAR = Math.max(1, Math.min(3, Number(process.env.MOTION_FF_PAR) || Math.floor(os.cpus().length / 2)));

// ffmpeg asynchrone avec nouvelles tentatives (EPERM transitoire = antivirus)
const ff = args => new Promise((resolve, reject) => {
  const run = i => execFile('ffmpeg', ['-v', 'error', '-y', ...args], { maxBuffer: 1 << 26 }, (e, _o, err) => {
    if (!e) return resolve();
    if (e.code === 'EPERM' && i < 5) return setTimeout(() => run(i + 1), 1000 * (i + 1));
    reject(new Error((err || e.message).slice(-1500)));
  });
  run(0);
});
async function pool(items, fn) {
  let k = 0;
  await Promise.all(Array.from({ length: Math.min(PAR, items.length) }, async () => { while (k < items.length) await fn(items[k++]); }));
}

// Écran du téléphone (stage.html) : décalé vers le bas si badge d'accès
const screen = sc => sc.access ? { W: 586, H: 1224, X: 247, Y: 492 } : { W: 586, H: 1274, X: 247, Y: 442 };
async function mask({ W: mw, H: mh }) {
  const f = w(`mask_${mw}x${mh}.png`);
  if (!fs.existsSync(f)) await ff(['-f', 'lavfi', '-i', `color=black:s=${mw}x${mh}`, '-frames:v', '1', '-vf',
    `format=gray,geq=lum='if(lte(pow(max(0\\,abs(X-W/2)-(W/2-50))\\,2)+pow(max(0\\,abs(Y-H/2)-(H/2-50))\\,2)\\,2500)\\,255\\,0)'`, f]);
  return f;
}

(async () => {
  const t0 = Date.now();
  // Contrôle qualité des sources : WhatsApp réduit les vidéos en 288x640 (floues une fois agrandies).
  const SRCW = {};
  for (const src of new Set(SCENES.filter(s => s.type === 'demo').flatMap(s => s.clips.map(c => c[0])))) {
    const sw = SRCW[src] = parseInt(execSync(`ffprobe -v quiet -select_streams v -show_entries stream=width -of csv=p=0 "${p('src', src + '.mp4')}"`, { encoding: 'utf8' }), 10);
    if (sw < 600) console.warn(`⚠️  ${src}.mp4 fait ${sw}px de large (compression WhatsApp) : rendu limité. Demander l'original en HD.`);
  }
  for (const sc of SCENES) if (sc.type === 'demo') await mask(screen(sc)); // avant le parallèle

  fs.mkdirSync(w('seg'), { recursive: true });
  const durs = SCENES.map(sc => fs.readdirSync(w('frames', sc.id)).length / FPS);
  await pool(SCENES.map((sc, i) => [sc, durs[i]]), async ([sc, dur]) => {
    const out = w('seg', sc.id + '.mp4');
    const enc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-t', dur.toFixed(3), out];
    if (sc.type !== 'demo') await ff(['-framerate', String(FPS), '-i', w('frames', sc.id, '%05d.jpg'), ...enc]);
    else {
      const S = screen(sc);
      // Recadrage relatif (288x640 comme 1080x2400) au ratio de l'écran ; cropTop = px d'une source 640 de haut.
      const top = sc.cropTop ?? 20;
      const crop = `crop=iw:trunc(iw*${S.H}/${S.W}/2)*2:0:trunc(ih*${top}/640/2)*2`;
      // Source HD : réduction lanczos + légère netteté. Basse déf. : débruitage avant agrandissement.
      const scale = `scale=${S.W}:${S.H}:flags=lanczos+accurate_rnd+full_chroma_int`;
      const clean = src => (SRCW[src] >= 600 ? `${scale},cas=0.3` : `hqdn3d=1.2:1.2:4:4,${scale},cas=0.55`);
      const inputs = ['-framerate', String(FPS), '-i', w('frames', sc.id, '%05d.jpg')];
      const parts = sc.clips.map((c, i) => {
        inputs.push('-ss', String(c[1]), '-t', String(c[2]), '-i', p('src', c[0] + '.mp4'));
        return `[${i + 1}:v]${crop},setpts=(PTS-STARTPTS)/${clipSpeed(c)},fps=${FPS},${clean(c[0])},setsar=1[c${i}]`;
      });
      inputs.push('-loop', '1', '-i', await mask(S));
      const mi = sc.clips.length + 1;
      const cat = sc.clips.map((_, i) => `[c${i}]`).join('') + `concat=n=${sc.clips.length}:v=1:a=0`;
      const hold = sc.hold ? `,tpad=stop_mode=clone:stop_duration=${sc.hold}` : '';
      const fc = [...parts,
        `${cat}${hold},format=yuva420p[clip]`,
        `[${mi}:v]format=gray,scale=${S.W}:${S.H}[m]`,
        `[clip][m]alphamerge,fade=in:st=0.15:d=0.4:alpha=1[scr]`,
        `[0:v][scr]overlay=${S.X}:${S.Y}:shortest=0:eof_action=repeat[v]`].join(';');
      await ff([...inputs, '-filter_complex', fc, '-map', '[v]', ...enc]);
    }
    console.log('segment', sc.id, dur.toFixed(2) + 's');
  });
  console.log(`segments en ${((Date.now() - t0) / 1000).toFixed(0)} s (${PAR} en parallèle)`);

  // Transitions légères (les « smooth* » coûtent ~1,6x plus cher pour un rendu proche).
  const TRANS = ['fade', 'slideleft', 'slideup', 'wipeleft', 'circleopen', 'slideright'];
  const inputs = SCENES.flatMap(sc => ['-i', w('seg', sc.id + '.mp4')]);
  const fc = []; let prev = '[0:v]', acc = durs[0];
  for (let i = 1; i < SCENES.length; i++) {
    const tr = SCENES[i - 1].type === 'demo' && SCENES[i].type === 'demo' ? 'slideleft' : TRANS[i % TRANS.length];
    const off = acc - T, lbl = i === SCENES.length - 1 ? '[vx]' : `[x${i}]`;
    fc.push(`${prev}[${i}:v]xfade=transition=${tr}:duration=${T}:offset=${off.toFixed(3)}${lbl}`);
    prev = lbl; acc = off + durs[i];
  }
  fc.push((SCENES.length > 1 ? '[vx]' : '[0:v]') + 'format=yuv420p[v]');
  // Export final : peu compressé + profil High (TikTok/WhatsApp recompressent ensuite, il faut de la marge).
  await ff([...inputs, '-filter_complex', fc.join(';'), '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14',
    '-profile:v', 'high', '-level', '4.2', '-maxrate', '18M', '-bufsize', '36M', '-r', String(FPS), w('video_sans_son.mp4')]);
  console.log('video', acc.toFixed(2) + 's');

  const variant = Math.max(0, THEMES.indexOf(projectTheme(P)));
  execSync(`node "${path.join(__dirname, 'music.js')}" ${acc.toFixed(2)} "${w('music.wav')}" ${variant}`, { stdio: 'inherit' });
  const OUT = p(NAME + '.mp4');
  await ff(['-i', w('video_sans_son.mp4'), '-i', w('music.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT]);
  console.log(`OK ${OUT} — assemblage en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
