/* PIV20 Unified Core v3.0.0 — 2026-04-02 — 17 modules */

/* Module: index.js */
(function (global) {
    'use strict';

    // ── Minimal Promise polyfill guard ──
    // PI Vision runs inside IE11/Edge Legacy on air-gapped IEC/Noga stations.
    // If native Promise is missing, warn and provide a micro-shim.
    // For production air-gapped environments, deploy a full polyfill
    // (e.g. es6-promise.auto.min.js) BEFORE this bundle loads.
    if (typeof Promise === 'undefined') {
        if (global.console && console.warn) {
            console.warn('[PIV20] Promise not available — createQueue disabled. ' +
                         'Load es6-promise polyfill for IE11 support.');
        }
    }

    var PIV20 = global.PIV20 = global.PIV20 || {};

    PIV20.version = PIV20.version || 'next-starter';
    PIV20.core = PIV20.core || {};
    PIV20.visual = PIV20.visual || {};
    PIV20.composite = PIV20.composite || {};
    PIV20.perf = PIV20.perf || {};
    PIV20.compat = PIV20.compat || {};
    PIV20.ui = PIV20.ui || {};
    PIV20.api = PIV20.api || {};

    PIV20.noop = PIV20.noop || function () {};
})(typeof window !== 'undefined' ? window : globalThis);

/* Module: core/runtime.js */
(function (global) {
    'use strict';

    var PIV20 = global.PIV20 = global.PIV20 || {};

    function log(moduleName, action, error) {
        if (!global.console || !console.error) return;
        console.error('[PIV20]', moduleName, action, error && error.message ? error.message : error);
    }

    function wrap(moduleName, action, fn) {
        return function wrapped() {
            try {
                return fn.apply(this, arguments);
            } catch (error) {
                log(moduleName, action, error);
                return undefined;
            }
        };
    }

    function createBus() {
        var listeners = {};

        function add(name, handler, once) {
            listeners[name] = listeners[name] || [];
            listeners[name].push({ handler: handler, once: !!once });
            return function unsubscribe() {
                listeners[name] = (listeners[name] || []).filter(function (entry) {
                    return entry.handler !== handler;
                });
            };
        }

        return {
            on: function (name, handler) {
                return add(name, handler, false);
            },
            once: function (name, handler) {
                return add(name, handler, true);
            },
            emit: function (name, payload) {
                (listeners[name] || []).slice().forEach(function (entry) {
                    try {
                        entry.handler(payload);
                    } catch (error) {
                        log('bus', name, error);
                    }
                    if (entry.once) {
                        listeners[name] = (listeners[name] || []).filter(function (x) {
                            return x !== entry;
                        });
                    }
                });
            },
            clear: function () {
                listeners = {};
            }
        };
    }

    function createCleanup() {
        var tasks = [];
        var destroyed = false;

        function addTask(fn) {
            if (typeof fn !== 'function') return PIV20.noop;
            if (destroyed) {
                try {
                    fn();
                } catch (error) {
                    log('cleanup', 'late-add', error);
                }
                return PIV20.noop;
            }
            tasks.push(fn);
            return fn;
        }

        return {
            add: addTask,
            listener: function (target, eventName, handler, options) {
                if (!target || !target.addEventListener || !target.removeEventListener) return PIV20.noop;
                target.addEventListener(eventName, handler, options || false);
                return addTask(function () {
                    target.removeEventListener(eventName, handler, options || false);
                });
            },
            interval: function (fn, delay) {
                var handle = global.setInterval(fn, delay);
                return addTask(function () {
                    global.clearInterval(handle);
                });
            },
            timeout: function (fn, delay) {
                var handle = global.setTimeout(fn, delay);
                return addTask(function () {
                    global.clearTimeout(handle);
                });
            },
            worker: function (worker) {
                if (!worker || typeof worker.terminate !== 'function') return PIV20.noop;
                return addTask(function () {
                    // Null handlers before terminate to prevent late callbacks
                    worker.onmessage = null;
                    worker.onerror = null;
                    worker.terminate();
                });
            },
            destroy: function () {
                if (destroyed) return;
                destroyed = true;
                while (tasks.length) {
                    try {
                        tasks.pop()();
                    } catch (error) {
                        log('cleanup', 'destroy', error);
                    }
                }
            }
        };
    }

    function safeApply(scope) {
        if (!scope) return;
        if (typeof scope.$applyAsync === 'function') {
            scope.$applyAsync();
            return;
        }
        if (typeof scope.$evalAsync === 'function') {
            scope.$evalAsync();
        }
    }

    function destroyHelper(arg1, arg2) {
        if (arg1 && typeof arg1.$on === 'function' && typeof arg2 === 'function') {
            return arg1.$on('$destroy', arg2);
        }
        if (arg1 && typeof arg1.destroy === 'function' && arg2 === undefined) {
            arg1.destroy();
        }
        return null;
    }

    function createQueue(maxConcurrent) {
        // Guard: Promise required for async queue
        if (typeof Promise === 'undefined') {
            return { push: function (task) {
                try { return { then: function (cb) { cb(task()); } }; }
                catch (e) { return { then: function (_, rej) { if (rej) rej(e); } }; }
            } };
        }
        var running = 0;
        var queue = [];
        var limit = Math.max(1, maxConcurrent || 1);

        function pump() {
            if (running >= limit || !queue.length) return;
            var next = queue.shift();
            running += 1;
            // ES5-safe: .then(ok,fail) instead of .finally for IE11/Edge compat
            function afterDone() { running -= 1; pump(); }
            Promise.resolve()
                .then(next.task)
                .then(
                    function (val)  { next.resolve(val); afterDone(); },
                    function (err)  { next.reject(err);  afterDone(); }
                );
        }

        return {
            push: function (task) {
                return new Promise(function (resolve, reject) {
                    queue.push({ task: task, resolve: resolve, reject: reject });
                    pump();
                });
            }
        };
    }

    PIV20.shield = PIV20.shield || { log: log, wrap: wrap };
    PIV20.createBus = PIV20.createBus || createBus;
    PIV20.createCleanup = PIV20.createCleanup || createCleanup;
    PIV20.safeApply = PIV20.safeApply || safeApply;
    PIV20.destroyHelper = PIV20.destroyHelper || destroyHelper;
    PIV20.runtime = PIV20.runtime || {
        createBus: createBus,
        createCleanup: createCleanup,
        createQueue: createQueue
    };
    PIV20.core.runtime = PIV20.runtime;
})(typeof window !== 'undefined' ? window : globalThis);

/* Module: core/config.js */
(function (global) {
    'use strict';

    var PIV20 = global.PIV20 = global.PIV20 || {};

    function isPlainObject(value) {
        return !!value && Object.prototype.toString.call(value) === '[object Object]';
    }

    function clone(value) {
        if (Array.isArray(value)) return value.map(clone);
        if (isPlainObject(value)) {
            var copy = {};
            Object.keys(value).forEach(function (key) {
                copy[key] = clone(value[key]);
            });
            return copy;
        }
        return value;
    }

    function mergeDefaults(defaults, incoming) {
        var base = clone(defaults || {});
        Object.keys(incoming || {}).forEach(function (key) {
            if (isPlainObject(base[key]) && isPlainObject(incoming[key])) {
                base[key] = mergeDefaults(base[key], incoming[key]);
                return;
            }
            base[key] = clone(incoming[key]);
        });
        return base;
    }

    function createSchema(options) {
        options = options || {};
        var defaults = options.defaults || {};
        var validators = options.validators || {};

        return {
            normalize: function (incoming) {
                return mergeDefaults(defaults, incoming || {});
            },
            validate: function (incoming) {
                var config = mergeDefaults(defaults, incoming || {});
                var issues = [];

                Object.keys(validators).forEach(function (key) {
                    var result = validators[key](config[key], config);
                    if (result === true || result === undefined) return;
                    issues.push({
                        key: key,
                        message: typeof result === 'string' ? result : 'Invalid config value'
                    });
                });

                return { valid: issues.length === 0, issues: issues, config: config };
            }
        };
    }

    PIV20.config = PIV20.config || {
        clone: clone,
        mergeDefaults: mergeDefaults,
        createSchema: createSchema
    };
    PIV20.core.config = PIV20.config;
})(typeof window !== 'undefined' ? window : globalThis);

/* Module: core/assets.js */
(function (global) {
    'use strict';

    var PIV20 = global.PIV20 = global.PIV20 || {};
    var scriptCache = {};
    var styleCache = {};

    function ensureTrailingSlash(value) {
        return /\/$/.test(value) ? value : value + '/';
    }

    function detectBasePath() {
        if (global.__PIV20_BASE) return ensureTrailingSlash(global.__PIV20_BASE);

        if (global.document && global.document.querySelectorAll) {
            var scripts = global.document.querySelectorAll('script[src]');
            for (var i = 0; i < scripts.length; i += 1) {
                var src = scripts[i].getAttribute('src') || '';
                var marker = '/Extensibility/';
                var index = src.indexOf(marker);
                if (index >= 0) {
                    return src.slice(0, index + marker.length);
                }
            }
        }

        var pathname = (global.location && global.location.pathname) || '/PIVision/';
        var match = pathname.match(/^(\/[^/]+)\//);
        return (match ? match[1] : '/PIVision') + '/Extensibility/';
    }

    function isAbsoluteUrl(path) {
        return /^(https?:)?\/\//.test(path) || path.charAt(0) === '/';
    }

    function resolveUrl(path) {
        if (!path) return detectBasePath();
        if (isAbsoluteUrl(path)) return path;
        return ensureTrailingSlash(detectBasePath()) + path.replace(/^\/+/, '');
    }

    // ── Detect Promise availability (IE11 may lack it) ──
    var hasPromise = typeof Promise !== 'undefined';

    function ensureScript(path) {
        var url = resolveUrl(path);
        if (scriptCache[url]) return scriptCache[url];

        if (!hasPromise) {
            // Synchronous fallback — append script tag, no promise tracking
            try {
                var s = global.document.createElement('script');
                s.src = url; s.async = false;
                global.document.head.appendChild(s);
            } catch (_) {}
            scriptCache[url] = { then: function (cb) { if (cb) cb(url); return this; } };
            return scriptCache[url];
        }

        scriptCache[url] = new Promise(function (resolve, reject) {
            if (!global.document || !global.document.head) {
                reject(new Error('document.head not available'));
                return;
            }
            var script = global.document.createElement('script');
            script.src = url;
            script.async = false;
            script.onload = function () { resolve(url); };
            script.onerror = function () { reject(new Error('Failed to load script: ' + url)); };
            global.document.head.appendChild(script);
        });

        return scriptCache[url];
    }

    function ensureStyle(path) {
        var url = resolveUrl(path);
        if (styleCache[url]) return styleCache[url];

        if (!hasPromise) {
            try {
                var link = global.document.createElement('link');
                link.rel = 'stylesheet'; link.href = url;
                global.document.head.appendChild(link);
            } catch (_) {}
            styleCache[url] = { then: function (cb) { if (cb) cb(url); return this; } };
            return styleCache[url];
        }

        styleCache[url] = Promise.resolve().then(function () {
            if (!global.document || !global.document.head) {
                throw new Error('document.head not available');
            }
            var link = global.document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;
            global.document.head.appendChild(link);
            return url;
        });

        return styleCache[url];
    }

    function loadScripts(paths) {
        if (!hasPromise) {
            // Synchronous fallback chain
            (paths || []).forEach(function (path) { ensureScript(path); });
            return { then: function (cb) { if (cb) cb(); return this; } };
        }
        return (paths || []).reduce(function (chain, path) {
            return chain.then(function () {
                return ensureScript(path);
            });
        }, Promise.resolve());
    }

    PIV20.assets = PIV20.assets || {
        detectBasePath: detectBasePath,
        resolveUrl: resolveUrl,
        ensureScript: ensureScript,
        ensureStyle: ensureStyle,
        loadScripts: loadScripts
    };
    PIV20.core.assets = PIV20.assets;
})(typeof window !== 'undefined' ? window : globalThis);

/* Module: core/compliance.js */
(function (global) {
    'use strict';

    var PIV20 = global.PIV20 = global.PIV20 || {};

    // ── Documented DataShapes (AVEVA Extensibility Guide) ──
    var documentedDataShapes = {
        None: true,
        Value: true,
        Gauge: true,
        Trend: true,
        Table: true,
        TimeSeries: true
    };

    /**
     * Runtime assertion — throws on any compliance violation.
     * Called automatically by PIV20.symbol.defineBase().
     *
     * Enforces:
     *   - typeName required
     *   - displayName required
     *   - templateUrl required (file-based, no inline)
     *   - configTemplateUrl required
     *   - only documented DataShape values
     *   - no legacy configOptions array pattern
     *   - no display time mutation
     *   - no PIV10 references
     *   - no hardcoded /PIVision/ paths
     */
    function assertDefinition(definition) {
        if (!definition || !definition.typeName) {
            throw new Error('Symbol definition requires typeName');
        }
        var name = definition.typeName;

        if (!definition.displayName) {
            throw new Error(name + ' requires displayName');
        }
        if (!definition.templateUrl) {
            throw new Error(name + ' requires templateUrl');
        }
        if (!definition.configTemplateUrl) {
            throw new Error(name + ' requires configTemplateUrl');
        }
        if (definition.dataShape && !documentedDataShapes[definition.dataShape]) {
            throw new Error(name + ' uses undocumented dataShape: ' + definition.dataShape);
        }
        // AVEVA spec: configOptions MUST be a 4-param function (push pattern).
        // Block legacy array literal pattern (deprecated in PI Vision 2025).
        // Function pattern is the CORRECT current AVEVA approach.
        if (definition.configOptions && typeof definition.configOptions !== 'function') {
            throw new Error(name + ' configOptions must be a function (4-param push pattern), not ' + typeof definition.configOptions);
        }
        if (definition.mutatesDisplayTime) {
            // Allow with explicit compliance justification (e.g. QA12 bidirectional sync)
            var justify = definition.compliance && definition.compliance.mutatesDisplayTime;
            if (!justify) {
                throw new Error(name + ' must not mutate PI Vision display time (add compliance.mutatesDisplayTime to override)');
            }
        }
        if (/PIV10/i.test(name)) {
            throw new Error(name + ' contains PIV10 reference — use PIV20');
        }
        if (definition.templateUrl && /\/PIVision\//.test(definition.templateUrl)) {
            throw new Error(name + ' templateUrl has hardcoded /PIVision/ — use relative path');
        }
        if (definition.templateHtml) {
            throw new Error(name + ' uses inline templateHtml — use file-based templateUrl');
        }
    }

    /**
     * Build-time source scanner.
     * Scans raw JS/HTML source for compliance violations.
     *
     * @param {string} source — file contents
     * @param {string} [fileName] — for error messages
     * @returns {string[]} list of issues (empty = clean)
     */
    function scanSource(source, fileName) {
        var issues = [];
        var fn = fileName || '(source)';
        if (!source || typeof source !== 'string') return issues;

        if (/\bPIV10\b/i.test(source)) {
            issues.push(fn + ': contains PIV10 reference');
        }
        if (/\.setDisplayTime\s*\(/.test(source)) {
            issues.push(fn + ': uses deprecated setDisplayTime()');
        }
        if (/configOptions\s*:\s*\[/.test(source)) {
            issues.push(fn + ': configOptions is array literal — must use 4-param push or omit');
        }
        if (/\.html$/i.test(fn) && /<script[\s>]/i.test(source)) {
            var loaderHits = (source.match(/__MU20_BASE|loadNext|loadScripts/g) || []).length;
            if (loaderHits === 0) {
                issues.push(fn + ': contains inline <script> — move to external .js');
            }
        }
        var hardcoded = source.match(/['"][^'"]*\/PIVision\/[^'"]*['"]/g);
        if (hardcoded && hardcoded.length) {
            issues.push(fn + ': ' + hardcoded.length + ' hardcoded /PIVision/ path(s)');
        }
        if (/document\.write\s*\(/.test(source)) {
            issues.push(fn + ': uses document.write() — SPA-unsafe');
        }
        var shapeMatch = source.match(/dataShape\s*:\s*['"]([^'"]+)['"]/g);
        if (shapeMatch) {
            for (var i = 0; i < shapeMatch.length; i++) {
                var val = shapeMatch[i].replace(/.*['"]([^'"]+)['"].*/, '$1');
                if (!documentedDataShapes[val]) {
                    issues.push(fn + ': undocumented dataShape "' + val + '"');
                }
            }
        }
        return issues;
    }

    PIV20.compliance = PIV20.compliance || {
        documentedDataShapes: documentedDataShapes,
        assertDefinition: assertDefinition,
        scanSource: scanSource
    };
    PIV20.core.compliance = PIV20.compliance;
})(typeof window !== 'undefined' ? window : globalThis);

/* Module: core/plugin-host.js */
(function (global) {
    'use strict';

    var PIV20 = global.PIV20 = global.PIV20 || {};

    function noopHandle() {
        return {
            destroy: PIV20.noop,
            updateOptions: PIV20.noop
        };
    }

    function toElement(target) {
        if (!target) return null;
        if (target.jquery) return target[0];
        return target.nodeType ? target : null;
    }

    function mountJQueryPlugin(target, widgetName, options, label) {
        var $ = global.jQuery;
        var element = toElement(target);

        if (!$ || !element) {
            PIV20.shield.log('pluginHost', label || widgetName, new Error('jQuery target not available'));
            return noopHandle();
        }

        var $root = $(element);
        if (typeof $root[widgetName] !== 'function') {
            PIV20.shield.log('pluginHost', label || widgetName, new Error('Plugin not registered'));
            return noopHandle();
        }

        try {
            $root[widgetName](options || {});
        } catch (error) {
            PIV20.shield.log('pluginHost', label || widgetName, error);
            return noopHandle();
        }

        return {
            destroy: function () {
                try {
                    $root[widgetName]('destroy');
                } catch (error) {
                    PIV20.shield.log('pluginHost', (label || widgetName) + ':destroy', error);
                }
            },
            updateOptions: function (nextOptions) {
                try {
                    $root[widgetName]('option', nextOptions || {});
                } catch (error) {
                    PIV20.shield.log('pluginHost', (label || widgetName) + ':option', error);
                }
            }
        };
    }

    function mountClassPlugin(Cls, containerEl, options, label) {
        if (typeof Cls !== 'function') {
            PIV20.shield.log('pluginHost', label || 'classPlugin', new Error('Plugin class missing'));
            return noopHandle();
        }

        try {
            var instance = new Cls(containerEl, options || {});
            return {
                destroy: function () {
                    if (instance && typeof instance.destroy === 'function') {
                        instance.destroy();
                    }
                },
                updateOptions: function (nextOptions) {
                    if (instance && typeof instance.update === 'function') {
                        instance.update(nextOptions || {});
                    }
                },
                instance: instance
            };
        } catch (error) {
            PIV20.shield.log('pluginHost', label || 'classPlugin', error);
            return noopHandle();
        }
    }

    PIV20.pluginHost = PIV20.pluginHost || {
        mountJQueryPlugin: mountJQueryPlugin,
        mountClassPlugin: mountClassPlugin
    };
    PIV20.safeWidget = PIV20.safeWidget || function (rootEl, widgetName, options) {
        return mountJQueryPlugin(rootEl, widgetName, options, widgetName);
    };
    PIV20.core.pluginHost = PIV20.pluginHost;
})(typeof window !== 'undefined' ? window : globalThis);

/* Module: core/symbol.js */
(function (global) {
    'use strict';

    var PIV20 = global.PIV20 = global.PIV20 || {};

    /**
     * Create the context object passed to all lifecycle hooks.
     * Developer's pattern — enriched context as DI container.
     */
    function createContext(kind, definition, scope, elem, visObject) {
        var cleanup = PIV20.createCleanup();
        var rootEl = elem && elem[0] ? elem[0] : elem;
        var defaults = typeof definition.getDefaultConfig === 'function'
            ? definition.getDefaultConfig()
            : (definition.defaultConfig || {});

        if (scope) {
            scope.config = PIV20.config.mergeDefaults(defaults, scope.config || {});
        }

        return {
            kind:       kind,
            typeName:   definition.typeName,
            definition: definition,
            scope:      scope,
            elem:       elem,
            rootEl:     rootEl,
            visObject:  visObject,
            config:     scope ? scope.config : PIV20.config.mergeDefaults(defaults, {}),
            bus:        PIV20.createBus(),
            cleanup:    cleanup,
            assets:     PIV20.assets,
            pluginHost: PIV20.pluginHost,
            ui:         PIV20.ui,
            api:        PIV20.api,
            logger:     PIV20.shield,
            safeApply:  function () { PIV20.safeApply(scope); }
        };
    }

    /**
     * Central registration — shared by visual.define, composite.define, perf.define.
     *
     * @param {string} kind — 'visual' | 'composite' | 'perf'
     * @param {Object} definition — symbol definition
     * @param {Object} [strategy] — { extendContext: function(ctx, def) }
     * @returns {Object} registration result
     */
    function registerDefinition(kind, definition, strategy) {
        var PV = global.PIVisualization;
        strategy = strategy || {};

        // Fail-fast compliance check
        PIV20.compliance.assertDefinition(definition);

        if (!PV || !PV.deriveVisualizationFromBase || !PV.symbolCatalog || !PV.symbolCatalog.register) {
            PIV20.shield.log('symbol', 'defineBase',
                new Error('PIVisualization not available — definition queued: ' + definition.typeName));
            return { registered: false, kind: kind, definition: definition };
        }

        var typeName = definition.typeName;

        // ── Build visualization constructor ──
        function SymbolVis() {}
        PV.deriveVisualizationFromBase(SymbolVis);

        SymbolVis.prototype.init = function (scope, elem) {
            var visObject = this;
            var context = createContext(kind, definition, scope, elem, visObject);

            // R41: AVEVA inject support — capture injected services as extra init args
            // AVEVA spec: inject: ['svcName'] → init(scope, element, svcName)
            // Services arrive as arguments beyond (scope, elem).
            if (arguments.length > 2) {
                context.injected = [];
                for (var _ai = 2; _ai < arguments.length; _ai++) {
                    context.injected.push(arguments[_ai]);
                }
            }
            visObject._piv20 = context;

            // Layer-specific context extension (composite adds panels/store, perf adds shadow/worker)
            if (typeof strategy.extendContext === 'function') {
                strategy.extendContext(context, definition);
            }

            // ── Bind lifecycle hooks ──
            if (typeof definition.onDataUpdate === 'function') {
                visObject.onDataUpdate = function (data) {
                    try {
                        // AVEVA spec: skip entire update if IsGood === false
                        // (applies to Value DataShape; Table/TimeSeries filter per-row)
                        if (data && data.IsGood === false) {
                            PIV20.shield.log(typeName, 'onDataUpdate',
                                'Data quality bad: ' + (data.ErrorDescription || 'unknown'));
                            return;
                        }
                        return definition.onDataUpdate(data, context);
                    } catch (e) {
                        PIV20.shield.log(typeName, 'onDataUpdate', e);
                    }
                };
            }

            if (typeof definition.onConfigChange === 'function') {
                // AVEVA spec: PI Vision calls onConfigChange(newConfig, oldConfig)
                visObject.onConfigChange = function (newConfig, oldConfig) {
                    try {
                        context.config = PIV20.config.mergeDefaults(context.config, newConfig || {});
                        if (context.scope) context.scope.config = context.config;
                        context.bus.emit('config:changed', context.config);
                        return definition.onConfigChange(newConfig, oldConfig, context);
                    } catch (e) {
                        PIV20.shield.log(typeName, 'onConfigChange', e);
                    }
                };
            }

            if (typeof definition.onResize === 'function') {
                visObject.onResize = function (width, height) {
                    try {
                        return definition.onResize({ width: width, height: height }, context);
                    } catch (e) {
                        PIV20.shield.log(typeName, 'onResize', e);
                    }
                };
            }

            // ── AngularJS config deep-watch (PI Vision uses $scope) ──
            if (scope && scope.$watch && context.bus) {
                var unwConfig = scope.$watch('config', function (nv, ov) {
                    if (nv === ov) return;
                    context.config = nv;
                    context.bus.emit('config:changed', nv);
                }, true);
                context.cleanup.add(unwConfig);
            }

            // ── $destroy wiring ──
            PIV20.destroyHelper(scope, function () {
                // Mirror AngularJS $$destroyed on context so ctx.$$destroyed guards work
                context.$$destroyed = true;
                try {
                    if (typeof definition.destroy === 'function') {
                        definition.destroy(context);
                    }
                } finally {
                    context.cleanup.destroy();
                    context.bus.clear();
                }
            });

            // ── User init hook ──
            if (typeof definition.init === 'function') {
                try {
                    definition.init(context);
                } catch (e) {
                    PIV20.shield.log(typeName, 'init', e);
                }
            }
        };

        // ── Resolve template paths ──
        var basePath = PIV20.assets ? PIV20.assets.resolveUrl('') : '';
        var templateUrl = definition.templateUrl;
        var configTemplateUrl = definition.configTemplateUrl;

        // ── AVEVA-compliant registration ──
        var configTitle = definition.configTitle || 'Format Symbol';
        var registration = {
            typeName:           typeName,
            displayName:        definition.displayName,
            visObjectType:      SymbolVis,
            datasourceBehavior: definition.datasourceBehavior,
            DataShape:          definition.dataShape,
            iconUrl:            definition.iconUrl,
            templateUrl:        templateUrl,
            configTemplateUrl:  configTemplateUrl,
            configTitle:        configTitle,

            // AVEVA: configOptions 4-param push pattern
            // Delegates to definition.configOptions if defined, with fallback
            configOptions: function (context, clickedElement, monitorOptions, layoutOptions) {
                if (typeof definition.configOptions === 'function') {
                    // Call the symbol's configOptions — supports both patterns:
                    // 1. AVEVA 4-param push pattern (pushes directly to layoutOptions)
                    // 2. Return-array pattern (returns array of option objects)
                    var result = definition.configOptions(context, clickedElement, monitorOptions, layoutOptions);
                    if (result && result.length) {
                        for (var i = 0; i < result.length; i++) {
                            layoutOptions.push(result[i]);
                        }
                    }
                } else {
                    layoutOptions.push({ title: configTitle, mode: 'format' });
                }
            },

            getDefaultConfig: definition.getDefaultConfig || function () { return {}; },

            // AVEVA spec: loadConfig returns true → PI Vision merges saved
            // config with getDefaultConfig(), ensuring new defaults are applied
            // to symbols saved before the default was added.
            loadConfig: function () { return true; }
        };

        // ── AVEVA optional properties pass-through ──
        // Safety fallback: forward any AVEVA-documented optional properties
        // that symbols may define, so they aren't silently dropped.
        // List from AVEVA Extensibility Guide (PI Vision 2025).
        var avevaOptionalProps = [
            'category', 'supportsCollections', 'supportsDynamicSearchCriteria',
            'inject', 'resizerMode', 'StateVariables', 'symbolFamily',
            'formatMap', 'themes', 'noExpandSelector', 'configure', 'configInit'
        ];
        for (var p = 0; p < avevaOptionalProps.length; p++) {
            var propName = avevaOptionalProps[p];
            if (definition[propName] !== undefined) {
                registration[propName] = definition[propName];
            }
        }

        PV.symbolCatalog.register(registration);

        return {
            registered:   true,
            kind:         kind,
            definition:   definition,
            registration: registration
        };
    }

    PIV20.symbol = PIV20.symbol || {
        createContext: createContext,
        defineBase: registerDefinition
    };
    PIV20.core.symbol = PIV20.symbol;
})(typeof window !== 'undefined' ? window : globalThis);

/* Module: visual/define-visual-symbol.js */
(function (global) {
    'use strict';

    var PIV20 = global.PIV20 = global.PIV20 || {};

    PIV20.visual = PIV20.visual || {};

    /**
     * AVEVA-compatible enums.
     * Mirrors PV.Extensibility.Enums.DatasourceBehaviors from
     * PIVisualization.enumerations.js (AVEVA Extensibility Guide).
     * Symbols use PIV20.visual.enums.DatasourceBehaviors.{None|Single|Multiple}
     * instead of the legacy PV.Extensibility.Enums path.
     */
    PIV20.visual.enums = PIV20.visual.enums || {};
    PIV20.visual.enums.DatasourceBehaviors = PIV20.visual.enums.DatasourceBehaviors || {
        None:     0,
        Single:   1,
        Multiple: 2
    };

    /**
     * Define a visual (simple) symbol.
     * Delegates to PIV20.symbol.defineBase('visual', definition).
     * No extra context extension — pure AVEVA lifecycle.
     */
    PIV20.visual.define = function (definition) {
        return PIV20.symbol.defineBase('visual', definition);
    };
})(typeof window !== 'undefined' ? window : globalThis);

/* Module: composite/define-composite-symbol.js */
(function (global) {
    'use strict';

    var PIV20 = global.PIV20 = global.PIV20 || {};

    /**
     * Composite-level store — mini-Redux with getState/setState/subscribe.
     * Used by orchestrator symbols (mugmon20, mugmoni20, mugult20, maindash20).
     */
    function createStore(initialState) {
        var state = PIV20.config.clone(initialState || {});
        var listeners = [];

        function notify() {
            listeners.slice().forEach(function (listener) {
                try { listener(state); } catch (_) {}
            });
        }

        return {
            getState: function () {
                return PIV20.config.clone(state);
            },
            setState: function (patch) {
                state = PIV20.config.mergeDefaults(state, patch || {});
                notify();
            },
            subscribe: function (listener) {
                listeners.push(listener);
                return function unsubscribe() {
                    listeners = listeners.filter(function (entry) {
                        return entry !== listener;
                    });
                };
            }
        };
    }

    PIV20.composite = PIV20.composite || {};
    PIV20.composite.createStore = PIV20.composite.createStore || createStore;

    /**
     * Define a composite (orchestrator) symbol.
     * Extends context with: panels, activePanel, store, switchPanel, mountPanel.
     */
    PIV20.composite.define = function (definition) {
        return PIV20.symbol.defineBase('composite', definition, {
            extendContext: function (context, def) {
                var panels = (def.panels || []).slice();
                var initialPanel = context.config.ActivePanel
                    || (panels[0] && panels[0].id)
                    || null;

                context.panels = panels;
                context.activePanel = initialPanel;

                // Store — user-provided or default
                context.store = typeof def.createStore === 'function'
                    ? def.createStore(context)
                    : createStore({ activePanel: initialPanel });

                // Panel switching
                context.switchPanel = function (panelId) {
                    context.activePanel = panelId;
                    if (context.scope && context.scope.config) {
                        context.scope.config.ActivePanel = panelId;
                    }
                    if (context.store && typeof context.store.setState === 'function') {
                        context.store.setState({ activePanel: panelId });
                    }
                    context.bus.emit('panel:changed', { panelId: panelId });
                    PIV20.safeApply(context.scope);
                };

                // Lazy panel mount helper
                context.mountPanel = function (panelId, container, options) {
                    var panelDef = null;
                    for (var i = 0; i < panels.length; i++) {
                        if (panels[i].id === panelId) { panelDef = panels[i]; break; }
                    }
                    if (!panelDef) return null;

                    var moduleDef = PIV20.composite._panels
                        ? PIV20.composite._panels[panelDef.module || panelId]
                        : null;

                    if (moduleDef && moduleDef.mount) {
                        return moduleDef.mount({
                            container: container || context.rootEl,
                            bus:       context.bus,
                            config:    context.config,
                            store:     context.store,
                            panelId:   panelId,
                            typeName:  context.typeName
                        });
                    }
                    return null;
                };
            }
        });
    };

    // ── Panel registry (internal modules register here) ──
    PIV20.composite._panels = PIV20.composite._panels || {};

    /**
     * Register an internal panel module.
     * @param {string} moduleId
     * @param {Object} def — { mount, updateData, updateConfig, resize, destroy }
     */
    PIV20.composite.registerPanel = function (moduleId, def) {
        if (moduleId && def) {
            PIV20.composite._panels[moduleId] = def;
        }
    };

})(typeof window !== 'undefined' ? window : globalThis);

/* Module: perf/define-perf-symbol.js */
(function (global) {
    'use strict';

    var PIV20 = global.PIV20 = global.PIV20 || {};

    function attachShadow(rootEl, options) {
        if (!rootEl || typeof rootEl.attachShadow !== 'function') return rootEl;
        return rootEl.attachShadow(options || { mode: 'open' });
    }

    function createWorker(path, cleanup) {
        if (typeof global.Worker !== 'function') {
            throw new Error('Worker API not available');
        }
        var url = PIV20.assets ? PIV20.assets.resolveUrl(path) : path;
        var worker = new global.Worker(url);
        if (cleanup) cleanup.worker(worker);
        return worker;
    }

    /**
     * Create a HiDPI canvas host.
     * @param {HTMLElement} container
     * @param {Object} [opts] — { width, height }
     * @returns {Object} — { canvas, ctx2d, resize, clear, destroy }
     */
    function createCanvas(container, opts) {
        opts = opts || {};
        var canvas = global.document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        container.appendChild(canvas);

        var ctx2d = canvas.getContext('2d');
        var dpr = global.devicePixelRatio || 1;

        function resize(w, h) {
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
            ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        if (opts.width && opts.height) resize(opts.width, opts.height);

        return {
            canvas: canvas,
            ctx2d: ctx2d,
            resize: resize,
            clear: function () { ctx2d.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr); },
            destroy: function () {
                if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
            }
        };
    }

    PIV20.perf = PIV20.perf || {};
    PIV20.perf.attachShadow = PIV20.perf.attachShadow || attachShadow;
    PIV20.perf.createWorker = PIV20.perf.createWorker || createWorker;
    PIV20.perf.createCanvas = PIV20.perf.createCanvas || createCanvas;

    /**
     * Define a high-performance symbol (WOW family).
     * Extends context with attachShadow() and createWorker().
     */
    PIV20.perf.define = function (definition) {
        return PIV20.symbol.defineBase('perf', definition, {
            extendContext: function (context) {
                context.attachShadow = function (rootEl, options) {
                    return attachShadow(rootEl || context.rootEl, options);
                };
                context.createWorker = function (path) {
                    return createWorker(path, context.cleanup);
                };
                context.createCanvas = function (container, opts) {
                    var host = createCanvas(container || context.rootEl, opts);
                    context.cleanup.add(host.destroy);
                    return host;
                };
            }
        });
    };
})(typeof window !== 'undefined' ? window : globalThis);

/* Module: plugins/domain-data.js */
/**
 * ═══════════════════════════════════════════════════════
 *  PIV20.Core.DomainData — Israeli Power Grid Domain Data
 * ═══════════════════════════════════════════════════════
 *  SITES array (15 plants, 37 units), status labels,
 *  report templates, grouping options, Hebrew months,
 *  report columns.
 *
 *  Previously duplicated in MM20 and MU20 cores.
 *  Now centralized in PIV20 — compat shims proxy to MM20/MU20.
 *  ES5 only.
 * ═══════════════════════════════════════════════════════
 */
(function (PIV20) {
    'use strict';

    if (!PIV20) return;

    // ── 15 Plants, 37 Units ──────────────────────────────

    PIV20.SITES = [
        { id: 'orot',       name: '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF',           region: '\u05DE\u05E8\u05DB\u05D6', fuel: '\u05E4\u05D7\u05DD',       units: ['\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF 1', '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF 2', '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF 3', '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF 4', '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF 5', '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF 6', '\u05E1\u05D9\u05DC\u05D5\u05E0\u05D9\u05EA'] },
        { id: 'rtnb',       name: '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2',                       region: '\u05D3\u05E8\u05D5\u05DD', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2 1', '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2 2', '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2 3', '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2 4'] },
        { id: 'eilat',      name: '\u05D0\u05D9\u05DC\u05EA',                                         region: '\u05D3\u05E8\u05D5\u05DD', fuel: '\u05D3\u05D9\u05D6\u05DC',             units: ['\u05D0\u05D9\u05DC\u05EA 1', '\u05D0\u05D9\u05DC\u05EA 2', '\u05D0\u05D9\u05DC\u05EA 3'] },
        { id: 'eitan',      name: '\u05D0\u05D9\u05EA\u05DF',                                         region: '\u05DE\u05E8\u05DB\u05D6', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D0\u05D9\u05EA\u05DF 1'] },
        { id: 'alon',       name: '\u05D0\u05DC\u05D5\u05DF \u05EA\u05D1\u05D5\u05E8',                 region: '\u05E6\u05E4\u05D5\u05DF', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D9\u05D7 1', '\u05D9\u05D7 2', '\u05D9\u05D7 6', '\u05D9\u05D7 7'] },
        { id: 'eshkol',     name: '\u05D0\u05E9\u05DB\u05D5\u05DC',                                   region: '\u05D3\u05E8\u05D5\u05DD', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D0\u05E9\u05DB\u05D5\u05DC 6', '\u05D0\u05E9\u05DB\u05D5\u05DC 7', '\u05D0\u05E9\u05DB\u05D5\u05DC 8', '\u05D0\u05E9\u05DB\u05D5\u05DC 9'] },
        { id: 'egel',       name: '\u05D0\u05EA\u05D2\u05DC',                                         region: '\u05DE\u05E8\u05DB\u05D6', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D0\u05EA\u05D2\u05DC 1'] },
        { id: 'hartov',     name: '\u05D4\u05E8-\u05D8\u05D5\u05D1',                                   region: '\u05DE\u05E8\u05DB\u05D6', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D4\u05E8-\u05D8\u05D5\u05D1 1'] },
        { id: 'hagit',      name: '\u05D7\u05D2\u05D9\u05EA',                                         region: '\u05E6\u05E4\u05D5\u05DF', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D7\u05D2\u05D9\u05EA 1', '\u05D7\u05D2\u05D9\u05EA 2'] },
        { id: 'reading',    name: '\u05E8\u05D3\u05D9\u05E0\u05D2',                                   region: '\u05DE\u05E8\u05DB\u05D6', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05E8\u05D3\u05D9\u05E0\u05D2 1', '\u05E8\u05D3\u05D9\u05E0\u05D2 2'] },
        { id: 'gezer',      name: '\u05D2\u05D6\u05E8',                                               region: '\u05DE\u05E8\u05DB\u05D6', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D2\u05D6\u05E8 1'] },
        { id: 'opc_rotem',  name: 'OPC \u05E8\u05D5\u05EA\u05DD',                                     region: '\u05D3\u05E8\u05D5\u05DD', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05E8\u05D5\u05EA\u05DD 1', '\u05E8\u05D5\u05EA\u05DD 2'] },
        { id: 'opc_hadera', name: 'OPC \u05D7\u05D3\u05E8\u05D4',                                     region: '\u05E6\u05E4\u05D5\u05DF', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D7\u05D3\u05E8\u05D4 1'] },
        { id: 'dorad',      name: '\u05D3\u05D5\u05E8\u05D3',                                         region: '\u05D3\u05E8\u05D5\u05DD', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D3\u05D5\u05E8\u05D3 1', '\u05D3\u05D5\u05E8\u05D3 2'] },
        { id: 'dalia',      name: '\u05D3\u05DC\u05D9\u05D4 \u05D0\u05E0\u05E8\u05D2\u05D9\u05D5\u05EA', region: '\u05E6\u05E4\u05D5\u05DF', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D3\u05DC\u05D9\u05D4 1'] }
    ];

    // ── Status Labels (Hebrew) ───────────────────────────

    PIV20.STATUS_LABELS = {
        critical:    '\u05E7\u05E8\u05D9\u05D8\u05D9',
        warn:        '\u05D0\u05D6\u05D4\u05E8\u05D4',
        ok:          '\u05EA\u05E7\u05D9\u05DF',
        off:         '\u05DB\u05D1\u05D5\u05D9',
        standby:     '\u05D4\u05DE\u05EA\u05E0\u05D4',
        maintenance: '\u05EA\u05D7\u05D6\u05D5\u05E7\u05D4'
    };

    // ── Report Templates ─────────────────────────────────

    PIV20.REPORT_TEMPLATES = [
        { id: 'monthly',          name: '\u05D3\u05D5\u05D7 \u05D7\u05D5\u05D3\u05E9\u05D9' },
        { id: 'critical',         name: '\u05D9\u05D7\u05D9\u05D3\u05D5\u05EA \u05E7\u05E8\u05D9\u05D8\u05D9\u05D5\u05EA' },
        { id: 'annual',           name: '\u05D3\u05D5\u05D7 \u05E9\u05E0\u05EA\u05D9' },
        { id: 'guard',            name: '\u05DE\u05E9\u05DE\u05E8\u05D5\u05EA' },
        { id: 'custom',           name: '\u05DE\u05D5\u05EA\u05D0\u05DD \u05D0\u05D9\u05E9\u05D9\u05EA' },
        { id: 'monthlyBreakdown', name: '\u05E4\u05D9\u05E8\u05D5\u05D8 \u05D7\u05D5\u05D3\u05E9\u05D9' },
        { id: 'yoy',              name: '\u05D4\u05E9\u05D5\u05D5\u05D0\u05D4 \u05E9\u05E0\u05EA\u05D9\u05EA' },
        { id: 'daily',            name: '\u05E1\u05D9\u05DB\u05D5\u05DD \u05D9\u05D5\u05DE\u05D9' },
        { id: 'weekly',           name: '\u05E1\u05D9\u05DB\u05D5\u05DD \u05E9\u05D1\u05D5\u05E2\u05D9' },
        { id: 'fuel',             name: '\u05EA\u05DE\u05D4\u05D9\u05DC \u05D3\u05DC\u05E7' },
        { id: 'n1contingency',    name: 'N-1 \u05D2\u05D9\u05D1\u05D5\u05D9' }
    ];

    // ── Grouping Options ─────────────────────────────────

    PIV20.GROUPING_OPTIONS = [
        { id: 'site',   name: '\u05DC\u05E4\u05D9 \u05D0\u05EA\u05E8' },
        { id: 'status', name: '\u05DC\u05E4\u05D9 \u05E1\u05D8\u05D8\u05D5\u05E1' },
        { id: 'fuel',   name: '\u05DC\u05E4\u05D9 \u05D3\u05DC\u05E7' },
        { id: 'region', name: '\u05DC\u05E4\u05D9 \u05D0\u05D6\u05D5\u05E8' }
    ];

    // ── Hebrew Months ────────────────────────────────────

    PIV20.MONTHS_HE = [
        '\u05D9\u05E0\u05D5\u05D0\u05E8', '\u05E4\u05D1\u05E8\u05D5\u05D0\u05E8', '\u05DE\u05E8\u05E5',
        '\u05D0\u05E4\u05E8\u05D9\u05DC', '\u05DE\u05D0\u05D9', '\u05D9\u05D5\u05E0\u05D9',
        '\u05D9\u05D5\u05DC\u05D9', '\u05D0\u05D5\u05D2\u05D5\u05E1\u05D8', '\u05E1\u05E4\u05D8\u05DE\u05D1\u05E8',
        '\u05D0\u05D5\u05E7\u05D8\u05D5\u05D1\u05E8', '\u05E0\u05D5\u05D1\u05DE\u05D1\u05E8', '\u05D3\u05E6\u05DE\u05D1\u05E8'
    ];

    // ── Report Column Definitions ────────────────────────

    PIV20.REPORT_COLS = [
        { id: 'site',    label: '\u05D0\u05EA\u05E8',              def: true  },
        { id: 'unit',    label: '\u05D9\u05D7\u05D9\u05D3\u05D4',  def: true  },
        { id: 'status',  label: '\u05E1\u05D8\u05D8\u05D5\u05E1',  def: true  },
        { id: 'hours',   label: '\u05E9\u05E2\u05D5\u05EA',        def: true  },
        { id: 'quota',   label: '\u05DE\u05DB\u05E1\u05D4',        def: true  },
        { id: 'pct',     label: '% \u05E0\u05D9\u05E6\u05D5\u05DC', def: true  },
        { id: 'fuel',    label: '\u05D3\u05DC\u05E7',              def: false },
        { id: 'region',  label: '\u05D0\u05D6\u05D5\u05E8',        def: false },
        { id: 'totalLY', label: '\u05E9\u05E0\u05D4 \u05E7\u05D5\u05D3\u05DE\u05EA', def: false },
        { id: 'diff',    label: '\u05D4\u05E4\u05E8\u05E9',        def: false },
        { id: 'diffPct', label: '\u05D4\u05E4\u05E8\u05E9 %',      def: false },
        { id: 'rate',    label: '\u05E7\u05E6\u05D1 \u05D9\u05D5\u05DE\u05D9', def: false },
        { id: 'monthly', label: '\u05D7\u05D5\u05D3\u05E9\u05D9\u05DD', def: false }
    ];

})(typeof window !== 'undefined' ? window.PIV20 : undefined);

/* Module: plugins/api.js */
(function (global) {
    'use strict';

    var PIV20 = global.PIV20 = global.PIV20 || {};

    /**
     * PI Web API client — lightweight, CSRF-aware, retry-on-401.
     * Mounted at PIV20.api.piwebapi.
     *
     * Usage:
     *   var api = new PIV20.api.PIWebAPI({ baseUrl: '/piwebapi/' });
     *   api.getServers().then(function(servers) { ... });
     */
    function PIWebAPI(options) {
        options = options || {};
        this.baseUrl = (options.baseUrl || '/piwebapi/').replace(/\/$/, '');
        this._csrf = null;
    }

    PIWebAPI.prototype._request = function (method, path, body) {
        var self = this;
        var url = this.baseUrl + path;

        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            xhr.withCredentials = true;
            xhr.setRequestHeader('Content-Type', 'application/json');
            if (self._csrf) {
                xhr.setRequestHeader('X-CSRF-TOKEN', self._csrf);
            }

            xhr.onload = function () {
                // Capture CSRF token from response
                var csrf = xhr.getResponseHeader('X-CSRF-TOKEN');
                if (csrf) self._csrf = csrf;

                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (_) {
                        resolve(xhr.responseText);
                    }
                } else if (xhr.status === 401 && !xhr._retried) {
                    // Retry once on 401
                    xhr._retried = true;
                    self._request(method, path, body).then(resolve, reject);
                } else {
                    reject(new Error('PI Web API ' + xhr.status + ': ' + url));
                }
            };

            xhr.onerror = function () {
                reject(new Error('PI Web API network error: ' + url));
            };

            xhr.send(body ? JSON.stringify(body) : null);
        });
    };

    PIWebAPI.prototype.get = function (path) { return this._request('GET', path); };
    PIWebAPI.prototype.post = function (path, body) { return this._request('POST', path, body); };

    // ── Convenience methods ──
    PIWebAPI.prototype.getServers = function () { return this.get('/dataservers'); };
    PIWebAPI.prototype.getDatabases = function () { return this.get('/assetservers'); };
    PIWebAPI.prototype.getByPath = function (path) { return this.get('/attributes?path=' + encodeURIComponent(path)); };
    PIWebAPI.prototype.getStreamValue = function (webId) { return this.get('/streams/' + webId + '/value'); };
    PIWebAPI.prototype.getRecorded = function (webId, params) {
        var qs = params ? '?' + Object.keys(params).map(function (k) {
            return k + '=' + encodeURIComponent(params[k]);
        }).join('&') : '';
        return this.get('/streams/' + webId + '/recorded' + qs);
    };
    PIWebAPI.prototype.getInterpolated = function (webId, params) {
        var qs = params ? '?' + Object.keys(params).map(function (k) {
            return k + '=' + encodeURIComponent(params[k]);
        }).join('&') : '';
        return this.get('/streams/' + webId + '/interpolated' + qs);
    };
    PIWebAPI.prototype.searchElements = function (query) {
        return this.get('/search/query?q=' + encodeURIComponent(query));
    };
    PIWebAPI.prototype.getUserInfo = function () { return this.get('/system/userinfo'); };
    PIWebAPI.prototype.getSystem = function () { return this.get('/system'); };

    PIV20.api = PIV20.api || {};
    PIV20.api.PIWebAPI = PIWebAPI;
    PIV20.api.piwebapi = null; // Instantiated per-display by consumer

})(typeof window !== 'undefined' ? window : globalThis);

/* Module: ui/loading.js */
(function (global) {
    'use strict';

    var PIV20 = global.PIV20 = global.PIV20 || {};
    PIV20.ui = PIV20.ui || {};

    var CSS_INJECTED = false;
    var CSS =
        '.piv20-loading{display:flex;align-items:center;justify-content:center;' +
        'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,.85);z-index:100}' +
        '.piv20-loading-spin{width:32px;height:32px;border:3px solid #e0e0e0;' +
        'border-top-color:#1976d2;border-radius:50%;animation:piv20spin .8s linear infinite}' +
        '.piv20-loading-txt{margin-top:8px;font-size:13px;color:#666;font-family:Arial,sans-serif;direction:rtl}' +
        '@keyframes piv20spin{to{transform:rotate(360deg)}}';

    function injectCSS() {
        if (CSS_INJECTED || !global.document) return;
        CSS_INJECTED = true;
        var s = global.document.createElement('style');
        s.appendChild(global.document.createTextNode(CSS));
        global.document.head.appendChild(s);
    }

    PIV20.ui.loading = {
        show: function (container, text) {
            injectCSS();
            var el = global.document.createElement('div');
            el.className = 'piv20-loading';
            el.innerHTML = '<div style="text-align:center"><div class="piv20-loading-spin"></div>' +
                '<div class="piv20-loading-txt">' + (text || '\u05D8\u05D5\u05E2\u05DF...') + '</div></div>';
            container.style.position = container.style.position || 'relative';
            container.appendChild(el);
            return el;
        },
        hide: function (el) {
            if (el && el.parentNode) el.parentNode.removeChild(el);
        },
        auto: function (container, text) {
            var el = PIV20.ui.loading.show(container, text);
            var done = false;
            return function () { if (!done) { done = true; PIV20.ui.loading.hide(el); } };
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);

/* Module: ui/error-boundary.js */
(function (global) {
    'use strict';

    var PIV20 = global.PIV20 = global.PIV20 || {};
    PIV20.ui = PIV20.ui || {};

    var CSS_INJECTED = false;
    var CSS =
        '.piv20-err{display:flex;align-items:center;justify-content:center;' +
        'position:absolute;top:0;left:0;right:0;bottom:0;background:#fff8f8;' +
        'border:1px solid #e57373;border-radius:4px;font-family:Arial,sans-serif;direction:rtl;z-index:90}' +
        '.piv20-err-t{font-size:14px;font-weight:bold;color:#c62828;margin-bottom:4px}' +
        '.piv20-err-m{font-size:12px;color:#666;margin-bottom:8px;max-width:280px;overflow:hidden;' +
        'text-overflow:ellipsis;white-space:nowrap}' +
        '.piv20-err-btn{padding:4px 12px;font-size:12px;cursor:pointer;border:1px solid #c62828;' +
        'border-radius:3px;background:#fff;color:#c62828}.piv20-err-btn:hover{background:#ffebee}';

    function injectCSS() {
        if (CSS_INJECTED || !global.document) return;
        CSS_INJECTED = true;
        var s = global.document.createElement('style');
        s.appendChild(global.document.createTextNode(CSS));
        global.document.head.appendChild(s);
    }

    PIV20.ui.errorBoundary = {
        render: function (container, opts) {
            injectCSS();
            opts = opts || {};
            var msg = opts.error ? (opts.error.message || String(opts.error)).substring(0, 120) : '';
            var el = global.document.createElement('div');
            el.className = 'piv20-err';
            var html = '<div style="text-align:center">' +
                '<div style="font-size:28px;margin-bottom:6px">\u26A0\uFE0F</div>' +
                '<div class="piv20-err-t">\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E1\u05D9\u05DE\u05D1\u05D5\u05DC</div>';
            if (opts.typeName) html += '<div class="piv20-err-m">' + opts.typeName + '</div>';
            if (msg) html += '<div class="piv20-err-m">' + msg + '</div>';
            if (opts.retry) html += '<button class="piv20-err-btn">\u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1</button>';
            html += '</div>';
            el.innerHTML = html;
            if (opts.retry) {
                var btn = el.querySelector('.piv20-err-btn');
                if (btn) btn.onclick = function () {
                    if (el.parentNode) el.parentNode.removeChild(el);
                    try { opts.retry(); } catch (_) {}
                };
            }
            container.style.position = container.style.position || 'relative';
            container.appendChild(el);
            return el;
        },
        clear: function (el) {
            if (el && el.parentNode) el.parentNode.removeChild(el);
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);

/* Module: ui/empty-state.js */
(function (global) {
    'use strict';

    var PIV20 = global.PIV20 = global.PIV20 || {};
    PIV20.ui = PIV20.ui || {};

    var CSS_INJECTED = false;
    var CSS =
        '.piv20-empty{display:flex;align-items:center;justify-content:center;' +
        'position:absolute;top:0;left:0;right:0;bottom:0;background:#fafafa;' +
        'font-family:Arial,sans-serif;direction:rtl}' +
        '.piv20-empty-t{font-size:15px;font-weight:bold;color:#555;margin-bottom:4px}' +
        '.piv20-empty-m{font-size:13px;color:#888;max-width:260px;text-align:center}';

    function injectCSS() {
        if (CSS_INJECTED || !global.document) return;
        CSS_INJECTED = true;
        var s = global.document.createElement('style');
        s.appendChild(global.document.createTextNode(CSS));
        global.document.head.appendChild(s);
    }

    PIV20.ui.emptyState = {
        render: function (container, opts) {
            injectCSS();
            opts = opts || {};
            var el = global.document.createElement('div');
            el.className = 'piv20-empty';
            var html = '<div style="text-align:center">' +
                '<div style="font-size:36px;margin-bottom:8px;opacity:.6">' + (opts.icon || '\uD83D\uDCCA') + '</div>' +
                '<div class="piv20-empty-t">' + (opts.title || '\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD') + '</div>';
            if (opts.message) html += '<div class="piv20-empty-m">' + opts.message + '</div>';
            html += '</div>';
            el.innerHTML = html;
            container.style.position = container.style.position || 'relative';
            container.appendChild(el);
            return el;
        },
        clear: function (el) {
            if (el && el.parentNode) el.parentNode.removeChild(el);
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);

/* Module: compat/mm20-shim.js */
(function (global) {
    'use strict';

    var PIV20 = global.PIV20 = global.PIV20 || {};
    var MM20 = global.MM20 = global.MM20 || {};

    function toElement(target) {
        if (!target) return null;
        if (target.jquery) return target[0];
        return target.nodeType ? target : null;
    }

    // Core proxies
    MM20.basePath     = PIV20.assets ? PIV20.assets.detectBasePath() : '';
    MM20.resolveUrl   = PIV20.assets ? PIV20.assets.resolveUrl : function (p) { return p; };
    MM20.ensureScript = PIV20.assets ? PIV20.assets.ensureScript : PIV20.noop;
    MM20.ensureStyle  = PIV20.assets ? PIV20.assets.ensureStyle : PIV20.noop;
    MM20.loadScripts  = PIV20.assets ? PIV20.assets.loadScripts : PIV20.noop;
    MM20.createBus    = PIV20.createBus;
    MM20.destroyHelper = PIV20.destroyHelper;
    MM20.shield       = PIV20.shield;

    // Domain data proxies — symbols reference MM20.SITES etc.
    MM20.SITES         = PIV20.SITES || {};
    MM20.STATUS_LABELS = PIV20.STATUS_LABELS || {};
    MM20.REPORT_TEMPLATES  = PIV20.REPORT_TEMPLATES || {};
    MM20.GROUPING_OPTIONS  = PIV20.GROUPING_OPTIONS || {};
    MM20.MONTHS_HE         = PIV20.MONTHS_HE || [];
    MM20.REPORT_COLS       = PIV20.REPORT_COLS || {};

    // MM20.safeWidget signature: (rootEl, selector, widgetName, options, label)
    MM20.safeWidget = function (rootEl, selector, widgetName, options, label) {
        var host = toElement(rootEl);
        var mount = host && selector ? host.querySelector(selector) : host;
        return PIV20.pluginHost
            ? PIV20.pluginHost.mountJQueryPlugin(mount, widgetName, options, label || widgetName)
            : { destroy: PIV20.noop, updateOptions: PIV20.noop };
    };

    PIV20.compat = PIV20.compat || {};
    PIV20.compat.MM20 = MM20;
})(typeof window !== 'undefined' ? window : globalThis);

/* Module: compat/mu20-shim.js */
(function (global) {
    'use strict';

    var PIV20 = global.PIV20 = global.PIV20 || {};
    var MU20 = global.MU20 = global.MU20 || {};

    // Core proxies
    MU20.createBus     = PIV20.createBus;
    MU20.destroyHelper = PIV20.destroyHelper;
    MU20.shield        = PIV20.shield;
    MU20.xhrQueue      = MU20.xhrQueue || (PIV20.runtime ? PIV20.runtime.createQueue(4) : null);

    // Domain data proxies — symbols reference MU20.SITES etc.
    MU20.SITES         = PIV20.SITES || {};
    MU20.STATUS_LABELS = PIV20.STATUS_LABELS || {};
    MU20.REPORT_TEMPLATES  = PIV20.REPORT_TEMPLATES || {};
    MU20.GROUPING_OPTIONS  = PIV20.GROUPING_OPTIONS || {};
    MU20.MONTHS_HE         = PIV20.MONTHS_HE || [];
    MU20.REPORT_COLS       = PIV20.REPORT_COLS || {};

    // MU20.safePlugin signature: (Cls, shadowRoot, containerEl, options, bus, label)
    MU20.safePlugin = function (Cls, shadowRoot, containerEl, options, bus, label) {
        var host = containerEl || shadowRoot;
        var pluginOptions = PIV20.config
            ? PIV20.config.mergeDefaults({ bus: bus }, options || {})
            : Object.assign({ bus: bus }, options || {});
        return PIV20.pluginHost
            ? PIV20.pluginHost.mountClassPlugin(Cls, host, pluginOptions, label || 'mu20-plugin')
            : { destroy: PIV20.noop, updateOptions: PIV20.noop };
    };

    PIV20.compat = PIV20.compat || {};
    PIV20.compat.MU20 = MU20;
})(typeof window !== 'undefined' ? window : globalThis);
