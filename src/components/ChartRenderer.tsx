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

const PAL = ['#1F7A5A', '#345E7D', '#C18A3C', '#4F8C88', '#756D91', '#8A9B70', '#A45F5A', '#667A8B'];
const GRID = '#E8EEEA';
const TICK = '#718078';
const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #DCE5DF',
  boxShadow: '0 12px 30px rgba(15, 35, 25, .10)',
  color: '#203129',
  fontSize: 11,
  background: 'rgba(255, 255, 255, .97)',
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
            <XAxis dataKey={chart.xKey} tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => formatValue(v, chart.formatValue)} />
            <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} cursor={{ stroke: '#A9BDB2', strokeDasharray: '3 3' }} />
            {(chart.seriesKeys || ['value']).length > 1 && <Legend iconType="circle" iconSize={7} wrapperStyle={{ color: '#607168', fontSize: 10, paddingTop: 8 }} />}
            {(chart.seriesKeys || ['value']).map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={PAL[i % PAL.length]} strokeWidth={2.75}
                strokeDasharray={key === 'forecast' ? '6 3' : undefined}
                dot={{ r: 2.5, fill: '#FFFFFF', stroke: PAL[i % PAL.length], strokeWidth: 2 }}
                activeDot={{ r: 4, fill: PAL[i % PAL.length], stroke: '#FFFFFF', strokeWidth: 2 }}
                connectNulls={false} name={key} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      {chart.chartType === 'bar' && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chart.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs><linearGradient id="verdioBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2C9670"/><stop offset="100%" stopColor="#1B674D"/></linearGradient></defs>
            <CartesianGrid strokeDasharray="2 5" vertical={false} stroke={GRID} />
            <XAxis dataKey={chart.xKey} tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => formatValue(v, chart.formatValue)} />
            <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(31,122,90,.055)' }} />
            <Bar dataKey={chart.yKey || 'value'} fill="url(#verdioBar)" radius={[6, 6, 2, 2]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {chart.chartType === 'horizontal_bar' && (
        <ResponsiveContainer width="100%" height={Math.max(180, (chart.data.length || 1) * 34)}>
          <BarChart data={chart.data} layout="vertical" margin={{ left: 8, right: 8 }}>
            <defs><linearGradient id="verdioHorizontalBar" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#1B674D"/><stop offset="100%" stopColor="#35A57D"/></linearGradient></defs>
            <CartesianGrid strokeDasharray="2 5" horizontal={false} stroke={GRID} />
            <XAxis type="number" tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => formatValue(v, chart.formatValue)} />
            <YAxis type="category" dataKey={chart.yKey} tick={{ fill: '#45594F', fontSize: 10 }} tickLine={false} axisLine={false} width={110}
              tickFormatter={(v: string) => (v && v.length > 16 ? v.slice(0, 16) + '…' : v)} />
            <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(31,122,90,.05)' }} />
            <Bar dataKey={chart.xKey || 'value'} fill="url(#verdioHorizontalBar)" radius={[0, 7, 7, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {chart.chartType === 'scatter' && (
        <ResponsiveContainer width="100%" height={240}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="2 5" stroke={GRID} />
            <XAxis type="number" dataKey={chart.xKey} tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} name={chart.xKey} />
            <YAxis type="number" dataKey={chart.yKey} tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} name={chart.yKey} />
            <Tooltip cursor={{ stroke: '#A9BDB2', strokeDasharray: '3 3' }} contentStyle={TOOLTIP_STYLE} />
            <Scatter data={chart.data} fill="#287E61" fillOpacity={0.68} stroke="#155B43" strokeWidth={0.5} />
          </ScatterChart>
        </ResponsiveContainer>
      )}

      {chart.chartType === 'pie' && (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={chart.data} dataKey={chart.yKey || 'value'} nameKey={chart.xKey || 'label'} innerRadius={54} outerRadius={88} paddingAngle={3} cornerRadius={3} stroke="#FFFFFF" strokeWidth={2}>
              {chart.data.map((_, i) => <Cell key={i} fill={PAL[i % PAL.length]} />)}
            </Pie>
            <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_STYLE} />
            <Legend iconType="circle" iconSize={7} wrapperStyle={{ color: '#607168', fontSize: 10 }} />
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
