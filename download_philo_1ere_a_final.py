import os
import sys
import time

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

def telecharger_philo_1ere_a():
    print("=" * 70, flush=True)
    print("🤖 AGENT RESUMECI : TELECHARGEMENT PHILOSOPHIE PREMIERE A", flush=True)
    print("=" * 70, flush=True)

    output_dir = os.path.join(os.getcwd(), "Cours_PREMIERE_A", "Philosophie")
    os.makedirs(output_dir, exist_ok=True)
    print(f"📁 Dossier de destination : {output_dir}", flush=True)

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--window-size=1400,900")
    
    # Configuration des téléchargements automatiques de Chrome
    prefs = {
        "download.default_directory": output_dir,
        "download.prompt_for_download": False,
        "plugins.always_open_pdf_externally": True
    }
    options.add_experimental_option("prefs", prefs)

    driver = webdriver.Chrome(options=options)
    wait = WebDriverWait(driver, 20)

    try:
        # ÉTAPE 1 : Connexion avec le mécanisme des deux clics
        print("🔑 [ÉTAPE 1] Connexion sur ecole-ci.org...", flush=True)
        driver.get("https://ecole-ci.org/co/loginvisiteur.php")
        time.sleep(2)

        phone_input = wait.until(EC.presence_of_element_located((By.XPATH, "//input[@type='text' or @type='tel' or @name='telephone']")))
        phone_input.clear()
        phone_input.send_keys("0594889379")
        time.sleep(1)

        # Clic 1 : Valide le numéro
        print("👆 Clic 1 : Validation du numéro...", flush=True)
        btn1 = driver.find_element(By.XPATH, "//button[@type='submit'] | //input[@type='submit']")
        driver.execute_script("arguments[0].click();", btn1)
        time.sleep(1.5)

        # Clic 2 : Déclenche la connexion effective vers lyc.ecole-ci.org
        print("✌️ Clic 2 : Connexion effective...", flush=True)
        btn2 = driver.find_element(By.XPATH, "//button[@type='submit'] | //input[@type='submit']")
        driver.execute_script("arguments[0].click();", btn2)
        
        # Attendre l'arrivée sur le Moodle du lycée
        wait.until(lambda d: "lyc.ecole-ci.org" in d.current_url)
        print(f"✅ [ÉTAPE 1 OK] Connecté avec succès : {driver.current_url}", flush=True)

        # Création de la session requests avec les cookies de Moodle
        cookies = driver.get_cookies()
        session = requests.Session()
        for c in cookies:
            session.cookies.set(c['name'], c['value'])
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': 'https://lyc.ecole-ci.org/'
        })

        # ÉTAPE 2 : Accès à la catégorie Philosophie Première A (categoryid=160)
        category_url = "https://lyc.ecole-ci.org/course/index.php?categoryid=160"
        print(f"📚 [ÉTAPE 2] Accès à la liste des leçons : {category_url}", flush=True)
        driver.get(category_url)
        time.sleep(3)

        # Extraire tous les cours (Leçons 1 à 9)
        course_elements = driver.find_elements(By.XPATH, "//div[contains(@class, 'coursename')]//a")
        lecons = []
        for elem in course_elements:
            titre = elem.text.strip().replace('\n', ' ')
            url = elem.get_attribute("href")
            if titre and url:
                lecons.append({"titre": titre, "url": url})

        # Trier dans l'ordre naturel (Leçon 1 à Leçon 9)
        lecons.reverse()
        print(f"📋 {len(lecons)} leçons trouvées pour Philosophie Première A :", flush=True)
        for i, l in enumerate(lecons, 1):
            print(f"   {i}. {l['titre']}", flush=True)

        # ÉTAPE 3 : Téléchargement des PDF de chaque leçon
        print("\n📥 [ÉTAPE 3] Téléchargement des fiches et cours PDF...", flush=True)
        nb_telecharges = 0

        for i, l in enumerate(lecons, 1):
            titre = l['titre']
            url = l['url']
            print(f"\n👉 [{i}/{len(lecons)}] Traitement de : {titre}...", flush=True)
            driver.get(url)
            time.sleep(2.5)

            # Scanner tous les liens de ressources / PDF
            links = driver.find_elements(By.XPATH, "//a[contains(@href, 'mod/resource/view.php') or contains(@href, 'pluginfile.php') or contains(@href, '.pdf')]")
            pdf_urls = []
            for a in links:
                href = a.get_attribute("href")
                text = a.text.strip()
                if href and href not in pdf_urls:
                    pdf_urls.append({"href": href, "text": text})

            print(f"   Trouvé {len(pdf_urls)} ressource(s) téléchargeable(s)", flush=True)

            if not pdf_urls:
                # Chercher dans le HTML complet si un iframe ou embed contient un PDF
                soup = BeautifulSoup(driver.page_source, 'html.parser')
                for obj in soup.find_all(['object', 'iframe', 'embed']):
                    src = obj.get('src') or obj.get('data')
                    if src and 'pluginfile.php' in src:
                        pdf_urls.append({"href": src, "text": titre})

            for res in pdf_urls:
                href = res['href']
                nom_base = "".join(c for c in titre if c.isalnum() or c in " _-").strip()
                nom_fichier = f"{nom_base}.pdf"
                fichier_dest = os.path.join(output_dir, nom_fichier)

                try:
                    r = session.get(href, timeout=30, verify=False)
                    if b"%PDF" in r.content[:1024] or "application/pdf" in r.headers.get("Content-Type", ""):
                        with open(fichier_dest, "wb") as f:
                            f.write(r.content)
                        print(f"   ✅ [ENREGISTRÉ] -> {nom_fichier} ({len(r.content)} octets)", flush=True)
                        nb_telecharges += 1
                        break
                    else:
                        # Si Moodle renvoie une page HTML qui encapsule le PDF
                        sub_soup = BeautifulSoup(r.text, 'html.parser')
                        found_link = sub_soup.find("a", href=lambda h: h and "pluginfile.php" in h)
                        if found_link and found_link.get("href"):
                            pdf_direct = session.get(found_link["href"], timeout=30, verify=False)
                            if b"%PDF" in pdf_direct.content[:1024]:
                                with open(fichier_dest, "wb") as f:
                                    f.write(pdf_direct.content)
                                print(f"   ✅ [ENREGISTRÉ DIRECT] -> {nom_fichier} ({len(pdf_direct.content)} octets)", flush=True)
                                nb_telecharges += 1
                                break
                except Exception as err:
                    print(f"   ⚠️ Erreur download : {err}", flush=True)

        print("\n" + "=" * 70, flush=True)
        print(f"🏁 FIN DE MISSION : {nb_telecharges} fichier(s) PDF téléchargé(s) dans :", flush=True)
        print(f"   {output_dir}", flush=True)
        print("=" * 70, flush=True)

    except Exception as e:
        print("❌ [ERREUR] :", e, flush=True)
    finally:
        driver.quit()
        print("🔒 Navigateur fermé.", flush=True)

if __name__ == "__main__":
    telecharger_philo_1ere_a()
