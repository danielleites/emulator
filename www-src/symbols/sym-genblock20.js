/* ================================================================
   sym-genblock20.js — Generator Block Diagram v20 (orchestrator)
   ULTRA-upgraded — aligned with sym-mugult20 v1.4 quality
   ================================================================
   Patterns: error shield, config validation, lifecycle management,
   keyboard shortcuts, demo mode, CSS var theme, IntersectionObserver,
   debounced data, config I/O, bug fixes.
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME    = 'genblock20';
    var WIDGET_NAME = 'piv20Generatorblock';
    var PREFIX      = 'gb20';
    var MODULE      = 'genblock20';

    var U = PIV20.ultra;


    /* ── Config factory ────────────────────────── */

    var DEFAULTS = {
        Title:              '\u05D1\u05DC\u05D5\u05E7 \u05D2\u05E0\u05E8\u05D8\u05D5\u05E8\u05D9\u05DD',
        Decimals:           1,
        RatedCapacityMW:    0,
        PminPct:            30,
        PmaxPct:            100,
        ActiveThreshold:    50,
        StartingThreshold:  20,
        StandbyThreshold:   5,
        RampLimitMWperMin:  10,
        UseDigitalStates:   false,
        Hysteresis:         3,
        MaxAlerts:          50,
        accentColor:        '#5BC0EB',
        warningColor:       '#f39c12',
        criticalColor:      '#e74c3c',
        goodColor:          '#2ecc71',
        fontFamily:         'Segoe UI',
        fontSize:           12,
        StaleThreshold:     300,
        DemoMode:           false,
        Height:             500,
        Width:              950
    };

    var cfgValidator = U.configFactory(DEFAULTS);


    /* ── symbolVis ─────────────────────────────── */

    function symbolVis() { }

    symbolVis.prototype.init = U.shield.wrap(MODULE, 'init', function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#gb20-widget');
        $root.show();

        cfgValidator.validate(cfg);

        var _ctx = {
            intervals: [], nativeTimers: [], unwatchers: [],
            observers: [], listeners: [], rafs: [], widgets: [], bus: bus
        };


        /* ── Scope defaults ─────────────────── */

        scope.activeTab     = 'cards';
        scope.filterState   = 'all';
        scope.searchText    = '';
        scope.sortField     = '';
        scope.sortReverse   = false;
        scope.units         = [];
        scope.filteredUnits = [];
        scope.summary       = {};
        scope.fleetStats    = null;
        scope.alerts        = [];
        scope.panelOpen     = false;
        scope.demoMode      = !!cfg.DemoMode;


        /* ── Widget init ────────────────────── */

        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });
        _ctx.widgets.push({ $el: $root, name: WIDGET_NAME });


        /* ── Theme ──────────────────────────── */

        var rootEl = $root[0];
        function applyTheme() { U.applyTheme(rootEl, cfg, PREFIX); }
        applyTheme();


        /* ── Filtering (FIX: null-safe label check) ── */

        function applyFilters() {
            var list = scope.units;
            if (scope.filterState !== 'all') {
                var f = scope.filterState;
                list = list.filter(function (u) { return u.stateId === f; });
            }
            if (scope.searchText) {
                var q = scope.searchText.toLowerCase();
                list = list.filter(function (u) {
                    return (u.label || '').toLowerCase().indexOf(q) >= 0;
                });
            }
            if (scope.sortField) {
                var sf = scope.sortField, rev = scope.sortReverse ? -1 : 1;
                list = list.slice().sort(function (a, b) {
                    var va = a[sf], vb = b[sf];
                    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * rev;
                    return String(va || '').localeCompare(String(vb || '')) * rev;
                });
            }
            scope.filteredUnits = list;
        }


        /* ── Bus listeners ──────────────────── */

        bus.on('generatorblock:processed', U.shield.wrap(MODULE, 'onProcessed', function (d) {
            scope.units      = d.units || [];
            scope.summary    = d.summary || {};
            scope.fleetStats = d.fleetStats || null;

            if (d.newAlerts && d.newAlerts.length) {
                for (var a = 0; a < d.newAlerts.length; a++) {
                    scope.alerts.unshift(d.newAlerts[a]);
                }
                var maxA = cfg.MaxAlerts || 50;
                while (scope.alerts.length > maxA) scope.alerts.pop();
            }
            applyFilters();
            PIV20.safeApply(scope);
        }));

        /* Sparkline rendering — use rAF instead of setTimeout */
        var _visible = true;
        bus.on('generatorblock:render', U.shield.wrap(MODULE, 'render', function () {
            if (!_visible) return;
            var w = $root.data(WIDGET_NAME);
            if (w && w.drawSparklines) {
                var rafId = requestAnimationFrame(function () {
                    try { w.drawSparklines(elem[0]); } catch (e) {
                        U.shield.log(MODULE, 'drawSparklines', e);
                    }
                });
                _ctx.rafs.push(rafId);
            }
        }));

        /* IntersectionObserver */
        if (typeof IntersectionObserver !== 'undefined' && rootEl) {
            try {
                var io = new IntersectionObserver(function (entries) {
                    _visible = entries[0] && entries[0].isIntersecting;
                }, { threshold: 0.05 });
                io.observe(rootEl);
                _ctx.observers.push(io);
            } catch (e) { /* legacy guard */ }
        }


        /* ── Tab switching ──────────────────── */

        scope.setTab = U.shield.wrap(MODULE, 'setTab', function (t) {
            scope.activeTab = t;
        });

        scope.setFilter = function (f) {
            scope.filterState = f;
            applyFilters();
        };
        scope.filterChanged = function () { applyFilters(); };

        scope.sortBy = U.shield.wrap(MODULE, 'sortBy', function (field) {
            if (scope.sortField === field) scope.sortReverse = !scope.sortReverse;
            else { scope.sortField = field; scope.sortReverse = false; }
            applyFilters();
        });


        /* ── CSV export ─────────────────────── */

        scope.exportCSV = U.shield.wrap(MODULE, 'exportCSV', function () {
            if (scope.units && scope.units.length) {
                var rows = [];
                for (var i = 0; i < scope.units.length; i++) {
                    var u = scope.units[i];
                    rows.push({
                        '\u05E9\u05DD': u.label || '',
                        'MW': u.displayMW || '',
                        '\u05DE\u05E6\u05D1': u.stateLabel || '',
                        '\u05E0\u05D9\u05E6\u05D5\u05DC\u05EA%': u.capPct != null ? u.capPct : '',
                        'Ramp': u.rampRate || '',
                        '\u05DE\u05D2\u05DE\u05D4': u.trend || ''
                    });
                }
                U.exportCsv(rows, 'generators-' + new Date().toISOString().slice(0, 10) + '.csv');
            } else {
                var w = $root.data(WIDGET_NAME);
                if (w && w.exportCSV) w.exportCSV();
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
            var items = U.demo.generate('genblock', { unitCount: 8 });
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
            '1': function () { scope.setTab('cards'); PIV20.safeApply(scope); },
            '2': function () { scope.setTab('table'); PIV20.safeApply(scope); },
            '3': function () { scope.setTab('alerts'); PIV20.safeApply(scope); },
            'Escape': function () {
                if (scope.panelOpen) { scope.panelOpen = false; PIV20.safeApply(scope); }
            }
        };
        if (rootEl) U.keyboard.attach(rootEl, keyHandlers);


        /* ── Data bridge (debounced) ─────────── */

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
                        Label: d.Label || d.Name || d.Path || ('\u05D9\u05D7\u05D9\u05D3\u05D4 ' + (i + 1)),
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
        displayName: '\u05D1\u05DC\u05D5\u05E7 \u05D2\u05E0\u05E8\u05D8\u05D5\u05E8\u05D9\u05DD v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-generatorblock20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () { return JSON.parse(JSON.stringify(DEFAULTS)); },
        configTitle: '\u05D1\u05DC\u05D5\u05E7 \u05D2\u05E0\u05E8\u05D8\u05D5\u05E8\u05D9\u05DD v20'
    });

})(window.PIVisualization, window.PIV20);
