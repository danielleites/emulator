/**
 * emu-visual-fallback.js — Universal Visual Fallback Renderer
 * ============================================================
 * When PI Vision symbol orchestrators init but their jQuery widget
 * plugins aren't available, the symbol area stays blank.
 * This module detects empty symbols and injects type-appropriate
 * mock visualizations (SVG gauge, bar chart, line chart, pie, table, etc.)
 *
 * NOTE: This is an internal emulator tool for demo/QA purposes only.
 * All content is generated from hardcoded Hebrew labels and random numbers.
 * No untrusted/external data is ever used in the HTML generation.
 *
 * Hooks into EMU._afterRender(symName, wrapperEl) called by app.js.
 * Version: R300e
 */
(function (root) {
    'use strict';

    var FALLBACK_DELAY = 1200;

    /* Palette */
    var C = {
        bg:      '#0D1B2A',
        panel:   '#132238',
        accent:  '#5BC0EB',
        green:   '#00D4AA',
        orange:  '#F39C12',
        red:     '#E74C3C',
        text:    '#E2EAF4',
        dim:     '#6B7D99',
        grid:    '#1B3352'
    };

    /* Visualization Type Map — maps symbol name to viz type */
    var TYPE_MAP = {
        'gauge20': 'gauge', 'unitstatus20': 'statusgrid', 'freqmtr20': 'gauge',
        'resrvind20': 'gauge', 'piechart20': 'pie', 'funnel20': 'funnel',
        'radar20': 'radar', 'heatmap20': 'heatmap', 'treemap20': 'treemap',
        'scatter20': 'scatter', 'trend20': 'trend', 'trendchart20': 'trend',
        'loadcurve20': 'trend', 'comparison20': 'bars', 'waterfall20': 'bars',
        'gantt20': 'gantt', 'dtblpro20': 'table', 'evtcomp20': 'table',
        'evtwrtr20': 'table', 'powerflow20': 'flow', 'digitaltwin-wow': 'flow',
        'maindash20': 'dashboard', 'co2emis20': 'trend', 'constmon20': 'statusgrid',
        'genblock20': 'statusgrid', 'asstcmp20': 'bars', 'asstovr20': 'dashboard',
        'renewwdg20': 'gauge', 'reportgen20': 'table', 'traflit20': 'statusgrid',
        'mugbalot-wow': 'statusgrid', 'wow-heatmap': 'heatmap',
        'comparison-wow': 'bars', 'trend-wow': 'trend', 'table-wow': 'table',
        'gauge-wow': 'gauge', 'gantt-wow': 'gantt', 'piechart-wow': 'pie',
        'radar-wow': 'radar', 'treemap-wow': 'treemap', 'trellis-wow': 'bars',
        'funnel-wow': 'funnel', 'waterfall-wow': 'bars', 'scatter-wow': 'scatter',
        'powerflow-wow': 'flow',
        'mugmon20': 'statusgrid', 'mugmoni20': 'statusgrid', 'mugult20': 'dashboard',
        'mm20-calc': 'gauge', 'mm20-batch': 'gantt', 'mm20-notif': 'table',
        'mm20-alarm': 'statusgrid', 'mm20-kbd': 'dashboard', 'mm20-afbrowser': 'table',
        'mm20-aftable': 'table', 'mm20-aftree': 'table', 'mm20-tagwatch': 'trend',
        'mm20-health': 'statusgrid', 'mm20-report': 'table', 'mm20-scheduler': 'gantt'
    };

    /* Random helpers */
    function rnd(min, max) { return min + Math.random() * (max - min); }
    function rndInt(min, max) { return Math.floor(rnd(min, max)); }

    /* Safe DOM element creation helpers (no innerHTML with untrusted data) */
    function el(tag, attrs, children) {
        var e = document.createElement(tag);
        if (attrs) {
            for (var k in attrs) {
                if (k === 'text') { e.textContent = attrs[k]; }
                else if (k === 'style' && typeof attrs[k] === 'object') {
                    for (var s in attrs[k]) e.style[s] = attrs[k][s];
                } else if (k === 'style') { e.style.cssText = attrs[k]; }
                else { e.setAttribute(k, attrs[k]); }
            }
        }
        if (children) {
            for (var i = 0; i < children.length; i++) {
                if (typeof children[i] === 'string') e.appendChild(document.createTextNode(children[i]));
                else if (children[i]) e.appendChild(children[i]);
            }
        }
        return e;
    }

    function svgEl(tag, attrs) {
        var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
        if (attrs) {
            for (var k in attrs) {
                if (k === 'text') { e.textContent = attrs[k]; }
                else { e.setAttribute(k, attrs[k]); }
            }
        }
        return e;
    }

    function svgRoot(w, h) {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
        svg.style.cssText = 'width:100%;height:auto;max-height:280px;display:block;margin:0 auto;';
        return svg;
    }

    /* ── SVG Renderers (return DOM elements) ── */

    function renderGauge() {
        var val = rnd(30, 95);
        var cx = 120, cy = 110, r = 80;
        var startA = -135 * Math.PI / 180, endA = 135 * Math.PI / 180;
        var valA = (-135 + (val / 100) * 270) * Math.PI / 180;

        function arc(cx, cy, r, s, e) {
            var x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
            var x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
            return 'M ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + ((e - s > Math.PI) ? 1 : 0) + ' 1 ' + x2 + ' ' + y2;
        }

        var color = val > 80 ? C.green : val > 50 ? C.accent : C.orange;
        var svg = svgRoot(240, 200);
        var bg = svgEl('path', { d: arc(cx, cy, r, startA, endA), fill: 'none', stroke: C.grid, 'stroke-width': '16', 'stroke-linecap': 'round' });
        var fg = svgEl('path', { d: arc(cx, cy, r, startA, valA), fill: 'none', stroke: color, 'stroke-width': '16', 'stroke-linecap': 'round' });
        var txt = svgEl('text', { x: cx, y: cy + 5, 'text-anchor': 'middle', fill: C.text, 'font-size': '32', 'font-weight': '700', text: val.toFixed(1) });
        var unit = svgEl('text', { x: cx, y: cy + 25, 'text-anchor': 'middle', fill: C.dim, 'font-size': '12', text: 'MW' });
        svg.appendChild(bg); svg.appendChild(fg); svg.appendChild(txt); svg.appendChild(unit);
        return svg;
    }

    function renderTrend() {
        var pts = 30, w = 400, h = 180, pad = 30;
        var data = [], base = rnd(100, 500);
        for (var i = 0; i < pts; i++) { base += rnd(-30, 30); if (base < 50) base = 50; data.push(base); }
        var min = Math.min.apply(null, data), max = Math.max.apply(null, data), range = max - min || 1;

        var svg = svgRoot(w, h);
        // Grid
        for (var g = 0; g < 5; g++) {
            var gy = pad + (h - 2 * pad) * g / 4;
            svg.appendChild(svgEl('line', { x1: pad, y1: gy, x2: w - pad, y2: gy, stroke: C.grid, 'stroke-width': '0.5' }));
            svg.appendChild(svgEl('text', { x: pad - 4, y: gy + 4, 'text-anchor': 'end', fill: C.dim, 'font-size': '9', text: (max - range * g / 4).toFixed(0) }));
        }
        // Path
        var path = '', area = '';
        for (var i = 0; i < pts; i++) {
            var x = pad + i * (w - 2 * pad) / (pts - 1);
            var y = pad + (1 - (data[i] - min) / range) * (h - 2 * pad);
            path += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
            area += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
        }
        area += 'L' + (w - pad) + ' ' + (h - pad) + ' L' + pad + ' ' + (h - pad) + ' Z';

        var defs = svgEl('defs');
        var grad = svgEl('linearGradient', { id: 'tGrad', x1: '0', y1: '0', x2: '0', y2: '1' });
        grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': C.accent }));
        grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': 'transparent' }));
        defs.appendChild(grad);
        svg.appendChild(defs);
        svg.appendChild(svgEl('path', { d: area, fill: 'url(#tGrad)', opacity: '0.3' }));
        svg.appendChild(svgEl('path', { d: path, fill: 'none', stroke: C.accent, 'stroke-width': '2' }));

        var times = ['7d', '5d', '3d', '1d', 'Now'];
        for (var t = 0; t < times.length; t++) {
            svg.appendChild(svgEl('text', { x: pad + t * (w - 2 * pad) / 4, y: h - 5, 'text-anchor': 'middle', fill: C.dim, 'font-size': '9', text: times[t] }));
        }
        return svg;
    }

    function renderBars() {
        var labels = ['\u05D9\u05D71', '\u05D9\u05D72', '\u05D9\u05D73', '\u05D9\u05D74', '\u05D9\u05D75', '\u05D9\u05D76'];
        var w = 360, h = 180, pad = 35, n = labels.length;
        var barW = (w - 2 * pad) / n * 0.7, gap = (w - 2 * pad) / n * 0.3;
        var svg = svgRoot(w, h);
        for (var g = 0; g <= 4; g++) {
            var gy = pad + (h - 2 * pad) * g / 4;
            svg.appendChild(svgEl('line', { x1: pad, y1: gy, x2: w - pad, y2: gy, stroke: C.grid, 'stroke-width': '0.5' }));
        }
        for (var i = 0; i < n; i++) {
            var val = rnd(20, 100), barH = val / 100 * (h - 2 * pad);
            var x = pad + i * (barW + gap) + gap / 2, y = h - pad - barH;
            var color = val > 80 ? C.green : val > 50 ? C.accent : C.orange;
            svg.appendChild(svgEl('rect', { x: x, y: y, width: barW, height: barH, rx: '3', fill: color, opacity: '0.85' }));
            svg.appendChild(svgEl('text', { x: x + barW / 2, y: h - pad + 14, 'text-anchor': 'middle', fill: C.dim, 'font-size': '9', text: labels[i] }));
            svg.appendChild(svgEl('text', { x: x + barW / 2, y: y - 4, 'text-anchor': 'middle', fill: C.text, 'font-size': '10', text: val.toFixed(0) }));
        }
        return svg;
    }

    function renderPie() {
        var segs = [
            { label: '\u05D2\u05D6', pct: rnd(30, 50), color: C.accent },
            { label: '\u05E4\u05D7\u05DD', pct: rnd(15, 30), color: C.orange },
            { label: '\u05E1\u05D5\u05DC\u05E8', pct: rnd(5, 15), color: C.red },
            { label: '\u05E8\u05D5\u05D7', pct: rnd(5, 15), color: C.green },
            { label: '\u05E9\u05DE\u05E9', pct: rnd(3, 10), color: '#FFD93D' }
        ];
        var total = 0; for (var i = 0; i < segs.length; i++) total += segs[i].pct;
        for (var i = 0; i < segs.length; i++) segs[i].pct = segs[i].pct / total * 100;

        var cx = 120, cy = 100, r = 80, svg = svgRoot(300, 210);
        var startAngle = -90;
        for (var i = 0; i < segs.length; i++) {
            var sweep = segs[i].pct / 100 * 360, endAngle = startAngle + sweep;
            var s1 = startAngle * Math.PI / 180, s2 = endAngle * Math.PI / 180;
            var d = 'M' + cx + ' ' + cy + ' L' + (cx + r * Math.cos(s1)) + ' ' + (cy + r * Math.sin(s1)) +
                    ' A' + r + ' ' + r + ' 0 ' + (sweep > 180 ? 1 : 0) + ' 1 ' + (cx + r * Math.cos(s2)) + ' ' + (cy + r * Math.sin(s2)) + ' Z';
            svg.appendChild(svgEl('path', { d: d, fill: segs[i].color, opacity: '0.85' }));
            startAngle = endAngle;
            // Legend
            var ly = 25 + i * 18;
            svg.appendChild(svgEl('rect', { x: 255, y: ly, width: 10, height: 10, rx: 2, fill: segs[i].color }));
            svg.appendChild(svgEl('text', { x: 250, y: ly + 9, 'text-anchor': 'end', fill: C.text, 'font-size': '11', text: segs[i].label + ' ' + segs[i].pct.toFixed(0) + '%' }));
        }
        return svg;
    }

    function renderStatusGrid() {
        var units = ['\u05D9\u05D7\u05B3 1', '\u05D9\u05D7\u05B3 2', '\u05D9\u05D7\u05B3 3', '\u05D9\u05D7\u05B3 4', '\u05D9\u05D7\u05B3 5', '\u05D9\u05D7\u05B3 6', '\u05D9\u05D7\u05B3 7', '\u05D9\u05D7\u05B3 8'];
        var grid = el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px;direction:rtl;' });
        for (var i = 0; i < units.length; i++) {
            var val = rnd(0, 800).toFixed(0);
            var st = val > 500 ? 0 : val > 200 ? 1 : 2;
            var colors = [C.green, C.orange, C.red];
            var labels = ['\u05E4\u05E2\u05D9\u05DC', '\u05D0\u05D6\u05D4\u05E8\u05D4', '\u05DE\u05E0\u05D5\u05EA\u05E7'];
            var card = el('div', { style: 'background:' + C.panel + ';border:1px solid ' + colors[st] + '44;border-radius:8px;padding:10px;text-align:center;' }, [
                el('div', { style: 'color:' + C.dim + ';font-size:11px;margin-bottom:4px;', text: units[i] }),
                el('div', { style: 'color:' + C.text + ';font-size:20px;font-weight:700;', text: val }),
                el('div', { style: 'font-size:10px;color:' + colors[st] + ';', text: '\u25CF ' + labels[st] })
            ]);
            grid.appendChild(card);
        }
        return grid;
    }

    function renderTable() {
        var headers = ['\u05DE\u05D3\u05D3', '\u05E2\u05E8\u05DA', '\u05D9\u05D7\u05D9\u05D3\u05D4', '\u05E1\u05D8\u05D8\u05D5\u05E1'];
        var rows = [
            ['\u05DB\u05D5\u05D7 \u05E4\u05E2\u05D9\u05DC', rnd(200, 600).toFixed(1), 'MW', '\u05EA\u05E7\u05D9\u05DF'],
            ['\u05E2\u05D5\u05DE\u05E1 \u05D2\u05D6', rnd(100, 400).toFixed(1), 'MSCF/h', '\u05EA\u05E7\u05D9\u05DF'],
            ['\u05D8\u05DE\u05E4. \u05E4\u05DC\u05D9\u05D8\u05D4', rnd(400, 650).toFixed(0), '\u00B0C', rnd(0,1)>0.5?'\u05D0\u05D6\u05D4\u05E8\u05D4':'\u05EA\u05E7\u05D9\u05DF'],
            ['\u05DE\u05EA\u05D7', rnd(13, 16).toFixed(1), 'kV', '\u05EA\u05E7\u05D9\u05DF'],
            ['\u05D6\u05E8\u05DD', rnd(8000, 12000).toFixed(0), 'A', '\u05EA\u05E7\u05D9\u05DF'],
            ['\u05EA\u05D3\u05D9\u05E8\u05D5\u05EA', rnd(49.9, 50.1).toFixed(2), 'Hz', '\u05EA\u05E7\u05D9\u05DF']
        ];
        var tbl = el('table', { style: 'width:100%;border-collapse:collapse;direction:rtl;font-size:13px;' });
        var thead = el('thead');
        var tr = el('tr');
        for (var h = 0; h < headers.length; h++) {
            tr.appendChild(el('th', { style: 'text-align:right;padding:8px 10px;border-bottom:2px solid ' + C.accent + '44;color:' + C.accent + ';font-weight:600;', text: headers[h] }));
        }
        thead.appendChild(tr); tbl.appendChild(thead);
        var tbody = el('tbody');
        for (var r = 0; r < rows.length; r++) {
            var row = el('tr');
            for (var c = 0; c < rows[r].length; c++) {
                var style = 'padding:7px 10px;border-bottom:1px solid ' + C.grid + ';';
                if (c === 3) style += 'color:' + (rows[r][c] === '\u05EA\u05E7\u05D9\u05DF' ? C.green : C.orange) + ';';
                else if (c === 1) style += 'font-weight:600;color:' + C.text + ';';
                else style += 'color:' + C.dim + ';';
                row.appendChild(el('td', { style: style, text: rows[r][c] }));
            }
            tbody.appendChild(row);
        }
        tbl.appendChild(tbody);
        return tbl;
    }

    function renderHeatmap() {
        var rows = 6, cols = 8;
        var w = 360, h = 200, pad = 40;
        var cellW = (w - 2 * pad) / cols, cellH = (h - 2 * pad) / rows;
        var svg = svgRoot(w, h);
        var params = ['MW', 'TEMP', 'FREQ', 'VOLT', 'CURR', 'EFF'];
        for (var r = 0; r < rows; r++) {
            svg.appendChild(svgEl('text', { x: pad - 4, y: pad + r * cellH + cellH / 2 + 4, 'text-anchor': 'end', fill: C.dim, 'font-size': '9', text: params[r] }));
            for (var c = 0; c < cols; c++) {
                var val = rnd(0, 100), hue = val > 70 ? 150 : val > 40 ? 45 : 0;
                svg.appendChild(svgEl('rect', { x: pad + c * cellW, y: pad + r * cellH, width: cellW - 2, height: cellH - 2, rx: 3, fill: 'hsl(' + hue + ',70%,40%)', opacity: '0.8' }));
                svg.appendChild(svgEl('text', { x: pad + c * cellW + cellW / 2, y: pad + r * cellH + cellH / 2 + 4, 'text-anchor': 'middle', fill: C.text, 'font-size': '8', text: val.toFixed(0) }));
            }
        }
        return svg;
    }

    function renderFunnel() {
        var stages = [
            { label: '\u05D9\u05D9\u05E6\u05D5\u05E8 \u05D1\u05E8\u05D5\u05D8\u05D5', val: rnd(7000, 9000) },
            { label: '\u05E6\u05E8\u05D9\u05DB\u05D4 \u05E2\u05E6\u05DE\u05D9\u05EA', val: rnd(5000, 7000) },
            { label: '\u05DC\u05E8\u05E9\u05EA', val: rnd(4000, 5500) },
            { label: '\u05D0\u05E1\u05E4\u05E7\u05D4 \u05E0\u05D8\u05D5', val: rnd(3500, 4500) }
        ];
        var w = 300, h = 200, svg = svgRoot(w, h);
        var colors = [C.accent, C.green, C.orange, '#FFD93D'];
        for (var i = 0; i < stages.length; i++) {
            var pct = stages[i].val / stages[0].val, bw = pct * 200, x = (w - bw) / 2, y = 15 + i * 45;
            svg.appendChild(svgEl('rect', { x: x, y: y, width: bw, height: 32, rx: 4, fill: colors[i], opacity: '0.8' }));
            svg.appendChild(svgEl('text', { x: w / 2, y: y + 20, 'text-anchor': 'middle', fill: C.bg, 'font-size': '11', 'font-weight': '600', text: stages[i].label + '  ' + stages[i].val.toFixed(0) + ' MW' }));
        }
        return svg;
    }

    function renderGantt() {
        var tasks = ['\u05D0\u05EA\u05D7\u05D5\u05DC', '\u05D7\u05D9\u05DE\u05D5\u05DD', '\u05E1\u05E0\u05DB\u05E8\u05D5\u05DF', '\u05E2\u05D5\u05DE\u05E1 50%', '\u05E2\u05D5\u05DE\u05E1 75%', '\u05E2\u05D5\u05DE\u05E1 \u05DE\u05DC\u05D0'];
        var w = 400, h = 170, pad = 70, svg = svgRoot(w, h);
        var colors = [C.accent, C.green, C.orange, C.accent, C.green, '#FFD93D'];
        var now = 0;
        for (var i = 0; i < tasks.length; i++) {
            var dur = rnd(10, 40), x = pad + now * 2.5, bw = dur * 2.5, y = 10 + i * 26;
            svg.appendChild(svgEl('text', { x: pad - 5, y: y + 12, 'text-anchor': 'end', fill: C.dim, 'font-size': '10', text: tasks[i] }));
            svg.appendChild(svgEl('rect', { x: x, y: y, width: Math.min(bw, w - pad - x), height: 16, rx: 3, fill: colors[i], opacity: '0.75' }));
            now += dur;
        }
        return svg;
    }

    function renderScatter() {
        var w = 300, h = 200, pad = 30, svg = svgRoot(w, h);
        for (var g = 0; g <= 4; g++) {
            var gy = pad + (h - 2 * pad) * g / 4;
            svg.appendChild(svgEl('line', { x1: pad, y1: gy, x2: w - pad, y2: gy, stroke: C.grid, 'stroke-width': '0.5' }));
        }
        var cols = [C.accent, C.green, C.orange];
        for (var i = 0; i < 40; i++) {
            svg.appendChild(svgEl('circle', { cx: pad + rnd(0, w - 2 * pad), cy: pad + rnd(0, h - 2 * pad), r: rnd(3, 6), fill: cols[i % 3], opacity: '0.7' }));
        }
        return svg;
    }

    function renderRadar() {
        var labels = ['MW', 'TEMP', 'EFF', 'FREQ', 'VOLT'];
        var n = labels.length, cx = 130, cy = 100, r = 75, svg = svgRoot(260, 210);
        for (var ring = 1; ring <= 3; ring++) {
            var rr = r * ring / 3, pts = '';
            for (var i = 0; i < n; i++) {
                var a = (i / n * 2 * Math.PI) - Math.PI / 2;
                pts += (cx + rr * Math.cos(a)) + ',' + (cy + rr * Math.sin(a)) + ' ';
            }
            svg.appendChild(svgEl('polygon', { points: pts, fill: 'none', stroke: C.grid, 'stroke-width': '0.5' }));
        }
        for (var i = 0; i < n; i++) {
            var a = (i / n * 2 * Math.PI) - Math.PI / 2;
            svg.appendChild(svgEl('line', { x1: cx, y1: cy, x2: cx + r * Math.cos(a), y2: cy + r * Math.sin(a), stroke: C.grid, 'stroke-width': '0.5' }));
            svg.appendChild(svgEl('text', { x: cx + (r + 15) * Math.cos(a), y: cy + (r + 15) * Math.sin(a) + 4, 'text-anchor': 'middle', fill: C.dim, 'font-size': '10', text: labels[i] }));
        }
        var dataPts = '';
        for (var i = 0; i < n; i++) {
            var v = rnd(0.4, 1.0), a = (i / n * 2 * Math.PI) - Math.PI / 2;
            dataPts += (cx + r * v * Math.cos(a)) + ',' + (cy + r * v * Math.sin(a)) + ' ';
        }
        svg.appendChild(svgEl('polygon', { points: dataPts, fill: C.accent, 'fill-opacity': '0.25', stroke: C.accent, 'stroke-width': '2' }));
        return svg;
    }

    function renderFlow() {
        var w = 380, h = 180, svg = svgRoot(w, h);
        var nodes = [
            { x: 30, y: 60, label: 'GT', val: rnd(200, 400).toFixed(0) + ' MW' },
            { x: 160, y: 30, label: 'HRSG', val: rnd(400, 600).toFixed(0) + ' T/h' },
            { x: 160, y: 100, label: 'ST', val: rnd(100, 250).toFixed(0) + ' MW' },
            { x: 300, y: 60, label: 'Grid', val: rnd(350, 600).toFixed(0) + ' MW' }
        ];
        var conns = [[0, 1], [0, 2], [1, 2], [2, 3], [0, 3]];
        for (var c = 0; c < conns.length; c++) {
            var a = nodes[conns[c][0]], b = nodes[conns[c][1]];
            svg.appendChild(svgEl('line', { x1: a.x + 25, y1: a.y + 20, x2: b.x + 25, y2: b.y + 20, stroke: C.accent, 'stroke-width': '2', opacity: '0.4' }));
        }
        for (var i = 0; i < nodes.length; i++) {
            var nd = nodes[i];
            svg.appendChild(svgEl('rect', { x: nd.x, y: nd.y, width: 50, height: 40, rx: 8, fill: C.panel, stroke: C.accent, 'stroke-width': '1.5' }));
            svg.appendChild(svgEl('text', { x: nd.x + 25, y: nd.y + 18, 'text-anchor': 'middle', fill: C.accent, 'font-size': '11', 'font-weight': '700', text: nd.label }));
            svg.appendChild(svgEl('text', { x: nd.x + 25, y: nd.y + 32, 'text-anchor': 'middle', fill: C.text, 'font-size': '10', text: nd.val }));
        }
        return svg;
    }

    function renderDashboard() {
        var kpis = [
            { label: '\u05D9\u05D9\u05E6\u05D5\u05E8 \u05DB\u05D5\u05DC\u05DC', val: rnd(2000, 4000).toFixed(0), unit: 'MW', color: C.accent },
            { label: '\u05E6\u05E8\u05D9\u05DB\u05D4', val: rnd(1500, 3500).toFixed(0), unit: 'MW', color: C.green },
            { label: '\u05D9\u05E2\u05D9\u05DC\u05D5\u05EA', val: rnd(55, 98).toFixed(1), unit: '%', color: C.orange },
            { label: '\u05D6\u05DE\u05D9\u05E0\u05D5\u05EA', val: rnd(85, 99.9).toFixed(1), unit: '%', color: '#FFD93D' }
        ];
        var wrap = el('div', { style: 'direction:rtl;' });
        var grid = el('div', { style: 'display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:10px;' });
        for (var i = 0; i < kpis.length; i++) {
            var k = kpis[i];
            grid.appendChild(el('div', { style: 'background:' + C.panel + ';border-radius:10px;padding:14px;border-left:3px solid ' + k.color + ';' }, [
                el('div', { style: 'color:' + C.dim + ';font-size:11px;margin-bottom:6px;', text: k.label }),
                el('div', { style: 'color:' + C.text + ';font-size:24px;font-weight:700;' }, [
                    document.createTextNode(k.val + ' '),
                    el('span', { style: 'font-size:12px;color:' + C.dim + ';', text: k.unit })
                ])
            ]));
        }
        wrap.appendChild(grid);
        var trendWrap = el('div', { style: 'padding:0 10px 10px;' });
        trendWrap.appendChild(renderTrend());
        wrap.appendChild(trendWrap);
        return wrap;
    }

    function renderTreemap() {
        var items = [
            { label: 'GT-1', val: rnd(200, 500), color: C.accent },
            { label: 'GT-2', val: rnd(200, 500), color: C.green },
            { label: 'ST-1', val: rnd(100, 300), color: C.orange },
            { label: 'ST-2', val: rnd(100, 300), color: '#FFD93D' },
            { label: 'AUX', val: rnd(20, 80), color: C.red },
            { label: 'COOL', val: rnd(30, 100), color: C.dim }
        ];
        var total = 0; for (var i = 0; i < items.length; i++) total += items[i].val;
        var wrap = el('div', { style: 'display:flex;flex-wrap:wrap;gap:3px;padding:8px;min-height:200px;direction:rtl;' });
        for (var i = 0; i < items.length; i++) {
            var pct = items[i].val / total * 100;
            wrap.appendChild(el('div', { style: 'flex:' + pct + ';min-width:60px;background:' + items[i].color + '33;border:1px solid ' + items[i].color + '66;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;' }, [
                el('div', { style: 'font-size:13px;font-weight:700;color:' + C.text + ';', text: items[i].label }),
                el('div', { style: 'font-size:18px;font-weight:700;color:' + items[i].color + ';', text: items[i].val.toFixed(0) }),
                el('div', { style: 'font-size:9px;color:' + C.dim + ';', text: 'MW' })
            ]));
        }
        return wrap;
    }

    /* Renderer Map */
    var RENDERERS = {
        gauge: renderGauge, trend: renderTrend, bars: renderBars, pie: renderPie,
        statusgrid: renderStatusGrid, table: renderTable, heatmap: renderHeatmap,
        funnel: renderFunnel, gantt: renderGantt, scatter: renderScatter,
        radar: renderRadar, flow: renderFlow, dashboard: renderDashboard,
        treemap: renderTreemap
    };

    /* Is element visually empty? */
    function isVisuallyEmpty(elem) {
        if (!elem) return true;
        if (elem.querySelector('.emu-fallback-viz')) return false;
        if (elem.querySelector('svg:not(.toolbar-logo-svg)')) return false;
        // MM20 virtual symbols render a demo-mode stub — still counts as empty for fallback
        var mm20Container = elem.querySelector('.mm20-symbol-container');
        if (mm20Container && !mm20Container.querySelector('table, svg, canvas, .data-cell')) return true;
        // Check canvas — only count it if something is actually drawn
        var canvasEl = elem.querySelector('canvas');
        if (canvasEl) {
            try {
                var ctx = canvasEl.getContext('2d');
                var px = ctx.getImageData(0, 0, Math.min(canvasEl.width, 100), Math.min(canvasEl.height, 100));
                var hasContent = false;
                for (var i = 3; i < px.data.length; i += 16) { // sample every 4th pixel alpha
                    if (px.data[i] > 0) { hasContent = true; break; }
                }
                if (hasContent) return false;
            } catch(e) { /* cross-origin or no context — treat as empty */ }
        }
        if (elem.querySelector('table tbody tr')) return false;
        return true;
    }

    /* Main: Apply fallback visualization */
    function applyFallback(symName, wrapperEl) {
        if (!wrapperEl) return;
        setTimeout(function () {
            if (!isVisuallyEmpty(wrapperEl)) return;

            var vizType = TYPE_MAP[symName] || 'bars';
            var renderer = RENDERERS[vizType] || RENDERERS.bars;

            var container = document.createElement('div');
            container.className = 'emu-fallback-viz';
            container.style.cssText = 'padding:12px;background:' + C.bg + ';border-radius:8px;min-height:150px;font-family:Segoe UI,Heebo,Arial,sans-serif;';
            container.appendChild(renderer());

            // Find the symbol root div (skip script/link/style)
            var target = null;
            for (var i = wrapperEl.children.length - 1; i >= 0; i--) {
                var c = wrapperEl.children[i];
                if (c.tagName !== 'SCRIPT' && c.tagName !== 'LINK' && c.tagName !== 'STYLE') {
                    target = c; break;
                }
            }
            (target || wrapperEl).appendChild(container);
            console.log('[EMU-FALLBACK] Injected', vizType, 'for', symName);
        }, FALLBACK_DELAY);
    }

    root.EMU_FALLBACK = { apply: applyFallback, TYPE_MAP: TYPE_MAP, RENDERERS: RENDERERS };
})(window);
