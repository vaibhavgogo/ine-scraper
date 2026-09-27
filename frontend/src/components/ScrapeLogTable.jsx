export default function ScrapeLogTable({ log }) {
  if (!log.length) {
    return <div className="empty">No scrape attempts logged yet.</div>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Timestamp (UTC)</th>
          <th>Price</th>
          <th>Stock</th>
          <th>Outcome</th>
          <th>Attempts</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        {log.map((row) => (
          <tr key={row.id}>
            <td>{new Date(row.scraped_at).toISOString()}</td>
            <td>{row.price ?? '—'}</td>
            <td>{row.stock ?? '—'}</td>
            <td>
              <span className={`tag ${row.outcome}`}>{row.outcome}</span>
            </td>
            <td>{row.attempts}</td>
            <td>{row.error_message || ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
