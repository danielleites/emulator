/**
 * ═══════════════════════════════════════════════════════
 *  sym-table-wow.js  —  Executive Virtual Table
 * ═══════════════════════════════════════════════════════
 *  Virtual Scrolling (DOM Recycling) table that renders
 *  1,000,000 rows with only ~25 DOM elements.
 *
 *  Architecture:
 *    PI Vision → dataUpdate() → Worker (sort/filter) →
 *    PROCESSED_ROWS → Virtual Scroll → translateY() →
 *    GPU Compositor → 60fps scrolling
 *
 *  Key techniques:
 *    - DOM Recycling: ~25 row <div>s, translated by index
 *    - Web Worker: sort/filter/search off UI thread
 *    - CSS Grid: column layout without reflow
 *    - position:sticky for frozen header/columns
 *    - Zebra striping via CSS variable (--row-index)
 *    - rAF batched scroll handler
 *
 *  DataShape : Table
 *  Version   : WOW TBL 100.0
 *  Prefix    : wow-tbl-
 * ═══════════════════════════════════════════════════════
 */

(function (PV) {
    'use strict';

    // ── Symbol constructor ──
    function symbolVis() {}
    PV.deriveVisualizationFromBase(symbolVis);

    // ── Resolve script base path ──
    var SCRIPT_BASE = (function () {
        var scripts = document.querySelectorAll('script[src*="sym-table-wow"]');
        if (scripts.length) {
            var s = scripts[scripts.length - 1].getAttribute('src') || '';
            return s.substring(0, s.lastIndexOf('/') + 1);
        }
        var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
        return base + '/Scripts/app/editor/symbols/ext/';
    })();


    // ═══════════════════════════════════════
    //  CONSTANTS
    // ═══════════════════════════════════════

    var ROW_HEIGHT = 38;           // Fixed row height for virtual scroll calculation
    var BUFFER_ROWS = 5;           // Extra rows above/below viewport for smooth scrolling
    var SEARCH_DEBOUNCE_MS = 250;  // Debounce for search input
    var RESIZE_DEBOUNCE_MS = 150;


    // ═══════════════════════════════════════
    //  DEMO DATA
    // ═══════════════════════════════════════

    var DEMO_COLUMNS = [
        { key: 'time',    label: '\u05D6\u05DE\u05DF',     width: 160, sticky: false },
        { key: 'asset',   label: '\u05E0\u05DB\u05E1',     width: 140, sticky: true  },
        { key: 'tag',     label: '\u05EA\u05D2\u05D9\u05EA', width: 200, sticky: false },
        { key: 'value',   label: '\u05E2\u05E8\u05DA',     width: 100, isMetric: true },
        { key: 'status',  label: '\u05E1\u05D8\u05D8\u05D5\u05E1', width: 90 },
        { key: 'unit',    label: '\u05D9\u05D7\u05D9\u05D3\u05D4', width: 100 }
    ];

    var DEMO_ASSETS = ['\u05D9\u05D7\u05D9\u05D3\u05D4 1','\u05D9\u05D7\u05D9\u05D3\u05D4 2','\u05D9\u05D7\u05D9\u05D3\u05D4 3','\u05D9\u05D7\u05D9\u05D3\u05D4 4','\u05D9\u05D7\u05D9\u05D3\u05D4 5'];
    var DEMO_TAGS = ['MW_Total','Temp_Bearing','Vibration_X','Pressure_In','Efficiency_%','RPM','Flow_Rate'];
    var DEMO_STATUSES = ['\u05EA\u05E7\u05D9\u05DF','\u05D0\u05D6\u05D4\u05E8\u05D4','\u05E7\u05E8\u05D9\u05D8\u05D9','\u05EA\u05E7\u05D9\u05DF','\u05EA\u05E7\u05D9\u05DF'];
    var DEMO_UNITS = ['MW','°C','mm/s','Bar','%','RPM','m³/h'];

    function generateDemoData(count) {
        var rows = [];
        var now = Date.now();

        for (var i = 0; i < count; i++) {
            var t = now - (count - i) * 60000; // 1 min intervals going back
            var d = new Date(t);
            var assetIdx = i % DEMO_ASSETS.length;
            var tagIdx = i % DEMO_TAGS.length;
            var val = (Math.random() * 100).toFixed(1);

            rows.push({
                time:   _padZero(d.getDate()) + '/' + _padZero(d.getMonth() + 1) + ' ' +
                        _padZero(d.getHours()) + ':' + _padZero(d.getMinutes()),
                asset:  DEMO_ASSETS[assetIdx],
                tag:    DEMO_TAGS[tagIdx],
                value:  val,
                status: parseFloat(val) > 90 ? '\u05E7\u05E8\u05D9\u05D8\u05D9' :
                        parseFloat(val) > 70 ? '\u05D0\u05D6\u05D4\u05E8\u05D4' : '\u05EA\u05E7\u05D9\u05DF',
                unit:   DEMO_UNITS[tagIdx]
            });
        }
        return rows;
    }


    // ═══════════════════════════════════════
    //  INITIALIZATION
    // ═══════════════════════════════════════

    symbolVis.prototype.init = function (scope, elem) {
        var self = this;
        var config = scope.config;
        var hostEl = elem[0];

        // ── Shadow DOM ──
        var shadow;
        try {
            var mountEl = hostEl.querySelector('.wow-tbl-root-mount');
            if (mountEl && mountEl.attachShadow) {
                shadow = mountEl.attachShadow({ mode: 'open' });
            } else {
                shadow = mountEl || hostEl;
            }
        } catch (e) {
            shadow = hostEl.querySelector('.wow-tbl-root-mount') || hostEl;
        }

        // ── Inject CSS ──
        var linkEl = document.createElement('link');
        linkEl.rel = 'stylesheet';
        linkEl.href = SCRIPT_BASE + 'sym-table-wow.css';
        shadow.appendChild(linkEl);


        // ── Build DOM Scaffold ──
        var root = document.createElement('div');
        root.className = 'wow-tbl-root';

        // Toolbar
        var toolbar = document.createElement('div');
        toolbar.className = 'wow-tbl-toolbar';
        toolbar.innerHTML =
            '<span class="wow-tbl-title">' + (config.Title || 'Executive Virtual Table') + '</span>' +
            '<div class="wow-tbl-toolbar-actions">' +
                '<input class="wow-tbl-search" type="text" placeholder="\u05D7\u05D9\u05E4\u05D5\u05E9..." />' +
                '<button class="wow-tbl-btn wow-tbl-btn-export" title="Export CSV">&#x21E9; CSV</button>' +
            '</div>';
        root.appendChild(toolbar);

        // Stats bar
        var statsBar = document.createElement('div');
        statsBar.className = 'wow-tbl-stats';
        root.appendChild(statsBar);

        // Table header (sticky)
        var headerRow = document.createElement('div');
        headerRow.className = 'wow-tbl-header';
        root.appendChild(headerRow);

        // Viewport (scrollable container)
        var viewport = document.createElement('div');
        viewport.className = 'wow-tbl-viewport';

        // Scroll spacer (sets total virtual height)
        var scrollSpace = document.createElement('div');
        scrollSpace.className = 'wow-tbl-scroll-space';
        viewport.appendChild(scrollSpace);

        root.appendChild(viewport);

        // Footer
        var footer = document.createElement('div');
        footer.className = 'wow-tbl-footer';
        root.appendChild(footer);

        shadow.appendChild(root);


        // ── State ──
        var allProcessedRows = [];
        var columns = config.Columns || DEMO_COLUMNS;
        var rowElements = [];
        var animFrameId = null;
        var totalCount = 0;
        var filteredCount = 0;
        var stats = {};
        var worker = null;
        var searchTimeout = null;
        var resizeTimeout = null;
        var _pendingData    = null;
        var _dataDebounceId = null;
        var _firstDataDone  = false;
        var DATA_DEBOUNCE_MS = 100;


        // ── Build Header ──
        function buildHeader() {
            headerRow.innerHTML = '';
            var gridTemplate = columns.map(function (c) { return (c.width || 120) + 'px'; }).join(' ');
            headerRow.style.gridTemplateColumns = gridTemplate;

            for (var i = 0; i < columns.length; i++) {
                var col = columns[i];
                var cell = document.createElement('div');
                cell.className = 'wow-tbl-header-cell';
                if (col.sticky) cell.classList.add('wow-tbl-sticky-col');
                cell.dataset.colKey = col.key;
                cell.innerHTML =
                    '<span class="wow-tbl-header-label">' + (col.label || col.key) + '</span>' +
                    '<span class="wow-tbl-sort-icon"></span>';

                cell.addEventListener('click', _createSortHandler(col.key));
                headerRow.appendChild(cell);
            }
        }

        function _createSortHandler(colKey) {
            return function () {
                var dir = 'asc';
                var current = headerRow.querySelector('.wow-tbl-sort-active');
                if (current && current.dataset.colKey === colKey) {
                    dir = current.classList.contains('wow-tbl-sort-asc') ? 'desc' : 'asc';
                }

                // Update header visual
                var cells = headerRow.querySelectorAll('.wow-tbl-header-cell');
                for (var c = 0; c < cells.length; c++) {
                    cells[c].classList.remove('wow-tbl-sort-active', 'wow-tbl-sort-asc', 'wow-tbl-sort-desc');
                }
                var target = headerRow.querySelector('[data-col-key="' + colKey + '"]');
                if (target) {
                    target.classList.add('wow-tbl-sort-active', 'wow-tbl-sort-' + dir);
                }

                // Send to worker
                if (worker) {
                    worker.postMessage({ type: 'SORT', payload: { column: colKey, direction: dir } });
                }
            };
        }

        buildHeader();


        // ── Web Worker ──
        try {
            worker = new Worker(SCRIPT_BASE + 'wow-plugins/wow-table-worker.js');

            worker.onmessage = function (e) {
                var msg = e.data;

                if (msg.type === 'PROCESSED_ROWS') {
                    allProcessedRows = msg.payload.rows || [];
                    totalCount = msg.payload.totalCount || 0;
                    filteredCount = msg.payload.filteredCount || 0;
                    stats = msg.payload.stats || {};

                    // Set virtual height
                    scrollSpace.style.height = (allProcessedRows.length * ROW_HEIGHT) + 'px';

                    updateStats();
                    renderVisibleRows();
                }

                if (msg.type === 'CSV_READY') {
                    _downloadCSV(msg.payload.csv);
                }

                if (msg.type === 'ERROR') {
                    console.warn('[WOW Table Worker]', msg.payload.message);
                }
            };

            worker.onerror = function (err) {
                console.error('[WOW Table Worker] Error:', err.message);
            };

        } catch (e) {
            console.error('[WOW Table] Failed to create Worker:', e);
        }


        // ═══════════════════════════════════════
        //  VIRTUAL SCROLL ENGINE (THE GEM)
        // ═══════════════════════════════════════

        function _onViewportScroll() {
            if (animFrameId) cancelAnimationFrame(animFrameId);
            animFrameId = requestAnimationFrame(renderVisibleRows);
        }
        viewport.addEventListener('scroll', _onViewportScroll);

        function renderVisibleRows() {
            animFrameId = null;
            if (allProcessedRows.length === 0) {
                _showEmptyState();
                return;
            }

            var scrollTop = viewport.scrollTop;
            var viewportHeight = viewport.clientHeight;
            var startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
            var visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + BUFFER_ROWS * 2;
            var endIndex = Math.min(startIndex + visibleCount, allProcessedRows.length);

            var gridTemplate = columns.map(function (c) { return (c.width || 120) + 'px'; }).join(' ');

            // Ensure enough recycled DOM rows exist
            while (rowElements.length < visibleCount) {
                var rowDiv = document.createElement('div');
                rowDiv.className = 'wow-tbl-row';
                rowDiv.style.gridTemplateColumns = gridTemplate;
                rowDiv.style.height = ROW_HEIGHT + 'px';
                rowDiv.style.position = 'absolute';
                rowDiv.style.width = '100%';
                scrollSpace.appendChild(rowDiv);
                rowElements.push(rowDiv);
            }

            // Recycle: update content + position for each visible slot
            for (var i = 0; i < visibleCount; i++) {
                var dataIdx = startIndex + i;
                var rowEl = rowElements[i];

                if (dataIdx < endIndex && dataIdx < allProcessedRows.length) {
                    var rowData = allProcessedRows[dataIdx];
                    rowEl.style.display = 'grid';

                    // THE GEM: translateY positions the row — GPU composited, zero layout
                    rowEl.style.transform = 'translateY(' + (dataIdx * ROW_HEIGHT) + 'px)';

                    // Zebra striping via CSS variable
                    rowEl.style.setProperty('--row-index', dataIdx);
                    rowEl.className = 'wow-tbl-row' +
                        (dataIdx % 2 === 0 ? ' wow-tbl-row-even' : '') +
                        (rowData._severity === 'crit' ? ' wow-tbl-row-crit' : '') +
                        (rowData._severity === 'warn' ? ' wow-tbl-row-warn' : '');

                    // Build cell content
                    var cellsHtml = '';
                    for (var c = 0; c < columns.length; c++) {
                        var col = columns[c];
                        var val = _getCellValue(rowData, col.key);
                        var stickyClass = col.sticky ? ' wow-tbl-sticky-col' : '';
                        var metricClass = col.isMetric ? ' wow-tbl-cell-metric' : '';

                        cellsHtml += '<div class="wow-tbl-cell' + stickyClass + metricClass + '">' +
                            _formatCellValue(val, col, rowData) + '</div>';
                    }
                    rowEl.innerHTML = cellsHtml;

                } else {
                    rowEl.style.display = 'none';
                }
            }

            // Hide extra row elements beyond visible range
            for (var j = visibleCount; j < rowElements.length; j++) {
                rowElements[j].style.display = 'none';
            }
        }

        function _showEmptyState() {
            scrollSpace.innerHTML =
                '<div class="wow-tbl-empty">' +
                    '<div class="wow-tbl-empty-icon">&#x1F4CB;</div>' +
                    '<div>\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DC\u05D4\u05E6\u05D2\u05D4</div>' +
                '</div>';
        }


        // ═══════════════════════════════════════
        //  CELL FORMATTING
        // ═══════════════════════════════════════

        function _formatCellValue(val, col, rowData) {
            if (val == null || val === '') return '<span class="wow-tbl-null">—</span>';

            // Metric cells get severity color
            if (col.isMetric) {
                var numVal = parseFloat(val);
                if (!isNaN(numVal)) {
                    var color = '#ECF0F1';
                    if (rowData._severity === 'crit') color = '#FF3B30';
                    else if (rowData._severity === 'warn') color = '#FFCC00';
                    else color = '#00F5D4';
                    return '<span style="color:' + color + ';font-weight:600;">' +
                        numVal.toFixed(config.Decimals || 1) + '</span>';
                }
            }

            // Status cells get badges
            if (col.key === 'status') {
                var sevClass = 'wow-tbl-badge-ok';
                if (rowData._severity === 'crit') sevClass = 'wow-tbl-badge-crit';
                else if (rowData._severity === 'warn') sevClass = 'wow-tbl-badge-warn';
                return '<span class="wow-tbl-badge ' + sevClass + '">' + _escapeHtml(val) + '</span>';
            }

            return _escapeHtml(String(val));
        }


        // ═══════════════════════════════════════
        //  STATS BAR
        // ═══════════════════════════════════════

        function updateStats() {
            statsBar.innerHTML =
                '<span class="wow-tbl-stat">\u05E1\u05D4"\u05DB: <b>' + totalCount.toLocaleString() + '</b></span>' +
                '<span class="wow-tbl-stat">\u05DE\u05D5\u05E6\u05D2: <b>' + filteredCount.toLocaleString() + '</b></span>' +
                (stats.ok != null ?
                    '<span class="wow-tbl-stat">\u05EA\u05E7\u05D9\u05DF: <b style="color:#00F5D4;">' + stats.ok + '</b></span>' +
                    '<span class="wow-tbl-stat">\u05D0\u05D6\u05D4\u05E8\u05D4: <b style="color:#FFCC00;">' + stats.warn + '</b></span>' +
                    '<span class="wow-tbl-stat">\u05E7\u05E8\u05D9\u05D8\u05D9: <b style="color:#FF3B30;">' + stats.crit + '</b></span>'
                : '');

            footer.textContent = '\u05E9\u05D5\u05E8\u05D5\u05EA DOM: ~' +
                Math.min(rowElements.length, 30) + ' | ' +
                '\u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05D1\u05D6\u05D9\u05DB\u05E8\u05D5\u05DF: ' +
                allProcessedRows.length.toLocaleString();
        }


        // ═══════════════════════════════════════
        //  SEARCH / EXPORT
        // ═══════════════════════════════════════

        var searchInput = toolbar.querySelector('.wow-tbl-search');
        function _onSearchInput() {
            clearTimeout(searchTimeout);
            var val = searchInput.value;
            searchTimeout = setTimeout(function () {
                if (worker) {
                    worker.postMessage({ type: 'FILTER', payload: { text: val } });
                }
            }, SEARCH_DEBOUNCE_MS);
        }
        searchInput.addEventListener('input', _onSearchInput);

        var exportBtn = toolbar.querySelector('.wow-tbl-btn-export');
        function _onExportClick() {
            if (worker) {
                worker.postMessage({ type: 'EXPORT_CSV', payload: null });
            }
        }
        exportBtn.addEventListener('click', _onExportClick);

        function _downloadCSV(csvContent) {
            if (!csvContent) return;
            var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = (config.Title || 'table-export') + '.csv';
            a.click();
            URL.revokeObjectURL(url);
        }


        // ═══════════════════════════════════════
        //  DATA UPDATE
        // ═══════════════════════════════════════

        function _processData(data) {
            if (!data) return;

            var rows = [];

            // PI Vision Table format
            if (data.Rows) {
                rows = data.Rows;
            } else if (data.Data && Array.isArray(data.Data)) {
                // Multiple data items — flatten
                for (var d = 0; d < data.Data.length; d++) {
                    var item = data.Data[d];
                    if (item.Values) {
                        for (var v = 0; v < item.Values.length; v++) {
                            rows.push(item.Values[v]);
                        }
                    }
                }
            }

            if (rows.length === 0) return;

            // Auto-detect columns if not configured
            if (!config.Columns || config.Columns.length === 0) {
                columns = _autoDetectColumns(rows[0]);
                buildHeader();
            }

            // Send to Worker for processing
            if (worker) {
                worker.postMessage({
                    type: 'UPDATE_DATA',
                    payload: { rows: rows, columns: columns }
                });
                worker.postMessage({
                    type: 'CONFIG',
                    payload: {
                        warnPct: config.WarningPct || 80,
                        critPct: config.CriticalPct || 90,
                        decimals: config.Decimals || 1
                    }
                });
            }
        }

        this.onDataUpdate = function (data) {
            if (!data) return;
            _pendingData = data;
            if (!_firstDataDone) {
                _firstDataDone = true;
                _processData(data);
                _pendingData = null;
                return;
            }
            if (!_dataDebounceId) {
                _dataDebounceId = setTimeout(function () {
                    _dataDebounceId = null;
                    if (_pendingData) {
                        _processData(_pendingData);
                        _pendingData = null;
                    }
                }, DATA_DEBOUNCE_MS);
            }
        };

        this.onResize = function () {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(function () {
                renderVisibleRows();
            }, RESIZE_DEBOUNCE_MS);
        };

        function _autoDetectColumns(sampleRow) {
            var cols = [];
            var keys = Object.keys(sampleRow);
            for (var k = 0; k < keys.length; k++) {
                var key = keys[k];
                if (key.charAt(0) === '_') continue; // Skip internal keys
                cols.push({
                    key: key,
                    label: key,
                    width: 130,
                    sticky: k === 0,
                    isMetric: !isNaN(parseFloat(sampleRow[key]))
                });
            }
            return cols;
        }


        // ═══════════════════════════════════════
        //  DEMO MODE
        // ═══════════════════════════════════════

        var demoIntervalId = null;

        function startDemo() {
            stopDemo();
            columns = config.Columns || DEMO_COLUMNS;
            buildHeader();

            var demoCount = config.DemoRowCount || 5000;
            var demoRows = generateDemoData(demoCount);

            if (worker) {
                worker.postMessage({
                    type: 'UPDATE_DATA',
                    payload: { rows: demoRows, columns: columns }
                });
                worker.postMessage({
                    type: 'CONFIG',
                    payload: {
                        warnPct: config.WarningPct || 80,
                        critPct: config.CriticalPct || 90,
                        decimals: config.Decimals || 1
                    }
                });
            }

            // Periodically add a few new rows
            demoIntervalId = setInterval(function () {
                var newRows = generateDemoData(5);
                for (var n = 0; n < newRows.length; n++) {
                    demoRows.unshift(newRows[n]);
                }
                if (demoRows.length > 50000) demoRows.length = 50000; // Cap

                if (worker) {
                    worker.postMessage({
                        type: 'UPDATE_DATA',
                        payload: { rows: demoRows, columns: columns }
                    });
                }
            }, 8000);
        }

        function stopDemo() {
            if (demoIntervalId) {
                clearInterval(demoIntervalId);
                demoIntervalId = null;
            }
        }

        if (config.DemoMode) {
            setTimeout(startDemo, 300);
        }


        // ═══════════════════════════════════════
        //  CONFIG WATCHERS
        // ═══════════════════════════════════════

        scope.$watch('config.DemoMode', function (val, old) {
            if (val === old) return;
            if (val) startDemo(); else stopDemo();
        });

        scope.$watch('config.Title', function () {
            var titleEl = toolbar.querySelector('.wow-tbl-title');
            if (titleEl) titleEl.textContent = config.Title || 'Executive Virtual Table';
        });

        scope.$watch('config.WarningPct', function () {
            if (worker) worker.postMessage({ type: 'CONFIG', payload: { warnPct: config.WarningPct } });
        });

        scope.$watch('config.CriticalPct', function () {
            if (worker) worker.postMessage({ type: 'CONFIG', payload: { critPct: config.CriticalPct } });
        });

        scope.$watch('config.Decimals', function () {
            renderVisibleRows();
        });

        scope.$watch('config.DemoRowCount', function () {
            if (config.DemoMode) startDemo();
        });

        scope.$watch('config.fontFamily', function () {
            root.style.fontFamily = config.fontFamily || 'Segoe UI';
        });


        // ═══════════════════════════════════════
        //  CLEANUP
        // ═══════════════════════════════════════

        scope.$on('$destroy', function () {
            clearTimeout(_dataDebounceId);
            _pendingData = null;
            stopDemo();
            if (worker) worker.terminate();
            if (animFrameId) cancelAnimationFrame(animFrameId);
            clearTimeout(searchTimeout);
            clearTimeout(resizeTimeout);
            viewport.removeEventListener('scroll', _onViewportScroll);
            searchInput.removeEventListener('input', _onSearchInput);
            exportBtn.removeEventListener('click', _onExportClick);
            allProcessedRows = null;
            rowElements = null;
        });
    };


    // ═══════════════════════════════════════
    //  UTILITIES
    // ═══════════════════════════════════════

    function _getCellValue(row, key) {
        if (!row || !key) return '';
        if (key.indexOf('.') !== -1) {
            var parts = key.split('.');
            var obj = row;
            for (var p = 0; p < parts.length; p++) {
                if (obj == null) return '';
                obj = obj[parts[p]];
            }
            return obj != null ? obj : '';
        }
        return row[key] != null ? row[key] : '';
    }

    function _escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _padZero(n) {
        return n < 10 ? '0' + n : '' + n;
    }


    // ═══════════════════════════════════════
    //  PI VISION REGISTRATION
    // ═══════════════════════════════════════

    var def = {
        typeName:           'table-wow',
        displayName:        '\u05D8\u05D1\u05DC\u05EA \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD WOW v100',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:            SCRIPT_BASE + 'icons/wow-table.svg',
        getDefaultConfig: function () {
            return {
                DataShape:    'Table',
                Height:       500,
                Width:        900,
                Title:        '\u05D8\u05D1\u05DC\u05EA \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD',
                Columns:      null,
                WarningPct:   80,
                CriticalPct:  90,
                Decimals:     1,
                DemoMode:     true,
                DemoRowCount: 5000,
                ShowSearch:   true,
                ShowExport:   true,
                fontFamily:   'Segoe UI',
                fontSize:     12
            };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05D8\u05D1\u05DC\u05EA \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD WOW',
        visObjectType: symbolVis
    };

    PV.symbolCatalog.register(def);

})(window.PIVisualization);
