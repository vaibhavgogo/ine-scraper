const express = require('express');
const router = express.Router();

// The store's own listing endpoint has no name-filter param (confirmed by
// inspection), so we cache the full 960-product catalog and filter it
// ourselves -- mirroring how the store's own search box appears to work.
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache = { data: [], fetchedAt: 0 };
async function fetchPage(p) {
  const res = await fetch(
    `https://demo.inelabteamdev.com/api/v2/listings?page=${p}&limit=20`
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Page ${p} failed: ${res.status} — ${body.slice(0, 200)}`);
  }
  return res.json();
}
async function fetchAllProducts() {
  const first = await fetchPage(1);
  const totalPages = first.totalPages;
  const all = [...first.results];

  const BATCH_SIZE = 5;
  for (let start = 2; start <= totalPages; start += BATCH_SIZE) {
    const batch = [];
    for (let p = start; p < Math.min(start + BATCH_SIZE, totalPages + 1); p++) {
      batch.push(fetchPage(p));
    }
    const results = await Promise.all(batch);
    results.forEach((r) => all.push(...r.results));
  }

  return all;
}
async function getCatalog() {
  const isStale = Date.now() - cache.fetchedAt > CACHE_TTL_MS;
  if (isStale || cache.data.length === 0) {
    cache.data = await fetchAllProducts();
    cache.fetchedAt = Date.now();
  }
  return cache.data;
}

router.get('/search', async (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json([]);

  try {
    const catalog = await getCatalog();
    const matches = catalog
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)
      )
      .slice(0, 25);
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full item detail (including its option list), so the frontend can show
// the user which Kit/variant options exist to choose from before tracking.
router.get('/store-item/:id', async (req, res) => {
  try {
    const r = await fetch(
      `https://demo.inelabteamdev.com/api/v2/items/${req.params.id}`
    );
    if (!r.ok) {
      return res.status(r.status).json({ error: 'store item fetch failed' });
    }
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;