// Accent switch. The accent trio lives in src/app/index.css (--vc-accent, --vc-accent-2, --vc-accent-tint):
// blue is the default on :root, and html[data-accent="green" | "violet"] overrides only those three tokens.
export type AccentName = 'blue' | 'green' | 'violet';

export function setAccent(name: AccentName): void {
  const root = document.documentElement;
  if (name === 'green' || name === 'violet') root.setAttribute('data-accent', name);
  else root.removeAttribute('data-accent');
}
