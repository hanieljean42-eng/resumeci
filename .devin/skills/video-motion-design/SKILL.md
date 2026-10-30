---
name: video-motion-design
description: Produire les vidéos motion design ResumeCI (vertical 1080x1920, 30 i/s, musique originale, SANS voix off) à partir d'enregistrements d'écran du téléphone fournis par l'utilisateur : repérage des passages utiles, coupe du superflu, accélération x1,5, incrustation dans un téléphone animé, titres animés, badges d'accès (Pass Élite / ouvert à tous), transitions et export vers le dossier VIDEO RESUMECI.
---

# Vidéos motion design ResumeCI

Moteur committé : `tools/motion-video/` — NE PAS le relire en entier, tout est décrit ici.
Projets (scenes.js, sources, sortie) : `_video/<projet>/` (ignoré par git) ; images/segments : `%LOCALAPPDATA%\rci-motion\<projet>\`.
Sortie livrée : `C:\Users\DJEBLE\OneDrive\Desktop\VIDEO RESUMECI\VIDEO RESUMECI\NN_ResumeCI_<Sujet>.mp4`
(numéroter à la suite du plus grand `NN_` existant dans ce dossier).

## Style imposé
- Vertical 1080x1920, décor tiré au hasard parmi 6 (voir « Décors »), bandeau de couleur en haut, police Inter, icônes Font Awesome.
- **Musique seule** (synthèse originale `music.js`), **jamais de voix off**.
- Aller à l'essentiel : 45–75 s au total. Supprimer claviers à l'écran, chargements, retours à l'accueil, défilements répétés, hésitations.
- Extraits d'écran accélérés **x1,5 par défaut** (4ᵉ valeur du clip pour changer).
- Toujours indiquer l'accès réel de la fonctionnalité avec `access` (ne jamais promettre plus que ce qui existe) :
  - `'elite'` → badge « PASS ÉLITE · TERMINALES A, C, D » (Sujets & Interros, Mode Examen : actuellement Tle A/C/D uniquement)
  - `'all'` → « OUVERT À TOUS · TOUS LES ABONNEMENTS » (Avis, fonctions gratuites)
  - texte libre → badge violet personnalisé
  - Flashcards et Quiz : `'ÉLÈVES : PASS PRO 1 000 F/MOIS · ÉTUDIANTS : 2 000 F/MOIS'` (débloqués à partir de ces formules)
- Une capture qui montre plusieurs fonctionnalités → **une vidéo par fonctionnalité** (un projet par vidéo, même `src/`).
- Aucun faux témoignage, aucun chiffre inventé : compter dans le code/catalogue avant d'afficher un compteur.

## Décors (tirés au hasard)
6 décors : `ci` (crème orange/vert), `ocean` (bleu/cyan, rayures), `violet` (violet/rose, rayures), `sunset` (orange/rouge), `menthe` (vert, points), `nuit` (fond sombre, accents or/vert).
- Au 1ᵉʳ `render.js`, un décor est **tiré au hasard** (jamais le même que la vidéo précédente, mémorisé dans `_video/.last_theme`) puis figé dans `_video/<projet>/theme.json` → aperçus, rendu et assemblage restent cohérents.
- Chaque décor a **sa propre musique** (tempo + grille d'accords) choisie automatiquement par `assemble.js`.
- Ne PAS choisir le décor soi-même sauf demande explicite de l'utilisateur : écrire alors `{"theme":"nuit"}` dans `theme.json` avant le rendu. Pour re-tirer : supprimer `theme.json` puis relancer le rendu complet.
- Annoncer le décor tiré à l'utilisateur dans le récapitulatif.

## Qualité HD des captures (IMPORTANT)
- **WhatsApp réduit les vidéos en 288x640 (~0,8 Mb/s)** : texte flou une fois agrandi. Aucun filtre ne recrée les détails perdus.
- `assemble.js` affiche `⚠️ … 288px de large` si la source est basse définition. Dans ce cas, **le signaler à l'utilisateur** et lui demander, pour la suite :
  1. Enregistreur d'écran du téléphone réglé en **1080p, débit élevé (≥ 12 Mb/s), 30 i/s** ;
  2. Envoyer le fichier **en « Document »** sur WhatsApp (trombone → Document), ou via Google Drive / câble USB — jamais comme vidéo normale ;
  3. Filmer lentement : défilements doux, pauses de 1–2 s sur chaque écran important.
- Le moteur accepte toute résolution (recadrage relatif) : une source 1080x2400 donne un écran parfaitement net.
- Traitement déjà appliqué automatiquement : débruitage `hqdn3d` (blocs de compression) → agrandissement lanczos précis → netteté adaptative `cas` ; images JPEG qualité 95 ; segments CRF 14 ; export final CRF 15, profil High 4.2 (marge avant la recompression TikTok/WhatsApp).
- En cas de source basse définition, préférer des extraits où l'écran est **statique ou lent** (texte lisible) et éviter les défilements rapides.

## Référence validée par l'utilisateur : `_video/ada2/` (19_ResumeCI_Filiere_ADA_Demo)
Reproduire ce niveau pour chaque nouvelle capture :
- **Cadrage droit** : clip = `[src, début, durée, vitesse, cropTop]`. Détecter la barre d'URL Chrome seconde par seconde
  (`fps=1,crop=700:60:150:200,signalstats` → YAVG < 70 = barre visible) : `cropTop 72` si barre d'URL, `27` sinon (barre d'état seule).
  Le recadrage est centré et borné (assemble.js) : jamais d'écran décalé ni penché.
- **Analyse à fond** : planche 1 image/3 s puis planche fine 1 image/s, vérifier les images clés en pleine résolution.
- **Garder** : menus, fiches qui défilent, flashcards, quiz, modes de révision, examen, correction, stats/outils.
- **Couper** : chargements, retours répétés au menu, mauvais scores (ex. 1/5), autres classes que le sujet, sélecteur d'applis,
  claviers, écrans flous, **et tout bug visible** (le signaler + le corriger dans le code, jamais le montrer).
- Structure : intro → hero compteurs réels → démos numérotées (01, 02…) → hero offre/TD → hero outils → hero prix → CTA.

## Étapes (dans cet ordre, sans exploration supplémentaire)
1. **Sources** : copier chaque vidéo de l'utilisateur dans `_video/<projet>/src/` sous des noms courts (`A.mp4`, `B.mp4`…). Vérifier la résolution : `ffprobe -v quiet -select_streams v -show_entries stream=width,height,bit_rate -of compact src/A.mp4` (voir « Qualité HD »).
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
7. **Livraison** : copier le MP4 dans le dossier VIDEO RESUMECI (numéro suivant). Résumer à l'utilisateur : durée, décor tiré, scènes, passages coupés, et l'avertissement qualité si la source était en 288x640.

## Vitesse de fabrication (déjà optimisée, ne pas défaire)
- Images et segments dans `%LOCALAPPDATA%\rci-motion\<projet>\` (**hors OneDrive** : la synchro de milliers de JPEG ralentissait tout). Le projet ne garde que `scenes.js`, `theme.json`, `src/`, `sheets/`, `preview/` et le MP4.
- Rendu : plusieurs **navigateurs** Chrome en parallèle (`MOTION_WORKERS`, défaut = cœurs − 1), lancés l'un après l'autre (sinon EPERM). Jamais plusieurs onglets d'un même Chrome (captures bloquées).
- Décor des démos rendu 1 image sur 2 puis dupliqué ; halos en dégradé radial (pas de `filter: blur`).
- Assemblage : segments encodés en parallèle (`MOTION_FF_PAR`), transitions légères (pas de `smooth*`), export final `veryfast` CRF 14.
- Ordre de grandeur sur cette machine (4 cœurs) : ~35 s de vidéo = rendu ~2 min 30 + assemblage ~2 min 30.
- Plusieurs vidéos : lancer `render` + `assemble` de chaque projet dans **une seule commande en arrière-plan** (`timeout: 0`), puis attendre avec `get_output`.

## Pièges connus
- Chrome déjà ouvert → le moteur utilise un `userDataDir` temporaire (déjà géré).
- `spawnSync`/`execFileSync` peut renvoyer EPERM (antivirus) : `assemble.js` réessaie automatiquement.
- `edge-tts` renvoie 403 et aucune voix off n'est voulue : ne pas en ajouter.
- Ne jamais committer `_video/` (sources et vidéos lourdes).
