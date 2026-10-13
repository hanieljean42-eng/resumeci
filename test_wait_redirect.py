import sys
import time

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.chrome.options import Options

options = Options()
options.add_argument('--headless=new')
options.add_argument('--no-sandbox')
options.add_argument('--window-size=1400,900')
driver = webdriver.Chrome(options=options)
wait = WebDriverWait(driver, 20)

try:
    print("[1] Connexion visiteur sur ecole-ci.org...")
    driver.get('https://ecole-ci.org/co/loginvisiteur.php')
    time.sleep(2)
    phone = wait.until(lambda d: d.find_element(By.XPATH, "//input[@type='text' or @type='tel' or @name='telephone']"))
    phone.clear()
    phone.send_keys('0594889379')
    btn = driver.find_element(By.XPATH, "//button[@type='submit'] | //input[@type='submit']")
    driver.execute_script("arguments[0].click();", btn)

    # ATTENDRE EXPLICITEMENT LA REDIRECTION VERS LYC.ECOLE-CI.ORG
    print("[2] Attente de la redirection vers lyc.ecole-ci.org...")
    wait.until(lambda d: "lyc.ecole-ci.org" in d.current_url)
    print("✅ Connexion terminee ! URL courante :", driver.current_url)
    print("✅ Titre courant :", driver.title)

    # Maintenant naviguer vers la leçon 1 (id=3720)
    print("[3] Navigation vers Leçon 1 (id=3720)...")
    driver.get('https://lyc.ecole-ci.org/course/view.php?id=3720')
    time.sleep(3)
    print("📍 URL apres chargement leçon :", driver.current_url)
    print("📄 Titre leçon :", driver.title)
    driver.save_screenshot('screen_lecon1_succes.png')

    # Chercher les ressources / fiches de cours
    links = driver.find_elements(By.TAG_NAME, 'a')
    print(f"\n[4] Liens sur la page ({len(links)}) :")
    for l in links:
        t = l.text.strip().replace('\n', ' ')
        h = l.get_attribute('href') or ''
        if any(w in t.lower() for w in ['résumé', 'resume', 'cours', 'fiche', 'leçon', 'lecon', 'lire', 'télécharger']) or any(w in h.lower() for w in ['pluginfile', 'resource', '.pdf']):
            print(f"  🎯 TROUVE : '{t}' -> {h}")

finally:
    driver.quit()
