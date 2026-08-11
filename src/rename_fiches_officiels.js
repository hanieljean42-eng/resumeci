/**
 * ═══════════════════════════════════════════════════════════
 * 📝 Renommage des Fiches avec Titres Officiels
 * Utilise les titres du JSON pour renommer les fiches existantes
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const JSON_FILE = path.join(__dirname, '..', 'data_premiere', 'courses_by_subject.json');
const FICHES_DIR = path.join(__dirname, '..', 'Fiches_Resume', 'Premiere_D');

// ─── Lecture du JSON ───────────────────────────────────────
const jsonContent = fs.readFileSync(JSON_FILE, 'utf8');
const data = JSON.parse(jsonContent);

const premiereD = data['PREMIERE D'] || [];

// ─── Mapping des titres officiels ─────────────────────────────
const officialTitles = {};

for (const course of premiereD) {
  const text = course.text;
  const cleanTitle = text.replace(/[^a-zA-Z0-9À-ÿ\s]/g, '_').replace(/\s+/g, '_');
  officialTitles[cleanTitle] = text;
}

// ─── Renommage des fiches Mathématiques ─────────────────────
const mathsDir = path.join(FICHES_DIR, 'Mathematiques');
if (fs.existsSync(mathsDir)) {
  const files = fs.readdirSync(mathsDir).filter(f => f.endsWith('.html'));
  
  console.log('📚 Renommage des fiches Mathématiques');
  
  const mathsMapping = {
    'Fiche_L1_Equations_et_inequations_du_second_degre.html': 'Fiche_MATHS_1D_L1_Equations_et_inequations_du_second_degre_dans_IR.html',
    'Fiche_L2_Le_denombrement.html': 'Fiche_MATHS_1D_L2_Denombrement.html',
    'Fiche_L3_Generalites_sur_les_fonctions.html': 'Fiche_MATHS_1D_L3_Generalites_sur_les_fonctions.html',
    'Fiche_L4_Limites_et_continuite.html': 'Fiche_MATHS_1D_L4_Limites_et_continuite.html',
    'Fiche_L5_Les_probabilites.html': 'Fiche_MATHS_1D_L5_Probabilite.html',
    'Fiche_L6_Derivation.html': 'Fiche_MATHS_1D_L6_Derivation.html',
    'Fiche_L7_Le_barycentre.html': 'Fiche_MATHS_1D_L7_Barycentre.html',
    'Fiche_L8_Extension_de_la_notion_de_la_limite.html': 'Fiche_MATHS_1D_L8_Extension_de_la_notion_de_la_limite.html',
    'Fiche_L9_Etude_et_representation_graphique_d_une_fonction.html': 'Fiche_MATHS_1D_L9_Etude_et_representation_graphique_d_une_fonction.html',
    'Fiche_L10_Angles_orientes_et_trigonometrie.html': 'Fiche_MATHS_1D_L10_Angles_orientes_et_trigonometrie.html',
    'Fiche_L11_Systemes_d_equations_lineaires_dans_R2_et_R3.html': 'Fiche_MATHS_1D_L11_Systemes_d_equations_lineaires_dans_R2_et_R3.html',
    'Fiche_L12_Les_suites_numeriques.html': 'Fiche_MATHS_1D_L12_Suites_numeriques.html',
    'Fiche_L13_Orthogonalite_dans_l_espace.html': 'Fiche_MATHS_1D_L13_Orthogonalite_dans_l_espace.html',
    'Fiche_L15_Statistiques.html': 'Fiche_MATHS_1D_L15_Statistiques.html'
  };
  
  for (const [oldName, newName] of Object.entries(mathsMapping)) {
    const oldPath = path.join(mathsDir, oldName);
    const newPath = path.join(mathsDir, newName);
    
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
      console.log(`  ✓ ${oldName} → ${newName}`);
    }
  }
}

// ─── Renommage des fiches Physique-Chimie ───────────────────
const physDir = path.join(FICHES_DIR, 'Physique-Chimie');
if (fs.existsSync(physDir)) {
  const files = fs.readdirSync(physDir).filter(f => f.endsWith('.html'));
  
  console.log('\n📚 Renommage des fiches Physique-Chimie');
  
  const physMapping = {
    'Fiche_CHIMIE_L1_Hydrocarbures_satures_Les_alcanes.html': 'Fiche_LECON_1_Hydrocarbures_satures_Les_alcanes.html',
    'Fiche_CHIMIE_L2_Hydrocarbures_insatures_Alcenes_Alcynes.html': 'Fiche_LECON_2_Hydrocarbures_insatures_Alcenes_Alcynes.html',
    'Fiche_CHIMIE_L4_Petrole_et_gaz_naturels.html': 'Fiche_LECON_4_Petrole_et_gaz_naturels.html',
    'Fiche_CHIMIE_L5_Composes_oxygenes.html': 'Fiche_LECON_5_Composes_oxygenes.html',
    'Fiche_CHIMIE_L6_L_ethanol.html': 'Fiche_LECON_6_L_ethanol.html',
    'Fiche_CHIMIE_L7_Esterification_et_hydrolyse_d_un_ester.html': 'Fiche_LECON_7_Esterification_et_hydrolyse_d_un_ester.html',
    'Fiche_CHIMIE_L8_Classification_quantitative_des_couples_oxidants_reducteurs.html': 'Fiche_LECON_8_Classification_quantitative_des_couples_oxidants_reducteurs.html',
    'Fiche_CHIMIE_L9_Reactions_d_oxidoreduction.html': 'Fiche_LECON_9_Reactions_d_oxidoreduction.html',
    'Fiche_CHIMIE_L11_L_electrolyse.html': 'Fiche_LECON_11_L_electrolyse.html',
    'Fiche_PHYSIQUE_L1_Le_travail_d_une_force.html': 'Fiche_LECON_1_Travail_et_puissance_d_une_force.html',
    'Fiche_PHYSIQUE_L2_L_energie_potentielle.html': 'Fiche_LECON_2_Energie_potentielle_electrostatique.html',
    'Fiche_PHYSIQUE_L3_L_energie_et_puissance.html': 'Fiche_LECON_3_Puissance_et_energie_electrique.html',
    'Fiche_PHYSIQUE_L4_Generalites_sur_les_condensateurs.html': 'Fiche_LECON_4_Le_condensateur.html',
    'Fiche_PHYSIQUE_L5_Lentilles_minces.html': 'Fiche_LECON_5_Les_lentilles_minces.html',
    'Fiche_PHYSIQUE_L7_L_energie_cinetique.html': 'Fiche_lecon_7_Energie_cinetique.html',
    'Fiche_PHYSIQUE_L9_L_energie_mecanique.html': 'Fiche_LECON_9_Energie_mecanique.html'
  };
  
  for (const [oldName, newName] of Object.entries(physMapping)) {
    const oldPath = path.join(physDir, oldName);
    const newPath = path.join(physDir, newName);
    
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
      console.log(`  ✓ ${oldName} → ${newName}`);
    }
  }
}

console.log('\n✅ Renommage terminé');
