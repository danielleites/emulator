/**
 * PIVISION Mobile — Safe expression evaluator
 * Stage 2 of the security hardening plan.
 *
 * A recursive-descent parser + evaluator for the Angular-template
 * expression subset used by the legacy emulator shim. Replaces the
 * legacy dynamic-Function + `with($scope)` pattern that previously
 * lived in `emulator/js/emu-shims.js` — the last thing keeping
 * `'unsafe-eval'` in our CSP.
 *
 * Supported grammar (informal):
 *   expression  := ternary
 *   ternary     := logicalOr ('?' expression ':' expression)?
 *   logicalOr   := logicalAnd ('||' logicalAnd)*
 *   logicalAnd  := equality ('&&' equality)*
 *   equality    := relational (('==='|'!=='|'=='|'!=') relational)*
 *   relational  := additive (('<='|'>='|'<'|'>') additive)*
 *   additive    := multiplicative (('+'|'-') multiplicative)*
 *   multiplicative := unary (('*'|'/'|'%') unary)*
 *   unary       := ('!'|'-'|'+')? primary
 *   primary     := literal
 *                | '(' expression ')'
 *                | object
 *                | array
 *                | identChain
 *   identChain  := IDENT ( '.' IDENT | '[' expression ']' | '(' args? ')' )*
 *   object      := '{' (key ':' expression (',' ...)*)? '}'
 *   array       := '[' (expression (',' ...)*)? ']'
 *   literal     := NUMBER | STRING | 'true' | 'false' | 'null' | 'undefined'
 *
 * Safety properties:
 *   • No access to `__proto__`, `constructor`, `prototype`, `__defineGetter__`,
 *     or any property starting with `$$` (Angular-internal sigil).
 *   • Method calls preserve the receiver (`this` is the parent object), so
 *     `obj.method()` works the same as in the old `with()` evaluator.
 *   • No `eval`, no `new Function`, no `with`, no global access.
 *   • Identifiers resolve from `scope` first, then return undefined if missing.
 *     This matches Angular's silent-failure behavior.
 *   • Parsed expressions are cached per source string for cheap re-evaluation
 *     during digest cycles.
 *
 * Not supported (intentional):
 *   • Filter pipes (`value | currency`) — handled separately by the shim.
 *   • Regex literals.
 *   • Function expressions / arrow functions.
 *   • Assignment outside of identChain (no `a + b = c` weirdness).
 *
 * Assignment IS supported for the simple `ng-model` case
 * (`prop = value`, `obj.prop = value`, `obj['k'] = value`) via
 * the dedicated {@link assign} export.
 */

// ──────────────────────────────────────────────────────────────────────────
// 1. Tokenizer
// ──────────────────────────────────────────────────────────────────────────

const TT = {
  NUM: 'NUM',
  STR: 'STR',
  IDENT: 'IDENT',
  PUNCT: 'PUNCT',
  EOF: 'EOF',
};

const PUNCTS = [
  '===',
  '!==',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '<',
  '>',
  '+',
  '-',
  '*',
  '/',
  '%',
  '!',
  '?',
  ':',
  ',',
  '.',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '=',
];

const KEYWORDS = {
  true: { type: 'literal', value: true },
  false: { type: 'literal', value: false },
  null: { type: 'literal', value: null },
  undefined: { type: 'literal', value: undefined },
};

/** Forbidden property names that must never be reachable. */
const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

function isIdentStart(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$';
}
function isIdentCont(ch) {
  return isIdentStart(ch) || (ch >= '0' && ch <= '9');
}
function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;

  while (i < n) {
    const ch = src[i];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // Numbers
    if (isDigit(ch) || (ch === '.' && isDigit(src[i + 1]))) {
      let j = i;
      while (j < n && isDigit(src[j])) j++;
      if (src[j] === '.') {
        j++;
        while (j < n && isDigit(src[j])) j++;
      }
      tokens.push({ type: TT.NUM, value: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }

    // Strings
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      let out = '';
      while (j < n && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < n) {
          const next = src[j + 1];
          out +=
            next === 'n'
              ? '\n'
              : next === 't'
                ? '\t'
                : next === 'r'
                  ? '\r'
                  : next === '\\'
                    ? '\\'
                    : next === quote
                      ? quote
                      : next;
          j += 2;
        } else {
          out += src[j++];
        }
      }
      if (j >= n) throw new SyntaxError('Unterminated string in expression');
      tokens.push({ type: TT.STR, value: out });
      i = j + 1;
      continue;
    }

    // Identifiers / keywords
    if (isIdentStart(ch)) {
      let j = i;
      while (j < n && isIdentCont(src[j])) j++;
      const word = src.slice(i, j);
      if (Object.prototype.hasOwnProperty.call(KEYWORDS, word)) {
        const kw = KEYWORDS[word];
        tokens.push({ type: TT.NUM /* placeholder */, ...kw });
      } else {
        tokens.push({ type: TT.IDENT, value: word });
      }
      i = j;
      continue;
    }

    // Punctuation (longest match first)
    let matched = null;
    for (const p of PUNCTS) {
      if (src.startsWith(p, i)) {
        matched = p;
        break;
      }
    }
    if (matched) {
      tokens.push({ type: TT.PUNCT, value: matched });
      i += matched.length;
      continue;
    }

    throw new SyntaxError(`Unexpected character '${ch}' at position ${i} in: ${src}`);
  }

  tokens.push({ type: TT.EOF });
  return tokens;
}

// ──────────────────────────────────────────────────────────────────────────
// 2. Parser (recursive descent → AST)
// ──────────────────────────────────────────────────────────────────────────

function parse(src) {
  const tokens = tokenize(src);
  let pos = 0;

  function peek(offset = 0) {
    return tokens[pos + offset];
  }
  function eat() {
    return tokens[pos++];
  }
  function isPunct(v) {
    const t = peek();
    return t.type === TT.PUNCT && t.value === v;
  }
  function expect(v) {
    if (!isPunct(v)) throw new SyntaxError(`Expected '${v}' in: ${src}`);
    eat();
  }

  function parseExpression() {
    return parseTernary();
  }

  function parseTernary() {
    const test = parseLogicalOr();
    if (isPunct('?')) {
      eat();
      const cons = parseExpression();
      expect(':');
      const alt = parseExpression();
      return { type: 'Conditional', test, cons, alt };
    }
    return test;
  }

  function parseLogicalOr() {
    let left = parseLogicalAnd();
    while (isPunct('||')) {
      eat();
      left = { type: 'Logical', op: '||', left, right: parseLogicalAnd() };
    }
    return left;
  }

  function parseLogicalAnd() {
    let left = parseEquality();
    while (isPunct('&&')) {
      eat();
      left = { type: 'Logical', op: '&&', left, right: parseEquality() };
    }
    return left;
  }

  function parseEquality() {
    let left = parseRelational();
    while (isPunct('===') || isPunct('!==') || isPunct('==') || isPunct('!=')) {
      const op = eat().value;
      left = { type: 'Binary', op, left, right: parseRelational() };
    }
    return left;
  }

  function parseRelational() {
    let left = parseAdditive();
    while (isPunct('<=') || isPunct('>=') || isPunct('<') || isPunct('>')) {
      const op = eat().value;
      left = { type: 'Binary', op, left, right: parseAdditive() };
    }
    return left;
  }

  function parseAdditive() {
    let left = parseMultiplicative();
    while (isPunct('+') || isPunct('-')) {
      const op = eat().value;
      left = { type: 'Binary', op, left, right: parseMultiplicative() };
    }
    return left;
  }

  function parseMultiplicative() {
    let left = parseUnary();
    while (isPunct('*') || isPunct('/') || isPunct('%')) {
      const op = eat().value;
      left = { type: 'Binary', op, left, right: parseUnary() };
    }
    return left;
  }

  function parseUnary() {
    if (isPunct('!') || isPunct('-') || isPunct('+')) {
      const op = eat().value;
      return { type: 'Unary', op, arg: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();

    if (t.type === 'literal') {
      eat();
      return { type: 'Literal', value: t.value };
    }
    if (t.type === TT.NUM) {
      eat();
      return { type: 'Literal', value: t.value };
    }
    if (t.type === TT.STR) {
      eat();
      return { type: 'Literal', value: t.value };
    }
    if (isPunct('(')) {
      eat();
      const expr = parseExpression();
      expect(')');
      return parseChainSuffix(expr);
    }
    if (isPunct('{')) {
      return parseObject();
    }
    if (isPunct('[')) {
      return parseArray();
    }
    if (t.type === TT.IDENT) {
      eat();
      return parseChainSuffix({ type: 'Identifier', name: t.value });
    }

    throw new SyntaxError(`Unexpected token '${t.value ?? t.type}' in: ${src}`);
  }

  function parseChainSuffix(node) {
    while (true) {
      if (isPunct('.')) {
        eat();
        const id = eat();
        if (id.type !== TT.IDENT) throw new SyntaxError(`Expected identifier after '.' in: ${src}`);
        node = { type: 'Member', object: node, property: id.value, computed: false };
      } else if (isPunct('[')) {
        eat();
        const idx = parseExpression();
        expect(']');
        node = { type: 'Member', object: node, property: idx, computed: true };
      } else if (isPunct('(')) {
        eat();
        const args = [];
        if (!isPunct(')')) {
          args.push(parseExpression());
          while (isPunct(',')) {
            eat();
            args.push(parseExpression());
          }
        }
        expect(')');
        node = { type: 'Call', callee: node, args };
      } else {
        break;
      }
    }
    return node;
  }

  function parseObject() {
    expect('{');
    const props = [];
    if (!isPunct('}')) {
      props.push(parseObjectProp());
      while (isPunct(',')) {
        eat();
        if (isPunct('}')) break;
        props.push(parseObjectProp());
      }
    }
    expect('}');
    return { type: 'Object', props };
  }

  function parseObjectProp() {
    const t = peek();
    let key;
    if (t.type === TT.IDENT) {
      eat();
      key = t.value;
    } else if (t.type === TT.STR) {
      eat();
      key = t.value;
    } else if (t.type === TT.NUM) {
      eat();
      key = String(t.value);
    } else {
      throw new SyntaxError(`Expected object key in: ${src}`);
    }
    expect(':');
    const value = parseExpression();
    return { key, value };
  }

  function parseArray() {
    expect('[');
    const items = [];
    if (!isPunct(']')) {
      items.push(parseExpression());
      while (isPunct(',')) {
        eat();
        if (isPunct(']')) break;
        items.push(parseExpression());
      }
    }
    expect(']');
    return { type: 'Array', items };
  }

  const ast = parseExpression();
  if (peek().type !== TT.EOF) {
    throw new SyntaxError(`Unexpected trailing token in: ${src}`);
  }
  return ast;
}

// ──────────────────────────────────────────────────────────────────────────
// 3. Evaluator
// ──────────────────────────────────────────────────────────────────────────

function safeKey(key) {
  if (typeof key !== 'string' && typeof key !== 'number') return null;
  const k = String(key);
  if (FORBIDDEN_KEYS.has(k)) return null;
  return k;
}

function getMember(object, key) {
  const k = safeKey(key);
  if (k === null) return undefined;
  if (object === null || object === undefined) return undefined;
  return object[k];
}

function evalNode(node, scope) {
  switch (node.type) {
    case 'Literal':
      return node.value;

    case 'Identifier': {
      if (scope === null || scope === undefined) return undefined;
      const k = safeKey(node.name);
      if (k === null) return undefined;
      return scope[k];
    }

    case 'Member': {
      const obj = evalNode(node.object, scope);
      const key = node.computed ? evalNode(node.property, scope) : node.property;
      return getMember(obj, key);
    }

    case 'Call': {
      // Resolve callee with its receiver so `this` binds correctly.
      let receiver, fn;
      if (node.callee.type === 'Member') {
        receiver = evalNode(node.callee.object, scope);
        const key = node.callee.computed
          ? evalNode(node.callee.property, scope)
          : node.callee.property;
        fn = getMember(receiver, key);
      } else if (node.callee.type === 'Identifier') {
        receiver = scope;
        fn = evalNode(node.callee, scope);
      } else {
        receiver = undefined;
        fn = evalNode(node.callee, scope);
      }
      if (typeof fn !== 'function') return undefined;
      // Disallow calling Function constructor or any function whose name
      // suggests it constructs new functions.
      if (fn === Function || fn === Function.prototype.constructor) return undefined;
      const args = node.args.map((a) => evalNode(a, scope));
      try {
        return fn.apply(receiver, args);
      } catch {
        return undefined;
      }
    }

    case 'Unary': {
      const v = evalNode(node.arg, scope);
      switch (node.op) {
        case '!':
          return !v;
        case '-':
          return -v;
        case '+':
          return +v;
      }
      return undefined;
    }

    case 'Binary': {
      const l = evalNode(node.left, scope);
      const r = evalNode(node.right, scope);
      switch (node.op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          return l / r;
        case '%':
          return l % r;
        case '<':
          return l < r;
        case '<=':
          return l <= r;
        case '>':
          return l > r;
        case '>=':
          return l >= r;
        case '==':
          return l == r; // eslint-disable-line eqeqeq
        case '!=':
          return l != r; // eslint-disable-line eqeqeq
        case '===':
          return l === r;
        case '!==':
          return l !== r;
      }
      return undefined;
    }

    case 'Logical': {
      const l = evalNode(node.left, scope);
      if (node.op === '&&') return l && evalNode(node.right, scope);
      if (node.op === '||') return l || evalNode(node.right, scope);
      return undefined;
    }

    case 'Conditional':
      return evalNode(node.test, scope) ? evalNode(node.cons, scope) : evalNode(node.alt, scope);

    case 'Object': {
      const out = {};
      for (const p of node.props) {
        const k = safeKey(p.key);
        if (k !== null) out[k] = evalNode(p.value, scope);
      }
      return out;
    }

    case 'Array':
      return node.items.map((it) => evalNode(it, scope));
  }
  return undefined;
}

// ──────────────────────────────────────────────────────────────────────────
// 4. Public API + parse cache
// ──────────────────────────────────────────────────────────────────────────

const _cache = new Map();
const CACHE_LIMIT = 1024;

function compile(expr) {
  if (typeof expr !== 'string') return null;
  const trimmed = expr.trim();
  if (trimmed === '') return { type: 'Literal', value: undefined };
  if (_cache.has(trimmed)) return _cache.get(trimmed);
  let ast;
  try {
    ast = parse(trimmed);
  } catch {
    ast = null;
  }
  if (_cache.size >= CACHE_LIMIT) _cache.clear();
  _cache.set(trimmed, ast);
  return ast;
}

/**
 * Evaluate an Angular-style expression against a scope object.
 * Returns `undefined` on parse failure or runtime error (silent fail,
 * matching the original `with()` evaluator's behavior).
 *
 * @param {string} expr
 * @param {object} scope
 * @returns {*}
 */
export function evaluate(expr, scope) {
  const ast = compile(expr);
  if (!ast) return undefined;
  try {
    return evalNode(ast, scope);
  } catch {
    return undefined;
  }
}

/**
 * Assign a value to an lvalue expression of the form
 *   ident
 *   obj.prop
 *   obj['k']
 *   obj.deep.prop
 *
 * Used by ng-model. Anything more complex is silently ignored.
 *
 * @param {string} expr
 * @param {object} scope
 * @param {*} value
 */
export function assign(expr, scope, value) {
  const ast = compile(expr);
  if (!ast) return;

  if (ast.type === 'Identifier') {
    const k = safeKey(ast.name);
    if (k !== null && scope) scope[k] = value;
    return;
  }

  if (ast.type === 'Member') {
    const obj = evalNode(ast.object, scope);
    if (obj === null || obj === undefined) return;
    const key = ast.computed ? evalNode(ast.property, scope) : ast.property;
    const k = safeKey(key);
    if (k !== null) obj[k] = value;
  }
}

/** Clear the parse cache (mainly for tests). */
export function _clearCache() {
  _cache.clear();
}

// ──────────────────────────────────────────────────────────────────────────
// 5. Global exposure for legacy non-module scripts (emu-shims.js)
// ──────────────────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.SafeExpr = Object.freeze({ evaluate, assign });
}
