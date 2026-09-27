const { scrapeProductWithRetries } = require('./scrapeProduct');

const rawArgs = process.argv.slice(2);
const flags = rawArgs.filter((a) => a.startsWith('--'));
const positional = rawArgs.filter((a) => !a.startsWith('--'));

const productId = positional[0] || '2168';
const optionLabel = positional[1] || null; // e.g. "Creator kit"
const headless = !flags.includes('--headed');

(async () => {
  console.log(
    `Scraping product ${productId} (option="${optionLabel}", headless=${headless})...`
  );
  const result = await scrapeProductWithRetries(productId, optionLabel, { headless });
  console.log(JSON.stringify(result, null, 2));
})();