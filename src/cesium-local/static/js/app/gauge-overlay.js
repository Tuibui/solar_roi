/**
 * GaugeOverlay — Old-school terminal-style progress with scrolling log.
 *
 * Usage:
 *   GaugeOverlay.show('ANALYZE');
 *   GaugeOverlay.log('Loading roof geometry...');
 *   GaugeOverlay.setProgress(0.45);
 *   GaugeOverlay.setPhase('SHADING');
 *   GaugeOverlay.hide();
 */
const GaugeOverlay = (() => {
  let overlay, fill, pctEl, phaseEl, timeEl, logEl;
  let startTime = 0;
  let timerRAF = 0;

  function els() {
    if (overlay) return;
    overlay = document.getElementById('wizardOverlay');
    fill    = document.getElementById('gaugeBarFill');
    pctEl   = document.getElementById('gaugePct');
    phaseEl = document.getElementById('gaugePhase');
    timeEl  = document.getElementById('gaugeTime');
    logEl   = document.getElementById('gaugeLog');
  }

  function _tickTimer() {
    if (!startTime) return;
    const sec = ((performance.now() - startTime) / 1000).toFixed(1);
    if (timeEl) timeEl.textContent = 'T+' + sec + 's';
    timerRAF = requestAnimationFrame(_tickTimer);
  }

  function show(phase) {
    els();
    overlay.style.display = 'flex';
    phaseEl.textContent = '> ' + (phase || 'PROCESSING') + '_';
    pctEl.textContent = '[  0%]';
    fill.style.width = '0%';
    fill.classList.remove('indeterminate');
    if (logEl) logEl.innerHTML = '';
    startTime = performance.now();
    if (timeEl) timeEl.textContent = 'T+0.0s';
    cancelAnimationFrame(timerRAF);
    _tickTimer();
    log('Session initialized');
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
    pctEl.textContent = '[ ...]';
  }

  function setProgress(frac) {
    els();
    frac = Math.max(0, Math.min(1, frac));
    fill.classList.remove('indeterminate');
    fill.style.width = (frac * 100).toFixed(1) + '%';
    const p = Math.round(frac * 100);
    pctEl.textContent = '[' + String(p).padStart(3, ' ') + '%]';
  }

  function setPhase(phase) {
    els();
    if (phase) phaseEl.textContent = '> ' + phase + '_';
  }

  function log(msg) {
    els();
    if (!logEl) return;
    const sec = startTime ? ((performance.now() - startTime) / 1000).toFixed(1) : '0.0';
    const line = document.createElement('div');
    line.className = 'gauge-log-line';
    line.textContent = '[' + sec.padStart(6, ' ') + 's] ' + msg;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  return { show, hide, setIndeterminate, setProgress, setPhase, log };
})();

window.GaugeOverlay = GaugeOverlay;
