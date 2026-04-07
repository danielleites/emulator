/**
 * mu20-export.js — Export for MU20 Symbols
 * ═══════════════════════════════════════════
 * CSV export. Uses MU20.exportCsv if available, else standalone.
 * No jQuery.
 *
 * Usage:
 *   MU20.Export.attach(scope, elem);
 *   scope.exportCSV();
 *
 * Namespace: MU20.Export
 */
(function (root) {
    'use strict';
    var MU20 = root.MU20;
    if (!MU20) return;

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
        if (rows.length === 0 && scope._siteData) {
            var siteData = scope._siteData;
            for (var siteId in siteData) {
                if (!siteData.hasOwnProperty(siteId)) continue;
                var units = siteData[siteId];
                for (var uIdx in units) {
                    if (!units.hasOwnProperty(uIdx)) continue;
                    var u = units[uIdx];
                    rows.push({
                        Site: siteId, Unit: uIdx,
                        Hours: u.hours || '', Quota: u.quota || '',
                        Pct: u.pct || '', Status: u.status || ''
                    });
                }
            }
        }
        if (rows.length === 0 && scope.config) {
            Object.keys(scope.config).forEach(function (k) {
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

    MU20.Export = {
        attach: function (scope, elem) {
            try {
                if (!scope.exportCSV) {
                    scope.exportCSV = function () {
                        var rows = gatherData(scope);
                        // Prefer MU20.exportCsv if available
                        if (MU20.exportCsv && rows.length > 0) {
                            var name = (scope.config && scope.config.Title) || 'mu20-export';
                            MU20.exportCsv(rows, name + '_' + new Date().toISOString().slice(0, 10) + '.csv');
                        } else {
                            var csv = toCSV(rows);
                            var fname = (scope.config && scope.config.Title) || 'mu20-export';
                            downloadCSV(fname + '_' + new Date().toISOString().slice(0, 10) + '.csv', csv);
                        }
                    };
                }
                if (!scope.exportData) scope.exportData = scope.exportCSV;
            } catch (e) {
                MU20.shield.log('Export', 'attach', e);
            }
        }
    };
})(window);
