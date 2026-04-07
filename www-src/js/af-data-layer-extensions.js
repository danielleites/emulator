/**
 * af-data-layer-extensions.js — AFDataLayer Extension Patch
 * ===========================================================
 * גרסה: 1.0.0  |  תאריך: 2026-03-29
 *
 * מוסיף לAFDataLayer מתודות נוספות:
 *   - streamSetsValue(webIds)         — snapshot ל-N תגים
 *   - streamSetsRecorded(webIds, ...)  — היסטוריה ל-N תגים
 *   - batchRequest(requests)           — batch multi-request
 *   - getSummaryValues(webId, ...)      — summary statistics
 *   - searchEventFrames(opts)          — חיפוש event frames
 *   - getNotificationSubscription(webId) — subscription stub
 *   - interpolateValues(webId, ...)     — interpolated series (alias)
 *   - handleRequest extensions          — extended handleRequest routing
 *
 * שימוש: טוען לאחר af-data-layer.js
 * ═══════════════════════════════════════════════════════════════
 */

;(function (global) {
  'use strict';

  // Wait for AFDataLayer to be available
  var _attempts = 0;
  var _warned = false;
  var _quiet = !!global.__PIV_AF_SILENT__;

  function _resolveAFDataLayer() {
    return global.AFDataLayer || (typeof globalThis !== 'undefined' ? globalThis.AFDataLayer : null);
  }

  function _extend() {
    const AFDataLayer = _resolveAFDataLayer();
    if (!AFDataLayer) {
      _attempts += 1;
      if (!_warned && !_quiet) {
        console.warn('[AFExtensions] AFDataLayer עדיין לא זמין — ממשיך עם fallback יציב');
        _warned = true;
      }
      if (_attempts < 30) {
        setTimeout(_extend, 100);
      }
      return;
    }

    const proto = AFDataLayer.prototype;

    // ─── Guard: לא להוסיף שוב אם כבר הורחב ───────────────────
    if (proto._extended) return;
    proto._extended = true;

    // ═══════════════════════════════════════════════════════════
    //  STREAMSETS — batch snapshot
    // ═══════════════════════════════════════════════════════════

    /**
     * מחזיר ערכים נוכחיים לרשימת WebIds (תגים/attributes).
     * @param {string[]} webIds
     * @returns {{ Items: Array<{ WebId, Value, Timestamp, Good }> }}
     */
    proto.streamSetsValue = function (webIds) {
      const items = (webIds || []).map(wid => {
        try {
          const v = this.getAttributeValue(wid);
          if (v) {
            return { WebId: wid, Value: { Value: v.Value, Timestamp: v.Timestamp || new Date().toISOString(), Good: v.Good !== false } };
          }
          // Try as tag
          const tag = this._tags && this._tags[wid];
          if (tag) {
            return { WebId: wid, Value: { Value: this._generateCurrentValue ? this._generateCurrentValue(tag) : tag._profile.typical, Timestamp: new Date().toISOString(), Good: true } };
          }
          return { WebId: wid, Exception: { Message: 'WebId not found', StatusCode: 404 } };
        } catch (e) {
          return { WebId: wid, Exception: { Message: e.message, StatusCode: 500 } };
        }
      });
      return { Items: items, Links: {} };
    };

    /**
     * מחזיר נתונים היסטוריים לרשימת WebIds.
     * @param {string[]} webIds
     * @param {string} [startTime]
     * @param {string} [endTime]
     * @param {number} [maxCount]
     * @returns {{ Items: Array<{ WebId, Items: Array }> }}
     */
    proto.streamSetsRecorded = function (webIds, startTime, endTime, maxCount) {
      const items = (webIds || []).map(wid => {
        try {
          const r = this.getRecordedValues(wid, startTime || '*-1h', endTime || '*', maxCount || 100);
          return { WebId: wid, Items: r.Items || [] };
        } catch (e) {
          return { WebId: wid, Exception: { Message: e.message, StatusCode: 500 } };
        }
      });
      return { Items: items, Links: {} };
    };

    /**
     * מחזיר interpolated values לרשימת WebIds.
     * @param {string[]} webIds
     * @param {string} [startTime]
     * @param {string} [endTime]
     * @param {string} [interval]
     * @returns {{ Items: Array<{ WebId, Items: Array }> }}
     */
    proto.streamSetsInterpolated = function (webIds, startTime, endTime, interval) {
      const items = (webIds || []).map(wid => {
        try {
          const r = this.getInterpolatedValues(wid, startTime || '*-1h', endTime || '*', interval || '5m');
          return { WebId: wid, Items: r.Items || [] };
        } catch (e) {
          return { WebId: wid, Exception: { Message: e.message, StatusCode: 500 } };
        }
      });
      return { Items: items, Links: {} };
    };

    // ═══════════════════════════════════════════════════════════
    //  BATCH REQUEST
    // ═══════════════════════════════════════════════════════════

    /**
     * מטפל ב-batch requests (מקבל מפה של { key: { Method, Resource, Parameters } }).
     * @param {object} requests
     * @returns {object}  — { key: { Status, Content } }
     */
    proto.batchRequest = function (requests) {
      const results = {};
      for (const [key, req] of Object.entries(requests || {})) {
        const path    = (req.Resource || req.resource || '').replace(/^.*\/piwebapi/, '');
        const params  = req.Parameters || req.parameters || {};
        try {
          const data = this.handleRequest(path, params);
          results[key] = {
            Status: data && data.error ? 404 : 200,
            Content: data,
          };
        } catch (e) {
          results[key] = { Status: 500, Content: { Errors: [e.message] } };
        }
      }
      return results;
    };

    // ═══════════════════════════════════════════════════════════
    //  NOTIFICATION SUBSCRIPTION STUB
    // ═══════════════════════════════════════════════════════════

    /**
     * מחזיר stub של notification channel (WebSocket simulation).
     * @param {string} webId
     * @param {function} [onValue]  — callback for new values
     * @param {number} [intervalMs] — polling interval
     * @returns {{ webId, cancel: function, lastValue }}
     */
    proto.getNotificationSubscription = function (webId, onValue, intervalMs) {
      let _last = null;
      let _timer = null;
      const self = this;

      const poll = () => {
        try {
          const v = self.getAttributeValue(webId);
          if (v) {
            _last = v;
            if (onValue) onValue({ WebId: webId, Value: v });
          }
        } catch (e) {}
      };

      _timer = setInterval(poll, intervalMs || 5000);
      poll(); // immediate first value

      return {
        webId,
        get lastValue() { return _last; },
        cancel() {
          if (_timer) clearInterval(_timer);
          _timer = null;
        },
      };
    };

    // ═══════════════════════════════════════════════════════════
    //  SEARCH EVENT FRAMES (extended)
    // ═══════════════════════════════════════════════════════════

    /**
     * חיפוש event frames לפי קריטריונים מורחבים.
     * @param {object} opts
     * @param {string} [opts.startTime]
     * @param {string} [opts.endTime]
     * @param {boolean} [opts.activeOnly]
     * @param {string} [opts.nameMask]      — filter by name (wildcard * supported)
     * @param {string} [opts.categoryName]  — filter by category
     * @param {string} [opts.templateName]  — filter by template
     * @param {number} [opts.maxCount]
     * @returns {{ Items: Array, TotalCount: number }}
     */
    proto.searchEventFrames = function (opts) {
      opts = opts || {};
      let frames = (this._eventFrames || []).slice();

      if (opts.activeOnly) frames = frames.filter(f => f.IsActive);

      if (opts.startTime) {
        const st = this._parseTime(opts.startTime);
        frames = frames.filter(f => new Date(f.EndTime || Date.now()).getTime() >= st);
      }
      if (opts.endTime) {
        const et = this._parseTime(opts.endTime);
        frames = frames.filter(f => new Date(f.StartTime).getTime() <= et);
      }
      if (opts.nameMask) {
        const re = new RegExp('^' + opts.nameMask.replace(/\*/g, '.*') + '$', 'i');
        frames = frames.filter(f => re.test(f.Name));
      }
      if (opts.categoryName) {
        frames = frames.filter(f => (f.CategoryNames || []).includes(opts.categoryName));
      }
      if (opts.templateName) {
        frames = frames.filter(f => f.TemplateName === opts.templateName);
      }

      const total = frames.length;
      const maxCount = opts.maxCount || 100;
      return { Items: frames.slice(0, maxCount), TotalCount: total };
    };

    // ═══════════════════════════════════════════════════════════
    //  SUMMARY VALUES (extended)
    // ═══════════════════════════════════════════════════════════

    /**
     * Computes statistical summary.
     * Already exists in AFDataLayer.getSummaryValues — extend with StdDev and Percentile.
     */
    const _origGetSummary = proto.getSummaryValues;
    proto.getSummaryValues = function (webId, startTime, endTime, summaryType) {
      const base = _origGetSummary ? _origGetSummary.call(this, webId, startTime, endTime, summaryType) : null;
      if (!base || !base.Items) return base;

      // Add StdDev and Percentile if not present
      const summaryVal = base.Items[0] && base.Items[0].Value;
      if (summaryVal && !summaryVal.StdDev) {
        // Re-compute from recorded values
        const recorded = this.getRecordedValues(webId, startTime || '*-1d', endTime || '*', 500);
        if (recorded && recorded.Items) {
          const nums = recorded.Items.map(i => i.Value).filter(v => typeof v === 'number');
          if (nums.length > 0) {
            const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
            const std  = Math.sqrt(nums.reduce((s, v) => s + (v - mean) ** 2, 0) / nums.length);
            const sorted = [...nums].sort((a, b) => a - b);
            summaryVal.StdDev    = { Value: +std.toFixed(3) };
            summaryVal.Percentile95 = { Value: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1] };
            summaryVal.PercentGood  = summaryVal.PercentGood || { Value: 100 };
            summaryVal.Count = { Value: nums.length };
          }
        }
      }

      return base;
    };

    // ═══════════════════════════════════════════════════════════
    //  EXTENDED handleRequest routing
    // ═══════════════════════════════════════════════════════════

    const _origHandleRequest = proto.handleRequest;
    proto.handleRequest = function (path, params) {
      params = params || {};
      const p = path.replace(/^\/+/, '').split('/');

      // Streamsets endpoints
      if (p[0] === 'streamsets') {
        const webIds = (params.webId || '').split(',').map(s => s.trim()).filter(Boolean);
        if (p[1] === 'value')        return this.streamSetsValue(webIds);
        if (p[1] === 'recorded')     return this.streamSetsRecorded(webIds, params.startTime, params.endTime, params.maxCount);
        if (p[1] === 'interpolated') return this.streamSetsInterpolated(webIds, params.startTime, params.endTime, params.interval);
      }

      // Batch endpoint
      if (p[0] === 'batch') {
        return this.batchRequest(params._body || {});
      }

      // Notification channel stub
      if (p[0] === 'channels' && p.length >= 2) {
        return { WebId: p[1], _IsMock: true, _Note: 'Notification channels: use polling in simulation mode' };
      }

      // Extended event frame search
      if (p[0] === 'eventframes' && p.length === 1) {
        return this.searchEventFrames(params);
      }

      // Streams API (synonym for attributes)
      if (p[0] === 'streams' && p.length === 3 && p[2] === 'summary') {
        return this.getSummaryValues(p[1], params.startTime, params.endTime, params.summaryType);
      }

      // System info stub
      if (p[0] === 'system') {
        if (p[1] === 'versions') {
          return { 'PI Web API': { Version: '2019 SP3 (AF Mock Extended)', _IsMock: true } };
        }
        if (p[1] === 'userinfo') {
          return { IdentityType: 'ViSiOn', Name: 'DEMO_USER', _IsMock: true };
        }
      }

      // Delegate to original
      return _origHandleRequest ? _origHandleRequest.call(this, path, params) : { error: 'Unknown endpoint: ' + path };
    };

    // ═══════════════════════════════════════════════════════════
    //  VERSION INFO
    // ═══════════════════════════════════════════════════════════

    proto.getExtensionVersion = function () {
      return '1.0.0';
    };

    proto.isExtended = true;

    console.info('[AFExtensions] AFDataLayer הורחב בהצלחה (v1.0.0)');
  }

  // Run when DOM is ready (to ensure af-data-layer.js loaded first)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _extend);
  } else {
    // Try immediate, fall back with delay
    if (global.AFDataLayer) {
      _extend();
    } else {
      setTimeout(_extend, 50);
    }
  }

})(typeof window !== 'undefined' ? window : globalThis);
