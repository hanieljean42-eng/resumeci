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
    print("[1] Navigation vers loginvisiteur.php...")
    driver.get('https://ecole-ci.org/co/loginvisiteur.php')
    time.sleep(2)
    driver.save_screenshot('screen_01_page_login.png')

    phone = driver.find_element(By.XPATH, "//input[@type='text' or @type='tel' or @name='telephone']")
    phone.clear()
    phone.send_keys('0594889379')
    time.sleep(1)
    driver.save_screenshot('screen_02_phone_entered.png')

    print("[2] Premier clic sur 'Je me connecte'...")
    btn = driver.find_element(By.XPATH, "//button[@type='submit'] | //input[@type='submit']")
    driver.execute_script("arguments[0].click();", btn)
    time.sleep(2.5)
    driver.save_screenshot('screen_03_after_click1.png')
    print("URL apres clic 1:", driver.current_url)

    # Verifier si un deuxieme clic est necessaire
    buttons = driver.find_elements(By.XPATH, "//button[@type='submit'] | //input[@type='submit'] | //a[contains(@href, 'connect')]")
    if buttons:
        print("[3] Deuxieme clic...")
        driver.execute_script("arguments[0].click();", buttons[0])
        time.sleep(3)
        driver.save_screenshot('screen_04_after_click2.png')
        print("URL apres clic 2:", driver.current_url)

finally:
    driver.quit()
    print("Screenshots termines.")
