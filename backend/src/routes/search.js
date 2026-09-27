const express = require('express');
const router = express.Router();

// The store's own listing endpoint has no name-filter param (confirmed by
// inspection), so we cache the full 960-product catalog and filter it
// ourselves -- mirroring how the store's own search box appears to work.
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache = { data: [], fetchedAt: 0 };
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPageOnce(p) {
 const res = await fetch(
    `https://demo.inelabteamdev.com/api/v2/listings?page=${p}&limit=60`,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    }
  );

  const contentType = res.headers.get('content-type') || '';
  const body = await res.text();

  if (!res.ok || !contentType.includes('application/json')) {
    const err = new Error(
      `Page ${p} failed: status=${res.status} content-type=${contentType} body=${body.slice(0, 300)}`
    );
    err.status = res.status;
    throw err;
  }

  return JSON.parse(body);
}

// The store occasionally 503s under load (its own capacity limit, not a
// block) -- retry transient 5xx a few times with backoff before giving up.
async function fetchPage(p, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetchPageOnce(p);
    } catch (err) {
      const isTransient = !err.status || err.status >= 500;
      const isLastAttempt = attempt === retries;
      if (!isTransient || isLastAttempt) throw err;
      await sleep(500 * attempt); // 500ms, 1000ms, ...
    }
  }
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
    await sleep(300); // pause between batches to avoid tripping the store's rate limit
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