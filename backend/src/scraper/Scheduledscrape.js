// Runs one full scrape pass over every actively tracked product, then
// exits. Intended to be triggered every 2 hours by Windows Task Scheduler
// (or any external scheduler) running on a machine where this scraper is
// confirmed to work reliably -- see the design note for why the scrape
// itself runs here rather than from the cloud-hosted backend: the target
// site's reveal mechanism consistently fails from the deployment
// platform's datacenter IP even with headless-detection, consent-overlay,
// and price-extraction fixes all applied, while it works reliably from a
// residential connection. The backend API (search/track/history/export)
// remains fully deployed and reads from the same Supabase database this
// script writes to.

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const { scrapeProductWithRetries } = require('./scrapeProduct');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Observed: within one run the first few products succeed, then the rest
// stall at the reveal step (button never enables), even across retries.
// That pattern looks like the site throttling reveals per IP, so we pace
// requests instead of firing them back to back.
const PAUSE_BETWEEN_PRODUCTS_MS = 45000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log(`[${new Date().toISOString()}] Starting scheduled scrape run`);

  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('Failed to load tracked products:', error.message);
    process.exit(1);
  }

  console.log(`Found ${products.length} active tracked product(s)`);

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    if (i > 0) {
      await sleep(PAUSE_BETWEEN_PRODUCTS_MS + Math.floor(Math.random() * 15000));
    }
    const result = await scrapeProductWithRetries(
      product.store_product_id,
      product.option_label,
      { headless: false }
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
        `Insert failed for ${product.product_name} (${product.option_label}):`,
        insertErr.message
      );
    } else {
      console.log(
        `${product.product_name} (${product.option_label}) -> ${result.outcome} price=${result.price} stock=${result.stock}`
      );
    }
  }

  console.log(`[${new Date().toISOString()}] Scheduled scrape run complete`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error in scheduled scrape:', err);
  process.exit(1);
});