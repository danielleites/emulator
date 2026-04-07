/**
 * ═══════════════════════════════════════════════════════
 *  wow-treemap-worker.js  —  Squarify Layout Engine
 * ═══════════════════════════════════════════════════════
 *  Runs the ENTIRE hierarchy computation off-thread:
 *
 *    1. Parses AF paths from flat Table data → nested tree
 *    2. Aggregates values bottom-up (MW, count, etc.)
 *    3. Computes health ratios per node (ok/warn/crit)
 *    4. Runs Squarify algorithm for optimal rectangle packing
 *    5. Flattens result → Canvas-ready coordinate array
 *
 *  Gem 💎: Bruls–Huizing–van Wijk Squarify
 *    Aspect-ratio optimised rectangle partitioning.
 *    Greedy row packing: add next item to row while the
 *    worst aspect ratio improves, then fix row and start
 *    a new one. Produces near-square rectangles.
 *
 *  Message Protocol:
 *    IN:  BUILD_TREE → { rows, width, height, focusId, config }
 *    IN:  LAYOUT     → { focusId, width, height }
 *    IN:  CONFIG     → { warnPct, critPct, maxDepth, ... }
 *
 *    OUT: TREEMAP_LAYOUT → { nodes[], breadcrumbs[], focusStats }
 *    OUT: ERROR          → { source, message }
 *
 *  Version : WOW TM 100.0
 * ═══════════════════════════════════════════════════════
 */

/* jshint worker:true */

// QA17-FIX: Worker guard — prevents collision when PI Vision loads this as regular script
if (typeof WorkerGlobalScope === 'undefined' && typeof importScripts === 'undefined') {
    // Not a Worker context — bail out silently
} else {
(function (self) {
'use strict';


// ═══ State ═══

var treeRoot = null;
var flatOutput = [];

var cfg = {
    warnPct: 70,
    critPct: 90,
    maxDepth: 1,
    gap: 2,
    headerH: 20,
    minCell: 4,
    decimals: 1,
    pathLevelsToSkip: 0
};


// ═══ Hebrew Labels ═══

var HEALTH_HE = { ok: '\u05EA\u05E7\u05D9\u05DF', warn: '\u05D0\u05D6\u05D4\u05E8\u05D4', crit: '\u05E7\u05E8\u05D9\u05D8\u05D9' };


// ═══════════════════════════════════════
//  MESSAGE HANDLER
// ═══════════════════════════════════════

self.onmessage = function (e) {
    var msg = e.data;

    try {
        switch (msg.type) {

            case 'BUILD_TREE':
                if (msg.config) mergeConfig(msg.config);
                treeRoot = buildTree(msg.rows || []);
                computeLayout(msg.focusId || 'root', msg.width, msg.height);
                break;

            case 'LAYOUT':
                if (!treeRoot) break;
                computeLayout(msg.focusId || 'root', msg.width, msg.height);
                break;

            case 'CONFIG':
                mergeConfig(msg);
                if (treeRoot) computeHealth(treeRoot);
                break;

            default: break;
        }
    } catch (err) {
        self.postMessage({
            type: 'ERROR',
            source: 'wow-treemap-worker',
            message: err.message || String(err)
        });
    }
};


function computeLayout(focusId, width, height) {
    var focus = findNode(treeRoot, focusId);
    if (!focus) focus = treeRoot;

    flatOutput = [];

    if (focus.children && focus.children.length > 0) {
        squarifyChildren(focus, { x: 0, y: 0, w: width, h: height }, 0);
    }

    self.postMessage({
        type: 'TREEMAP_LAYOUT',
        nodes: flatOutput,
        breadcrumbs: buildBreadcrumbs(focus),
        focusId: focus.id,
        focusLabel: focus.label,
        focusStats: focus.stats || null
    });
}


// ═══════════════════════════════════════
//  TREE BUILDING (Flat Rows → Nested Tree)
// ═══════════════════════════════════════

function buildTree(rows) {
    var root = {
        id: 'root',
        label: '\u05E9\u05D5\u05E8\u05E9',
        parentId: null,
        children: [],
        value: 0,
        health: 0,
        healthRatio: 0,
        isLeaf: false,
        stats: null,
        _pathToSelf: []
    };

    for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var rawPath = row.Path || row.Label || row.Name || row.path || row.label || '';
        var parts = parsePath(rawPath);
        if (parts.length === 0) continue;

        var value = parseFloat(row.Value || row.value || row.MW || row.mw || 1);
        var health = parseFloat(row.Health || row.health || row.Status || row.status || row.Risk || 0);

        // Walk / create hierarchy
        var current = root;
        for (var p = 0; p < parts.length; p++) {
            var partLabel = parts[p];
            var nodeId = parts.slice(0, p + 1).join('/');

            var existing = null;
            for (var c = 0; c < current.children.length; c++) {
                if (current.children[c].id === nodeId) { existing = current.children[c]; break; }
            }

            if (!existing) {
                existing = {
                    id: nodeId,
                    label: partLabel,
                    parentId: current.id,
                    children: [],
                    value: 0,
                    health: 0,
                    healthRatio: 0,
                    isLeaf: false,
                    stats: null,
                    _pathToSelf: parts.slice(0, p + 1)
                };
                current.children.push(existing);
            }

            current = existing;
        }

        // Set leaf properties
        current.value = value;
        current.health = health;
        current.isLeaf = true;
    }

    // Aggregate bottom-up
    aggregateValues(root);
    computeHealth(root);

    return root;
}


function parsePath(raw) {
    if (!raw || typeof raw !== 'string') return [];

    // Remove leading backslashes
    var path = raw.replace(/^\\+/, '');

    // Remove trailing |attribute (PI AF convention)
    path = path.replace(/\|.*$/, '');

    // Split by \ or / or |
    var parts = path.split(/[\\|\/]/).filter(function (p) { return p.length > 0; });

    // Skip configured levels (e.g. server + database)
    var skip = cfg.pathLevelsToSkip || 0;
    return parts.slice(skip);
}


// ═══════════════════════════════════════
//  AGGREGATION (Bottom-Up)
// ═══════════════════════════════════════

function aggregateValues(node) {
    if (!node.children || node.children.length === 0) return;

    var sum = 0;
    for (var i = 0; i < node.children.length; i++) {
        aggregateValues(node.children[i]);
        sum += node.children[i].value;
    }

    node.value = sum;
    node.isLeaf = false;
}


function computeHealth(node) {
    if (node.isLeaf) {
        node.healthRatio = node.health;
        node.stats = {
            totalLeaves: 1,
            okCount: node.health < cfg.warnPct ? 1 : 0,
            warnCount: (node.health >= cfg.warnPct && node.health < cfg.critPct) ? 1 : 0,
            critCount: node.health >= cfg.critPct ? 1 : 0,
            okPct: node.health < cfg.warnPct ? 100 : 0,
            totalValue: node.value
        };
        return;
    }

    var totalLeaves = 0, okCount = 0, warnCount = 0, critCount = 0;
    var healthSum = 0;

    for (var i = 0; i < node.children.length; i++) {
        computeHealth(node.children[i]);
        var cs = node.children[i].stats;
        if (cs) {
            totalLeaves += cs.totalLeaves;
            okCount += cs.okCount;
            warnCount += cs.warnCount;
            critCount += cs.critCount;
        }
        healthSum += node.children[i].healthRatio * node.children[i].value;
    }

    // Weighted average health
    node.healthRatio = node.value > 0 ? healthSum / node.value : 0;
    node.stats = {
        totalLeaves: totalLeaves,
        okCount: okCount,
        warnCount: warnCount,
        critCount: critCount,
        okPct: totalLeaves > 0 ? Math.round(okCount / totalLeaves * 100) : 0,
        totalValue: node.value
    };
}


// ═══════════════════════════════════════
//  SQUARIFY ALGORITHM (THE GEM 💎)
//  Bruls–Huizing–van Wijk (2000)
// ═══════════════════════════════════════

function squarifyChildren(parent, rect, depth) {
    if (!parent.children || parent.children.length === 0) return;
    if (depth > cfg.maxDepth) return;

    // Sort children by value descending (critical for squarify quality)
    var children = parent.children.slice().sort(function (a, b) { return b.value - a.value; });

    // Compute total value
    var totalValue = 0;
    for (var i = 0; i < children.length; i++) totalValue += children[i].value;
    if (totalValue <= 0) return;

    // Assign area proportional to value
    var totalArea = rect.w * rect.h;
    for (var j = 0; j < children.length; j++) {
        children[j]._area = (children[j].value / totalValue) * totalArea;
    }

    // ── Greedy Squarify ──
    var remaining = children.slice();
    var curRect = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };

    while (remaining.length > 0) {
        var side = Math.min(curRect.w, curRect.h);
        if (side <= 0) break;

        // Start row with first remaining item
        var row = [remaining[0]];
        remaining.splice(0, 1);
        var rowArea = row[0]._area;

        // Greedily add items while worst aspect ratio improves
        while (remaining.length > 0) {
            var currentWorst = worstRatio(row, rowArea, side);
            var testArea = rowArea + remaining[0]._area;

            row.push(remaining[0]);
            var newWorst = worstRatio(row, testArea, side);

            if (newWorst <= currentWorst) {
                // Improvement — keep item in row
                remaining.splice(0, 1);
                rowArea = testArea;
            } else {
                // Worsened — remove and fix current row
                row.pop();
                break;
            }
        }

        // Position items in this row
        layoutRow(row, rowArea, curRect);
    }

    // ── Collect output + optional recursion ──
    for (var k = 0; k < children.length; k++) {
        var child = children[k];
        var x = child._x;
        var y = child._y;
        var w = child._w;
        var h = child._h;

        if (w < cfg.minCell || h < cfg.minCell) continue;

        var hasKids = child.children && child.children.length > 0;

        flatOutput.push({
            id: child.id,
            label: child.label,
            x: x,
            y: y,
            w: w,
            h: h,
            value: child.value,
            healthRatio: child.healthRatio,
            depth: depth,
            hasChildren: hasKids,
            isLeaf: child.isLeaf,
            stats: child.stats
        });

        // Recurse into children (nested sub-rectangles)
        if (hasKids && depth < cfg.maxDepth) {
            var innerPad = cfg.gap + 1;
            var headerOffset = (w > 60 && h > 30) ? cfg.headerH : 0;
            var innerRect = {
                x: x + innerPad,
                y: y + innerPad + headerOffset,
                w: w - innerPad * 2,
                h: h - innerPad * 2 - headerOffset
            };
            if (innerRect.w > cfg.minCell * 2 && innerRect.h > cfg.minCell * 2) {
                squarifyChildren(child, innerRect, depth + 1);
            }
        }
    }
}


// ── Worst Aspect Ratio ──
// For a row of items with total area S laid against side s:
//   thickness = S / s
//   item_dimension = item_area / thickness
//   aspect = max(thickness / dim, dim / thickness)
// Return the worst (largest) aspect ratio in the row.

function worstRatio(row, totalArea, side) {
    var s2 = side * side;
    var worst = 0;

    for (var i = 0; i < row.length; i++) {
        var a = row[i]._area;
        if (a <= 0) continue;
        var r1 = (totalArea * totalArea) / (a * s2);
        var r2 = (a * s2) / (totalArea * totalArea);
        var r = r1 > r2 ? r1 : r2;
        if (r > worst) worst = r;
    }

    return worst;
}


// ── Layout Row ──
// Position items in a row along the short side of curRect.
// Mutates curRect to shrink the remaining area.

function layoutRow(row, rowArea, curRect) {
    var isWide = curRect.w >= curRect.h;
    var side = isWide ? curRect.h : curRect.w;
    var thickness = side > 0 ? rowArea / side : 0;

    if (thickness <= 0) return;

    var offset = 0;
    for (var i = 0; i < row.length; i++) {
        var itemDim = row[i]._area / thickness;

        if (isWide) {
            // Vertical strip on the left side
            row[i]._x = curRect.x;
            row[i]._y = curRect.y + offset;
            row[i]._w = thickness;
            row[i]._h = itemDim;
        } else {
            // Horizontal strip on the top
            row[i]._x = curRect.x + offset;
            row[i]._y = curRect.y;
            row[i]._w = itemDim;
            row[i]._h = thickness;
        }

        offset += itemDim;
    }

    // Shrink remaining rectangle
    if (isWide) {
        curRect.x += thickness;
        curRect.w -= thickness;
    } else {
        curRect.y += thickness;
        curRect.h -= thickness;
    }
}


// ═══════════════════════════════════════
//  TREE NAVIGATION
// ═══════════════════════════════════════

function findNode(node, id) {
    if (!node) return null;
    if (node.id === id) return node;

    if (node.children) {
        for (var i = 0; i < node.children.length; i++) {
            var found = findNode(node.children[i], id);
            if (found) return found;
        }
    }
    return null;
}


function buildBreadcrumbs(node) {
    var crumbs = [];
    var current = node;

    // Walk from node to root via id path
    while (current) {
        crumbs.unshift({ id: current.id, label: current.label });
        if (current.id === 'root' || !current.parentId) break;
        current = findNode(treeRoot, current.parentId);
    }

    return crumbs;
}


// ═══════════════════════════════════════
//  DEMO DATA
// ═══════════════════════════════════════

function generateDemoRows() {
    var rows = [];

    var plants = [
        { name: '\u05DE\u05E4\u05E2\u05DC \u05D3\u05E8\u05D5\u05DD', units: 5 },
        { name: '\u05DE\u05E4\u05E2\u05DC \u05E6\u05E4\u05D5\u05DF', units: 4 },
        { name: '\u05DE\u05E4\u05E2\u05DC \u05DE\u05E8\u05DB\u05D6', units: 3 },
        { name: '\u05DE\u05E4\u05E2\u05DC \u05DE\u05E2\u05E8\u05D1', units: 2 }
    ];

    var equipment = [
        '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4',
        '\u05D2\u05E0\u05E8\u05D8\u05D5\u05E8',
        '\u05DE\u05E9\u05D0\u05D1\u05D4',
        '\u05DE\u05D3\u05D7\u05E1',
        '\u05DE\u05D7\u05DC\u05D9\u05E3 \u05D7\u05D5\u05DD',
        '\u05E9\u05E0\u05D0\u05D9'
    ];

    for (var p = 0; p < plants.length; p++) {
        var plant = plants[p];
        for (var u = 1; u <= plant.units; u++) {
            var unitName = '\u05D9\u05D7\u05D9\u05D3\u05D4 ' + u;
            var eqCount = 3 + Math.floor(Math.random() * 4);

            for (var e = 0; e < eqCount; e++) {
                var eqName = equipment[e % equipment.length];
                if (e >= equipment.length) eqName += ' ' + (e + 1);

                // Higher chance of warnings/criticals in specific plants
                var baseHealth = Math.random() * 60;
                if (p === 0 && u <= 2) baseHealth += 20 + Math.random() * 25;
                if (p === 2) baseHealth += 10 + Math.random() * 15;

                rows.push({
                    Path: '\\IEC\\' + plant.name + '\\' + unitName + '\\' + eqName,
                    Value: 30 + Math.random() * 170,
                    Health: Math.min(100, baseHealth)
                });
            }
        }
    }

    return rows;
}


// ═══════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════

function mergeConfig(c) {
    if (c.warnPct !== undefined) cfg.warnPct = c.warnPct;
    if (c.critPct !== undefined) cfg.critPct = c.critPct;
    if (c.WarnPct !== undefined) cfg.warnPct = c.WarnPct;
    if (c.CritPct !== undefined) cfg.critPct = c.CritPct;
    if (c.maxDepth !== undefined) cfg.maxDepth = c.maxDepth;
    if (c.MaxDepth !== undefined) cfg.maxDepth = c.MaxDepth;
    if (c.gap !== undefined) cfg.gap = c.gap;
    if (c.Gap !== undefined) cfg.gap = c.Gap;
    if (c.Decimals !== undefined) cfg.decimals = c.Decimals;
    if (c.PathLevelsToSkip !== undefined) cfg.pathLevelsToSkip = c.PathLevelsToSkip;
}

})(typeof self !== 'undefined' ? self : this);
} // end Worker guard
