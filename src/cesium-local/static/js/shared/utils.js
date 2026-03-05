// Utility Functions

// UI Helpers
function showOverlay(msg = "Generating...") {
  const msgEl = document.getElementById("overlayMsg");
  const el = document.getElementById("overlay");
  if (msgEl) msgEl.textContent = msg;
  if (el) el.style.display = "flex";
}

function hideOverlay() {
  const el = document.getElementById("overlay");
  if (el) el.style.display = "none";
}

function setStatus(msg, color = "#0f0") {
  const el = document.getElementById("status");
  if (el) {
    el.textContent = msg;
    el.style.color = color;
  }
}

// Tab switching
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  if (tab === 'address') {
    document.querySelector('.tab:first-child').classList.add('active');
    document.getElementById('addressTab').classList.add('active');
  } else {
    document.querySelector('.tab:last-child').classList.add('active');
    document.getElementById('detectTab').classList.add('active');
  }
}

// Section toggle
function toggleSection(sectionId) {
  const section = document.getElementById(sectionId);
  const toggle = document.getElementById(sectionId + 'Toggle');
  if (section.classList.contains('collapsed')) {
    section.classList.remove('collapsed');
    toggle.textContent = '▼';
  } else {
    section.classList.add('collapsed');
    toggle.textContent = '▶';
  }
}

// Shading input toggle
function toggleShadingInput() {
  const method = document.getElementById('shadingMethod').value;
  document.getElementById('ratioInput').style.display = method === 'ratio' ? 'block' : 'none';
  document.getElementById('levelInput').style.display = method === 'level' ? 'block' : 'none';
}

// API health check
async function checkAPIHealth() {
  try {
    const response = await fetch(`${CONFIG.API_BASE}/health`);
    const data = await response.json();
    console.log("Backend API connected:", data);
    return true;
  } catch(err) {
    console.error("Backend API not reachable:", err);
    setStatus("Backend offline", "#f55");
    return false;
  }
}

// =========================
// Currency Utilities (real-time rates with fallback)
// =========================
const CURRENCY_SYMBOLS = {
  USD: '$', EUR: '€', JPY: '¥', THB: '฿',
  CNY: '¥', KRW: '₩', GBP: '£', AUD: 'A$', INR: '₹'
};

// Fallback: rates per 1 USD
let _fxRates = {
  USD: 1, EUR: 0.92, JPY: 149.5, THB: 35.2,
  CNY: 7.25, KRW: 1350, GBP: 0.79, AUD: 1.55, INR: 83.5
};
let _fxLoaded = false;

async function loadExchangeRates() {
  if (_fxLoaded) return _fxRates;
  try {
    const res = await fetch('/api/exchange/rates');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.rates) {
      _fxRates = data.rates;
      _fxLoaded = true;
      console.log('[FX] Loaded real-time rates:', Object.keys(_fxRates).join(', '));
    }
  } catch (e) {
    console.warn('[FX] Using fallback rates:', e.message);
  }
  return _fxRates;
}

// Load on startup
loadExchangeRates();

function getSelectedCurrency() {
  // Global selector takes priority
  const global = document.getElementById('globalCurrencySelect');
  if (global && global.value) return global.value;
  const wiz = window.wizard;
  const cur = wiz && wiz.sessionData && wiz.sessionData.step2 && wiz.sessionData.step2.q6_tariff
    ? wiz.sessionData.step2.q6_tariff.currency
    : null;
  return cur || localStorage.getItem('sunscope_currency') || 'THB';
}

function setSelectedCurrency(code) {
  localStorage.setItem('sunscope_currency', code);
  const global = document.getElementById('globalCurrencySelect');
  if (global) global.value = code;
  window.dispatchEvent(new CustomEvent('currency-changed', { detail: { currency: code } }));
}

function convertCurrency(amount, from, to) {
  const val = Number(amount);
  if (!Number.isFinite(val)) return 0;
  const fromRate = _fxRates[from];
  const toRate = _fxRates[to];
  if (!fromRate || !toRate) return val;
  const usd = val / fromRate;
  return usd * toRate;
}

function formatCurrency(amount, currency) {
  const val = Number(amount);
  const symbol = CURRENCY_SYMBOLS[currency] || '';
  const decimals = (currency === 'JPY' || currency === 'KRW') ? 0 : 2;
  const safe = Number.isFinite(val) ? val : 0;
  return `${symbol}${safe.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;
}

window.CurrencyUtil = {
  getSelectedCurrency,
  setSelectedCurrency,
  convert: convertCurrency,
  format: formatCurrency,
  loadRates: loadExchangeRates,
  getRates: () => _fxRates,
  SYMBOLS: CURRENCY_SYMBOLS
};

// ── Init top-bar dropdowns on DOM ready ──
document.addEventListener('DOMContentLoaded', () => {
  // Currency selector
  const curSel = document.getElementById('globalCurrencySelect');
  if (curSel) {
    const saved = localStorage.getItem('sunscope_currency');
    if (saved && curSel.querySelector(`option[value="${saved}"]`)) {
      curSel.value = saved;
    }
    curSel.addEventListener('change', () => {
      setSelectedCurrency(curSel.value);
    });
  }

  // Language selector
  const langSel = document.getElementById('globalLangSelect');
  if (langSel) {
    const savedLang = localStorage.getItem('sunscope_lang') || 'en';
    if (langSel.querySelector(`option[value="${savedLang}"]`)) {
      langSel.value = savedLang;
    }
    langSel.addEventListener('change', () => {
      localStorage.setItem('sunscope_lang', langSel.value);
      window.dispatchEvent(new CustomEvent('lang-changed', { detail: { lang: langSel.value } }));
    });
  }
});
