import { useEffect, useState, useCallback } from 'react';
import { api } from './api';
import SearchTrack from './components/SearchTrack';
import TrackedProductPanel from './components/TrackedProductPanel';

export default function App() {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);

  const loadProducts = useCallback(async () => {
    try {
      const data = await api.listProducts();
      setProducts(data);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  return (
    <div className="shell">
      <div className="top">
        <div>
          <h1>Price Tracker</h1>
          <p>Tracking INE mock store products every 2 hours</p>
        </div>
        <a className="btn secondary" href={api.exportCsvUrl()}>
          Export CSV
        </a>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <SearchTrack onTracked={loadProducts} />

      <section className="block">
        <h2>Tracked products</h2>
        {!products ? (
          <div className="empty">Loading...</div>
        ) : products.length === 0 ? (
          <div className="empty">Nothing tracked yet - search above and pick a product to start.</div>
        ) : (
          products.map((p) => <TrackedProductPanel key={p.id} product={p} />)
        )}
      </section>
    </div>
  );
}
