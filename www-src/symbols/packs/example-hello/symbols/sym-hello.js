/* ================================================================
   sym-hello.js — minimal "Hello World" symbol
   ================================================================
   The smallest possible symbol that exercises the full Symbol
   Packs loading path (manifest → loader → file fetch → symbol
   registration → picker listing).

   Goals of this reference implementation:
     • Zero external dependencies — no charting libs, no Angular
       directives, no plugins. A symbol is ultimately a function
       that turns a config object into some DOM.
     • Complete, self-contained IIFE. Written in the same style
       as the built-in symbols (sym-gauge20.js etc.) so authors
       can copy-paste as a starting point.
     • Defensive: if `PIVisualization` isn't globally present
       (e.g. loaded out of order by a future build), the symbol
       logs a warning and exits cleanly instead of throwing.

   Runtime contract:
     1. The loader (emu-packs.loadSymbol) fetches this file with
        a <script> tag, which executes the IIFE below and calls
        `PIVisualization.symbolCatalog.register(...)`.
     2. When the user picks `hello` in the emulator picker, the
        emulator instantiates `symbolVis`, calls `init(scope, el)`
        with the element and the current config, and the symbol
        writes its own markup into `el`.
     3. If the user changes config (via the config panel the
        emulator builds from sym-hello-config.html), scope.config
        updates and the existing watchers re-render.
   ================================================================ */
(function (PV) {
    'use strict';

    // Bail out gracefully if the host page hasn't loaded the
    // PIVisualization catalog. This can happen during unit tests
    // or if a pack is mis-ordered relative to emu-shims.js.
    if (!PV || !PV.symbolCatalog || typeof PV.symbolCatalog.register !== 'function') {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[sym-hello] PIVisualization.symbolCatalog unavailable — registration skipped');
        }
        return;
    }

    var SYM_NAME = 'hello';

    /**
     * Symbol constructor. The emulator new()s one of these per
     * instance; `init` is called once with the scope + element.
     */
    function symbolVis() {}

    symbolVis.prototype.init = function (scope, elem) {
        // `elem` is a jQuery wrapper in the real PI Vision runtime
        // and the emulator matches that convention. Fall back to
        // the DOM element if jQuery is unavailable.
        var el = (elem && typeof elem.get === 'function') ? elem.get(0) : elem;
        if (!el) return;

        // Build the DOM via textContent + createElement so we
        // never interpolate untrusted config straight into
        // innerHTML. The stage-7 SafeDOM migration set this as
        // the baseline for every new symbol we ship.
        var wrapper = document.createElement('div');
        wrapper.className = 'sym-hello-wrapper';
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('aria-label', 'Hello World symbol');
        wrapper.style.cssText = [
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'width:100%',
            'height:100%',
            'box-sizing:border-box',
            'padding:16px',
            'font-family:system-ui, -apple-system, "Segoe UI", sans-serif',
            'background:#0c1425',
            'color:#e6f1ff',
            'border:1px solid #00b4d8',
            'border-radius:8px',
            'direction:rtl'
        ].join(';');

        var title = document.createElement('div');
        title.className = 'sym-hello-title';
        title.style.cssText = 'font-size:18px;font-weight:600;margin-bottom:8px';

        var message = document.createElement('div');
        message.className = 'sym-hello-message';
        message.style.cssText = 'font-size:14px;opacity:0.85';

        var stack = document.createElement('div');
        stack.style.cssText = 'text-align:center';
        stack.appendChild(title);
        stack.appendChild(message);
        wrapper.appendChild(stack);

        // Mount
        el.appendChild(wrapper);

        /** Re-render the text nodes when config changes. */
        function update() {
            var cfg = scope && scope.config ? scope.config : {};
            title.textContent = cfg.Title || 'Hello, World';
            message.textContent = cfg.Message || 'PI Vision Symbol Packs — dependency-free example';
        }

        // Initial paint
        update();

        // Watch the two config fields we care about. The emulator's
        // Angular-lite shim dispatches these scope.$watch calls
        // through SafeExpr — no dynamic code execution happens.
        if (scope && typeof scope.$watch === 'function') {
            scope.$watch('config.Title', update);
            scope.$watch('config.Message', update);
        }
    };

    // Registration — this is what makes the symbol discoverable
    // by the emulator after the pack loader finishes fetching
    // this file.
    PV.symbolCatalog.register({
        typeName: SYM_NAME,
        displayName: 'Hello World',
        datasourceBehavior:
            (PV.Extensibility && PV.Extensibility.Enums && PV.Extensibility.Enums.DatasourceBehaviors)
                ? PV.Extensibility.Enums.DatasourceBehaviors.None
                : 0,
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                Title: 'Hello, World',
                Message: 'PI Vision Symbol Packs — dependency-free example',
                Height: 180,
                Width: 360,
                BackgroundColor: '#0c1425',
                ForegroundColor: '#e6f1ff'
            };
        }
    });
})(typeof window !== 'undefined' ? window.PIVisualization : undefined);
