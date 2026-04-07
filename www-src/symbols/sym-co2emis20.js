/* ================================================================
   sym-co2emis20.js — CO2 Emissions Pro v20 (orchestrator)
   ULTRA-upgraded — aligned with sym-mugult20 v1.4 quality
   ================================================================
   Patterns: error shield, config validation, lifecycle management,
   keyboard shortcuts, demo mode, CSS var theme, IntersectionObserver,
   debounced data, config I/O, bug fixes.
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME    = 'co2emis20';
    var WIDGET_NAME = 'piv20Co2emissions';
    var PREFIX      = 'ce20';
    var MODULE      = 'co2emis20';

    var U = PIV20.ultra;


    /* ── Config factory ────────────────────────── */

    var DEFAULTS = {
        Title:                '\u05E4\u05DC\u05D9\u05D8\u05D5\u05EA CO2',
        Subtitle:             '',
        Decimals:             2,
        EmissionUnit:         '\u05D8\u05D5\u05DF/\u05E9\u05E2\u05D4',
        ProductionUnit:       'MW',
        WarnThreshold:        50,
        CritThreshold:        100,
        WarnFactorThreshold:  0.5,
        CritFactorThreshold:  0.7,
        ReportTitle:          '\u05D3\u05D5\u05D7 \u05E4\u05DC\u05D9\u05D8\u05D5\u05EA CO2',
        AlertHistoryMax:      50,
        accentColor:          '#5BC0EB',
        warningColor:         '#f39c12',
        criticalColor:        '#e74c3c',
        goodColor:            '#2ecc71',
        fontFamily:           'Segoe UI',
        fontSize:             12,
        StaleThreshold:       300,
        DemoMode:             false,
        Height:               550,
        Width:                900
    };

    var cfgValidator = U.configFactory(DEFAULTS);


    /* ── symbolVis ─────────────────────────────── */

    function symbolVis() { }

    symbolVis.prototype.init = U.shield.wrap(MODULE, 'init', function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#ce20-widget');
        $root.show();

        /* -- Validate config on init -- */
        cfgValidator.validate(cfg);

        /* -- Lifecycle context for clean teardown -- */
        var _ctx = {
            intervals:    [],
            nativeTimers: [],
            unwatchers:   [],
            observers:    [],
            listeners:    [],
            rafs:         [],
            widgets:      [],
            bus:          bus
        };


        /* ── Scope defaults ─────────────────── */

        scope.activeTab       = 'monitor';
        scope.units           = [];
        scope.totalEmission   = 0;
        scope.totalProduction = 0;
        scope.avgFactor       = 0;
        scope.correlation     = null;
        scope.fuelBreakdown   = [];
        scope.alertHistory    = [];
        scope.overallSeverity = 'ok';
        scope.panelOpen       = false;
        scope.demoMode        = !!cfg.DemoMode;


        /* ── Widget init ────────────────────── */

        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });
        _ctx.widgets.push({ $el: $root, name: WIDGET_NAME });


        /* ── Theme application ──────────────── */

        var rootEl = elem.find('.ce20-root')[0];
        function applyTheme() {
            U.applyTheme(rootEl, cfg, PREFIX);
        }
        applyTheme();


        /* ── Bus listeners ──────────────────── */

        bus.on('co2emissions:processed', U.shield.wrap(MODULE, 'onProcessed', function (d) {
            scope.units           = d.units || [];
            scope.totalEmission   = d.totalEmission || 0;
            scope.totalProduction = d.totalProduction || 0;
            scope.avgFactor       = d.avgFactor || 0;
            scope.correlation     = d.correlation || null;
            scope.fuelBreakdown   = d.fuelBreakdown || [];
            scope.overallSeverity = d.overallSeverity || 'ok';

            /* Merge alerts */
            if (d.newAlerts && d.newAlerts.length) {
                for (var a = 0; a < d.newAlerts.length; a++) {
                    scope.alertHistory.unshift(d.newAlerts[a]);
                }
                var maxA = cfg.AlertHistoryMax || 50;
                while (scope.alertHistory.length > maxA) scope.alertHistory.pop();
            }
            PIV20.safeApply(scope);
        }));


        /* ── Chart rendering with IntersectionObserver ── */

        var _chartVisible = true;

        function renderChart() {
            if (!_chartVisible) return;
            try {
                var w = $root.data(WIDGET_NAME);
                if (w) {
                    var canvas = elem.find('.ce20-canvas')[0];
                    if (canvas && canvas.getContext) {
                        w.drawBarChart(canvas);
                    }
                }
            } catch (e) {
                U.shield.log(MODULE, 'renderChart', e);
            }
        }

        bus.on('co2emissions:render', renderChart);

        /* IntersectionObserver — skip canvas rendering when not visible */
        if (typeof IntersectionObserver !== 'undefined' && rootEl) {
            try {
                var io = new IntersectionObserver(function (entries) {
                    _chartVisible = entries[0] && entries[0].isIntersecting;
                }, { threshold: 0.05 });
                io.observe(rootEl);
                _ctx.observers.push(io);
            } catch (e) {
                /* legacy guard: always visible */
            }
        }


        /* ── Tab switching ──────────────────── */

        scope.setTab = U.shield.wrap(MODULE, 'setTab', function (t) {
            scope.activeTab = t;
            if (t === 'chart') {
                /* Use rAF instead of brittle setTimeout */
                var rafId = requestAnimationFrame(function () {
                    bus.emit('co2emissions:render');
                });
                _ctx.rafs.push(rafId);
            }
        });


        /* ── CSV export ─────────────────────── */

        scope.exportCSV = U.shield.wrap(MODULE, 'exportCSV', function () {
            if (scope.units && scope.units.length) {
                var rows = [];
                for (var i = 0; i < scope.units.length; i++) {
                    var u = scope.units[i];
                    rows.push({
                        '\u05E9\u05DD': u.name || '',
                        '\u05E4\u05DC\u05D9\u05D8\u05D4': u.emission != null ? u.emission : '',
                        '\u05D9\u05D9\u05E6\u05D5\u05E8': u.production != null ? u.production : '',
                        '\u05DE\u05E7\u05D3\u05DD': u.factor != null ? u.factor : '',
                        '\u05D3\u05DC\u05E7': u.fuel || '',
                        '\u05D7\u05D5\u05DE\u05E8\u05D4': u.severity || ''
                    });
                }
                U.exportCsv(rows, 'co2emissions-' + new Date().toISOString().slice(0, 10) + '.csv');
            } else {
                /* Fallback to widget CSV if available */
                var w = $root.data(WIDGET_NAME);
                if (w && w.exportCSV) w.exportCSV();
            }
        });


        /* ── Panel actions ──────────────────── */

        scope.openPanel  = function () { scope.panelOpen = true; };
        scope.closePanel = function () { scope.panelOpen = false; };

        scope.showDocs = function () {
            if (PIV20.docs) PIV20.docs.show(SYM_NAME, scope, elem);
        };


        /* ── Config Import / Export ──────────── */

        scope.exportConfig = U.shield.wrap(MODULE, 'exportConfig', function () {
            U.configIO.exportJSON(cfg, SYM_NAME);
        });

        scope.importConfig = U.shield.wrap(MODULE, 'importConfig', function () {
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = function () {
                if (input.files && input.files[0]) {
                    U.configIO.importJSON(input.files[0], cfg, cfgValidator, function (err) {
                        if (!err) {
                            applyTheme();
                            PIV20.safeApply(scope);
                        }
                    });
                }
            };
            input.click();
        });


        /* ── Demo mode ─────────────────────── */

        scope.toggleDemo = U.shield.wrap(MODULE, 'toggleDemo', function () {
            scope.demoMode = !scope.demoMode;
            cfg.DemoMode = scope.demoMode;
            if (scope.demoMode) {
                pushDemoData();
            }
        });

        function pushDemoData() {
            var items = U.demo.generate('co2emis', { unitCount: 6 });
            bus.emit('config', cfg);
            bus.emit('data', items);
        }

        var demoTimer = null;
        function startDemoLoop() {
            if (demoTimer) return;
            demoTimer = setInterval(function () {
                if (scope.demoMode) pushDemoData();
            }, 3000);
            _ctx.nativeTimers.push(demoTimer);
        }

        function stopDemoLoop() {
            if (demoTimer) {
                clearInterval(demoTimer);
                demoTimer = null;
            }
        }


        /* ── Keyboard shortcuts ────────────── */

        var keyHandlers = {
            '1': function () { scope.setTab('monitor'); PIV20.safeApply(scope); },
            '2': function () { scope.setTab('chart');   PIV20.safeApply(scope); },
            '3': function () { scope.setTab('alerts');  PIV20.safeApply(scope); },
            'Escape': function () {
                if (scope.panelOpen) {
                    scope.panelOpen = false;
                    PIV20.safeApply(scope);
                }
            }
        };
        if (rootEl) {
            U.keyboard.attach(rootEl, keyHandlers);
        }


        /* ── Data bridge (debounced) ─────────── */

        var _firstData = true;
        var _debouncedPush = U.debounce(function () {
            _pushData();
        }, 100, false);

        function _pushData() {
            if (scope.demoMode) return;     /* demo mode drives its own data */

            bus.emit('config', cfg);

            var items = [];
            if (scope.symbol && scope.symbol.DataSources) {
                var ds = scope.symbol.DataSources;
                for (var i = 0; i < ds.length; i++) {
                    var d = ds[i];
                    items.push({
                        Label: d.Label || d.Name || d.Path || ('\u05EA\u05D2 ' + (i + 1)),
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
            if (_firstData) {
                _firstData = false;
                _pushData();
            } else {
                _debouncedPush();
            }
        }));


        /* ── Config watcher ────────────────── */

        var unwatchConfig = scope.$watch('config', U.shield.wrap(MODULE, 'configWatch', function (newVal) {
            if (!newVal) return;
            cfgValidator.normalize(newVal);
            applyTheme();
            scope.demoMode = !!newVal.DemoMode;
            if (scope.demoMode && !demoTimer) {
                startDemoLoop();
            } else if (!scope.demoMode && demoTimer) {
                stopDemoLoop();
            }
        }), true);
        _ctx.unwatchers.push(unwatchConfig);


        /* ── Init demo if configured ────────── */

        if (cfg.DemoMode) {
            scope.demoMode = true;
            pushDemoData();
            startDemoLoop();
        }


        /* ── Cleanup ───────────────────────── */

        PIV20.destroyHelper(scope, function () {
            /* Keyboard */
            if (rootEl) U.keyboard.detach(rootEl);

            /* Demo loop */
            stopDemoLoop();

            /* Comprehensive cleanup via ultra.destroyHelper */
            U.destroyHelper(_ctx);

            /* Widget teardown (fallback if not already handled) */
            try {
                var w = $root.data(WIDGET_NAME);
                if (w && w.destroy) w.destroy();
            } catch (e) { /* ignore */ }

            /* Bus destroy */
            if (bus && bus.destroy) bus.destroy();
        });


        /* ── PIV20 standard init hook ────────── */

        if (PIV20.initSymbol) {
            PIV20.initSymbol(scope, elem, {
                name: SYM_NAME, bus: bus, widgetName: WIDGET_NAME, $root: $root
            });
        }
    });


    /* ── Registration ────────────────────────── */

    PV.symbolCatalog.register({
        typeName:    SYM_NAME,
        displayName: '\u05E4\u05DC\u05D9\u05D8\u05D5\u05EA CO2 v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-co2emissions20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return JSON.parse(JSON.stringify(DEFAULTS));
        },
        configTitle: '\u05E4\u05DC\u05D9\u05D8\u05D5\u05EA CO2 v20'
    });

})(window.PIVisualization, window.PIV20);
