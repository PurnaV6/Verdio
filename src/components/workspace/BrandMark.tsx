export function BrandMark({ compact = false }: { compact?: boolean }) {
  return <div className={`brand-mark ${compact ? 'h-9 w-9' : 'h-12 w-12'}`} aria-label="Verd.io">
    <svg viewBox="0 0 48 48" role="img" aria-hidden="true">
      <path className="brand-path" d="M10.5 13.5 22.8 34.5 36.5 10.5" />
      <path className="brand-decision" d="M22.8 34.5V24.2" />
      <circle className="brand-node" cx="10.5" cy="13.5" r="2.4" />
      <circle className="brand-node" cx="36.5" cy="10.5" r="2.4" />
      <circle className="brand-focus" cx="22.8" cy="34.5" r="3.1" />
    </svg>
  </div>;
}
