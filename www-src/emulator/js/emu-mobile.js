/**
 * emu-mobile.js — PI Vision Emulator Mobile Support R300
 * Hamburger menu, slide-out sidebar drawer, responsive behavior
 * R300: MM20 toolbar collapse, symbol count badge, category filter
 */
(function (window, $) {
    'use strict';

    var EMU_MOBILE = window.EMU_MOBILE = {};
    var MM20_ENABLED = !!(window.__PIV_MM20_ENABLED);
    var SYMBOL_COUNT = window.__PIV_SYMBOL_COUNT || 70;

    function _isMobile() {
        return window.innerWidth <= 768;
    }

    function _init() {
        // Add hamburger button to toolbar if not already present
        var $tb = $('#emu-toolbar');
        if (!$tb.find('#btn-hamburger').length) {
            $tb.prepend('<button id="btn-hamburger" class="toolbar-btn mobile-only" title="תפריט">☰</button>');
        }

        // Add overlay for mobile sidebar
        if (!$('#emu-sidebar-overlay').length) {
            $('body').append('<div id="emu-sidebar-overlay" class="sidebar-overlay"></div>');
        }

        // Hamburger click
        $(document).on('click', '#btn-hamburger', function () {
            _toggleSidebar();
        });

        // Overlay click closes sidebar
        $('#emu-sidebar-overlay').on('click', function () {
            _closeSidebar();
        });

        // Auto-close sidebar when symbol is selected on mobile
        $('#emu-sidebar').on('click', '.emu-sym-item', function () {
            if (_isMobile()) {
                setTimeout(_closeSidebar, 300);
            }
        });

        // R300: Collapse extra toolbar rows on mobile
        _initToolbarCollapse();

        // R300: Add MM20 category quick-filter for mobile
        _initMM20MobileFilter();

        // R300: Symbol count badge
        _initSymbolCountBadge();

        // Swipe support
        _initSwipe();

        // Apply responsive layout
        _applyLayout();
        $(window).on('resize', function () { _applyLayout(); });
    }

    /* =========================================================
     *  R300: TOOLBAR COLLAPSE FOR MOBILE
     *  Rows 6-7 (MM20 Integration, Tools & Export) collapse
     *  into a single expandable "עוד כלים" button on mobile
     * ========================================================= */
    function _initToolbarCollapse() {
        if (!_isMobile()) return;

        // Find toolbar rows 6 and 7 (MM20 + Tools)
        var $rows = $('.sf-toolbar-row');
        if ($rows.length < 2) return;

        // Hide rows 6+ on mobile, add toggle button
        $rows.each(function (i) {
            if (i >= 0) {
                $(this).addClass('mobile-collapsed-row').hide();
            }
        });

        // Add expand/collapse toggle after the last visible toolbar
        var $lastToolbar = $('#sf-toolbar-row-5, .sf-toolbar').last();
        if ($lastToolbar.length) {
            var $toggle = $('<button id="btn-toolbar-expand" class="toolbar-btn mobile-only sf-btn-mm20" ' +
                'style="width:100%;margin:2px 0;padding:6px;font-size:13px;border-radius:6px;">' +
                '▼ עוד כלים (MM20 + ייצוא) ▼</button>');
            $lastToolbar.after($toggle);

            var expanded = false;
            $toggle.on('click', function () {
                expanded = !expanded;
                if (expanded) {
                    $('.mobile-collapsed-row').slideDown(200);
                    $toggle.text('▲ הסתר כלים ▲');
                } else {
                    $('.mobile-collapsed-row').slideUp(200);
                    $toggle.text('▼ עוד כלים (MM20 + ייצוא) ▼');
                }
            });
        }
    }

    /* =========================================================
     *  R300: MM20 QUICK FILTER FOR MOBILE
     *  A floating pill that lets mobile users quickly filter
     *  between "הכל" / "MM20" / "Legacy" categories
     * ========================================================= */
    function _initMM20MobileFilter() {
        if (!_isMobile()) return;

        var $filter = $('<div id="mm20-mobile-filter" class="mm20-mobile-filter">' +
            '<button class="mm20-filter-btn active" data-filter="all">הכל (' + SYMBOL_COUNT + ')</button>' +
            '<button class="mm20-filter-btn" data-filter="mm20">MM20 (499)</button>' +
            '<button class="mm20-filter-btn" data-filter="legacy">Legacy (70)</button>' +
            '</div>');

        // Insert after sidebar header or at top of sidebar
        var $sidebarHeader = $('#emu-sidebar .sidebar-header, #emu-sidebar').first();
        if ($sidebarHeader.length) {
            $sidebarHeader.after($filter);
        }

        $(document).on('click', '.mm20-filter-btn', function () {
            var filter = $(this).data('filter');
            $('.mm20-filter-btn').removeClass('active');
            $(this).addClass('active');
            _applyMM20Filter(filter);
        });
    }

    function _applyMM20Filter(filter) {
        var $items = $('#emu-sidebar .emu-sym-item, #sf-folder-grid .sf-card');
        if (!$items.length) return;

        $items.each(function () {
            var $el = $(this);
            var type = $el.data('type') || $el.attr('data-type') || '';
            var show = true;

            if (filter === 'mm20') {
                show = (type === 'mm20');
            } else if (filter === 'legacy') {
                show = (type !== 'mm20');
            }
            // filter === 'all' shows everything

            if (show) {
                $el.removeClass('mm20-filtered-out').show();
            } else {
                $el.addClass('mm20-filtered-out').hide();
            }
        });

        // Update visible count
        var visible = $items.filter(':visible').length;
        $('#mm20-filter-count').text(visible + ' סמלים');
    }

    /* =========================================================
     *  R300: SYMBOL COUNT BADGE
     *  Shows total symbol count as a badge on the hamburger menu
     * ========================================================= */
    function _initSymbolCountBadge() {
        var $hamburger = $('#btn-hamburger');
        if (!$hamburger.length) return;

        if (!$hamburger.find('.symbol-count-badge').length) {
            $hamburger.css('position', 'relative');
            $hamburger.append('<span class="symbol-count-badge">' + SYMBOL_COUNT + '</span>');
        }
    }

    function _toggleSidebar() {
        var $sidebar = $('#emu-sidebar');
        var isOpen = $sidebar.hasClass('sidebar-open');
        if (isOpen) _closeSidebar();
        else _openSidebar();
    }

    function _openSidebar() {
        $('#emu-sidebar').addClass('sidebar-open');
        $('#emu-sidebar-overlay').addClass('active');
        $('body').addClass('sidebar-active');
    }

    function _closeSidebar() {
        $('#emu-sidebar').removeClass('sidebar-open');
        $('#emu-sidebar-overlay').removeClass('active');
        $('body').removeClass('sidebar-active');
    }
    EMU_MOBILE.closeSidebar = _closeSidebar;
    EMU_MOBILE.openSidebar = _openSidebar;

    function _applyLayout() {
        var w = window.innerWidth;
        if (w <= 768) {
            $('body').addClass('mobile-layout');
            $('body').removeClass('desktop-layout');
            // On mobile, sidebar starts closed
            if (!$('#emu-sidebar').hasClass('sidebar-open')) {
                $('#emu-sidebar').addClass('sidebar-mobile-hidden');
            }
        } else {
            $('body').removeClass('mobile-layout');
            $('body').addClass('desktop-layout');
            $('#emu-sidebar').removeClass('sidebar-open sidebar-mobile-hidden');
            $('#emu-sidebar-overlay').removeClass('active');
        }
    }

    /* =========================================================
     *  TOUCH/SWIPE SUPPORT
     * ========================================================= */
    function _initSwipe() {
        var _touchStartX = 0;
        var _touchStartY = 0;

        $(document).on('touchstart', function (e) {
            _touchStartX = e.originalEvent.changedTouches[0].screenX;
            _touchStartY = e.originalEvent.changedTouches[0].screenY;
        });

        $(document).on('touchend', function (e) {
            var dx = e.originalEvent.changedTouches[0].screenX - _touchStartX;
            var dy = e.originalEvent.changedTouches[0].screenY - _touchStartY;

            // Only handle horizontal swipes (dx > dy*2 and > 50px threshold)
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 2) {
                if (dx > 0 && _touchStartX < 30) {
                    // Swipe right from left edge — open sidebar (RTL: sidebar on left)
                    _openSidebar();
                } else if (dx < 0) {
                    // Swipe left — close sidebar
                    _closeSidebar();
                }
            }
        });
    }

    /* =========================================================
     *  FULL-SCREEN MODE (mobile symbol view)
     * ========================================================= */
    function _enterFullScreen(container) {
        if (!container) return;
        var rfs = container['request'+'Fullscreen'] || container['webkit'+'Request'+'Fullscreen'];
        if (rfs) rfs.call(container);
        $(container).addClass('fullscreen-symbol');
    }
    EMU_MOBILE.enterFullScreen = _enterFullScreen;

    function _exitFullScreen() {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        $('.fullscreen-symbol').removeClass('fullscreen-symbol');
    }
    EMU_MOBILE.exitFullScreen = _exitFullScreen;

    // Double-tap on canvas to enter fullscreen on mobile
    var _lastTap = 0;
    $(document).on('touchend', '#emu-canvas', function () {
        var now = Date.now();
        if (now - _lastTap < 300) {
            if (_isMobile()) _enterFullScreen(this);
        }
        _lastTap = now;
    });

    $(document).ready(function () {
        _init();
    });

})(window, jQuery);
