/**
 * Smoke test for the deployed ine-scraper backend.
 *
 * Runs through the full user flow against the LIVE Render URL:
 *   health check -> search -> item detail -> track product -> list products
 *   -> trigger a scrape -> read back history -> read back scrape log
 *
 * Usage (Node 18+, has native fetch):
 *   node smoke-test.js
 *
 * Config via environment variables (or just edit the defaults below):
 *   BASE_URL       Your deployed backend, e.g. https://ine-scraper-jsxn.onrender.com
 *   CRON_SECRET    Same value as process.env.CRON_SECRET on the server
 *   SEARCH_QUERY   A term you expect to match a product in the store, e.g. "shirt"
 */

const BASE_URL = process.env.BASE_URL || 'https://ine-scraper-jsxn.onrender.com';
const CRON_SECRET = process.env.CRON_SECRET || 'REPLACE_ME';
const SEARCH_QUERY = process.env.SEARCH_QUERY || 'a';

function log(step, msg) {
  console.log(`\n=== ${step} ===`);
  console.log(msg);
}

async function jsonOrThrow(res, label) {
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${label} failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  // 1. Health check
  const health = await fetch(`${BASE_URL}/health`).then((r) => jsonOrThrow(r, 'health'));
  log('1. Health check', health);

  // 2. Search
  const results = await fetch(
    `${BASE_URL}/api/search?q=${encodeURIComponent(SEARCH_QUERY)}`
  ).then((r) => jsonOrThrow(r, 'search'));
  log(`2. Search "${SEARCH_QUERY}"`, `${results.length} result(s)`);
  if (results.length === 0) {
    throw new Error(
      `No search results for "${SEARCH_QUERY}" — set SEARCH_QUERY to a term that matches a real product and rerun.`
    );
  }
  const picked = results[0];
  console.log('Picked:', { id: picked.id, name: picked.name, brand: picked.brand });

  // 3. Item detail (to find a real option label)
  const detail = await fetch(`${BASE_URL}/api/store-item/${picked.id}`).then((r) =>
    jsonOrThrow(r, 'store-item detail')
  );
  log('3. Item detail', {
    id: detail.id,
    name: detail.name,
    slug: detail.slug,
    optionsPreview: JSON.stringify(detail.options || detail.variants || detail).slice(0, 300),
  });

  // NOTE: adjust this if your item detail response shapes options differently.
  const optionLabel =
    detail?.options?.[0]?.label ||
    detail?.variants?.[0]?.label ||
    'Default';
  console.log('Using optionLabel:', optionLabel);

  // 4. Track the product
  const tracked = await fetch(`${BASE_URL}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeProductId: picked.id,
      slug: detail.slug || String(picked.id),
      productName: picked.name,
      optionLabel,
    }),
  }).then((r) => jsonOrThrow(r, 'track product (POST /api/products)'));
  log('4. Tracked product', tracked);

  const productId = tracked.id;

  // 5. List tracked products
  const list = await fetch(`${BASE_URL}/api/products`).then((r) =>
    jsonOrThrow(r, 'list products')
  );
  log('5. All tracked products', `${list.length} product(s) tracked`);

  // 6. Trigger a scrape run
  log('6. Triggering scrape run', 'This launches a real (non-headless) browser server-side — may take a while...');
  const scrapeResult = await fetch(`${BASE_URL}/api/scrape/run`, {
    method: 'POST',
    headers: { 'x-cron-secret': CRON_SECRET },
  }).then((r) => jsonOrThrow(r, 'scrape/run'));
  log('6. Scrape run result', scrapeResult);

  // 7. Read back history + log for the product we just tracked
  const history = await fetch(`${BASE_URL}/api/products/${productId}/history`).then((r) =>
    jsonOrThrow(r, 'history')
  );
  log('7a. Price/stock history', history);

  const scrapeLog = await fetch(`${BASE_URL}/api/products/${productId}/log`).then((r) =>
    jsonOrThrow(r, 'scrape log')
  );
  log('7b. Scrape log', scrapeLog);

  console.log('\n✅ Smoke test completed successfully.');
}

main().catch((err) => {
  console.error('\n❌ Smoke test FAILED:', err.message);
  process.exit(1);
});