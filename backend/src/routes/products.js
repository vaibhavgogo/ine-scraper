const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabaseClient');

// Track a specific product + option combination
router.post('/products', async (req, res) => {
  try {
    const { storeProductId, slug, productName, optionLabel } = req.body;
    if (!storeProductId || !slug || !productName || !optionLabel) {
      return res.status(400).json({
        error: 'storeProductId, slug, productName, optionLabel are all required',
      });
    }

    const productUrl = `https://demo.inelabteamdev.com/item/${storeProductId}`;

    const { data, error } = await supabase
      .from('products')
      .insert({
        store_product_id: String(storeProductId),
        slug,
        product_name: productName,
        option_label: optionLabel,
        product_url: productUrl,
      })
      .select()
      .single();

      if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'This product and option is already being tracked.' });
      }
      return res.status(400).json({ error: error.message });
    }
    res.status(201).json(data);
  } catch (err) {
    console.error('POST /products crashed:', err);
    res.status(500).json({ error: err.message });
  }
});

// List everything currently tracked
router.get('/products', async (req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Price/stock history for one product (oldest first, good for a chart)
router.get('/products/:id/history', async (req, res) => {
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('product_id', req.params.id)
    .order('scraped_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Scrape log -- same table, newest first (good for a log view)
router.get('/products/:id/log', async (req, res) => {
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('product_id', req.params.id)
    .order('scraped_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// CSV export across every tracked product's full scrape history
router.get('/export', async (req, res) => {
  const { data: products, error: perr } = await supabase.from('products').select('*');
  if (perr) return res.status(500).json({ error: perr.message });

  const { data: history, error: herr } = await supabase
    .from('price_history')
    .select('*')
    .order('scraped_at', { ascending: true });
  if (herr) return res.status(500).json({ error: herr.message });

  const productsById = Object.fromEntries(products.map((p) => [p.id, p]));

  const rows = [
    [
      'store_product_id',
      'product_name',
      'option',
      'timestamp_utc',
      'price',
      'stock',
      'outcome',
    ],
  ];

  for (const h of history) {
    const p = productsById[h.product_id];
    if (!p) continue;
    rows.push([
      p.store_product_id,
      p.product_name,
      p.option_label,
      new Date(h.scraped_at).toISOString(),
      h.price ?? '',
      h.stock ?? '',
      h.outcome,
    ]);
  }

  const csv = rows
    .map((row) =>
      row
        .map((field) => {
          const s = String(field);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="price-history.csv"'
  );
  res.send(csv);
});

module.exports = router;