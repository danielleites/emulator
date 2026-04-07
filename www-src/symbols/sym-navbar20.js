/**
 * ================================================================
 *  sym-navbar20.js  --  Navigation Sidebar v20 Orchestrator
 * ================================================================
 *  Thin PI Vision orchestrator for the Navigation Sidebar panel.
 *  Domain logic lives in piv20-plugins/piv20-navbar.js.
 *
 *  Responsibilities:
 *    - PI Vision symbol registration (catalog, config, lifecycle)
 *    - AngularJS scope binding (view state, methods)
 *    - Create bus + init widget via PIV20.safeWidget
 *    - Route dataUpdate / configChange to widget via bus
 *    - Persist items/favorites/recentItems from widget to config
 *    - $destroy cleanup via PIV20.destroyHelper
 *
 *  Dependencies:
 *    - piv20-core.js         (PIV20 namespace)
 *    - piv20-navbar.js       (jQuery widget plugin)
 *    - sym-navbar20.css      (external stylesheet)
 *
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME = 'navbar20';
    var WIDGET_NAME = 'piv20Navbar';
    var THROTTLE_MS = 500;

    // ══════════════════════════════════════════════
    //  SYMBOL VIS
    // ══════════════════════════════════════════════

    function symbolVis() {}
    PV.deriveVisualizationFromBase(symbolVis);

    /**
     * Initialize symbol: create bus, bind scope, init widget.
     */
    symbolVis.prototype.init = function (scope, el) {
        var PIV20 = window.PIV20;
        if (!PIV20) { console.error('[' + SYM_NAME + '] PIV20 not loaded'); return; }

        var container = el[0] || el;
        var P = window.PIV10;
        var lastProcessTime = 0;

        // ── Create per-instance bus ──
        var bus = PIV20.createBus();

        // ── Cleanup context ──
        var _cleanup = {
            intervals: [],
            timeouts: [],
            unwatchers: [],
            listeners: [],
            widgets: {},
            $interval: null,
            $timeout: null
        };

        // ── Scope state ──
        scope.panelOpen = false;
        scope.showSidePanel = false;
        scope.liveTime = PIV20.fmt.time();
        scope.liveDate = PIV20.fmt.date();
        scope.loading = true;

        // Navigation data (populated from widget via bus)
        scope.items = [];
        scope.filteredItems = [];
        scope.favoriteItems = [];
        scope.recentItems = [];
        scope.favorites = [];
        scope.kpiItems = [];
        scope.kpiSummary = { total: 0, good: 0, warn: 0, crit: 0, bad: 0, stale: 0, sumMW: 0 };
        scope.afConn = null;
        scope.hasData = false;
        scope.showKpi = true;
        scope.showSearch = false;
        scope.editMode = false;
        scope.isFullscreen = false;
        scope.searchText = '';
        scope.selectedKpi = null;


        // ══════════════════════════════════════════════
        //  SCOPE METHODS (proxy to widget)
        // ══════════════════════════════════════════════

        scope.togglePanel = function () { scope.panelOpen = !scope.panelOpen; };
        scope.toggleSidePanel = function () { scope.showSidePanel = !scope.showSidePanel; };

        // ── Item CRUD ──
        scope.addItem = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('addItem');
        };
        scope.removeItem = function (idx, $event) {
            if ($event) $event.stopPropagation();
            if (_widgetRef) _widgetRef[WIDGET_NAME]('removeItem', idx);
        };
        scope.moveItem = function (idx, dir) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('moveItem', idx, dir);
        };

        // ── Navigation ──
        scope.navigate = function (item) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('navigate', item, scope.selectedKpi);
        };

        // ── Favorites ──
        scope.toggleFavorite = function (item, $event) {
            if ($event) $event.stopPropagation();
            if (_widgetRef) _widgetRef[WIDGET_NAME]('toggleFavorite', item.label);
        };
        scope.isFavorite = function (item) {
            return scope.favorites.indexOf(item.label) >= 0;
        };

        // ── Edit mode ──
        scope.toggleEdit = function () {
            scope.editMode = !scope.editMode;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setEditMode', scope.editMode);
        };

        // ── Search ──
        scope.toggleSearch = function () {
            scope.showSearch = !scope.showSearch;
            if (!scope.showSearch) scope.searchText = '';
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setShowSearch', scope.showSearch);
        };
        scope.onSearchChange = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setSearchText', scope.searchText);
        };

        // ── KPI ──
        scope.toggleKpi = function () {
            scope.showKpi = !scope.showKpi;
            scope.config.showKpi = scope.showKpi;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setShowKpi', scope.showKpi);
        };
        scope.selectKpi = function (kpi) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('selectKpi', kpi);
        };
        scope.getKpiColor = function (kpi) {
            if (_widgetRef) return _widgetRef[WIDGET_NAME]('getKpiColor', kpi);
            return '#ccc';
        };

        // ── Fullscreen ──
        scope.toggleFullscreen = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('toggleFullscreen');
        };

        // ── Export ──
        scope.exportItems = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('exportItems');
        };


        // ══════════════════════════════════════════════
        //  BUS → SCOPE BINDING
        // ══════════════════════════════════════════════

        bus.on('nav:updated', function (payload) {
            scope.items = payload.items;
            scope.filteredItems = payload.filteredItems;
            scope.favoriteItems = payload.favoriteItems;
            scope.recentItems = payload.recentItems;
            scope.favorites = payload.favorites;
            scope.kpiItems = payload.kpiItems;
            scope.kpiSummary = payload.kpiSummary;
            scope.afConn = payload.afConn;
            scope.hasData = payload.hasData;
            scope.showKpi = payload.showKpi;
            scope.showSearch = payload.showSearch;
            scope.editMode = payload.editMode;
            scope.isFullscreen = payload.isFullscreen;
            scope.searchText = payload.searchText;
            scope.selectedKpi = payload.selectedKpi;
            scope.loading = false;
            scope.$applyAsync();
        });

        // ── Persist items/favorites/recent back to config ──
        bus.on('nav:persist', function (data) {
            scope.config.items = data.items;
            scope.config.favorites = data.favorites;
            scope.config.recentItems = data.recentItems;
            scope.config.showKpi = data.showKpi;
        });


        // ══════════════════════════════════════════════
        //  WIDGET INIT
        // ══════════════════════════════════════════════

        var _widgetRef = PIV20.safeWidget(
            el, '#nv20-widget', WIDGET_NAME,
            { bus: bus, config: scope.config, container: container },
            '\u05E0\u05D9\u05D5\u05D5\u05D8 \u05D9\u05D9\u05E6\u05D5\u05E8'
        );

        if (_widgetRef) {
            _cleanup.widgets.navbar = { ref: _widgetRef, widgetName: WIDGET_NAME };
        }


        // ══════════════════════════════════════════════
        //  PIV10 SHARED INFRA (optional)
        // ══════════════════════════════════════════════

        if (P && P.initSymbol) {
            P.initSymbol(scope, el, {
                name: SYM_NAME,
                onTagDrop: function (path) {
                    scope.symbol.DataSources.push(path);
                    if (P.tagContainer) P.tagContainer.register(scope, path, '', '');
                },
                onExport: function () { scope.exportItems(); },
                contextMenuItems: [
                    { label: '\u05D4\u05E6\u05D2/\u05D4\u05E1\u05EA\u05E8 KPI', icon: '\uD83D\uDCCA', action: function () { scope.toggleKpi(); } },
                    { label: '\u05DE\u05E6\u05D1 \u05E2\u05E8\u05D9\u05DB\u05D4', icon: '\u270F\uFE0F', action: function () { scope.toggleEdit(); } },
                    { label: '\u05D7\u05D9\u05E4\u05D5\u05E9', icon: '\uD83D\uDD0D', action: function () { scope.toggleSearch(); } },
                    { label: '\u05D4\u05D5\u05E1\u05E3 \u05E4\u05E8\u05D9\u05D8', icon: '\u2795', action: function () { scope.addItem(); } },
                    { label: '\u05DE\u05E1\u05DA \u05DE\u05DC\u05D0', icon: '\u26F6', action: function () { scope.toggleFullscreen(); } }
                ]
            });
        } else {
            // Fallback clock
            var _clockInterval = setInterval(function () {
                scope.liveTime = PIV20.fmt.time();
                scope.liveDate = PIV20.fmt.date();
                scope.$applyAsync();
            }, 1000);
            _cleanup.intervals.push({ cancel: function () { clearInterval(_clockInterval); } });
        }


        // ══════════════════════════════════════════════
        //  DATA UPDATE (throttled, routed to widget)
        // ══════════════════════════════════════════════

        this.onDataUpdate = PIV20.shield.wrap(SYM_NAME, 'dataUpdate', function (data) {
            var now = Date.now();
            if (now - lastProcessTime < THROTTLE_MS) return;
            lastProcessTime = now;

            scope.liveTime = PIV20.fmt.time();
            scope.liveDate = PIV20.fmt.date();

            // Route to widget via bus
            bus.emit('data:updated', data);
        });

        // ── Config change → re-emit to widget ──
        this.onConfigChange = PIV20.shield.wrap(SYM_NAME, 'configChange', function () {
            if (_widgetRef && _widgetRef.data && _widgetRef.data(WIDGET_NAME)) {
                _widgetRef[WIDGET_NAME]('option', 'config', scope.config);
            }
            bus.emit('config:changed', scope.config);
        });

        // ── Docs integration ──
        scope.showDocs = function (section) {
            if (P && P.docs) P.docs.show(SYM_NAME, container, section);
        };
        if (P && P.docs) P.docs.initTooltips(container, SYM_NAME);

        // ── $destroy cleanup ──
        scope.$on('$destroy', function () {
            bus.reset();
            PIV20.destroyHelper(_cleanup);
            scope.items = null;
            scope.filteredItems = null;
            scope.favoriteItems = null;
            scope.recentItems = null;
            scope.kpiItems = null;
            scope.kpiSummary = null;
            scope.afConn = null;
            scope.selectedKpi = null;
        });
    };


    // ══════════════════════════════════════════════
    //  CATALOG REGISTRATION
    // ══════════════════════════════════════════════

    PV.symbolCatalog.register({
        typeName: SYM_NAME,
        displayName: '\u05E0\u05D9\u05D5\u05D5\u05D8 v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/sym-navbar20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'Table',
                Columns: ['Value'],
                Height: 600,
                Width: 320,
                Decimals: 2,
                panelOpen: false,
                // Navigation items (null = use defaults)
                items: null,
                favorites: [],
                recentItems: [],
                showKpi: true,
                kpiLabels: {},
                kpiThresholds: {},
                // Sort
                sortBy: 'value',
                sortDesc: true,
                // Font
                fontFamily: 'Segoe UI',
                fontSize: 13,
                headerFontSize: 16,
                fontBold: false,
                fontItalic: false,
                // Colors
                headerBg: '#1a2332',
                rowBg: '#0d1117',
                altRowBg: '#131a24',
                goodColor: '#2ecc71',
                warningColor: '#f39c12',
                criticalColor: '#e74c3c',
                accentColor: '#f39c12',
                // Animation
                animationType: 'fade',
                animationSpeed: 300,
                // AF
                StaleThreshold: 300
            };
        },
        configTitle: '\u05E0\u05D9\u05D5\u05D5\u05D8',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; }
    });

})(window.PIVisualization);
