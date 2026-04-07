/**
 * Tests for safe-expr.js — the safe Angular-template expression evaluator.
 * Run: npm run test
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { evaluate, assign, _clearCache } from './safe-expr.js';

beforeEach(() => _clearCache());

describe('literals', () => {
  it.each([
    ['1', 1],
    ['1.5', 1.5],
    ['.5', 0.5],
    ['"hi"', 'hi'],
    ["'hi'", 'hi'],
    ['true', true],
    ['false', false],
    ['null', null],
    ['undefined', undefined],
    ['"a\\nb"', 'a\nb'],
    ['"esc \\""', 'esc "'],
  ])('%s → %p', (src, expected) => {
    expect(evaluate(src, {})).toBe(expected);
  });
});

describe('identifiers and member access', () => {
  const scope = {
    user: { name: 'Alice', age: 30, profile: { city: 'TLV' } },
    items: [{ id: 1 }, { id: 2 }],
    count: 5,
    name: 'Bob',
  };

  it('reads top-level identifier', () => {
    expect(evaluate('count', scope)).toBe(5);
    expect(evaluate('name', scope)).toBe('Bob');
  });
  it('reads nested member', () => {
    expect(evaluate('user.name', scope)).toBe('Alice');
    expect(evaluate('user.profile.city', scope)).toBe('TLV');
  });
  it('reads computed member', () => {
    expect(evaluate('items[0].id', scope)).toBe(1);
    expect(evaluate('items[1].id', scope)).toBe(2);
    expect(evaluate('user["name"]', scope)).toBe('Alice');
  });
  it('returns undefined for missing identifier', () => {
    expect(evaluate('missing', scope)).toBe(undefined);
    expect(evaluate('user.missing', scope)).toBe(undefined);
    expect(evaluate('missing.deeper', scope)).toBe(undefined);
  });
});

describe('arithmetic', () => {
  const s = { a: 10, b: 3 };
  it.each([
    ['a + b', 13],
    ['a - b', 7],
    ['a * b', 30],
    ['a / b', 10 / 3],
    ['a % b', 1],
    ['a + b * 2', 16],
    ['(a + b) * 2', 26],
    ['-a', -10],
    ['+b', 3],
  ])('%s → %p', (src, expected) => {
    expect(evaluate(src, s)).toBe(expected);
  });
});

describe('string concat', () => {
  it('concatenates strings', () => {
    expect(evaluate("'Hello, ' + name + '!'", { name: 'World' })).toBe('Hello, World!');
  });
});

describe('comparisons and logical', () => {
  const s = { a: 5, b: 10, on: true, off: false };
  it.each([
    ['a < b', true],
    ['a > b', false],
    ['a <= 5', true],
    ['a >= 5', true],
    ['a == 5', true],
    ['a === 5', true],
    ['a !== "5"', true],
    ['a == "5"', true],
    ['on && off', false],
    ['on || off', true],
    ['!on', false],
    ['!off', true],
    ['on && a > 0', true],
  ])('%s → %p', (src, expected) => {
    expect(evaluate(src, s)).toBe(expected);
  });
});

describe('ternary', () => {
  it('selects branches', () => {
    expect(evaluate('a > 0 ? "pos" : "neg"', { a: 5 })).toBe('pos');
    expect(evaluate('a > 0 ? "pos" : "neg"', { a: -1 })).toBe('neg');
  });
  it('nests ternaries', () => {
    expect(evaluate('a > 0 ? "pos" : a < 0 ? "neg" : "zero"', { a: 0 })).toBe('zero');
  });
});

describe('object and array literals', () => {
  it('builds an object literal (ng-class style)', () => {
    expect(evaluate('{active: isActive, hidden: !show}', { isActive: true, show: false })).toEqual({
      active: true,
      hidden: true,
    });
  });
  it('quoted keys', () => {
    expect(evaluate('{"a-b": 1, c: 2}', {})).toEqual({ 'a-b': 1, c: 2 });
  });
  it('array literal', () => {
    expect(evaluate('[1, 2, a]', { a: 3 })).toEqual([1, 2, 3]);
  });
});

describe('method calls', () => {
  it('calls a method on the scope', () => {
    expect(evaluate('greet("World")', { greet: (n) => `Hello ${n}` })).toBe('Hello World');
  });
  it('calls a method on a member with correct `this` binding', () => {
    const scope = {
      user: {
        first: 'Alice',
        last: 'Smith',
        full() {
          return this.first + ' ' + this.last;
        },
      },
    };
    expect(evaluate('user.full()', scope)).toBe('Alice Smith');
  });
  it('chains method calls', () => {
    expect(evaluate('s.toUpperCase()', { s: 'hi' })).toBe('HI');
  });
  it('passes arguments', () => {
    expect(evaluate('add(a, b * 2)', { a: 1, b: 5, add: (x, y) => x + y })).toBe(11);
  });
  it('returns undefined for non-functions', () => {
    expect(evaluate('a()', { a: 5 })).toBe(undefined);
  });
  it('silently swallows callee throws', () => {
    expect(
      evaluate('boom()', {
        boom: () => {
          throw new Error('x');
        },
      })
    ).toBe(undefined);
  });
});

describe('security: forbidden access', () => {
  it('blocks __proto__', () => {
    expect(evaluate('a.__proto__', { a: {} })).toBe(undefined);
  });
  it('blocks constructor', () => {
    expect(evaluate('a.constructor', { a: {} })).toBe(undefined);
  });
  it('blocks computed __proto__', () => {
    expect(evaluate('a["__proto__"]', { a: {} })).toBe(undefined);
  });
  it('blocks calling Function constructor through member access', () => {
    // even if we somehow surfaced it, calling it must be a no-op
    const fakeScope = { F: Function };
    expect(evaluate('F("return 1")()', fakeScope)).toBe(undefined);
  });
  it('cannot escape via prototype chain', () => {
    expect(evaluate('a.constructor.constructor("return process")', { a: {} })).toBe(undefined);
  });
});

describe('parse failures (silent)', () => {
  it.each([
    'a +', // dangling op
    '1 + ', // dangling op
    'foo(', // unclosed paren
    '{a:', // unclosed object
    '[1, 2', // unclosed array
    'a..b', // double dot
    '"unterminated', // unterminated string
  ])('%s → undefined', (src) => {
    expect(evaluate(src, {})).toBe(undefined);
  });
});

describe('edge cases', () => {
  it('empty string → undefined', () => {
    expect(evaluate('', {})).toBe(undefined);
  });
  it('non-string expr → undefined', () => {
    expect(evaluate(null, {})).toBe(undefined);
    expect(evaluate(123, {})).toBe(undefined);
  });
  it('falsy scope', () => {
    expect(evaluate('a', null)).toBe(undefined);
    expect(evaluate('a', undefined)).toBe(undefined);
  });
});

describe('assign (ng-model)', () => {
  it('assigns to top-level identifier', () => {
    const s = { name: 'old' };
    assign('name', s, 'new');
    expect(s.name).toBe('new');
  });
  it('assigns to nested member', () => {
    const s = { user: { name: 'old' } };
    assign('user.name', s, 'new');
    expect(s.user.name).toBe('new');
  });
  it('assigns to computed member', () => {
    const s = { obj: { foo: 1 } };
    assign('obj["foo"]', s, 2);
    expect(s.obj.foo).toBe(2);
  });
  it('refuses __proto__', () => {
    const s = {};
    assign('__proto__', s, { polluted: true });
    expect({}.polluted).toBe(undefined);
  });
  it('refuses constructor', () => {
    const s = { a: {} };
    assign('a.constructor', s, 'evil');
    expect({}.constructor).toBe(Object);
  });
});

describe('caching', () => {
  it('returns the same value on repeated calls', () => {
    const s = { a: 1 };
    expect(evaluate('a + 1', s)).toBe(2);
    s.a = 5;
    expect(evaluate('a + 1', s)).toBe(6);
  });
});

describe('real-world Angular patterns', () => {
  const s = {
    items: [{ name: 'a' }, { name: 'b' }],
    user: { isAdmin: true, role: 'admin' },
    show: true,
    formatPrice: (n) => '₪' + n.toFixed(2),
    price: 99.5,
  };

  it('ng-if expression', () => {
    expect(evaluate('user.isAdmin && show', s)).toBe(true);
  });
  it('ng-class expression', () => {
    expect(evaluate("{active: show, 'role-admin': user.role === 'admin'}", s)).toEqual({
      active: true,
      'role-admin': true,
    });
  });
  it('ng-bind expression', () => {
    expect(evaluate('formatPrice(price)', s)).toBe('₪99.50');
  });
  it('ng-style expression', () => {
    expect(evaluate('{color: show ? "green" : "red"}', s)).toEqual({ color: 'green' });
  });
  it('ng-repeat collection', () => {
    expect(evaluate('items', s)).toBe(s.items);
  });
});
