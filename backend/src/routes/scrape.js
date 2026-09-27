const express = require('express');
const router = express.Router();
const { chromium } = require('playwright');
const { supabase } = require('../db/supabaseClient');
const { scrapeProductWithRetries } = require('../scraper/scrapeProduct');

// Only cron-job.org (which sends this shared secret header) may trigger a
// scrape -- otherwise anyone who finds this URL could kick off scrapes.
function requireCronSecret(req, res, next) {
  const provided = req.header('x-cron-secret');
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

router.post('/scrape/run', requireCronSecret, async (req, res) => {
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true);

  if (error) return res.status(500).json({ error: error.message });

  // One browser instance reused across every tracked product in this run
  // -- much faster than launching a fresh browser per product.
  // headless:true is specifically blocked by this site (confirmed via
  // repeated testing -- the reveal never enables in headless Chromium
  // despite the browser mechanics working correctly). Running in real,
  // non-headless mode instead, inside a virtual display (Xvfb) provided
  // by the deployment container -- see backend/Dockerfile.
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const results = [];

  for (const product of products) {
    const result = await scrapeProductWithRetries(
      product.store_product_id,
      product.option_label,
      browser
    );

    const { error: insertErr } = await supabase.from('price_history').insert({
      product_id: product.id,
      price: result.price,
      stock: result.stock,
      outcome: result.outcome,
      attempt_count: result.attemptCount,
      error_message: result.error,
    });

    results.push({
      productId: product.id,
      ...result,
      insertError: insertErr ? insertErr.message : null,
    });
  }

  await browser.close();
  res.json({ scraped: results.length, results });
});

module.exports = router;