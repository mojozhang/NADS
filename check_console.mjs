import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Listen for all console events and errors
    page.on('console', msg => console.log(`[Browser Console ${msg.type()}] ${msg.text()}`));
    page.on('pageerror', exception => console.error(`[Browser Error] ${exception}`));
    page.on('requestfailed', request => console.error(`[Request Failed] ${request.url()} - ${request.failure()?.errorText}`));

    console.log("Navigating to http://localhost:8888/dashboard ...");
    try {
        await page.goto('http://localhost:8888/dashboard', { waitUntil: 'networkidle', timeout: 15000 });
        console.log("Navigation complete.");
        // Wait a bit to let client side code execute
        await page.waitForTimeout(5000);
    } catch (e) {
        console.error("Navigation error:", e);
    }

    console.log("Navigating to http://localhost:8888/dashboard/contracts-table ...");
    try {
        await page.goto('http://localhost:8888/dashboard/contracts-table', { waitUntil: 'networkidle', timeout: 15000 });
        console.log("Navigation complete.");
        await page.waitForTimeout(5000);
    } catch (e) {
        console.error("Navigation error:", e);
    }

    await browser.close();
})();
