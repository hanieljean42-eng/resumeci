---
name: scraper-cours-ecole-ci
description: >-
  Agent d'automatisation chargé de récupérer l'ensemble des leçons au format PDF sur ecole-ci.org (Mon École à la Maison),
  selon la classe et les matières sélectionnées, avec connexion Visiteur 0594889379 et gestion du double-clic (200-300ms).
---

# Agent d'automatisation : Téléchargement des cours sur Mon École à la Maison

## 🎯 Objectif principal
Récupérer l'ensemble des leçons au format PDF disponibles sur la plateforme **ecole-ci.org**, selon la classe et les matières sélectionnées par l'utilisateur. 
L'agent doit obligatoirement classer les fichiers téléchargés dans une hiérarchie de dossiers bien définie :
`Cours_{CLASSE} / {MATIERE} / {Titre_Lecon}.pdf`

## ⚙️ Informations d'accès et contraintes du site
1. **Authentification :** Se connecter via le profil **Visiteur** en utilisant obligatoirement le numéro de téléphone **`0594889379`**.
2. **Mécanisme de clic :** L'ouverture des menus, des sous-niveaux et des matières nécessite **deux clics successifs (double-clic)** avec un intervalle court de **200 à 300 millisecondes** sur chaque élément déroulant.
3. **Gestion des délais :** Appliquer une temporisation de **2 à 3 secondes** après chaque action pour laisser le temps aux sections de se déplier et aux pages de charger.

---

## 📋 Déroulement pas à pas de l'agent :

### Étape 1 : Connexion au portail
- Ouvrir le navigateur et se rendre sur `ecole-ci.org`.
- Cliquer sur le bouton **« Je suis un visiteur »**.
- Saisir le numéro de téléphone **`0594889379`** dans le champ prévu, puis cliquer sur **« Je me connecte »**.

### Étape 2 : Accès aux cours et supports
- Une fois sur le tableau de bord, ouvrir le menu des services en haut à gauche et cliquer sur l'option **« Tous les cours et supports »** pour afficher la liste complète des niveaux d'enseignement.

### Étape 3 : Création de l'arborescence des dossiers
- Créer le dossier racine de la classe : `Cours_{CLASSE}` (ex: `Cours_PREMIERE_A` ou `Cours_4EME`).
- Pour chaque matière choisie, créer le sous-dossier dédié : `Cours_{CLASSE}/{MATIERE}/` (ex: `Cours_PREMIERE_A/Francais/`).

### Étape 4 : Sélection du niveau et de la classe
- Sur la page des cours, repérer le niveau général (ex : `PREMIERE` ou `COLLEGE`) et appliquer **deux clics (intervalle 250ms)** avec délai de 2-3s pour ouvrir l'accordéon.
- Repérer la classe exacte (ex : `PREMIERE A` ou `4EME`) et appliquer à nouveau **deux clics** pour afficher la liste des matières.

### Étape 5 : Traitement des matières et extraction des leçons
Pour chaque matière demandée :
1. Effectuer deux clics sur le nom de la matière pour afficher ses modules et ses leçons.
2. Scanner la section ouverte et extraire tous les liens pointant vers les leçons.
3. Noter le titre de chaque leçon pour nommer le futur fichier PDF.

### Étape 6 : Téléchargement et classement des leçons
Pour chaque leçon trouvée :
1. Ouvrir la page de la leçon.
2. Cliquer sur le bouton **« Je lis le résumé de la leçon »**.
3. Intercepter le fichier PDF généré.
4. Renommer le fichier avec le titre de la leçon (en retirant les caractères spéciaux interdits) et l'enregistrer directement dans le sous-dossier correspondant à la matière (`Cours_{CLASSE}/{MATIERE}/`).
5. Répéter l'opération pour toutes les leçons de la matière, puis passer à la matière suivante.

### Étape 7 : Fin de mission
Lorsque toutes les matières indiquées ont été parcourues et que tous les fichiers PDF sont sauvegardés, afficher un message de confirmation récapitulant le nombre de leçons enregistrées et fermer le navigateur.

---

## 💻 Script Prêt à l'Emploi
Pour exécuter cet agent directement sans réécrire de code :
```bash
python src/agent_ecole_ci_download.py --classe PREMIERE_A
# ou
python src/agent_ecole_ci_download.py --classe 4EME
```
