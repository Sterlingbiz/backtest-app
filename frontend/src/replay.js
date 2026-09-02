export function createReplayController({ chart, candleSeries, state, elements, onResetTradeState }) {
  const { playback, progressLabel, replayHint, replayToggleBtn, speedSelect, errorMsg } = elements;

  function enterSelectMode() {
    state.selectingStart = true;
    state.replayMode = false;
    playback.style.display = 'none';
    replayHint.textContent = '👉 Click a candle on the chart to start replay from there';
    replayToggleBtn.textContent = '✕ Cancel Selection';
  }

  function stopPlayback() {
    if (state.playInterval) {
      clearInterval(state.playInterval);
      state.playInterval = null;
    }
  }

  function updateProgress() {
    progressLabel.textContent = `${state.currentIndex} / ${state.allCandles.length}`;
  }

  function stepForward() {
    if (state.currentIndex >= state.allCandles.length) {
      stopPlayback();
      return;
    }
    candleSeries.update(state.allCandles[state.currentIndex]);
    state.currentIndex += 1;
    updateProgress();
  }

  function startPlayback() {
    if (state.playInterval) return;
    if (state.allCandles.length === 0) {
      errorMsg.textContent = 'No candles loaded — cannot play.';
      return;
    }
    const speed = parseInt(speedSelect.value, 10);
    state.playInterval = setInterval(stepForward, speed);
  }

  function exitReplay() {
    state.selectingStart = false;
    state.replayMode = false;
    stopPlayback();
    playback.style.display = 'none';
    replayHint.textContent = '';
    replayToggleBtn.textContent = '📊 Bar Replay';
    candleSeries.setData(state.allCandles);
    if (typeof onResetTradeState === 'function') {
      onResetTradeState();
    }
  }

  function handleChartClick(param) {
    if (!state.selectingStart || !param.time) return;

    const clickedIndex = state.allCandles.findIndex((candle) => candle.time === param.time);
    if (clickedIndex === -1) return;

    state.currentIndex = clickedIndex + 1;
    candleSeries.setData(state.allCandles.slice(0, state.currentIndex));

    state.selectingStart = false;
    state.replayMode = true;
    playback.style.display = 'block';
    replayHint.textContent = '';
    replayToggleBtn.textContent = '📊 Bar Replay';
    updateProgress();
  }

  function bindEvents() {
    replayToggleBtn.addEventListener('click', () => {
      if (state.selectingStart || state.replayMode) {
        exitReplay();
      } else {
        enterSelectMode();
      }
    });

    chart.subscribeClick(handleChartClick);
    speedSelect.addEventListener('change', () => {
      if (state.playInterval) {
        stopPlayback();
        startPlayback();
      }
    });
  }

  return {
    enterSelectMode,
    exitReplay,
    stepForward,
    startPlayback,
    stopPlayback,
    updateProgress,
    bindEvents,
  };
}
