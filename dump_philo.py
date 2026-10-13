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

driver.get('https://lyc.ecole-ci.org/course/index.php?categoryid=160')
time.sleep(3)
with open('philo_page.html', 'w', encoding='utf-8') as f:
    f.write(driver.page_source)
print('Page saved, length:', len(driver.page_source))
driver.quit()
