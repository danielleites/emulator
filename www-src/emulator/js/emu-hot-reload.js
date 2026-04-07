/**
 * emu-hot-reload.js — Hot Reload client for PI Vision Emulator
 *
 * Connects to the PIV Windows Agent's WebSocket server and listens
 * for file-change events. When the currently displayed symbol changes,
 * refreshes only that symbol (not the whole page) and shows a toast.
 *
 * Features:
 *   - WebSocket connection to agent (ws://localhost:<port>)
 *   - Auto-reconnect with exponential backoff
 *   - Selective symbol refresh (only the active symbol)
 *   - Toast notification on reload
 *   - Enable/disable toggle
 *
 * Requires: EMU.renderSymbol, EMU.activeSymbol (from app.js)
 */
(function (window) {
    'use strict';

    // ── Configuration ───────────────────────────────────────────────────────
    var DEFAULT_PORT = 8765;
    var RECONNECT_BASE_MS = 1000;   // initial reconnect delay
    var RECONNECT_MAX_MS  = 30000;  // max reconnect delay
    var TOAST_DURATION_MS = 3000;

    // ── State ───────────────────────────────────────────────────────────────
    var _ws = null;
    var _enabled = false;  // Disabled by default — enable manually or when agent is running
    var _reconnectDelay = RECONNECT_BASE_MS;
    var _reconnectTimer = null;
    var _reconnectAttempts = 0;
    var MAX_RECONNECT = 3;
    var _port = DEFAULT_PORT;
    var _toastEl = null;
    var _toastTimer = null;

    // ── Toast UI ────────────────────────────────────────────────────────────

    function _ensureToast() {
        if (_toastEl) return _toastEl;
        _toastEl = document.createElement('div');
        _toastEl.id = 'emu-hot-reload-toast';
        _toastEl.setAttribute('role', 'status');
        _toastEl.setAttribute('aria-live', 'polite');

        var style = _toastEl.style;
        style.position = 'fixed';
        style.bottom = '24px';
        style.left = '24px';
        style.padding = '10px 20px';
        style.background = 'rgba(0, 212, 170, 0.92)';
        style.color = '#0A0F1E';
        style.borderRadius = '8px';
        style.fontFamily = 'inherit';
        style.fontSize = '13px';
        style.fontWeight = '600';
        style.zIndex = '99999';
        style.opacity = '0';
        style.transform = 'translateY(12px)';
        style.transition = 'opacity 0.25s, transform 0.25s';
        style.pointerEvents = 'none';
        style.direction = 'ltr';
        style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';

        document.body.appendChild(_toastEl);
        return _toastEl;
    }

    function _showToast(message) {
        var el = _ensureToast();
        el.textContent = message;
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';

        if (_toastTimer) clearTimeout(_toastTimer);
        _toastTimer = setTimeout(function () {
            el.style.opacity = '0';
            el.style.transform = 'translateY(12px)';
            _toastTimer = null;
        }, TOAST_DURATION_MS);
    }

    // ── WebSocket connection ────────────────────────────────────────────────

    function _connect() {
        if (!_enabled) return;
        if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        var url = 'ws://localhost:' + _port;

        try {
            _ws = new WebSocket(url);
        } catch (e) {
            console.warn('[HotReload] Failed to create WebSocket:', e);
            _scheduleReconnect();
            return;
        }

        _ws.onopen = function () {
            console.info('[HotReload] Connected to', url);
            _reconnectDelay = RECONNECT_BASE_MS; // reset backoff
        };

        _ws.onmessage = function (event) {
            if (!_enabled) return;
            try {
                var data = JSON.parse(event.data);
                if (data.type === 'file-changed') {
                    _handleFileChanged(data);
                }
            } catch (e) {
                console.warn('[HotReload] Failed to parse message:', e);
            }
        };

        _ws.onclose = function (event) {
            console.info('[HotReload] Connection closed (code=' + event.code + ')');
            _ws = null;
            _scheduleReconnect();
        };

        _ws.onerror = function () {
            // onclose will fire after onerror, so reconnect is handled there
            console.warn('[HotReload] WebSocket error');
        };
    }

    function _scheduleReconnect() {
        if (!_enabled) return;
        if (_reconnectTimer) return;
        if (_reconnectAttempts >= MAX_RECONNECT) {
            console.log('[HotReload] Max reconnect attempts reached. Disabled.');
            _enabled = false;
            return;
        }
        _reconnectAttempts++;
        _reconnectTimer = setTimeout(function () {
            _reconnectTimer = null;
            _connect();
        }, _reconnectDelay);
        _reconnectDelay = Math.min(_reconnectDelay * 2, RECONNECT_MAX_MS);
    }

    function _disconnect() {
        if (_reconnectTimer) {
            clearTimeout(_reconnectTimer);
            _reconnectTimer = null;
        }
        if (_ws) {
            _ws.onclose = null; // prevent auto-reconnect
            _ws.close();
            _ws = null;
        }
    }

    // ── File change handler ─────────────────────────────────────────────────

    function _handleFileChanged(data) {
        var symbol = data.symbol;
        var file = data.file;

        var EMU = window.EMU;
        if (!EMU || !EMU.activeSymbol) return;

        var activeName = EMU.activeSymbol.name;
        if (!activeName) return;

        // Check if the changed symbol matches the currently active one
        var isMatch = (activeName === symbol) ||
                      (activeName === file) ||
                      ('sym-' + activeName + '.js'  === file) ||
                      ('sym-' + activeName + '.html' === file) ||
                      ('sym-' + activeName + '.css'  === file);

        // Also reload if piv-shared-core or a shared resource changed
        var isShared = (file === 'piv-shared-core.js') ||
                       (file === 'piv-shared-core.css');

        if (isMatch || isShared) {
            console.info('[HotReload] Reloading symbol:', activeName, '(changed:', file + ')');
            _showToast('\u21BA Symbol ' + activeName + ' reloaded');

            // Use EMU.renderSymbol to refresh only the active symbol
            if (EMU.renderSymbol) {
                EMU.renderSymbol(activeName, '#emu-canvas');
            }
        }
    }

    // ── Public API ──────────────────────────────────────────────────────────

    var HotReload = window.EMU_HOT_RELOAD = {

        /**
         * Initialize and connect.
         * @param {Object} [opts]
         * @param {number} [opts.port=8765] - WebSocket server port
         * @param {boolean} [opts.enabled=true] - Start enabled
         */
        init: function (opts) {
            opts = opts || {};
            if (opts.port) _port = opts.port;
            if (opts.enabled === false) {
                _enabled = false;
            } else {
                _enabled = true;
                _connect();
            }
        },

        /** Enable hot reload and connect if not already connected. */
        enable: function () {
            _enabled = true;
            _connect();
        },

        /** Disable hot reload and disconnect. */
        disable: function () {
            _enabled = false;
            _disconnect();
        },

        /** Toggle hot reload on/off. Returns new state. */
        toggle: function () {
            if (_enabled) {
                this.disable();
            } else {
                this.enable();
            }
            return _enabled;
        },

        /** @returns {boolean} Whether hot reload is currently enabled. */
        isEnabled: function () {
            return _enabled;
        },

        /** @returns {boolean} Whether the WebSocket is currently connected. */
        isConnected: function () {
            return _ws !== null && _ws.readyState === WebSocket.OPEN;
        }
    };

    // ── Auto-init on DOM ready ──────────────────────────────────────────────
    // Disabled by default — no PIV Agent WebSocket server in standalone/APK mode.
    // Enable manually via EMU_HOT_RELOAD.enable() when agent is running.
    document.addEventListener('DOMContentLoaded', function () {
        HotReload.init({ port: DEFAULT_PORT, enabled: false });
    });

})(window);
