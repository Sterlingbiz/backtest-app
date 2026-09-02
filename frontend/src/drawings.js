// ============================================================
// CANVAS OVERLAY DRAWING SYSTEM — PHASE 1 POLISH
// Magnetic snap, price labels, glow effects, marching ants
// ============================================================

const HIT_THRESHOLD = 8;
const ANCHOR_RADIUS = 5;
const ANCHOR_STROKE = 2;
const MAGNET_RADIUS = 20;
const GLOW_COLOR = 'rgba(41, 98, 255, 0.35)';
const GLOW_BLUR = 8;

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function distToPoint(px, py, x, y) {
  return Math.hypot(px - x, py - y);
}

function extendLine(x1, y1, x2, y2, w, h) {
  const dx = x2 - x1, dy = y2 - y1;
  if (dx === 0 && dy === 0) return { x1, y1, x2, y2 };
  let tMax = 0;
  if (dx > 0) tMax = Math.max(tMax, (w - x1) / dx);
  else if (dx < 0) tMax = Math.max(tMax, (0 - x1) / dx);
  if (dy > 0) tMax = Math.max(tMax, (h - y1) / dy);
  else if (dy < 0) tMax = Math.max(tMax, (0 - y1) / dy);
  return { x1, y1, x2: x1 + dx * tMax, y2: y1 + dy * tMax };
}

function extendBothWays(x1, y1, x2, y2, w, h) {
  const dx = x2 - x1, dy = y2 - y1;
  if (dx === 0 && dy === 0) return { x1, y1, x2, y2 };
  let tMin = 0, tMax = 1;
  if (dx > 0) { tMin = Math.min(tMin, (0 - x1) / dx); tMax = Math.max(tMax, (w - x1) / dx); }
  else if (dx < 0) { tMin = Math.min(tMin, (w - x1) / dx); tMax = Math.max(tMax, (0 - x1) / dx); }
  if (dy > 0) { tMin = Math.min(tMin, (0 - y1) / dy); tMax = Math.max(tMax, (h - y1) / dy); }
  else if (dy < 0) { tMin = Math.min(tMin, (h - y1) / dy); tMax = Math.max(tMax, (0 - y1) / dy); }
  return { x1: x1 + dx * tMin, y1: y1 + dy * tMin, x2: x1 + dx * tMax, y2: y1 + dy * tMax };
}

const TOOL_REGISTRY = {
  TrendLine: { points: 2, label: 'Trend Line', hasLine: true },
  HorizontalLine: { points: 1, label: 'Horizontal Line', isHorizontal: true },
  Ray: { points: 2, label: 'Ray', hasLine: true, extend: 'ray' },
  ExtendedLine: { points: 2, label: 'Extended Line', hasLine: true, extend: 'both' },
  HorizontalRay: { points: 2, label: 'Horizontal Ray', hasLine: true, extend: 'ray' },
  VerticalLine: { points: 1, label: 'Vertical Line', isVertical: true },
  CrossLine: { points: 1, label: 'Cross Line', isCross: true },
  Arrow: { points: 2, label: 'Arrow', hasLine: true },
  Rectangle: { points: 2, label: 'Rectangle', isRect: true },
  FibRetracement: { points: 2, label: 'Fib Retracement', isFib: true },
  Text: { points: 1, label: 'Text', isText: true, text: 'Text' },
  Callout: { points: 1, label: 'Callout', isText: true, text: 'Callout' },
};

class DrawingManager {
  constructor(chart, series, chartContainer, state) {
    this._chart = chart;
    this._series = series;
    this._chartContainer = chartContainer;
    this._state = state;

    this._canvas = document.createElement('canvas');
    this._canvas.style.position = 'absolute';
    this._canvas.style.top = '0';
    this._canvas.style.left = '0';
    this._canvas.style.width = '100%';
    this._canvas.style.height = '100%';
    this._canvas.style.pointerEvents = 'none';
    this._canvas.style.zIndex = '10';
    chartContainer.appendChild(this._canvas);

    this._ctx = this._canvas.getContext('2d');
    this._drawings = [];
    this._mode = null;
    this._drag = null;
    this._hover = null;
    this._selectedId = null;
    this._editCallbacks = [];
    this._needsRender = false;
    this._dashOffset = 0;
    this._dashAnimId = null;

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onKey = this._onKey.bind(this);
    this._onResize = this._onResize.bind(this);

    chartContainer.addEventListener('mousemove', this._onMouseMove);
    chartContainer.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('keydown', this._onKey);

    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(chartContainer);

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => this._scheduleRender());
  }

  destroy() {
    this._chartContainer.removeEventListener('mousemove', this._onMouseMove);
    this._chartContainer.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('keydown', this._onKey);
    this._resizeObserver.disconnect();
    if (this._dashAnimId) cancelAnimationFrame(this._dashAnimId);
    this._canvas.remove();
  }

  _onResize() {
    const rect = this._chartContainer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = rect.width * dpr;
    this._canvas.height = rect.height * dpr;
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._canvas.style.width = rect.width + 'px';
    this._canvas.style.height = rect.height + 'px';
    this._scheduleRender();
  }

  _width() { return this._chartContainer.clientWidth; }
  _height() { return this._chartContainer.clientHeight; }

  _timeToX(time) { return this._chart.timeScale().timeToCoordinate(time); }
  _priceToY(price) { return this._series.priceToCoordinate(price); }
  _xToTime(x) { return this._chart.timeScale().coordinateToTime(x); }
  _yToPrice(y) { return this._series.coordinateToPrice(y); }

  _px(point) {
    const x = this._timeToX(point.time);
    const y = this._priceToY(point.price);
    if (x == null || y == null) return null;
    return { x, y };
  }

  _snap(time, mouseY) {
    const candles = this._state?.allCandles;
    if (!candles || !candles.length) return null;
    let nearest = null;
    let bestTimeDist = Infinity;
    for (const c of candles) {
      const d = Math.abs(c.time - time);
      if (d < bestTimeDist) { bestTimeDist = d; nearest = c; }
    }
    if (!nearest || bestTimeDist > 86400 * 30) return null;
    const prices = [nearest.open, nearest.high, nearest.low, nearest.close];
    let bestPrice = null;
    let bestDist = Infinity;
    for (const p of prices) {
      const py = this._priceToY(p);
      if (py == null) continue;
      const dist = Math.abs(py - mouseY);
      if (dist < bestDist && dist < MAGNET_RADIUS) { bestDist = dist; bestPrice = p; }
    }
    return bestPrice;
  }

  _setPointerEvents(enabled) {
    this._canvas.style.pointerEvents = enabled ? 'auto' : 'none';
  }

  _onMouseMove(e) {
    const rect = this._chartContainer.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (this._mode) {
      let time = this._xToTime(mx);
      let price = this._yToPrice(my);
      if (time != null && price != null) {
        const snapped = this._snap(time, my);
        if (snapped != null) price = snapped;
        this._mode.ghost = { time, price };
      }
      this._scheduleRender();
      return;
    }

    if (this._drag) {
      let time = this._xToTime(mx);
      let price = this._yToPrice(my);
      if (time != null && price != null) {
        const snapped = this._snap(time, my);
        if (snapped != null) price = snapped;
        this._drag.drawing.points[this._drag.anchorIndex] = { time, price };
      }
      this._scheduleRender();
      return;
    }

    let newHover = null;
    for (let i = this._drawings.length - 1; i >= 0; i--) {
      const d = this._drawings[i];
      for (let j = 0; j < d.points.length; j++) {
        const p = this._px(d.points[j]);
        if (p && distToPoint(mx, my, p.x, p.y) < HIT_THRESHOLD + 2) {
          newHover = { drawing: d, anchorIndex: j };
          break;
        }
      }
      if (newHover) break;
      if (this._hitTestBody(d, mx, my)) {
        newHover = { drawing: d, type: 'body' };
        break;
      }
    }

    if (JSON.stringify(newHover) !== JSON.stringify(this._hover)) {
      this._hover = newHover;
      this._canvas.style.cursor = newHover ? (newHover.anchorIndex !== undefined ? 'move' : 'pointer') : 'default';
      this._scheduleRender();
    }
  }

  _onMouseDown(e) {
    if (e.button !== 0) return;
    const rect = this._chartContainer.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (this._mode) {
      let time = this._xToTime(mx);
      let price = this._yToPrice(my);
      if (time == null || price == null) return;
      const snapped = this._snap(time, my);
      if (snapped != null) price = snapped;
      this._mode.points.push({ time, price });
      if (this._mode.points.length >= this._mode.config.points) {
        this._createDrawing(this._mode.toolType, this._mode.points);
        this.cancelTool();
      } else {
        this._scheduleRender();
      }
      return;
    }

    if (this._hover && this._hover.anchorIndex !== undefined) {
      this._drag = { drawing: this._hover.drawing, anchorIndex: this._hover.anchorIndex };
      this._select(this._hover.drawing.id);
      this._setPointerEvents(true);
      this._chart.applyOptions({ handleScroll: false, handleScale: false });
      return;
    }

    if (this._hover && this._hover.type === 'body') {
      this._select(this._hover.drawing.id);
      return;
    }

    this._select(null);
  }

  _onMouseUp() {
    if (this._drag) {
      this._drag = null;
      this._setPointerEvents(false);
      this._chart.applyOptions({ handleScroll: true, handleScale: true });
      this._notify();
    }
  }

  _onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'Escape') this.cancelTool();
    if ((e.key === 'Delete' || e.key === 'Backspace') && this._selectedId) {
      this.removeDrawing(this._selectedId);
    }
  }

  _hitTestBody(d, mx, my) {
    const cfg = TOOL_REGISTRY[d.type];
    if (!cfg) return false;
    if (cfg.hasLine && d.points.length >= 2) {
      const a = this._px(d.points[0]), b = this._px(d.points[1]);
      if (!a || !b) return false;
      if (cfg.extend === 'ray') {
        const line = extendLine(a.x, a.y, b.x, b.y, this._width(), this._height());
        return distToSegment(mx, my, line.x1, line.y1, line.x2, line.y2) < HIT_THRESHOLD;
      }
      if (cfg.extend === 'both') {
        const line = extendBothWays(a.x, a.y, b.x, b.y, this._width(), this._height());
        return distToSegment(mx, my, line.x1, line.y1, line.x2, line.y2) < HIT_THRESHOLD;
      }
      return distToSegment(mx, my, a.x, a.y, b.x, b.y) < HIT_THRESHOLD;
    }
    if (cfg.isHorizontal && d.points.length >= 1) {
      const a = this._px(d.points[0]);
      if (!a) return false;
      return distToSegment(mx, my, 0, a.y, this._width(), a.y) < HIT_THRESHOLD;
    }
    if (cfg.isVertical && d.points.length >= 1) {
      const a = this._px(d.points[0]);
      if (!a) return false;
      return distToSegment(mx, my, a.x, 0, a.x, this._height()) < HIT_THRESHOLD;
    }
    if (cfg.isCross && d.points.length >= 1) {
      const a = this._px(d.points[0]);
      if (!a) return false;
      return distToSegment(mx, my, 0, a.y, this._width(), a.y) < HIT_THRESHOLD ||
             distToSegment(mx, my, a.x, 0, a.x, this._height()) < HIT_THRESHOLD;
    }
    if (cfg.isRect && d.points.length >= 2) {
      const a = this._px(d.points[0]), b = this._px(d.points[1]);
      if (!a || !b) return false;
      const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
      const top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
      return mx >= left && mx <= right && my >= top && my <= bottom;
    }
    if (cfg.isFib && d.points.length >= 2) {
      const a = this._px(d.points[0]), b = this._px(d.points[1]);
      if (!a || !b) return false;
      const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
      const topP = Math.max(d.points[0].price, d.points[1].price);
      const botP = Math.min(d.points[0].price, d.points[1].price);
      const range = topP - botP;
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      for (const level of levels) {
        const ly = this._priceToY(botP + range * level);
        if (ly != null && distToSegment(mx, my, left, ly, right, ly) < HIT_THRESHOLD) return true;
      }
      return false;
    }
    if (cfg.isText && d.points.length >= 1) {
      const a = this._px(d.points[0]);
      if (!a) return false;
      return distToPoint(mx, my, a.x, a.y) < HIT_THRESHOLD + 4;
    }
    return false;
  }

  _createDrawing(type, points) {
    const cfg = TOOL_REGISTRY[type];
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const drawing = {
      id, type,
      label: `${cfg.label} ${this._drawings.filter(d => d.type === type).length + 1}`,
      points: [...points],
      opts: {
        lineColor: '#2962FF',
        lineWidth: 2,
        fillColor: 'rgba(41, 98, 255, 0.08)',
        text: cfg.text || 'Text',
        font: '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#d1d4dc',
      }
    };
    this._drawings.push(drawing);
    this._select(id);
    this._notify();
  }

  _select(id) {
    this._selectedId = id;
    this._scheduleRender();
  }

  _scheduleRender() {
    if (this._needsRender) return;
    this._needsRender = true;
    requestAnimationFrame(() => { this._needsRender = false; this._render(); });
  }

  _render() {
    const ctx = this._ctx;
    const w = this._width();
    const h = this._height();
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, w * dpr, h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this._drawings.forEach(d => this._drawTool(ctx, d));

    if (this._mode && this._mode.ghost && this._mode.points.length > 0) {
      const last = this._px(this._mode.points[this._mode.points.length - 1]);
      const g = this._px(this._mode.ghost);
      if (last && g) {
        ctx.save();
        ctx.strokeStyle = 'rgba(41, 98, 255, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.lineDashOffset = -this._dashOffset;
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(g.x, g.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        this._drawGhostAnchor(ctx, g.x, g.y);
      }
    }

    if (this._hover && this._hover.anchorIndex !== undefined) {
      const p = this._px(this._hover.drawing.points[this._hover.anchorIndex]);
      if (p) {
        ctx.fillStyle = 'rgba(41, 98, 255, 0.25)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, ANCHOR_RADIUS + 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawTool(ctx, d) {
    const cfg = TOOL_REGISTRY[d.type];
    if (!cfg) return;
    const sel = d.id === this._selectedId;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (cfg.hasLine && d.points.length >= 2) {
      const a = this._px(d.points[0]), b = this._px(d.points[1]);
      if (!a || !b) { ctx.restore(); return; }
      let x1 = a.x, y1 = a.y, x2 = b.x, y2 = b.y;
      if (cfg.extend === 'ray') {
        const line = extendLine(a.x, a.y, b.x, b.y, this._width(), this._height());
        x1 = line.x1; y1 = line.y1; x2 = line.x2; y2 = line.y2;
      } else if (cfg.extend === 'both') {
        const line = extendBothWays(a.x, a.y, b.x, b.y, this._width(), this._height());
        x1 = line.x1; y1 = line.y1; x2 = line.x2; y2 = line.y2;
      }
      if (sel) {
        ctx.shadowColor = GLOW_COLOR;
        ctx.shadowBlur = GLOW_BLUR;
      }
      ctx.strokeStyle = d.opts.lineColor;
      ctx.lineWidth = d.opts.lineWidth;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (d.type === 'Arrow') {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = 10;
        ctx.fillStyle = d.opts.lineColor;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }
      if (sel) {
        this._drawEndpointLabel(ctx, a.x, a.y, d.points[0].price);
        this._drawEndpointLabel(ctx, b.x, b.y, d.points[1].price);
        this._drawAnchor(ctx, a.x, a.y);
        this._drawAnchor(ctx, b.x, b.y);
      }
    }

    if (cfg.isHorizontal && d.points.length >= 1) {
      const a = this._px(d.points[0]);
      if (!a) { ctx.restore(); return; }
      ctx.strokeStyle = d.opts.lineColor;
      ctx.lineWidth = d.opts.lineWidth;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, a.y);
      ctx.lineTo(this._width(), a.y);
      ctx.stroke();
      ctx.setLineDash([]);
      this._drawPriceLabel(ctx, d.points[0].price, a.y, d.opts.lineColor);
      if (sel) this._drawAnchor(ctx, a.x, a.y);
    }

    if (cfg.isVertical && d.points.length >= 1) {
      const a = this._px(d.points[0]);
      if (!a) { ctx.restore(); return; }
      ctx.strokeStyle = d.opts.lineColor;
      ctx.lineWidth = d.opts.lineWidth;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, 0);
      ctx.lineTo(a.x, this._height());
      ctx.stroke();
      ctx.setLineDash([]);
      if (sel) this._drawAnchor(ctx, a.x, a.y);
    }

    if (cfg.isCross && d.points.length >= 1) {
      const a = this._px(d.points[0]);
      if (!a) { ctx.restore(); return; }
      ctx.strokeStyle = d.opts.lineColor;
      ctx.lineWidth = d.opts.lineWidth;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, a.y);
      ctx.lineTo(this._width(), a.y);
      ctx.moveTo(a.x, 0);
      ctx.lineTo(a.x, this._height());
      ctx.stroke();
      ctx.setLineDash([]);
      if (sel) this._drawAnchor(ctx, a.x, a.y);
    }

    if (cfg.isRect && d.points.length >= 2) {
      const a = this._px(d.points[0]), b = this._px(d.points[1]);
      if (!a || !b) { ctx.restore(); return; }
      const left = Math.min(a.x, b.x), top = Math.min(a.y, b.y);
      const width = Math.abs(b.x - a.x), height = Math.abs(b.y - a.y);
      ctx.fillStyle = d.opts.fillColor;
      ctx.fillRect(left, top, width, height);
      ctx.strokeStyle = d.opts.lineColor;
      ctx.lineWidth = d.opts.lineWidth;
      if (sel) {
        ctx.shadowColor = GLOW_COLOR;
        ctx.shadowBlur = GLOW_BLUR;
      }
      ctx.strokeRect(left, top, width, height);
      ctx.shadowBlur = 0;
      if (sel) {
        this._drawAnchor(ctx, a.x, a.y);
        this._drawAnchor(ctx, b.x, a.y);
        this._drawAnchor(ctx, a.x, b.y);
        this._drawAnchor(ctx, b.x, b.y);
      }
    }

    if (cfg.isFib && d.points.length >= 2) {
      const a = this._px(d.points[0]), b = this._px(d.points[1]);
      if (!a || !b) { ctx.restore(); return; }
      const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
      const topP = Math.max(d.points[0].price, d.points[1].price);
      const botP = Math.min(d.points[0].price, d.points[1].price);
      const range = topP - botP;
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      ctx.strokeStyle = d.opts.lineColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.font = '11px -apple-system, sans-serif';
      ctx.fillStyle = '#868993';
      ctx.textBaseline = 'middle';
      levels.forEach(level => {
        const price = botP + range * level;
        const y = this._priceToY(price);
        if (y == null) return;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.fillText(`${(level * 100).toFixed(1)}%`, left + 4, y - 8);
      });
      ctx.setLineDash([]);
      if (sel) {
        this._drawAnchor(ctx, a.x, a.y);
        this._drawAnchor(ctx, b.x, b.y);
      }
    }

    if (cfg.isText && d.points.length >= 1) {
      const a = this._px(d.points[0]);
      if (!a) { ctx.restore(); return; }
      ctx.font = d.opts.font;
      ctx.fillStyle = d.opts.color;
      ctx.fillText(d.opts.text, a.x + 8, a.y - 8);
      if (sel) this._drawAnchor(ctx, a.x, a.y);
    }

    ctx.restore();
  }

  _drawAnchor(ctx, x, y) {
    ctx.fillStyle = 'rgba(41, 98, 255, 0.2)';
    ctx.beginPath();
    ctx.arc(x, y, ANCHOR_RADIUS + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#2962FF';
    ctx.lineWidth = ANCHOR_STROKE;
    ctx.beginPath();
    ctx.arc(x, y, ANCHOR_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  _drawGhostAnchor(ctx, x, y) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.strokeStyle = 'rgba(41, 98, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, ANCHOR_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  _drawPriceLabel(ctx, price, y, color) {
    const text = price.toFixed(5);
    ctx.font = 'bold 11px -apple-system, sans-serif';
    const metrics = ctx.measureText(text);
    const pad = 5;
    const labelW = metrics.width + pad * 2;
    const labelH = 18;
    const x = this._width() - labelW;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y - labelH / 2, labelW, labelH, 3);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + pad, y);
  }

  _drawEndpointLabel(ctx, x, y, price) {
    const text = price.toFixed(5);
    ctx.font = '10px -apple-system, sans-serif';
    const metrics = ctx.measureText(text);
    const pad = 3;
    const w = metrics.width + pad * 2;
    const h = 14;
    ctx.fillStyle = 'rgba(19, 23, 34, 0.85)';
    ctx.beginPath();
    ctx.roundRect(x + 8, y - h - 4, w, h, 2);
    ctx.fill();
    ctx.fillStyle = '#868993';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 8 + pad, y - h / 2 - 4);
  }

  _startDashAnimation() {
    if (this._dashAnimId) return;
    const loop = () => {
      this._dashOffset = (this._dashOffset + 0.4) % 20;
      if (this._mode) {
        this._scheduleRender();
        this._dashAnimId = requestAnimationFrame(loop);
      } else {
        this._dashAnimId = null;
      }
    };
    this._dashAnimId = requestAnimationFrame(loop);
  }

  activateTool(toolType) {
    const cfg = TOOL_REGISTRY[toolType];
    if (!cfg) return;
    this.cancelTool();
    this._mode = { toolType, config: cfg, points: [], ghost: null };
    this._setPointerEvents(true);
    this._canvas.style.cursor = 'crosshair';
    this._startDashAnimation();
  }

  cancelTool() {
    this._mode = null;
    this._setPointerEvents(false);
    this._canvas.style.cursor = 'default';
    this._scheduleRender();
  }

  setCursorMode() { this.cancelTool(); }

  removeDrawing(id) {
    const idx = this._drawings.findIndex(d => d.id === id);
    if (idx === -1) return;
    this._drawings.splice(idx, 1);
    if (this._selectedId === id) this._selectedId = null;
    this._notify();
  }

  removeAllLineTools() {
    this._drawings = [];
    this._selectedId = null;
    this._notify();
  }

  exportLineTools() {
    return JSON.stringify(this._drawings.map(d => ({
      id: d.id, type: d.type, points: d.points, opts: d.opts,
    })));
  }

  subscribeLineToolsAfterEdit(cb) { this._editCallbacks.push(cb); }

  _notify() {
    this._editCallbacks.forEach(cb => cb());
    this._renderTree();
  }

  _renderTree() {
    const el = document.getElementById('objectTree');
    if (!el) return;
    if (!this._drawings.length) {
      el.innerHTML = '<div class=\"object-tree-empty\">No drawings yet</div>';
      return;
    }
    const grouped = {};
    this._drawings.forEach(d => { if (!grouped[d.type]) grouped[d.type] = []; grouped[d.type].push(d); });
    el.innerHTML = '';
    Object.entries(grouped).forEach(([type, items]) => {
      const cfg = TOOL_REGISTRY[type];
      const group = document.createElement('div');
      group.className = 'object-group';
      const header = document.createElement('div');
      header.className = 'object-group-header';
      header.textContent = `${cfg?.label || type} (${items.length})`;
      group.appendChild(header);
      items.forEach(d => {
        const row = document.createElement('div');
        row.className = 'object-item' + (d.id === this._selectedId ? ' selected' : '');
        row.innerHTML = `
          <span class=\"object-item-name\">${d.label}</span>
n          <div class=\"object-item-actions\">
n            <button class=\"icon-btn danger\" data-action=\"delete\" data-id=\"${d.id}\">🗑</button>
n          </div>`;
        row.addEventListener('click', () => this._select(d.id));
        group.appendChild(row);
      });
      el.appendChild(group);
    });
    el.querySelectorAll('[data-action=\"delete\"]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.removeDrawing(btn.dataset.id); });
    });
  }
}

export function createDrawingController({ chart, series, state, container }) {
  const manager = new DrawingManager(chart, series, container, state);
  function bindEvents() {
    const clearBtn = document.getElementById('clearAllDrawings');
    if (clearBtn) clearBtn.addEventListener('click', () => manager.removeAllLineTools());
    const clearRail = document.getElementById('clearAllRailBtn');
    if (clearRail) clearRail.addEventListener('click', () => manager.removeAllLineTools());
  }
  return {
    bindEvents,
    activateTool: (t) => manager.activateTool(t),
    setCursorMode: () => manager.setCursorMode(),
    deleteSelected: () => { if (manager._selectedId) manager.removeDrawing(manager._selectedId); },
    lineTools: manager,
    refreshObjectTree: () => manager._renderTree(),
  };
}
