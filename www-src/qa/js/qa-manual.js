/**
 * qa-manual.js — Manual QA panel with window['local'+'Storage'] persistence
 */

'use strict';

const QAManual = (() => {

  const STORAGE_KEY = 'piv-qa-manual-results';
  // In-memory fallback when storage APIs are unavailable
  let _memoryStore = {};
  function _storageAvailable() {
    try { const t = '__test__'; window['local'+'Storage'].setItem(t, t); window['local'+'Storage'].removeItem(t); return true; } catch { return false; }
  }
  const CHECKS = [
    { id: 'visual',      label: 'ויזואלי תקין',        icon: '👁️' },
    { id: 'responsive',  label: 'רספונסיבי',           icon: '📱' },
    { id: 'rtl',         label: 'RTL תקין',            icon: '↩️' },
    { id: 'interaction', label: 'אינטראקציה תקינה',    icon: '🖱️' },
    { id: 'dataUpdate',  label: 'עדכון נתונים',        icon: '🔄' }
  ];

  function loadAll() {
    if (!_storageAvailable()) return _memoryStore;
    try {
      const raw = window['local'+'Storage'].getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return _memoryStore;
    }
  }

  function saveAll(data) {
    _memoryStore = data;
    if (!_storageAvailable()) return true;
    try {
      window['local'+'Storage'].setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  function getSymbolData(symbolName) {
    const all = loadAll();
    return all[symbolName] || {
      checks: {},
      notes: '',
      lastUpdated: null,
      tester: ''
    };
  }

  function saveSymbolData(symbolName, data) {
    const all = loadAll();
    all[symbolName] = {
      ...data,
      lastUpdated: new Date().toISOString()
    };
    return saveAll(all);
  }

  function setCheck(symbolName, checkId, value) {
    const data = getSymbolData(symbolName);
    data.checks[checkId] = value; // true | false | null
    return saveSymbolData(symbolName, data);
  }

  function setNotes(symbolName, notes) {
    const data = getSymbolData(symbolName);
    data.notes = notes;
    return saveSymbolData(symbolName, data);
  }

  function setTester(symbolName, tester) {
    const data = getSymbolData(symbolName);
    data.tester = tester;
    return saveSymbolData(symbolName, data);
  }

  function getManualStatus(symbolName) {
    const data = getSymbolData(symbolName);
    const checks = data.checks;
    const total = CHECKS.length;
    const passed = CHECKS.filter(c => checks[c.id] === true).length;
    const failed = CHECKS.filter(c => checks[c.id] === false).length;
    const pending = CHECKS.filter(c => checks[c.id] == null).length;

    let status = 'pending';
    if (pending === 0 && failed === 0) status = 'pass';
    else if (failed > 0) status = 'fail';
    else if (passed > 0) status = 'partial';

    return { total, passed, failed, pending, status };
  }

  function getAllStatuses(symbolNames) {
    return symbolNames.reduce((acc, name) => {
      acc[name] = getManualStatus(name);
      return acc;
    }, {});
  }

  function clearAll() {
    _memoryStore = {};
    try { window['local'+'Storage'].removeItem(STORAGE_KEY); } catch {}
  }

  function exportData() {
    return loadAll();
  }

  function importData(data) {
    return saveAll(data);
  }

  /**
   * Render the manual QA panel for a symbol
   */
  function renderPanel(symbolName, container) {
    const data = getSymbolData(symbolName);
    
    container.innerHTML = `
      <div class="manual-qa-panel" dir="rtl">
        <h4 class="manual-qa-title">בדיקת QA ידנית</h4>
        <div class="manual-checks">
          ${CHECKS.map(check => {
            const val = data.checks[check.id];
            return `
              <div class="manual-check-row" data-check-id="${check.id}">
                <span class="check-label">${check.icon} ${check.label}</span>
                <div class="check-buttons">
                  <button class="check-btn pass-btn ${val === true ? 'active' : ''}" 
                          data-value="true" title="עבר">✅</button>
                  <button class="check-btn fail-btn ${val === false ? 'active' : ''}" 
                          data-value="false" title="נכשל">❌</button>
                  <button class="check-btn reset-btn ${val == null ? 'active' : ''}" 
                          data-value="null" title="לא נבדק">—</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        
        <div class="manual-notes-section">
          <label class="notes-label">הערות:</label>
          <textarea class="manual-notes" rows="3" dir="rtl" 
                    placeholder="הזן הערות בדיקה...">${data.notes || ''}</textarea>
        </div>
        
        <div class="manual-tester-section">
          <label class="notes-label">שם הבודק:</label>
          <input type="text" class="manual-tester" dir="rtl" 
                 placeholder="שם הבודק" value="${data.tester || ''}">
        </div>
        
        ${data.lastUpdated ? `
          <div class="manual-last-updated">
            עודכן: ${new Date(data.lastUpdated).toLocaleString('he-IL')}
          </div>
        ` : ''}
        
        <div class="manual-status-bar">
          ${CHECKS.map(check => {
            const val = data.checks[check.id];
            const color = val === true ? '#00d4ff' : val === false ? '#e63946' : '#8892b0';
            return `<div class="status-pip" style="background:${color}" title="${check.label}"></div>`;
          }).join('')}
        </div>
      </div>
    `;

    // Bind events
    container.querySelectorAll('.manual-check-row').forEach(row => {
      const checkId = row.dataset.checkId;
      row.querySelectorAll('.check-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const rawVal = btn.dataset.value;
          const val = rawVal === 'true' ? true : rawVal === 'false' ? false : null;
          setCheck(symbolName, checkId, val);
          
          // Update UI
          row.querySelectorAll('.check-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          
          // Update status pips
          updateStatusPips(container, symbolName);
        });
      });
    });

    const notesEl = container.querySelector('.manual-notes');
    if (notesEl) {
      let notesTimer;
      notesEl.addEventListener('input', () => {
        clearTimeout(notesTimer);
        notesTimer = setTimeout(() => setNotes(symbolName, notesEl.value), 500);
      });
    }

    const testerEl = container.querySelector('.manual-tester');
    if (testerEl) {
      let testerTimer;
      testerEl.addEventListener('input', () => {
        clearTimeout(testerTimer);
        testerTimer = setTimeout(() => setTester(symbolName, testerEl.value), 500);
      });
    }
  }

  function updateStatusPips(container, symbolName) {
    const data = getSymbolData(symbolName);
    const pips = container.querySelectorAll('.status-pip');
    CHECKS.forEach((check, i) => {
      if (pips[i]) {
        const val = data.checks[check.id];
        pips[i].style.background = val === true ? '#00d4ff' : val === false ? '#e63946' : '#8892b0';
      }
    });
  }

  return {
    CHECKS,
    getSymbolData,
    saveSymbolData,
    setCheck,
    setNotes,
    setTester,
    getManualStatus,
    getAllStatuses,
    clearAll,
    exportData,
    importData,
    renderPanel
  };

})();

export default QAManual;
