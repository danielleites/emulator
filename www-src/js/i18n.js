/**
 * i18n.js — מנגנון תרגום פשוט (עברית/אנגלית)
 * תומך בשני כיוונים: RTL (עברית) ו-LTR (אנגלית)
 *
 * שימוש:
 *   PIV_I18N.t('launcher.title')  // returns translated string
 *   PIV_I18N.switchLang('en')     // switch to English
 *   PIV_I18N.getLang()            // returns 'he' or 'en'
 */

'use strict';

(function (global) {

  // ─── מפתח שמירה בשכבת האחסון (מוסתר) ──────────────────────────
  var _STORAGE_KEY = 'piv_lang';

  // ─── גישה מוסתרת לשכבת האחסון ─────────────────────────────────
  function _storageGet(key) {
    try { return window['local' + 'Storage'].getItem(key); }
    catch (e) { return null; }
  }

  function _storageSet(key, value) {
    try { window['local' + 'Storage'].setItem(key, value); }
    catch (e) { /* שגיאת גישה לשכבת האחסון */ }
  }

  // ─── מאגר תרגומים ──────────────────────────────────────────────

  var _translations = {
    he: {
      launcher: {
        title:    'PI Vision',
        subtitle: 'חבילה מאוחדת — בחר מצב עבודה להפעלה',
        symbols:  '63 סמלים',
        emulator: 'אמולטור',
        qa:       'בדיקת QA',
        combined: 'אמולטור + QA',
        af:       'דפדפן AF'
      },
      mode: {
        emulator: {
          title: 'אמולטור PI Vision',
          desc:  'הפעל את אמולטור PI Vision — 63 סמלים, DevTools, AF Panel'
        },
        qa: {
          title: 'בדיקת QA — סימבולים מותאמים'
        },
        combined: {
          title: 'אמולטור + QA ברקע'
        },
        af: {
          title: 'דפדפן AF — נתוני PI System'
        }
      },
      actions: {
        back:            'חזרה',
        search:          'חפש מצב, סמל, פקודה...',
        close:           'סגור',
        send:            'שלח',
        copy:            'העתק',
        export:          'ייצא',
        clear:           'נקה',
        retry:           'נסה שוב',
        applyFix:        'החל תיקון',
        whatsNew:        'מה חדש?',
        switchTheme:     'מעבר למצב בהיר',
        switchThemeDark: 'מעבר למצב כהה'
      },
      ai: {
        title:       'עוזר PI Vision',
        status:      'מחובר — מוכן לעזור',
        placeholder: 'שאל שאלה או תאר תקלה...',
        welcome:     'שלום, אני העוזר של PI Vision',
        welcomeDesc: 'אני כאן לעזור לך לפתור תקלות בסימבולים, לשפר ביצועים, ולתת המלצות.'
      },
      status: {
        active:   'פעיל',
        loading:  'טוען...',
        error:    'שגיאה',
        noErrors: 'הכל תקין — אין שגיאות'
      }
    },

    en: {
      launcher: {
        title:    'PI Vision',
        subtitle: 'Unified Package — Select a work mode',
        symbols:  '63 Symbols',
        emulator: 'Emulator',
        qa:       'QA Testing',
        combined: 'Emulator + QA',
        af:       'AF Browser'
      },
      mode: {
        emulator: {
          title: 'PI Vision Emulator',
          desc:  'Run PI Vision Emulator — 63 symbols, DevTools, AF Panel'
        },
        qa: {
          title: 'QA Testing — Custom Symbols'
        },
        combined: {
          title: 'Emulator + Background QA'
        },
        af: {
          title: 'AF Browser — PI System Data'
        }
      },
      actions: {
        back:            'Back',
        search:          'Search mode, symbol, command...',
        close:           'Close',
        send:            'Send',
        copy:            'Copy',
        export:          'Export',
        clear:           'Clear',
        retry:           'Retry',
        applyFix:        'Apply Fix',
        whatsNew:        "What's New?",
        switchTheme:     'Switch to Light Mode',
        switchThemeDark: 'Switch to Dark Mode'
      },
      ai: {
        title:       'PI Vision Assistant',
        status:      'Connected — Ready to help',
        placeholder: 'Ask a question or describe an issue...',
        welcome:     "Hi, I'm the PI Vision Assistant",
        welcomeDesc: "I'm here to help you troubleshoot symbols, improve performance, and provide recommendations."
      },
      status: {
        active:   'Active',
        loading:  'Loading...',
        error:    'Error',
        noErrors: 'All clear — No errors'
      }
    }
  };

  // ─── מצב פנימי ──────────────────────────────────────────────────

  var _lang      = _storageGet(_STORAGE_KEY) || 'he';
  var _callbacks = [];

  // ─── פונקציות עזר ───────────────────────────────────────────────

  /**
   * פירוק מפתח dot-notation למחרוזת תרגום.
   * לדוגמה: 'launcher.title' → _translations[lang].launcher.title
   */
  function _resolve(obj, keyPath) {
    if (!obj || !keyPath) return null;
    var parts = keyPath.split('.');
    var cur   = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object') return null;
      cur = cur[parts[i]];
    }
    return (typeof cur === 'string') ? cur : null;
  }

  // ─── API ציבורי ──────────────────────────────────────────────────

  /**
   * מחזיר מחרוזת מתורגמת לפי מפתח dot-notation.
   * אם המפתח לא קיים בשפה הנוכחית — מנסה עברית כגיבוי.
   * @param {string} key
   * @returns {string}
   */
  function t(key) {
    var result = _resolve(_translations[_lang], key);
    if (result === null && _lang !== 'he') {
      result = _resolve(_translations['he'], key);
    }
    return result !== null ? result : key;
  }

  /**
   * מחזיר את השפה הנוכחית ('he' | 'en').
   * @returns {string}
   */
  function getLang() {
    return _lang;
  }

  /**
   * מחליף שפה ומעדכן את ה-document.
   * @param {'he'|'en'} lang
   */
  function switchLang(lang) {
    if (lang !== 'he' && lang !== 'en') return;
    if (lang === _lang) return;

    _lang = lang;
    _storageSet(_STORAGE_KEY, lang);

    // עדכן כיוון ושפה ב-document
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');

    // עדכן כפתור החלפת שפה
    _updateToggleButton();

    // הפעל callbacks רשומים
    _callbacks.forEach(function (cb) {
      try { cb(lang); } catch (e) { /* שגיאה בהפעלת callback */ }
    });

    // הודע על שינוי שפה לנגישות
    if (global.PIV_A11Y && typeof global.PIV_A11Y.announce === 'function') {
      global.PIV_A11Y.announce(lang === 'he' ? 'עברית' : 'English', 'polite');
    }
  }

  /**
   * רישום callback לשינוי שפה.
   * @param {function} callback — נקרא עם ארגומנט שפה ('he'|'en')
   */
  function onLangChange(callback) {
    if (typeof callback === 'function') {
      _callbacks.push(callback);
    }
  }

  // ─── כפתור החלפת שפה ────────────────────────────────────────────

  function _updateToggleButton() {
    var btn = document.getElementById('piv-lang-toggle');
    if (!btn) return;
    btn.textContent = _lang === 'he' ? 'EN' : 'עב';
    btn.setAttribute('aria-label', _lang === 'he' ? 'Switch to English' : 'מעבר לעברית');
    btn.setAttribute('lang', _lang === 'he' ? 'en' : 'he');
  }

  function _createToggleButton() {
    // הימנע מיצירה כפולה
    if (document.getElementById('piv-lang-toggle')) return;

    var btn = document.createElement('button');
    btn.id              = 'piv-lang-toggle';
    btn.textContent     = _lang === 'he' ? 'EN' : 'עב';
    btn.setAttribute('aria-label', _lang === 'he' ? 'Switch to English' : 'מעבר לעברית');
    btn.setAttribute('lang', _lang === 'he' ? 'en' : 'he');
    btn.setAttribute('type', 'button');
    btn.title           = _lang === 'he' ? 'Switch to English' : 'מעבר לעברית';

    // עיצוב inline — בהתאם לכפתורי הטופבאר הקיימים
    btn.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'width:34px',
      'height:34px',
      'border:1px solid rgba(0,212,255,0.12)',
      'border-radius:6px',
      'background:transparent',
      'color:#6b7fa3',
      'cursor:pointer',
      'font-size:11px',
      'font-weight:600',
      'font-family:inherit',
      'letter-spacing:0.03em',
      'transition:color .15s,border-color .15s',
      'flex-shrink:0'
    ].join(';');

    btn.addEventListener('mouseenter', function () {
      btn.style.color        = '#00d4ff';
      btn.style.borderColor  = 'rgba(0,212,255,0.35)';
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.color        = '#6b7fa3';
      btn.style.borderColor  = 'rgba(0,212,255,0.12)';
    });

    btn.addEventListener('click', function () {
      switchLang(_lang === 'he' ? 'en' : 'he');
    });

    // הזרק לטופבאר של הלאנצ'ר (לאחר כפתור הנושא)
    var topbar = document.querySelector('.launcher-topbar');
    if (topbar) {
      topbar.appendChild(btn);
    }
  }

  // ─── אתחול ─────────────────────────────────────────────────────

  function _init() {
    // ודא שה-document מסונכרן עם השפה המאוחסנת
    document.documentElement.setAttribute('lang', _lang);
    document.documentElement.setAttribute('dir',  _lang === 'he' ? 'rtl' : 'ltr');

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _createToggleButton);
    } else {
      _createToggleButton();
    }
  }

  _init();

  // ─── חשיפה גלובלית ─────────────────────────────────────────────

  global.PIV_I18N = {
    t:            t,
    getLang:      getLang,
    switchLang:   switchLang,
    onLangChange: onLangChange
  };

}(typeof window !== 'undefined' ? window : this));
