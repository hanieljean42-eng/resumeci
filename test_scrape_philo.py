import os
import sys
import time

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

def run_test():
    print("[INIT] Demarrage du test pour Philosophie Premiere A...")
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1400,900")
    
    driver = webdriver.Chrome(options=options)
    wait = WebDriverWait(driver, 15)
    
    try:
        # Etape 1 : Connexion
        print("[ETAPE 1] Connexion avec 0594889379...")
        driver.get("https://ecole-ci.org/co/loginvisiteur.php")
        time.sleep(2)
        
        phone_input = wait.until(EC.presence_of_element_located((By.XPATH, "//input[@type='text' or @type='tel' or @name='telephone' or @name='numero']")))
        phone_input.clear()
        phone_input.send_keys("0594889379")
        time.sleep(0.5)
        
        # Clic connexion
        btn = driver.find_element(By.XPATH, "//button[@type='submit'] | //input[@type='submit'] | //*[contains(text(), 'connecte')]")
        btn.click()
        time.sleep(3)
        print("[INFO] URL apres login :", driver.current_url)
        print("[INFO] Titre apres login :", driver.title)
        
        # Sauvegarde du HTML de la page d'accueil pour voir les liens
        with open("after_login.html", "w", encoding="utf-8") as f:
            f.write(driver.page_source)
        print("[OK] after_login.html sauvegarde")
        
        # Navigation vers les cours du lycee
        driver.get("https://lyc.ecole-ci.org/course/")
        time.sleep(3)
        print("[INFO] URL cours lycee :", driver.current_url)
        with open("lyc_courses.html", "w", encoding="utf-8") as f:
            f.write(driver.page_source)
        print("[OK] lyc_courses.html sauvegarde")

        # Analyse des categories visibles sur lyc.ecole-ci.org
        categories = driver.find_elements(By.XPATH, "//a[contains(@href, 'categoryid') or contains(@class, 'category')] | //div[contains(@class, 'category')]")
        print(f"[STATS] Categories trouvees : {len(categories)}")
        for cat in categories[:20]:
            text = cat.text.strip().replace('\n', ' ')
            if text:
                print(f"  - {text} ({cat.get_attribute('href')})")

    except Exception as e:
        print("[ERREUR] Erreur pendant le test :", e)
    finally:
        driver.quit()
        print("[FIN] Navigateur ferme.")

if __name__ == "__main__":
    run_test()
