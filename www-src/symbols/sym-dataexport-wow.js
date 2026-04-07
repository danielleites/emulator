(function (PV) {
    'use strict';

    /* ═══════════════════════════════════════════════════════
     *  Executive Big Data Exporter — WOW v100
     * ═══════════════════════════════════════════════════════
     *  A Web Worker-based data export engine capable of
     *  exporting millions of rows without crashing the
     *  browser or freezing the UI.
     *
     *  THE GEM: Worker + Chunk Streaming + Blob Assembly
     *  The Worker fetches PI Web API in time-sliced chunks
     *  (pagination), converts each chunk to CSV immediately,
     *  and assembles a Blob (OS-managed virtual file).  The
     *  UI remains responsive — the SVG progress ring animates
     *  at 60fps throughout the entire export.
     *
     *  Traditional approach: build a giant CSV string in
     *  memory on Main Thread → Out of Memory crash (V8
     *  ~1GB limit) + UI freeze.  This approach: Worker
     *  thread + Blob → unlimited export size, zero freeze.
     *
     *  DataShape: None (bypasses PI Vision data pump —
     *  the Worker fetches PI Web API directly)
     *
     *  Shadow DOM · Hebrew RTL · wc20 config
     * ═══════════════════════════════════════════════════════ */

    function symbolVis() { PV.deriveVisualizationFromBase(this); }


    symbolVis.prototype.init = function (scope, elem) {
        var config = scope.config;

        /* ═══ Script Base Path ═══ */
        var SCRIPT_BASE = (function () {
            var scripts = document.querySelectorAll('script[src*="sym-dataexport-wow"]');
            if (scripts.length) {
                var s = scripts[scripts.length - 1].getAttribute('src') || '';
                return s.substring(0, s.lastIndexOf('/') + 1);
            }
            var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
            return base + '/Scripts/app/editor/symbols/ext/';
        })();

        /* ═══ Mount Point ═══ */
        var mountEl = elem[0].querySelector('.wow-de-root-mount');
        if (!mountEl) {
            console.error('[WOW Data Export] Mount element .wow-de-root-mount not found');
            return;
        }

        /* ═══ Shadow DOM ═══ */
        var shadow;
        try { shadow = mountEl.attachShadow({ mode: 'open' }); }
        catch (e) { shadow = mountEl; }

        var linkEl = document.createElement('link');
        linkEl.rel  = 'stylesheet';
        linkEl.href = SCRIPT_BASE + 'sym-dataexport-wow.css';
        shadow.appendChild(linkEl);


        /* ═══ DOM Scaffold ═══ */
        function _el(tag, cls) {
            var e = document.createElement(tag);
            if (cls) e.className = cls;
            return e;
        }

        var root    = _el('div', 'wow-de-root');
        var toolbar = _el('div', 'wow-de-toolbar');
        var titleEl = _el('span', 'wow-de-title');
        var actions = _el('div', 'wow-de-toolbar-actions');

        toolbar.appendChild(titleEl);
        toolbar.appendChild(actions);


        /* ═══ Date Range Inputs ═══ */
        var formSection = _el('div', 'wow-de-form');

        var fieldStart = _el('div', 'wow-de-field');
        var labelStart = _el('label', 'wow-de-label');
        labelStart.textContent = '\u05DE\u05EA\u05D0\u05E8\u05D9\u05DA \u05D4\u05EA\u05D7\u05DC\u05D4';
        /* מתאריך התחלה */
        var inputStart = document.createElement('input');
        inputStart.type = 'datetime-local';
        inputStart.className = 'wow-de-input';
        /* Default: 7 days ago */
        var now = new Date();
        var weekAgo = new Date(now.getTime() - 7 * 86400000);
        inputStart.value = _toLocalISOString(weekAgo);

        fieldStart.appendChild(labelStart);
        fieldStart.appendChild(inputStart);

        var fieldEnd = _el('div', 'wow-de-field');
        var labelEnd = _el('label', 'wow-de-label');
        labelEnd.textContent = '\u05E2\u05D3 \u05EA\u05D0\u05E8\u05D9\u05DA \u05E1\u05D9\u05D5\u05DD';
        /* עד תאריך סיום */
        var inputEnd = document.createElement('input');
        inputEnd.type = 'datetime-local';
        inputEnd.className = 'wow-de-input';
        inputEnd.value = _toLocalISOString(now);

        fieldEnd.appendChild(labelEnd);
        fieldEnd.appendChild(inputEnd);

        formSection.appendChild(fieldStart);
        formSection.appendChild(fieldEnd);


        /* ═══════════════════════════════════════════════════
         *  SVG Circular Progress Ring
         *
         *  The ring uses stroke-dashoffset to animate
         *  progress.  The circumference (2*PI*r) is set as
         *  the stroke-dasharray, and dashoffset is decreased
         *  from full circumference (0%) to 0 (100%).
         *
         *  The SVG is in the DOM at all times — we toggle
         *  visibility.  This avoids layout shifts.
         * ═══════════════════════════════════════════════════ */
        var progressSection = _el('div', 'wow-de-progress');
        progressSection.style.display = 'none';

        var svgNS = 'http://www.w3.org/2000/svg';
        var RING_SIZE   = 120;
        var RING_STROKE = 8;
        var RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
        var RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

        var svgEl = document.createElementNS(svgNS, 'svg');
        svgEl.setAttribute('width', String(RING_SIZE));
        svgEl.setAttribute('height', String(RING_SIZE));
        svgEl.setAttribute('viewBox', '0 0 ' + RING_SIZE + ' ' + RING_SIZE);
        svgEl.classList.add('wow-de-ring-svg');

        /* Background circle */
        var circleBg = document.createElementNS(svgNS, 'circle');
        circleBg.setAttribute('cx', String(RING_SIZE / 2));
        circleBg.setAttribute('cy', String(RING_SIZE / 2));
        circleBg.setAttribute('r',  String(RING_RADIUS));
        circleBg.setAttribute('fill', 'none');
        circleBg.setAttribute('stroke', 'rgba(26, 58, 92, 0.4)');
        circleBg.setAttribute('stroke-width', String(RING_STROKE));

        /* Progress circle */
        var circleProgress = document.createElementNS(svgNS, 'circle');
        circleProgress.setAttribute('cx', String(RING_SIZE / 2));
        circleProgress.setAttribute('cy', String(RING_SIZE / 2));
        circleProgress.setAttribute('r',  String(RING_RADIUS));
        circleProgress.setAttribute('fill', 'none');
        circleProgress.setAttribute('stroke', '#5BC0EB');
        circleProgress.setAttribute('stroke-width', String(RING_STROKE));
        circleProgress.setAttribute('stroke-linecap', 'round');
        circleProgress.setAttribute('stroke-dasharray', String(RING_CIRCUMFERENCE));
        circleProgress.setAttribute('stroke-dashoffset', String(RING_CIRCUMFERENCE));
        circleProgress.classList.add('wow-de-ring-progress');
        /* Rotate so progress starts from top (12 o'clock) */
        circleProgress.setAttribute('transform',
            'rotate(-90 ' + (RING_SIZE / 2) + ' ' + (RING_SIZE / 2) + ')');

        svgEl.appendChild(circleBg);
        svgEl.appendChild(circleProgress);

        /* Percentage text */
        var pctText = _el('div', 'wow-de-ring-pct');
        pctText.textContent = '0%';

        /* Status text */
        var statusText = _el('div', 'wow-de-ring-status');
        statusText.textContent = '\u05DE\u05D7\u05DB\u05D4 \u05DC\u05D9\u05D9\u05E6\u05D5\u05D0...';
        /* מחכה לייצוא... */

        /* Row count */
        var rowCountText = _el('div', 'wow-de-ring-rows');
        rowCountText.textContent = '';

        /* Assemble progress section */
        var ringWrap = _el('div', 'wow-de-ring-wrap');
        ringWrap.appendChild(svgEl);
        ringWrap.appendChild(pctText);

        progressSection.appendChild(ringWrap);
        progressSection.appendChild(statusText);
        progressSection.appendChild(rowCountText);


        /* ═══ Buttons ═══ */
        var btnSection = _el('div', 'wow-de-buttons');

        var btnExport = _el('button', 'wow-de-btn wow-de-btn-primary');
        btnExport.textContent = '\u25B6 \u05D4\u05EA\u05D7\u05DC \u05D9\u05D9\u05E6\u05D5\u05D0';
        /* ▶ התחל ייצוא */

        var btnCancel = _el('button', 'wow-de-btn wow-de-btn-danger');
        btnCancel.textContent = '\u2716 \u05D1\u05D8\u05DC';
        /* ✖ בטל */
        btnCancel.style.display = 'none';

        var btnDownload = _el('button', 'wow-de-btn wow-de-btn-success');
        btnDownload.textContent = '\u2B07 \u05D4\u05D5\u05E8\u05D3 CSV';
        /* ⬇ הורד CSV */
        btnDownload.style.display = 'none';

        btnSection.appendChild(btnExport);
        btnSection.appendChild(btnCancel);
        btnSection.appendChild(btnDownload);


        /* ── Stats Bar ── */
        var statsBar = _el('div', 'wow-de-stats');

        /* ── Skeleton ── */
        var skeleton = _el('div', 'wow-de-skeleton');
        skeleton.style.display = 'none';

        /* ── Footer ── */
        var footer = _el('div', 'wow-de-footer');
        footer.textContent = 'WOW Data Exporter v100 \u00B7 Worker + Chunk Streaming + Blob';

        /* Assemble */
        root.appendChild(toolbar);
        root.appendChild(formSection);
        root.appendChild(progressSection);
        root.appendChild(btnSection);
        root.appendChild(statsBar);
        root.appendChild(skeleton);
        root.appendChild(footer);
        shadow.appendChild(root);


        /* ═══ State ═══ */
        var worker       = null;
        var exportBlob   = null;
        var exportFilename = '';
        var isExporting  = false;
        var downloadUrl  = null;


        /* ═══ PI Web API URL Detection ═══ */
        function _getPiWebApiUrl() {
            /* Try to detect from PI Vision page */
            if (window.PIWebApiUrl) return window.PIWebApiUrl;

            /* Try to extract from PI Vision's AJAX calls */
            var meta = document.querySelector('meta[name="piwebapiurl"]');
            if (meta) return meta.getAttribute('content');

            /* Fallback: config or common default */
            return config.PiWebApiUrl || '/piwebapi';
        }


        /* ═══════════════════════════════════════════════════
         *  Worker Lifecycle
         *
         *  The Worker is created fresh for each export and
         *  terminated on completion or cancellation.  This
         *  ensures no memory leaks — the entire Worker
         *  context (including accumulated Blob data) is
         *  released by the browser on terminate().
         * ═══════════════════════════════════════════════════ */

        function _startExport() {
            if (isExporting) return;

            /* Validate inputs */
            var startTime = inputStart.value;
            var endTime   = inputEnd.value;

            if (!startTime || !endTime) {
                _showStatus('\u05E0\u05D0 \u05DC\u05D4\u05D6\u05D9\u05DF \u05EA\u05D0\u05E8\u05D9\u05DB\u05D9\u05DD', 'error');
                /* נא להזין תאריכים */
                return;
            }

            if (new Date(startTime) >= new Date(endTime)) {
                _showStatus('\u05EA\u05D0\u05E8\u05D9\u05DA \u05D4\u05EA\u05D7\u05DC\u05D4 \u05D7\u05D9\u05D9\u05D1 \u05DC\u05D4\u05D9\u05D5\u05EA \u05DC\u05E4\u05E0\u05D9 \u05EA\u05D0\u05E8\u05D9\u05DA \u05E1\u05D9\u05D5\u05DD', 'error');
                /* תאריך התחלה חייב להיות לפני תאריך סיום */
                return;
            }

            /* Collect WebIds from PI Vision datasources */
            var webIds    = [];
            var labels    = [];
            var symbol    = scope.symbol;

            if (symbol && symbol.DataSources) {
                for (var i = 0; i < symbol.DataSources.length; i++) {
                    var ds = symbol.DataSources[i];
                    if (ds && ds.WebId) {
                        webIds.push(ds.WebId);
                        labels.push(ds.Label || ds.Name || ('Tag_' + (i + 1)));
                    }
                }
            }

            /* Demo mode — fake WebIds */
            if (config.DemoMode) {
                webIds = ['DEMO_WEB_ID_1', 'DEMO_WEB_ID_2', 'DEMO_WEB_ID_3'];
                labels = [
                    '\u05D8\u05DE\u05E4\u05F3 \u05D3\u05D5\u05D3 \u05E7\u05D9\u05D8\u05D5\u05E8',
                    '\u05DC\u05D7\u05E5 \u05E7\u05D5 \u05E8\u05D0\u05E9\u05D9',
                    '\u05E1\u05E4\u05D9\u05E7\u05EA \u05DE\u05D9\u05DD'
                ];
                /* טמפ׳ דוד קיטור, לחץ קו ראשי, ספיקת מים */
            }

            if (!webIds.length && !config.DemoMode) {
                _showStatus('\u05E0\u05D0 \u05DC\u05D4\u05D5\u05E1\u05D9\u05E3 \u05EA\u05D2\u05D9\u05D5\u05EA (DataSources) \u05DC\u05E1\u05DE\u05DC', 'error');
                /* נא להוסיף תגיות (DataSources) לסמל */
                return;
            }

            isExporting = true;
            exportBlob  = null;

            /* UI state: exporting */
            btnExport.style.display   = 'none';
            btnCancel.style.display   = 'inline-flex';
            btnDownload.style.display = 'none';
            progressSection.style.display = 'flex';
            _updateRing(0);
            _showStatus('\u05DE\u05D0\u05EA\u05D7\u05DC \u05D9\u05D9\u05E6\u05D5\u05D0...', 'active');
            /* מאתחל ייצוא... */

            /* Demo mode — simulated export */
            if (config.DemoMode) {
                _runDemoExport(labels);
                return;
            }

            /* Create Worker */
            try {
                worker = new Worker(SCRIPT_BASE + 'wow-plugins/wow-exporter-worker.js');
            } catch (e) {
                _showStatus('\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D9\u05E6\u05D9\u05E8\u05EA Worker: ' + e.message, 'error');
                /* שגיאה ביצירת Worker */
                _resetUI();
                return;
            }

            /* Configure Worker */
            worker.postMessage({
                type: 'CONFIG',
                payload: { piWebApiUrl: _getPiWebApiUrl() }
            });

            /* Worker message handler */
            worker.onmessage = function (e) {
                var msg = e.data;
                if (!msg || !msg.type) return;

                switch (msg.type) {
                    case 'PROGRESS':
                        _onProgress(msg.payload);
                        break;

                    case 'COMPLETE':
                        _onComplete(msg.payload);
                        break;

                    case 'CANCELLED':
                        _onCancelled(msg.payload);
                        break;

                    case 'ERROR':
                        _onError(msg.payload);
                        break;
                }
            };

            worker.onerror = function (e) {
                _onError({ source: 'WORKER', message: e.message || 'Unknown worker error' });
            };

            /* Start export */
            worker.postMessage({
                type: 'EXPORT',
                payload: {
                    webIds:         webIds,
                    startTime:      new Date(startTime).toISOString(),
                    endTime:        new Date(endTime).toISOString(),
                    interval:       config.ChunkInterval || '1d',
                    maxCount:       config.MaxCount || 150000,
                    decimals:       config.Decimals || 2,
                    metadataHeader: config.MetadataHeader !== false,
                    unitLabels:     labels,
                    reportTitle:    config.Title || 'PI Data Export'
                }
            });
        }


        /* ═══ Worker Callbacks ═══ */

        function _onProgress(payload) {
            var pct = payload.pct;
            if (pct >= 0) {
                _updateRing(pct);
            }

            rowCountText.textContent = _formatNumber(payload.rowCount) + ' \u05E9\u05D5\u05E8\u05D5\u05EA';
            /* N שורות */

            var statusMap = {
                'fetching':    '\u05DE\u05D5\u05E8\u05D9\u05D3 \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD...',    /* מוריד נתונים... */
                'processing':  '\u05DE\u05E2\u05D1\u05D3...',                                                   /* מעבד...          */
                'paginating':  '\u05E2\u05DE\u05D5\u05D3 \u05E0\u05D5\u05E1\u05E3 (Pagination)...'              /* עמוד נוסף        */
            };
            statusText.textContent = statusMap[payload.status] || payload.status;
        }

        function _onComplete(payload) {
            isExporting    = false;
            exportBlob     = payload.blob;
            exportFilename = payload.filename;

            _updateRing(100);
            _showStatus(
                '\u2713 \u05D4\u05D9\u05D9\u05E6\u05D5\u05D0 \u05D4\u05D5\u05E9\u05DC\u05DD! ' +
                _formatNumber(payload.rowCount) + ' \u05E9\u05D5\u05E8\u05D5\u05EA \u05D1-' +
                _formatElapsed(payload.elapsed),
                'success'
            );
            /* ✓ הייצוא הושלם! N שורות ב-Xs */

            rowCountText.textContent = _formatNumber(payload.rowCount) + ' \u05E9\u05D5\u05E8\u05D5\u05EA \u00B7 ' +
                                       _formatFileSize(payload.blob.size);

            btnCancel.style.display   = 'none';
            btnDownload.style.display = 'inline-flex';
            btnExport.style.display   = 'inline-flex';
            btnExport.textContent     = '\u25B6 \u05D9\u05D9\u05E6\u05D5\u05D0 \u05D7\u05D3\u05E9';
            /* ▶ ייצוא חדש */

            _terminateWorker();
            _updateStatsBar(payload.rowCount, payload.elapsed, payload.blob.size);
        }

        function _onCancelled(payload) {
            isExporting = false;
            _showStatus(
                '\u05D4\u05D9\u05D9\u05E6\u05D5\u05D0 \u05D1\u05D5\u05D8\u05DC \u2014 ' +
                _formatNumber(payload.rowCount) + ' \u05E9\u05D5\u05E8\u05D5\u05EA \u05DC\u05E4\u05E0\u05D9 \u05D4\u05D1\u05D9\u05D8\u05D5\u05DC',
                'warning'
            );
            /* הייצוא בוטל — N שורות לפני הביטול */

            _resetUI();
            _terminateWorker();
        }

        function _onError(payload) {
            isExporting = false;
            _showStatus(
                '\u05E9\u05D2\u05D9\u05D0\u05D4: ' + (payload.message || 'Unknown error'),
                'error'
            );
            /* שגיאה */

            _resetUI();
            _terminateWorker();
        }


        /* ═══ Cancel Export ═══ */
        function _cancelExport() {
            if (!isExporting) return;

            if (worker) {
                /* Graceful: tell Worker to stop */
                worker.postMessage({ type: 'CANCEL' });

                /* Hard kill after 2s if Worker doesn't respond */
                setTimeout(function () {
                    if (isExporting) {
                        _terminateWorker();
                        isExporting = false;
                        _showStatus('\u05D4\u05D9\u05D9\u05E6\u05D5\u05D0 \u05D1\u05D5\u05D8\u05DC (force)', 'warning');
                        _resetUI();
                    }
                }, 2000);
            } else {
                /* Demo mode cancel */
                isExporting = false;
                _showStatus('\u05D4\u05D9\u05D9\u05E6\u05D5\u05D0 \u05D1\u05D5\u05D8\u05DC', 'warning');
                _resetUI();
            }
        }


        /* ═══ Download ═══ */
        function _downloadFile() {
            if (!exportBlob) return;

            /* Create download URL */
            if (downloadUrl) URL.revokeObjectURL(downloadUrl);
            downloadUrl = URL.createObjectURL(exportBlob);

            var a = document.createElement('a');
            a.href     = downloadUrl;
            a.download = exportFilename || 'export.csv';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }


        /* ═══ UI Helpers ═══ */

        function _updateRing(pct) {
            var offset = RING_CIRCUMFERENCE - (pct / 100) * RING_CIRCUMFERENCE;
            circleProgress.setAttribute('stroke-dashoffset', String(offset));
            pctText.textContent = pct + '%';

            /* Color transition: blue → green on completion */
            if (pct >= 100) {
                circleProgress.setAttribute('stroke', '#00F5D4');
            } else if (pct >= 75) {
                circleProgress.setAttribute('stroke', '#5BC0EB');
            } else {
                circleProgress.setAttribute('stroke', '#5BC0EB');
            }
        }

        function _showStatus(text, level) {
            statusText.textContent = text;
            statusText.className = 'wow-de-ring-status';
            if (level) statusText.classList.add('wow-de-status-' + level);
        }

        function _resetUI() {
            btnExport.style.display   = 'inline-flex';
            btnExport.textContent     = '\u25B6 \u05D4\u05EA\u05D7\u05DC \u05D9\u05D9\u05E6\u05D5\u05D0';
            /* ▶ התחל ייצוא */
            btnCancel.style.display   = 'none';
        }

        function _terminateWorker() {
            if (worker) {
                try { worker.terminate(); } catch (e) {}
                worker = null;
            }
        }

        function _updateStatsBar(rows, elapsed, size) {
            statsBar.innerHTML =
                '<span class="wow-de-stat">' +
                    '\u05E9\u05D5\u05E8\u05D5\u05EA: <b>' + _formatNumber(rows) + '</b></span>' +
                '<span class="wow-de-stat">' +
                    '\u05D6\u05DE\u05DF: <b>' + _formatElapsed(elapsed) + '</b></span>' +
                '<span class="wow-de-stat">' +
                    '\u05D2\u05D5\u05D3\u05DC: <b>' + _formatFileSize(size) + '</b></span>';
            /* שורות: N, זמן: Xs, גודל: NMB */
        }


        /* ═══ Formatting ═══ */

        function _formatNumber(n) {
            if (n === null || n === undefined) return '0';
            return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        }

        function _formatElapsed(ms) {
            if (ms < 1000) return ms + 'ms';
            var sec = (ms / 1000).toFixed(1);
            if (sec < 60) return sec + 's';
            var min = Math.floor(ms / 60000);
            var remSec = Math.round((ms % 60000) / 1000);
            return min + 'm ' + remSec + 's';
        }

        function _formatFileSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
            if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
            return (bytes / 1073741824).toFixed(2) + ' GB';
        }

        function _toLocalISOString(d) {
            var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
            return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
                   'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        }


        /* ═══════════════════════════════════════════════════
         *  Demo Mode — Simulated Export
         *
         *  Simulates the Worker's chunk-streaming progress
         *  without actual PI Web API calls.  Runs through
         *  20 "chunks" with increasing row counts and a
         *  simulated Blob at the end.
         * ═══════════════════════════════════════════════════ */
        function _runDemoExport(labels) {
            var demoChunks   = 20;
            var demoRows     = 0;
            var demoIdx      = 0;
            var demoStart    = Date.now();

            function _demoStep() {
                if (!isExporting) return;

                demoIdx++;
                demoRows += Math.floor(5000 + Math.random() * 10000);
                var pct = Math.round((demoIdx / demoChunks) * 100);

                _onProgress({
                    pct:      Math.min(pct, 99),
                    rowCount: demoRows,
                    status:   demoIdx % 3 === 0 ? 'paginating' : 'fetching'
                });

                if (demoIdx < demoChunks) {
                    setTimeout(_demoStep, 300 + Math.random() * 500);
                } else {
                    /* Build demo CSV blob */
                    var csvHeader = 'Timestamp,' + labels.join(',') + '\r\n';
                    var csvRows   = '';
                    for (var i = 0; i < 100; i++) {
                        csvRows += '2025-01-01 00:00:' + (i < 10 ? '0' : '') + i;
                        for (var j = 0; j < labels.length; j++) {
                            csvRows += ',' + (50 + Math.random() * 50).toFixed(2);
                        }
                        csvRows += '\r\n';
                    }
                    var demoBlob = new Blob(
                        ['# Demo Export\r\n# Generated: ' + new Date().toISOString() + '\r\n#\r\n',
                         csvHeader, csvRows],
                        { type: 'text/csv;charset=utf-8' }
                    );

                    _onComplete({
                        blob:     demoBlob,
                        rowCount: demoRows,
                        elapsed:  Date.now() - demoStart,
                        filename: 'WOW_Demo_Export.csv'
                    });
                }
            }

            setTimeout(_demoStep, 500);
        }


        /* ═══ Event Listeners ═══ */
        function _onExportClick() { _startExport(); }
        function _onCancelClick() { _cancelExport(); }
        function _onDownloadClick() { _downloadFile(); }

        btnExport.addEventListener('click', _onExportClick);
        btnCancel.addEventListener('click', _onCancelClick);
        btnDownload.addEventListener('click', _onDownloadClick);


        /* ═══ Config ═══ */
        function _applyConfig() {
            titleEl.textContent = config.Title || 'Executive Data Exporter';

            var ff = config.fontFamily || 'Segoe UI';
            var fs = config.fontSize   || 12;
            root.style.setProperty('--wow-de-font',      '"' + ff + '", Arial, sans-serif');
            root.style.setProperty('--wow-de-font-size',  fs + 'px');
        }

        ['Title', 'ChunkInterval', 'MaxCount', 'MetadataHeader',
         'Decimals', 'DemoMode', 'fontFamily', 'fontSize'
        ].forEach(function (key) {
            scope.$watch('config.' + key, function () { _applyConfig(); });
        });


        /* ═══ Data Update ═══ */
        /* DataShape: None — no data updates needed.
         * The symbol drives its own data via Worker → PI Web API. */


        /* ═══ Init ═══ */
        _applyConfig();


        /* ═══ Cleanup ═══ */
        scope.$on('$destroy', function () {
            _terminateWorker();
            if (downloadUrl) {
                URL.revokeObjectURL(downloadUrl);
                downloadUrl = null;
            }
            exportBlob = null;
            btnExport.removeEventListener('click', _onExportClick);
            btnCancel.removeEventListener('click', _onCancelClick);
            btnDownload.removeEventListener('click', _onDownloadClick);
        });
    };


    /* ═══ Symbol Registration ═══ */
    PV.symbolCatalog.register({
        typeName:           'dataexport-wow',
        visObjectType:      symbolVis,
        displayName:        '\u05D9\u05D9\u05E6\u05D5\u05D0 \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD WOW v100',
        /* ייצוא נתונים WOW v100 */
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        getDefaultConfig: function () {
            return {
                DataShape:        'Table',
                Height:           450,
                Width:            500,
                Title:            'Executive Data Exporter',
                DemoMode:         true,
                ChunkInterval:    '1d',
                MaxCount:         150000,
                MetadataHeader:   true,
                Decimals:         2,
                PiWebApiUrl:      '',
                fontFamily:       'Segoe UI',
                fontSize:         12
            };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05D9\u05D9\u05E6\u05D5\u05D0 WOW'
        /* הגדרות ייצוא WOW */
    });

})(window.PIVisualization);
