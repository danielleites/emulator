/**
 * pi-simulation-validator.js — Simulation Environment Validation Suite
 * ======================================================================
 * גרסה: 1.0.0  |  תאריך: 2026-03-29
 * namespace: window.PISimValidator
 *
 * ═══════════════════════════════════════════════════════════════
 * תיאור:
 * ═══════════════════════════════════════════════════════════════
 * מריץ סדרת בדיקות ולידציה על סביבת ה-PI Simulation המקומית.
 * בודק נאמנות ה-mock, עקביות הנתונים, תקינות ה-API,
 * ומדמה תסריטי שגיאה.
 *
 * ═══════════════════════════════════════════════════════════════
 * שימוש:
 * ═══════════════════════════════════════════════════════════════
 *   // הרצת כל הבדיקות:
 *   const results = await PISimValidator.runAll();
 *   console.table(results.tests);
 *
 *   // הרצת קטגוריה ספציפית:
 *   const r = await PISimValidator.run('api');
 *
 *   // הצגת UI report:
 *   PISimValidator.showReport();
 *
 * ═══════════════════════════════════════════════════════════════
 * קטגוריות בדיקה:
 *   api           — PI Web API mock endpoints
 *   timeseries    — זמן אמת וסדרות זמן
 *   af            — AF hierarchy ו-attributes
 *   eventframes   — event frames
 *   streamsets    — StreamSets endpoints
 *   auth          — Auth modes
 *   error_modes   — Error simulation
 *   data_quality  — עקביות ואיכות נתונים
 *   performance   — מדדי ביצועים
 * ═══════════════════════════════════════════════════════════════
 */

;(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  //  TEST RESULT MODEL
  // ═══════════════════════════════════════════════════════════════

  /**
   * @typedef {object} TestResult
   * @property {string}  category
   * @property {string}  name
   * @property {'PASS'|'FAIL'|'WARN'|'SKIP'} status
   * @property {string}  detail
   * @property {number}  durationMs
   */

  // ═══════════════════════════════════════════════════════════════
  //  RUNNER UTILITY
  // ═══════════════════════════════════════════════════════════════

  async function _runTest(category, name, fn) {
    const t0 = performance.now();
    let status = 'FAIL', detail = '';
    try {
      const r = await fn();
      status = r.status || 'PASS';
      detail = r.detail || '';
    } catch (e) {
      status = 'FAIL';
      detail = e.message || String(e);
    }
    return { category, name, status, detail, durationMs: +(performance.now() - t0).toFixed(1) };
  }

  function _pass(detail) { return { status: 'PASS', detail: detail || '' }; }
  function _fail(detail) { return { status: 'FAIL', detail: detail || '' }; }
  function _warn(detail) { return { status: 'WARN', detail: detail || '' }; }
  function _skip(detail) { return { status: 'SKIP', detail: detail || '' }; }

  // ═══════════════════════════════════════════════════════════════
  //  DEPENDENCY CHECKS
  // ═══════════════════════════════════════════════════════════════

  function _getMock() { return global.PIWebAPIMock || null; }
  function _getAF()   { return global.PISimulationMode ? global.PISimulationMode._getAfLayer() : (global._testAFLayer || null); }
  function _getSim()  { return global.PISimulationMode || null; }

  // ═══════════════════════════════════════════════════════════════
  //  TEST SUITES
  // ═══════════════════════════════════════════════════════════════

  const SUITES = {

    // ─── API Endpoints ──────────────────────────────────────────
    api: [
      {
        name: 'GET /piwebapi/ — Home links',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/');
          if (r.status !== 200) return _fail('HTTP ' + r.status);
          if (!r.body.Links) return _fail('חסר Links');
          const keys = Object.keys(r.body.Links);
          if (keys.length < 3) return _warn('Links מועטים: ' + keys.join(', '));
          return _pass('Links: ' + keys.join(', '));
        },
      },
      {
        name: 'GET /piwebapi/system/versions',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/system/versions');
          if (r.status !== 200) return _fail('HTTP ' + r.status);
          if (!r.body['PI Web API']) return _fail('חסר PI Web API field');
          return _pass('version: ' + r.body['PI Web API'].Version);
        },
      },
      {
        name: 'GET /piwebapi/system/userinfo',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/system/userinfo');
          if (r.status !== 200) return _fail('HTTP ' + r.status);
          if (!r.body.IdentityType) return _fail('חסר IdentityType');
          return _pass('user: ' + r.body.Name + ', type: ' + r.body.IdentityType);
        },
      },
      {
        name: 'GET /piwebapi/dataservers',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/dataservers');
          if (r.status !== 200) return _fail('HTTP ' + r.status);
          if (!r.body.Items || r.body.Items.length === 0) return _fail('לא הוחזרו Data Servers');
          return _pass(r.body.Items.length + ' data server(s): ' + r.body.Items[0].Name);
        },
      },
      {
        name: 'GET /piwebapi/dataservers/{id}/points (tag search)',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/dataservers/WDS_IEC_MOCK_001/points', { maxCount: '10' });
          if (r.status !== 200) return _fail('HTTP ' + r.status);
          if (!r.body.Items || r.body.Items.length === 0) return _fail('לא הוחזרו tags');
          const tags = r.body.Items;
          const hasLinks = tags[0] && tags[0].Links && tags[0].Links.Value;
          return hasLinks ? _pass(tags.length + ' tags, Links נמצאו') : _warn(tags.length + ' tags, Links חסרים');
        },
      },
      {
        name: 'GET /piwebapi/points/{webId} — tag details',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/points/WTAG001');
          if (r.status !== 200) return _fail('HTTP ' + r.status);
          if (!r.body.Name) return _fail('חסר Name');
          if (!r.body.EngineeringUnits && r.body.EngineeringUnits !== '') return _warn('חסר EngineeringUnits');
          return _pass('tag: ' + r.body.Name + ' [' + r.body.EngineeringUnits + ']');
        },
      },
      {
        name: 'GET /piwebapi/points/{webId}/value — snapshot',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/points/WTAG001/value');
          if (r.status !== 200) return _fail('HTTP ' + r.status);
          if (r.body.Value === undefined) return _fail('חסר Value');
          if (!r.body.Timestamp) return _fail('חסר Timestamp');
          if (r.body.Good === undefined) return _warn('חסר Good flag');
          return _pass('value=' + r.body.Value + ', ts=' + r.body.Timestamp.slice(0,19));
        },
      },
      {
        name: 'GET /piwebapi/points/{webId}/recorded — history',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/points/WTAG001/recorded', { startTime: '*-1d', endTime: '*', maxCount: '50' });
          if (r.status !== 200) return _fail('HTTP ' + r.status);
          if (!r.body.Items) return _fail('חסר Items');
          if (r.body.Items.length === 0) return _warn('אין נקודות נתונים');
          const first = r.body.Items[0];
          if (!first.Timestamp || first.Value === undefined) return _fail('פורמט item לא תקין');
          return _pass(r.body.Items.length + ' recorded values');
        },
      },
      {
        name: 'GET /piwebapi/points/{webId}/interpolated',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/points/WTAG001/interpolated', { startTime: '*-1h', endTime: '*', maxCount: '20' });
          if (r.status !== 200) return _fail('HTTP ' + r.status);
          if (!r.body.Items || r.body.Items.length === 0) return _fail('אין נקודות');
          return _pass(r.body.Items.length + ' interpolated values');
        },
      },
      {
        name: 'GET /piwebapi/points/{webId}/summary',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/points/WTAG001/summary', { startTime: '*-7d', endTime: '*' });
          if (r.status !== 200) return _fail('HTTP ' + r.status);
          if (!r.body.Items) return _fail('חסר Items');
          const summary = r.body.Items[0] && r.body.Items[0].Value;
          if (!summary || !summary.Mean) return _fail('חסר Mean בסיכום');
          return _pass('Mean=' + summary.Mean.Value + ', Min=' + summary.Minimum.Value + ', Max=' + summary.Maximum.Value);
        },
      },
      {
        name: 'GET /piwebapi/assetservers',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/assetservers');
          if (r.status !== 200) return _fail('HTTP ' + r.status);
          if (!r.body.Items || r.body.Items.length === 0) return _fail('אין AF servers');
          return _pass(r.body.Items.length + ' AF server(s): ' + r.body.Items[0].Name);
        },
      },
      {
        name: 'GET /piwebapi/assetservers/{id}/assetdatabases',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/assetservers/WAFS_IEC_MOCK_001/assetdatabases');
          if (r.status !== 200) return _fail('HTTP ' + r.status);
          if (!r.body.Items || r.body.Items.length < 2) return _warn('פחות מ-2 databases');
          return _pass(r.body.Items.length + ' databases: ' + r.body.Items.map(d => d.Name).join(', '));
        },
      },
      {
        name: 'GET /piwebapi/assetdatabases/{id}/elements',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/assetdatabases/WADB_IEC_POWERGRID/elements');
          if (r.status !== 200) return _fail('HTTP ' + r.status);
          if (!r.body.Items || r.body.Items.length === 0) return _fail('אין root elements');
          return _pass(r.body.Items.length + ' elements: ' + r.body.Items.map(e => e.Name).join(', '));
        },
      },
      {
        name: 'GET /piwebapi/elements/{webId}/attributes',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/elements/WEL001/attributes');
          if (r.status !== 200) return _fail('HTTP ' + r.status);
          if (!r.body.Items) return _fail('חסר Items');
          return _pass(r.body.Items.length + ' attributes');
        },
      },
      {
        name: 'GET /piwebapi/points/INVALID_WEBID — should 404',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/points/WTAG_DOES_NOT_EXIST_999');
          if (r.status !== 404) return _fail('צפוי 404, קיבלנו: ' + r.status);
          return _pass('404 הוחזר בצורה תקינה');
        },
      },
    ],

    // ─── Time-Series Quality ────────────────────────────────────
    timeseries: [
      {
        name: 'ערכים בטווח הנדסי (EngrMin/Max)',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const tags = m.getTags().filter(t => t.PointType === 'Float32').slice(0, 5);
          const errors = [];
          for (const tag of tags) {
            const r = await m.request('GET', '/piwebapi/points/' + tag.WebId + '/recorded', { startTime: '*-6h', endTime: '*', maxCount: '50' });
            if (!r.body.Items) continue;
            const outOfRange = r.body.Items.filter(i =>
              typeof i.Value === 'number' && (i.Value < tag.Zero - 1 || i.Value > tag.Zero + tag.Span + 1)
            );
            if (outOfRange.length > 0) errors.push(tag.Name + ': ' + outOfRange.length + ' out-of-range');
          }
          return errors.length === 0 ? _pass('כל ' + tags.length + ' tags בטווח') : _warn(errors.join('; '));
        },
      },
      {
        name: 'עקביות סדר כרונולוגי',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/points/WTAG001/recorded', { startTime: '*-7d', endTime: '*', maxCount: '100' });
          if (!r.body.Items || r.body.Items.length < 2) return _warn('פחות מ-2 נקודות');
          let outOfOrder = 0;
          for (let i = 1; i < r.body.Items.length; i++) {
            const t0 = Date.parse(r.body.Items[i - 1].Timestamp);
            const t1 = Date.parse(r.body.Items[i].Timestamp);
            if (t1 < t0) outOfOrder++;
          }
          return outOfOrder === 0 ? _pass('סדר כרונולוגי תקין (' + r.body.Items.length + ' נקודות)') : _fail(outOfOrder + ' נקודות מחוץ לסדר');
        },
      },
      {
        name: 'good flag קיים בכל נקודות',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/points/WTAG001/recorded', { startTime: '*-1d', endTime: '*', maxCount: '50' });
          if (!r.body.Items) return _skip('אין Items');
          const missing = r.body.Items.filter(i => i.Good === undefined).length;
          return missing === 0 ? _pass('Good flag קיים בכל הנקודות') : _warn(missing + ' נקודות ללא Good flag');
        },
      },
      {
        name: 'ערכי interpolated — רווחים אחידים',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/points/WTAG001/interpolated', { startTime: '*-1h', endTime: '*', maxCount: '12' });
          if (!r.body.Items || r.body.Items.length < 3) return _warn('פחות מ-3 נקודות');
          const deltas = [];
          for (let i = 1; i < r.body.Items.length; i++) {
            deltas.push(Date.parse(r.body.Items[i].Timestamp) - Date.parse(r.body.Items[i - 1].Timestamp));
          }
          const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
          const maxDev = Math.max(...deltas.map(d => Math.abs(d - mean))) / mean;
          return maxDev < 0.15 ? _pass('רווחים אחידים (±' + (maxDev * 100).toFixed(1) + '%)') : _warn('רווחים לא אחידים (deviation=' + (maxDev * 100).toFixed(1) + '%)');
        },
      },
      {
        name: 'summary — Min <= Mean <= Max',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/points/WTAG001/summary', { startTime: '*-7d', endTime: '*' });
          if (!r.body.Items || !r.body.Items[0]) return _fail('אין סיכום');
          const s = r.body.Items[0].Value;
          if (!s.Minimum || !s.Mean || !s.Maximum) return _fail('חסרים ערכי סיכום');
          const min = s.Minimum.Value, mean = s.Mean.Value, max = s.Maximum.Value;
          if (min > mean || mean > max) return _fail(`Min(${min}) <= Mean(${mean}) <= Max(${max}) — לא מסתדר`);
          return _pass(`Min=${min}, Mean=${mean}, Max=${max}`);
        },
      },
    ],

    // ─── AF Hierarchy ───────────────────────────────────────────
    af: [
      {
        name: 'AFDataLayer — נטען בהצלחה',
        fn: async () => {
          const af = _getAF();
          if (!af) return _skip('AFDataLayer לא נמצא');
          return _pass('AFDataLayer instance נוצר');
        },
      },
      {
        name: 'AFDataLayer.getStats — נתונים בסיסיים',
        fn: async () => {
          const af = _getAF(); if (!af) return _skip('AFDataLayer לא נמצא');
          const s = af.getStats();
          if (!s || s.totalElements === 0) return _fail('totalElements = 0');
          if (s.totalTags === 0) return _warn('totalTags = 0');
          return _pass('elements=' + s.totalElements + ', tags=' + s.totalTags + ', attributes=' + s.totalAttributes);
        },
      },
      {
        name: 'AFDataLayer.getRootElements — 5 אתרים',
        fn: async () => {
          const af = _getAF(); if (!af) return _skip('AFDataLayer לא נמצא');
          const r = af.getRootElements();
          if (!r || !r.Items) return _fail('אין Items');
          if (r.Items.length !== 5) return _warn('צפוי 5 אתרים, קיבלנו: ' + r.Items.length);
          const names = r.Items.map(e => e.Name);
          return _pass('אתרים: ' + names.join(', '));
        },
      },
      {
        name: 'AFDataLayer.getChildElements — sub-hierarchy',
        fn: async () => {
          const af = _getAF(); if (!af) return _skip('AFDataLayer לא נמצא');
          const roots = af.getRootElements();
          if (!roots || !roots.Items || roots.Items.length === 0) return _skip('אין root elements');
          const firstRoot = roots.Items[0];
          const children = af.getChildElements(firstRoot.WebId);
          if (!children || !children.Items) return _fail('אין Items לילדים');
          if (children.Items.length === 0) return _warn('אין ילדים ל-' + firstRoot.Name);
          return _pass(firstRoot.Name + ' → ' + children.Items.length + ' ילדים: ' + children.Items.slice(0, 3).map(e => e.Name).join(', '));
        },
      },
      {
        name: 'AFDataLayer.getAttributes — attribute types',
        fn: async () => {
          const af = _getAF(); if (!af) return _skip('AFDataLayer לא נמצא');
          const roots = af.getRootElements();
          if (!roots || !roots.Items || roots.Items.length === 0) return _skip('אין root elements');
          const wid = roots.Items[0].WebId;
          const attrs = af.getAttributes(wid);
          if (!attrs || !attrs.Items || attrs.Items.length === 0) return _warn('אין attributes');
          const types = [...new Set(attrs.Items.map(a => a.Type))];
          const hasEnum = attrs.Items.some(a => a.Type === 'Enum');
          const hasDouble = attrs.Items.some(a => a.Type === 'Double');
          return _pass(attrs.Items.length + ' attributes, types: ' + types.join(', '));
        },
      },
      {
        name: 'AFDataLayer.searchTags — חיפוש עברית',
        fn: async () => {
          const af = _getAF(); if (!af) return _skip('AFDataLayer לא נמצא');
          const r = af.searchTags('הספק', 10);
          if (!r || !r.Items) return _fail('תוצאה שגויה');
          if (r.Items.length === 0) return _warn('אין תוצאות ל"הספק"');
          return _pass(r.Items.length + ' תוצאות ל"הספק"');
        },
      },
      {
        name: 'AFDataLayer.searchTags — חיפוש wildcards',
        fn: async () => {
          const af = _getAF(); if (!af) return _skip('AFDataLayer לא נמצא');
          const r = af.searchTags('*', 1000);
          if (!r || !r.Items || r.Items.length === 0) return _fail('אין תוצאות ל-*');
          const totalTags = af.getStats().totalTags;
          return _pass(r.Items.length + '/' + totalTags + ' tags ל-* query');
        },
      },
      {
        name: 'AFDataLayer.getRecordedValues — היסטוריה',
        fn: async () => {
          const af = _getAF(); if (!af) return _skip('AFDataLayer לא נמצא');
          const tags = af.searchTags('', 1);
          if (!tags || !tags.Items || tags.Items.length === 0) return _skip('אין tags');
          const wid = tags.Items[0].WebId;
          const r = af.getRecordedValues(wid, '*-1d', '*', 50);
          if (!r || !r.Items) return _fail('אין Items');
          if (r.Items.length === 0) return _warn('לא הוחזרו ערכים');
          return _pass(r.Items.length + ' ערכים מוחזרים');
        },
      },
      {
        name: 'AFDataLayer.getEnumSets — Enum types',
        fn: async () => {
          const af = _getAF(); if (!af) return _skip('AFDataLayer לא נמצא');
          const enums = af.getEnumSets ? af.getEnumSets() : null;
          if (!enums) return _skip('getEnumSets לא ממומש');
          const count = Object.keys(enums).length;
          if (count === 0) return _warn('אין EnumSets');
          return _pass(count + ' EnumSets: ' + Object.keys(enums).slice(0, 4).join(', '));
        },
      },
      {
        name: 'WebId determinism — אותה path → אותה WebId',
        fn: async () => {
          const af = _getAF(); if (!af) return _skip('AFDataLayer לא נמצא');
          const roots1 = af.getRootElements();
          const roots2 = af.getRootElements();
          if (!roots1 || !roots2 || !roots1.Items) return _skip('אין roots');
          const consistent = roots1.Items.every((el, i) =>
            roots2.Items[i] && roots2.Items[i].WebId === el.WebId
          );
          return consistent ? _pass('WebIds דטרמיניסטיים בין קריאות') : _fail('WebIds משתנים בין קריאות');
        },
      },
    ],

    // ─── Event Frames ───────────────────────────────────────────
    eventframes: [
      {
        name: 'GET event frames — טווח 365 ימים',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/assetdatabases/WADB_IEC_POWERGRID/eventframes', { startTime: '*-365d', endTime: '*' });
          if (r.status !== 200) return _fail('HTTP ' + r.status);
          if (!r.body.Items || r.body.Items.length === 0) return _warn('אין event frames');
          return _pass(r.body.Items.length + ' event frames: ' + r.body.Items.map(e => e.Name).slice(0, 2).join(', ') + '...');
        },
      },
      {
        name: 'GET event frame by WebId',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/eventframes/WEF001');
          if (r.status !== 200) return _fail('HTTP ' + r.status);
          if (!r.body.Name) return _fail('חסר Name');
          return _pass('event frame: ' + r.body.Name + ', active=' + r.body.IsActive);
        },
      },
      {
        name: 'GET event frame attributes',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/eventframes/WEF001/attributes');
          if (r.status !== 200) return _fail('HTTP ' + r.status);
          if (!r.body.Items) return _fail('חסר Items');
          return _pass(r.body.Items.length + ' attributes');
        },
      },
      {
        name: 'Event frame time filtering — עבר vs. עתיד',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const past = await m.request('GET', '/piwebapi/assetdatabases/WADB_IEC_POWERGRID/eventframes', {
            startTime: '*-90d', endTime: '*',
          });
          const future = await m.request('GET', '/piwebapi/assetdatabases/WADB_IEC_POWERGRID/eventframes', {
            startTime: '*+1d', endTime: '*+365d',
          });
          return _pass(`עבר: ${(past.body.Items || []).length} frames, עתיד: ${(future.body.Items || []).length} frames`);
        },
      },
      {
        name: 'Event frame via AFDataLayer',
        fn: async () => {
          const af = _getAF(); if (!af) return _skip('AFDataLayer לא נמצא');
          if (!af.getEventFrames) return _skip('getEventFrames לא ממומש');
          const r = af.getEventFrames({ startTime: '*-365d', endTime: '*' });
          if (!r || !r.Items) return _fail('תוצאה שגויה');
          return r.Items.length > 0 ? _pass(r.Items.length + ' event frames מ-AFDataLayer') : _warn('אין event frames ב-AFDataLayer');
        },
      },
    ],

    // ─── StreamSets ─────────────────────────────────────────────
    streamsets: [
      {
        name: 'StreamSets snapshot — 5 tags',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const webIds = ['WTAG001', 'WTAG002', 'WTAG003', 'WTAG017', 'WTAG018'];
          const items = await m.streamSetsValue(webIds);
          if (!items || items.length !== webIds.length) return _fail('קיבלנו ' + (items ? items.length : 0) + ' מתוך ' + webIds.length);
          const withErrors = items.filter(i => i.Exception);
          return withErrors.length === 0
            ? _pass(webIds.length + ' tags הוחזרו בהצלחה')
            : _warn(withErrors.length + ' items עם שגיאות');
        },
      },
      {
        name: 'StreamSets recorded — 3 tags',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const items = await m.streamSetsRecorded(['WTAG001', 'WTAG002', 'WTAG003'], '*-2h', '*');
          if (!items || items.length === 0) return _fail('אין תוצאות');
          const withItems = items.filter(i => i.Items && i.Items.length > 0);
          return _pass(withItems.length + '/3 tags עם נתונים, items: ' + items.map(i => (i.Items || []).length).join(','));
        },
      },
      {
        name: 'StreamSets — WebId לא קיים מחזיר Exception',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const items = await m.streamSetsValue(['WTAG001', 'WTAG_INVALID_99999']);
          const invalid = items.find(i => i.WebId === 'WTAG_INVALID_99999');
          if (!invalid) return _fail('WebId לא קיים לא הוחזר');
          return invalid.Exception ? _pass('Exception הוחזר לWebId לא קיים') : _warn('אין Exception לWebId לא קיים');
        },
      },
    ],

    // ─── Auth Modes ─────────────────────────────────────────────
    auth: [
      {
        name: 'Auth none — בקשה עוברת',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          m.init({ authMode: 'none' });
          const r = await m.request('GET', '/piwebapi/system/versions', {}, null, {});
          m.init({ authMode: 'none' }); // restore
          return r.status === 200 ? _pass('בקשה עברה ב-none auth') : _fail('נכשל עם status ' + r.status);
        },
      },
      {
        name: 'Auth basic — credentials נכונים',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          m.init({ authMode: 'basic', username: 'testuser', password: 'testpass' });
          const creds = btoa('testuser:testpass');
          const r = await m.request('GET', '/piwebapi/system/versions', {}, null, { 'Authorization': 'Basic ' + creds });
          m.init({ authMode: 'none' }); // restore to none
          return r.status === 200 ? _pass('Basic auth עם credentials נכונים עבר') : _fail('נכשל: ' + r.status);
        },
      },
      {
        name: 'Auth basic — credentials שגויים מחזיר 401',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          m.init({ authMode: 'basic', username: 'testuser', password: 'testpass' });
          const creds = btoa('wronguser:wrongpass');
          const r = await m.request('GET', '/piwebapi/system/versions', {}, null, { 'Authorization': 'Basic ' + creds });
          m.init({ authMode: 'none' }); // restore
          return r.status === 401 ? _pass('401 הוחזר לcredentials שגויים') : _fail('צפוי 401, קיבלנו ' + r.status);
        },
      },
      {
        name: 'Auth basic — ללא header מחזיר 401',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          m.init({ authMode: 'basic', username: 'user', password: 'pass' });
          const r = await m.request('GET', '/piwebapi/system/versions', {}, null, {});
          m.init({ authMode: 'none' }); // restore
          return r.status === 401 ? _pass('401 הוחזר ללא auth header') : _fail('צפוי 401, קיבלנו ' + r.status);
        },
      },
    ],

    // ─── Error Modes ────────────────────────────────────────────
    error_modes: [
      {
        name: 'Error mode: servererror — מחזיר 500',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          m.setErrorMode('servererror', 2000);
          const r = await m.request('GET', '/piwebapi/points/WTAG001/value');
          m.clearErrorMode();
          return r.status === 500 ? _pass('500 הוחזר ב-servererror mode') : _fail('צפוי 500, קיבלנו ' + r.status);
        },
      },
      {
        name: 'Error mode: unauthorized — מחזיר 401',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          m.setErrorMode('unauthorized', 2000);
          const r = await m.request('GET', '/piwebapi/points/WTAG001/value');
          m.clearErrorMode();
          return r.status === 401 ? _pass('401 הוחזר ב-unauthorized mode') : _fail('צפוי 401, קיבלנו ' + r.status);
        },
      },
      {
        name: 'Error mode: partial — Items קטועים',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          m.setErrorMode('partial', 2000);
          const r = await m.request('GET', '/piwebapi/points/WTAG001/recorded', { startTime: '*-1d', endTime: '*', maxCount: '100' });
          m.clearErrorMode();
          const partial = r.body._PartialResponse;
          return partial ? _pass('PartialResponse flag נמצא') : _warn('PartialResponse לא סומן (items: ' + (r.body.Items || []).length + ')');
        },
      },
      {
        name: 'clearErrorMode — מחזיר לתקינות',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          m.setErrorMode('servererror', 60000);
          m.clearErrorMode();
          const r = await m.request('GET', '/piwebapi/system/versions');
          return r.status === 200 ? _pass('clearErrorMode עבד — חזר ל-200') : _fail('צפוי 200 לאחר clear, קיבלנו ' + r.status);
        },
      },
    ],

    // ─── Batch ──────────────────────────────────────────────────
    batch_api: [
      {
        name: 'POST /piwebapi/batch — multi-request',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const results = await m.batch({
            getVersion: { Method: 'GET', Resource: '/piwebapi/system/versions' },
            getTag1:    { Method: 'GET', Resource: '/piwebapi/points/WTAG001/value' },
            getTag2:    { Method: 'GET', Resource: '/piwebapi/points/WTAG002/value' },
          });
          const allPresent = results.getVersion && results.getTag1 && results.getTag2;
          if (!allPresent) return _fail('חסרים keys בתגובת batch: ' + Object.keys(results).join(', '));
          const allOk = results.getVersion.Status === 200 && results.getTag1.Status === 200 && results.getTag2.Status === 200;
          return allOk ? _pass('3 בקשות batch עברו בהצלחה') : _warn('סטטוסים: ' + [results.getVersion, results.getTag1, results.getTag2].map(r => r.Status).join(', '));
        },
      },
      {
        name: 'POST /piwebapi/batch — mixed results',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const results = await m.batch({
            good:    { Method: 'GET', Resource: '/piwebapi/points/WTAG001/value' },
            badPath: { Method: 'GET', Resource: '/piwebapi/points/WTAG_BAD_999/value' },
          });
          if (!results.good || !results.badPath) return _fail('חסרים keys');
          return results.good.Status === 200 && results.badPath.Status === 404
            ? _pass('200 לתג תקין, 404 לתג לא קיים')
            : _warn('סטטוסים: good=' + results.good.Status + ', bad=' + results.badPath.Status);
        },
      },
    ],

    // ─── Data Quality ────────────────────────────────────────────
    data_quality: [
      {
        name: 'Tags — WebId ייחודיים',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const tags = m.getTags();
          const ids = tags.map(t => t.WebId);
          const unique = new Set(ids);
          return ids.length === unique.size ? _pass(ids.length + ' WebIds ייחודיים') : _fail((ids.length - unique.size) + ' כפילויות');
        },
      },
      {
        name: 'Tags — Names ייחודיים',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const tags = m.getTags();
          const names = tags.map(t => t.Name.toLowerCase());
          const unique = new Set(names);
          return names.length === unique.size ? _pass(names.length + ' Names ייחודיים') : _warn((names.length - unique.size) + ' שמות כפולים');
        },
      },
      {
        name: 'Tags — Span חיובי',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const tags = m.getTags();
          const bad = tags.filter(t => t.PointType !== 'String' && t.PointType !== 'Digital' && t.Span <= 0);
          return bad.length === 0 ? _pass('כל ה-Spans חיוביים') : _fail(bad.length + ' tags עם Span <= 0: ' + bad.map(t => t.Name).join(', '));
        },
      },
      {
        name: 'Event frames — StartTime < EndTime',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const frames = m.getEventFrames({ startTime: '*-365d' });
          const bad = frames.filter(ef =>
            ef.EndTime && Date.parse(ef.StartTime) >= Date.parse(ef.EndTime)
          );
          return bad.length === 0 ? _pass('כל ה-event frames עם זמן תקין') : _fail(bad.length + ' frames עם StartTime >= EndTime');
        },
      },
      {
        name: 'Timestamp בפורמט ISO 8601',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const r = await m.request('GET', '/piwebapi/points/WTAG001/recorded', { startTime: '*-1h', endTime: '*', maxCount: '10' });
          if (!r.body.Items) return _skip('אין Items');
          const bad = r.body.Items.filter(i => !i.Timestamp || isNaN(Date.parse(i.Timestamp)));
          return bad.length === 0 ? _pass('כל ה-timestamps בפורמט ISO 8601') : _fail(bad.length + ' timestamps לא תקינים');
        },
      },
    ],

    // ─── Performance ────────────────────────────────────────────
    performance: [
      {
        name: 'Snapshot latency < 500ms',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const times = [];
          for (let i = 0; i < 5; i++) {
            const t0 = performance.now();
            await m.request('GET', '/piwebapi/points/WTAG001/value');
            times.push(performance.now() - t0);
          }
          const avg = times.reduce((a, b) => a + b, 0) / times.length;
          const max = Math.max(...times);
          return max < 500 ? _pass(`avg=${avg.toFixed(0)}ms, max=${max.toFixed(0)}ms`) : _warn(`avg=${avg.toFixed(0)}ms, max=${max.toFixed(0)}ms — מעל 500ms`);
        },
      },
      {
        name: 'Cache hit rate > 50% (repeated request)',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          m.clearCache();
          // Warm up
          for (let i = 0; i < 3; i++) await m.request('GET', '/piwebapi/points/WTAG001/value');
          // Repeat same requests (should hit cache)
          for (let i = 0; i < 10; i++) await m.request('GET', '/piwebapi/points/WTAG001/value');
          const status = m.getStatus();
          const rate = status.metrics.cacheHitRate;
          return rate >= 50 ? _pass(`Cache hit rate: ${rate}%`) : _warn(`Cache hit rate: ${rate}% (פחות מ-50%)`);
        },
      },
      {
        name: 'StreamSets 10 tags latency < 1000ms',
        fn: async () => {
          const m = _getMock(); if (!m) return _skip('PIWebAPIMock לא נמצא');
          const webIds = m.getTags().slice(0, 10).map(t => t.WebId);
          const t0 = performance.now();
          await m.streamSetsValue(webIds);
          const elapsed = performance.now() - t0;
          return elapsed < 1000 ? _pass(`${elapsed.toFixed(0)}ms לStreamSets של ${webIds.length} tags`) : _warn(`${elapsed.toFixed(0)}ms — מעל 1000ms`);
        },
      },
    ],
  };

  // ═══════════════════════════════════════════════════════════════
  //  RUNNER
  // ═══════════════════════════════════════════════════════════════

  /**
   * מריץ קטגוריה אחת.
   * @param {string} category
   * @returns {Promise<TestResult[]>}
   */
  async function run(category) {
    const suite = SUITES[category];
    if (!suite) throw new Error('קטגוריה לא קיימת: ' + category + '. קיימות: ' + Object.keys(SUITES).join(', '));
    const results = [];
    for (const test of suite) {
      const r = await _runTest(category, test.name, test.fn);
      results.push(r);
    }
    return results;
  }

  /**
   * מריץ את כל הבדיקות.
   * @returns {Promise<{ tests: TestResult[], summary: object }>}
   */
  async function runAll() {
    const allTests = [];
    for (const cat of Object.keys(SUITES)) {
      const r = await run(cat);
      allTests.push(...r);
    }
    return _buildSummary(allTests);
  }

  function _buildSummary(tests) {
    const counts = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 };
    tests.forEach(t => counts[t.status]++);
    const byCategory = {};
    tests.forEach(t => {
      if (!byCategory[t.category]) byCategory[t.category] = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 };
      byCategory[t.category][t.status]++;
    });
    return {
      tests,
      summary: {
        total: tests.length,
        ...counts,
        passRate: tests.length > 0 ? +((counts.PASS / (tests.length - counts.SKIP)) * 100).toFixed(1) : 0,
        byCategory,
        runAt: new Date().toISOString(),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  UI REPORT
  // ═══════════════════════════════════════════════════════════════

  function _buildReportHTML(summary) {
    const counts = summary.summary;
    const statusIcon = { PASS: '✅', FAIL: '❌', WARN: '⚠️', SKIP: '⬜' };
    const statusClass = { PASS: 'val-pass', FAIL: 'val-fail', WARN: 'val-warn', SKIP: 'val-skip' };

    const rows = summary.tests.map(t => `
<tr class="vr-row ${statusClass[t.status]}">
  <td class="vr-cat">${t.category}</td>
  <td class="vr-name">${t.name}</td>
  <td class="vr-status">${statusIcon[t.status]} ${t.status}</td>
  <td class="vr-detail" title="${t.detail}">${t.detail}</td>
  <td class="vr-time">${t.durationMs}ms</td>
</tr>`).join('');

    return `
<style>
#pisim-report { position:fixed;top:0;left:0;right:0;bottom:0;background:#08101e;z-index:200000;overflow-y:auto;padding:24px;font-family:'Heebo','Segoe UI',sans-serif;direction:rtl;color:#c0d4e4; }
.vr-title { font-size:20px;font-weight:700;color:#e8f4f8;margin-bottom:6px; }
.vr-subtitle { font-size:13px;color:#6b7fa3;margin-bottom:20px; }
.vr-stats { display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap; }
.vr-stat { background:#0d1b2a;border:1px solid rgba(0,212,255,0.15);border-radius:8px;padding:10px 18px;min-width:90px;text-align:center; }
.vr-stat-val { font-size:22px;font-weight:700;line-height:1.2; }
.vr-stat-key { font-size:11px;color:#6b7fa3;margin-top:2px; }
.s-pass{color:#00e676}.s-fail{color:#ff5252}.s-warn{color:#ffab40}.s-skip{color:#6b7fa3}.s-rate{color:#00d4ff}
table.vr-table { width:100%;border-collapse:collapse;font-size:12px; }
.vr-table th { color:#00d4ff;font-size:11px;font-weight:600;text-align:right;padding:6px 8px;border-bottom:1px solid rgba(0,212,255,0.15); }
.vr-row td { padding:5px 8px;border-bottom:1px solid rgba(255,255,255,0.04); }
.vr-row:hover td { background:rgba(0,212,255,0.04); }
.val-pass .vr-status{color:#00e676}.val-fail .vr-status{color:#ff5252}.val-warn .vr-status{color:#ffab40}.val-skip .vr-status{color:#6b7fa3}
.vr-cat { color:#6b7fa3;font-size:10px;white-space:nowrap; }
.vr-name { max-width:320px; }
.vr-detail { color:#6b7fa3;font-size:11px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.vr-time { color:#6b7fa3;font-size:10px;white-space:nowrap; }
.vr-close-btn { position:fixed;top:16px;left:16px;background:rgba(255,82,82,0.1);border:1px solid rgba(255,82,82,0.3);color:#ff5252;padding:6px 18px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:13px; }
.vr-rerun-btn { position:fixed;top:16px;left:100px;background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.25);color:#00d4ff;padding:6px 18px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:13px; }
</style>
<div id="pisim-report">
  <button class="vr-close-btn" onclick="document.getElementById('pisim-report').remove()">✕ סגור</button>
  <button class="vr-rerun-btn" onclick="PISimValidator.showReport()">↺ הרץ שוב</button>
  <div class="vr-title">PI Simulation Validation Report</div>
  <div class="vr-subtitle">בוצע: ${counts.runAt} | ${counts.total} בדיקות</div>
  <div class="vr-stats">
    <div class="vr-stat"><div class="vr-stat-val s-pass">${counts.PASS}</div><div class="vr-stat-key">עברו</div></div>
    <div class="vr-stat"><div class="vr-stat-val s-fail">${counts.FAIL}</div><div class="vr-stat-key">נכשלו</div></div>
    <div class="vr-stat"><div class="vr-stat-val s-warn">${counts.WARN}</div><div class="vr-stat-key">אזהרות</div></div>
    <div class="vr-stat"><div class="vr-stat-val s-skip">${counts.SKIP}</div><div class="vr-stat-key">דולגו</div></div>
    <div class="vr-stat"><div class="vr-stat-val s-rate">${counts.passRate}%</div><div class="vr-stat-key">Pass Rate</div></div>
  </div>
  <table class="vr-table">
    <thead><tr><th>קטגוריה</th><th>שם הבדיקה</th><th>סטטוס</th><th>פרטים</th><th>זמן</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>
`;
  }

  /**
   * מריץ את כל הבדיקות ומציג UI report.
   */
  async function showReport() {
    // Remove existing report
    const existing = document.getElementById('pisim-report');
    if (existing) existing.remove();

    // Create loading indicator
    const loading = document.createElement('div');
    loading.id = 'pisim-report';
    loading.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#08101e;z-index:200000;display:flex;align-items:center;justify-content:center;color:#00d4ff;font-family:Heebo,sans-serif;font-size:16px;direction:rtl;';
    loading.innerHTML = '⏳ מריץ בדיקות ולידציה...';
    document.body.appendChild(loading);

    const summary = await runAll();
    loading.remove();

    const report = document.createElement('div');
    report.innerHTML = _buildReportHTML(summary);
    document.body.appendChild(report.firstElementChild);

    return summary;
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  global.PISimValidator = {
    run,
    runAll,
    showReport,
    categories: Object.keys(SUITES),
  };

})(typeof window !== 'undefined' ? window : globalThis);
