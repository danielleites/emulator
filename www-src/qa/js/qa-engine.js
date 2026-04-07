/**
 * qa-engine.js — PI Vision Symbol QA Analysis Engine
 * Runs all automated checks on symbol files
 */

'use strict';

const QAEngine = (() => {

  // ─── Severity Constants ───────────────────────────────────────────────────
  const SEV = {
    ERROR:   'error',
    WARNING: 'warning',
    INFO:    'info',
    PASS:    'pass'
  };

  // ─── Check Result Builder ─────────────────────────────────────────────────
  function result(severity, checkId, message, detail = '', line = null) {
    return { severity, checkId, message, detail, line };
  }

  // ─── JS CHECKS ────────────────────────────────────────────────────────────

  function checkJS(code, symbolName) {
    const results = [];
    const lines = code.split('\n');

    // 1. IIFE pattern
    const iifePattern = /\(function\s*\(\s*PV\s*\)\s*\{[\s\S]*\}\s*\)\s*\(\s*window\.PIVisualization\s*\)/;
    if (iifePattern.test(code)) {
      results.push(result(SEV.PASS, 'js-iife', 'תבנית IIFE תקינה', 'הקוד עטוף ב-(function(PV){...})(window.PIVisualization)'));
    } else {
      results.push(result(SEV.ERROR, 'js-iife', 'תבנית IIFE חסרה', 'הקוד חייב להיות עטוף ב-(function(PV){ "use strict"; ... })(window.PIVisualization)'));
    }

    // 2. PV.symbolCatalog.register()
    if (/PV\.symbolCatalog\.register\s*\(/.test(code)) {
      results.push(result(SEV.PASS, 'js-register', 'רישום סמל תקין', 'PV.symbolCatalog.register() נמצא'));
    } else {
      results.push(result(SEV.ERROR, 'js-register', 'רישום סמל חסר', 'PV.symbolCatalog.register() חייב להיות קיים'));
    }

    // 3. visObjectType
    if (/visObjectType\s*:/.test(code)) {
      results.push(result(SEV.PASS, 'js-visobjtype', 'visObjectType מוגדר', ''));
    } else {
      results.push(result(SEV.ERROR, 'js-visobjtype', 'visObjectType חסר', 'המאפיין visObjectType חייב להיות מוגדר באובייקט הגדרת הסמל'));
    }

    // 4. getDefaultConfig
    if (/getDefaultConfig\s*:/.test(code) || /getDefaultConfig\s*=\s*function/.test(code)) {
      results.push(result(SEV.PASS, 'js-defaultconfig', 'getDefaultConfig קיים', ''));
    } else {
      results.push(result(SEV.ERROR, 'js-defaultconfig', 'getDefaultConfig חסר', 'פונקציית getDefaultConfig חייבת להיות מוגדרת'));
    }

    // 5. iconUrl
    if (/iconUrl\s*:/.test(code)) {
      results.push(result(SEV.PASS, 'js-iconurl', 'iconUrl מוגדר', ''));
    } else {
      results.push(result(SEV.WARNING, 'js-iconurl', 'iconUrl חסר', 'מומלץ להגדיר iconUrl לסמל'));
    }

    // 6. configTitle (Hebrew expected)
    const configTitleMatch = code.match(/configTitle\s*:\s*['"]([^'"]+)['"]/);
    if (configTitleMatch) {
      const title = configTitleMatch[1];
      // Check if contains Hebrew characters
      const hasHebrew = /[\u0590-\u05FF]/.test(title);
      if (hasHebrew) {
        results.push(result(SEV.PASS, 'js-configtitle', 'configTitle עברי תקין', `ערך: "${title}"`));
      } else {
        results.push(result(SEV.WARNING, 'js-configtitle', 'configTitle לא בעברית', `הכותרת "${title}" אינה בעברית - מומלץ לתרגם`));
      }
    } else {
      results.push(result(SEV.WARNING, 'js-configtitle', 'configTitle חסר', 'מומלץ להגדיר configTitle בעברית'));
    }

    // 7. Global variable leaks — vars outside IIFE
    const iifeStart = code.indexOf('(function');
    if (iifeStart > 0) {
      const beforeIife = code.substring(0, iifeStart);
      const globalVarMatch = beforeIife.match(/\bvar\s+\w+/g);
      if (globalVarMatch && globalVarMatch.length > 0) {
        results.push(result(SEV.ERROR, 'js-globals', 'משתנים גלובליים זוהו', `נמצאו הגדרות משתנים מחוץ ל-IIFE: ${globalVarMatch.join(', ')}`));
      } else {
        results.push(result(SEV.PASS, 'js-globals', 'אין משתנים גלובליים', 'לא נמצאו דליפות משתנים גלובליים'));
      }
    } else {
      results.push(result(SEV.PASS, 'js-globals', 'אין משתנים גלובליים', ''));
    }

    // 8. console.log (not console.warn/error)
    let consoleLogs = [];
    lines.forEach((line, i) => {
      if (/console\.log\s*\(/.test(line) && !/\/\//.test(line.split('console.log')[0])) {
        consoleLogs.push(`שורה ${i + 1}: ${line.trim().substring(0, 80)}`);
      }
    });
    if (consoleLogs.length === 0) {
      results.push(result(SEV.PASS, 'js-consolelog', 'אין console.log בקוד', ''));
    } else {
      results.push(result(SEV.WARNING, 'js-consolelog', `נמצאו ${consoleLogs.length} קריאות console.log`, consoleLogs.slice(0, 3).join('\n'), consoleLogs[0]?.match(/שורה (\d+)/)?.[1]));
    }

    // 9. debugger statements
    let debuggerLines = [];
    lines.forEach((line, i) => {
      if (/\bdebugger\b/.test(line) && !/\/\/.*debugger/.test(line)) {
        debuggerLines.push(i + 1);
      }
    });
    if (debuggerLines.length === 0) {
      results.push(result(SEV.PASS, 'js-debugger', 'אין הוראות debugger', ''));
    } else {
      results.push(result(SEV.ERROR, 'js-debugger', `נמצאו הוראות debugger`, `שורות: ${debuggerLines.join(', ')}`, debuggerLines[0]));
    }

    // 10. Error handling — try/catch
    const hasFetch = /\$http|fetch\s*\(|PIWebAPI|piwebapi/i.test(code);
    const hasTryCatch = /try\s*\{/.test(code);
    if (hasFetch && !hasTryCatch) {
      results.push(result(SEV.WARNING, 'js-trycatch', 'קריאות API ללא טיפול בשגיאות', 'נמצאו קריאות PI Web API ללא try/catch'));
    } else if (hasTryCatch) {
      results.push(result(SEV.PASS, 'js-trycatch', 'טיפול בשגיאות קיים', ''));
    } else {
      results.push(result(SEV.INFO, 'js-trycatch', 'לא נמצאו קריאות API', 'לא נמצאו קריאות PI Web API'));
    }

    // 11. Namespace usage check
    const namespacesUsed = [];
    if (/\bPIV20\b/.test(code)) namespacesUsed.push('PIV20');
    if (/\bMU20\b/.test(code)) namespacesUsed.push('MU20');
    if (/\bMM20\b/.test(code)) namespacesUsed.push('MM20');
    if (/\bPV\b/.test(code)) namespacesUsed.push('PV');
    if (namespacesUsed.length > 0) {
      results.push(result(SEV.INFO, 'js-namespace', `מרחבי שם בשימוש: ${namespacesUsed.join(', ')}`, ''));
    }

    // 12. Duplicate event listeners (simple heuristic)
    const addEventMatches = code.match(/\.addEventListener\s*\(\s*['"][^'"]+['"]/g) || [];
    const eventCounts = {};
    addEventMatches.forEach(e => {
      const ev = e.match(/['"]([^'"]+)['"]/)?.[1] || e;
      eventCounts[ev] = (eventCounts[ev] || 0) + 1;
    });
    const duplicateEvents = Object.entries(eventCounts).filter(([, c]) => c > 1);
    if (duplicateEvents.length > 0) {
      results.push(result(SEV.WARNING, 'js-dupevents', 'אזהרה: מאזיני אירועים כפולים אפשריים', `אירועים חוזרים: ${duplicateEvents.map(([e, c]) => `${e}(×${c})`).join(', ')}`));
    } else {
      results.push(result(SEV.PASS, 'js-dupevents', 'לא נמצאו מאזיני אירועים כפולים', ''));
    }

    // 13. dataUpdate callback
    if (/dataUpdate\s*:/.test(code) || /dataUpdate\s*=\s*function/.test(code) || /'dataUpdate'/.test(code) || /"dataUpdate"/.test(code)) {
      results.push(result(SEV.PASS, 'js-dataupdate', 'callback dataUpdate קיים', ''));
    } else {
      results.push(result(SEV.INFO, 'js-dataupdate', 'callback dataUpdate לא נמצא', 'ייתכן שהסמל אינו מונחה נתונים'));
    }

    // Q1: DataShape validation — check declared shape against PI Vision spec
    const VALID_SHAPES = ['Value', 'Gauge', 'Trend', 'Table', 'TimeSeries', 'XYPlot', 'None'];
    const dataShapeMatch = code.match(/DataShape\s*:\s*['"](\w+)['"]/);
    if (dataShapeMatch) {
      const declaredShape = dataShapeMatch[1];
      if (VALID_SHAPES.includes(declaredShape)) {
        results.push(result(SEV.PASS, 'js-datashape', 'DataShape "' + declaredShape + '" תקין', 'תואם למפרט PI Vision Extensibility'));
      } else {
        results.push(result(SEV.ERROR, 'js-datashape', 'DataShape "' + declaredShape + '" לא חוקי', 'ערכים חוקיים: ' + VALID_SHAPES.join(', ')));
      }

      // Q1 cross-check: verify onDataUpdate references match declared shape
      const hasOnDataUpdate = /onDataUpdate\s*[=:]\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\}/.exec(code);
      if (hasOnDataUpdate) {
        const body = hasOnDataUpdate[1];
        const shapeFieldMap = {
          'Value':      ['Value', 'Time', 'Label', 'Units', 'IsGood'],
          'Gauge':      ['Indicator', 'StartIndicator', 'ValueScaleLabels'],
          'Trend':      ['Traces', 'StartTime', 'EndTime', 'LineSegments'],
          'Table':      ['Rows', 'Columns'],
          'TimeSeries': ['Data', 'Values'],
          'XYPlot':     ['Points']
        };
        const expectedFields = shapeFieldMap[declaredShape] || [];
        const foundFields = expectedFields.filter(function(f) { return new RegExp('\\b' + f + '\\b').test(body); });
        if (foundFields.length > 0) {
          results.push(result(SEV.PASS, 'js-datashape-xref', 'onDataUpdate תואם ל-DataShape "' + declaredShape + '"', 'שדות שנמצאו: ' + foundFields.join(', ')));
        } else if (expectedFields.length > 0 && declaredShape !== 'None') {
          results.push(result(SEV.WARNING, 'js-datashape-xref', 'onDataUpdate אינו משתמש בשדות ' + declaredShape, 'צפוי לראות: ' + expectedFields.join(', ') + ' — ייתכן חוסר התאמה בין DataShape לנתונים בפועל'));
        }
      }
    } else {
      // No DataShape declared
      const hasDefaultConfig = /getDefaultConfig/.test(code);
      if (hasDefaultConfig) {
        results.push(result(SEV.WARNING, 'js-datashape', 'DataShape לא מוגדר ב-getDefaultConfig', 'מומלץ להגדיר DataShape: Value/Gauge/Trend/Table/TimeSeries'));
      }
    }

    // Q2: FormatOptions validation
    const formatMatch = code.match(/FormatOptions\s*:\s*\{([^}]*)\}/);
    if (formatMatch) {
      const formatBody = formatMatch[1];
      const KNOWN_FORMATS = ['TextColor','TextSize','TextFont','BackgroundColor','LineColor','LineWidth','LineDashType','ValueColor','ValueSize','TitleColor','TitleSize','TitleFont','TitleAlignment','FaceColor','NeedleColor','TickColor','BorderColor'];
      const formatKeys = [];
      const fkRe = /['"]?(\w+)['"]?\s*:/g;
      let fk;
      while ((fk = fkRe.exec(formatBody)) !== null) {
        formatKeys.push(fk[1]);
      }
      const unknownFormats = formatKeys.filter(function(k) { return KNOWN_FORMATS.indexOf(k) === -1; });
      if (unknownFormats.length === 0 && formatKeys.length > 0) {
        results.push(result(SEV.PASS, 'js-formatoptions', 'FormatOptions תקין (' + formatKeys.length + ' מאפיינים)', 'כל שמות הפורמט תואמים למפרט PI Vision'));
      } else if (unknownFormats.length > 0) {
        results.push(result(SEV.WARNING, 'js-formatoptions', 'FormatOptions עם שמות לא סטנדרטיים', 'לא מוכרים: ' + unknownFormats.join(', ') + ' — ייתכן שצריך formatMap'));
      }
    }

    // Q2: configOptions function signature validation
    const configOptMatch = code.match(/configOptions\s*:\s*function\s*\(([^)]*)\)/);
    if (configOptMatch) {
      const params = configOptMatch[1].split(',').map(function(p) { return p.trim(); }).filter(Boolean);
      if (params.length === 4) {
        results.push(result(SEV.PASS, 'js-configoptions', 'configOptions חתימה תקינה (4 פרמטרים)', 'תואם: configOptions(context, clickedElement, monitorOptions, layoutOptions)'));
      } else {
        results.push(result(SEV.WARNING, 'js-configoptions', 'configOptions עם ' + params.length + ' פרמטרים (צפוי 4)', 'חתימה צפויה: configOptions(context, clickedElement, monitorOptions, layoutOptions)'));
      }
      // Check if it uses push pattern (not return array)
      const configOptBody = code.substring(code.indexOf(configOptMatch[0]));
      if (/layoutOptions\.push|monitorOptions\.push/.test(configOptBody)) {
        results.push(result(SEV.PASS, 'js-configoptions-push', 'configOptions משתמש ב-push (תבנית PI Vision)', ''));
      } else if (/return\s*\[/.test(configOptBody.substring(0, 500))) {
        results.push(result(SEV.ERROR, 'js-configoptions-push', 'configOptions מחזיר מערך במקום push', 'יש להשתמש ב-layoutOptions.push() במקום return []'));
      }
    } else if (/configOptions\s*:\s*\[/.test(code)) {
      results.push(result(SEV.ERROR, 'js-configoptions', 'configOptions מוגדר כמערך', 'חייב להיות פונקציה עם 4 פרמטרים: configOptions(context, clickedElement, monitorOptions, layoutOptions)'));
    }

    // 14. $watch/$watchGroup cleanup
    const hasWatch = /\$watch\b|\$watchGroup\b/.test(code);
    if (hasWatch) {
      // Check if they store the deregister function
      const storesDeregister = /=\s*\$scope\.\$watch|=\s*\$scope\.\$watchGroup/.test(code);
      const hasDestroy = /\$on\s*\(\s*['"]\$destroy['"]/.test(code);
      if (storesDeregister && hasDestroy) {
        results.push(result(SEV.PASS, 'js-watchclean', 'ניקוי $watch תקין', '$watch מבוטל ב-$destroy'));
      } else if (hasWatch && !hasDestroy) {
        results.push(result(SEV.WARNING, 'js-watchclean', 'ייתכן דליפת $watch', 'לא נמצא ביטול $watch ב-$destroy - עלול לגרום לדליפות זיכרון'));
      } else {
        results.push(result(SEV.INFO, 'js-watchclean', '$watch ללא ניקוי מפורש', 'בדוק ביטול $watch בסיום חיי הסמל'));
      }
    } else {
      results.push(result(SEV.PASS, 'js-watchclean', 'לא נמצאו $watch', ''));
    }

    // Q3: Lifecycle callback completeness
    // PI Vision symbols should implement: init, onDataUpdate, onResize, onConfigChange, onDestroy
    const lifecycleCallbacks = {
      'init':           /\.init\s*=\s*function|prototype\.init\s*=\s*function/,
      'onDataUpdate':   /onDataUpdate\s*[=:]\s*function/,
      'onResize':       /onResize\s*[=:]\s*function/,
      'onConfigChange': /onConfigChange\s*[=:]\s*function/,
      'onDestroy':      /onDestroy\s*[=:]\s*function/
    };
    const foundCallbacks = [];
    const missingCallbacks = [];
    Object.keys(lifecycleCallbacks).forEach(function(name) {
      if (lifecycleCallbacks[name].test(code)) {
        foundCallbacks.push(name);
      } else {
        missingCallbacks.push(name);
      }
    });

    if (foundCallbacks.length === 5) {
      results.push(result(SEV.PASS, 'js-lifecycle', 'כל 5 callbacks מחזור חיים מוגדרים', 'init, onDataUpdate, onResize, onConfigChange, onDestroy'));
    } else if (foundCallbacks.length >= 3) {
      results.push(result(SEV.INFO, 'js-lifecycle', foundCallbacks.length + '/5 callbacks מחזור חיים', 'חסרים: ' + missingCallbacks.join(', ')));
    } else if (foundCallbacks.length >= 1) {
      results.push(result(SEV.WARNING, 'js-lifecycle', 'רק ' + foundCallbacks.length + '/5 callbacks מחזור חיים', 'חסרים: ' + missingCallbacks.join(', ') + ' — מומלץ להוסיף לפחות init + onDataUpdate + onDestroy'));
    } else {
      results.push(result(SEV.WARNING, 'js-lifecycle', 'לא נמצאו callbacks מחזור חיים', 'הסמל אינו מיישם init/onDataUpdate/onResize/onConfigChange/onDestroy'));
    }

    // Q3: Check if onDestroy cleans up resources
    if (/onDestroy\s*[=:]\s*function/.test(code)) {
      const destroyBody = code.substring(code.search(/onDestroy\s*[=:]\s*function/));
      const hasCleanup = /clearInterval|clearTimeout|disconnect|removeEventListener|off\(|destroy\(|remove\(/.test(destroyBody.substring(0, 500));
      if (hasCleanup) {
        results.push(result(SEV.PASS, 'js-destroy-cleanup', 'onDestroy מנקה משאבים', 'נמצאו פעולות ניקוי (intervals/listeners/observers)'));
      } else {
        results.push(result(SEV.INFO, 'js-destroy-cleanup', 'onDestroy ללא ניקוי מפורש', 'בדוק שכל intervals, listeners ו-observers מנוקים ב-onDestroy'));
      }
    }

    // Q3: StateVariables validation
    const stateVarsMatch = code.match(/StateVariables\s*:\s*\[([^\]]*)\]/);
    if (stateVarsMatch) {
      const stateVars = stateVarsMatch[1].split(',').map(function(s) { return s.trim().replace(/['"]/g, ''); }).filter(Boolean);
      if (stateVars.length > 0) {
        results.push(result(SEV.PASS, 'js-statevars', 'StateVariables מוגדר (' + stateVars.length + ' משתנים)', 'משתני מצב: ' + stateVars.join(', ')));
      }
    }

    // Q4a: inject array validation
    const KNOWN_SERVICES = new Set([
      '$scope', '$http', '$interval', '$timeout', '$q', '$sce',
      '$parse', '$compile', '$filter', '$rootScope', '$location',
      '$window', '$document', '$element', '$attrs',
      'log', '$log', 'webServices', 'tagProvider',
      'eventFrameService', 'displayProvider', 'timeProvider',
      'notificationService', 'piaborting'
    ]);
    const injectMatch = code.match(/inject\s*:\s*\[([^\]]*)\]/);
    if (injectMatch) {
      const injectList = injectMatch[1].split(',')
        .map(function(s) { return s.trim().replace(/['"]/g, ''); })
        .filter(Boolean);
      if (injectList.length > 0) {
        const unknownServices = injectList.filter(function(svc) { return !KNOWN_SERVICES.has(svc); });
        if (unknownServices.length === 0) {
          results.push(result(SEV.PASS, 'js-inject', 'מערך inject תקין (' + injectList.length + ' שירותים)', 'שירותים: ' + injectList.join(', ')));
        } else {
          results.push(result(SEV.WARNING, 'js-inject', unknownServices.length + ' שירותים לא מוכרים ב-inject', 'לא מוכרים: ' + unknownServices.join(', ') + ' — ודא שהשמות נכונים'));
        }
      }
    }

    return results;
  }

  // ─── HTML TEMPLATE CHECKS ────────────────────────────────────────────────

  function checkHTMLTemplate(html, symbolName) {
    const results = [];

    // 1. Valid HTML structure (matching tags)
    const openTags = [];
    const tagPattern = /<(\/?)([\w-]+)([^>]*?)(\s*\/)?>/g;
    let match;
    const voidElements = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
    let tagMismatch = false;
    let tagMismatchDetail = '';

    const simpleHtmlParser = (htmlStr) => {
      const stack = [];
      const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g;
      let m;
      while ((m = re.exec(htmlStr)) !== null) {
        const isClose = m[1] === '/';
        const tag = m[2].toLowerCase();
        const isSelfClose = m[4] === '/' || voidElements.has(tag);
        if (!isClose && !isSelfClose) {
          stack.push(tag);
        } else if (isClose) {
          if (stack.length && stack[stack.length - 1] === tag) {
            stack.pop();
          } else if (stack.includes(tag)) {
            return { ok: false, detail: `תג </${tag}> לא מותאם` };
          }
        }
      }
      if (stack.length > 0) {
        return { ok: false, detail: `תגים פתוחים שלא נסגרו: ${stack.slice(-3).join(', ')}` };
      }
      return { ok: true };
    };

    const htmlCheck = simpleHtmlParser(html);
    if (htmlCheck.ok) {
      results.push(result(SEV.PASS, 'html-structure', 'מבנה HTML תקין', ''));
    } else {
      results.push(result(SEV.WARNING, 'html-structure', 'בעיה במבנה HTML', htmlCheck.detail));
    }

    // 2. AngularJS directives
    const ngDirectives = ['ng-repeat', 'ng-show', 'ng-click', 'ng-class', 'ng-style', 'ng-model', 'ng-if'];
    const foundDirectives = ngDirectives.filter(d => html.includes(d));
    if (foundDirectives.length > 0) {
      results.push(result(SEV.PASS, 'html-ng-directives', `נמצאו ${foundDirectives.length} דירקטיבות AngularJS`, foundDirectives.join(', ')));
    } else {
      results.push(result(SEV.INFO, 'html-ng-directives', 'לא נמצאו דירקטיבות AngularJS', 'ייתכן שהתבנית פשוטה ואינה משתמשת בדירקטיבות'));
    }

    // 3. Interpolation {{ }} closed
    const openInterp = (html.match(/\{\{/g) || []).length;
    const closeInterp = (html.match(/\}\}/g) || []).length;
    if (openInterp === closeInterp) {
      results.push(result(SEV.PASS, 'html-interpolation', 'ביטויי אינטרפולציה {{ }} תקינים', `${openInterp} ביטויים נמצאו`));
    } else {
      results.push(result(SEV.ERROR, 'html-interpolation', 'ביטויי אינטרפולציה לא מאוזנים', `פתיחות: ${openInterp}, סגירות: ${closeInterp}`));
    }

    // 4. Inline styles warning
    const inlineStyleCount = (html.match(/\bstyle\s*=\s*['"]/g) || []).length;
    if (inlineStyleCount > 3) {
      results.push(result(SEV.WARNING, 'html-inline-styles', `${inlineStyleCount} סגנונות inline נמצאו`, 'עדיף להשתמש במחלקות CSS במקום style inline'));
    } else if (inlineStyleCount > 0) {
      results.push(result(SEV.INFO, 'html-inline-styles', `${inlineStyleCount} סגנונות inline`, 'ניתן להעביר לקובץ CSS'));
    } else {
      results.push(result(SEV.PASS, 'html-inline-styles', 'אין סגנונות inline', ''));
    }

    // 5. RTL support
    const hasRtlAttr = /dir\s*=\s*['"]rtl['"]/.test(html);
    const hasRtlClass = /rtl/i.test(html);
    if (hasRtlAttr) {
      results.push(result(SEV.PASS, 'html-rtl', 'תמיכה RTL: dir="rtl" קיים', ''));
    } else if (hasRtlClass) {
      results.push(result(SEV.PASS, 'html-rtl', 'תמיכה RTL: מחלקת RTL קיימת', ''));
    } else {
      results.push(result(SEV.INFO, 'html-rtl', 'לא נמצאה תמיכה מפורשת ב-RTL', 'בדוק אם הסמל מציג טקסט עברי'));
    }

    // 6. Hardcoded English text (basic check)
    const englishTextPattern = />[A-Za-z]{4,}\s*</g;
    const englishMatches = [];
    let em;
    const tempHtml = html.replace(/<!--[\s\S]*?-->/g, '');
    while ((em = englishTextPattern.exec(tempHtml)) !== null) {
      // Skip AngularJS expressions and attributes
      const text = em[0].slice(1, -1).trim();
      if (!text.startsWith('{{') && !text.startsWith('ng-') && text.length > 4 && !/^[A-Z_]+$/.test(text)) {
        englishMatches.push(`"${text}"`);
      }
    }
    const uniqueEn = [...new Set(englishMatches)].slice(0, 5);
    if (uniqueEn.length === 0) {
      results.push(result(SEV.PASS, 'html-english', 'לא נמצא טקסט אנגלי קשיח', ''));
    } else {
      results.push(result(SEV.WARNING, 'html-english', `${uniqueEn.length} ביטויים אנגליים קשיחים נמצאו`, uniqueEn.join(', ')));
    }

    // Q5: Enhanced Hebrew/RTL compliance
    const hebrewTextRe = /[\u0590-\u05FF]/;
    const hasAnyHebrew = hebrewTextRe.test(html);
    const allContainers = (html.match(/<div[^>]*>/gi) || []).concat(html.match(/<span[^>]*>/gi) || []);
    const rtlContainers = allContainers.filter(function(tag) { return /dir\s*=\s*['"]rtl['"]/i.test(tag); });
    const hebrewLabels = (html.match(/>[\u0590-\u05FF][^<]{1,40}</g) || []);

    var q5Score = 0;
    if (hasRtlAttr || rtlContainers.length > 0) q5Score++;
    if (hasAnyHebrew) q5Score++;
    if (hebrewLabels.length >= 2) q5Score++;

    if (q5Score >= 3) {
      results.push(result(SEV.PASS, 'html-rtl-compliance', 'תאימות RTL/עברית מלאה', 'dir="rtl" + תוויות עבריות + ' + hebrewLabels.length + ' labels'));
    } else if (q5Score >= 1) {
      results.push(result(SEV.INFO, 'html-rtl-compliance', 'תאימות RTL/עברית חלקית (' + q5Score + '/3)', 'בדוק: dir="rtl" על containers, labels עבריים, tooltips'));
    } else {
      results.push(result(SEV.WARNING, 'html-rtl-compliance', 'לא נמצאה תאימות RTL/עברית', 'מו��לץ: dir="rtl" על containers ראשיים, תוויות עבריות'));
    }

    // 7. Config properties extraction (return list for cross-check)
    const configProps = [];
    const ngModelMatches = html.matchAll(/ng-model\s*=\s*['"]config\.([^'"]+)['"]/g);
    for (const m of ngModelMatches) {
      configProps.push(m[1]);
    }

    return { results, configProps };
  }

  // ─── HTML CONFIG CHECKS ──────────────────────────────────────────────────

  function checkHTMLConfig(html, symbolName) {
    const results = [];
    const configProps = [];

    // Extract config property references
    const ngModelMatches = html.matchAll(/ng-model\s*=\s*['"]config\.([^'"]+)['"]/g);
    for (const m of ngModelMatches) {
      configProps.push(m[1]);
    }

    if (configProps.length > 0) {
      results.push(result(SEV.INFO, 'config-props', `${configProps.length} מאפייני config נמצאו`, configProps.slice(0, 8).join(', ')));
    } else {
      results.push(result(SEV.INFO, 'config-props', 'לא נמצאו שדות config', ''));
    }

    // Check for Hebrew labels
    const hasHebrew = /[\u0590-\u05FF]/.test(html);
    if (hasHebrew) {
      results.push(result(SEV.PASS, 'config-hebrew', 'תוויות עבריות נמצאו בקובץ תצורה', ''));
    } else {
      results.push(result(SEV.WARNING, 'config-hebrew', 'לא נמצאו תוויות עבריות', 'מומלץ להוסיף תוויות עבריות לממשק התצורה'));
    }

    return { results, configProps };
  }

  // ─── CSS CHECKS ──────────────────────────────────────────────────────────

  function checkCSS(css, symbolName, isWow) {
    const results = [];
    const lines = css.split('\n');

    // 1. :host selector (WOW symbols)
    if (isWow) {
      if (/:host\b/.test(css)) {
        results.push(result(SEV.PASS, 'css-host', 'בורר :host קיים', 'בידוד Shadow DOM תקין'));
      } else {
        results.push(result(SEV.WARNING, 'css-host', 'בורר :host חסר', 'סמלי WOW צריכים להשתמש ב-:host לבידוד Shadow DOM'));
      }
    } else {
      results.push(result(SEV.INFO, 'css-host', 'בדיקת :host - לא רלוונטי', 'סמלי v20 אינם משתמשים ב-Shadow DOM'));
    }

    // 2. !important abuse
    const importantCount = (css.match(/!important/g) || []).length;
    if (importantCount === 0) {
      results.push(result(SEV.PASS, 'css-important', 'אין שימוש ב-!important', ''));
    } else if (importantCount <= 5) {
      results.push(result(SEV.INFO, 'css-important', `${importantCount} שימושים ב-!important`, 'שימוש מועט - ניתן לשפר'));
    } else {
      results.push(result(SEV.WARNING, 'css-important', `${importantCount} שימושים ב-!important`, 'שימוש מרובה ב-!important מקשה על תחזוקה'));
    }

    // 3. Fixed pixel fonts
    const pxFontLines = [];
    lines.forEach((line, i) => {
      if (/font-size\s*:\s*\d+px/.test(line)) {
        pxFontLines.push(`שורה ${i + 1}: ${line.trim().substring(0, 60)}`);
      }
    });
    if (pxFontLines.length === 0) {
      results.push(result(SEV.PASS, 'css-fontsize', 'גופנים בפיקסלים קבועים לא נמצאו', 'שימוש ב-rem/em מומלץ'));
    } else {
      results.push(result(SEV.WARNING, 'css-fontsize', `${pxFontLines.length} גדלי גופן קבועים בפיקסלים`, pxFontLines.slice(0, 3).join('\n')));
    }

    // 4. RTL support
    if (/direction\s*:\s*rtl/.test(css)) {
      results.push(result(SEV.PASS, 'css-rtl', 'direction: rtl קיים ב-CSS', ''));
    } else {
      results.push(result(SEV.INFO, 'css-rtl', 'direction: rtl לא נמצא ב-CSS', 'בדוק אם הסמל מציג טקסט'));
    }

    // 5. z-index abuse
    const highZIndex = [];
    lines.forEach((line, i) => {
      const zm = line.match(/z-index\s*:\s*(\d+)/);
      if (zm && parseInt(zm[1]) > 9999) {
        highZIndex.push(`שורה ${i + 1}: z-index: ${zm[1]}`);
      }
    });
    if (highZIndex.length === 0) {
      results.push(result(SEV.PASS, 'css-zindex', 'ערכי z-index סבירים', ''));
    } else {
      results.push(result(SEV.WARNING, 'css-zindex', `${highZIndex.length} ערכי z-index חריגים`, highZIndex.join('\n')));
    }

    // 6. Duplicate selectors
    const selectorMap = {};
    const selectorRe = /^([.#\w\s:[\],>+~*-]+)\s*\{/gm;
    let sm;
    while ((sm = selectorRe.exec(css)) !== null) {
      const sel = sm[1].trim();
      if (sel && !sel.includes('@')) {
        selectorMap[sel] = (selectorMap[sel] || 0) + 1;
      }
    }
    const dupSelectors = Object.entries(selectorMap).filter(([, c]) => c > 1).map(([s]) => s);
    if (dupSelectors.length === 0) {
      results.push(result(SEV.PASS, 'css-dup-selectors', 'אין בוררים כפולים', ''));
    } else {
      results.push(result(SEV.WARNING, 'css-dup-selectors', `${dupSelectors.length} בוררים כפולים`, dupSelectors.slice(0, 5).join(', ')));
    }

    // 7. Animations and prefers-reduced-motion
    const hasAnimation = /@keyframes|animation\s*:/.test(css);
    const hasPrefersReducedMotion = /prefers-reduced-motion/.test(css);
    if (hasAnimation) {
      if (hasPrefersReducedMotion) {
        results.push(result(SEV.PASS, 'css-animation-a11y', 'אנימציות עם תמיכה ב-prefers-reduced-motion', ''));
      } else {
        results.push(result(SEV.WARNING, 'css-animation-a11y', 'אנימציות ללא תמיכה ב-prefers-reduced-motion', 'הוסף @media (prefers-reduced-motion: reduce) לבטל אנימציות עבור משתמשים רגישים'));
      }
    } else {
      results.push(result(SEV.PASS, 'css-animation-a11y', 'לא נמצאו אנימציות', ''));
    }

    // 8. Color contrast (basic heuristic)
    const colorWarnings = [];
    if (/color\s*:\s*white|color\s*:\s*#fff|color\s*:\s*#ffffff/.test(css) &&
        /background[^:]*:\s*(white|#fff|#ffffff|#f0f0f0|#eee|#e0e0e0|lightgray|lightyellow)/.test(css)) {
      colorWarnings.push('טקסט לבן על רקע בהיר - ניגוד נמוך');
    }
    if (colorWarnings.length > 0) {
      results.push(result(SEV.WARNING, 'css-contrast', 'בעיית ניגוד צבעים אפשרית', colorWarnings.join(', ')));
    } else {
      results.push(result(SEV.PASS, 'css-contrast', 'לא זוהו בעיות ניגוד ברורות', ''));
    }

    // Extract class names for cross-check
    const classNames = new Set();
    const classRe = /\.([a-zA-Z][\w-]*)/g;
    let cm;
    while ((cm = classRe.exec(css)) !== null) {
      classNames.add(cm[1]);
    }

    return { results, classNames };
  }

  // ─── CROSS-FILE CHECKS ──────────────────────────────────────────────────

  function checkCrossFile(files, symbolName) {
    const results = [];
    const { js, css, template, config } = files;

    // 1. All 4 files present
    const missing = [];
    if (!js || !js.content) missing.push('.js');
    if (!css || !css.content) missing.push('.css');
    if (!template || !template.content) missing.push('-template.html');
    if (!config || !config.content) missing.push('-config.html');

    if (missing.length === 0) {
      results.push(result(SEV.PASS, 'cross-files', 'כל 4 הקבצים קיימים', ''));
    } else {
      results.push(result(SEV.ERROR, 'cross-files', `קבצים חסרים: ${missing.join(', ')}`, 'כל הסמלים חייבים להכיל 4 קבצים: .js, .css, -template.html, -config.html'));
    }

    if (!js?.content || !css?.content) return results;

    // 2. CSS class names in template
    const cssClasses = new Set();
    const classRe = /\.([a-zA-Z][\w-]*)/g;
    let cm;
    while ((cm = classRe.exec(css.content)) !== null) {
      cssClasses.add(cm[1]);
    }

    const templateClassRe = /class\s*=\s*['"]([^'"]+)['"]/g;
    let tcm;
    const undefinedClasses = [];
    const templateHtml = template?.content || '';
    while ((tcm = templateClassRe.exec(templateHtml)) !== null) {
      const classStr = tcm[1];
      classStr.split(/\s+/).forEach(cls => {
        if (cls && !cls.startsWith('ng-') && !cls.startsWith('{{') && cssClasses.size > 0 && !cssClasses.has(cls) && cls.length > 1) {
          undefinedClasses.push(cls);
        }
      });
    }
    const uniqueUndefined = [...new Set(undefinedClasses)].filter(c => !c.includes('{'));
    if (uniqueUndefined.length === 0) {
      results.push(result(SEV.PASS, 'cross-css-classes', 'מחלקות CSS בתבנית מוגדרות בקובץ CSS', ''));
    } else if (uniqueUndefined.length <= 3) {
      results.push(result(SEV.INFO, 'cross-css-classes', `${uniqueUndefined.length} מחלקות לא מוגדרות בקובץ CSS`, uniqueUndefined.join(', ')));
    } else {
      results.push(result(SEV.WARNING, 'cross-css-classes', `${uniqueUndefined.length} מחלקות לא מוגדרות`, uniqueUndefined.slice(0, 6).join(', ')));
    }

    // 3. Config properties: JS getDefaultConfig vs config HTML
    const jsConfigProps = [];
    const jsDefaultConfigMatch = js.content.match(/getDefaultConfig\s*[=:]\s*function[^{]*\{([\s\S]*?)(?=\},\s*\w+\s*:|$)/);
    if (jsDefaultConfigMatch) {
      const configBody = jsDefaultConfigMatch[1];
      const propRe = /['"]?(\w+)['"]?\s*:/g;
      let pm;
      while ((pm = propRe.exec(configBody)) !== null) {
        if (!['return', 'function', 'if', 'else', 'var', 'let', 'const'].includes(pm[1])) {
          jsConfigProps.push(pm[1]);
        }
      }
    }

    const configHtml = config?.content || '';
    const configHtmlProps = [];
    const ngModelRe = /ng-model\s*=\s*['"]config\.([^'"]+)['"]/g;
    let ngm;
    while ((ngm = ngModelRe.exec(configHtml)) !== null) {
      configHtmlProps.push(ngm[1].split('.')[0]); // top-level prop
    }

    if (jsConfigProps.length > 0 && configHtmlProps.length > 0) {
      const missingInConfig = jsConfigProps.filter(p => !configHtmlProps.includes(p) && p.length > 2);
      const missingInJS = configHtmlProps.filter(p => !jsConfigProps.includes(p));
      
      if (missingInJS.length > 0) {
        results.push(result(SEV.WARNING, 'cross-config-props', `${missingInJS.length} מאפייני config בממשק אינם ב-getDefaultConfig`, missingInJS.slice(0, 5).join(', ')));
      } else {
        results.push(result(SEV.PASS, 'cross-config-props', 'מאפייני config מסונכרנים', ''));
      }
    } else {
      results.push(result(SEV.INFO, 'cross-config-props', 'לא ניתן לבדוק סנכרון config', 'בדיקה ידנית מומלצת'));
    }

    // 4. Plugin dependencies
    const jsContent = js.content;
    const usedNamespaces = [];
    if (/\bPIV20\b/.test(jsContent)) usedNamespaces.push('PIV20');
    if (/\bMM20\b/.test(jsContent)) usedNamespaces.push('MM20');
    if (/\bMU20\b/.test(jsContent)) usedNamespaces.push('MU20');
    if (/\bWOW\b/.test(jsContent)) usedNamespaces.push('WOW');

    if (usedNamespaces.length > 0) {
      results.push(result(SEV.INFO, 'cross-plugins', `תלויות plugins: ${usedNamespaces.join(', ')}`, 'ודא שקבצי ה-plugin הנדרשים נטענים ב-PI Vision'));
    }

    // 5. Icon file reference
    const iconUrlMatch = jsContent.match(/iconUrl\s*:\s*['"]([^'"]+)['"]/);
    if (iconUrlMatch) {
      results.push(result(SEV.INFO, 'cross-icon', `אייקון מוגדר: ${iconUrlMatch[1]}`, 'ודא שקובץ האייקון קיים בנתיב הנכון'));
    }

    // Q4b: Template binding cross-check — {{expr}} vs JS scope properties
    if (templateHtml) {
      const bindingRe = /\{\{\s*([a-zA-Z_]\w*(?:\.\w+)?)\s*(?:\|[^}]*)?\}\}/g;
      let bm;
      const templateBindings = new Set();
      while ((bm = bindingRe.exec(templateHtml)) !== null) {
        const prop = bm[1].split('.')[0]; // top-level scope property
        // skip AngularJS builtins and common expressions
        if (!['true', 'false', 'null', 'undefined', '$index', '$first', '$last', '$even', '$odd', '$parent', 'item', 'row', 'col', 'config'].includes(prop)) {
          templateBindings.add(prop);
        }
      }

      if (templateBindings.size > 0) {
        // Extract scope property assignments from JS: scope.X = ... or this.X = ...
        const scopeAssignRe = /(?:scope|this)\.(\w+)\s*=/g;
        let sam;
        const scopeProps = new Set();
        while ((sam = scopeAssignRe.exec(jsContent)) !== null) {
          scopeProps.add(sam[1]);
        }
        // Also get properties from getDefaultConfig return values
        const configReturnRe = /(\w+)\s*:/g;
        let crm;
        const defaultConfigMatch = jsContent.match(/getDefaultConfig[\s\S]*?return\s*\{([\s\S]*?)\}/);
        if (defaultConfigMatch) {
          while ((crm = configReturnRe.exec(defaultConfigMatch[1])) !== null) {
            scopeProps.add(crm[1]);
          }
        }

        const unboundBindings = [...templateBindings].filter(b => !scopeProps.has(b));
        if (unboundBindings.length === 0) {
          results.push(result(SEV.PASS, 'cross-template-bindings', 'כל ה-bindings בתבנית מקושרים ל-scope', `${templateBindings.size} bindings נבדקו`));
        } else if (unboundBindings.length <= 3) {
          results.push(result(SEV.INFO, 'cross-template-bindings', `${unboundBindings.length} bindings לא נמצאו ב-scope`, unboundBindings.join(', ') + ' — יתכן שמוגדרים דינמית'));
        } else {
          results.push(result(SEV.WARNING, 'cross-template-bindings', `${unboundBindings.length} bindings ללא מקור scope מזוהה`, unboundBindings.slice(0, 6).join(', ') + ' — בדוק שהם מוגדרים בזמן ריצה'));
        }
      }
    }

    return results;
  }

  // ─── MAIN ANALYZE FUNCTION ───────────────────────────────────────────────

  function analyzeSymbol(symbolName, files) {
    const category = symbolName.endsWith('-wow') ? 'wow' : 'v20';
    const isWow = category === 'wow';

    const allResults = {
      symbolName,
      category,
      js: [],
      htmlTemplate: [],
      htmlConfig: [],
      css: [],
      crossFile: []
    };

    // Run checks if files are available
    if (files.js?.content) {
      allResults.js = checkJS(files.js.content, symbolName);
    } else {
      allResults.js = [result(SEV.ERROR, 'js-missing', 'קובץ JS חסר', `הקובץ sym-${symbolName}.js לא נמצא`)];
    }

    if (files.template?.content) {
      const { results: tResults } = checkHTMLTemplate(files.template.content, symbolName);
      allResults.htmlTemplate = tResults;
    } else {
      allResults.htmlTemplate = [result(SEV.ERROR, 'template-missing', 'קובץ template HTML חסר', '')];
    }

    if (files.config?.content) {
      const { results: cResults } = checkHTMLConfig(files.config.content, symbolName);
      allResults.htmlConfig = cResults;
    } else {
      allResults.htmlConfig = [result(SEV.ERROR, 'config-missing', 'קובץ config HTML חסר', '')];
    }

    if (files.css?.content) {
      const { results: cssResults } = checkCSS(files.css.content, symbolName, isWow);
      allResults.css = cssResults;
    } else {
      allResults.css = [result(SEV.ERROR, 'css-missing', 'קובץ CSS חסר', '')];
    }

    allResults.crossFile = checkCrossFile(files, symbolName);

    // Calculate scores
    allResults.scores = calculateScores(allResults);
    allResults.overallStatus = getOverallStatus(allResults.scores);

    return allResults;
  }

  function calculateScores(analysis) {
    const calcScore = (checks) => {
      if (!checks || checks.length === 0) return 0;
      const errors = checks.filter(c => c.severity === SEV.ERROR).length;
      const warnings = checks.filter(c => c.severity === SEV.WARNING).length;
      const passes = checks.filter(c => c.severity === SEV.PASS).length;
      const infos = checks.filter(c => c.severity === SEV.INFO).length;
      const scorable = errors + warnings + passes; // exclude info-only checks
      if (scorable === 0) return 100;
      // Each error deducts 15 points, each warning deducts 5 points from 100
      const deductions = Math.min(100, (errors * 15) + (warnings * 5));
      return Math.max(0, Math.min(100, 100 - deductions));
    };

    const jsScore = calcScore(analysis.js);
    const htmlScore = calcScore([...analysis.htmlTemplate, ...analysis.htmlConfig]);
    const cssScore = calcScore(analysis.css);
    const crossScore = calcScore(analysis.crossFile);
    const overall = Math.round((jsScore + htmlScore + cssScore + crossScore) / 4);

    return { js: jsScore, html: htmlScore, css: cssScore, cross: crossScore, overall };
  }

  function getOverallStatus(scores) {
    if (scores.overall >= 85) return 'pass';
    if (scores.overall >= 60) return 'warning';
    return 'error';
  }

  function getSummary(analyses) {
    const total = analyses.length;
    let totalErrors = 0, totalWarnings = 0, totalPasses = 0, totalInfos = 0;
    let healthTotal = 0;

    const byCategory = { v20: 0, wow: 0 };

    analyses.forEach(a => {
      const allChecks = [...a.js, ...a.htmlTemplate, ...a.htmlConfig, ...a.css, ...a.crossFile];
      totalErrors += allChecks.filter(c => c.severity === SEV.ERROR).length;
      totalWarnings += allChecks.filter(c => c.severity === SEV.WARNING).length;
      totalPasses += allChecks.filter(c => c.severity === SEV.PASS).length;
      totalInfos += allChecks.filter(c => c.severity === SEV.INFO).length;
      healthTotal += a.scores.overall;
      byCategory[a.category]++;
    });

    return {
      total,
      totalErrors,
      totalWarnings,
      totalPasses,
      totalInfos,
      healthScore: total > 0 ? Math.round(healthTotal / total) : 0,
      byCategory,
      statusCounts: {
        pass: analyses.filter(a => a.overallStatus === 'pass').length,
        warning: analyses.filter(a => a.overallStatus === 'warning').length,
        error: analyses.filter(a => a.overallStatus === 'error').length
      }
    };
  }

  // Public API
  return {
    analyzeSymbol,
    getSummary,
    SEV
  };

})();

export default QAEngine;
