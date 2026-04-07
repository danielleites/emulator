/**
 * af-browser-ui.js — AF Browser Panel UI
 * 
 * Interactive panel for browsing the full AF hierarchy:
 * - Tree navigation with expand/collapse
 * - Attribute inspector with type badges
 * - Tag search with live results
 * - Historical data viewer with mini-chart
 * - Event frame browser
 * - Accessible from any symbol via the AF panel button
 * 
 * Requires: af-data-layer.js
 */

'use strict';

const AFBrowserUI = (() => {

  let _af = null;          // AFDataLayer instance
  let _panel = null;       // DOM panel element
  let _isOpen = false;
  let _currentElement = null;
  let _breadcrumbs = [];
  let _activeTab = 'tree'; // tree | attributes | tags | history | events

  // ═══════════════════════════════════════════════════════════════
  //  INITIALIZATION
  // ═══════════════════════════════════════════════════════════════

  function init(afDataLayer) {
    _af = afDataLayer || new AFDataLayer();
    _createPanel();
    _bindHotkeys();
    console.log('[AF Browser] מוכן — ' + _af.getStats().totalElements + ' אלמנטים, ' + _af.getStats().totalTags + ' תגים');
    return _af;
  }

  // ═══════════════════════════════════════════════════════════════
  //  PANEL CREATION
  // ═══════════════════════════════════════════════════════════════

  function _createPanel() {
    if (_panel) return;

    _panel = document.createElement('div');
    _panel.id = 'af-browser-panel';
    _panel.className = 'af-panel';
    _panel.innerHTML = `
      <div class="af-panel-header">
        <div class="af-panel-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          <span>דפדפן AF — Asset Framework</span>
        </div>
        <div class="af-panel-actions">
          <button class="af-btn-icon" id="af-btn-stats" title="סטטיסטיקות">📊</button>
          <button class="af-btn-icon" id="af-btn-close" title="סגור (F9)">✕</button>
        </div>
      </div>

      <div class="af-panel-tabs">
        <button class="af-tab active" data-tab="tree">🌳 היררכיה</button>
        <button class="af-tab" data-tab="attributes">📋 אטריביוטים</button>
        <button class="af-tab" data-tab="tags">🏷 חיפוש תגים</button>
        <button class="af-tab" data-tab="history">📈 היסטוריה</button>
        <button class="af-tab" data-tab="events">⚡ אירועים</button>
      </div>

      <div class="af-breadcrumbs" id="af-breadcrumbs"></div>

      <div class="af-panel-content">
        <div class="af-tab-content active" id="af-content-tree"></div>
        <div class="af-tab-content" id="af-content-attributes"></div>
        <div class="af-tab-content" id="af-content-tags"></div>
        <div class="af-tab-content" id="af-content-history"></div>
        <div class="af-tab-content" id="af-content-events"></div>
      </div>
    `;

    document.body.appendChild(_panel);

    // Inject styles
    _injectStyles();

    // Wire tabs
    _panel.querySelectorAll('.af-tab').forEach(tab => {
      tab.addEventListener('click', () => _switchTab(tab.dataset.tab));
    });

    // Wire close
    _panel.querySelector('#af-btn-close').addEventListener('click', toggle);
    _panel.querySelector('#af-btn-stats').addEventListener('click', _showStats);

    // Initial tree render
    _renderTree();
  }

  function _bindHotkeys() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F9' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        toggle();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  PANEL TOGGLE
  // ═══════════════════════════════════════════════════════════════

  function toggle() {
    _isOpen = !_isOpen;
    if (_panel) {
      _panel.classList.toggle('open', _isOpen);
    }
  }

  function open() {
    _isOpen = true;
    if (_panel) _panel.classList.add('open');
  }

  function close() {
    _isOpen = false;
    if (_panel) _panel.classList.remove('open');
  }

  // ═══════════════════════════════════════════════════════════════
  //  TAB SWITCHING
  // ═══════════════════════════════════════════════════════════════

  function _switchTab(tabName) {
    _activeTab = tabName;
    _panel.querySelectorAll('.af-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    _panel.querySelectorAll('.af-tab-content').forEach(c => c.classList.toggle('active', c.id === 'af-content-' + tabName));

    if (tabName === 'tree') _renderTree();
    else if (tabName === 'attributes') _renderAttributes();
    else if (tabName === 'tags') _renderTagSearch();
    else if (tabName === 'history') _renderHistoryTab();
    else if (tabName === 'events') _renderEvents();
  }

  // ═══════════════════════════════════════════════════════════════
  //  BREADCRUMBS
  // ═══════════════════════════════════════════════════════════════

  function _updateBreadcrumbs(element) {
    const container = _panel.querySelector('#af-breadcrumbs');
    if (!element) {
      _breadcrumbs = [];
      container.innerHTML = '<span class="af-bc-item af-bc-root" data-wid="">🏠 IEC-PowerGrid</span>';
      container.querySelector('.af-bc-root').addEventListener('click', () => {
        _currentElement = null;
        _breadcrumbs = [];
        _renderTree();
        _updateBreadcrumbs(null);
      });
      return;
    }

    // Build path from element.Path
    const parts = element.Path.replace(/^\\\\[^\\]+\\[^\\]+\\/, '').split('\\').filter(Boolean);
    let html = '<span class="af-bc-item af-bc-root" data-wid="">🏠 IEC</span>';
    
    parts.forEach((part, i) => {
      html += '<span class="af-bc-sep">›</span>';
      const isLast = i === parts.length - 1;
      html += '<span class="af-bc-item' + (isLast ? ' af-bc-current' : '') + '">' + _escHtml(part) + '</span>';
    });

    container.innerHTML = html;

    // Wire root click
    container.querySelector('.af-bc-root').addEventListener('click', () => {
      _currentElement = null;
      _renderTree();
      _updateBreadcrumbs(null);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  TREE VIEW
  // ═══════════════════════════════════════════════════════════════

  function _renderTree() {
    const container = _panel.querySelector('#af-content-tree');
    
    if (!_currentElement) {
      // Show root elements (sites)
      const roots = _af.getRootElements();
      container.innerHTML = `
        <div class="af-search-box">
          <input type="text" id="af-tree-search" placeholder="🔍 חיפוש אלמנט..." />
        </div>
        <div class="af-tree-list" id="af-tree-items"></div>
      `;

      const list = container.querySelector('#af-tree-items');
      roots.Items.forEach(el => {
        list.appendChild(_createTreeNode(el, 0));
      });

      // Wire search
      container.querySelector('#af-tree-search').addEventListener('input', (e) => {
        const q = e.target.value;
        if (q.length < 2) {
          list.innerHTML = '';
          roots.Items.forEach(el => list.appendChild(_createTreeNode(el, 0)));
          return;
        }
        const results = _af.searchElements(q, 30);
        list.innerHTML = '';
        if (results.Items.length === 0) {
          list.innerHTML = '<div class="af-empty">לא נמצאו תוצאות</div>';
        } else {
          results.Items.forEach(el => list.appendChild(_createTreeNode(el, 0, true)));
        }
      });

      _updateBreadcrumbs(null);
    } else {
      // Show children of current element
      const el = _af.getElement(_currentElement);
      const children = _af.getChildElements(_currentElement);
      
      container.innerHTML = `
        <div class="af-element-header">
          <button class="af-btn-back" id="af-btn-back">← חזור</button>
          <div class="af-element-info">
            <span class="af-element-icon">${_getIcon(el)}</span>
            <div>
              <div class="af-element-name">${_escHtml(el.Name)}</div>
              <div class="af-element-desc">${_escHtml(el.Description || '')}</div>
              <div class="af-element-meta">
                <span class="af-badge af-badge-template">${_escHtml(el.TemplateName || '')}</span>
                <span class="af-badge">${el.AttributeCount || 0} אטריביוטים</span>
                <span class="af-badge">${el.ChildCount || 0} ילדים</span>
              </div>
            </div>
          </div>
        </div>
        <div class="af-tree-list" id="af-tree-items"></div>
      `;

      if (children.Items.length === 0) {
        container.querySelector('#af-tree-items').innerHTML = '<div class="af-empty">אין אלמנטים ילדים — עבור ללשונית אטריביוטים</div>';
      } else {
        const list = container.querySelector('#af-tree-items');
        children.Items.forEach(child => {
          list.appendChild(_createTreeNode(child, 0));
        });
      }

      // Wire back button
      container.querySelector('#af-btn-back').addEventListener('click', () => {
        // Go to parent — extract from path
        if (el && el.Path) {
          const parentPath = el.Path.substring(0, el.Path.lastIndexOf('\\'));
          const parentEl = _af.getElementByPath(parentPath);
          if (parentEl) {
            _currentElement = parentEl.WebId;
            _renderTree();
            _updateBreadcrumbs(parentEl);
          } else {
            _currentElement = null;
            _renderTree();
            _updateBreadcrumbs(null);
          }
        } else {
          _currentElement = null;
          _renderTree();
          _updateBreadcrumbs(null);
        }
      });

      _updateBreadcrumbs(el);
    }
  }

  function _createTreeNode(el, depth, isSearchResult) {
    const node = document.createElement('div');
    node.className = 'af-tree-node';
    node.style.paddingRight = (16 + depth * 20) + 'px';
    
    const icon = _getIcon(el);
    const expandable = el.HasChildren;

    node.innerHTML = `
      <span class="af-tree-expand">${expandable ? '▸' : '　'}</span>
      <span class="af-tree-icon">${icon}</span>
      <span class="af-tree-name">${_escHtml(el.Name)}</span>
      ${isSearchResult ? '<span class="af-tree-path">' + _escHtml(el.Path.replace(/\\\\PIServer-IEC\\IEC-PowerGrid\\/, '')) + '</span>' : ''}
      <span class="af-tree-badges">
        ${el.TemplateName ? '<span class="af-badge-sm">' + _escHtml(el.TemplateName) + '</span>' : ''}
        ${el.AttributeCount ? '<span class="af-badge-sm af-badge-num">' + el.AttributeCount + '</span>' : ''}
      </span>
    `;

    // Click → navigate into
    node.addEventListener('click', () => {
      _currentElement = el.WebId;
      _renderTree();
      _renderAttributes();
      const fullEl = _af.getElement(el.WebId);
      _updateBreadcrumbs(fullEl);
    });

    // Double-click → show attributes
    node.addEventListener('dblclick', () => {
      _currentElement = el.WebId;
      _switchTab('attributes');
    });

    return node;
  }

  // ═══════════════════════════════════════════════════════════════
  //  ATTRIBUTES VIEW
  // ═══════════════════════════════════════════════════════════════

  function _renderAttributes() {
    const container = _panel.querySelector('#af-content-attributes');
    
    if (!_currentElement) {
      container.innerHTML = '<div class="af-empty">בחר אלמנט מהעץ כדי לראות אטריביוטים</div>';
      return;
    }

    const el = _af.getElement(_currentElement);
    const attrs = _af.getAttributes(_currentElement);

    if (!attrs.Items.length) {
      container.innerHTML = '<div class="af-empty">אין אטריביוטים לאלמנט זה</div>';
      return;
    }

    // Group by category
    const groups = {};
    attrs.Items.forEach(attr => {
      const cat = (attr.CategoryNames && attr.CategoryNames[0]) || 'כללי';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(attr);
    });

    let html = `
      <div class="af-attr-header">
        <span class="af-element-icon">${_getIcon(el)}</span>
        <span class="af-element-name">${_escHtml(el.Name)}</span>
        <span class="af-badge">${attrs.Items.length} אטריביוטים</span>
      </div>
      <div class="af-attr-filter">
        <input type="text" id="af-attr-search" placeholder="🔍 סנן אטריביוטים..." />
      </div>
    `;

    for (const [cat, catAttrs] of Object.entries(groups)) {
      html += `<div class="af-attr-group">
        <div class="af-attr-group-header">${_escHtml(cat)} <span class="af-attr-count">(${catAttrs.length})</span></div>
        <div class="af-attr-list">`;

      catAttrs.forEach(attr => {
        const typeBadge = _getTypeBadge(attr.Type);
        const valueDisplay = _formatValue(attr);
        const isTag = attr.IsTag;

        html += `
          <div class="af-attr-item ${isTag ? 'af-attr-tag' : ''}" data-wid="${attr.WebId}" data-is-tag="${isTag}">
            <div class="af-attr-info">
              <span class="af-attr-name">${_escHtml(attr.Name)}</span>
              ${typeBadge}
              ${attr.DefaultUnitsOfMeasure ? '<span class="af-attr-uom">' + _escHtml(attr.DefaultUnitsOfMeasure) + '</span>' : ''}
              ${isTag ? '<span class="af-badge-tag">📊 תג PI</span>' : ''}
            </div>
            <div class="af-attr-value">
              ${valueDisplay}
            </div>
          </div>
        `;
      });

      html += '</div></div>';
    }

    container.innerHTML = html;

    // Wire attribute clicks
    container.querySelectorAll('.af-attr-item').forEach(item => {
      item.addEventListener('click', () => {
        const wid = item.dataset.wid;
        const isTag = item.dataset.isTag === 'true';
        if (isTag) {
          _showTagHistory(wid);
        } else {
          _showAttributeDetail(wid);
        }
      });
    });

    // Wire filter
    container.querySelector('#af-attr-search').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      container.querySelectorAll('.af-attr-item').forEach(item => {
        const name = item.querySelector('.af-attr-name').textContent.toLowerCase();
        item.style.display = name.includes(q) || !q ? '' : 'none';
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  TAG SEARCH
  // ═══════════════════════════════════════════════════════════════

  function _renderTagSearch() {
    const container = _panel.querySelector('#af-content-tags');
    
    const categories = _af.getTagCategories();
    const catNames = Object.keys(categories);

    container.innerHTML = `
      <div class="af-search-box">
        <input type="text" id="af-tag-search" placeholder="🔍 חיפוש תג PI... (שם, אתר, קטגוריה)" />
      </div>
      <div class="af-tag-chips" id="af-tag-chips">
        <span class="af-chip active" data-cat="all">הכל</span>
        ${catNames.map(c => '<span class="af-chip" data-cat="' + _escHtml(c) + '">' + _escHtml(c) + ' (' + categories[c].length + ')</span>').join('')}
      </div>
      <div class="af-tag-results" id="af-tag-results">
        <div class="af-empty">הקלד לחיפוש או בחר קטגוריה</div>
      </div>
      <div class="af-tag-stats">
        סה"כ: ${_af.getStats().totalTags} תגים ב-${catNames.length} קטגוריות
      </div>
    `;

    // Wire search
    const searchInput = container.querySelector('#af-tag-search');
    searchInput.addEventListener('input', () => _filterTags());

    // Wire chips
    container.querySelectorAll('.af-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('.af-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        _filterTags();
      });
    });

    // Show all tags initially
    _showAllTags(categories);
  }

  function _showAllTags(categories) {
    const resultsEl = _panel.querySelector('#af-tag-results');
    let html = '';
    for (const [cat, tags] of Object.entries(categories)) {
      html += '<div class="af-tag-category"><div class="af-tag-cat-header">' + _escHtml(cat) + ' <span>(' + tags.length + ')</span></div>';
      tags.slice(0, 20).forEach(tag => {
        html += _createTagRow(tag);
      });
      if (tags.length > 20) {
        html += '<div class="af-tag-more">ועוד ' + (tags.length - 20) + ' תגים...</div>';
      }
      html += '</div>';
    }
    resultsEl.innerHTML = html;
    _wireTagClicks(resultsEl);
  }

  function _filterTags() {
    const searchVal = _panel.querySelector('#af-tag-search').value;
    const activeCat = _panel.querySelector('.af-chip.active').dataset.cat;
    const resultsEl = _panel.querySelector('#af-tag-results');

    let results;
    if (searchVal.length >= 2) {
      results = _af.searchTags(searchVal, 100);
    } else if (activeCat !== 'all') {
      const categories = _af.getTagCategories();
      results = { Items: (categories[activeCat] || []).map(t => ({ ...t, PointType: 'Float64', EngineeringUnits: t.UOM })) };
    } else {
      _showAllTags(_af.getTagCategories());
      return;
    }

    if (results.Items.length === 0) {
      resultsEl.innerHTML = '<div class="af-empty">לא נמצאו תגים</div>';
      return;
    }

    let html = '';
    results.Items.forEach(tag => {
      html += _createTagRow(tag);
    });
    resultsEl.innerHTML = html;
    _wireTagClicks(resultsEl);
  }

  function _createTagRow(tag) {
    return `
      <div class="af-tag-row" data-wid="${tag.WebId}" data-name="${_escHtml(tag.Name)}">
        <div class="af-tag-name">${_escHtml(tag.Name)}</div>
        <div class="af-tag-desc">${_escHtml(tag.Description || '')}</div>
        <div class="af-tag-meta">
          <span class="af-badge-sm">${tag.EngineeringUnits || tag.UOM || '—'}</span>
          <span class="af-badge-sm">${tag.PointType || 'Float64'}</span>
        </div>
      </div>
    `;
  }

  function _wireTagClicks(container) {
    container.querySelectorAll('.af-tag-row').forEach(row => {
      row.addEventListener('click', () => {
        _showTagHistory(row.dataset.wid);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  HISTORY VIEW
  // ═══════════════════════════════════════════════════════════════

  function _renderHistoryTab() {
    const container = _panel.querySelector('#af-content-history');
    container.innerHTML = `
      <div class="af-history-controls">
        <div class="af-history-tag" id="af-history-tag-name">בחר תג מלשונית חיפוש או אטריביוטים</div>
        <div class="af-history-range">
          <label>טווח:</label>
          <select id="af-history-range">
            <option value="1h">שעה אחרונה</option>
            <option value="6h">6 שעות</option>
            <option value="24h" selected>24 שעות</option>
            <option value="7d">שבוע</option>
            <option value="30d">חודש</option>
            <option value="90d">3 חודשים</option>
            <option value="1y">שנה</option>
            <option value="3y">3 שנים</option>
          </select>
          <label>נקודות:</label>
          <select id="af-history-points">
            <option value="100">100</option>
            <option value="500" selected>500</option>
            <option value="1000">1000</option>
            <option value="5000">5000</option>
          </select>
          <button class="af-btn" id="af-history-load">🔄 טען</button>
        </div>
      </div>
      <div class="af-history-chart" id="af-history-chart">
        <div class="af-empty">בחר תג וטווח זמן</div>
      </div>
      <div class="af-history-summary" id="af-history-summary"></div>
      <div class="af-history-table" id="af-history-table"></div>
    `;

    container.querySelector('#af-history-load').addEventListener('click', () => {
      const tagWid = container.dataset.currentTag;
      if (tagWid) _loadHistory(tagWid);
    });

    container.querySelector('#af-history-range').addEventListener('change', () => {
      const tagWid = container.dataset.currentTag;
      if (tagWid) _loadHistory(tagWid);
    });
  }

  function _showTagHistory(tagWebId) {
    _switchTab('history');
    const container = _panel.querySelector('#af-content-history');
    container.dataset.currentTag = tagWebId;

    const attr = _af.getAttribute(tagWebId);
    if (attr) {
      _panel.querySelector('#af-history-tag-name').innerHTML = 
        '<strong>' + _escHtml(attr.TagName || attr.Name) + '</strong>' +
        (attr.DefaultUnitsOfMeasure ? ' <span class="af-attr-uom">' + _escHtml(attr.DefaultUnitsOfMeasure) + '</span>' : '');
    }

    _loadHistory(tagWebId);
  }

  function _loadHistory(tagWebId) {
    const container = _panel.querySelector('#af-content-history');
    const rangeSelect = container.querySelector('#af-history-range');
    const pointsSelect = container.querySelector('#af-history-points');
    const range = rangeSelect.value;
    const maxPoints = parseInt(pointsSelect.value);

    const rangeMap = { '1h': 3600000, '6h': 21600000, '24h': 86400000, '7d': 604800000, '30d': 2592000000, '90d': 7776000000, '1y': 31557600000, '3y': 94672800000 };
    const rangeMs = rangeMap[range] || 86400000;
    const endTime = Date.now();
    const startTime = endTime - rangeMs;

    const data = _af.getRecordedValues(tagWebId, startTime, endTime, maxPoints);
    const summary = _af.getSummaryValues(tagWebId, startTime, endTime);

    // Draw chart
    _drawMiniChart(data.Items, container.querySelector('#af-history-chart'));

    // Show summary
    if (summary.Items.length > 0) {
      const s = summary.Items[0].Value;
      container.querySelector('#af-history-summary').innerHTML = `
        <div class="af-summary-grid">
          <div class="af-summary-card">
            <div class="af-summary-label">מינימום</div>
            <div class="af-summary-value">${s.Minimum.Value}</div>
          </div>
          <div class="af-summary-card">
            <div class="af-summary-label">מקסימום</div>
            <div class="af-summary-value">${s.Maximum.Value}</div>
          </div>
          <div class="af-summary-card">
            <div class="af-summary-label">ממוצע</div>
            <div class="af-summary-value">${s.Average.Value}</div>
          </div>
          <div class="af-summary-card">
            <div class="af-summary-label">סטיית תקן</div>
            <div class="af-summary-value">${s.StdDev.Value}</div>
          </div>
          <div class="af-summary-card">
            <div class="af-summary-label">טווח</div>
            <div class="af-summary-value">${s.Range.Value}</div>
          </div>
          <div class="af-summary-card">
            <div class="af-summary-label">מספר נקודות</div>
            <div class="af-summary-value">${s.Count.Value}</div>
          </div>
        </div>
      `;
    }

    // Show table (last 50 values)
    const tableItems = data.Items.slice(-50).reverse();
    let tableHtml = '<table class="af-data-table"><thead><tr><th>זמן</th><th>ערך</th><th>איכות</th></tr></thead><tbody>';
    tableItems.forEach(item => {
      const ts = new Date(item.Timestamp);
      const timeStr = ts.toLocaleDateString('he-IL') + ' ' + ts.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      const qualityClass = item.Good ? 'af-quality-good' : 'af-quality-bad';
      tableHtml += `<tr>
        <td>${timeStr}</td>
        <td>${typeof item.Value === 'number' ? item.Value.toFixed(3) : item.Value}</td>
        <td><span class="${qualityClass}">${item.Good ? '✓ תקין' : '✗ לקוי'}</span></td>
      </tr>`;
    });
    tableHtml += '</tbody></table>';
    container.querySelector('#af-history-table').innerHTML = tableHtml;
  }

  function _drawMiniChart(items, container) {
    if (!items || items.length === 0) {
      container.innerHTML = '<div class="af-empty">אין נתונים</div>';
      return;
    }

    const numericItems = items.filter(i => typeof i.Value === 'number' && i.Good);
    if (numericItems.length < 2) {
      container.innerHTML = '<div class="af-empty">אין מספיק נתונים מספריים</div>';
      return;
    }

    const width = 700;
    const height = 200;
    const padding = { top: 20, right: 20, bottom: 30, left: 60 };

    const values = numericItems.map(i => i.Value);
    const times = numericItems.map(i => new Date(i.Timestamp).getTime());
    
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const valRange = maxVal - minVal || 1;
    const timeRange = maxTime - minTime || 1;

    const scaleX = (t) => padding.left + (t - minTime) / timeRange * (width - padding.left - padding.right);
    const scaleY = (v) => height - padding.bottom - (v - minVal) / valRange * (height - padding.top - padding.bottom);

    // Build SVG path
    let pathD = 'M';
    numericItems.forEach((item, i) => {
      const x = scaleX(times[i]);
      const y = scaleY(item.Value);
      pathD += (i === 0 ? '' : ' L') + x.toFixed(1) + ' ' + y.toFixed(1);
    });

    // Area path
    let areaD = pathD + ' L' + scaleX(times[times.length-1]).toFixed(1) + ' ' + (height - padding.bottom) + 
      ' L' + scaleX(times[0]).toFixed(1) + ' ' + (height - padding.bottom) + ' Z';

    // Y-axis labels
    const yTicks = 5;
    let yLabels = '';
    for (let i = 0; i <= yTicks; i++) {
      const val = minVal + (valRange * i / yTicks);
      const y = scaleY(val);
      yLabels += `<text x="${padding.left - 5}" y="${y + 4}" text-anchor="end" fill="#8899aa" font-size="10">${val.toFixed(1)}</text>`;
      yLabels += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#2a3544" stroke-width="0.5"/>`;
    }

    // X-axis labels
    const xTicks = 6;
    let xLabels = '';
    for (let i = 0; i <= xTicks; i++) {
      const t = minTime + (timeRange * i / xTicks);
      const x = scaleX(t);
      const d = new Date(t);
      const label = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      xLabels += `<text x="${x}" y="${height - 5}" text-anchor="middle" fill="#8899aa" font-size="9">${label}</text>`;
    }

    container.innerHTML = `
      <svg width="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="af-chart-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#00b4d8" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#00b4d8" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        ${yLabels}
        ${xLabels}
        <path d="${areaD}" fill="url(#af-chart-grad)"/>
        <path d="${pathD}" fill="none" stroke="#00b4d8" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
    `;
  }

  // ═══════════════════════════════════════════════════════════════
  //  EVENT FRAMES
  // ═══════════════════════════════════════════════════════════════

  function _renderEvents() {
    const container = _panel.querySelector('#af-content-events');
    
    container.innerHTML = `
      <div class="af-events-controls">
        <select id="af-events-site">
          <option value="">כל האתרים</option>
          ${(_af.getStats().sites || []).map(s => '<option value="' + s + '">' + s + '</option>').join('')}
        </select>
        <select id="af-events-severity">
          <option value="">כל הרמות</option>
          <option value="מידע">מידע</option>
          <option value="אזהרה">אזהרה</option>
          <option value="קריטי">קריטי</option>
        </select>
        <button class="af-btn" id="af-events-load">🔄 טען</button>
      </div>
      <div class="af-events-list" id="af-events-list"></div>
    `;

    const loadEvents = () => {
      const site = container.querySelector('#af-events-site').value;
      const severity = container.querySelector('#af-events-severity').value;
      const events = _af.getEventFrames({ site: site || undefined, severity: severity || undefined, maxCount: 50 });
      
      const list = container.querySelector('#af-events-list');
      if (events.Items.length === 0) {
        list.innerHTML = '<div class="af-empty">לא נמצאו אירועים</div>';
        return;
      }

      let html = '';
      events.Items.forEach(ef => {
        const start = new Date(ef.StartTime);
        const end = new Date(ef.EndTime);
        const duration = Math.round((end - start) / 3600000);
        const sevClass = ef.Severity === 'קריטי' ? 'af-sev-critical' : (ef.Severity === 'אזהרה' ? 'af-sev-warning' : 'af-sev-info');
        
        html += `
          <div class="af-event-card">
            <div class="af-event-header">
              <span class="af-event-severity ${sevClass}">${ef.Severity}</span>
              <span class="af-event-template">${_escHtml(ef.TemplateName)}</span>
              ${ef.IsAcknowledged ? '<span class="af-badge-sm af-badge-ack">✓ אושר</span>' : ''}
            </div>
            <div class="af-event-body">
              <div class="af-event-name">${_escHtml(ef.Name)}</div>
              <div class="af-event-time">
                ${start.toLocaleDateString('he-IL')} ${start.toLocaleTimeString('he-IL', {hour:'2-digit',minute:'2-digit'})} 
                — ${end.toLocaleDateString('he-IL')} ${end.toLocaleTimeString('he-IL', {hour:'2-digit',minute:'2-digit'})}
                <span class="af-event-duration">(${duration} שעות)</span>
              </div>
            </div>
          </div>
        `;
      });
      html += '<div class="af-tag-stats">סה"כ: ' + events.TotalCount + ' אירועים</div>';
      list.innerHTML = html;
    };

    container.querySelector('#af-events-load').addEventListener('click', loadEvents);
    container.querySelector('#af-events-site').addEventListener('change', loadEvents);
    container.querySelector('#af-events-severity').addEventListener('change', loadEvents);

    // Load initial
    loadEvents();
  }

  // ═══════════════════════════════════════════════════════════════
  //  DETAIL VIEWS
  // ═══════════════════════════════════════════════════════════════

  function _showAttributeDetail(attrWebId) {
    const attr = _af.getAttribute(attrWebId);
    if (!attr) return;

    const detail = document.createElement('div');
    detail.className = 'af-detail-overlay';
    detail.innerHTML = `
      <div class="af-detail-card">
        <div class="af-detail-header">
          <h3>${_escHtml(attr.Name)}</h3>
          <button class="af-btn-icon af-detail-close">✕</button>
        </div>
        <div class="af-detail-body">
          <div class="af-detail-row"><label>סוג:</label><span>${_getTypeBadge(attr.Type)} ${attr.Type}</span></div>
          <div class="af-detail-row"><label>ערך:</label><span>${_formatValue(attr)}</span></div>
          ${attr.DefaultUnitsOfMeasure ? '<div class="af-detail-row"><label>יחידות:</label><span>' + _escHtml(attr.DefaultUnitsOfMeasure) + '</span></div>' : ''}
          ${attr.TypeQualifier ? '<div class="af-detail-row"><label>EnumSet:</label><span>' + _escHtml(attr.TypeQualifier) + '</span></div>' : ''}
          <div class="af-detail-row"><label>קטגוריה:</label><span>${(attr.CategoryNames || []).join(', ')}</span></div>
          <div class="af-detail-row"><label>נתיב:</label><span class="af-detail-path">${_escHtml(attr.Path)}</span></div>
          <div class="af-detail-row"><label>WebId:</label><span class="af-detail-path">${attr.WebId}</span></div>
          <div class="af-detail-row"><label>קונפיגורציה:</label><span>${attr.IsConfigurationItem ? 'כן' : 'לא'}</span></div>
        </div>
      </div>
    `;

    _panel.appendChild(detail);
    detail.querySelector('.af-detail-close').addEventListener('click', () => detail.remove());
    detail.addEventListener('click', (e) => { if (e.target === detail) detail.remove(); });
  }

  function _showStats() {
    const stats = _af.getStats();
    const detail = document.createElement('div');
    detail.className = 'af-detail-overlay';
    detail.innerHTML = `
      <div class="af-detail-card">
        <div class="af-detail-header">
          <h3>סטטיסטיקות AF</h3>
          <button class="af-btn-icon af-detail-close">✕</button>
        </div>
        <div class="af-detail-body">
          <div class="af-summary-grid">
            <div class="af-summary-card"><div class="af-summary-label">אלמנטים</div><div class="af-summary-value">${stats.totalElements}</div></div>
            <div class="af-summary-card"><div class="af-summary-label">אטריביוטים</div><div class="af-summary-value">${stats.totalAttributes}</div></div>
            <div class="af-summary-card"><div class="af-summary-label">תגי PI</div><div class="af-summary-value">${stats.totalTags}</div></div>
            <div class="af-summary-card"><div class="af-summary-label">Event Frames</div><div class="af-summary-value">${stats.totalEventFrames}</div></div>
            <div class="af-summary-card"><div class="af-summary-label">אתרים</div><div class="af-summary-value">${stats.sites.length}</div></div>
            <div class="af-summary-card"><div class="af-summary-label">Enum Sets</div><div class="af-summary-value">${stats.enumSets.length}</div></div>
          </div>
          <h4>אתרים</h4>
          <ul>${stats.sites.map(s => '<li>' + _escHtml(s) + '</li>').join('')}</ul>
          <h4>Enum Sets</h4>
          <ul>${stats.enumSets.map(e => '<li>' + _escHtml(e) + '</li>').join('')}</ul>
        </div>
      </div>
    `;

    _panel.appendChild(detail);
    detail.querySelector('.af-detail-close').addEventListener('click', () => detail.remove());
    detail.addEventListener('click', (e) => { if (e.target === detail) detail.remove(); });
  }

  // ═══════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════

  function _getIcon(el) {
    const template = (el.TemplateName || '').toLowerCase();
    if (template.includes('תחנת כוח') || template.includes('אתר')) return '🏭';
    if (template.includes('יחידת ייצור') || template.includes('יחידה')) return '⚡';
    if (template.includes('אזור')) return '📂';
    if (template.includes('ציוד')) return '⚙';
    if (el.HasChildren) return '📁';
    return '📄';
  }

  function _getTypeBadge(type) {
    const badges = {
      'Double': '<span class="af-type-badge af-type-double">🔢 Double</span>',
      'String': '<span class="af-type-badge af-type-string">📝 String</span>',
      'Int32': '<span class="af-type-badge af-type-int">🔢 Int32</span>',
      'Boolean': '<span class="af-type-badge af-type-bool">✓✗ Boolean</span>',
      'DateTime': '<span class="af-type-badge af-type-datetime">📅 DateTime</span>',
      'Enum': '<span class="af-type-badge af-type-enum">📋 Enum</span>'
    };
    return badges[type] || '<span class="af-type-badge">' + (type || '?') + '</span>';
  }

  function _formatValue(attr) {
    if (!attr.Value) return '—';
    const v = attr.Value.Value;
    if (v === null || v === undefined) return '—';

    if (attr.Type === 'Boolean') return v ? '✓ כן' : '✗ לא';
    if (attr.Type === 'DateTime') {
      try { return new Date(v).toLocaleDateString('he-IL') + ' ' + new Date(v).toLocaleTimeString('he-IL', {hour:'2-digit',minute:'2-digit'}); }
      catch(e) { return String(v); }
    }
    if (attr.Type === 'Enum' && attr.TypeQualifier && _af && _af.getEnumSet) {
      const es = _af.getEnumSet(attr.TypeQualifier);
      if (es && es.values) return es.values[v] || String(v);
    }
    if (typeof v === 'number') {
      return v.toFixed(attr.DefaultUnitsOfMeasure ? 2 : 0) + (attr.DefaultUnitsOfMeasure ? ' ' + attr.DefaultUnitsOfMeasure : '');
    }
    return String(v);
  }

  function _escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // ═══════════════════════════════════════════════════════════════
  //  STYLES
  // ═══════════════════════════════════════════════════════════════

  function _injectStyles() {
    if (document.getElementById('af-browser-styles')) return;

    const style = document.createElement('style');
    style.id = 'af-browser-styles';
    style.textContent = `
      /* ── Panel ── */
      .af-panel {
        position: fixed;
        top: 0;
        left: 0;
        width: 420px;
        height: 100vh;
        background: #0f1923;
        border-left: 2px solid #1e3a5f;
        color: #c8d6e5;
        font-family: 'Segoe UI', Tahoma, sans-serif;
        font-size: 13px;
        direction: rtl;
        z-index: 99999;
        transform: translateX(-100%);
        transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        display: flex;
        flex-direction: column;
        box-shadow: 4px 0 20px rgba(0,0,0,0.5);
      }
      .af-panel.open {
        transform: translateX(0);
      }

      /* ── Header ── */
      .af-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: #162736;
        border-bottom: 1px solid #1e3a5f;
        flex-shrink: 0;
      }
      .af-panel-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 14px;
        color: #e0e6ed;
      }
      .af-panel-title svg { color: #00b4d8; }
      .af-panel-actions { display: flex; gap: 4px; }

      /* ── Tabs ── */
      .af-panel-tabs {
        display: flex;
        gap: 0;
        padding: 0;
        background: #162736;
        border-bottom: 1px solid #1e3a5f;
        flex-shrink: 0;
        overflow-x: auto;
      }
      .af-tab {
        padding: 8px 12px;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: #8899aa;
        font-size: 12px;
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.2s;
      }
      .af-tab:hover { color: #c8d6e5; background: rgba(255,255,255,0.03); }
      .af-tab.active { color: #00b4d8; border-bottom-color: #00b4d8; }

      /* ── Breadcrumbs ── */
      .af-breadcrumbs {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 14px;
        background: #12202d;
        border-bottom: 1px solid #1a2d3f;
        font-size: 11px;
        overflow-x: auto;
        flex-shrink: 0;
      }
      .af-bc-item { color: #6688aa; cursor: pointer; white-space: nowrap; }
      .af-bc-item:hover { color: #00b4d8; }
      .af-bc-current { color: #e0e6ed; font-weight: 600; }
      .af-bc-sep { color: #3a5068; margin: 0 2px; }

      /* ── Content ── */
      .af-panel-content {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
      }
      .af-tab-content { display: none; padding: 10px 14px; }
      .af-tab-content.active { display: block; }

      /* ── Search Box ── */
      .af-search-box { margin-bottom: 10px; }
      .af-search-box input, .af-attr-filter input {
        width: 100%;
        padding: 8px 12px;
        background: #162736;
        border: 1px solid #1e3a5f;
        border-radius: 6px;
        color: #e0e6ed;
        font-size: 13px;
        outline: none;
        box-sizing: border-box;
      }
      .af-search-box input:focus, .af-attr-filter input:focus {
        border-color: #00b4d8;
        box-shadow: 0 0 0 2px rgba(0,180,216,0.15);
      }
      .af-attr-filter { margin-bottom: 10px; }

      /* ── Tree Node ── */
      .af-tree-node {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        cursor: pointer;
        border-radius: 4px;
        transition: background 0.15s;
      }
      .af-tree-node:hover { background: rgba(0,180,216,0.08); }
      .af-tree-expand { color: #5588aa; font-size: 10px; width: 14px; flex-shrink: 0; }
      .af-tree-icon { font-size: 14px; flex-shrink: 0; }
      .af-tree-name { flex: 1; color: #e0e6ed; font-weight: 500; }
      .af-tree-path { font-size: 10px; color: #5588aa; margin-top: 2px; display: block; }
      .af-tree-badges { display: flex; gap: 4px; flex-shrink: 0; }

      /* ── Badges ── */
      .af-badge {
        display: inline-block;
        padding: 2px 8px;
        background: rgba(0,180,216,0.12);
        color: #00b4d8;
        border-radius: 10px;
        font-size: 11px;
        white-space: nowrap;
      }
      .af-badge-sm {
        display: inline-block;
        padding: 1px 6px;
        background: rgba(255,255,255,0.06);
        color: #8899aa;
        border-radius: 8px;
        font-size: 10px;
        white-space: nowrap;
      }
      .af-badge-num { background: rgba(0,180,216,0.08); color: #5ba8c8; }
      .af-badge-template { background: rgba(139,92,246,0.12); color: #a78bfa; }
      .af-badge-tag { background: rgba(16,185,129,0.12); color: #34d399; font-size: 11px; padding: 2px 6px; border-radius: 8px; }
      .af-badge-ack { background: rgba(16,185,129,0.15); color: #34d399; }

      /* ── Element Header (inside tree) ── */
      .af-element-header {
        margin-bottom: 12px;
        padding-bottom: 10px;
        border-bottom: 1px solid #1e3a5f;
      }
      .af-element-info {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        margin-top: 8px;
      }
      .af-element-icon { font-size: 24px; }
      .af-element-name { font-size: 15px; font-weight: 600; color: #e0e6ed; }
      .af-element-desc { font-size: 12px; color: #8899aa; margin-top: 2px; }
      .af-element-meta { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
      .af-btn-back {
        background: none;
        border: 1px solid #2a4565;
        color: #8899aa;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
      .af-btn-back:hover { background: rgba(0,180,216,0.1); color: #00b4d8; border-color: #00b4d8; }

      /* ── Attributes ── */
      .af-attr-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-bottom: 10px;
        border-bottom: 1px solid #1e3a5f;
        margin-bottom: 10px;
      }
      .af-attr-group { margin-bottom: 14px; }
      .af-attr-group-header {
        font-weight: 600;
        color: #00b4d8;
        font-size: 12px;
        padding: 6px 0;
        border-bottom: 1px solid #1a2d3f;
        margin-bottom: 4px;
      }
      .af-attr-count { color: #5588aa; font-weight: normal; }
      .af-attr-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 8px;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.15s;
      }
      .af-attr-item:hover { background: rgba(0,180,216,0.06); }
      .af-attr-tag { border-right: 3px solid #34d399; }
      .af-attr-info { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .af-attr-name { font-weight: 500; color: #e0e6ed; }
      .af-attr-uom { color: #5588aa; font-size: 11px; }
      .af-attr-value { color: #fbbf24; font-family: 'Consolas', monospace; font-size: 12px; text-align: left; }

      /* ── Type Badges ── */
      .af-type-badge { display: inline-block; padding: 1px 6px; border-radius: 6px; font-size: 10px; white-space: nowrap; }
      .af-type-double { background: rgba(59,130,246,0.15); color: #60a5fa; }
      .af-type-string { background: rgba(245,158,11,0.15); color: #fbbf24; }
      .af-type-int { background: rgba(168,85,247,0.15); color: #c084fc; }
      .af-type-bool { background: rgba(16,185,129,0.15); color: #34d399; }
      .af-type-datetime { background: rgba(244,63,94,0.15); color: #fb7185; }
      .af-type-enum { background: rgba(99,102,241,0.15); color: #818cf8; }

      /* ── Tag Search ── */
      .af-tag-chips {
        display: flex;
        gap: 6px;
        padding: 8px 0;
        flex-wrap: wrap;
      }
      .af-chip {
        padding: 4px 10px;
        background: rgba(255,255,255,0.05);
        border: 1px solid #2a4565;
        border-radius: 14px;
        color: #8899aa;
        font-size: 11px;
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.2s;
      }
      .af-chip:hover { background: rgba(0,180,216,0.1); border-color: #00b4d8; color: #00b4d8; }
      .af-chip.active { background: rgba(0,180,216,0.15); border-color: #00b4d8; color: #00b4d8; }
      .af-tag-category { margin-bottom: 12px; }
      .af-tag-cat-header { font-weight: 600; color: #00b4d8; font-size: 12px; padding: 4px 0; margin-bottom: 4px; }
      .af-tag-cat-header span { color: #5588aa; font-weight: normal; }
      .af-tag-row {
        padding: 6px 8px;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.15s;
        border-right: 2px solid transparent;
      }
      .af-tag-row:hover { background: rgba(0,180,216,0.06); border-right-color: #00b4d8; }
      .af-tag-name { font-weight: 500; color: #e0e6ed; font-size: 12px; }
      .af-tag-desc { color: #5588aa; font-size: 11px; margin-top: 1px; }
      .af-tag-meta { display: flex; gap: 4px; margin-top: 3px; }
      .af-tag-more { color: #5588aa; font-size: 11px; padding: 4px 8px; font-style: italic; }
      .af-tag-stats { color: #5588aa; font-size: 11px; padding: 8px 0; text-align: center; border-top: 1px solid #1a2d3f; margin-top: 8px; }

      /* ── History ── */
      .af-history-controls { margin-bottom: 12px; }
      .af-history-tag { font-size: 14px; margin-bottom: 8px; }
      .af-history-range {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .af-history-range label { color: #8899aa; font-size: 12px; }
      .af-history-range select {
        padding: 4px 8px;
        background: #162736;
        border: 1px solid #1e3a5f;
        border-radius: 4px;
        color: #e0e6ed;
        font-size: 12px;
      }
      .af-history-chart {
        background: #12202d;
        border: 1px solid #1a2d3f;
        border-radius: 6px;
        padding: 8px;
        margin-bottom: 12px;
        min-height: 150px;
      }
      .af-summary-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin-bottom: 12px;
      }
      .af-summary-card {
        background: #162736;
        border: 1px solid #1e3a5f;
        border-radius: 6px;
        padding: 8px;
        text-align: center;
      }
      .af-summary-label { font-size: 10px; color: #5588aa; }
      .af-summary-value { font-size: 16px; font-weight: 600; color: #e0e6ed; margin-top: 2px; }
      .af-data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
      }
      .af-data-table th {
        background: #162736;
        color: #8899aa;
        padding: 6px 8px;
        text-align: right;
        font-weight: 600;
        border-bottom: 1px solid #1e3a5f;
        position: sticky;
        top: 0;
      }
      .af-data-table td {
        padding: 4px 8px;
        border-bottom: 1px solid #12202d;
        color: #c8d6e5;
      }
      .af-data-table tr:hover td { background: rgba(0,180,216,0.04); }
      .af-quality-good { color: #34d399; }
      .af-quality-bad { color: #f87171; }
      .af-history-table { max-height: 300px; overflow-y: auto; }

      /* ── Events ── */
      .af-events-controls {
        display: flex;
        gap: 8px;
        margin-bottom: 10px;
        flex-wrap: wrap;
      }
      .af-events-controls select {
        padding: 5px 10px;
        background: #162736;
        border: 1px solid #1e3a5f;
        border-radius: 4px;
        color: #e0e6ed;
        font-size: 12px;
      }
      .af-event-card {
        background: #162736;
        border: 1px solid #1e3a5f;
        border-radius: 6px;
        padding: 10px;
        margin-bottom: 8px;
      }
      .af-event-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
      .af-event-severity {
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 600;
      }
      .af-sev-critical { background: rgba(239,68,68,0.15); color: #f87171; }
      .af-sev-warning { background: rgba(245,158,11,0.15); color: #fbbf24; }
      .af-sev-info { background: rgba(59,130,246,0.15); color: #60a5fa; }
      .af-event-template { color: #8899aa; font-size: 12px; }
      .af-event-name { font-weight: 500; color: #e0e6ed; }
      .af-event-time { color: #5588aa; font-size: 11px; margin-top: 2px; }
      .af-event-duration { color: #8899aa; }

      /* ── Buttons ── */
      .af-btn {
        padding: 5px 12px;
        background: rgba(0,180,216,0.15);
        border: 1px solid #00b4d8;
        border-radius: 4px;
        color: #00b4d8;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .af-btn:hover { background: rgba(0,180,216,0.25); }
      .af-btn-icon {
        background: none;
        border: none;
        color: #8899aa;
        font-size: 16px;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        transition: all 0.2s;
      }
      .af-btn-icon:hover { color: #e0e6ed; background: rgba(255,255,255,0.05); }

      /* ── Detail Overlay ── */
      .af-detail-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
      }
      .af-detail-card {
        background: #0f1923;
        border: 1px solid #1e3a5f;
        border-radius: 8px;
        width: 90%;
        max-height: 80%;
        overflow-y: auto;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      }
      .af-detail-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: #162736;
        border-bottom: 1px solid #1e3a5f;
        border-radius: 8px 8px 0 0;
      }
      .af-detail-header h3 { margin: 0; font-size: 14px; color: #e0e6ed; }
      .af-detail-header h4 { margin: 12px 0 6px; font-size: 13px; color: #00b4d8; }
      .af-detail-body { padding: 14px 16px; }
      .af-detail-body h4 { margin: 14px 0 6px; font-size: 13px; color: #00b4d8; }
      .af-detail-body ul { padding: 0 20px; margin: 0; }
      .af-detail-body li { margin: 3px 0; color: #c8d6e5; font-size: 12px; }
      .af-detail-row {
        display: flex;
        justify-content: space-between;
        padding: 6px 0;
        border-bottom: 1px solid #12202d;
      }
      .af-detail-row label { color: #5588aa; font-size: 12px; }
      .af-detail-row span { color: #e0e6ed; font-size: 12px; }
      .af-detail-path { font-family: 'Consolas', monospace; font-size: 10px; color: #5588aa; word-break: break-all; }

      /* ── Empty state ── */
      .af-empty {
        text-align: center;
        color: #5588aa;
        padding: 30px 20px;
        font-size: 13px;
      }

      /* ── Scrollbar ── */
      .af-panel ::-webkit-scrollbar { width: 6px; }
      .af-panel ::-webkit-scrollbar-track { background: transparent; }
      .af-panel ::-webkit-scrollbar-thumb { background: #2a4565; border-radius: 3px; }
      .af-panel ::-webkit-scrollbar-thumb:hover { background: #3a5878; }

      /* ── AF Toggle Button (fixed) ── */
      #af-browser-toggle {
        position: fixed;
        bottom: 20px;
        left: 20px;
        width: 48px;
        height: 48px;
        background: linear-gradient(135deg, #0f1923 0%, #162736 100%);
        border: 2px solid #1e3a5f;
        border-radius: 50%;
        color: #00b4d8;
        font-size: 20px;
        cursor: pointer;
        z-index: 99998;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s;
        box-shadow: 0 4px 15px rgba(0,0,0,0.4);
      }
      #af-browser-toggle:hover {
        border-color: #00b4d8;
        box-shadow: 0 4px 20px rgba(0,180,216,0.3);
        transform: scale(1.1);
      }
      #af-browser-toggle .af-toggle-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        background: #00b4d8;
        color: #0f1923;
        font-size: 9px;
        font-weight: 700;
        padding: 1px 5px;
        border-radius: 8px;
      }
    `;

    document.head.appendChild(style);

    // Create toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'af-browser-toggle';
    toggleBtn.title = 'דפדפן AF (F9)';
    toggleBtn.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
      <span class="af-toggle-badge">AF</span>
    `;
    toggleBtn.addEventListener('click', toggle);
    document.body.appendChild(toggleBtn);
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  return {
    init,
    toggle,
    open,
    close,
    getDataLayer: () => _af,
    isOpen: () => _isOpen,
    navigateTo: (elementWebId) => {
      _currentElement = elementWebId;
      open();
      _switchTab('tree');
      const el = _af.getElement(elementWebId);
      if (el) _updateBreadcrumbs(el);
    },
    showTagHistory: (tagWebId) => {
      open();
      _showTagHistory(tagWebId);
    }
  };

})();
