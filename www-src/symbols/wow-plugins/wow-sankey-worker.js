/**
 * ═══════════════════════════════════════════════════════
 *  wow-sankey-worker.js  —  Sankey Layout Engine (Worker)
 * ═══════════════════════════════════════════════════════
 *  Runs the expensive iterative relaxation algorithm
 *  OFF the Main Thread. Accepts raw Source/Target/Value
 *  rows, computes node positions + link paths, and
 *  returns ready-to-draw coordinates to the UI.
 *
 *  Algorithm (simplified D3-Sankey):
 *    1. Build directed graph from rows
 *    2. Assign node depths via BFS (left-to-right columns)
 *    3. Compute node values (sum of incoming/outgoing)
 *    4. Scale nodes vertically to fit canvas height
 *    5. Iterative relaxation: nudge Y positions to
 *       minimize link crossings (32 iterations)
 *    6. Compute Bezier control points for links
 *    7. Return { nodes[], links[] } as plain objects
 *
 *  Message Protocol:
 *    IN:  CALC_LAYOUT  → { data[], width, height, config }
 *    IN:  CONFIG       → { iterations, nodePadding, nodeWidth }
 *    OUT: LAYOUT_READY → { nodes[], links[], stats }
 *    OUT: ERROR        → { source, message }
 *
 *  Version : WOW SK 100.0
 * ═══════════════════════════════════════════════════════
 */

/* jshint worker:true */

// QA17-FIX: Worker guard — prevents collision when PI Vision loads this as regular script
if (typeof WorkerGlobalScope === 'undefined' && typeof importScripts === 'undefined') {
    // Not a Worker context — bail out silently
} else {
(function (self) {
'use strict';

// ═══ Configuration ═══

var ITERATIONS = 32;
var NODE_PADDING = 16;
var NODE_WIDTH = 20;
var MARGIN = { top: 20, right: 30, bottom: 20, left: 30 };


// ═══ Message Handler ═══

self.onmessage = function (e) {
    var msg = e.data;

    try {
        switch (msg.type) {
            case 'CALC_LAYOUT':
                var result = calculateLayout(
                    msg.data || [],
                    msg.width || 800,
                    msg.height || 500,
                    msg.config || {}
                );
                self.postMessage({ type: 'LAYOUT_READY', payload: result });
                break;

            case 'CONFIG':
                if (msg.iterations) ITERATIONS = msg.iterations;
                if (msg.nodePadding) NODE_PADDING = msg.nodePadding;
                if (msg.nodeWidth) NODE_WIDTH = msg.nodeWidth;
                break;

            default:
                break;
        }
    } catch (err) {
        self.postMessage({
            type: 'ERROR',
            source: 'wow-sankey-worker',
            message: err.message || String(err)
        });
    }
};


// ═══════════════════════════════════════
//  MAIN LAYOUT ALGORITHM
// ═══════════════════════════════════════

function calculateLayout(rows, canvasWidth, canvasHeight, cfg) {
    var iterations = cfg.iterations || ITERATIONS;
    var nodePad = cfg.nodePadding || NODE_PADDING;
    var nodeW = cfg.nodeWidth || NODE_WIDTH;

    // Step 1: Build graph
    var graph = buildGraph(rows);
    if (graph.nodes.length === 0) {
        return { nodes: [], links: [], stats: { nodeCount: 0, linkCount: 0 } };
    }

    // Step 2: Assign depths (columns)
    assignDepths(graph);

    // Step 3: Compute node values
    computeNodeValues(graph);

    // Available drawing area
    var drawW = canvasWidth - MARGIN.left - MARGIN.right;
    var drawH = canvasHeight - MARGIN.top - MARGIN.bottom;

    // Step 4: Position nodes horizontally (by depth)
    var maxDepth = 0;
    for (var i = 0; i < graph.nodes.length; i++) {
        if (graph.nodes[i].depth > maxDepth) maxDepth = graph.nodes[i].depth;
    }

    var xScale = maxDepth > 0 ? (drawW - nodeW) / maxDepth : 0;
    for (var n = 0; n < graph.nodes.length; n++) {
        graph.nodes[n].x = MARGIN.left + graph.nodes[n].depth * xScale;
        graph.nodes[n].width = nodeW;
    }

    // Step 5: Position nodes vertically (initial)
    positionNodesVertically(graph, drawH, nodePad);

    // Step 6: Iterative relaxation
    for (var iter = 0; iter < iterations; iter++) {
        var alpha = 1 - iter / iterations;
        relaxRight(graph, alpha);
        resolveCollisions(graph, drawH, nodePad);
        relaxLeft(graph, alpha);
        resolveCollisions(graph, drawH, nodePad);
    }

    // Step 7: Compute link paths
    computeLinkPaths(graph);

    // Step 8: Compute max value for opacity scaling
    var maxVal = 0;
    for (var lv = 0; lv < graph.links.length; lv++) {
        if (graph.links[lv].value > maxVal) maxVal = graph.links[lv].value;
    }

    // Build output
    var outNodes = [];
    for (var on = 0; on < graph.nodes.length; on++) {
        var nd = graph.nodes[on];
        outNodes.push({
            id: nd.id,
            label: nd.label,
            x: nd.x,
            y: nd.y,
            width: nd.width,
            height: nd.height,
            value: nd.value,
            depth: nd.depth,
            sourceLinks: nd.sourceLinks.map(function (l) { return l.index; }),
            targetLinks: nd.targetLinks.map(function (l) { return l.index; })
        });
    }

    var outLinks = [];
    for (var ol = 0; ol < graph.links.length; ol++) {
        var lk = graph.links[ol];
        var opacity = maxVal > 0 ? Math.max(0.1, lk.value / maxVal) : 0.5;

        outLinks.push({
            index: lk.index,
            sourceId: lk.source.id,
            targetId: lk.target.id,
            value: lk.value,
            thickness: lk.thickness,
            opacity: opacity,
            flowSpeed: Math.max(0.3, Math.min(2.5, lk.value / (maxVal || 1) * 2.5)),
            source: { x: lk.source.x + lk.source.width, y: lk.sy + lk.thickness / 2 },
            target: { x: lk.target.x, y: lk.ty + lk.thickness / 2 },
            curvature: Math.abs(lk.target.x - (lk.source.x + lk.source.width)) * 0.4
        });
    }

    return {
        nodes: outNodes,
        links: outLinks,
        stats: {
            nodeCount: outNodes.length,
            linkCount: outLinks.length,
            maxDepth: maxDepth,
            maxValue: maxVal
        }
    };
}


// ═══════════════════════════════════════
//  GRAPH BUILDING
// ═══════════════════════════════════════

function buildGraph(rows) {
    var nodeMap = {};
    var nodeList = [];
    var linkList = [];

    function getOrCreateNode(name) {
        if (!nodeMap[name]) {
            var node = {
                id: name,
                label: name,
                depth: 0,
                value: 0,
                x: 0, y: 0,
                width: 0, height: 0,
                sourceLinks: [],
                targetLinks: []
            };
            nodeMap[name] = node;
            nodeList.push(node);
        }
        return nodeMap[name];
    }

    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var srcName = row.Source || row.source || row.From || row.from || '';
        var tgtName = row.Target || row.target || row.To || row.to || '';
        var val = parseFloat(row.Value || row.value || row.Flow || row.flow || 0);

        if (!srcName || !tgtName || isNaN(val) || val <= 0) continue;

        var srcNode = getOrCreateNode(srcName);
        var tgtNode = getOrCreateNode(tgtName);

        var link = {
            index: linkList.length,
            source: srcNode,
            target: tgtNode,
            value: val,
            thickness: 0,
            sy: 0, ty: 0
        };

        srcNode.sourceLinks.push(link);
        tgtNode.targetLinks.push(link);
        linkList.push(link);
    }

    return { nodes: nodeList, links: linkList };
}


// ═══════════════════════════════════════
//  DEPTH ASSIGNMENT (BFS)
// ═══════════════════════════════════════

function assignDepths(graph) {
    var remaining = graph.nodes.slice();
    var next;

    while (remaining.length > 0) {
        next = [];
        for (var i = 0; i < remaining.length; i++) {
            var node = remaining[i];
            for (var s = 0; s < node.sourceLinks.length; s++) {
                var target = node.sourceLinks[s].target;
                target.depth = Math.max(target.depth, node.depth + 1);
                if (next.indexOf(target) === -1) next.push(target);
            }
        }
        remaining = next;
        // Safety: break if cycles detected
        if (next.length > 0 && next.length === remaining.length) break;
    }
}


// ═══════════════════════════════════════
//  NODE VALUE COMPUTATION
// ═══════════════════════════════════════

function computeNodeValues(graph) {
    for (var i = 0; i < graph.nodes.length; i++) {
        var node = graph.nodes[i];
        var srcSum = 0, tgtSum = 0;
        for (var s = 0; s < node.sourceLinks.length; s++) srcSum += node.sourceLinks[s].value;
        for (var t = 0; t < node.targetLinks.length; t++) tgtSum += node.targetLinks[t].value;
        node.value = Math.max(srcSum, tgtSum);
    }
}


// ═══════════════════════════════════════
//  VERTICAL POSITIONING
// ═══════════════════════════════════════

function positionNodesVertically(graph, drawH, nodePad) {
    // Group by depth
    var columns = {};
    for (var i = 0; i < graph.nodes.length; i++) {
        var d = graph.nodes[i].depth;
        if (!columns[d]) columns[d] = [];
        columns[d].push(graph.nodes[i]);
    }

    var depths = Object.keys(columns).sort(function (a, b) { return a - b; });

    for (var di = 0; di < depths.length; di++) {
        var col = columns[depths[di]];
        var totalValue = 0;
        for (var c = 0; c < col.length; c++) totalValue += col[c].value;

        var totalPad = (col.length - 1) * nodePad;
        var availableH = drawH - totalPad;
        var scale = totalValue > 0 ? availableH / totalValue : 1;

        var yOffset = MARGIN.top;
        for (var cn = 0; cn < col.length; cn++) {
            col[cn].y = yOffset;
            col[cn].height = Math.max(4, col[cn].value * scale);
            yOffset += col[cn].height + nodePad;
        }
    }

    // Scale link thicknesses
    for (var li = 0; li < graph.links.length; li++) {
        var link = graph.links[li];
        var srcCol = columns[link.source.depth];
        var totalSrcVal = 0;
        for (var sv = 0; sv < srcCol.length; sv++) totalSrcVal += srcCol[sv].value;

        var colScale = totalSrcVal > 0 ? (drawH - (srcCol.length - 1) * nodePad) / totalSrcVal : 1;
        link.thickness = Math.max(1, link.value * colScale);
    }
}


// ═══════════════════════════════════════
//  ITERATIVE RELAXATION (THE GEM)
// ═══════════════════════════════════════

function relaxRight(graph, alpha) {
    // Push nodes right based on weighted average of source positions
    for (var i = 0; i < graph.nodes.length; i++) {
        var node = graph.nodes[i];
        if (node.targetLinks.length === 0) continue;

        var weightedSum = 0;
        var totalWeight = 0;
        for (var t = 0; t < node.targetLinks.length; t++) {
            var link = node.targetLinks[t];
            var srcCenter = link.source.y + link.source.height / 2;
            weightedSum += srcCenter * link.value;
            totalWeight += link.value;
        }

        if (totalWeight > 0) {
            var targetY = (weightedSum / totalWeight) - node.height / 2;
            node.y += (targetY - node.y) * alpha;
        }
    }
}

function relaxLeft(graph, alpha) {
    // Push nodes left based on weighted average of target positions
    for (var i = graph.nodes.length - 1; i >= 0; i--) {
        var node = graph.nodes[i];
        if (node.sourceLinks.length === 0) continue;

        var weightedSum = 0;
        var totalWeight = 0;
        for (var s = 0; s < node.sourceLinks.length; s++) {
            var link = node.sourceLinks[s];
            var tgtCenter = link.target.y + link.target.height / 2;
            weightedSum += tgtCenter * link.value;
            totalWeight += link.value;
        }

        if (totalWeight > 0) {
            var targetY = (weightedSum / totalWeight) - node.height / 2;
            node.y += (targetY - node.y) * alpha;
        }
    }
}


// ═══════════════════════════════════════
//  COLLISION RESOLUTION
// ═══════════════════════════════════════

function resolveCollisions(graph, drawH, nodePad) {
    // Group by depth
    var columns = {};
    for (var i = 0; i < graph.nodes.length; i++) {
        var d = graph.nodes[i].depth;
        if (!columns[d]) columns[d] = [];
        columns[d].push(graph.nodes[i]);
    }

    var depths = Object.keys(columns);
    for (var di = 0; di < depths.length; di++) {
        var col = columns[depths[di]];

        // Sort by Y position
        col.sort(function (a, b) { return a.y - b.y; });

        // Push down overlapping nodes
        var y0 = MARGIN.top;
        for (var cn = 0; cn < col.length; cn++) {
            var dy = y0 - col[cn].y;
            if (dy > 0) col[cn].y += dy;
            y0 = col[cn].y + col[cn].height + nodePad;
        }

        // Push up if exceeds bottom
        var bottomY = MARGIN.top + drawH;
        var lastNode = col[col.length - 1];
        dy = lastNode.y + lastNode.height - bottomY;
        if (dy > 0) {
            lastNode.y -= dy;
            for (var cn2 = col.length - 2; cn2 >= 0; cn2--) {
                dy = col[cn2].y + col[cn2].height + nodePad - col[cn2 + 1].y;
                if (dy > 0) col[cn2].y -= dy;
            }
        }
    }
}


// ═══════════════════════════════════════
//  LINK PATH COMPUTATION
// ═══════════════════════════════════════

function computeLinkPaths(graph) {
    // Sort source links by target Y, target links by source Y
    for (var n = 0; n < graph.nodes.length; n++) {
        graph.nodes[n].sourceLinks.sort(function (a, b) { return a.target.y - b.target.y; });
        graph.nodes[n].targetLinks.sort(function (a, b) { return a.source.y - b.source.y; });
    }

    // Assign link Y offsets within each node
    for (var ni = 0; ni < graph.nodes.length; ni++) {
        var node = graph.nodes[ni];

        // Source side (right edge of node)
        var sy = node.y;
        for (var sl = 0; sl < node.sourceLinks.length; sl++) {
            node.sourceLinks[sl].sy = sy;
            sy += node.sourceLinks[sl].thickness;
        }

        // Target side (left edge of node)
        var ty = node.y;
        for (var tl = 0; tl < node.targetLinks.length; tl++) {
            node.targetLinks[tl].ty = ty;
            ty += node.targetLinks[tl].thickness;
        }
    }
}

})(typeof self !== 'undefined' ? self : this);
} // end Worker guard
