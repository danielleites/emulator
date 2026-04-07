/**
 * ================================================================
 *  sym-mugult20.js  --  Ultimate Mugbalot Monitor Orchestrator
 * ================================================================
 *  Combines WOW wrapper pattern (Shadow DOM + Web Worker) with
 *  MM20 orchestrator pattern (event bus + plugin mounting + tabs).
 *
 *  Version : ULT.1.6
 *
 *  QA Fixes applied (v1.1):
 *    #2  PI Vision lifecycle: vis.onDataUpdate / vis.onResize
 *    #3  Data contract: sites (defs) + data (parsed) to Worker
 *    #5  Canonical payload for all plugins
 *    #8  Config values wired to shell (title/subtitle/footer)
 *    #9  O(1) unit lookup replacing nested scan
 *    #10 Keyboard listener scoped to shell (not document)
 *
 *  QA Fixes applied (v1.2):
 *    - Canonical payload propagated to ALL plugin update() methods
 *    - Bus data:updated handlers normalized in alerts/tags/reports/dispatch
 *    - Config flattened into plugin opts (no more opts.config nesting)
 *    - dispatch unitSettings uses MU.unitKey()
 *    - ActiveTab config wired (was hardcoded 'realtime')
 *
 *  ES5 only -- no arrow functions, no const/let, no template literals
 *  Inject  : $interval, $timeout
 * ================================================================
 */
(function (PV) {
    'use strict';

    // ── Symbol constructor ──
    function symbolVis() {}
    PV.deriveVisualizationFromBase(symbolVis);

    var DEBOUNCE_MS = 100;

    // ── Resolve script base path ──
    // QA17-FIX2: Prefer template-set __MU20_BASE, fallback to script tag scan
    var SCRIPT_BASE = window.__MU20_BASE || '';
    if (!SCRIPT_BASE) {
        var scripts = document.querySelectorAll('script[src*="mu20-core"]');
        if (scripts.length > 0) {
            var src = scripts[scripts.length - 1].getAttribute('src');
            var pluginDir = src.substring(0, src.lastIndexOf('/') + 1);
            SCRIPT_BASE = pluginDir.replace(/mu20-plugins\/$/, '');
        }
    }
    // Last resort: auto-detect from PI Vision URL
    if (!SCRIPT_BASE) {
        var _m = window.location.pathname.match(/^(\/[^\/]+)\//);
        SCRIPT_BASE = (_m ? _m[1] : '/PIVision') + '/Scripts/app/editor/symbols/ext/sym-mugult20/';
    }

    // ── Tab definitions (12 tabs: 9 original + tagWarehouse + tagExplorer + eventframes) ──
    var TABS = [
        { id: 'realtime',     label: '\u05DE\u05E6\u05D1 \u05D7\u05D9',     icon: '\u26A1'           },
        { id: 'heatmap',      label: '\u05DE\u05E4\u05EA \u05D7\u05D5\u05DD', icon: '\uD83C\uDF21'    },
        { id: 'reports',      label: '\u05D3\u05D5\u05D7\u05D5\u05EA',       icon: '\uD83D\uDCCA'    },
        { id: 'alerts',       label: '\u05D4\u05EA\u05E8\u05D0\u05D5\u05EA', icon: '\uD83D\uDD14'    },
        { id: 'log',          label: '\u05D9\u05D5\u05DE\u05DF',             icon: '\uD83D\uDCDD'    },
        { id: 'tags',         label: '\u05EA\u05D2\u05D9\u05DD',             icon: '\uD83C\uDFF7'    },
        { id: 'tagWarehouse', label: '\u05DE\u05D7\u05E1\u05DF \u05EA\u05D2\u05D9\u05DD', icon: '\uD83D\uDCE6' },
        { id: 'tagExplorer',  label: '\u05D7\u05D5\u05E7\u05E8 \u05EA\u05D2\u05D9\u05DD', icon: '\uD83D\uDD2C' },
        { id: 'afbuild',      label: 'AF',                                    icon: '\uD83D\uDD27'    },
        { id: 'forecast',     label: '\u05EA\u05D7\u05D6\u05D9\u05EA',       icon: '\uD83D\uDCC8'    },
        { id: 'dispatch',     label: '\u05E9\u05D9\u05D2\u05D5\u05E8',       icon: '\uD83C\uDFAF'    },
        { id: 'eventframes', label: '\u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD', icon: '\u23F1'           }
    ];


    // ═══════════════════════════════════════
    //  INIT
    // ═══════════════════════════════════════

    symbolVis.prototype.init = function (scope, elem, $interval, $timeout) {
        var self = this;

        // ── 1. Guard check ──────────────────────────────────
        var MU = window.MU20;
        if (!MU) {
            console.error('[MU20] mu20-core.js not loaded');
            var errRoot = elem[0].querySelector('.mu20-root') || elem[0];
            errRoot.innerHTML =
                '<div dir="rtl" style="display:flex;align-items:center;justify-content:center;' +
                'height:100%;color:#F39C12;text-align:center;padding:20px;font-family:Segoe UI,Arial,sans-serif;">' +
                '<div><div style="font-size:32px;margin-bottom:8px;">\u26A0</div>' +
                '<div style="font-size:14px;font-weight:600;">\u05EA\u05E9\u05EA\u05D9\u05EA MU20 \u05DC\u05D0 \u05E0\u05D8\u05E2\u05E0\u05D4</div>' +
                '<div style="font-size:11px;color:#8899AA;margin-top:4px;">' +
                '\u05D5\u05D3\u05D0 \u05E9\u05D4\u05E7\u05D1\u05E6\u05D9\u05DD \u05E7\u05D9\u05D9\u05DE\u05D9\u05DD \u05D1\u05EA\u05D9\u05E7\u05D9\u05D9\u05EA ext.</div>' +
                '</div></div>';
            return;
        }

        // ── 2. Validate & map config ─────────────────────────
        scope.config = MU.config.validate(scope.config);
        // FIX #7: Map editor config names to runtime names
        MU.config.mapEditor(scope.config);
        var cfg = scope.config;

        // ── Site definitions ──
        var siteDefs = (cfg.CustomSites && cfg.CustomSites.length)
                     ? cfg.CustomSites
                     : MU.SITES;

        // ── 3. Create Event Bus ─────────────────────────────
        var bus = MU.createBus();

        // ── 4. Create Shadow DOM ────────────────────────────
        var rootEl = elem[0].querySelector('.mu20-root') || elem[0];
        var shadow;
        try {
            shadow = rootEl.attachShadow({ mode: 'open' });
        } catch (e) {
            shadow = rootEl;
        }

        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = SCRIPT_BASE + 'sym-mugult20.css';
        shadow.appendChild(link);

        // ── 5. Build DOM Shell ──────────────────────────────
        var shell = document.createElement('div');
        shell.className = 'mu20-shell';
        shell.setAttribute('dir', 'rtl');
        // FIX #10: tabIndex allows keyboard events to be scoped to shell
        shell.setAttribute('tabindex', '0');
        shell.style.outline = 'none';

        // -- Header --
        var header = document.createElement('div');
        header.className = 'mu20-header';

        var titleEl = document.createElement('div');
        titleEl.className = 'mu20-header__title';
        // FIX #8: use config Title
        titleEl.textContent = cfg.Title || '\u05DE\u05D5\u05E0\u05D9\u05D8\u05D5\u05E8 \u05DE\u05D5\u05D2\u05D1\u05DC\u05D5\u05EA';

        // FIX #8: subtitle element
        var subtitleEl = document.createElement('div');
        subtitleEl.className = 'mu20-header__subtitle';
        subtitleEl.textContent = cfg.Subtitle || '';
        if (!cfg.Subtitle) subtitleEl.style.display = 'none';

        var clockEl = document.createElement('div');
        clockEl.className = 'mu20-clock';

        var connDot = document.createElement('div');
        connDot.className = 'mu20-conn-dot mu20-conn-dot--offline';
        connDot.title = '\u05DC\u05D0 \u05DE\u05D7\u05D5\u05D1\u05E8';

        var demoBadge = document.createElement('div');
        demoBadge.className = 'mu20-demo-badge';
        demoBadge.textContent = 'DEMO';
        demoBadge.style.display = cfg.DemoMode ? 'inline-block' : 'none';

        var fsBtn = document.createElement('button');
        fsBtn.className = 'mu20-fullscreen-btn';
        fsBtn.title = 'Fullscreen';
        fsBtn.textContent = '\u26F6';
        fsBtn.addEventListener('click', function () {
            try {
                if (!document.fullscreenElement) {
                    void 0;
                } else {
                    document.exitFullscreen();
                }
            } catch (ignore) {}
        });

        var logoEl = document.createElement('img');
        logoEl.className = 'mu20-header__logo';
        logoEl.style.display = cfg.LogoUrl ? 'inline-block' : 'none';
        if (cfg.LogoUrl) logoEl.src = cfg.LogoUrl;
        logoEl.onerror = function () { logoEl.style.display = 'none'; };

        header.appendChild(logoEl);
        header.appendChild(titleEl);
        header.appendChild(subtitleEl);
        header.appendChild(demoBadge);
        header.appendChild(clockEl);
        header.appendChild(connDot);
        header.appendChild(fsBtn);

        // ── Layout Manager ──
        var _layoutMgr = null;
        if (window.Mu20Layout) {
            _layoutMgr = new window.Mu20Layout(TABS, cfg.Layout || null, bus, function (layout) {
                scope.config.Layout = layout;
            });
        }

        // -- Tab bar --
        var tabBar = document.createElement('div');
        tabBar.className = 'mu20-tab-bar';

        var _tabMap = {};
        for (var tm = 0; tm < TABS.length; tm++) { _tabMap[TABS[tm].id] = TABS[tm]; }

        function _buildTabBar() {
            while (tabBar.firstChild) tabBar.removeChild(tabBar.firstChild);
            var order = _layoutMgr ? _layoutMgr.getTabOrder() : TABS.map(function (t) { return t.id; });
            for (var t = 0; t < order.length; t++) {
                var tabDef = _tabMap[order[t]];
                if (!tabDef) continue;
                if (_layoutMgr && !_layoutMgr.isTabVisible(order[t])) continue;
                var tabBtn = document.createElement('button');
                tabBtn.className = 'mu20-tab' + (order[t] === _activeTab ? ' mu20-tab--active' : '');
                tabBtn.setAttribute('data-tab', order[t]);
                if (_layoutMgr && _layoutMgr.isEditMode()) {
                    tabBtn.setAttribute('draggable', 'true');
                }
                var iconSpan = document.createElement('span');
                iconSpan.className = 'mu20-tab__icon';
                iconSpan.textContent = tabDef.icon;
                var labelSpan = document.createElement('span');
                labelSpan.className = 'mu20-tab__label';
                labelSpan.textContent = _layoutMgr ? _layoutMgr.getTabLabel(order[t]) : tabDef.label;
                tabBtn.appendChild(iconSpan);
                tabBtn.appendChild(labelSpan);
                (function (tabId) {
                    tabBtn.addEventListener('click', function () { _switchTab(tabId); });
                })(order[t]);
                tabBar.appendChild(tabBtn);
            }
        }
        _buildTabBar();

        // Rebuild tab bar when layout changes
        var _onTabsReordered = function () { _buildTabBar(); };
        var _onEditModeChanged = function () { _buildTabBar(); };
        bus.on('layout:tabsReordered', _onTabsReordered);
        bus.on('layout:editModeChanged', _onEditModeChanged);

        // -- Tab content containers --
        var contentArea = document.createElement('div');
        contentArea.className = 'mu20-content';

        for (var c = 0; c < TABS.length; c++) {
            var panel = document.createElement('div');
            panel.className = 'mu20-tab-content';
            panel.setAttribute('data-tab', TABS[c].id);
            panel.style.display = c === 0 ? 'block' : 'none';
            contentArea.appendChild(panel);
        }

        // -- Footer --  FIX #8: footer wired to config
        var footer = document.createElement('div');
        footer.className = 'mu20-footer';
        footer.style.display = cfg.ShowFooter !== false ? 'flex' : 'none';

        var footerText = document.createElement('span');
        footerText.className = 'mu20-footer__text';
        footerText.textContent = cfg.FooterText || '';

        var footerVersion = document.createElement('span');
        footerVersion.className = 'mu20-footer__version';
        footerVersion.textContent = 'MU20 v' + (MU.VERSION || 'ULT.1.6');

        footer.appendChild(footerText);
        footer.appendChild(footerVersion);

        // -- Assemble shell --
        shell.appendChild(header);
        shell.appendChild(tabBar);
        shell.appendChild(contentArea);
        shell.appendChild(footer);
        shadow.appendChild(shell);

        // ── Global Search Overlay ──
        var searchOverlay = document.createElement('div');
        searchOverlay.className = 'mu20-search-overlay';
        searchOverlay.style.display = 'none';

        var searchInput = document.createElement('input');
        searchInput.className = 'mu20-search-input';
        searchInput.setAttribute('type', 'text');
        searchInput.setAttribute('placeholder', '\u05D7\u05D9\u05E4\u05D5\u05E9...');
        searchInput.setAttribute('dir', 'rtl');

        var searchResults = document.createElement('div');
        searchResults.className = 'mu20-search-results';

        searchOverlay.appendChild(searchInput);
        searchOverlay.appendChild(searchResults);
        shell.appendChild(searchOverlay);

        var _searchDebounce = null;

        function _searchFilter(query) {
            while (searchResults.firstChild) searchResults.removeChild(searchResults.firstChild);
            if (!query || query.length < 1) return;
            var q = query.toLowerCase();
            var results = [];

            for (var s = 0; s < siteDefs.length; s++) {
                var site = siteDefs[s];
                if (site.name.toLowerCase().indexOf(q) >= 0) {
                    results.push({ type: 'site', label: '\uD83D\uDCCD ' + site.name, siteId: site.id, unitIdx: 0 });
                }
                for (var u = 0; u < site.units.length; u++) {
                    var unitLabel = site.name + ' \u2014 ' + site.units[u];
                    if (unitLabel.toLowerCase().indexOf(q) >= 0) {
                        results.push({ type: 'unit', label: '\uD83D\uDCCD ' + unitLabel, siteId: site.id, unitIdx: u });
                    }
                }
            }

            for (var t = 0; t < TABS.length; t++) {
                if (_layoutMgr && !_layoutMgr.isTabVisible(TABS[t].id)) continue;
                if (TABS[t].label.toLowerCase().indexOf(q) >= 0) {
                    results.push({ type: 'tab', label: '\uD83D\uDCD1 ' + TABS[t].label, tabId: TABS[t].id });
                }
            }

            for (var r = 0; r < Math.min(results.length, 10); r++) {
                var item = document.createElement('div');
                item.className = 'mu20-search-item';
                item.textContent = results[r].label;
                (function (res) {
                    item.addEventListener('click', function () {
                        searchOverlay.style.display = 'none';
                        searchInput.value = '';
                        if (res.type === 'tab') {
                            _switchTab(res.tabId);
                        } else {
                            _switchTab('realtime');
                            setTimeout(function () {
                                bus.emit('search:highlight', { siteId: res.siteId, unitIdx: res.unitIdx });
                            }, 100);
                        }
                    });
                })(results[r]);
                searchResults.appendChild(item);
            }
        }

        searchInput.addEventListener('input', function () {
            if (_searchDebounce) clearTimeout(_searchDebounce);
            _searchDebounce = setTimeout(function () {
                _searchFilter(searchInput.value.replace(/^\s+|\s+$/g, ''));
            }, 150);
        });

        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                searchOverlay.style.display = 'none';
                searchInput.value = '';
                shell.focus();
            }
        });

        searchOverlay.addEventListener('click', function (e) {
            if (e.target === searchOverlay) {
                searchOverlay.style.display = 'none';
                searchInput.value = '';
            }
        });

        bus.on('search:query', function (info) {
            if (info.open) {
                searchOverlay.style.display = 'flex';
                searchInput.value = '';
                while (searchResults.firstChild) searchResults.removeChild(searchResults.firstChild);
                setTimeout(function () { searchInput.focus(); }, 50);
            } else {
                searchOverlay.style.display = 'none';
                searchInput.value = '';
            }
        });


        // ── 6. Boot Web Worker ──────────────────────────────
        var worker = null;
        try {
            worker = new Worker(SCRIPT_BASE + 'mu20-plugins/mu20-data-worker.js');
        } catch (e) {
            MU.shield.log('orchestrator', 'Worker', e);
        }

        // FIX #5: Canonical payload — single shape for all plugins
        var _lastPayload = null;

        if (worker) {
            worker.onmessage = function (e) {
                var msg = e.data;
                if (!msg || !msg.type) return;

                switch (msg.type) {
                    case 'RENDER_STATE':
                        // FIX #5: Build canonical payload
                        _lastPayload = {
                            rawSites:    _parsedSites,
                            renderState: msg.payload,
                            siteDefs:    siteDefs,
                            ts:          new Date().toISOString()
                        };
                        if (_plugins.realtime) _plugins.realtime.update(_lastPayload);
                        bus.emit('data:updated', _lastPayload);
                        break;

                    case 'SPARKLINE':
                        if (_plugins.realtime) _plugins.realtime.updateSparkline(msg.payload);
                        break;

                    // SENSITIVITY removed — grid computes internally via _updateSensitivity()

                    case 'RATE':
                        bus.emit('rate:updated', msg.payload);
                        break;

                    case 'ALERT_RESULTS':
                        bus.emit('alert:results', msg.payload);
                        break;

                    case 'ANOMALY_RESULT':
                        bus.emit('anomaly:detected', msg.payload);
                        break;

                    case 'FORECAST_RESULT':
                        bus.emit('forecast:updated', msg.payload);
                        break;

                    case 'MONTHLY_RESULT':
                        bus.emit('monthly:updated', msg.payload);
                        break;

                    case 'EVENT_FRAME_STATS':
                        bus.emit('eventframes:stats', msg.payload);
                        break;

                    case 'ERROR':
                        MU.shield.log('worker', (msg.payload && msg.payload.source) || 'unknown',
                            new Error(msg.payload && msg.payload.message));
                        bus.emit('log:entry', {
                            level: 'error',
                            source: 'Worker',
                            msg: msg.payload && msg.payload.message,
                            ts: new Date().toISOString()
                        });
                        break;
                }
            };

            worker.onerror = function (e) {
                MU.shield.log('orchestrator', 'Worker.onerror', e);
            };

            // Send initial config
            worker.postMessage({ type: 'CONFIG', payload: {
                warnPct: cfg.WarnThreshold,
                critPct: cfg.CritThreshold,
                decimals: cfg.Decimals
            }});
        }


        // ── 7. Plugin Mounting ──────────────────────────────
        var _plugins = {};
        var _pluginClasses = {
            realtime: window.Mu20SiteGrid,
            heatmap:  window.Mu20Heatmap,
            reports:  window.Mu20Reports,
            alerts:   window.Mu20Alerts,
            log:      window.Mu20Log,
            tags:         window.Mu20Tags,
            tagWarehouse: window.Mu20TagWarehouse,
            tagExplorer:  window.Mu20TagExplorer,
            afbuild:  window.Mu20AfBuild,
            forecast: window.Mu20Forecast,
            dispatch:    window.Mu20Dispatch,
            eventframes: window.Mu20EventFrames
        };

        var _activeTab = 'realtime';

        function _ensurePlugin(tabId) {
            if (_plugins[tabId]) return _plugins[tabId];
            var Cls = _pluginClasses[tabId];
            if (!Cls) return null;
            var container = shadow.querySelector('.mu20-tab-content[data-tab="' + tabId + '"]');
            if (!container) return null;

            // Flatten config into plugin options so plugins can read
            // opts.decimals, opts.warnPct, etc. directly
            var opts = {
                sites:          siteDefs,
                worker:         worker,
                api:            _api,
                scriptBase:     SCRIPT_BASE,
                demoMode:       cfg.DemoMode || false,
                // Grid options (match siteGrid defaults)
                decimals:       cfg.Decimals || 1,
                warnPct:        cfg.WarnThreshold || 70,
                critPct:        cfg.CritThreshold || 90,
                sortOrder:      cfg.SortOrder || 'name',
                showSparklines: cfg.ShowSparklines !== false,
                showTte:        cfg.TTEEnabled !== false,
                showQuota:      cfg.ShowQuota !== false,
                showTteCountdown: cfg.ShowTTECountdown !== false,
                highlightOverQuota: cfg.HighlightOverQuota !== false,
                useThousandsSep: cfg.UseThousandsSep !== false,
                favoritesEnabled: cfg.FavoritesEnabled || false,
                trendBaseUrl:   cfg.TrendBaseUrl || '',
                unitSettings:   cfg.UnitSettings || {},
                siteSettings:   cfg.SiteSettings || {},
                annotations:    cfg.Annotations || {},
                // Alerts options (match DEFAULTS: AlertQuotaPct, AlertHoursMax, etc.)
                quotaPct:       cfg.AlertQuotaPct || 90,
                hoursMax:       cfg.AlertHoursMax || 0,
                staleSec:       cfg.AlertStaleSec || 300,
                dailyRate:      cfg.limitHoursDaily || 0,
                monthlyLimit:   cfg.limitHoursMonthly || 0,
                soundEnabled:   cfg.AlertSoundEnabled || false,
                pushEnabled:    cfg.PushNotificationsEnabled || false,
                // Reports options
                template:       cfg.ReportTemplate || 'daily',
                grouping:       cfg.ReportGrouping || 'site',
                syncWithDisplayTime: cfg.SyncReportsWithDisplayTime !== false,
                // Reports: Saved Templates
                savedTemplates:    cfg.SavedTemplates || [],
                onSaveTemplates:   function (templates) {
                    scope.config.SavedTemplates = templates;
                },
                // Heatmap options (match DEFAULTS: HeatmapMetric default 'pct')
                metric:         cfg.HeatmapMetric || 'pct',
                siteFilter:     cfg.HeatmapSite || '',
                // Dispatch options
                dispatchMinMW:       cfg.DispatchMinMW || 0,
                dispatchMWCap:       cfg.DispatchMWCap || 600,
                dispatchExcludeFltMnt: cfg.DispatchExcludeFltMnt !== false,
                // Forecast options
                forecastCritDays:  cfg.ForecastCritDays || 30,
                forecastWarnDays:  cfg.ForecastWarnDays || 90,
                anomalyEnabled:    cfg.AnomalyEnabled !== false,
                anomalyCritRatio:  cfg.AnomalyCritRatio || 1.6,
                anomalyWarnRatio:  cfg.AnomalyWarnRatio || 1.3,
                // Log options
                maxLogEntries:     cfg.MaxLogEntries || 500,
                enableSystemLog:   cfg.EnableSystemLog || false,
                // AF Builder options
                afBasePath:        cfg.AFBasePath || '',
                // Tags options (fix: use TagStaleSec, not AlertStaleSec)
                tagStaleSec:       cfg.TagStaleSec || 300,
                tagSortCol:        cfg.TagSortCol || 'site',
                tagSortAsc:        cfg.TagSortAsc !== false,
                // Tag Warehouse options
                defaultBindings:       cfg.DefaultTagBindings || {},
                userBindings:          cfg.UserTagBindings || {},
                allowUserRebinding:    cfg.AllowUserTagRebinding !== false,
                // Tag Explorer options
                defaultChart:      cfg.DefaultExplorerChart || 'trend',
                maxTags:           cfg.MaxExplorerTags || 8,
                savedState:        cfg.ExplorerState || null,
                onStateChange:     function (state) {
                    scope.config.ExplorerState = state;
                },
                // Event Frames options
                EventFrameDays:    cfg.EventFrameDays || 30,
                EventFramePollSec: cfg.EventFramePollSec || 300,
                // Unit Event Bindings
                enableUnitEvents:   cfg.EnableUnitEvents !== false,
                unitEventBindings:  cfg.UnitEventBindings || {}
                // ── Planned-future config (defined in DEFAULTS, not yet consumed): ──
                // AutoCollapse, EnableAutoRefresh, ExceptionMode, TTEHorizonDays,
                // ForecastEnabled, DispatchEnabled, StaleThreshold
            };

            _plugins[tabId] = MU.safePlugin(Cls, shadow, container, opts, bus, tabId);
            return _plugins[tabId];
        }


        // ── 8. Tab Switching ────────────────────────────────
        function _switchTab(tabId) {
            if (_layoutMgr && !_layoutMgr.isTabVisible(tabId)) return;
            var contents = shadow.querySelectorAll('.mu20-tab-content');
            var i;
            for (i = 0; i < contents.length; i++) {
                contents[i].style.display = 'none';
            }
            var active = shadow.querySelector('.mu20-tab-content[data-tab="' + tabId + '"]');
            if (active) active.style.display = 'block';

            var tabs = shadow.querySelectorAll('.mu20-tab');
            for (i = 0; i < tabs.length; i++) {
                tabs[i].classList.toggle('mu20-tab--active',
                    tabs[i].getAttribute('data-tab') === tabId);
            }

            _activeTab = tabId;
            _ensurePlugin(tabId);

            if (_plugins[tabId] && _plugins[tabId].onTabActivated) {
                _plugins[tabId].onTabActivated();
            }

            // FIX #5: Feed canonical payload to newly activated plugin
            if (_lastPayload && _plugins[tabId] && _plugins[tabId].update) {
                _plugins[tabId].update(_lastPayload);
            }

            bus.emit('tab:changed', { tab: tabId });
        }

        // ── 9. PI Web API Init + Template-Driven Discovery ──
        var _api = null;
        if (cfg.PiWebApiBaseUrl || !cfg.DemoMode) {
            _api = new MU.PIWebAPI(cfg.PiWebApiBaseUrl);
        }

        // Activate initial tab (from config or default to realtime)
        _switchTab(cfg.ActiveTab || 'realtime');

        // Template-Driven Discovery: validate ATTR_MAP against live AF.
        // Non-blocking — symbol works immediately with fallback map,
        // then upgrades to validated live map when API responds.
        _discoverTemplate(_api, cfg, bus, function (liveMap) {
            if (liveMap) {
                _attrMapLive = liveMap;
                bus.emit('log:entry', {
                    level: 'info', source: 'TDD',
                    msg: 'Switched to validated live attribute map',
                    ts: new Date().toISOString()
                });
                bus.emit('tdd:ready', { attrCount: Object.keys(liveMap).length });
            }
        });

        // Visual TDD indicator in footer (guard against duplicates)
        bus.on('tdd:ready', function (info) {
            var footer = shadow.querySelector('.mu20-footer');
            if (!footer) return;
            if (footer.querySelector('[data-tdd]')) return;
            var indicator = document.createElement('span');
            indicator.setAttribute('data-tdd', '1');
            indicator.style.cssText = 'font-size:10px;color:#3fb950;margin-inline-start:8px;';
            indicator.textContent = 'TDD \u2713 (' + info.attrCount + ')';
            indicator.title = '\u05DE\u05E4\u05EA \u05DE\u05D0\u05E4\u05D9\u05D9\u05E0\u05D9\u05DD \u05DE\u05D0\u05D5\u05DE\u05EA\u05EA \u05E2"\u05D9 \u05D2\u05D9\u05DC\u05D5\u05D9 \u05EA\u05D1\u05E0\u05D9\u05D5\u05EA';
            footer.appendChild(indicator);
        });

        // Emit api:ready after _switchTab so plugins can receive it via bus
        if (_api) {
            bus.emit('api:ready', _api);
        }


        // ── 10. Data Parsing (onDataUpdate) ─────────────────

        // FIX #9: O(1) unit lookup map
        var _unitLookup = {};

        function _normalizeKey(s) {
            return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
        }

        function _buildUnitLookup(sites) {
            var map = {};
            for (var s = 0; s < sites.length; s++) {
                for (var u = 0; u < sites[s].units.length; u++) {
                    map[_normalizeKey(sites[s].units[u])] = {
                        siteId:  sites[s].id,
                        unitIdx: u
                    };
                }
            }
            return map;
        }

        _unitLookup = _buildUnitLookup(siteDefs);

        var _parsedSites = {};
        var _debounceTimer = null;
        var _firstUpdate = true;

        // -- Attribute alias map --
        var ATTR_MAP_FALLBACK = {
            // existing — core attribute groups
            'hours': 'hours', 'shaut': 'hours', '\u05E9\u05E2\u05D5\u05EA': 'hours',
            'quota': 'quota', 'michsa': 'quota', '\u05DE\u05DB\u05E1\u05D4': 'quota',
            'pct': 'pct', 'achuz': 'pct', 'percent': 'pct', '\u05D0\u05D7\u05D5\u05D6': 'pct',
            'status': 'status', 'matzav': 'status', '\u05DE\u05E6\u05D1': 'status',
            'mw': 'mw', 'power': 'mw', 'hespek': 'mw', '\u05D4\u05E1\u05E4\u05E7': 'mw',
            // new — full Hebrew AF attribute names from Mugbalot template
            '\u05E9\u05E2\u05D5\u05EA \u05E4\u05E2\u05D5\u05DC\u05D4 \u05DE\u05EA\u05D7\u05D9\u05DC\u05EA \u05D4\u05E9\u05E0\u05D4': 'hours',
            '\u05DE\u05DB\u05E1\u05EA \u05E9\u05E2\u05D5\u05EA \u05E2\u05D1\u05D5\u05D3\u05D4 \u05E9\u05E0\u05EA\u05D9': 'quota',
            '\u05D0\u05D7\u05D5\u05D6 \u05DE\u05EA\u05D5\u05DA \u05D4\u05DE\u05DB\u05E1\u05D4 \u05D4\u05E9\u05E0\u05EA\u05D9\u05EA': 'pct',
            'active_mug': 'status',
            // new — AF-native attributes not previously consumed
            '\u05E9\u05E2\u05D5\u05EA \u05E9\u05E0\u05D5\u05EA\u05E8\u05D5 \u05DC\u05DE\u05DB\u05E1\u05D4 \u05E9\u05E0\u05EA\u05D9\u05EA': 'hoursLeft', 'hoursleft': 'hoursLeft',
            '\u05D6\u05DE\u05DF \u05E4\u05E2\u05D5\u05DC\u05D4 \u05DE\u05EA\u05D7\u05D9\u05DC\u05EA \u05D4\u05E9\u05E0\u05D4': 'runtimeFormatted', 'runtimeformatted': 'runtimeFormatted',
            '\u05E9\u05E0\u05D9\u05D5\u05EA \u05E9\u05E0\u05EA\u05D9': 'secondsYtd', 'secondsytd': 'secondsYtd', 'shniot': 'secondsYtd',
            '\u05D7\u05D5\u05D3\u05E9 \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA': 'activeMonth', 'activemonth': 'activeMonth', 'hodesh': 'activeMonth',
            'units': 'designation', 'designation': 'designation',
            '\u05D9\u05D7\u05D9\u05D3\u05D4': 'unitName', 'unitname': 'unitName', 'yehida': 'unitName',
            '\u05D0\u05EA\u05E8': 'siteName', 'sitename': 'siteName', 'atar': 'siteName',
            '\u05E9\u05E2\u05D5\u05EA \u05E4\u05E2\u05D5\u05DC\u05D4 \u05E9\u05E0\u05EA\u05D9 \u05D1\u05D0\u05EA\u05E8': 'siteHoursYtd', 'sitehoursytd': 'siteHoursYtd'
        };

        // Live attribute map — populated by Template-Driven Discovery at boot.
        // Falls back to ATTR_MAP_FALLBACK when API is unavailable (demo, offline).
        var _attrMapLive = null;

        // ── Template-Driven Discovery ──────────────────────────
        // Hints for auto-classifying AF template attributes that
        // don't match any key in ATTR_MAP_FALLBACK.
        var TDD_TYPE_HINTS = [
            { pattern: /active_mug/i,                              key: 'status' },
            { pattern: /^units$/i,                                 key: 'designation' },
            { pattern: /\u05E9\u05E0\u05D5\u05EA\u05E8\u05D5|hours.?left/i, key: 'hoursLeft' },
            { pattern: /\u05D6\u05DE\u05DF \u05E4\u05E2\u05D5\u05DC\u05D4|runtime.?formatted/i, key: 'runtimeFormatted' },
            { pattern: /\u05E9\u05E0\u05D9\u05D5\u05EA|seconds.?ytd/i, key: 'secondsYtd' },
            { pattern: /\u05D7\u05D5\u05D3\u05E9|active.?month/i, key: 'activeMonth' },
            { pattern: /\u05D9\u05D7\u05D9\u05D3\u05D4|unit.?name/i, key: 'unitName' },
            { pattern: /^\u05D0\u05EA\u05E8$|site.?name/i,        key: 'siteName' },
            { pattern: /\u05E9\u05E2\u05D5\u05EA.*\u05D1\u05D0\u05EA\u05E8|site.?hours/i, key: 'siteHoursYtd' },
            { pattern: /\u05D0\u05D7\u05D5\u05D6|percent|pct/i,   key: 'pct' },
            { pattern: /\u05DE\u05DB\u05E1\u05D4?|quota/i,        key: 'quota' },
            { pattern: /\u05E9\u05E2\u05D5\u05EA|hours/i,         key: 'hours' },
            { pattern: /\u05D4\u05E1\u05E4\u05E7|power|^mw$/i,    key: 'mw' }
        ];

        /** Match attribute name against TDD_TYPE_HINTS. */
        function _matchHint(name) {
            for (var i = 0; i < TDD_TYPE_HINTS.length; i++) {
                if (TDD_TYPE_HINTS[i].pattern.test(name)) {
                    return TDD_TYPE_HINTS[i].key;
                }
            }
            return null;
        }

        /**
         * Template-Driven Discovery: query PI Web API for the Mugbalot
         * element template, build a validated _attrMapLive, and log
         * any mismatches or newly discovered attributes.
         *
         * @param {Object} api  - MU20.PIWebAPI instance
         * @param {Object} cfg  - symbol config
         * @param {Object} bus  - signal bus
         * @param {Function} done - callback(liveMap) — null on failure
         */
        function _discoverTemplate(api, cfg, bus, done) {
            if (cfg.TDDEnabled === false) {
                bus.emit('log:entry', {
                    level: 'info', source: 'TDD',
                    msg: 'Template Discovery disabled in config',
                    ts: new Date().toISOString()
                });
                done(null);
                return;
            }

            if (!api || cfg.DemoMode) {
                // Demo simulation: log the TDD flow without API calls
                bus.emit('log:entry', {
                    level: 'info', source: 'TDD',
                    msg: 'Demo mode \u2014 simulating TDD with ' +
                         Object.keys(ATTR_MAP_FALLBACK).length + ' fallback entries',
                    ts: new Date().toISOString()
                });
                done(ATTR_MAP_FALLBACK);
                return;
            }

            var dbPath = cfg.AFBasePath || '';
            if (!dbPath) {
                bus.emit('log:entry', {
                    level: 'warn', source: 'TDD',
                    msg: 'AFBasePath not configured \u2014 using ATTR_MAP fallback',
                    ts: new Date().toISOString()
                });
                done(null);
                return;
            }

            // Step 1: Resolve database WebId
            api.getDatabaseByPath(dbPath, function (err, db) {
                if (err || !db || !db.WebId) {
                    bus.emit('log:entry', {
                        level: 'warn', source: 'TDD',
                        msg: 'Failed to resolve AF database: ' + (err ? err.text : 'empty response'),
                        ts: new Date().toISOString()
                    });
                    done(null);
                    return;
                }

                // Step 2: Fetch template
                var templateName = cfg.TDDTemplateName || 'Mugbalot';
                api.getElementTemplates(db.WebId, templateName, function (err2, templates) {
                    if (err2 || !templates || templates.length === 0) {
                        bus.emit('log:entry', {
                            level: 'warn', source: 'TDD',
                            msg: 'Template "' + templateName + '" not found: ' +
                                 (err2 ? err2.text : 'no results'),
                            ts: new Date().toISOString()
                        });
                        done(null);
                        return;
                    }

                    var tmpl = templates[0];
                    var attrTemplates = tmpl.AttributeTemplates || [];

                    bus.emit('log:entry', {
                        level: 'info', source: 'TDD',
                        msg: 'Discovered template "' + tmpl.Name + '" with ' +
                             attrTemplates.length + ' attributes',
                        ts: new Date().toISOString()
                    });

                    // Step 3-4: Build validated live map
                    var liveMap = {};
                    var discoveredNames = {};

                    for (var i = 0; i < attrTemplates.length; i++) {
                        var afAttr = attrTemplates[i];
                        var afName = afAttr.Name || '';
                        var afNameLower = afName.toLowerCase();
                        discoveredNames[afNameLower] = true;

                        // Try direct lookup in fallback map
                        var internalKey = ATTR_MAP_FALLBACK[afName] || ATTR_MAP_FALLBACK[afNameLower];

                        if (internalKey) {
                            liveMap[afName] = internalKey;
                            liveMap[afNameLower] = internalKey;
                        } else {
                            var hintKey = _matchHint(afName);
                            if (hintKey) {
                                liveMap[afName] = hintKey;
                                liveMap[afNameLower] = hintKey;
                                bus.emit('log:entry', {
                                    level: 'info', source: 'TDD',
                                    msg: 'Auto-discovered: "' + afName + '" \u2192 ' + hintKey,
                                    ts: new Date().toISOString()
                                });
                            } else {
                                bus.emit('log:entry', {
                                    level: 'debug', source: 'TDD',
                                    msg: 'Unrecognized AF attribute: "' + afName +
                                         '" (Type=' + (afAttr.Type || '?') + ')',
                                    ts: new Date().toISOString()
                                });
                            }
                        }
                    }

                    // Step 5: Check for fallback entries missing from template
                    var missingCount = 0;
                    for (var fbk in ATTR_MAP_FALLBACK) {
                        if (!ATTR_MAP_FALLBACK.hasOwnProperty(fbk)) continue;
                        if (!discoveredNames[fbk.toLowerCase()] && !liveMap[fbk]) {
                            if (fbk.length > 5 && /[\u0590-\u05FF]/.test(fbk)) {
                                missingCount++;
                                if (missingCount <= 5) {
                                    bus.emit('log:entry', {
                                        level: 'warn', source: 'TDD',
                                        msg: 'Fallback key "' + fbk + '" not found in AF template \u2014 possible rename?',
                                        ts: new Date().toISOString()
                                    });
                                }
                            }
                        }
                    }
                    if (missingCount > 5) {
                        bus.emit('log:entry', {
                            level: 'warn', source: 'TDD',
                            msg: '... and ' + (missingCount - 5) + ' more missing fallback keys',
                            ts: new Date().toISOString()
                        });
                    }

                    // Copy all fallback short aliases into live map
                    for (var alias in ATTR_MAP_FALLBACK) {
                        if (!ATTR_MAP_FALLBACK.hasOwnProperty(alias)) continue;
                        if (!liveMap[alias]) {
                            liveMap[alias] = ATTR_MAP_FALLBACK[alias];
                        }
                    }

                    bus.emit('log:entry', {
                        level: 'info', source: 'TDD',
                        msg: 'Live map built: ' + Object.keys(liveMap).length + ' entries ' +
                             '(validated + fallback aliases)',
                        ts: new Date().toISOString()
                    });

                    done(liveMap);
                });
            });
        }

        // ── Owner grouping (from AF Mugbalot hierarchy) ──
        var OWNER_MAP_DEFAULT = {
            '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF': 'HHI',
            '\u05D0\u05D9\u05DC\u05EA': 'HHI',
            '\u05D0\u05D9\u05EA\u05DF': 'HHI',
            '\u05D0\u05EA\u05D2\u05DC': 'HHI',
            '\u05D7\u05D9\u05E4\u05D4': 'HHI',
            '\u05DB\u05D9\u05E0\u05D5\u05E8\u05D5\u05EA': 'HHI',
            '\u05E2\u05D8\u05E8\u05D5\u05EA': 'HHI',
            '\u05E6\u05E4\u05D9\u05EA': 'HHI',
            '\u05E7\u05D9\u05E1\u05E8\u05D9\u05D4': 'HHI',
            '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2': 'HHI',
            '\u05E8\u05E2\u05E0\u05E0\u05D4': 'HHI',
            '\u05D0\u05DC\u05D5\u05DF \u05EA\u05D1\u05D5\u05E8': 'PRIVATE',
            '\u05D0\u05E9\u05DB\u05D5\u05DC': 'PRIVATE',
            '\u05E6\u05D5\u05DE\u05EA \u05D0\u05E0\u05E8\u05D2\u05D9\u05D4': 'PRIVATE'
        };

        var OWNER_LABELS = {
            'HHI': '\u05D7\u05D7"\u05D9',
            'PRIVATE': '\u05E4\u05E8\u05D8\u05D9'
        };

        function _resolveOwners(defs, cfgMap) {
            var map = cfgMap || OWNER_MAP_DEFAULT;
            var result = {};
            for (var siteId in defs) {
                if (!defs.hasOwnProperty(siteId)) continue;
                var siteName = defs[siteId].name || siteId;
                result[siteId] = map[siteName] || 'UNKNOWN';
            }
            return result;
        }

        // Resolve ownership and attach to siteDefs
        var _ownerMap = _resolveOwners(siteDefs, cfg.OwnerMap);
        for (var _oSid in _ownerMap) {
            if (siteDefs[_oSid]) {
                siteDefs[_oSid].owner = _ownerMap[_oSid];
                siteDefs[_oSid].ownerLabel = OWNER_LABELS[_ownerMap[_oSid]] || _ownerMap[_oSid];
            }
        }

        // FIX #9: O(1) lookup instead of nested scan
        function _matchToUnit(parsed) {
            if (!parsed || !parsed.attribute) return null;
            var attr = parsed.attribute.toLowerCase();
            var map = _attrMapLive || ATTR_MAP_FALLBACK;
            var stdAttr = map[attr] || ATTR_MAP_FALLBACK[attr] || attr;
            var key = _normalizeKey(parsed.element);
            var hit = _unitLookup[key];
            if (!hit) return null;
            return { siteId: hit.siteId, unitIdx: hit.unitIdx, attr: stdAttr };
        }

        function _parseData(data, sites) {
            var result = {};
            var rows = data.Data;

            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                if (!row || !row.Label) continue;

                var parsed = MU.AF.parsePath(row.Label);
                var match = _matchToUnit(parsed);
                if (!match) continue;

                if (!result[match.siteId]) result[match.siteId] = {};
                if (!result[match.siteId][match.unitIdx]) {
                    result[match.siteId][match.unitIdx] = {};
                }

                var val = MU.AF.safeVal(row, cfg.Decimals);
                var stdAttr = match.attr;

                // String-type attributes: store with isString flag
                if (stdAttr === 'runtimeFormatted' || stdAttr === 'designation' ||
                    stdAttr === 'unitName' || stdAttr === 'siteName') {
                    result[match.siteId][match.unitIdx][stdAttr] = {
                        numeric: null,
                        display: String(val),
                        good: !!(row.Good !== false),
                        isString: true
                    };
                }
                // New numeric attributes: parse and format
                else if (stdAttr === 'hoursLeft' || stdAttr === 'secondsYtd' ||
                         stdAttr === 'activeMonth' || stdAttr === 'siteHoursYtd') {
                    var numVal = parseFloat(val);
                    result[match.siteId][match.unitIdx][stdAttr] = {
                        numeric: isFinite(numVal) ? numVal : null,
                        display: isFinite(numVal) ? MU.formatNum(numVal, cfg.Decimals) : '\u05E9\u05D2\u05D9\u05D0\u05D4',
                        good: isFinite(numVal) && numVal >= 0
                    };
                }
                // Core attributes: store raw value as before
                else {
                    result[match.siteId][match.unitIdx][stdAttr] = val;
                }
            }

            // Post-process: quota=0 guard
            for (var sid in result) {
                if (!result.hasOwnProperty(sid)) continue;
                for (var uid in result[sid]) {
                    if (!result[sid].hasOwnProperty(uid)) continue;
                    var u = result[sid][uid];
                    // Handle both object format {numeric, display, good} and raw value
                    var quotaVal = u.quota;
                    var quotaNum = (quotaVal && typeof quotaVal === 'object') ? quotaVal.numeric : parseFloat(quotaVal);
                    if (quotaNum === 0 || quotaNum === null || isNaN(quotaNum)) {
                        u.noQuota = true;
                        if (u.pct) {
                            if (typeof u.pct === 'object') {
                                u.pct.numeric = null;
                                u.pct.display = '\u05D0\u05D9\u05DF \u05DE\u05DB\u05E1\u05D4'; // אין מכסה
                                u.pct.good = true;
                                u.pct.noQuota = true;
                            }
                        }
                        if (u.hoursLeft) {
                            if (typeof u.hoursLeft === 'object') {
                                u.hoursLeft.numeric = null;
                                u.hoursLeft.display = '\u2014'; // em-dash
                                u.hoursLeft.noQuota = true;
                            }
                        }
                    }
                    // Cross-validation: secondsYtd vs hours
                    var secVal = u.secondsYtd;
                    var secNum = (secVal && typeof secVal === 'object') ? secVal.numeric : parseFloat(secVal);
                    var hoursVal = u.hours;
                    var hoursNum = (hoursVal && typeof hoursVal === 'object') ? hoursVal.numeric : parseFloat(hoursVal);
                    if (secNum !== null && !isNaN(secNum) && hoursNum !== null && !isNaN(hoursNum)) {
                        var drift = Math.abs(secNum / 3600 - hoursNum);
                        if (drift > 1) {
                            bus.emit('log:entry', {
                                level: 'warn',
                                source: 'DataIntegrity',
                                msg: '\u05D7\u05D5\u05E1\u05E8 \u05D4\u05EA\u05D0\u05DE\u05D4 seconds\u2194hours: ' +
                                     secNum + 's vs ' + hoursNum + 'h (drift=' + drift.toFixed(1) + 'h)',
                                ts: new Date().toISOString()
                            });
                        }
                    }
                }
            }

            return result;
        }

        // FIX #3: Send both siteDefs and parsed data to Worker
        function _sendToWorker() {
            if (!worker) return;
            worker.postMessage({
                type: 'PI_DATA',
                payload: {
                    sites:    siteDefs,         // array of site definitions
                    data:     _parsedSites,     // parsed data map { siteId: { unitIdx: { attr: val } } }
                    warnPct:  cfg.WarnThreshold,
                    critPct:  cfg.CritThreshold,
                    decimals: cfg.Decimals
                }
            });
        }

        // FIX #2: Use vis.onDataUpdate instead of scope.dataUpdate
        self.onDataUpdate = MU.shield.wrap('orchestrator', 'onDataUpdate', function (data) {
            if (!data || !data.Data) return;

            _parsedSites = _parseData(data, siteDefs);

            // Debounce: first call immediate, subsequent 100ms
            if (_firstUpdate) {
                _firstUpdate = false;
                _sendToWorker();
            } else {
                if (_debounceTimer) clearTimeout(_debounceTimer);
                _debounceTimer = setTimeout(_sendToWorker, DEBOUNCE_MS);
            }
        });


        // ── 11. Demo Mode ───────────────────────────────────
        var _demoInterval = null;
        var _demoDesignations = ['MD-1','GT-2','GT-3','ST-4','MD-5','GT-6','JT-7'];

        function _formatRuntime(hours) {
            var totalSec = Math.floor(hours * 3600);
            var d = Math.floor(totalSec / 86400);
            var h = Math.floor((totalSec % 86400) / 3600);
            var m = Math.floor((totalSec % 3600) / 60);
            var s = totalSec % 60;
            return d + '\u05D9 ' + h + '\u05E9 ' + m + '\u05D3 ' + s + '\u05E9\u05E0';
        }

        function _generateDemoEventFrames(defs) {
            var frames = [];
            var now = Date.now();
            var daysBack = (cfg.EventFrameDays || 30) * 86400000;
            for (var siteId in defs) {
                if (!defs.hasOwnProperty(siteId)) continue;
                var site = defs[siteId];
                var units = site.units || [];
                for (var u = 0; u < units.length; u++) {
                    var count = 2 + Math.floor(Math.random() * 4);
                    for (var e = 0; e < count; e++) {
                        var start = now - daysBack + Math.random() * daysBack;
                        var duration = (1 + Math.random() * 48) * 3600000;
                        var isOpen = (e === count - 1 && Math.random() > 0.5);
                        frames.push({
                            unitKey: siteId + '_u' + u,
                            unitName: units[u].name || (site.name + ' ' + (u + 1)),
                            siteName: site.name || siteId,
                            startTime: new Date(start).toISOString(),
                            endTime: isOpen ? null : new Date(start + duration).toISOString(),
                            month: new Date(start).getMonth() + 1
                        });
                    }
                }
            }
            return frames;
        }

        function _sendDemoData() {
            _parsedSites = {};
            var demoData = MU.demo.generateSites(siteDefs);

            for (var siteId in demoData) {
                if (!demoData.hasOwnProperty(siteId)) continue;
                _parsedSites[siteId] = {};
                for (var uIdx in demoData[siteId]) {
                    if (!demoData[siteId].hasOwnProperty(uIdx)) continue;
                    var d = demoData[siteId][uIdx];
                    _parsedSites[siteId][uIdx] = {
                        hours:  { numeric: d.hours,  display: MU.formatNum(d.hours, cfg.Decimals),  good: true },
                        quota:  { numeric: d.quota,  display: MU.formatNum(d.quota, cfg.Decimals),  good: true },
                        pct:    { numeric: d.pct,    display: MU.formatNum(d.pct, 1),                good: true },
                        status: { display: d.status, numeric: 0, good: true, isDigitalState: true },
                        mw:     { numeric: d.mw || 0, display: MU.formatNum(d.mw || 0, 0), good: true }
                    };
                    _parsedSites[siteId][uIdx].hoursLeft = {
                        numeric: Math.max(0, d.quota - d.hours),
                        display: MU.formatNum(Math.max(0, d.quota - d.hours), cfg.Decimals),
                        good: true
                    };
                    _parsedSites[siteId][uIdx].secondsYtd = {
                        numeric: d.hours * 3600,
                        display: MU.formatNum(d.hours * 3600, 0),
                        good: true
                    };
                    _parsedSites[siteId][uIdx].runtimeFormatted = {
                        numeric: null,
                        display: _formatRuntime(d.hours),
                        good: true,
                        isString: true
                    };
                    _parsedSites[siteId][uIdx].activeMonth = {
                        numeric: new Date().getMonth() + 1,
                        display: String(new Date().getMonth() + 1),
                        good: true
                    };
                    _parsedSites[siteId][uIdx].designation = {
                        numeric: null,
                        display: _demoDesignations[parseInt(uIdx, 10) % _demoDesignations.length] || ('U-' + uIdx),
                        good: true,
                        isString: true
                    };
                }
            }
            _sendToWorker();
            bus.emit('demo:toggle', { enabled: true });
            bus.emit('eventframes:updated', {
                frames: _generateDemoEventFrames(siteDefs),
                stats: {}
            });
        }

        if (cfg.DemoMode) {
            _sendDemoData();
            _demoInterval = setInterval(_sendDemoData, cfg.DataUpdateInterval || 30000);
        }


        // ── 12. Config Watchers ─────────────────────────────
        var unwatchers = [];

        unwatchers.push(scope.$watchGroup(
            ['config.WarnThreshold', 'config.CritThreshold', 'config.Decimals',
             'config.WarnPct', 'config.CritPct'],
            function (nv, ov) {
                // M-1 fix: $watchGroup always gives different array refs;
                // Angular guarantees callback only fires on value changes
                // FIX #7: re-map editor names each time
                MU.config.mapEditor(cfg);
                cfg = MU.config.normalize(cfg);
                if (worker) {
                    worker.postMessage({ type: 'CONFIG', payload: {
                        warnPct: cfg.WarnThreshold,
                        critPct: cfg.CritThreshold,
                        decimals: cfg.Decimals
                    }});
                }
                bus.emit('config:changed', { config: cfg });
            }
        ));

        unwatchers.push(scope.$watch('config.DemoMode', function (nv, ov) {
            if (nv === ov) return;
            demoBadge.style.display = nv ? 'inline-block' : 'none';
            if (nv) {
                _sendDemoData();
                if (!_demoInterval) {
                    _demoInterval = setInterval(_sendDemoData, cfg.DataUpdateInterval || 30000);
                }
            } else {
                if (_demoInterval) { clearInterval(_demoInterval); _demoInterval = null; }
            }
            bus.emit('demo:toggle', { enabled: !!nv });
        }));

        // FIX #8: Watch title, subtitle, footer, theme
        unwatchers.push(scope.$watchGroup(
            ['config.Title', 'config.Subtitle', 'config.ShowFooter', 'config.FooterText',
             'config.fontFamily', 'config.fontSize', 'config.headerFontSize',
             'config.gradientStart', 'config.gradientEnd', 'config.cardBg',
             'config.accentColor', 'config.okColor', 'config.warnColor', 'config.critColor'],
            function (nv, ov) {
                // M-1 fix: removed broken nv === ov guard (always false for $watchGroup)
                cfg = MU.config.normalize(cfg);
                titleEl.textContent = cfg.Title || '\u05DE\u05D5\u05E0\u05D9\u05D8\u05D5\u05E8 \u05DE\u05D5\u05D2\u05D1\u05DC\u05D5\u05EA';
                subtitleEl.textContent = cfg.Subtitle || '';
                subtitleEl.style.display = cfg.Subtitle ? 'block' : 'none';
                footer.style.display = cfg.ShowFooter !== false ? 'flex' : 'none';
                footerText.textContent = cfg.FooterText || '';
                MU.applyTheme(shell, cfg);
            }
        ));

        // LogoUrl live update
        unwatchers.push(scope.$watch('config.LogoUrl', function (nv) {
            if (nv) {
                logoEl.src = nv;
                logoEl.style.display = 'inline-block';
            } else {
                logoEl.style.display = 'none';
            }
        }));

        // FIX #8: Watch RefreshInterval → DataUpdateInterval
        unwatchers.push(scope.$watch('config.RefreshInterval', function (nv, ov) {
            if (nv === ov) return;
            MU.config.mapEditor(cfg);
        }));

        // ── 12b. Live Config Propagation to Plugins ──────────
        // Plugins with setOption() get live updates when config changes.
        // Map: config key → { plugin, optKey }
        var PLUGIN_CONFIG_MAP = [
            // Heatmap
            { watch: 'config.HeatmapMetric',  plugin: 'heatmap',  opt: 'metric' },
            { watch: 'config.HeatmapSite',    plugin: 'heatmap',  opt: 'siteFilter' },
            // Alerts
            { watch: 'config.AlertQuotaPct',   plugin: 'alerts',   opt: 'quotaPct' },
            { watch: 'config.AlertHoursMax',   plugin: 'alerts',   opt: 'hoursMax' },
            { watch: 'config.AlertStaleSec',   plugin: 'alerts',   opt: 'staleSec' },
            { watch: 'config.AlertSoundEnabled', plugin: 'alerts', opt: 'soundEnabled' },
            { watch: 'config.PushNotificationsEnabled', plugin: 'alerts', opt: 'pushEnabled' },
            // Reports
            { watch: 'config.ReportTemplate',  plugin: 'reports',  opt: 'template' },
            { watch: 'config.ReportGrouping',  plugin: 'reports',  opt: 'grouping' },
            // Grid (realtime)
            { watch: 'config.SortOrder',       plugin: 'realtime', opt: 'sortOrder' },
            { watch: 'config.ShowSparklines',  plugin: 'realtime', opt: 'showSparklines' },
            { watch: 'config.TTEEnabled',      plugin: 'realtime', opt: 'showTte' },
            { watch: 'config.ShowQuota',       plugin: 'realtime', opt: 'showQuota' },
            { watch: 'config.UseThousandsSep', plugin: 'realtime', opt: 'useThousandsSep' },
            { watch: 'config.HighlightOverQuota', plugin: 'realtime', opt: 'highlightOverQuota' },
            { watch: 'config.FavoritesEnabled',  plugin: 'realtime', opt: 'favoritesEnabled' },
            // Forecast
            { watch: 'config.ForecastCritDays',    plugin: 'forecast',  opt: 'forecastCritDays' },
            { watch: 'config.ForecastWarnDays',    plugin: 'forecast',  opt: 'forecastWarnDays' },
            { watch: 'config.ShowTTECountdown',    plugin: 'forecast',  opt: 'showTteCountdown' },
            // Dispatch
            { watch: 'config.DispatchMinMW',       plugin: 'dispatch',  opt: 'dispatchMinMW' },
            { watch: 'config.DispatchExcludeFltMnt', plugin: 'dispatch', opt: 'dispatchExcludeFltMnt' },
            { watch: 'config.ForecastCritDays',    plugin: 'dispatch',  opt: 'forecastCritDays' },
            { watch: 'config.ForecastWarnDays',    plugin: 'dispatch',  opt: 'forecastWarnDays' },
            // Tags
            { watch: 'config.TagStaleSec',         plugin: 'tags',          opt: 'staleSec' },
            { watch: 'config.TagSortCol',          plugin: 'tags',          opt: 'sortCol' },
            { watch: 'config.TagSortAsc',          plugin: 'tags',          opt: 'sortAsc' },
            // Tag Warehouse
            { watch: 'config.AllowUserTagRebinding', plugin: 'tagWarehouse', opt: 'allowUserRebinding' },
            // Tag Explorer
            { watch: 'config.DefaultExplorerChart', plugin: 'tagExplorer', opt: 'defaultChart' },
            { watch: 'config.MaxExplorerTags',      plugin: 'tagExplorer', opt: 'maxTags' }
        ];

        for (var ci = 0; ci < PLUGIN_CONFIG_MAP.length; ci++) {
            (function (mapping) {
                unwatchers.push(scope.$watch(mapping.watch, function (nv, ov) {
                    if (nv === ov) return;
                    var p = _plugins[mapping.plugin];
                    if (p && p.setOption) {
                        p.setOption(mapping.opt, nv);
                    }
                }));
            })(PLUGIN_CONFIG_MAP[ci]);
        }

        // ── 12b. Bus: Tag Warehouse binding persistence ─────
        bus.on('tags:bindingChanged', function (d) {
            if (!d || !d.objectId || !d.roleKey) return;
            var bindings = scope.config.UserTagBindings || {};
            if (!bindings[d.objectId]) bindings[d.objectId] = {};
            bindings[d.objectId][d.roleKey] = {
                tagName: d.tagName,
                tagPath: d.tagPath,
                assignedBy: d.assignedBy || 'user',
                assignedAt: d.assignedAt || new Date().toISOString()
            };
            scope.config.UserTagBindings = bindings;
            try { scope.$applyAsync(); } catch (e) { /* outside digest */ }
        });
        bus.on('tags:bindingRemoved', function (d) {
            if (!d || !d.objectId || !d.roleKey) return;
            var bindings = scope.config.UserTagBindings || {};
            if (bindings[d.objectId]) {
                bindings[d.objectId][d.roleKey] = 'cleared';
            }
            scope.config.UserTagBindings = bindings;
            try { scope.$applyAsync(); } catch (e) { /* outside digest */ }
        });


        // ── 13. Keyboard Shortcuts ──────────────────────────
        // FIX #10: Scoped to shell element, not document global
        function _onKeyDown(e) {
            // Ctrl+K  -->  search
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                bus.emit('search:query', { open: true });
                return;
            }
            // 1-9  -->  tab switch  (no modifiers)
            if (!e.ctrlKey && !e.altKey && e.key >= '1' && e.key <= '9') {
                var idx = parseInt(e.key, 10) - 1;
                if (idx < TABS.length) {
                    e.preventDefault();
                    _switchTab(TABS[idx].id);
                }
                return;
            }
            // Esc  -->  close modals / search
            if (e.key === 'Escape') {
                bus.emit('search:query', { open: false });
            }
        }
        shell.addEventListener('keydown', _onKeyDown);
        // Focus shell so keyboard works immediately
        setTimeout(function () { try { shell.focus(); } catch (e) {} }, 200);


        // ── 14. Clock ───────────────────────────────────────
        var _clockEl = clockEl;
        var _clockInterval = setInterval(function () {
            if (!_clockEl) return;
            var now = new Date();
            var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
            _clockEl.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
        }, 1000);


        // ── 15. Resize Handler ──────────────────────────────
        // FIX #2: vis.onResize (PI Vision hook)
        self.onResize = function (w, h) {
            if (_plugins[_activeTab] && _plugins[_activeTab].onResize) {
                _plugins[_activeTab].onResize(w, h);
            }
            bus.emit('resize', { width: w, height: h });
        };


        // ── 16. Viewport Guard (IntersectionObserver) ───────
        var _observer = null;
        if (window.IntersectionObserver) {
            _observer = new IntersectionObserver(function (entries) {
                var visible = entries[0] && entries[0].isIntersecting;
                if (visible && _plugins[_activeTab] && _plugins[_activeTab].onTabActivated) {
                    _plugins[_activeTab].onTabActivated();
                }
            }, { threshold: 0.1 });
            _observer.observe(rootEl);
        }


        // ── 17. Theme Application ───────────────────────────
        MU.applyTheme(shell, cfg);


        // ── 18. Bus: connection status ──────────────────────
        bus.on('api:status', function (payload) {
            if (payload.connected) {
                connDot.className = 'mu20-conn-dot mu20-conn-dot--online';
                connDot.title = '\u05DE\u05D7\u05D5\u05D1\u05E8';
            } else {
                connDot.className = 'mu20-conn-dot mu20-conn-dot--offline';
                connDot.title = '\u05DC\u05D0 \u05DE\u05D7\u05D5\u05D1\u05E8';
            }
        });


        // ── 19. Config export/import (FIX #10: wire dead UI) ──
        scope.exportConfig = function () {
            var json = JSON.stringify(cfg, null, 2);
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'mu20-config-' + new Date().toISOString().slice(0, 10) + '.json';
            a.click();
            setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
        };

        scope.importConfigFile = function (file) {
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (ev) {
                try {
                    var imported = JSON.parse(ev.target.result);
                    for (var k in imported) {
                        if (imported.hasOwnProperty(k)) {
                            scope.config[k] = imported[k];
                        }
                    }
                    scope.$apply(function () {
                        scope.config = MU.config.validate(scope.config);
                        MU.config.mapEditor(scope.config);
                    });
                } catch (err) {
                    console.error('[MU20] Import config failed:', err);
                }
            };
            reader.readAsText(file);
        };

        // L-2 fix: Store scope reference for config file import fallback.
        // Production PI Vision sets debugInfoEnabled=false, which disables
        // angular.element().scope(). The config template's onchange uses
        // MU20._activeConfigScope as a reliable alternative.
        MU._activeConfigScope = scope;

        // ── 17b. Layout Manager scope helpers ────────────────
        scope.layoutEditMode = function () { return _layoutMgr ? _layoutMgr.isEditMode() : false; };
        scope.layoutSave = function () { if (scope.isGuardLocked()) return; if (_layoutMgr) { _layoutMgr.save(); } };
        scope.layoutReset = function () { if (scope.isGuardLocked()) return; if (_layoutMgr) { _layoutMgr.reset(); } };
        scope.layoutToggleEdit = function () { if (scope.isGuardLocked()) return; if (_layoutMgr) { _layoutMgr.toggleEditMode(); } };

        // ── 17c. Unit Event Bindings (QA15) ──────────────────
        bus.on('unit:eventsRequested', function (info) {
            _switchTab('eventframes');
            bus.emit('eventframes:filterUnit', info);
        });

        scope.ensureUeBinding = function (siteId, unitIdx) {
            if (!scope.config.UnitEventBindings) scope.config.UnitEventBindings = {};
            if (!scope.config.UnitEventBindings[siteId]) scope.config.UnitEventBindings[siteId] = {};
            var key = String(unitIdx);
            if (!scope.config.UnitEventBindings[siteId][key]) {
                scope.config.UnitEventBindings[siteId][key] = { eventElementPath: '' };
            }
            return scope.config.UnitEventBindings[siteId][key];
        };

        // ── 18. Display Guard (QA13) ─────────────────────────
        var _currentUser = '';

        scope.isGuardLocked = function () {
            if (!scope.config.DisplayGuardEnabled) return false;
            if (!_currentUser) return true; // user not yet identified → locked
            var editors = (scope.config.AllowedEditors || '').split(',');
            for (var i = 0; i < editors.length; i++) {
                var editor = editors[i].replace(/^\s+|\s+$/g, '').toLowerCase();
                if (editor && _currentUser.toLowerCase() === editor) return false;
            }
            return true;
        };

        scope.guardCurrentUser = '';

        // Fetch current username from PI Web API
        if (_api) {
            _api._get('/system/userinfo', function (err, data) {
                if (!err && data && data.Name) {
                    _currentUser = data.Name;
                    scope.guardCurrentUser = data.Name;
                    try { scope.$applyAsync(); } catch (e) { /* safe */ }
                }
            });
        }

        // ── 19. PI Vision Time Sync (QA11/12) ────────────────
        var _lastDisplayStart = null;
        var _lastDisplayEnd   = null;
        var _displayTimeHandle = null;

        function _readDisplayRange() {
            try {
                var tp = scope.symbol && scope.symbol.TimeProvider;
                if (!tp || !tp.displayTime) return null;
                var dt = tp.displayTime;
                return { start: dt.start, end: dt.end };
            } catch (e) {
                return null;
            }
        }

        function _emitDisplayRange() {
            var range = _readDisplayRange();
            if (!range) return;
            var startStr = range.start ? String(range.start) : '';
            var endStr   = range.end ? String(range.end) : '';
            if (startStr !== _lastDisplayStart || endStr !== _lastDisplayEnd) {
                _lastDisplayStart = startStr;
                _lastDisplayEnd   = endStr;
                bus.emit('time:rangeChanged', { start: range.start, end: range.end });
            }
        }

        function _writeDisplayRange(start, end) {
            try {
                var tp = scope.symbol && scope.symbol.TimeProvider;
                if (!tp) return;
                if (typeof tp.setDisplayTime === 'function') {
                    tp.setDisplayTime(start, end);
                } else if (tp.displayTime) {
                    tp.displayTime = { start: start, end: end };
                }
            } catch (e) { /* writeback not supported — silent */ }
        }

        // Listen for writeback requests from plugins (reports, etc.)
        bus.on('time:writeBack', function (range) {
            if (cfg.SyncReportsWithDisplayTime === false) return;
            var startStr = range.start ? String(range.start) : '';
            var endStr   = range.end ? String(range.end) : '';
            if (startStr !== _lastDisplayStart || endStr !== _lastDisplayEnd) {
                _lastDisplayStart = startStr;
                _lastDisplayEnd   = endStr;
                _writeDisplayRange(range.start, range.end);
            }
        });

        // Poll PI Vision timebar every 1.5s (no native event available)
        if (cfg.SyncReportsWithDisplayTime !== false) {
            _emitDisplayRange(); // seed initial
            _displayTimeHandle = $interval(function () {
                _emitDisplayRange();
            }, 1500);
        }

        // ── 20. Comprehensive $destroy ──────────────────────
        scope.$on('$destroy', function () {
            // Cancel timers
            if (_demoInterval) clearInterval(_demoInterval);
            if (_clockInterval) clearInterval(_clockInterval);
            if (_debounceTimer) clearTimeout(_debounceTimer);
            if (_displayTimeHandle) { $interval.cancel(_displayTimeHandle); _displayTimeHandle = null; }

            // Destroy all plugins
            for (var tabId in _plugins) {
                if (_plugins.hasOwnProperty(tabId) && _plugins[tabId] && _plugins[tabId].destroy) {
                    try { _plugins[tabId].destroy(); } catch (e) { /* ignore */ }
                }
            }
            _plugins = {};

            // Destroy layout manager
            if (_layoutMgr) { try { _layoutMgr.destroy(); } catch (e) {} _layoutMgr = null; }

            // Terminate Worker
            if (worker) {
                try { worker.terminate(); } catch (e) { /* ignore */ }
                worker = null;
            }

            // Deregister watchers
            for (var i = 0; i < unwatchers.length; i++) {
                try { unwatchers[i](); } catch (e) { /* ignore */ }
            }
            unwatchers.length = 0;

            // FIX #10: Remove scoped listener
            shell.removeEventListener('keydown', _onKeyDown);

            // Disconnect observer
            if (_observer) {
                try { _observer.disconnect(); } catch (e) { /* ignore */ }
            }

            // L-2 fix: clear scope reference
            if (MU._activeConfigScope === scope) {
                MU._activeConfigScope = null;
            }

            // Deregister named bus listeners
            bus.off('layout:tabsReordered', _onTabsReordered);
            bus.off('layout:editModeChanged', _onEditModeChanged);

            // Reset bus
            bus.reset();

            // Clear Shadow DOM
            while (shadow.firstChild) shadow.removeChild(shadow.firstChild);

            console.log('[MU20] Destroyed');
        });

    }; // end init


    // ═══════════════════════════════════════
    //  REGISTRATION
    // ═══════════════════════════════════════

    var def = {
        typeName: 'mugult20',
        displayName: 'Mugbalot Ultimate Monitor',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: SCRIPT_BASE + 'icons/mugult20.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return window.MU20 && window.MU20.config && window.MU20.config.DEFAULTS
                ? JSON.parse(JSON.stringify(window.MU20.config.DEFAULTS))
                : {
                    version: 2,
                    WarnThreshold: 70,
                    CritThreshold: 90,
                    Decimals: 1,
                    DataUpdateInterval: 30000,
                    DemoMode: false,
                    Height: 600,
                    Width: 1200,
                    OwnerFilter: 'all',
                    OwnerMap: null,
                    OwnerMapJson: '',
                    AlertStaleSec: 300,
                    AlertStaleSecSlow: 14400,
                    EventFrameDays: 30,
                    EventFramePollSec: 300,
                    TDDEnabled: true,
                    TDDTemplateName: 'Mugbalot',
                    SyncReportsWithDisplayTime: true,
                    SyncReportsSelection: true,
                    DisplayGuardEnabled: false,
                    AllowedEditors: '',
                    SavedTemplates: [],
                    Layout: null,
                    EnableUnitEvents: true,
                    UnitEventBindings: {},
                    ShowGlobalSearch: true,
                    LogoUrl: ''
                };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05DE\u05D5\u05D2\u05D1\u05DC\u05D5\u05EA'
    };

    PV.symbolCatalog.register(def);

})(window.PIVisualization);
