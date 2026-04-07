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
      pkgs.validateManifest({ displayName: 'x', version: '1', symbols: [] })
    ).toMatch(/missing string `id`/);
  });

  it('rejects non-kebab-case id', () => {
    expect(
      pkgs.validateManifest({
        id: 'MyPack',
        displayName: 'x',
        version: '1',
        symbols: [],
      })
    ).toMatch(/kebab-case/);
    expect(
      pkgs.validateManifest({
        id: 'my_pack',
        displayName: 'x',
        version: '1',
        symbols: [],
      })
    ).toMatch(/kebab-case/);
    expect(
      pkgs.validateManifest({
        id: '-leading-dash',
        displayName: 'x',
        version: '1',
        symbols: [],
      })
    ).toMatch(/kebab-case/);
  });

  it('rejects missing required top-level fields', () => {
    expect(
      pkgs.validateManifest({ id: 'p', version: '1', symbols: [] })
    ).toMatch(/displayName/);
    expect(
      pkgs.validateManifest({ id: 'p', displayName: 'P', symbols: [] })
    ).toMatch(/version/);
    expect(
      pkgs.validateManifest({ id: 'p', displayName: 'P', version: '1' })
    ).toMatch(/symbols/);
  });

  it('rejects core when not an array', () => {
    expect(
      pkgs.validateManifest({
        id: 'p',
        displayName: 'P',
        version: '1',
        core: 'core/base.js',
        symbols: [],
      })
    ).toMatch(/core/);
  });

  it('rejects symbol entries with missing fields', () => {
    const base = {
      id: 'p',
      displayName: 'P',
      version: '1',
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
      version: '1',
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
      version: '1',
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

describe('emu-packs: isInitialized', () => {
  it('is false before init()', () => {
    const pkgs = loadEmuPacks();
    expect(pkgs.isInitialized()).toBe(false);
  });
});
