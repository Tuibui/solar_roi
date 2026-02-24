// Inputs Module - Solar input panel and appliances

let appliances = [];
let applianceIdCounter = 0;

// Add preset appliance
function addPresetAppliance() {
  const select = document.getElementById('presetAppliance');
  const value = select.value;
  if (!value) return;

  const [key, watts] = value.split('|');
  const preset = PRESET_APPLIANCES[key];
  if (!preset) return;

  addAppliance(preset.name, parseInt(watts), 1, 4, 'both', 50);
  select.value = '';
}

// Add custom appliance
function addCustomAppliance() {
  const name = prompt('Enter appliance name:');
  if (!name) return;
  const watts = parseInt(prompt('Enter power consumption (Watts):'));
  if (isNaN(watts) || watts <= 0) {
    alert('Please enter a valid power value');
    return;
  }
  addAppliance(name, watts, 1, 1, 'both', 50);
}

function addAppliance(name, watts, qty, hours, usageTime, dayPercent) {
  const id = applianceIdCounter++;
  appliances.push({ id, name, watts, qty, hours, usageTime, dayPercent });
  renderAppliances();
  updateEnergySummary();
}

function removeAppliance(id) {
  appliances = appliances.filter(a => a.id !== id);
  renderAppliances();
  updateEnergySummary();
}

function updateAppliance(id, prop, value) {
  const appliance = appliances.find(a => a.id === id);
  if (appliance) {
    if (prop === 'watts' || prop === 'qty' || prop === 'dayPercent') {
      appliance[prop] = parseInt(value) || 0;
    } else if (prop === 'hours') {
      appliance[prop] = parseFloat(value) || 0;
    } else {
      appliance[prop] = value;
    }
    renderAppliances();
    updateEnergySummary();
  }
}

function calculateApplianceEnergy(a) {
  return (a.watts * a.qty * a.hours) / 1000;
}

function renderAppliances() {
  const container = document.getElementById('applianceList');
  if (appliances.length === 0) {
    container.innerHTML = '<div class="no-data-hint">No appliances added yet</div>';
    return;
  }

  container.innerHTML = appliances.map(a => `
    <div class="appliance-item" data-id="${a.id}">
      <div class="appliance-header">
        <span class="appliance-name">${a.name}</span>
        <button class="appliance-remove" onclick="removeAppliance(${a.id})">✕</button>
      </div>
      <div class="appliance-fields">
        <div class="appliance-field">
          <label>Power (W)</label>
          <input type="number" value="${a.watts}" min="1" onchange="updateAppliance(${a.id}, 'watts', this.value)">
        </div>
        <div class="appliance-field">
          <label>Quantity</label>
          <input type="number" value="${a.qty}" min="1" onchange="updateAppliance(${a.id}, 'qty', this.value)">
        </div>
        <div class="appliance-field">
          <label>Hours/Day</label>
          <input type="number" value="${a.hours}" min="0.5" max="24" step="0.5" onchange="updateAppliance(${a.id}, 'hours', this.value)">
        </div>
        <div class="appliance-field">
          <label>Usage Time</label>
          <select onchange="updateAppliance(${a.id}, 'usageTime', this.value)">
            <option value="day" ${a.usageTime === 'day' ? 'selected' : ''}>Day only</option>
            <option value="night" ${a.usageTime === 'night' ? 'selected' : ''}>Night only</option>
            <option value="both" ${a.usageTime === 'both' ? 'selected' : ''}>Both</option>
          </select>
        </div>
        ${a.usageTime === 'both' ? `
        <div class="appliance-field" style="grid-column: span 2;">
          <label>Daytime % (${a.dayPercent}%)</label>
          <input type="range" value="${a.dayPercent}" min="0" max="100" onchange="updateAppliance(${a.id}, 'dayPercent', this.value)">
        </div>
        ` : ''}
      </div>
      <div class="appliance-energy">
        Daily: ${calculateApplianceEnergy(a).toFixed(2)} kWh
      </div>
    </div>
  `).join('');
}

function updateEnergySummary() {
  let totalEnergy = 0;
  let daytimeEnergy = 0;
  let nighttimeEnergy = 0;

  appliances.forEach(a => {
    const energy = calculateApplianceEnergy(a);
    totalEnergy += energy;

    if (a.usageTime === 'day') {
      daytimeEnergy += energy;
    } else if (a.usageTime === 'night') {
      nighttimeEnergy += energy;
    } else {
      daytimeEnergy += energy * (a.dayPercent / 100);
      nighttimeEnergy += energy * ((100 - a.dayPercent) / 100);
    }
  });

  document.getElementById('totalDailyEnergy').textContent = totalEnergy.toFixed(2) + ' kWh';
  document.getElementById('daytimeEnergy').textContent = daytimeEnergy.toFixed(2) + ' kWh';
  document.getElementById('nighttimeEnergy').textContent = nighttimeEnergy.toFixed(2) + ' kWh';
}

function autoFillFromRoofData(data) {
  // Fill location
  if (data.house_lat != null && data.house_lon != null) {
    document.getElementById('inputLat').value = data.house_lat;
    document.getElementById('inputLon').value = data.house_lon;
  }

  // Fill roof planes
  if (data.roofs && data.roofs.length > 0) {
    const planesList = document.getElementById('roofPlanesList');
    let totalArea = 0;

    let html = `
      <label class="select-all-planes">
        <input type="checkbox" id="selectAllPlanes" onchange="toggleAllPlanes(this)" checked>
        Select All Planes
      </label>
    `;

    html += data.roofs.map(roof => {
      const area = roof.panel_area || 0;
      totalArea += area;
      const tilt = roof.user_tilt != null ? roof.user_tilt : roof.tilt;
      const azimuth = roof.azimuth;
      const isFlat = roof.is_flat || (roof.tilt != null && roof.tilt < 5);
      const warning = (isFlat && roof.user_tilt == null) ? ' [warn]' : '';
      return `
        <div class="roof-plane-item selected" data-area="${area}" data-index="${roof.index}">
          <input type="checkbox" class="roof-plane-checkbox" id="plane${roof.index}"
                 data-area="${area}" checked onchange="updateSelectedArea()">
          <div class="roof-plane-info">
            <strong>Plane ${roof.index}</strong> (${roof.color_name})${warning}<br>
            Tilt: ${tilt != null ? tilt : '--'}° | Azimuth: ${azimuth != null ? azimuth : '--'}° | Area: ${area} m²
          </div>
        </div>
      `;
    }).join('');

    planesList.innerHTML = html;
    document.getElementById('inputTotalArea').value = totalArea.toFixed(2);
    window.totalRoofArea = totalArea;
  }
}

function toggleAllPlanes(checkbox) {
  const planeCheckboxes = document.querySelectorAll('.roof-plane-checkbox');
  planeCheckboxes.forEach(cb => {
    cb.checked = checkbox.checked;
    cb.closest('.roof-plane-item').classList.toggle('selected', checkbox.checked);
  });
  updateSelectedArea();
}

function updateSelectedArea() {
  const planeCheckboxes = document.querySelectorAll('.roof-plane-checkbox');
  let selectedArea = 0;
  let allChecked = true;

  planeCheckboxes.forEach(cb => {
    const item = cb.closest('.roof-plane-item');
    if (cb.checked) {
      selectedArea += parseFloat(cb.dataset.area) || 0;
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
      allChecked = false;
    }
  });

  document.getElementById('inputTotalArea').value = selectedArea.toFixed(2);

  const selectAll = document.getElementById('selectAllPlanes');
  if (selectAll) selectAll.checked = allChecked;
}

function getAppliances() {
  return appliances;
}

function collectInputData() {
  const shadingMethod = document.getElementById('shadingMethod').value;
  let usableRatio;
  if (shadingMethod === 'ratio') {
    usableRatio = parseFloat(document.getElementById('inputUsableRatio').value) || 0.8;
  } else {
    const level = document.getElementById('inputShadingLevel').value;
    usableRatio = level === 'none' ? 1.0 : level === 'partial' ? 0.7 : 0.4;
  }

  return {
    location: {
      lat: parseFloat(document.getElementById('inputLat').value),
      lon: parseFloat(document.getElementById('inputLon').value)
    },
    roofGeometry: {
      totalArea: parseFloat(document.getElementById('inputTotalArea').value),
      planes: getRoofDataCache() || []
    },
    usability: { ratio: usableRatio },
    appliances: appliances.map(a => ({
      name: a.name,
      watts: a.watts,
      quantity: a.qty,
      hoursPerDay: a.hours,
      usageTime: a.usageTime,
      dayPercent: a.dayPercent,
      dailyEnergy: calculateApplianceEnergy(a)
    })),
    electricityBill: (() => {
      const monthlyEl = document.getElementById('inputMonthlyKwh');
      const annualEl = document.getElementById('inputAnnualKwh');
      return {
        monthlyKwh: monthlyEl ? (parseFloat(monthlyEl.value) || null) : null,
        annualKwh: annualEl ? (parseFloat(annualEl.value) || null) : null
      };
    })(),
    tariff: {
      price: parseFloat(document.getElementById('inputTariff').value),
      currency: document.getElementById('inputCurrency').value
    },
    gridExport: document.querySelector('input[name="gridExport"]:checked').value === 'yes',
    systemType: document.getElementById('inputSystemType').value
  };
}

function validateAndCalculate() {
  const errors = [];

  const lat = parseFloat(document.getElementById('inputLat').value);
  const lon = parseFloat(document.getElementById('inputLon').value);
  if (isNaN(lat) || lat < -90 || lat > 90) errors.push('Latitude must be between -90 and 90');
  if (isNaN(lon) || lon < -180 || lon > 180) errors.push('Longitude must be between -180 and 180');

  const totalArea = parseFloat(document.getElementById('inputTotalArea').value);
  const selectedPlanes = document.querySelectorAll('.roof-plane-checkbox:checked');
  if (isNaN(totalArea) || totalArea <= 0) errors.push('Roof area is required - please analyze roofs first');
  if (selectedPlanes.length === 0 && document.querySelectorAll('.roof-plane-checkbox').length > 0) {
    errors.push('Please select at least one roof plane');
  }

  const hasAppliances = appliances.length > 0;
  if (!hasAppliances) errors.push('Please add at least one appliance to estimate load');

  const tariff = parseFloat(document.getElementById('inputTariff').value);
  if (isNaN(tariff) || tariff <= 0) errors.push('Electricity tariff is required');

  const errorDiv = document.getElementById('validationErrors');
  if (errors.length > 0) {
    errorDiv.innerHTML = '<ul>' + errors.map(e => `<li>${e}</li>`).join('') + '</ul>';
    errorDiv.classList.add('show');
  } else {
    errorDiv.classList.remove('show');
    const inputData = collectInputData();
    console.log('Solar Input Data:', inputData);
    alert('All inputs valid! Ready to calculate.\n\nCheck console for input data.');
  }
}
