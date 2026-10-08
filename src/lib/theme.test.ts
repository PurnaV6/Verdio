import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAccent } from './theme';

// The suite runs in the node environment, so stand in for document.documentElement.
function fakeRoot() {
  const attrs = new Map<string, string>();
  const root = {
    setAttribute: (k: string, v: string) => { attrs.set(k, v); },
    removeAttribute: (k: string) => { attrs.delete(k); },
    getAttribute: (k: string) => attrs.get(k) ?? null,
  };
  vi.stubGlobal('document', { documentElement: root });
  return root;
}

describe('setAccent', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('sets data-accent for green and violet', () => {
    const root = fakeRoot();
    setAccent('green');
    expect(root.getAttribute('data-accent')).toBe('green');
    setAccent('violet');
    expect(root.getAttribute('data-accent')).toBe('violet');
  });

  it('removes data-accent for the default blue', () => {
    const root = fakeRoot();
    setAccent('violet');
    setAccent('blue');
    expect(root.getAttribute('data-accent')).toBeNull();
  });
});
