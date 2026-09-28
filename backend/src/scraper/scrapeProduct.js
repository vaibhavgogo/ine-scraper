const { chromium } = require('playwright');

function parsePrice(raw) {
  const normalized = raw
    .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/\uFF0C/g, ',')
    .replace(/\uFF0E/g, '.');
  const s = normalized.replace(/[^\d.,]/g, '').trim();
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const lastSep = Math.max(lastComma, lastDot);

  if (lastSep === -1) return parseFloat(s);

  const fractionLen = s.length - lastSep - 1;
  const decimalChar = s[lastSep];

  if (fractionLen === 2) {
    const otherChar = decimalChar === ',' ? '.' : ',';
    const intPart = s.slice(0, lastSep).split(otherChar).join('');
    const fracPart = s.slice(lastSep + 1);
    return parseFloat(`${intPart}.${fracPart}`);
  }

  return parseFloat(s.replace(/[.,]/g, ''));
}

async function selectOption(page, optionLabel) {
  if (!optionLabel) return;
  const optionButton = page.locator('.opt-picker').getByText(optionLabel, { exact: true });
  const count = await optionButton.count();
  if (count === 0) {
    throw new Error(`Option "${optionLabel}" not found in opt-picker`);
  }
  await optionButton.first().click({ timeout: 5000 });
}

// Don't trust the manifest's semantic class names (we confirmed
// "classes.sale" does NOT reliably point at the actual displayed price --
// it appears to mean something narrower, like a members-only price, that
// isn't always present). Instead identify the real price the same way a
// human eye would: it's the price text that is actually VISIBLE (not
// display:none, not aria-hidden) and NOT struck through. Decoys in this
// store are always either hidden or struck-through.
async function extractPriceAndStock(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.offer-panel');
    if (!panel) return { priceText: null, stockText: null };

    // The price can be rendered in awkward ways: fullwidth Unicode digits
    // (e.g. "１４５"), one <span> per character, and zero-width or
    // non-breaking spaces mixed in. Normalize all of that before matching.
    function normalize(str) {
      return (str || '')
        .replace(/[\uFF10-\uFF19]/g, (ch) =>
          String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30)
        )
        .replace(/\uFF0C/g, ',')
        .replace(/\uFF0E/g, '.')
        .replace(/[\u200B\u200C\u200D\uFEFF\u00A0\s]/g, '');
    }

    // An element counts as "a price" only if its ENTIRE text is a single
    // currency amount. That excludes containers holding several prices at
    // once, and labelled lines such as "Member price ₹35,805".
    const PRICE_ONLY_RE = /^[₹$][\d.,]*\d$/;
    const STOCK_RE = /in stock|out of stock|sold out|\d+\s*(units?|left|remaining|available)/i;

    function isVisible(el) {
      if (!el.getClientRects().length) return false;
      for (let node = el; node && node !== panel.parentElement; node = node.parentElement) {
        const s = window.getComputedStyle(node);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        if (parseFloat(s.opacity) === 0) return false;
        if (node.getAttribute('aria-hidden') === 'true') return false;
      }
      return true;
    }

    // A strike-through set on a parent doesn't appear in a child's own
    // computed style, so check every ancestor up to the panel.
    function isStruckThrough(el) {
      for (let node = el; node && node !== panel.parentElement; node = node.parentElement) {
        if (window.getComputedStyle(node).textDecorationLine.includes('line-through')) {
          return true;
        }
      }
      return false;
    }

    function isEmphasized(el) {
      const s = window.getComputedStyle(el);
      const weight = parseInt(s.fontWeight, 10) || 400;
      return weight >= 700 || el.tagName === 'B' || el.tagName === 'STRONG';
    }

    const all = Array.from(panel.querySelectorAll('*'));

    const candidates = all.filter(
      (el) =>
        PRICE_ONLY_RE.test(normalize(el.textContent)) &&
        isVisible(el) &&
        !isStruckThrough(el)
    );
    const emphasized = candidates.filter(isEmphasized);
    const realPriceEl = (emphasized.length ? emphasized : candidates)[0];

    let stockText = null;
    const availEl = panel.querySelector('[class*="avail"]');
    if (availEl && isVisible(availEl)) {
      stockText = availEl.textContent.trim();
    } else {
      const stockCandidate = all.find(
        (el) =>
          el.children.length === 0 &&
          STOCK_RE.test(el.textContent || '') &&
          isVisible(el)
      );
      if (stockCandidate) stockText = stockCandidate.textContent.trim();
    }

    return {
      priceText: realPriceEl ? normalize(realPriceEl.textContent) : null,
      stockText,
    };
  });
}

async function scrapeProductOnce(browser, productId, optionLabel) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const page = await context.newPage();
  const url = `https://demo.inelabteamdev.com/item/${productId}`;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.bringToFront();

    // A cookie/consent overlay can appear (seen in deployed environments,
    // likely region-triggered) and intercept clicks on the reveal button.
    // Remove it outright rather than hunting for an accept-button selector.
    await page.evaluate(() => {
      document
        .querySelectorAll('[class*="consent"], [class*="cookie"]')
        .forEach((el) => el.remove());
    });

    const offerPanel = page.locator('.offer-panel');
    await offerPanel.waitFor({ state: 'attached', timeout: 10000 });

    await selectOption(page, optionLabel);

    const box = await offerPanel.boundingBox();
    if (!box) throw new Error('offer-panel has no bounding box (not visible)');
    // Start from a position clearly outside the panel first, so the
    // browser registers a genuine "enter" transition rather than possibly
    // already starting inside the target area (this can differ between
    // headed and headless launches).
    await page.mouse.move(0, 0);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    const revealButton = page.locator('.offer-panel button.ctl-main');
    try {
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('.offer-panel button.ctl-main');
          return btn && !btn.disabled;
        },
        null,
        { timeout: 15000, polling: 100 }
      );
    } catch (e) {
      throw new Error(`STAGE=enable-button: ${e.message}`);
    }
    await revealButton.click({ timeout: 5000 });

    try {
      await page.waitForFunction(
        () =>
          document.querySelector('.offer-panel')?.classList.contains('offer-ready'),
        null,
        { timeout: 20000, polling: 100 }
      );
    } catch (e) {
      throw new Error(`STAGE=offer-ready: ${e.message}`);
    }

    const { priceText, stockText } = await extractPriceAndStock(page);
    if (!priceText) {
      throw new Error('STAGE=extract: no visible, non-struck-through price found in panel');
    }
    const price = parsePrice(priceText);
    if (!(price > 0)) {
      throw new Error(`STAGE=parse-price: not sane -- raw="${priceText}" parsed=${price}`);
    }

    return { outcome: 'success', price, stock: stockText, error: null };
  } catch (err) {
    console.error('ATTEMPT ERROR:', err.message);
    try {
      await page.screenshot({ path: `debug-${productId}.png`, fullPage: true });
      const debugInfo = await page.evaluate(() => {
        const el = document.querySelector('.offer-panel');
        return el
          ? { className: el.className, html: el.outerHTML.slice(0, 800) }
          : { found: false };
      });
      console.error('DEBUG offer-panel state at failure:', debugInfo);
    } catch (debugErr) {
      console.error('DEBUG capture itself failed:', debugErr.message);
    }
    return { outcome: 'failed', price: null, stock: null, error: err.message };
  } finally {
    await context.close();
  }
}

async function scrapeProductWithRetries(productId, optionLabel, browserOrOpts) {
  const delays = [2000, 5000, 10000];

  let browser;
  let ownsBrowser = false;
  if (browserOrOpts && typeof browserOrOpts.newContext === 'function') {
    browser = browserOrOpts;
  } else {
    const { headless = true } = browserOrOpts || {};
    browser = await chromium.launch({
      headless,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    ownsBrowser = true;
  }

  let result;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    result = await scrapeProductOnce(browser, productId, optionLabel);
    if (result.outcome === 'success') {
      if (attempt > 0) result.outcome = 'retried';
      result.attemptCount = attempt + 1;
      if (ownsBrowser) await browser.close();
      return result;
    }
    if (attempt < delays.length) {
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  result.attemptCount = delays.length + 1;
  if (ownsBrowser) await browser.close();
  return result;
}

module.exports = { scrapeProductWithRetries, parsePrice };