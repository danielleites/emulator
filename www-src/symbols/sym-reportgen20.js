/* ================================================================
   sym-reportgen20.js — Report Generator v20 (orchestrator)
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME    = 'reportgen20';
    var WIDGET_NAME = 'piv20Reportgen';

    function symbolVis() { }
    symbolVis.prototype.init = function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#rg20-widget');
        $root.show();

        /* ── Scope defaults ─────────────────── */
        scope.activeTab       = 'generate';
        scope.engineStatus    = 'loading';
        scope.engineStatusText = '\u05D8\u05D5\u05E2\u05DF...';
        scope.currentUnit     = '';
        scope.reportCount     = 0;
        scope.loadedProfiles  = 0;
        scope.generating      = false;
        scope.generateError   = '';
        scope.generateSuccess = '';
        scope.currentReport   = null;
        scope.reportHistory   = [];
        scope.reportTemplates = [];
        scope.panelOpen       = false;

        /* Report configuration form */
        scope.reportConfig = {
            template: cfg.defaultTemplate || 'status',
            unitKey: '',
            site: cfg.defaultSite || '',
            unit: cfg.defaultUnit || '',
            title: '',
            includeCharts: cfg.includeCharts !== false,
            includeCorrelations: cfg.includeCorrelations !== false,
            includeAnomalyLog: cfg.includeAnomalyLog !== false
        };

        /* Build unitKey from site/unit */
        function updateUnitKey() {
            if (scope.reportConfig.site && scope.reportConfig.unit) {
                scope.reportConfig.unitKey = scope.reportConfig.site + '/' + scope.reportConfig.unit;
            }
        }
        scope.$watch('reportConfig.site', updateUnitKey);
        scope.$watch('reportConfig.unit', updateUnitKey);

        /* ── Widget init ────────────────────── */
        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });

        var w = $root.data(WIDGET_NAME);
        if (w) scope.reportTemplates = w.getTemplates();

        /* ── Bus listeners ──────────────────── */
        bus.on('rg:engineReady', function () {
            scope.engineStatus = 'ready';
            scope.engineStatusText = '\u05DE\u05D5\u05DB\u05DF';
            if (w) scope.loadedProfiles = w.getLoadedProfileCount();
            PIV20.safeApply(scope);
        });

        bus.on('rg:generating', function (v) {
            scope.generating = v;
            if (v) { scope.generateError = ''; scope.generateSuccess = ''; }
            PIV20.safeApply(scope);
        });

        bus.on('rg:reportReady', function (report) {
            scope.currentReport = report;
            scope.currentUnit = report.unit;
            scope.generateSuccess = '\u05D3\u05D5\u05D7 \u05E0\u05D5\u05E6\u05E8 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4';
            scope.activeTab = 'preview';
            PIV20.safeApply(scope);
        });

        bus.on('rg:error', function (msg) {
            scope.generateError = msg;
            scope.generateSuccess = '';
            PIV20.safeApply(scope);
        });

        bus.on('rg:historyUpdate', function (hist) {
            scope.reportHistory = hist;
            PIV20.safeApply(scope);
        });

        bus.on('rg:countUpdate', function (count) {
            scope.reportCount = count;
            if (w) scope.loadedProfiles = w.getLoadedProfileCount();
            PIV20.safeApply(scope);
        });

        /* ── Scope actions ──────────────────── */
        scope.setTab = function (t) { scope.activeTab = t; };

        scope.selectTemplate = function (tmpl) {
            scope.reportConfig.template = tmpl.key;
            scope.activeTab = 'generate';
        };

        scope.generateReport = function () {
            if (scope.generating) return;
            if (!scope.reportConfig.unitKey) {
                scope.generateError = '\u05E0\u05D0 \u05DC\u05D4\u05D6\u05D9\u05DF \u05DE\u05E4\u05EA\u05D7 \u05D9\u05D7\u05D9\u05D3\u05D4';
                return;
            }
            scope.generateError = '';
            scope.generateSuccess = '';
            bus.emit('rg:generate', scope.reportConfig);
        };

        scope.clearConfig = function () {
            scope.reportConfig = {
                template: cfg.defaultTemplate || 'status',
                unitKey: '',
                site: cfg.defaultSite || '',
                unit: cfg.defaultUnit || '',
                title: '',
                includeCharts: cfg.includeCharts !== false,
                includeCorrelations: cfg.includeCorrelations !== false,
                includeAnomalyLog: cfg.includeAnomalyLog !== false
            };
            scope.generateError = '';
            scope.generateSuccess = '';
        };

        scope.loadHistory = function (item) {
            scope.currentReport = item.report;
            scope.currentUnit = item.unitKey;
            scope.activeTab = 'preview';
        };

        /* ── Display helpers ────────────────── */
        scope.formatValue = function (val, dec) {
            if (val == null || isNaN(val)) return '---';
            return PIV20.fmt ? PIV20.fmt(val, dec) : Number(val).toFixed(dec || 1);
        };

        scope.getScoreColor = function (score) {
            if (score >= 80) return '#2ecc71';
            if (score >= 50) return '#f39c12';
            return '#e74c3c';
        };

        scope.getStatusText = function (status) {
            var wg = $root.data(WIDGET_NAME);
            return wg ? wg.getStatusText(status) : (status || '---');
        };

        scope.getPatternText = function (pattern) {
            var wg = $root.data(WIDGET_NAME);
            return wg ? wg.getPatternText(pattern) : (pattern || '---');
        };

        scope.getBreakdownLabel = function (cat) {
            var wg = $root.data(WIDGET_NAME);
            if (wg) {
                var labels = wg.getBreakdownLabels();
                return labels[cat] || cat;
            }
            return cat;
        };

        /* ── Export actions ──────────────────── */
        scope.exportHTML = function () {
            if (scope.currentReport) bus.emit('rg:exportHTML', scope.currentReport);
        };

        scope.exportCSV = function () {
            if (scope.currentUnit) bus.emit('rg:exportCSV', scope.currentUnit);
        };

        scope.printReport = function () {
            window.print();
        };

        scope.copyToClipboard = function () {
            if (!scope.currentReport) return;
            var text = scope.currentReport.title + '\n\n';
            text += '\u05D9\u05D7\u05D9\u05D3\u05D4: ' + scope.currentReport.unit + '\n';
            text += '\u05E0\u05D5\u05E6\u05E8: ' + scope.currentReport.generatedAt + '\n';

            if (scope.currentReport.healthScore != null) {
                text += '\u05E6\u05D9\u05D5\u05DF \u05D1\u05E8\u05D9\u05D0\u05D5\u05EA: ' + scope.currentReport.healthScore + '\n';
            }

            /* Copy to clipboard */
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text);
            } else if (window.clipboardData) {
                window.clipboardData.setData('Text', text);
            }
        };

        /* ── Panel / Docs ──────────────────── */
        scope.openPanel  = function () { scope.panelOpen = true; };
        scope.closePanel = function () { scope.panelOpen = false; };

        scope.showDocs = function () {
            if (PIV20.docs) PIV20.docs.show(SYM_NAME, scope, elem);
        };

        /* ── Initial config emit ────────────── */
        bus.emit('config', cfg);

        /* ── Data bridge (optional — can use live data) ── */
        scope.$on('dataUpdate', function () {
            bus.emit('config', cfg);
        });

        /* ── Auto-refresh ──────────────────── */
        var refreshTimer = null;
        if (cfg.autoRefresh && cfg.refreshIntervalSec) {
            refreshTimer = setInterval(function () {
                if (scope.currentUnit && !scope.generating) {
                    scope.generateReport();
                    PIV20.safeApply(scope);
                }
            }, (cfg.refreshIntervalSec || 60) * 1000);
        }

        /* ── Cleanup ────────────────────────── */
        PIV20.destroyHelper(scope, function () {
            if (refreshTimer) clearInterval(refreshTimer);
            var wg = $root.data(WIDGET_NAME);
            if (wg) wg.destroy();
            bus.destroy();
        });

        if (PIV20.initSymbol) {
            PIV20.initSymbol(scope, elem, {
                name: SYM_NAME, bus: bus, widgetName: WIDGET_NAME, $root: $root
            });
        }
    };

    /* ── Registration ────────────────────────── */
    PV.symbolCatalog.register({
        typeName:    SYM_NAME,
        displayName: '\u05DE\u05D7\u05D5\u05DC\u05DC \u05D3\u05D5\u05D7\u05D5\u05EA v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.None,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-reportgen20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                Title: '\u05DE\u05D7\u05D5\u05DC\u05DC \u05D3\u05D5\u05D7\u05D5\u05EA',
                baselinePath: '/PIVision/BaselineData/',
                defaultSite: '',
                defaultUnit: '',
                defaultTemplate: 'status',
                includeCharts: true,
                includeCorrelations: true,
                includeAnomalyLog: true,
                autoRefresh: false,
                refreshIntervalSec: 60,
                keepHistory: true,
                maxHistory: 50,
                Decimals: 2,
                StaleThreshold: 300,
                accentColor: '#5BC0EB',
                fontFamily: 'Segoe UI',
                fontSize: 12,
                Height: 600,
                Width: 550
            };
        },
        configTitle: '\u05DE\u05D7\u05D5\u05DC\u05DC \u05D3\u05D5\u05D7\u05D5\u05EA v20'
    });
})(window.PIVisualization, window.PIV20);
