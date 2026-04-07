/**
 * mm20-export.js — Export for MM20 Symbols
 * ═══════════════════════════════════════════
 * CSV export using MM20 data patterns (SITES, DataItems, config).
 * Leverages MM20.exportCsv if available, else standalone BOM-CSV.
 *
 * Usage:
 *   MM20.Export.attach(scope, elem);
 *   scope.exportCSV();
 *
 * Namespace: MM20.Export
 */
(function (root) {
    'use strict';
    var MM20 = root.MM20;
    if (!MM20) return;

    function downloadCSV(filename, csvContent) {
        var blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function gatherData(scope) {
        var rows = [];
        // Try symbol DataItems (PI Vision standard)
        if (scope.symbol && scope.symbol.DataItems && scope.symbol.DataItems.length) {
            scope.symbol.DataItems.forEach(function (item) {
                rows.push({
                    Path: item.Path || item.Label || '',
                    Value: item.Value != null ? item.Value : '',
                    Timestamp: item.Time || new Date().toISOString(),
                    Status: item.Status || 'Good'
                });
            });
        }
        // Try MM20 SITES data from scope
        if (rows.length === 0 && scope._siteData) {
            var siteData = scope._siteData;
            for (var siteId in siteData) {
                if (!siteData.hasOwnProperty(siteId)) continue;
                var units = siteData[siteId];
                for (var uIdx in units) {
                    if (!units.hasOwnProperty(uIdx)) continue;
                    var u = units[uIdx];
                    rows.push({
                        Site: siteId,
                        Unit: uIdx,
                        Hours: u.hours || '',
                        Quota: u.quota || '',
                        Pct: u.pct || '',
                        Status: u.status || ''
                    });
                }
            }
        }
        // Fallback: config keys
        if (rows.length === 0 && scope.config) {
            var keys = Object.keys(scope.config);
            keys.forEach(function (k) {
                if (typeof scope.config[k] !== 'function') {
                    rows.push({ Key: k, Value: String(scope.config[k]) });
                }
            });
        }
        return rows;
    }

    function toCSV(rows) {
        if (rows.length === 0) return '';
        var headers = Object.keys(rows[0]);
        var lines = [headers.join(',')];
        rows.forEach(function (row) {
            var vals = headers.map(function (h) {
                var v = String(row[h] || '');
                return v.indexOf(',') !== -1 || v.indexOf('"') !== -1 ? '"' + v.replace(/"/g, '""') + '"' : v;
            });
            lines.push(vals.join(','));
        });
        return lines.join('\n');
    }

    MM20.Export = {
        attach: function (scope, elem) {
            try {
                if (!scope.exportCSV) {
                    scope.exportCSV = function () {
                        MM20.debug('export', 'exportCSV triggered');
                        var rows = gatherData(scope);
                        var csv = toCSV(rows);
                        var name = (scope.config && scope.config.Title) || 'mm20-export';
                        downloadCSV(name + '_' + new Date().toISOString().slice(0, 10) + '.csv', csv);
                    };
                }
                if (!scope.exportData) {
                    scope.exportData = scope.exportCSV;
                }
            } catch (e) {
                MM20.shield.log('Export', 'attach', e);
            }
        }
    };
})(window);
