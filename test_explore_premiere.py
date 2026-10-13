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
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

def run():
    print("[INIT] Exploration de PREMIERE (categoryid=5)...", flush=True)
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--window-size=1400,900")
    
    driver = webdriver.Chrome(options=options)
    wait = WebDriverWait(driver, 15)
    
    try:
        # Login
        driver.get("https://ecole-ci.org/co/loginvisiteur.php")
        time.sleep(2)
        phone = wait.until(EC.presence_of_element_located((By.XPATH, "//input[@type='text' or @type='tel' or @name='telephone' or @name='numero']")))
        phone.clear()
        phone.send_keys("0594889379")
        btn = driver.find_element(By.XPATH, "//button[@type='submit'] | //input[@type='submit'] | //*[contains(text(), 'connecte')]")
        btn.click()
        time.sleep(3)
        
        # Navigation vers Premiere
        driver.get("https://lyc.ecole-ci.org/course/index.php?categoryid=5")
        time.sleep(3)
        print("[INFO] Titre de la page Premiere :", driver.title, flush=True)
        
        links = driver.find_elements(By.XPATH, "//a[contains(@href, 'categoryid=')]")
        print(f"[INFO] {len(links)} sous-liens trouves dans PREMIERE :", flush=True)
        for l in links:
            txt = l.text.strip().replace('\n', ' ')
            href = l.get_attribute("href")
            if txt:
                print(f"  • {txt} -> {href}", flush=True)
                
    except Exception as e:
        print("[ERREUR]:", e, flush=True)
    finally:
        driver.quit()

if __name__ == "__main__":
    run()
