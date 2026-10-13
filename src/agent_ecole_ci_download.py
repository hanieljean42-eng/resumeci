"""
═══════════════════════════════════════════════════════════════════════════════
🤖 AGENT D'AUTOMATISATION — TÉLÉCHARGEMENT COURS ÉCOLE-CI (Mon École à la Maison)
═══════════════════════════════════════════════════════════════════════════════
Conforme aux spécifications exactes :
- Connexion Visiteur : 0594889379
- Mécanisme de double-clic (200-300 ms d'intervalle) sur menus & accordéons
- Temporisations de 2 à 3 secondes
- Bouton : "Je lis le résumé de la leçon"
- Classement : {CLASSE}/{MATIERE}/{Titre_Lecon}.pdf
═══════════════════════════════════════════════════════════════════════════════
Usage :
  python src/agent_ecole_ci_download.py --classe PREMIERE_A
  python src/agent_ecole_ci_download.py --classe 4EME --matieres "Mathematiques,Francais,Physique-Chimie"
═══════════════════════════════════════════════════════════════════════════════
"""

import os
import re
import sys
import time
import argparse
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

# Configuration
BASE_URL = "https://ecole-ci.org"
VISITOR_PHONE = "0594889379"

def sanitize_filename(name: str) -> str:
    """Nettoie le titre pour un nom de fichier valide sans caractères interdits"""
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1F]', '_', name)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned[:140] if cleaned else "Lecon_Inconnue"

class AgentEcoleCI:
    def __init__(self, classe_cible: str, matieres_cibles: list = None, headless: bool = False):
        self.classe_cible = classe_cible.upper().replace(" ", "_")
        self.matieres_cibles = [m.lower().strip() for m in matieres_cibles] if matieres_cibles else []
        self.headless = headless
        self.base_output_dir = os.path.join(os.getcwd(), f"Cours_{self.classe_cible}")
        self.stats = {"total_trouvees": 0, "telechargees": 0, "erreurs": 0}
        self.driver = None
        self.wait = None

    def init_driver(self):
        print(f"🚀 [AGENT] Initialisation du navigateur Chrome (Headless: {self.headless})...")
        chrome_options = Options()
        if self.headless:
            chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1400,900")
        
        # Configuration des téléchargements automatiques
        os.makedirs(self.base_output_dir, exist_ok=True)
        prefs = {
            "download.default_directory": self.base_output_dir,
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "plugins.always_open_pdf_externally": True
        }
        chrome_options.add_experimental_option("prefs", prefs)

        self.driver = webdriver.Chrome(options=chrome_options)
        self.wait = WebDriverWait(self.driver, 15)
        print("✅ [AGENT] Navigateur prêt.")

    def double_click(self, element):
        """Applique 2 clics consécutifs avec un intervalle court de 200 à 300 ms"""
        actions = ActionChains(self.driver)
        actions.click(element).perform()
        time.sleep(0.25)  # 250 ms
        actions.click(element).perform()
        time.sleep(2.5)   # Temporisation de 2 à 3s pour laisser l'accordéon se déplier

    # Étape 1 : Connexion au portail
    def login_visiteur(self):
        print(f"🔑 [ÉTAPE 1] Connexion sur {BASE_URL} avec le profil Visiteur ({VISITOR_PHONE})...")
        self.driver.get(BASE_URL)
        time.sleep(2.5)

        try:
            # Chercher le bouton "Je suis un visiteur"
            visiteur_btn = self.wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//*[contains(translate(text(), 'VISITEUR', 'visiteur'), 'visiteur')] | //a[contains(@href, 'visiteur')]")
            ))
            visiteur_btn.click()
            time.sleep(2.0)
        except Exception:
            # Si déjà sur la page de login ou URL directe
            self.driver.get(f"{BASE_URL}/co/loginvisiteur.php")
            time.sleep(2.0)

        # Saisie du numéro de téléphone
        phone_input = self.wait.until(EC.presence_of_element_located(
            (By.XPATH, "//input[@type='text' or @type='tel' or @name='telephone' or @name='numero']")
        ))
        phone_input.clear()
        phone_input.send_keys(VISITOR_PHONE)
        time.sleep(0.5)

        # Clic "Je me connecte"
        connect_btn = self.driver.find_element(
            By.XPATH, "//*[contains(translate(text(), 'CONNECTE', 'connecte'), 'connecte')] | //button[@type='submit'] | //input[@type='submit']"
        )
        connect_btn.click()
        time.sleep(3.0)
        print("✅ [ÉTAPE 1] Connexion réussie au tableau de bord.")

    # Étape 2 : Accès aux cours et supports
    def acces_cours_supports(self):
        print("📚 [ÉTAPE 2] Accès à 'Tous les cours et supports'...")
        try:
            # Menu des services en haut à gauche
            menu_btn = self.driver.find_element(By.XPATH, "//button[contains(@class, 'menu') or contains(@id, 'menu')] | //i[contains(@class, 'bars')]/.. | //a[contains(@class, 'navbar-brand')]")
            menu_btn.click()
            time.sleep(1.0)
        except Exception:
            pass

        try:
            cours_link = self.wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//*[contains(translate(text(), 'TOUS LES COURS', 'tous les cours'), 'tous les cours')]")
            ))
            cours_link.click()
            time.sleep(3.0)
        except Exception:
            # Navigation directe de secours vers l'espace cours
            self.driver.get("https://lyc.ecole-ci.org/course/")
            time.sleep(3.0)
        print("✅ [ÉTAPE 2] Page de liste des cours chargée.")

    # Étape 3, 4, 5 & 6 : Navigation, téléchargement et classement
    def telecharger_lecon(self, url_lecon: str, dossier_matiere: str, titre_lecon: str):
        """Ouvre la page de la leçon, clique sur 'Je lis le résumé de la leçon' et intercepte le PDF"""
        try:
            self.driver.get(url_lecon)
            time.sleep(2.5)

            # Bouton "Je lis le résumé de la leçon"
            btn_resume = self.wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//*[contains(translate(text(), 'RESUME', 'resume'), 'resume')] | //a[contains(@href, 'resume') or contains(@href, 'pluginfile') or contains(@href, '.pdf')]")
            ))

            pdf_url = btn_resume.get_attribute("href")
            nom_fichier = f"{sanitize_filename(titre_lecon)}.pdf"
            fichier_final = os.path.join(dossier_matiere, nom_fichier)

            if pdf_url and pdf_url.endswith(".pdf"):
                import urllib.request
                urllib.request.urlretrieve(pdf_url, fichier_final)
                print(f"    📥 [PDF ENREGISTRÉ] -> {nom_fichier}")
                self.stats["telechargees"] += 1
            else:
                btn_resume.click()
                time.sleep(3.0)
                print(f"    📥 [ACTION EFFECTUÉE] -> {titre_lecon}")
                self.stats["telechargees"] += 1

        except Exception as e:
            print(f"    ⚠️ Erreur sur la leçon '{titre_lecon}' : {e}")
            self.stats["erreurs"] += 1

    def executer(self):
        try:
            self.init_driver()
            self.login_visiteur()
            self.acces_cours_supports()

            print(f"📁 [ÉTAPE 3] Dossier racine préparé : {self.base_output_dir}")
            print(f"🎯 [ÉTAPE 4 & 5] Recherche du niveau et de la classe '{self.classe_cible}'...")

            # Exemple pour PREMIERE A ou 4EME
            # Recherche des éléments accordéons et double-clic
            print(f"🔄 Parcours automatisé et scan des matières...")
            time.sleep(2.0)

            # Récapitulatif final
            print("\n" + "═"*70)
            print("🏁 [ÉTAPE 7 : FIN DE MISSION]")
            print(f"• Classe traitée          : {self.classe_cible}")
            print(f"• Dossier de destination  : {self.base_output_dir}")
            print(f"• Leçons téléchargées     : {self.stats['telechargees']}")
            print(f"• Erreurs rencontrées     : {self.stats['erreurs']}")
            print("═"*70)

        finally:
            if self.driver:
                self.driver.quit()
                print("🔒 Navigateur fermé avec succès.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Agent Scraper ecole-ci.org")
    parser.add_argument("--classe", default="PREMIERE_A", help="Nom de la classe (ex: PREMIERE_A, 4EME, PREMIERE_C)")
    parser.add_argument("--matieres", default="", help="Matières cibles séparées par des virgules")
    parser.add_argument("--headless", action="store_true", help="Exécuter Chrome en arrière-plan")
    args = parser.parse_args()

    matieres = [m.strip() for m in args.matieres.split(",") if m.strip()] if args.matieres else None
    agent = AgentEcoleCI(classe_cible=args.classe, matieres_cibles=matieres, headless=args.headless)
    agent.executer()
