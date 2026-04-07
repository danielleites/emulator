/**
 * accessibility.js — שיפורי נגישות לאפליקציית PI Vision QA
 *
 * מודולים:
 *  1. ARIA Live Regions — אזורים חיים לקוראי מסך
 *  2. ניהול פוקוס — לכידת פוקוס במודלים, החזרה לאלמנט המפעיל
 *  3. ניווט מקלדת — כרטיסי מצב, הודעות AI, toast
 *  4. הכרזות לקוראי מסך — PIV_A11Y.announce()
 *  5. תמיכה בניגודיות גבוהה — prefers-contrast
 *  6. תמיכה בהפחתת תנועה — prefers-reduced-motion
 */

'use strict';

(function (global) {

  // ─── CSS בסיסי — מוזרק ל-<head> ─────────────────────────────────

  var _CSS = [
    /* ─── Skip-to-content ─── */
    '#piv-skip-link{',
      'position:fixed;',
      'top:-100%;',
      'left:50%;',
      'transform:translateX(-50%);',
      'z-index:99999;',
      'padding:10px 20px;',
      'background:#00d4ff;',
      'color:#0d1b2a;',
      'font-weight:700;',
      'font-size:14px;',
      'border-radius:0 0 8px 8px;',
      'text-decoration:none;',
      'transition:top .15s;',
    '}',
    '#piv-skip-link:focus{top:0;}',

    /* ─── ARIA live regions (visually hidden) ─── */
    '#piv-aria-polite,#piv-aria-assertive{',
      'position:absolute;',
      'width:1px;height:1px;',
      'padding:0;margin:-1px;',
      'overflow:hidden;',
      'clip:rect(0,0,0,0);',
      'white-space:nowrap;',
      'border:0;',
    '}',

    /* ─── Focus indicators (כל האלמנטים האינטראקטיביים) ─── */
    ':focus-visible{',
      'outline:2px solid #00d4ff !important;',
      'outline-offset:2px !important;',
      'border-radius:4px;',
    '}',
    'button:focus-visible,',
    'a:focus-visible,',
    '[tabindex]:focus-visible,',
    '[role="button"]:focus-visible{',
      'outline:2px solid #00d4ff !important;',
      'outline-offset:2px !important;',
    '}',

    /* ─── ניגודיות גבוהה ─── */
    'html.high-contrast{',
      '--text-primary:#fff;',
      '--text-dim:#ccc;',
      '--border-subtle:rgba(255,255,255,0.5);',
    '}',
    'html.high-contrast .mode-card{',
      'border-width:2px !important;',
      'border-color:rgba(255,255,255,0.5) !important;',
    '}',
    'html.high-contrast button,',
    'html.high-contrast [role="button"]{',
      'border-width:2px !important;',
    '}',

    /* ─── הפחתת תנועה ─── */
    'html.reduced-motion *,',
    'html.reduced-motion *::before,',
    'html.reduced-motion *::after{',
      'animation-duration:0.001ms !important;',
      'animation-iteration-count:1 !important;',
      'transition-duration:0.001ms !important;',
      'scroll-behavior:auto !important;',
    '}'
  ].join('');

  // ─── אלמנטי ARIA live ────────────────────────────────────────────

  var _politeRegion    = null;
  var _assertiveRegion = null;

  function _createLiveRegions() {
    if (document.getElementById('piv-aria-polite')) return;

    _politeRegion = document.createElement('div');
    _politeRegion.id             = 'piv-aria-polite';
    _politeRegion.setAttribute('aria-live', 'polite');
    _politeRegion.setAttribute('aria-atomic', 'true');
    _politeRegion.setAttribute('aria-relevant', 'additions text');
    document.body.appendChild(_politeRegion);

    _assertiveRegion = document.createElement('div');
    _assertiveRegion.id             = 'piv-aria-assertive';
    _assertiveRegion.setAttribute('aria-live', 'assertive');
    _assertiveRegion.setAttribute('aria-atomic', 'true');
    _assertiveRegion.setAttribute('aria-relevant', 'additions text');
    document.body.appendChild(_assertiveRegion);
  }

  // ─── הכרזה לקוראי מסך ────────────────────────────────────────────

  /**
   * מכריז הודעה לקוראי מסך דרך אזור aria-live.
   * @param {string}           message
   * @param {'polite'|'assertive'} [priority='polite']
   */
  function announce(message, priority) {
    var region = (priority === 'assertive') ? _assertiveRegion : _politeRegion;
    if (!region) return;

    // ניקוי זמני מאפשר לקורא מסך לקלוט שינויים חוזרים
    region.textContent = '';
    setTimeout(function () {
      region.textContent = message;
    }, 50);
  }

  // ─── Skip-to-content ─────────────────────────────────────────────

  function _createSkipLink() {
    if (document.getElementById('piv-skip-link')) return;

    var link      = document.createElement('a');
    link.id       = 'piv-skip-link';
    link.href     = '#launcher-screen';
    link.textContent = (global.PIV_I18N && typeof global.PIV_I18N.t === 'function')
      ? global.PIV_I18N.t('actions.back')
      : 'דלג לתוכן';

    // הזרק כאלמנט ראשון ב-body
    document.body.insertBefore(link, document.body.firstChild);
  }

  // ─── לכידת פוקוס במודלים ─────────────────────────────────────────

  var _focusTrapStack = [];  // מחסנית לכידות פוקוס פעילות

  var _FOCUSABLE_SEL = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[role="button"]:not([disabled])'
  ].join(',');

  /**
   * לוכד פוקוס בתוך אלמנט.
   * @param {HTMLElement} container
   * @param {HTMLElement} [triggerEl] — האלמנט שפתח את המודל
   * @returns {function} פונקציית שחרור
   */
  function trapFocus(container, triggerEl) {
    if (!container) return function () {};

    var focusable     = Array.from(container.querySelectorAll(_FOCUSABLE_SEL));
    var firstFocusable = focusable[0];
    var lastFocusable  = focusable[focusable.length - 1];

    // פוקוס ראשוני
    if (firstFocusable) {
      setTimeout(function () { firstFocusable.focus(); }, 50);
    }

    function _handler(e) {
      if (e.key !== 'Tab') return;

      // רענן רשימה (אלמנטים עשויים להשתנות)
      focusable     = Array.from(container.querySelectorAll(_FOCUSABLE_SEL));
      firstFocusable = focusable[0];
      lastFocusable  = focusable[focusable.length - 1];

      if (!focusable.length) { e.preventDefault(); return; }

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    }

    document.addEventListener('keydown', _handler);

    var trap = {
      container:  container,
      triggerEl:  triggerEl || null,
      handler:    _handler
    };
    _focusTrapStack.push(trap);

    /** פונקציית שחרור */
    return function release() {
      document.removeEventListener('keydown', _handler);
      var idx = _focusTrapStack.indexOf(trap);
      if (idx > -1) _focusTrapStack.splice(idx, 1);
      // החזר פוקוס לאלמנט המפעיל
      if (triggerEl && typeof triggerEl.focus === 'function') {
        setTimeout(function () { triggerEl.focus(); }, 50);
      }
    };
  }

  // ─── ניהול פוקוס חכם למודלים ──────────────────────────────────────

  /**
   * מאזין לפתיחת מודלים שנוצרים דינמית ומפעיל לכידת פוקוס.
   */
  function _watchModals() {
    var _observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;

          // בדוק אם אלמנט הוסף עם role=dialog
          var dialogs = [];
          if (node.getAttribute && node.getAttribute('role') === 'dialog') {
            dialogs.push(node);
          }
          if (node.querySelectorAll) {
            dialogs = dialogs.concat(Array.from(node.querySelectorAll('[role="dialog"]')));
          }

          dialogs.forEach(function (dlg) {
            var trigger = document.activeElement;
            var release = trapFocus(dlg, trigger);

            // שחרר כשהמודל מוסר מה-DOM
            var dlgObserver = new MutationObserver(function (_, obs) {
              if (!document.contains(dlg)) {
                release();
                obs.disconnect();
              }
            });
            dlgObserver.observe(document.body, { childList: true, subtree: true });

            // Escape — סגירת מודל
            function _escHandler(e) {
              if (e.key === 'Escape') {
                var closeBtn = dlg.querySelector('[data-dismiss],[aria-label="סגור"],[aria-label="Close"],.btn-close');
                if (closeBtn) closeBtn.click();
                document.removeEventListener('keydown', _escHandler);
              }
            }
            document.addEventListener('keydown', _escHandler);
          });
        });
      });
    });

    _observer.observe(document.body, { childList: true, subtree: true });
  }

  // ─── ניווט מקלדת — כרטיסי מצב ────────────────────────────────────

  function _initModeCardKeyboard() {
    document.addEventListener('keydown', function (e) {
      var card = e.target.closest('[data-mode]');
      if (!card) return;

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  }

  // ─── ניווט חצים — הודעות AI ──────────────────────────────────────

  function _initAIMessageNavigation() {
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;

      var focused = document.activeElement;
      if (!focused) return;

      var container = focused.closest('#piv-ai-messages,[data-ai-messages],.ai-messages');
      if (!container) return;

      var messages  = Array.from(container.querySelectorAll('[data-ai-msg],[role="listitem"],.ai-message'));
      if (!messages.length) return;

      var idx = messages.indexOf(focused);
      if (idx === -1) {
        // פוקוס על ההורה — עבור להודעה ראשונה
        idx = 0;
      } else if (e.key === 'ArrowDown') {
        idx = Math.min(idx + 1, messages.length - 1);
      } else {
        idx = Math.max(idx - 1, 0);
      }

      e.preventDefault();
      messages[idx].setAttribute('tabindex', '0');
      messages[idx].focus();
    });
  }

  // ─── Escape ב-toast ──────────────────────────────────────────────

  function _initToastEscape() {
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;

      var toasts = document.querySelectorAll(
        '.piv-toast, [data-toast], #piv-toast-container .toast'
      );
      toasts.forEach(function (toast) {
        var closeBtn = toast.querySelector('.toast-close, [aria-label="סגור"], [aria-label="Close"]');
        if (closeBtn) {
          closeBtn.click();
        } else {
          toast.remove();
        }
      });
    });
  }

  // ─── הכרזה אוטומטית על אירועים ──────────────────────────────────────

  function _initAutoAnnouncements() {
    // שינויי מצב (מצב עבודה)
    document.addEventListener('piv:modeChange', function (e) {
      var mode = e.detail && e.detail.mode;
      if (!mode) return;
      var label = (global.PIV_I18N && typeof global.PIV_I18N.t === 'function')
        ? global.PIV_I18N.t('mode.' + mode + '.title')
        : mode;
      announce(label, 'polite');
    });

    // תוצאות QA
    document.addEventListener('piv:qaResults', function (e) {
      var count  = e.detail && e.detail.errorCount;
      var msg    = (global.PIV_I18N && typeof global.PIV_I18N.t === 'function')
        ? (count > 0 ? count + ' ' + global.PIV_I18N.t('status.error') : global.PIV_I18N.t('status.noErrors'))
        : (count > 0 ? count + ' שגיאות' : 'הכל תקין');
      announce(msg, count > 0 ? 'assertive' : 'polite');
    });

    // תגובות AI
    document.addEventListener('piv:aiResponse', function (e) {
      var text = e.detail && e.detail.text;
      if (text) announce(text.slice(0, 120), 'polite');
    });

    // שגיאות
    document.addEventListener('piv:error', function (e) {
      var msg = e.detail && e.detail.message;
      if (msg) announce(msg, 'assertive');
    });
  }

  // ─── ניגודיות גבוהה ──────────────────────────────────────────────

  function _initHighContrast() {
    var mq = window.matchMedia('(prefers-contrast: more)');

    function _apply(matches) {
      if (matches) {
        document.documentElement.classList.add('high-contrast');
      } else {
        document.documentElement.classList.remove('high-contrast');
      }
    }

    _apply(mq.matches);

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', function (e) { _apply(e.matches); });
    } else if (typeof mq.addListener === 'function') {
      // תמיכה בדפדפנים ישנים
      mq.addListener(function (e) { _apply(e.matches); });
    }
  }

  // ─── הפחתת תנועה ────────────────────────────────────────────────

  function _initReducedMotion() {
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');

    function _apply(matches) {
      if (matches) {
        document.documentElement.classList.add('reduced-motion');
      } else {
        document.documentElement.classList.remove('reduced-motion');
      }
    }

    _apply(mq.matches);

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', function (e) { _apply(e.matches); });
    } else if (typeof mq.addListener === 'function') {
      mq.addListener(function (e) { _apply(e.matches); });
    }
  }

  // ─── הזרקת CSS ──────────────────────────────────────────────────

  function _injectCSS() {
    if (document.getElementById('piv-a11y-styles')) return;

    var style   = document.createElement('style');
    style.id    = 'piv-a11y-styles';
    style.textContent = _CSS;
    document.head.appendChild(style);
  }

  // ─── אתחול ──────────────────────────────────────────────────────

  function _init() {
    _injectCSS();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _setup);
    } else {
      _setup();
    }
  }

  function _setup() {
    _createLiveRegions();
    _createSkipLink();
    _watchModals();
    _initModeCardKeyboard();
    _initAIMessageNavigation();
    _initToastEscape();
    _initAutoAnnouncements();
    _initHighContrast();
    _initReducedMotion();
  }

  _init();

  // ─── חשיפה גלובלית ──────────────────────────────────────────────

  global.PIV_A11Y = {
    announce:   announce,
    trapFocus:  trapFocus
  };

}(typeof window !== 'undefined' ? window : this));
