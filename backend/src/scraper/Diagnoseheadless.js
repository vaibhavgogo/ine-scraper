const { chromium } = require('playwright');

(async () => {
  const productId = process.argv[2] || '2168';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`https://demo.inelabteamdev.com/item/${productId}`, {
    waitUntil: 'domcontentloaded',
  });

  console.log('hasFocus:', await page.evaluate(() => document.hasFocus()));
  console.log('visibilityState:', await page.evaluate(() => document.visibilityState));
  console.log(
    'hover media matches:',
    await page.evaluate(() => window.matchMedia('(hover: hover)').matches)
  );
  console.log(
    'pointer:fine media matches:',
    await page.evaluate(() => window.matchMedia('(pointer: fine)').matches)
  );
  console.log(
    'navigator.webdriver:',
    await page.evaluate(() => navigator.webdriver)
  );

  const panel = page.locator('.offer-panel');
  await panel.waitFor({ state: 'attached' });
  const box = await panel.boundingBox();
  console.log('offer-panel boundingBox:', box);

  await page.mouse.move(0, 0);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await new Promise((r) => setTimeout(r, 300));

  const hoverCheck = await page.evaluate(() => {
    const el = document.querySelector('.offer-panel');
    return el ? el.matches(':hover') : null;
  });
  console.log('offer-panel matches(":hover") after move:', hoverCheck);

  const btnState = await page.evaluate(() => {
    const btn = document.querySelector('.offer-panel button.ctl-main');
    return btn
      ? { disabled: btn.disabled, matchesHover: btn.matches(':hover') }
      : null;
  });
  console.log('button state right after hover:', btnState);

  await new Promise((r) => setTimeout(r, 5000));
  const btnState2 = await page.evaluate(() => {
    const btn = document.querySelector('.offer-panel button.ctl-main');
    return btn ? btn.disabled : null;
  });
  console.log('button.disabled after 5 more seconds of holding hover:', btnState2);

  await browser.close();
})();   