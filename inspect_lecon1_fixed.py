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
driver = webdriver.Chrome(options=options)

try:
    print("Connexion...")
    driver.get('https://ecole-ci.org/co/loginvisiteur.php')
    time.sleep(2)
    phone = driver.find_element(By.XPATH, "//input[@type='text' or @type='tel' or @name='telephone']")
    phone.send_keys('0594889379')
    btn = driver.find_element(By.XPATH, "//button[@type='submit'] | //input[@type='submit']")
    driver.execute_script("arguments[0].click();", btn)
    time.sleep(3)
    print("Connecte !")

    # Ouvrir Lecon 1 (id=3720)
    driver.get('https://lyc.ecole-ci.org/course/view.php?id=3720')
    time.sleep(3)
    print("Page Lecon 1 chargee. Titre:", driver.title)
    
    with open('lecon1_page.html', 'w', encoding='utf-8') as f:
        f.write(driver.page_source)

    # Trouver tous les liens d'activités / ressources
    links = driver.find_elements(By.XPATH, "//div[contains(@class, 'activityinstance')]//a | //a[contains(@href, 'resource') or contains(@href, 'pluginfile')]")
    print(f"Trouve {len(links)} activites :")
    for l in links:
        t = l.text.strip().replace('\n', ' ')
        h = l.get_attribute('href')
        print(f"  • Activite: '{t}' -> {h}")

finally:
    driver.quit()
