/* ================================================================
   sym-maindashboard20.js — Main Dashboard v20 (orchestrator)
   ULTRA-upgraded — aligned with sym-mugult20 v1.4 quality
   ================================================================
   Patterns: error shield, config validation, lifecycle management,
   keyboard shortcuts, demo mode, CSS var theme, IntersectionObserver,
   debounced data, config I/O, bug fixes.
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME    = 'maindash20';
    var WIDGET_NAME = 'piv20Maindashboard';
    var PREFIX      = 'md20';
    var MODULE      = 'maindash20';

    var U = PIV20.ultra;


    /* ── Config factory ────────────────────────── */

    var DEFAULTS = {
        Title:              '\u05DC\u05D5\u05D7 \u05E8\u05D0\u05E9\u05D9',
        showHeatmap:        true,
        showSummaryBar:     true,
        showAlerts:         true,
        showTrend:          true,
        showUnitsInCards:   true,
        lowProduction:      50,
        highStress:         80,
        highCO2:            120,
        lowEfficiency:      60,
        overload:           95,
        systemGreenMin:     80,
        systemYellowMin:    50,
        reserveWarning:     15,
        reserveCritical:    8,
        maxAlerts:          50,
        trendPoints:        60,
        Decimals:           1,
        StaleThreshold:     300,
        accentColor:        '#5BC0EB',
        warningColor:       '#f39c12',
        criticalColor:      '#e74c3c',
        goodColor:          '#2ecc71',
        fontFamily:         'Segoe UI',
        fontSize:           12,
        DemoMode:           false,
        Height:             600,
        Width:              1000
    };

    var cfgValidator = U.configFactory(DEFAULTS);


    /* ── symbolVis ─────────────────────────────── */

    function symbolVis() { }

    symbolVis.prototype.init = U.shield.wrap(MODULE, 'init', function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#md20-widget');
        $root.show();

        cfgValidator.validate(cfg);

        var _ctx = {
            intervals: [], nativeTimers: [], unwatchers: [],
            observers: [], listeners: [], rafs: [], widgets: [], bus: bus
        };


        /* ── Scope defaults ─────────────────── */

        scope.viewMode         = 'grid';
        scope.sites            = [];
        scope.filteredSites    = [];
        scope.alerts           = [];
        scope.trendData        = [];
        scope.filterText       = '';
        scope.filterStatus     = '';
        scope.totalProduction  = 0;
        scope.totalDemand      = 0;
        scope.totalCapacity    = 0;
        scope.reserve          = 0;
        scope.reservePct       = 0;
        scope.avgEfficiency    = 0;
        scope.totalCO2         = 0;
        scope.activeUnits      = 0;
        scope.totalUnits       = 0;
        scope.systemStatus     = 'green';
        scope.systemStatusText = '\u05EA\u05E7\u05D9\u05DF';
        scope.systemStatusColor = '#2ecc71';
        scope.systemColor      = 'green';
        scope.panelOpen        = false;
        scope.demoMode         = !!cfg.DemoMode;

        /* Trend SVG paths */
        scope.trendProductionLine = '';
        scope.trendProductionArea = '';
        scope.trendDemandLine     = '';
        scope.trendViewWidth      = 300;

        var sortCol = 'totalMW';
        var sortAsc = false;


        /* ── Widget init ────────────────────── */

        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });
        _ctx.widgets.push({ $el: $root, name: WIDGET_NAME });


        /* ── Theme ──────────────────────────── */

        var rootEl = $root[0];
        function applyTheme() { U.applyTheme(rootEl, cfg, PREFIX); }
        applyTheme();


        /* ── Client-side filtering (FIX: sort mutation) ── */

        function applyFilters() {
            var list = scope.sites;

            if (scope.filterText) {
                var q = scope.filterText.toLowerCase();
                list = list.filter(function (s) {
                    return (s.name || '').toLowerCase().indexOf(q) >= 0;
                });
            }

            if (scope.filterStatus) {
                list = list.filter(function (s) { return s.status === scope.filterStatus; });
            }

            /* FIX: .slice() prevents mutating source array during digest */
            list = list.slice().sort(function (a, b) {
                var va = a[sortCol], vb = b[sortCol];
                if (typeof va === 'string') return sortAsc ? (va || '').localeCompare(vb || '', 'he') : (vb || '').localeCompare(va || '', 'he');
                va = va || 0; vb = vb || 0;
                return sortAsc ? (va - vb) : (vb - va);
            });

            scope.filteredSites = list;
        }


        /* ── Bus listeners ──────────────────── */

        bus.on('maindashboard:processed', U.shield.wrap(MODULE, 'onProcessed', function (d) {
            scope.sites            = d.sites || [];
            scope.totalProduction  = d.totalProduction || 0;
            scope.totalDemand      = d.totalDemand || 0;
            scope.totalCapacity    = d.totalCapacity || 0;
            scope.reserve          = d.reserve || 0;
            scope.reservePct       = d.reservePct || 0;
            scope.avgEfficiency    = d.avgEfficiency || 0;
            scope.totalCO2         = d.totalCO2 || 0;
            scope.activeUnits      = d.activeUnits || 0;
            scope.totalUnits       = d.totalUnits || 0;
            scope.alerts           = d.alerts || [];
            scope.trendData        = d.trendData || [];

            /* System status */
            scope.systemStatus = d.systemStatus || 'green';
            scope.systemColor  = d.systemStatus || 'green';
            if (d.systemStatus === 'green') {
                scope.systemStatusText = '\u05EA\u05E7\u05D9\u05DF';
                scope.systemStatusColor = cfg.goodColor || '#2ecc71';
            } else if (d.systemStatus === 'yellow') {
                scope.systemStatusText = '\u05D0\u05D6\u05D4\u05E8\u05D4';
                scope.systemStatusColor = cfg.warningColor || '#f39c12';
            } else {
                scope.systemStatusText = '\u05E7\u05E8\u05D9\u05D8\u05D9';
                scope.systemStatusColor = cfg.criticalColor || '#e74c3c';
            }

            /* Trend SVG (FIX: guard empty paths) */
            scope.trendProductionLine = d.trendProductionLine || '';
            scope.trendProductionArea = d.trendProductionArea || '';
            scope.trendDemandLine     = d.trendDemandLine || '';
            scope.trendViewWidth      = d.trendViewWidth || 300;

            applyFilters();
            PIV20.safeApply(scope);
        }));


        /* ── Scope actions ──────────────────── */

        scope.setView = U.shield.wrap(MODULE, 'setView', function (v) {
            scope.viewMode = v;
        });

        scope.filterChanged = function () { applyFilters(); };

        scope.sortBy = U.shield.wrap(MODULE, 'sortBy', function (col) {
            if (sortCol === col) sortAsc = !sortAsc;
            else { sortCol = col; sortAsc = false; }
            applyFilters();
        });

        scope.getSiteStatusBg = function (status) {
            if (status === 'critical') return 'rgba(231,76,60,.15)';
            if (status === 'warning')  return 'rgba(243,156,18,.15)';
            return 'rgba(46,204,113,.15)';
        };

        scope.getSiteStatusColor = function (status) {
            if (status === 'critical') return cfg.criticalColor || '#e74c3c';
            if (status === 'warning')  return cfg.warningColor || '#f39c12';
            return cfg.goodColor || '#2ecc71';
        };

        scope.getSiteStatusText = function (status) {
            if (status === 'critical') return '\u05E7\u05E8\u05D9\u05D8\u05D9';
            if (status === 'warning')  return '\u05D0\u05D6\u05D4\u05E8\u05D4';
            return '\u05EA\u05E7\u05D9\u05DF';
        };

        scope.getUnitStatusColor = function (status) {
            if (status === 'overloaded') return cfg.criticalColor || '#e74c3c';
            if (status === 'stressed')   return cfg.warningColor || '#f39c12';
            if (status === 'producing')  return cfg.goodColor || '#2ecc71';
            return '#4A6A7F';
        };

        scope.getHeatColor = function (loadPct) {
            if (loadPct == null) return 'rgba(91,192,235,.1)';
            if (loadPct > 90) return 'rgba(231,76,60,.7)';
            if (loadPct > 70) return 'rgba(243,156,18,.6)';
            if (loadPct > 40) return 'rgba(91,192,235,.5)';
            return 'rgba(46,204,113,.4)';
        };


        /* ── CSV export ─────────────────────── */

        scope.exportCSV = U.shield.wrap(MODULE, 'exportCSV', function () {
            if (scope.filteredSites && scope.filteredSites.length) {
                var rows = [];
                for (var i = 0; i < scope.filteredSites.length; i++) {
                    var s = scope.filteredSites[i];
                    rows.push({
                        '\u05D0\u05EA\u05E8': s.name || '',
                        '\u05D9\u05D9\u05E6\u05D5\u05E8 MW': s.totalMW || 0,
                        '\u05E7\u05D9\u05D1\u05D5\u05DC\u05EA MW': s.maxMW || 0,
                        '\u05E2\u05D5\u05DE\u05E1 %': s.loadPct || 0,
                        '\u05E0\u05E6\u05D9\u05DC\u05D5\u05EA %': s.avgEfficiency || 0,
                        'CO2 t/h': s.co2Total || 0,
                        '\u05E4\u05E2\u05D9\u05DC\u05D5\u05EA': (s.activeCount || 0) + '/' + (s.unitCount || 0),
                        '\u05DE\u05E6\u05D1': scope.getSiteStatusText(s.status)
                    });
                }
                U.exportCsv(rows, 'dashboard-' + new Date().toISOString().slice(0, 10) + '.csv');
            } else {
                var w = $root.data(WIDGET_NAME);
                if (w && w.exportCSV) w.exportCSV(scope.filteredSites);
            }
        });


        /* ── Panel ──────────────────────────── */

        scope.openPanel  = function () { scope.panelOpen = true; };
        scope.closePanel = function () { scope.panelOpen = false; };
        scope.showDocs   = function () { if (PIV20.docs) PIV20.docs.show(SYM_NAME, scope, elem); };


        /* ── Config I/O ─────────────────────── */

        scope.exportConfig = U.shield.wrap(MODULE, 'exportConfig', function () {
            U.configIO.exportJSON(cfg, SYM_NAME);
        });

        scope.importConfig = U.shield.wrap(MODULE, 'importConfig', function () {
            var input = document.createElement('input');
            input.type = 'file'; input.accept = '.json';
            input.onchange = function () {
                if (input.files && input.files[0]) {
                    U.configIO.importJSON(input.files[0], cfg, cfgValidator, function (err) {
                        if (!err) { applyTheme(); PIV20.safeApply(scope); }
                    });
                }
            };
            input.click();
        });


        /* ── Demo mode ─────────────────────── */

        scope.toggleDemo = U.shield.wrap(MODULE, 'toggleDemo', function () {
            scope.demoMode = !scope.demoMode;
            cfg.DemoMode = scope.demoMode;
            if (scope.demoMode) pushDemoData();
        });

        function pushDemoData() {
            var items = U.demo.generate('maindash', { siteCount: 6 });
            bus.emit('config', cfg);
            bus.emit('data', items);
        }

        var demoTimer = null;
        function startDemoLoop() {
            if (demoTimer) return;
            demoTimer = setInterval(function () { if (scope.demoMode) pushDemoData(); }, 3000);
            _ctx.nativeTimers.push(demoTimer);
        }
        function stopDemoLoop() { if (demoTimer) { clearInterval(demoTimer); demoTimer = null; } }


        /* ── Keyboard shortcuts ────────────── */

        var keyHandlers = {
            '1': function () { scope.setView('grid'); PIV20.safeApply(scope); },
            '2': function () { scope.setView('heatmap'); PIV20.safeApply(scope); },
            '3': function () { scope.setView('table'); PIV20.safeApply(scope); },
            'Escape': function () {
                if (scope.panelOpen) { scope.panelOpen = false; PIV20.safeApply(scope); }
            }
        };
        if (rootEl) U.keyboard.attach(rootEl, keyHandlers);


        /* ── Data bridge (debounced, FIX: first=immediate) ── */

        var _firstData = true;
        var _debouncedPush = U.debounce(function () { _pushData(); }, 100, false);

        function _pushData() {
            if (scope.demoMode) return;
            bus.emit('config', cfg);

            var items = [];
            if (scope.symbol && scope.symbol.DataSources) {
                var ds = scope.symbol.DataSources;
                for (var i = 0; i < ds.length; i++) {
                    var d = ds[i];
                    items.push({
                        Label: d.Label || d.Name || d.Path || ('Tag ' + (i + 1)),
                        Value: d.Value != null ? d.Value : d.Snapshot,
                        Path:  d.Path || '',
                        Time:  d.Time || null,
                        Good:  d.Good
                    });
                }
            }
            if (items.length) bus.emit('data', items);
        }

        scope.$on('dataUpdate', U.shield.wrap(MODULE, 'dataUpdate', function () {
            if (_firstData) { _firstData = false; _pushData(); }
            else { _debouncedPush(); }
        }));


        /* ── IntersectionObserver ──────────── */

        if (typeof IntersectionObserver !== 'undefined' && rootEl) {
            try {
                var io = new IntersectionObserver(function (entries) {
                    /* track visibility for future render optimization */
                }, { threshold: 0.05 });
                io.observe(rootEl);
                _ctx.observers.push(io);
            } catch (e) { /* legacy guard */ }
        }


        /* ── Config watcher ────────────────── */

        var unwatchConfig = scope.$watch('config', U.shield.wrap(MODULE, 'configWatch', function (newVal) {
            if (!newVal) return;
            cfgValidator.normalize(newVal);
            applyTheme();
            scope.demoMode = !!newVal.DemoMode;
            if (scope.demoMode && !demoTimer) startDemoLoop();
            else if (!scope.demoMode && demoTimer) stopDemoLoop();
        }), true);
        _ctx.unwatchers.push(unwatchConfig);

        if (cfg.DemoMode) { scope.demoMode = true; pushDemoData(); startDemoLoop(); }


        /* ── Cleanup ───────────────────────── */

        PIV20.destroyHelper(scope, function () {
            if (rootEl) U.keyboard.detach(rootEl);
            stopDemoLoop();
            U.destroyHelper(_ctx);
            try { var w = $root.data(WIDGET_NAME); if (w && w.destroy) w.destroy(); } catch (e) { /* */ }
            if (bus && bus.destroy) bus.destroy();
        });

        if (PIV20.initSymbol) {
            PIV20.initSymbol(scope, elem, { name: SYM_NAME, bus: bus, widgetName: WIDGET_NAME, $root: $root });
        }
    });


    /* ── Registration ────────────────────────── */

    PV.symbolCatalog.register({
        typeName:    SYM_NAME,
        displayName: '\u05DC\u05D5\u05D7 \u05E8\u05D0\u05E9\u05D9 v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-maindashboard20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () { return JSON.parse(JSON.stringify(DEFAULTS)); },
        configTitle: '\u05DC\u05D5\u05D7 \u05E8\u05D0\u05E9\u05D9 v20'
    });

})(window.PIVisualization, window.PIV20);
