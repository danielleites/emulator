/**
 * qa-report.js — Report generation and export
 */

'use strict';

const QAReport = (() => {

  const SEV_LABELS = {
    error:   '❌ שגיאה',
    warning: '⚠️ אזהרה',
    info:    'ℹ️ מידע',
    pass:    '✅ עבר'
  };

  function generateFullReport(analyses, manualData, meta = {}) {
    return {
      meta: {
        generatedAt: new Date().toISOString(),
        version: '1.0.0',
        repo: meta.repo || '',
        deployPath: meta.deployPath || '',
        totalSymbols: analyses.length,
        ...meta
      },
      summary: generateSummary(analyses, manualData),
      symbols: analyses.map(a => ({
        ...a,
        manual: manualData?.[a.symbolName] || null
      }))
    };
  }

  function generateSummary(analyses, manualData) {
    const total = analyses.length;
    let jsErrors = 0, jsWarnings = 0;
    let htmlErrors = 0, htmlWarnings = 0;
    let cssErrors = 0, cssWarnings = 0;
    let crossErrors = 0, crossWarnings = 0;
    let totalErrors = 0, totalWarnings = 0, totalPasses = 0;
    let healthSum = 0;

    analyses.forEach(a => {
      const count = (arr, sev) => arr.filter(c => c.severity === sev).length;
      
      jsErrors += count(a.js, 'error');
      jsWarnings += count(a.js, 'warning');
      htmlErrors += count([...a.htmlTemplate, ...a.htmlConfig], 'error');
      htmlWarnings += count([...a.htmlTemplate, ...a.htmlConfig], 'warning');
      cssErrors += count(a.css, 'error');
      cssWarnings += count(a.css, 'warning');
      crossErrors += count(a.crossFile, 'error');
      crossWarnings += count(a.crossFile, 'warning');

      const all = [...a.js, ...a.htmlTemplate, ...a.htmlConfig, ...a.css, ...a.crossFile];
      totalErrors += count(all, 'error');
      totalWarnings += count(all, 'warning');
      totalPasses += count(all, 'pass');
      healthSum += a.scores?.overall || 0;
    });

    return {
      totalSymbols: total,
      totalErrors,
      totalWarnings,
      totalPasses,
      healthScore: total > 0 ? Math.round(healthSum / total) : 0,
      byCategory: {
        js: { errors: jsErrors, warnings: jsWarnings },
        html: { errors: htmlErrors, warnings: htmlWarnings },
        css: { errors: cssErrors, warnings: cssWarnings },
        cross: { errors: crossErrors, warnings: crossWarnings }
      },
      symbolTypes: {
        v20: analyses.filter(a => a.category === 'v20').length,
        wow: analyses.filter(a => a.category === 'wow').length
      },
      statusBreakdown: {
        pass: analyses.filter(a => a.overallStatus === 'pass').length,
        warning: analyses.filter(a => a.overallStatus === 'warning').length,
        error: analyses.filter(a => a.overallStatus === 'error').length
      }
    };
  }

  function exportJSON(analyses, manualData, meta) {
    const report = generateFullReport(analyses, manualData, meta);
    const json = JSON.stringify(report, null, 2);
    downloadText(json, `piv-qa-report-${formatDateForFile()}.json`, 'application/json');
    return report;
  }

  function exportSymbolJSON(analysis, manualData) {
    const report = {
      generatedAt: new Date().toISOString(),
      symbol: analysis.symbolName,
      category: analysis.category,
      scores: analysis.scores,
      overallStatus: analysis.overallStatus,
      checks: {
        js: analysis.js,
        htmlTemplate: analysis.htmlTemplate,
        htmlConfig: analysis.htmlConfig,
        css: analysis.css,
        crossFile: analysis.crossFile
      },
      manual: manualData?.[analysis.symbolName] || null
    };
    const json = JSON.stringify(report, null, 2);
    downloadText(json, `qa-${analysis.symbolName}-${formatDateForFile()}.json`, 'application/json');
  }

  function generateHTMLReport(analyses, manualData, meta) {
    const summary = generateSummary(analyses, manualData);
    
    const symbolRows = analyses.map(a => {
      const statusIcon = a.overallStatus === 'pass' ? '✅' : a.overallStatus === 'warning' ? '⚠️' : '❌';
      const statusClass = a.overallStatus;
      const allErrors = [...a.js, ...a.htmlTemplate, ...a.htmlConfig, ...a.css, ...a.crossFile]
        .filter(c => c.severity === 'error')
        .slice(0, 3);
      
      return `
        <tr class="sym-row ${statusClass}">
          <td class="sym-name">${a.symbolName}</td>
          <td class="sym-cat">${a.category.toUpperCase()}</td>
          <td class="sym-score">${scoreBar(a.scores.js)}</td>
          <td class="sym-score">${scoreBar(a.scores.html)}</td>
          <td class="sym-score">${scoreBar(a.scores.css)}</td>
          <td class="sym-overall">${statusIcon} ${a.scores.overall}%</td>
          <td class="sym-issues">${allErrors.map(e => `<span class="err-chip">${e.message}</span>`).join('')}</td>
        </tr>
      `;
    }).join('');

    return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <title>דוח QA - PI Vision Symbols</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Heebo', system-ui, sans-serif; direction: rtl; background: #f8f9fa; color: #333; }
    .header { background: #1a1a2e; color: white; padding: 24px 32px; }
    .header h1 { font-size: 24px; margin-bottom: 8px; }
    .header .meta { font-size: 13px; opacity: 0.7; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; padding: 24px 32px; background: white; border-bottom: 1px solid #e0e0e0; }
    .kpi { text-align: center; }
    .kpi-value { font-size: 32px; font-weight: 700; }
    .kpi-label { font-size: 13px; color: #666; margin-top: 4px; }
    .kpi.error .kpi-value { color: #e63946; }
    .kpi.warning .kpi-value { color: #ff6b35; }
    .kpi.pass .kpi-value { color: #2dc653; }
    .kpi.health .kpi-value { color: #0066cc; }
    .table-section { padding: 24px 32px; }
    .table-section h2 { font-size: 18px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #1a1a2e; color: white; padding: 10px 12px; text-align: right; }
    td { padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
    tr.pass td { background: #f0fff4; }
    tr.warning td { background: #fffaf0; }
    tr.error td { background: #fff5f5; }
    .sym-name { font-weight: 600; font-family: monospace; font-size: 12px; }
    .sym-cat { font-size: 11px; background: #e0e0e0; padding: 2px 8px; border-radius: 10px; display: inline-block; }
    .err-chip { display: inline-block; background: #ffe0e0; color: #c00; font-size: 11px; padding: 1px 6px; border-radius: 4px; margin: 1px; }
    .score-bar { display: flex; align-items: center; gap: 6px; }
    .score-bar-track { width: 60px; height: 6px; background: #e0e0e0; border-radius: 3px; overflow: hidden; }
    .score-bar-fill { height: 100%; border-radius: 3px; }
    .footer { padding: 24px 32px; font-size: 12px; color: #888; border-top: 1px solid #e0e0e0; text-align: center; }
    @media print { .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 דוח QA — PI Vision Custom Symbols</h1>
    <div class="meta">
      נוצר: ${new Date().toLocaleString('he-IL')} | 
      מאגר: ${meta.repo || 'לא צוין'} | 
      נתיב: ${meta.deployPath || 'לא צוין'}
    </div>
  </div>
  
  <div class="summary">
    <div class="kpi health">
      <div class="kpi-value">${summary.healthScore}%</div>
      <div class="kpi-label">ציון בריאות</div>
    </div>
    <div class="kpi">
      <div class="kpi-value">${summary.totalSymbols}</div>
      <div class="kpi-label">סה"כ סמלים</div>
    </div>
    <div class="kpi error">
      <div class="kpi-value">${summary.totalErrors}</div>
      <div class="kpi-label">שגיאות</div>
    </div>
    <div class="kpi warning">
      <div class="kpi-value">${summary.totalWarnings}</div>
      <div class="kpi-label">אזהרות</div>
    </div>
    <div class="kpi pass">
      <div class="kpi-value">${summary.statusBreakdown.pass}</div>
      <div class="kpi-label">עברו</div>
    </div>
  </div>
  
  <div class="table-section">
    <h2>סמלים (${analyses.length})</h2>
    <table>
      <thead>
        <tr>
          <th>שם סמל</th>
          <th>קטגוריה</th>
          <th>JS</th>
          <th>HTML</th>
          <th>CSS</th>
          <th>סטטוס</th>
          <th>שגיאות עיקריות</th>
        </tr>
      </thead>
      <tbody>
        ${symbolRows}
      </tbody>
    </table>
  </div>
  
  <div class="footer">
    <a href="https://www.perplexity.ai/computer" target="_blank">Created with Perplexity Computer</a>
  </div>
</body>
</html>`;
  }

  function scoreBar(score) {
    const color = score >= 85 ? '#2dc653' : score >= 60 ? '#ff6b35' : '#e63946';
    return `<div class="score-bar">
      <div class="score-bar-track">
        <div class="score-bar-fill" style="width:${score}%;background:${color}"></div>
      </div>
      <span>${score}%</span>
    </div>`;
  }

  function exportHTMLReport(analyses, manualData, meta) {
    const html = generateHTMLReport(analyses, manualData, meta);
    downloadText(html, `piv-qa-report-${formatDateForFile()}.html`, 'text/html');
  }

  function downloadText(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function formatDateForFile() {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
  }

  function printReport() {
    window.print();
  }

  return {
    generateFullReport,
    generateSummary,
    exportJSON,
    exportSymbolJSON,
    exportHTMLReport,
    printReport
  };

})();

export default QAReport;
