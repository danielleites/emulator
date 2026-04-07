/**
 * Unit tests for emu-packs.js — Stage 8.1 scaffold.
 *
 * Covers the pure-logic surface that doesn't need a real emulator:
 *   - Manifest validation
 *   - Pack registration + name collision handling
 *   - getSymbols() shape
 *   - getSymbol() lookup
 *   - Idempotent init() behavior
 *
 * The file uses `vm` to load emu-packs.js as a classic script into
 * a jsdom window, mirroring how the emulator loads it in
 * production. This keeps the tests black-box and insulated from
 * `require` vs `import` module-system concerns.
 */

// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EMU_PACKS_PATH = join(__dirname, 'emu-packs.js');

/**
 * Load emu-packs.js fresh into the current jsdom window. Each
 * test gets an isolated copy by calling _reset() after the
 * initial load.
 */
function loadEmuPacks() {
  const src = readFileSync(EMU_PACKS_PATH, 'utf-8');
  // eslint-disable-next-line no-eval
  (0, eval)(src);
  /** @type {any} */
  const api = /** @type {any} */ (globalThis).PIV_PACKS;
  api._reset();
  return api;
}

describe('emu-packs: validateManifest', () => {
  let pkgs;
  beforeEach(() => {
    pkgs = loadEmuPacks();
  });

  it('accepts a minimal valid manifest', () => {
    const err = pkgs.validateManifest({
      id: 'my-pack',
      displayName: 'My Pack',
      version: '1.0.0',
      symbols: [
        {
          name: 'hello',
          category: 'demo',
          dataShape: 'Value',
          files: { js: 'symbols/sym-hello.js' },
        },
      ],
    });
    expect(err).toBeNull();
  });

  it('rejects non-object input', () => {
    expect(pkgs.validateManifest(null)).toMatch(/not an object/);
    expect(pkgs.validateManifest('string')).toMatch(/not an object/);
    expect(pkgs.validateManifest(42)).toMatch(/not an object/);
  });

  it('rejects missing id', () => {
    expect(
      pkgs.validateManifest({ displayName: 'x', version: '1.0.0', symbols: [] })
    ).toMatch(/missing string `id`/);
  });

  it('rejects non-kebab-case id', () => {
    expect(
      pkgs.validateManifest({
        id: 'MyPack',
        displayName: 'x',
        version: '1.0.0',
        symbols: [],
      })
    ).toMatch(/kebab-case/);
    expect(
      pkgs.validateManifest({
        id: 'my_pack',
        displayName: 'x',
        version: '1.0.0',
        symbols: [],
      })
    ).toMatch(/kebab-case/);
    expect(
      pkgs.validateManifest({
        id: '-leading-dash',
        displayName: 'x',
        version: '1.0.0',
        symbols: [],
      })
    ).toMatch(/kebab-case/);
  });

  it('rejects missing required top-level fields', () => {
    expect(
      pkgs.validateManifest({ id: 'p', version: '1.0.0', symbols: [] })
    ).toMatch(/displayName/);
    expect(
      pkgs.validateManifest({ id: 'p', displayName: 'P', symbols: [] })
    ).toMatch(/version/);
    expect(
      pkgs.validateManifest({ id: 'p', displayName: 'P', version: '1.0.0' })
    ).toMatch(/symbols/);
  });

  it('rejects core when not an array', () => {
    expect(
      pkgs.validateManifest({
        id: 'p',
        displayName: 'P',
        version: '1.0.0',
        core: 'core/base.js',
        symbols: [],
      })
    ).toMatch(/core/);
  });

  it('rejects symbol entries with missing fields', () => {
    const base = {
      id: 'p',
      displayName: 'P',
      version: '1.0.0',
      symbols: [{}],
    };
    expect(pkgs.validateManifest(base)).toMatch(/name/);

    expect(
      pkgs.validateManifest({
        ...base,
        symbols: [{ name: 'x' }],
      })
    ).toMatch(/category/);

    expect(
      pkgs.validateManifest({
        ...base,
        symbols: [{ name: 'x', category: 'c' }],
      })
    ).toMatch(/dataShape/);

    expect(
      pkgs.validateManifest({
        ...base,
        symbols: [{ name: 'x', category: 'c', dataShape: 'Value' }],
      })
    ).toMatch(/files/);

    expect(
      pkgs.validateManifest({
        ...base,
        symbols: [
          { name: 'x', category: 'c', dataShape: 'Value', files: {} },
        ],
      })
    ).toMatch(/files\.js/);
  });

  it('rejects symbol names with invalid characters', () => {
    const err = pkgs.validateManifest({
      id: 'p',
      displayName: 'P',
      version: '1.0.0',
      symbols: [
        {
          name: 'has space',
          category: 'c',
          dataShape: 'Value',
          files: { js: 'x.js' },
        },
      ],
    });
    expect(err).toMatch(/invalid characters/);
  });

  it('rejects symbol requires when not an array', () => {
    const err = pkgs.validateManifest({
      id: 'p',
      displayName: 'P',
      version: '1.0.0',
      symbols: [
        {
          name: 'x',
          category: 'c',
          dataShape: 'Value',
          files: { js: 'x.js' },
          requires: 'libs/a.js',
        },
      ],
    });
    expect(err).toMatch(/requires/);
  });
});

describe('emu-packs: _registerPack + getSymbols + getSymbol', () => {
  let pkgs;
  beforeEach(() => {
    pkgs = loadEmuPacks();
  });

  const simplePack = {
    id: 'demo',
    displayName: 'Demo Pack',
    version: '1.0.0',
    symbols: [
      {
        name: 'hello',
        displayName: 'Hello',
        category: 'Examples',
        dataShape: 'Value',
        files: { js: 'symbols/sym-hello.js' },
      },
      {
        name: 'world',
        category: 'Examples',
        dataShape: 'Table',
        files: { js: 'symbols/sym-world.js' },
      },
    ],
  };

  it('registers all symbols from a pack', () => {
    pkgs._registerPack(simplePack);
    const list = pkgs.getSymbols();
    expect(list.length).toBe(2);

    const hello = list.find((s) => s.name === 'hello');
    expect(hello).toMatchObject({
      name: 'hello',
      type: 'pack',
      category: 'Examples',
      dataShape: 'Value',
      packId: 'demo',
      displayName: 'Hello',
    });

    const world = list.find((s) => s.name === 'world');
    expect(world.displayName).toBe('world'); // falls back to name
  });

  it('getSymbol returns the info + packId', () => {
    pkgs._registerPack(simplePack);
    const entry = pkgs.getSymbol('hello');
    expect(entry).not.toBeNull();
    expect(entry.packId).toBe('demo');
    expect(entry.info.name).toBe('hello');
  });

  it('getSymbol returns null for unknown names', () => {
    pkgs._registerPack(simplePack);
    expect(pkgs.getSymbol('does-not-exist')).toBeNull();
  });

  it('skips a symbol on name collision (first pack wins)', () => {
    pkgs._registerPack(simplePack);
    pkgs._registerPack({
      ...simplePack,
      id: 'other',
      displayName: 'Other',
      symbols: [
        {
          name: 'hello', // collision
          category: 'Duplicated',
          dataShape: 'Value',
          files: { js: 'x.js' },
        },
        {
          name: 'new-one',
          category: 'New',
          dataShape: 'None',
          files: { js: 'y.js' },
        },
      ],
    });
    const list = pkgs.getSymbols();
    // Original hello (from demo) survives; new-one (from other) is added
    expect(list.length).toBe(3);
    expect(pkgs.getSymbol('hello').packId).toBe('demo');
    expect(pkgs.getSymbol('new-one').packId).toBe('other');
  });
});

describe('emu-packs: semver validation', () => {
  let pkgs;
  beforeEach(() => {
    pkgs = loadEmuPacks();
  });

  const mkManifest = (version) => ({
    id: 'p',
    displayName: 'P',
    version,
    symbols: [],
  });

  it.each(['1.0.0', '0.0.1', '10.20.30', '1.2.3-alpha', '1.0.0-rc.1', '2.0.0-beta.3'])(
    'accepts valid semver: %s',
    (v) => {
      expect(pkgs.validateManifest(mkManifest(v))).toBeNull();
    }
  );

  it.each(['1', '1.0', 'v1.0.0', '1.0.0.0', 'not-a-version', '', '1.x.0'])(
    'rejects invalid version: %s',
    (v) => {
      const err = pkgs.validateManifest(mkManifest(v));
      // Empty string is caught by the earlier "missing string `version`" check.
      if (v === '') {
        expect(err).toMatch(/missing string `version`/);
      } else {
        expect(err).toMatch(/MAJOR\.MINOR\.PATCH/);
      }
    }
  );
});

describe('emu-packs: isSafeRelativePath', () => {
  let pkgs;
  beforeEach(() => {
    pkgs = loadEmuPacks();
  });

  it.each([
    'symbols/sym-hello.js',
    'libs/chart.js',
    'core/base.js',
    'a.js',
    'deep/nested/path/file.js',
  ])('accepts safe path: %s', (p) => {
    expect(pkgs.isSafeRelativePath(p)).toBe(true);
  });

  it.each([
    '',
    '/absolute/path.js',
    '../parent.js',
    'deep/../escape.js',
    '..',
    'http://evil.com/a.js',
    'https://cdn.example.com/lib.js',
    'data:text/javascript,alert(1)',
    'blob:abc',
    'javascript:alert(1)',
    'file:///etc/passwd',
  ])('rejects unsafe path: %s', (p) => {
    expect(pkgs.isSafeRelativePath(p)).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(pkgs.isSafeRelativePath(null)).toBe(false);
    expect(pkgs.isSafeRelativePath(undefined)).toBe(false);
    expect(pkgs.isSafeRelativePath(123)).toBe(false);
    expect(pkgs.isSafeRelativePath({})).toBe(false);
  });
});

describe('emu-packs: path-traversal protection in validateManifest', () => {
  let pkgs;
  beforeEach(() => {
    pkgs = loadEmuPacks();
  });

  const base = {
    id: 'p',
    displayName: 'P',
    version: '1.0.0',
  };

  it('rejects core entry with ../', () => {
    const err = pkgs.validateManifest({
      ...base,
      core: ['core/base.js', '../../emulator/js/app.js'],
      symbols: [],
    });
    expect(err).toMatch(/core\[1\]/);
    expect(err).toMatch(/safe relative path/);
  });

  it('rejects symbol js with absolute path', () => {
    const err = pkgs.validateManifest({
      ...base,
      symbols: [
        {
          name: 'x',
          category: 'c',
          dataShape: 'Value',
          files: { js: '/etc/passwd' },
        },
      ],
    });
    expect(err).toMatch(/files\.js/);
    expect(err).toMatch(/safe relative path/);
  });

  it('rejects symbol template with http:// scheme', () => {
    const err = pkgs.validateManifest({
      ...base,
      symbols: [
        {
          name: 'x',
          category: 'c',
          dataShape: 'Value',
          files: {
            js: 'symbols/sym-x.js',
            template: 'http://evil.com/template.html',
          },
        },
      ],
    });
    expect(err).toMatch(/files\.template/);
  });

  it('rejects symbol config with ../', () => {
    const err = pkgs.validateManifest({
      ...base,
      symbols: [
        {
          name: 'x',
          category: 'c',
          dataShape: 'Value',
          files: {
            js: 'symbols/sym-x.js',
            config: '../../config.html',
          },
        },
      ],
    });
    expect(err).toMatch(/files\.config/);
  });

  it('rejects symbol requires with ../', () => {
    const err = pkgs.validateManifest({
      ...base,
      symbols: [
        {
          name: 'x',
          category: 'c',
          dataShape: 'Value',
          files: { js: 'symbols/sym-x.js' },
          requires: ['libs/ok.js', '../escape.js'],
        },
      ],
    });
    expect(err).toMatch(/requires\[1\]/);
  });

  it('accepts a fully-safe manifest', () => {
    const err = pkgs.validateManifest({
      ...base,
      core: ['core/base.js', 'core/directives.js'],
      symbols: [
        {
          name: 'x',
          category: 'c',
          dataShape: 'Value',
          files: {
            js: 'symbols/sym-x.js',
            template: 'symbols/sym-x-template.html',
            config: 'symbols/sym-x-config.html',
          },
          requires: ['libs/chart.js', 'libs/util.js'],
        },
      ],
    });
    expect(err).toBeNull();
  });
});

describe('emu-packs: init() fetch flow', () => {
  let pkgs;
  /** @type {Array<{url: string, status: number, body: any}>} */
  let fetchLog;

  beforeEach(() => {
    pkgs = loadEmuPacks();
    fetchLog = [];
    // Install a minimal fake fetch that routes URLs to canned
    // responses. Each test assembles its own routing table.
    /** @type {Record<string, { status?: number, body?: any }>} */
    const routes = {};
    /** @type {any} */ (globalThis).__routes = routes;
    /** @type {any} */ (globalThis).window.fetch = async (url) => {
      fetchLog.push({ url, status: 0, body: null });
      const r = routes[url];
      if (!r) {
        return { ok: false, status: 404, json: async () => null, text: async () => '' };
      }
      const status = r.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => r.body,
        text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
      };
    };
  });

  /** @param {string} url @param {any} body @param {number} [status] */
  function route(url, body, status) {
    /** @type {any} */ (globalThis).__routes[url] = { body, status };
  }

  it('returns empty result when packs-index.json is absent', async () => {
    // No routes installed → every fetch 404s
    const result = await pkgs.init();
    expect(result.loaded).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(pkgs.isInitialized()).toBe(true);
  });

  it('returns empty result when packs-index.json has an empty packs array', async () => {
    route('../symbols/packs/packs-index.json', { packs: [] });
    const result = await pkgs.init();
    expect(result.loaded).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('loads a single valid pack', async () => {
    route('../symbols/packs/packs-index.json', { packs: ['demo'] });
    route('../symbols/packs/demo/pack.json', {
      id: 'demo',
      displayName: 'Demo',
      version: '1.0.0',
      symbols: [
        {
          name: 'hello',
          category: 'Examples',
          dataShape: 'Value',
          files: { js: 'symbols/sym-hello.js' },
        },
      ],
    });

    const result = await pkgs.init();
    expect(result.loaded).toEqual(['demo']);
    expect(result.errors).toEqual([]);
    expect(pkgs.getSymbols()).toHaveLength(1);
    expect(pkgs.getSymbol('hello').packId).toBe('demo');
  });

  it('reports a missing pack.json', async () => {
    route('../symbols/packs/packs-index.json', { packs: ['ghost'] });
    // ghost/pack.json not routed → 404
    const result = await pkgs.init();
    expect(result.loaded).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].packId).toBe('ghost');
    expect(result.errors[0].reason).toMatch(/not found/);
  });

  it('reports a schema-invalid pack.json', async () => {
    route('../symbols/packs/packs-index.json', { packs: ['broken'] });
    route('../symbols/packs/broken/pack.json', {
      id: 'broken',
      displayName: 'Broken',
      version: 'not-a-semver',
      symbols: [],
    });
    const result = await pkgs.init();
    expect(result.loaded).toEqual([]);
    expect(result.errors[0].reason).toMatch(/MAJOR\.MINOR\.PATCH/);
  });

  it('reports id/directory mismatch', async () => {
    route('../symbols/packs/packs-index.json', { packs: ['alpha'] });
    route('../symbols/packs/alpha/pack.json', {
      id: 'beta', // mismatch
      displayName: 'Mismatch',
      version: '1.0.0',
      symbols: [],
    });
    const result = await pkgs.init();
    expect(result.errors[0].reason).toMatch(/does not match directory/);
  });

  it('loads multiple packs and merges symbols', async () => {
    route('../symbols/packs/packs-index.json', { packs: ['a', 'b'] });
    route('../symbols/packs/a/pack.json', {
      id: 'a',
      displayName: 'A',
      version: '1.0.0',
      symbols: [
        { name: 'sym_a', category: 'x', dataShape: 'Value', files: { js: 's.js' } },
      ],
    });
    route('../symbols/packs/b/pack.json', {
      id: 'b',
      displayName: 'B',
      version: '2.1.0',
      symbols: [
        { name: 'sym_b', category: 'x', dataShape: 'Value', files: { js: 's.js' } },
      ],
    });

    const result = await pkgs.init();
    expect(result.loaded.sort()).toEqual(['a', 'b']);
    expect(pkgs.getSymbols()).toHaveLength(2);
  });

  it('init() is idempotent (returns the same promise on re-entry)', async () => {
    route('../symbols/packs/packs-index.json', { packs: [] });
    const p1 = pkgs.init();
    const p2 = pkgs.init();
    expect(p1).toBe(p2);
    await p1;
  });
});

describe('emu-packs: isInitialized', () => {
  it('is false before init()', () => {
    const pkgs = loadEmuPacks();
    expect(pkgs.isInitialized()).toBe(false);
  });
});
