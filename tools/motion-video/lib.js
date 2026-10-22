// Durée d'une scène : démo = somme des extraits / vitesse (+ hold), sinon dur.
const DEFAULT_SPEED = 1.5;
const clipSpeed = c => c[3] || DEFAULT_SPEED;
const sceneDur = sc => sc.type === 'demo'
  ? sc.clips.reduce((s, c) => s + c[2] / clipSpeed(c), 0) + (sc.hold || 0)
  : sc.dur;
module.exports = { sceneDur, clipSpeed, DEFAULT_SPEED };
