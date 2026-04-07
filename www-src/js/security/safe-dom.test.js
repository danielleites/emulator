/**
 * Tests for safe-dom.js fallback sanitizer.
 * Run: npm run test
 *
 * These exercise the fallback path explicitly (DOMPurify is not loaded
 * in the test environment), so they verify the worst-case sanitizer.
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitize, setSafeHTML, escape } from './safe-dom.js';

describe('safe-dom fallback sanitizer', () => {
  it('strips <script> tags', () => {
    const html = '<p>hi</p><script>alert(1)</script>';
    expect(sanitize(html)).not.toContain('script');
  });

  it('strips event handler attributes', () => {
    const html = '<img src="x" onerror="alert(1)">';
    const out = sanitize(html);
    expect(out).not.toContain('onerror');
  });

  it('strips javascript: URLs', () => {
    const html = '<a href="javascript:alert(1)">click</a>';
    const out = sanitize(html);
    expect(out).not.toContain('javascript:');
  });

  it('keeps safe http(s) URLs', () => {
    const html = '<a href="https://example.com">ok</a>';
    expect(sanitize(html)).toContain('https://example.com');
  });

  it('keeps relative URLs', () => {
    const html = '<a href="./page.html">ok</a><img src="img.png">';
    const out = sanitize(html);
    expect(out).toContain('./page.html');
    expect(out).toContain('img.png');
  });

  it('strips <iframe>', () => {
    expect(sanitize('<iframe src="evil"></iframe>')).not.toContain('iframe');
  });

  it('strips CSS expression() in style attr', () => {
    const out = sanitize('<div style="width:expression(alert(1))">x</div>');
    expect(out).not.toContain('expression');
  });

  it('preserves benign markup', () => {
    const html = '<p class="x"><strong>hello</strong> <em>world</em></p>';
    expect(sanitize(html)).toBe(html);
  });

  it('setSafeHTML replaces element content', () => {
    const el = document.createElement('div');
    setSafeHTML(el, '<span>ok</span><script>alert(1)</script>');
    expect(el.querySelector('span')?.textContent).toBe('ok');
    expect(el.querySelector('script')).toBeNull();
  });

  it('setSafeHTML is a no-op for null element', () => {
    expect(() => setSafeHTML(null, '<p>x</p>')).not.toThrow();
  });
});

describe('safe-dom escape', () => {
  it('escapes html-special characters', () => {
    expect(escape('<a href="x">&\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;'
    );
  });
  it('handles null/undefined', () => {
    expect(escape(null)).toBe('');
    expect(escape(undefined)).toBe('');
  });
});
