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
  // Respond immediately -- a full run (browser launch + hover/click/retries
  // per product) can take well over a minute, longer than proxies/cron
  // clients want to hold a connection open for. Do the real work after
  // responding instead of making the caller wait for it.
  res.status(202).json({ message: 'Scrape started in background' });

  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('scrape/run: failed to load products:', error.message);
      return;
    }

    const browser = await chromium.launch({
      headless: false,
      args: ['--disable-blink-features=AutomationControlled'],
    });

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

      if (insertErr) {
        console.error(
          `scrape/run: insert failed for product ${product.id}:`,
          insertErr.message
        );
      } else {
        console.log(
          `scrape/run: product ${product.id} -> ${result.outcome} price=${result.price} stock=${result.stock}`
        );
      }
    }

    await browser.close();
    console.log('scrape/run: background run complete');
  } catch (err) {
    console.error('scrape/run: background run crashed:', err);
  }
});

module.exports = router;