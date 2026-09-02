import { createChart, CrosshairMode, CandlestickSeries, createTextWatermark } from 'lightweight-charts';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export function getApiUrl(path) {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function createChartView(container, state) {
  // Get explicit dimensions from container instead of autoSize
  const rect = container.getBoundingClientRect();
  const width = Math.max(rect.width, 800);
  const height = Math.max(rect.height, 500);

  const chart = createChart(container, {
    width,
    height,
    layout: {
      background: { color: '#131722' },
      textColor: '#d1d4dc',
    },
    grid: {
      vertLines: { color: '#1e222d' },
      horzLines: { color: '#1e222d' },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: '#758696',
        labelBackgroundColor: '#758696',
        width: 1,
        style: 2,
      },
      horzLine: {
        color: '#758696',
        labelBackgroundColor: '#758696',
        width: 1,
        style: 2,
      },
    },
    timeScale: {
      timeVisible: true,
      secondsVisible: false,
      borderColor: '#2a2e39',
    },
    rightPriceScale: {
      borderColor: '#2a2e39',
      scaleMargins: { top: 0.1, bottom: 0.1 },
    },
    leftPriceScale: { visible: false },
    handleScroll: { vertTouchDrag: false },
    // CRITICAL: autoSize is OFF. We manage sizing manually.
  });

  const candleSeries = chart.addSeries(CandlestickSeries, {
    upColor: '#089981',
    downColor: '#f23645',
    borderUpColor: '#089981',
    borderDownColor: '#f23645',
    wickUpColor: '#089981',
    wickDownColor: '#f23645',
  });

  createTextWatermark(chart.panes()[0], {
    horzAlign: 'center',
    vertAlign: 'center',
    lines: [
      {
        text: 'Backtest Pro',
        color: 'rgba(209, 212, 220, 0.05)',
        fontSize: 56,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
    ],
  });

  async function loadCandles({ pair, from, to, timeframe }) {
    const response = await fetch(
      getApiUrl(`/candles?pair=${encodeURIComponent(pair)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&timeframe=${encodeURIComponent(timeframe)}`)
    );

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const text = await response.text();
    let candles;
    try {
      candles = JSON.parse(text);
    } catch (err) {
      throw new Error(`Expected JSON from /candles but received: ${text.slice(0, 160)}`);
    }

    state.allCandles = candles;
    state.currentIndex = 0;
    candleSeries.setData(candles);
    chart.timeScale().fitContent();
    return candles;
  }

  function applyScaleMode(mode) {
    chart.priceScale('right').applyOptions({ mode });
  }

  function takeScreenshot() {
    const canvas = chart.takeScreenshot();
    const link = document.createElement('a');
    link.href = canvas.toDataURL();
    link.download = `chart-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
  }

  function setSeriesData(candles) {
    candleSeries.setData(candles);
  }

  // Manual resize with debounce — stable during interactions
  let resizeTimeout;
  function doResize() {
    const r = container.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      chart.resize(r.width, r.height);
    }
  }

  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(doResize, 150); // 150ms debounce
  });
  resizeObserver.observe(container);

  // Initial resize after layout settles
  requestAnimationFrame(() => {
    setTimeout(doResize, 100);
  });

  return {
    chart,
    candleSeries,
    loadCandles,
    applyScaleMode,
    takeScreenshot,
    setSeriesData,
    resize: doResize,
  };
}