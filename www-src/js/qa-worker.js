// qa-worker.js — Web Worker for heavy QA analysis
// Runs regex/pattern matching on symbol code off the main thread
'use strict';

self.addEventListener('message', function(e) {
  const { type, payload } = e.data;
  
  switch(type) {
    case 'analyze-symbol':
      const result = analyzeSymbolCode(payload);
      self.postMessage({ type: 'analysis-result', payload: result });
      break;
    case 'batch-analyze':
      const results = payload.symbols.map(sym => ({
        name: sym.name,
        analysis: analyzeSymbolCode(sym)
      }));
      self.postMessage({ type: 'batch-result', payload: results });
      break;
  }
});

function analyzeSymbolCode(sym) {
  const issues = [];
  const code = (sym.html || '') + (sym.js || '') + (sym.css || '');
  
  // Check for common PI Vision symbol issues
  const checks = [
    { pattern: /document\.write/g, type: 'error', msg: 'שימוש ב-document.write — מסוכן ופוגע בביצועים' },
    { pattern: /eval\s*\(/g, type: 'error', msg: 'שימוש ב-eval — סיכון אבטחה' },
    { pattern: /innerHTML\s*=/g, type: 'warning', msg: 'שימוש ב-innerHTML — עדיף textContent לביטחון' },
    { pattern: /\$scope\.\$apply/g, type: 'warning', msg: '$scope.$apply — עלול לגרום ל-digest loop' },
    { pattern: /setInterval\s*\(/g, type: 'warning', msg: 'setInterval ללא clearInterval — memory leak אפשרי' },
    { pattern: /\.bind\(this\)/g, type: 'info', msg: 'שימוש ב-.bind — שקול arrow function' },
    { pattern: /console\.(log|debug)\s*\(/g, type: 'info', msg: 'console.log בקוד — הסר לפני פרודקשן' },
    { pattern: /position:\s*fixed/gi, type: 'warning', msg: 'position:fixed — עלול לגרום בעיות ב-PI Vision displays' },
    { pattern: /z-index:\s*\d{4,}/gi, type: 'warning', msg: 'z-index גבוה — עלול לגרום לקונפליקטים בתצוגה' },
    { pattern: /!important/gi, type: 'info', msg: 'שימוש ב-!important — קשה לתחזוקה' },
    { pattern: /var\s+(?!_)/g, type: 'info', msg: 'שימוש ב-var — עדיף let או const' },
    { pattern: /XMLHttpRequest/g, type: 'info', msg: 'XMLHttpRequest — שקול fetch API' },
  ];
  
  checks.forEach(check => {
    const matches = code.match(check.pattern);
    if (matches) {
      issues.push({
        type: check.type,
        message: check.msg,
        count: matches.length,
      });
    }
  });
  
  // Code metrics
  const metrics = {
    totalLines: code.split('\n').length,
    jsLines: (sym.js || '').split('\n').length,
    cssLines: (sym.css || '').split('\n').length,
    htmlLines: (sym.html || '').split('\n').length,
  };
  
  return { issues, metrics, score: Math.max(0, 100 - issues.filter(i => i.type === 'error').length * 20 - issues.filter(i => i.type === 'warning').length * 5) };
}
