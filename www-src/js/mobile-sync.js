(function (window) {
  'use strict';

  function unique(list) {
    var seen = {};
    return list.filter(function (item) {
      if (!item || seen[item]) return false;
      seen[item] = true;
      return true;
    });
  }

  function buildCandidateBases() {
    var configured = window.PIV_SYNC_CONFIG && window.PIV_SYNC_CONFIG.baseUrl;
    var protocol = window.location && window.location.protocol ? window.location.protocol : 'http:';
    var hostname = window.location && window.location.hostname ? window.location.hostname : '127.0.0.1';
    var origin = window.location && window.location.origin ? window.location.origin : '';
    var list = [
      configured,
      'http://127.0.0.1:9091',
      'http://localhost:9091',
      protocol + '//' + hostname + ':9091'
    ];
    if (origin && /^https?:\/\//.test(origin)) list.push(origin.replace(/:\d+$/, ':9091'));
    return unique(list);
  }

  var STATE = {
    baseUrl: buildCandidateBases()[0] || 'http://127.0.0.1:9091',
    candidateBases: buildCandidateBases(),
    activeBaseIndex: 0,
    role: 'mobile',
    sessionId: 'piv-default',
    clientId: 'mobile-' + Math.random().toString(36).slice(2, 10),
    sourceInstance: 'mobile-app',
    connected: false,
    connecting: false,
    reconnectTimer: null,
    reconnectDelay: 1500,
    maxReconnectDelay: 15000,
    eventSource: null,
    lastHeartbeatAt: 0,
    processedIds: {},
    applyingRemote: false,
    started: false,
    probing: false,
    replay: true,
    lastError: null
  };

  function getConnectionElements() {
    return {
      banner: document.getElementById('connection-banner'),
      text: document.getElementById('connection-text')
    };
  }

  function updateStatusUi(status, text) {
    var els = getConnectionElements();
    if (!els.banner || !els.text) return;
    els.text.textContent = text;
    els.banner.classList.remove('hidden', 'offline-banner', 'sync-connected', 'sync-connecting', 'sync-disconnected');
    els.banner.classList.add('sync-' + status);
  }

  function emitLocalSyncStatus() {
    window.dispatchEvent(new CustomEvent('pivsync:status', {
      detail: {
        connected: STATE.connected,
        connecting: STATE.connecting,
        lastHeartbeatAt: STATE.lastHeartbeatAt,
        baseUrl: STATE.baseUrl,
        role: STATE.role,
        sessionId: STATE.sessionId,
        lastError: STATE.lastError
      }
    }));
  }

  function setStatus(status, text, errorText) {
    STATE.connecting = status === 'connecting';
    STATE.connected = status === 'connected';
    STATE.lastError = errorText || null;
    updateStatusUi(status, text);
    emitLocalSyncStatus();
  }

  function rememberProcessed(id) {
    if (!id) return;
    STATE.processedIds[id] = Date.now();
    var keys = Object.keys(STATE.processedIds);
    if (keys.length > 200) {
      keys.sort(function (a, b) { return STATE.processedIds[a] - STATE.processedIds[b]; });
      while (keys.length > 180) delete STATE.processedIds[keys.shift()];
    }
  }

  function isProcessed(id) { return !!(id && STATE.processedIds[id]); }

  function rotateBase() {
    if (STATE.candidateBases.length < 2) return;
    STATE.activeBaseIndex = (STATE.activeBaseIndex + 1) % STATE.candidateBases.length;
    STATE.baseUrl = STATE.candidateBases[STATE.activeBaseIndex];
  }

  function scheduleReconnect() {
    if (STATE.reconnectTimer) return;
    var delay = STATE.reconnectDelay;
    STATE.reconnectTimer = window.setTimeout(function () {
      STATE.reconnectTimer = null;
      rotateBase();
      connect();
    }, delay);
    STATE.reconnectDelay = Math.min(STATE.reconnectDelay * 1.8, STATE.maxReconnectDelay);
  }

  function handleRemoteAction(message) {
    if (!message || !message.action || isProcessed(message.eventId)) return;
    rememberProcessed(message.eventId);
    STATE.applyingRemote = true;
    try {
      window.dispatchEvent(new CustomEvent('pivsync:remote-action', { detail: message }));
    } finally {
      STATE.applyingRemote = false;
    }
  }

  function probeBase(baseUrl) {
    return fetch(baseUrl + '/health', { method: 'GET' }).then(function (res) {
      if (!res.ok) throw new Error('health-' + res.status);
      return res.json();
    }).then(function () { return baseUrl; });
  }

  function ensureReachableBase() {
    if (STATE.probing) return Promise.resolve(STATE.baseUrl);
    STATE.probing = true;
    var chain = Promise.reject(new Error('start'));
    STATE.candidateBases.forEach(function (base) {
      chain = chain.catch(function () { return probeBase(base); });
    });
    return chain.then(function (base) {
      STATE.baseUrl = base;
      STATE.activeBaseIndex = Math.max(STATE.candidateBases.indexOf(base), 0);
      return base;
    }).finally(function () {
      STATE.probing = false;
    });
  }

  function closeEventSource() {
    if (!STATE.eventSource) return;
    try { STATE.eventSource.close(); } catch (_) {}
    STATE.eventSource = null;
  }

  function connect() {
    closeEventSource();
    setStatus('connecting', 'מסנכרן מול דסקטופ...');

    ensureReachableBase().then(function () {
      var url = STATE.baseUrl + '/events?clientId=' + encodeURIComponent(STATE.clientId) +
        '&role=' + encodeURIComponent(STATE.role) + '&sessionId=' + encodeURIComponent(STATE.sessionId) +
        '&replay=' + (STATE.replay ? '1' : '0');
      try {
        STATE.eventSource = new EventSource(url);
      } catch (error) {
        setStatus('disconnected', 'סנכרון לא זמין — מנסה להתחבר מחדש', error && error.message ? error.message : 'eventsource-init-failed');
        scheduleReconnect();
        return;
      }

      STATE.eventSource.addEventListener('connected', function () {
        STATE.reconnectDelay = 1500;
        setStatus('connected', 'מסונכרן עם דסקטופ');
      });

      STATE.eventSource.addEventListener('heartbeat', function (event) {
        STATE.lastHeartbeatAt = Date.now();
        if (!STATE.connected) setStatus('connected', 'מסונכרן עם דסקטופ');
        try {
          window.dispatchEvent(new CustomEvent('pivsync:heartbeat', { detail: JSON.parse(event.data || '{}') }));
        } catch (_) {}
      });

      STATE.eventSource.addEventListener('action', function (event) {
        try {
          handleRemoteAction(JSON.parse(event.data || '{}'));
        } catch (error) {
          console.warn('[PIV Sync][mobile] failed to parse action', error);
        }
      });

      STATE.eventSource.onerror = function (event) {
        setStatus('disconnected', 'חיבור סנכרון נותק — מתחבר מחדש', (event && event.message) || 'eventsource-error');
        closeEventSource();
        scheduleReconnect();
      };
    }).catch(function (error) {
      setStatus('disconnected', 'שרת הסנכרון לא זמין', error && error.message ? error.message : 'health-check-failed');
      scheduleReconnect();
    });
  }

  function publish(action, payload, target, options) {
    options = options || {};
    if (STATE.applyingRemote && !options.allowWhileApplying) return Promise.resolve({ skipped: true, reason: 'remote-apply' });
    var eventId = options.eventId || ('evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    rememberProcessed(eventId);
    var body = {
      eventId: eventId,
      action: action,
      payload: payload || {},
      target: target || 'all',
      source: STATE.role,
      clientId: STATE.clientId,
      sessionId: STATE.sessionId,
      ts: new Date().toISOString()
    };

    return ensureReachableBase().then(function () {
      return fetch(STATE.baseUrl + '/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (res) {
        if (!res.ok) throw new Error('publish-' + res.status);
        return res.json();
      });
    }).catch(function (error) {
      console.warn('[PIV Sync][mobile] publish failed', error);
      scheduleReconnect();
      return { ok: false, error: error && error.message ? error.message : 'publish-failed', baseUrl: STATE.baseUrl };
    });
  }

  function start(config) {
    if (STATE.started) return window.PIVMobileSync;
    config = config || {};
    if (config.baseUrl) {
      STATE.candidateBases = unique([config.baseUrl].concat(STATE.candidateBases));
      STATE.baseUrl = config.baseUrl;
      STATE.activeBaseIndex = 0;
    }
    if (config.sessionId) STATE.sessionId = config.sessionId;
    if (typeof config.replay === 'boolean') STATE.replay = config.replay;
    STATE.started = true;
    connect();
    return window.PIVMobileSync;
  }

  window.PIVMobileSync = {
    start: start,
    publish: publish,
    isApplyingRemote: function () { return STATE.applyingRemote; },
    getState: function () {
      return {
        connected: STATE.connected,
        connecting: STATE.connecting,
        sessionId: STATE.sessionId,
        clientId: STATE.clientId,
        baseUrl: STATE.baseUrl,
        lastHeartbeatAt: STATE.lastHeartbeatAt,
        lastError: STATE.lastError
      };
    },
    setSessionId: function (sessionId) { STATE.sessionId = sessionId || STATE.sessionId; },
    setBaseUrl: function (baseUrl) {
      if (!baseUrl) return;
      STATE.candidateBases = unique([baseUrl].concat(STATE.candidateBases));
      STATE.baseUrl = baseUrl;
      STATE.activeBaseIndex = 0;
    },
    reconnect: connect
  };
})(window);
