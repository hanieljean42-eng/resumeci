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

def run_download_philo():
    print("=" * 60, flush=True)
    print("📚 TELECHARGEMENT DES COURS : PREMIERE A -> PHILOSOPHIE", flush=True)
    print("=" * 60, flush=True)

    output_dir = os.path.join(os.getcwd(), "Cours_PREMIERE_A", "Philosophie")
    os.makedirs(output_dir, exist_ok=True)
    print(f"📁 Dossier de destination : {output_dir}", flush=True)

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--window-size=1400,900")

    driver = webdriver.Chrome(options=options)
    wait = WebDriverWait(driver, 15)

    try:
        # Étape 1 : Connexion Visiteur
        print("🔑 [1/4] Connexion au portail avec 0594889379...", flush=True)
        driver.get("https://ecole-ci.org/co/loginvisiteur.php")
        time.sleep(2)
        phone = wait.until(EC.presence_of_element_located((By.XPATH, "//input[@type='text' or @type='tel' or @name='telephone' or @name='numero']")))
        phone.clear()
        phone.send_keys("0594889379")
        btn = driver.find_element(By.XPATH, "//button[@type='submit'] | //input[@type='submit'] | //*[contains(text(), 'connecte')]")
        btn.click()
        time.sleep(3)
        print("✅ Connecte avec succes.", flush=True)

        # Récupération des cookies de session pour les téléchargements de PDF
        selenium_cookies = driver.get_cookies()
        session = requests.Session()
        for c in selenium_cookies:
            session.cookies.set(c['name'], c['value'])
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': 'https://lyc.ecole-ci.org/'
        })

        # Étape 2 : Accès à la catégorie Philosophie 1ère A (categoryid=160)
        philo_url = "https://lyc.ecole-ci.org/course/index.php?categoryid=160"
        print(f"📖 [2/4] Chargement de la page Philosophie 1ère A ({philo_url})...", flush=True)
        driver.get(philo_url)
        time.sleep(3)

        # Extraction des cours / leçons listés
        courses = driver.find_elements(By.XPATH, "//div[contains(@class, 'coursebox')]//h3//a | //a[contains(@href, '/course/view.php?id=')]")
        course_list = []
        for c in courses:
            name = c.text.strip().replace('\n', ' ')
            url = c.get_attribute("href")
            if name and url and url not in [x['url'] for x in course_list]:
                course_list.append({"name": name, "url": url})

        print(f"🔍 [3/4] {len(course_list)} cours/modules de Philosophie trouves :", flush=True)
        for i, c in enumerate(course_list, 1):
            print(f"  {i}. {c['name']} -> {c['url']}", flush=True)

        # Étape 3 & 4 : Pour chaque cours, récupérer les résumés et PDFs
        total_pdfs = 0
        for i, c in enumerate(course_list, 1):
            c_name = c['name']
            c_url = c['url']
            print(f"\n📂 Traitement du cours {i}/{len(course_list)} : {c_name}...", flush=True)
            driver.get(c_url)
            time.sleep(2.5)

            # Chercher toutes les activités / ressources PDF ou résumés
            page_html = driver.page_source
            soup = BeautifulSoup(page_html, 'html.parser')

            # Chercher liens vers des fichiers pluginfile.php ou resource/view.php
            links = driver.find_elements(By.XPATH, "//a[contains(@href, 'pluginfile.php') or contains(@href, 'mod/resource/view.php') or contains(@href, 'mod/folder/view.php') or contains(text(), 'résumé') or contains(text(), 'Résumé') or contains(text(), 'Leçon') or contains(text(), 'leçon')]")
            
            print(f"   Trouve {len(links)} elements de contenu...", flush=True)
            for link in links:
                l_text = link.text.strip().replace('\n', ' ')
                l_href = link.get_attribute("href")
                if not l_href:
                    continue

                # Si c'est un lien direct de pluginfile.php ou mod/resource
                if 'mod/resource/view.php' in l_href or 'pluginfile.php' in l_href or '.pdf' in l_href.lower():
                    clean_name = "".join(x for x in (l_text or c_name) if x.isalnum() or x in " _-").strip()[:100]
                    clean_name = clean_name.replace(" ", "_")
                    if not clean_name.endswith(".pdf"):
                        clean_name += ".pdf"

                    pdf_path = os.path.join(output_dir, clean_name)
                    if os.path.exists(pdf_path):
                        print(f"   ⏩ Deja existant : {clean_name}", flush=True)
                        continue

                    try:
                        print(f"   ⬇️ Telechargement : {clean_name}...", flush=True)
                        r = session.get(l_href, timeout=30, verify=False)
                        if b"%PDF" in r.content[:1024] or "application/pdf" in r.headers.get("Content-Type", ""):
                            with open(pdf_path, "wb") as f:
                                f.write(r.content)
                            print(f"   ✅ Sauvegarde ({len(r.content)} octets) : {pdf_path}", flush=True)
                            total_pdfs += 1
                        else:
                            # Parfois mod/resource redirige vers le pluginfile
                            sub_soup = BeautifulSoup(r.text, 'html.parser')
                            embed_pdf = sub_soup.find("object", {"type": "application/pdf"}) or sub_soup.find("a", href=lambda h: h and "pluginfile.php" in h)
                            if embed_pdf and embed_pdf.get("href"):
                                sub_r = session.get(embed_pdf["href"], timeout=30, verify=False)
                                with open(pdf_path, "wb") as f:
                                    f.write(sub_r.content)
                                print(f"   ✅ Sauvegarde via embed ({len(sub_r.content)} octets) : {pdf_path}", flush=True)
                                total_pdfs += 1
                    except Exception as err:
                        print(f"   ⚠️ Erreur download : {err}", flush=True)

        print("\n" + "=" * 60, flush=True)
        print(f"🏁 FIN DU TELECHARGEMENT : {total_pdfs} fichier(s) PDF enregistre(s) dans {output_dir}", flush=True)
        print("=" * 60, flush=True)

    except Exception as e:
        print("[ERREUR GLOBALE] :", e, flush=True)
    finally:
        driver.quit()
        print("🔒 Navigateur ferme.", flush=True)

if __name__ == "__main__":
    run_download_philo()
