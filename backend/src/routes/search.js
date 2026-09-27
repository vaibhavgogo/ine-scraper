const express = require('express');
const router = express.Router();

// The store's own listing endpoint has no name-filter param (confirmed by
// inspection), so we cache the full 960-product catalog and filter it
// ourselves -- mirroring how the store's own search box appears to work.
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache = { data: [], fetchedAt: 0 };

async function fetchAllProducts() {
  const first = await fetch(
    'https://demo.inelabteamdev.com/api/v2/listings?page=1&limit=20'
  ).then((r) => r.json());

  const totalPages = first.totalPages;
  const all = [...first.results];

  const pageNumbers = [];
  for (let p = 2; p <= totalPages; p++) pageNumbers.push(p);

  const chunks = await Promise.all(
    pageNumbers.map((p) =>
      fetch(
        `https://demo.inelabteamdev.com/api/v2/listings?page=${p}&limit=20`
      ).then((r) => r.json())
    )
  );
  chunks.forEach((c) => all.push(...c.results));

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