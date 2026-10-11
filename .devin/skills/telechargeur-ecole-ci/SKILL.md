---
name: telechargeur-ecole-ci
description: >-
  Télécharge et classe automatiquement les résumés de leçons PDF de « Mon École à la Maison » (ecole-ci.org /
  lyc.ecole-ci.org) pour une classe et des matières données, avec le compte visiteur, via le script
  src/telecharger_ecole_ci.js (connexion, catalogue Moodle, PDF « Je lis le résumé de la leçon », reprise, rapport).
argument-hint: '<CLASSE_CIBLE> [MATIERES] [DOSSIER_DESTINATION]'
triggers:
  - user
  - model
---

# Compétence : Téléchargeur automatique « Mon École à la Maison »

Récupère **tous les résumés de leçons (PDF)** d'une classe sur `ecole-ci.org` et les range dans
`[DOSSIER_DESTINATION]/[CLASSE_CIBLE]/[NOM_MATIERE]/[TITRE_LECON].pdf`.
Ne navigue **jamais** à la main dans le navigateur quand le script peut le faire : il est 50× plus rapide et ne rate aucune leçon.

## 1. Paramètres d'entrée

| Variable | Défaut | Exemple |
| --- | --- | --- |
| `NUMERO_VISITEUR` | `$ECOLE_CI_PHONE` sinon `0594889379` (compte visiteur de Paul) | `0594889379` |
| `CLASSE_CIBLE` | *obligatoire* — nom exact du catalogue | `"PREMIERE A"`, `"TERMINALE D"`, `"SECONDE C"` |
| `MATIERES` | `all` (toutes) | `"Français,Histoire-Géographie"` |
| `DOSSIER_DESTINATION` | `./Telechargements` | `Cours_Premiere_A` |

Si la classe n'est pas donnée, demande-la. Les matières acceptent le nom sans accents ou son début (`"Histoire-Geo"`, `"Math"`, `"Francais"`).

## 2. Commande unique (depuis la racine du repo)

```bash
npm install                      # une seule fois (puppeteer-core n'est utilisé qu'en secours)
node src/telecharger_ecole_ci.js --classe "PREMIERE A" --matieres "Français,Histoire-Géographie" --dest ./Telechargements
# équivalent : npm run telecharger -- --classe "PREMIERE A" --matieres "Français"
```

Options utiles :
- `--dry-run` : liste les leçons trouvées sans rien télécharger (à lancer d'abord si la classe/matière est nouvelle).
- `--matieres all` : toute la classe.
- `--sous-dossiers` : garde les sous-catégories du site (`Lecture`, `Etude de Œuvre Intégrale`…) comme sous-dossiers.
- `--force` : re-télécharge même les PDF déjà présents (sinon reprise automatique : les PDF valides sont sautés).
- `--phone <numéro>` ou `ECOLE_CI_PHONE=…` : autre compte visiteur.
- `--site https://col.ecole-ci.org` : Moodle collège (6ème–3ème) au lieu du lycée (non testé, vérifier d'abord en `--dry-run`).
- `--delai-min 1500 --delai-max 2500` : temporisation aléatoire entre deux requêtes (défaut ; ne pas descendre sous 1000 ms pour ne pas surcharger le site).
- `--navigateur` : force la connexion via Chrome (puppeteer-core) si la connexion HTTP casse.

Pour plusieurs classes, lance une commande par classe (séquentiellement, jamais en parallèle sur le même compte).

## 3. Ce que fait le script (= procédure du site, automatisée)

1. **Connexion** « Je suis un visiteur » : POST `ecole-ci.org/co/resp/visiteur_moodle.php` (vérifie le numéro et renvoie
   l'URL Moodle), lit la règle de mot de passe dans `/js/codepassphone.js`, puis se connecte à `lyc.ecole-ci.org/login/index.php`.
   Secours automatique : Chrome headless qui tape le numéro, attend « N° Téléphone correct ! » et soumet le formulaire.
2. **Catalogue** `lyc.ecole-ci.org/course/` : lit directement les pages `course/index.php?categoryid=<id>&perpage=all`.
   Cela remplace la règle du **double-clic** de l'interface (les catégories `PREMIERE` → `PREMIERE A` → `Français` ne
   s'ouvrent qu'avec deux clics dans le navigateur ; en HTTP il suffit d'ouvrir la catégorie).
3. **Classe** : cherche `CLASSE_CIBLE` parmi les sous-catégories des niveaux (`SECONDE`, `PREMIERE`, `TERMINALE`…).
4. **Matières** : pour chaque matière, collecte récursivement toutes les leçons `course/view.php?id=…`
   (sous-catégories comprises), ouvre la page de la leçon, prend le lien **« Je lis le résumé de la leçon »**
   (`mod/resource/view.php?id=…&redirect=1` → `pluginfile.php/…pdf`) et enregistre le PDF.
   Noms nettoyés : `/ \ : * ? " < > |` → `_`. Doublons de titre suffixés par l'id du cours.
5. **Clôture** : revérifie chaque fichier (signature `%PDF-`, taille > 1 Ko) et écrit
   `[DEST]/[CLASSE]/_rapport.json` (statut par leçon : `ok`, `deja_present`, `pas_de_resume`, `erreur`, `invalide`).
   Code de sortie `2` s'il reste des erreurs → relancer la même commande (la reprise ne re-télécharge que le manquant).

## 4. Après le téléchargement

- Lis le résumé final `🏁 Terminé — X téléchargé(s)…` et `_rapport.json` ; donne à l'utilisateur le total par matière
  et la liste des leçons `pas_de_resume` / `erreur`.
- Pour ResumeCI, enchaîne avec la compétence **creation-fiches-resume** (extraction `node src/extract_lessons.js`,
  rédaction manuelle des fiches) en utilisant `--dest Cours_<Classe>` (ex. `Cours_Premiere_A`) : ce dossier est ignoré par git.
- **Ne jamais commiter** de PDF (`*.pdf`, `Cours_*/`, `pdfs/` sont dans `.gitignore`) ni les cookies de session.

## 5. Dépannage

| Symptôme | Action |
| --- | --- |
| `Numéro visiteur … non enregistré` | Le numéro n'a pas de compte : demander à Paul un numéro inscrit (ne pas créer de comptes en masse). |
| `Connexion Moodle refusée` / HTTP échoue | Relancer avec `--navigateur` ; si Chrome est introuvable, définir `CHROME_PATH`. |
| `Classe "…" introuvable` | Le message liste les classes vues : reprendre l'orthographe exacte (ex. `TERMINALE A1`). |
| `Matière "…" introuvable` | Le log `📚 Matières disponibles` donne les noms exacts. |
| `Pas de PDF (type text/html)` | La ressource n'est pas un PDF (vidéo, H5P, lien externe) : la signaler, ne rien inventer. |
| Site très lent / 5xx | Le script réessaie 3 fois ; sinon augmenter `--delai-min/--delai-max` et relancer plus tard. |

## 6. Navigation manuelle (uniquement si le script ne peut pas être utilisé)

Dans le navigateur : `https://ecole-ci.org/` → « Je suis un visiteur » → « J'accède » → saisir le numéro, attendre
« N° Téléphone correct ! » → « Je me connecte » → menu grille → « Tous les cours et supports ». Dans le catalogue,
**double-clic** (200–300 ms d'intervalle) sur le niveau, puis la classe, puis la matière ; attendre 1,5–2,5 s après
chaque action. Ouvrir la leçon → « Je lis le résumé de la leçon » → bouton Télécharger du lecteur PDF.
