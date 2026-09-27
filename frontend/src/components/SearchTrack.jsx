import { useState } from 'react';
import { api } from '../api';

export default function SearchTrack({ onTracked }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [optionsByProduct, setOptionsByProduct] = useState({});
  const [selectedOption, setSelectedOption] = useState({});
  const [error, setError] = useState(null);

  async function runSearch(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.search(query);
      // backend returns a raw array from /api/search, not { results: [...] }
      setResults(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadOptions(product) {
    if (optionsByProduct[product.id]) return;
    try {
      const detail = await api.storeItem(product.id);
      setOptionsByProduct((prev) => ({
        ...prev,
        [product.id]: detail.options || [],
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function track(product) {
    const optionLabel = selectedOption[product.id];
    if (!optionLabel) {
      setError('Pick an option before tracking.');
      return;
    }
    setError(null);
    try {
      await api.trackProduct({
        storeProductId: product.id,
        slug: product.slug,
        productName: product.name,
        optionLabel,
      });
      onTracked();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="block">
      <h2>Find a product to track</h2>
      <form className="search-row" onSubmit={runSearch}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products by name..."
        />
        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {results && results.length === 0 && (
        <div className="empty">No products matched "{query}".</div>
      )}

      {results && results.length > 0 && (
        <div className="result-list">
          {results.map((product) => (
            <div className="result-row" key={product.id} onMouseEnter={() => loadOptions(product)}>
              <div>
                <span className="name">{product.name}</span>
                <span className="id">#{product.id}</span>
              </div>
              <div className="option-picker">
                <select
                  value={selectedOption[product.id] || ''}
                  onChange={(e) =>
                    setSelectedOption((prev) => ({
                      ...prev,
                      [product.id]: e.target.value,
                    }))
                  }
                  onFocus={() => loadOptions(product)}
                >
                  <option value="">Choose option...</option>
                  {(optionsByProduct[product.id] || []).map((opt) => (
                    <option key={opt.id} value={opt.label}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button className="btn small" onClick={() => track(product)}>
                  Track
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}