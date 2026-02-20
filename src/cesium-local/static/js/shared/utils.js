// Utility Functions

// UI Helpers
function showOverlay(msg = "Generating...") {
  document.getElementById("overlayMsg").textContent = msg;
  document.getElementById("overlay").style.display = "flex";
}

function hideOverlay() {
  document.getElementById("overlay").style.display = "none";
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
