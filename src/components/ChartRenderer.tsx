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

// Series palette, built from the console tokens in src/app/index.css (--vc-*): accent, accent-2, watch, risk,
// then a deep slate, an accent tint, a neutral and a light accent. SVG paint attributes accept var(), so the
// accent switch (html[data-accent]) recolours charts without any hex here. Every series colour is at least
// 3:1 against the panel (#FFFFFF), and neighbouring entries differ in hue or lightness.
const PAL = [
  'var(--vc-accent)',
  'var(--vc-accent-2)',
  'var(--vc-watch)',
  'var(--vc-risk)',
  'color-mix(in srgb, var(--vc-ink) 70%, var(--vc-accent))',
  'color-mix(in srgb, var(--vc-accent) 70%, var(--vc-ink))',
  'var(--vc-muted)',
  'color-mix(in srgb, var(--vc-accent-2) 80%, var(--vc-ink))',
];
const GRID = 'var(--vc-line)';
const TICK = 'var(--vc-muted)';
const INK = 'var(--vc-ink)';
const SHEET = 'var(--vc-panel)';
const TOOLTIP_STYLE = {
  borderRadius: 4,
  border: '1px solid var(--vc-line)',
  boxShadow: '0 8px 24px rgba(23, 32, 43, .14)',
  color: INK,
  fontSize: 12,
  background: SHEET,
};

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
    <div className="verdio-chart">
      <div className="verdio-chart-heading">
        <span />
        <div>
          <p>{chart.title}</p>
          {chart.subtitle && <small>{chart.subtitle}</small>}
        </div>
      </div>

      {chart.chartType === 'line' && (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chart.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 5" vertical={false} stroke={GRID} />
            <XAxis dataKey={chart.xKey} tick={{ fill: TICK, fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: TICK, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => formatValue(v, chart.formatValue)} />
            <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} cursor={{ stroke: 'var(--vc-muted)', strokeDasharray: '3 3' }} />
            {(chart.seriesKeys || ['value']).length > 1 && <Legend iconType="circle" iconSize={7} wrapperStyle={{ color: TICK, fontSize: 11, paddingTop: 8 }} />}
            {(chart.seriesKeys || ['value']).map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={PAL[i % PAL.length]} strokeWidth={2.75}
                strokeDasharray={key === 'forecast' ? '6 3' : undefined}
                dot={{ r: 2.5, fill: SHEET, stroke: PAL[i % PAL.length], strokeWidth: 2 }}
                activeDot={{ r: 4, fill: PAL[i % PAL.length], stroke: SHEET, strokeWidth: 2 }}
                connectNulls={false} name={key} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      {chart.chartType === 'bar' && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chart.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs><linearGradient id="verdioBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--vc-accent-2)"/><stop offset="100%" stopColor="var(--vc-accent)"/></linearGradient></defs>
            <CartesianGrid strokeDasharray="2 5" vertical={false} stroke={GRID} />
            <XAxis dataKey={chart.xKey} tick={{ fill: TICK, fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: TICK, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => formatValue(v, chart.formatValue)} />
            <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(31,91,73,.08)' }} />
            <Bar dataKey={chart.yKey || 'value'} fill="url(#verdioBar)" radius={[6, 6, 2, 2]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {chart.chartType === 'horizontal_bar' && (
        <ResponsiveContainer width="100%" height={Math.max(180, (chart.data.length || 1) * 34)}>
          <BarChart data={chart.data} layout="vertical" margin={{ left: 8, right: 8 }}>
            <defs><linearGradient id="verdioHorizontalBar" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="var(--vc-accent)"/><stop offset="100%" stopColor="var(--vc-accent-2)"/></linearGradient></defs>
            <CartesianGrid strokeDasharray="2 5" horizontal={false} stroke={GRID} />
            <XAxis type="number" tick={{ fill: TICK, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => formatValue(v, chart.formatValue)} />
            <YAxis type="category" dataKey={chart.yKey} tick={{ fill: TICK, fontSize: 11 }} tickLine={false} axisLine={false} width={110}
              tickFormatter={(v: string) => (v && v.length > 16 ? v.slice(0, 16) + '…' : v)} />
            <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(31,91,73,.08)' }} />
            <Bar dataKey={chart.xKey || 'value'} fill="url(#verdioHorizontalBar)" radius={[0, 7, 7, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {chart.chartType === 'scatter' && (
        <ResponsiveContainer width="100%" height={240}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="2 5" stroke={GRID} />
            <XAxis type="number" dataKey={chart.xKey} tick={{ fill: TICK, fontSize: 11 }} tickLine={false} axisLine={false} name={chart.xKey} />
            <YAxis type="number" dataKey={chart.yKey} tick={{ fill: TICK, fontSize: 11 }} tickLine={false} axisLine={false} name={chart.yKey} />
            <Tooltip cursor={{ stroke: 'var(--vc-muted)', strokeDasharray: '3 3' }} contentStyle={TOOLTIP_STYLE} />
            <Scatter data={chart.data} fill="var(--vc-accent-2)" fillOpacity={0.8} stroke="var(--vc-accent)" strokeWidth={0.5} />
          </ScatterChart>
        </ResponsiveContainer>
      )}

      {chart.chartType === 'pie' && (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={chart.data} dataKey={chart.yKey || 'value'} nameKey={chart.xKey || 'label'} innerRadius={54} outerRadius={88} paddingAngle={3} cornerRadius={3} stroke={SHEET} strokeWidth={2}>
              {chart.data.map((_, i) => <Cell key={i} fill={PAL[i % PAL.length]} />)}
            </Pie>
            <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} />
            <Legend iconType="circle" iconSize={7} wrapperStyle={{ color: TICK, fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      )}

      {chart.chartType === 'table' && chart.columns && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-[var(--vc-ink)]">
              {chart.columns.map(c => (
                <th key={c.key} className="pb-2 text-[11.5px] font-medium text-[var(--vc-muted)] uppercase tracking-wider">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.data.map((row, i) => (
              <tr key={i} className="border-t border-[var(--vc-line)]">
                {chart.columns!.map(c => (
                  <td key={c.key} className="py-2.5 text-[var(--vc-ink)]">{formatValue(row[c.key], c.format || 'plain')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
