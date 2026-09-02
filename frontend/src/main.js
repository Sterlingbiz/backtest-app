import './style.css';
import { createChartView } from './chart.js';
import { createReplayController } from './replay.js';
import { createTradeController } from './trades.js';
import { createDrawingController } from './drawings.js';

const state = {
  allCandles: [],
  currentIndex: 0,
  playInterval: null,
  replayMode: false,
  selectingStart: false,
  tradeMarkers: [],
  openTrade: null,
  closedTrades: [],
  entryLine: null,
  drawings: [],
  activeTool: 'cursor',
  pendingTrendStart: null,
  chartSettings: loadSettings(),
};

function loadSettings() {
  const defaults = {
    theme: 'dark',
    upColor: '#089981',
    downColor: '#f23645',
    bgColor: '#131722',
    gridColor: '#1e222d',
    crosshairColor: '#758696',
    showWatermark: true,
    showGrid: true,
  };
  try {
    const saved = JSON.parse(localStorage.getItem('chartSettings'));
    return saved ? { ...defaults, ...saved } : defaults;
  } catch {
    return defaults;
  }
}

function saveSettings(settings) {
  localStorage.setItem('chartSettings', JSON.stringify(settings));
}

function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener(event, handler);
  } else {
    console.warn(`[main.js] Element #${id} not found — skipping listener`);
  }
}

const container = document.getElementById('chart');
if (!container) {
  console.error('[main.js] CRITICAL: #chart container not found in DOM');
}

const chartView = createChartView(container, state);
const { chart, candleSeries, loadCandles, applyScaleMode, takeScreenshot, setSeriesData } = chartView;

const elements = {
  playback: document.getElementById('playback'),
  progressLabel: document.getElementById('progressLabel'),
  replayHint: document.getElementById('replayHint'),
  replayToggleBtn: document.getElementById('replayToggleBtn'),
  speedSelect: document.getElementById('speedSelect'),
  errorMsg: document.getElementById('errorMsg'),
  buyBtn: document.getElementById('buyBtn'),
  sellBtn: document.getElementById('sellBtn'),
  closeBtn: document.getElementById('closeBtn'),
  tradeStatus: document.getElementById('tradeStatus'),
  statsPanel: document.getElementById('statsPanel'),
};

const replayController = createReplayController({
  chart, candleSeries, state, elements,
  onResetTradeState: () => tradeController.resetTradeState(),
});

const tradeController = createTradeController({ candleSeries, state, elements });

const drawingController = createDrawingController({
  chart,
  series: candleSeries,
  state,
  container,
});

const FLYOUT_CONFIG = {
  cursor: { title: 'Cursor', tools: [] },
  trend: {
    title: 'Trend Lines',
    tools: [
      { type: 'TrendLine', label: 'Trend Line' },
      { type: 'Ray', label: 'Ray' },
      { type: 'ExtendedLine', label: 'Extended Line' },
      { type: 'Arrow', label: 'Arrow' },
    ]
  },
  horizontal: {
    title: 'Horizontal & Vertical',
    tools: [
      { type: 'HorizontalLine', label: 'Horizontal Line' },
      { type: 'HorizontalRay', label: 'Horizontal Ray' },
      { type: 'VerticalLine', label: 'Vertical Line' },
      { type: 'CrossLine', label: 'Cross Line' },
    ]
  },
  shapes: {
    title: 'Shapes',
    tools: [{ type: 'Rectangle', label: 'Rectangle' }]
  },
  fib: {
    title: 'Fibonacci',
    tools: [{ type: 'FibRetracement', label: 'Fib Retracement' }]
  },
  text: {
    title: 'Text',
    tools: [
      { type: 'Text', label: 'Text' },
      { type: 'Callout', label: 'Callout' },
    ]
  },
  measure: {
    title: 'Measure',
    tools: []
  },
};

let activeFlyout = null;

document.querySelectorAll('.rail-item[data-category]').forEach(item => {
  item.addEventListener('click', () => {
    const category = item.dataset.category;
    document.querySelectorAll('.rail-item').forEach(r => r.classList.remove('active'));
    item.classList.add('active');

    if (category === 'cursor') {
      closeFlyout();
      drawingController.setCursorMode();
      return;
    }

    if (activeFlyout === category) {
      closeFlyout();
      return;
    }

    openFlyout(category);
  });
});

function openFlyout(category) {
  const config = FLYOUT_CONFIG[category];
  if (!config) return;

  activeFlyout = category;
  const panel = document.getElementById('flyoutPanel');
  const title = document.getElementById('flyoutTitle');
  const content = document.getElementById('flyoutContent');

  if (!panel || !title || !content) return;

  title.textContent = config.title;
  content.innerHTML = '';

  config.tools.forEach(tool => {
    const btn = document.createElement('button');
    btn.className = 'flyout-tool-btn';
    btn.innerHTML = `<span>${tool.label}</span>`;
    btn.addEventListener('click', () => {
      drawingController.activateTool(tool.type);
      content.querySelectorAll('.flyout-tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    content.appendChild(btn);
  });

  panel.classList.remove('hidden');
}

function closeFlyout() {
  activeFlyout = null;
  const panel = document.getElementById('flyoutPanel');
  if (panel) panel.classList.add('hidden');
  document.querySelectorAll('.rail-item').forEach(r => r.classList.remove('active'));
  const cursorBtn = document.querySelector('[data-category="cursor"]');
  if (cursorBtn) cursorBtn.classList.add('active');
}

on('closeFlyout', 'click', closeFlyout);

on('clearAllRailBtn', 'click', () => {
  if (drawingController.lineTools) {
    drawingController.lineTools.removeAllLineTools();
    drawingController.refreshObjectTree();
    showToast('All drawings cleared', 'warn');
  }
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.panel-content').forEach(c => c.classList.add('hidden'));
    const tabEl = document.getElementById(tab + 'Tab');
    if (tabEl) tabEl.classList.remove('hidden');
  });
});

document.querySelectorAll('.wl-section-header').forEach(header => {
  header.addEventListener('click', () => {
    const section = header.dataset.section;
    const body = document.getElementById('wl-' + section);
    header.classList.toggle('collapsed');
    if (body) body.classList.toggle('collapsed');
  });
});

document.querySelectorAll('.wl-row').forEach(row => {
  row.addEventListener('click', () => {
    const pair = row.dataset.pair;
    const pairSelect = document.getElementById('pairSelect');
    if (pairSelect) {
      pairSelect.value = pair;
      document.querySelectorAll('.wl-row').forEach(r => r.classList.remove('active'));
      row.classList.add('active');
      loadCandlesFromControls();
    }
  });
});

document.querySelectorAll('.tf-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tfSelect = document.getElementById('timeframeSelect');
    if (tfSelect) tfSelect.value = btn.dataset.tf;
    loadCandlesFromControls();
  });
});

const hiddenTf = document.createElement('select');
hiddenTf.id = 'timeframeSelect';
hiddenTf.style.display = 'none';
hiddenTf.innerHTML = `
  <option value="1m">1m</option>
  <option value="5m">5m</option>
  <option value="15m">15m</option>
  <option value="30m">30m</option>
  <option value="1h" selected>1h</option>
  <option value="4h">4h</option>
  <option value="1d">1d</option>
  <option value="1w">1w</option>
`;
document.body.appendChild(hiddenTf);

document.querySelectorAll('.range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const range = btn.dataset.range;
    const to = new Date();
    let from = new Date();
    switch (range) {
      case '1D': from.setDate(from.getDate() - 1); break;
      case '5D': from.setDate(from.getDate() - 5); break;
      case '1M': from.setMonth(from.getMonth() - 1); break;
      case '3M': from.setMonth(from.getMonth() - 3); break;
      case '6M': from.setMonth(from.getMonth() - 6); break;
      case 'YTD': from = new Date(to.getFullYear(), 0, 1); break;
      case '1Y': from.setFullYear(from.getFullYear() - 1); break;
      case '5Y': from.setFullYear(from.getFullYear() - 5); break;
      case 'ALL': from = new Date('2000-01-01'); break;
    }
    const fromInput = document.getElementById('fromDate');
    const toInput = document.getElementById('toDate');
    if (fromInput) fromInput.value = from.toISOString().slice(0, 10);
    if (toInput) toInput.value = to.toISOString().slice(0, 10);
    loadCandlesFromControls();
  });
});

on('scaleModeSelect', 'change', (e) => {
  applyScaleMode(parseInt(e.target.value, 10));
});

on('fitBtn', 'click', () => {
  if (chart) chart.timeScale().fitContent();
});

on('screenshotBtn', 'click', () => {
  takeScreenshot();
  showToast('Screenshot saved', 'success');
});

on('settingsBtn', 'click', () => {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.classList.remove('hidden');
});

const settingsModal = document.getElementById('settingsModal');
if (settingsModal) {
  const backdrop = settingsModal.querySelector('.modal-backdrop');
  const closeBtn = settingsModal.querySelector('.modal-close');
  if (backdrop) backdrop.addEventListener('click', () => settingsModal.classList.add('hidden'));
  if (closeBtn) closeBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
}

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

on('saveSettingsBtn', 'click', () => {
  const activeThemeBtn = document.querySelector('.theme-btn.active');
  const theme = activeThemeBtn ? activeThemeBtn.dataset.theme : 'dark';
  const newSettings = {
    theme,
    upColor: document.getElementById('upColor')?.value || '#089981',
    downColor: document.getElementById('downColor')?.value || '#f23645',
    bgColor: document.getElementById('bgColor')?.value || '#131722',
    gridColor: document.getElementById('gridColor')?.value || '#1e222d',
    crosshairColor: document.getElementById('crosshairColor')?.value || '#758696',
    showWatermark: document.getElementById('watermarkToggle')?.checked ?? true,
    showGrid: document.getElementById('gridToggle')?.checked ?? true,
  };
  saveSettings(newSettings);
  state.chartSettings = newSettings;
  applyChartSettings();
  if (settingsModal) settingsModal.classList.add('hidden');
  showToast('Settings applied', 'success');
});

on('resetSettingsBtn', 'click', () => {
  localStorage.removeItem('chartSettings');
  state.chartSettings = loadSettings();
  populateSettingsForm();
  applyChartSettings();
  showToast('Settings reset to defaults', 'success');
});

function populateSettingsForm() {
  const s = state.chartSettings;
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === s.theme);
  });
  const upColor = document.getElementById('upColor');
  const downColor = document.getElementById('downColor');
  const bgColor = document.getElementById('bgColor');
  const gridColor = document.getElementById('gridColor');
  const crosshairColor = document.getElementById('crosshairColor');
  const watermarkToggle = document.getElementById('watermarkToggle');
  const gridToggle = document.getElementById('gridToggle');

  if (upColor) upColor.value = s.upColor;
  if (downColor) downColor.value = s.downColor;
  if (bgColor) bgColor.value = s.bgColor;
  if (gridColor) gridColor.value = s.gridColor;
  if (crosshairColor) crosshairColor.value = s.crosshairColor;
  if (watermarkToggle) watermarkToggle.checked = s.showWatermark;
  if (gridToggle) gridToggle.checked = s.showGrid;
}

function applyChartSettings() {
  const s = state.chartSettings;
  if (candleSeries) {
    candleSeries.applyOptions({
      upColor: s.upColor,
      downColor: s.downColor,
      borderUpColor: s.upColor,
      borderDownColor: s.downColor,
      wickUpColor: s.upColor,
      wickDownColor: s.downColor,
    });
  }
  if (chart) {
    chart.applyOptions({
      layout: {
        background: { color: s.bgColor },
        textColor: s.theme === 'dark' ? '#d1d4dc' : '#131722',
      },
      grid: {
        vertLines: { color: s.showGrid ? s.gridColor : 'transparent' },
        horzLines: { color: s.showGrid ? s.gridColor : 'transparent' },
      },
      crosshair: {
        vertLine: { color: s.crosshairColor, labelBackgroundColor: s.crosshairColor },
        horzLine: { color: s.crosshairColor, labelBackgroundColor: s.crosshairColor },
      },
    });
  }
}

window.showToast = function(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

async function populateSymbols() {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/symbols`);
    if (!response.ok) return;
    const symbols = await response.json();
    const pairSelect = document.getElementById('pairSelect');
    if (!pairSelect) return;
    const current = pairSelect.value;
    pairSelect.innerHTML = '';
    symbols.forEach((symbol) => {
      const option = document.createElement('option');
      option.value = symbol;
      option.textContent = symbol;
      pairSelect.appendChild(option);
    });
    if (symbols.includes(current)) pairSelect.value = current;
    else if (symbols.length > 0) pairSelect.value = symbols[0];
  } catch (err) {
    console.error('Failed to load symbols:', err);
  }
}

function getClampedRange(from, to, timeframe) {
  if (timeframe !== '1m') return { from, to, clamped: false };
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const maxDays = 14;
  const diffDays = (toDate - fromDate) / (1000 * 60 * 60 * 24);
  if (diffDays > maxDays) {
    const clampedFrom = new Date(toDate);
    clampedFrom.setDate(clampedFrom.getDate() - maxDays);
    return { from: clampedFrom.toISOString().slice(0, 10), to, clamped: true };
  }
  return { from, to, clamped: false };
}

async function loadCandlesFromControls() {
  const pairSelect = document.getElementById('pairSelect');
  const fromInput = document.getElementById('fromDate');
  const toInput = document.getElementById('toDate');
  const tfSelect = document.getElementById('timeframeSelect');

  if (!pairSelect || !fromInput || !toInput || !tfSelect) {
    console.error('[main.js] Missing form controls');
    return;
  }

  const pair = pairSelect.value;
  let from = fromInput.value;
  let to = toInput.value;
  const timeframe = tfSelect.value;

  const clampResult = getClampedRange(from, to, timeframe);
  from = clampResult.from;
  to = clampResult.to;

  if (elements.errorMsg) {
    elements.errorMsg.textContent = clampResult.clamped
      ? '⚠ 1m range narrowed to 14 days'
      : '';
  }

  replayController.exitReplay();

  const loading = document.getElementById('chartLoading');
  const errorOverlay = document.getElementById('chartError');
  if (loading) loading.classList.remove('hidden');
  if (errorOverlay) errorOverlay.classList.add('hidden');

  try {
    await loadCandles({ pair, from, to, timeframe });
    if (state.allCandles.length === 0) {
      if (elements.errorMsg) elements.errorMsg.textContent = 'No data for this range.';
      showToast('No data found', 'warn');
    } else {
      if (elements.errorMsg) elements.errorMsg.textContent = '';
      showToast(`Loaded ${state.allCandles.length.toLocaleString()} candles`, 'success');
    }
  } catch (err) {
    console.error('Failed to load candles:', err);
    if (elements.errorMsg) elements.errorMsg.textContent = 'Failed to load data';
    const errorText = document.getElementById('chartErrorText');
    if (errorText) errorText.textContent = err.message;
    if (errorOverlay) errorOverlay.classList.remove('hidden');
    showToast(err.message, 'error');
    state.allCandles = [];
    setSeriesData([]);
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

on('retryLoadBtn', 'click', loadCandlesFromControls);
on('pairSelect', 'change', loadCandlesFromControls);
on('fromDate', 'change', loadCandlesFromControls);
on('toDate', 'change', loadCandlesFromControls);

on('stepBtn', 'click', () => replayController.stepForward());
on('playBtn', 'click', () => replayController.startPlayback());
on('pauseBtn', 'click', () => replayController.stopPlayback());
on('resetBtn', 'click', () => {
  replayController.exitReplay();
  candleSeries.setData(state.allCandles);
});

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  switch (e.key) {
    case ' ':
      e.preventDefault();
      if (state.replayMode) {
        state.playInterval ? replayController.stopPlayback() : replayController.startPlayback();
      }
      break;
    case 'Escape':
      closeFlyout();
      drawingController.setCursorMode();
      if (settingsModal) settingsModal.classList.add('hidden');
      break;
    case 'Delete':
    case 'Backspace':
      drawingController.deleteSelected();
      break;
  }
});

replayController.bindEvents();
tradeController.bindEvents();
drawingController.bindEvents();

populateSettingsForm();
applyChartSettings();

populateSymbols().finally(() => {
  loadCandlesFromControls();
});
