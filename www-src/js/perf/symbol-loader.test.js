/**
 * Tests for symbol-loader.js
 * Run: npm run test
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadScript, loadCSS, prefetch, _reset } from './symbol-loader.js';

beforeEach(() => {
  _reset();
  document.head.innerHTML = '';
});

describe('symbol-loader: loadScript dedup', () => {
  it('returns the same promise for repeated calls', () => {
    const p1 = loadScript('a.js');
    const p2 = loadScript('a.js');
    expect(p1).toBe(p2);
  });

  it('only adds one <script> tag for repeated calls', () => {
    loadScript('b.js');
    loadScript('b.js');
    loadScript('b.js');
    expect(document.querySelectorAll('script[src="b.js"]').length).toBe(1);
  });

  it('detects pre-existing <script> tags from legacy injectors', () => {
    const tag = document.createElement('script');
    tag.src = 'legacy.js';
    document.head.appendChild(tag);
    const p = loadScript('legacy.js');
    return expect(p).resolves.toBeUndefined();
  });
});

describe('symbol-loader: loadCSS dedup', () => {
  it('returns the same promise for repeated calls', () => {
    const p1 = loadCSS('a.css');
    const p2 = loadCSS('a.css');
    expect(p1).toBe(p2);
  });

  it('only adds one <link> tag for repeated calls', () => {
    loadCSS('b.css');
    loadCSS('b.css');
    expect(document.querySelectorAll('link[href="b.css"]').length).toBe(1);
  });
});

describe('symbol-loader: prefetch', () => {
  it('adds a <link rel=prefetch> tag', () => {
    prefetch('foo.js');
    const link = document.querySelector('link[rel="prefetch"][href="foo.js"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('as')).toBe('script');
  });

  it('sets as=style for .css urls', () => {
    prefetch('foo.css');
    const link = document.querySelector('link[rel="prefetch"][href="foo.css"]');
    expect(link?.getAttribute('as')).toBe('style');
  });

  it('does not duplicate prefetch tags', () => {
    prefetch('foo.js');
    prefetch('foo.js');
    expect(document.querySelectorAll('link[rel="prefetch"][href="foo.js"]').length).toBe(1);
  });

  it('skips prefetch for already-loaded scripts', () => {
    loadScript('loaded.js');
    prefetch('loaded.js');
    expect(document.querySelectorAll('link[rel="prefetch"][href="loaded.js"]').length).toBe(0);
  });
});
