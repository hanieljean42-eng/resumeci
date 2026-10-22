// Assemble un projet : segments (écran du téléphone incrusté pour les démos)
// -> transitions xfade -> musique originale -> <projet>/<nom>.mp4
//   node tools/motion-video/assemble.js <dossierProjet> [NomSortie]
const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { clipSpeed, projectTheme, THEMES } = require('./lib');

const FPS = 30, T = 0.45;
const P = path.resolve(process.argv[2] || '.');
const NAME = process.argv[3] || 'ResumeCI_Video';
const SCENES = require(path.join(P, 'scenes.js'));
const p = (...a) => path.join(P, ...a);
const ff = args => {
  for (let i = 0; ; i++) {
    try { return execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' }); }
    catch (e) {
      if (e.code !== 'EPERM' || i >= 5) throw e;
      const end = Date.now() + 1000 * (i + 1); while (Date.now() < end);
    }
  }
};

// Écran du téléphone (stage.html) : décalé vers le bas si badge d'accès
const screen = sc => sc.access ? { W: 586, H: 1224, X: 247, Y: 492 } : { W: 586, H: 1274, X: 247, Y: 442 };
const mask = ({ W, H }) => {
  const f = p(`mask_${W}x${H}.png`);
  if (!fs.existsSync(f)) ff(['-f', 'lavfi', '-i', `color=black:s=${W}x${H}`, '-frames:v', '1', '-vf',
    `format=gray,geq=lum='if(lte(pow(max(0\\,abs(X-W/2)-(W/2-50))\\,2)+pow(max(0\\,abs(Y-H/2)-(H/2-50))\\,2)\\,2500)\\,255\\,0)'`, f]);
  return f;
};

// Contrôle qualité des sources : WhatsApp réduit les vidéos en 288x640 (floues une fois agrandies).
for (const src of new Set(SCENES.filter(s => s.type === 'demo').flatMap(s => s.clips.map(c => c[0])))) {
  const w = parseInt(execSync(`ffprobe -v quiet -select_streams v -show_entries stream=width -of csv=p=0 "${p('src', src + '.mp4')}"`, { encoding: 'utf8' }), 10);
  if (w < 600) console.warn(`⚠️  ${src}.mp4 fait ${w}px de large (compression WhatsApp) : rendu limité. Demander l'original en HD.`);
}

fs.mkdirSync(p('seg'), { recursive: true });
const durs = [];
for (const sc of SCENES) {
  const dur = fs.readdirSync(p('frames', sc.id)).length / FPS;
  durs.push(dur);
  const out = p('seg', sc.id + '.mp4');
  const enc = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-t', dur.toFixed(3), out];
  if (sc.type !== 'demo') { ff(['-framerate', String(FPS), '-i', p('frames', sc.id, '%05d.jpg'), ...enc]); }
  else {
    const S = screen(sc);
    // Recadrage relatif (fonctionne en 288x640 comme en 1080x2400) : même ratio que l'écran,
    // on retire la barre d'état (cropTop exprimé en px d'une source 640 de haut).
    const top = sc.cropTop ?? 20;
    const crop = `crop=iw:trunc(iw*${S.H}/${S.W}/2)*2:0:trunc(ih*${top}/640/2)*2`;
    // Netteté : débruitage des blocs de compression -> agrandissement lanczos -> accentuation adaptative.
    const clean = `hqdn3d=1.2:1.2:4:4,scale=${S.W}:${S.H}:flags=lanczos+accurate_rnd+full_chroma_int,cas=0.55`;
    const inputs = ['-framerate', String(FPS), '-i', p('frames', sc.id, '%05d.jpg')];
    const parts = sc.clips.map((c, i) => {
      inputs.push('-ss', String(c[1]), '-t', String(c[2]), '-i', p('src', c[0] + '.mp4'));
      return `[${i + 1}:v]${crop},setpts=(PTS-STARTPTS)/${clipSpeed(c)},fps=${FPS},${clean},setsar=1[c${i}]`;
    });
    inputs.push('-loop', '1', '-i', mask(S));
    const mi = sc.clips.length + 1;
    const cat = sc.clips.map((_, i) => `[c${i}]`).join('') + `concat=n=${sc.clips.length}:v=1:a=0`;
    const hold = sc.hold ? `,tpad=stop_mode=clone:stop_duration=${sc.hold}` : '';
    const fc = [...parts,
      `${cat}${hold},format=yuva420p[clip]`,
      `[${mi}:v]format=gray,scale=${S.W}:${S.H}[m]`,
      `[clip][m]alphamerge,fade=in:st=0.15:d=0.4:alpha=1[scr]`,
      `[0:v][scr]overlay=${S.X}:${S.Y}:shortest=0:eof_action=repeat[v]`].join(';');
    ff([...inputs, '-filter_complex', fc, '-map', '[v]', ...enc]);
  }
  console.log('segment', sc.id, dur.toFixed(2) + 's');
}

const TRANS = ['fade', 'smoothleft', 'smoothup', 'circleopen', 'slideleft', 'smoothright'];
const inputs = SCENES.flatMap(sc => ['-i', p('seg', sc.id + '.mp4')]);
const fc = []; let prev = '[0:v]', acc = durs[0];
for (let i = 1; i < SCENES.length; i++) {
  const tr = SCENES[i - 1].type === 'demo' && SCENES[i].type === 'demo' ? 'smoothleft' : TRANS[i % TRANS.length];
  const off = acc - T, lbl = i === SCENES.length - 1 ? '[vx]' : `[x${i}]`;
  fc.push(`${prev}[${i}:v]xfade=transition=${tr}:duration=${T}:offset=${off.toFixed(3)}${lbl}`);
  prev = lbl; acc = off + durs[i];
}
fc.push((SCENES.length > 1 ? '[vx]' : '[0:v]') + 'format=yuv420p[v]');
// Export final : peu compressé + profil High (TikTok/WhatsApp recompressent ensuite, il faut de la marge).
ff([...inputs, '-filter_complex', fc.join(';'), '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '15',
  '-profile:v', 'high', '-level', '4.2', '-maxrate', '16M', '-bufsize', '32M', '-r', String(FPS), p('video_sans_son.mp4')]);
console.log('video', acc.toFixed(2) + 's');

const variant = Math.max(0, THEMES.indexOf(projectTheme(P)));
execSync(`node "${path.join(__dirname, 'music.js')}" ${acc.toFixed(2)} "${p('music.wav')}" ${variant}`, { stdio: 'inherit' });
const OUT = p(NAME + '.mp4');
ff(['-i', p('video_sans_son.mp4'), '-i', p('music.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT]);
console.log('OK', OUT);
