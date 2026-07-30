import 'dotenv/config';
import puppeteer from 'puppeteer';

async function finalFix() {
  const browser = await puppeteer.launch({ headless: false }); 
  const page = await browser.newPage();

  try {
    // 1. تسجيل الدخول
    await page.goto('https://admin.earthlink.iq/Login.aspx', { waitUntil: 'networkidle2' });
    await page.type('#Login1_UserName', process.env.EARTHLINK_USER);
    await page.type('#Login1_Password', process.env.EARTHLINK_PASS);
    await page.click('#Login1_LoginButton');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // 2. الدخول لصفحة المستخدمين
    await page.goto('https://admin.earthlink.iq/UserManagement.aspx', { waitUntil: 'networkidle2' });
    
    // 3. طريقة الضغط "البلدية" (الأكثر ضماناً): الضغط على أي زر 'input' من نوع submit
    console.log("جارٍ الضغط على زر البحث...");
    await page.evaluate(() => {
        const buttons = document.querySelectorAll('input[type="submit"]');
        for(let btn of buttons) {
            if(btn.value.includes('Search')) {
                btn.click();
            }
        }
    });

    await new Promise(r => setTimeout(r, 5000)); // انتظر 5 ثواني حتى يحمل الجدول

    // 4. استخراج البيانات
    const data = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('table tr'))
            .map(row => row.innerText)
            .filter(text => text.includes('Suspended'));
    });

    console.log("--- المشتركون (Suspended) ---");
    console.log(data);

  } catch (e) {
    console.error("خطأ:", e.message);
  }
}

finalFix();