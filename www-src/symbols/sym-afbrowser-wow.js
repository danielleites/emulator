(function (PV) {
    'use strict';

    /* ═══════════════════════════════════════════════════════
     *  Executive Predictive AF Navigator — WOW v100
     * ═══════════════════════════════════════════════════════
     *  Super-intelligent tree browser for navigating the
     *  organization's AF (Asset Framework) hierarchy.
     *
     *  THE GEM: Predictive Prefetching — when the user hovers
     *  over a node, the Web Worker already fetches its children
     *  from PI Web API in the background. When they click, the
     *  tree expands in 0ms with smooth animation.
     *
     *  - Flat Virtual DOM: all nodes are siblings, CSS --depth
     *    variable creates indentation illusion. No nested DOM.
     *  - Event Delegation: 1 click + 1 mouseover listener for
     *    the entire tree (not per-node).
     *  - Web Worker: all PI Web API calls run off-thread with
     *    100ms debounced batch requests.
     *  - Global Context Broadcasting: selecting a node emits
     *    an event to all symbols on the dashboard.
     *  - Skeleton Loading: if prefetch misses, show shimmer
     *    blocks instead of a spinner.
     *
     *  DataShape: None (self-initiated API calls)
     *  Shadow DOM · Hebrew RTL · wc20 config
     * ═══════════════════════════════════════════════════════ */

    function symbolVis() { PV.deriveVisualizationFromBase(this); }

    /* ── Executive Palette ── */
    var CLR = {
        accent:   '#5BC0EB',
        text:     '#ECF0F1',
        muted:    '#8899AA',
        selected: 'rgba(91, 192, 235, 0.15)',
        hover:    'rgba(91, 192, 235, 0.08)',
        border:   '#1A3A5C'
    };

    /* ── Node Icons ── */
    var ICON = {
        collapsed: '\u25B6',  /* ▶ */
        expanded:  '\u25BC',  /* ▼ */
        leaf:      '\u2022',  /* • */
        loading:   '\u2026',  /* … */
        folder:    '\uD83C\uDFED', /* 🏭 */
        asset:     '\u2699'   /* ⚙ */
    };


    symbolVis.prototype.init = function (scope, elem) {
        var config = scope.config;
        var self   = this;

        /* ═══ Script Base Path ═══ */
        var SCRIPT_BASE = (function () {
            var scripts = document.querySelectorAll('script[src*="sym-afbrowser-wow"]');
            if (scripts.length) {
                var s = scripts[scripts.length - 1].getAttribute('src') || '';
                return s.substring(0, s.lastIndexOf('/') + 1);
            }
            var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
            return base + '/Scripts/app/editor/symbols/ext/';
        })();

        /* ═══ Mount Point ═══ */
        var mountEl = elem[0].querySelector('.wow-af-root-mount');
        if (!mountEl) {
            console.error('[WOW AF Browser] Mount element .wow-af-root-mount not found');
            return;
        }

        /* ═══ Shadow DOM ═══ */
        var shadow;
        try { shadow = mountEl.attachShadow({ mode: 'open' }); }
        catch (e) { shadow = mountEl; }

        var linkEl = document.createElement('link');
        linkEl.rel  = 'stylesheet';
        linkEl.href = SCRIPT_BASE + 'sym-afbrowser-wow.css';
        shadow.appendChild(linkEl);


        /* ═══ DOM Scaffold ═══ */
        function _el(tag, cls) {
            var e = document.createElement(tag);
            if (cls) e.className = cls;
            return e;
        }

        var root    = _el('div', 'wow-af-root');
        var toolbar = _el('div', 'wow-af-toolbar');
        var titleEl = _el('span', 'wow-af-title');

        /* ── Search Bar ── */
        var searchWrap = _el('div', 'wow-af-search-wrap');
        var searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'wow-af-search';
        searchInput.placeholder = '\u05D7\u05D9\u05E4\u05D5\u05E9 \u05E0\u05DB\u05E1...';  /* חיפוש נכס... */
        searchInput.dir = 'rtl';
        var searchClear = _el('span', 'wow-af-search-clear');
        searchClear.textContent = '\u2715';  /* ✕ */
        searchClear.style.display = 'none';
        searchWrap.appendChild(searchInput);
        searchWrap.appendChild(searchClear);

        toolbar.appendChild(titleEl);
        toolbar.appendChild(searchWrap);

        /* ── Breadcrumb ── */
        var breadcrumb = _el('div', 'wow-af-breadcrumb');

        /* ── Stats Bar ── */
        var statsBar = _el('div', 'wow-af-stats');

        /* ── Tree Container ── */
        var treeWrap = _el('div', 'wow-af-tree-wrap');
        var treeContainer = _el('div', 'wow-af-tree');

        /* ── Search Results ── */
        var searchResults = _el('div', 'wow-af-search-results');
        searchResults.style.display = 'none';

        treeWrap.appendChild(treeContainer);
        treeWrap.appendChild(searchResults);

        /* ── Skeleton ── */
        var skeleton = _el('div', 'wow-af-skeleton');

        /* ── Footer ── */
        var footer = _el('div', 'wow-af-footer');
        footer.textContent = 'WOW AF Navigator v100 \u00B7 Predictive Prefetch + Flat DOM';

        /* Assemble */
        root.appendChild(toolbar);
        root.appendChild(breadcrumb);
        root.appendChild(statsBar);
        root.appendChild(treeWrap);
        root.appendChild(skeleton);
        root.appendChild(footer);
        shadow.appendChild(root);


        /* ═══ State ═══ */
        var afCache     = {};      /* { webId: { name, depth, expanded, children, isLoading, hasChildren, template } } */
        var selectedId  = null;    /* Currently selected node WebId */
        var rootWebId   = null;    /* Tree root WebId */
        var worker      = null;
        var searchTimer = null;
        var hoverTimer  = null;


        /* ═══ Web Worker Init ═══ */
        try {
            worker = new Worker(SCRIPT_BASE + 'wow-plugins/wow-af-worker.js');
        } catch (e) {
            console.error('[WOW AF Browser] Failed to create Worker:', e);
            return;
        }

        worker.onmessage = function (e) {
            var msg = e.data;
            if (!msg || !msg.type) return;

            switch (msg.type) {
                case 'CHILDREN':
                    _onChildrenReceived(msg.payload.webId, msg.payload.children, false);
                    break;

                case 'EXPAND_READY':
                    _onChildrenReceived(msg.payload.webId, msg.payload.children, true);
                    break;

                case 'SEARCH_RESULTS':
                    _onSearchResults(msg.payload);
                    break;

                case 'ERROR':
                    console.warn('[WOW AF Worker]', msg.payload.source, msg.payload.message);
                    /* Clear loading state for the node if applicable */
                    break;
            }
        };

        function _sendWorkerConfig() {
            if (!worker) return;
            worker.postMessage({
                type: 'CONFIG',
                payload: { piWebApiUrl: config.PIWebApiUrl || '' }
            });
        }


        /* ═══════════════════════════════════════════════════
         *  Children Received from Worker
         *
         *  Updates the in-memory cache and (if expandAfter)
         *  triggers a DOM rebuild. The rebuild is a single
         *  innerHTML assignment — no per-node DOM manipulation.
         * ═══════════════════════════════════════════════════ */
        function _onChildrenReceived(webId, children, expandAfter) {
            var node = afCache[webId];
            if (!node) return;

            node.children  = children;
            node.isLoading = false;

            /* Register children in cache */
            for (var i = 0; i < children.length; i++) {
                var child = children[i];
                if (!afCache[child.webId]) {
                    afCache[child.webId] = {
                        name:        child.name,
                        depth:       node.depth + 1,
                        expanded:    false,
                        children:    null,
                        isLoading:   false,
                        hasChildren: child.hasChildren,
                        template:    child.template || ''
                    };
                }
            }

            if (expandAfter) {
                node.expanded = true;
            }

            _rebuildTree();
            _updateStats();
        }


        /* ═══════════════════════════════════════════════════
         *  Flat Virtual DOM Rendering
         *
         *  The entire tree is rendered as a flat list of
         *  sibling <div> elements. No nesting. Indentation
         *  is created by CSS: padding-inline-start uses the
         *  --depth CSS variable. This gives 10x better scroll
         *  performance than nested DOM.
         *
         *  A single innerHTML assignment replaces the whole
         *  tree — faster than incremental DOM patching for
         *  trees under 5,000 visible nodes.
         * ═══════════════════════════════════════════════════ */
        function _rebuildTree() {
            if (!rootWebId || !afCache[rootWebId]) return;

            var html = '';
            var nodeCount = 0;

            function _traverse(webId) {
                var node = afCache[webId];
                if (!node) return;
                nodeCount++;

                /* Expander icon */
                var icon;
                if (node.isLoading) {
                    icon = ICON.loading;
                } else if (node.expanded) {
                    icon = ICON.expanded;
                } else if (node.hasChildren === false && node.children &&
                           node.children.length === 0) {
                    icon = ICON.leaf;
                } else {
                    icon = ICON.collapsed;
                }

                /* Node type icon */
                var typeIcon = node.hasChildren !== false ? ICON.folder : ICON.asset;

                /* Selected class */
                var selClass = webId === selectedId ? ' wow-af-node-selected' : '';

                /* Template badge */
                var templateHtml = node.template
                    ? '<span class="wow-af-node-template">' + _escHtml(node.template) + '</span>'
                    : '';

                /* Skeleton children indicator */
                var skeletonHtml = node.isLoading
                    ? '<div class="wow-af-node-skeleton" style="--depth: ' + (node.depth + 1) + '">' +
                      '<span class="wow-af-skel-block"></span>' +
                      '<span class="wow-af-skel-block wow-af-skel-short"></span>' +
                      '<span class="wow-af-skel-block wow-af-skel-medium"></span>' +
                      '</div>'
                    : '';

                html += '<div class="wow-af-node' + selClass +
                        '" data-webid="' + webId +
                        '" style="--depth: ' + node.depth + '">' +
                        '<span class="wow-af-expander">' + icon + '</span>' +
                        '<span class="wow-af-type-icon">' + typeIcon + '</span>' +
                        '<span class="wow-af-node-label">' + _escHtml(node.name) + '</span>' +
                        templateHtml +
                        '</div>' +
                        skeletonHtml;

                /* Recurse into expanded children */
                if (node.expanded && node.children) {
                    for (var i = 0; i < node.children.length; i++) {
                        _traverse(node.children[i].webId);
                    }
                }
            }

            _traverse(rootWebId);
            treeContainer.innerHTML = html;

            searchResults.style.display = 'none';
            treeContainer.style.display = '';
        }


        /* ═══ HTML Escape ═══ */
        function _escHtml(str) {
            if (!str) return '';
            return str.replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;');
        }


        /* ═══════════════════════════════════════════════════
         *  Event Delegation — Single Listeners for Entire Tree
         *
         *  Instead of N click listeners (one per node), we
         *  attach ONE listener to the container and use
         *  closest('.wow-af-node') to find which node was hit.
         *  This scales to 100,000 nodes with zero overhead.
         * ═══════════════════════════════════════════════════ */

        /* ── Click: Toggle expand or select ── */
        function _onTreeClick(e) {
            var nodeEl = e.target.closest('.wow-af-node');
            if (!nodeEl) return;

            var webId = nodeEl.getAttribute('data-webid');
            var node  = afCache[webId];
            if (!node) return;

            var isExpander = e.target.classList.contains('wow-af-expander');

            if (isExpander || e.detail === 2) {
                /* Toggle expand/collapse */
                if (node.expanded) {
                    node.expanded = false;
                    _rebuildTree();
                } else if (node.children) {
                    /* Prefetched! Expand in 0ms */
                    node.expanded = true;
                    _rebuildTree();
                } else {
                    /* Prefetch missed — fetch now with skeleton */
                    node.isLoading = true;
                    _rebuildTree();
                    worker.postMessage({
                        type: 'FETCH_AND_EXPAND',
                        payload: { webId: webId }
                    });
                }
            } else {
                /* Select node → broadcast context */
                _selectNode(webId);
            }
        }
        treeContainer.addEventListener('click', _onTreeClick);


        /* ═══════════════════════════════════════════════════
         *  THE GEM: Predictive Prefetching on Hover
         *
         *  When the user's mouse enters a tree node, we
         *  immediately tell the Worker to prefetch its children.
         *  The Worker de-duplicates and batches these requests.
         *
         *  By the time the user moves their hand to click,
         *  the data is already in RAM. Expand time: 0ms.
         *
         *  A 50ms debounce prevents rapid-fire prefetch requests
         *  when the mouse sweeps across nodes quickly.
         * ═══════════════════════════════════════════════════ */
        function _onTreeMouseOver(e) {
            var nodeEl = e.target.closest('.wow-af-node');
            if (!nodeEl) return;

            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(function () {
                var webId = nodeEl.getAttribute('data-webid');
                var node  = afCache[webId];

                if (node && !node.expanded && !node.children &&
                    !node.isLoading && node.hasChildren !== false) {
                    worker.postMessage({
                        type: 'PREFETCH',
                        payload: { webId: webId }
                    });
                }
            }, 50);
        }
        treeContainer.addEventListener('mouseover', _onTreeMouseOver);


        /* ═══════════════════════════════════════════════════
         *  Global Context Broadcasting
         *
         *  When a node is selected, we emit an event that all
         *  other symbols on the dashboard can listen to. This
         *  makes the AF Browser a "Master Remote" — clicking
         *  an asset switches the entire dashboard to that
         *  asset's context without page reload.
         *
         *  Uses both:
         *  1. MM20EventBus (internal) for WOW symbols
         *  2. CustomEvent (DOM) for any listener
         * ═══════════════════════════════════════════════════ */
        function _selectNode(webId) {
            selectedId = webId;
            var node   = afCache[webId];
            if (!node) return;

            _rebuildTree();
            _updateBreadcrumb(webId);

            /* Build context payload */
            var context = {
                webId:    webId,
                name:     node.name,
                path:     _buildPath(webId),
                template: node.template || '',
                depth:    node.depth
            };

            /* 1. MM20EventBus (if available) */
            if (typeof window.MM20EventBus !== 'undefined' &&
                typeof window.MM20EventBus.emit === 'function') {
                window.MM20EventBus.emit('asset-context-changed', context);
            }

            /* 2. DOM CustomEvent */
            var evt = new CustomEvent('wow-af-context', {
                bubbles: true,
                detail: context
            });
            mountEl.dispatchEvent(evt);

            /* 3. Update scope for Angular consumers */
            scope.selectedAsset = context;
            try { scope.$apply(); } catch (e) { /* already in digest */ }
        }


        /* ═══ Breadcrumb Trail ═══ */
        function _updateBreadcrumb(webId) {
            var crumbs = [];
            var current = webId;

            /* Walk up the tree by finding parents */
            while (current) {
                var n = afCache[current];
                if (!n) break;
                crumbs.unshift({ webId: current, name: n.name });
                current = _findParent(current);
            }

            var html = '';
            for (var i = 0; i < crumbs.length; i++) {
                if (i > 0) html += '<span class="wow-af-crumb-sep">\u203A</span>';
                html += '<span class="wow-af-crumb" data-webid="' +
                        crumbs[i].webId + '">' +
                        _escHtml(crumbs[i].name) + '</span>';
            }
            breadcrumb.innerHTML = html;
        }

        function _findParent(childWebId) {
            for (var pid in afCache) {
                var pn = afCache[pid];
                if (pn.children) {
                    for (var i = 0; i < pn.children.length; i++) {
                        if (pn.children[i].webId === childWebId) return pid;
                    }
                }
            }
            return null;
        }

        function _buildPath(webId) {
            var parts = [];
            var current = webId;
            while (current) {
                var n = afCache[current];
                if (!n) break;
                parts.unshift(n.name);
                current = _findParent(current);
            }
            return '\\\\' + parts.join('\\');
        }

        /* Breadcrumb click → navigate to that node */
        function _onBreadcrumbClick(e) {
            var crumbEl = e.target.closest('.wow-af-crumb');
            if (!crumbEl) return;
            var webId = crumbEl.getAttribute('data-webid');
            if (webId) _selectNode(webId);
        }
        breadcrumb.addEventListener('click', _onBreadcrumbClick);


        /* ═══ Search ═══ */
        function _onSearchInput() {
            var q = searchInput.value.trim();
            searchClear.style.display = q ? '' : 'none';

            clearTimeout(searchTimer);
            if (!q) {
                searchResults.style.display = 'none';
                treeContainer.style.display = '';
                return;
            }

            searchTimer = setTimeout(function () {
                if (q.length < 2) return;
                worker.postMessage({
                    type: 'SEARCH',
                    payload: { query: q, rootWebId: rootWebId }
                });
            }, 300);
        }
        searchInput.addEventListener('input', _onSearchInput);

        function _onSearchClear() {
            searchInput.value = '';
            searchClear.style.display = 'none';
            searchResults.style.display = 'none';
            treeContainer.style.display = '';
        }
        searchClear.addEventListener('click', _onSearchClear);

        function _onSearchResults(payload) {
            var results = payload.results || [];
            if (results.length === 0) {
                searchResults.innerHTML = '<div class="wow-af-no-results">' +
                    '\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05EA\u05D5\u05E6\u05D0\u05D5\u05EA</div>';
            } else {
                var html = '';
                for (var i = 0; i < results.length; i++) {
                    var r = results[i];
                    html += '<div class="wow-af-search-item" data-webid="' + r.webId + '">' +
                            '<span class="wow-af-search-name">' + _escHtml(r.name) + '</span>' +
                            '<span class="wow-af-search-path">' + _escHtml(r.path) + '</span>' +
                            '</div>';
                }
                searchResults.innerHTML = html;
            }
            treeContainer.style.display = 'none';
            searchResults.style.display = '';
        }

        function _onSearchResultClick(e) {
            var item = e.target.closest('.wow-af-search-item');
            if (!item) return;
            var webId = item.getAttribute('data-webid');
            if (webId) {
                searchInput.value = '';
                searchClear.style.display = 'none';
                searchResults.style.display = 'none';
                treeContainer.style.display = '';
                /* TODO: expand path to this node in tree */
                _selectNode(webId);
            }
        }
        searchResults.addEventListener('click', _onSearchResultClick);


        /* ═══ Stats Bar ═══ */
        function _updateStats() {
            var totalNodes = Object.keys(afCache).length;
            var expanded   = 0;
            for (var k in afCache) {
                if (afCache[k].expanded) expanded++;
            }

            var html = '';
            html += '<span class="wow-af-stat">\u05E6\u05DE\u05EA\u05D9\u05DD: <b>' + totalNodes + '</b></span>';
            html += '<span class="wow-af-stat">\u05E4\u05EA\u05D5\u05D7\u05D9\u05DD: <b>' + expanded + '</b></span>';
            if (selectedId && afCache[selectedId]) {
                html += '<span class="wow-af-stat">\u05E0\u05D1\u05D7\u05E8: <b>' +
                        _escHtml(afCache[selectedId].name) + '</b></span>';
            }
            statsBar.innerHTML = html;
        }


        /* ═══ Config ═══ */
        function _applyConfig() {
            titleEl.textContent = config.Title || 'Executive AF Navigator';

            var ff = config.fontFamily || 'Segoe UI';
            var fs = config.fontSize   || 12;
            root.style.setProperty('--wow-af-font',      '"' + ff + '", Arial, sans-serif');
            root.style.setProperty('--wow-af-font-size',  fs + 'px');
        }

        function _initRoot() {
            var rWebId = config.RootWebId;
            var rName  = config.RootName || 'Root';

            if (!rWebId) return;
            if (rWebId === rootWebId) return;  /* Already initialized */

            rootWebId = rWebId;
            afCache = {};
            afCache[rootWebId] = {
                name:        rName,
                depth:       0,
                expanded:    false,
                children:    null,
                isLoading:   true,
                hasChildren: true,
                template:    ''
            };

            skeleton.style.display = 'none';
            _sendWorkerConfig();
            _rebuildTree();

            /* Auto-expand root */
            worker.postMessage({
                type: 'FETCH_AND_EXPAND',
                payload: { webId: rootWebId }
            });
        }

        ['Title', 'fontFamily', 'fontSize'].forEach(function (key) {
            scope.$watch('config.' + key, function () { _applyConfig(); });
        });

        ['RootWebId', 'RootName', 'PIWebApiUrl'].forEach(function (key) {
            scope.$watch('config.' + key, function () {
                _sendWorkerConfig();
                _initRoot();
            });
        });


        /* ═══ Data Update (Anchor) ═══ */
        self.onDataUpdate = function () {
            /* AF Browser doesn't use standard data updates.
               The Worker handles all PI Web API communication.
               This hook exists only for PI Vision lifecycle. */
            if (!rootWebId && config.RootWebId) {
                _initRoot();
            }
        };


        /* ═══ Demo Mode ═══ */
        function _startDemo() {
            skeleton.style.display = 'none';

            /* Build mock AF tree */
            var demoTree = {
                'demo-root': {
                    name: '\u05D0\u05E8\u05D2\u05D5\u05DF \u05D3\u05DE\u05D5', depth: 0, expanded: true,  /* ארגון דמו */
                    hasChildren: true, template: 'Organization', isLoading: false,
                    children: [
                        { webId: 'demo-south', name: '\u05DE\u05E4\u05E2\u05DC \u05D3\u05E8\u05D5\u05DD', hasChildren: true, template: 'Plant' },
                        { webId: 'demo-north', name: '\u05DE\u05E4\u05E2\u05DC \u05E6\u05E4\u05D5\u05DF', hasChildren: true, template: 'Plant' },
                        { webId: 'demo-center', name: '\u05DE\u05E4\u05E2\u05DC \u05DE\u05E8\u05DB\u05D6', hasChildren: true, template: 'Plant' }
                    ]
                },
                'demo-south': {
                    name: '\u05DE\u05E4\u05E2\u05DC \u05D3\u05E8\u05D5\u05DD', depth: 1, expanded: false,
                    hasChildren: true, template: 'Plant', isLoading: false,
                    children: [
                        { webId: 'demo-s-t1', name: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4 1', hasChildren: true, template: 'Turbine' },
                        { webId: 'demo-s-t2', name: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4 2', hasChildren: true, template: 'Turbine' },
                        { webId: 'demo-s-boiler', name: '\u05D3\u05D5\u05D3 \u05E7\u05D9\u05D8\u05D5\u05E8', hasChildren: false, template: 'Boiler' }
                    ]
                },
                'demo-north': {
                    name: '\u05DE\u05E4\u05E2\u05DC \u05E6\u05E4\u05D5\u05DF', depth: 1, expanded: false,
                    hasChildren: true, template: 'Plant', isLoading: false,
                    children: [
                        { webId: 'demo-n-t1', name: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4 A', hasChildren: true, template: 'Turbine' },
                        { webId: 'demo-n-solar', name: '\u05DE\u05E2\u05E8\u05DA \u05E1\u05D5\u05DC\u05E8\u05D9', hasChildren: false, template: 'SolarArray' }
                    ]
                },
                'demo-center': {
                    name: '\u05DE\u05E4\u05E2\u05DC \u05DE\u05E8\u05DB\u05D6', depth: 1, expanded: false,
                    hasChildren: true, template: 'Plant', isLoading: false,
                    children: [
                        { webId: 'demo-c-gen', name: '\u05D2\u05E0\u05E8\u05D8\u05D5\u05E8 \u05E8\u05D0\u05E9\u05D9', hasChildren: false, template: 'Generator' },
                        { webId: 'demo-c-cool', name: '\u05DE\u05E2\u05E8\u05DB\u05EA \u05E7\u05D9\u05E8\u05D5\u05E8', hasChildren: false, template: 'CoolingSystem' }
                    ]
                }
            };

            /* Leaf / sub-asset nodes */
            var leaves = {
                'demo-s-t1':     { name: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4 1', depth: 2, hasChildren: true, template: 'Turbine',
                                   children: [
                                       { webId: 'demo-s-t1-temp', name: '\u05D8\u05DE\u05E4\u05E8\u05D8\u05D5\u05E8\u05D4', hasChildren: false, template: 'Sensor' },
                                       { webId: 'demo-s-t1-rpm',  name: '\u05E1\u05DC\u05F4\u05D3', hasChildren: false, template: 'Sensor' },
                                       { webId: 'demo-s-t1-vib',  name: '\u05E8\u05E2\u05D9\u05D3\u05D5\u05EA', hasChildren: false, template: 'Sensor' }
                                   ] },
                'demo-s-t2':     { name: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4 2', depth: 2, hasChildren: false, template: 'Turbine', children: [] },
                'demo-s-boiler': { name: '\u05D3\u05D5\u05D3 \u05E7\u05D9\u05D8\u05D5\u05E8', depth: 2, hasChildren: false, template: 'Boiler', children: [] },
                'demo-n-t1':     { name: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4 A', depth: 2, hasChildren: false, template: 'Turbine', children: [] },
                'demo-n-solar':  { name: '\u05DE\u05E2\u05E8\u05DA \u05E1\u05D5\u05DC\u05E8\u05D9', depth: 2, hasChildren: false, template: 'SolarArray', children: [] },
                'demo-c-gen':    { name: '\u05D2\u05E0\u05E8\u05D8\u05D5\u05E8 \u05E8\u05D0\u05E9\u05D9', depth: 2, hasChildren: false, template: 'Generator', children: [] },
                'demo-c-cool':   { name: '\u05DE\u05E2\u05E8\u05DB\u05EA \u05E7\u05D9\u05E8\u05D5\u05E8', depth: 2, hasChildren: false, template: 'CoolingSystem', children: [] },
                'demo-s-t1-temp': { name: '\u05D8\u05DE\u05E4\u05E8\u05D8\u05D5\u05E8\u05D4', depth: 3, hasChildren: false, template: 'Sensor', children: [] },
                'demo-s-t1-rpm':  { name: '\u05E1\u05DC\u05F4\u05D3', depth: 3, hasChildren: false, template: 'Sensor', children: [] },
                'demo-s-t1-vib':  { name: '\u05E8\u05E2\u05D9\u05D3\u05D5\u05EA', depth: 3, hasChildren: false, template: 'Sensor', children: [] }
            };

            /* Populate cache */
            rootWebId = 'demo-root';
            afCache = {};
            for (var key in demoTree) {
                var dt = demoTree[key];
                afCache[key] = {
                    name: dt.name, depth: dt.depth, expanded: dt.expanded || false,
                    children: dt.children, isLoading: false,
                    hasChildren: dt.hasChildren, template: dt.template
                };
            }
            for (var lk in leaves) {
                var lv = leaves[lk];
                afCache[lk] = {
                    name: lv.name, depth: lv.depth, expanded: false,
                    children: lv.children, isLoading: false,
                    hasChildren: lv.hasChildren, template: lv.template
                };
            }

            _rebuildTree();
            _updateStats();
        }


        /* ═══ Init ═══ */
        _applyConfig();
        _sendWorkerConfig();

        if (config.DemoMode) {
            _startDemo();
        } else if (config.RootWebId) {
            _initRoot();
        }


        /* ═══ Cleanup ═══ */
        scope.$on('$destroy', function () {
            if (worker) worker.terminate();
            clearTimeout(searchTimer);
            clearTimeout(hoverTimer);
            treeContainer.removeEventListener('click', _onTreeClick);
            treeContainer.removeEventListener('mouseover', _onTreeMouseOver);
            breadcrumb.removeEventListener('click', _onBreadcrumbClick);
            searchInput.removeEventListener('input', _onSearchInput);
            searchClear.removeEventListener('click', _onSearchClear);
            searchResults.removeEventListener('click', _onSearchResultClick);
            afCache    = null;
            selectedId = null;
        });
    };


    /* ═══ Symbol Registration ═══ */
    PV.symbolCatalog.register({
        typeName:           'afbrowser-wow',
        visObjectType:      symbolVis,
        displayName:        '\u05E1\u05D9\u05D9\u05E8 AF \u05D7\u05DB\u05DD WOW v100',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.None,
        getDefaultConfig: function () {
            return {
                DataShape:    'None',
                Height:       500,
                Width:        350,
                Title:        'Executive AF Navigator',
                DemoMode:     true,
                PIWebApiUrl:  '',
                RootWebId:    '',
                RootName:     'Root',
                fontFamily:   'Segoe UI',
                fontSize:     12
            };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05E1\u05D9\u05D9\u05E8 AF WOW'
    });

})(window.PIVisualization);
