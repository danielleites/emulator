/**
 * app.js — PI Vision Symbol Emulator Core Application
 * Symbol catalog manager, loader, data injection, demo mode, config panel
 * Hebrew RTL UI
 */
(function (window, $) {
    'use strict';

    var EMU = window.EMU = {};

    /* =========================================================
     *  SYMBOL CATALOG
     * ========================================================= */
    var SYMBOL_LIST = [
        // v20 symbols
        { name: 'afbrowser20',   type: 'v20', category: 'ניווט',   dataShape: 'None'       },
        { name: 'alertpanel20',  type: 'v20', category: 'ניטור',   dataShape: 'Table'      },
        { name: 'asstcmp20',     type: 'v20', category: 'מדדים',   dataShape: 'Table'      },
        { name: 'asstovr20',     type: 'v20', category: 'מדדים',   dataShape: 'Table'      },
        { name: 'co2emis20',     type: 'v20', category: 'ניטור',   dataShape: 'Table'      },
        { name: 'co2monitor20',  type: 'v20', category: 'ניטור',   dataShape: 'Table'      },
        { name: 'drilldown20',   type: 'v20', category: 'ניווט',   dataShape: 'Table'      },
        { name: 'comparison20',  type: 'v20', category: 'גרפים',   dataShape: 'Table'      },
        { name: 'constmon20',    type: 'v20', category: 'ניטור',   dataShape: 'Table'      },
        { name: 'dataexport20',  type: 'v20', category: 'נתונים',  dataShape: 'Table'      },
        { name: 'dtblpro20',     type: 'v20', category: 'נתונים',  dataShape: 'Table'      },
        { name: 'eftable20',     type: 'v20', category: 'נתונים',  dataShape: 'Table'      },
        { name: 'evtcomp20',     type: 'v20', category: 'ניטור',   dataShape: 'Table'      },
        { name: 'evtwrtr20',     type: 'v20', category: 'נתונים',  dataShape: 'Value'      },
        { name: 'freqmtr20',     type: 'v20', category: 'מדדים',   dataShape: 'Value'      },
        { name: 'fuelgauge20',   type: 'v20', category: 'מדדים',   dataShape: 'Gauge'      },
        { name: 'funnel20',      type: 'v20', category: 'גרפים',   dataShape: 'Table'      },
        { name: 'gantt20',       type: 'v20', category: 'גרפים',   dataShape: 'Table'      },
        { name: 'gauge20',       type: 'v20', category: 'מדדים',   dataShape: 'Gauge'      },
        { name: 'genblock20',    type: 'v20', category: 'מדדים',   dataShape: 'Table'      },
        { name: 'gridstatus20',  type: 'v20', category: 'ניטור',   dataShape: 'Table'      },
        { name: 'heatmap20',     type: 'v20', category: 'גרפים',   dataShape: 'Table'      },
        { name: 'kpicard20',     type: 'v20', category: 'מדדים',   dataShape: 'Table'      },
        { name: 'liquidgauge20', type: 'v20', category: 'מדדים',   dataShape: 'Gauge'      },
        { name: 'loadcurve20',   type: 'v20', category: 'גרפים',   dataShape: 'TimeSeries' },
        { name: 'maindash20',    type: 'v20', category: 'ניווט',   dataShape: 'Table'      },
        { name: 'matrixtable20', type: 'v20', category: 'נתונים',  dataShape: 'Table'      },
        { name: 'mugmon20',      type: 'v20', category: 'ניטור',   dataShape: 'Value'      },
        { name: 'mugmoni20',     type: 'v20', category: 'ניטור',   dataShape: 'Value'      },
        { name: 'mugult20',      type: 'v20', category: 'ניטור',   dataShape: 'Table'      },
        { name: 'navbar20',      type: 'v20', category: 'ניווט',   dataShape: 'Table'      },
        { name: 'paramctrl20',   type: 'v20', category: 'נתונים',  dataShape: 'Value'      },
        { name: 'piechart20',    type: 'v20', category: 'גרפים',   dataShape: 'Table'      },
        { name: 'powerflow20',   type: 'v20', category: 'מוגבלות', dataShape: 'Value'      },
        { name: 'radar20',       type: 'v20', category: 'גרפים',   dataShape: 'Table'      },
        { name: 'renewwdg20',    type: 'v20', category: 'מדדים',   dataShape: 'Table'      },
        { name: 'reportgen20',   type: 'v20', category: 'נתונים',  dataShape: 'Table'      },
        { name: 'resrvind20',    type: 'v20', category: 'מדדים',   dataShape: 'Table'      },
        { name: 'sankey20',      type: 'v20', category: 'גרפים',   dataShape: 'Table'      },
        { name: 'scatter20',     type: 'v20', category: 'גרפים',   dataShape: 'XYPlot'     },
        { name: 'slicer20',      type: 'v20', category: 'נתונים',  dataShape: 'Table'      },
        { name: 'traflit20',     type: 'v20', category: 'ניטור',   dataShape: 'Table'      },
        { name: 'treemap20',     type: 'v20', category: 'גרפים',   dataShape: 'Value'      },
        { name: 'trendchart20',  type: 'v20', category: 'גרפים',   dataShape: 'Trend'      },
        { name: 'unitstatus20',  type: 'v20', category: 'ניטור',   dataShape: 'Table'      },
        { name: 'waterfall20',   type: 'v20', category: 'גרפים',   dataShape: 'Table'      },
        // WOW symbols
        { name: 'afbrowser-wow',    type: 'wow', category: 'ניווט',   dataShape: 'None'       },
        { name: 'alertpanel-wow',   type: 'wow', category: 'ניטור',   dataShape: 'Table'      },
        { name: 'dataexport-wow',   type: 'wow', category: 'נתונים',  dataShape: 'Table'      },
        { name: 'digitaltwin-wow',  type: 'wow', category: 'מוגבלות', dataShape: 'Table'      },
        { name: 'donut-wow',        type: 'wow', category: 'גרפים',   dataShape: 'Table'      },
        { name: 'envelope-wow',     type: 'wow', category: 'מדדים',   dataShape: 'Value'      },
        { name: 'eventwriter-wow',  type: 'wow', category: 'נתונים',  dataShape: 'Value'      },
        { name: 'freqmeter-wow',    type: 'wow', category: 'מדדים',   dataShape: 'Value'      },
        // funnel20 is v20 only (no wow variant)
        { name: 'gantt-wow',        type: 'wow', category: 'גרפים',   dataShape: 'Table'      },
        { name: 'kpicard-wow',      type: 'wow', category: 'מדדים',   dataShape: 'Table'      },
        { name: 'liquidgauge-wow',  type: 'wow', category: 'מדדים',   dataShape: 'Gauge'      },
        { name: 'loadcurve-wow',    type: 'wow', category: 'גרפים',   dataShape: 'TimeSeries' },
        { name: 'mugbalot-wow',     type: 'wow', category: 'ניטור',   dataShape: 'Table'      },
        { name: 'powerflow-wow',    type: 'wow', category: 'מוגבלות', dataShape: 'Value'      },
        { name: 'radar-wow',        type: 'wow', category: 'גרפים',   dataShape: 'Table'      },
        { name: 'sankey-wow',       type: 'wow', category: 'גרפים',   dataShape: 'Table'      },
        { name: 'scatter-wow',      type: 'wow', category: 'גרפים',   dataShape: 'XYPlot'     },
        { name: 'table-wow',        type: 'wow', category: 'נתונים',  dataShape: 'Table'      },
        { name: 'treemap-wow',      type: 'wow', category: 'גרפים',   dataShape: 'Table'      },
        { name: 'trellis-wow',      type: 'wow', category: 'גרפים',   dataShape: 'TimeSeries' },
        { name: 'waterfall-wow',    type: 'wow', category: 'גרפים',   dataShape: 'Table'      },
        { name: 'wow-heatmap',      type: 'wow', category: 'גרפים',   dataShape: 'Table'      },
        // R300 MM20 representative symbols (virtual — rendered via MU20 core)
        { name: 'mm20-pibar',      type: 'mm20', category: 'MM20',   dataShape: 'Table',  displayName: 'PIBar20',         mm20: true },
        { name: 'mm20-pitrend',    type: 'mm20', category: 'MM20',   dataShape: 'Trend',  displayName: 'PITrend20',       mm20: true },
        { name: 'mm20-pigauge',    type: 'mm20', category: 'MM20',   dataShape: 'Gauge',  displayName: 'PIGauge20',       mm20: true },
        { name: 'mm20-pixy',       type: 'mm20', category: 'MM20',   dataShape: 'XYPlot', displayName: 'PIXY20',          mm20: true },
        { name: 'mm20-aftree',     type: 'mm20', category: 'MM20',   dataShape: 'Table',  displayName: 'AFTree20',        mm20: true },
        { name: 'mm20-aftable',    type: 'mm20', category: 'MM20',   dataShape: 'Table',  displayName: 'AFTable20',       mm20: true },
        { name: 'mm20-afbrowser',  type: 'mm20', category: 'MM20',   dataShape: 'None',   displayName: 'AFBrowser20',     mm20: true },
        { name: 'mm20-kbd',        type: 'mm20', category: 'MM20',   dataShape: 'None',   displayName: 'MM20-Keyboard',   mm20: true },
        { name: 'mm20-alarm',      type: 'mm20', category: 'MM20',   dataShape: 'Table',  displayName: 'AlarmGrid20',     mm20: true },
        { name: 'mm20-notif',      type: 'mm20', category: 'MM20',   dataShape: 'Table',  displayName: 'Notifications20', mm20: true },
        { name: 'mm20-batch',      type: 'mm20', category: 'MM20',   dataShape: 'Table',  displayName: 'BatchView20',     mm20: true },
        { name: 'mm20-calc',       type: 'mm20', category: 'MM20',   dataShape: 'Value',  displayName: 'Calculator20',    mm20: true }
    ];

    var CATEGORIES = ['כל הסמלים', 'מוגבלות', 'גרפים', 'מדדים', 'ניטור', 'נתונים', 'ניווט', 'MM20'];

    var DATA_STATE = 'normal'; // normal | warning | critical | stale
    var DEMO_INTERVAL = 5000;
    var _demoTimer = null;
    var _activeSymbol = null;
    var _activeScope = null;
    var _activeDef = null;
    var _visInstance = null;
    var _loadedPlugins = {}; // track loaded plugin scripts

    EMU.symbols = SYMBOL_LIST;
    EMU.categories = CATEGORIES;
    EMU.activeSymbol = null;
    EMU.dataState = DATA_STATE;

    /* =========================================================
     *  MOCK DATA GENERATION
     * ========================================================= */
    function _rnd(min, max) { return min + Math.random() * (max - min); }
    function _rndInt(min, max) { return Math.floor(_rnd(min, max)); }
    function _osc(base, pct) { return base * (1 + (Math.random() - 0.5) * 2 * pct); }

    function _genValue(state) {
        var v = _rnd(100, 800);
        if (state === 'warning') v = _rnd(750, 900);
        if (state === 'critical') v = _rnd(900, 1000);
        if (state === 'stale') v = _rnd(100, 800);
        return +v.toFixed(2);
    }

    function _genTimestamp(stale) {
        if (stale) return new Date(Date.now() - _rnd(600000, 3600000)).toISOString();
        return new Date(Date.now() - _rnd(0, 30000)).toISOString();
    }

    /* =========================================================
     *  E1: UNIFIED DATA ENGINE (PI Vision Extensibility Spec)
     *
     *  Single source of truth for mock data generation.
     *  Field names match the PI Vision Extensibility Guide:
     *    Value:      { Value, Time, Label, Units, Path, Description, IsGood, ErrorCode, ErrorDescription }
     *    Gauge:      { Value, Time, Indicator, StartIndicator, ValueScaleLabels, ValueScalePositions, IsGood }
     *    Trend:      { StartTime, EndTime, Duration, Traces[] }
     *                  Each Trace: { Label, LineSegments[], ScaleMin, ScaleMax }
     *                  LineSegments are in 100×100 coordinate space per spec
     *    Table:      { Rows[] }
     *                  Each Row: { Label, Value, Time, Units, Path, IsGood, Trend[], Summary }
     *                  Summary: { Average, Minimum, Maximum, StdDev, Range, PStdDev }
     *    TimeSeries: { Data[] }
     *                  Each Data: { Values[] } — each value: { Time, Value }
     *    XYPlot:     { Points[] } — each: { X, Y, Label }
     * ========================================================= */

    function _makeValueData(state) {
        return {
            Value: _genValue(state),
            Time: _genTimestamp(state === 'stale'),
            Label: 'ASH.U1.MW',
            Units: 'MW',
            Path: '\\\\PISERVER01\\IEC_Grid\\Ashkelon\\U1\\Active_Power',
            Description: 'Active power output',
            IsGood: state !== 'critical',
            ErrorCode: state === 'critical' ? -11091 : 0,
            ErrorDescription: state === 'critical' ? 'Calc Failed' : ''
        };
    }

    function _makeGaugeData(state) {
        var val = _genValue(state);
        // Gauge indicator is a 0-100% ratio of where value falls in scale
        var min = 0, max = 1000;
        var indicator = Math.max(0, Math.min(100, (val - min) / (max - min) * 100));
        return {
            Value: val,
            Time: _genTimestamp(state === 'stale'),
            Indicator: +indicator.toFixed(1),
            StartIndicator: 0,
            ValueScaleLabels: ['0', '250', '500', '750', '1000'],
            ValueScalePositions: [0, 0.25, 0.5, 0.75, 1.0],
            IsGood: state !== 'critical',
            Label: 'ASH.U1.MW',
            Units: 'MW'
        };
    }

    function _makeTrendData(state) {
        // PI Vision Trend: LineSegments in 100×100 coordinate space
        var now = new Date();
        var numTraces = 3;
        var ptsPerTrace = 50;
        var traces = [];
        var labels = ['כוח MW', 'טמפרטורה °C', 'נצילות %'];
        var bases = [400, 450, 42];
        var ranges = [200, 100, 10];

        for (var s = 0; s < numTraces; s++) {
            var segments = [];
            for (var k = 0; k < ptsPerTrace; k++) {
                // 100×100 coordinate space as per PI Vision spec
                var x = (k / (ptsPerTrace - 1)) * 100;
                var base = bases[s] + Math.sin(k / 8) * ranges[s] * 0.5;
                if (state === 'warning') base *= 1.1;
                if (state === 'critical') base *= 1.3;
                var y = Math.max(0, Math.min(100, ((base - (bases[s] - ranges[s])) / (2 * ranges[s])) * 100));
                segments.push({ x: +x.toFixed(1), y: +y.toFixed(1) });
            }
            var scaleMin = bases[s] - ranges[s];
            var scaleMax = bases[s] + ranges[s];
            traces.push({
                Label: labels[s] || ('Series ' + (s + 1)),
                LineSegments: segments,
                ScaleMin: scaleMin,
                ScaleMax: scaleMax,
                Value: +(bases[s] + _rnd(-ranges[s] * 0.3, ranges[s] * 0.3)).toFixed(1),
                ErrorMarkers: [],
                Markers: []
            });
        }
        return {
            StartTime: new Date(now.getTime() - 25 * 3600000).toISOString(),
            EndTime: now.toISOString(),
            Duration: '25h',
            Traces: traces
        };
    }

    function _makeTableData(state, cols) {
        // PI Vision Table: Rows with metadata + optional Trend mini-chart + Summary stats
        var attrs = ['כוח פעיל', 'עומס גז', 'טמפ. פליטה', 'מתח', 'זרם', 'תדירות'];
        var units = ['MW', 'MSCF/h', '°C', 'kV', 'A', 'Hz'];
        var baselines = [580, 145, 485, 18.5, 312, 50.0];
        var rows = attrs.map(function (attr, i) {
            var pct = state === 'warning' ? 0.15 : state === 'critical' ? 0.30 : 0.05;
            var v = _osc(baselines[i], pct);
            // Mini trend data (8 recent points)
            var trend = [];
            for (var t = 0; t < 8; t++) {
                trend.push(+(baselines[i] * (1 + (Math.random() - 0.5) * 2 * pct)).toFixed(2));
            }
            return {
                Label: attr,
                Value: +v.toFixed(2),
                Time: _genTimestamp(state === 'stale'),
                Units: units[i],
                Path: '\\\\PISERVER01\\ASH.U1.' + attr.replace(/ /g, '.'),
                IsGood: state !== 'critical' || i !== 0,
                Trend: trend,
                Summary: {
                    Average: +baselines[i].toFixed(2),
                    Minimum: +(baselines[i] * 0.7).toFixed(2),
                    Maximum: +(baselines[i] * 1.3).toFixed(2),
                    StdDev: +(baselines[i] * 0.08).toFixed(2),
                    Range: +(baselines[i] * 0.6).toFixed(2),
                    PStdDev: +(baselines[i] * 0.07).toFixed(2)
                }
            };
        });
        return {
            Rows: rows,
            Columns: cols || ['Label', 'Value', 'Time', 'Units'],
            SortColumn: 'Label',
            SortDescending: false
        };
    }

    function _makeTimeSeriesData(state) {
        // PI Vision TimeSeries: Data[] > Values[] with {Time, Value}
        var pts = 96;
        var values = [];
        var now = Date.now();
        var base = 520;
        for (var i = pts; i >= 0; i--) {
            base = Math.max(50, Math.min(1000, base + _rnd(-25, 25)));
            if (state === 'warning') base = Math.min(base, 850);
            if (state === 'critical') base = Math.max(base, 900);
            values.push({
                Time: new Date(now - i * 900000).toISOString(),
                Value: +base.toFixed(2)
            });
        }
        return { Data: [{ Values: values }] };
    }

    function _makeXYPlotData(state) {
        var pts = [];
        for (var i = 0; i < 50; i++) {
            pts.push({ X: +_rnd(0, 1000).toFixed(2), Y: +_rnd(0, 1000).toFixed(2), Label: 'נקודה ' + (i + 1) });
        }
        return { Points: pts };
    }

    /**
     * S4: Event Frame mock data generator.
     * PI Vision Event Frames represent process events (downtime, batch, quality excursion)
     * with start/end times, template, attributes, annotations, and acknowledgment.
     */
    function _makeEventFrameData(state, count) {
        count = count || 10;
        var now = new Date();
        var templates = ['השבתה מתוכננת', 'כשל יחידה', 'עלייה בטמפרטורה', 'חריגת איכות', 'אירוע בטחון'];
        var severities = ['Information', 'Warning', 'Minor', 'Major', 'Critical'];
        var events = [];

        for (var i = 0; i < count; i++) {
            var startOffset = _rnd(1, 72) * 3600000; // 1-72 hours ago
            var duration = _rnd(0.25, 8) * 3600000;  // 15min to 8h
            var startTime = new Date(now.getTime() - startOffset);
            var endTime = (i < 3 && state !== 'stale') ? null : new Date(startTime.getTime() + duration); // some still open
            var sev = state === 'critical' ? 4 : (state === 'warning' ? _rndInt(2, 4) : _rndInt(0, 3));

            events.push({
                Name: templates[i % templates.length] + ' #' + (i + 1),
                Description: 'אירוע דמו #' + (i + 1) + ' — ' + _SITES[i % 6] + ' ' + _UNITS[i % 6],
                StartTime: startTime.toISOString(),
                EndTime: endTime ? endTime.toISOString() : null,
                Duration: endTime ? Math.round(duration / 60000) + ' דקות' : 'פעיל',
                Template: templates[i % templates.length],
                Severity: severities[sev],
                SeverityLevel: sev,
                PrimaryReferencedElement: '\\\\PISERVER01\\IEC_Grid\\' + _SITES[i % 6] + '\\' + _UNITS[i % 6],
                IsAcknowledged: i > 5,
                AcknowledgedBy: i > 5 ? 'admin' : null,
                AcknowledgedDate: i > 5 ? new Date(startTime.getTime() + duration + 600000).toISOString() : null,
                IsLocked: i > 8,
                Attributes: {
                    'כוח_MW': +_rnd(100, 600).toFixed(1),
                    'טמפרטורה_C': +_rnd(300, 550).toFixed(1),
                    'סיבה': ['תחזוקה', 'כשל', 'עומס יתר', 'חריגת טמפ', 'בדיקה'][i % 5]
                },
                Annotations: i < 2 ? [
                    { Name: 'הערת מפעיל', Value: 'נבדק ואושר', Time: startTime.toISOString(), CreatedBy: 'admin' }
                ] : []
            });
        }

        return {
            EventFrames: events,
            TotalCount: count,
            StartTime: new Date(now.getTime() - 72 * 3600000).toISOString(),
            EndTime: now.toISOString()
        };
    }
    EMU.makeEventFrameData = _makeEventFrameData;

    /**
     * Unified mock data generator — single entry point for all data shapes.
     * Returns data in PI Vision Extensibility spec format.
     */
    function _genMockData(dataShape, state) {
        state = state || DATA_STATE;
        switch (dataShape) {
            case 'Gauge':      return _makeGaugeData(state);
            case 'Trend':      return _makeTrendData(state);
            case 'Table':      return _makeTableData(state);
            case 'TimeSeries': return _makeTimeSeriesData(state);
            case 'XYPlot':     return _makeXYPlotData(state);
            case 'None':       return {};
            case 'Value':
            default:           return _makeValueData(state);
        }
    }
    EMU.genMockData = _genMockData;

    /* =========================================================
     *  PER-SYMBOL DEMO DATA INJECTOR
     *  Each symbol has its own scope data shape (scope.items,
     *  scope.cells, scope.nodes, etc.).  This function populates
     *  scope with realistic data matching the symbol's expected
     *  format, called AFTER visInstance.init() completes.
     * ========================================================= */
    var _SITES  = ['\u05D0\u05E9\u05E7\u05DC\u05D5\u05DF','\u05D7\u05D3\u05E8\u05D4','\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF','\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2','\u05E8\u05D9\u05D3\u05D9\u05E0\u05D2','\u05D7\u05D2\u05D9\u05EA'];
    var _UNITS  = ['U1','U2','U3','U4','U5','U6'];
    var _STATUS = ['running','idle','maintenance','fault'];

    function _rndI(min, max) { return Math.floor(min + Math.random() * (max - min)); }
    function _timeAgo(h) { return new Date(Date.now() - h * 3600000).toISOString(); }

    function _injectSymbolDemoData(scope, symName) {
        var now = new Date();
        var i, j, ri, ci;

        switch (symName) {

            // ── gantt20: scope.items, scope.filteredItems, scope.summary ──
            case 'gantt20':
                scope.items = [];
                for (i = 0; i < 15; i++) {
                    scope.items.push({
                        name:   _SITES[i % 6] + ' ' + _UNITS[i % 6],
                        value:  +_rnd(50, 600).toFixed(1),
                        time:   _timeAgo(_rnd(0, 24)),
                        status: _STATUS[_rndI(0, 4)],
                        site:   _SITES[i % 6],
                        unit:   _UNITS[i % 6],
                        path:   '\\\\PISERVER01\\' + _SITES[i % 6] + '\\' + _UNITS[i % 6]
                    });
                }
                scope.filteredItems = scope.items.slice();
                scope.summary = { total: 15, ok: 10, warn: 3, crit: 1, off: 1, avg: 350, max: 580, sum: 5250 };
                scope.loading = false;
                scope.maxVal = 600;
                break;

            // ── comparison20: scope.items, scope.compStats, scope.maxValue, scope.baseline ──
            case 'comparison20':
                scope.items = [];
                for (i = 0; i < 8; i++) {
                    var bl = _rnd(300, 500);
                    scope.items.push({
                        name:      _SITES[i % 6] + ' ' + _UNITS[i % 6],
                        value:     +_rnd(200, 600).toFixed(1),
                        baseline:  +bl.toFixed(1),
                        deviation: +(_rnd(-15, 15)).toFixed(1),
                        path:      '\\\\PISERVER01\\' + _SITES[i % 6]
                    });
                }
                scope.maxValue = 600;
                scope.baseline = 400;
                scope.compStats = { mean: 380, stddev: 45, min: 210, max: 580, spread: 370, cv: 11.8 };
                scope.loading = false;
                break;

            // ── heatmap20: scope.cells, scope.calendarDays, scope.stats, scope.hasData ──
            case 'heatmap20':
                scope.cells = [];
                var hmRows = _UNITS;
                var hmCols = [];
                for (i = 0; i < 24; i++) hmCols.push(i + ':00');
                for (ri = 0; ri < hmRows.length; ri++) {
                    for (ci = 0; ci < hmCols.length; ci++) {
                        scope.cells.push({
                            row: ri, col: ci,
                            rowLabel: hmRows[ri], colLabel: hmCols[ci],
                            value: +_rnd(0, 100).toFixed(1)
                        });
                    }
                }
                scope.calendarDays = [];
                scope.calMin = 0;
                scope.calMax = 100;
                scope.stats = { avg: 52, min: 3, max: 98, count: hmRows.length * hmCols.length };
                scope.hasData = true;
                scope.loading = false;
                break;

            // ── powerflow20: scope.nodes, scope.flows, scope.aggregate ──
            case 'powerflow20':
                scope.nodes = [];
                scope.flows = [];
                for (i = 0; i < 5; i++) {
                    scope.nodes.push({ name: _SITES[i], value: +_rnd(200, 800).toFixed(0), type: 'site' });
                }
                for (i = 0; i < 4; i++) {
                    scope.flows.push({ from: _SITES[i], to: _SITES[i + 1], value: +_rnd(50, 200).toFixed(0) });
                }
                scope.aggregate = { generation: 2800, load: 2650, losses: 150, balance: 0 };
                scope.loading = false;
                break;

            // ── loadcurve20: scope.legend, scope.stats, scope.currentLoad, scope.rampRate ──
            case 'loadcurve20':
                scope.legend = [
                    { key: 'total', label: '\u05E2\u05D5\u05DE\u05E1 \u05DE\u05E2\u05E8\u05DB\u05EA', color: '#5BC0EB', visible: true },
                    { key: 'ashkelon', label: '\u05D0\u05E9\u05E7\u05DC\u05D5\u05DF', color: '#2ECC71', visible: true },
                    { key: 'hadera', label: '\u05D7\u05D3\u05E8\u05D4', color: '#F39C12', visible: true }
                ];
                scope.stats = { total: 2850, avg: 475, min: 320, max: 610, count: 6 };
                scope.currentLoad = 2850;
                scope.rampRate = 12.5;
                scope.trendDir = '\u2191';
                scope.peakInfo = { value: 3100, time: '14:30' };
                scope.valleyInfo = { value: 2200, time: '04:00' };
                scope.loading = false;
                break;

            // ── sankey20: scope.nodes, scope.flows, scope.stats ──
            case 'sankey20':
                scope.nodes = [
                    { name: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', value: 1200, type: 'source' },
                    { name: '\u05E4\u05D7\u05DD', value: 800, type: 'source' },
                    { name: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4', value: 1800, type: 'process' },
                    { name: '\u05D7\u05E9\u05DE\u05DC', value: 1600, type: 'output' },
                    { name: '\u05D4\u05E4\u05E1\u05D3\u05D9\u05DD', value: 200, type: 'loss' }
                ];
                scope.flows = [
                    { from: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', to: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4', value: 1200 },
                    { from: '\u05E4\u05D7\u05DD', to: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4', value: 800 },
                    { from: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4', to: '\u05D7\u05E9\u05DE\u05DC', value: 1600 },
                    { from: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4', to: '\u05D4\u05E4\u05E1\u05D3\u05D9\u05DD', value: 200 }
                ];
                scope.stats = { totalIn: 2000, totalOut: 1800, efficiency: 90, losses: 200 };
                scope.loading = false;
                break;

            // ── maindash20: scope.sites, scope.filteredSites, scope.alerts, scope.trendData ──
            case 'maindash20':
                scope.sites = [];
                for (i = 0; i < 6; i++) {
                    var mw = _rnd(200, 800);
                    var maxMw = _rnd(600, 1000);
                    scope.sites.push({
                        name: _SITES[i],
                        totalMW: +mw.toFixed(0),
                        maxMW: +maxMw.toFixed(0),
                        loadPct: +(mw / maxMw * 100).toFixed(1),
                        avgEfficiency: +_rnd(35, 48).toFixed(1),
                        co2Total: +_rnd(50, 200).toFixed(0),
                        activeCount: _rndI(2, 6),
                        unitCount: 6,
                        status: ['green', 'green', 'yellow', 'green', 'green', 'red'][i],
                        units: []
                    });
                }
                scope.filteredSites = scope.sites.slice();
                scope.totalProduction = 2850;
                scope.totalDemand = 2700;
                scope.totalCapacity = 4200;
                scope.reserve = 1350;
                scope.reservePct = 32.1;
                scope.avgEfficiency = 41.3;
                scope.totalCO2 = 720;
                scope.activeUnits = 28;
                scope.totalUnits = 36;
                scope.systemStatus = 'green';
                scope.systemStatusText = '\u05EA\u05E7\u05D9\u05DF';
                scope.systemStatusColor = '#2ecc71';
                scope.systemColor = 'green';
                scope.alerts = [
                    { text: '\u05D0\u05D6\u05D4\u05E8\u05D4: \u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF U3 \u05E2\u05D5\u05DE\u05E1 \u05D2\u05D1\u05D5\u05D4', level: 'warning', time: _timeAgo(0.5) },
                    { text: '\u05D7\u05D3\u05E8\u05D4 U2 \u05D1\u05EA\u05D7\u05D6\u05D5\u05E7\u05D4', level: 'info', time: _timeAgo(2) }
                ];
                scope.trendData = [];
                for (i = 0; i < 60; i++) {
                    scope.trendData.push({ production: 2600 + Math.sin(i / 8) * 200, demand: 2500 + Math.cos(i / 10) * 150 });
                }
                scope.loading = false;
                break;

            // ── afbrowser20: scope.tree, scope.breadcrumb, scope.connectionStatus ──
            case 'afbrowser20':
                scope.tree = [
                    { id: 's1', name: 'PISERVER01', type: 'server', hasChildren: true },
                    { id: 's2', name: 'PISERVER02', type: 'server', hasChildren: true }
                ];
                scope.breadcrumb = [];
                scope.connectionStatus = '\u05DE\u05D7\u05D5\u05D1\u05E8';
                scope.currentServer = 'PISERVER01';
                scope.currentDb = 'IEC_Grid';
                scope.favorites = [
                    { id: 'f1', name: '\u05D0\u05E9\u05E7\u05DC\u05D5\u05DF U1', path: '\\\\PISERVER01\\ASH\\U1' },
                    { id: 'f2', name: '\u05D7\u05D3\u05E8\u05D4 U3', path: '\\\\PISERVER01\\HAD\\U3' }
                ];
                scope.recent = [
                    { id: 'r1', name: '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2 U2', path: '\\\\PISERVER01\\ROT\\U2', time: _timeAgo(1) }
                ];
                scope.loading = false;
                break;

            // ── kpicard20: scope.cards, scope.summary ──
            case 'kpicard20':
                scope.cards = [];
                for (i = 0; i < 6; i++) {
                    var kv = _rnd(100, 600);
                    scope.cards.push({
                        name:   _SITES[i] + ' ' + _UNITS[i],
                        value:  +kv.toFixed(1),
                        unit:   'MW',
                        change: +(_rnd(-8, 8)).toFixed(1),
                        status: ['ok','ok','warn','ok','crit','ok'][i],
                        sparkline: [],
                        path:   '\\\\PISERVER01\\' + _SITES[i]
                    });
                }
                scope.summary = { total: 6, ok: 4, warn: 1, crit: 1, bad: 0, message: '\u05DE\u05E2\u05E8\u05DB\u05EA \u05EA\u05E7\u05D9\u05E0\u05D4' };
                scope.loading = false;
                break;

            // ── unitstatus20: scope.units, scope.filteredUnits, scope.summary, scope.states ──
            case 'unitstatus20':
                scope.units = [];
                var uStates = ['producing','producing','standby','producing','fault','producing','maintenance','producing','producing','producing'];
                for (i = 0; i < 10; i++) {
                    scope.units.push({
                        name:   _SITES[i % 6] + ' ' + _UNITS[i % 6],
                        site:   _SITES[i % 6],
                        status: uStates[i],
                        mw:     uStates[i] === 'producing' ? +_rnd(100, 500).toFixed(0) : 0,
                        maxMw:  500,
                        loadPct: uStates[i] === 'producing' ? +_rnd(30, 95).toFixed(1) : 0,
                        hours:  _rndI(100, 8000),
                        efficiency: +_rnd(35, 48).toFixed(1)
                    });
                }
                scope.filteredUnits = scope.units.slice();
                scope.summary = { total: 10, active: 7, off: 0, fault: 1, maint: 1, starting: 0, standby: 1 };
                scope.states = ['producing','standby','fault','maintenance','starting','off'];
                scope.loading = false;
                break;

            // ── alertpanel20: scope.alarms, scope.alarmHistory, scope.summary ──
            case 'alertpanel20':
                scope.alarms = [
                    { id: 1, text: '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF U3 - \u05E2\u05D5\u05DE\u05E1 \u05D2\u05D1\u05D5\u05D4', priority: 'critical', state: 'active', acked: false, time: _timeAgo(0.2), site: '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF' },
                    { id: 2, text: '\u05D7\u05D3\u05E8\u05D4 U2 - \u05D8\u05DE\u05E4\u05E8\u05D8\u05D5\u05E8\u05D4 \u05D2\u05D1\u05D5\u05D4\u05D4', priority: 'warning', state: 'active', acked: false, time: _timeAgo(1), site: '\u05D7\u05D3\u05E8\u05D4' },
                    { id: 3, text: '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2 U4 - \u05EA\u05D7\u05D6\u05D5\u05E7\u05D4 \u05DE\u05EA\u05D5\u05DB\u05E0\u05E0\u05EA', priority: 'info', state: 'active', acked: true, time: _timeAgo(3), site: '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2' }
                ];
                scope.alarmHistory = [
                    { id: 10, text: '\u05D0\u05E9\u05E7\u05DC\u05D5\u05DF U1 - \u05D8\u05D9\u05E4\u05D5\u05DC \u05D4\u05D5\u05E9\u05DC\u05DD', priority: 'info', state: 'resolved', acked: true, time: _timeAgo(12), site: '\u05D0\u05E9\u05E7\u05DC\u05D5\u05DF' }
                ];
                scope.summary = { total: 3, active: 3, critical: 1, warning: 1, info: 1, acked: 1, unacked: 2, resolved: 1 };
                scope.stats = { mttr: 45, mtta: 12 };
                scope.hasUnackCritical = true;
                scope.loading = false;
                break;

            // ── treemap20: scope.items, scope.legend, scope.summary ──
            case 'treemap20':
                scope.items = [];
                for (i = 0; i < 12; i++) {
                    scope.items.push({
                        name:  _SITES[i % 6] + ' ' + _UNITS[i % 6],
                        value: +_rnd(50, 600).toFixed(0),
                        group: _SITES[i % 6],
                        color: ['#2ECC71','#5BC0EB','#F39C12','#E74C3C','#9B59B6','#1ABC9C'][i % 6]
                    });
                }
                scope.legend = _SITES.slice(0, 6).map(function (s, idx) {
                    return { label: s, color: ['#2ECC71','#5BC0EB','#F39C12','#E74C3C','#9B59B6','#1ABC9C'][idx] };
                });
                scope.summary = { total: 3600, count: 12, avg: 300, max: 580, min: 55 };
                scope.loading = false;
                break;

            // ── radar20: scope.items, scope.axes, scope.series, scope.summary ──
            case 'radar20':
                var radarAxes = ['\u05DB\u05D5\u05D7 MW','\u05E0\u05E6\u05D9\u05DC\u05D5\u05EA %','\u05D6\u05DE\u05D9\u05E0\u05D5\u05EA %','CO2 t/h','\u05E2\u05D5\u05DE\u05E1 %','\u05EA\u05D3\u05D9\u05E8\u05D5\u05EA Hz'];
                scope.axes = radarAxes;
                scope.series = [
                    { name: '\u05D0\u05E9\u05E7\u05DC\u05D5\u05DF', color: '#5BC0EB', visible: true, values: [85, 42, 95, 110, 78, 50.01] },
                    { name: '\u05D7\u05D3\u05E8\u05D4',   color: '#2ECC71', visible: true, values: [72, 38, 88, 95, 65, 50.02] }
                ];
                scope.items = [];
                for (i = 0; i < radarAxes.length; i++) {
                    scope.items.push({ axis: radarAxes[i], values: [scope.series[0].values[i], scope.series[1].values[i]] });
                }
                scope.summary = { axisCount: 6, seriesCount: 2, avgScore: 72 };
                scope.overallScore = 72;
                scope.grade = { letter: 'B', color: '#5BC0EB', label: '\u05D8\u05D5\u05D1' };
                scope.hasData = true;
                scope.loading = false;
                break;

            // ── waterfall20: scope.items, scope.waterfallBars, scope.summary, scope.stats ──
            case 'waterfall20':
                scope.items = [
                    { name: '\u05D9\u05D9\u05E6\u05D5\u05E8 \u05D1\u05E1\u05D9\u05E1', value: 2400, type: 'initial' },
                    { name: '\u05D0\u05E9\u05E7\u05DC\u05D5\u05DF +', value: 350, type: 'positive' },
                    { name: '\u05D7\u05D3\u05E8\u05D4 +', value: 280, type: 'positive' },
                    { name: '\u05D4\u05E4\u05E1\u05D3\u05D9\u05DD', value: -150, type: 'negative' },
                    { name: '\u05EA\u05D7\u05D6\u05D5\u05E7\u05D4 \u05DE\u05EA\u05D5\u05DB\u05E0\u05E0\u05EA', value: -80, type: 'negative' },
                    { name: '\u05E1\u05D4"\u05DB \u05D9\u05D9\u05E6\u05D5\u05E8', value: 2800, type: 'total' }
                ];
                scope.waterfallBars = [];
                var wfRunning = 0;
                for (i = 0; i < scope.items.length; i++) {
                    var wi = scope.items[i];
                    var start = (wi.type === 'initial' || wi.type === 'total') ? 0 : wfRunning;
                    scope.waterfallBars.push({ start: start, end: start + Math.abs(wi.value), value: wi.value, label: wi.name });
                    wfRunning = (wi.type === 'total') ? wi.value : wfRunning + wi.value;
                }
                scope.filteredItems = scope.items.slice();
                scope.summary = { initial: 2400, total: 2800, change: 400, changePct: 16.7 };
                scope.stats = { positive: 630, negative: -230, net: 400, count: 6 };
                scope.hasData = true;
                scope.loading = false;
                break;

            // ── trendchart20: scope.legendItems, scope.stats ──
            case 'trendchart20':
                scope.legendItems = [
                    { key: 'mw',   label: '\u05DB\u05D5\u05D7 MW', color: '#5BC0EB', visible: true },
                    { key: 'temp', label: '\u05D8\u05DE\u05E4\u05E8\u05D8\u05D5\u05E8\u05D4', color: '#F39C12', visible: true },
                    { key: 'eff',  label: '\u05E0\u05E6\u05D9\u05DC\u05D5\u05EA %', color: '#2ECC71', visible: true }
                ];
                scope.stats = { min: 120, max: 580, avg: 350, last: 420 };
                scope.seriesCount = 3;
                scope.loading = false;
                break;

            // ── scatter20: scope.seriesArr, scope.regressionResults, scope.totalPoints ──
            case 'scatter20':
                scope.seriesArr = [
                    { name: '\u05DB\u05D5\u05D7 vs \u05D8\u05DE\u05E4\u05E8\u05D8\u05D5\u05E8\u05D4', color: '#5BC0EB', visible: true,
                      points: (function () { var p = []; for (var k = 0; k < 50; k++) p.push({ x: +_rnd(100, 600).toFixed(1), y: +_rnd(300, 550).toFixed(1) }); return p; })() }
                ];
                scope.regressionResults = [{ slope: 0.42, intercept: 180, r2: 0.78 }];
                scope.totalPoints = 50;
                scope.loading = false;
                break;

            // ── funnel20: scope.stages, scope.summary ──
            case 'funnel20':
                scope.stages = [
                    { name: '\u05E7\u05D9\u05D1\u05D5\u05DC\u05EA \u05DE\u05D5\u05EA\u05E7\u05E0\u05EA', value: 4200, pct: 100, efficiency: 100 },
                    { name: '\u05D9\u05D9\u05E6\u05D5\u05E8 \u05D2\u05D5\u05DC\u05DE\u05D9', value: 3800, pct: 90.5, efficiency: 90.5 },
                    { name: '\u05D9\u05D9\u05E6\u05D5\u05E8 \u05E0\u05E7\u05D9', value: 3400, pct: 81, efficiency: 89.5 },
                    { name: '\u05D0\u05E1\u05E4\u05E7\u05D4 \u05DC\u05E8\u05E9\u05EA', value: 3100, pct: 73.8, efficiency: 91.2 },
                    { name: '\u05E6\u05E8\u05D9\u05DB\u05D4 \u05D1\u05E4\u05D5\u05E2\u05DC', value: 2850, pct: 67.9, efficiency: 91.9 }
                ];
                scope.summary = { totalIn: 4200, totalOut: 2850, overallEff: 67.9, stages: 5 };
                scope.loading = false;
                break;

            case 'evtcomp20':
                scope.activeTab = 'table';
                // S4: Inject PI AF Event Frame data
                scope.eventFrameData = _makeEventFrameData(DATA_STATE, 20);
                scope.events = [];
                scope.filterText = '';
                scope.filterType = '';
                scope.filterUnit = '';
                for (i = 0; i < 20; i++) {
                    scope.events.push({
                        name: ['השבתת יחידה','עלייה בטמפרטורה','ירידת מתח','עומס יתר','כשל מאוורר'][i % 5],
                        type: ['planned','unplanned','alarm','maintenance','trip'][i % 5],
                        severity: ['low','medium','high','critical'][i % 4],
                        unit: _SITES[i % 6] + ' ' + _UNITS[i % 6],
                        startTime: _timeAgo(_rnd(1, 72)),
                        endTime: _timeAgo(_rnd(0, 1)),
                        duration: _rndInt(15, 480),
                        description: 'אירוע דמו #' + (i + 1)
                    });
                }
                scope.filteredEvents = scope.events.slice();
                scope.totalEventCount = scope.events.length;
                scope.eventTypes = { planned: 4, unplanned: 4, alarm: 4, maintenance: 4, trip: 4 };
                scope.unitList = _SITES.slice(0, 6);
                scope.eventStats = { total: 20, avgDuration: 120, maxDuration: 480, mtbf: 36 };
                scope.unitReliability = {};
                _SITES.slice(0, 6).forEach(function(s) { scope.unitReliability[s] = { mtbf: _rnd(20, 80), mttr: _rnd(1, 8), availability: _rnd(85, 99) }; });
                scope.timeRange = { start: _timeAgo(72), end: new Date().toISOString() };
                scope.loading = false;
                break;

            case 'evtwrtr20':
                scope.activeTab = 'write';
                // S4: Inject PI AF Event Frame data (for writer history)
                scope.eventFrameData = _makeEventFrameData(DATA_STATE, 8);
                scope.selectedTemplate = '';
                scope.eventForm = { name: '', type: 'manual', severity: 'medium', unit: '', startTime: '', endTime: '', description: '' };
                scope.templates = [
                    { name: 'השבתה מתוכננת', type: 'planned', severity: 'low' },
                    { name: 'כשל יחידה', type: 'unplanned', severity: 'critical' },
                    { name: 'תחזוקה שוטפת', type: 'maintenance', severity: 'low' }
                ];
                scope.history = [];
                for (i = 0; i < 8; i++) {
                    scope.history.push({
                        name: ['השבתה U1','כשל טורבינה','תחזוקה','בדיקת מגן','ניקוי'][i % 5],
                        type: ['planned','unplanned','maintenance','test','maintenance'][i % 5],
                        time: _timeAgo(_rnd(1, 168)),
                        user: 'admin',
                        status: ['success','success','success','failed','success'][i % 5]
                    });
                }
                scope.writeCount = 8;
                scope.currentUser = 'admin';
                scope.canWrite = true;
                scope.authStatus = 'ok';
                scope.loading = false;
                break;

            // ── eftable20: scope.events, scope.filteredEvents + PI AF Event Frames ──
            case 'eftable20':
                // S4: Inject PI AF Event Frame data (structured per PI Vision spec)
                scope.eventFrameData = _makeEventFrameData(DATA_STATE, 20);
                scope.events = [];
                for (i = 0; i < 20; i++) {
                    scope.events.push({
                        id: i + 1,
                        name: ['\u05D4\u05E9\u05D1\u05EA\u05EA \u05D9\u05D7\u05D9\u05D3\u05D4','\u05E2\u05DC\u05D9\u05D9\u05D4 \u05D1\u05D8\u05DE\u05E4\u05E8\u05D8\u05D5\u05E8\u05D4','\u05D9\u05E8\u05D9\u05D3\u05EA \u05DE\u05EA\u05D7','\u05E2\u05D5\u05DE\u05E1 \u05D9\u05EA\u05E8','\u05DB\u05E9\u05DC \u05DE\u05D0\u05D5\u05D5\u05E8\u05E8'][i % 5],
                        desc: '\u05D0\u05D9\u05E8\u05D5\u05E2 \u05D3\u05DE\u05D5 #' + (i + 1),
                        severity: ['crit','warn','ok','warn','crit'][i % 5],
                        time: _timeAgo(_rnd(0, 48)),
                        rawStart: Date.now() - _rndInt(0, 172800000),
                        site: _SITES[i % 6],
                        unit: _UNITS[i % 6]
                    });
                }
                scope.filteredEvents = scope.events.slice();
                scope.searchText     = '';
                scope.severityFilter = 'all';
                scope.ackFilter      = 'all';
                scope.sortCol        = 'time';
                scope.sortAsc        = false;
                scope.page           = 0;
                scope.selectedEvent  = null;
                scope.viewMode       = 'table';
                scope.unackedCount   = 8;
                scope.updatePaused   = false;
                scope.efMode         = false;
                scope.efLoading      = false;
                scope.panelOpen      = false;
                scope.loading        = false;
                break;

            // ── co2emis20: scope.units, scope.totalEmission, scope.avgFactor, scope.activeTab ──
            case 'co2emis20':
                scope.activeTab       = 'monitor';
                scope.units           = [];
                for (i = 0; i < 6; i++) {
                    var co2Val = _rnd(40, 180);
                    var co2Prod = _rnd(200, 600);
                    scope.units.push({
                        name: _SITES[i] + ' ' + _UNITS[i],
                        emission: +co2Val.toFixed(1),
                        production: +co2Prod.toFixed(0),
                        factor: +(co2Val / co2Prod).toFixed(3),
                        fuel: ['\u05D2\u05D6','\u05D2\u05D6','\u05E4\u05D7\u05DD','\u05D2\u05D6','\u05DE\u05D6\u05D5\u05D8','\u05D2\u05D6'][i],
                        severity: ['ok','ok','warn','ok','crit','ok'][i]
                    });
                }
                scope.totalEmission   = 720;
                scope.totalProduction = 2850;
                scope.avgFactor       = 0.253;
                scope.correlation     = { r2: 0.87, slope: 0.28 };
                scope.fuelBreakdown   = [
                    { fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', emission: 480, pct: 66.7 },
                    { fuel: '\u05E4\u05D7\u05DD', emission: 140, pct: 19.4 },
                    { fuel: '\u05DE\u05D6\u05D5\u05D8', emission: 100, pct: 13.9 }
                ];
                scope.alertHistory    = [];
                scope.overallSeverity = 'ok';
                scope.panelOpen       = false;
                scope.demoMode        = false;
                scope.loading         = false;
                break;

            // ── co2monitor20: scope.units, scope.currentRate, scope.yearlyUsed, scope.monthlyUsed ──
            case 'co2monitor20':
                scope.activeTab    = 'overview';
                scope.units        = [];
                for (i = 0; i < 6; i++) {
                    scope.units.push({
                        name: _SITES[i] + ' ' + _UNITS[i],
                        rate: +_rnd(30, 150).toFixed(1),
                        today: +_rnd(400, 1200).toFixed(0)
                    });
                }
                scope.currentRate  = +_rnd(600, 900).toFixed(1);
                scope.totalToday   = +_rnd(8000, 14000).toFixed(0);
                scope.yearlyUsed   = +_rnd(200000, 400000).toFixed(0);
                scope.monthlyUsed  = +_rnd(20000, 40000).toFixed(0);
                scope.yearlyPct    = +_rnd(40, 85).toFixed(1);
                scope.monthlyPct   = +_rnd(50, 90).toFixed(1);
                scope.dailyPct     = +_rnd(60, 95).toFixed(1);
                scope.yearlyStatus  = 'ok';
                scope.monthlyStatus = 'warn';
                scope.dailyStatus   = 'ok';
                scope.trendData    = [];
                scope.alerts       = [];
                scope.panelOpen    = false;
                scope.loading      = false;
                break;

            // ── constmon20: scope.units, scope.filteredUnits, scope.summary, scope.alerts ──
            case 'constmon20':
                scope.activeTab     = 'cards';
                scope.searchText    = '';
                scope.units         = [];
                for (i = 0; i < 6; i++) {
                    var cPct = _rnd(20, 98);
                    scope.units.push({
                        name: _SITES[i] + ' ' + _UNITS[i],
                        site: _SITES[i],
                        statusLabel: cPct > 95 ? '\u05D7\u05E8\u05D9\u05D2\u05D4' : (cPct > 80 ? '\u05D0\u05D6\u05D4\u05E8\u05D4' : '\u05EA\u05E7\u05D9\u05DF'),
                        quotaUsedPct: +cPct.toFixed(1),
                        runningHoursDisplay: _rndInt(2000, 7500) + ' \u05E9\u05E2\u05D5\u05EA',
                        co2Display: +_rnd(5000, 30000).toFixed(0) + ' \u05D8\u05D5\u05DF',
                        fuelDisplay: +_rnd(1000, 8000).toFixed(0) + ' \u05D8\u05D5\u05DF',
                        startsDisplay: _rndInt(10, 80) + ' \u05D4\u05EA\u05E0\u05E2\u05D5\u05EA',
                        currentMW: +_rnd(100, 500).toFixed(0)
                    });
                }
                scope.filteredUnits = scope.units.slice();
                scope.summary       = { total: 6, overQuota: 1, warnings: 2, normal: 3, totalConstrainedHours: 450 };
                scope.alerts        = [];
                scope.panelOpen     = false;
                scope.demoMode      = false;
                scope.loading       = false;
                break;

            // ── dtblpro20: scope.items, scope.filteredItems, scope.columns, scope.summary ──
            case 'dtblpro20':
                scope.items   = [];
                scope.columns = [
                    { key: 'label', label: '\u05E9\u05DD', width: '200px' },
                    { key: 'display', label: '\u05E2\u05E8\u05DA', width: '120px' },
                    { key: 'status', label: '\u05DE\u05E6\u05D1', width: '80px' }
                ];
                for (i = 0; i < 15; i++) {
                    scope.items.push({
                        idx: i,
                        label: _SITES[i % 6] + ' ' + _UNITS[i % 6],
                        display: +_rnd(50, 600).toFixed(2),
                        value: +_rnd(50, 600).toFixed(2),
                        statusLevel: ['ok','ok','warn','ok','crit','ok'][i % 6],
                        good: i % 7 !== 0,
                        stale: i === 13,
                        fullPath: '\\\\PISERVER01\\' + _SITES[i % 6] + '\\' + _UNITS[i % 6]
                    });
                }
                scope.filteredItems = scope.items.slice();
                scope.groups        = [];
                scope.summary       = { total: 15, good: 11, warn: 2, crit: 1, bad: 1, stale: 1 };
                scope.footerStats   = { avg: 325.4, min: 52.1, max: 589.7, sum: 4880 };
                scope.searchText    = '';
                scope.quickFilter   = 'all';
                scope.activeFilterCount = 0;
                scope.currentPage   = 0;
                scope.panelOpen     = false;
                scope.detailItem    = null;
                scope.connectionStatus = 'good';
                scope.connectionText   = '\u05DE\u05D7\u05D5\u05D1\u05E8';
                scope.loading       = false;
                break;

            // ── genblock20: scope.units, scope.filteredUnits, scope.summary, scope.fleetStats ──
            case 'genblock20':
                scope.activeTab     = 'cards';
                scope.filterState   = 'all';
                scope.searchText    = '';
                scope.units         = [];
                var gbStates = ['active','active','standby','active','starting','active','fault','active'];
                for (i = 0; i < 8; i++) {
                    var gbMW = gbStates[i] === 'active' ? +_rnd(100, 500).toFixed(0) : 0;
                    scope.units.push({
                        label: _SITES[i % 6] + ' ' + _UNITS[i % 6],
                        stateId: gbStates[i],
                        stateLabel: { active: '\u05DE\u05D9\u05D9\u05E6\u05E8', standby: '\u05D4\u05DE\u05EA\u05E0\u05D4', starting: '\u05D4\u05EA\u05E0\u05E2\u05D4', fault: '\u05EA\u05E7\u05DC\u05D4' }[gbStates[i]] || gbStates[i],
                        displayMW: gbMW,
                        capPct: gbMW > 0 ? +(gbMW / 500 * 100).toFixed(1) : 0,
                        rampRate: +_rnd(-5, 8).toFixed(2),
                        trend: gbMW > 300 ? '\u2191' : '\u2193'
                    });
                }
                scope.filteredUnits = scope.units.slice();
                scope.summary       = { total: 8, active: 5, standby: 1, starting: 1, fault: 1, totalMW: 1850 };
                scope.fleetStats    = { avgLoad: 72.3, totalCap: 4000, utilization: 46.3 };
                scope.alerts        = [];
                scope.panelOpen     = false;
                scope.demoMode      = false;
                scope.loading       = false;
                break;

            // ── gridstatus20: scope.items, scope.filteredItems, scope.summary, scope.healthScore, scope.n1 ──
            case 'gridstatus20':
                scope.activeTab      = 'dashboard';
                scope.items          = [
                    { label: '\u05EA\u05D3\u05E8 \u05E8\u05E9\u05EA', value: 50.01, unit: 'Hz', category: 'frequency', statusLevel: 'ok' },
                    { label: '\u05DE\u05EA\u05D7 \u05E8\u05E9\u05EA', value: 161.2, unit: 'kV', category: 'voltage', statusLevel: 'ok' },
                    { label: '\u05D1\u05D9\u05E7\u05D5\u05E9', value: 12800, unit: 'MW', category: 'demand', statusLevel: 'ok' },
                    { label: '\u05D9\u05D9\u05E6\u05D5\u05E8', value: 13500, unit: 'MW', category: 'supply', statusLevel: 'ok' },
                    { label: '\u05E2\u05EA\u05D5\u05D3\u05D4 \u05E1\u05D5\u05D1\u05D1\u05EA', value: 1350, unit: 'MW', category: 'reserve', statusLevel: 'ok' },
                    { label: '\u05E2\u05EA\u05D5\u05D3\u05D4 %', value: 10.5, unit: '%', category: 'reserve', statusLevel: 'warn' },
                    { label: 'ROCOF', value: 0.02, unit: 'Hz/s', category: 'frequency', statusLevel: 'ok' },
                    { label: '\u05E7\u05D9\u05E9\u05D5\u05E8\u05D9\u05D5\u05EA', value: 24, unit: '', category: 'connections', statusLevel: 'ok' }
                ];
                scope.filteredItems  = scope.items.slice();
                scope.categories     = { frequency: 2, voltage: 1, demand: 1, supply: 1, reserve: 2, connections: 1 };
                scope.activeCategories = ['frequency','voltage','demand','supply','reserve','connections'];
                scope.summary        = { total: 8, good: 7, warn: 1, crit: 0 };
                scope.healthScore    = 92;
                scope.healthGrade    = 'A';
                scope.healthColor    = '#2ecc71';
                scope.healthArc      = '';
                scope.n1             = { available: true, ok: true, reserve: 1350, largestGen: 575, margin: 775 };
                scope.eventLog       = [];
                scope.alerts         = [];
                scope.panelOpen      = false;
                scope.loading        = false;
                break;

            // ── freqmtr20: scope.freq, scope.status, scope.rocof, scope.stats ──
            case 'freqmtr20':
                scope.viewMode  = 'gauge';
                scope.freq      = +(50 + _rnd(-0.03, 0.03)).toFixed(3);
                scope.status    = { cls: 'normal', label: '\u05EA\u05E7\u05D9\u05DF', color: '#2ecc71' };
                scope.rocof     = +_rnd(-0.05, 0.05).toFixed(3);
                scope.stats     = { min: 49.95, max: 50.05, avg: 50.001, count: 360 };
                scope.ufls      = [
                    { stage: 1, freq: 49.6, load: 450, label: '\u05E9\u05DC\u05D1 1' },
                    { stage: 2, freq: 49.4, load: 600, label: '\u05E9\u05DC\u05D1 2' },
                    { stage: 3, freq: 49.2, load: 800, label: '\u05E9\u05DC\u05D1 3' }
                ];
                scope.events    = [];
                scope.panelOpen = false;
                scope.loading   = false;
                break;

            // ── fuelgauge20: scope.tanks, scope.summary ──
            case 'fuelgauge20':
                scope.viewMode = 'tanks';
                scope.tanks    = [];
                var fuelTypes = ['\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9','\u05DE\u05D6\u05D5\u05D8','\u05E1\u05D5\u05DC\u05E8','\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9'];
                for (i = 0; i < 4; i++) {
                    var fLvl = _rnd(10, 95);
                    scope.tanks.push({
                        name: _SITES[i] + ' - ' + fuelTypes[i],
                        fuelType: fuelTypes[i],
                        levelPct: +fLvl.toFixed(1),
                        volume: +_rnd(5000, 50000).toFixed(0),
                        capacity: 60000,
                        burnRate: +_rnd(50, 300).toFixed(1),
                        hoursRemain: +(fLvl * 600 / _rnd(50, 300)).toFixed(0),
                        status: fLvl < 15 ? 'critical' : (fLvl < 30 ? 'warning' : 'ok'),
                        _svg: ''
                    });
                }
                scope.summary = {
                    totalVolume: 120000,
                    totalCapacity: 240000,
                    avgLevel: 55.3,
                    lowCount: 1,
                    critCount: 0
                };
                scope.panelOpen = false;
                scope.loading   = false;
                break;

            // ── gauge20: scope.gauges, scope.filteredGauges ──
            case 'gauge20':
                scope.gauges = [];
                scope.filteredGauges = [];
                for (i = 0; i < 6; i++) {
                    var gVal = +_rnd(0, 100).toFixed(1);
                    scope.gauges.push({
                        key: 'g' + i,
                        label: _SITES[i] + ' ' + _UNITS[i],
                        value: gVal,
                        display: gVal.toFixed(1),
                        unit: 'MW',
                        color: gVal > 80 ? '#e74c3c' : (gVal > 60 ? '#f39c12' : '#2ecc71'),
                        path: '\\\\PISERVER01\\' + _SITES[i]
                    });
                }
                scope.filteredGauges = scope.gauges.slice();
                scope.gaugeMin   = 0;
                scope.gaugeMax   = 100;
                scope.engUnit    = 'MW';
                scope.viewMode   = 'gauges';
                scope.showTarget = true;
                scope.targetValue = 75;
                scope.liveTime   = new Date().toLocaleTimeString('he-IL');
                scope.searchText = '';
                scope.loading    = false;
                break;

            // ── piechart20: scope.slices, scope.summary, scope.stats ──
            case 'piechart20':
                scope.viewMode   = 'donut';
                scope.slices     = [];
                var pcColors = ['#5BC0EB','#2ECC71','#F39C12','#E74C3C','#9B59B6','#1ABC9C'];
                var pcTotal  = 0;
                for (i = 0; i < 6; i++) {
                    var pcV = +_rnd(100, 600).toFixed(0);
                    pcTotal += pcV;
                    scope.slices.push({
                        label: _SITES[i],
                        value: pcV,
                        color: pcColors[i],
                        pct: 0,
                        visible: true
                    });
                }
                for (i = 0; i < scope.slices.length; i++) {
                    scope.slices[i].pct = +(scope.slices[i].value / pcTotal * 100).toFixed(1);
                }
                scope.summary = { total: pcTotal, count: 6, largest: '\u05D0\u05E9\u05E7\u05DC\u05D5\u05DF' };
                scope.stats   = { min: 100, max: 600, avg: +(pcTotal / 6).toFixed(0) };
                scope.hoveredIdx  = -1;
                scope.selectedIdx = -1;
                scope.panelOpen   = false;
                scope.loading     = false;
                break;

            // ── navbar20: scope.items, scope.filteredItems, scope.favoriteItems, scope.kpiItems ──
            case 'navbar20':
                scope.items = [
                    { label: '\u05D3\u05E9\u05D1\u05D5\u05E8\u05D3 \u05E8\u05D0\u05E9\u05D9', icon: '\u2302', url: '#main', type: 'display' },
                    { label: '\u05D0\u05E9\u05E7\u05DC\u05D5\u05DF', icon: '\u2693', url: '#ashkelon', type: 'display' },
                    { label: '\u05D7\u05D3\u05E8\u05D4', icon: '\u2693', url: '#hadera', type: 'display' },
                    { label: '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF', icon: '\u2693', url: '#orot', type: 'display' },
                    { label: '\u05D3\u05D5\u05D7\u05D5\u05EA', icon: '\u25A4', url: '#reports', type: 'display' },
                    { label: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA', icon: '\u2699', url: '#settings', type: 'config' }
                ];
                scope.filteredItems  = scope.items.slice();
                scope.favoriteItems  = [scope.items[1], scope.items[2]];
                scope.recentItems    = [scope.items[0]];
                scope.favorites      = ['\u05D0\u05E9\u05E7\u05DC\u05D5\u05DF','\u05D7\u05D3\u05E8\u05D4'];
                scope.kpiItems       = [];
                for (i = 0; i < 6; i++) {
                    scope.kpiItems.push({ label: _SITES[i], value: +_rnd(100, 600).toFixed(0), unit: 'MW', status: ['ok','ok','warn','ok','crit','ok'][i] });
                }
                scope.kpiSummary     = { total: 6, good: 4, warn: 1, crit: 1, bad: 0, stale: 0, sumMW: 2850 };
                scope.hasData        = true;
                scope.showKpi        = true;
                scope.editMode       = false;
                scope.searchText     = '';
                scope.loading        = false;
                break;

            // ── renewwdg20: scope.allItems, scope.categories, scope.totalRenewableMW, scope.penetrationPct ──
            case 'renewwdg20':
                scope.viewMode         = 'dashboard';
                scope.allItems         = [];
                for (i = 0; i < 8; i++) {
                    scope.allItems.push({
                        label: (i < 4 ? '\u05E1\u05D5\u05DC\u05E8\u05D9 ' : '\u05E8\u05D5\u05D7 ') + (i % 4 + 1),
                        value: +_rnd(10, 120).toFixed(1),
                        type: i < 4 ? 'solar' : 'wind',
                        cf: +_rnd(15, 45).toFixed(1)
                    });
                }
                scope.categories       = { solar: { count: 4, totalMW: 280, cf: 28 }, wind: { count: 4, totalMW: 220, cf: 32 } };
                scope.totalRenewableMW = 500;
                scope.penetrationPct   = 17.5;
                scope.systemLoadMW     = 2850;
                scope.hasCurtailTag    = false;
                scope.intermittency    = { variability: 12.3, rampRate: 8.5, rampEvents: 3, ewmaValue: 480 };
                scope.curtailment      = { mw: 0, pct: 0, mwhToday: 0, costToday: 0 };
                scope.stats            = { min: 12, max: 118, avg: 62.5, p95: 110 };
                scope.panelOpen        = false;
                scope.loading          = false;
                break;

            // ── reportgen20: scope.activeTab, scope.engineStatus, scope.reportTemplates, scope.reportHistory ──
            case 'reportgen20':
                scope.activeTab       = 'generate';
                scope.engineStatus    = 'ready';
                scope.engineStatusText = '\u05DE\u05D5\u05DB\u05DF';
                scope.currentUnit     = '';
                scope.reportCount     = 12;
                scope.loadedProfiles  = 6;
                scope.generating      = false;
                scope.generateError   = '';
                scope.generateSuccess = '';
                scope.currentReport   = null;
                scope.reportTemplates = [
                    { key: 'status', label: '\u05D3\u05D5\u05D7 \u05E1\u05D8\u05D8\u05D5\u05E1 \u05D9\u05D7\u05D9\u05D3\u05D4' },
                    { key: 'performance', label: '\u05D3\u05D5\u05D7 \u05D1\u05D9\u05E6\u05D5\u05E2\u05D9\u05DD' },
                    { key: 'maintenance', label: '\u05D3\u05D5\u05D7 \u05EA\u05D7\u05D6\u05D5\u05E7\u05D4' }
                ];
                scope.reportHistory   = [];
                for (i = 0; i < 5; i++) {
                    scope.reportHistory.push({
                        unitKey: _SITES[i] + '/' + _UNITS[i],
                        template: ['status','performance','maintenance'][i % 3],
                        time: _timeAgo(_rnd(1, 168)),
                        report: { title: '\u05D3\u05D5\u05D7 ' + _SITES[i], unit: _SITES[i] + '/' + _UNITS[i], generatedAt: _timeAgo(_rnd(1, 48)), healthScore: _rndInt(60, 95) }
                    });
                }
                scope.reportConfig = {
                    template: 'status', unitKey: '', site: '', unit: '', title: '',
                    includeCharts: true, includeCorrelations: true, includeAnomalyLog: true
                };
                scope.panelOpen       = false;
                scope.loading         = false;
                break;

            // ── resrvind20: scope.available, scope.demand, scope.marginPct, scope.stage ──
            case 'resrvind20':
                scope.available    = 14200;
                scope.demand       = 12800;
                scope.spinning     = 800;
                scope.largestUnit  = 575;
                scope.planningReserve = 1400;
                scope.marginPct    = 10.9;
                scope.marginDisplay = '10.9%';
                scope.availableDisplay = '14,200 MW';
                scope.demandDisplay    = '12,800 MW';
                scope.spinningDisplay  = '800 MW';
                scope.planningReserveDisplay = '1,400 MW';
                scope.stage = { key: 'adequate', label: '\u05EA\u05E7\u05D9\u05DF', labelEn: 'Adequate', color: '#2ECC71', css: 'ri20-stage-adequate' };
                scope.n1Pass       = true;
                scope.n1Gap        = 825;
                scope.n1GapDisplay = '825 MW';
                scope.tankFill     = 65;
                scope.spinFill     = 40;
                scope.quickFill    = 15;
                scope.coldFill     = 10;
                scope.marginHistory = [];
                scope.alertEvents   = [];
                scope.stats = { current: '10.9%', min: '8.2%', max: '18.5%', avg: '12.1%', stddev: '2.3%', hoursBelowMin: 2, worst24h: '8.2%' };
                scope.sparkPath     = '';
                scope.forecast      = { toMonitor: '4.2h', toAlert: '---', toEmergency: '---', slope: -0.3, slopeDisplay: '-0.3%/h', direction: 'stable' };
                scope.hasData       = true;
                scope.viewMode      = 'gauge';
                scope.panelOpen     = false;
                scope.loading       = false;
                break;

            // ── traflit20: scope.state, scope.currentValue, scope.history ──
            case 'traflit20':
                scope.state = { name: '\u05EA\u05E7\u05D9\u05DF', nameEn: 'Good', cls: 'green', shape: '\u25CF' };
                scope.currentValue = +_rnd(20, 45).toFixed(1);
                scope.currentLabel = _SITES[0] + ' ' + _UNITS[0];
                scope.history      = [];
                for (i = 0; i < 10; i++) {
                    scope.history.push({
                        state: ['green','green','yellow','green','green','red','green','green','yellow','green'][i],
                        value: +_rnd(15, 85).toFixed(1),
                        time: _timeAgo(_rnd(0, 24))
                    });
                }
                scope.layout        = 'vertical';
                scope.historyView   = false;
                scope.showLabel     = true;
                scope.thresholds    = { mode: 'high_only', warn: 50, crit: 80, warnLo: 0, critLo: 0 };
                scope.panelOpen     = false;
                scope.loading       = false;
                break;

            // ── dataexport20: scope.currentValues, scope.recording, scope.records, scope.viewTab ──
            case 'dataexport20':
                scope.currentValues = [];
                for (i = 0; i < 6; i++) {
                    scope.currentValues.push({
                        label: _SITES[i] + ' ' + _UNITS[i],
                        value: +_rnd(50, 600).toFixed(2),
                        unit: 'MW',
                        time: new Date().toISOString(),
                        good: true
                    });
                }
                scope.recording     = false;
                scope.records       = [];
                scope.recordCount   = 0;
                scope.maxRecords    = 5000;
                scope.snapshots     = [];
                scope.snapshotCount = 0;
                scope.viewTab       = 'live';
                scope.autoExport    = false;
                scope.autoExportCount = 100;
                scope.panelOpen     = false;
                scope.loading       = false;
                break;

            // ── asstcmp20: scope.units, scope.filteredUnits, scope.siteList (same pattern as comparison20) ──
            case 'asstcmp20':
                scope.activeTab     = 'ranking';
                scope.units         = [];
                scope.siteList      = _SITES.slice(0, 6);
                for (i = 0; i < 8; i++) {
                    var acBl = _rnd(300, 500);
                    scope.units.push({
                        displayName: _SITES[i % 6] + ' ' + _UNITS[i % 6],
                        site: _SITES[i % 6],
                        status: ['producing','producing','offline','producing','producing','sync','producing','fault'][i],
                        compositeScore: +_rnd(40, 95).toFixed(1),
                        values: {
                            Production_MW: +_rnd(100, 500).toFixed(1),
                            Efficiency_Pct: +_rnd(32, 48).toFixed(1),
                            Load_Pct: +_rnd(30, 95).toFixed(1),
                            CO2_Emission_TPH: +_rnd(50, 200).toFixed(2)
                        }
                    });
                }
                scope.filteredUnits = scope.units.slice();
                scope.filterText    = '';
                scope.filterSite    = '';
                scope.filterStatus  = '';
                scope.panelOpen     = false;
                scope.loading       = false;
                break;

            // ── asstovr20: scope.assets, scope.filteredAssets, scope.stats ──
            case 'asstovr20':
                scope.assets         = [];
                scope.filteredAssets  = [];
                for (i = 0; i < 8; i++) {
                    var aoVal = +_rnd(50, 600).toFixed(2);
                    scope.assets.push({
                        _idx: i,
                        label: _SITES[i % 6] + ' ' + _UNITS[i % 6],
                        value: aoVal,
                        display: aoVal.toFixed(2),
                        unit: 'MW',
                        valColor: aoVal > 400 ? '--ao20-crit' : (aoVal > 250 ? '--ao20-warn' : '--ao20-good'),
                        quality: { ok: i % 7 !== 0 },
                        stale: i === 5,
                        path: '\\\\PISERVER01\\' + _SITES[i % 6]
                    });
                }
                scope.filteredAssets = scope.assets.slice();
                scope.stats          = { total: 8, avg: 325, min: 55, max: 590, sum: 2600, good: 7, bad: 1, stale: 1, outlierCount: 0 };
                scope.hasData        = true;
                scope.viewMode       = 'table';
                scope.searchText     = '';
                scope.sortCol        = 'label';
                scope.sortDir        = 'asc';
                scope.sparklineEnabled = true;
                scope.selectedAsset  = null;
                scope.panelOpen      = false;
                scope.loading        = false;
                break;

            // ── mugmon20: complex MUG Monitor — scope driven internally via MM20.SITES ──
            case 'mugmon20':
                scope.guardCurrentUser = 'admin';
                scope.loading          = false;
                break;

            // ── mugmoni20: complex MUG Monitor Improved — same pattern as mugmon20 ──
            case 'mugmoni20':
                scope.guardCurrentUser = 'admin';
                scope.loading          = false;
                break;

            // ── mugult20: complex MUG Ultimate — scope driven by MU20 shadow DOM ──
            case 'mugult20':
                scope.guardCurrentUser = 'admin';
                scope.loading          = false;
                break;

            default:
                break;
        }

        // Trigger digest to update template bindings with new demo data
        if (scope.$digest) {
            try { scope.$digest(); } catch (e) {}
        } else if (scope.$apply) {
            try { scope.$apply(); } catch (e) {}
        }
    }
    EMU._injectSymbolDemoData = _injectSymbolDemoData;

    /**
     * Generate demo data for onDataUpdate(data) — delegates to Unified Data Engine.
     * _genMockData is now the single source of truth for all PI Vision data shapes.
     * This thin wrapper exists for backward compatibility (some code calls _generateDemoData).
     */
    function _generateDemoData(dataShape, symbolName) {
        var data = _genMockData(dataShape, DATA_STATE);
        // Overlay symbol-specific label if provided
        if (symbolName && data.Label !== undefined) {
            data.Label = symbolName;
        }
        return data;
    }
    EMU.generateDemoData = _generateDemoData;

    /* =========================================================
     *  SYMBOL LOADER
     * ========================================================= */
    var SYMBOLS_BASE = '../symbols/';

    /* ─── Cordova-safe file loader (XHR fallback for file:// protocol) ─── */
    function _fetchText(url) {
        // fetch() does NOT work with file:// protocol in Cordova Android WebView.
        // Use XMLHttpRequest which works reliably with both http(s) and file://.
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'text';
            xhr.onload = function () {
                if (xhr.status === 200 || xhr.status === 0) { // status 0 = file:// success
                    resolve(xhr.responseText || '');
                } else {
                    reject(new Error('HTTP ' + xhr.status + ' loading ' + url));
                }
            };
            xhr.onerror = function () {
                reject(new Error('Network error loading ' + url));
            };
            xhr.send();
        });
    }

    function _loadCSS(href) {
        if (document.querySelector('link[data-sym-css="' + href + '"]')) return Promise.resolve();
        return new Promise(function (resolve) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.setAttribute('data-sym-css', href);
            link.onload = resolve;
            link.onerror = resolve; // ignore CSS errors
            document.head.appendChild(link);
        });
    }

    function _loadScript(src) {
        if (_loadedPlugins[src]) return Promise.resolve();
        _loadedPlugins[src] = true;
        // Stage 7 tech-debt cleanup: route through window.SymbolLoader.loadScript
        // when available so two symbols that share a plugin only produce one
        // <script> tag in the DOM. The legacy script-injection fallback below
        // covers older runtimes that never loaded js/perf/symbol-loader.js.
        if (typeof window !== 'undefined' && window.SymbolLoader && typeof window.SymbolLoader.loadScript === 'function') {
            return window.SymbolLoader.loadScript(src).then(function () {
                console.log('[EMU] Loaded (via SymbolLoader):', src.split('/').pop());
            }).catch(function () {
                console.warn('[EMU] Could not load', src);
                _loadedPlugins[src] = false;
            });
        }
        // Legacy fallback — direct <script> tag injection. Works reliably
        // with file:// protocol in Cordova Android WebView (XHR and fetch
        // do NOT work with file://).
        return new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            script.src = src;
            script.onload = function () {
                console.log('[EMU] Loaded:', src.split('/').pop());
                resolve();
            };
            script.onerror = function () {
                console.warn('[EMU] Could not load', src);
                _loadedPlugins[src] = false;
                resolve(); // resolve (not reject) — missing plugin should not block symbol loading
            };
            document.head.appendChild(script);
        });
    }

    function _loadSymbol(symName, onLoaded) {
        var base = SYMBOLS_BASE + 'sym-' + symName;
        var jsUrl  = base + '.js';
        var cssUrl = base + '.css';
        var tplUrl = base + '-template.html';

        // Determine plugins needed
        var pluginPromises = [];
        var type = 'v20';
        var symInfo = SYMBOL_LIST.filter(function (s) { return s.name === symName; })[0];
        if (symInfo) type = symInfo.type;

        // Stage 8.3: Symbol Packs dispatch. See the canonical
        // comment in www-src/emulator/js/app.js.
        if (type === 'pack' && typeof window !== 'undefined' && window.PIV_PACKS &&
            typeof window.PIV_PACKS.loadSymbol === 'function') {
            return window.PIV_PACKS.loadSymbol(symName).then(function (result) {
                var def = result ? result.def : null;
                var template = result ? result.template : '';
                if (typeof onLoaded === 'function') onLoaded(def, template);
                return { def: def, template: template };
            });
        }

        // MM20 virtual symbols — already registered inline, no external files needed
        if (type === 'mm20') {
            var def = window.PIVisualization.symbolCatalog.getSymbol(symName);
            if (typeof onLoaded === 'function') onLoaded(def, def ? def.template || '' : '');
            return Promise.resolve({ def: def, template: def ? def.template || '' : '' });
        }

        if (type === 'v20') {
            // Load shared core first, then piv20-core + piv20-ultra
            pluginPromises.push(_loadScript(SYMBOLS_BASE + 'piv-shared-core.js'));
            pluginPromises.push(_loadScript(SYMBOLS_BASE + 'piv20-plugins/piv20-core.js'));
            // Mugbalot symbols are v20 type but need MU20/MM20 core
            if (symName.indexOf('mug') === 0) {
                pluginPromises.push(_loadScript(SYMBOLS_BASE + 'mu20-plugins/mu20-core.js'));
                pluginPromises.push(_loadScript(SYMBOLS_BASE + 'mm20-plugins/mm20-core.js'));
            }
            // Try to load the symbol-specific plugin (skip for mug* — they use mu20/mm20 plugins)
            if (symName.indexOf('mug') !== 0) {
                var pluginName = symName.replace(/20$/, '').replace(/-wow$/, '');
                // Map abbreviated symbol names to full plugin filenames
                var PLUGIN_NAME_MAP = {
                    'maindash': 'maindashboard',
                    'co2emis': 'co2emissions',
                    'scatter': 'scatterplot',
                    'constmon': 'constraintmonitor',
                    'genblock': 'generatorblock',
                    'dtblpro': 'datatablepro',
                    'evtcomp': 'eventcompare',
                    'evtwrtr': 'eventwriter',
                    'freqmtr': 'frequencymeter',
                    'asstcmp': 'assetcompare',
                    'asstovr': 'assetoverview',
                    'renewwdg': 'renewable',
                    'resrvind': 'reserveindicator',
                    'traflit': 'trafficlight'
                };
                // Plugins known NOT to exist — skip silently
                var SKIP_PLUGINS = ['paramctrl', 'slicer'];
                pluginName = PLUGIN_NAME_MAP[pluginName] || pluginName;
                if (SKIP_PLUGINS.indexOf(pluginName) === -1) {
                    var pluginPath = SYMBOLS_BASE + 'piv20-plugins/piv20-' + pluginName + '.js';
                    pluginPromises.push(
                        _loadScript(pluginPath).catch(function() {
                            // Plugin not found — symbol may work without it
                            return Promise.resolve();
                        })
                    );
                }
            }
        } else {
            // WOW symbols — load mu20/mm20 core
            var muPrefix = symName.indexOf('mug') >= 0 || symName.indexOf('mugbalot') >= 0 ? 'mu20' : 'mm20';
            pluginPromises.push(_loadScript(SYMBOLS_BASE + 'mu20-plugins/mu20-core.js'));
            if (symName.indexOf('mug') >= 0) {
                pluginPromises.push(_loadScript(SYMBOLS_BASE + 'mu20-plugins/mu20-dispatch.js'));
            }
        }

        // Load piv20-ultra for v20 symbols that need it
        pluginPromises.push(_loadScript(SYMBOLS_BASE + 'piv20-ultra.js'));

        return Promise.all(pluginPromises)
            .then(function () { return _loadCSS(cssUrl); })
            .then(function () { return _loadScript(jsUrl); })
            .then(function () {
                return _fetchText(tplUrl).catch(function () { return ''; });
            })
            .then(function (template) {
                var def = window.PIVisualization.symbolCatalog.getSymbol(symName);
                if (!def) {
                    console.warn('[EMU] Symbol not registered after loading:', symName);
                    // Try to create a fallback def
                    def = {
                        typeName: symName,
                        displayName: symName,
                        getDefaultConfig: function () { return { DataShape: 'Value', Height: 300, Width: 600 }; }
                    };
                }
                if (typeof onLoaded === 'function') onLoaded(def, template);
                return { def: def, template: template };
            })
            .catch(function (e) {
                console.error('[EMU] Failed to load symbol', symName, e);
                if (typeof onLoaded === 'function') onLoaded(null, '');
            });
    }
    EMU.loadSymbol = _loadSymbol;

    /* =========================================================
     *  SYMBOL RENDERING
     * ========================================================= */
    function _renderSymbol(symName, container) {
        console.log('[EMU] renderSymbol called:', symName, container);
        var $container;
        try { $container = $(container); } catch(e) {
            console.error('[EMU] jQuery container error:', e);
            return;
        }
        try { _stopDemo(); } catch(e) { console.warn('[EMU] stopDemo error:', e); }
        try { _destroyActive(); } catch(e) { console.warn('[EMU] destroyActive error:', e); }

        // Notify guardian (wrapped in try/catch — guardian crash must NOT block symbol loading)
        var _symMeta = null;
        for (var _si = 0; _si < SYMBOL_LIST.length; _si++) { if (SYMBOL_LIST[_si].name === symName) { _symMeta = SYMBOL_LIST[_si]; break; } }
        if (window.GUARDIAN) { try { window.GUARDIAN.symbolStart(symName, _symMeta ? _symMeta.type : ''); } catch(ge) { console.warn('[EMU] Guardian error:', ge.message); } }

        $container.html('<div class="emu-loading"><span class="emu-spinner"></span> טוען ' + symName + '...</div>');

        _loadSymbol(symName, function (def, template) {
            $container.empty();
            if (!def) {
                $container.html('<div class="emu-error">שגיאה בטעינת הסמל: ' + symName + '</div>');
                return;
            }

            var config;
            try { config = def.getDefaultConfig ? def.getDefaultConfig() : {}; } catch(cfgErr) {
                console.warn('[EMU] getDefaultConfig error for', symName, cfgErr.message);
                config = {};
            }

            // ── S6: Apply loadConfig migration if symbol defines it ──
            if (typeof def.loadConfig === 'function') {
                try {
                    var migrated = def.loadConfig(config);
                    if (migrated && typeof migrated === 'object') {
                        config = migrated;
                        console.log('[EMU] loadConfig migration applied for', symName);
                    }
                } catch (lcErr) {
                    console.warn('[EMU] loadConfig error for', symName, lcErr.message);
                }
            }
            config = config || {};
            config.Height = config.Height || 400;
            config.Width = config.Width || 600;

            // Create wrapper
            var $wrapper = $('<div class="sym-wrapper" dir="ltr"></div>');
            $wrapper.css({ width: '100%', minHeight: config.Height + 'px', position: 'relative' });
            $container.append($wrapper);

            // Create scope — PI Vision provides config, Width, Height, and AngularJS-like methods
            var scope = new window._AngularEmu.Scope(null);
            scope.config = config;
            scope.symbol = def;
            scope.Width = config.Width || 600;
            scope.Height = config.Height || 400;
            _activeScope = scope;
            _activeDef = def;

            // Inject mock data into scope
            var dataShape = config.DataShape || 'Value';
            var mockData = _genMockData(dataShape, DATA_STATE);
            _injectDataToScope(scope, mockData, dataShape);

            // ── E3: Apply FormatOptions as CSS custom properties ──
            if (config.FormatOptions && window.PIVisualization && PIVisualization.FormatEngine) {
                PIVisualization.FormatEngine.apply($wrapper[0], config.FormatOptions, def.formatMap);
            }

            // Compile template into wrapper — rewrite PIVision paths to local
            if (template) {
                // AUTO-HEAL: scan and fix template before inserting
                if (window.QAAutoFixer && typeof QAAutoFixer.scanAndFix === 'function') {
                    try {
                        var tplResult = QAAutoFixer.scanAndFix(template, 'sym-' + symName + '-template.html');
                        if (tplResult && tplResult.applied && tplResult.applied.length > 0) {
                            console.log('[AutoFix] Fixed template:', tplResult.applied.map(function(a) { return a.fixId; }).join(', '));
                            template = tplResult.content;
                        }
                    } catch (tplFixErr) {
                        console.warn('[AutoFix] Template fix failed:', tplFixErr.message);
                    }
                }
                // Map PI Vision server paths to local emulator paths
                template = template.replace(
                    /\/PIVision\/Scripts\/app\/editor\/symbols\/ext\//g,
                    '../symbols/'
                );
                // Note: innerHTML used here with server-controlled template content (not user input)
                $wrapper[0].innerHTML = template;
                window.compileTemplate($wrapper[0], scope);
            }

            // Instantiate visObjectType
            if (def.visObjectType) {
                try {
                    _visInstance = new def.visObjectType();
                    // (Guardian handles context via symbolReady)
                    if (typeof _visInstance.init === 'function') {
                        // Check if required widget plugin is registered
                        var widgetCheck = Object.keys($.fn).filter(function(k) { return k.indexOf('piv20') === 0; });
                        console.log('[EMU] Init:', symName, '| jQuery widgets:', widgetCheck.join(',') || 'NONE');

                        // ── E8: Resolve dependency injection ──
                        // PI Vision's Angular DI passes injected services as extra parameters
                        // to init(scope, elem, $svc1, $svc2, ...). We resolve them from
                        // ServiceRegistry and also put them on scope for backward compat.
                        // If def.inject is not declared, parse init() signature for $-prefixed params.
                        var _injectedArgs = [];
                        var _injectNames = def.inject;
                        if (!_injectNames || !_injectNames.length) {
                            // Parse init function signature: init(scope, elem, $interval, $timeout, ...)
                            var _initSig = (_visInstance.init.toString().match(/\(([^)]*)\)/) || ['',''])[1];
                            var _params = _initSig.split(',').map(function(p) { return p.trim(); }).filter(function(p) { return p.charAt(0) === '$'; });
                            if (_params.length > 0) _injectNames = _params;
                        }
                        if (_injectNames && _injectNames.length && window.PIVisualization && PIVisualization.ServiceRegistry) {
                            var injected = PIVisualization.ServiceRegistry.resolve(_injectNames);
                            for (var si = 0; si < _injectNames.length; si++) {
                                var svcName = _injectNames[si];
                                if (svcName === '$scope') { _injectedArgs.push(scope); continue; }
                                scope[svcName] = injected[si];
                                _injectedArgs.push(injected[si]);
                            }
                            console.log('[EMU] Injected services:', _injectNames.join(', '));
                        }

                        // PI Vision passes elem as jQuery-wrapped element to init().
                        // WOW symbols use elem[0] to get the raw DOM element.
                        var elem = $wrapper;
                        _visInstance.init.apply(_visInstance, [scope, elem].concat(_injectedArgs));

                        // Inject per-symbol demo data AFTER init — symbols set up
                        // scope properties with empty defaults during init, and
                        // templates bind to symbol-specific shapes (scope.items,
                        // scope.cells, scope.nodes, etc.) that differ from PI Vision's
                        // generic DataShapes.  This fills them with realistic data.
                        try { _injectSymbolDemoData(scope, symName); } catch (demoErr) {
                            console.warn('[EMU] Demo data injection error for', symName, demoErr);
                        }
                    }

                    // After init, call lifecycle callbacks that the symbol may have set up.
                    // PI Vision calls onDataUpdate when new data arrives — we simulate
                    // this with demo data.
                    if (typeof _visInstance.onDataUpdate === 'function') {
                        var initData = _generateDemoData(dataShape, symName);
                        setTimeout(function () {
                            try { _visInstance.onDataUpdate(initData); } catch (e) {
                                console.warn('[EMU] onDataUpdate error:', symName, e);
                            }
                        }, 500);
                    }

                    // Call onResize with initial dimensions
                    if (typeof _visInstance.onResize === 'function') {
                        var rect = $wrapper[0].getBoundingClientRect();
                        try { _visInstance.onResize(rect.width, rect.height); } catch (e) {}
                    }

                    // Set up ResizeObserver to call onResize on container size changes
                    if (typeof _visInstance.onResize === 'function' && typeof ResizeObserver !== 'undefined') {
                        var _resizeVis = _visInstance;
                        var _resizeObs = new ResizeObserver(function (entries) {
                            for (var ri = 0; ri < entries.length; ri++) {
                                var cr = entries[ri].contentRect;
                                try { _resizeVis.onResize(cr.width, cr.height); } catch (e) {}
                            }
                        });
                        _resizeObs.observe($wrapper[0]);
                        // Store observer for cleanup
                        if (!scope._resizeObservers) scope._resizeObservers = [];
                        scope._resizeObservers.push(_resizeObs);
                    }
                    // AUTO-HEAL: patch missing scope functions + rebind click handlers
                    if (window.QAAutoFixer) {
                        if (typeof QAAutoFixer.fixScope === 'function') {
                            try { QAAutoFixer.fixScope(scope, symName); } catch (e) { console.warn('[AutoFix] fixScope error:', e.message); }
                        }
                        if (typeof QAAutoFixer.rebindClickHandlers === 'function') {
                            try { QAAutoFixer.rebindClickHandlers($wrapper[0], scope); } catch (e) { console.warn('[AutoFix] rebindClickHandlers error:', e.message); }
                        }
                    }

                    // AUTO-HEAL: delayed bus data emit — if symbol still shows "loading" after 1.5s,
                    // it means no PI Web API data arrived. Emit demo data through the bus.
                    (function(_scope, _sym, _wrapper) {
                        setTimeout(function() {
                            if (_scope.loading && window.QAAutoFixer && window.PIV20) {
                                // Find the bus on any jQuery widget data
                                var bus = null;
                                try {
                                    var $r = window.jQuery(_wrapper);
                                    var widgetNames = Object.keys(window.jQuery.fn).filter(function(k) { return k.indexOf('piv20') === 0; });
                                    for (var wi = 0; wi < widgetNames.length; wi++) {
                                        var wd = $r.data(widgetNames[wi]);
                                        if (wd && wd.bus) { bus = wd.bus; break; }
                                    }
                                } catch(e) {}
                                // If no bus from widget, try to create one via scope
                                if (!bus && _scope._bus) bus = _scope._bus;
                                if (bus) {
                                    if (typeof QAAutoFixer.emitBusDemoData === 'function') {
                                        try { QAAutoFixer.emitBusDemoData(_scope, _sym, bus); } catch(e) { console.warn('[AutoFix] emitBusDemoData error:', e.message); }
                                    }
                                } else {
                                    // Fallback: just set loading=false so template shows data
                                    _scope.loading = false;
                                    if (_scope.$digest) try { _scope.$digest(); } catch(e) {}
                                    console.log('[AutoFix] No bus found for', _sym, '— set loading=false');
                                }
                            }
                        }, 1500);
                    })(scope, symName, $wrapper[0]);

                    // Notify guardian — init succeeded
                    if (window.GUARDIAN) { try { window.GUARDIAN.symbolReady(symName, $wrapper[0], scope, _symMeta ? _symMeta.type : ''); } catch(ge) { console.warn('[EMU] Guardian ready error:', ge.message); } }

                    // Visual fallback — inject mock visualization if symbol area stays empty
                    if (window.EMU_FALLBACK) {
                        try { window.EMU_FALLBACK.apply(symName, $wrapper[0]); } catch(fb) { console.warn('[EMU] Fallback error:', fb.message); }
                    }
                } catch (e) {
                    console.warn('[EMU] Error in symbol init:', symName, e.message || e, e.stack || '');
                    if (window.GUARDIAN) { try { window.GUARDIAN.symbolError(symName, e); } catch(ge) {} }
                    // Even on init error, try to show fallback viz
                    if (window.EMU_FALLBACK && $wrapper && $wrapper[0]) {
                        try { window.EMU_FALLBACK.apply(symName, $wrapper[0]); } catch(fb) {}
                    }
                }
            }

            _activeSymbol = { name: symName, def: def, scope: scope, container: $wrapper[0] };
            EMU.activeSymbol = _activeSymbol;
            EMU._visInstance = _visInstance;

            // Visual fallback for ALL symbol types (including MM20 virtual symbols
            // which skip the visObjectType block above)
            if (window.EMU_FALLBACK) {
                try { window.EMU_FALLBACK.apply(symName, $wrapper[0]); } catch(fb) {}
            }

            // Update info bar
            _updateInfoBar(def, config);

            // Start demo
            _startDemo(dataShape, scope, config);

            // Update DevTools elements tab
            if (window.EMU_DEVTOOLS && window.EMU_DEVTOOLS.updateElements) {
                try { window.EMU_DEVTOOLS.updateElements($wrapper[0], symName); } catch(dtErr) { console.warn('[EMU] DevTools update error:', dtErr.message); }
            }

            // Guardian quality monitoring starts automatically via symbolReady
        });
    }
    EMU.renderSymbol = _renderSymbol;

    function _injectDataToScope(scope, mockData, dataShape) {
        scope.data = mockData;
        scope.lastUpdate = new Date().toISOString();
        if (dataShape === 'Value') {
            scope.value = mockData.Value;
            scope.timestamp = mockData.Time;       // Spec uses 'Time'
            scope.status = mockData.IsGood ? 'Good' : 'Bad';
            scope.uom = mockData.Units || '';
            scope.label = mockData.Label || '';
            scope.path = mockData.Path || '';
        } else if (dataShape === 'Gauge') {
            scope.value = mockData.Value;
            scope.timestamp = mockData.Time;
            scope.indicator = mockData.Indicator;
            scope.startIndicator = mockData.StartIndicator || 0;
            scope.scaleLabels = mockData.ValueScaleLabels || [];
            scope.scalePositions = mockData.ValueScalePositions || [];
            scope.uom = mockData.Units || '';
        } else if (dataShape === 'Trend') {
            scope.traces = mockData.Traces || [];
            scope.startTime = mockData.StartTime || '';
            scope.endTime = mockData.EndTime || '';
            scope.duration = mockData.Duration || '';
        } else if (dataShape === 'Table') {
            scope.rows = mockData.Rows || [];
            scope.columns = mockData.Columns || [];
        } else if (dataShape === 'TimeSeries') {
            var tsValues = (mockData.Data && mockData.Data[0] && mockData.Data[0].Values) || [];
            scope.values = tsValues.map(function (v) { return v.Value; });
            scope.timestamps = tsValues.map(function (v) { return v.Time; });
        } else if (dataShape === 'XYPlot') {
            scope.points = mockData.Points || [];
        }
        scope.config = scope.config || {};
    }

    function _destroyActive() {
        // Guardian automatically handles symbol teardown via next symbolStart call

        if (_activeScope) {
            // Clean up ResizeObservers
            if (_activeScope._resizeObservers) {
                _activeScope._resizeObservers.forEach(function (obs) {
                    try { obs.disconnect(); } catch (e) {}
                });
                _activeScope._resizeObservers = null;
            }
            // Clean up any intervals
            if (_activeScope._intervals) {
                _activeScope._intervals.forEach(function (id) {
                    try { clearInterval(id); } catch (e) {}
                });
                _activeScope._intervals = null;
            }
            // Clean up any timeouts
            if (_activeScope._timeouts) {
                _activeScope._timeouts.forEach(function (id) {
                    try { clearTimeout(id); } catch (e) {}
                });
                _activeScope._timeouts = null;
            }
            // Clean up MutationObservers
            if (_activeScope._mutationObservers) {
                _activeScope._mutationObservers.forEach(function (obs) {
                    try { obs.disconnect(); } catch (e) {}
                });
                _activeScope._mutationObservers = null;
            }
            _activeScope.$destroy();
            _activeScope = null;
        }
        // Call official onDestroy lifecycle callback
        if (_visInstance && typeof _visInstance.onDestroy === 'function') {
            try { _visInstance.onDestroy(); } catch (e) {}
        }
        if (_visInstance && typeof _visInstance.destroy === 'function') {
            try { _visInstance.destroy(); } catch (e) {}
        }
        _visInstance = null;
        _activeDef = null;
        _activeSymbol = null;
        EMU.activeSymbol = null;
    }

    /* =========================================================
     *  DEMO MODE (auto-update data every 5s)
     * ========================================================= */
    function _startDemo(dataShape, scope, config) {
        _stopDemo();
        var symName = (_activeSymbol && _activeSymbol.name) || '';
        _demoTimer = setInterval(function () {
            if (!scope || scope.$$destroyed) { _stopDemo(); return; }
            var newData = _genMockData(dataShape, DATA_STATE);
            _injectDataToScope(scope, newData, dataShape);

            // Call legacy dataUpdate on vis instance
            if (_visInstance && typeof _visInstance.dataUpdate === 'function') {
                try { _visInstance.dataUpdate(scope, newData); } catch (e) {}
            }

            // Call official PI Vision lifecycle onDataUpdate callback
            if (_visInstance && typeof _visInstance.onDataUpdate === 'function') {
                var demoData = _generateDemoData(dataShape, symName);
                try { _visInstance.onDataUpdate(demoData); } catch (e) {}
            }

            // Call onConfigChange if config has changed
            if (_visInstance && typeof _visInstance.onConfigChange === 'function') {
                // Only called when config actually changes — skip in periodic updates
            }

            // Digest scope watchers
            try { scope.$digest(); } catch (e) {}

            // Re-compile template interpolations
            if (_activeSymbol && _activeSymbol.container) {
                try { window.compileTemplate(_activeSymbol.container, scope); } catch (e) {}
            }
        }, DEMO_INTERVAL);
    }

    function _stopDemo() {
        if (_demoTimer) { clearInterval(_demoTimer); _demoTimer = null; }
    }
    EMU.stopDemo = _stopDemo;

    /* =========================================================
     *  INFO BAR
     * ========================================================= */
    function _updateInfoBar(def, config) {
        var $bar = $('#emu-info-bar');
        if (!$bar.length) return;
        var ds = config && config.DataShape ? config.DataShape : 'Value';
        $bar.html(
            '<span class="info-name">' + (def.displayName || def.typeName) + '</span>' +
            '<span class="info-sep">|</span>' +
            '<span class="info-type">' + ds + '</span>' +
            '<span class="info-sep">|</span>' +
            '<span class="info-shape">סמל: ' + def.typeName + '</span>'
        );
    }

    /* =========================================================
     *  SIDEBAR BUILD
     * ========================================================= */
    function _buildSidebar() {
        var $sidebar = $('#emu-sidebar');
        if (!$sidebar.length) return;

        var $search = $('<input type="text" class="emu-search" placeholder="חיפוש סמל..." dir="rtl">');
        var $categories = $('<div class="emu-categories"></div>');

        $sidebar.append($search).append($categories);

        function _render(filter) {
            $categories.empty();
            var cats = CATEGORIES.slice(1); // skip "כל הסמלים" for grouping
            cats.forEach(function (cat) {
                var items = SYMBOL_LIST.filter(function (s) {
                    var nameMatch = s.name.toLowerCase().indexOf(filter) >= 0;
                    var dispName = (window.PIVisualization.symbolCatalog.getSymbol(s.name) || {}).displayName || s.name;
                    var dispMatch = dispName.toLowerCase().indexOf(filter) >= 0;
                    return (nameMatch || dispMatch) && s.category === cat;
                });
                if (!items.length && filter) return;

                var $catHeader = $('<div class="emu-cat-header" dir="rtl"><span class="cat-chevron">▼</span><span class="cat-name">' + cat + '</span><span class="cat-count">' + items.length + '</span></div>');
                var $catList = $('<ul class="emu-sym-list"></ul>');

                items.forEach(function (sym) {
                    var def = window.PIVisualization.symbolCatalog.getSymbol(sym.name);
                    var displayName = def ? (def.displayName || sym.name) : sym.name;
                    var badge = sym.type === 'wow' ? '<span class="badge badge-wow">WOW</span>' : '<span class="badge badge-v20">v20</span>';
                    var $li = $('<li class="emu-sym-item" dir="rtl" data-sym="' + sym.name + '" draggable="true">' +
                        badge + '<span class="sym-name" title="' + sym.name + '">' + displayName + '</span>' +
                        '<span class="sym-drag-hint">⠿</span>' +
                        '</li>');
                    $li[0].draggable = true; // Ensure DOM property is set (not just attribute)
                    $li.on('click', function () {
                        $('.emu-sym-item').removeClass('active');
                        $li.addClass('active');
                        EMU.renderSymbol(sym.name, '#emu-canvas');
                        // Mobile: close sidebar
                        if (window.EMU_MOBILE) window.EMU_MOBILE.closeSidebar();
                    });
                    // Drag support — drag symbol from sidebar to canvas
                    $li.on('dragstart', function (e) {
                        e.originalEvent.dataTransfer.setData('application/piv-symbol', sym.name);
                        e.originalEvent.dataTransfer.setData('text/plain', sym.name);
                        e.originalEvent.dataTransfer.effectAllowed = 'copy';
                        $(this).addClass('dragging');
                    });
                    $li.on('dragend', function () { $(this).removeClass('dragging'); });
                    $catList.append($li);
                });

                $catHeader.on('click', function () {
                    $catList.toggleClass('collapsed');
                    $catHeader.find('.cat-chevron').text($catList.hasClass('collapsed') ? '▶' : '▼');
                });

                $categories.append($catHeader).append($catList);
            });

            // Show count
            var total = SYMBOL_LIST.filter(function (s) {
                var d = (window.PIVisualization.symbolCatalog.getSymbol(s.name) || {}).displayName || '';
                return !filter || s.name.indexOf(filter) >= 0 || d.toLowerCase().indexOf(filter) >= 0;
            }).length;
            $('#emu-sym-count').text(total + ' סמלים');
        }

        $search.on('input', function () {
            _render($(this).val().toLowerCase());
        });

        _render('');
        EMU.refreshSidebar = function () { _render($search.val().toLowerCase()); };
    }

    /* =========================================================
     *  TOOLBAR
     * ========================================================= */
    function _buildToolbar() {
        var $tb = $('#emu-toolbar');
        if (!$tb.length) return;

        // Size buttons
        $tb.find('[data-size]').on('click', function () {
            var size = $(this).data('size');
            $tb.find('[data-size]').removeClass('active');
            $(this).addClass('active');
            _applySize(size);
        });

        // Data state buttons
        $tb.find('[data-state]').on('click', function () {
            DATA_STATE = $(this).data('state');
            EMU.dataState = DATA_STATE;
            $tb.find('[data-state]').removeClass('active');
            $(this).addClass('active');
            // Trigger immediate data update
            if (_activeSymbol) {
                var ds = (_activeDef && _activeDef.getDefaultConfig) ? _activeDef.getDefaultConfig().DataShape : 'Value';
                var newData = _genMockData(ds, DATA_STATE);
                if (_activeScope) _injectDataToScope(_activeScope, newData, ds);
                if (_visInstance && typeof _visInstance.dataUpdate === 'function') {
                    try { _visInstance.dataUpdate(_activeScope, newData); } catch (e) {}
                }
                try { if (_activeScope) _activeScope.$digest(); } catch (e) {}
            }
        });

        // Config toggle
        $tb.find('#btn-config').on('click', function () {
            $('#emu-config-panel').toggleClass('open');
            _loadConfigPanel();
        });

        // DevTools toggle
        $tb.find('#btn-devtools').on('click', function () {
            $('#emu-devtools-panel').toggleClass('open');
        });

        // AF Panel toggle
        $tb.find('#btn-af').on('click', function () {
            $('#emu-af-panel').toggleClass('open');
        });

        // Refresh button
        $tb.find('#btn-refresh').on('click', function () {
            if (_activeSymbol) EMU.renderSymbol(_activeSymbol.name, '#emu-canvas');
        });

        // Keyboard shortcuts
        $(document).on('keydown', function (e) {
            if (e.key === 'F12') { e.preventDefault(); $('#emu-devtools-panel').toggleClass('open'); }
            if (e.key === 'F9')  { e.preventDefault(); $('#emu-af-panel').toggleClass('open'); }
            if (e.ctrlKey && e.key === 'r') { e.preventDefault(); if (_activeSymbol) EMU.renderSymbol(_activeSymbol.name, '#emu-canvas'); }
        });
    }

    function _applySize(size) {
        var $canvas = $('#emu-canvas');
        $canvas.removeClass('size-s size-m size-l size-full');
        if (size === 'full') {
            $canvas.addClass('size-full');
        } else {
            $canvas.addClass('size-' + size);
        }
    }

    /* =========================================================
     *  CONFIG PANEL
     * ========================================================= */
    /* ── Config Panel Helpers ──────────────────────────────────── */
    var _CFG_FONTS = ['Heebo', 'Arial', 'Tahoma', 'David', 'Segoe UI', 'Courier New', 'Verdana', 'Georgia', 'Impact', 'Roboto Mono'];
    var _CFG_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64];
    var _cfgInputStyle = 'background:#0A0F1E;color:#e0e0e0;border:1px solid #1e3a5f;border-radius:4px;padding:4px 6px;font-size:12px;';
    var _cfgLabelStyle = 'flex:1;color:#8892b0;font-size:12px;';
    var _cfgRowStyle = 'margin-bottom:8px;display:flex;align-items:center;gap:8px;';
    var _cfgSectionStyle = 'margin-top:14px;padding-top:10px;border-top:1px solid #1e3a5f;';
    var _cfgHeadStyle = 'color:var(--teal,#5BC0EB);margin:0 0 10px 0;font-size:13px;font-weight:600;';

    function _buildSelect(id, options, selected, extraStyle) {
        var h = '<select id="' + id + '" style="' + _cfgInputStyle + 'flex:1;max-width:140px;' + (extraStyle||'') + '">';
        options.forEach(function (o) {
            var v = typeof o === 'object' ? o.value : o;
            var l = typeof o === 'object' ? o.label : o;
            h += '<option value="' + v + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' + l + '</option>';
        });
        return h + '</select>';
    }

    function _loadConfigPanel() {
        if (!_activeDef) return;
        var $panel = $('#emu-config-panel');
        if (!$panel.hasClass('open')) $panel.addClass('open');
        var $content = $panel.find('.config-panel-content');
        if (!$content.length) return;

        var symName = _activeDef.typeName;
        var cfg = (_activeScope ? _activeScope.config : null) || (_activeDef.getDefaultConfig ? _activeDef.getDefaultConfig() : {});
        // Ensure style properties exist on config
        cfg.FontFamily = cfg.FontFamily || 'Heebo';
        cfg.FontSize = cfg.FontSize || 14;
        cfg.FontColor = cfg.FontColor || '#E2EAF4';
        cfg.BackgroundColor = cfg.BackgroundColor || '#0D1B2A';
        cfg.AccentColor = cfg.AccentColor || '#5BC0EB';
        cfg.BorderColor = cfg.BorderColor || '#1e3a5f';
        cfg.TitleFontSize = cfg.TitleFontSize || 16;
        cfg.TitleFontFamily = cfg.TitleFontFamily || 'Heebo';
        cfg.ValueFontSize = cfg.ValueFontSize || 24;
        cfg.ShowTitle = cfg.ShowTitle !== false;
        cfg.ShowBorder = cfg.ShowBorder !== false;
        if (_activeScope) _activeScope.config = cfg;

        var html = '<div class="config-editor" dir="rtl">';

        // ── Section 1: Symbol Config (from getDefaultConfig) ──
        html += '<h4 style="' + _cfgHeadStyle + '">⚙ הגדרות סמל</h4>';
        var skipKeys = { FontFamily:1, FontSize:1, FontColor:1, BackgroundColor:1, AccentColor:1, BorderColor:1, TitleFontSize:1, TitleFontFamily:1, ValueFontSize:1, ShowTitle:1, ShowBorder:1 };
        Object.keys(cfg).forEach(function (k) {
            if (skipKeys[k]) return;
            var val = cfg[k];
            if (typeof val === 'object' && val !== null) return; // Skip complex objects
            var inputId = 'cfg-' + k;
            html += '<div class="config-row" style="' + _cfgRowStyle + '">';
            html += '<label for="' + inputId + '" style="' + _cfgLabelStyle + '" title="' + k + '">' + k + '</label>';
            if (typeof val === 'boolean') {
                html += '<input type="checkbox" id="' + inputId + '" data-cfg-key="' + k + '" ' + (val ? 'checked' : '') + ' style="accent-color:#5BC0EB;">';
            } else if (typeof val === 'number') {
                html += '<input type="number" id="' + inputId + '" data-cfg-key="' + k + '" value="' + val + '" style="width:80px;' + _cfgInputStyle + '">';
            } else if (typeof val === 'string' && /^#[0-9a-f]{3,8}$/i.test(val)) {
                html += '<input type="color" id="' + inputId + '" data-cfg-key="' + k + '" value="' + val + '" style="width:40px;height:28px;border:none;cursor:pointer;">';
            } else {
                html += '<input type="text" id="' + inputId + '" data-cfg-key="' + k + '" value="' + (val || '') + '" style="flex:1;max-width:140px;' + _cfgInputStyle + '">';
            }
            html += '</div>';
        });

        // ── Section 2: Typography ──
        html += '<div style="' + _cfgSectionStyle + '">';
        html += '<h4 style="' + _cfgHeadStyle + '">🔤 טיפוגרפיה</h4>';

        // Main font family
        html += '<div class="config-row" style="' + _cfgRowStyle + '">';
        html += '<label style="' + _cfgLabelStyle + '">משפחת גופן</label>';
        html += _buildSelect('cfg-FontFamily', _CFG_FONTS, cfg.FontFamily, 'font-family:' + cfg.FontFamily);
        html += '</div>';

        // Main font size
        html += '<div class="config-row" style="' + _cfgRowStyle + '">';
        html += '<label style="' + _cfgLabelStyle + '">גודל גופן</label>';
        html += '<input type="range" id="cfg-FontSize" min="8" max="48" value="' + cfg.FontSize + '" style="flex:1;accent-color:#5BC0EB;">';
        html += '<span id="cfg-FontSize-val" style="color:#e0e0e0;font-size:11px;min-width:28px;text-align:center;">' + cfg.FontSize + 'px</span>';
        html += '</div>';

        // Title font
        html += '<div class="config-row" style="' + _cfgRowStyle + '">';
        html += '<label style="' + _cfgLabelStyle + '">גופן כותרת</label>';
        html += _buildSelect('cfg-TitleFontFamily', _CFG_FONTS, cfg.TitleFontFamily);
        html += '</div>';

        html += '<div class="config-row" style="' + _cfgRowStyle + '">';
        html += '<label style="' + _cfgLabelStyle + '">גודל כותרת</label>';
        html += '<input type="range" id="cfg-TitleFontSize" min="10" max="48" value="' + cfg.TitleFontSize + '" style="flex:1;accent-color:#5BC0EB;">';
        html += '<span id="cfg-TitleFontSize-val" style="color:#e0e0e0;font-size:11px;min-width:28px;text-align:center;">' + cfg.TitleFontSize + 'px</span>';
        html += '</div>';

        // Value font size
        html += '<div class="config-row" style="' + _cfgRowStyle + '">';
        html += '<label style="' + _cfgLabelStyle + '">גודל ערך</label>';
        html += '<input type="range" id="cfg-ValueFontSize" min="10" max="72" value="' + cfg.ValueFontSize + '" style="flex:1;accent-color:#5BC0EB;">';
        html += '<span id="cfg-ValueFontSize-val" style="color:#e0e0e0;font-size:11px;min-width:28px;text-align:center;">' + cfg.ValueFontSize + 'px</span>';
        html += '</div>';

        // ── Section 3: Colors ──
        html += '</div><div style="' + _cfgSectionStyle + '">';
        html += '<h4 style="' + _cfgHeadStyle + '">🎨 צבעים</h4>';

        var colorFields = [
            { key: 'FontColor',       label: 'צבע טקסט' },
            { key: 'BackgroundColor', label: 'צבע רקע' },
            { key: 'AccentColor',     label: 'צבע דגש' },
            { key: 'BorderColor',     label: 'צבע מסגרת' }
        ];
        colorFields.forEach(function (cf) {
            html += '<div class="config-row" style="' + _cfgRowStyle + '">';
            html += '<label style="' + _cfgLabelStyle + '">' + cf.label + '</label>';
            html += '<input type="color" id="cfg-' + cf.key + '" data-cfg-key="' + cf.key + '" value="' + cfg[cf.key] + '" style="width:36px;height:28px;border:1px solid #1e3a5f;border-radius:4px;cursor:pointer;padding:0;">';
            html += '<span class="color-hex" style="color:#888;font-size:10px;font-family:monospace;">' + cfg[cf.key] + '</span>';
            html += '</div>';
        });

        // ── Section 4: Display Options ──
        html += '</div><div style="' + _cfgSectionStyle + '">';
        html += '<h4 style="' + _cfgHeadStyle + '">👁 תצוגה</h4>';

        html += '<div class="config-row" style="' + _cfgRowStyle + '">';
        html += '<label style="' + _cfgLabelStyle + '">הצג כותרת</label>';
        html += '<input type="checkbox" id="cfg-ShowTitle" data-cfg-key="ShowTitle" ' + (cfg.ShowTitle ? 'checked' : '') + ' style="accent-color:#5BC0EB;">';
        html += '</div>';

        html += '<div class="config-row" style="' + _cfgRowStyle + '">';
        html += '<label style="' + _cfgLabelStyle + '">הצג מסגרת</label>';
        html += '<input type="checkbox" id="cfg-ShowBorder" data-cfg-key="ShowBorder" ' + (cfg.ShowBorder ? 'checked' : '') + ' style="accent-color:#5BC0EB;">';
        html += '</div>';

        // ── Section 5: Add Element ──
        html += '</div><div style="' + _cfgSectionStyle + '">';
        html += '<h4 style="' + _cfgHeadStyle + '">➕ הוספת אלמנט</h4>';

        html += '<div class="config-row" style="' + _cfgRowStyle + 'flex-wrap:wrap;">';
        var addElements = [
            { type: 'label',  icon: '🏷️', label: 'תווית' },
            { type: 'value',  icon: '🔢', label: 'ערך' },
            { type: 'image',  icon: '🖼️', label: 'תמונה' },
            { type: 'shape',  icon: '⬡', label: 'צורה' },
            { type: 'divider',icon: '—', label: 'קו הפרדה' },
            { type: 'badge',  icon: '●', label: 'תג סטטוס' }
        ];
        addElements.forEach(function (el) {
            html += '<button class="cfg-add-el-btn" data-add-type="' + el.type + '" style="padding:4px 10px;' +
                'background:rgba(91,192,235,0.08);color:#5BC0EB;border:1px solid rgba(91,192,235,0.2);' +
                'border-radius:4px;cursor:pointer;font-size:11px;margin:2px;">' + el.icon + ' ' + el.label + '</button>';
        });
        html += '</div>';

        // ── Section 6: Element Inspector ──
        html += '</div><div style="' + _cfgSectionStyle + '">';
        html += '<h4 style="' + _cfgHeadStyle + '">🔍 עריכת אלמנט</h4>';
        html += '<div id="cfg-element-inspector" style="font-size:12px;color:#6b7fa3;">לחץ על אלמנט בתוך הסמל כדי לערוך אותו</div>';

        // ── Apply button ──
        html += '</div>';
        html += '<button class="config-apply-btn" style="margin-top:14px;width:100%;padding:10px;background:#5BC0EB;color:#0A0F1E;' +
            'border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;">החל שינויים</button>';

        // ── Data source info ──
        html += '<div class="config-datasource" dir="rtl" style="' + _cfgSectionStyle + '">' +
            '<h4 style="color:#f5a623;margin:0 0 8px 0;font-size:13px;">🔗 מקור נתונים</h4>';
        if (_activeScope && _activeScope.dataSource) {
            var ds = _activeScope.dataSource;
            html += '<div style="font-size:12px;color:#8892b0;">' +
                '<div>תגית: <strong style="color:#e0e0e0;">' + ds.Tag + '</strong></div>' +
                '<div>יחידות: ' + ds.Units + '</div>' +
                '<div>נתיב: ' + ds.Path + '</div></div>';
        } else {
            html += '<div style="font-size:12px;color:#6b7fa3;">גרור תגית מ-AF Browser לקנבס</div>';
        }
        html += '</div></div>'; // close config-editor

        $content.html(html);
        _wireConfigEvents($content);

        $panel.find('.config-panel-title').text('הגדרות: ' + (_activeDef.displayName || symName));
    }

    function _applyStyleToSymbol() {
        if (!_activeScope || !_activeSymbol || !_activeSymbol.container) return;
        var cfg = _activeScope.config;
        // Sync config from DOM inputs (safety net — handles native events jQuery misses)
        var _readVal = function(id) { var el = document.getElementById(id); return el ? el.value : null; };
        var _readInt = function(id) { var v = _readVal(id); return v !== null ? parseInt(v, 10) : null; };
        if (_readVal('cfg-FontFamily'))   cfg.FontFamily   = _readVal('cfg-FontFamily');
        if (_readVal('cfg-TitleFontFamily')) cfg.TitleFontFamily = _readVal('cfg-TitleFontFamily');
        if (_readInt('cfg-FontSize'))     cfg.FontSize     = _readInt('cfg-FontSize');
        if (_readInt('cfg-TitleFontSize'))cfg.TitleFontSize= _readInt('cfg-TitleFontSize');
        if (_readInt('cfg-ValueFontSize'))cfg.ValueFontSize= _readInt('cfg-ValueFontSize');
        if (_readVal('cfg-FontColor'))    cfg.FontColor    = _readVal('cfg-FontColor');
        if (_readVal('cfg-BackgroundColor')) cfg.BackgroundColor = _readVal('cfg-BackgroundColor');
        if (_readVal('cfg-AccentColor'))  cfg.AccentColor  = _readVal('cfg-AccentColor');
        if (_readVal('cfg-BorderColor'))  cfg.BorderColor  = _readVal('cfg-BorderColor');
        var stEl = document.getElementById('cfg-ShowTitle');
        if (stEl) cfg.ShowTitle = stEl.checked;
        var sbEl = document.getElementById('cfg-ShowBorder');
        if (sbEl) cfg.ShowBorder = sbEl.checked;

        var $w = $(_activeSymbol.container);

        // Apply font
        $w.css({
            'font-family': cfg.FontFamily + ', Heebo, sans-serif',
            'font-size': cfg.FontSize + 'px',
            'color': cfg.FontColor,
            'background-color': cfg.BackgroundColor,
            'border-color': cfg.BorderColor
        });
        if (cfg.ShowBorder) { $w.css('border', '1px solid ' + cfg.BorderColor); } else { $w.css('border', 'none'); }

        // Apply title styles
        $w.find('h1,h2,h3,h4,h5,.title,.sym-title,.header,.panel-title,[class*="title"],[class*="header"]').css({
            'font-family': cfg.TitleFontFamily + ', Heebo, sans-serif',
            'font-size': cfg.TitleFontSize + 'px',
            'display': cfg.ShowTitle ? '' : 'none'
        });

        // Apply accent color
        $w.find('.accent,[class*="accent"],.value,.stat-value,svg text,svg .accent-fill').css('fill', cfg.AccentColor);
        $w.find('svg line,svg path,svg polyline,svg circle').each(function () {
            var $el = $(this);
            if ($el.attr('stroke') && $el.attr('stroke') !== 'none') {
                $el.attr('stroke', cfg.AccentColor);
            }
        });

        // Apply value font size
        $w.find('.value,.stat-value,[class*="value"],[ng-bind],.data-value').css('font-size', cfg.ValueFontSize + 'px');

        // Notify symbol
        if (_visInstance && typeof _visInstance.onConfigChange === 'function') {
            try { _visInstance.onConfigChange(cfg); } catch (e) {}
        }
        try { _activeScope.$digest(); } catch (e) {}
    }

    function _addElementToSymbol(type) {
        if (!_activeSymbol || !_activeSymbol.container) return;
        var $w = $(_activeSymbol.container);
        var id = 'emu-el-' + Date.now();
        var $el;

        switch (type) {
            case 'label':
                $el = $('<div id="' + id + '" class="emu-added-el emu-el-label" contenteditable="true" ' +
                    'style="position:absolute;top:10px;right:10px;padding:4px 12px;background:rgba(91,192,235,0.15);' +
                    'color:#5BC0EB;border:1px dashed rgba(91,192,235,0.3);border-radius:4px;font-size:13px;cursor:move;z-index:50;">' +
                    'תווית חדשה</div>');
                break;
            case 'value':
                $el = $('<div id="' + id + '" class="emu-added-el emu-el-value" contenteditable="true" ' +
                    'style="position:absolute;top:50px;right:10px;padding:6px 14px;' +
                    'color:#00D4AA;font-size:28px;font-weight:bold;cursor:move;z-index:50;">' +
                    '42.7</div>');
                break;
            case 'image':
                $el = $('<div id="' + id + '" class="emu-added-el emu-el-image" ' +
                    'style="position:absolute;top:10px;left:10px;width:60px;height:60px;' +
                    'background:rgba(91,192,235,0.1);border:1px dashed #1e3a5f;border-radius:8px;' +
                    'display:flex;align-items:center;justify-content:center;color:#5BC0EB;font-size:24px;cursor:move;z-index:50;">🖼️</div>');
                break;
            case 'shape':
                $el = $('<svg id="' + id + '" class="emu-added-el emu-el-shape" width="60" height="60" viewBox="0 0 60 60" ' +
                    'style="position:absolute;top:10px;left:80px;cursor:move;z-index:50;">' +
                    '<polygon points="30,5 55,50 5,50" fill="none" stroke="#5BC0EB" stroke-width="2"/></svg>');
                break;
            case 'divider':
                $el = $('<hr id="' + id + '" class="emu-added-el emu-el-divider" ' +
                    'style="border:none;border-top:2px solid rgba(91,192,235,0.3);margin:8px 0;width:100%;">');
                break;
            case 'badge':
                $el = $('<span id="' + id + '" class="emu-added-el emu-el-badge" contenteditable="true" ' +
                    'style="position:absolute;top:10px;left:10px;padding:3px 10px;background:#22c55e;' +
                    'color:#fff;border-radius:12px;font-size:11px;font-weight:bold;cursor:move;z-index:50;">תקין</span>');
                break;
        }
        if ($el) {
            $w.append($el);
            // Make draggable within symbol
            _makeElDraggable($el);
            // Flash border to indicate addition
            $el.css('outline', '2px solid #5BC0EB');
            setTimeout(function () { $el.css('outline', ''); }, 1500);
        }
    }

    function _makeElDraggable($el) {
        $el.on('mousedown', function (e) {
            if (e.target.contentEditable === 'true' && document.activeElement === e.target) return; // Allow text editing
            e.preventDefault();
            e.stopPropagation();
            var $me = $(this);
            var startX = e.pageX, startY = e.pageY;
            var origL = parseInt($me.css('left'), 10) || 0;
            var origT = parseInt($me.css('top'), 10) || 0;
            var origR = parseInt($me.css('right'), 10);
            var useRight = !isNaN(origR) && $me.css('left') === 'auto';

            function onMove(ev) {
                if (useRight) {
                    $me.css({ right: (origR - (ev.pageX - startX)) + 'px', left: 'auto' });
                } else {
                    $me.css({ left: (origL + ev.pageX - startX) + 'px' });
                }
                $me.css('top', (origT + ev.pageY - startY) + 'px');
            }
            function onUp() { $(document).off('mousemove', onMove).off('mouseup', onUp); }
            $(document).on('mousemove', onMove).on('mouseup', onUp);
        });
        // Click to inspect/edit in config panel
        $el.on('click', function (e) {
            e.stopPropagation();
            _inspectElement($(this));
        });
    }

    function _inspectElement($el) {
        var $inspector = $('#cfg-element-inspector');
        if (!$inspector.length) return;
        var tag = $el.prop('tagName') || 'DIV';
        var id = $el.attr('id') || '';
        var currentFont = $el.css('font-family') || 'Heebo';
        var currentSize = parseInt($el.css('font-size'), 10) || 14;
        var currentColor = _rgbToHex($el.css('color') || '#e0e0e0');
        var currentBg = _rgbToHex($el.css('background-color') || 'transparent');

        var html = '<div style="margin-top:4px;">';
        html += '<div style="color:#5BC0EB;font-size:11px;margin-bottom:6px;">' + tag + (id ? '#' + id : '') + '</div>';

        // Element font family
        html += '<div style="' + _cfgRowStyle + '">';
        html += '<label style="' + _cfgLabelStyle + '">גופן</label>';
        html += _buildSelect('insp-font', _CFG_FONTS, currentFont.split(',')[0].replace(/['"]/g,'').trim());
        html += '</div>';

        // Element font size
        html += '<div style="' + _cfgRowStyle + '">';
        html += '<label style="' + _cfgLabelStyle + '">גודל</label>';
        html += '<input type="range" id="insp-size" min="8" max="72" value="' + currentSize + '" style="flex:1;accent-color:#5BC0EB;">';
        html += '<span id="insp-size-val" style="color:#e0e0e0;font-size:11px;min-width:24px;">' + currentSize + '</span>';
        html += '</div>';

        // Element color
        html += '<div style="' + _cfgRowStyle + '">';
        html += '<label style="' + _cfgLabelStyle + '">צבע</label>';
        html += '<input type="color" id="insp-color" value="' + currentColor + '" style="width:32px;height:24px;border:1px solid #1e3a5f;border-radius:3px;cursor:pointer;padding:0;">';
        html += '</div>';

        // Element background
        html += '<div style="' + _cfgRowStyle + '">';
        html += '<label style="' + _cfgLabelStyle + '">רקע</label>';
        html += '<input type="color" id="insp-bg" value="' + (currentBg === 'transparent' ? '#0D1B2A' : currentBg) + '" style="width:32px;height:24px;border:1px solid #1e3a5f;border-radius:3px;cursor:pointer;padding:0;">';
        html += '</div>';

        // Delete button
        html += '<button id="insp-delete" style="margin-top:6px;padding:4px 12px;background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);border-radius:4px;cursor:pointer;font-size:11px;">🗑 מחק אלמנט</button>';

        html += '</div>';
        $inspector.html(html);

        // Wire inspector events
        $('#insp-font').on('change', function () { $el.css('font-family', this.value + ', Heebo, sans-serif'); });
        $('#insp-size').on('input', function () { $el.css('font-size', this.value + 'px'); $('#insp-size-val').text(this.value); });
        $('#insp-color').on('input', function () { $el.css('color', this.value); });
        $('#insp-bg').on('input', function () { $el.css('background-color', this.value); });
        $('#insp-delete').on('click', function () { $el.remove(); $inspector.html('<div style="color:#6b7fa3;">אלמנט נמחק</div>'); });

        // Highlight selected element
        $('.emu-added-el').css('outline', '');
        $el.css('outline', '2px solid #f5a623');
    }

    function _rgbToHex(rgb) {
        if (!rgb || rgb === 'transparent' || rgb.charAt(0) === '#') return rgb || '#000000';
        var m = rgb.match(/(\d+)/g);
        if (!m || m.length < 3) return '#000000';
        return '#' + ((1<<24) + (parseInt(m[0])<<16) + (parseInt(m[1])<<8) + parseInt(m[2])).toString(16).slice(1);
    }

    function _wireConfigEvents($content) {
        // Wire change events on config inputs (basic key-value)
        $content.on('change input', '[data-cfg-key]', function () {
            if (!_activeScope) return;
            var key = $(this).data('cfg-key') || $(this).attr('data-cfg-key');
            var val;
            if (this.type === 'checkbox') val = this.checked;
            else if (this.type === 'number') val = parseFloat(this.value) || 0;
            else val = this.value;
            _activeScope.config[key] = val;
            // Update hex display for color inputs
            if (this.type === 'color') {
                $(this).next('.color-hex').text(this.value);
            }
        });

        // Font family selects
        $content.on('change', '#cfg-FontFamily', function () {
            if (_activeScope) _activeScope.config.FontFamily = this.value;
            $(this).css('font-family', this.value);
        });
        $content.on('change', '#cfg-TitleFontFamily', function () {
            if (_activeScope) _activeScope.config.TitleFontFamily = this.value;
        });

        // Range sliders — live preview
        $content.on('input', '#cfg-FontSize', function () {
            if (_activeScope) _activeScope.config.FontSize = parseInt(this.value, 10);
            $('#cfg-FontSize-val').text(this.value + 'px');
        });
        $content.on('input', '#cfg-TitleFontSize', function () {
            if (_activeScope) _activeScope.config.TitleFontSize = parseInt(this.value, 10);
            $('#cfg-TitleFontSize-val').text(this.value + 'px');
        });
        $content.on('input', '#cfg-ValueFontSize', function () {
            if (_activeScope) _activeScope.config.ValueFontSize = parseInt(this.value, 10);
            $('#cfg-ValueFontSize-val').text(this.value + 'px');
        });

        // Add element buttons (debounced to prevent double-fire)
        var _addElLock = false;
        $content.on('click', '.cfg-add-el-btn', function (e) {
            e.stopImmediatePropagation();
            if (_addElLock) return;
            _addElLock = true;
            var type = $(this).data('add-type');
            _addElementToSymbol(type);
            // Flash button
            $(this).css('background', 'rgba(0,212,170,0.2)');
            var btn = this;
            setTimeout(function () { $(btn).css('background', 'rgba(91,192,235,0.08)'); _addElLock = false; }, 300);
        });

        // Apply button — applies all style changes to symbol
        $content.on('click', '.config-apply-btn', function () {
            _applyStyleToSymbol();
            // Visual feedback
            $(this).text('✓ הוחל!').css('background', '#00D4AA');
            var btn = this;
            setTimeout(function () { $(btn).text('החל שינויים').css('background', '#5BC0EB'); }, 1500);
        });

        // Element click inspection — wire on symbol wrapper
        if (_activeSymbol && _activeSymbol.container) {
            $(_activeSymbol.container).off('click.inspect').on('click.inspect', '.emu-added-el', function (e) {
                e.stopPropagation();
                _inspectElement($(this));
            });
        }
    }

    /* =========================================================
     *  CONTEXT MENU
     * ========================================================= */
    function _initContextMenu() {
        var $menu = $('<ul id="emu-context-menu" class="context-menu" dir="rtl" style="display:none"></ul>');
        $('body').append($menu);

        $('#emu-main').on('contextmenu', '.sym-wrapper', function (e) {
            e.preventDefault();
            $menu.empty();

            // ── E4: Pull symbol configOptions from PI Vision API ──
            // PI Vision calls: configOptions(context, clickedElement, monitorOptions, layoutOptions)
            // context has: .symbol, .config, .runtimeData, .def
            var symbolMenuItems = [];
            if (_activeDef && typeof _activeDef.configOptions === 'function') {
                try {
                    var context = {
                        symbol: _activeDef,
                        config: _activeScope ? _activeScope.config : {},
                        runtimeData: _activeScope ? _activeScope.data : {},
                        def: _activeDef
                    };
                    var clickedEl = e.target;
                    var monitorOptions = [];
                    var layoutOptions = [];
                    _activeDef.configOptions(context, clickedEl, monitorOptions, layoutOptions);
                    // configOptions pushes items into layoutOptions array
                    symbolMenuItems = layoutOptions.concat(monitorOptions);
                } catch (cfgErr) {
                    console.warn('[EMU] configOptions error:', cfgErr.message);
                }
            }

            // Symbol-specific menu items (from configOptions)
            if (symbolMenuItems.length > 0) {
                symbolMenuItems.forEach(function (opt) {
                    if (!opt || !opt.title) return;
                    var enabled = opt.enabled !== false;
                    var $li = $('<li class="' + (enabled ? '' : 'disabled') + '">⚡ ' + opt.title + '</li>');
                    if (enabled) {
                        $li.on('click', function () {
                            $menu.hide();
                            if (typeof opt.action === 'function') {
                                try { opt.action(); } catch (e) { console.warn('[EMU] Menu action error:', e); }
                            } else if (opt.mode && _activeScope) {
                                // Mode toggle (PI Vision pattern)
                                _activeScope.config = _activeScope.config || {};
                                _activeScope.config[opt.mode] = !_activeScope.config[opt.mode];
                                if (_visInstance && typeof _visInstance.onConfigChange === 'function') {
                                    try { _visInstance.onConfigChange(_activeScope.config, {}); } catch (e) {}
                                }
                                if (_activeScope.$digest) try { _activeScope.$digest(); } catch (e) {}
                            }
                        });
                    }
                    $menu.append($li);
                });
                // Separator between symbol menu and emulator menu
                $menu.append('<li class="context-sep"></li>');
            }

            // ── AVEVA PI Vision standard menu items ──
            var items = [
                { label: 'הגדרות',          icon: '⚙', fn: function () { $('#emu-config-panel').addClass('open'); _loadConfigPanel(); } },
                { label: 'מגמה',            icon: '📈', fn: function () { _openPopupTrend(); } },
                { label: 'פרטים',           icon: 'ℹ', fn: function () { _showSymbolInfo(); } },
                { sep: true },
                { label: 'הבא קדימה',      icon: '⬆', fn: function () { _changeZOrder(1); } },
                { label: 'שלח אחורה',       icon: '⬇', fn: function () { _changeZOrder(-1); } },
                { sep: true },
                { label: 'שנה גודל',        icon: '↔', fn: function () { _toggleResizeHandles(); } },
                { label: 'הזז סמל',         icon: '✥', fn: function () { _enableSymbolMove(); } },
                { sep: true },
                { label: 'רענן סמל',        icon: '↺', fn: function () { if (_activeSymbol) EMU.renderSymbol(_activeSymbol.name, '#emu-canvas'); } },
                { label: 'ייצא תמונה',      icon: '📷', fn: function () { _exportSymbolImage(); } },
                { label: 'העתק JSON',       icon: '{}', fn: function () { _copyConfigJson(); } },
                { sep: true },
                { label: 'הסר סמל',         icon: '✕', cls: 'danger', fn: function () { _removeSymbol(); } }
            ];
            items.forEach(function (item) {
                if (item.sep) { $menu.append('<li class="context-sep"></li>'); return; }
                var $li = $('<li class="' + (item.cls || '') + '">' + item.icon + ' ' + item.label + '</li>');
                $li.on('click', function () { $menu.hide(); item.fn(); });
                $menu.append($li);
            });
            $menu.css({ top: e.pageY, left: e.pageX, display: 'block' });
        });

        $(document).on('click', function () { $menu.hide(); });
    }

    function _exportSymbolImage() {
        if (!_activeSymbol) return;
        var $w = $(_activeSymbol.container);
        alert('[ייצוא תמונה] דורש html2canvas — לא זמין במצב אמולציה');
    }

    function _showSymbolInfo() {
        if (!_activeDef) return;
        var cfg = _activeDef.getDefaultConfig ? _activeDef.getDefaultConfig() : {};
        alert('סמל: ' + _activeDef.typeName + '\nDataShape: ' + cfg.DataShape + '\nגובה: ' + cfg.Height + 'px\nרוחב: ' + cfg.Width + 'px');
    }

    function _copyConfigJson() {
        if (!_activeDef) return;
        var cfg = _activeDef.getDefaultConfig ? _activeDef.getDefaultConfig() : {};
        try {
            var txt = JSON.stringify(cfg, null, 2);
            if (navigator.clipboard) navigator.clipboard.writeText(txt);
            else { var el = document.createElement('textarea'); el.value = txt; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); }
        } catch (e) {}
    }

    /* ── AVEVA: Popup Trend ────────────────────────────────────── */
    function _openPopupTrend() {
        if (!_activeSymbol) return;
        var symName = _activeSymbol.name;
        var $canvas = $('#emu-canvas');
        // Remove existing popup
        $canvas.find('.emu-popup-trend').remove();
        // Create mini trend overlay
        var $popup = $('<div class="emu-popup-trend" dir="rtl"></div>');
        var $header = $('<div class="popup-trend-header">' +
            '<span>מגמה — ' + symName + '</span>' +
            '<button class="popup-trend-close" title="סגור">✕</button></div>');
        var $body = $('<div class="popup-trend-body"></div>');
        // Generate mini SVG trend line
        var points = [];
        for (var i = 0; i < 40; i++) {
            var x = (i / 39) * 380 + 10;
            var y = 60 + Math.sin(i * 0.3) * 25 + (Math.random() - 0.5) * 15;
            points.push(x + ',' + y);
        }
        $body.html(
            '<svg width="400" height="120" viewBox="0 0 400 120">' +
            '<rect width="400" height="120" fill="#0D1B2A" rx="4"/>' +
            '<line x1="10" y1="100" x2="390" y2="100" stroke="#1B3352" stroke-width="1"/>' +
            '<line x1="10" y1="60" x2="390" y2="60" stroke="#1B3352" stroke-width="0.5" stroke-dasharray="4,4"/>' +
            '<line x1="10" y1="20" x2="390" y2="20" stroke="#1B3352" stroke-width="0.5" stroke-dasharray="4,4"/>' +
            '<polyline points="' + points.join(' ') + '" fill="none" stroke="#5BC0EB" stroke-width="2"/>' +
            '<text x="390" y="115" fill="#6B7D99" font-size="9" text-anchor="end">24h</text>' +
            '<text x="200" y="115" fill="#6B7D99" font-size="9" text-anchor="middle">12h</text>' +
            '<text x="10" y="115" fill="#6B7D99" font-size="9">0h</text>' +
            '</svg>'
        );
        $popup.append($header).append($body);
        $canvas.append($popup);
        $header.find('.popup-trend-close').on('click', function () { $popup.remove(); });
        // Auto-close after 30s
        setTimeout(function () { $popup.remove(); }, 30000);
    }

    /* ── AVEVA: Z-Order ────────────────────────────────────────── */
    function _changeZOrder(dir) {
        var $w = $('.sym-wrapper');
        if (!$w.length) return;
        var z = parseInt($w.css('z-index'), 10) || 10;
        $w.css('z-index', Math.max(1, z + dir * 10));
    }

    /* ── AVEVA: Resize Handles ─────────────────────────────────── */
    function _toggleResizeHandles() {
        var $w = $('.sym-wrapper');
        if (!$w.length) return;
        // Toggle resize UI
        if ($w.hasClass('emu-resizable')) {
            $w.removeClass('emu-resizable');
            $w.find('.emu-resize-handle').remove();
            return;
        }
        $w.addClass('emu-resizable');
        // Add 4 corner + 4 edge handles
        var handles = ['nw','n','ne','e','se','s','sw','w'];
        handles.forEach(function (pos) {
            var $h = $('<div class="emu-resize-handle emu-rh-' + pos + '" data-dir="' + pos + '"></div>');
            $w.append($h);
        });
        // Resize logic
        $w.find('.emu-resize-handle').on('mousedown', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var dir = $(this).data('dir');
            var startX = e.pageX, startY = e.pageY;
            var startW = $w.width(), startH = $w.height();
            var startL = parseInt($w.css('left'), 10) || 0;
            var startT = parseInt($w.css('top'), 10) || 0;

            function onMove(ev) {
                var dx = ev.pageX - startX;
                var dy = ev.pageY - startY;
                var newW = startW, newH = startH, newL = startL, newT = startT;

                if (dir.indexOf('e') >= 0) newW = Math.max(100, startW + dx);
                if (dir.indexOf('w') >= 0) { newW = Math.max(100, startW - dx); newL = startL + dx; }
                if (dir.indexOf('s') >= 0) newH = Math.max(60, startH + dy);
                if (dir.indexOf('n') >= 0) { newH = Math.max(60, startH - dy); newT = startT + dy; }

                $w.css({ width: newW + 'px', height: newH + 'px', minHeight: newH + 'px' });
                if (dir.indexOf('w') >= 0) $w.css('left', newL + 'px');
                if (dir.indexOf('n') >= 0) $w.css('top', newT + 'px');

                // Notify symbol of resize
                if (_visInstance && typeof _visInstance.onResize === 'function') {
                    try { _visInstance.onResize(newW, newH); } catch (e) {}
                }
                if (_activeScope) {
                    _activeScope.Width = newW;
                    _activeScope.Height = newH;
                    try { _activeScope.$digest(); } catch (e) {}
                }
            }
            function onUp() {
                $(document).off('mousemove', onMove).off('mouseup', onUp);
            }
            $(document).on('mousemove', onMove).on('mouseup', onUp);
        });
    }

    /* ── AVEVA: Symbol Move ────────────────────────────────────── */
    function _enableSymbolMove() {
        var $w = $('.sym-wrapper');
        if (!$w.length) return;
        // Toggle movable mode
        if ($w.hasClass('emu-movable')) {
            $w.removeClass('emu-movable');
            $w.css('cursor', '');
            $w.off('mousedown.emumove');
            return;
        }
        $w.addClass('emu-movable');
        $w.css({ position: 'relative', cursor: 'move' });
        $w.on('mousedown.emumove', function (e) {
            if ($(e.target).hasClass('emu-resize-handle')) return; // Don't conflict with resize
            e.preventDefault();
            var startX = e.pageX, startY = e.pageY;
            var origL = parseInt($w.css('left'), 10) || 0;
            var origT = parseInt($w.css('top'), 10) || 0;

            function onMove(ev) {
                $w.css({
                    left: (origL + ev.pageX - startX) + 'px',
                    top:  (origT + ev.pageY - startY) + 'px'
                });
            }
            function onUp() {
                $(document).off('mousemove', onMove).off('mouseup', onUp);
            }
            $(document).on('mousemove', onMove).on('mouseup', onUp);
        });
    }

    /* ── AVEVA: Remove Symbol ──────────────────────────────────── */
    function _removeSymbol() {
        if (!_activeSymbol) return;
        try { _destroyActive(); } catch (e) {}
        $('#emu-canvas').html('<div class="emu-welcome-mini" dir="rtl"><p>הסמל הוסר. בחר סמל חדש מהרשימה.</p></div>');
    }

    /* =========================================================
     *  WELCOME SCREEN
     * ========================================================= */
    function _showWelcome() {
        var html = [
            '<div class="emu-welcome" dir="rtl">',
            '  <div class="welcome-logo">',
            '    <svg viewBox="0 0 80 80" width="80" height="80" fill="none" xmlns="http://www.w3.org/2000/svg">',
            '      <circle cx="40" cy="40" r="36" stroke="#5BC0EB" stroke-width="3" fill="rgba(91,192,235,0.08)"/>',
            '      <path d="M20 50 Q40 20 60 50" stroke="#5BC0EB" stroke-width="3" fill="none"/>',
            '      <circle cx="40" cy="40" r="6" fill="#5BC0EB"/>',
            '      <line x1="40" y1="15" x2="40" y2="25" stroke="#00D4AA" stroke-width="2"/>',
            '      <line x1="40" y1="55" x2="40" y2="65" stroke="#00D4AA" stroke-width="2"/>',
            '      <line x1="15" y1="40" x2="25" y2="40" stroke="#00D4AA" stroke-width="2"/>',
            '      <line x1="55" y1="40" x2="65" y2="40" stroke="#00D4AA" stroke-width="2"/>',
            '    </svg>',
            '  </div>',
            '  <h2>PI Vision Symbol Emulator</h2>',
            '  <p>בחר סמל מהרשימה השמאלית להצגה ובדיקה</p>',
            '  <div class="welcome-stats">',
            '    <div class="welcome-stat"><span class="stat-num">' + SYMBOL_LIST.length + '</span><span class="stat-lbl">סמלים</span></div>',
            '    <div class="welcome-stat"><span class="stat-num">6</span><span class="stat-lbl">קטגוריות</span></div>',
            '    <div class="welcome-stat"><span class="stat-num">6</span><span class="stat-lbl">צורות נתונים</span></div>',
            '  </div>',
            '  <div class="welcome-shortcuts" dir="rtl">',
            '    <div><kbd>F12</kbd> DevTools</div>',
            '    <div><kbd>F9</kbd> AF Browser</div>',
            '    <div><kbd>Ctrl+R</kbd> רענן</div>',
            '    <div><kbd>⚙</kbd> הגדרות</div>',
            '  </div>',
            '</div>'
        ].join('\n');
        $('#emu-canvas').html(html);
    }

    /* =========================================================
     *  CATALOG CALLBACK — called when symbols register themselves
     * ========================================================= */
    window.__EMU_CATALOG_CALLBACK = function (def) {
        if (EMU.refreshSidebar) EMU.refreshSidebar();
    };

    /* =========================================================
     *  INIT
     * ========================================================= */
    $(document).ready(function () {
        // Install jQuery widget factory mock if not already done
        if (window.__installWidgetFactory) window.__installWidgetFactory($);

        _buildSidebar();
        _buildToolbar();
        _initContextMenu();
        _showWelcome();

        // ═══════════════════════════════════════════════════════
        //  R300: Auto-register MM20 virtual symbols in catalog
        //  These don't have separate sym-*.js files — they render
        //  via MU20 core with generated templates.
        // ═══════════════════════════════════════════════════════
        SYMBOL_LIST.forEach(function (sym) {
            if (sym.type !== 'mm20') return;
            var tpl = '<div class="mm20-symbol-container" style="width:100%;height:100%;display:flex;' +
                'flex-direction:column;align-items:center;justify-content:center;' +
                'background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);' +
                'color:#e0e0e0;font-family:Heebo,sans-serif;border-radius:8px;padding:16px;box-sizing:border-box;">' +
                '<div style="font-size:28px;margin-bottom:8px;">\u2699</div>' +
                '<div style="font-size:14px;font-weight:600;color:#00b4d8;">' + (sym.displayName || sym.name) + '</div>' +
                '<div style="font-size:11px;color:#888;margin-top:4px;">MM20 Symbol</div>' +
                '<div class="mm20-value" style="font-size:24px;font-weight:700;color:#00d4aa;margin-top:12px;">--</div>' +
                '<div class="mm20-status" style="font-size:10px;color:#666;margin-top:4px;">Demo Mode</div>' +
                '</div>';
            window.PIVisualization.symbolCatalog.register({
                typeName: sym.name,
                displayName: sym.displayName || sym.name,
                datasourceBehavior: sym.dataShape === 'None' ? 0 : 1,
                getDefaultConfig: function () { return { DataShape: sym.dataShape, Height: 200, Width: 300 }; },
                templateUrl: null,
                template: tpl,
                init: function (scope, elem) {
                    scope._mm20 = true;
                    var valEl = elem.querySelector ? elem.querySelector('.mm20-value') : null;
                    scope._updateDisplay = function (v) {
                        if (valEl) valEl.textContent = typeof v === 'number' ? v.toFixed(1) : String(v);
                    };
                },
                dataUpdate: function (data, scope) {
                    var val = data && data.Value !== undefined ? data.Value : (data && data.Rows ? data.Rows.length + ' rows' : '--');
                    if (scope._updateDisplay) scope._updateDisplay(val);
                }
            });
            console.log('[EMU] MM20 registered: ' + sym.name);
        });

        // Stage 8.3: Initialize Symbol Packs BEFORE the preload
        // walk. See www-src/emulator/js/app.js for the full
        // comment. No-op if PIV_PACKS is absent.
        function _maybeInitPacks() {
            if (typeof window === 'undefined' || !window.PIV_PACKS ||
                typeof window.PIV_PACKS.init !== 'function') {
                return Promise.resolve();
            }
            return window.PIV_PACKS.init().then(function (result) {
                if (!result) return;
                if (result.errors && result.errors.length) {
                    console.warn('[EMU] pack errors:', result.errors);
                }
                var packSymbols = window.PIV_PACKS.getSymbols();
                for (var pi = 0; pi < packSymbols.length; pi++) {
                    var ps = packSymbols[pi];
                    var exists = false;
                    for (var si = 0; si < SYMBOL_LIST.length; si++) {
                        if (SYMBOL_LIST[si].name === ps.name) { exists = true; break; }
                    }
                    if (exists) {
                        console.warn('[EMU] pack symbol name conflicts with built-in, skipping: ' + ps.name);
                        continue;
                    }
                    SYMBOL_LIST.push({
                        name: ps.name,
                        type: 'pack',
                        category: ps.category,
                        dataShape: ps.dataShape
                    });
                }
                if (packSymbols.length) {
                    console.log('[EMU] Registered ' + packSymbols.length + ' pack symbols');
                }
            }).catch(function (err) {
                console.warn('[EMU] pack init failed:', err && err.message);
            });
        }

        // Pre-load all symbol JS files in background to populate catalog
        var _preloadIdx = 0;
        function _preloadNext() {
            if (_preloadIdx >= SYMBOL_LIST.length) {
                if (EMU.refreshSidebar) EMU.refreshSidebar();
                console.log('[EMU] Pre-load complete. Registered symbols: ' + Object.keys(window.PIVisualization.symbolCatalog._defs).length);
                return;
            }
            var sym = SYMBOL_LIST[_preloadIdx++];
            // Pack symbols — delegate to PIV_PACKS.loadSymbol
            if (sym.type === 'pack' && window.PIV_PACKS && window.PIV_PACKS.loadSymbol) {
                window.PIV_PACKS.loadSymbol(sym.name).catch(function () {})
                    .then(function () { setTimeout(_preloadNext, 20); });
                return;
            }
            // Skip MM20 symbols — already registered above
            if (sym.type === 'mm20') { setTimeout(_preloadNext, 5); return; }
            var base = SYMBOLS_BASE + 'sym-' + sym.name;

            // Only load plugins and JS — no template needed for preload
            var p = [];
            if (sym.type === 'v20') {
                p.push(_loadScript(SYMBOLS_BASE + 'piv20-plugins/piv20-core.js'));
            } else {
                p.push(_loadScript(SYMBOLS_BASE + 'mu20-plugins/mu20-core.js'));
            }
            p.push(_loadScript(base + '.js'));
            Promise.all(p).then(function () {
                setTimeout(_preloadNext, 20); // slight delay to avoid freezing browser
            }).catch(function () {
                setTimeout(_preloadNext, 20);
            });
        }

        // Load piv20-ultra first, then initialize packs, then preload.
        _loadScript(SYMBOLS_BASE + 'piv20-ultra.js')
            .then(_maybeInitPacks)
            .then(function () { setTimeout(_preloadNext, 100); });

        // Default size
        $('#btn-size-m').trigger('click');

        // ═══════════════════════════════════════════════════════
        //  R300: HASH ROUTING — auto-open symbol from URL hash
        //  Called by mobile app: emulator/index.html#symbol=gauge20
        // ═══════════════════════════════════════════════════════
        var _hashGeneration = 0; // Cancellation token for retry loops
        function _handleHash() {
            var hash = window.location.hash || '';
            var m = hash.match(/symbol=([^&]+)/);
            if (!m) return;
            var symName = decodeURIComponent(m[1]);
            if (!symName) { _postToParent('symbol-loaded', { symbol: '', status: 'empty' }); return; }
            console.log('[EMU] Hash routing → loading symbol: ' + symName);

            var gen = ++_hashGeneration; // Capture current generation
            var attempts = 0;
            var maxAttempts = 30;
            function tryRender() {
                // Abort if a newer hash navigation has started
                if (gen !== _hashGeneration) {
                    console.log('[EMU] Hash retry cancelled (superseded): ' + symName);
                    return;
                }
                attempts++;
                var def = window.PIVisualization.symbolCatalog.getSymbol(symName);
                if (def) {
                    EMU.renderSymbol(symName, '#emu-canvas');
                    $('.emu-sym-item').removeClass('active');
                    $('.emu-sym-item[data-sym="' + symName + '"]').addClass('active');
                    _postToParent('symbol-loaded', { symbol: symName, status: 'ok' });
                } else if (attempts < maxAttempts) {
                    setTimeout(tryRender, 100);
                } else {
                    console.warn('[EMU] Symbol not in catalog after timeout, trying direct load:', symName);
                    EMU.renderSymbol(symName, '#emu-canvas');
                    _postToParent('symbol-loaded', { symbol: symName, status: 'fallback' });
                }
            }
            setTimeout(tryRender, 300);
        }

        _handleHash();
        window.addEventListener('hashchange', _handleHash);

        // ═══════════════════════════════════════════════════════
        //  R300: PARENT COMMUNICATION (postMessage to mobile app)
        // ═══════════════════════════════════════════════════════
        function _postToParent(type, data) {
            try {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ source: 'piv-emulator', type: type, data: data }, '*');
                }
            } catch (e) {}
        }

        window.addEventListener('message', function (evt) {
            if (!evt.data || evt.data.source !== 'piv-mobile') return;
            var cmd = evt.data;
            if (cmd.type === 'render-symbol' && cmd.symbol) {
                EMU.renderSymbol(cmd.symbol, '#emu-canvas');
            } else if (cmd.type === 'set-data-state' && cmd.state) {
                $('[data-state="' + cmd.state + '"]').trigger('click');
            } else if (cmd.type === 'refresh') {
                if (_activeSymbol) EMU.renderSymbol(_activeSymbol.name, '#emu-canvas');
            }
        });

        // ═══════════════════════════════════════════════════════
        //  R300: INTERNAL QA MONITOR
        // ═══════════════════════════════════════════════════════
        var _qaLog = [];
        var _qaMaxEntries = 50;

        function _qaCheck(symName) {
            var result = {
                symbol: symName,
                timestamp: new Date().toISOString(),
                checks: [],
                status: 'pass'
            };

            var def = window.PIVisualization.symbolCatalog.getSymbol(symName);
            result.checks.push({
                name: 'registered',
                pass: !!def,
                detail: def ? 'OK — ' + (def.displayName || symName) : 'NOT IN CATALOG'
            });

            var canvas = document.getElementById('emu-canvas');
            var hasContent = canvas && canvas.children.length > 0;
            var emptyText = canvas ? canvas.textContent.trim() : '';
            var hasError = /שגיאה|error|failed/i.test(emptyText);
            result.checks.push({
                name: 'rendered',
                pass: hasContent && !hasError,
                detail: hasError ? 'ERROR in render' : (hasContent ? 'OK — content visible' : 'EMPTY canvas')
            });

            var recentErrors = (window.__emuErrors || []).filter(function (e) {
                return Date.now() - e.ts < 5000;
            });
            result.checks.push({
                name: 'no-errors',
                pass: recentErrors.length === 0,
                detail: recentErrors.length === 0 ? 'OK' : recentErrors.length + ' JS errors'
            });

            var hasData = _activeScope && (_activeScope.data || _activeScope.value !== undefined || (_activeScope.rows && _activeScope.rows.length > 0));
            result.checks.push({
                name: 'data-injected',
                pass: !!hasData,
                detail: hasData ? 'OK — mock data present' : 'NO DATA in scope'
            });

            var failCount = result.checks.filter(function (c) { return !c.pass; }).length;
            result.status = failCount === 0 ? 'pass' : failCount <= 1 ? 'warn' : 'fail';

            _qaLog.push(result);
            if (_qaLog.length > _qaMaxEntries) _qaLog.shift();

            if (result.status === 'fail') {
                _qaAutoFix(symName, result);
            }

            _postToParent('qa-result', result);
            return result;
        }

        function _qaAutoFix(symName, qaResult) {
            var fixes = [];

            var regCheck = qaResult.checks.filter(function (c) { return c.name === 'registered'; })[0];
            if (regCheck && !regCheck.pass) {
                fixes.push('Attempting direct symbol load...');
                _loadSymbol(symName, function (def) {
                    if (def) {
                        fixes.push('Direct load succeeded — re-rendering');
                        EMU.renderSymbol(symName, '#emu-canvas');
                        setTimeout(function () { _qaCheck(symName); }, 1000);
                    }
                });
            }

            var renderCheck = qaResult.checks.filter(function (c) { return c.name === 'rendered'; })[0];
            if (renderCheck && !renderCheck.pass && regCheck && regCheck.pass) {
                fixes.push('Empty canvas — forcing re-render with fresh data');
                setTimeout(function () {
                    if (_activeScope) {
                        var ds = (_activeDef && _activeDef.getDefaultConfig) ? _activeDef.getDefaultConfig().DataShape : 'Value';
                        var freshData = _genMockData(ds, 'normal');
                        _injectDataToScope(_activeScope, freshData, ds);
                        // Safe data update call
                        if (_visInstance) {
                            try {
                                if (typeof _visInstance.dataUpdate === 'function') _visInstance.dataUpdate(freshData, _activeScope);
                                else if (typeof _visInstance.onDataUpdate === 'function') _visInstance.onDataUpdate(freshData, _activeScope);
                            } catch (e) { console.warn('[QA] dataUpdate failed:', e.message); }
                        }
                        try { _activeScope.$digest(); } catch (e) {}
                    }
                }, 500);
            }

            var dataCheck = qaResult.checks.filter(function (c) { return c.name === 'data-injected'; })[0];
            if (dataCheck && !dataCheck.pass && _activeScope) {
                fixes.push('Injecting fresh mock data');
                var ds = 'Value';
                if (_activeDef && _activeDef.getDefaultConfig) ds = _activeDef.getDefaultConfig().DataShape || 'Value';
                var freshData = _genMockData(ds, 'normal');
                _injectDataToScope(_activeScope, freshData, ds);
            }

            if (fixes.length > 0) {
                console.log('[QA Auto-Fix] ' + symName + ':', fixes.join(' → '));
                _postToParent('qa-autofix', { symbol: symName, fixes: fixes });
            }
        }

        window.__emuErrors = [];
        window.addEventListener('error', function (e) {
            window.__emuErrors.push({ msg: e.message, ts: Date.now(), file: e.filename });
            if (window.__emuErrors.length > 20) window.__emuErrors.shift();
        });

        var _origRender = EMU.renderSymbol;
        EMU.renderSymbol = function (symName, container) {
            _origRender(symName, container);
            setTimeout(function () { _qaCheck(symName); }, 2000);
        };

        EMU.qa = {
            check: _qaCheck,
            getLog: function () { return _qaLog.slice(); },
            getLastResult: function () { return _qaLog.length > 0 ? _qaLog[_qaLog.length - 1] : null; },
            clearLog: function () { _qaLog = []; }
        };

        console.log('[EMU] PI Vision Symbol Emulator R300 initialized — hash routing + QA monitor active');
    });

    EMU.loadConfigPanel = _loadConfigPanel;

})(window, jQuery);
