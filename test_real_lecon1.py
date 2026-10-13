import sys
import time

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options

options = Options()
options.add_argument('--headless=new')
options.add_argument('--no-sandbox')
options.add_argument('--window-size=1400,900')
driver = webdriver.Chrome(options=options)

try:
    print("[1] Connexion visiteur...")
    driver.get('https://ecole-ci.org/co/loginvisiteur.php')
    time.sleep(2)
    phone = driver.find_element(By.XPATH, "//input[@type='text' or @type='tel' or @name='telephone']")
    phone.clear()
    phone.send_keys('0594889379')
    btn = driver.find_element(By.XPATH, "//button[@type='submit'] | //input[@type='submit']")
    driver.execute_script("arguments[0].click();", btn)
    time.sleep(4)
    print("Connecte ! URL courante :", driver.current_url)

    # Ouvrir directement la leçon 1 (id=3720) sur le sous-domaine lyc.ecole-ci.org
    print("[2] Chargement de la leçon 1 de Philo (id=3720)...")
    driver.get('https://lyc.ecole-ci.org/course/view.php?id=3720')
    time.sleep(4)
    print("URL atteinte :", driver.current_url)
    print("Titre de la page :", driver.title)
    driver.save_screenshot('screen_lecon1_reelle.png')

    # Extraire tous les liens de téléchargement / résumé
    links = driver.find_elements(By.TAG_NAME, 'a')
    print(f"\n[3] Analyse des {len(links)} liens sur la page :")
    for l in links:
        href = l.get_attribute('href') or ''
        text = l.text.strip().replace('\n', ' ')
        if any(w in text.lower() for w in ['résumé', 'resume', 'cours', 'fiche', 'leçon', 'lecon', 'lire', 'télécharger']) or any(w in href.lower() for w in ['pluginfile', 'resource', '.pdf']):
            print(f"  ⭐ LIEN TROUVÉ : '{text}' -> {href}")

finally:
    driver.quit()
