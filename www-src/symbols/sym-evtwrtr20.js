/* ================================================================
   sym-eventwriter20.js — Event Writer v20 (orchestrator)
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME    = 'evtwrtr20';
    var WIDGET_NAME = 'piv20Eventwriter';

    function symbolVis() { }
    symbolVis.prototype.init = function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#ew20-widget');
        $root.show();

        /* ── Scope defaults ─────────────────── */
        scope.activeTab       = 'write';
        scope.templates       = [];
        scope.selectedTemplate = '';
        scope.history         = [];
        scope.writeCount      = 0;
        scope.writing         = false;
        scope.writeError      = '';
        scope.writeSuccess    = '';
        scope.canWrite        = true;
        scope.authStatus      = 'unknown';
        scope.authStatusText  = '\u05D1\u05D5\u05D3\u05E7...';
        scope.currentUser     = '';
        scope.panelOpen       = false;

        /* Event form */
        scope.eventForm = {
            name: '',
            type: '',
            severity: '2',
            startTime: null,
            endTime: null,
            description: '',
            templateName: cfg.defaultEFTemplate || '',
            elementWebId: cfg.defaultElementWebId || ''
        };

        /* Confirmation dialog */
        scope.confirmVisible  = false;
        scope.confirmMessage  = '';
        var pendingForm       = null;

        /* ── Widget init ────────────────────── */
        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });

        /* Load templates from widget */
        var w = $root.data(WIDGET_NAME);
        if (w) scope.templates = w.getTemplates();

        /* ── Bus listeners ──────────────────── */
        bus.on('ew:authResolved', function (info) {
            if (info) {
                scope.currentUser = info.user || '';
                scope.canWrite = info.canWrite;
                scope.authStatus = info.canWrite ? 'ok' : 'denied';
                scope.authStatusText = info.roleLabel || (info.canWrite ? '\u05DE\u05D5\u05E8\u05E9\u05D4' : '\u05E7\u05E8\u05D9\u05D0\u05D4 \u05D1\u05DC\u05D1\u05D3');
            }
            PIV20.safeApply(scope);
        });

        bus.on('ew:writing', function (v) {
            scope.writing = v;
            if (v) { scope.writeError = ''; scope.writeSuccess = ''; }
            PIV20.safeApply(scope);
        });

        bus.on('ew:writeError', function (msg) {
            scope.writeError = msg;
            scope.writeSuccess = '';
            PIV20.safeApply(scope);
        });

        bus.on('ew:writeSuccess', function (msg) {
            scope.writeSuccess = msg;
            scope.writeError = '';
            PIV20.safeApply(scope);
        });

        bus.on('ew:historyUpdate', function (hist) {
            scope.history = hist;
            PIV20.safeApply(scope);
        });

        bus.on('ew:writeCountUpdate', function (count) {
            scope.writeCount = count;
            PIV20.safeApply(scope);
        });

        bus.on('ew:confirmRequired', function (data) {
            pendingForm = data.form;
            scope.confirmMessage = data.message;
            scope.confirmVisible = true;
            PIV20.safeApply(scope);
        });

        /* ── Scope actions ──────────────────── */
        scope.setTab = function (t) { scope.activeTab = t; };

        scope.selectTemplate = function (tmpl) {
            scope.selectedTemplate = tmpl.key;
            scope.eventForm.type = tmpl.type;
            scope.eventForm.severity = tmpl.severity;
            scope.eventForm.name = tmpl.name + ' — ' + new Date().toLocaleString('he-IL');
            scope.eventForm.templateName = tmpl.name;
            scope.activeTab = 'write';
        };

        scope.submitEvent = function () {
            if (!scope.canWrite || scope.writing) return;
            if (!scope.eventForm.name) {
                scope.writeError = '\u05E0\u05D0 \u05DC\u05D4\u05D6\u05D9\u05DF \u05E9\u05DD \u05D0\u05D9\u05E8\u05D5\u05E2';
                return;
            }
            scope.writeError = '';
            scope.writeSuccess = '';
            bus.emit('ew:submitEvent', scope.eventForm);
        };

        scope.confirmWrite = function () {
            scope.confirmVisible = false;
            if (pendingForm) {
                bus.emit('ew:confirmedWrite', pendingForm);
                pendingForm = null;
            }
        };

        scope.cancelWrite = function () {
            scope.confirmVisible = false;
            pendingForm = null;
        };

        scope.clearForm = function () {
            scope.eventForm = {
                name: '', type: '', severity: '2',
                startTime: null, endTime: null,
                description: '',
                templateName: cfg.defaultEFTemplate || '',
                elementWebId: cfg.defaultElementWebId || ''
            };
            scope.selectedTemplate = '';
            scope.writeError = '';
            scope.writeSuccess = '';
        };

        scope.openPanel  = function () { scope.panelOpen = true; };
        scope.closePanel = function () { scope.panelOpen = false; };

        scope.showDocs = function () {
            if (PIV20.docs) PIV20.docs.show(SYM_NAME, scope, elem);
        };

        /* ── Initial config emit ────────────── */
        bus.emit('config', cfg);

        /* ── Data bridge (minimal — EW mostly writes, not reads) ── */
        scope.$on('dataUpdate', function () {
            /* EW can optionally receive data for element context */
            bus.emit('config', cfg);
        });

        /* ── Cleanup ────────────────────────── */
        PIV20.destroyHelper(scope, function () {
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
        displayName: '\u05DB\u05D5\u05EA\u05D1 \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.None,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-eventwriter20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                Title: '\u05DB\u05D5\u05EA\u05D1 \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD',
                piWebApiUrl: '',
                defaultElementWebId: '',
                defaultEFTemplate: '',
                defaultDurationMin: 60,
                requireConfirmation: true,
                allowDelete: false,
                useAuthGuard: false,
                securityElementPath: '',
                keepHistory: true,
                maxHistory: 100,
                accentColor: '#5BC0EB',
                fontFamily: 'Segoe UI',
                fontSize: 12,
                Height: 500,
                Width: 450
            };
        },
        configTitle: '\u05DB\u05D5\u05EA\u05D1 \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD v20'
    });
})(window.PIVisualization, window.PIV20);
