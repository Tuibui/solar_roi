// Search Module - Address search and geocoding

let savedDestination = null;
let searchTimeout = null;
let currentResults = [];
let isSelectingSuggestion = false;

async function handleAddressInput(event) {
  // Skip if we're in the middle of selecting a suggestion
  if (isSelectingSuggestion) return;
  
  const query = event.target.value.trim();

  if (event.key === 'Enter' && query) {
    searchAddress();
    return;
  }

  if (query.length < 3) {
    document.getElementById('suggestions').classList.remove('show');
    return;
  }

  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => fetchSuggestions(query), 300);
}

async function fetchSuggestions(query) {
  const viewer = getViewer();
  if (!viewer) return;

  try {
    const geocoder = new Cesium.IonGeocoderService({ scene: viewer.scene });
    const results = await geocoder.geocode(query);

    const suggestionsEl = document.getElementById('suggestions');

    if (results && results.length > 0) {
      suggestionsEl.innerHTML = results.slice(0, 5).map((r, i) =>
        `<div class="suggestion-item" onclick="selectSuggestion(${i})">${r.displayName}</div>`
      ).join('');
      suggestionsEl.classList.add('show');
      currentResults = results;
    } else {
      suggestionsEl.classList.remove('show');
    }
  } catch (e) {
    console.error('Geocode error:', e);
  }
}

function selectSuggestion(index) {
  const result = currentResults[index];
  if (!result) return;

  // Set flag to prevent input event from refetching
  isSelectingSuggestion = true;
  
  // Clear any pending search
  clearTimeout(searchTimeout);
  
  document.getElementById('addressInput').value = result.displayName;
  
  // Close suggestions
  const suggestionsEl = document.getElementById('suggestions');
  if (suggestionsEl) {
    suggestionsEl.classList.remove('show');
    suggestionsEl.innerHTML = ''; // Clear content
  }
  
  // Clear flag after a short delay
  setTimeout(() => { isSelectingSuggestion = false; }, 100);

  const dest = result.destination;
  if (dest instanceof Cesium.Rectangle) {
    savedDestination = {
      type: 'rectangle',
      west: dest.west,
      south: dest.south,
      east: dest.east,
      north: dest.north,
      name: result.displayName
    };
  } else {
    const carto = Cesium.Cartographic.fromCartesian(dest);
    savedDestination = {
      type: 'cartesian',
      lon: Cesium.Math.toDegrees(carto.longitude),
      lat: Cesium.Math.toDegrees(carto.latitude),
      height: carto.height || 500,
      name: result.displayName
    };
  }

  document.getElementById('addressSelected').style.display = 'block';
  document.getElementById('addressSelected').innerHTML = '<strong>Selected:</strong> ' + result.displayName;

  if (savedDestination) {
    flyToLocation(savedDestination, savedDestination.name || result.displayName);
  }
}

async function searchAddress() {
  const query = document.getElementById('addressInput').value.trim();
  if (!query) return;

  // Close suggestions immediately
  const suggestionsEl = document.getElementById('suggestions');
  if (suggestionsEl) suggestionsEl.classList.remove('show');

  const btn = document.getElementById('searchBtn');
  btn.disabled = true;
  btn.textContent = '...';

  const viewer = getViewer();

  try {
    const geocoder = new Cesium.IonGeocoderService({ scene: viewer.scene });
    const results = await geocoder.geocode(query);

    if (results && results.length > 0) {
      currentResults = results;
      selectSuggestion(0);
    } else {
      alert('Location not found. Try a different search.');
    }
  } catch (e) {
    console.error('Search error:', e);
    alert('Search failed. Please try again.');
  }

  btn.disabled = false;
  btn.textContent = 'Search';
}

function getSavedDestination() {
  return savedDestination;
}

function setSavedDestination(dest) {
  savedDestination = dest;
}

// Close suggestions when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-input-wrapper')) {
    document.getElementById('suggestions')?.classList.remove('show');
  }
});
