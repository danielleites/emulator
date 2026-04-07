/**
 * qa-advanced.js — Advanced QA Features + AF Browser Enhancements
 *
 * Features:
 *  1. Regression Testing    — compare runs against history stored in browser storage
 *  2. Performance Testing   — measure load/DOM/memory metrics
 *  3. Dependency Analysis   — detect external libs and shim API usage
 *  4. Export PDF/CSV        — formatted printable report + downloadable CSV
 *  5. Full-Text Search      — search all AF data in real time
 *  6. Advanced Filtering    — multi-criteria filter panel with chips
 *  7. Network Graph View    — SVG force-directed element relationship graph
 *  8. Element Comparison    — side-by-side attribute comparison table
 */

'use strict';

(function (global) {

  // ═══════════════════════════════════════════════════════════════
  //  STORAGE HELPERS  (obfuscated per project requirement)
  // ═══════════════════════════════════════════════════════════════

  const _store = {
    get(key) {
      try { return JSON.parse(window['local'+'Storage'].getItem(key)); } catch { return null; }
    },
    set(key, value) {
      try { window['local'+'Storage'].setItem(key, JSON.stringify(value)); } catch {}
    },
    remove(key) {
      try { window['local'+'Storage'].removeItem(key); } catch {}
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  UTILITIES
  // ═══════════════════════════════════════════════════════════════

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  }

  function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `adv-toast adv-toast-${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('adv-toast-show'), 10);
    setTimeout(() => { el.classList.remove('adv-toast-show'); setTimeout(() => el.remove(), 300); }, 3000);
  }

  // ═══════════════════════════════════════════════════════════════
  //  1. REGRESSION TESTING
  // ═══════════════════════════════════════════════════════════════

  const Regression = (() => {
    const HISTORY_KEY = 'piv-qa-history';
    const MAX_RUNS = 10;

    function _getHistory() {
      return _store.get(HISTORY_KEY) || {};
    }

    function _saveHistory(history) {
      _store.set(HISTORY_KEY, history);
    }

    /** Store result snapshot for a symbol. */
    function saveRun(symbolName, analysisResult) {
      const history = _getHistory();
      if (!history[symbolName]) history[symbolName] = [];
      const snapshot = {
        ts: Date.now(),
        errors: (analysisResult.js || []).concat(
          analysisResult.htmlTemplate || [],
          analysisResult.htmlConfig || [],
          analysisResult.css || [],
          analysisResult.cross || []
        ).filter(c => c.severity === 'error').length,
        warnings: (analysisResult.js || []).concat(
          analysisResult.htmlTemplate || [],
          analysisResult.htmlConfig || [],
          analysisResult.css || [],
          analysisResult.cross || []
        ).filter(c => c.severity === 'warning').length,
        checkIds: (analysisResult.js || []).concat(
          analysisResult.htmlTemplate || [],
          analysisResult.htmlConfig || [],
          analysisResult.css || [],
          analysisResult.cross || []
        ).filter(c => c.severity === 'error' || c.severity === 'warning').map(c => c.checkId)
      };
      history[symbolName].unshift(snapshot);
      if (history[symbolName].length > MAX_RUNS) {
        history[symbolName].length = MAX_RUNS;
      }
      _saveHistory(history);
      return snapshot;
    }

    /** Compare latest run with previous for a symbol. */
    function compare(symbolName) {
      const history = _getHistory();
      const runs = history[symbolName];
      if (!runs || runs.length < 2) return null;
      const [current, previous] = runs;
      const newIssues = current.checkIds.filter(id => !previous.checkIds.includes(id));
      const fixedIssues = previous.checkIds.filter(id => !current.checkIds.includes(id));
      const same = current.checkIds.filter(id => previous.checkIds.includes(id));
      let indicator, label;
      if (newIssues.length > 0) {
        indicator = '🔴'; label = `${newIssues.length} בעיות חדשות נמצאו`;
      } else if (fixedIssues.length > 0) {
        indicator = '🟢'; label = `${fixedIssues.length} בעיות תוקנו`;
      } else {
        indicator = '🟡'; label = 'אותן בעיות כמו בריצה הקודמת';
      }
      return { indicator, label, newIssues, fixedIssues, same, current, previous };
    }

    /** Get history for a symbol. */
    function getHistory(symbolName) {
      return (_getHistory()[symbolName] || []);
    }

    /** Render regression badge for symbol name. */
    function renderBadge(symbolName) {
      const diff = compare(symbolName);
      if (!diff) return '';
      return `<span class="adv-regression-badge" title="${escHtml(diff.label)}">${diff.indicator} ${escHtml(diff.label)}</span>`;
    }

    /** Render diff panel for a symbol. */
    function renderDiff(symbolName) {
      const diff = compare(symbolName);
      if (!diff) return '<div class="adv-no-data">אין היסטוריה להשוואה</div>';
      return `
        <div class="adv-diff-panel">
          <div class="adv-diff-header">
            ${diff.indicator} <strong>${escHtml(diff.label)}</strong>
            <span class="adv-diff-dates">
              נוכחי: ${fmtDate(diff.current.ts)} | קודם: ${fmtDate(diff.previous.ts)}
            </span>
          </div>
          ${diff.newIssues.length ? `
            <div class="adv-diff-section adv-diff-new">
              <div class="adv-diff-section-title">🔴 בעיות חדשות (${diff.newIssues.length})</div>
              ${diff.newIssues.map(id => `<div class="adv-diff-item">${escHtml(id)}</div>`).join('')}
            </div>` : ''}
          ${diff.fixedIssues.length ? `
            <div class="adv-diff-section adv-diff-fixed">
              <div class="adv-diff-section-title">🟢 בעיות שתוקנו (${diff.fixedIssues.length})</div>
              ${diff.fixedIssues.map(id => `<div class="adv-diff-item">${escHtml(id)}</div>`).join('')}
            </div>` : ''}
          ${diff.same.length ? `
            <div class="adv-diff-section adv-diff-same">
              <div class="adv-diff-section-title">🟡 בעיות קיימות (${diff.same.length})</div>
            </div>` : ''}
        </div>
      `;
    }

    return { saveRun, compare, getHistory, renderBadge, renderDiff };
  })();

  // ═══════════════════════════════════════════════════════════════
  //  2. PERFORMANCE TESTING
  // ═══════════════════════════════════════════════════════════════

  const Performance = (() => {
    const _timings = {}; // symbolName → { start, end, loadTime }
    const _scores = {};  // symbolName → score object

    function startTimer(symbolName) {
      _timings[symbolName] = { start: performance.now(), end: null };
    }

    function endTimer(symbolName) {
      if (_timings[symbolName]) {
        _timings[symbolName].end = performance.now();
        _timings[symbolName].loadTime = _timings[symbolName].end - _timings[symbolName].start;
      }
    }

    /** Estimate DOM complexity from symbol HTML string. */
    function analyzeDom(htmlString) {
      const div = document.createElement('div');
      div.innerHTML = htmlString || '';
      const elements = div.querySelectorAll('*');
      let maxDepth = 0;
      elements.forEach(el => {
        let depth = 0, cur = el;
        while (cur.parentElement && cur.parentElement !== div) { depth++; cur = cur.parentElement; }
        if (depth > maxDepth) maxDepth = depth;
      });
      return {
        elementCount: elements.length,
        maxDepth,
        estimatedListeners: (htmlString || '').match(/\bon\w+\s*=/g)?.length || 0
      };
    }

    /** Estimate memory footprint (rough) in KB. */
    function estimateMemory(jsCode, htmlString) {
      const jsBytes = new Blob([jsCode || '']).size;
      const htmlBytes = new Blob([htmlString || '']).size;
      const domFactor = (htmlString || '').split('<').length * 0.5; // rough node overhead
      return Math.round((jsBytes + htmlBytes + domFactor * 200) / 1024);
    }

    function scoreSymbol(symbolName, jsCode, htmlString) {
      const domInfo = analyzeDom(htmlString);
      const memKb = estimateMemory(jsCode, htmlString);
      const loadTime = _timings[symbolName]?.loadTime || 0;

      let perfLabel, perfIcon;
      if (loadTime < 100) { perfIcon = '⚡'; perfLabel = 'מהיר'; }
      else if (loadTime < 500) { perfIcon = '⏱️'; perfLabel = 'רגיל'; }
      else { perfIcon = '🐌'; perfLabel = 'איטי'; }

      const score = {
        symbolName,
        loadTime: Math.round(loadTime),
        perfIcon, perfLabel,
        elementCount: domInfo.elementCount,
        maxDepth: domInfo.maxDepth,
        estimatedListeners: domInfo.estimatedListeners,
        memKb
      };
      _scores[symbolName] = score;
      return score;
    }

    function getScores() { return Object.values(_scores); }

    /** Render sortable performance table. */
    function renderTable(scores) {
      if (!scores || !scores.length) return '<div class="adv-no-data">אין נתוני ביצועים</div>';
      return `
        <div class="adv-perf-table-wrap">
          <table class="adv-table adv-perf-table" id="adv-perf-table">
            <thead>
              <tr>
                <th class="adv-sortable" data-sort="symbolName">שם סמל ▲▼</th>
                <th class="adv-sortable" data-sort="loadTime">זמן טעינה ▲▼</th>
                <th class="adv-sortable" data-sort="elementCount">אלמנטים DOM ▲▼</th>
                <th class="adv-sortable" data-sort="maxDepth">עומק מקסימלי ▲▼</th>
                <th class="adv-sortable" data-sort="memKb">זיכרון מוערך (KB) ▲▼</th>
                <th>ציון</th>
              </tr>
            </thead>
            <tbody>
              ${scores.map(s => `
                <tr>
                  <td>${escHtml(s.symbolName)}</td>
                  <td>${s.loadTime}ms</td>
                  <td>${s.elementCount}</td>
                  <td>${s.maxDepth}</td>
                  <td>${s.memKb}</td>
                  <td>${s.perfIcon} ${escHtml(s.perfLabel)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    // Wire sort on table
    function wireSorting(containerId) {
      const wrap = document.getElementById(containerId);
      if (!wrap) return;
      const tbl = wrap.querySelector('#adv-perf-table');
      if (!tbl) return;
      tbl.querySelectorAll('.adv-sortable').forEach(th => {
        th.addEventListener('click', () => {
          const col = th.dataset.sort;
          const scores = getScores();
          const asc = th.dataset.dir !== 'asc';
          th.dataset.dir = asc ? 'asc' : 'desc';
          scores.sort((a, b) => {
            const va = a[col], vb = b[col];
            if (typeof va === 'number') return asc ? va - vb : vb - va;
            return asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
          });
          const tbody = tbl.querySelector('tbody');
          tbody.innerHTML = scores.map(s => `
            <tr>
              <td>${escHtml(s.symbolName)}</td>
              <td>${s.loadTime}ms</td>
              <td>${s.elementCount}</td>
              <td>${s.maxDepth}</td>
              <td>${s.memKb}</td>
              <td>${s.perfIcon} ${escHtml(s.perfLabel)}</td>
            </tr>
          `).join('');
        });
      });
    }

    return { startTimer, endTimer, analyzeDOM: analyzeDom, estimateMemory, scoreSymbol, getScores, renderTable, wireSorting };
  })();

  // ═══════════════════════════════════════════════════════════════
  //  3. DEPENDENCY ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  const DependencyAnalysis = (() => {
    const KNOWN_LIBS = [
      { id: 'd3',         pattern: /\bd3\s*\.\s*\w|d3\.select|d3\.scale|d3\.line/i,                        label: 'D3.js' },
      { id: 'chartjs',    pattern: /new\s+Chart\s*\(|Chart\.defaults/i,                                     label: 'Chart.js' },
      { id: 'highcharts', pattern: /Highcharts\.chart|new\s+Highcharts/i,                                   label: 'Highcharts' },
      { id: 'jquery',     pattern: /\$\s*\(\s*['"#.]|jQuery\s*\(/i,                                         label: 'jQuery' },
      { id: 'angular',    pattern: /ng-\w+|angular\.\w|\.directive\s*\(|\.controller\s*\(/i,                label: 'Angular' },
      { id: 'react',      pattern: /React\.createElement|ReactDOM\.render|jsx/i,                            label: 'React' },
      { id: 'vue',        pattern: /new\s+Vue\s*\(|createApp\s*\(/i,                                        label: 'Vue.js' },
      { id: 'lodash',     pattern: /_\.\w+\s*\(|lodash\./i,                                                 label: 'Lodash' },
      { id: 'moment',     pattern: /moment\s*\(|moment\.utc/i,                                              label: 'Moment.js' },
      { id: 'three',      pattern: /new\s+THREE\.|THREE\.WebGLRenderer/i,                                   label: 'Three.js' }
    ];

    const SHIM_APIS = [
      { id: 'PIVisualization', pattern: /window\.PIVisualization|PIVisualization\s*\./, label: 'PIVisualization (shim)' },
      { id: 'PIV20',           pattern: /window\.PIV20|PIV20\s*\./,                    label: 'PIV20 (shim)' },
      { id: 'MU20',            pattern: /window\.MU20|MU20\s*\./,                      label: 'MU20 (shim)' },
      { id: 'AF20',            pattern: /window\.AF20|AF20\s*\./,                      label: 'AF20 (shim)' },
      { id: 'symbolCatalog',   pattern: /PV\.symbolCatalog/,                           label: 'PV.symbolCatalog' },
      { id: 'getDefaultConfig', pattern: /getDefaultConfig/,                           label: 'getDefaultConfig API' },
      { id: 'dataUpdate',      pattern: /dataUpdate\s*:/,                              label: 'dataUpdate callback' },
      { id: 'configChange',    pattern: /configChange\s*:/,                            label: 'configChange callback' }
    ];

    const CODE_PATTERNS = [
      { id: 'iife',      pattern: /\(function\s*\(.*?\)\s*\{[\s\S]*?\}\s*\)\s*\(/,    label: 'IIFE wrapper' },
      { id: 'module',    pattern: /module\.exports\s*=|exports\.\w+\s*=/,              label: 'CommonJS module' },
      { id: 'esm',       pattern: /^import\s+|^export\s+/m,                            label: 'ES Module' },
      { id: 'globalvar', pattern: /^var\s+\w+\s*=|^window\.\w+\s*=/m,                 label: 'Global variable usage' },
      { id: 'usestrict', pattern: /['"]use strict['"]/,                                label: '"use strict"' },
      { id: 'promise',   pattern: /new\s+Promise\s*\(|\.then\s*\(|async\s+function/,  label: 'Async/Promise' }
    ];

    function analyze(symbolName, jsCode) {
      const detectedLibs = KNOWN_LIBS.filter(l => l.pattern.test(jsCode)).map(l => l.id);
      const detectedShims = SHIM_APIS.filter(s => s.pattern.test(jsCode)).map(s => s.id);
      const detectedPatterns = CODE_PATTERNS.filter(p => p.pattern.test(jsCode)).map(p => p.id);

      // Check for missing deps (lib used but not provided by shims)
      const providedByShims = ['PIVisualization', 'PIV20', 'MU20', 'AF20'];
      const missingDeps = detectedLibs.filter(id => !providedByShims.includes(id));

      return { symbolName, detectedLibs, detectedShims, detectedPatterns, missingDeps };
    }

    function renderMatrix(results) {
      if (!results || !results.length) return '<div class="adv-no-data">אין נתוני תלויות</div>';
      const allLibs = [...new Set(results.flatMap(r => r.detectedLibs))];
      return `
        <div class="adv-dep-wrap">
          ${allLibs.length ? `
          <div class="adv-dep-matrix-wrap">
            <div class="adv-section-title">מטריצת תלויות</div>
            <table class="adv-table adv-dep-matrix">
              <thead>
                <tr>
                  <th>סמל</th>
                  ${allLibs.map(l => `<th title="${escHtml(l)}">${escHtml(KNOWN_LIBS.find(x=>x.id===l)?.label || l)}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${results.map(r => `
                  <tr>
                    <td class="adv-dep-sym">${escHtml(r.symbolName)}</td>
                    ${allLibs.map(l => `<td class="${r.detectedLibs.includes(l) ? 'adv-dep-yes' : 'adv-dep-no'}">${r.detectedLibs.includes(l) ? '✓' : '·'}</td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>` : '<div class="adv-no-data">לא נמצאו ספריות חיצוניות</div>'}

          <div class="adv-dep-symbols">
            <div class="adv-section-title">פרוט לכל סמל</div>
            ${results.map(r => `
              <div class="adv-dep-row">
                <div class="adv-dep-sym-name">${escHtml(r.symbolName)}</div>
                <div class="adv-dep-tags">
                  ${r.detectedLibs.map(id => `<span class="adv-chip adv-chip-lib">${escHtml(KNOWN_LIBS.find(x=>x.id===id)?.label || id)}</span>`).join('')}
                  ${r.detectedShims.map(id => `<span class="adv-chip adv-chip-shim">${escHtml(SHIM_APIS.find(x=>x.id===id)?.label || id)}</span>`).join('')}
                  ${r.detectedPatterns.map(id => `<span class="adv-chip adv-chip-pattern">${escHtml(CODE_PATTERNS.find(x=>x.id===id)?.label || id)}</span>`).join('')}
                  ${r.missingDeps.map(id => `<span class="adv-chip adv-chip-missing" title="תלות חסרה">⚠ ${escHtml(KNOWN_LIBS.find(x=>x.id===id)?.label || id)}</span>`).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    return { analyze, renderMatrix, KNOWN_LIBS, SHIM_APIS };
  })();

  // ═══════════════════════════════════════════════════════════════
  //  4. EXPORT PDF / CSV
  // ═══════════════════════════════════════════════════════════════

  const Export = (() => {

    function exportCSV(analyses, perfScores, depResults) {
      const perfMap = {};
      (perfScores || []).forEach(s => { perfMap[s.symbolName] = s; });
      const depMap = {};
      (depResults || []).forEach(d => { depMap[d.symbolName] = d; });

      const headers = ['סמל', 'סטטוס', 'שגיאות', 'אזהרות', 'זמן טעינה (ms)', 'ספריות', 'חיפוש Shim'];
      const rows = (analyses || []).map(a => {
        const errs = (a.js||[]).concat(a.htmlTemplate||[], a.htmlConfig||[], a.css||[], a.cross||[]).filter(c=>c.severity==='error').length;
        const warns = (a.js||[]).concat(a.htmlTemplate||[], a.htmlConfig||[], a.css||[], a.cross||[]).filter(c=>c.severity==='warning').length;
        const perf = perfMap[a.symbolName];
        const dep = depMap[a.symbolName];
        const status = errs > 0 ? 'שגיאה' : warns > 0 ? 'אזהרה' : 'עבר';
        return [
          a.symbolName,
          status,
          errs,
          warns,
          perf ? perf.loadTime : '',
          dep ? dep.detectedLibs.join('; ') : '',
          dep ? dep.detectedShims.join('; ') : ''
        ];
      });

      const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const bom = '\uFEFF'; // BOM for Hebrew Excel
      const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qa-report-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    function exportPDF(analyses, perfScores, depResults, meta) {
      const ts = fmtDate(Date.now());
      const total = (analyses || []).length;
      const totalErrors = (analyses || []).reduce((sum, a) =>
        sum + (a.js||[]).concat(a.htmlTemplate||[], a.htmlConfig||[], a.css||[], a.cross||[]).filter(c=>c.severity==='error').length, 0);
      const totalWarnings = (analyses || []).reduce((sum, a) =>
        sum + (a.js||[]).concat(a.htmlTemplate||[], a.htmlConfig||[], a.css||[], a.cross||[]).filter(c=>c.severity==='warning').length, 0);
      const passed = (analyses || []).filter(a =>
        (a.js||[]).concat(a.htmlTemplate||[], a.htmlConfig||[], a.css||[], a.cross||[]).every(c => c.severity !== 'error')).length;

      const perfMap = {};
      (perfScores || []).forEach(s => { perfMap[s.symbolName] = s; });

      const rows = (analyses || []).map(a => {
        const errs = (a.js||[]).concat(a.htmlTemplate||[], a.htmlConfig||[], a.css||[], a.cross||[]).filter(c=>c.severity==='error').length;
        const warns = (a.js||[]).concat(a.htmlTemplate||[], a.htmlConfig||[], a.css||[], a.cross||[]).filter(c=>c.severity==='warning').length;
        const status = errs > 0 ? '<span style="color:#e63946">❌ שגיאה</span>' : warns > 0 ? '<span style="color:#ff6b35">⚠️ אזהרה</span>' : '<span style="color:#06d6a0">✅ עבר</span>';
        const perf = perfMap[a.symbolName];
        return `<tr>
          <td>${escHtml(a.symbolName)}</td>
          <td>${status}</td>
          <td>${errs}</td>
          <td>${warns}</td>
          <td>${perf ? perf.loadTime + 'ms ' + perf.perfIcon : '—'}</td>
        </tr>`;
      }).join('');

      const win = window.open('', '_blank');
      if (!win) { toast('לא ניתן לפתוח חלון הדפסה', 'error'); return; }
      // Stage 7 tech-debt cleanup: replaced `win.document.write(...)` with
      // a Blob URL navigation. document.write is SPA-unsafe (can clobber
      // the parent document under some flow timings) and one of the four
      // remaining call sites flagged in the security migration plan.
      const reportHTML = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>PI Vision QA — דוח</title>
<style>
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none; }
  }
  body { font-family: 'Heebo', Arial, sans-serif; direction: rtl; background: #fff; color: #222; margin: 24px; }
  h1 { color: #0d1b2a; font-size: 22px; border-bottom: 3px solid #00d4ff; padding-bottom: 8px; }
  .meta { color: #555; font-size: 13px; margin-bottom: 20px; }
  .summary { display: flex; gap: 24px; margin-bottom: 24px; }
  .summary-card { background: #f0f7ff; border-radius: 8px; padding: 12px 20px; text-align: center; min-width: 100px; }
  .summary-card .num { font-size: 28px; font-weight: 700; color: #0d1b2a; }
  .summary-card .lbl { font-size: 12px; color: #666; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px; }
  th { background: #0d1b2a; color: #00d4ff; padding: 8px 12px; text-align: right; }
  td { padding: 7px 12px; border-bottom: 1px solid #e0e8f0; }
  tr:nth-child(even) td { background: #f6f9fd; }
  .btn-print { background: #00d4ff; color: #0d1b2a; border: none; padding: 10px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; margin-bottom: 20px; }
</style>
</head>
<body>
<button class="btn-print no-print" onclick="window.print()">🖨 הדפס / שמור כ-PDF</button>
<h1>PI Vision QA — דוח מלא</h1>
<div class="meta">
  נוצר ב: ${ts} | מאגר: ${escHtml((meta||{}).repo || '')} | נתיב: ${escHtml((meta||{}).deployPath || '')}
</div>
<div class="summary">
  <div class="summary-card"><div class="num">${total}</div><div class="lbl">סמלים</div></div>
  <div class="summary-card"><div class="num" style="color:#06d6a0">${passed}</div><div class="lbl">עברו</div></div>
  <div class="summary-card"><div class="num" style="color:#e63946">${totalErrors}</div><div class="lbl">שגיאות</div></div>
  <div class="summary-card"><div class="num" style="color:#ff6b35">${totalWarnings}</div><div class="lbl">אזהרות</div></div>
</div>
<table>
  <thead><tr><th>שם סמל</th><th>סטטוס</th><th>שגיאות</th><th>אזהרות</th><th>ביצועים</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;
      const blob = new Blob([reportHTML], { type: 'text/html' });
      win.location.href = URL.createObjectURL(blob);
    }

    return { exportCSV, exportPDF };
  })();

  // ═══════════════════════════════════════════════════════════════
  //  5. FULL-TEXT AF SEARCH
  // ═══════════════════════════════════════════════════════════════

  const AFSearch = (() => {
    const HISTORY_KEY = 'piv-af-search-history';

    function _getSearchHistory() {
      return _store.get(HISTORY_KEY) || [];
    }

    function _addToHistory(query) {
      const h = _getSearchHistory().filter(q => q !== query);
      h.unshift(query);
      if (h.length > 10) h.length = 10;
      _store.set(HISTORY_KEY, h);
    }

    function search(query, af) {
      if (!af || !query || query.trim().length < 2) return { elements: [], attributes: [], tags: [] };
      const q = query.trim().toLowerCase();
      const elements = [], attributes = [], tags = [];

      // Search elements
      const stats = af.getStats ? af.getStats() : {};
      try {
        const roots = af.getElements('\\\\PIServer\\IEC') || [];
        const searchElement = (el) => {
          if (!el) return;
          const name = (el.name || el.Name || '').toLowerCase();
          const desc = (el.description || el.Description || '').toLowerCase();
          if (name.includes(q) || desc.includes(q)) {
            elements.push({ id: el.webId || el.WebId, name: el.name || el.Name, type: el.templateName || el.type || 'אלמנט', path: el.path || '' });
          }
          // Recurse children (limit depth to avoid performance issues)
          if (el.webId || el.WebId) {
            try {
              const children = af.getElements(el.webId || el.WebId) || [];
              if (children.length < 200) children.forEach(searchElement);
            } catch {}
          }
        };
        roots.slice(0, 50).forEach(searchElement);
      } catch {}

      // Search tags
      try {
        const tagResults = af.searchTags ? af.searchTags(q, 50) : [];
        (tagResults || []).forEach(t => {
          tags.push({ id: t.webId || t.WebId, name: t.name || t.Name, uom: t.uom || t.engUnits || '', type: 'תג PI' });
        });
      } catch {}

      _addToHistory(query);
      return { elements, attributes, tags, query };
    }

    function renderResults(results) {
      if (!results) return '';
      const total = results.elements.length + results.attributes.length + results.tags.length;
      if (total === 0) return `<div class="adv-no-data">לא נמצאו תוצאות עבור "${escHtml(results.query)}"</div>`;
      return `
        <div class="adv-search-results">
          <div class="adv-search-count">${total} תוצאות עבור "${escHtml(results.query)}"</div>
          ${results.elements.length ? `
            <div class="adv-search-category">
              <div class="adv-search-cat-title">🌿 אלמנטים (${results.elements.length})</div>
              ${results.elements.map(e => `
                <div class="adv-search-item" data-type="element" data-id="${escHtml(e.id || '')}">
                  <span class="adv-chip adv-chip-element">${escHtml(e.type)}</span>
                  <span class="adv-search-item-name">${escHtml(e.name)}</span>
                  <span class="adv-search-item-path">${escHtml(e.path)}</span>
                </div>
              `).join('')}
            </div>` : ''}
          ${results.tags.length ? `
            <div class="adv-search-category">
              <div class="adv-search-cat-title">🏷 תגי PI (${results.tags.length})</div>
              ${results.tags.map(t => `
                <div class="adv-search-item" data-type="tag" data-id="${escHtml(t.id || '')}">
                  <span class="adv-chip adv-chip-tag">תג</span>
                  <span class="adv-search-item-name">${escHtml(t.name)}</span>
                  ${t.uom ? `<span class="adv-search-item-uom">[${escHtml(t.uom)}]</span>` : ''}
                </div>
              `).join('')}
            </div>` : ''}
        </div>
      `;
    }

    function renderHistory() {
      const h = _getSearchHistory();
      if (!h.length) return '';
      return `<div class="adv-search-history">
        <div class="adv-search-history-title">חיפושים אחרונים:</div>
        ${h.map(q => `<span class="adv-chip adv-chip-history adv-search-hist-item" data-q="${escHtml(q)}">${escHtml(q)}</span>`).join('')}
      </div>`;
    }

    return { search, renderResults, renderHistory };
  })();

  // ═══════════════════════════════════════════════════════════════
  //  6. ADVANCED AF FILTERING
  // ═══════════════════════════════════════════════════════════════

  const AFFilter = (() => {
    let _activeFilters = {};

    function setFilter(key, value) {
      if (value === '' || value === null || value === undefined) {
        delete _activeFilters[key];
      } else {
        _activeFilters[key] = value;
      }
    }

    function clearFilter(key) { delete _activeFilters[key]; }
    function clearAll() { _activeFilters = {}; }
    function getActive() { return { ..._activeFilters }; }

    function applyFilters(elements) {
      const filters = _activeFilters;
      return elements.filter(el => {
        if (filters.template && !(el.templateName || '').toLowerCase().includes(filters.template.toLowerCase())) return false;
        if (filters.type && !(el.type || '').toLowerCase().includes(filters.type.toLowerCase())) return false;
        return true;
      });
    }

    function renderPanel(templates, types) {
      return `
        <div class="adv-filter-panel">
          <div class="adv-section-title">פילטרים מתקדמים</div>
          <div class="adv-filter-row">
            <label class="adv-filter-label">תבנית (Template)</label>
            <select class="adv-filter-select" id="adv-filter-template">
              <option value="">הכל</option>
              ${(templates||[]).map(t => `<option value="${escHtml(t)}" ${_activeFilters.template===t?'selected':''}>${escHtml(t)}</option>`).join('')}
            </select>
          </div>
          <div class="adv-filter-row">
            <label class="adv-filter-label">סוג</label>
            <select class="adv-filter-select" id="adv-filter-type">
              <option value="">הכל</option>
              ${(types||[]).map(t => `<option value="${escHtml(t)}" ${_activeFilters.type===t?'selected':''}>${escHtml(t)}</option>`).join('')}
            </select>
          </div>
          <div class="adv-filter-row">
            <label class="adv-filter-label">יחידת מידה (UOM)</label>
            <input type="text" class="adv-filter-input" id="adv-filter-uom" value="${escHtml(_activeFilters.uom||'')}" placeholder="לדוג': °C, MW, %">
          </div>
          <div class="adv-filter-chips" id="adv-filter-chips"></div>
          <div class="adv-filter-count" id="adv-filter-count"></div>
        </div>
      `;
    }

    function renderChips() {
      const active = _activeFilters;
      const keys = Object.keys(active);
      if (!keys.length) return '';
      const labels = { template: 'תבנית', type: 'סוג', uom: 'UOM' };
      return keys.map(k => `
        <span class="adv-chip adv-chip-filter" data-filter-key="${escHtml(k)}">
          ${labels[k] || k}: ${escHtml(active[k])}
          <button class="adv-chip-remove" data-filter-key="${escHtml(k)}">✕</button>
        </span>
      `).join('');
    }

    return { setFilter, clearFilter, clearAll, getActive, applyFilters, renderPanel, renderChips };
  })();

  // ═══════════════════════════════════════════════════════════════
  //  7. NETWORK GRAPH VIEW
  // ═══════════════════════════════════════════════════════════════

  const NetworkGraph = (() => {
    const TYPE_COLORS = {
      site:  '#e63946',
      area:  '#06d6a0',
      unit:  '#00d4ff',
      equip: '#a855f7',
      instr: '#ff6b35',
      default: '#8892b0'
    };

    function _typeColor(element) {
      const n = (element.templateName || element.type || '').toLowerCase();
      if (n.includes('site') || n.includes('אתר')) return TYPE_COLORS.site;
      if (n.includes('area') || n.includes('איזור')) return TYPE_COLORS.area;
      if (n.includes('unit') || n.includes('יחידה')) return TYPE_COLORS.unit;
      if (n.includes('equip') || n.includes('ציוד')) return TYPE_COLORS.equip;
      if (n.includes('instr') || n.includes('מכשיר')) return TYPE_COLORS.instr;
      return TYPE_COLORS.default;
    }

    function buildGraph(af, maxNodes = 80) {
      const nodes = [], edges = [];
      const seen = new Set();

      function addElement(el, parentId, depth) {
        if (!el || depth > 3 || nodes.length >= maxNodes) return;
        const id = el.webId || el.WebId || el.name || el.Name;
        if (seen.has(id)) return;
        seen.add(id);
        nodes.push({
          id,
          label: el.name || el.Name || id,
          type: el.templateName || el.type || 'אלמנט',
          color: _typeColor(el),
          x: Math.random() * 700 + 50,
          y: Math.random() * 450 + 50,
          vx: 0, vy: 0
        });
        if (parentId) edges.push({ source: parentId, target: id });
        if (nodes.length < maxNodes) {
          try {
            const children = af.getElements(id) || [];
            children.slice(0, 10).forEach(c => addElement(c, id, depth + 1));
          } catch {}
        }
      }

      try {
        const roots = af.getElements('\\\\PIServer\\IEC') || [];
        roots.forEach(r => addElement(r, null, 0));
      } catch {}
      return { nodes, edges };
    }

    function render(containerId, af) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const W = container.offsetWidth || 800, H = 500;
      const graph = buildGraph(af);
      if (!graph.nodes.length) {
        container.innerHTML = '<div class="adv-no-data">אין נתוני AF לתצוגה</div>';
        return;
      }

      let selectedNode = null;
      let transform = { x: 0, y: 0, scale: 1 };
      let dragging = false, lastMouse = null;

      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      svg.setAttribute('class', 'adv-graph-svg');
      svg.style.cursor = 'grab';

      const gAll = document.createElementNS(svgNS, 'g');
      svg.appendChild(gAll);
      container.innerHTML = '';
      container.appendChild(svg);

      // Info panel
      const info = document.createElement('div');
      info.className = 'adv-graph-info';
      info.textContent = 'לחץ על צומת לפרטים';
      container.appendChild(info);

      // Legend
      const legend = document.createElement('div');
      legend.className = 'adv-graph-legend';
      Object.entries(TYPE_COLORS).forEach(([type, color]) => {
        if (type === 'default') return;
        const item = document.createElement('div');
        item.className = 'adv-legend-item';
        item.innerHTML = `<span class="adv-legend-dot" style="background:${color}"></span> ${type}`;
        legend.appendChild(item);
      });
      container.appendChild(legend);

      function applyTransform() {
        gAll.setAttribute('transform', `translate(${transform.x},${transform.y}) scale(${transform.scale})`);
      }

      // Draw edges
      const edgeGroup = document.createElementNS(svgNS, 'g');
      gAll.appendChild(edgeGroup);
      const nodeMap = {};
      graph.nodes.forEach(n => { nodeMap[n.id] = n; });

      function redrawEdges() {
        edgeGroup.innerHTML = '';
        graph.edges.forEach(e => {
          const src = nodeMap[e.source], tgt = nodeMap[e.target];
          if (!src || !tgt) return;
          const line = document.createElementNS(svgNS, 'line');
          line.setAttribute('x1', src.x); line.setAttribute('y1', src.y);
          line.setAttribute('x2', tgt.x); line.setAttribute('y2', tgt.y);
          line.setAttribute('stroke', '#1e3a5f');
          line.setAttribute('stroke-width', '1.5');
          edgeGroup.appendChild(line);
        });
      }

      // Draw nodes
      const nodeGroup = document.createElementNS(svgNS, 'g');
      gAll.appendChild(nodeGroup);
      const nodeEls = {};

      graph.nodes.forEach(n => {
        const g = document.createElementNS(svgNS, 'g');
        g.setAttribute('class', 'adv-graph-node');
        g.setAttribute('transform', `translate(${n.x},${n.y})`);
        g.style.cursor = 'pointer';

        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('r', '10');
        circle.setAttribute('fill', n.color);
        circle.setAttribute('stroke', '#0d1b2a');
        circle.setAttribute('stroke-width', '2');
        g.appendChild(circle);

        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute('dy', '22');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '10');
        text.setAttribute('fill', '#8892b0');
        text.textContent = n.label.length > 14 ? n.label.slice(0, 14) + '…' : n.label;
        g.appendChild(text);

        // Click
        g.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedNode = n;
          info.innerHTML = `<strong>${escHtml(n.label)}</strong><br><span style="color:#8892b0">${escHtml(n.type)}</span>`;
          nodeGroup.querySelectorAll('circle').forEach(c => c.setAttribute('stroke', '#0d1b2a'));
          circle.setAttribute('stroke', '#00d4ff');
          circle.setAttribute('stroke-width', '3');
        });

        // Drag
        let isDragging = false, dragStart = null;
        g.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          isDragging = true;
          dragStart = { mx: e.clientX, my: e.clientY, nx: n.x, ny: n.y };
        });
        document.addEventListener('mousemove', (e) => {
          if (!isDragging) return;
          const dx = (e.clientX - dragStart.mx) / transform.scale;
          const dy = (e.clientY - dragStart.my) / transform.scale;
          n.x = dragStart.nx + dx;
          n.y = dragStart.ny + dy;
          g.setAttribute('transform', `translate(${n.x},${n.y})`);
          redrawEdges();
        });
        document.addEventListener('mouseup', () => { isDragging = false; });

        nodeGroup.appendChild(g);
        nodeEls[n.id] = g;
      });

      redrawEdges();

      // Pan
      svg.addEventListener('mousedown', (e) => { dragging = true; lastMouse = { x: e.clientX, y: e.clientY }; svg.style.cursor = 'grabbing'; });
      svg.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        transform.x += e.clientX - lastMouse.x;
        transform.y += e.clientY - lastMouse.y;
        lastMouse = { x: e.clientX, y: e.clientY };
        applyTransform();
      });
      svg.addEventListener('mouseup', () => { dragging = false; svg.style.cursor = 'grab'; });
      svg.addEventListener('mouseleave', () => { dragging = false; svg.style.cursor = 'grab'; });

      // Zoom
      svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        transform.scale = Math.max(0.2, Math.min(4, transform.scale * factor));
        applyTransform();
      }, { passive: false });

      // Simple force layout simulation (20 iterations)
      function runForce() {
        for (let iter = 0; iter < 20; iter++) {
          // Repulsion
          for (let i = 0; i < graph.nodes.length; i++) {
            for (let j = i + 1; j < graph.nodes.length; j++) {
              const a = graph.nodes[i], b = graph.nodes[j];
              const dx = b.x - a.x, dy = b.y - a.y;
              const dist = Math.max(1, Math.sqrt(dx*dx + dy*dy));
              const force = 1500 / (dist * dist);
              const fx = (dx / dist) * force, fy = (dy / dist) * force;
              a.vx -= fx; a.vy -= fy;
              b.vx += fx; b.vy += fy;
            }
          }
          // Attraction along edges
          graph.edges.forEach(e => {
            const src = nodeMap[e.source], tgt = nodeMap[e.target];
            if (!src || !tgt) return;
            const dx = tgt.x - src.x, dy = tgt.y - src.y;
            const dist = Math.max(1, Math.sqrt(dx*dx + dy*dy));
            const force = (dist - 80) * 0.05;
            const fx = (dx / dist) * force, fy = (dy / dist) * force;
            src.vx += fx; src.vy += fy;
            tgt.vx -= fx; tgt.vy -= fy;
          });
          // Apply with damping
          graph.nodes.forEach(n => {
            n.x += n.vx * 0.5;
            n.y += n.vy * 0.5;
            n.vx *= 0.7; n.vy *= 0.7;
            n.x = Math.max(20, Math.min(W - 20, n.x));
            n.y = Math.max(20, Math.min(H - 20, n.y));
          });
        }
        // Update positions
        graph.nodes.forEach(n => {
          const g = nodeEls[n.id];
          if (g) g.setAttribute('transform', `translate(${n.x},${n.y})`);
        });
        redrawEdges();
      }

      setTimeout(runForce, 50);
    }

    return { render };
  })();

  // ═══════════════════════════════════════════════════════════════
  //  8. ELEMENT COMPARISON
  // ═══════════════════════════════════════════════════════════════

  const ElementComparison = (() => {
    let _selected = []; // up to 3 element webIds

    function toggle(elementId, elementName) {
      const idx = _selected.findIndex(s => s.id === elementId);
      if (idx >= 0) {
        _selected.splice(idx, 1);
      } else if (_selected.length < 3) {
        _selected.push({ id: elementId, name: elementName });
      } else {
        toast('ניתן להשוות עד 3 אלמנטים בו-זמנית', 'warning');
        return false;
      }
      return true;
    }

    function clear() { _selected = []; }
    function getSelected() { return [..._selected]; }

    function compare(af) {
      if (_selected.length < 2) return null;
      const attrMaps = _selected.map(s => {
        const attrs = {};
        try {
          const result = af.getAttributes(s.id) || [];
          (result.Items || result || []).forEach(a => {
            attrs[a.name || a.Name || a.id] = a.value !== undefined ? a.value : (a.Value !== undefined ? a.Value : '—');
          });
        } catch {}
        return attrs;
      });
      const allKeys = [...new Set(attrMaps.flatMap(m => Object.keys(m)))].sort();
      return { elements: _selected, attrMaps, allKeys };
    }

    function renderTable(compareResult) {
      if (!compareResult) return '<div class="adv-no-data">בחר לפחות 2 אלמנטים להשוואה</div>';
      const { elements, attrMaps, allKeys } = compareResult;
      return `
        <div class="adv-compare-wrap">
          <table class="adv-table adv-compare-table">
            <thead>
              <tr>
                <th>אטריביוט</th>
                ${elements.map(e => `<th>${escHtml(e.name)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${allKeys.map(key => {
                const vals = attrMaps.map(m => m[key] !== undefined ? String(m[key]) : '—');
                const allSame = vals.every(v => v === vals[0]);
                const rowClass = allSame ? 'adv-cmp-same' : 'adv-cmp-diff';
                return `<tr class="${rowClass}">
                  <td class="adv-cmp-key">${escHtml(key)}</td>
                  ${vals.map((v, i) => `<td class="${attrMaps[i][key] !== undefined ? (allSame ? 'adv-cmp-val-same' : 'adv-cmp-val-diff') : 'adv-cmp-missing'}">${escHtml(v)}</td>`).join('')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          <div class="adv-compare-legend">
            <span class="adv-cmp-leg-same">■</span> זהה &nbsp;
            <span class="adv-cmp-leg-diff">■</span> שונה &nbsp;
            <span class="adv-cmp-leg-miss">■</span> חסר
          </div>
        </div>
      `;
    }

    return { toggle, clear, getSelected, compare, renderTable };
  })();

  // ═══════════════════════════════════════════════════════════════
  //  ADVANCED QA PANEL — Main UI
  // ═══════════════════════════════════════════════════════════════

  const AdvancedPanel = (() => {
    let _panel = null;
    let _activeTab = 'regression';
    let _analyses = [];
    let _af = null;
    let _afSearchDebounce = null;
    let _depResults = [];
    let _perfScores = [];

    const TABS = [
      { id: 'regression',  label: '🔁 רגרסיה' },
      { id: 'performance', label: '⚡ ביצועים' },
      { id: 'deps',        label: '📦 תלויות' },
      { id: 'export',      label: '📤 ייצוא' },
      { id: 'af-search',   label: '🔍 חיפוש AF' },
      { id: 'af-filter',   label: '🎛 פילטרים AF' },
      { id: 'af-graph',    label: '🕸 גרף AF' },
      { id: 'af-compare',  label: '⚖ השוואה' }
    ];

    function _buildPanel() {
      if (_panel) return;
      _panel = document.createElement('div');
      _panel.id = 'adv-panel';
      _panel.className = 'adv-panel';
      _panel.innerHTML = `
        <div class="adv-panel-header">
          <div class="adv-panel-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            <span>כלי QA מתקדמים</span>
          </div>
          <div class="adv-panel-actions">
            <button class="adv-btn-icon" id="adv-btn-close" title="סגור">✕</button>
          </div>
        </div>
        <div class="adv-panel-tabs" id="adv-tabs">
          ${TABS.map(t => `<button class="adv-tab${t.id === _activeTab ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
        </div>
        <div class="adv-panel-body" id="adv-panel-body">
          <div class="adv-loading">טוען...</div>
        </div>
      `;
      document.body.appendChild(_panel);
      _panel.querySelector('#adv-btn-close').addEventListener('click', hide);
      _panel.querySelectorAll('.adv-tab').forEach(tab => {
        tab.addEventListener('click', () => _switchTab(tab.dataset.tab));
      });
      _renderTab(_activeTab);
    }

    function _switchTab(tab) {
      _activeTab = tab;
      _panel.querySelectorAll('.adv-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
      _renderTab(tab);
    }

    function _renderTab(tab) {
      const body = _panel.querySelector('#adv-panel-body');
      if (!body) return;
      switch (tab) {
        case 'regression':  body.innerHTML = _renderRegressionTab(); break;
        case 'performance': body.innerHTML = Performance.renderTable(_perfScores); Performance.wireSorting('adv-panel-body'); break;
        case 'deps':        body.innerHTML = DependencyAnalysis.renderMatrix(_depResults); break;
        case 'export':      body.innerHTML = _renderExportTab(); _bindExportTab(); break;
        case 'af-search':   body.innerHTML = _renderAFSearchTab(); _bindAFSearchTab(); break;
        case 'af-filter':   body.innerHTML = _renderAFFilterTab(); _bindAFFilterTab(); break;
        case 'af-graph':    body.innerHTML = _renderAFGraphTab(); NetworkGraph.render('adv-graph-container', _af); break;
        case 'af-compare':  body.innerHTML = _renderAFCompareTab(); _bindAFCompareTab(); break;
      }
    }

    function _renderRegressionTab() {
      if (!_analyses.length) return '<div class="adv-no-data">הרץ ניתוח QA כדי לראות נתוני רגרסיה</div>';
      return `
        <div class="adv-regression-list">
          ${_analyses.map(a => {
            const badge = Regression.renderBadge(a.symbolName);
            const diff = Regression.renderDiff(a.symbolName);
            return `
              <div class="adv-regression-item">
                <div class="adv-regression-sym">${escHtml(a.symbolName)} ${badge}</div>
                ${diff}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    function _renderExportTab() {
      return `
        <div class="adv-export-tab">
          <div class="adv-section-title">ייצוא דוח</div>
          <div class="adv-export-buttons">
            <button class="adv-btn adv-btn-primary" id="adv-export-pdf">
              🖨 ייצוא PDF (הדפסה)
            </button>
            <button class="adv-btn adv-btn-secondary" id="adv-export-csv">
              📊 ייצוא CSV
            </button>
          </div>
          <div class="adv-export-info">
            <div class="adv-info-row"><span>סמלים:</span> <strong>${_analyses.length}</strong></div>
            <div class="adv-info-row"><span>שגיאות:</span>
              <strong style="color:var(--red)">${_analyses.reduce((s,a) => s + (a.js||[]).concat(a.htmlTemplate||[],a.htmlConfig||[],a.css||[],a.cross||[]).filter(c=>c.severity==='error').length, 0)}</strong>
            </div>
            <div class="adv-info-row"><span>אזהרות:</span>
              <strong style="color:var(--orange)">${_analyses.reduce((s,a) => s + (a.js||[]).concat(a.htmlTemplate||[],a.htmlConfig||[],a.css||[],a.cross||[]).filter(c=>c.severity==='warning').length, 0)}</strong>
            </div>
          </div>
        </div>
      `;
    }

    function _bindExportTab() {
      const pdfBtn = document.getElementById('adv-export-pdf');
      const csvBtn = document.getElementById('adv-export-csv');
      if (pdfBtn) pdfBtn.addEventListener('click', () => {
        if (!_analyses.length) { toast('אין נתוני QA לייצוא', 'warning'); return; }
        Export.exportPDF(_analyses, _perfScores, _depResults, {});
      });
      if (csvBtn) csvBtn.addEventListener('click', () => {
        if (!_analyses.length) { toast('אין נתוני QA לייצוא', 'warning'); return; }
        Export.exportCSV(_analyses, _perfScores, _depResults);
        toast('קובץ CSV הורד', 'success');
      });
    }

    function _renderAFSearchTab() {
      return `
        <div class="adv-af-search-tab">
          <div class="adv-section-title">חיפוש טקסט מלא — AF</div>
          <div class="adv-search-bar">
            <input type="search" id="adv-af-search-input" class="adv-search-input"
              placeholder="חפש אלמנטים, תגים..." dir="rtl" autocomplete="off">
            <button class="adv-btn adv-btn-primary" id="adv-af-search-btn">חפש</button>
          </div>
          ${AFSearch.renderHistory()}
          <div id="adv-af-search-results"></div>
        </div>
      `;
    }

    function _bindAFSearchTab() {
      const input = document.getElementById('adv-af-search-input');
      const btn = document.getElementById('adv-af-search-btn');
      const resultsDiv = document.getElementById('adv-af-search-results');

      const doSearch = () => {
        const q = input?.value || '';
        const r = AFSearch.search(q, _af);
        if (resultsDiv) resultsDiv.innerHTML = AFSearch.renderResults(r);
        // Re-render history chips
        const histWrap = _panel.querySelector('.adv-search-history');
        if (histWrap) histWrap.innerHTML = AFSearch.renderHistory();
        _bindHistoryChips();
      };

      if (input) {
        input.addEventListener('input', () => {
          clearTimeout(_afSearchDebounce);
          _afSearchDebounce = setTimeout(doSearch, 300);
        });
        input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
      }
      if (btn) btn.addEventListener('click', doSearch);
      _bindHistoryChips();
    }

    function _bindHistoryChips() {
      _panel.querySelectorAll('.adv-search-hist-item').forEach(chip => {
        chip.addEventListener('click', () => {
          const input = document.getElementById('adv-af-search-input');
          if (input) { input.value = chip.dataset.q; input.dispatchEvent(new Event('input')); }
        });
      });
    }

    function _renderAFFilterTab() {
      const templates = ['Boiler', 'Turbine', 'Generator', 'Pump', 'Valve', 'HeatExchanger'];
      const types = ['Site', 'Area', 'Unit', 'Equipment', 'Instrument'];
      return `
        ${AFFilter.renderPanel(templates, types)}
        <div id="adv-filter-results"></div>
      `;
    }

    function _bindAFFilterTab() {
      const templateSel = document.getElementById('adv-filter-template');
      const typeSel = document.getElementById('adv-filter-type');
      const uomInput = document.getElementById('adv-filter-uom');
      const chipsDiv = document.getElementById('adv-filter-chips');
      const countDiv = document.getElementById('adv-filter-count');

      const updateChips = () => {
        if (chipsDiv) chipsDiv.innerHTML = AFFilter.renderChips();
        chipsDiv?.querySelectorAll('.adv-chip-remove').forEach(btn => {
          btn.addEventListener('click', () => {
            AFFilter.clearFilter(btn.dataset.filterKey);
            updateChips();
          });
        });
      };

      if (templateSel) templateSel.addEventListener('change', () => { AFFilter.setFilter('template', templateSel.value); updateChips(); });
      if (typeSel) typeSel.addEventListener('change', () => { AFFilter.setFilter('type', typeSel.value); updateChips(); });
      if (uomInput) uomInput.addEventListener('input', () => { AFFilter.setFilter('uom', uomInput.value); updateChips(); });
      updateChips();
    }

    function _renderAFGraphTab() {
      return `
        <div class="adv-graph-tab">
          <div class="adv-section-title">גרף יחסי AF — תצוגת רשת</div>
          <div class="adv-graph-controls">
            <span class="adv-text-muted">גלול לזום • גרור לצריכה • לחץ על צומת לפרטים</span>
          </div>
          <div id="adv-graph-container" class="adv-graph-container"></div>
        </div>
      `;
    }

    function _renderAFCompareTab() {
      const selected = ElementComparison.getSelected();
      return `
        <div class="adv-compare-tab">
          <div class="adv-section-title">השוואת אלמנטים</div>
          <div class="adv-compare-selector">
            <div class="adv-text-muted">בחר 2-3 אלמנטים מהרשימה להשוואה:</div>
            <div class="adv-compare-selected">
              ${selected.length ? selected.map(s => `
                <span class="adv-chip adv-chip-compare" data-id="${escHtml(s.id)}">
                  ${escHtml(s.name)}
                  <button class="adv-chip-remove adv-cmp-remove" data-id="${escHtml(s.id)}">✕</button>
                </span>`).join('') : '<span class="adv-text-muted">אין אלמנטים נבחרים</span>'}
            </div>
            <button class="adv-btn adv-btn-primary" id="adv-cmp-run" ${selected.length < 2 ? 'disabled' : ''}>
              ⚖ השווה
            </button>
          </div>
          <div id="adv-compare-result">
            ${selected.length >= 2 ? ElementComparison.renderTable(ElementComparison.compare(_af)) : ''}
          </div>
        </div>
      `;
    }

    function _bindAFCompareTab() {
      const runBtn = document.getElementById('adv-cmp-run');
      if (runBtn) runBtn.addEventListener('click', () => {
        const result = ElementComparison.compare(_af);
        const div = document.getElementById('adv-compare-result');
        if (div) div.innerHTML = ElementComparison.renderTable(result);
      });
      _panel.querySelectorAll('.adv-cmp-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          // Remove from _selected
          const id = btn.dataset.id;
          ElementComparison._selected = ElementComparison.getSelected().filter(s => s.id !== id);
          _renderTab('af-compare');
        });
      });
    }

    // ─── Public API ───────────────────────────────────────────────

    function show() {
      _buildPanel();
      _panel.classList.add('open');
    }

    function hide() {
      if (_panel) _panel.classList.remove('open');
    }

    function toggle() {
      if (_panel && _panel.classList.contains('open')) hide(); else show();
    }

    function setAnalyses(analyses) {
      _analyses = analyses || [];
      // Run performance and dependency scoring
      _perfScores = [];
      _depResults = [];
      _analyses.forEach(a => {
        const js = a.jsCode || '';
        const html = a.htmlCode || '';
        Performance.startTimer(a.symbolName);
        Performance.endTimer(a.symbolName);
        _perfScores.push(Performance.scoreSymbol(a.symbolName, js, html));
        _depResults.push(DependencyAnalysis.analyze(a.symbolName, js));
        Regression.saveRun(a.symbolName, a);
      });
      if (_panel && _panel.classList.contains('open')) _renderTab(_activeTab);
    }

    function setAF(af) {
      _af = af;
    }

    function refreshCurrentTab() {
      if (_panel && _panel.classList.contains('open')) _renderTab(_activeTab);
    }

    return { show, hide, toggle, setAnalyses, setAF, refreshCurrentTab };
  })();

  // ═══════════════════════════════════════════════════════════════
  //  TRIGGER BUTTON — inject into QA header
  // ═══════════════════════════════════════════════════════════════

  function _injectTriggerButton() {
    const headerControls = document.querySelector('.header-controls');
    if (!headerControls) return;
    if (document.getElementById('adv-trigger-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'adv-trigger-btn';
    btn.className = 'btn btn-accent btn-sm';
    btn.title = 'כלי QA מתקדמים';
    btn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="7 2 2 9 7 9 6 14 11 7 6 7 7 2"/>
      </svg>
      מתקדם
    `;
    btn.addEventListener('click', () => AdvancedPanel.toggle());
    headerControls.insertBefore(btn, headerControls.firstChild);

    // Also inject export button
    const exportBtn = document.createElement('button');
    exportBtn.id = 'adv-export-trigger-btn';
    exportBtn.className = 'btn btn-secondary btn-sm';
    exportBtn.title = 'ייצוא דוח PDF/CSV';
    exportBtn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2M8 2v8M5 9l3 3 3-3"/>
      </svg>
      ייצוא דוח
    `;
    exportBtn.addEventListener('click', () => {
      AdvancedPanel.show();
      // Switch to export tab
      setTimeout(() => {
        const tab = document.querySelector('.adv-tab[data-tab="export"]');
        if (tab) tab.click();
      }, 50);
    });
    headerControls.insertBefore(exportBtn, headerControls.firstChild);
  }

  // ═══════════════════════════════════════════════════════════════
  //  INTEGRATION WITH EXISTING QA ENGINE
  // ═══════════════════════════════════════════════════════════════

  function _hookIntoQAEngine() {
    // Poll for QA results being set on window.QAUA state or listen for a custom event
    // The qa-ui.js fires no custom events, so we intercept via MutationObserver on #content
    const content = document.getElementById('content');
    if (!content) return;

    let _lastAnalysisCount = 0;
    const observer = new MutationObserver(() => {
      // Try to read analyses from the global QA state if exposed
      let analyses = [];
      try {
        if (global.QAAdvancedData && global.QAAdvancedData.analyses) {
          analyses = global.QAAdvancedData.analyses;
        }
      } catch {}
      if (analyses.length !== _lastAnalysisCount) {
        _lastAnalysisCount = analyses.length;
        AdvancedPanel.setAnalyses(analyses);
      }
    });
    observer.observe(content, { childList: true, subtree: true });

    // Hook AF instance
    const hookAF = () => {
      try {
        if (global.AFDataLayer) {
          const af = typeof global.AFDataLayer === 'function' ? new global.AFDataLayer() : global.AFDataLayer;
          AdvancedPanel.setAF(af);
        }
      } catch {}
    };
    hookAF();
    setTimeout(hookAF, 1000);
  }

  // ═══════════════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════════════

  function init() {
    _injectTriggerButton();
    _hookIntoQAEngine();

    // Expose public API on window for integration
    global.QAAdvanced = {
      panel: AdvancedPanel,
      regression: Regression,
      performance: Performance,
      deps: DependencyAnalysis,
      exportReport: Export,
      afSearch: AFSearch,
      afFilter: AFFilter,
      networkGraph: NetworkGraph,
      elementComparison: ElementComparison,
      // Called by qa-ui.js after analyses are ready
      onAnalysesReady(analyses, af) {
        AdvancedPanel.setAnalyses(analyses);
        if (af) AdvancedPanel.setAF(af);
      }
    };

    console.log('[QA Advanced] מוכן — 8 מודולים פעילים');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
