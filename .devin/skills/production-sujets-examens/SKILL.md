---
name: production-sujets-examens
description: >-
  Produire des interrogations, devoirs surveillés et examens type BAC ResumeCI
  (PDF énoncé + corrigé, marque ResumeCI, Pass Élite) pour toutes les classes et
  matières : Maths, Physique-Chimie, SVT, Français, Philosophie, Histoire-Géo.
  Garantit des sujets 100 % originaux (légal CI), des schémas SVG intégrés et
  zéro symbole LaTeX brut visible par l'élève.
---

# Compétence : Production de Sujets d'Examens ResumeCI (Interros · Devoirs · BAC blanc)

## ⚖️ RÈGLE D'OR — LÉGALITÉ (non négociable)

- **JAMAIS de copier-coller** de sujets DRENA, manuels scolaires, fomesoutra, ecole-ci
  ou toute source protégée (Loi n° 2016-555 du 26/07/2016, BURIDA, Accord de Bangui/OAPI).
- **fomesoutra.com = référence de FORMAT uniquement** : on y consulte la structure
  réelle des épreuves ivoiriennes (nombre d'exercices, durées, barèmes, types
  « BAC blanc », « devoir communal », « BAC départemental », style des consignes
  et des énoncés par matière) — puis on RÉDIGE des sujets originaux dans ce moule.
  Recopier un énoncé ou ses données est interdit ; s'aligner sur le format est exigé.
- Chaque exercice est **rédigé de zéro par l'agent** : données, contexte, valeurs
  numériques, rédaction et corrigé entièrement originaux.
- Contextualisation ivoirienne encouragée : Adjamé, attiéké de Dabou, tontine,
  cacao, niébé de Korhogo, lagoon, FHB… — mais situations inventées.
- S'inspirer des *compétences* du programme officiel est permis ; recopier
  l'énoncé, les données ou la trame d'un sujet existant est interdit.

## 📁 Emplacements

| Quoi | Où |
|---|---|
| Specs sources (JSON) | `tools/interros/specs/RC-<CL>-<MAT>-<NN>.json` |
| PDF générés | `_interros/` (ignoré par git) |
| PDF servis par l'API | `payment-api/interros/` + `catalog.json` (committés) |
| Specs « Mode Examen » jouables | `tools/exams/specs/<code>.exam.json` → copier vers `payment-api/` |

Codes : `RC-TD-MATH-01`, `RC-TC-PC-02`… (TD=Terminale D, TC=Terminale C, TA=Terminale A, 1D=Première D, 3E=3ème…). Pour une épreuve **commune à plusieurs classes** (ex. Français BAC) : champ `classes` au lieu de `classe_key`.

## 📝 Format de spec (gabarit exact)

```json
{
  "code": "RC-TC-MATH-01",
  "type": "interro",            // interro | devoir | bac
  "matiere": "Mathématiques",
  "classe": "Terminale C",      // classeKey = classe.replace(/ /g,'_') → Terminale_C
  "duree": "1 heure",
  "bareme": "10 points",
  "chapitre": "Dérivation · Étude de fonctions",
  "consignes": "La calculatrice n'est pas autorisée. Soit $f$ définie par …",
  "exercices": [
    {
      "titre": "Exercice 1 — Étude de fonction",
      "points": "5 pts",
      "consigne": "Soit $f(x)=x^2-4x+3$.",
      "enonce": "<p>Texte HTML de l'énoncé…</p><ol type='a'><li>Question a</li></ol>",
      "svg": "<svg viewBox='0 0 400 260' xmlns='http://www.w3.org/2000/svg'>…schéma…</svg>",
      "correction": "<p><strong>a)</strong> … <span class='reponse'>réponse</span></p>",
      "bareme_detail": "a) 1 pt · b) 2 pts · c) 2 pts"
    }
  ]
}
```

- `enonce`, `correction`, `consigne`, `consignes`, `titre`, `chapitre` acceptent HTML + `$…$` (inline) / `$$…$$` (bloc) KaTeX.
- `bareme_detail` : texte brut, affiché seulement dans le corrigé.
- `svg` (optionnel) : **schéma intégré au sujet**, centré, `viewBox` obligatoire, pas de `width/height` fixes trop grands (max ~400×260).

## 📐 Schémas — OBLIGATOIRES quand l'exercice en comporte un

Si le vrai sujet aurait une figure (circuit, montage de dosage, plan incliné,
courbe, repère, arbre, frise chronologique, histogramme), la spec DOIT avoir un
champ `svg` avec un schéma propre, noir sur blanc, style sujet imprimé :
- axes/trait `stroke="#334155"`, flèches `marker-end`, labels `font-family="Georgia"` ~13px ;
- vecteurs en flèches nommées ($\vec{F}$ via `<tspan>` ou texte Unicode) ;
- pas de remplissage criard — gris clair `#f1f5f9` / accents `#2563eb`.

### ⚠️ Schéma « à compléter » = version VIDE dans l'énoncé

Si une question demande à l'élève de **représenter, légender, compléter ou placer**
quelque chose sur un schéma (vecteurs forces, légendes, point de tangente…) :
- `ex.svg` (énoncé) = la version **NON corrigée** : la figure sans les réponses
  (plan incliné + bloc mais PAS les vecteurs demandés ; montage numéroté ①②③
  mais sans les noms ; courbe sans le point demandé ni les pointillés-guides).
- Le schéma **corrigé complet** va dans `correction` (un `<svg>` peut être
  inséré directement dans le HTML du corrigé — `md()` le laisse passer).
- Ne jamais mettre dans l'énoncé une figure qui révèle la réponse attendue.

## 📚 RÈGLE FICHES DISPONIBLES — pas de sujet sans leçon

**Avant de produire un sujet pour une classe**, vérifier que le chapitre traité a
une fiche sur la plateforme : `Fiches_Resume/{Classe}/{Matiere}/` (ou
`data/structure.json`). Un élève doit pouvoir réviser la leçon PUIS faire l'interro.
Si la fiche n'existe pas → **ne pas produire le sujet** (ou écrire la fiche
d'abord avec le skill `generation-fiches-cours`).

### Matrice actuelle des matières AVEC fiches (à maintenir à jour)

| Classe | Matières couvertes par des fiches |
|---|---|
| `Terminale_D` | Français, Histoire-Géographie, Mathématiques, Philosophie, Physique-Chimie, SVT |
| `Terminale_C` | Mathématiques, Physique-Chimie **uniquement** |
| `Terminale_A` | Français, Histoire-Géographie, Mathématiques, Philosophie |

⚠️ Une spec `classes` multi-classes ne doit cibler que des classes où la matière
a des fiches (ex. Français commun = A + D, PAS C tant que ses fiches manquent).
Toujours recroiser le `chapitre` de la spec avec les titres de fiches réels.

## 🚫 Zéro symbole brut — vérification OBLIGATOIRE

Jamais de `$`, `\frac`, `\sqrt`, `\mathrm`… visibles dans le rendu élève.
Après TOUTE écriture/modif de spec :

```bash
node tools/interros/check_symbols.js   # doit afficher "AUCUN symbole brut"
```

Le script audite tous les champs rendus (`consignes`, `titre`, `consigne`,
`enonce`, `correction`, `chapitre`). S'il signale un `$` résiduel : corriger la
spec (formule mal fermée, `$` littéral → écrire « F CFA »).

## ⚙️ Pipeline complet (dans l'ordre)

```bash
# 1. Rédiger la spec dans tools/interros/specs/
# 2. AUDIT symboles (obligatoire)
node tools/interros/check_symbols.js
# 3. Rendre les PDF (Chrome, fallback Edge auto)
node tools/interros/render_interro.js tools/interros/specs/RC-XX-YYY-NN.json ...
# 4. Reconstruire le catalogue + copier vers payment-api/interros/
node tools/interros/build_catalog.js
# 5. Commit payment-api/interros/*.pdf + catalog.json + specs
# 6. Push → Render déploie ; les PDF sont servis via GET /api/interro/:code/:part
```

## 🔐 Effet sur le Pass Élite (à connaître)

- `/api/pay` autorise l'achat Élite **uniquement pour les classes présentes au
  catalogue** — publier un sujet d'une nouvelle classe ouvre automatiquement
  l'Élite à cette classe. Ne publier une classe que si son contenu est complet.
- Les PDF ne sont jamais en statique : sessionToken + plan Élite vérifié serveur.
- Le frontend filtre par `classe` (« Ma classe » / « Toutes ») — renseigner
  `classe` exactement comme `selectedClass` : `Terminale A|C|D`, `Premiere A|C|D`, `3eme`…

## ✅ Checklist avant livraison

1. Contenu 100 % original, corrigé recalculé à la main.
2. `check_symbols.js` propre.
3. Schéma SVG présent si l'exercice en comporte un.
4. Durée/barème cohérents (interro ≈ 1 h/10 pts · devoir ≈ 2 h/20 pts · bac ≈ 4 h/20 pts).
5. `build_catalog.js` exécuté → nouveau code visible dans `catalog.json`.
6. Difficulté fidèle au programme officiel de la classe (ni trop facile, ni hors-programme).
