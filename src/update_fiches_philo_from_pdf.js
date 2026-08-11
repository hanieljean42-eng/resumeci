/**
 * ═══════════════════════════════════════════════════════════
 * 📝 Mise à jour des Fiches Philosophie avec Vrais Résumés
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const FICHES_DIR = path.join(__dirname, '..', 'Fiches_Resume', 'Premiere_D', 'Philosophie');

// ─── Résumés manuels Philosophie ─────────────────────────────
const philoSummaries = {
  'Leçon_1_La_méthode_de_lecture_de_texte': {
    sections: [
      {
        title: 'I. Approche du Texte',
        content: `Lecture globale pour comprendre le sens général. Repérer la thèse, les arguments, la structure.`
      },
      {
        title: 'II. Lecture Analytique',
        content: `Repérer les concepts clés, les connecteurs logiques, les exemples. Analyser le raisonnement.`
      },
      {
        title: 'III. Compréhension',
        content: `Reformuler les idées principales, identifier le problème philosophique, situer le contexte.`
      },
      {
        title: 'IV. Méthodologie',
        content: `Prendre des notes, surligner, annoter. Relire plusieurs fois pour approfondir la compréhension.`
      }
    ]
  },
  'Leçon_2__L_introduction_du_commentaire_de_texte_philosophique': {
    sections: [
      {
        title: 'I. Structure de l\'Introduction',
        content: `4 étapes : Accroche, Présentation du texte, Problématique, Annonce du plan.`
      },
      {
        title: 'II. Accroche',
        content: `Phrase d'ouverture liée au thème du texte. Éveil de l'intérêt du lecteur.`
      },
      {
        title: 'III. Présentation du Texte',
        content: `Auteur, œuvre, date, contexte. Citation du texte avec référence précise.`
      },
      {
        title: 'IV. Problématique et Plan',
        content: `Formulation du problème philosophique soulevé. Annonce des axes de développement.`
      }
    ]
  },
  'Leçon_3_La_conclusion_du_commentaire_de_texte_philosophique': {
    sections: [
      {
        title: 'I. Structure de la Conclusion',
        content: `Synthèse des analyses, réponse à la problématique, ouverture vers d'autres questions.`
      },
      {
        title: 'II. Synthèse',
        content: `Rappel des étapes du raisonnement sans répéter. Mise en évidence de la cohérence du texte.`
      },
      {
        title: 'III. Réponse au Problème',
        content: `Réponse claire à la problématique formulée en introduction. Bilan de la réflexion.`
      },
      {
        title: 'IV. Ouverture',
        content: `Élargissement vers d'autres questions philosophiques ou actualité du problème.`
      }
    ]
  },
  'Leçon_4_L_essai_de_problématisation': {
    sections: [
      {
        title: 'I. Qu\'est-ce qu\'une Problématique?',
        content: `Question philosophique qui ne se résout pas par une simple réponse. Met en tension des conceptions opposées.`
      },
      {
        title: 'II. Construction du Problème',
        content: `Identifier les concepts, repérer les contradictions, formuler la question centrale.`
      },
      {
        title: 'III. Types de Problématiques',
        content: `Problèmes de définition, de valeur, de fait, de droit. Problèmes métaphysiques, éthiques, politiques.`
      },
      {
        title: 'IV. Méthode',
        content: `Partir du sens commun, mettre en évidence les paradoxes, chercher les présupposés.`
      }
    ]
  },
  'Leçon_5_L_introduction_de_la_dissertation_philosophique': {
    sections: [
      {
        title: 'I. Structure',
        content: `Accroche, définition des termes, problématique, annonce du plan en 3 parties.`
      },
      {
        title: 'II. Accroche',
        content: `Exemple, citation, fait d'actualité lié au sujet. Éveil de la réflexion.`
      },
      {
        title: 'III. Définition et Analyse',
        content: `Définition des termes du sujet, analyse des concepts, repérage des enjeux.`
      },
      {
        title: 'IV. Problématique et Plan',
        content: `Formulation du problème philosophique. Annonce des 3 parties du développement.`
      }
    ]
  },
  'Leçon_6_Présentation_de_l_histoire_de_la_philosophie': {
    sections: [
      {
        title: 'I. Naissance de la Philosophie',
        content: `VIe siècle av. J.-C. en Grèce. Passage du mythe au logos. Thalès, les Présocratiques.`
      },
      {
        title: 'II. Périodes Clés',
        content: `Antiquité (Platon, Aristote), Moyen Âge (saint Thomas), Moderne (Descartes, Kant), Contemporaine.`
      },
      {
        title: 'III. Grands Courants',
        content: `Idéalisme, matérialisme, rationalisme, empirisme, existentialisme, phénoménologie.`
      },
      {
        title: 'IV. Questions Fondamentales',
        content: `Être, connaissance, morale, politique, art, religion. Questions éternelles de la philosophie.`
      }
    ]
  },
  'Leçon_7_Le_moyen_âge_et_la_renaissance': {
    sections: [
      {
        title: 'I. Philosophie Médiévale',
        content: `Synthèse christianisme et philosophie antique. Saint Augustin, saint Thomas d'Aquin. Foi et raison.`
      },
      {
        title: 'II. Pensée Arabe',
        content: `Averroès, Avicenne. Transmission et commentaire d'Aristote. Influence sur l'Occident.`
      },
      {
        title: 'III. Renaissance',
        content: `XVe-XVIe siècle. Humanisme, retour à l'Antiquité. Érasme, Montaigne, Machiavel.`
      },
      {
        title: 'IV. Nouvelles Idées',
        content: `Dignité de l'homme, critique de l'autorité, science moderne, réforme religieuse.`
      }
    ]
  },
  'Leçon_8_La_période_moderne': {
    sections: [
      {
        title: 'I. XVIIe Siècle',
        content: `Rationalisme : Descartes ("cogito ergo sum"), Spinoza, Leibniz. Raison comme fondement de la connaissance.`
      },
      {
        title: 'II. XVIIIe Siècle (Lumières)',
        content: `Empirisme : Locke, Hume. Critique de la religion, progrès, liberté. Voltaire, Rousseau, Kant.`
      },
      {
        title: 'III. Idées Clés',
        content: `Sujet, conscience, liberté, progrès, tolérance, droits de l'homme. Critique de l'absolutisme.`
      },
      {
        title: 'IV. Influence',
        content: `Révolutions (française, américaine), démocratie, science moderne, laïcité.`
      }
    ]
  },
  'Leçon_9_La_période_comtemporaine': {
    sections: [
      {
        title: 'I. XIXe Siècle',
        content: `Idéalisme allemand (Hegel, Marx). Existentialisme (Kierkegaard, Nietzsche). Pragmatisme.`
      },
      {
        title: 'II. XXe Siècle',
        content: `Phénoménologie (Husserl, Heidegger). Existentialisme (Sartre, Camus). Structuralisme (Foucault).`
      },
      {
        title: 'III. Questions Contemporaines',
        content: `Technique, environnement, éthique, multiculturalisme, postmodernisme.`
      },
      {
        title: 'IV. Philosophie Africaine',
        content: `Négritude (Senghor, Césaire), ethnophilosophie, pensée critique africaine contemporaine.`
      }
    ]
  }
};

// ─── Génération du HTML ───────────────────────────────────────
function generateHTML(title, summary) {
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
      <span class="chip">Philosophie</span>
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
  console.log('📝 Mise à jour des fiches Philosophie avec vrais résumés...\n');
  
  let updated = 0;

  for (const [title, summary] of Object.entries(philoSummaries)) {
    const cleanTitle = title.replace(/[^a-zA-Z0-9À-ÿ\s]/g, '_').replace(/\s+/g, '_');
    const fileName = `Fiche_${cleanTitle}.html`;
    const filePath = path.join(FICHES_DIR, fileName);
    
    const html = generateHTML(title, summary);
    fs.writeFileSync(filePath, html, 'utf8');
    
    console.log(`  ✓ ${fileName}`);
    updated++;
  }

  console.log(`\n✅ Fiches mises à jour: ${updated}`);
}

main().catch(e => console.error('Fatal:', e));
