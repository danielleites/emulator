/**
 * ═══════════════════════════════════════════════════════
 *  sym-mugmoni20.js  —  Symbol Orchestrator (INT variant)
 * ═══════════════════════════════════════════════════════
 *  Identical logic to mugmon20, different typeName.
 *  Bootstraps mm20-core.js + plugins dynamically (no hardcoded paths).
 *  Shares mm20-plugins/*.js widgets with mugmon20.
 *
 *  DEFENSIVE LOADING:
 *    If mm20-plugins/ files are missing, this symbol renders
 *    a Hebrew error fallback inside its own container and
 *    does NOT crash any other symbol on the display.
 *
 *  Version : 20.1.R1-INT
 *  ES5 only
 *  Inject  : $interval, $timeout
 * ═══════════════════════════════════════════════════════
 */
(function (PV) {
    'use strict';

    // ── Symbol constructor ──
    function symbolVis() {}
    PV.deriveVisualizationFromBase(symbolVis);


    // ═══════════════════════════════════════
    //  INIT
    // ═══════════════════════════════════════

    symbolVis.prototype.init = function (scope, el, $interval, $timeout) {

        // ── Dynamic Base Path ──────────────────────────────────
        function _getOwnBasePath(marker, fallback) {
            var scripts = document.getElementsByTagName('script');
            var i, src;
            for (i = scripts.length - 1; i >= 0; i--) {
                src = scripts[i].getAttribute('src') || '';
                if (src.indexOf(marker) >= 0) {
                    return src.substring(0, src.lastIndexOf('/') + 1);
                }
            }
            return fallback || '/PIVision/Scripts/app/editor/symbols/ext/';
        }

        var _extBase = _getOwnBasePath('sym-mugmoni20.js', '/PIVision/Scripts/app/editor/symbols/ext/');

        function _renderBootstrapError(msg) {
            try {
                var rootDiv = el[0].querySelector('.mm20-root') || el[0];
                rootDiv.innerHTML =
                    '<div dir="rtl" style="display:flex;align-items:center;justify-content:center;' +
                    'height:100%;color:#F39C12;text-align:center;padding:20px;font-family:Segoe UI,Arial,sans-serif;">' +
                    '<div><div style="font-size:32px;margin-bottom:8px;">\u26A0</div>' +
                    '<div style="font-size:14px;font-weight:600;">\u05D8\u05E2\u05D9\u05E0\u05EA MM20 \u05E0\u05DB\u05E9\u05DC\u05D4</div>' +
                    '<div style="font-size:11px;color:#8899AA;margin-top:4px;">' + (msg || '') + '</div>' +
                    '</div></div>';
            } catch (ignore) {}
        }

        // ── Main init (called after plugins are loaded) ──
        function _continueInit(MM) {

        // ── Instance state ──
        var _destroyed   = false;
        var _bus         = MM.createBus();
        var _demoMode    = !!scope.config.DemoMode;
        var _sites       = (scope.config.CustomSites && scope.config.CustomSites.length)
                           ? scope.config.CustomSites
                           : MM.SITES;
        var _parsedData  = {};       // { siteId: { unitIdx: {...} } }
        var _prevHours   = {};       // { unitKey: { hours, ts } } — for TTE rate tracking
        var _refreshHandle = null;
        var _pendingXhrs = [];
        var _unwatchers  = [];
        var _timeouts    = [];
        var _rootEl      = el[0].querySelector('.mm20-root') || el[0];

        // ── Widget references ──
        var _wSiteGrid   = null;
        var _wHeatmap    = null;
        var _wReports    = null;
        var _wAlerts     = null;
        var _wLog        = null;
        var _wTags       = null;
        var _wTagWarehouse = null;
        var _wTagExplorer  = null;
        var _wUnitEvents = null;
        var _wAfBuild    = null;
        var _layoutMgr   = null;

        // ── PI Web API Client ──
        var _api         = null;
        var _apiReady    = false;
        var _apiRetryHandle = null;
        var API_RETRY_SEC = 30;

        // ── Display Guard (QA13) ──
        var _currentUser = '';


        // ─────────────────────────────────────
        //  Apply theme CSS custom properties
        // ─────────────────────────────────────
        MM.applyTheme(_rootEl, scope.config);

        // ── Layout Manager ──
        if (MM.LayoutManager) {
            _layoutMgr = new MM.LayoutManager(_rootEl, scope.config, _bus);
        }


        // ─────────────────────────────────────
        //  PI Web API Connection (replaces HEAD sentinel)
        // ─────────────────────────────────────
        /**
         * Initialize PI Web API client and verify connection
         * via getUserInfo(). If successful, emits 'api:ready' on bus
         * so all widgets can use the shared API instance.
         * If fails, falls back to demo mode and retries every 30s.
         */
        var _initApi = function () {
            if (_destroyed) return;

            _api = new MM.PIWebAPI(scope.config.PIWebAPIBase || '');

            _api.getUserInfo(function (err, data) {
                if (_destroyed) return;

                if (err) {
                    _apiReady = false;
                    _setDemoMode(true);
                    _bus.emit('api:status', { connected: false, error: err });
                    _log('warn', '\u05E9\u05E8\u05EA PI Web API \u05DC\u05D0 \u05D6\u05DE\u05D9\u05DF (HTTP ' + (err.status || '?') + ') \u2014 \u05DE\u05E6\u05D1 \u05D3\u05DE\u05D5');

                    // Retry connection periodically
                    if (!_apiRetryHandle) {
                        _apiRetryHandle = $interval(function () {
                            if (_destroyed || _apiReady) {
                                if (_apiRetryHandle) { $interval.cancel(_apiRetryHandle); _apiRetryHandle = null; }
                                return;
                            }
                            _log('info', '\u05DE\u05E0\u05E1\u05D4 \u05D4\u05EA\u05D7\u05D1\u05E8\u05D5\u05EA \u05DE\u05D7\u05D3\u05E9 \u05DC-PI Web API...');
                            _checkApiConnection();
                        }, API_RETRY_SEC * 1000);
                    }
                } else {
                    _apiReady = true;
                    var userName = (data && data.Name) ? data.Name : 'unknown';
                    _currentUser = userName;                    // QA13: Display Guard
                    scope.guardCurrentUser = _currentUser;     // QA13: expose to template
                    _setDemoMode(false);
                    _bus.emit('api:ready', _api);
                    _bus.emit('api:status', { connected: true, user: userName });
                    _log('info', '\u05D7\u05D9\u05D1\u05D5\u05E8 PI Web API \u05EA\u05E7\u05D9\u05DF \u2014 \u05DE\u05E9\u05EA\u05DE\u05E9: ' + userName);

                    // Cancel retry if running
                    if (_apiRetryHandle) { $interval.cancel(_apiRetryHandle); _apiRetryHandle = null; }
                }
            });
        };

        /**
         * Lightweight re-check for retry loop.
         */
        var _checkApiConnection = function () {
            if (!_api || _destroyed) return;
            _api.getUserInfo(function (err, data) {
                if (_destroyed) return;
                if (!err && data) {
                    _apiReady = true;
                    var userName = (data && data.Name) ? data.Name : 'unknown';
                    _currentUser = userName;                    // QA13: Display Guard
                    scope.guardCurrentUser = _currentUser;     // QA13: expose to template
                    _setDemoMode(false);
                    _bus.emit('api:ready', _api);
                    _bus.emit('api:status', { connected: true, user: userName });
                    _log('info', '\u05D4\u05EA\u05D7\u05D1\u05E8\u05D5\u05EA PI Web API \u05D4\u05E6\u05DC\u05D9\u05D7\u05D4 \u2014 \u05DE\u05E9\u05EA\u05DE\u05E9: ' + userName);
                    if (_apiRetryHandle) { $interval.cancel(_apiRetryHandle); _apiRetryHandle = null; }
                }
            });
        };

        var _setDemoMode = function (enabled) {
            _demoMode = enabled;
            scope.config.DemoMode = enabled;
            _bus.emit('demo:toggle', { enabled: enabled });
        };


        // ─────────────────────────────────────
        //  System logging helper (with startup buffer)
        // ─────────────────────────────────────
        var _logBuffer = [];   // holds entries emitted before log widget subscribes
        var _logReady  = false;

        var _log = function (level, msg) {
            var entry = {
                level: level,
                source: 'orchestrator-int',
                msg: msg,
                ts: new Date().toISOString()
            };
            if (_logReady) {
                _bus.emit('log:entry', entry);
            } else {
                _logBuffer.push(entry);
            }
        };

        var _flushLogBuffer = function () {
            _logReady = true;
            for (var i = 0; i < _logBuffer.length; i++) {
                _bus.emit('log:entry', _logBuffer[i]);
            }
            _logBuffer.length = 0;
        };


        // ─────────────────────────────────────
        //  Widget Instantiation
        // ─────────────────────────────────────
        /**
         * Safely instantiate a jQuery widget with error fallback.
         * If the widget constructor is missing (JS not loaded) or throws,
         * renders a Hebrew error fallback inside the container.
         */
        var _safeWidget = function (selector, widgetName, options, label) {
            var $ = window.jQuery;
            var wEl = $(selector, el);
            if (!wEl.length) return null;

            if (!$.fn[widgetName]) {
                // Plugin JS not loaded — render fallback
                MM.shield.log('orchestrator-int', 'init:' + label, new Error(widgetName + ' not loaded'));
                MM.shield.renderFallback(wEl, label, new Error('\u05EA\u05D5\u05E1\u05E3 ' + label + ' \u05DC\u05D0 \u05E0\u05D8\u05E2\u05DF'));
                return null;
            }

            try {
                wEl[widgetName](options);
                return wEl;
            } catch (e) {
                MM.shield.log('orchestrator-int', 'init:' + label, e);
                MM.shield.renderFallback(wEl, label, e);
                return null;
            }
        };

        var _initWidgets = function () {
            var $ = window.jQuery;
            if (!$) {
                MM.shield.log('orchestrator-int', '_initWidgets', new Error('jQuery not available'));
                return;
            }

            // siteGrid — Realtime tab
            _wSiteGrid = _safeWidget('#mm20-siteGrid', 'mm20SiteGrid', {
                bus:        _bus,
                api:        _api,
                sites:      _sites,
                demoMode:   _demoMode,
                favorites:  scope.config.Favorites || {},
                sortOrder:  scope.config.SortOrder || 'name',
                warnPct:    scope.config.WarnPct || 70,
                critPct:    scope.config.CritPct || 90,
                showSparklines: scope.config.ShowSparklines !== false,
                decimals:   scope.config.Decimals || 1,
                annotations: scope.config.Annotations || {},
                unitSettings: scope.config.UnitSettings || {},
                siteSettings: scope.config.SiteSettings || {},
                trendBaseUrl: scope.config.TrendBaseUrl || '',
                unitEventBindings: scope.config.UnitEventBindings || {}
            }, 'siteGrid');

            // heatmap — Heatmap tab
            _wHeatmap = _safeWidget('#mm20-heatmap', 'mm20Heatmap', {
                bus:      _bus,
                api:      _api,
                sites:    _sites,
                demoMode: _demoMode,
                metric:   scope.config.HeatmapMetric || 'hours',
                siteFilter: scope.config.HeatmapSite || ''
            }, 'heatmap');

            // reports — Reports tab
            _wReports = _safeWidget('#mm20-reports', 'mm20Reports', {
                bus:      _bus,
                api:      _api,
                sites:    _sites,
                demoMode: _demoMode,
                template: scope.config.ReportTemplate || 'monthly',
                grouping: scope.config.ReportGrouping || 'site',
                // QA11: time sync & auto-refresh
                dateStart: scope.config.ReportDateStart || '',
                dateEnd:   scope.config.ReportDateEnd || '',
                autoRefresh: scope.config.ReportAutoRefresh !== false,
                syncWithDisplayTime: scope.config.SyncReportsWithDisplayTime !== false,
                syncSelection: scope.config.SyncReportsSelection !== false
            }, 'reports');

            // alerts — Alerts tab
            _wAlerts = _safeWidget('#mm20-alerts', 'mm20Alerts', {
                bus:       _bus,
                api:       _api,
                sites:     _sites,
                demoMode:  _demoMode,
                quotaPct:  scope.config.AlertQuotaPct || 90,
                hoursMax:  scope.config.AlertHoursMax || 1000,
                staleSec:  scope.config.AlertStaleSec || 300,
                soundEnabled: !!scope.config.AlertSoundEnabled,
                pushEnabled:  !!scope.config.PushNotificationsEnabled
            }, 'alerts');

            // log — Log tab
            _wLog = _safeWidget('#mm20-log', 'mm20LogViewer', {
                bus:        _bus,
                maxEntries: scope.config.MaxLogEntries || 500
            }, 'log');

            // tags — Tags tab (Phase B1 — may not be loaded yet)
            _wTags = _safeWidget('#mm20-tags', 'mm20Tags', {
                bus:      _bus,
                api:      _api,
                sites:    _sites,
                demoMode: _demoMode,
                staleSec: scope.config.TagStaleSeconds || 300
            }, 'tags');

            // tagWarehouse — Tag Warehouse tab (QA14: governance keys)
            if (scope.config.EnableTagWarehouse !== false) {
                _wTagWarehouse = _safeWidget('#mm20-tagWarehouse', 'mm20TagWarehouse', {
                    bus:               _bus,
                    api:               _api,
                    sites:             _sites,
                    demoMode:          _demoMode,
                    defaultBindings:   scope.config.DefaultTagBindings || {},
                    userBindings:      scope.config.UserTagBindings || {},
                    allowUserRebinding: scope.config.AllowUserTagRebinding !== false
                }, 'tagWarehouse');
            }

            // tagExplorer — Tag Explorer tab (QA14: governance keys)
            if (scope.config.EnableTagExplorer !== false) {
                _wTagExplorer = _safeWidget('#mm20-tagExplorer', 'mm20TagExplorer', {
                    bus:            _bus,
                    api:            _api,
                    sites:          _sites,
                    demoMode:       _demoMode,
                    defaultChart:   scope.config.DefaultExplorerChart || 'trend',
                    maxTags:        scope.config.MaxExplorerTags || 8,
                    savedState:     scope.config.ExplorerState || {},
                    onStateChange:  function (state) {
                        scope.config.ExplorerState = state;
                    }
                }, 'tagExplorer');
            }

            // unitEvents — Unit Events tab (QA15: event frames from AF)
            if (scope.config.EnableUnitEvents !== false) {
                _wUnitEvents = _safeWidget('#mm20-unitEvents', 'mm20UnitEvents', {
                    bus:                _bus,
                    api:                _api,
                    sites:              _sites,
                    demoMode:           _demoMode,
                    useDisplayTime:     scope.config.UseDisplayTimeForEvents !== false,
                    showOnlyOpen:       scope.config.ShowOnlyOpenEvents === true,
                    defaultFilter:      scope.config.DefaultEventsFilter || 'all',
                    maxEvents:          scope.config.MaxEventFrames || 200,
                    unitEventBindings:  scope.config.UnitEventBindings || {}
                }, 'unitEvents');
            }

            // afbuild — AF Build tab (Phase B2 — may not be loaded yet)
            _wAfBuild = _safeWidget('#mm20-afbuild', 'mm20AfBuild', {
                bus:      _bus,
                api:      _api,
                sites:    _sites,
                demoMode: _demoMode,
                serverPath:   scope.config.AfServerPath || '',
                databasePath: scope.config.AfDatabasePath || ''
            }, 'afbuild');
        };


        // ─────────────────────────────────────
        //  Bus: unit:settings → persist to config
        // ─────────────────────────────────────
        _bus.on('unit:settings', function (d) {
            if (d && d.unitKey && d.settings) {
                if (!scope.config.UnitSettings) scope.config.UnitSettings = {};
                scope.config.UnitSettings[d.unitKey] = d.settings;
                _log('info', '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05D9\u05D7\u05D9\u05D3\u05D4 \u05E0\u05E9\u05DE\u05E8\u05D5: ' + d.unitKey);
                try { scope.$apply(); } catch (ex) { /* safe */ }
            }
        });

        // ── Bus: tags:bindingChanged → persist user bindings to config ──
        // QA14-FIX: use d.roleKey (matches warehouse emit), save full binding object
        _bus.on('tags:bindingChanged', function (d) {
            if (d && d.objectId && d.roleKey && d.tagName) {
                if (!scope.config.UserTagBindings) scope.config.UserTagBindings = {};
                if (!scope.config.UserTagBindings[d.objectId]) scope.config.UserTagBindings[d.objectId] = {};
                scope.config.UserTagBindings[d.objectId][d.roleKey] = {
                    tagName:    d.tagName,
                    tagPath:    d.tagPath || '',
                    assignedBy: 'user',
                    assignedAt: new Date().toISOString(),
                    status:     'ok'
                };
                _log('info', '\u05E9\u05D9\u05D5\u05DA \u05EA\u05D2 \u05E0\u05E9\u05DE\u05E8: ' + d.objectId + '/' + d.roleKey + ' → ' + d.tagName);
                try { scope.$apply(); } catch (ex) { /* safe */ }
            }
        });

        _bus.on('tags:bindingRemoved', function (d) {
            if (d && d.objectId && d.roleKey) {
                if (scope.config.UserTagBindings && scope.config.UserTagBindings[d.objectId]) {
                    delete scope.config.UserTagBindings[d.objectId][d.roleKey];
                    _log('info', '\u05E9\u05D9\u05D5\u05DA \u05EA\u05D2 \u05D4\u05D5\u05E1\u05E8: ' + d.objectId + '/' + d.roleKey);
                    try { scope.$apply(); } catch (ex) { /* safe */ }
                }
            }
        });


        // ─────────────────────────────────────
        //  Bus: site:settings → persist to config
        // ─────────────────────────────────────
        _bus.on('site:settings', function (d) {
            if (d && d.siteId && d.settings) {
                if (!scope.config.SiteSettings) scope.config.SiteSettings = {};
                scope.config.SiteSettings[d.siteId] = d.settings;
                _log('info', '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05D0\u05EA\u05E8 \u05E0\u05E9\u05DE\u05E8\u05D5: ' + d.siteId);
                try { scope.$apply(); } catch (ex) { /* safe */ }
            }
        });


        // ─────────────────────────────────────
        //  QA13: Display Guard
        // ─────────────────────────────────────
        scope.guardCurrentUser = '';

        scope.isGuardLocked = function () {
            if (!scope.config.DisplayGuardEnabled) return false;
            if (!_currentUser) return true; // user not yet identified → locked
            var editors = (scope.config.AllowedEditors || '').split(',');
            for (var i = 0; i < editors.length; i++) {
                var editor = editors[i].replace(/^\s+|\s+$/g, '').toLowerCase();
                if (editor && _currentUser.toLowerCase() === editor) return false;
            }
            return true; // guard enabled but user not in list
        };

        // ─────────────────────────────────────
        //  QA15: Config panel helpers — UnitEventBindings editor
        // ─────────────────────────────────────
        scope.ueBindingSites = function () {
            return (scope.config.CustomSites && scope.config.CustomSites.length)
                   ? scope.config.CustomSites
                   : (MM ? MM.SITES : []);
        };

        /**
         * Ensure nested binding object exists for a site + unit index.
         * Returns the leaf { eventElementWebId, eventElementPath } reference
         * so ng-model can bind directly to it.
         */
        scope.ensureUeBinding = function (siteId, unitIdx) {
            if (!scope.config.UnitEventBindings) scope.config.UnitEventBindings = {};
            if (!scope.config.UnitEventBindings[siteId]) scope.config.UnitEventBindings[siteId] = {};
            var key = String(unitIdx);
            if (!scope.config.UnitEventBindings[siteId][key]) {
                scope.config.UnitEventBindings[siteId][key] = { eventElementWebId: '', eventElementPath: '' };
            }
            return scope.config.UnitEventBindings[siteId][key];
        };


        // ─────────────────────────────────────
        //  D1: Fullscreen Toggle
        // ─────────────────────────────────────
        scope.toggleFullscreen = function () {
            var doc = document;
            var elem = _rootEl;
            try {
                if (doc.fullscreenElement || doc.webkitFullscreenElement ||
                    doc.mozFullScreenElement || doc.msFullscreenElement) {
                    // Exit fullscreen
                    if (doc.exitFullscreen) doc.exitFullscreen();
                    else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
                    else if (doc.mozCancelFullScreen) doc.mozCancelFullScreen();
                    else if (doc.msExitFullscreen) doc.msExitFullscreen();
                } else {
                    // Enter fullscreen
                    if (elem.requestFullscreen) elem.requestFullscreen();
                    else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
                    else if (elem.mozRequestFullScreen) elem.mozRequestFullScreen();
                    else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
                }
            } catch (e) {
                _log('warn', '\u05DE\u05E1\u05DA \u05DE\u05DC\u05D0 \u05DC\u05D0 \u05E0\u05EA\u05DE\u05DA');
            }
        };

        // Listen for fullscreen change to update button icon
        var _onFsChange = function () {
            var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement ||
                          document.mozFullScreenElement || document.msFullscreenElement);
            _bus.emit('fullscreen:changed', { active: isFs });
        };
        document.addEventListener('fullscreenchange', _onFsChange);
        document.addEventListener('webkitfullscreenchange', _onFsChange);
        document.addEventListener('mozfullscreenchange', _onFsChange);
        document.addEventListener('MSFullscreenChange', _onFsChange);


        // ─────────────────────────────────────
        //  Tab Switching
        // ─────────────────────────────────────
        scope.switchTab = function (tab) {
            // Guard: don't switch to hidden tabs
            if (!scope.layoutIsTabVisible(tab)) return;
            scope.config.ActiveTab = tab;
            _bus.emit('tab:changed', { tab: tab });
        };

        // QA15-fix: Auto-switch to events tab when unit events button clicked
        var _onEventsTabSwitch = function () {
            if (_destroyed) return;
            scope.switchTab('events');
            try { scope.$apply(); } catch (ex) { /* safe */ }
        };
        _bus.on('unit:eventsRequested', _onEventsTabSwitch);


        // ─────────────────────────────────────
        //  Layout Template Helpers
        // ─────────────────────────────────────
        var _defaultTabOrder = ['realtime','heatmap','reports','alerts','log',
                                'tags','tagWarehouse','tagExplorer','events','afbuild'];

        scope.layoutTabOrder = function () {
            if (_layoutMgr) return _layoutMgr.getTabOrder();
            return _defaultTabOrder;
        };

        scope.layoutTabLabel = function (tabKey) {
            if (_layoutMgr) return _layoutMgr.getTabLabel(tabKey);
            return tabKey;
        };

        scope.layoutIsTabVisible = function (tabKey) {
            // Combine layout visibility with existing feature toggles
            if (_layoutMgr && !_layoutMgr.isTabVisible(tabKey)) return false;
            if (tabKey === 'tagWarehouse' && scope.config.EnableTagWarehouse === false) return false;
            if (tabKey === 'tagExplorer'  && scope.config.EnableTagExplorer  === false) return false;
            if (tabKey === 'events'       && scope.config.EnableUnitEvents   === false) return false;
            return true;
        };

        scope.layoutShowHeader = function () {
            if (_layoutMgr) return _layoutMgr.getLayout().showHeader !== false;
            return true;
        };

        scope.toggleLayoutEdit = function () {
            if (_layoutMgr) {
                _layoutMgr.toggleEditMode();
                try { scope.$apply(); } catch (ex) { /* safe */ }
            }
        };

        scope.layoutSave = function () {
            if (_layoutMgr) {
                _layoutMgr.save();
                _log('info', '\u05E4\u05E8\u05D9\u05E1\u05D4 \u05E0\u05E9\u05DE\u05E8\u05D4');
                try { scope.$apply(); } catch (ex) { /* safe */ }
            }
        };

        scope.layoutReset = function () {
            if (_layoutMgr) {
                _layoutMgr.reset();
                _log('info', '\u05E4\u05E8\u05D9\u05E1\u05D4 \u05D0\u05D5\u05E4\u05E1\u05D4');
                try { scope.$apply(); } catch (ex) { /* safe */ }
            }
        };

        // Trigger Angular digest when tab order changes via drag-reorder
        _bus.on('layout:tabsReordered', function () {
            try { scope.$apply(); } catch (ex) { /* safe */ }
        });

        // Initialize tab drag-reorder after Angular renders the template
        _timeouts.push($timeout(function () {
            if (_destroyed || !_layoutMgr) return;
            var tabBarEl = _rootEl.querySelector('.mm20-tab-bar');
            if (tabBarEl) _layoutMgr.initTabDragReorder(tabBarEl);
        }, 0));


        // ─────────────────────────────────────
        //  Keyboard Shortcuts
        // ─────────────────────────────────────
        var _onKeydown = function (e) {
            if (_destroyed) return;
            // Only handle when this symbol has focus (strict containment check)
            if (!el[0].contains(document.activeElement)) return;

            // Ctrl+K → global search
            if (e.ctrlKey && e.keyCode === 75) {
                e.preventDefault();
                _bus.emit('search:query', { open: true });
                return;
            }
            // Escape → close overlays
            if (e.keyCode === 27) {
                _bus.emit('search:query', { open: false });
                return;
            }
            // Number keys 1-9 → tab switch (uses dynamic layout order)
            if (!e.ctrlKey && !e.altKey && e.keyCode >= 49 && e.keyCode <= 57) {
                var tabs = scope.layoutTabOrder();
                var idx = e.keyCode - 49;
                if (tabs[idx] && scope.layoutIsTabVisible(tabs[idx])) {
                    scope.switchTab(tabs[idx]);
                    try { scope.$apply(); } catch (ex) { /* safe */ }
                }
            }
        };
        document.addEventListener('keydown', _onKeydown);


        // ─────────────────────────────────────
        //  Viewport Guard (IntersectionObserver)
        // ─────────────────────────────────────
        var _observer = null;
        var _isVisible = true;

        if (typeof IntersectionObserver !== 'undefined') {
            _observer = new IntersectionObserver(function (entries) {
                _isVisible = entries[0].isIntersecting;
                if (!_isVisible && _refreshHandle) {
                    $interval.cancel(_refreshHandle);
                    _refreshHandle = null;
                } else if (_isVisible && !_refreshHandle && scope.config.EnableAutoRefresh) {
                    _startRefresh();
                }
            }, { threshold: 0.1 });
            _observer.observe(el[0]);
        }


        // ─────────────────────────────────────
        //  Auto-Refresh Timer
        // ─────────────────────────────────────
        var _startRefresh = function () {
            if (_refreshHandle) $interval.cancel(_refreshHandle);
            var sec = (scope.config.RefreshInterval || 30) * 1000;
            _refreshHandle = $interval(function () {
                if (_demoMode && _wSiteGrid) {
                    var fakeData = MM.demo.generateSites(_sites);
                    _parsedData = fakeData;
                    _forwardData(fakeData);
                }
                // Real data comes from PI Vision's dataUpdate — no need to fetch here
            }, sec);
        };

        if (scope.config.EnableAutoRefresh !== false) {
            _startRefresh();
        }

        // Watch config changes for refresh interval
        _unwatchers.push(scope.$watch('config.RefreshInterval', function (nv) {
            if (nv && scope.config.EnableAutoRefresh) _startRefresh();
        }));
        _unwatchers.push(scope.$watch('config.EnableAutoRefresh', function (nv) {
            if (nv) { _startRefresh(); }
            else if (_refreshHandle) { $interval.cancel(_refreshHandle); _refreshHandle = null; }
        }));


        // ─────────────────────────────────────
        //  Forward parsed data to widgets
        // ─────────────────────────────────────
        var _forwardData = function (parsed) {
            if (_wSiteGrid && window.jQuery.fn.mm20SiteGrid) {
                try { _wSiteGrid.mm20SiteGrid('option', 'data', parsed); } catch (e) { MM.shield.log('orchestrator-int', 'forward:siteGrid', e); }
            }
            if (_wAlerts && window.jQuery.fn.mm20Alerts) {
                try { _wAlerts.mm20Alerts('option', 'data', parsed); } catch (e) { MM.shield.log('orchestrator-int', 'forward:alerts', e); }
            }
            if (_wHeatmap && window.jQuery.fn.mm20Heatmap) {
                try { _wHeatmap.mm20Heatmap('option', 'data', parsed); } catch (e) { MM.shield.log('orchestrator-int', 'forward:heatmap', e); }
            }
            if (_wReports && window.jQuery.fn.mm20Reports) {
                try { _wReports.mm20Reports('option', 'data', parsed); } catch (e) { MM.shield.log('orchestrator-int', 'forward:reports', e); }
            }
            if (_wTags && window.jQuery.fn.mm20Tags) {
                try { _wTags.mm20Tags('option', 'data', parsed); } catch (e) { MM.shield.log('orchestrator-int', 'forward:tags', e); }
            }
            if (_wTagWarehouse && window.jQuery.fn.mm20TagWarehouse) {
                try { _wTagWarehouse.mm20TagWarehouse('option', 'data', parsed); } catch (e) { MM.shield.log('orchestrator-int', 'forward:tagWarehouse', e); }
            }
            _bus.emit('data:updated', { sites: parsed, ts: new Date().toISOString() });
        };


        // ─────────────────────────────────────
        //  Config → Widget bridge
        // ─────────────────────────────────────
        var _syncConfig = function () {
            MM.applyTheme(_rootEl, scope.config);
            _bus.emit('config:changed', { config: scope.config });
        };

        _unwatchers.push(scope.$watchCollection('config', function () {
            if (!_destroyed) _syncConfig();
        }));


        // ─────────────────────────────────────
        //  Config Import / Export
        // ─────────────────────────────────────
        scope.exportConfig = function () {
            var json = JSON.stringify(scope.config, null, 2);
            var blob = new Blob([json], { type: 'application/json' });
            var url  = URL.createObjectURL(blob);
            var a    = document.createElement('a');
            a.href = url;
            a.download = 'mm20int-config-' + MM.formatDate(new Date(), 'date').replace(/\//g, '-') + '.json';
            a.click();
            setTimeout(function () { URL.revokeObjectURL(url); }, 100);
            _log('info', '\u05EA\u05E6\u05D5\u05E8\u05D4 \u05D9\u05D5\u05E6\u05D0\u05D4');
        };

        scope.importConfig = function (jsonStr) {
            try {
                var imported = JSON.parse(jsonStr);

                // E4: Validate imported config
                var warnings = [];

                // Check for unknown properties
                var defaults = def.getDefaultConfig();
                var unknownKeys = [];
                for (var iKey in imported) {
                    if (imported.hasOwnProperty(iKey) && !defaults.hasOwnProperty(iKey)) {
                        unknownKeys.push(iKey);
                    }
                }
                if (unknownKeys.length) {
                    warnings.push('\u05DE\u05E4\u05EA\u05D7\u05D5\u05EA \u05DC\u05D0 \u05DE\u05D5\u05DB\u05E8\u05D9\u05DD: ' + unknownKeys.join(', '));
                }

                // Ensure all default properties exist (fill missing with defaults)
                for (var dKey in defaults) {
                    if (defaults.hasOwnProperty(dKey) && imported[dKey] === undefined) {
                        imported[dKey] = defaults[dKey];
                    }
                }

                // Type safety: ensure critical properties have correct types
                if (typeof imported.WarnPct !== 'number') imported.WarnPct = defaults.WarnPct;
                if (typeof imported.CritPct !== 'number') imported.CritPct = defaults.CritPct;
                if (typeof imported.RefreshInterval !== 'number') imported.RefreshInterval = defaults.RefreshInterval;
                if (typeof imported.DemoMode !== 'boolean') imported.DemoMode = defaults.DemoMode;

                // Apply validated config
                for (var key in imported) {
                    if (imported.hasOwnProperty(key)) {
                        scope.config[key] = imported[key];
                    }
                }

                _sites = (scope.config.CustomSites && scope.config.CustomSites.length)
                         ? scope.config.CustomSites : MM.SITES;
                _syncConfig();

                if (warnings.length) {
                    _log('warn', '\u05EA\u05E6\u05D5\u05E8\u05D4 \u05D9\u05D5\u05D1\u05D0\u05D4 \u05E2\u05DD \u05D0\u05D6\u05D4\u05E8\u05D5\u05EA: ' + warnings.join(' | '));
                } else {
                    _log('info', '\u05EA\u05E6\u05D5\u05E8\u05D4 \u05D9\u05D5\u05D1\u05D0\u05D4 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4');
                }
            } catch (e) {
                _log('error', '\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D9\u05D9\u05D1\u05D5\u05D0 \u05EA\u05E6\u05D5\u05E8\u05D4: ' + e.message);
            }
        };

        /**
         * Import config from a File object (called by config panel file input).
         * Reads the file via FileReader and delegates to importConfig().
         */
        scope.importConfigFile = function (file) {
            if (!file) return;
            try {
                var reader = new FileReader();
                reader.onload = function (e) {
                    scope.importConfig(e.target.result);
                    try { scope.$apply(); } catch (ex) { /* safe */ }
                };
                reader.onerror = function () {
                    _log('error', '\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E7\u05E8\u05D9\u05D0\u05EA \u05E7\u05D5\u05D1\u05E5');
                };
                reader.readAsText(file);
            } catch (e) {
                _log('error', '\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D9\u05D9\u05D1\u05D5\u05D0 \u05E7\u05D5\u05D1\u05E5: ' + e.message);
            }
        };


        // ─────────────────────────────────────
        //  QA11: Display Time — PI Vision timeline sync
        // ─────────────────────────────────────
        var _lastDisplayStart = null;
        var _lastDisplayEnd   = null;
        var _displayTimeHandle = null;

        var _readDisplayRange = function () {
            try {
                var tp = scope.symbol && scope.symbol.TimeProvider;
                if (!tp || !tp.displayTime) return null;
                var dt = tp.displayTime;
                return { start: dt.start, end: dt.end };
            } catch (e) {
                return null;
            }
        };

        var _emitDisplayRange = function () {
            if (_destroyed) return;
            var range = _readDisplayRange();
            if (!range) return;
            var startStr = range.start ? String(range.start) : '';
            var endStr   = range.end ? String(range.end) : '';
            // Only emit if changed
            if (startStr !== _lastDisplayStart || endStr !== _lastDisplayEnd) {
                _lastDisplayStart = startStr;
                _lastDisplayEnd   = endStr;
                _bus.emit('time:rangeChanged', { start: range.start, end: range.end });
            }
        };

        // QA12: Write back to PI Vision's global timebar
        var _writeDisplayRange = function (start, end) {
            try {
                var tp = scope.symbol && scope.symbol.TimeProvider;
                if (!tp) return;
                // PI Vision 2017+ may expose setDisplayTime()
                if (typeof tp.setDisplayTime === 'function') {
                    tp.setDisplayTime(start, end);
                } else if (tp.displayTime) {
                    // Direct property set as fallback
                    tp.displayTime = { start: start, end: end };
                }
            } catch (e) {
                // Writeback not supported by this PI Vision version — silent fallback
            }
        };

        // QA12: Listen for date changes from Reports and push to PI timebar
        var _timeWritebackListener = function (range) {
            if (_destroyed) return;
            if (scope.config.SyncReportsWithDisplayTime === false) return;
            var startStr = range.start ? String(range.start) : '';
            var endStr   = range.end ? String(range.end) : '';
            // Only write back if values differ from what we last read
            // (prevents re-triggering from our own polling)
            if (startStr !== _lastDisplayStart || endStr !== _lastDisplayEnd) {
                _lastDisplayStart = startStr;
                _lastDisplayEnd   = endStr;
                _writeDisplayRange(range.start, range.end);
            }
        };
        _bus.on('time:rangeChanged', _timeWritebackListener);


        // ─────────────────────────────────────
        //  Startup sequence
        // ─────────────────────────────────────
        _initApi();

        // Delay widget creation slightly to allow script tags to load
        var _initTimeout = $timeout(function () {
            if (_destroyed) return;
            _initWidgets();
            // Flush buffered log entries now that log widget is subscribed
            _flushLogBuffer();
            // Seed demo data if in demo mode
            if (_demoMode) {
                var seed = MM.demo.generateSites(_sites);
                _parsedData = seed;
                _forwardData(seed);
            }
            // QA11: Seed initial display range for Reports
            if (scope.config.SyncReportsWithDisplayTime !== false) {
                _emitDisplayRange();
            }
            _log('info', 'Mugbalot Monitor v' + MM.VERSION + '-INT \u05D0\u05D5\u05EA\u05D7\u05DC');
        }, 200);
        _timeouts.push(_initTimeout);

        // QA11: Poll PI Vision's display time every 1.5s (no native event available)
        if (scope.config.SyncReportsWithDisplayTime !== false) {
            _displayTimeHandle = $interval(function () {
                _emitDisplayRange();
            }, 1500);
        }


        // ═══════════════════════════════════════
        //  DATA UPDATE  (called by PI Vision)
        // ═══════════════════════════════════════

        this.dataUpdate = MM.shield.wrap('orchestrator-int', 'dataUpdate', function (data) {
            if (_destroyed || !data) return;

            // Demo mode: ignore real data, use generated
            if (_demoMode) return;

            // Parse PI Vision data array into site/unit structure
            var parsed = _parseData(data);
            if (parsed) {
                _parsedData = parsed;
                _forwardData(parsed);
            }
        });

        /**
         * Parse PI Vision data.Data array into structured format.
         * Uses MM.AF.parsePath() for structured path extraction and
         * MM.AF.safeVal() for robust value handling (including nested
         * Value objects, digital states, NaN, null).
         *
         * Expected path format:
         *   \\AF\Server\Database\Plants\{SiteName}\{UnitName}|AttributeName
         *
         * @param {Object} data - PI Vision data object
         * @returns {Object|null} { siteId: { unitIdx: { hours, quota, pct, ... } } }
         */
        var _parseData = function (data) {
            if (!data || !data.Data) return null;

            var result = {};
            var dataArr = data.Data;
            var decimals = scope.config.Decimals || 1;

            for (var i = 0; i < dataArr.length; i++) {
                var item = dataArr[i];
                if (!item) continue;

                // Use structured AF path parser
                var pathStr = item.Path || item.Label || '';
                if (!pathStr) continue;

                var parsed = MM.AF.parsePath(pathStr);

                // Use safe value extraction (handles nested objects, digital states)
                var sv = MM.AF.safeVal(item, decimals);

                // Try to match path to site/unit
                var match = _matchPath(pathStr, parsed);
                if (!match) continue;

                if (!result[match.siteId]) result[match.siteId] = {};
                if (!result[match.siteId][match.unitIdx]) {
                    result[match.siteId][match.unitIdx] = {
                        hours: 0, quota: 0, pct: 0, status: 'ok', tte: 0,
                        ts: item.Time || item.Timestamp || new Date().toISOString(),
                        good: true,
                        monthly: [],
                        // Extended fields for API-enriched data
                        dailyHours: 0,
                        monthlyHours: 0,
                        temperature: 0,
                        power: 0,
                        efficiency: 0,
                        emissions: 0,
                        lastUpdate: ''
                    };
                }

                var unit = result[match.siteId][match.unitIdx];

                // Track quality
                unit.good = unit.good && sv.good;
                unit.ts = item.Time || item.Timestamp || unit.ts;

                // Map attribute name to field (structured matching)
                var attr = match.attr.toLowerCase();
                if (sv.isDigitalState) {
                    // Digital state attributes (status, last update message)
                    if (attr.indexOf('status') >= 0 || attr.indexOf('\u05DE\u05E6\u05D1') >= 0) {
                        unit.statusText = sv.display;
                    } else if (attr.indexOf('lastupdate') >= 0 || attr.indexOf('\u05E2\u05D3\u05DB\u05D5\u05DF') >= 0) {
                        unit.lastUpdate = sv.display;
                    }
                } else {
                    // Numeric attributes
                    var val = sv.numeric;
                    if (attr.indexOf('hour') >= 0 || attr.indexOf('\u05E9\u05E2') >= 0) {
                        unit.hours = val;
                    } else if (attr.indexOf('quot') >= 0 || attr.indexOf('\u05DE\u05DB\u05E1') >= 0) {
                        unit.quota = val;
                    } else if (attr.indexOf('pct') >= 0 || attr.indexOf('\u05D0\u05D7\u05D5\u05D6') >= 0) {
                        unit.pct = val;
                    } else if (attr.indexOf('daily') >= 0 || attr.indexOf('\u05D9\u05D5\u05DD') >= 0) {
                        unit.dailyHours = val;
                    } else if (attr.indexOf('monthly') >= 0 || attr.indexOf('\u05D7\u05D5\u05D3\u05E9') >= 0) {
                        unit.monthlyHours = val;
                    } else if (attr.indexOf('tte') >= 0 || attr.indexOf('\u05E6\u05E4\u05D9') >= 0) {
                        unit.tte = val;
                    } else if (attr.indexOf('temp') >= 0 || attr.indexOf('\u05D8\u05DE\u05E4') >= 0) {
                        unit.temperature = val;
                    } else if (attr.indexOf('power') >= 0 || attr.indexOf('\u05D4\u05E1\u05E4') >= 0) {
                        unit.power = val;
                    } else if (attr.indexOf('efficien') >= 0 || attr.indexOf('\u05E0\u05E6\u05D9\u05DC') >= 0) {
                        unit.efficiency = val;
                    } else if (attr.indexOf('emission') >= 0 || attr.indexOf('\u05E4\u05DC\u05D9\u05D8') >= 0) {
                        unit.emissions = val;
                    }
                }

                // Recalculate derived fields
                if (unit.quota > 0) {
                    // Only recalculate pct if not directly supplied
                    if (attr.indexOf('pct') < 0 && attr.indexOf('\u05D0\u05D7\u05D5\u05D6') < 0) {
                        unit.pct = Math.round((unit.hours / unit.quota) * 1000) / 10;
                    }
                    unit.status = MM.getStatus(unit.pct, scope.config.WarnPct, scope.config.CritPct);

                    // TTE: compute rate from previous dataUpdate snapshot
                    var unitKey = MM.unitKey(match.siteId, match.unitIdx);
                    var prev = _prevHours[unitKey];
                    var nowMs = new Date().getTime();
                    var rate = 0;
                    if (prev && prev.hours !== undefined) {
                        var dtMs = nowMs - prev.ts;
                        if (dtMs > 0) {
                            rate = MM.stats.rateOfChange(prev.hours, unit.hours, dtMs);
                        }
                    }
                    _prevHours[unitKey] = { hours: unit.hours, ts: nowMs };
                    unit.tte = (unit.tte > 0) ? unit.tte : MM.stats.forecast(unit.hours, rate, unit.quota);
                }
            }

            return result;
        };

        /**
         * Match an AF path to a site/unit.
         * Uses structured parsing (server/db/element/attribute) first,
         * falls back to fuzzy token matching for backward compatibility.
         *
         * @param {string} path - raw AF path string
         * @param {Object} [parsed] - pre-parsed via MM.AF.parsePath()
         * @returns {Object|null} { siteId, unitIdx, attr }
         */
        var _pathCache = {};
        var _matchPath = function (path, parsed) {
            if (_pathCache[path]) return _pathCache[path];

            // Use provided parsed or parse now
            if (!parsed) parsed = MM.AF.parsePath(path);
            var attrPart = parsed.attribute || '';

            // Strategy 1: Structured matching using parsed element hierarchy
            if (parsed.elements && parsed.elements.length > 0) {
                for (var s = 0; s < _sites.length; s++) {
                    var site = _sites[s];
                    // Check if any element matches site name or id
                    var siteMatch = false;
                    for (var e = 0; e < parsed.elements.length; e++) {
                        var elem = parsed.elements[e];
                        if (elem === site.name || elem === site.id ||
                            elem.indexOf(site.name) >= 0 || elem.indexOf(site.id) >= 0) {
                            siteMatch = true;
                            break;
                        }
                    }
                    if (!siteMatch) continue;

                    // Find unit — check remaining elements
                    for (var u = 0; u < site.units.length; u++) {
                        for (var e2 = 0; e2 < parsed.elements.length; e2++) {
                            if (parsed.elements[e2] === site.units[u] ||
                                parsed.elements[e2].indexOf(site.units[u]) >= 0) {
                                var m = { siteId: site.id, unitIdx: u, attr: attrPart };
                                _pathCache[path] = m;
                                return m;
                            }
                        }
                    }
                    // Site found but no specific unit match → unit 0
                    var fb = { siteId: site.id, unitIdx: 0, attr: attrPart };
                    _pathCache[path] = fb;
                    return fb;
                }
            }

            // Strategy 2: Fallback — fuzzy string matching (backward compatible)
            for (var s2 = 0; s2 < _sites.length; s2++) {
                var site2 = _sites[s2];
                if (path.indexOf(site2.name) >= 0 || path.indexOf(site2.id) >= 0) {
                    for (var u2 = 0; u2 < site2.units.length; u2++) {
                        if (path.indexOf(site2.units[u2]) >= 0) {
                            var m2 = { siteId: site2.id, unitIdx: u2, attr: attrPart };
                            _pathCache[path] = m2;
                            return m2;
                        }
                    }
                    var fb2 = { siteId: site2.id, unitIdx: 0, attr: attrPart };
                    _pathCache[path] = fb2;
                    return fb2;
                }
            }
            return null;
        };


        // ═══════════════════════════════════════
        //  RESIZE
        // ═══════════════════════════════════════

        this.onResize = function () {
            if (_destroyed) return;
            _bus.emit('resize', {});
        };


        // ═══════════════════════════════════════
        //  $DESTROY — Resource Cleanup
        // ═══════════════════════════════════════

        scope.$on('$destroy', function () {
            _destroyed = true;

            // Cancel API retry interval
            if (_apiRetryHandle) {
                $interval.cancel(_apiRetryHandle);
                _apiRetryHandle = null;
            }

            // Cancel refresh interval
            if (_refreshHandle) {
                $interval.cancel(_refreshHandle);
                _refreshHandle = null;
            }

            // QA11: Cancel display-time polling
            if (_displayTimeHandle) {
                $interval.cancel(_displayTimeHandle);
                _displayTimeHandle = null;
            }

            // QA12: Remove writeback listener
            if (_timeWritebackListener) {
                _bus.off('time:rangeChanged', _timeWritebackListener);
                _timeWritebackListener = null;
            }

            // QA15-fix: Remove events tab-switch listener
            if (_onEventsTabSwitch) {
                _bus.off('unit:eventsRequested', _onEventsTabSwitch);
            }

            // Cancel all $timeout handles
            for (var t = 0; t < _timeouts.length; t++) {
                try { $timeout.cancel(_timeouts[t]); } catch (e) { /* safe */ }
            }
            _timeouts.length = 0;

            // Deregister watchers
            for (var w = 0; w < _unwatchers.length; w++) {
                try { _unwatchers[w](); } catch (e) { /* safe */ }
            }
            _unwatchers.length = 0;

            // Abort pending XHRs
            for (var x = 0; x < _pendingXhrs.length; x++) {
                try { _pendingXhrs[x].abort(); } catch (e) { /* safe */ }
            }
            _pendingXhrs.length = 0;

            // Remove keyboard + fullscreen listeners
            document.removeEventListener('keydown', _onKeydown);
            document.removeEventListener('fullscreenchange', _onFsChange);
            document.removeEventListener('webkitfullscreenchange', _onFsChange);
            document.removeEventListener('mozfullscreenchange', _onFsChange);
            document.removeEventListener('MSFullscreenChange', _onFsChange);

            // Disconnect viewport observer
            if (_observer) {
                _observer.disconnect();
                _observer = null;
            }

            // Destroy jQuery widgets
            var $ = window.jQuery;
            if ($) {
                if (_wSiteGrid && $.fn.mm20SiteGrid) try { _wSiteGrid.mm20SiteGrid('destroy'); } catch (e) {}
                if (_wHeatmap  && $.fn.mm20Heatmap)  try { _wHeatmap.mm20Heatmap('destroy'); } catch (e) {}
                if (_wReports  && $.fn.mm20Reports)  try { _wReports.mm20Reports('destroy'); } catch (e) {}
                if (_wAlerts   && $.fn.mm20Alerts)   try { _wAlerts.mm20Alerts('destroy'); } catch (e) {}
                if (_wLog      && $.fn.mm20LogViewer) try { _wLog.mm20LogViewer('destroy'); } catch (e) {}
                if (_wTags     && $.fn.mm20Tags)     try { _wTags.mm20Tags('destroy'); } catch (e) {}
                if (_wTagWarehouse && $.fn.mm20TagWarehouse) try { _wTagWarehouse.mm20TagWarehouse('destroy'); } catch (e) {}
                if (_wTagExplorer  && $.fn.mm20TagExplorer)  try { _wTagExplorer.mm20TagExplorer('destroy'); } catch (e) {}
                if (_wAfBuild  && $.fn.mm20AfBuild)  try { _wAfBuild.mm20AfBuild('destroy'); } catch (e) {}
            }

            // Destroy layout manager
            if (_layoutMgr) {
                _layoutMgr.destroy();
                _layoutMgr = null;
            }

            // Log before bus reset (so log widget still receives it)
            _log('info', '\u05E1\u05D9\u05DE\u05D1\u05D5\u05DC \u05E0\u05D4\u05E8\u05E1 \u2014 \u05E0\u05D9\u05E7\u05D5\u05D9 \u05DE\u05E9\u05D0\u05D1\u05D9\u05DD');

            // Clean up API reference
            _api = null;
            _apiReady = false;

            // Reset bus (drop all subscriptions)
            _bus.reset();
        });

        } // end _continueInit


        // ── Bootstrap Loader ──────────────────────────────────
        // Loads mm20-core.js + plugins + CSS exactly once,
        // then calls _continueInit(MM).
        function _bootstrapAndStart() {
            function afterCore(err) {
                var MM;
                if (err) {
                    _renderBootstrapError(err.message || 'mm20-core.js \u05DC\u05D0 \u05E0\u05D8\u05E2\u05DF');
                    return;
                }

                MM = window.MM20;
                if (!MM) {
                    _renderBootstrapError('window.MM20 \u05DC\u05D0 \u05D6\u05DE\u05D9\u05DF \u05D0\u05D7\u05E8\u05D9 \u05D8\u05E2\u05D9\u05E0\u05EA core');
                    return;
                }

                MM.basePath = MM.basePath || _extBase;
                MM.ensureStyle(MM.resolveUrl('sym-mugmoni20.css'));
                MM.ensureStyle(MM.resolveUrl('mm20-plugins/mm20-unitEvents.css'));

                MM.loadScripts([
                    MM.resolveUrl('mm20-plugins/mm20-layoutManager.js'),
                    MM.resolveUrl('mm20-plugins/mm20-siteGrid.js'),
                    MM.resolveUrl('mm20-plugins/mm20-heatmap.js'),
                    MM.resolveUrl('mm20-plugins/mm20-reports.js'),
                    MM.resolveUrl('mm20-plugins/mm20-alerts.js'),
                    MM.resolveUrl('mm20-plugins/mm20-log.js'),
                    MM.resolveUrl('mm20-plugins/mm20-tags.js'),
                    MM.resolveUrl('mm20-plugins/mm20-tagAnalysis.js'),
                    MM.resolveUrl('mm20-plugins/mm20-tagWarehouse.js'),
                    MM.resolveUrl('mm20-plugins/mm20-tagExplorer.js'),
                    MM.resolveUrl('mm20-plugins/mm20-unitEvents.js'),
                    MM.resolveUrl('mm20-plugins/mm20-afbuild.js')
                ], function (loadErr) {
                    if (loadErr) {
                        _renderBootstrapError(loadErr.message || '\u05D8\u05E2\u05D9\u05E0\u05EA mm20-plugins \u05E0\u05DB\u05E9\u05DC\u05D4');
                        return;
                    }
                    _continueInit(window.MM20);
                });
            }

            // If core already loaded (e.g. another instance ran first), skip re-load
            if (window.MM20 && window.MM20._loaded) {
                afterCore(null);
                return;
            }

            // First instance — load core
            var s = document.createElement('script');
            s.type = 'text/javascript';
            s.async = true;
            s.src = _extBase + 'mm20-plugins/mm20-core.js';
            s.onload = function () { afterCore(null); };
            s.onerror = function () { afterCore(new Error('mm20-core.js \u05DC\u05D0 \u05E0\u05D8\u05E2\u05DF')); };
            (document.head || document.documentElement).appendChild(s);
        }

        _bootstrapAndStart();
    };


    // ═══════════════════════════════════════
    //  REGISTRATION
    // ═══════════════════════════════════════

    // ── Dynamic iconUrl ──
    var _symBase = (function () {
        var scripts = document.getElementsByTagName('script');
        var i, src;
        for (i = scripts.length - 1; i >= 0; i--) {
            src = scripts[i].getAttribute('src') || '';
            if (src.indexOf('sym-mugmoni20.js') >= 0) {
                return src.substring(0, src.lastIndexOf('/') + 1);
            }
        }
        return '/Scripts/app/editor/symbols/ext/';
    })();

    var def = {
        typeName: 'mugmoni20',
        displayName: '\u05E0\u05D9\u05D8\u05D5\u05E8 \u05DE\u05D5\u05D2\u05D1\u05DC\u05D5\u05EA v20-INT \u2014 \u05E9\u05E2\u05D5\u05EA \u05E2\u05D1\u05D5\u05D3\u05D4',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: _symBase + 'icons/mugmoni20.png',
        supportsCollections: true,
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'Table', Columns: ['Value'], Height: 800, Width: 1400,
                DataUpdateInterval: 30000,
                // General
                Title: '\u05E0\u05D9\u05D8\u05D5\u05E8 \u05E9\u05E2\u05D5\u05EA \u05E2\u05D1\u05D5\u05D3\u05D4 \u2014 \u05D9\u05D7\u05D9\u05D3\u05D5\u05EA \u05D9\u05D9\u05E6\u05D5\u05E8',
                Subtitle: '',
                LogoUrl: '',
                Decimals: 1,
                UseThousandsSep: true,
                // Footer
                FooterText: '\u05E0\u05D5\u05D2\u05D4 \u2014 \u05DE\u05E0\u05D4\u05DC \u05DE\u05E2\u05E8\u05DB\u05EA \u05D4\u05D7\u05E9\u05DE\u05DC | MM20-INT v20.0.R1',
                ShowFooter: true,
                // Quota
                ShowQuota: true, WarnPct: 70, CritPct: 90, HighlightOverQuota: true,
                // Layout
                AutoCollapse: true,
                ActiveTab: 'realtime',
                // Font
                fontFamily: 'Segoe UI', fontSize: 12, headerFontSize: 16,
                fontBold: false, fontItalic: false,
                // Reports
                ReportTemplate: 'monthly', ReportGrouping: 'site',
                ReportDateStart: '', ReportDateEnd: '',
                ReportAutoRefresh: true,
                SyncReportsWithDisplayTime: true,
                SyncReportsSelection: true,
                SavedTemplates: [],
                // Alerts
                AlertQuotaPct: 90, AlertHoursMax: 1000, AlertStaleSec: 300,
                AlertSoundEnabled: false,
                // Per-unit overrides
                UnitSettings: {},
                // AF / PI Web API
                AFBasePath: '',
                AfServerPath: '',
                AfDatabasePath: '',
                PIWebAPIBase: '/Piwebapi',   // matches IIS virtual dir (capital P)
                StaleThreshold: 300,
                // Tags
                TagStaleSeconds: 300,
                TagColumns: 'all',
                // TTE
                TTEEnabled: true, TTEHorizonDays: 30,
                // Sensitivity
                SensitivityEnabled: true,
                // Exception mode
                ExceptionMode: false,
                // Auto-refresh
                RefreshInterval: 30,
                EnableAutoRefresh: true,
                // System logging
                EnableSystemLog: true,
                MaxLogEntries: 500,
                // Demo mode
                DemoMode: false,
                // Custom sites
                CustomSites: [],
                SiteSettings: {},
                TrendBaseUrl: '',
                // Theme colors
                gradientStart: '#060C18',
                gradientEnd: '#0D1F35',
                cardBg: '#0F2940',
                accentColor: '#5BC0EB',
                okColor: '#2ECC71',
                warnColor: '#F39C12',
                critColor: '#E74C3C',
                // Limits
                limitHoursDaily: 0,
                limitHoursMonthly: 0,
                // Sort
                SortOrder: 'name',
                // R50: Favorites
                Favorites: {},
                FavoritesEnabled: true,
                // R51: Global search
                ShowGlobalSearch: false,
                // R52: Sparklines
                ShowSparklines: true,
                SparklinesEnabled: true,
                // R53: Annotations
                Annotations: {},
                // R54: Heatmap
                HeatmapSite: '',
                HeatmapMetric: 'hours',
                // R55: Push notifications
                PushNotificationsEnabled: false,
                // Tag Warehouse & Explorer governance
                DefaultTagBindings: {},
                UserTagBindings: {},
                EnableTagWarehouse: true,
                EnableTagExplorer: true,
                AllowUserTagRebinding: true,
                DefaultExplorerChart: 'trend',
                MaxExplorerTags: 8,
                ExplorerState: {},
                // QA13: Display Guard
                DisplayGuardEnabled: false,
                AllowedEditors: '',
                // QA15: Unit Events (Event Frames from AF)
                EnableUnitEvents: true,
                UseDisplayTimeForEvents: true,
                ShowOnlyOpenEvents: false,
                DefaultEventsFilter: 'all',
                MaxEventFrames: 200,
                UnitEventBindings: {},
                // Layout System (dynamic tab order, visibility, labels, header toggle)
                Layout: null    // null = LayoutManager applies defaults internally
            };
        },
        configTitle: '\u05E0\u05D9\u05D8\u05D5\u05E8 \u05DE\u05D5\u05D2\u05D1\u05DC\u05D5\u05EA v20-INT',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; },
        // [FIX-JS-1] CRITICAL — inject array required for $interval/$timeout DI
        inject: ['$interval', '$timeout']
    };

    PV.symbolCatalog.register(def);

})(window.PIVisualization);
