/**
 * mobile-qa.js — Lightweight Mobile QA Interface
 * PIV-Complete-v3
 *
 * Shows scan results as swipeable cards (one symbol per card) with
 * large status indicators (pass/warn/fail). Tap card to expand details.
 * "Run Scan" floating action button. Results sync to desktop via sync engine.
 */
(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────
  var _container = null;
  var _results = [];
  var _currentIndex = 0;
  var _isScanning = false;
  var _fab = null;
  var _swipeStart = { x: 0, y: 0, time: 0 };
  var _trackEl = null;

  // ─── DOM helper ───────────────────────────────────────────────────
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') node.className = attrs[k];
        else if (k === 'textContent') node.textContent = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        }
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      children.forEach(function (c) {
        if (typeof c === 'string') node.appendChild(document.createTextNode(c));
        else if (c) node.appendChild(c);
      });
    }
    return node;
  }

  // ─── Status helpers ───────────────────────────────────────────────
  function getStatusClass(symbol) {
    if (!symbol) return 'pass';
    var errors = symbol.errorCount || symbol.errors || 0;
    var warnings = symbol.warnCount || symbol.warnings || 0;
    if (errors > 0) return 'fail';
    if (warnings > 0) return 'warn';
    return 'pass';
  }

  function getStatusIcon(status) {
    if (status === 'fail') return '\u2716'; // X mark
    if (status === 'warn') return '\u26A0'; // Warning
    return '\u2714'; // Check mark
  }

  function getStatusLabel(status) {
    if (status === 'fail') return '\u05E0\u05DB\u05E9\u05DC'; // Failed
    if (status === 'warn') return '\u05D0\u05D6\u05D4\u05E8\u05D5\u05EA'; // Warnings
    return '\u05EA\u05E7\u05D9\u05DF'; // Pass
  }

  // ─── R300: MM20 type detection ─────────────────────────────────────
  function getSymbolType(symbol) {
    if (symbol.type === 'mm20') return 'mm20';
    if (symbol.format === 'unified' || symbol.unified) return 'mm20';
    var name = (symbol.symbolName || symbol.name || '').toLowerCase();
    // Known MM20 prefixes from package-manifest
    if (/^(afbrowser|aftree|aftable|pibar|pitrend|pigauge|pixy|mm20-)/.test(name)) return 'mm20';
    return 'legacy';
  }

  function getTypeBadge(type) {
    if (type === 'mm20') return '\u25CF MM20';
    return '\u25CB Legacy';
  }

  function getTypeBadgeColor(type) {
    if (type === 'mm20') return '#8b5ec0';
    return '#4a5e7a';
  }

  // ─── Build a single QA card ───────────────────────────────────────
  function buildCard(symbol, index) {
    var status = getStatusClass(symbol);
    var errors = symbol.errorCount || symbol.errors || 0;
    var warnings = symbol.warnCount || symbol.warnings || 0;
    var info = symbol.infoCount || symbol.info || 0;
    var name = symbol.symbolName || symbol.name || 'Symbol ' + (index + 1);
    var symType = getSymbolType(symbol);

    // Status indicator
    var statusIndicator = el('div', {
      className: 'piv-mobile-qa-status ' + status,
      textContent: getStatusIcon(status)
    });

    // R300: Type badge (MM20 / Legacy)
    var typeBadge = el('div', {
      style: 'text-align:center;font-size:10px;font-weight:700;color:' + getTypeBadgeColor(symType) +
        ';letter-spacing:0.5px;margin-bottom:2px;',
      textContent: getTypeBadge(symType)
    });

    // Symbol name
    var symbolName = el('div', {
      className: 'piv-mobile-qa-symbol-name',
      textContent: name
    });

    // Status label
    var statusLabel = el('div', {
      style: 'text-align:center;font-size:14px;font-weight:600;color:' +
        (status === 'fail' ? 'var(--red,#e63946)' :
         status === 'warn' ? 'var(--orange,#ff6b35)' :
         'var(--green,#06d6a0)'),
      textContent: getStatusLabel(status)
    });

    // Details section
    var detailRows = [
      buildDetailRow('\u05E9\u05D2\u05D9\u05D0\u05D5\u05EA', String(errors),
        errors > 0 ? 'var(--red,#e63946)' : 'var(--text-secondary,#6b7fa3)'),
      buildDetailRow('\u05D0\u05D6\u05D4\u05E8\u05D5\u05EA', String(warnings),
        warnings > 0 ? 'var(--orange,#ff6b35)' : 'var(--text-secondary,#6b7fa3)'),
      buildDetailRow('\u05DE\u05D9\u05D3\u05E2', String(info),
        'var(--teal,#00d4ff)')
    ];

    // Add rule details if available
    var rules = symbol.rules || symbol.details || [];
    if (rules.length > 0) {
      var ruleRows = [];
      rules.forEach(function (rule) {
        var ruleStatus = rule.status || rule.severity || 'info';
        var ruleColor = ruleStatus === 'error' ? 'var(--red,#e63946)' :
                        ruleStatus === 'warning' ? 'var(--orange,#ff6b35)' :
                        'var(--teal,#00d4ff)';
        ruleRows.push(
          buildDetailRow(
            rule.ruleName || rule.rule || rule.name || 'Rule',
            rule.message || rule.msg || ruleStatus,
            ruleColor
          )
        );
      });
      detailRows = detailRows.concat(ruleRows);
    }

    var details = el('div', { className: 'piv-mobile-qa-details' }, detailRows);

    // Expandable — tap to show more details
    var expanded = false;
    var expandBtn = el('button', {
      style: 'width:100%;padding:10px;background:var(--bg-surface,#0f1923);' +
        'border:1px solid var(--border,rgba(255,255,255,0.06));' +
        'border-radius:var(--radius-lg,12px);color:var(--teal,#00d4ff);' +
        'font-size:13px;font-family:inherit;cursor:pointer;text-align:center;' +
        'min-height:44px;',
      textContent: '\u05D4\u05E6\u05D2 \u05E4\u05E8\u05D8\u05D9\u05DD \u25BC' // Show details
    });

    var expandedContent = el('div', {
      style: 'display:none',
      className: 'piv-mobile-qa-expanded'
    });

    // Build expanded content from rules
    if (rules.length > 0) {
      rules.forEach(function (rule) {
        var ruleCard = el('div', {
          style: 'background:var(--bg-surface,#0f1923);border:1px solid var(--border,rgba(255,255,255,0.06));' +
            'border-radius:8px;padding:10px;margin-bottom:8px;'
        }, [
          el('div', {
            style: 'font-size:12px;font-weight:600;color:var(--text-bright,#fff);margin-bottom:4px;',
            textContent: rule.ruleName || rule.rule || rule.name || ''
          }),
          el('div', {
            style: 'font-size:11px;color:var(--text-secondary,#6b7fa3);line-height:1.5;',
            textContent: rule.message || rule.msg || ''
          })
        ]);
        expandedContent.appendChild(ruleCard);
      });
    } else {
      expandedContent.appendChild(el('div', {
        style: 'text-align:center;padding:16px;color:var(--text-muted,#4a5e7a);font-size:12px;',
        textContent: '\u05D0\u05D9\u05DF \u05E4\u05E8\u05D8\u05D9\u05DD \u05E0\u05D5\u05E1\u05E4\u05D9\u05DD' // No additional details
      }));
    }

    expandBtn.addEventListener('click', function () {
      expanded = !expanded;
      expandedContent.style.display = expanded ? '' : 'none';
      expandBtn.textContent = expanded ?
        '\u05D4\u05E1\u05EA\u05E8 \u05E4\u05E8\u05D8\u05D9\u05DD \u25B2' :
        '\u05D4\u05E6\u05D2 \u05E4\u05E8\u05D8\u05D9\u05DD \u25BC';
    });

    var card = el('div', { className: 'piv-mobile-qa-card' }, [
      typeBadge,
      statusIndicator,
      symbolName,
      statusLabel,
      details,
      expandBtn,
      expandedContent
    ]);

    // R300: add data attribute for MM20 filtering
    card.setAttribute('data-type', symType);

    return card;
  }

  function buildDetailRow(label, value, color) {
    return el('div', { className: 'piv-mobile-qa-detail-row' }, [
      el('span', {
        style: 'color:var(--text-secondary,#6b7fa3)',
        textContent: label
      }),
      el('span', {
        style: 'font-weight:600;font-family:var(--font-mono,monospace);color:' + (color || 'var(--text-primary,#c8d6e5)'),
        textContent: value
      })
    ]);
  }

  // ─── Build pagination dots ────────────────────────────────────────
  function buildPagination() {
    var container = el('div', { className: 'piv-mobile-qa-pagination' });

    // Limit dots for large result sets
    var maxDots = Math.min(_results.length, 20);
    for (var i = 0; i < maxDots; i++) {
      var dot = el('div', {
        className: 'piv-mobile-qa-dot' + (i === _currentIndex ? ' active' : '')
      });
      container.appendChild(dot);
    }

    if (_results.length > maxDots) {
      container.appendChild(el('span', {
        style: 'font-size:10px;color:var(--text-muted,#4a5e7a);margin-right:4px;',
        textContent: '... +' + (_results.length - maxDots)
      }));
    }

    return container;
  }

  function updatePagination() {
    if (!_container) return;
    var oldPagination = _container.querySelector('.piv-mobile-qa-pagination');
    if (oldPagination) {
      var newPagination = buildPagination();
      oldPagination.parentNode.replaceChild(newPagination, oldPagination);
    }
  }

  // ─── Navigate to card index ───────────────────────────────────────
  function goToCard(index) {
    if (index < 0 || index >= _results.length) return;
    _currentIndex = index;

    if (_trackEl) {
      _trackEl.style.transform = 'translateX(' + (_currentIndex * 100) + '%)';
    }

    updatePagination();
  }

  // ─── Swipe handling on cards track ────────────────────────────────
  function initCardSwipe() {
    if (!_trackEl) return;

    var container = _trackEl.parentElement;

    container.addEventListener('touchstart', function (e) {
      var touch = e.changedTouches[0];
      _swipeStart.x = touch.pageX;
      _swipeStart.y = touch.pageY;
      _swipeStart.time = Date.now();
    }, { passive: true });

    container.addEventListener('touchend', function (e) {
      var touch = e.changedTouches[0];
      var dx = touch.pageX - _swipeStart.x;
      var dy = Math.abs(touch.pageY - _swipeStart.y);
      var elapsed = Date.now() - _swipeStart.time;

      if (elapsed > 400) return;
      if (Math.abs(dx) < 40) return;
      if (dy > 80) return;

      // RTL: swipe right = previous, swipe left = next
      if (dx > 0) {
        goToCard(_currentIndex - 1);
      } else {
        goToCard(_currentIndex + 1);
      }

      if (window.PIV_MOBILE) {
        window.PIV_MOBILE.haptic('light');
      }
    }, { passive: true });
  }

  // ─── Render all cards ─────────────────────────────────────────────
  function render() {
    if (!_container) return;

    // Clear container
    while (_container.firstChild) _container.removeChild(_container.firstChild);

    if (_results.length === 0) {
      // Empty state
      var emptyState = el('div', {
        style: 'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
          'height:100%;color:var(--text-muted,#4a5e7a);text-align:center;padding:40px 20px;gap:16px;'
      }, [
        el('div', {
          style: 'font-size:48px;opacity:0.3;',
          textContent: '\uD83D\uDD0D' // magnifying glass
        }),
        el('div', {
          style: 'font-size:16px;font-weight:600;color:var(--text-secondary,#6b7fa3);',
          textContent: '\u05D0\u05D9\u05DF \u05EA\u05D5\u05E6\u05D0\u05D5\u05EA QA' // No QA results
        }),
        el('div', {
          style: 'font-size:13px;max-width:260px;line-height:1.6;',
          textContent: '\u05DC\u05D7\u05E5 \u05E2\u05DC \u05DB\u05E4\u05EA\u05D5\u05E8 \u05D4\u05E1\u05E8\u05D9\u05E7\u05D4 \u05DB\u05D3\u05D9 \u05DC\u05D4\u05E8\u05D9\u05E5 \u05D1\u05D3\u05D9\u05E7\u05EA QA' // Press scan button
        })
      ]);

      _container.appendChild(emptyState);
      return;
    }

    // Header
    var errorCount = 0;
    var warnCount = 0;
    var passCount = 0;
    var mm20Count = 0;
    var legacyCount = 0;
    _results.forEach(function (r) {
      var s = getStatusClass(r);
      if (s === 'fail') errorCount++;
      else if (s === 'warn') warnCount++;
      else passCount++;
      // R300: count by type
      if (getSymbolType(r) === 'mm20') mm20Count++;
      else legacyCount++;
    });

    var headerRight = el('div', { style: 'display:flex;align-items:center;gap:8px;' }, [
      el('span', {
        style: 'font-size:14px;font-weight:700;color:var(--text-bright,#fff);',
        textContent: 'QA \u2014 ' + _results.length + ' \u05E1\u05DE\u05DC\u05D9\u05DD'
      }),
      el('span', {
        style: 'font-size:10px;padding:2px 6px;border-radius:8px;background:rgba(108,63,160,0.2);color:#b794e0;',
        textContent: mm20Count + ' MM20 / ' + legacyCount + ' Legacy'
      })
    ]);

    var headerLeft = el('div', { style: 'display:flex;align-items:center;gap:10px;font-size:12px;font-weight:600;' }, [
      el('span', {
        style: 'color:var(--red,#e63946);',
        textContent: errorCount + ' \u05E9\u05D2\u05D9\u05D0\u05D5\u05EA'
      }),
      el('span', {
        style: 'color:var(--orange,#ff6b35);',
        textContent: warnCount + ' \u05D0\u05D6\u05D4\u05E8\u05D5\u05EA'
      }),
      el('span', {
        style: 'color:var(--green,#06d6a0);',
        textContent: passCount + ' \u05EA\u05E7\u05D9\u05DF'
      })
    ]);

    var closeBtn = el('button', {
      style: 'width:36px;height:36px;border:none;background:none;color:var(--text-secondary,#6b7fa3);cursor:pointer;display:flex;align-items:center;justify-content:center;',
      'aria-label': 'Close'
    });
    var closeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    closeSvg.setAttribute('viewBox', '0 0 24 24');
    closeSvg.setAttribute('width', '20');
    closeSvg.setAttribute('height', '20');
    closeSvg.setAttribute('fill', 'none');
    closeSvg.setAttribute('stroke', 'currentColor');
    closeSvg.setAttribute('stroke-width', '2');
    var closePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    closePath.setAttribute('d', 'M18 6L6 18M6 6l12 12');
    closeSvg.appendChild(closePath);
    closeBtn.appendChild(closeSvg);
    closeBtn.addEventListener('click', function () {
      PIV_MOBILE_QA.hide();
    });

    var header = el('div', { className: 'piv-mobile-qa-header' }, [
      headerRight,
      headerLeft,
      closeBtn
    ]);

    // Cards track
    var cardsContainer = el('div', { className: 'piv-mobile-qa-cards-container' });
    _trackEl = el('div', { className: 'piv-mobile-qa-cards-track' });

    _results.forEach(function (result, idx) {
      _trackEl.appendChild(buildCard(result, idx));
    });

    // Set initial position
    _trackEl.style.transform = 'translateX(' + (_currentIndex * 100) + '%)';

    cardsContainer.appendChild(_trackEl);

    // Pagination
    var pagination = buildPagination();

    // Assemble
    _container.appendChild(header);
    _container.appendChild(cardsContainer);
    _container.appendChild(pagination);

    // Init swipe on cards
    initCardSwipe();
  }

  // ─── Create FAB ───────────────────────────────────────────────────
  function createFab() {
    if (_fab) return;

    _fab = document.createElement('button');
    _fab.className = 'piv-mobile-qa-fab';
    _fab.setAttribute('aria-label', 'Run QA Scan');

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11');
    svg.appendChild(path);
    _fab.appendChild(svg);

    _fab.addEventListener('click', function () {
      if (window.PIV_MOBILE) window.PIV_MOBILE.haptic('medium');
      PIV_MOBILE_QA.runScan();
    });

    document.body.appendChild(_fab);
  }

  function removeFab() {
    if (_fab && _fab.parentNode) {
      _fab.parentNode.removeChild(_fab);
      _fab = null;
    }
  }

  // ─── Public API ────────────────────────────────────────────────────
  var PIV_MOBILE_QA = window.PIV_MOBILE_QA = {

    /**
     * Show the mobile QA interface.
     */
    show: function () {
      if (!window.PIV_MOBILE || !window.PIV_MOBILE.isMobile()) return;

      if (!_container) {
        _container = el('div', { className: 'piv-mobile-qa', id: 'piv-mobile-qa' });
        document.body.appendChild(_container);
      }

      _container.style.display = 'flex';
      render();
      createFab();
    },

    /**
     * Hide the mobile QA interface.
     */
    hide: function () {
      if (_container) {
        _container.style.display = 'none';
      }
      removeFab();
    },

    /**
     * Load QA results (from sync or from a scan).
     * @param {Array} results - Array of symbol result objects
     */
    loadResults: function (results) {
      _results = results || [];
      _currentIndex = 0;

      // Update QA badge on bottom nav
      var errorCount = 0;
      _results.forEach(function (r) {
        if (getStatusClass(r) === 'fail') errorCount++;
      });
      if (window.PIV_MOBILE) {
        window.PIV_MOBILE.setQaBadgeCount(errorCount);
      }

      if (_container && _container.style.display !== 'none') {
        render();
      }
    },

    /**
     * Run a QA scan. Attempts to use the existing QA worker
     * or QA background module.
     * @returns {Promise|undefined}
     */
    runScan: function () {
      if (_isScanning) return;
      _isScanning = true;

      if (_fab) _fab.classList.add('scanning');

      // Try to invoke existing QA scan mechanisms
      var scanPromise;

      if (window.PIV_QA_BG && typeof window.PIV_QA_BG.runScan === 'function') {
        scanPromise = window.PIV_QA_BG.runScan();
      } else if (window.__PIV_QA && typeof window.__PIV_QA.runAllChecks === 'function') {
        scanPromise = window.__PIV_QA.runAllChecks();
      } else {
        // Generate demo results for testing
        scanPromise = new Promise(function (resolve) {
          setTimeout(function () {
            var demoResults = generateDemoResults();
            resolve(demoResults);
          }, 1500);
        });
      }

      var finishScan = function (results) {
        _isScanning = false;
        if (_fab) _fab.classList.remove('scanning');

        if (results && Array.isArray(results)) {
          PIV_MOBILE_QA.loadResults(results);

          // Sync results to other devices
          if (window.PIV_SYNC && window.PIV_SYNC.isConnected()) {
            window.PIV_SYNC.syncState(
              window.PIV_SYNC.CHANNELS.QA_RESULTS,
              results
            );
          }
        }
      };

      if (scanPromise && typeof scanPromise.then === 'function') {
        return scanPromise.then(finishScan).catch(function (err) {
          console.error('[MobileQA] Scan error:', err);
          _isScanning = false;
          if (_fab) _fab.classList.remove('scanning');
        });
      } else {
        finishScan(scanPromise);
      }
    },

    /**
     * Get current results.
     * @returns {Array}
     */
    getResults: function () {
      return _results.slice();
    },

    /**
     * Navigate to a specific result by index.
     * @param {number} index
     */
    goTo: function (index) {
      goToCard(index);
    }
  };

  // ─── Demo results generator ───────────────────────────────────────
  function generateDemoResults() {
    var symbolNames = [
      'Pump-Status', 'Tank-Level', 'Valve-Control', 'Flow-Meter',
      'Temperature-Display', 'Motor-Monitor', 'Alarm-Panel',
      'Trend-Chart', 'PI-Tag-Table', 'Digital-Gauge'
    ];

    return symbolNames.map(function (name) {
      var errors = Math.random() > 0.7 ? Math.floor(Math.random() * 4) + 1 : 0;
      var warnings = Math.random() > 0.5 ? Math.floor(Math.random() * 3) + 1 : 0;
      var rules = [];

      if (errors > 0) {
        rules.push({
          ruleName: 'Missing AF Binding',
          status: 'error',
          message: 'Element references undefined AF attribute path'
        });
      }
      if (warnings > 0) {
        rules.push({
          ruleName: 'Deprecated API Usage',
          status: 'warning',
          message: 'Symbol uses legacy GetValue API instead of streams'
        });
      }
      rules.push({
        ruleName: 'Accessibility Check',
        status: 'info',
        message: 'All interactive elements have ARIA labels'
      });

      return {
        symbolName: name,
        errorCount: errors,
        warnCount: warnings,
        infoCount: 1,
        rules: rules
      };
    });
  }

  // ─── Auto-show on QA mode if mobile ───────────────────────────────
  var modeObserver = new MutationObserver(function () {
    if (!window.PIV_MOBILE || !window.PIV_MOBILE.isMobile()) return;

    var qaMode = document.getElementById('mode-qa');
    if (qaMode && qaMode.classList.contains('active')) {
      PIV_MOBILE_QA.show();
    } else {
      // Don't fully hide — just remove FAB if not in QA mode
      removeFab();
    }
  });

  // Start observing when DOM is ready
  document.addEventListener('DOMContentLoaded', function () {
    var qaMode = document.getElementById('mode-qa');
    if (qaMode) {
      modeObserver.observe(qaMode, { attributes: true, attributeFilter: ['class'] });
    }
  });

})();
