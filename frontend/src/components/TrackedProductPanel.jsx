import { useEffect, useState } from 'react';
import { api } from '../api';
import PriceChart from './PriceChart';
import ScrapeLogTable from './ScrapeLogTable';

export default function TrackedProductPanel({ product }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('chart');
  const [history, setHistory] = useState(null);
  const [log, setLog] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || (history && log)) return;
    (async () => {
      try {
        const [h, l] = await Promise.all([
          api.history(product.id),
          api.log(product.id),
        ]);
        setHistory(h);
        setLog(l);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [open]);

  const latest = log?.[0];

  return (
    <div className="tracked-panel">
      <div className="tracked-head" onClick={() => setOpen((v) => !v)}>
        <div>
          <div className="title">
            {product.product_name} — {product.option_label}
          </div>
          <div className="sub">
            #{product.store_product_id}
            {latest ? ` · last: ${latest.outcome} at ${new Date(latest.scraped_at).toLocaleString()}` : ''}
          </div>
        </div>
        <span>{open ? '▴' : '▾'}</span>
      </div>

      {open && (
        <div className="tracked-body">
          {error && <div className="error-banner">{error}</div>}
          {!history || !log ? (
            <div className="empty">Loading...</div>
          ) : (
            <>
              <div className="tabs">
                <button
                  className={`tab ${tab === 'chart' ? 'active' : ''}`}
                  onClick={() => setTab('chart')}
                >
                  Price history
                </button>
                <button
                  className={`tab ${tab === 'log' ? 'active' : ''}`}
                  onClick={() => setTab('log')}
                >
                  Scrape log
                </button>
              </div>
              {tab === 'chart' ? <PriceChart history={history} /> : <ScrapeLogTable log={log} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
