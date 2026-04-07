/* ================================================================
   sym-constmon20.js — Constraint Monitor v20 (orchestrator)
   ULTRA-upgraded — aligned with sym-mugult20 v1.4 quality
   ================================================================
   Patterns: error shield, config validation, lifecycle management,
   keyboard shortcuts, demo mode, CSS var theme, IntersectionObserver,
   debounced data, config I/O, bug fixes.
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME    = 'constmon20';
    var WIDGET_NAME = 'piv20Constraintmonitor';
    var PREFIX      = 'ct20';
    var MODULE      = 'constmon20';

    var U = PIV20.ultra;


    /* ── Config factory ────────────────────────── */

    var DEFAULTS = {
        Title:           '\u05E0\u05D9\u05D8\u05D5\u05E8 \u05D0\u05D9\u05DC\u05D5\u05E6\u05D9\u05DD',
        Decimals:        1,
        HoursPerYear:    8760,
        Co2PerYear:      50000,
        FuelPerMonth:    10000,
        StartsPerYear:   100,
        MaintPerYear:    2000,
        WarningPct:      80,
        CriticalPct:     95,
        MaxAlerts:       50,
        goodColor:       '#2ecc71',
        warningColor:    '#f39c12',
        criticalColor:   '#e74c3c',
        accentColor:     '#5BC0EB',
        fontFamily:      'Segoe UI',
        fontSize:        12,
        StaleThreshold:  300,
        DemoMode:        false,
        Height:          500,
        Width:           950
    };

    var cfgValidator = U.configFactory(DEFAULTS);


    /* ── symbolVis ─────────────────────────────── */

    function symbolVis() { }

    symbolVis.prototype.init = U.shield.wrap(MODULE, 'init', function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#ct20-widget');
        $root.show();

        /* -- Validate config on init -- */
        cfgValidator.validate(cfg);

        /* -- Lifecycle context -- */
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

        scope.activeTab       = 'cards';
        scope.searchText      = '';
        scope.units           = [];
        scope.filteredUnits   = [];
        scope.summary         = { total: 0, overQuota: 0, warnings: 0, normal: 0, totalConstrainedHours: 0 };
        scope.alerts          = [];
        scope.panelOpen       = false;
        scope.demoMode        = !!cfg.DemoMode;


        /* ── Widget init ────────────────────── */

        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });
        _ctx.widgets.push({ $el: $root, name: WIDGET_NAME });


        /* ── Theme application ──────────────── */

        var rootEl = $root[0];
        function applyTheme() {
            U.applyTheme(rootEl, cfg, PREFIX);
        }
        applyTheme();


        /* ── Filtering helper ───────────────── */

        function applyFilters() {
            var list = scope.units;
            if (scope.searchText) {
                var q = scope.searchText.toLowerCase();
                list = list.filter(function (u) {
                    return (u.name || '').toLowerCase().indexOf(q) >= 0 ||
                           (u.site || '').toLowerCase().indexOf(q) >= 0;
                });
            }
            scope.filteredUnits = list;
        }


        /* ── Bus listeners ──────────────────── */

        bus.on('constraintmonitor:processed', U.shield.wrap(MODULE, 'onProcessed', function (d) {
            scope.units   = d.units || [];
            scope.summary = d.summary || { total: 0, overQuota: 0, warnings: 0, normal: 0, totalConstrainedHours: 0 };

            /* Merge alerts */
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


        /* ── Tab switching ──────────────────── */

        scope.setTab = U.shield.wrap(MODULE, 'setTab', function (t) {
            scope.activeTab = t;
        });

        scope.filterChanged = function () { applyFilters(); };
        scope.clearAlerts   = function () { scope.alerts = []; };


        /* ── Sort (FIX: use slice to avoid mutating source) ── */

        scope.sortBy = U.shield.wrap(MODULE, 'sortBy', function (field) {
            scope.units = scope.units.slice().sort(function (a, b) {
                var va = a[field] || 0, vb = b[field] || 0;
                if (typeof va === 'string') return va.localeCompare(vb, 'he');
                return vb - va;
            });
            applyFilters();
        });


        /* ── Status helpers ─────────────────── */

        scope.getStatusColor = function (status) {
            if (status === 'critical') return cfg.criticalColor || '#e74c3c';
            if (status === 'warning')  return cfg.warningColor || '#f39c12';
            return cfg.goodColor || '#2ecc71';
        };

        scope.getStatusBg = function (status) {
            if (status === 'critical') return 'rgba(231,76,60,.12)';
            if (status === 'warning')  return 'rgba(243,156,18,.12)';
            return 'rgba(46,204,113,.12)';
        };

        scope.getBarColor = function (pct) {
            if (pct >= (cfg.CriticalPct || 95)) return cfg.criticalColor || '#e74c3c';
            if (pct >= (cfg.WarningPct || 80))  return cfg.warningColor || '#f39c12';
            return cfg.goodColor || '#2ecc71';
        };

        scope.getBarWidth = function (pct) {
            return Math.min(pct, 100) + '%';
        };


        /* ── CSV export ─────────────────────── */

        scope.exportCSV = U.shield.wrap(MODULE, 'exportCSV', function () {
            if (scope.units && scope.units.length) {
                var rows = [];
                for (var i = 0; i < scope.units.length; i++) {
                    var u = scope.units[i];
                    rows.push({
                        '\u05E9\u05DD': u.name || '',
                        '\u05D0\u05EA\u05E8': u.site || '',
                        '\u05DE\u05E6\u05D1': u.statusLabel || '',
                        '\u05E0\u05D9\u05E6\u05D5\u05DC%': u.quotaUsedPct != null ? u.quotaUsedPct : '',
                        '\u05E9\u05E2\u05D5\u05EA': u.runningHoursDisplay || '',
                        'CO2': u.co2Display || '',
                        '\u05D3\u05DC\u05E7': u.fuelDisplay || '',
                        '\u05D4\u05EA\u05E0\u05E2\u05D5\u05EA': u.startsDisplay || '',
                        'MW': u.currentMW != null ? u.currentMW : ''
                    });
                }
                U.exportCsv(rows, 'constraints-' + new Date().toISOString().slice(0, 10) + '.csv');
            } else {
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
            if (scope.demoMode) pushDemoData();
        });

        function pushDemoData() {
            var items = U.demo.generate('constmon', { unitCount: 6 });
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
            if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
        }


        /* ── Keyboard shortcuts ────────────── */

        var keyHandlers = {
            '1': function () { scope.setTab('cards');   PIV20.safeApply(scope); },
            '2': function () { scope.setTab('compact'); PIV20.safeApply(scope); },
            '3': function () { scope.setTab('table');   PIV20.safeApply(scope); },
            '4': function () { scope.setTab('alerts');  PIV20.safeApply(scope); },
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


        /* ── Init demo if configured ────────── */

        if (cfg.DemoMode) {
            scope.demoMode = true;
            pushDemoData();
            startDemoLoop();
        }


        /* ── Cleanup ───────────────────────── */

        PIV20.destroyHelper(scope, function () {
            if (rootEl) U.keyboard.detach(rootEl);
            stopDemoLoop();
            U.destroyHelper(_ctx);
            try {
                var w = $root.data(WIDGET_NAME);
                if (w && w.destroy) w.destroy();
            } catch (e) { /* ignore */ }
            if (bus && bus.destroy) bus.destroy();
        });

        if (PIV20.initSymbol) {
            PIV20.initSymbol(scope, elem, {
                name: SYM_NAME, bus: bus, widgetName: WIDGET_NAME, $root: $root
            });
        }
    });


    /* ── Registration ────────────────────────── */

    PV.symbolCatalog.register({
        typeName:    SYM_NAME,
        displayName: '\u05E0\u05D9\u05D8\u05D5\u05E8 \u05D0\u05D9\u05DC\u05D5\u05E6\u05D9\u05DD v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-constraintmonitor20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return JSON.parse(JSON.stringify(DEFAULTS));
        },
        configTitle: '\u05E0\u05D9\u05D8\u05D5\u05E8 \u05D0\u05D9\u05DC\u05D5\u05E6\u05D9\u05DD v20'
    });

})(window.PIVisualization, window.PIV20);
