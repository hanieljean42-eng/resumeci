/**
 * ═══════════════════════════════════════════════════════════
 * 📝 Mise à jour des Fiches Français avec Vrais Résumés
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const FICHES_DIR = path.join(__dirname, '..', 'Fiches_Resume', 'Premiere_D', 'Francais');

// ─── Résumés manuels EE (Expression Écrite) ───────────────────
const eeSummaries = {
  'EE 1_ Com_composé_analyser_const_organiser_CI': {
    sections: [
      {
        title: 'I. Analyse du Composé d\'Information',
        content: `Identifier les différents éléments : texte, image, graphique, tableau. Comprendre les relations entre les composants.`
      },
      {
        title: 'II. Construction de l\'Information',
        content: `Extraire les informations essentielles de chaque composant. Établir des liens logiques entre les éléments.`
      },
      {
        title: 'III. Organisation du CI',
        content: `Structurer l'information de manière cohérente. Hiérarchiser les idées selon leur importance.`
      },
      {
        title: 'IV. Synthèse',
        content: `Intégrer les informations dans un texte cohérent. Assurer la fluidité et la clarté de l'ensemble.`
      }
    ]
  },
  'EE 2_ Com_composé_rédiger_un_CI': {
    sections: [
      {
        title: 'I. Plan du CI',
        content: `Introduction (présentation des documents), Développement (analyse comparative), Conclusion (synthèse).`
      },
      {
        title: 'II. Rédaction de l\'Introduction',
        content: `Présenter le thème, les documents, la problématique. Annoncer le plan de développement.`
      },
      {
        title: 'III. Rédaction du Développement',
        content: `Analyser chaque document, comparer les points de vue, mettre en évidence convergences et divergences.`
      },
      {
        title: 'IV. Rédaction de la Conclusion',
        content: `Synthétiser les informations, répondre à la problématique, ouvrir vers une réflexion personnelle.`
      }
    ]
  },
  'EE 3_ Com_composé_rédiger_intro_et_conclusion': {
    sections: [
      {
        title: 'I. Introduction',
        content: `Accroche sur le thème, présentation des documents (nature, auteur, date), formulation de la problématique, annonce du plan.`
      },
      {
        title: 'II. Conclusion',
        content: `Bilan comparatif des documents, réponse à la problématique, ouverture vers une question plus large.`
      },
      {
        title: 'III. Liens avec le Développement',
        content: `L'introduction annonce ce qui va être traité. La conclusion reprend les éléments essentiels du développement.`
      },
      {
        title: 'IV. Qualités Rédactionnelles',
        content: `Clarté, précision, transitions fluides, vocabulaire approprié, syntaxe correcte.`
      }
    ]
  },
  'EE 4_ Dissert_littér_Analyser_sujet': {
    sections: [
      {
        title: 'I. Lecture du Sujet',
        content: `Repérer les mots clés, comprendre la consigne, identifier les limites du sujet.`
      },
      {
        title: 'II. Analyse des Termes',
        content: `Définir chaque terme important, repérer les relations entre les termes, identifier les implicites.`
      },
      {
        title: 'III. Problématique',
        content: `Formuler la question philosophique ou littéraire centrale du sujet. Mettre en tension les enjeux.`
      },
      {
        title: 'IV. Délimitation',
        content: `Définir le champ de la réflexion, éviter les hors-sujet, centrer sur l'essentiel.`
      }
    ]
  },
  'EE 5_ Dissert_littér_Rechercher_ldées': {
    sections: [
      {
        title: 'I. Brainstorming',
        content: `Noter toutes les idées qui viennent à l'esprit sans filtrer. Explorer différentes pistes de réflexion.`
      },
      {
        title: 'II. Classement des Idées',
        content: `Regrouper les idées par thèmes, identifier les arguments, trouver des exemples littéraires.`
      },
      {
        title: 'III. Sélection',
        content: `Choisir les idées les plus pertinentes, éliminer les redondances, assurer la cohérence.`
      },
      {
        title: 'IV. Organisation',
        content: `Structurer les idées en axes de réflexion, préparer le plan détaillé de la dissertation.`
      }
    ]
  },
  'EE 6_ Dissert_littér_Elaborer_plan': {
    sections: [
      {
        title: 'I. Types de Plans',
        content: `Plan thématique (3 aspects du sujet), plan dialectique (thèse-antithèse-synthèse), plan analytique (problème-causes-solutions).`
      },
      {
        title: 'II. Construction du Plan',
        content: `Définir 3 parties équilibrées, assurer la progression logique, préparer transitions.`
      },
      {
        title: 'III. Plan Détaillé',
        content: `Pour chaque partie : thèse, arguments, exemples, transition. Préciser les références littéraires.`
      },
      {
        title: 'IV. Vérification',
        content: `Vérifier que le plan répond au sujet, assurer la cohérence d'ensemble, équilibrer les parties.`
      }
    ]
  },
  'EE 7_ Dissert_littér_Rédiger_partie_dvpment': {
    sections: [
      {
        title: 'I. Structure d\'une Partie',
        content: `Phrase d'annonce de la partie, développement des arguments avec exemples, phrase de transition vers la partie suivante.`
      },
      {
        title: 'II. Argumentation',
        content: `Énoncer clairement l'argument, l'illustrer avec des exemples littéraires précis, commenter l'exemple.`
      },
      {
        title: 'III. Connecteurs Logiques',
        content: `Utiliser des connecteurs : d'abord, ensuite, en outre, cependant, par conséquent, en conclusion.`
      },
      {
        title: 'IV. Qualités',
        content: `Clarté, précision, richesse du vocabulaire, variété des constructions syntaxiques.`
      }
    ]
  },
  'EE 8_ Dissert_littér_Rédiger_Intro_Conclusion': {
    sections: [
      {
        title: 'I. Introduction',
        content: `Accroche, définition des termes, présentation de la problématique, annonce du plan en 3 parties.`
      },
      {
        title: 'II. Conclusion',
        content: `Synthèse des arguments développés, réponse à la problématique, ouverture vers une nouvelle question.`
      },
      {
        title: 'III. Équilibre',
        content: `Introduction et conclusion doivent être proportionnelles au développement (environ 10% chacune).`
      },
      {
        title: 'IV. Style',
        content: `Ton académique, précision, absence de familiarités, vocabulaire littéraire approprié.`
      }
    ]
  },
  'EE 9_ Prdtion-écrite_Analyser_sujet-Rech_idées': {
    sections: [
      {
        title: 'I. Analyse du Sujet',
        content: `Comprendre la consigne, repérer les mots clés, identifier le type de production attendue.`
      },
      {
        title: 'II. Recherche d\'Idées',
        content: `Mobiliser ses connaissances, faire des associations, chercher des exemples pertinents.`
      },
      {
        title: 'III. Sélection',
        content: `Choisir les idées les plus adaptées au sujet, éliminer les hors-sujet, organiser logiquement.`
      },
      {
        title: 'IV. Préparation',
        content: `Élaborer un plan rapide, noter les exemples clés, préparer le vocabulaire essentiel.`
      }
    ]
  },
  'EE 10_ Prdtion-écrite_Rédiger_paragr_argument': {
    sections: [
      {
        title: 'I. Structure du Paragraphe Argumentatif',
        content: `Phrase d'annonce de l'argument, développement avec explications et exemples, phrase de conclusion du paragraphe.`
      },
      {
        title: 'II. Types d\'Arguments',
        content: `Arguments d'autorité, arguments logiques, arguments d'exemple, arguments par analogie.`
      },
      {
        title: 'III. Connecteurs',
        content: `D'abord, ensuite, de plus, en outre, par contre, en revanche, par conséquent, donc.`
      },
      {
        title: 'IV. Exemples',
        content: `Choisir des exemples précis et variés, les intégrer naturellement, les commenter brièvement.`
      }
    ]
  },
  'EE 11_ Prdtion-écrite_Rédiger_intro_conclusion': {
    sections: [
      {
        title: 'I. Introduction',
        content: `Accroche sur le thème, présentation de la situation, formulation de la thèse ou problématique, annonce du plan.`
      },
      {
        title: 'II. Conclusion',
        content: `Rappel des arguments principaux, réponse à la question posée, ouverture vers une réflexion plus large.`
      },
      {
        title: 'III. Liens',
        content: `L'introduction doit annoncer le développement. La conclusion doit reprendre les éléments essentiels.`
      },
      {
        title: 'IV. Style',
        content: `Clarté, concision, précision, ton approprié au type de production.`
      }
    ]
  },
  'EE 12_ Résumé_Texte_Argu_Répondre_questions': {
    sections: [
      {
        title: 'I. Compréhension du Texte',
        content: `Lecture attentive, repérage de la thèse, identification des arguments, compréhension du vocabulaire.`
      },
      {
        title: 'II. Analyse des Questions',
        content: `Comprendre ce qui est demandé, repérer les mots clés, identifier le type de réponse attendue.`
      },
      {
        title: 'III. Réponses',
        content: `Répondre précisément à chaque question, s'appuyer sur le texte, citer si nécessaire, reformuler.`
      },
      {
        title: 'IV. Présentation',
        content: `Numéroter les réponses, utiliser un vocabulaire précis, respecter la consigne de longueur.`
      }
    ]
  },
  'EE 13_ Résumé_Texte_Argu_Identifier_Situat_argumentation': {
    sections: [
      {
        title: 'I. Types d\'Argumentation',
        content: `Argumentation directe (thèse explicite), indirecte (fiction, apologue), délibérative, démonstrative.`
      },
      {
        title: 'II. Indices d\'Argumentation',
        content: `Connecteurs logiques, marques d'opinion, exemples, chiffres, citations, structure du texte.`
      },
      {
        title: 'III. Situation d\'Énonciation',
        content: `Identifier l'auteur, le destinataire, le contexte, le but de l'argumentation.`
      },
      {
        title: 'IV. Stratégies Argumentatives',
        content: `Choix des exemples, ton adopté, registre de langue, organisation des arguments.`
      }
    ]
  },
  'EE 14_ Résumé_Texte_Argu_Sélection_ench_logique': {
    sections: [
      {
        title: 'I. Enchaînements Logiques',
        content: `Causalité (car, donc), opposition (mais, cependant), addition (et, de plus), concession (bien que).`
      },
      {
        title: 'II. Repérage',
        content: `Identifier les connecteurs, comprendre les relations entre les idées, repérer la progression.`
      },
      {
        title: 'III. Sélection',
        content: `Retenir les idées essentielles, éliminer les détails, respecter la logique du texte.`
      },
      {
        title: 'IV. Reconstruction',
        content: `Restituer l'enchaînement logique dans le résumé, utiliser des connecteurs appropriés.`
      }
    ]
  },
  'EE 15_ Résumé_Texte_Argu_Reformuler_IE': {
    sections: [
      {
        title: 'I. Identification des Idées Essentielles',
        content: `Repérer la thèse principale, les arguments clés, les exemples significatifs.`
      },
      {
        title: 'II. Reformulation',
        content: `Exprimer les idées dans ses propres mots, éviter les citations littérales, conserver le sens.`
      },
      {
        title: 'III. Synthèse',
        content: `Condenser l'information, éliminer les répétitions, regrouper les idées similaires.`
      },
      {
        title: 'IV. Vérification',
        content: `S'assurer que le résumé est fidèle au texte, qu'il est complet et qu'il respecte la consigne de longueur.`
      }
    ]
  },
  'EE 16_ Résumé_Texte_Argu_Rédiger_résumé': {
    sections: [
      {
        title: 'I. Méthode du Résumé',
        content: `Lecture globale, repérage des idées essentielles, rédaction en ses propres mots, respect de la longueur.`
      },
      {
        title: 'II. Structure',
        content: `Introduction (présentation du texte), développement (résumé des arguments), conclusion (thèse finale).`
      },
      {
        title: 'III. Qualités',
        content: `Fidélité au texte, objectivité, clarté, concision, style neutre et impersonnel.`
      },
      {
        title: 'IV. Écueils à Éviter',
        content: `Ne pas commenter, ne pas juger, ne pas ajouter d'informations, ne pas tronquer le sens.`
      }
    ]
  }
};

// ─── Résumés manuels PL (Poétique et Langue) ──────────────────
const plSummaries = {
  'PL 1_ Rythme_texte_poét_en_prose_1': {
    sections: [
      {
        title: 'I. Le Rythme en Poésie',
        content: `Alternance de syllabes accentuées et inaccentuées. Mètre (alexandrin, octosyllabe), rimes, strophes.`
      },
      {
        title: 'II. Le Rythme en Prose',
        content: `Cadence de la phrase, accents de sens, effets de répétition, ponctuation.`
      },
      {
        title: 'III. Procédés Rythmiques',
        content: `Allitérations, assonances, répétitions, parallélismes, enjambements, rejets.`
      },
      {
        title: 'IV. Effets',
        content: `Musicalité, expressivité, mise en valeur de certaines idées, création d'émotions.`
      }
    ]
  },
  'PL 2_ Rythme_texte_poét_en_prose_2': {
    sections: [
      {
        title: 'I. Rythme et Sens',
        content: `Le rythme renforce le sens. Accents sur les mots importants, rimes significatives.`
      },
      {
        title: 'II. Rythme et Émotion',
        content: `Rythme rapide pour l'excitation, lent pour la mélancolie. Variations pour créer des effets.`
      },
      {
        title: 'III. Rythme et Genre',
        content: `Poésie : mètres fixes, rimes. Prose : liberté mais recherche de cadence.`
      },
      {
        title: 'IV. Analyse',
        content: `Repérer les accents, les pauses, les répétitions. Interpréter les effets produits.`
      }
    ]
  },
  'PL 3_ Tonalités_litt_1': {
    sections: [
      {
        title: 'I. Tonalité Lyrique',
        content: `Expression des sentiments personnels, émotion, subjectivité. Registre de l'intimité.`
      },
      {
        title: 'II. Tonalité Épique',
        content: `Récit d'actions héroïques, grandeur, exploits. Registre de l'héroïsme.`
      },
      {
        title: 'III. Tonalité Tragique',
        content: `Destin fatal, fatalité, souffrance, mort. Registre de la fatalité.`
      },
      {
        title: 'IV. Tonalité Comique',
        content: `Rire, caricature, absurdité, satire. Registre de l'humour.`
      }
    ]
  },
  'PL 4_ Tonalités_litt_2': {
    sections: [
      {
        title: 'I. Tonalité Satirique',
        content: `Critique sociale, ironie, dénonciation. Registre de la critique.`
      },
      {
        title: 'II. Tonalité Didactique',
        content: `Enseignement, moralité, instruction. Registre de l'éducation.`
      },
      {
        title: 'III. Tonalité Pathétique',
        content: `Émotion, compassion, souffrance. Registre de l'émotion.`
      },
      {
        title: 'IV. Identification',
        content: `Repérer les indices lexicaux, grammaticaux, thématiques. Analyser les effets produits.`
      }
    ]
  },
  'PL 5_ Focalisation': {
    sections: [
      {
        title: 'I. Focalisation Interne',
        content: `Point de vue d'un personnage. Le lecteur voit ce que le personnage voit et ressent.`
      },
      {
        title: 'II. Focalisation Externe',
        content: `Point de vue d'un observateur extérieur. Le narrateur ne connaît pas les pensées des personnages.`
      },
      {
        title: 'III. Focalisation Zéro',
        content: `Point de vue omniscient. Le narrateur sait tout des personnages et de l'histoire.`
      },
      {
        title: 'IV. Effets',
        content: `Mise en scène, suspense, identification, distance critique, informations complètes.`
      }
    ]
  },
  'PL 6_ Diff_modes_raisonnement': {
    sections: [
      {
        title: 'I. Déduction',
        content: `Du général au particulier. Prémisse vraie → conclusion nécessaire. Syllogisme.`
      },
      {
        title: 'II. Induction',
        content: `Du particulier au général. Observations → généralisation. Probable mais pas certain.`
      },
      {
        title: 'III. Analogie',
        content: `Comparaison de deux situations similaires pour en tirer une conclusion.`
      },
      {
        title: 'IV. Causalité',
        content: `Relation cause-effet. Identification des causes et des conséquences d'un phénomène.`
      }
    ]
  },
  'PL 7_ Implicite': {
    sections: [
      {
        title: 'I. Définition',
        content: `Ce qui est dit sans être dit explicitement. Sens sous-entendu, non-dit.`
      },
      {
        title: 'II. Types d\'Implicite',
        content: `Sous-entendu (ironie), présupposé (information admise), connotation (sens associé).`
      },
      {
        title: 'III. Indices',
        content: `Contexte, ton, choix des mots, situation d'énonciation, culture partagée.`
      },
      {
        title: 'IV. Interprétation',
        content: `Repérer les implicites, les analyser, comprendre leur rôle dans le texte.`
      }
    ]
  },
  'PL 8_ Valeurs_temps_1': {
    sections: [
      {
        title: 'I. Temps du Passé',
        content: `Passé simple (action achevée), imparfait (description, habitude), plus-que-parfait (antériorité).`
      },
      {
        title: 'II. Temps du Présent',
        content: `Présent de narration (actualisation), présent de vérité générale, présent d'habitude.`
      },
      {
        title: 'III. Temps du Futur',
        content: `Futur simple (action à venir), futur antérieur (antériorité future).`
      },
      {
        title: 'IV. Valeurs Modales',
        content: `Conditionnel (hypothèse), subjonctif (doute, volonté), impératif (ordre).`
      }
    ]
  },
  'PL 9_ Valeurs_temps_2': {
    sections: [
      {
        title: 'I. Discours Rapporté',
        content: `Discours direct (citation), discours indirect (subordonnées), discours indirect libre (mélange).`
      },
      {
        title: 'II. Changements de Temps',
        content: `Passé simple → imparfait, présent → imparfait, futur → conditionnel.`
      },
      {
        title: 'III. Valeurs Expressives',
        content: `Temps pour créer des effets : suspense, urgence, émotion, distance.`
      },
      {
        title: 'IV. Analyse',
        content: `Repérer les temps, comprendre leurs valeurs, interpréter les choix de l'auteur.`
      }
    ]
  },
  'PL_LEÇON_N_3 _ L_ENONCIATION': {
    sections: [
      {
        title: 'I. Situation d\'Énonciation',
        content: `Qui parle ? À qui ? Quand ? Où ? Dans quel but ? Indices dans le texte.`
      },
      {
        title: 'II. Énonciateur et Destinataire',
        content: `Identification du locuteur et de l'interlocuteur. Relation entre les deux.`
      },
      {
        title: 'III. Indices d\'Énonciation',
        content: `Pronoms personnels, temps verbaux, marques de subjectivité, déictiques.`
      },
      {
        title: 'IV. Types d\'Énoncés',
        content: `Énoncé ancré (présent, je, ici), énoncé coupé (passé, il, là-bas).`
      }
    ]
  },
  'PL__LEÇON_N_5 _ LES_OUTILS_DE_L_ARGUMENTATION': {
    sections: [
      {
        title: 'I. Connecteurs Logiques',
        content: `Addition (et, de plus), opposition (mais, cependant), cause (car, parce que), conséquence (donc, par conséquent).`
      },
      {
        title: 'II. Types d\'Arguments',
        content: `D'autorité, d'exemple, par analogie, ad hominem, de fait, de valeur.`
      },
      {
        title: 'III. Figures de Style Argumentatives',
        content: `Ironie, hyperbole, antithèse, question rhétorique, accumulation.`
      },
      {
        title: 'IV. Organisation',
        content: `Thèse-antithèse-synthèse, problème-solution, cause-conséquence.`
      }
    ]
  },
  'Savoir-faire_ Initation_Oral_Bac': {
    sections: [
      {
        title: 'I. Préparation de l\'Oral',
        content: `Choix du texte, analyse approfondie, préparation des axes de lecture, anticipation des questions.`
      },
      {
        title: 'II. Présentation',
        content: `Introduction (auteur, œuvre, contexte), lecture expressive, explication linéaire ou thématique.`
      },
      {
        title: 'III. Entretien',
        content: `Répondre aux questions du jury, justifier ses interprétations, faire preuve de culture littéraire.`
      },
      {
        title: 'IV. Qualités',
        content: `Clarté, précision, aisance, vocabulaire riche, posture, voix, regard.`
      }
    ]
  }
};

// ─── Génération du HTML ───────────────────────────────────────
function generateHTML(title, summary, subject) {
  const cleanTitle = title.replace(/^[^_]+_/, '').replace(/_/g, ' ');
  
  let html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${cleanTitle} - Première D</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    body {
      font-family: 'Inter', sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #f8fafc;
      color: #1e293b;
      line-height: 1.7;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .header h1 {
      font-size: 1.8rem;
      color: #16a34a;
      margin-bottom: 15px;
    }
    .meta-chips {
      display: flex;
      justify-content: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .chip {
      background: #dcfce7;
      color: #166534;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 500;
    }
    h2 {
      color: #16a34a;
      font-size: 1.4rem;
      margin-top: 35px;
      margin-bottom: 20px;
      border-bottom: 2px solid #dcfce7;
      padding-bottom: 10px;
    }
    h3 {
      color: #1e293b;
      font-size: 1.15rem;
      margin-top: 25px;
      margin-bottom: 15px;
    }
    .definition {
      background: #dcfce7;
      border-left: 4px solid #16a34a;
      padding: 15px 20px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    .definition strong {
      color: #166534;
    }
    .important {
      background: #dbeafe;
      border-left: 4px solid #3b82f6;
      padding: 15px 20px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    .important strong {
      color: #1e40af;
    }
    .schema {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px 20px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    .schema strong {
      color: #92400e;
    }
    ul, ol {
      margin: 15px 0;
      padding-left: 25px;
    }
    li {
      margin: 8px 0;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📝 FICHE DE RÉSUMÉ</h1>
    <div class="meta-chips">
      <span class="chip">Première D</span>
      <span class="chip">${subject}</span>
      <span class="chip">${cleanTitle}</span>
    </div>
  </div>
`;

  let sectionNum = 1;
  for (const section of summary.sections) {
    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    const roman = romanNumerals[sectionNum - 1] || sectionNum;
    
    html += `  <h2>${roman}. ${section.title}</h2>

  <div class="definition">
    ${section.content}
  </div>

`;
    sectionNum++;
  }

  html += `</body>
</html>`;

  return html;
}

// ─── Main ───────────────────────────────────────────────────
async function main() {
  console.log('📝 Mise à jour des fiches Français avec vrais résumés...\n');
  
  let updated = 0;

  // EE
  console.log('📚 Expression Écrite (EE)');
  for (const [title, summary] of Object.entries(eeSummaries)) {
    const cleanTitle = title.replace(/[^a-zA-Z0-9À-ÿ\s]/g, '_').replace(/\s+/g, '_');
    const fileName = `Fiche_${cleanTitle}.html`;
    const filePath = path.join(FICHES_DIR, fileName);
    
    const html = generateHTML(title, summary, 'Français');
    fs.writeFileSync(filePath, html, 'utf8');
    
    console.log(`  ✓ ${fileName}`);
    updated++;
  }

  // PL
  console.log('\n📚 Poétique et Langue (PL)');
  for (const [title, summary] of Object.entries(plSummaries)) {
    const cleanTitle = title.replace(/[^a-zA-Z0-9À-ÿ\s]/g, '_').replace(/\s+/g, '_');
    const fileName = `Fiche_${cleanTitle}.html`;
    const filePath = path.join(FICHES_DIR, fileName);
    
    const html = generateHTML(title, summary, 'Français');
    fs.writeFileSync(filePath, html, 'utf8');
    
    console.log(`  ✓ ${fileName}`);
    updated++;
  }

  console.log(`\n✅ Fiches mises à jour: ${updated}`);
}

main().catch(e => console.error('Fatal:', e));
