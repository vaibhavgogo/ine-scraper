const { chromium } = require('playwright');

function parsePrice(raw) {
  const s = raw.replace(/[^\d.,]/g, '').trim();
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

    // Digits are sometimes split across sibling <span> chars and/or
    // rendered as fullwidth Unicode (U+FF10-FF19) instead of ASCII --
    // both defeat a naive \d-on-a-leaf-node scan. Normalize first.
    function normalizeDigits(str) {
      return str.replace(/[\uFF10-\uFF19]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 0x30)
      );
    }
    function normText(el) {
      return normalizeDigits(el.textContent || '');
    }

    const CURRENCY_RE = /[₹$]\s*[\d\s.,\u00A0\u200B]*\d/;
    const STOCK_RE = /in stock|out of stock|sold out|\d+\s*(units?|left|remaining)/i;

    function isVisible(el) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (parseFloat(style.opacity) === 0) return false;
      if (el.closest('[aria-hidden="true"]')) return false;
      return true;
    }
    function isStruckThrough(el) {
      return window.getComputedStyle(el).textDecorationLine.includes('line-through');
    }
    function isEmphasized(el) {
      const weight = parseInt(window.getComputedStyle(el).fontWeight, 10) || 400;
      return weight >= 700 || el.tagName === 'B' || el.tagName === 'STRONG';
    }

    const all = Array.from(panel.querySelectorAll('*'));

    // Match on full (descendant-inclusive) text, not just leaf nodes.
    const matching = all.filter((el) => CURRENCY_RE.test(normText(el)));
    // Keep only the innermost match per branch (drop wrapper ancestors).
    const priceCandidates = matching.filter(
      (el) => !matching.some((other) => other !== el && el.contains(other))
    );

    const visibleNonStruck = priceCandidates.filter(
      (el) => isVisible(el) && !isStruckThrough(el)
    );
    const emphasized = visibleNonStruck.filter(isEmphasized);
    const realPriceEl = (emphasized.length ? emphasized : visibleNonStruck)[0];

    let stockText = null;
    const availEl = panel.querySelector('[class*="avail"]');
    if (availEl && isVisible(availEl)) {
      stockText = availEl.textContent.trim();
    } else {
      const stockCandidate = all.find(
        (el) => el.children.length === 0 && STOCK_RE.test(el.textContent || '') && isVisible(el)
      );
      if (stockCandidate) stockText = stockCandidate.textContent.trim();
    }

    return {
      priceText: realPriceEl ? normalizeDigits(realPriceEl.textContent) : null,
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
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 });
await page.waitForTimeout(150);
// nudge slightly -- some listeners want a second distinct mousemove, not just entry
await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2 + 3, { steps: 5 });
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