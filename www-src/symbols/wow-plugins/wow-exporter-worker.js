/**
 * ═══════════════════════════════════════════════════════
 *  WOW Exporter Worker — Chunk-Streaming Data Export
 * ═══════════════════════════════════════════════════════
 *  Dedicated Web Worker that fetches PI Web API data in
 *  time-sliced chunks, converts each chunk to CSV, and
 *  assembles a Blob (OS-managed memory, not JS heap).
 *
 *  THE GEM: Recursive Pagination + Blob Assembly
 *  PI Web API caps at ~150K rows per request (MaxCount).
 *  When the response signals MaxItemsExceeded, the Worker
 *  auto-chains a follow-up fetch from the last returned
 *  timestamp — draining the data without user intervention.
 *  Each chunk is converted to CSV text immediately and
 *  pushed to a csvParts[] array.  At the end, a single
 *  new Blob(csvParts) call creates an OS-managed virtual
 *  file that never touches the JS heap.
 *
 *  Messages IN:
 *    { type: 'CONFIG',  payload: { piWebApiUrl } }
 *    { type: 'EXPORT',  payload: { webIds, startTime, endTime,
 *                                  interval, maxCount, decimals,
 *                                  metadataHeader, unitLabels,
 *                                  reportTitle } }
 *    { type: 'CANCEL' }
 *
 *  Messages OUT:
 *    { type: 'PROGRESS',  payload: { pct, rowCount, chunkIndex,
 *                                    status } }
 *    { type: 'COMPLETE',  payload: { blob, rowCount, elapsed,
 *                                    filename } }
 *    { type: 'CANCELLED', payload: { rowCount } }
 *    { type: 'ERROR',     payload: { source, message } }
 *
 *  Version: WOW 100.0
 * ═══════════════════════════════════════════════════════
 */


// QA17-FIX: Worker guard — prevents collision when PI Vision loads this as regular script
if (typeof WorkerGlobalScope === 'undefined' && typeof importScripts === 'undefined') {
    // Not a Worker context — bail out silently
} else {
(function (self) {
'use strict';

/* ── Worker State ── */
var _config = {
    piWebApiUrl: ''
};

var _cancelled = false;


/* ═══════════════════════════════════════
 *  Message Handler
 * ═══════════════════════════════════════ */

self.onmessage = function (e) {
    var msg = e.data;
    if (!msg || !msg.type) return;

    try {
        switch (msg.type) {

            case 'CONFIG':
                if (msg.payload) {
                    _config.piWebApiUrl = msg.payload.piWebApiUrl || _config.piWebApiUrl;
                }
                break;

            case 'EXPORT':
                _cancelled = false;
                _runExport(msg.payload);
                break;

            case 'CANCEL':
                _cancelled = true;
                break;

            default:
                break;
        }
    } catch (err) {
        self.postMessage({
            type: 'ERROR',
            payload: { source: msg.type, message: err.message || String(err) }
        });
    }
};


/* ═══════════════════════════════════════════════════════
 *  THE GEM — Chunk-Streaming Export Engine
 *
 *  Strategy:
 *  1. Split the [startTime, endTime] range into N chunks
 *     based on the configured interval (e.g., 1 day per chunk).
 *  2. For each chunk, fetch data from PI Web API.
 *  3. If PI Web API returns MaxItemsExceeded, recursively
 *     paginate from the last timestamp until the chunk is
 *     fully drained.
 *  4. Convert each page to CSV text immediately — the raw
 *     JSON can be garbage-collected by the JS engine.
 *  5. Push CSV text to csvParts[] array.
 *  6. At the end, new Blob(csvParts) creates an OS-managed
 *     virtual file.  Total JS heap usage: ~O(1 chunk).
 *
 *  Why time-sliced chunks instead of one giant request?
 *  - A single request for 3 months of 1-second data would
 *    require PI Web API to buffer ~8M rows in memory before
 *    returning.  PI times out or returns 503.
 *  - Time-sliced chunks let PI process small windows (e.g.,
 *    1 day = 86,400 rows) which always succeed.
 * ═══════════════════════════════════════════════════════ */

function _runExport(params) {
    var webIds      = params.webIds      || [];
    var startTime   = params.startTime   || '';
    var endTime     = params.endTime     || '';
    var interval    = params.interval    || '1d';
    var maxCount    = params.maxCount    || 150000;
    var decimals    = params.decimals    || 2;
    var addMeta     = params.metadataHeader !== false;
    var unitLabels  = params.unitLabels  || [];
    var reportTitle = params.reportTitle || 'PI Data Export';

    if (!webIds.length) {
        self.postMessage({
            type: 'ERROR',
            payload: { source: 'EXPORT', message: 'No WebIds provided' }
        });
        return;
    }

    if (!_config.piWebApiUrl) {
        self.postMessage({
            type: 'ERROR',
            payload: { source: 'EXPORT', message: 'PI Web API URL not configured' }
        });
        return;
    }

    /* ── Time range parsing ── */
    var tStart = new Date(startTime);
    var tEnd   = new Date(endTime);
    if (isNaN(tStart.getTime()) || isNaN(tEnd.getTime())) {
        self.postMessage({
            type: 'ERROR',
            payload: { source: 'EXPORT', message: 'Invalid date range' }
        });
        return;
    }

    /* ── Chunk interval calculation ── */
    var chunkMs = _parseInterval(interval);
    var chunks  = _buildTimeChunks(tStart, tEnd, chunkMs);
    var totalChunks = chunks.length;

    /* ── CSV Parts accumulator ── */
    var csvParts   = [];
    var totalRows  = 0;
    var exportStart = Date.now();

    /* ── Build column headers ── */
    var headers = ['Timestamp'];
    for (var h = 0; h < webIds.length; h++) {
        headers.push(unitLabels[h] || ('Tag_' + (h + 1)));
    }

    /* ── Metadata header (contextual CSV header) ── */
    if (addMeta) {
        var now = new Date();
        csvParts.push(
            '# ' + reportTitle + '\r\n' +
            '# Generated: ' + _formatISO(now) + '\r\n' +
            '# Range: ' + _formatISO(tStart) + ' \u2014 ' + _formatISO(tEnd) + '\r\n' +
            '# Interval: ' + interval + '\r\n' +
            '# Tags: ' + webIds.length + '\r\n' +
            '# Source: PI Web API via WOW Exporter Worker\r\n' +
            '#\r\n'
        );
    }

    /* ── Column headers row ── */
    csvParts.push(headers.join(',') + '\r\n');

    /* ── Progress reporter ── */
    function _reportProgress(chunkIdx, status) {
        var pct = Math.round(((chunkIdx + 1) / totalChunks) * 100);
        self.postMessage({
            type: 'PROGRESS',
            payload: {
                pct:        Math.min(pct, 99),  /* 100 only on COMPLETE */
                rowCount:   totalRows,
                chunkIndex: chunkIdx,
                totalChunks: totalChunks,
                status:     status || 'fetching'
            }
        });
    }


    /* ═══════════════════════════════════════════════════
     *  Sequential Chunk Processing
     *
     *  We process chunks sequentially (not in parallel)
     *  to avoid flooding PI Web API with concurrent
     *  requests.  Each chunk completes before the next
     *  starts.  This is a cooperative pattern — the Worker
     *  never blocks; it yields between chunks via Promise
     *  chaining.
     * ═══════════════════════════════════════════════════ */

    var chunkPromise = Promise.resolve();

    for (var c = 0; c < totalChunks; c++) {
        (function (chunkIdx) {
            chunkPromise = chunkPromise.then(function () {
                if (_cancelled) {
                    return Promise.reject({ cancelled: true });
                }

                _reportProgress(chunkIdx, 'fetching');

                var chunk = chunks[chunkIdx];
                return _fetchChunkWithPagination(
                    webIds, chunk.start, chunk.end, maxCount, decimals
                );
            }).then(function (chunkResult) {
                if (_cancelled) {
                    return Promise.reject({ cancelled: true });
                }

                /* Convert rows to CSV text immediately */
                if (chunkResult.rows.length > 0) {
                    var csvText = _rowsToCSV(chunkResult.rows, decimals);
                    csvParts.push(csvText);
                    totalRows += chunkResult.rows.length;
                }

                _reportProgress(chunkIdx, 'processing');
            });
        })(c);
    }

    /* ── Final assembly ── */
    chunkPromise.then(function () {
        if (_cancelled) return;

        var elapsed = Date.now() - exportStart;

        /* Build Blob — OS-managed, not JS heap */
        var blob = new Blob(csvParts, { type: 'text/csv;charset=utf-8' });

        /* Generate filename */
        var filename = _buildFilename(reportTitle, tStart, tEnd);

        self.postMessage({
            type: 'COMPLETE',
            payload: {
                blob:     blob,
                rowCount: totalRows,
                elapsed:  elapsed,
                filename: filename
            }
        });

        /* Help GC */
        csvParts = null;

    }).catch(function (err) {
        if (err && err.cancelled) {
            self.postMessage({
                type: 'CANCELLED',
                payload: { rowCount: totalRows }
            });
        } else {
            self.postMessage({
                type: 'ERROR',
                payload: {
                    source: 'EXPORT',
                    message: (err && err.message) ? err.message : String(err)
                }
            });
        }
    });
}


/* ═══════════════════════════════════════════════════════
 *  THE GEM: Recursive Pagination
 *
 *  When PI Web API cannot return all data in a single
 *  response (exceeds MaxCount), the response includes
 *  a continuation token or the last timestamp.  This
 *  function auto-chains from the last timestamp until
 *  the entire chunk is drained.
 *
 *  Example: a 1-day chunk at 1-second intervals =
 *  86,400 rows.  If MaxCount = 50,000, the Worker
 *  auto-paginates with 2 requests:
 *    Page 1: 00:00 → 13:53:20 (50,000 rows)
 *    Page 2: 13:53:20 → 24:00  (36,400 rows)
 *  The caller sees 86,400 rows transparently.
 * ═══════════════════════════════════════════════════════ */

function _fetchChunkWithPagination(webIds, chunkStart, chunkEnd, maxCount, decimals) {
    var allRows   = [];
    var pageStart = chunkStart;

    function _fetchPage() {
        if (_cancelled) {
            return Promise.resolve({ rows: allRows });
        }

        /* Build interpolated data URL for multiple tags */
        var url = _config.piWebApiUrl + '/streamsets/interpolated' +
                  '?startTime=' + encodeURIComponent(_formatISO(pageStart)) +
                  '&endTime='   + encodeURIComponent(_formatISO(chunkEnd)) +
                  '&interval='  + encodeURIComponent('1s') +
                  '&maxCount='  + maxCount +
                  '&selectedFields=Items.Items.Timestamp;Items.Items.Value;Items.Items.Good';

        /* Add WebIds */
        for (var w = 0; w < webIds.length; w++) {
            url += '&webId=' + encodeURIComponent(webIds[w]);
        }

        return fetch(url, { credentials: 'include' })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + res.statusText);
                return res.json();
            })
            .then(function (json) {
                var pageRows = _parseInterpolatedResponse(json, webIds.length);
                allRows = allRows.concat(pageRows);

                /* Check if pagination is needed */
                var needsPagination = _checkMaxItemsExceeded(json);

                if (needsPagination && pageRows.length > 0) {
                    /* Move start to last returned timestamp + 1ms */
                    var lastTs = pageRows[pageRows.length - 1].timestamp;
                    var nextStart = new Date(new Date(lastTs).getTime() + 1);

                    /* Guard against infinite loop: next start must be before chunk end */
                    if (nextStart < chunkEnd) {
                        pageStart = nextStart;

                        /* Report sub-progress */
                        self.postMessage({
                            type: 'PROGRESS',
                            payload: {
                                pct:      -1,  /* -1 = pagination sub-progress */
                                rowCount: allRows.length,
                                status:   'paginating'
                            }
                        });

                        /* Recursive: fetch next page */
                        return _fetchPage();
                    }
                }

                return { rows: allRows };
            });
    }

    return _fetchPage();
}


/* ═══ Check MaxItems Exceeded ═══ */

function _checkMaxItemsExceeded(json) {
    /* PI Web API signals overflow in multiple ways */
    if (!json) return false;

    /* Links.Next present → more data available */
    if (json.Links && json.Links.Next) return true;

    /* Errors array with MaxItemsExceeded */
    if (json.Errors) {
        for (var i = 0; i < json.Errors.length; i++) {
            if (String(json.Errors[i]).indexOf('MaxItemsExceeded') !== -1 ||
                String(json.Errors[i]).indexOf('max') !== -1) {
                return true;
            }
        }
    }

    /* Items contain sub-errors */
    if (json.Items) {
        for (var j = 0; j < json.Items.length; j++) {
            var item = json.Items[j];
            if (item.Errors) {
                for (var k = 0; k < item.Errors.length; k++) {
                    if (String(item.Errors[k]).indexOf('MaxItemsExceeded') !== -1) {
                        return true;
                    }
                }
            }
        }
    }

    return false;
}


/* ═══ Parse Interpolated Response ═══ */

function _parseInterpolatedResponse(json, tagCount) {
    var rows = [];
    if (!json || !json.Items || json.Items.length === 0) return rows;

    /* PI Web API /streamsets/interpolated returns:
     * { Items: [
     *     { Items: [ { Timestamp, Value, Good }, ... ] },  ← Tag 1
     *     { Items: [ { Timestamp, Value, Good }, ... ] },  ← Tag 2
     *     ...
     *   ] }
     *
     * We need to pivot: group by timestamp across all tags.
     */

    var streams = json.Items;

    /* Find the longest stream (they should all be same length for interpolated) */
    var maxLen = 0;
    for (var s = 0; s < streams.length; s++) {
        var items = (streams[s] && streams[s].Items) ? streams[s].Items : [];
        if (items.length > maxLen) maxLen = items.length;
    }

    /* Build rows: one per timestamp */
    for (var i = 0; i < maxLen; i++) {
        var row = {
            timestamp: '',
            values: []
        };

        for (var t = 0; t < tagCount; t++) {
            var stream = streams[t];
            var dataItems = (stream && stream.Items) ? stream.Items : [];

            if (i < dataItems.length) {
                var item = dataItems[i];
                if (!row.timestamp && item.Timestamp) {
                    row.timestamp = item.Timestamp;
                }

                /* Extract value — handle objects, digitals, and numbers */
                var val = item.Value;
                if (val !== null && val !== undefined && typeof val === 'object') {
                    val = val.Name || val.Value || '';
                }
                row.values.push(val);
            } else {
                row.values.push('');
            }
        }

        if (row.timestamp) {
            rows.push(row);
        }
    }

    return rows;
}


/* ═══ Rows → CSV Text ═══ */

function _rowsToCSV(rows, decimals) {
    var lines = [];
    var dec = (typeof decimals === 'number') ? decimals : 2;

    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var parts = [_formatTimestamp(row.timestamp)];

        for (var v = 0; v < row.values.length; v++) {
            var val = row.values[v];
            if (typeof val === 'number' && !isNaN(val)) {
                parts.push(val.toFixed(dec));
            } else if (val === null || val === undefined || val === '') {
                parts.push('');
            } else {
                /* Escape CSV: if value contains comma or quote, wrap in quotes */
                var str = String(val);
                if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 ||
                    str.indexOf('\n') !== -1) {
                    str = '"' + str.replace(/"/g, '""') + '"';
                }
                parts.push(str);
            }
        }

        lines.push(parts.join(','));
    }

    return lines.join('\r\n') + '\r\n';
}


/* ═══ Time Helpers ═══ */

function _parseInterval(interval) {
    /* Parse interval like '1d', '12h', '1h', '30m' → milliseconds */
    var match = String(interval).match(/^(\d+)\s*(d|h|m|s)$/i);
    if (!match) return 86400000; /* default 1 day */

    var num  = parseInt(match[1], 10);
    var unit = match[2].toLowerCase();

    switch (unit) {
        case 'd': return num * 86400000;
        case 'h': return num * 3600000;
        case 'm': return num * 60000;
        case 's': return num * 1000;
        default:  return 86400000;
    }
}

function _buildTimeChunks(tStart, tEnd, chunkMs) {
    var chunks = [];
    var cursor = new Date(tStart.getTime());

    while (cursor < tEnd) {
        var chunkEnd = new Date(Math.min(cursor.getTime() + chunkMs, tEnd.getTime()));
        chunks.push({
            start: new Date(cursor.getTime()),
            end:   chunkEnd
        });
        cursor = chunkEnd;
    }

    /* At least 1 chunk */
    if (chunks.length === 0) {
        chunks.push({ start: tStart, end: tEnd });
    }

    return chunks;
}

function _formatISO(date) {
    if (!(date instanceof Date)) date = new Date(date);
    return date.toISOString();
}

function _formatTimestamp(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);

    /* Format: YYYY-MM-DD HH:mm:ss */
    var Y = d.getFullYear();
    var M = ('0' + (d.getMonth() + 1)).slice(-2);
    var D = ('0' + d.getDate()).slice(-2);
    var h = ('0' + d.getHours()).slice(-2);
    var m = ('0' + d.getMinutes()).slice(-2);
    var s = ('0' + d.getSeconds()).slice(-2);

    return Y + '-' + M + '-' + D + ' ' + h + ':' + m + ':' + s;
}


/* ═══ Filename Builder ═══ */

function _buildFilename(title, tStart, tEnd) {
    var safe = String(title).replace(/[^a-zA-Z0-9\u0590-\u05FF _-]/g, '').replace(/\s+/g, '_');
    var ds = _formatISO(tStart).slice(0, 10);
    var de = _formatISO(tEnd).slice(0, 10);
    return safe + '_' + ds + '_' + de + '.csv';
}

})(typeof self !== 'undefined' ? self : this);
} // end Worker guard
