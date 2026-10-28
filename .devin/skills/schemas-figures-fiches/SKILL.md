---
name: schemas-figures-fiches
description: >-
  Utilisez cette compétence pour ajouter des schémas/figures aux fiches de résumé ResumeCI.
  Les figures sont dessinées en SVG inline À PARTIR des schémas des PDF de leçons
  (fidélité pédagogique) ou découpées en HD depuis le PDF (anatomie, cartes, montages).
  Processus figé : audit PDF → extraction → SVG → vérif visuelle → test local → GO → déploiement.
---

# Compétence : Schémas & Figures des Fiches de Résumé (méthode validée par l'utilisateur)

## ⛔ RÈGLES NON NÉGOCIABLES

1. **STRICTEMENT RIEN SANS LE PDF** : aucune figure n'est ajoutée à une fiche dont le PDF source de la leçon n'est pas en main. Jamais de schéma « déduit » du texte de la fiche ou dessiné de mémoire — fidélité = reproduction des schémas réels du cours. Si le PDF manque → le récupérer d'abord (skill `telechargeur-ecole-ci`) ou demander à l'utilisateur.
   - Chaque figure : mêmes labels, mêmes lettres de points, même structure, mêmes flèches que le cours.
2. **1 à 4 figures par fiche max**, placées là où le texte devient abstrait. Pas de décoration gratuite.
3. **Test local obligatoire avant déploiement** (règle d'or du skill devops-deploiement-cache) : l'utilisateur vérifie sur `localhost:8080` et donne son GO explicite.
4. Figures = **SVG inline dans le HTML de la fiche** (zéro image externe, marche hors-ligne PWA, net partout, ~2-5 Ko).

## 🔧 PIPELINE (ordre exact)

### 1. Trouver le PDF source de la leçon
- Dossiers `Cours_*/{Matière}/…pdf` à la racine du repo (ex. `Cours_Terminale_C/Mathématiques/`).
- Si le PDF n'existe plus localement → demander à l'utilisateur de le déposer ou proposer le scraper ecole-ci.org (skill `telechargeur-ecole-ci`).

### 2. Repérer les pages à schémas (PyMuPDF, déjà installé)
```python
import fitz
doc = fitz.open(pdf_path)
for i, p in enumerate(doc):
    print(i+1, len(p.get_images()), 'img,', len(p.get_drawings()), 'dessins')
    p.get_pixmap(dpi=100).save(f'_schemas_test/.../p{i+1}.png')
```
- Beaucoup de `dessins` (>50) ou des `images` → page probablement à schéma.
- **Lire les PNG avec l'outil `read`** (rendu visuel) pour voir chaque schéma et noter ses labels exacts.

### 3. Choisir le traitement PAR schéma
| Type de schéma | Traitement |
|---|---|
| Courbes, tableaux de variation, géométrie (triangles, cercles, repères), arbres de proba, circuits, frises, bilans en T, flux, organigrammes | **Redessiné en SVG** dans le style de la fiche |
| Anatomie détaillée (SVT), cartes géo, photos, montages complexes | **Découpe HD** : `page.get_pixmap(clip=rect, dpi=200)` → PNG → base64 ou fichier joint |

### 4. Insérer dans la fiche — GABARIT VALIDÉ

CSS à ajouter une fois dans le `<style>` de la fiche (copier tel quel) :
```css
figure.fig{margin:16px 0;padding:14px 10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px}
.fig .frow{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.fig .cell{flex:0 1 205px;text-align:center}
.fig svg{max-width:100%;height:auto}
.fig .cap{font-size:11px;font-weight:700;color:#334155;margin-top:2px}
.fig .fml{font-size:11px;font-weight:700;color:#b45309}
figure.fig>figcaption{margin-top:10px;font-size:12px;color:#64748b;text-align:center;font-style:italic}
```

HTML : une `<figure class="fig">` par emplacement, cellules `.cell` = SVG `viewBox="0 0 200 140"` + `.cap` (titre) + `.fml` (formule en ambre). Pour un schéma large (arbre de décision) : un seul `<svg viewBox="0 0 720 190">` sans `.frow`.

**Palette validée** : points `#0ea5e9` (objet) / `#2563eb` (fixes A,B,Ω) / `#dc2626` (marques : angle droit, ticks, θ) ; lignes `#334155` ; construction `#94a3b8` en `stroke-dasharray:5 4` ; fonds `#eff6ff` ; textes `<text font-size="11-13" font-weight="700" fill="#334155">`.
Unicode maths comme la fiche : ′ ⃗ ̅ π θ ω ∈ ℝ ℂ ≡ ≈ → sub/sup HTML dans `.fml`, `<tspan>` dans le SVG.
Légende : `<figcaption>Fig. n — description…</figcaption>`.

### 5. Vérification visuelle AVANT de montrer à l'utilisateur
```bash
node _schemas_test/shot.js "Fiches_Resume/.../fiche.html" "_schemas_test/sortie.png"
```
(script puppeteer-core existant : Chrome/Edge local, viewport 780px, fullPage). Lire le PNG, corriger tout débordement/label mal placé.

### 6. Test local (sans rebuild complet)
```bash
Copy-Item "Fiches_Resume/.../fiche.html" "payment-api/fiches/.../fiche.html" -Force
```
→ visible sur `localhost:8080` avec un compte test (🧪 pour changer de classe). Montrer à l'utilisateur.

### 7. Déploiement — uniquement après GO explicite
`node src/build_static.js` (régénère les copies publiées + index) → vérifs → commit → push (Render) → `firebase deploy --only hosting` → bump `?v=` + `CACHE_SHELL`.

## 📌 Repères utiles
- Fiches sources : `Fiches_Resume/{Classe}/{Matière}/Fiche_*.html` (un seul `<style>` inline par fiche, souvent fichier sur 1 ligne → ancrer les `edit` sur des sous-chaînes uniques).
- Fiches servies : `payment-api/fiches/...` via `GET /api/fiche/{cls}/{sub}/{file}` (sessionToken + premium, 1ʳᵉ fiche/matière gratuite).
- Screenshot : `_schemas_test/shot.js` (puppeteer-core, dépendance du repo).
- Fichiers temporaires : `_schemas_test/` (non commité, comme `_extracts_*`).
- Exemple validé : `Fiches_Resume/Terminale_C/Mathématiques/Fiche_Math_L13_Nombres_complexes_geometrie_plan.html` (4 figures : configs triangle, lignes de niveau, transformations, arbre de décision).
