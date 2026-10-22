// Musique de fond originale (synthèse) : 100 BPM, Am – F – C – G, pad + basse + arpège + rythmique douce.
// node music.js <durée_s> <sortie.wav>
const fs = require('fs');
const DUR = Number(process.argv[2]) || 150;
const OUT = process.argv[3] || 'music.wav';
const SR = 44100, N = Math.ceil(DUR * SR);
const BPM = 100, BEAT = 60 / BPM, BAR = BEAT * 4;
const midi = m => 440 * Math.pow(2, (m - 69) / 12);
// Accords (notes MIDI) : Am, F, C, G
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const ROOTS = [45, 41, 48, 43];
const L = new Float32Array(N), R = new Float32Array(N);
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

for (let i = 0; i < N; i++) {
  const t = i / SR;
  const bar = Math.floor(t / BAR), ci = bar % 4, tb = t - bar * BAR;
  const chord = CHORDS[ci];
  // Pad : sinus + légère harmonique, enveloppe douce par mesure
  const padEnv = Math.min(1, tb / 0.6) * (0.75 + 0.25 * Math.cos(2 * Math.PI * t / BAR));
  let pad = 0;
  for (const n of chord) {
    const f = midi(n + 12);
    pad += Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 2.003 * t);
  }
  pad *= 0.045 * padEnv;
  // Basse : noire pointée sur chaque temps
  const beat = Math.floor(tb / BEAT), tbe = tb - beat * BEAT;
  const fb = midi(ROOTS[ci]);
  const bass = 0.16 * Math.sin(2 * Math.PI * fb * t) * Math.exp(-tbe * 3.2) * Math.min(1, tbe / 0.01);
  // Arpège : croches
  const e8 = BEAT / 2, k = Math.floor(tb / e8), te = tb - k * e8;
  const arpN = chord[[0, 1, 2, 1, 0, 2, 1, 2][k % 8]] + 24;
  const fa = midi(arpN);
  const arp = 0.05 * (Math.sin(2 * Math.PI * fa * t) + 0.3 * Math.sin(4 * Math.PI * fa * t)) * Math.exp(-te * 9) * Math.min(1, te / 0.004);
  // Grosse caisse douce (temps 1 et 3) à partir de la mesure 2
  let kick = 0;
  if (bar >= 1 && (beat === 0 || beat === 2)) {
    const fk = 50 + 90 * Math.exp(-tbe * 30);
    kick = 0.32 * Math.sin(2 * Math.PI * fk * tbe) * Math.exp(-tbe * 7);
  }
  // Charleston léger en contretemps
  let hat = 0;
  if (bar >= 2 && te < 0.05 && k % 2 === 1) hat = 0.025 * rnd() * Math.exp(-te * 80);
  // Claquement doux sur 2 et 4
  let clap = 0;
  if (bar >= 4 && (beat === 1 || beat === 3) && tbe < 0.15) clap = 0.05 * rnd() * Math.exp(-tbe * 30);

  const fade = Math.min(1, t / 2) * Math.min(1, (DUR - t) / 3);
  const pan = 0.5 + 0.35 * Math.sin(2 * Math.PI * t / (BEAT * 3));
  const mono = pad + bass + kick + clap;
  L[i] = (mono + arp * (1 - pan) * 1.4 + hat * 0.8) * fade;
  R[i] = (mono + arp * pan * 1.4 + hat * 1.2) * fade;
}
// Normalisation et écriture WAV 16 bits stéréo
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const g = 0.85 / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(L[i] * g * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(R[i] * g * 32767), 46 + i * 4);
}
fs.writeFileSync(OUT, buf);
console.log('music', DUR + 's', OUT);
