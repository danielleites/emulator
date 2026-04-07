/* ================================================================
   sym-afbrowser20.js — AF Browser v20 (orchestrator)
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME    = 'afbrowser20';
    var WIDGET_NAME = 'piv20Afbrowser';

    function symbolVis() { }
    symbolVis.prototype.init = function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#af20-widget');
        $root.show();

        /* ── Scope defaults ─────────────────── */
        scope.activeTab       = 'browse';
        scope.tree            = [];
        scope.breadcrumb      = [];
        scope.selectedNode    = {};
        scope.selectedAttrs   = [];
        scope.searchQuery     = '';
        scope.searchResults   = [];
        scope.searchDone      = false;
        scope.favorites       = [];
        scope.recent          = [];
        scope.cart            = [];
        scope.previewData     = null;
        scope.loading         = false;
        scope.searching       = false;
        scope.connectionStatus = '\u05DE\u05EA\u05D7\u05D1\u05E8...';
        scope.currentServer   = '';
        scope.currentDb       = '';
        scope.panelOpen       = false;
        scope.toastVisible    = false;
        scope.toastText       = '';

        var toastTimer = null;

        /* ── Widget init ────────────────────── */
        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });

        /* Load favorites/recent from widget */
        var w = $root.data(WIDGET_NAME);
        if (w) {
            scope.favorites = w.getFavorites();
            scope.recent = w.getRecent();
        }

        /* ── Bus listeners ──────────────────── */
        bus.on('af:tree', function (items) {
            scope.tree = items;
            PIV20.safeApply(scope);
        });

        bus.on('af:attributes', function (attrs) {
            scope.selectedAttrs = attrs;
            PIV20.safeApply(scope);
        });

        bus.on('af:searchResults', function (results) {
            scope.searchResults = results;
            scope.searchDone = true;
            PIV20.safeApply(scope);
        });

        bus.on('af:loading', function (v) {
            scope.loading = v;
            PIV20.safeApply(scope);
        });

        bus.on('af:searching', function (v) {
            scope.searching = v;
            PIV20.safeApply(scope);
        });

        bus.on('af:error', function (err) {
            scope.loading = false;
            scope.searching = false;
            showToast('\u05E9\u05D2\u05D9\u05D0\u05D4: ' + (err.text || err.status || 'unknown'));
            PIV20.safeApply(scope);
        });

        bus.on('af:connection', function (status) {
            scope.connectionStatus = status === 'connected' ? '\u05DE\u05D7\u05D5\u05D1\u05E8' : '\u05DE\u05E0\u05D5\u05EA\u05E7';
            PIV20.safeApply(scope);
        });

        bus.on('af:recent', function (recent) {
            scope.recent = recent;
            PIV20.safeApply(scope);
        });

        bus.on('af:preview', function (data) {
            scope.previewData = data;
            PIV20.safeApply(scope);
        });

        bus.on('af:toast', function (text) {
            showToast(text);
        });

        bus.on('af:deepLinkResult', function (item) {
            scope.breadcrumb.push({ name: item.name, item: item });
            scope.selectedNode = item;
            bus.emit('af:navigate', item);
        });

        /* ── Toast helper ───────────────────── */
        function showToast(text) {
            scope.toastText = text;
            scope.toastVisible = true;
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(function () {
                scope.toastVisible = false;
                PIV20.safeApply(scope);
            }, 2500);
            PIV20.safeApply(scope);
        }

        /* ── Scope actions ──────────────────── */
        scope.setTab = function (t) {
            scope.activeTab = t;
            if (t === 'favorites') {
                var wg = $root.data(WIDGET_NAME);
                if (wg) scope.favorites = wg.getFavorites();
            }
        };

        scope.navigateTo = function (item) {
            scope.selectedNode = item;
            scope.selectedAttrs = [];
            scope.previewData = null;

            /* Build breadcrumb */
            if (item.type === 'server') {
                scope.breadcrumb = [{ name: item.name, item: item }];
                scope.currentServer = item.name;
            } else if (item.type === 'database') {
                scope.breadcrumb.push({ name: item.name, item: item });
                scope.currentDb = item.name;
            } else {
                scope.breadcrumb.push({ name: item.name, item: item });
            }

            bus.emit('af:navigate', item);
        };

        scope.navigateToResult = function (item) {
            scope.activeTab = 'browse';
            scope.breadcrumb = [{ name: item.name, item: item }];
            scope.selectedNode = item;
            scope.selectedAttrs = [];
            bus.emit('af:navigate', item);
        };

        scope.goToBreadcrumb = function (idx) {
            if (idx >= scope.breadcrumb.length - 1) return;
            var target = scope.breadcrumb[idx];
            scope.breadcrumb = scope.breadcrumb.slice(0, idx + 1);
            scope.selectedNode = target.item;
            scope.selectedAttrs = [];
            scope.previewData = null;
            bus.emit('af:navigate', target.item);
        };

        scope.goHome = function () {
            scope.breadcrumb = [];
            scope.selectedNode = {};
            scope.selectedAttrs = [];
            scope.previewData = null;
            scope.currentServer = '';
            scope.currentDb = '';
            bus.emit('af:loadServers');
        };

        /* ── Search ─────────────────────────── */
        scope.doSearch = function () {
            if (!scope.searchQuery || scope.searchQuery.length < 2) return;
            scope.searchDone = false;
            scope.searchResults = [];
            bus.emit('af:search', scope.searchQuery);
        };

        scope.onSearchKey = function (e) {
            if (e.keyCode === 13) scope.doSearch();
        };

        /* ── Attribute selection / preview ──── */
        scope.selectAttribute = function (attr) {
            scope.previewData = { name: attr.name, path: attr.path, uom: attr.uom, displayValue: attr.displayValue || '---' };
            if (cfg.showPreview && attr.webId) {
                bus.emit('af:previewAttr', attr.webId);
            }
        };

        /* ── Favorites ──────────────────────── */
        scope.toggleFavorite = function (item) {
            var wg = $root.data(WIDGET_NAME);
            if (wg) {
                wg.toggleFavorite(item);
                scope.favorites = wg.getFavorites();
            }
        };

        scope.isFavorite = function (item) {
            var wg = $root.data(WIDGET_NAME);
            return wg ? wg.isFavorite(item.id) : false;
        };

        /* ── Cart ───────────────────────────── */
        scope.addToCart = function (item) {
            for (var i = 0; i < scope.cart.length; i++) {
                if (scope.cart[i].id === item.id) return;
            }
            scope.cart.push(item);
            showToast('\u05E0\u05D5\u05E1\u05E3 \u05DC\u05E1\u05DC');
        };

        scope.removeFromCart = function (item) {
            for (var i = scope.cart.length - 1; i >= 0; i--) {
                if (scope.cart[i].id === item.id) scope.cart.splice(i, 1);
            }
        };

        scope.clearCart = function () { scope.cart = []; };

        scope.addAllAttrsToCart = function () {
            for (var i = 0; i < scope.selectedAttrs.length; i++) {
                scope.addToCart(scope.selectedAttrs[i]);
            }
        };

        scope.exportCart = function (format) {
            var wg = $root.data(WIDGET_NAME);
            if (wg) wg.exportCart(scope.cart, format);
        };

        /* ── Panel / Docs ──────────────────── */
        scope.openPanel  = function () { scope.panelOpen = true; };
        scope.closePanel = function () { scope.panelOpen = false; };

        scope.showDocs = function () {
            if (PIV20.docs) PIV20.docs.show(SYM_NAME, scope, elem);
        };

        /* ── Initial load ──────────────────── */
        bus.emit('config', cfg);

        if (cfg.defaultAfPath) {
            bus.emit('af:deepLink', cfg.defaultAfPath);
        } else {
            bus.emit('af:loadServers');
        }

        /* Check URL deep link */
        try {
            var urlParams = new URLSearchParams(window.location.search);
            var afPath = urlParams.get('afpath');
            if (afPath) bus.emit('af:deepLink', afPath);
        } catch (e) { /* legacy guard */ }

        /* ── Cleanup ────────────────────────── */
        PIV20.destroyHelper(scope, function () {
            if (toastTimer) clearTimeout(toastTimer);
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
        displayName: '\u05D3\u05E4\u05D3\u05E4\u05DF AF v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.None,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-afbrowser20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                Title: '\u05D3\u05E4\u05D3\u05E4\u05DF AF',
                piWebApiUrl: '',
                defaultAfPath: '',
                showPreview: true,
                autoExpand: false,
                enableDragDrop: true,
                showFavorites: true,
                showRecent: true,
                showCart: true,
                maxSearchResults: 50,
                maxRecent: 20,
                accentColor: '#5BC0EB',
                fontFamily: 'Segoe UI',
                fontSize: 12,
                StaleThreshold: 300,
                Height: 550,
                Width: 400
            };
        },
        configTitle: '\u05D3\u05E4\u05D3\u05E4\u05DF AF v20'
    });
})(window.PIVisualization, window.PIV20);
