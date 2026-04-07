/**
 * Tests for a11y.js
 * Run: npm run test
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  injectSkipLink,
  createFocusTrap,
  announce,
  onArrowKeyNav,
  _reset,
} from './a11y.js';

beforeEach(() => {
  _reset();
  document.body.innerHTML = '';
});

describe('injectSkipLink', () => {
  it('adds a skip link as the first child of body when a target exists', () => {
    document.body.innerHTML = '<main>x</main>';
    const link = injectSkipLink();
    expect(link).not.toBeNull();
    expect(document.body.firstChild).toBe(link);
    expect(link?.getAttribute('href')).toMatch(/^#/);
  });

  it('returns null when no target is present', () => {
    expect(injectSkipLink()).toBeNull();
  });

  it('is idempotent', () => {
    document.body.innerHTML = '<main>x</main>';
    injectSkipLink();
    injectSkipLink();
    expect(document.querySelectorAll('.pi-skip-link').length).toBe(1);
  });

  it('makes the target focusable', () => {
    document.body.innerHTML = '<main>x</main>';
    injectSkipLink();
    const main = document.querySelector('main');
    expect(main?.getAttribute('tabindex')).toBe('-1');
    expect(main?.id).toBeTruthy();
  });
});

describe('createFocusTrap', () => {
  it('returns a release function', () => {
    document.body.innerHTML = '<div id="m"><button>a</button><button>b</button></div>';
    const release = createFocusTrap(document.getElementById('m'));
    expect(typeof release).toBe('function');
    release();
  });

  it('moves focus into the container', () => {
    document.body.innerHTML = '<div id="m"><button id="a">a</button><button>b</button></div>';
    createFocusTrap(document.getElementById('m'));
    expect(document.activeElement?.id).toBe('a');
  });

  it('release restores focus to the previously focused element', () => {
    document.body.innerHTML = '<button id="prev">prev</button><div id="m"><button>a</button></div>';
    const prev = document.getElementById('prev');
    prev?.focus();
    const release = createFocusTrap(document.getElementById('m'));
    release();
    expect(document.activeElement).toBe(prev);
  });

  it('Escape calls onEscape', () => {
    document.body.innerHTML = '<div id="m"><button>a</button></div>';
    let escaped = false;
    createFocusTrap(document.getElementById('m'), { onEscape: () => (escaped = true) });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(escaped).toBe(true);
  });
});

describe('announce', () => {
  it('creates an aria-live region and writes to it', async () => {
    announce('hello');
    const region = document.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    // Wait for requestAnimationFrame
    await new Promise((r) => setTimeout(r, 20));
    expect(region?.textContent).toBe('hello');
  });

  it('uses an assertive region when assertive=true', () => {
    announce('alert', { assertive: true });
    expect(document.querySelector('[aria-live="assertive"]')).not.toBeNull();
  });

  it('ignores empty messages', () => {
    announce('');
    expect(document.querySelector('[aria-live]')).toBeNull();
  });
});

describe('onArrowKeyNav', () => {
  it('moves focus down on ArrowDown', () => {
    document.body.innerHTML = `
      <div id="list">
        <button role="option" tabindex="0" id="a">a</button>
        <button role="option" tabindex="0" id="b">b</button>
        <button role="option" tabindex="0" id="c">c</button>
      </div>`;
    const list = document.getElementById('list');
    onArrowKeyNav(list);
    document.getElementById('a')?.focus();
    list?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement?.id).toBe('b');
  });

  it('wraps around on End → Home', () => {
    document.body.innerHTML = `
      <div id="list">
        <button role="option" tabindex="0" id="a">a</button>
        <button role="option" tabindex="0" id="b">b</button>
      </div>`;
    const list = document.getElementById('list');
    onArrowKeyNav(list);
    document.getElementById('a')?.focus();
    list?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement?.id).toBe('b');
    list?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement?.id).toBe('a');
  });
});
