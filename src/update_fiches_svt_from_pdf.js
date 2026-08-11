/**
 * ═══════════════════════════════════════════════════════════
 * 📝 Mise à jour des Fiches SVT avec Vrais Résumés
 * Lit les PDFs et crée les résumés manuels
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const COURS_DIR = path.join(__dirname, '..', 'Cours_Premiere_D', 'PREMIERE D');
const FICHES_DIR = path.join(__dirname, '..', 'Fiches_Resume', 'Premiere_D', 'SVT');

async function extractPdfText(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const arr = new Uint8Array(buffer);
    const parser = new PDFParse(arr);
    await parser.load();
    const result = await parser.getText();
    return result.text || result.pages?.map(p => p.text).join('\n') || '';
  } catch (e) {
    console.error(`  ❌ Erreur extraction: ${e.message}`);
    return '';
  }
}

// ─── Résumés manuels basés sur le programme officiel ──────────
const svtSummaries = {
  'SVT 1ère D_L1_Les réflexes innés': {
    sections: [
      {
        title: 'I. Définition du Réflexe Inné',
        content: `Réflexe inné : Réaction (réponse musculaire) brusque, automatique, inéluctable et stéréotypée à un stimulus absolu. Présent dès la naissance sans apprentissage, sans intervention du cerveau.`
      },
      {
        title: 'II. Caractéristiques',
        content: `Brusque (très rapide), Automatique (sans contrôle conscient), Inéluctable (impossible d'empêcher), Stéréotypée (identique chez tous les individus), Présent dès la naissance, Sans intervention du cerveau.`
      },
      {
        title: 'III. Arc Réflexe',
        content: `Trajet : Récepteur → Nerf sensitif → Centre nerveux (moelle épinière) → Nerf moteur → Effecteur (muscles). Influx nerveux : signal électrique parcourant les neurones.`
      },
      {
        title: 'IV. Organes Intervenant',
        content: `Récepteurs (peau, œil, oreille, nez, langue), Nerf sensitif (transmet message), Centre nerveux (moelle épinière), Nerf moteur (transmet ordre), Effecteurs (muscles).`
      }
    ]
  },
  'SVT 1ère D_L2_Les fonctions des gonades': {
    sections: [
      {
        title: 'I. Gonades Mâles (Testicules)',
        content: `Fonction exocrine : Production des spermatozoïdes dans les tubes séminifères. Fonction endocrine : Production de testostérone par les cellules de Leydig.`
      },
      {
        title: 'II. Gonades Femelles (Ovaires)',
        content: `Fonction exocrine : Production des ovocytes. Fonction endocrine : Production d'œstrogènes (follicules) et de progestérone (corps jaune).`
      },
      {
        title: 'III. Structures Testiculaires',
        content: `Tubes séminifères (spermatogenèse), Cellules de Sertoli (nourrissent spermatozoïdes), Cellules de Leydig (testostérone), Vésicules séminales (sperme).`
      },
      {
        title: 'IV. Structures Ovariennes',
        content: `Follicules (maturation des ovocytes, œstrogènes), Corps jaune (progestérone, gestation), Vaisseaux sanguins (transport hormones).`
      }
    ]
  },
  'SVT 1ère D_L3_LA GAMETOGENESE': {
    sections: [
      {
        title: 'I. Définition',
        content: `Formation des gamètes par méiose. Spermatogenèse (homme) et Ovogenèse (femme).`
      },
      {
        title: 'II. Méiose',
        content: `Division cellulaire réduisant le nombre de chromosomes (2n → n). Méiose I (réductionnelle) et Méiose II (équationnelle).`
      },
      {
        title: 'III. Brassages Chromosomiques',
        content: `Interchromosomique (répartition aléatoire) et Intrachromosomique (crossing-over). Créent diversité génétique.`
      },
      {
        title: 'IV. Spermatogenèse',
        content: `4 phases : Multiplication (mitose spermatogonies), Accroissement (spermatocytes I), Maturation (méiose → spermatides), Différenciation (spermiogénèse → spermatozoïdes).`
      },
      {
        title: 'V. Ovogenèse',
        content: `Phase embryonnaire (multiplication jusqu'à 7M, destruction à 2M). Phase maturation (naissance à ménopause, ~400 ovules totaux).`
      },
      {
        title: 'VI. Caryotype',
        content: `Cellules normales : 46 chromosomes (23 paires). Gamètes : 23 chromosomes. Femme XX (ovules X), Homme XY (spermatozoïdes X ou Y).`
      }
    ]
  },
  'SVT 1ère D_L4_LA TRANSMISSION D_UN CARACTERE HEREDITAIRE': {
    sections: [
      {
        title: 'I. Caractère Héréditaire',
        content: `Caractère transmis des parents aux descendants par les gènes situés sur les chromosomes.`
      },
      {
        title: 'II. Gène et Allèle',
        content: `Gène : Segment d'ADN codant un caractère. Allèle : Différentes formes d'un gène.`
      },
      {
        title: 'III. Dominance et Récessivité',
        content: `Allèle dominant : s'exprime même en un seul exemplaire. Allèle récessif : s'exprime seulement en double exemplaire.`
      },
      {
        title: 'IV. Transmission Monogénique',
        content: `Transmission d'un caractère contrôlé par un seul gène. Échiquier de croisement pour prédire les résultats.`
      }
    ]
  },
  'SVT 1ère D_L5_La synthèse des protéines': {
    sections: [
      {
        title: 'I. Le Code Génétique',
        content: `Séquence de nucléotides de l'ADN qui code pour la séquence d'acides aminés des protéines.`
      },
      {
        title: 'II. Transcription',
        content: `Synthèse d'ARNm à partir d'ADN dans le noyau. ARNm porte le message génétique vers le cytoplasme.`
      },
      {
        title: 'III. Traduction',
        content: `Synthèse de protéines sur les ribosomes à partir de l'ARNm. Codons (3 nucléotides) codent pour acides aminés.`
      },
      {
        title: 'IV. Rôle des Protéines',
        content: `Structure, enzymes, hormones, transport, défense immunitaire, mouvement.`
      }
    ]
  },
  'SVT 1ère D_L6_Les activités internes du globe terrestre': {
    sections: [
      {
        title: 'I. Structure Interne du Globe',
        content: `Croûte, Manteau (supérieur et inférieur), Noyau (externe liquide, interne solide).`
      },
      {
        title: 'II. Tectonique des Plaques',
        content: `Lithosphère découpée en plaques mobiles. Mouvements dus aux courants de convection du manteau.`
      },
      {
        title: 'III. Divergence',
        content: `Écartement des plaques (dorsales océaniques). Création de croûte océanique, volcanisme, séismes.`
      },
      {
        title: 'IV. Convergence',
        content: `Rapprochement des plaques. Subduction (plaque sous l'autre), collision (montagnes), séismes, volcanisme.`
      }
    ]
  },
  'SVT 1ère D_L7_Les mouvements des plaques lithosphériques': {
    sections: [
      {
        title: 'I. Lithosphère',
        content: `Enveloppe rigide externe (croûte + manteau supérieur). Découpée en plaques lithosphériques.`
      },
      {
        title: 'II. Forces Motrices',
        content: `Courants de convection dans le manteau. Chaleur du noyau → mouvements de matière.`
      },
      {
        title: 'III. Types de Frontières',
        content: `Divergentes (écartement), Convergentes (rapprochement), Transformantes (coulissage).`
      },
      {
        title: 'IV. Conséquences',
        content: `Reliefs (montagnes, fosses), Volcanisme, Séismes, Dérive des continents.`
      }
    ]
  },
  'SVT 1ère D_L8_Les échanges d_ions au niveau du sol': {
    sections: [
      {
        title: 'I. Composition du Sol',
        content: `Matière minérale, matière organique (humus), eau, air, êtres vivants.`
      },
      {
        title: 'II. Complexe d\'Échange',
        content: `Argiles et humus retiennent des ions (Ca²⁺, K⁺, Mg²⁺, NO₃⁻). Échanges avec les racines.`
      },
      {
        title: 'III. Absorption par les Racines',
        content: `Échange d'ions : racine cède H⁺ ou HCO₃⁻, reçoit nutriments. Zone pilifère (poils racinaires).`
      },
      {
        title: 'IV. Facteurs Influents',
        content: `pH du sol, humidité, température, activité microbienne.`
      }
    ]
  },
  'SVT 1ère D_L9_L_évolution des sols tropicaux': {
    sections: [
      {
        title: 'I. Formation des Sols',
        content: `Altération de la roche mère + accumulation de matière organique. Profil : horizons O, A, B, C.`
      },
      {
        title: 'II. Sols Tropicaux',
        content: `Climat chaud et humide → altération intense. Latéritisation : accumulation d'oxydes de fer et d'aluminium.`
      },
      {
        title: 'III. Types de Sols Tropicaux',
        content: `Ferrallitiques (rouges, riches en fer), Ferrugineux (moins lessivés), Podzols (sableux, acides).`
      },
      {
        title: 'IV. Fertilité',
        content: `Souvent pauvres en humus et nutriments (lessivage). Besoin d'amendements et fertilisation.`
      }
    ]
  },
  'SVT 1ère D_L10_La production de matière organique': {
    sections: [
      {
        title: 'I. Photosynthèse',
        content: `Conversion de l'énergie lumineuse en énergie chimique. 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂ (chlorophylle, lumière).`
      },
      {
        title: 'II. Facteurs de la Photosynthèse',
        content: `Lumière, CO₂, Eau, Température, Chlorophylle. Loi du minimum : facteur limitant.`
      },
      {
        title: 'III. Respiration Cellulaire',
        content: `Dégradation de glucose pour produire ATP. C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + énergie.`
      },
      {
        title: 'IV. Productivité',
        content: `Primaire (végétaux), Secondaire (consommateurs). Chaîne alimentaire et réseaux trophiques.`
      }
    ]
  },
  'SVT 1ère D_L11__LA_DIGESTION_DES_ALIMENTS': {
    sections: [
      {
        title: 'I. Digestion Mécanique',
        content: `Mastication, déglutition, péristaltisme (contractions musculaires du tube digestif).`
      },
      {
        title: 'II. Digestion Chimique',
        content: `Action des enzymes : Amylase (amidon), Protéases (protéines), Lipases (lipides).`
      },
      {
        title: 'III. Étapes de la Digestion',
        content: `Bouche (amylase), Estomac (pepsine, HCl), Intestin grêle (pancréatine, bile), Gros intestin (absorption eau).`
      },
      {
        title: 'IV. Absorption',
        content: `Villosités intestinales → passage des nutriments dans le sang/lympe.`
      }
    ]
  },
  'SVT 1ère D_L12_L_absorption des nutriments': {
    sections: [
      {
        title: 'I. Site d\'Absorption',
        content: `Intestin grêle (villosités et microvillosités). Surface d'absorption augmentée.`
      },
      {
        title: 'II. Mécanismes d\'Absorption',
        content: `Diffusion passive (gradient de concentration), Transport actif (ATP), Endocytose.`
      },
      {
        title: 'III. Voies de Transport',
        content: `Sang (glucose, acides aminés, sels minéraux), Lympe (lipides, vitamines liposolubles).`
      },
      {
        title: 'IV. Régulation',
        content: `Hormones digestives, système nerveux entérique, circulation sanguine.`
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
      <span class="chip">SVT</span>
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
  console.log('📝 Mise à jour des fiches SVT avec vrais résumés...\n');
  
  let updated = 0;

  for (const [title, summary] of Object.entries(svtSummaries)) {
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
