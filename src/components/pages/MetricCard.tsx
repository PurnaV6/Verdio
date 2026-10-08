export function MetricCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'green' | 'red' | 'amber' }) {
  const toneCls = tone === 'red' ? 'bg-red-50 text-red-700 border-red-200' : tone === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200';
  return (
    <div className="rounded-[14px] bg-white border border-slate-200 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">{label}</p>
      <p className="mt-2 text-[22px] font-bold text-slate-900 leading-none tracking-tight">{value}</p>
      {sub && <span className={`mt-2 inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border ${tone ? toneCls : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{sub}</span>}
    </div>
  );
}
