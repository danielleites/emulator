/**
 * ═══════════════════════════════════════════════════════
 *  WOW Table Worker — Off-Thread Sort / Filter / Search
 * ═══════════════════════════════════════════════════════
 *  Dedicated Web Worker that receives raw table data and
 *  performs CPU-intensive operations (sort, filter, text
 *  search, aggregation) without blocking the UI thread.
 *
 *  Messages IN:
 *    { type: 'UPDATE_DATA',   payload: { rows, columns } }
 *    { type: 'SORT',          payload: { column, direction } }
 *    { type: 'FILTER',        payload: { text } }
 *    { type: 'COLUMN_FILTER', payload: { column, values } }
 *    { type: 'CONFIG',        payload: { warnPct, critPct, decimals } }
 *    { type: 'EXPORT_CSV',    payload: null }
 *
 *  Messages OUT:
 *    { type: 'PROCESSED_ROWS', payload: { rows, totalCount, filteredCount, stats } }
 *    { type: 'CSV_READY',      payload: { csv } }
 *    { type: 'ERROR',          payload: { source, message } }
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

// ── Worker State ──
var _allRows = [];        // Original data from PI Vision
var _filteredRows = [];   // After filter applied
var _sortedRows = [];     // After sort applied (final output)
var _columns = [];        // Column definitions

var _config = {
    warnPct:  80,
    critPct:  90,
    decimals: 1
};

var _currentSort = { column: null, direction: 'asc' };
var _currentFilter = '';
var _columnFilters = {};  // { columnKey: [allowedValues] }


// ═══════════════════════════════════════
//  MESSAGE HANDLER
// ═══════════════════════════════════════

self.onmessage = function (e) {
    var msg = e.data;

    try {
        switch (msg.type) {

            case 'UPDATE_DATA':
                _allRows = msg.payload.rows || [];
                _columns = msg.payload.columns || [];
                _reprocess();
                break;

            case 'SORT':
                _currentSort.column = msg.payload.column;
                _currentSort.direction = msg.payload.direction || 'asc';
                _applySort();
                _emit();
                break;

            case 'FILTER':
                _currentFilter = (msg.payload.text || '').trim().toLowerCase();
                _reprocess();
                break;

            case 'COLUMN_FILTER':
                if (msg.payload.values && msg.payload.values.length > 0) {
                    _columnFilters[msg.payload.column] = msg.payload.values;
                } else {
                    delete _columnFilters[msg.payload.column];
                }
                _reprocess();
                break;

            case 'CONFIG':
                if (msg.payload.warnPct !== undefined) _config.warnPct = msg.payload.warnPct;
                if (msg.payload.critPct !== undefined) _config.critPct = msg.payload.critPct;
                if (msg.payload.decimals !== undefined) _config.decimals = msg.payload.decimals;
                _classifyRows();
                _emit();
                break;

            case 'EXPORT_CSV':
                _exportCSV();
                break;

            default:
                break;
        }
    } catch (err) {
        self.postMessage({
            type: 'ERROR',
            payload: { source: 'wow-table-worker', message: err.message || String(err) }
        });
    }
};


// ═══════════════════════════════════════
//  PROCESSING PIPELINE
// ═══════════════════════════════════════

function _reprocess() {
    _applyFilter();
    _applySort();
    _classifyRows();
    _emit();
}


// ── Text Filter (global search) ──
function _applyFilter() {
    var rows = _allRows;

    // Apply column-specific filters first
    var colKeys = Object.keys(_columnFilters);
    if (colKeys.length > 0) {
        rows = rows.filter(function (row) {
            for (var k = 0; k < colKeys.length; k++) {
                var col = colKeys[k];
                var allowed = _columnFilters[col];
                var val = _getCellValue(row, col);
                if (allowed.indexOf(String(val)) === -1) return false;
            }
            return true;
        });
    }

    // Apply global text search
    if (_currentFilter.length > 0) {
        var searchTerm = _currentFilter;
        rows = rows.filter(function (row) {
            // Search across all visible columns
            for (var c = 0; c < _columns.length; c++) {
                var val = _getCellValue(row, _columns[c].key);
                if (String(val).toLowerCase().indexOf(searchTerm) !== -1) {
                    return true;
                }
            }
            return false;
        });
    }

    _filteredRows = rows;
}


// ── Sort ──
function _applySort() {
    if (!_currentSort.column) {
        _sortedRows = _filteredRows.slice();
        return;
    }

    var col = _currentSort.column;
    var dir = _currentSort.direction === 'desc' ? -1 : 1;

    _sortedRows = _filteredRows.slice().sort(function (a, b) {
        var va = _getCellValue(a, col);
        var vb = _getCellValue(b, col);

        // Numeric comparison
        var na = parseFloat(va);
        var nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb)) {
            return (na - nb) * dir;
        }

        // Date comparison
        var da = Date.parse(va);
        var db = Date.parse(vb);
        if (!isNaN(da) && !isNaN(db)) {
            return (da - db) * dir;
        }

        // String comparison
        return String(va).localeCompare(String(vb), 'he') * dir;
    });
}


// ── Classify rows by threshold ──
function _classifyRows() {
    for (var i = 0; i < _sortedRows.length; i++) {
        var row = _sortedRows[i];

        // Find primary numeric value for classification
        var numVal = null;
        for (var c = 0; c < _columns.length; c++) {
            if (_columns[c].isMetric) {
                numVal = parseFloat(_getCellValue(row, _columns[c].key));
                break;
            }
        }

        if (numVal !== null && !isNaN(numVal)) {
            if (numVal >= _config.critPct) {
                row._severity = 'crit';
            } else if (numVal >= _config.warnPct) {
                row._severity = 'warn';
            } else {
                row._severity = 'ok';
            }
        } else {
            row._severity = 'none';
        }
    }
}


// ── Emit processed data ──
function _emit() {
    // Compute stats
    var stats = { total: _allRows.length, filtered: _sortedRows.length, ok: 0, warn: 0, crit: 0 };
    for (var i = 0; i < _sortedRows.length; i++) {
        var sev = _sortedRows[i]._severity;
        if (sev === 'ok') stats.ok++;
        else if (sev === 'warn') stats.warn++;
        else if (sev === 'crit') stats.crit++;
    }

    self.postMessage({
        type: 'PROCESSED_ROWS',
        payload: {
            rows: _sortedRows,
            totalCount: _allRows.length,
            filteredCount: _sortedRows.length,
            stats: stats
        }
    });
}


// ── CSV Export ──
function _exportCSV() {
    if (_sortedRows.length === 0 || _columns.length === 0) {
        self.postMessage({ type: 'CSV_READY', payload: { csv: '' } });
        return;
    }

    var BOM = '\uFEFF'; // UTF-8 BOM for Hebrew support in Excel
    var lines = [];

    // Header
    var header = _columns.map(function (c) { return '"' + (c.label || c.key) + '"'; });
    lines.push(header.join(','));

    // Data rows
    for (var i = 0; i < _sortedRows.length; i++) {
        var row = _sortedRows[i];
        var cells = _columns.map(function (c) {
            var val = _getCellValue(row, c.key);
            return '"' + String(val).replace(/"/g, '""') + '"';
        });
        lines.push(cells.join(','));
    }

    self.postMessage({
        type: 'CSV_READY',
        payload: { csv: BOM + lines.join('\n') }
    });
}


// ═══════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════

function _getCellValue(row, key) {
    if (!row || !key) return '';

    // Support nested keys like "data.value"
    if (key.indexOf('.') !== -1) {
        var parts = key.split('.');
        var obj = row;
        for (var p = 0; p < parts.length; p++) {
            if (obj == null) return '';
            obj = obj[parts[p]];
        }
        return obj != null ? obj : '';
    }

    return row[key] != null ? row[key] : '';
}

})(typeof self !== 'undefined' ? self : this);
} // end Worker guard
