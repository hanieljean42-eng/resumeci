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
    print("[1] Connexion...")
    driver.get('https://ecole-ci.org/co/loginvisiteur.php')
    time.sleep(2)
    phone = driver.find_element(By.XPATH, "//input[@type='text' or @type='tel' or @name='telephone']")
    phone.clear()
    phone.send_keys('0594889379')
    btn = driver.find_element(By.XPATH, "//button[@type='submit'] | //input[@type='submit']")
    driver.execute_script("arguments[0].click();", btn)
    time.sleep(3)
    print("Connecte ! URL courante :", driver.current_url)

    # Aller sur la page de la lecon 1
    print("[2] Navigation directe vers la leçon 1 (id=3720)...")
    driver.get('https://lyc.ecole-ci.org/course/view.php?id=3720')
    time.sleep(3)
    print("URL apres navigation :", driver.current_url)
    print("Titre :", driver.title)
    driver.save_screenshot('screen_lecon1_direct.png')

    # Chercher les boutons d'inscription ou d'accès
    enrol_btns = driver.find_elements(By.XPATH, "//input[@type='submit'] | //button[@type='submit'] | //a[contains(@href, 'enrol')]")
    for b in enrol_btns:
        print("  Bouton visible :", b.get_attribute('value') or b.text)

finally:
    driver.quit()
