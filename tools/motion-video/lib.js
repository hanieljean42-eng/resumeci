const fs = require('fs');
const path = require('path');

// Durée d'une scène : démo = somme des extraits / vitesse (+ hold), sinon dur.
const DEFAULT_SPEED = 1.5;
const clipSpeed = c => c[3] || DEFAULT_SPEED;
const sceneDur = sc => sc.type === 'demo'
  ? sc.clips.reduce((s, c) => s + c[2] / clipSpeed(c), 0) + (sc.hold || 0)
  : sc.dur;

// Décors disponibles (classes th-<nom> dans stage.html). Index = variante musicale.
const THEMES = ['ci', 'ocean', 'violet', 'sunset', 'menthe', 'nuit'];

// Thème du projet : <projet>/theme.json s'il existe (choix manuel ou tirage précédent),
// sinon tirage au hasard en évitant le thème de la dernière vidéo, puis mémorisation.
function projectTheme(P) {
  const f = path.join(P, 'theme.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')).theme;
  const lastF = path.join(P, '..', '.last_theme');
  const last = fs.existsSync(lastF) ? fs.readFileSync(lastF, 'utf8').trim() : '';
  const pool = THEMES.filter(t => t !== last);
  const theme = pool[Math.floor(Math.random() * pool.length)];
  fs.writeFileSync(f, JSON.stringify({ theme }, null, 2));
  fs.writeFileSync(lastF, theme);
  return theme;
}

module.exports = { sceneDur, clipSpeed, DEFAULT_SPEED, THEMES, projectTheme };
