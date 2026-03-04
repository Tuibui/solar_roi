/**
 * GaugeOverlay — Retro technical gauge for analysis progress.
 *
 * Usage:
 *   GaugeOverlay.show('ANALYZING ROOF', 'PHASE 1 / 2');
 *   GaugeOverlay.setProgress(0.45);          // 0-1 determinate
 *   GaugeOverlay.setIndeterminate();          // sweeping needle
 *   GaugeOverlay.setPhase('COMPUTING SHADING', 'PHASE 2 / 2');
 *   GaugeOverlay.setLed(2, 'active');         // 1-4: dim | active | amber
 *   GaugeOverlay.hide();
 */
const GaugeOverlay = (() => {
  let needle, pctEl, phaseEl, subEl, overlay;
  let ticks;

  function els() {
    if (needle) return;
    overlay = document.getElementById('wizardOverlay');
    needle  = document.getElementById('gaugeNeedle');
    pctEl   = document.getElementById('gaugePct');
    phaseEl = document.getElementById('gaugePhase');
    subEl   = document.getElementById('gaugeSub');
    ticks   = document.getElementById('gaugeTicks');
    _drawTicks();
  }

  function _drawTicks() {
    if (!ticks || ticks.childNodes.length > 0) return;
    // 21 ticks from 0 to 100 (every 5%), major every 20%
    for (let i = 0; i <= 20; i++) {
      const angle = (i / 20) * 180;      // 0°..180° arc
      const rad = (angle - 180) * Math.PI / 180;
      const cx = 130, cy = 140, r = 100;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const isMajor = i % 4 === 0;
      const r1 = r - (isMajor ? 14 : 9);
      const r2 = r - 3;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', cx + cos * r1);
      line.setAttribute('y1', cy + sin * r1);
      line.setAttribute('x2', cx + cos * r2);
      line.setAttribute('y2', cy + sin * r2);
      if (isMajor) {
        line.setAttribute('stroke', '#aab');
        line.setAttribute('stroke-width', '2');
      }
      ticks.appendChild(line);
    }
  }

  /** Rotate needle to a 0-1 fraction */
  function _setNeedleAngle(frac) {
    if (!needle) return;
    needle.classList.remove('sweeping');
    const deg = frac * 180;
    needle.setAttribute('x2', 130 + Math.cos((deg - 180) * Math.PI / 180) * 95);
    needle.setAttribute('y2', 140 + Math.sin((deg - 180) * Math.PI / 180) * 95);
  }

  function show(phase, sub) {
    els();
    overlay.style.display = 'flex';
    phaseEl.textContent = phase || 'INITIALIZING...';
    subEl.textContent = sub || 'STANDBY';
    pctEl.textContent = '---';
    _setNeedleAngle(0);
    // Reset LEDs
    for (let i = 1; i <= 4; i++) setLed(i, 'dim');
  }

  function hide() {
    els();
    needle.classList.remove('sweeping');
    overlay.style.display = 'none';
  }

  function setIndeterminate() {
    els();
    pctEl.textContent = '---';
    needle.classList.add('sweeping');
  }

  function setProgress(frac) {
    els();
    frac = Math.max(0, Math.min(1, frac));
    needle.classList.remove('sweeping');
    _setNeedleAngle(frac);
    pctEl.textContent = Math.round(frac * 100).toString().padStart(3, ' ');
  }

  function setPhase(phase, sub) {
    els();
    if (phase) phaseEl.textContent = phase;
    if (sub !== undefined) subEl.textContent = sub;
  }

  function setLed(n, state) {
    els();
    const led = document.getElementById('gaugeLed' + n);
    if (!led) return;
    led.className = 'gauge-led gauge-led--' + (state || 'dim');
  }

  return { show, hide, setIndeterminate, setProgress, setPhase, setLed };
})();

window.GaugeOverlay = GaugeOverlay;
