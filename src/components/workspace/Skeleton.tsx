export function SkeletonLine({ width = '100%' }: { width?: string }) { return <div className="v2-skel animate-pulse" style={{ width }} />; }
export function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  const widths = ['100%', '92%', '68%', '80%', '55%'];
  return <div className="space-y-2">{Array.from({ length: lines }).map((_, i) => <SkeletonLine key={i} width={widths[i % widths.length]} />)}</div>;
}
