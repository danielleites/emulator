/**
 * emu-af.js — AF Asset Framework Browser Panel
 * Tree browser, tag search, drag-and-drop support
 */
(function (window, $) {
    'use strict';

    var EMU_AF = window.EMU_AF = {};

    var DEMO_TAGS = [
        // Power generation
        { tag: 'ASH.U1.MW.ACTIVE_POWER',  val: 575.4,  unit: 'MW',    cat: 'ייצור' },
        { tag: 'ASH.U1.MW.REACTIVE_POWER',val: 120.2,  unit: 'MVAR',  cat: 'ייצור' },
        { tag: 'ASH.U2.MW.ACTIVE_POWER',  val: 590.1,  unit: 'MW',    cat: 'ייצור' },
        { tag: 'ASH.U3.MW.ACTIVE_POWER',  val: 480.8,  unit: 'MW',    cat: 'ייצור' },
        { tag: 'ASH.U4.MW.ACTIVE_POWER',  val: 510.3,  unit: 'MW',    cat: 'ייצור' },
        { tag: 'HAD.U1.MW.ACTIVE_POWER',  val: 440.7,  unit: 'MW',    cat: 'ייצור' },
        { tag: 'HAD.U2.MW.ACTIVE_POWER',  val: 435.9,  unit: 'MW',    cat: 'ייצור' },
        { tag: 'ORT.U1.MW.ACTIVE_POWER',  val: 390.2,  unit: 'MW',    cat: 'ייצור' },
        { tag: 'ORT.U3.MW.OUTPUT',        val: 410.5,  unit: 'MW',    cat: 'ייצור' },
        { tag: 'RUT.U1.MW.ACTIVE_POWER',  val: 500.0,  unit: 'MW',    cat: 'ייצור' },
        { tag: 'RDG.U1.MW.OUTPUT',        val: 180.3,  unit: 'MW',    cat: 'ייצור' },
        // Gas / Fuel
        { tag: 'ASH.U1.GAS.FLOW_RATE',    val: 145.2,  unit: 'MSCF/h',cat: 'גז' },
        { tag: 'ASH.U2.GAS.FLOW_RATE',    val: 148.7,  unit: 'MSCF/h',cat: 'גז' },
        { tag: 'HAD.U1.GAS.PRESSURE',     val: 52.3,   unit: 'bar',   cat: 'גז' },
        { tag: 'ORT.COAL.FEED_RATE',      val: 78.4,   unit: 't/h',   cat: 'גז' },
        // Temperature
        { tag: 'ASH.U1.EXHAUST.TEMP',     val: 487.3,  unit: '°C',    cat: 'טמפרטורה' },
        { tag: 'ASH.U2.STEAM.TEMP',       val: 540.0,  unit: '°C',    cat: 'טמפרטורה' },
        { tag: 'HAD.U1.COOLING.TEMP',     val: 28.5,   unit: '°C',    cat: 'טמפרטורה' },
        { tag: 'ORT.U1.TURBINE.TEMP',     val: 512.1,  unit: '°C',    cat: 'טמפרטורה' },
        // Grid
        { tag: 'ASH.GRID.FREQUENCY',      val: 49.987, unit: 'Hz',    cat: 'רשת' },
        { tag: 'ASH.GRID.VOLTAGE_400KV',  val: 401.2,  unit: 'kV',    cat: 'רשת' },
        { tag: 'HAD.GRID.VOLTAGE_400KV',  val: 399.8,  unit: 'kV',    cat: 'רשת' },
        { tag: 'GRID.TOTAL.GENERATION',   val: 8842.5, unit: 'MW',    cat: 'רשת' },
        { tag: 'GRID.TOTAL.DEMAND',       val: 9100.0, unit: 'MW',    cat: 'רשת' },
        // Emissions
        { tag: 'ASH.CO2.EMISSIONS_RATE',  val: 820.4,  unit: 'g/kWh', cat: 'פליטות' },
        { tag: 'HAD.CO2.DAILY_TOTAL',     val: 4521.2, unit: 't',     cat: 'פליטות' },
        { tag: 'ORT.CO2.ANNUAL_BUDGET',   val: 1820000,unit: 't',     cat: 'פליטות' },
        { tag: 'ASH.NOX.EMISSIONS',       val: 1.24,   unit: 'mg/Nm³',cat: 'פליטות' },
        // Status
        { tag: 'ASH.U1.STATUS',           val: 1,      unit: '',      cat: 'סטטוס' },
        { tag: 'ASH.U2.STATUS',           val: 1,      unit: '',      cat: 'סטטוס' },
        { tag: 'HAD.U1.STATUS',           val: 1,      unit: '',      cat: 'סטטוס' },
        { tag: 'ORT.U1.STATUS',           val: 0,      unit: '',      cat: 'סטטוס' },
        { tag: 'RUT.U1.ALARM_COUNT',      val: 3,      unit: '',      cat: 'סטטוס' },
        // Renewable
        { tag: 'RENEW.SOLAR.TOTAL',       val: 340.5,  unit: 'MW',    cat: 'מתחדשות' },
        { tag: 'RENEW.WIND.TOTAL',        val: 180.2,  unit: 'MW',    cat: 'מתחדשות' },
        { tag: 'RENEW.STORAGE.SOC',       val: 0.72,   unit: '%',     cat: 'מתחדשות' }
    ];

    EMU_AF.tags = DEMO_TAGS;

    function _buildAFPanel() {
        var $panel = $('#emu-af-panel');
        if (!$panel.length) return;

        $panel.html(
            '<div class="af-panel-inner" dir="rtl">' +
            '  <div class="af-panel-header">' +
            '    <span class="af-panel-title">AF Browser</span>' +
            '    <button class="af-panel-close" id="btn-af-close" title="סגור">✕</button>' +
            '  </div>' +
            '  <div class="af-tabs">' +
            '    <button class="af-tab active" data-tab="tree">עץ AF</button>' +
            '    <button class="af-tab" data-tab="tags">תגיות</button>' +
            '    <button class="af-tab" data-tab="search">חיפוש</button>' +
            '  </div>' +
            '  <div class="af-tab-content" id="af-tab-tree"></div>' +
            '  <div class="af-tab-content hidden" id="af-tab-tags"></div>' +
            '  <div class="af-tab-content hidden" id="af-tab-search"></div>' +
            '</div>'
        );

        // Build tree
        _buildTree($('#af-tab-tree'));
        _buildTagList($('#af-tab-tags'));
        _buildSearch($('#af-tab-search'));

        // Tab switching
        $panel.on('click', '.af-tab', function () {
            $panel.find('.af-tab').removeClass('active');
            $(this).addClass('active');
            $panel.find('.af-tab-content').addClass('hidden');
            $('#af-tab-' + $(this).data('tab')).removeClass('hidden');
        });

        // Close button
        $('#btn-af-close').on('click', function () {
            $panel.removeClass('open');
        });
    }

    function _buildTree($container) {
        var sites = window.MU20 ? window.MU20.SITES : [];
        var $tree = $('<ul class="af-tree"></ul>');

        sites.forEach(function (site) {
            var $site = $('<li class="af-node af-site" data-af-path="' + site.id + '" draggable="true">' +
                '<span class="af-icon">🏭</span>' +
                '<span class="af-label">' + site.name + ' (' + site.id + ')</span>' +
                '<span class="af-capacity">' + site.capacity + ' MW</span>' +
                '<span class="af-chevron">▶</span>' +
                '</li>');
            var $children = $('<ul class="af-children hidden"></ul>');

            site.units.forEach(function (unit) {
                var $unit = $('<li class="af-node af-unit" data-af-path="' + site.id + '/' + unit + '" draggable="true">' +
                    '<span class="af-icon">⚡</span>' +
                    '<span class="af-label">' + unit + '</span>' +
                    '<span class="af-chevron">▶</span>' +
                    '</li>');
                var $areas = $('<ul class="af-children hidden"></ul>');
                ['מדחסים', 'טורבינות', 'קירור', 'חשמל'].forEach(function (area) {
                    $areas.append('<li class="af-node af-area" data-af-path="' + site.id + '/' + unit + '/' + area + '" draggable="true">' +
                        '<span class="af-icon">📦</span><span class="af-label">' + area + '</span></li>');
                });
                $unit.append($areas);

                $unit.on('click', function (e) {
                    e.stopPropagation();
                    $areas.toggleClass('hidden');
                    $unit.find('>.af-chevron').text($areas.hasClass('hidden') ? '▶' : '▼');
                });
                $children.append($unit);
            });

            $site.on('click', function () {
                $children.toggleClass('hidden');
                $site.find('>.af-chevron').text($children.hasClass('hidden') ? '▶' : '▼');
            });
            $site.after($children);
            $tree.append($site);
        });

        $container.append($tree);
        _initDragDrop($tree);
    }

    function _buildTagList($container) {
        var cats = {};
        DEMO_TAGS.forEach(function (t) {
            if (!cats[t.cat]) cats[t.cat] = [];
            cats[t.cat].push(t);
        });

        var html = '<div class="af-tag-list" dir="rtl">';
        Object.keys(cats).forEach(function (cat) {
            html += '<div class="af-tag-cat">';
            html += '<div class="af-tag-cat-header"><span>▶</span> ' + cat + ' (' + cats[cat].length + ')</div>';
            html += '<ul class="af-tag-items hidden">';
            cats[cat].forEach(function (t) {
                html += '<li class="af-tag-item" draggable="true" data-tag="' + t.tag + '" data-val="' + t.val + '" data-unit="' + t.unit + '">' +
                    '<span class="tag-name">' + t.tag + '</span>' +
                    '<span class="tag-val">' + t.val + ' ' + t.unit + '</span>' +
                    '</li>';
            });
            html += '</ul></div>';
        });
        html += '</div>';

        $container.html(html);

        $container.on('click', '.af-tag-cat-header', function () {
            var $items = $(this).next('.af-tag-items');
            $items.toggleClass('hidden');
            $(this).find('span').text($items.hasClass('hidden') ? '▶' : '▼');
        });

        _initTagDragDrop($container);
    }

    function _buildSearch($container) {
        $container.html(
            '<div class="af-search-box" dir="rtl">' +
            '  <input type="text" class="af-search-input" placeholder="חפש תגית...">' +
            '  <div class="af-search-results"></div>' +
            '</div>'
        );

        $container.on('input', '.af-search-input', function () {
            var q = $(this).val().toLowerCase();
            var $res = $container.find('.af-search-results');
            $res.empty();
            if (!q) return;

            var matches = DEMO_TAGS.filter(function (t) {
                return t.tag.toLowerCase().indexOf(q) >= 0;
            }).slice(0, 20);

            if (!matches.length) {
                $res.html('<div class="af-no-results">לא נמצאו תגיות</div>');
                return;
            }

            var html = '<ul class="af-search-list">';
            matches.forEach(function (t) {
                html += '<li class="af-tag-item" draggable="true" data-tag="' + t.tag + '" data-val="' + t.val + '" data-unit="' + t.unit + '">' +
                    '<span class="tag-name">' + t.tag + '</span>' +
                    '<span class="tag-val">' + t.val + ' ' + t.unit + '</span>' +
                    '</li>';
            });
            html += '</ul>';
            $res.html(html);
            _initTagDragDrop($res);
        });
    }

    function _initDragDrop($container) {
        $container.on('dragstart', '.af-node', function (e) {
            var path = $(this).data('af-path') || $(this).attr('data-af-path');
            e.originalEvent.dataTransfer.setData('text/plain', path);
            e.originalEvent.dataTransfer.setData('application/af-path', path);
            $(this).addClass('dragging');
        });
        $container.on('dragend', '.af-node', function () {
            $(this).removeClass('dragging');
        });
    }

    function _initTagDragDrop($container) {
        $container.on('dragstart', '.af-tag-item', function (e) {
            var tag = $(this).data('tag') || $(this).attr('data-tag');
            var val = $(this).data('val') || $(this).attr('data-val');
            var unit = $(this).data('unit') || $(this).attr('data-unit');
            var payload = JSON.stringify({ tag: tag, val: val, unit: unit });
            e.originalEvent.dataTransfer.setData('text/plain', tag);
            e.originalEvent.dataTransfer.setData('application/pi-tag', payload);
            $(this).addClass('dragging');
        });
        $container.on('dragend', '.af-tag-item', function () {
            $(this).removeClass('dragging');
        });
    }

    // ── Bind dropped tag/attribute to active symbol and trigger data update ──
    function _bindTagToSymbol(tag) {
        if (!window.EMU || !window.EMU.activeSymbol) {
            _showDropToast('⚠️ אין סמל פעיל — בחר סמל מהרשימה קודם');
            return;
        }
        var sym = window.EMU.activeSymbol;
        var scope = sym.scope;
        if (!scope) return;

        // Set the data source on scope
        scope.droppedTag = tag;
        scope.dataSource = {
            Tag: tag.tag,
            Label: tag.tag.split('.').pop(),
            Path: '\\\\PISERVER01\\IEC_Grid\\' + tag.tag.replace(/\./g, '\\'),
            Units: tag.unit,
            Description: tag.tag
        };

        // Update the main data with the tag's value
        scope.value = tag.val;
        scope.Label = tag.tag;
        scope.Units = tag.unit;
        scope.Path = scope.dataSource.Path;
        if (scope.data) {
            scope.data.Value = tag.val;
            scope.data.Label = tag.tag;
            scope.data.Units = tag.unit;
            scope.data.Path = scope.dataSource.Path;
            scope.data.Time = new Date().toISOString();
            scope.data.IsGood = true;
        }

        // Trigger onDataUpdate on the vis instance
        if (window.EMU._visInstance && typeof window.EMU._visInstance.onDataUpdate === 'function') {
            var updData = {
                Value: tag.val,
                Time: new Date().toISOString(),
                Label: tag.tag,
                Units: tag.unit,
                Path: scope.dataSource.Path,
                IsGood: true,
                ErrorCode: 0
            };
            try { window.EMU._visInstance.onDataUpdate(updData); } catch (e) {
                console.warn('[EMU-AF] onDataUpdate error:', e);
            }
        }

        // Digest scope and re-compile
        try { scope.$digest(); } catch (e) {}
        if (sym.container) {
            try { window.compileTemplate(sym.container, scope); } catch (e) {}
        }

        _showDropToast('✓ ' + tag.tag + ' = ' + tag.val + ' ' + tag.unit + ' — מקושר לסמל ' + sym.name);
        console.log('[EMU-AF] Bound tag to symbol:', tag.tag, '→', sym.name);
    }

    function _bindAFPathToSymbol(afPath) {
        if (!window.EMU || !window.EMU.activeSymbol) {
            _showDropToast('⚠️ אין סמל פעיל — בחר סמל מהרשימה קודם');
            return;
        }
        var sym = window.EMU.activeSymbol;
        var scope = sym.scope;
        if (!scope) return;

        // Set AF element on scope
        scope.afElement = {
            Path: '\\\\PISERVER01\\IEC_Grid\\' + afPath,
            Name: afPath.split('/').pop(),
            Template: 'PowerPlant'
        };

        // Generate attributes for this AF path using the mock
        var attrs = [];
        if (window.PIVisualization && window.PIVisualization._piwebapi_mock) {
            var result = window.PIVisualization._piwebapi_mock('attributes?path=' + afPath);
            if (result && result.Items) attrs = result.Items;
        }
        if (!attrs.length) {
            // Fallback: generate from known demo tags matching path
            var pathParts = afPath.toUpperCase().split('/');
            DEMO_TAGS.forEach(function (t) {
                if (t.tag.toUpperCase().indexOf(pathParts[0]) >= 0) {
                    attrs.push({ Name: t.tag, Value: t.val, Unit: t.unit });
                }
            });
        }

        scope.afAttributes = attrs;

        // If symbol has onDataUpdate, send attributes as multi-value data
        if (window.EMU._visInstance && typeof window.EMU._visInstance.onDataUpdate === 'function') {
            var tableData = {
                Rows: attrs.map(function (a) {
                    return {
                        Label: a.Name,
                        Value: a.Value !== undefined ? a.Value : a.val || 0,
                        Units: a.Unit || a.unit || '',
                        Path: scope.afElement.Path + '|' + a.Name,
                        Time: new Date().toISOString(),
                        IsGood: true
                    };
                })
            };
            try { window.EMU._visInstance.onDataUpdate(tableData); } catch (e) {}
        }

        try { scope.$digest(); } catch (e) {}
        if (sym.container) {
            try { window.compileTemplate(sym.container, scope); } catch (e) {}
        }

        _showDropToast('✓ אלמנט AF: ' + afPath + ' (' + attrs.length + ' attributes) — מקושר לסמל ' + sym.name);
        console.log('[EMU-AF] Bound AF path to symbol:', afPath, '→', sym.name, '| attrs:', attrs.length);
    }

    // ── Drop toast notification ──
    function _showDropToast(msg) {
        var $toast = $('<div class="af-drop-toast">' + msg + '</div>');
        $toast.css({
            position: 'fixed', bottom: '60px', left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,212,170,0.95)', color: '#0A0F1E', padding: '10px 24px',
            borderRadius: '8px', fontWeight: 'bold', fontSize: '14px', zIndex: 99999,
            boxShadow: '0 4px 20px rgba(0,212,170,0.3)', direction: 'rtl',
            maxWidth: '90vw', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        });
        $('body').append($toast);
        setTimeout(function () { $toast.fadeOut(400, function () { $toast.remove(); }); }, 3000);
    }
    EMU_AF.showDropToast = _showDropToast;

    // Make the canvas a drop target
    function _initCanvasDrop() {
        var $canvas = $('#emu-canvas');
        $canvas.on('dragover', function (e) {
            e.preventDefault();
            e.originalEvent.dataTransfer.dropEffect = 'copy';
            $canvas.addClass('drop-target');
        });
        $canvas.on('dragleave', function () { $canvas.removeClass('drop-target'); });
        $canvas.on('drop', function (e) {
            e.preventDefault();
            $canvas.removeClass('drop-target');

            // ── Handle symbol drop from sidebar ──
            var symName = e.originalEvent.dataTransfer.getData('application/piv-symbol');
            if (symName) {
                console.log('[EMU-AF] Symbol dropped on canvas:', symName);
                if (window.EMU && window.EMU.renderSymbol) {
                    window.EMU.renderSymbol(symName, '#emu-canvas');
                    $('.emu-sym-item').removeClass('active');
                    $('.emu-sym-item[data-sym="' + symName + '"]').addClass('active');
                }
                return;
            }

            // ── Handle PI tag drop ──
            var tagJson = e.originalEvent.dataTransfer.getData('application/pi-tag');
            if (tagJson) {
                try {
                    var tag = JSON.parse(tagJson);
                    _bindTagToSymbol(tag);
                } catch (ex) { console.warn('[EMU-AF] Tag parse error:', ex); }
                return;
            }

            // ── Handle AF path drop ──
            var afPath = e.originalEvent.dataTransfer.getData('application/af-path');
            if (afPath) {
                _bindAFPathToSymbol(afPath);
                return;
            }
        });
    }

    // Expose for external use
    EMU_AF.bindTagToSymbol = _bindTagToSymbol;
    EMU_AF.bindAFPathToSymbol = _bindAFPathToSymbol;

    $(document).ready(function () {
        _buildAFPanel();
        _initCanvasDrop();
    });

})(window, jQuery);
