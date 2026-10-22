---
name: video-motion-design
description: Produire les vidéos motion design ResumeCI (vertical 1080x1920, 30 i/s, musique originale, SANS voix off) à partir d'enregistrements d'écran du téléphone fournis par l'utilisateur : repérage des passages utiles, coupe du superflu, accélération x1,5, incrustation dans un téléphone animé, titres animés, badges d'accès (Pass Élite / ouvert à tous), transitions et export vers le dossier VIDEO RESUMECI.
---

# Vidéos motion design ResumeCI

Moteur committé : `tools/motion-video/` — NE PAS le relire en entier, tout est décrit ici.
Projets (sources, images, sortie) : `_video/<projet>/` (ignoré par git).
Sortie livrée : `C:\Users\DJEBLE\OneDrive\Desktop\VIDEO RESUMECI\VIDEO RESUMECI\NN_ResumeCI_<Sujet>.mp4`
(numéroter à la suite du plus grand `NN_` existant dans ce dossier).

## Style imposé
- Vertical 1080x1920, charte CI (orange `#f77f00` / vert `#009e60`, fond crème, drapeau en haut), police Inter, icônes Font Awesome.
- **Musique seule** (synthèse originale `music.js`), **jamais de voix off**.
- Aller à l'essentiel : 45–75 s au total. Supprimer claviers à l'écran, chargements, retours à l'accueil, défilements répétés, hésitations.
- Extraits d'écran accélérés **x1,5 par défaut** (4ᵉ valeur du clip pour changer).
- Toujours indiquer l'accès réel de la fonctionnalité avec `access` (ne jamais promettre plus que ce qui existe) :
  - `'elite'` → badge « PASS ÉLITE · TERMINALES A, C, D » (Sujets & Interros, Mode Examen : actuellement Tle A/C/D uniquement)
  - `'all'` → « OUVERT À TOUS · TOUS LES ABONNEMENTS » (Avis, fonctions gratuites)
  - texte libre → badge violet personnalisé
- Aucun faux témoignage, aucun chiffre inventé : compter dans le code/catalogue avant d'afficher un compteur.

## Étapes (dans cet ordre, sans exploration supplémentaire)
1. **Sources** : copier chaque vidéo de l'utilisateur dans `_video/<projet>/src/` sous des noms courts (`A.mp4`, `B.mp4`…). Les enregistrements WhatsApp font 288x640.
2. **Repérage sans regarder toute la vidéo** — planche-contact horodatée (une image / 3 s) :
   ```bash
   F="fontfile='C\:/Windows/Fonts/arial.ttf'"   # obligatoire, sinon drawtext plante (pas de fontconfig)
   ffmpeg -v error -y -i src/A.mp4 -vf "fps=1/3,scale=180:-1,drawtext=$F:text='%{pts\:hms}':x=4:y=4:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.7,tile=10x4" -frames:v 1 sheets/A.jpg
   ```
   Lire l'image, noter les intervalles utiles (début, durée).
3. **`_video/<projet>/scenes.js`** — tableau de scènes :
   ```js
   { id:'intro', type:'intro', dur:4, pill:'<i class="fas fa-bolt"></i> Mise à jour', tag:'Les nouveautés sont là' }
   { id:'x', type:'hero', dur:5, access:'elite', icon:'fa-crown', pill:'…', title:'Titre<br><span class="grad">accent</span>',
     sub:'…', counters:[[81,'sujets']], stars:true, cards:[['fa-calculator','Maths']], note:'…' }   // champs optionnels
   { id:'d_x', type:'demo', access:'all', n:'01', label:'NOUVEAU', title:'…', sub:'…',
     clips:[['A', debut_s, duree_s /*, vitesse=1.5 */]], hold:0.6 }                               // hold = fige la dernière image
   { id:'cta', type:'cta', dur:5.5, tag:'Tout est déjà en ligne sur', button:'Commencer gratuitement' }
   ```
   Durée d'une démo = Σ durée/vitesse (+hold). Viser 5–15 s par démo.
4. **Aperçus** (1 image par scène, rapide) puis vérifier 2–3 images via une planche `hstack` :
   ```bash
   node tools/motion-video/render.js _video/<projet> preview
   ```
   (le téléphone est vide en aperçu : l'écran est incrusté à l'assemblage).
5. **Rendu + assemblage** (lancer en arrière-plan, plusieurs minutes) :
   ```bash
   node tools/motion-video/render.js _video/<projet> && node tools/motion-video/assemble.js _video/<projet> NN_ResumeCI_<Sujet>
   ```
   Pour re-rendre une seule scène : `render.js _video/<projet> d_x` puis relancer `assemble.js`.
6. **Contrôle** : `ffprobe` (durée, 1080x1920, piste audio) + extraire 1–2 images (`-ss`) d'une scène démo pour vérifier l'incrustation.
7. **Livraison** : copier le MP4 dans le dossier VIDEO RESUMECI (numéro suivant). Résumer à l'utilisateur : durée, scènes, passages coupés.

## Pièges connus
- Chrome déjà ouvert → le moteur utilise un `userDataDir` temporaire (déjà géré).
- `spawnSync`/`execFileSync` peut renvoyer EPERM (antivirus) : `assemble.js` réessaie automatiquement.
- `edge-tts` renvoie 403 et aucune voix off n'est voulue : ne pas en ajouter.
- Ne jamais committer `_video/` (sources et vidéos lourdes).
