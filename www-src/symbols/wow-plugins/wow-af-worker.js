/**
 * ═══════════════════════════════════════════════════════
 *  WOW AF Worker — Predictive Prefetch Engine
 * ═══════════════════════════════════════════════════════
 *  Dedicated Web Worker that manages all PI Web API
 *  communication for the AF Browser symbol. Runs entirely
 *  off the UI thread — the main page never blocks.
 *
 *  THE GEM: Request Debouncing + Batch API
 *  When the user sweeps their mouse down the tree, dozens
 *  of PREFETCH requests arrive within milliseconds.  The
 *  Worker collects them into a 100ms window, de-duplicates,
 *  and sends a SINGLE /piwebapi/batch call.  This prevents
 *  flooding the PI Web API with 50 individual requests
 *  and avoids HTTP 429 rate limiting.
 *
 *  Messages IN:
 *    { type: 'CONFIG',           payload: { piWebApiUrl } }
 *    { type: 'FETCH_CHILDREN',   payload: { webId } }
 *    { type: 'FETCH_AND_EXPAND', payload: { webId } }
 *    { type: 'PREFETCH',         payload: { webId } }
 *    { type: 'SEARCH',           payload: { query, rootWebId } }
 *
 *  Messages OUT:
 *    { type: 'CHILDREN',     payload: { webId, children } }
 *    { type: 'EXPAND_READY', payload: { webId, children } }
 *    { type: 'SEARCH_RESULTS', payload: { query, results } }
 *    { type: 'ERROR',        payload: { source, message } }
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

var _cache     = {};     /* { webId: { children, fetchedAt } }  */
var _inFlight  = {};     /* { webId: true } — prevent duplicates */
var _batchQueue = [];    /* WebIds waiting for batch dispatch    */
var _batchTimer = null;  /* 100ms debounce timer                */
var _expandWait = {};    /* { webId: true } — expand on arrival  */

var CACHE_TTL      = 300000;  /* 5 minutes */
var BATCH_DELAY    = 100;     /* ms — debounce window */
var MAX_BATCH_SIZE = 20;      /* Max WebIds per batch call */


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

            case 'FETCH_CHILDREN':
                _fetchChildren(msg.payload.webId, false);
                break;

            case 'FETCH_AND_EXPAND':
                _fetchChildren(msg.payload.webId, true);
                break;

            case 'PREFETCH':
                _enqueuePrefetch(msg.payload.webId);
                break;

            case 'SEARCH':
                _handleSearch(msg.payload);
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


/* ═══════════════════════════════════════════════════
 *  Fetch Children — Direct Single Request
 *
 *  Used for explicit click actions where we need
 *  immediate response.  If cache is fresh, returns
 *  instantly without network call.
 * ═══════════════════════════════════════════════════ */

function _fetchChildren(webId, expandAfter) {
    /* Check cache */
    var cached = _cache[webId];
    if (cached && (Date.now() - cached.fetchedAt < CACHE_TTL)) {
        self.postMessage({
            type: expandAfter ? 'EXPAND_READY' : 'CHILDREN',
            payload: { webId: webId, children: cached.children }
        });
        return;
    }

    /* Mark for expand after arrival */
    if (expandAfter) {
        _expandWait[webId] = true;
    }

    /* Already in flight? */
    if (_inFlight[webId]) return;
    _inFlight[webId] = true;

    var url = _config.piWebApiUrl + '/elements/' + webId +
              '/elements?selectedFields=Items.WebId;Items.Name;Items.HasChildren;Items.TemplateName';

    fetch(url, { credentials: 'include' })
        .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(function (json) {
            var children = _parseChildren(json, webId);
            _cacheStore(webId, children);
            delete _inFlight[webId];

            var shouldExpand = _expandWait[webId];
            delete _expandWait[webId];

            self.postMessage({
                type: shouldExpand ? 'EXPAND_READY' : 'CHILDREN',
                payload: { webId: webId, children: children }
            });
        })
        .catch(function (err) {
            delete _inFlight[webId];
            delete _expandWait[webId];
            self.postMessage({
                type: 'ERROR',
                payload: { source: 'FETCH_CHILDREN', message: webId + ': ' + err.message }
            });
        });
}


/* ═══════════════════════════════════════════════════
 *  THE GEM: Predictive Prefetch with Debounced Batch
 *
 *  When hover events fire rapidly (user sweeping mouse),
 *  WebIds are queued into _batchQueue.  After 100ms of
 *  silence, all queued WebIds are de-duplicated and sent
 *  as a single /piwebapi/batch POST request.
 *
 *  This transforms N individual requests into 1 batch:
 *    - 20 hovers in 200ms → 1 batch call (not 20)
 *    - PI Web API sees 1 request, returns all children
 *    - No HTTP 429 rate limiting
 *    - Server CPU: 1 context switch instead of 20
 * ═══════════════════════════════════════════════════ */

function _enqueuePrefetch(webId) {
    /* Already cached or in flight? Skip */
    if (_cache[webId] && (Date.now() - _cache[webId].fetchedAt < CACHE_TTL)) return;
    if (_inFlight[webId]) return;

    /* Already in batch queue? */
    if (_batchQueue.indexOf(webId) !== -1) return;

    _batchQueue.push(webId);

    /* Reset debounce timer */
    if (_batchTimer) clearTimeout(_batchTimer);
    _batchTimer = setTimeout(_flushBatchQueue, BATCH_DELAY);

    /* If queue is full, flush immediately */
    if (_batchQueue.length >= MAX_BATCH_SIZE) {
        clearTimeout(_batchTimer);
        _flushBatchQueue();
    }
}

function _flushBatchQueue() {
    _batchTimer = null;
    if (_batchQueue.length === 0) return;

    /* Snapshot and clear queue */
    var webIds = _batchQueue.slice();
    _batchQueue = [];

    /* Mark all in-flight */
    for (var i = 0; i < webIds.length; i++) {
        _inFlight[webIds[i]] = true;
    }

    /* Single WebId? Use direct fetch (cheaper than batch overhead) */
    if (webIds.length === 1) {
        _fetchChildren(webIds[0], false);
        return;
    }

    /* Build batch request body */
    var batchBody = {};
    for (var j = 0; j < webIds.length; j++) {
        var wid = webIds[j];
        batchBody['' + j] = {
            Method: 'GET',
            Resource: _config.piWebApiUrl + '/elements/' + wid +
                      '/elements?selectedFields=Items.WebId;Items.Name;Items.HasChildren;Items.TemplateName'
        };
    }

    fetch(_config.piWebApiUrl + '/batch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchBody)
    })
    .then(function (res) {
        if (!res.ok) throw new Error('Batch HTTP ' + res.status);
        return res.json();
    })
    .then(function (batchResponse) {
        /* Parse each sub-response */
        for (var k = 0; k < webIds.length; k++) {
            var wid = webIds[k];
            var subResp = batchResponse['' + k];
            delete _inFlight[wid];

            if (subResp && subResp.Status >= 200 && subResp.Status < 300 && subResp.Content) {
                var children = _parseChildren(subResp.Content, wid);
                _cacheStore(wid, children);

                var shouldExpand = _expandWait[wid];
                delete _expandWait[wid];

                self.postMessage({
                    type: shouldExpand ? 'EXPAND_READY' : 'CHILDREN',
                    payload: { webId: wid, children: children }
                });
            }
        }
    })
    .catch(function (err) {
        /* Clear all in-flight on batch failure */
        for (var m = 0; m < webIds.length; m++) {
            delete _inFlight[webIds[m]];
            delete _expandWait[webIds[m]];
        }
        self.postMessage({
            type: 'ERROR',
            payload: { source: 'BATCH_PREFETCH', message: err.message }
        });
    });
}


/* ═══ Search ═══ */

function _handleSearch(payload) {
    if (!payload.query || !payload.rootWebId) return;

    var url = _config.piWebApiUrl + '/elements/' + payload.rootWebId +
              '/elements?searchFullHierarchy=true&nameFilter=*' +
              encodeURIComponent(payload.query) + '*' +
              '&selectedFields=Items.WebId;Items.Name;Items.Path;Items.TemplateName' +
              '&maxCount=50';

    fetch(url, { credentials: 'include' })
        .then(function (res) {
            if (!res.ok) throw new Error('Search HTTP ' + res.status);
            return res.json();
        })
        .then(function (json) {
            var results = [];
            if (json.Items) {
                for (var i = 0; i < json.Items.length; i++) {
                    var item = json.Items[i];
                    results.push({
                        webId: item.WebId,
                        name:  item.Name,
                        path:  item.Path || '',
                        template: item.TemplateName || ''
                    });
                }
            }
            self.postMessage({
                type: 'SEARCH_RESULTS',
                payload: { query: payload.query, results: results }
            });
        })
        .catch(function (err) {
            self.postMessage({
                type: 'ERROR',
                payload: { source: 'SEARCH', message: err.message }
            });
        });
}


/* ═══ Helpers ═══ */

function _parseChildren(json, parentWebId) {
    var children = [];
    if (json && json.Items) {
        for (var i = 0; i < json.Items.length; i++) {
            var item = json.Items[i];
            children.push({
                webId:       item.WebId,
                name:        item.Name,
                hasChildren: item.HasChildren || false,
                template:    item.TemplateName || ''
            });
        }
    }
    return children;
}

function _cacheStore(webId, children) {
    _cache[webId] = {
        children:  children,
        fetchedAt: Date.now()
    };
}

})(typeof self !== 'undefined' ? self : this);
} // end Worker guard
