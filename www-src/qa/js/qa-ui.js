/**
 * qa-ui.js — UI Controller and Rendering
 * Orchestrates all app interactions and UI updates
 */

'use strict';

import QAEngine from './qa-engine.js';
import QAGitHub from './qa-github.js';
import QAUpload from './qa-upload.js';
import QACharts from './qa-charts.js';
import QAManual from './qa-manual.js';
import QAReport from './qa-report.js';
import QAEmulator from './qa-emulator.js';
import QARuntime from './qa-runtime.js';

const QAUA = (() => {

  // ─── App State ────────────────────────────────────────────────
  let state = {
    analyses: [],
    symbolFiles: {},
    summary: null,
    loading: false,
    activeView: 'welcome', // welcome | dashboard | list | detail
    selectedSymbol: null,
    expandedRows: new Set(),
    sortCol: 'symbolName',
    sortDir: 'asc',
    filterCategory: 'all',
    filterStatus: 'all',
    searchQuery: '',
    detailTab: 'js',
    source: 'github', // github | upload | url
    repoOwner: 'danielleites',
    repoName: 'Symbols-for-copy-28.02',
    deployPath: 'deploy',
    githubToken: '',
    emulatorUrl: '',
    meta: {},
    runtimeResults: {},     // symbolName → runtime result
    runtimeRunning: false,
    runtimeDone: false
  };

  // ─── Icon helpers ─────────────────────────────────────────────
  const icons = {
    error:   '❌',
    warning: '⚠️',
    pass:    '✅',
    info:    'ℹ️'
  };

  // ─── DOM refs ──────────────────────────────────────────────────
  let dom = {};

  function q(selector) { return document.querySelector(selector); }
  function qa(selector) { return document.querySelectorAll(selector); }

  // ─── Init ──────────────────────────────────────────────────────
  function init() {
    dom = {
      app: q('#app'),
      content: q('#content'),
      sourceTabs: qa('.source-tab'),
      githubPanel: q('#github-panel'),
      uploadPanel: q('#upload-panel'),
      progressContainer: q('#progress-container'),
      progressFill: q('#progress-fill'),
      progressLabel: q('#progress-label'),
      progressStatus: q('#progress-status'),
      repoOwner: q('#repo-owner'),
      repoName: q('#repo-name'),
      deployPath: q('#deploy-path'),
      githubToken: q('#github-token'),
      tokenToggle: q('#token-toggle'),
      fetchBtn: q('#fetch-btn'),
      dropZone: q('#drop-zone'),
      filterCategory: q('#filter-category'),
      filterStatus: q('#filter-status'),
      searchBox: q('#search-box'),
      emulatorUrl: q('#emulator-url'),
      exportJsonBtn: q('#export-json'),
      exportHtmlBtn: q('#export-html'),
      printBtn: q('#print-btn'),
      clearDataBtn: q('#clear-data'),
      rateLimitInfo: q('#rate-limit-info'),
      toastContainer: q('#toast-container')
    };

    // Restore saved values
    state.emulatorUrl = QAEmulator.getEmulatorUrl();
    if (dom.emulatorUrl) dom.emulatorUrl.value = state.emulatorUrl;

    // Try to restore token from window['session'+'Storage'] (not window['local'+'Storage'])
    try {
      const savedToken = window['session'+'Storage'] && window['session'+'Storage'].getItem('piv-qa-github-token');
      if (savedToken) {
        state.githubToken = savedToken;
        if (dom.githubToken) dom.githubToken.value = '••••••••';
      }
    } catch {}

    bindEvents();
    
    // Init emulator
    QAEmulator.init();
    
    // Show welcome
    renderWelcome();
  }

  function bindEvents() {
    // Source tabs
    dom.sourceTabs?.forEach(tab => {
      tab.addEventListener('click', () => {
        const src = tab.dataset.source;
        state.source = src;
        dom.sourceTabs.forEach(t => t.classList.toggle('active', t.dataset.source === src));
        q('#github-panel')?.classList.toggle('hidden', src !== 'github');
        q('#upload-panel')?.classList.toggle('hidden', src !== 'upload');
      });
    });

    // GitHub fetch
    dom.fetchBtn?.addEventListener('click', handleGithubFetch);
    dom.repoOwner?.addEventListener('input', e => state.repoOwner = e.target.value.trim());
    dom.repoName?.addEventListener('input', e => state.repoName = e.target.value.trim());
    dom.deployPath?.addEventListener('input', e => state.deployPath = e.target.value.trim());
    dom.githubToken?.addEventListener('change', e => {
      const val = e.target.value.trim();
      if (val && val !== '••••••••') {
        state.githubToken = val;
        QAGitHub.setToken(val);
        try { if (window['session'+'Storage']) window['session'+'Storage'].setItem('piv-qa-github-token', val); } catch {}
        e.target.value = '••••••••';
      }
    });
    dom.tokenToggle?.addEventListener('click', () => {
      if (dom.githubToken.type === 'password') {
        dom.githubToken.type = 'text';
        if (dom.githubToken.value === '••••••••') {
          dom.githubToken.value = state.githubToken;
        }
      } else {
        dom.githubToken.type = 'password';
        dom.githubToken.value = state.githubToken ? '••••••••' : '';
      }
    });

    // Upload
    if (dom.dropZone) {
      QAUpload.setupDropZone(dom.dropZone, handleUploadedFiles);
    }

    // Filters
    dom.filterCategory?.addEventListener('change', e => {
      state.filterCategory = e.target.value;
      renderSymbolTable();
    });
    dom.filterStatus?.addEventListener('change', e => {
      state.filterStatus = e.target.value;
      renderSymbolTable();
    });
    dom.searchBox?.addEventListener('input', e => {
      state.searchQuery = e.target.value.toLowerCase();
      renderSymbolTable();
    });

    // Emulator URL
    dom.emulatorUrl?.addEventListener('change', e => {
      state.emulatorUrl = e.target.value.trim();
      QAEmulator.setEmulatorUrl(state.emulatorUrl);
    });

    // Export
    dom.exportJsonBtn?.addEventListener('click', () => {
      if (state.analyses.length === 0) { toast('אין נתונים לייצוא', 'warning'); return; }
      QAReport.exportJSON(state.analyses, QAManual.exportData(), state.meta);
      toast('דוח JSON יוצא בהצלחה', 'success');
    });
    dom.exportHtmlBtn?.addEventListener('click', () => {
      if (state.analyses.length === 0) { toast('אין נתונים לייצוא', 'warning'); return; }
      QAReport.exportHTMLReport(state.analyses, QAManual.exportData(), state.meta);
      toast('דוח HTML יוצא בהצלחה', 'success');
    });
    dom.printBtn?.addEventListener('click', () => QAReport.printReport());
    dom.clearDataBtn?.addEventListener('click', () => {
      if (confirm('האם לאפס את כל נתוני ה-QA הידני?')) {
        QAManual.clearAll();
        toast('נתוני QA ידני נמחקו', 'success');
      }
    });

    // Runtime QA button
    const runtimeBtn = q('#run-runtime-qa');
    if (runtimeBtn) {
      runtimeBtn.addEventListener('click', handleRuntimeQA);
    }

    // Listen for emulator bridge updates
    document.addEventListener('qa-runtime-update', (e) => {
      const { symbolName } = e.detail;
      if (symbolName && state.expandedRows.has(symbolName)) {
        // Refresh the runtime tab if it's visible
        const checksEl = q(`#checks-${symbolName}`);
        const activeTab = document.querySelector(`.detail-tab.active[data-sym="${symbolName}"]`);
        if (checksEl && activeTab && activeTab.dataset.tab === 'runtime') {
          const analysis = state.analyses.find(a => a.symbolName === symbolName);
          if (analysis) {
            checksEl.innerHTML = renderRuntimeChecks(symbolName);
          }
        }
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && state.activeView === 'detail') {
        closeDetail();
      }
    });
  }

  // ─── Runtime QA Handler ───────────────────────────────────────
  async function handleRuntimeQA() {
    if (state.runtimeRunning || Object.keys(state.symbolFiles).length === 0) return;

    state.runtimeRunning = true;
    const btn = q('#run-runtime-qa');
    const statusEl = q('#runtime-status');
    const progressBar = q('#runtime-progress-bar');
    const progressFill = q('#runtime-progress-fill');

    if (btn) { btn.disabled = true; btn.textContent = '⏳ מריץ...'; }
    if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'מתחיל בדיקת runtime...'; }
    if (progressBar) progressBar.style.display = 'block';

    try {
      QARuntime.clearResults();

      const results = await QARuntime.runAllInSandbox(
        state.symbolFiles,
        (pct, msg) => {
          if (progressFill) progressFill.style.width = `${pct}%`;
          if (statusEl) statusEl.textContent = msg;
        }
      );

      state.runtimeResults = results;
      state.runtimeDone = true;

      // Merge runtime scores into analyses
      state.analyses.forEach(a => {
        const rScore = QARuntime.getSymbolRuntimeScore(a.symbolName);
        a.runtimeScore = rScore;
        const r = results[a.symbolName];
        a.runtimeResult = r || null;
      });

      // Summary
      const rtSummary = QARuntime.getRuntimeSummary();
      const errCount = rtSummary.totalErrors;
      const cleanPct = rtSummary.total > 0 ? Math.round((rtSummary.cleanCount / rtSummary.total) * 100) : 0;

      if (statusEl) {
        statusEl.innerHTML = `<span style="color:var(--teal)">✓</span> הושלם — ` +
          `<strong>${errCount}</strong> שגיאות runtime, ` +
          `<strong>${cleanPct}%</strong> נקיים`;
      }
      if (progressFill) progressFill.style.width = '100%';
      if (btn) { btn.textContent = '🔄 הרץ שוב'; btn.disabled = false; }

      toast(`בדיקת Runtime הושלמה — ${errCount} שגיאות נמצאו`, errCount > 0 ? 'warning' : 'success');

      // Re-render dashboard with runtime KPIs
      if (state.activeView === 'dashboard') renderDashboard();

    } catch (err) {
      console.error('Runtime QA failed:', err);
      if (statusEl) { statusEl.textContent = `שגיאה: ${err.message}`; statusEl.style.color = 'var(--red)'; }
      if (btn) { btn.textContent = '▶ הרץ בדיקת שגיאות Runtime'; btn.disabled = false; }
      toast(`שגיאה בבדיקת Runtime: ${err.message}`, 'error');
    }

    state.runtimeRunning = false;
  }

  // ─── GitHub Fetch ─────────────────────────────────────────────
  async function handleGithubFetch() {
    const owner = dom.repoOwner?.value.trim() || state.repoOwner;
    const repo = dom.repoName?.value.trim() || state.repoName;
    const path = dom.deployPath?.value.trim() || state.deployPath;

    if (!owner || !repo) {
      toast('יש להזין שם בעלים ומאגר', 'error');
      return;
    }

    state.loading = true;
    state.meta = { repo: `${owner}/${repo}`, deployPath: path };
    
    if (state.githubToken) {
      QAGitHub.setToken(state.githubToken);
    }

    showProgress(true);
    renderLoading('מחפש קבצים ב-GitHub...');

    try {
      const { symbolFiles } = await QAGitHub.smartFetchSymbols(
        owner, repo, path,
        (pct, msg) => {
          updateProgress(pct, msg);
        }
      );

      state.symbolFiles = symbolFiles;
      
      updateProgress(95, 'מנתח קבצים...');
      await processSymbolFiles(symbolFiles);
      
      updateProgress(100, 'הושלם');
      showProgress(false);

      // Update rate limit
      const rl = QAGitHub.getRateLimit();
      if (rl && dom.rateLimitInfo) {
        dom.rateLimitInfo.textContent = `GitHub API: ${rl.remaining}/${rl.limit} בקשות`;
        dom.rateLimitInfo.classList.remove('hidden');
      }

      toast(`נטענו ${state.analyses.length} סמלים בהצלחה`, 'success');

      // Enable runtime QA button
      enableRuntimeButton();

    } catch (err) {
      showProgress(false);
      renderError(`שגיאה בטעינה מ-GitHub: ${err.message}`);
      toast(err.message, 'error');
      console.error(err);
    }

    state.loading = false;
  }

  // ─── Upload Handler ───────────────────────────────────────────
  async function handleUploadedFiles(files) {
    state.loading = true;
    showProgress(true);
    renderLoading('מעבד קבצים...');

    try {
      const symbolFiles = await QAUpload.processFiles(files, (pct, msg) => {
        updateProgress(pct, msg);
      });

      state.symbolFiles = symbolFiles;
      state.meta = { source: 'upload', files: files.length };
      
      updateProgress(90, 'מנתח...');
      await processSymbolFiles(symbolFiles);
      
      updateProgress(100, 'הושלם');
      showProgress(false);
      toast(`עובדו ${state.analyses.length} סמלים`, 'success');

      // Enable runtime QA button
      enableRuntimeButton();

    } catch (err) {
      showProgress(false);
      renderError(`שגיאה בעיבוד קבצים: ${err.message}`);
      toast(err.message, 'error');
    }

    state.loading = false;
  }

  // ─── Process Symbol Files ─────────────────────────────────────
  async function processSymbolFiles(symbolFiles) {
    const analyses = [];
    const names = Object.keys(symbolFiles);
    
    for (const name of names) {
      // Support both GitHub format { files: {...} } and Upload format { js: {...}, template: {...} ... }
      const entry = symbolFiles[name];
      const files = entry.files ? entry.files : entry;
      try {
        const analysis = QAEngine.analyzeSymbol(name, files);
        analyses.push(analysis);
      } catch (err) {
        console.warn(`Analysis failed for ${name}:`, err);
      }
      
      // Yield to keep UI responsive
      if (analyses.length % 10 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    state.analyses = analyses.sort((a, b) => a.symbolName.localeCompare(b.symbolName, 'he'));
    state.summary = QAEngine.getSummary(analyses);

    renderDashboard();
  }

  function enableRuntimeButton() {
    const btn = q('#run-runtime-qa');
    if (btn && Object.keys(state.symbolFiles).length > 0) {
      btn.disabled = false;
    }
  }

  // ─── Progress helpers ─────────────────────────────────────────
  function showProgress(show) {
    if (dom.progressContainer) {
      dom.progressContainer.classList.toggle('visible', show);
    }
  }

  function updateProgress(pct, msg) {
    if (dom.progressFill) dom.progressFill.style.width = `${pct}%`;
    if (dom.progressLabel) dom.progressLabel.textContent = `${pct}%`;
    if (dom.progressStatus) dom.progressStatus.textContent = msg || '';
  }

  // ─── Render Functions ─────────────────────────────────────────

  function renderWelcome() {
    dom.content.innerHTML = `
      <div class="welcome-screen">
        <div class="welcome-icon">
          <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="40" cy="40" r="38" stroke="currentColor" stroke-width="2" stroke-opacity="0.3"/>
            <path d="M20 40 L32 52 L60 28" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.8"/>
            <circle cx="40" cy="40" r="24" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 4" stroke-opacity="0.4"/>
            <circle cx="22" cy="22" r="6" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="58" cy="22" r="6" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="22" cy="58" r="6" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="58" cy="58" r="6" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </div>
        <h2>ברוך הבא לכלי QA של PI Vision</h2>
        <p>נתח אוטומטית את כל 63 הסמלים המותאמים שלך. בחר מקור נתונים מהפאנל הימני כדי להתחיל.</p>
        <div class="welcome-steps">
          <div class="welcome-step">
            <div class="step-num">1</div>
            <p>בחר מקור: GitHub, העלאת קבצים, או URL</p>
          </div>
          <div class="welcome-step">
            <div class="step-num">2</div>
            <p>הזן פרטי מאגר ולחץ על "ניתוח"</p>
          </div>
          <div class="welcome-step">
            <div class="step-num">3</div>
            <p>סקור תוצאות ובצע QA ידני</p>
          </div>
          <div class="welcome-step">
            <div class="step-num">4</div>
            <p>ייצא דוחות ושתף עם הצוות</p>
          </div>
        </div>
      </div>
    `;
    state.activeView = 'welcome';
  }

  function renderLoading(msg) {
    dom.content.innerHTML = `
      <div class="loading-overlay">
        <div class="spinner"></div>
        <div class="loading-text">${msg}</div>
        <div class="loading-progress" id="loading-detail"></div>
      </div>
    `;
  }

  function renderError(msg) {
    dom.content.innerHTML = `
      <div class="loading-overlay">
        <div style="font-size:48px">⚠️</div>
        <div class="loading-text" style="color:var(--red)">${msg}</div>
        <button class="btn btn-secondary mt-4" onclick="location.reload()">נסה שוב</button>
      </div>
    `;
  }

  function renderDashboard() {
    const s = state.summary;
    if (!s) return;

    state.activeView = 'dashboard';
    dom.content.innerHTML = `
      <!-- KPI Row -->
      <div class="kpi-row">
        <div class="kpi-card health">
          <div class="kpi-value" id="kpi-health">${s.healthScore}%</div>
          <div class="kpi-label">ציון בריאות</div>
          <div class="kpi-sub">${s.total} סמלים</div>
        </div>
        <div class="kpi-card pass">
          <div class="kpi-value">${s.statusCounts.pass}</div>
          <div class="kpi-label">✅ עברו</div>
          <div class="kpi-sub">${Math.round((s.statusCounts.pass/s.total)*100)}%</div>
        </div>
        <div class="kpi-card warning">
          <div class="kpi-value">${s.statusCounts.warning}</div>
          <div class="kpi-label">⚠️ אזהרות</div>
          <div class="kpi-sub">${Math.round((s.statusCounts.warning/s.total)*100)}%</div>
        </div>
        <div class="kpi-card error">
          <div class="kpi-value">${s.statusCounts.error}</div>
          <div class="kpi-label">❌ שגיאות</div>
          <div class="kpi-sub">${Math.round((s.statusCounts.error/s.total)*100)}%</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${s.totalErrors}</div>
          <div class="kpi-label">שגיאות קוד</div>
          <div class="kpi-sub">${s.totalWarnings} אזהרות</div>
        </div>
        ${state.runtimeDone ? renderRuntimeKPIs() : ''}
      </div>

      <!-- Charts Row -->
      <div class="dashboard-grid">
        <div class="chart-card">
          <div class="chart-card-title">חלוקת חומרה</div>
          <canvas id="chart-severity" class="chart-canvas" style="height:220px"></canvas>
        </div>
        <div class="chart-card">
          <div class="chart-card-title">בעיות לפי קטגוריה</div>
          <canvas id="chart-category" class="chart-canvas" style="height:220px"></canvas>
        </div>
        <div class="chart-card">
          <div class="chart-card-title">סוגי סמלים</div>
          <canvas id="chart-types" class="chart-canvas" style="height:220px"></canvas>
        </div>
        <div class="chart-card dashboard-full">
          <div class="chart-card-title">ציוני בריאות לפי סמל (20 הראשונים)</div>
          <canvas id="chart-health" class="chart-canvas" style="height:320px"></canvas>
        </div>
      </div>

      <!-- Symbol Table -->
      <div>
        <div class="table-section-header">
          <h2 class="section-title">
            סמלים
            <span class="count-badge" id="visible-count">${state.analyses.length}</span>
          </h2>
        </div>
        <div id="sym-table-container"></div>
      </div>
    `;

    // Draw charts after DOM is ready
    requestAnimationFrame(() => {
      const sevCanvas = q('#chart-severity');
      const catCanvas = q('#chart-category');
      const typesCanvas = q('#chart-types');
      const healthCanvas = q('#chart-health');

      if (sevCanvas) {
        QACharts.drawSeverityDonut(sevCanvas, {
          errors: s.totalErrors,
          warnings: s.totalWarnings,
          passes: s.totalPasses,
          infos: 0,
          healthScore: s.healthScore
        });
      }

      if (catCanvas) {
        // Count by category
        let jsE=0, jsW=0, htmlE=0, htmlW=0, cssE=0, cssW=0, crossE=0, crossW=0;
        state.analyses.forEach(a => {
          const ce = arr => arr.filter(c => c.severity==='error').length;
          const cw = arr => arr.filter(c => c.severity==='warning').length;
          jsE += ce(a.js); jsW += cw(a.js);
          htmlE += ce([...a.htmlTemplate,...a.htmlConfig]);
          htmlW += cw([...a.htmlTemplate,...a.htmlConfig]);
          cssE += ce(a.css); cssW += cw(a.css);
          crossE += ce(a.crossFile); crossW += cw(a.crossFile);
        });
        QACharts.drawCategoryBar(catCanvas, { jsErrors:jsE, jsWarnings:jsW, htmlErrors:htmlE, htmlWarnings:htmlW, cssErrors:cssE, cssWarnings:cssW, crossErrors:crossE, crossWarnings:crossW });
      }

      if (typesCanvas) {
        QACharts.drawCategoryDistribution(typesCanvas, s.byCategory);
      }

      if (healthCanvas) {
        QACharts.drawHealthBars(healthCanvas, state.analyses);
      }
    });

    renderSymbolTable();
  }

  function renderSymbolTable() {
    const container = q('#sym-table-container');
    if (!container) return;

    let filtered = state.analyses.filter(a => {
      if (state.filterCategory !== 'all' && a.category !== state.filterCategory) return false;
      if (state.filterStatus !== 'all' && a.overallStatus !== state.filterStatus) return false;
      if (state.searchQuery && !a.symbolName.toLowerCase().includes(state.searchQuery)) return false;
      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let va, vb;
      switch (state.sortCol) {
        case 'symbolName': va = a.symbolName; vb = b.symbolName; break;
        case 'category': va = a.category; vb = b.category; break;
        case 'jsScore': va = a.scores.js; vb = b.scores.js; break;
        case 'htmlScore': va = a.scores.html; vb = b.scores.html; break;
        case 'cssScore': va = a.scores.css; vb = b.scores.css; break;
        case 'overall': va = a.scores.overall; vb = b.scores.overall; break;
        default: va = a.symbolName; vb = b.symbolName;
      }
      if (typeof va === 'string') return state.sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return state.sortDir === 'asc' ? va - vb : vb - va;
    });

    const badge = q('#visible-count');
    if (badge) badge.textContent = filtered.length;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <p>לא נמצאו סמלים מתאימים לסינון</p>
        </div>`;
      return;
    }

    const sortIcon = (col) => {
      if (state.sortCol !== col) return '<span class="sort-icon">⇅</span>';
      return `<span class="sort-icon">${state.sortDir === 'asc' ? '↑' : '↓'}</span>`;
    };

    const cols = [
      { col: 'symbolName', label: 'שם סמל' },
      { col: 'category', label: 'קטגוריה' },
      { col: 'jsScore', label: 'JS' },
      { col: 'htmlScore', label: 'HTML' },
      { col: 'cssScore', label: 'CSS' },
      { col: 'overall', label: 'סטטוס' }
    ];

    const header = `<thead><tr>${cols.map(c => `
      <th class="${state.sortCol === c.col ? 'sorted-' + state.sortDir : ''}" 
          data-col="${c.col}">${c.label} ${sortIcon(c.col)}</th>
    `).join('')}<th>בעיות</th></tr></thead>`;

    const rows = filtered.map(a => {
      const isExpanded = state.expandedRows.has(a.symbolName);
      const statusIcon = icons[a.overallStatus] || icons.pass;
      const allErrors = [...a.js, ...a.htmlTemplate, ...a.htmlConfig, ...a.css, ...a.crossFile].filter(c => c.severity === 'error');
      const allWarnings = [...a.js, ...a.htmlTemplate, ...a.htmlConfig, ...a.css, ...a.crossFile].filter(c => c.severity === 'warning');

      const errCount = allErrors.length;
      const warnCount = allWarnings.length;

      return `
        <tr class="sym-row ${isExpanded ? 'expanded' : ''}" data-sym="${a.symbolName}">
          <td class="sym-name-cell">${a.symbolName}</td>
          <td><span class="sym-category-badge ${a.category}">${a.category.toUpperCase()}</span></td>
          <td>${scoreCell(a.scores.js)}</td>
          <td>${scoreCell(a.scores.html)}</td>
          <td>${scoreCell(a.scores.css)}</td>
          <td><span class="status-badge ${a.overallStatus}">${statusIcon} ${a.scores.overall}%</span></td>
          <td>
            <div class="issue-chips">
              ${errCount > 0 ? `<span class="issue-chip errors">❌ ${errCount}</span>` : ''}
              ${warnCount > 0 ? `<span class="issue-chip warnings">⚠️ ${warnCount}</span>` : ''}
              ${errCount === 0 && warnCount === 0 ? `<span class="issue-chip passes">✅</span>` : ''}
            </div>
          </td>
        </tr>
        ${isExpanded ? renderDetailRow(a) : ''}
      `;
    }).join('');

    container.innerHTML = `
      <div class="sym-table-wrapper">
        <table class="sym-table">
          ${header}
          <tbody id="sym-tbody">${rows}</tbody>
        </table>
      </div>
    `;

    // Bind sort and expand
    container.querySelectorAll('thead th[data-col]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (state.sortCol === col) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortCol = col;
          state.sortDir = 'asc';
        }
        renderSymbolTable();
      });
    });

    container.querySelectorAll('.sym-row').forEach(row => {
      row.addEventListener('click', () => {
        const sym = row.dataset.sym;
        if (state.expandedRows.has(sym)) {
          state.expandedRows.delete(sym);
        } else {
          state.expandedRows.add(sym);
        }
        renderSymbolTable();
        
        // Scroll to expanded row
        if (state.expandedRows.has(sym)) {
          setTimeout(() => {
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 50);
        }
      });
    });

    // Bind manual QA panels
    container.querySelectorAll('.manual-qa-container').forEach(container => {
      const sym = container.dataset.sym;
      if (sym) {
        QAManual.renderPanel(sym, container);
      }
    });
  }

  function scoreCell(score) {
    const cls = score >= 85 ? 'high' : score >= 60 ? 'medium' : 'low';
    const color = score >= 85 ? 'var(--teal)' : score >= 60 ? 'var(--orange)' : 'var(--red)';
    return `
      <span class="score-pill ${cls}">
        <span class="score-mini-bar">
          <span class="score-mini-bar-fill" style="width:${score}%;background:${color}"></span>
        </span>
        ${score}%
      </span>`;
  }

  function renderDetailRow(analysis) {
    return `
      <tr class="sym-detail-row">
        <td colspan="7">
          <div class="sym-detail-inner">
            <div class="detail-actions">
              <button class="emulator-btn" onclick="window._openEmulator('${analysis.symbolName}')">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="3" width="16" height="12" rx="2"/>
                  <path d="M7 17h6M10 15v2"/>
                </svg>
                פתח באמולטור
              </button>
              <button class="btn btn-secondary btn-sm" onclick="window._exportSymbol('${analysis.symbolName}')">
                📥 ייצא דוח
              </button>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 320px;gap:16px;align-items:start">
              <div>
                <!-- Tabs -->
                <div class="detail-tabs">
                  ${renderDetailTabs(analysis)}
                </div>
                <div class="check-list" id="checks-${analysis.symbolName}">
                  ${renderChecksForTab(analysis, 'js')}
                </div>
              </div>
              <div>
                <div class="manual-qa-container" data-sym="${analysis.symbolName}"></div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  function renderDetailTabs(analysis) {
    const tabs = [
      { id: 'js', label: 'JavaScript', checks: analysis.js },
      { id: 'html', label: 'HTML', checks: [...analysis.htmlTemplate, ...analysis.htmlConfig] },
      { id: 'css', label: 'CSS', checks: analysis.css },
      { id: 'cross', label: 'צלב-קובץ', checks: analysis.crossFile }
    ];

    let html = tabs.map((tab, idx) => {
      const errors = tab.checks.filter(c => c.severity === 'error').length;
      const warnings = tab.checks.filter(c => c.severity === 'warning').length;
      const badgeColor = errors > 0 ? 'var(--red)' : warnings > 0 ? 'var(--orange)' : 'var(--teal)';
      const badgeNum = errors > 0 ? errors : warnings > 0 ? warnings : '✓';
      return `
        <button class="detail-tab ${idx === 0 ? 'active' : ''}" data-tab="${tab.id}" data-sym="${analysis.symbolName}"
                onclick="window._switchTab('${analysis.symbolName}', '${tab.id}')">
          ${tab.label}
          <span class="tab-count" style="background:${badgeColor}20;color:${badgeColor}">${badgeNum}</span>
        </button>
      `;
    }).join('');

    // Runtime tab
    const rtResult = QARuntime.getResults(analysis.symbolName);
    const rtErrors = rtResult ? rtResult.errors.length : 0;
    const rtBadgeColor = rtResult ? (rtErrors > 0 ? 'var(--red)' : 'var(--teal)') : 'var(--text-muted)';
    const rtBadge = rtResult ? (rtErrors > 0 ? rtErrors : '✓') : '—';
    html += `
      <button class="detail-tab runtime-tab" data-tab="runtime" data-sym="${analysis.symbolName}"
              onclick="window._switchTab('${analysis.symbolName}', 'runtime')">
        🔥 Runtime
        <span class="tab-count" style="background:${rtBadgeColor}20;color:${rtBadgeColor}">${rtBadge}</span>
      </button>
    `;

    return html;
  }

  function renderChecksForTab(analysis, tabId) {
    // Runtime tab has its own renderer
    if (tabId === 'runtime') {
      return renderRuntimeChecks(analysis.symbolName);
    }

    let checks;
    switch (tabId) {
      case 'js': checks = analysis.js; break;
      case 'html': checks = [...analysis.htmlTemplate, ...analysis.htmlConfig]; break;
      case 'css': checks = analysis.css; break;
      case 'cross': checks = analysis.crossFile; break;
      default: checks = [];
    }

    if (!checks || checks.length === 0) {
      return '<div class="empty-state"><p>אין בדיקות</p></div>';
    }

    // Sort: errors first, then warnings, then pass
    const order = { error: 0, warning: 1, info: 2, pass: 3 };
    const sorted = [...checks].sort((a, b) => (order[a.severity] || 3) - (order[b.severity] || 3));

    return sorted.map(check => {
      const icon = icons[check.severity] || '•';
      const hasDetail = check.detail && check.detail.trim();
      const hasLine = check.line != null;
      
      return `
        <div class="check-item ${check.severity}">
          <span class="check-icon">${icon}</span>
          <div class="check-body">
            <div class="check-message">${escapeHtml(check.message)}</div>
            ${hasDetail ? `<div class="check-detail">${escapeHtml(check.detail)}</div>` : ''}
          </div>
          ${hasLine ? `<span class="check-line">שורה ${check.line}</span>` : ''}
        </div>
      `;
    }).join('');
  }

  // ─── Runtime KPI & Checks Rendering ──────────────────────

  function renderRuntimeKPIs() {
    const rtSummary = QARuntime.getRuntimeSummary();
    const initPct = rtSummary.total > 0 ? Math.round((rtSummary.initOkCount / rtSummary.total) * 100) : 0;
    const regPct = rtSummary.total > 0 ? Math.round((rtSummary.registeredCount / rtSummary.total) * 100) : 0;
    return `
      <div class="kpi-card runtime">
        <div class="kpi-value">${rtSummary.totalErrors}</div>
        <div class="kpi-label">🔥 שגיאות Runtime</div>
        <div class="kpi-sub">${rtSummary.totalWarnings} אזהרות</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${regPct}%</div>
        <div class="kpi-label">רישום סמל</div>
        <div class="kpi-sub">${rtSummary.registeredCount}/${rtSummary.total}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value">${initPct}%</div>
        <div class="kpi-label">Init תקין</div>
        <div class="kpi-sub">${rtSummary.initOkCount}/${rtSummary.total}</div>
      </div>
    `;
  }

  function renderRuntimeChecks(symbolName) {
    const r = QARuntime.getResults(symbolName);
    if (!r) {
      return `<div class="empty-state"><p>לא בוצעה בדיקת Runtime — לחץ "הרץ בדיקת שגיאות Runtime" בצד</p></div>`;
    }

    const score = QARuntime.getSymbolRuntimeScore(symbolName);
    const scoreCls = score >= 85 ? 'high' : score >= 60 ? 'medium' : 'low';
    const scoreColor = score >= 85 ? 'var(--teal)' : score >= 60 ? 'var(--orange)' : 'var(--red)';

    let html = `<div class="runtime-summary-row">`;
    // Registration status
    html += `<span class="runtime-badge ${r.registered ? 'pass' : 'fail'}">${r.registered ? '✅ נרשם' : '❌ לא נרשם'}</span>`;
    // Init status
    if (r.registered) {
      html += `<span class="runtime-badge ${r.initOk ? 'pass' : 'fail'}">${r.initOk ? '✅ Init תקין' : '❌ Init נכשל'}</span>`;
    }
    // Timeout
    if (r.timedOut) {
      html += `<span class="runtime-badge timeout">⏱ Timeout</span>`;
    }
    // Score
    html += `<span class="score-pill ${scoreCls}" style="margin-right:auto">`;
    html += `<span class="score-mini-bar"><span class="score-mini-bar-fill" style="width:${score}%;background:${scoreColor}"></span></span>`;
    html += `Runtime: ${score}%</span>`;
    html += `</div>`;

    // Errors
    if (r.errors.length > 0) {
      html += `<div class="runtime-section-title">❌ שגיאות (${r.errors.length})</div>`;
      r.errors.forEach(e => {
        html += `<div class="check-item error">`;
        html += `<span class="check-icon">❌</span>`;
        html += `<div class="check-body">`;
        html += `<div class="check-message">${escapeHtml(e.message)}</div>`;
        html += `<div class="check-detail">סוג: ${escapeHtml(e.type)} | הקשר: ${escapeHtml(e.context)}`;
        if (e.file) html += ` | קובץ: ${escapeHtml(e.file)}`;
        if (e.line) html += ` | שורה: ${e.line}`;
        html += `</div>`;
        if (e.stack) html += `<pre class="runtime-stack">${escapeHtml(e.stack.substring(0, 300))}</pre>`;
        html += `</div></div>`;
      });
    }

    // Warnings
    if (r.warnings.length > 0) {
      html += `<div class="runtime-section-title">⚠️ אזהרות (${r.warnings.length})</div>`;
      r.warnings.forEach(w => {
        html += `<div class="check-item warning">`;
        html += `<span class="check-icon">⚠️</span>`;
        html += `<div class="check-body">`;
        html += `<div class="check-message">${escapeHtml(w.message)}</div>`;
        html += `</div></div>`;
      });
    }

    // Logs (collapsible)
    if (r.logs.length > 0) {
      html += `<details class="runtime-logs-details">`;
      html += `<summary class="runtime-section-title clickable">📝 לוגים (${r.logs.length})</summary>`;
      html += `<div class="runtime-logs">`;
      r.logs.slice(0, 50).forEach(l => {
        const lvlClass = l.level === 'net' ? 'net' : l.level === 'info' ? 'info' : 'log';
        html += `<div class="runtime-log-entry ${lvlClass}">`;
        html += `<span class="log-level">${l.level}</span>`;
        html += `<span class="log-message">${escapeHtml(l.message)}</span>`;
        html += `</div>`;
      });
      if (r.logs.length > 50) {
        html += `<div class="text-xs text-muted" style="padding:4px 8px">ועוד ${r.logs.length - 50} לוגים...</div>`;
      }
      html += `</div></details>`;
    }

    // Emulator badge if results from emulator
    if (r.emulatorSource) {
      html += `<div class="runtime-emulator-badge">💻 תוצאות מהאמולטור</div>`;
    }

    if (r.errors.length === 0 && r.warnings.length === 0) {
      html += `<div class="runtime-clean">✅ לא נמצאו שגיאות runtime</div>`;
    }

    return html;
  }

  // ─── Global callbacks for inline onclick ─────────────────────
  window._switchTab = function(symbolName, tabId) {
    const container = q(`#checks-${symbolName}`);
    if (!container) return;
    
    const analysis = state.analyses.find(a => a.symbolName === symbolName);
    if (!analysis) return;
    
    container.innerHTML = renderChecksForTab(analysis, tabId);
    
    // Update active tab
    const tabs = document.querySelectorAll(`.detail-tab[data-sym="${symbolName}"]`);
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  };

  window._openEmulator = function(symbolName) {
    const url = QAEmulator.getEmulatorUrl();
    if (!url) {
      toast('הגדר כתובת אמולטור בשדה שבכותרת', 'warning');
      return;
    }
    const result = QAEmulator.openInEmulator(symbolName);
    if (!result.success) {
      toast(result.error, 'error');
    }
  };

  window._exportSymbol = function(symbolName) {
    const analysis = state.analyses.find(a => a.symbolName === symbolName);
    if (!analysis) return;
    QAReport.exportSymbolJSON(analysis, QAManual.exportData());
    toast(`דוח ${symbolName} יוצא`, 'success');
  };

  function closeDetail() {
    state.expandedRows.clear();
    renderSymbolTable();
  }

  // ─── Toast ────────────────────────────────────────────────────
  function toast(message, type = 'info') {
    if (!dom.toastContainer) return;
    
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icons2 = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    t.innerHTML = `<span>${icons2[type] || ''}</span><span>${escapeHtml(message)}</span>`;
    
    dom.toastContainer.appendChild(t);
    
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateY(20px)';
      t.style.transition = 'all 0.3s ease';
      setTimeout(() => t.remove(), 300);
    }, 3500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Load symbol files from any source and run full QA
   * Used by external callers (emulator integration, testing, etc.)
   */
  async function loadFromFiles(symbolFiles, meta) {
    state.loading = true;
    state.meta = meta || { source: 'local' };
    state.symbolFiles = symbolFiles;

    showProgress(true);
    renderLoading('מנתח קבצים...');

    try {
      updateProgress(50, 'מריץ בדיקות QA...');
      await processSymbolFiles(symbolFiles);
      updateProgress(100, 'הושלם');
      showProgress(false);
      toast(`נטענו ${state.analyses.length} סמלים בהצלחה`, 'success');
      enableRuntimeButton();
    } catch (err) {
      showProgress(false);
      renderError(`שגיאה בניתוח: ${err.message}`);
      toast(err.message, 'error');
    }

    state.loading = false;
  }

  // Public API
  return { init, loadFromFiles };

})();

export default QAUA;
