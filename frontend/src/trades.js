import { LineStyle, createSeriesMarkers } from 'lightweight-charts';

export function createTradeController({ candleSeries, state, elements }) {
  const { buyBtn, sellBtn, closeBtn, tradeStatus, statsPanel } = elements;

  // v5: markers are managed by a separate primitive attached to the series
  const markersPrimitive = createSeriesMarkers(candleSeries, []);

  function currentCandle() {
    if (state.currentIndex === 0 || state.currentIndex > state.allCandles.length) return null;
    return state.allCandles[state.currentIndex - 1];
  }

  function updateStats() {
    const total = state.closedTrades.length;
    const wins = state.closedTrades.filter((trade) => trade.pips > 0).length;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : 0;
    const totalPips = state.closedTrades.reduce((sum, trade) => sum + trade.pips, 0);

    statsPanel.textContent = `Trades: ${total} | Win rate: ${winRate}% | Total P&L: ${totalPips >= 0 ? '+' : ''}${totalPips.toFixed(1)} pips`;
  }

  function openPosition(direction) {
    if (state.openTrade) return;
    const candle = currentCandle();
    if (!candle) return;

    state.openTrade = {
      direction,
      entryPrice: candle.close,
      entryTime: candle.time,
    };

    tradeStatus.textContent = `${direction.toUpperCase()} open @ ${candle.close.toFixed(5)}`;
    closeBtn.disabled = false;
    buyBtn.disabled = true;
    sellBtn.disabled = true;

    state.tradeMarkers.push({
      time: candle.time,
      position: direction === 'buy' ? 'belowBar' : 'aboveBar',
      color: direction === 'buy' ? '#26a69a' : '#ef5350',
      shape: direction === 'buy' ? 'arrowUp' : 'arrowDown',
      text: direction.toUpperCase(),
    });
    markersPrimitive.setMarkers(state.tradeMarkers);

    state.entryLine = candleSeries.createPriceLine({
      price: candle.close,
      color: direction === 'buy' ? '#26a69a' : '#ef5350',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: `${direction.toUpperCase()} entry`,
    });
  }

  function closePosition() {
    if (!state.openTrade) return;
    const candle = currentCandle();
    if (!candle) return;

    const exitPrice = candle.close;
    const pipMultiplier = 10000;
    let pips;

    if (state.openTrade.direction === 'buy') {
      pips = (exitPrice - state.openTrade.entryPrice) * pipMultiplier;
    } else {
      pips = (state.openTrade.entryPrice - exitPrice) * pipMultiplier;
    }

    state.closedTrades.push({
      direction: state.openTrade.direction,
      entryPrice: state.openTrade.entryPrice,
      exitPrice,
      pips,
    });

    tradeStatus.textContent = `Closed: ${pips >= 0 ? '+' : ''}${pips.toFixed(1)} pips`;
    state.openTrade = null;
    closeBtn.disabled = true;
    buyBtn.disabled = false;
    sellBtn.disabled = false;

    state.tradeMarkers.push({
      time: candle.time,
      position: 'inBar',
      color: pips >= 0 ? '#26a69a' : '#ef5350',
      shape: 'circle',
      text: `${pips >= 0 ? '+' : ''}${pips.toFixed(1)}p`,
    });
    markersPrimitive.setMarkers(state.tradeMarkers);

    if (state.entryLine) {
      candleSeries.removePriceLine(state.entryLine);
      state.entryLine = null;
    }

    updateStats();
  }

  function resetTradeState() {
    state.openTrade = null;
    state.closedTrades = [];
    state.tradeMarkers = [];
    tradeStatus.textContent = '';
    closeBtn.disabled = true;
    buyBtn.disabled = false;
    sellBtn.disabled = false;
    if (state.entryLine) {
      candleSeries.removePriceLine(state.entryLine);
      state.entryLine = null;
    }
    markersPrimitive.setMarkers([]);
    updateStats();
  }

  function bindEvents() {
    buyBtn.addEventListener('click', () => openPosition('buy'));
    sellBtn.addEventListener('click', () => openPosition('sell'));
    closeBtn.addEventListener('click', closePosition);
  }

  return {
    openPosition,
    closePosition,
    resetTradeState,
    updateStats,
    bindEvents,
  };
}
