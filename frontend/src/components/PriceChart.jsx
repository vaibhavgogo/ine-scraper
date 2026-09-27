import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function PriceChart({ history }) {
  const points = history
    .filter((row) => row.price !== null && row.price !== undefined)
    .map((row) => ({
      time: new Date(row.scraped_at).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      price: row.price,
    }));

  if (!points.length) {
    return <div className="empty">No successful scrapes yet - history will appear here once one completes.</div>;
  }

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#d3dbd8" strokeDasharray="3 3" />
          <XAxis dataKey="time" fontSize={11} tick={{ fill: '#4b5a56' }} />
          <YAxis fontSize={11} tick={{ fill: '#4b5a56' }} width={60} />
          <Tooltip />
          <Line type="monotone" dataKey="price" stroke="#1f6f62" strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
