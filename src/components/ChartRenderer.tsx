import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { ChartSpec, ValueFormat } from "../types/analysis";

/* ================================================================
   VERDIO — Generic Chart Renderer
   The frontend renders ChartSpec objects produced by the analysis
   pipeline rather than containing a fixed Recharts implementation
   per page. One component, six chart types.
   ================================================================ */

const PAL = ['#16A34A', '#DC2626', '#2563EB', '#D97706', '#7C3AED', '#0891B2', '#BE185D', '#65A30D'];

export function formatValue(v: number | string, format: ValueFormat): string {
  if (typeof v === 'string') return v;
  if (!Number.isFinite(v)) return '—';
  switch (format) {
    case 'currency':   return '£' + Math.round(v).toLocaleString('en-GB');
    case 'count':      return Math.round(v).toLocaleString('en-GB');
    case 'percentage': return Math.round(v * 10) / 10 + '%';
    default:           return typeof v === 'number' ? v.toLocaleString('en-GB') : String(v);
  }
}

export function ChartRenderer({ chart }: { chart: ChartSpec }) {
  const tooltipFormatter = (v: any) => [formatValue(v, chart.formatValue), ''];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <p className="text-xs font-bold text-slate-600 mb-1">{chart.title.toUpperCase()}</p>
      {chart.subtitle && <p className="text-[11px] text-slate-400 mb-4">{chart.subtitle}</p>}

      {chart.chartType === 'line' && (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey={chart.xKey} tick={{ fill: '#94A3B8', fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => formatValue(v, chart.formatValue)} />
            <Tooltip formatter={tooltipFormatter} contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }} />
            {(chart.seriesKeys || ['value']).length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {(chart.seriesKeys || ['value']).map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={PAL[i % PAL.length]} strokeWidth={2.5}
                strokeDasharray={key === 'forecast' ? '6 3' : undefined}
                dot={{ r: 3, fill: PAL[i % PAL.length] }} connectNulls={false} name={key} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      {chart.chartType === 'bar' && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey={chart.xKey} tick={{ fill: '#94A3B8', fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => formatValue(v, chart.formatValue)} />
            <Tooltip formatter={tooltipFormatter} contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }} />
            <Bar dataKey={chart.yKey || 'value'} fill="#16A34A" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {chart.chartType === 'horizontal_bar' && (
        <ResponsiveContainer width="100%" height={Math.max(180, (chart.data.length || 1) * 34)}>
          <BarChart data={chart.data} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
            <XAxis type="number" tick={{ fill: '#94A3B8', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => formatValue(v, chart.formatValue)} />
            <YAxis type="category" dataKey={chart.yKey} tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} axisLine={false} width={110}
              tickFormatter={(v: string) => (v && v.length > 16 ? v.slice(0, 16) + '…' : v)} />
            <Tooltip formatter={tooltipFormatter} contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }} />
            <Bar dataKey={chart.xKey || 'value'} fill="#16A34A" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {chart.chartType === 'scatter' && (
        <ResponsiveContainer width="100%" height={240}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis type="number" dataKey={chart.xKey} tick={{ fill: '#94A3B8', fontSize: 10 }} tickLine={false} axisLine={false} name={chart.xKey} />
            <YAxis type="number" dataKey={chart.yKey} tick={{ fill: '#94A3B8', fontSize: 10 }} tickLine={false} axisLine={false} name={chart.yKey} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }} />
            <Scatter data={chart.data} fill="#16A34A" fillOpacity={0.6} />
          </ScatterChart>
        </ResponsiveContainer>
      )}

      {chart.chartType === 'pie' && (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={chart.data} dataKey={chart.yKey || 'value'} nameKey={chart.xKey || 'label'} innerRadius={50} outerRadius={90} paddingAngle={2}>
              {chart.data.map((_, i) => <Cell key={i} fill={PAL[i % PAL.length]} />)}
            </Pie>
            <Tooltip formatter={tooltipFormatter} contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      )}

      {chart.chartType === 'table' && chart.columns && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-slate-100">
              {chart.columns.map(c => (
                <th key={c.key} className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.data.map((row, i) => (
              <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                {chart.columns!.map(c => (
                  <td key={c.key} className="py-2.5 text-slate-600">{formatValue(row[c.key], c.format || 'plain')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
