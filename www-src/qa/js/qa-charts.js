/**
 * qa-charts.js — Canvas-based chart rendering for QA dashboard
 */

'use strict';

const QACharts = (() => {

  const COLORS = {
    error:   '#e63946',
    warning: '#ff6b35',
    pass:    '#00d4ff',
    info:    '#8892b0',
    bg:      '#0d1b2a',
    surface: '#1a2744',
    grid:    '#1e3a5f',
    text:    '#ccd6f6',
    textMuted: '#8892b0',
    v20:     '#00d4ff',
    wow:     '#a855f7'
  };

  // ─── Animation helpers ────────────────────────────────────────────────────

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animateCanvas(duration, drawFn) {
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const ease = easeOutCubic(t);
      drawFn(ease);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ─── Setup canvas ─────────────────────────────────────────────────────────

  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, w: rect.width, h: rect.height };
  }

  // ─── Severity Donut Chart ─────────────────────────────────────────────────

  function drawSeverityDonut(canvas, data, animated = true) {
    const { ctx, w, h } = setupCanvas(canvas);
    
    const segments = [
      { label: 'שגיאות', value: data.errors, color: COLORS.error },
      { label: 'אזהרות', value: data.warnings, color: COLORS.warning },
      { label: 'עמידה', value: data.passes, color: COLORS.pass },
      { label: 'מידע', value: data.infos, color: COLORS.info }
    ].filter(s => s.value > 0);

    const total = segments.reduce((s, d) => s + d.value, 0);
    if (total === 0) return;

    const cx = w / 2;
    const cy = h / 2;
    const outerR = Math.min(w, h) * 0.38;
    const innerR = outerR * 0.6;
    const startAngle = -Math.PI / 2;

    function draw(progress) {
      ctx.clearRect(0, 0, w, h);
      
      let angle = startAngle;
      segments.forEach((seg, i) => {
        const slice = (seg.value / total) * Math.PI * 2 * progress;
        
        // Draw segment
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, angle, angle + slice);
        ctx.arc(cx, cy, innerR, angle + slice, angle, true);
        ctx.closePath();
        ctx.fillStyle = seg.color;
        ctx.fill();

        // Gap between segments
        angle += slice + (progress > 0.98 ? 0.02 : 0);
      });

      // Center text
      if (progress > 0.8) {
        const alpha = (progress - 0.8) / 0.2;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = COLORS.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Health score
        const healthScore = data.healthScore !== undefined ? data.healthScore : 
          Math.round((data.passes / total) * 100);
        
        ctx.font = `bold ${Math.round(outerR * 0.45)}px "Heebo", system-ui, sans-serif`;
        ctx.fillText(`${healthScore}%`, cx, cy - outerR * 0.07);
        
        ctx.font = `${Math.round(outerR * 0.2)}px "Heebo", system-ui, sans-serif`;
        ctx.fillStyle = COLORS.textMuted;
        ctx.fillText('ציון בריאות', cx, cy + outerR * 0.22);
        
        ctx.globalAlpha = 1;
      }

      // Legend
      if (progress > 0.9) {
        const legendAlpha = (progress - 0.9) / 0.1;
        ctx.globalAlpha = legendAlpha;
        const legendX = w * 0.05;
        const legendStartY = h * 0.82;
        const itemW = w / segments.length;
        
        segments.forEach((seg, i) => {
          const lx = legendX + i * itemW;
          ctx.fillStyle = seg.color;
          ctx.beginPath();
          ctx.arc(lx + 6, legendStartY + 6, 5, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.fillStyle = COLORS.textMuted;
          ctx.font = `11px "Heebo", system-ui, sans-serif`;
          ctx.textAlign = 'right';
          ctx.fillText(`${seg.label}: ${seg.value}`, lx + itemW - 4, legendStartY + 10);
        });
        ctx.globalAlpha = 1;
      }
    }

    if (animated) {
      animateCanvas(800, draw);
    } else {
      draw(1);
    }
  }

  // ─── Issues by Category Bar Chart ─────────────────────────────────────────

  function drawCategoryBar(canvas, data, animated = true) {
    const { ctx, w, h } = setupCanvas(canvas);
    
    const categories = [
      { label: 'JS', errors: data.jsErrors || 0, warnings: data.jsWarnings || 0 },
      { label: 'HTML', errors: data.htmlErrors || 0, warnings: data.htmlWarnings || 0 },
      { label: 'CSS', errors: data.cssErrors || 0, warnings: data.cssWarnings || 0 },
      { label: 'צלב', errors: data.crossErrors || 0, warnings: data.crossWarnings || 0 }
    ];

    const maxVal = Math.max(...categories.map(c => c.errors + c.warnings), 1);
    const padding = { top: 30, right: 20, bottom: 40, left: 40 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const barGroupW = chartW / categories.length;
    const barW = barGroupW * 0.35;

    function draw(progress) {
      ctx.clearRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      const gridLines = 4;
      for (let i = 0; i <= gridLines; i++) {
        const y = padding.top + (chartH / gridLines) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();
        
        // Y-axis labels
        const val = Math.round(maxVal - (maxVal / gridLines) * i);
        ctx.fillStyle = COLORS.textMuted;
        ctx.font = '10px "Heebo", system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(val, padding.left - 5, y + 4);
      }

      // Bars
      categories.forEach((cat, i) => {
        const groupX = padding.left + i * barGroupW + barGroupW * 0.1;
        
        // Errors bar
        const errH = (cat.errors / maxVal) * chartH * progress;
        const errY = padding.top + chartH - errH;
        
        ctx.fillStyle = COLORS.error;
        ctx.beginPath();
        ctx.roundRect(groupX, errY, barW, errH, [3, 3, 0, 0]);
        ctx.fill();

        // Warnings bar
        const warnH = (cat.warnings / maxVal) * chartH * progress;
        const warnY = padding.top + chartH - warnH;
        
        ctx.fillStyle = COLORS.warning;
        ctx.beginPath();
        ctx.roundRect(groupX + barW + 4, warnY, barW, warnH, [3, 3, 0, 0]);
        ctx.fill();

        // Category label
        ctx.fillStyle = COLORS.text;
        ctx.font = `bold 12px "Heebo", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(cat.label, groupX + barW + 2, h - 10);
      });

      // Legend
      const legendY = padding.top - 15;
      [
        { color: COLORS.error, label: 'שגיאות' },
        { color: COLORS.warning, label: 'אזהרות' }
      ].forEach((l, i) => {
        const lx = padding.left + i * 90;
        ctx.fillStyle = l.color;
        ctx.fillRect(lx, legendY, 12, 10);
        ctx.fillStyle = COLORS.textMuted;
        ctx.font = '11px "Heebo", system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(l.label, lx + 16, legendY + 9);
      });
    }

    if (animated) {
      animateCanvas(700, draw);
    } else {
      draw(1);
    }
  }

  // ─── Symbol Health Score Bar Chart ─────────────────────────────────────────

  function drawHealthBars(canvas, analyses, animated = true) {
    if (!analyses || analyses.length === 0) return;
    const { ctx, w, h } = setupCanvas(canvas);
    
    const maxBars = Math.min(analyses.length, 20);
    const displayData = analyses.slice(0, maxBars);
    const padding = { top: 20, right: 15, bottom: 60, left: 15 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const barH = Math.min(24, (chartH / maxBars) - 4);
    const barSpacing = chartH / maxBars;

    function getColor(score) {
      if (score >= 85) return COLORS.pass;
      if (score >= 60) return COLORS.warning;
      return COLORS.error;
    }

    function draw(progress) {
      ctx.clearRect(0, 0, w, h);
      
      // Track line
      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(padding.left, padding.top, chartW, chartH);

      displayData.forEach((a, i) => {
        const y = padding.top + i * barSpacing + (barSpacing - barH) / 2;
        const score = a.scores?.overall || 0;
        const barW = (score / 100) * chartW * progress;
        const color = getColor(score);

        // Background bar
        ctx.fillStyle = COLORS.grid;
        ctx.beginPath();
        ctx.roundRect(padding.left, y, chartW, barH, 3);
        ctx.fill();

        // Score bar
        if (barW > 0) {
          const grad = ctx.createLinearGradient(padding.left, 0, padding.left + barW, 0);
          grad.addColorStop(0, color + '80');
          grad.addColorStop(1, color);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(padding.left, y, barW, barH, 3);
          ctx.fill();
        }

        // Symbol name and score
        ctx.fillStyle = COLORS.text;
        ctx.font = `11px "Heebo", system-ui, sans-serif`;
        ctx.textAlign = 'left';
        const shortName = a.symbolName.length > 16 ? a.symbolName.slice(0, 14) + '…' : a.symbolName;
        ctx.fillText(shortName, padding.left + 4, y + barH - 5);

        if (progress > 0.5) {
          ctx.textAlign = 'right';
          ctx.fillText(`${score}%`, padding.left + chartW - 4, y + barH - 5);
        }
      });
    }

    if (animated) {
      animateCanvas(900, draw);
    } else {
      draw(1);
    }
  }

  // ─── Category Distribution Donut ──────────────────────────────────────────

  function drawCategoryDistribution(canvas, data, animated = true) {
    const { ctx, w, h } = setupCanvas(canvas);
    
    const total = (data.v20 || 0) + (data.wow || 0);
    if (total === 0) return;

    const segments = [
      { label: 'v20', value: data.v20 || 0, color: COLORS.v20 },
      { label: 'WOW', value: data.wow || 0, color: COLORS.wow }
    ].filter(s => s.value > 0);

    const cx = w / 2;
    const cy = h / 2;
    const outerR = Math.min(w, h) * 0.38;
    const innerR = outerR * 0.55;

    function draw(progress) {
      ctx.clearRect(0, 0, w, h);
      
      let angle = -Math.PI / 2;
      segments.forEach(seg => {
        const slice = (seg.value / total) * Math.PI * 2 * progress;
        
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, angle, angle + slice);
        ctx.arc(cx, cy, innerR, angle + slice, angle, true);
        ctx.closePath();
        ctx.fillStyle = seg.color;
        ctx.fill();
        angle += slice + 0.02;
      });

      // Center text
      if (progress > 0.8) {
        const alpha = (progress - 0.8) / 0.2;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = COLORS.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.round(outerR * 0.4)}px "Heebo", system-ui, sans-serif`;
        ctx.fillText(total, cx, cy - 8);
        ctx.font = `${Math.round(outerR * 0.18)}px "Heebo", system-ui, sans-serif`;
        ctx.fillStyle = COLORS.textMuted;
        ctx.fillText('סמלים', cx, cy + outerR * 0.25);
        ctx.globalAlpha = 1;
      }

      // Legend
      if (progress > 0.85) {
        const alpha = Math.min(1, (progress - 0.85) / 0.15);
        ctx.globalAlpha = alpha;
        segments.forEach((seg, i) => {
          const lx = w * 0.08 + i * (w * 0.45);
          const ly = h * 0.88;
          ctx.fillStyle = seg.color;
          ctx.beginPath();
          ctx.arc(lx + 6, ly, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = COLORS.text;
          ctx.font = '12px "Heebo", system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`${seg.label}: ${seg.value}`, lx + 14, ly + 4);
        });
        ctx.globalAlpha = 1;
      }
    }

    if (animated) {
      animateCanvas(700, draw);
    } else {
      draw(1);
    }
  }

  // ─── Sparkline ───────────────────────────────────────────────────────────

  function drawSparkline(canvas, values, color = COLORS.pass) {
    const { ctx, w, h } = setupCanvas(canvas);
    if (!values || values.length < 2) return;

    const min = Math.min(...values);
    const max = Math.max(...values, min + 1);
    const range = max - min;
    const padX = 2, padY = 4;
    const cw = w - padX * 2;
    const ch = h - padY * 2;

    const pts = values.map((v, i) => ({
      x: padX + (i / (values.length - 1)) * cw,
      y: padY + ch - ((v - min) / range) * ch
    }));

    ctx.clearRect(0, 0, w, h);
    
    // Fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + '40');
    grad.addColorStop(1, color + '00');
    
    ctx.beginPath();
    ctx.moveTo(pts[0].x, h);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  return {
    drawSeverityDonut,
    drawCategoryBar,
    drawHealthBars,
    drawCategoryDistribution,
    drawSparkline,
    COLORS
  };

})();

export default QACharts;
