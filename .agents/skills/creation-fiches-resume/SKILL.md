---
name: creation-fiches-resume
description: >-
  Utilisez cette compétence lorsque l'utilisateur demande de générer les fiches de résumé d'une classe.
  Le processus implique de créer un compte sur lyc.ecole-ci.org (si nécessaire), télécharger les cours (PDF),
  extraire le texte, puis rédiger MANUELLEMENT (par l'IA elle-même, avec soin) les résumés en respectant le style HTML du site.
---

# Compétence : Génération de Fiches de Résumés (Rédaction Soigneuse par l'Agent)

## Étape 1 : Inscription et Récupération des cours (Scraping)
1. Utilisez l'outil `browser_subagent` pour naviguer sur le site **lyc.ecole-ci.org**.
2. **Inscription :** Si aucun compte n'est fourni, naviguez vers la page d'inscription et créez un compte avec des informations fictives ou une adresse e-mail temporaire (si la plateforme l'autorise publiquement).
3. Naviguez vers la classe cible (ex: 3ème) et trouvez les cours pour les matières spécifiées.
4. Téléchargez les fichiers PDF des cours.

## Étape 2 : Extraction du texte des PDF
1. Utilisez un script Python (via `run_command` avec `python` et `pdfplumber` ou `PyMuPDF`) pour extraire le texte brut des PDF téléchargés.

## Étape 3 : Rédaction "Manuelle" par l'Agent et Stylisation
1. **RÉDACTION MANUELLE :** Vous (l'Agent) ne devez pas déléguer cela à un algorithme basique. Vous devez lire le texte extrait et **rédiger vous-même** le résumé de manière intelligente, pédagogique et structurée, comme le ferait un vrai professeur.
2. **CRITIQUE - Respect du Style :** Vous devez analyser les fiches de résumé déjà présentes dans les fichiers HTML de l'utilisateur (dossier `public/`).
3. Le HTML de votre nouvelle fiche **doit avoir exactement la même structure de balises et les mêmes classes CSS** que les anciennes fiches.

## Étape 4 : Enregistrement
1. Enregistrez chaque résumé final dans le bon dossier du projet en utilisant l'outil `write_to_file`.
