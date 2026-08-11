/**
 * ═══════════════════════════════════════════════════════════
 * 📝 Mise à jour des Fiches Histoire-Geographie avec Vrais Résumés
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const FICHES_DIR = path.join(__dirname, '..', 'Fiches_Resume', 'Premiere_D', 'Histoire-Geographie');

// ─── Résumés manuels Géographie ──────────────────────────────
const geoSummaries = {
  '1ère G1_Dynamisme_démographique_et_qualité_de_la_vie_en_Côte_d_Ivoire': {
    sections: [
      {
        title: 'I. Dynamisme Démographique',
        content: `Croissance naturelle élevée (natalité > mortalité). Solde migratoire positif (immigration). Population jeune (structure pyramidale).`
      },
      {
        title: 'II. Facteurs de Croissance',
        content: `Fécondité élevée, amélioration de la santé, urbanisation, immigration des pays voisins.`
      },
      {
        title: 'III. Qualité de la Vie',
        content: `Indicateurs : IDH, accès aux soins, éducation, eau potable, électricité. Disparités urbaines/rurales.`
      },
      {
        title: 'IV. Défis',
        content: `Gestion de la croissance, emploi, infrastructures, environnement, inégalités sociales.`
      }
    ]
  },
  '1ère G2__La_croissance_démographique_mondiale_et_ses_problèmes': {
    sections: [
      {
        title: 'I. Croissance Mondiale',
        content: `8 milliards d'habitants en 2023. Transition démographique : baisse mortalité puis natalité.`
      },
      {
        title: 'II. Répartition Inégale',
        content: `Asie (60% population), Afrique (croissance rapide), Europe (vieillissement).`
      },
      {
        title: 'III. Problèmes',
        content: `Surpopulation, ressources alimentaires, environnement, urbanisation, inégalités de développement.`
      },
      {
        title: 'IV. Solutions',
        content: `Planification familiale, développement durable, coopération internationale, politiques migratoires.`
      }
    ]
  },
  '1ère G3_L_urbanisation_dans_les_pays_en_développement_exemple_de_la_Côte_d_Ivoire': {
    sections: [
      {
        title: 'I. Urbanisation Rapide',
        content: `Exode rural, croissance des villes. Abidjan : métropole économique et politique.`
      },
      {
        title: 'II. Causes',
        content: `Recherche d'emploi, services, éducation. Faiblesse des infrastructures rurales.`
      },
      {
        title: 'III. Conséquences',
        content: `Bidonvilles, insalubrité, pollution, congestion, mais aussi dynamisme économique.`
      },
      {
        title: 'IV. Aménagement',
        content: `Planification urbaine, logements sociaux, transports, services de base.`
      }
    ]
  },
  '1ère G4__L_urbanisation_dans_les_pays_developpés_exemple_de_la_France': {
    sections: [
      {
        title: 'I. Urbanisation Ancienne',
        content: `80% de population urbaine. Villes historiques, métropolisation. Paris : ville mondiale.`
      },
      {
        title: 'II. Caractéristiques',
        content: `Périurbanisation, étalement urbain, villes moyennes en croissance.`
      },
      {
        title: 'III. Défis',
        content: `Logement, transports, pollution, ségrégation sociale, vieillissement.`
      },
      {
        title: 'IV. Politiques',
        content: `Rénovation urbaine, transports en commun, écologie, mixité sociale.`
      }
    ]
  },
  '1ère G5_L_organisation_administrative_de_la_Côte_d_Ivoire': {
    sections: [
      {
        title: 'I. Organisation Territoriale',
        content: `14 districts, 31 régions, 108 départements, 510 sous-préfectures. Décentralisation.`
      },
      {
        title: 'II. Collectivités Territoriales',
        content: `Régions, départements, communes. Élections locales, autonomie de gestion.`
      },
      {
        title: 'III. Administration',
        content: `Préfets, gouverneurs, maires. Services déconcentrés de l'État.`
      },
      {
        title: 'IV. Objectifs',
        content: `Rapprocher administration des citoyens, développement local, bonne gouvernance.`
      }
    ]
  },
  '1ère G6_L_Aménagement_du_territoire_Ivoirien': {
    sections: [
      {
        title: 'I. Disparités Spatiales',
        content: `Nord/Sud, littéral/intérieur. Inégalités de développement et d'équipements.`
      },
      {
        title: 'II. Axes de Développement',
        content: `Corridor Abidjan-Bouaké, zones industrielles, ports, aéroports.`
      },
      {
        title: 'III. Infrastructures',
        content: `Réseau routier, ports (Abidjan, San Pedro), énergie, télécommunications.`
      },
      {
        title: 'IV. Politiques',
        content: `Schéma national d'aménagement, décentralisation, pôles de croissance, développement rural.`
      }
    ]
  },
  '1ère G7__Les_facteurs_de_la_mondialisation': {
    sections: [
      {
        title: 'I. Définition',
        content: `Interdépendance croissante des pays. Flux de marchandises, capitaux, informations, personnes.`
      },
      {
        title: 'II. Facteurs Économiques',
        content: `Libre-échange, FTN, investissements directs, délocalisations.`
      },
      {
        title: 'III. Facteurs Technologiques',
        content: `Internet, transport, communication. Réduction des coûts et distances.`
      },
      {
        title: 'IV. Facteurs Politiques',
        content: `Organisations internationales (OMC, FMI), accords commerciaux, politiques libérales.`
      }
    ]
  },
  '1ère G8_Les_conséquences_de_la_mondialisation': {
    sections: [
      {
        title: 'I. Impacts Positifs',
        content: `Croissance économique, transferts de technologie, accès aux marchés, baisse des prix.`
      },
      {
        title: 'II. Impacts Négatifs',
        content: `Inégalités, précarité, dégradation environnementale, perte de souveraineté.`
      },
      {
        title: 'III. Inégalités',
        content: `Nord/Sud, pays émergents/PMA, élites/populations.`
      },
      {
        title: 'IV. Réponses',
        content: `Altermondialisme, commerce équitable, régulation, développement durable.`
      }
    ]
  }
};

// ─── Résumés manuels Histoire ────────────────────────────────
const histSummaries = {
  '1ère H1___L_essor_du_capitalisme_et_ses_cons__quences': {
    sections: [
      {
        title: 'I. Essor du Capitalisme',
        content: `XIXe siècle : révolution industrielle, accumulation du capital, libéralisme économique.`
      },
      {
        title: 'II. Caractéristiques',
        content: `Propriété privée, profit, concurrence, marché libre, salariat.`
      },
      {
        title: 'III. Conséquences',
        content: `Croissance économique, urbanisation, classe ouvrière, inégalités sociales, impérialisme.`
      },
      {
        title: 'IV. Critiques',
        content: `Socialisme, marxisme, mouvements ouvriers, revendications sociales.`
      }
    ]
  },
  '1ère H2___Les_révolutions_industrielles': {
    sections: [
      {
        title: 'I. Première Révolution (XVIIIe-XIXe)',
        content: `Angleterre : machine à vapeur, textile, métallurgie, charbon, chemins de fer.`
      },
      {
        title: 'II. Deuxième Révolution (fin XIXe)',
        content: `Électricité, pétrole, chimie, automobile, industries nouvelles.`
      },
      {
        title: 'III. Conséquences',
        content: `Production de masse, consommation, urbanisation, nouvelles classes sociales, mondialisation.`
      },
      {
        title: 'IV. Diffusion',
        content: `Europe, États-Unis, Japon. Inégalités de développement.`
      }
    ]
  },
  '1ère H3___le_mouvement_impérialiste_et_le_congrès_de_Berlin': {
    sections: [
      {
        title: 'I. Impérialisme',
        content: `Expansion coloniale européenne fin XIXe. Motifs économiques, politiques, stratégiques, culturels.`
      },
      {
        title: 'II. Congrès de Berlin (1884-1885)',
        content: `Partage de l'Afrique entre puissances européennes. Règles de colonisation.`
      },
      {
        title: 'III. Partage de l\'Afrique',
        content: `France (Afrique de l'Ouest), Royaume-Uni (Afrique de l'Est/Sud), Allemagne, Portugal, Belgique, Italie.`
      },
      {
        title: 'IV. Conséquences',
        content: `Exploitation, frontières artificielles, destruction des sociétés africaines, résistances.`
      }
    ]
  },
  '1ère H4_Les_résistances_aux_conquêtes_territoriales_en_Afrique_Exple_de_la_Côte_d_Ivoire': {
    sections: [
      {
        title: 'I. Conquête Française',
        content: `Explorateurs, traités, missions militaires. Résistance des royaumes locaux.`
      },
      {
        title: 'II. Résistances en Côte d\'Ivoire',
        content: `Samori Touré (empire Wassoulou), royaume de Kong, résistances locales.`
      },
      {
        title: 'III. Tactiques de Résistance',
        content: `Guerilla, alliances, repli stratégique, mobilisation des populations.`
      },
      {
        title: 'IV. Échec et Colonisation',
        content: `Supériorité militaire européenne, division des Africains, colonisation effective (1893).`
      }
    ]
  },
  '1ère H5___La_colonisation_et_les_résistances_en_Côte_d_Ivoire': {
    sections: [
      {
        title: 'I. Système Colonial',
        content: `Administration directe/indirecte, exploitation économique, travail forcé, impôts.`
      },
      {
        title: 'II. Économie Coloniale',
        content: `Cultures de rente (café, cacao), infrastructures, mono-exportation.`
      },
      {
        title: 'III. Résistances',
        content: `Révoltes, refus du travail forcé, mouvements politiques, syndicats.`
      },
      {
        title: 'IV. Vers l\'Indépendance',
        content: `Seconde Guerre mondiale, éveil nationaliste, Félix Houphouët-Boigny, indépendance (1960).`
      }
    ]
  },
  '1ère H6_La_première_guerre_mondiale_Causes_et_Conséquences': {
    sections: [
      {
        title: 'I. Causes',
        content: `Nationalismes, alliances, impérialisme, course aux armements, assassinat de Sarajevo (1914).`
      },
      {
        title: 'II. Déroulement',
        content: `1914-1918. Guerre de position, tranchées, nouvelles armées (gaz, chars, aviation).`
      },
      {
        title: 'III. Conséquences Humaines',
        content: `10 millions de morts, 20 millions de blessés, traumatisme collectif.`
      },
      {
        title: 'IV. Conséquences Politiques',
        content: `Effondrement empires, traité de Versailles, nouvelles frontières, montée des totalitarismes.`
      }
    ]
  },
  '1ère H7_La_deuxième_Guerre_Mondiale_Causes_et_Conséquences': {
    sections: [
      {
        title: 'I. Causes',
        content: `Traité de Versailles, crise de 1929, montée fascismes (Hitler, Mussolini), expansionnisme.`
      },
      {
        title: 'II. Déroulement',
        content: `1939-1945. Blitzkrieg, occupation, Shoah, guerre du Pacifique, libération.`
      },
      {
        title: 'III. Conséquences',
        content: `55 millions de morts, destructions massives, bombe atomique.`
      },
      {
        title: 'IV. Nouvel Ordre Mondial',
        content: `ONU, Guerre froide, décolonisation, droits de l'homme.`
      }
    ]
  },
  '1ère H8_Les_violences_de_masse_Les_génocides_du_xxème_siècles_à_nos_jours': {
    sections: [
      {
        title: 'I. Définition',
        content: `Destruction intentionnelle d'un groupe ethnique, national ou religieux.`
      },
      {
        title: 'II. Génocide Arménien (1915)',
        content: `1,5 million de morts. Première reconnaissance du terme "génocide".`
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
  console.log('📝 Mise à jour des fiches Histoire-Geographie avec vrais résumés...\n');
  
  let updated = 0;

  // Géographie
  console.log('📚 Géographie');
  for (const [title, summary] of Object.entries(geoSummaries)) {
    const cleanTitle = title.replace(/[^a-zA-Z0-9À-ÿ\s]/g, '_').replace(/\s+/g, '_');
    const fileName = `Fiche_${cleanTitle}.html`;
    const filePath = path.join(FICHES_DIR, fileName);
    
    const html = generateHTML(title, summary, 'Géographie');
    fs.writeFileSync(filePath, html, 'utf8');
    
    console.log(`  ✓ ${fileName}`);
    updated++;
  }

  // Histoire
  console.log('\n📚 Histoire');
  for (const [title, summary] of Object.entries(histSummaries)) {
    const cleanTitle = title.replace(/[^a-zA-Z0-9À-ÿ\s]/g, '_').replace(/\s+/g, '_');
    const fileName = `Fiche_${cleanTitle}.html`;
    const filePath = path.join(FICHES_DIR, fileName);
    
    const html = generateHTML(title, summary, 'Histoire');
    fs.writeFileSync(filePath, html, 'utf8');
    
    console.log(`  ✓ ${fileName}`);
    updated++;
  }

  console.log(`\n✅ Fiches mises à jour: ${updated}`);
}

main().catch(e => console.error('Fatal:', e));
