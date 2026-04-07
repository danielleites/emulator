/**
 * mobile-ui.js — PIV Mobile Interaction Module
 * PIV-Complete-v3 R300
 *
 * Provides:
 *  - Device detection (mobile / tablet / touch)
 *  - Bottom navigation bar
 *  - Swipe gestures for mode switching
 *  - Pull-to-refresh
 *  - Hamburger slide-out drawer (RTL)
 *  - Orientation change handling
 *  - Safe area insets
 *  - Haptic feedback
 *  - R300: MM20 symbol category in drawer, version badge
 */
(function () {
  'use strict';

  // ─── Mode definitions for bottom nav & swipe ─────────────────────
  var BOTTOM_NAV_MODES = [
    { id: 'launcher', icon: 'home',     label: '\u05D1\u05D9\u05EA' },    // Home
    { id: 'emulator', icon: 'monitor',  label: '\u05D0\u05DE\u05D5\u05DC\u05D8\u05D5\u05E8' },
    { id: 'qa',       icon: 'check',    label: 'QA' },
    { id: 'admin',    icon: 'chart',    label: '\u05D1\u05E7\u05E8\u05D4' },
    { id: 'more',     icon: 'menu',     label: '\u05E2\u05D5\u05D3' }     // More
  ];

  var SWIPEABLE_MODES = ['emulator', 'qa', 'combined', 'af', 'builder', 'admin'];

  // ─── SVG icon factory — returns DOM elements, not raw strings ────
  function createIcon(name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');

    var paths = {
      home: [
        { tag: 'path', d: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
        { tag: 'polyline', points: '9 22 9 12 15 12 15 22' }
      ],
      monitor: [
        { tag: 'rect', x: '2', y: '3', width: '20', height: '14', rx: '2' },
        { tag: 'path', d: 'M8 21h8M12 17v4' }
      ],
      check: [
        { tag: 'path', d: 'M9 11l3 3L22 4' },
        { tag: 'path', d: 'M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11' }
      ],
      chart: [
        { tag: 'path', d: 'M12 20V10M18 20V4M6 20v-6' }
      ],
      menu: [
        { tag: 'circle', cx: '12', cy: '12', r: '1' },
        { tag: 'circle', cx: '12', cy: '5', r: '1' },
        { tag: 'circle', cx: '12', cy: '19', r: '1' }
      ],
      layers: [
        { tag: 'path', d: 'M12 2L2 7l10 5 10-5-10-5z' },
        { tag: 'path', d: 'M2 17l10 5 10-5' },
        { tag: 'path', d: 'M2 12l10 5 10-5' }
      ],
      tree: [
        { tag: 'path', d: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
        { tag: 'polyline', points: '9 22 9 12 15 12 15 22' }
      ],
      pencil: [
        { tag: 'path', d: 'M12 20h9' },
        { tag: 'path', d: 'M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z' }
      ],
      users: [
        { tag: 'path', d: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2' },
        { tag: 'circle', cx: '9', cy: '7', r: '4' },
        { tag: 'path', d: 'M23 21v-2a4 4 0 00-3-3.87' },
        { tag: 'path', d: 'M16 3.13a4 4 0 010 7.75' }
      ],
      settings: [
        { tag: 'circle', cx: '12', cy: '12', r: '3' },
        { tag: 'path', d: 'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z' }
      ],
      close: [
        { tag: 'path', d: 'M18 6L6 18M6 6l12 12' }
      ],
      hamburger: [
        { tag: 'line', x1: '3', y1: '6', x2: '21', y2: '6' },
        { tag: 'line', x1: '3', y1: '12', x2: '21', y2: '12' },
        { tag: 'line', x1: '3', y1: '18', x2: '21', y2: '18' }
      ],
      collab: [
        { tag: 'path', d: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2' },
        { tag: 'circle', cx: '9', cy: '7', r: '4' },
        { tag: 'path', d: 'M23 21v-2a4 4 0 00-3-3.87' },
        { tag: 'path', d: 'M16 3.13a4 4 0 010 7.75' }
      ],
      piApi: [
        { tag: 'path', d: 'M18 20V10M12 20V4M6 20v-6' }
      ],
      arrowLeft: [
        { tag: 'path', d: 'M19 12H5M12 19l-7-7 7-7' }
      ],
      arrowRight: [
        { tag: 'path', d: 'M5 12h14M12 5l7 7-7 7' }
      ],
      arrowDown: [
        { tag: 'path', d: 'M12 19V5M5 12l7-7 7 7' }
      ],
      refresh: [
        { tag: 'polyline', points: '23 4 23 10 17 10' },
        { tag: 'polyline', points: '1 20 1 14 7 14' },
        { tag: 'path', d: 'M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15' }
      ]
    };

    var items = paths[name] || [];
    items.forEach(function (item) {
      var el = document.createElementNS('http://www.w3.org/2000/svg', item.tag);
      Object.keys(item).forEach(function (k) {
        if (k !== 'tag') {
          el.setAttribute(k, item[k]);
        }
      });
      svg.appendChild(el);
    });

    return svg;
  }

  // ─── State ────────────────────────────────────────────────────────
  var _bottomNavEl = null;
  var _drawerOverlay = null;
  var _drawerEl = null;
  var _ptrIndicator = null;
  var _swipeState = { startX: 0, startY: 0, tracking: false, startTime: 0 };
  var _orientationCallbacks = [];
  var _qaBadgeCount = 0;

  // ─── DOM helper: create element with attrs ────────────────────────
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') node.className = attrs[k];
        else if (k === 'textContent') node.textContent = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        }
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      children.forEach(function (c) {
        if (typeof c === 'string') node.appendChild(document.createTextNode(c));
        else if (c) node.appendChild(c);
      });
    }
    return node;
  }

  // ─── Public API ────────────────────────────────────────────────────
  window.PIV_MOBILE = {

    /** Returns true if screen width < 768px */
    isMobile: function () {
      return window.innerWidth < 768;
    },

    /** Returns true if screen width is 768-1024px */
    isTablet: function () {
      return window.innerWidth >= 768 && window.innerWidth <= 1024;
    },

    /** Returns true if device supports touch */
    isTouch: function () {
      return ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (navigator.msMaxTouchPoints > 0);
    },

    // ── Bottom Navigation ───────────────────────────────────────────
    initBottomNav: function () {
      if (_bottomNavEl) return;

      _bottomNavEl = el('nav', {
        className: 'piv-bottom-nav',
        'aria-label': 'Mobile navigation'
      });

      BOTTOM_NAV_MODES.forEach(function (mode) {
        var children = [
          createIcon(mode.icon),
          el('span', { className: 'piv-bottom-nav-label', textContent: mode.label })
        ];

        // QA badge
        var badge = null;
        if (mode.id === 'qa') {
          badge = el('span', { className: 'piv-bottom-nav-badge', id: 'mobile-qa-badge' });
          children.push(badge);
        }

        var btn = el('button', {
          className: 'piv-bottom-nav-item',
          'data-nav-mode': mode.id,
          'aria-label': mode.label
        }, children);

        btn.addEventListener('click', function () {
          PIV_MOBILE.haptic('light');
          if (mode.id === 'more') {
            PIV_MOBILE._openDrawer();
          } else if (mode.id === 'launcher') {
            PIV_MOBILE._switchToLauncher();
          } else {
            PIV_MOBILE._switchMode(mode.id);
          }
        });

        _bottomNavEl.appendChild(btn);
      });

      document.body.appendChild(_bottomNavEl);
      PIV_MOBILE._updateBottomNavActive();
    },

    /** Update QA badge count on bottom nav */
    setQaBadgeCount: function (count) {
      _qaBadgeCount = count;
      var badge = document.getElementById('mobile-qa-badge');
      if (badge) {
        badge.textContent = count > 0 ? String(count) : '';
      }
    },

    // ── Swipe Gestures ──────────────────────────────────────────────
    initSwipeNavigation: function () {
      var threshold = 50;
      var restraint = 100;
      var maxTime = 300;

      document.addEventListener('touchstart', function (e) {
        var launcherVisible = document.getElementById('launcher-screen');
        if (launcherVisible && launcherVisible.style.display !== 'none' &&
            !launcherVisible.classList.contains('hidden')) {
          _swipeState.tracking = false;
          return;
        }

        var touch = e.changedTouches[0];
        _swipeState.startX = touch.pageX;
        _swipeState.startY = touch.pageY;
        _swipeState.startTime = Date.now();
        _swipeState.tracking = true;
      }, { passive: true });

      document.addEventListener('touchmove', function () {
        // Swipe indicators managed via touchend
      }, { passive: true });

      document.addEventListener('touchend', function (e) {
        if (!_swipeState.tracking) return;
        _swipeState.tracking = false;

        var touch = e.changedTouches[0];
        var dx = touch.pageX - _swipeState.startX;
        var dy = Math.abs(touch.pageY - _swipeState.startY);
        var elapsed = Date.now() - _swipeState.startTime;

        if (elapsed > maxTime) return;
        if (Math.abs(dx) < threshold) return;
        if (dy > restraint) return;

        var target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' || target.isContentEditable) return;

        var currentMode = PIV_MOBILE._getCurrentMode();
        var idx = SWIPEABLE_MODES.indexOf(currentMode);
        if (idx === -1) return;

        // RTL: swipe right = previous, swipe left = next
        var newIdx = dx > 0 ? idx - 1 : idx + 1;

        if (newIdx >= 0 && newIdx < SWIPEABLE_MODES.length) {
          PIV_MOBILE.haptic('light');
          PIV_MOBILE._switchMode(SWIPEABLE_MODES[newIdx]);
        }
      }, { passive: true });
    },

    // ── Pull to Refresh ─────────────────────────────────────────────
    initPullToRefresh: function (callback) {
      if (_ptrIndicator) return;

      var arrow = createIcon('arrowDown');
      arrow.classList.add('piv-ptr-arrow');

      var spinner = el('div', { className: 'piv-ptr-spinner', style: 'display:none' });

      _ptrIndicator = el('div', { className: 'piv-ptr-indicator' }, [arrow, spinner]);
      document.body.appendChild(_ptrIndicator);

      var startY = 0;
      var pulling = false;
      var pullDistance = 0;
      var refreshThreshold = 80;

      document.addEventListener('touchstart', function (e) {
        var scrollTop = window.scrollY || document.documentElement.scrollTop;
        if (scrollTop > 5) return;

        var mode = PIV_MOBILE._getCurrentMode();
        if (mode !== 'admin' && mode !== 'qa') return;

        startY = e.touches[0].pageY;
        pulling = true;
        pullDistance = 0;
      }, { passive: true });

      document.addEventListener('touchmove', function (e) {
        if (!pulling) return;

        var currentY = e.touches[0].pageY;
        pullDistance = currentY - startY;

        if (pullDistance < 0) {
          pulling = false;
          return;
        }

        if (pullDistance > 10) {
          _ptrIndicator.classList.add('pulling');
          var visual = Math.min(pullDistance, 120);
          _ptrIndicator.style.transform =
            'translateX(-50%) translateY(' + (visual - 24) + 'px)';

          if (pullDistance > refreshThreshold) {
            _ptrIndicator.classList.add('threshold');
          } else {
            _ptrIndicator.classList.remove('threshold');
          }
        }
      }, { passive: true });

      document.addEventListener('touchend', function () {
        if (!pulling) return;
        pulling = false;

        if (pullDistance > refreshThreshold) {
          _ptrIndicator.classList.add('refreshing');
          _ptrIndicator.classList.remove('pulling', 'threshold');
          arrow.style.display = 'none';
          spinner.style.display = '';

          var done = function () {
            _ptrIndicator.classList.remove('refreshing');
            _ptrIndicator.style.transform = 'translateX(-50%) translateY(-100%)';
            arrow.style.display = '';
            spinner.style.display = 'none';
          };

          if (typeof callback === 'function') {
            var result = callback();
            if (result && typeof result.then === 'function') {
              result.then(done).catch(done);
            } else {
              setTimeout(done, 1000);
            }
          } else {
            setTimeout(done, 1000);
          }
        } else {
          _ptrIndicator.classList.remove('pulling', 'threshold');
          _ptrIndicator.style.transform = 'translateX(-50%) translateY(-100%)';
        }

        pullDistance = 0;
      }, { passive: true });
    },

    // ── Hamburger Menu ──────────────────────────────────────────────
    initHamburgerMenu: function () {
      // Create overlay
      _drawerOverlay = el('div', { className: 'piv-drawer-overlay' });
      _drawerOverlay.addEventListener('click', function () {
        PIV_MOBILE._closeDrawer();
      });
      document.body.appendChild(_drawerOverlay);

      // Create drawer
      _drawerEl = el('div', {
        className: 'piv-drawer',
        role: 'dialog',
        'aria-label': 'Navigation drawer'
      });

      // Header
      var closeBtn = el('button', {
        className: 'piv-drawer-close',
        'aria-label': 'Close drawer'
      }, [createIcon('close')]);
      closeBtn.addEventListener('click', function () {
        PIV_MOBILE._closeDrawer();
      });

      var header = el('div', { className: 'piv-drawer-header' }, [
        el('span', { className: 'piv-drawer-title', textContent: 'PI Vision' }),
        closeBtn
      ]);
      _drawerEl.appendChild(header);

      // Modes section
      var modesSection = el('div', { className: 'piv-drawer-section' }, [
        el('div', { className: 'piv-drawer-section-label', textContent: '\u05DE\u05E6\u05D1\u05D9 \u05E2\u05D1\u05D5\u05D3\u05D4' })
      ]);

      var modeEntries = [
        { mode: 'emulator', icon: 'monitor', label: '\u05D0\u05DE\u05D5\u05DC\u05D8\u05D5\u05E8' },
        { mode: 'qa',       icon: 'check',   label: '\u05D1\u05D3\u05D9\u05E7\u05EA QA' },
        { mode: 'combined', icon: 'layers',  label: '\u05D0\u05DE\u05D5\u05DC\u05D8\u05D5\u05E8 + QA' },
        { mode: 'af',       icon: 'tree',    label: '\u05D3\u05E4\u05D3\u05E4\u05DF AF' },
        { mode: 'builder',  icon: 'pencil',  label: '\u05E2\u05D5\u05E8\u05DA \u05D5\u05D9\u05D6\u05D5\u05D0\u05DC\u05D9' },
        { mode: 'admin',    icon: 'chart',   label: '\u05DC\u05D5\u05D7 \u05D1\u05E7\u05E8\u05D4' }
      ];

      modeEntries.forEach(function (entry) {
        var item = el('button', {
          className: 'piv-drawer-item',
          'data-drawer-mode': entry.mode
        }, [
          createIcon(entry.icon),
          el('span', { textContent: entry.label })
        ]);
        item.addEventListener('click', function () {
          PIV_MOBILE.haptic('light');
          PIV_MOBILE._closeDrawer();
          PIV_MOBILE._switchMode(entry.mode);
        });
        modesSection.appendChild(item);
      });

      // Users item (hidden by default)
      var usersItem = el('button', {
        className: 'piv-drawer-item',
        'data-drawer-mode': 'users',
        id: 'drawer-users-item',
        style: 'display:none'
      }, [
        createIcon('users'),
        el('span', { textContent: '\u05E0\u05D9\u05D4\u05D5\u05DC \u05DE\u05E9\u05EA\u05DE\u05E9\u05D9\u05DD' })
      ]);
      usersItem.addEventListener('click', function () {
        PIV_MOBILE.haptic('light');
        PIV_MOBILE._closeDrawer();
        PIV_MOBILE._switchMode('users');
      });
      modesSection.appendChild(usersItem);
      _drawerEl.appendChild(modesSection);

      // Tools section
      var toolsSection = el('div', { className: 'piv-drawer-section' }, [
        el('div', { className: 'piv-drawer-section-label', textContent: '\u05DB\u05DC\u05D9\u05DD' })
      ]);

      var toolEntries = [
        { action: 'pi-api',   icon: 'piApi',    label: 'PI Web API' },
        { action: 'collab',   icon: 'collab',   label: '\u05E9\u05D9\u05EA\u05D5\u05E3 \u05E4\u05E2\u05D5\u05DC\u05D4' },
        { action: 'settings', icon: 'settings', label: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA' }
      ];

      toolEntries.forEach(function (entry) {
        var item = el('button', {
          className: 'piv-drawer-item',
          'data-drawer-action': entry.action
        }, [
          createIcon(entry.icon),
          el('span', { textContent: entry.label })
        ]);
        item.addEventListener('click', function () {
          PIV_MOBILE.haptic('light');
          PIV_MOBILE._closeDrawer();
          if (entry.action === 'pi-api' && window.PIV_CONNECTOR) {
            window.PIV_CONNECTOR.openConfigPanel();
          } else if (entry.action === 'collab' && window.PIV_COLLAB) {
            window.PIV_COLLAB.showJoinDialog();
          } else if (entry.action === 'settings') {
            var settingsBtn = document.querySelector('[data-action="settings"]');
            if (settingsBtn) settingsBtn.click();
          }
        });
        toolsSection.appendChild(item);
      });
      _drawerEl.appendChild(toolsSection);

      // R300: MM20 section in drawer
      var mm20Section = el('div', {
        className: 'piv-drawer-section',
        id: 'drawer-mm20-section'
      }, [
        el('div', { className: 'piv-drawer-section-label', textContent: 'MM20 \u05D0\u05D9\u05E0\u05D8\u05D2\u05E8\u05E6\u05D9\u05D4' }),
        el('div', {
          style: 'padding:4px 16px;font-size:11px;color:#8892b0;line-height:1.6;'
        }, [
          el('span', { textContent: '569 \u05E1\u05DE\u05DC\u05D9\u05DD \u2022 ' }),
          el('span', { style: 'color:#8b5ec0;font-weight:600;', textContent: '499 MM20' }),
          el('span', { textContent: ' \u2022 ' }),
          el('span', { textContent: '70 Legacy' })
        ])
      ]);
      var mm20Items = [
        { label: 'MM20 Fleet', action: 'mm20-fleet', icon: '\uD83D\uDEA2' },
        { label: 'Wave Explorer', action: 'mm20-waves', icon: '\uD83C\uDF0A' },
        { label: 'Plugin Browser', action: 'mm20-plugins', icon: '\uD83E\uDDE9' },
        { label: 'Smoke Test', action: 'mm20-smoke', icon: '\uD83D\uDD25' },
        { label: 'Safety Validation', action: 'mm20-safety', icon: '\uD83D\uDEE1' }
      ];
      mm20Items.forEach(function (entry) {
        var item = el('div', {
          className: 'piv-drawer-item',
          'data-drawer-action': entry.action,
          style: 'cursor:pointer;'
        }, [
          el('span', { style: 'font-size:16px;', textContent: entry.icon }),
          el('span', { textContent: ' ' + entry.label })
        ]);
        item.addEventListener('click', function () {
          PIV_MOBILE.closeDrawer();
          // Dispatch to emulator MM20 functions if available
          var fnName = '_show' + entry.action.replace('mm20-', 'MM20').replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); });
          if (typeof window[fnName] === 'function') {
            window[fnName]();
          } else {
            // Fallback: dispatch custom event for the emulator to handle
            window.dispatchEvent(new CustomEvent('piv:mm20-action', { detail: { action: entry.action } }));
          }
        });
        mm20Section.appendChild(item);
      });
      _drawerEl.appendChild(mm20Section);

      // R300: Version pill at bottom of drawer
      var versionPill = el('div', {
        style: 'padding:12px 16px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);margin-top:8px;'
      }, [
        el('span', {
          className: 'r300-version-pill',
          style: 'display:inline-flex;align-items:center;gap:4px;padding:3px 10px;' +
            'background:rgba(108,63,160,0.15);border:1px solid rgba(108,63,160,0.3);' +
            'border-radius:12px;font-size:10px;color:#b794e0;',
          textContent: 'R300 \u2022 v4.2.0 \u2022 569 symbols'
        })
      ]);
      _drawerEl.appendChild(versionPill);

      // Sync section (hidden by default)
      var syncSection = el('div', {
        className: 'piv-drawer-section',
        id: 'drawer-sync-section',
        style: 'display:none'
      }, [
        el('div', { className: 'piv-drawer-section-label', textContent: '\u05E1\u05E0\u05DB\u05E8\u05D5\u05DF' }),
        el('div', { className: 'piv-device-list', id: 'drawer-device-list' })
      ]);
      _drawerEl.appendChild(syncSection);

      document.body.appendChild(_drawerEl);

      // Inject hamburger button into launcher topbar
      PIV_MOBILE._injectHamburgerButton();

      // Show users item for admin
      document.addEventListener('piv-auth-ready', function () {
        var user = window.__PIV_USER || {};
        if (user.role === 'admin') {
          var drawerUsersItem = document.getElementById('drawer-users-item');
          if (drawerUsersItem) drawerUsersItem.style.display = '';
        }
      });

      // Escape key closes drawer
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && _drawerEl && _drawerEl.classList.contains('open')) {
          PIV_MOBILE._closeDrawer();
        }
      });
    },

    // ── Orientation Handler ─────────────────────────────────────────
    onOrientationChange: function (callback) {
      _orientationCallbacks.push(callback);
    },

    // ── Safe Area ───────────────────────────────────────────────────
    applySafeAreaInsets: function () {
      var div = document.createElement('div');
      div.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;' +
        'padding-top:env(safe-area-inset-top);' +
        'padding-bottom:env(safe-area-inset-bottom);' +
        'padding-left:env(safe-area-inset-left);' +
        'padding-right:env(safe-area-inset-right);' +
        'visibility:hidden;pointer-events:none;';
      document.body.appendChild(div);

      var cs = getComputedStyle(div);
      window.PIV_SAFE_AREAS = {
        top: parseInt(cs.paddingTop, 10) || 0,
        bottom: parseInt(cs.paddingBottom, 10) || 0,
        left: parseInt(cs.paddingLeft, 10) || 0,
        right: parseInt(cs.paddingRight, 10) || 0
      };

      document.body.removeChild(div);
    },

    // ── Haptic Feedback ─────────────────────────────────────────────
    haptic: function (type) {
      if (!navigator.vibrate) return;

      switch (type) {
        case 'light':
          navigator.vibrate(10);
          break;
        case 'medium':
          navigator.vibrate(20);
          break;
        case 'heavy':
          navigator.vibrate([30, 10, 30]);
          break;
        default:
          navigator.vibrate(10);
      }
    },

    // ── Update sync devices in drawer ───────────────────────────────
    updateSyncDevices: function (devices) {
      var section = document.getElementById('drawer-sync-section');
      var list = document.getElementById('drawer-device-list');
      if (!section || !list) return;

      if (!devices || devices.length === 0) {
        section.style.display = 'none';
        return;
      }

      section.style.display = '';
      var currentDeviceId = localStorage.getItem('piv-device-id') || '';

      // Clear and rebuild
      while (list.firstChild) list.removeChild(list.firstChild);

      devices.forEach(function (dev) {
        var isCurrent = dev.deviceId === currentDeviceId;
        var item = el('div', {
          className: 'piv-device-item' + (isCurrent ? ' current' : '')
        }, [
          el('span', { className: 'piv-device-icon' }, [createIcon('monitor')]),
          el('span', { textContent: (dev.deviceType || 'unknown') + (isCurrent ? ' (\u05D6\u05D4)' : '') })
        ]);
        list.appendChild(item);
      });
    },

    // ─── Private Helpers ────────────────────────────────────────────

    _getCurrentMode: function () {
      var activeView = document.querySelector('.mode-view.active');
      if (!activeView) return 'launcher';
      return (activeView.id || '').replace('mode-', '');
    },

    _switchMode: function (mode) {
      if (window.__PIV_LAUNCHER && typeof window.__PIV_LAUNCHER.switchMode === 'function') {
        window.__PIV_LAUNCHER.switchMode(mode);
      } else {
        var launcher = document.getElementById('launcher-screen');
        if (launcher) launcher.style.display = 'none';

        document.querySelectorAll('.mode-view').forEach(function (view) {
          view.classList.remove('active');
        });

        var target = document.getElementById('mode-' + mode);
        if (target) target.classList.add('active');

        var card = document.querySelector('.mode-card[data-mode="' + mode + '"]');
        if (card) card.click();
      }

      PIV_MOBILE._updateBottomNavActive();

      if (window.PIV_SYNC && window.PIV_SYNC.isConnected()) {
        window.PIV_SYNC.syncState(window.PIV_SYNC.CHANNELS.MODE, mode);
      }
    },

    _switchToLauncher: function () {
      var activeView = document.querySelector('.mode-view.active');
      if (activeView) {
        var backBtn = activeView.querySelector('.btn-back');
        if (backBtn) {
          backBtn.click();
        } else {
          activeView.classList.remove('active');
          var launcher = document.getElementById('launcher-screen');
          if (launcher) launcher.style.display = '';
        }
      }
      PIV_MOBILE._updateBottomNavActive();
    },

    _updateBottomNavActive: function () {
      if (!_bottomNavEl) return;

      var currentMode = PIV_MOBILE._getCurrentMode();

      _bottomNavEl.querySelectorAll('.piv-bottom-nav-item').forEach(function (item) {
        var navMode = item.getAttribute('data-nav-mode');
        if (navMode === currentMode || (navMode === 'launcher' && currentMode === 'launcher')) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    },

    _openDrawer: function () {
      if (_drawerOverlay) _drawerOverlay.classList.add('open');
      if (_drawerEl) _drawerEl.classList.add('open');
      document.body.style.overflow = 'hidden';

      var currentMode = PIV_MOBILE._getCurrentMode();
      _drawerEl.querySelectorAll('[data-drawer-mode]').forEach(function (item) {
        var m = item.getAttribute('data-drawer-mode');
        if (m === currentMode) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    },

    _closeDrawer: function () {
      if (_drawerOverlay) _drawerOverlay.classList.remove('open');
      if (_drawerEl) _drawerEl.classList.remove('open');
      document.body.style.overflow = '';
    },

    _injectHamburgerButton: function () {
      var topbar = document.querySelector('.launcher-topbar');
      if (!topbar) return;

      if (document.getElementById('mobile-hamburger-btn')) return;

      var btn = el('button', {
        id: 'mobile-hamburger-btn',
        'aria-label': 'Open menu'
      }, [createIcon('hamburger')]);

      btn.addEventListener('click', function () {
        PIV_MOBILE.haptic('light');
        PIV_MOBILE._openDrawer();
      });

      topbar.insertBefore(btn, topbar.firstChild);
    },

    // ── Initialize All ──────────────────────────────────────────────
    init: function () {
      if (!PIV_MOBILE.isMobile() && !PIV_MOBILE.isTablet()) return;

      PIV_MOBILE.applySafeAreaInsets();

      if (PIV_MOBILE.isMobile()) {
        PIV_MOBILE.initBottomNav();
        PIV_MOBILE.initSwipeNavigation();
        PIV_MOBILE.initHamburgerMenu();
        PIV_MOBILE.initPullToRefresh(function () {
          var mode = PIV_MOBILE._getCurrentMode();
          if (mode === 'admin') {
            var refreshBtn = document.getElementById('admin-refresh-btn');
            if (refreshBtn) refreshBtn.click();
          } else if (mode === 'qa' && window.PIV_MOBILE_QA) {
            return window.PIV_MOBILE_QA.runScan();
          }
        });
      }

      // Listen for mode changes to update bottom nav
      var observer = new MutationObserver(function () {
        PIV_MOBILE._updateBottomNavActive();
      });
      document.querySelectorAll('.mode-view').forEach(function (view) {
        observer.observe(view, { attributes: true, attributeFilter: ['class'] });
      });
      var launcher = document.getElementById('launcher-screen');
      if (launcher) {
        observer.observe(launcher, { attributes: true, attributeFilter: ['style', 'class'] });
      }

      // Orientation change
      var orientHandler = function () {
        _orientationCallbacks.forEach(function (cb) {
          try { cb(screen.orientation ? screen.orientation.type : ''); } catch (e) { /* */ }
        });
      };
      if (screen.orientation) {
        screen.orientation.addEventListener('change', orientHandler);
      } else {
        window.addEventListener('orientationchange', orientHandler);
      }

      console.log('[Mobile] PIV_MOBILE initialized \u2014 ' +
        (PIV_MOBILE.isMobile() ? 'mobile' : 'tablet') +
        ' | touch=' + PIV_MOBILE.isTouch());
    }
  };

})();
