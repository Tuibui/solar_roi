/**
 * GaugeOverlay — Simple horizontal progress bar with real-time elapsed timer.
 *
 * Usage:
 *   GaugeOverlay.show('Analyzing roof...');
 *   GaugeOverlay.setProgress(0.45);     // 0-1, determinate
 *   GaugeOverlay.setIndeterminate();     // sliding bar
 *   GaugeOverlay.setPhase('Computing shading...');
 *   GaugeOverlay.hide();
 */
const GaugeOverlay = (() => {
  let overlay, fill, pctEl, phaseEl, timeEl;
  let startTime = 0;
  let timerRAF = 0;

  function els() {
    if (overlay) return;
    overlay = document.getElementById('wizardOverlay');
    fill    = document.getElementById('gaugeBarFill');
    pctEl   = document.getElementById('gaugePct');
    phaseEl = document.getElementById('gaugePhase');
    timeEl  = document.getElementById('gaugeTime');
  }

  function _tickTimer() {
    if (!startTime) return;
    const sec = ((performance.now() - startTime) / 1000).toFixed(1);
    if (timeEl) timeEl.textContent = sec + ' s';
    timerRAF = requestAnimationFrame(_tickTimer);
  }

  function show(phase) {
    els();
    overlay.style.display = 'flex';
    phaseEl.textContent = phase || 'Processing...';
    pctEl.textContent = '0%';
    fill.style.width = '0%';
    fill.classList.remove('indeterminate');
    startTime = performance.now();
    if (timeEl) timeEl.textContent = '0.0 s';
    cancelAnimationFrame(timerRAF);
    _tickTimer();
  }

  function hide() {
    els();
    cancelAnimationFrame(timerRAF);
    startTime = 0;
    overlay.style.display = 'none';
  }

  function setIndeterminate() {
    els();
    fill.classList.add('indeterminate');
    fill.style.width = '';
    pctEl.textContent = '—';
  }

  function setProgress(frac) {
    els();
    frac = Math.max(0, Math.min(1, frac));
    fill.classList.remove('indeterminate');
    fill.style.width = (frac * 100).toFixed(1) + '%';
    pctEl.textContent = Math.round(frac * 100) + '%';
  }

  function setPhase(phase) {
    els();
    if (phase) phaseEl.textContent = phase;
  }

  return { show, hide, setIndeterminate, setProgress, setPhase };
})();

window.GaugeOverlay = GaugeOverlay;
