/**
 * Tests for theme.js
 * Run: npm run test
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  initTheme,
  setTheme,
  getTheme,
  cycleTheme,
  onThemeChange,
  _reset,
} from './theme.js';

beforeEach(() => {
  _reset();
  document.documentElement.removeAttribute('data-theme');
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe('initTheme', () => {
  it('applies the default dark theme on first init', () => {
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(getTheme()).toBe('dark');
  });

  it('honors a previously stored theme', () => {
    localStorage.setItem('pivision.theme', 'light');
    initTheme();
    expect(getTheme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('ignores invalid stored values', () => {
    localStorage.setItem('pivision.theme', 'rainbow');
    initTheme();
    expect(getTheme()).toBe('dark');
  });

  it('is idempotent', () => {
    initTheme();
    setTheme('light');
    initTheme(); // second call must not reset
    expect(getTheme()).toBe('light');
  });
});

describe('setTheme', () => {
  it('persists to localStorage', () => {
    initTheme();
    setTheme('light');
    expect(localStorage.getItem('pivision.theme')).toBe('light');
  });

  it('rejects invalid themes', () => {
    initTheme();
    setTheme('neon');
    expect(getTheme()).toBe('dark');
  });

  it('notifies subscribers', () => {
    initTheme();
    let received = null;
    onThemeChange((t) => {
      received = t;
    });
    setTheme('light');
    expect(received).toBe('light');
  });

  it('unsubscribe stops notifications', () => {
    initTheme();
    let count = 0;
    const unsub = onThemeChange(() => count++);
    setTheme('light');
    unsub();
    setTheme('auto');
    expect(count).toBe(1);
  });
});

describe('cycleTheme', () => {
  it('rotates dark → light → auto → dark', () => {
    initTheme(); // dark
    expect(cycleTheme()).toBe('light');
    expect(cycleTheme()).toBe('auto');
    expect(cycleTheme()).toBe('dark');
  });
});
