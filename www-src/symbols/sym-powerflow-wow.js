/**
 * ═══════════════════════════════════════════════════════
 *  sym-powerflow-wow.js  —  Executive Power Flow
 * ═══════════════════════════════════════════════════════
 *  GPU-accelerated SVG flow visualization.
 *  All animation runs on the CSS Compositor Thread:
 *    JS sets CSS Variables → GPU animates stroke-dashoffset
 *    → 60fps at zero CPU cost → scales to dozens of flows.
 *
 *  Architecture:
 *    PI Vision → dataUpdate() → rAF → set CSS Variables
 *    CSS @keyframes → GPU Compositor → 60fps animation
 *    JS touches DOM only when new PI data arrives (~5s)
 *
 *  Version : WOW PF 100.0
 *  Prefix  : wow-pf-
 * ═══════════════════════════════════════════════════════
 */

(function (PV) {
    'use strict';

    // ── Symbol constructor ──
    function symbolVis() {}
    PV.deriveVisualizationFromBase(symbolVis);

    var DATA_DEBOUNCE_MS = 100;

    // ── Resolve script base path ──
    var SCRIPT_BASE = (function () {
        var scripts = document.querySelectorAll('script[src*="sym-powerflow-wow"]');
        if (scripts.length) {
            var s = scripts[scripts.length - 1].getAttribute('src') || '';
            return s.substring(0, s.lastIndexOf('/') + 1);
        }
        var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
        return base + '/Scripts/app/editor/symbols/ext/';
    })();

    var SVG_NS = 'http://www.w3.org/2000/svg';


    // ═══════════════════════════════════════
    //  DEFAULT TOPOLOGY
    // ═══════════════════════════════════════

    var DEFAULT_NODES = [
        { id: 'gen1',  x: 100, y: 100, label: '\u05D9\u05D7\u05D9\u05D3\u05D4 1',  shape: 'circle', r: 36 },
        { id: 'gen2',  x: 100, y: 280, label: '\u05D9\u05D7\u05D9\u05D3\u05D4 2',  shape: 'circle', r: 36 },
        { id: 'gen3',  x: 100, y: 460, label: '\u05D9\u05D7\u05D9\u05D3\u05D4 3',  shape: 'circle', r: 36 },
        { id: 'bus',   x: 440, y: 280, label: '\u05E4\u05E1 \u05E8\u05D0\u05E9\u05D9', shape: 'rect', w: 90, h: 44 },
        { id: 'trans', x: 680, y: 280, label: '\u05E9\u05E0\u05D0\u05D9 \u05E8\u05D0\u05E9\u05D9', shape: 'rect', w: 90, h: 44 },
        { id: 'grid',  x: 920, y: 280, label: '\u05E8\u05E9\u05EA',     shape: 'diamond', r: 38 }
    ];

    var DEFAULT_FLOWS = [
        { id: 'f1', from: 'gen1', to: 'bus',   label: '\u05D9\u05D7.1 \u2192 \u05E4\u05E1' },
        { id: 'f2', from: 'gen2', to: 'bus',   label: '\u05D9\u05D7.2 \u2192 \u05E4\u05E1' },
        { id: 'f3', from: 'gen3', to: 'bus',   label: '\u05D9\u05D7.3 \u2192 \u05E4\u05E1' },
        { id: 'f4', from: 'bus',  to: 'trans',  label: '\u05E4\u05E1 \u2192 \u05E9\u05E0\u05D0\u05D9' },
        { id: 'f5', from: 'trans', to: 'grid',  label: '\u05E9\u05E0\u05D0\u05D9 \u2192 \u05E8\u05E9\u05EA' }
    ];


    // ═══════════════════════════════════════
    //  INIT
    // ═══════════════════════════════════════

    symbolVis.prototype.init = function (scope, elem) {
        var self = this;

        // ── Resolve container ──
        var rootEl = elem[0].querySelector('.wow-pf-root-mount');
        if (!rootEl) rootEl = elem[0];

        // ── Create Shadow DOM ──
        var shadow;
        try {
            shadow = rootEl.attachShadow({ mode: 'open' });
        } catch (e) {
            console.warn('[WOW-PF] Shadow DOM fallback');
            shadow = rootEl;
        }

        // ── Inject CSS ──
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = SCRIPT_BASE + 'sym-powerflow-wow.css';
        shadow.appendChild(link);

        // ── Build topology ──
        var nodes = scope.config.NodeDefs || DEFAULT_NODES;
        var flows = scope.config.FlowDefs || DEFAULT_FLOWS;

        buildDOM(shadow, nodes, flows, scope.config);

        // ── Cache DOM refs (once at init) ──
        self._pfShadow    = shadow;
        self._pfScope     = scope;
        self._pfNodes     = nodes;
        self._pfFlows     = flows;
        self._pfRaf          = null;
        self._pfDemoTimer    = null;
        self._pfPendingData  = null;
        self._pfDebounceId   = null;
        self._pfFirstDone    = false;
        self._pfFlowEls   = {};   // flow path elements by id
        self._pfValueEls  = {};   // value text elements by id
        self._pfNodeEls   = {};   // node group elements by id
        self._pfAggEl     = null; // aggregate bar

        for (var i = 0; i < flows.length; i++) {
            var fid = flows[i].id;
            self._pfFlowEls[fid]  = shadow.querySelector('[data-flow="' + fid + '"]');
            self._pfValueEls[fid] = shadow.querySelector('[data-flowval="' + fid + '"]');
        }
        for (var n = 0; n < nodes.length; n++) {
            self._pfNodeEls[nodes[n].id] = shadow.querySelector('[data-node="' + nodes[n].id + '"]');
        }
        self._pfAggEl   = shadow.querySelector('.wow-pf-agg');
        self._pfTooltip = shadow.querySelector('.wow-pf-tooltip');

        // ── Tooltip: single mousemove on SVG ──
        var svg = shadow.querySelector('.wow-pf-svg');
        var _onSvgMove = function (e) { self._onSvgMouseMove(e); };
        var _onSvgLeave = function () {
            if (self._pfTooltip) {
                self._pfTooltip.classList.remove('wow-pf-tooltip--visible');
            }
        };
        if (svg) {
            svg.addEventListener('mousemove', _onSvgMove);
            svg.addEventListener('mouseleave', _onSvgLeave);
        }

        // ── Demo mode ──
        if (scope.config.DemoMode) {
            self._startDemo();
        }

        // ── Config watchers ──
        scope.$watch('config.Warning',     function () { self._recomputeAll(); });
        scope.$watch('config.Critical',    function () { self._recomputeAll(); });
        scope.$watch('config.MaxCapacity', function () { self._recomputeAll(); });
        scope.$watch('config.NeonMode',    function () { self._toggleNeon(); });

        // ── Cleanup ──
        scope.$on('$destroy', function () {
            clearTimeout(self._pfDebounceId);
            self._pfPendingData = null;
            if (self._pfRaf) cancelAnimationFrame(self._pfRaf);
            if (self._pfDemoTimer) clearInterval(self._pfDemoTimer);
            if (svg) {
                svg.removeEventListener('mousemove', _onSvgMove);
                svg.removeEventListener('mouseleave', _onSvgLeave);
            }
            self._pfShadow = null;
            self._pfScope  = null;
            self._pfFlowEls = null;
            self._pfValueEls = null;
            self._pfNodeEls = null;
        });
    };


    // ═══════════════════════════════════════
    //  BUILD DOM (SVG + Chrome)
    // ═══════════════════════════════════════

    function buildDOM(shadow, nodes, flows, config) {
        // Root
        var root = document.createElement('div');
        root.className = 'wow-pf-root';
        if (config.NeonMode !== false) root.classList.add('wow-pf-neon');
        root.setAttribute('dir', 'rtl');

        // Header
        var header = document.createElement('div');
        header.className = 'wow-pf-header';
        header.innerHTML =
            '<span class="wow-pf-title">' + (config.Title || '\u05D6\u05E8\u05D9\u05DE\u05EA \u05D0\u05E0\u05E8\u05D2\u05D9\u05D4 WOW') + '</span>' +
            '<span class="wow-pf-live"><span class="wow-pf-live-dot"></span>\u05D7\u05D9</span>';
        root.appendChild(header);

        // Aggregate bar
        var agg = document.createElement('div');
        agg.className = 'wow-pf-agg';
        agg.innerHTML =
            '<span class="wow-pf-agg-item wow-pf-agg-gen">\u05D9\u05D9\u05E6\u05D5\u05E8: <b>--</b> MW</span>' +
            '<span class="wow-pf-agg-item wow-pf-agg-total">\u05E1\u05D4\u05F4\u05DB: <b>--</b> MW</span>' +
            '<span class="wow-pf-agg-item wow-pf-agg-max">\u05DE\u05E7\u05E1: <b>--</b> MW</span>';
        root.appendChild(agg);

        // SVG container
        var svgWrap = document.createElement('div');
        svgWrap.className = 'wow-pf-svg-wrap';

        var svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'wow-pf-svg');
        svg.setAttribute('viewBox', '0 0 1020 560');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

        // -- Defs: glow filter --
        var defs = document.createElementNS(SVG_NS, 'defs');
        var filter = document.createElementNS(SVG_NS, 'filter');
        filter.setAttribute('id', 'wow-pf-glow');
        filter.setAttribute('x', '-50%'); filter.setAttribute('y', '-50%');
        filter.setAttribute('width', '200%'); filter.setAttribute('height', '200%');
        var feGauss = document.createElementNS(SVG_NS, 'feGaussianBlur');
        feGauss.setAttribute('stdDeviation', '4');
        feGauss.setAttribute('result', 'glow');
        filter.appendChild(feGauss);
        var feMerge = document.createElementNS(SVG_NS, 'feMerge');
        var mn1 = document.createElementNS(SVG_NS, 'feMergeNode');
        mn1.setAttribute('in', 'glow');
        var mn2 = document.createElementNS(SVG_NS, 'feMergeNode');
        mn2.setAttribute('in', 'SourceGraphic');
        feMerge.appendChild(mn1);
        feMerge.appendChild(mn2);
        filter.appendChild(feMerge);
        defs.appendChild(filter);
        svg.appendChild(defs);

        // Build node position map
        var nodePos = {};
        for (var i = 0; i < nodes.length; i++) {
            nodePos[nodes[i].id] = { x: nodes[i].x, y: nodes[i].y };
        }

        // -- Flow paths (behind nodes) --
        var flowGroup = document.createElementNS(SVG_NS, 'g');
        flowGroup.setAttribute('class', 'wow-pf-flow-group');

        for (var f = 0; f < flows.length; f++) {
            var flow = flows[f];
            var fp = nodePos[flow.from];
            var tp = nodePos[flow.to];
            if (!fp || !tp) continue;

            // Cubic bezier path
            var mx = (fp.x + tp.x) / 2;
            var d = 'M' + fp.x + ',' + fp.y +
                    ' C' + mx + ',' + fp.y +
                    ' '  + mx + ',' + tp.y +
                    ' '  + tp.x + ',' + tp.y;

            // Background track (dim)
            var bg = document.createElementNS(SVG_NS, 'path');
            bg.setAttribute('class', 'wow-pf-flow-bg');
            bg.setAttribute('d', d);
            flowGroup.appendChild(bg);

            // Animated flow path (the Gem!)
            var path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('class', 'wow-pf-flow');
            path.setAttribute('d', d);
            path.setAttribute('data-flow', flow.id);
            path.setAttribute('data-label', flow.label || '');
            flowGroup.appendChild(path);

            // Value label at midpoint
            var midX = (fp.x + tp.x) / 2;
            var midY = (fp.y + tp.y) / 2;
            var valText = document.createElementNS(SVG_NS, 'text');
            valText.setAttribute('class', 'wow-pf-flow-value');
            valText.setAttribute('x', midX);
            valText.setAttribute('y', midY - 14);
            valText.setAttribute('text-anchor', 'middle');
            valText.setAttribute('data-flowval', flow.id);
            valText.textContent = '-- MW';
            flowGroup.appendChild(valText);
        }
        svg.appendChild(flowGroup);

        // -- Nodes (on top) --
        var nodeGroup = document.createElementNS(SVG_NS, 'g');
        nodeGroup.setAttribute('class', 'wow-pf-node-group');

        for (var n = 0; n < nodes.length; n++) {
            var node = nodes[n];
            var g = document.createElementNS(SVG_NS, 'g');
            g.setAttribute('class', 'wow-pf-node');
            g.setAttribute('data-node', node.id);

            if (node.shape === 'circle') {
                var circle = document.createElementNS(SVG_NS, 'circle');
                circle.setAttribute('cx', node.x);
                circle.setAttribute('cy', node.y);
                circle.setAttribute('r', node.r || 36);
                circle.setAttribute('class', 'wow-pf-node-shape');
                g.appendChild(circle);
            } else if (node.shape === 'rect') {
                var rect = document.createElementNS(SVG_NS, 'rect');
                var w = node.w || 90, h = node.h || 44;
                rect.setAttribute('x', node.x - w / 2);
                rect.setAttribute('y', node.y - h / 2);
                rect.setAttribute('width', w);
                rect.setAttribute('height', h);
                rect.setAttribute('rx', '8');
                rect.setAttribute('class', 'wow-pf-node-shape');
                g.appendChild(rect);
            } else if (node.shape === 'diamond') {
                var dia = document.createElementNS(SVG_NS, 'polygon');
                var r = node.r || 38;
                dia.setAttribute('points', [
                    node.x + ',' + (node.y - r),
                    (node.x + r) + ',' + node.y,
                    node.x + ',' + (node.y + r),
                    (node.x - r) + ',' + node.y
                ].join(' '));
                dia.setAttribute('class', 'wow-pf-node-shape');
                g.appendChild(dia);
            }

            // Node label
            var lbl = document.createElementNS(SVG_NS, 'text');
            lbl.setAttribute('class', 'wow-pf-node-label');
            lbl.setAttribute('x', node.x);
            lbl.setAttribute('y', node.y + (node.r || (node.h ? node.h / 2 : 36)) + 20);
            lbl.setAttribute('text-anchor', 'middle');
            lbl.textContent = node.label;
            g.appendChild(lbl);

            // Node inner value
            var nval = document.createElementNS(SVG_NS, 'text');
            nval.setAttribute('class', 'wow-pf-node-value');
            nval.setAttribute('x', node.x);
            nval.setAttribute('y', node.y + 5);
            nval.setAttribute('text-anchor', 'middle');
            nval.textContent = '';
            g.appendChild(nval);

            nodeGroup.appendChild(g);
        }
        svg.appendChild(nodeGroup);

        svgWrap.appendChild(svg);
        root.appendChild(svgWrap);

        // Tooltip
        var tip = document.createElement('div');
        tip.className = 'wow-pf-tooltip';
        root.appendChild(tip);

        shadow.appendChild(root);
    }


    // ═══════════════════════════════════════
    //  DATA UPDATE — PI Vision → CSS Variables
    // ═══════════════════════════════════════

    symbolVis.prototype._processDataUpdate = function (data) {
        if (!data || !this._pfFlowEls) return;
        var self = this;

        // Parse rows into flow values
        var values = {};
        var rows = data.Rows || [];
        var flows = self._pfFlows;

        // Map by index: Row[i] → Flow[i]
        for (var i = 0; i < Math.min(rows.length, flows.length); i++) {
            var row = rows[i];
            if (row && row.Value !== undefined) {
                values[flows[i].id] = parseFloat(row.Value) || 0;
            }
        }

        // Also try matching by Label
        for (var j = 0; j < rows.length; j++) {
            var r = rows[j];
            if (!r || !r.Label) continue;
            for (var k = 0; k < flows.length; k++) {
                if (r.Label.indexOf(flows[k].id) >= 0 || r.Label.indexOf(flows[k].from) >= 0) {
                    values[flows[k].id] = parseFloat(r.Value) || 0;
                }
            }
        }

        self._pfLastValues = values;

        // Batch DOM updates in single rAF
        if (self._pfRaf) cancelAnimationFrame(self._pfRaf);
        self._pfRaf = requestAnimationFrame(function () {
            self._applyFlowCSS(values);
        });
    };

    symbolVis.prototype.dataUpdate = function (data) {
        if (!data || !this._pfFlowEls) return;
        var self = this;
        self._pfPendingData = data;
        if (!self._pfFirstDone) {
            self._pfFirstDone = true;
            self._processDataUpdate(data);
            self._pfPendingData = null;
            return;
        }
        if (!self._pfDebounceId) {
            self._pfDebounceId = setTimeout(function () {
                self._pfDebounceId = null;
                if (self._pfPendingData) {
                    self._processDataUpdate(self._pfPendingData);
                    self._pfPendingData = null;
                }
            }, DATA_DEBOUNCE_MS);
        }
    };


    // ═══════════════════════════════════════
    //  APPLY CSS VARIABLES (the Gem!)
    // ═══════════════════════════════════════

    symbolVis.prototype._applyFlowCSS = function (values) {
        var scope  = this._pfScope;
        if (!scope) return;
        var config = scope.config;
        var maxCap = config.MaxCapacity || 100;
        var warn   = config.Warning     || 80;
        var crit   = config.Critical    || 95;
        var dec    = config.Decimals    || 1;
        var flows  = this._pfFlows;

        var totalGen = 0, maxVal = 0;

        for (var i = 0; i < flows.length; i++) {
            var fid  = flows[i].id;
            var val  = values[fid] || 0;
            var absV = Math.abs(val);

            // ── Color by threshold ──
            var color;
            var pct = (absV / maxCap) * 100;
            if (pct >= crit)      color = '#FF3B30';   // Critical red
            else if (pct >= warn) color = '#FFCC00';   // Warning amber
            else                  color = '#00F5D4';   // Neon turquoise

            // ── Duration: high value = fast animation ──
            //    Range: 5s (idle) → 0.3s (max capacity)
            var ratio = Math.min(absV / maxCap, 1);
            var duration = 5 - (ratio * 4.7);
            if (duration < 0.3) duration = 0.3;

            // ── Direction: negative = reverse ──
            var direction = val < 0 ? 'reverse' : 'normal';

            // ── Width: proportional to capacity (2px – 8px) ──
            var width = 2 + (ratio * 6);

            // ── Set CSS Variables on the flow path element ──
            var pathEl = this._pfFlowEls[fid];
            if (pathEl) {
                pathEl.style.setProperty('--flow-color',     color);
                pathEl.style.setProperty('--flow-duration',  duration + 's');
                pathEl.style.setProperty('--flow-direction', direction);
                pathEl.style.setProperty('--flow-width',     width + 'px');
                pathEl.style.setProperty('--flow-opacity',   Math.max(0.3, ratio).toFixed(2));
            }

            // ── Update value text ──
            var valEl = this._pfValueEls[fid];
            if (valEl) {
                valEl.textContent = val.toFixed(dec) + ' MW';
                valEl.style.fill = color;
            }

            totalGen += val;
            if (absV > maxVal) maxVal = absV;
        }

        // ── Update aggregate bar ──
        if (this._pfAggEl) {
            var genEl = this._pfAggEl.querySelector('.wow-pf-agg-gen b');
            var totEl = this._pfAggEl.querySelector('.wow-pf-agg-total b');
            var mxEl  = this._pfAggEl.querySelector('.wow-pf-agg-max b');
            if (genEl) genEl.textContent = totalGen.toFixed(dec);
            if (totEl) totEl.textContent = totalGen.toFixed(dec);
            if (mxEl)  mxEl.textContent  = maxVal.toFixed(dec);
        }
    };


    // ═══════════════════════════════════════
    //  RECOMPUTE (config change → reapply)
    // ═══════════════════════════════════════

    symbolVis.prototype._recomputeAll = function () {
        if (this._pfLastValues) {
            this._applyFlowCSS(this._pfLastValues);
        }
    };


    // ═══════════════════════════════════════
    //  NEON MODE TOGGLE
    // ═══════════════════════════════════════

    symbolVis.prototype._toggleNeon = function () {
        if (!this._pfShadow) return;
        var root = this._pfShadow.querySelector('.wow-pf-root');
        if (!root) return;
        if (this._pfScope && this._pfScope.config.NeonMode !== false) {
            root.classList.add('wow-pf-neon');
        } else {
            root.classList.remove('wow-pf-neon');
        }
    };


    // ═══════════════════════════════════════
    //  TOOLTIP (SVG mousemove)
    // ═══════════════════════════════════════

    symbolVis.prototype._onSvgMouseMove = function (e) {
        var target = e.target;
        var tip = this._pfTooltip;
        if (!tip) return;

        // Check if hovering a flow path
        if (target.classList.contains('wow-pf-flow')) {
            var fid   = target.getAttribute('data-flow');
            var label = target.getAttribute('data-label') || fid;
            var val   = (this._pfLastValues && this._pfLastValues[fid]) || 0;

            tip.innerHTML =
                '<div class="wow-pf-tooltip-title">' + label + '</div>' +
                '<div class="wow-pf-tooltip-row">' +
                    '<span>\u05E2\u05E8\u05DA:</span><b>' + val.toFixed(1) + ' MW</b>' +
                '</div>';

            var rect = this._pfShadow.querySelector('.wow-pf-svg-wrap').getBoundingClientRect();
            tip.style.left = (e.clientX - rect.left + 12) + 'px';
            tip.style.top  = (e.clientY - rect.top - 40)  + 'px';
            tip.classList.add('wow-pf-tooltip--visible');
        } else {
            tip.classList.remove('wow-pf-tooltip--visible');
        }
    };


    // ═══════════════════════════════════════
    //  DEMO MODE (simulated MW fluctuation)
    // ═══════════════════════════════════════

    symbolVis.prototype._startDemo = function () {
        var self = this;
        var flows = self._pfFlows;
        var config = self._pfScope.config;
        var maxCap = config.MaxCapacity || 100;

        // Initial values
        var demoVals = {};
        for (var i = 0; i < flows.length; i++) {
            demoVals[flows[i].id] = 30 + Math.random() * 50;
        }

        function tick() {
            for (var j = 0; j < flows.length; j++) {
                var fid = flows[j].id;
                // Random walk with mean reversion
                var delta = (Math.random() - 0.5) * 10;
                demoVals[fid] = Math.max(5, Math.min(maxCap * 1.1, demoVals[fid] + delta));
            }
            self._pfLastValues = demoVals;
            if (self._pfRaf) cancelAnimationFrame(self._pfRaf);
            self._pfRaf = requestAnimationFrame(function () {
                self._applyFlowCSS(demoVals);
            });
        }

        tick(); // Initial
        self._pfDemoTimer = setInterval(tick, 3000); // Every 3s like real PI data
    };


    // ═══════════════════════════════════════
    //  REGISTRATION
    // ═══════════════════════════════════════

    PV.symbolCatalog.register({
        typeName:           'powerflow-wow',
        displayName:        '\u05D6\u05E8\u05D9\u05DE\u05EA \u05D0\u05E0\u05E8\u05D2\u05D9\u05D4 WOW v100',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:            SCRIPT_BASE + 'images/wow-icon.svg',
        visObjectType:      symbolVis,

        getDefaultConfig: function () {
            return {
                DataShape:    'Value',
                Height:       500,
                Width:        1000,
                Title:        '\u05D6\u05E8\u05D9\u05DE\u05EA \u05D0\u05E0\u05E8\u05D2\u05D9\u05D4 WOW',
                DemoMode:     true,
                Warning:      80,
                Critical:     95,
                MaxCapacity:  100,
                Decimals:     1,
                NeonMode:     true,
                ShowValues:   true,
                NodeDefs:     null,
                FlowDefs:     null,
                fontFamily:   'Segoe UI',
                fontSize:     12
            };
        },

        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05D6\u05E8\u05D9\u05DE\u05EA \u05D0\u05E0\u05E8\u05D2\u05D9\u05D4 WOW'
    });

})(window.PIVisualization);
