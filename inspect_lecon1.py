import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options

options = Options()
options.add_argument('--headless=new')
options.add_argument('--no-sandbox')
driver = webdriver.Chrome(options=options)

driver.get('https://ecole-ci.org/co/loginvisiteur.php')
time.sleep(2)
phone = driver.find_element(By.XPATH, "//input[@type='text' or @type='tel' or @name='telephone']")
phone.send_keys('0594889379')
driver.find_element(By.XPATH, "//button[@type='submit'] | //input[@type='submit']").click()
time.sleep(3)

# Ouvrir la Leçon 1 de Philo Première A
driver.get('https://lyc.ecole-ci.org/course/view.php?id=3720')
time.sleep(3)
with open('lecon1_page.html', 'w', encoding='utf-8') as f:
    f.write(driver.page_source)

# Chercher les liens
links = driver.find_elements(By.TAG_NAME, 'a')
print(f"Trouve {len(links)} liens sur la page de la lecon 1 :")
for l in links:
    t = l.text.strip().replace('\n', ' ')
    h = l.get_attribute('href')
    if t and ('résumé' in t.lower() or 'resume' in t.lower() or 'pdf' in str(h).lower() or 'cours' in t.lower() or 'leçon' in t.lower() or 'fiche' in t.lower()):
        print(f"  • TEXT: '{t}' -> HREF: {h}")

driver.quit()
