const fallbackLocation = {
  name: 'Tubipure Water Refilling Station',
  address: 'Visayan Village, Purok Pioneer, Tagum, 8100 Davao del Norte',
  lat: Number(document.querySelector('meta[name="company-latitude"]').content),
  lon: Number(document.querySelector('meta[name="company-longitude"]').content),
};
const cityLocation = {
  name: 'Tagum City',
  address: 'Tagum City, Davao del Norte, Philippines',
  lat: 7.4478,
  lon: 125.8078,
};
const tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
let center = { lat: fallbackLocation.lat, lon: fallbackLocation.lon, zoom: 16 };
let selected = { ...fallbackLocation };
let places = [{ ...fallbackLocation }, { ...cityLocation }];
let dragStart = null;
let currentLocation = null;
let renderFrame = 0;
let lastSearchTime = 0;
const renderedTiles = new Map();

function toWorld(lat, lon, zoom) {
  const size = 256 * 2 ** zoom;
  const radians = Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180;
  return {
    x: (lon + 180) / 360 * size,
    y: (0.5 - Math.log((1 + Math.sin(radians)) / (1 - Math.sin(radians))) / (4 * Math.PI)) * size,
  };
}

function fromWorld(x, y, zoom) {
  const size = 256 * 2 ** zoom;
  return {
    lon: x / size * 360 - 180,
    lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI,
  };
}

function render() {
  const picker = document.getElementById('addressPicker');
  const map = document.getElementById('addressMap');
  if (!picker || picker.hidden || !map) return;
  const rect = map.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const world = toWorld(center.lat, center.lon, center.zoom);
  const left = world.x - rect.width / 2;
  const top = world.y - rect.height / 2;
  const limit = 2 ** center.zoom;
  const tilesElement = document.getElementById('addressMapTiles');
  const retainedKeys = new Set();
  const firstTileX = Math.floor(left / 256) - 1;
  const lastTileX = Math.floor((left + rect.width) / 256) + 1;
  const firstTileY = Math.max(0, Math.floor(top / 256) - 1);
  const lastTileY = Math.min(limit - 1, Math.floor((top + rect.height) / 256) + 1);
  for (let y = firstTileY; y <= lastTileY; y++) {
    for (let x = firstTileX; x <= lastTileX; x++) {
      const wrappedX = ((x % limit) + limit) % limit;
      const key = `${center.zoom}/${x}/${y}`;
      let tile = renderedTiles.get(key);
      if (!tile) {
        tile = document.createElement('img');
        tile.className = 'address-map-tile';
        tile.alt = '';
        tile.draggable = false;
        tile.src = tileUrl.replace('{z}', center.zoom).replace('{x}', wrappedX).replace('{y}', y);
        renderedTiles.set(key, tile);
        tilesElement.append(tile);
      }
      tile.style.left = `${x * 256 - left}px`;
      tile.style.top = `${y * 256 - top}px`;
      retainedKeys.add(key);
    }
  }
  for (const [key, tile] of renderedTiles) {
    if (!retainedKeys.has(key)) {
      tile.remove();
      renderedTiles.delete(key);
    }
  }
  const markers = places.map((place, index) => {
    const point = toWorld(place.lat, place.lon, center.zoom);
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'address-map-marker';
    marker.setAttribute('aria-label', `Select ${place.name}`);
    marker.style.left = `${point.x - left}px`;
    marker.style.top = `${point.y - top}px`;
    marker.innerHTML = '<svg viewBox="0 0 24 30" aria-hidden="true"><path d="M12 1C5.9 1 1 5.8 1 11.8 1 20 12 29 12 29s11-9 11-17.2C23 5.8 18.1 1 12 1Z" fill="currentColor"/><circle cx="12" cy="12" r="4" fill="white"/></svg>';
    marker.addEventListener('click', () => choose(place));
    marker.dataset.markerIndex = String(index);
    return marker;
  });
  document.getElementById('addressMapMarkers').replaceChildren(...markers);
  const indicator = document.getElementById('addressCurrentIndicator');
  if (currentLocation) {
    const point = toWorld(currentLocation.lat, currentLocation.lon, center.zoom);
    const x = point.x - left;
    const y = point.y - top;
    indicator.style.left = `${x}px`;
    indicator.style.top = `${y}px`;
    indicator.hidden = x < 0 || y < 0 || x > rect.width || y > rect.height;
  } else {
    indicator.hidden = true;
  }
}

function scheduleRender() {
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(() => {
    renderFrame = 0;
    render();
  });
}

function updateSelected() {
  document.getElementById('selectedLocationName').textContent = selected.name;
  document.getElementById('addressInputText').textContent = selected.address;
}

function renderSuggestions() {
  const list = document.getElementById('nearbyLocations');
  if (!list) return;
  list.innerHTML = places.slice(0, 5).map((place, index) => `
    <button class="address-nearby-option" type="button" data-location-index="${index}" aria-pressed="${place.address === selected.address}">
      <svg viewBox="0 0 24 30" aria-hidden="true"><path d="M12 1C5.9 1 1 5.8 1 11.8 1 20 12 29 12 29s11-9 11-17.2C23 5.8 18.1 1 12 1Z" fill="currentColor"/><circle cx="12" cy="12" r="4" fill="white"/></svg>
      <span><b>${escapeAddressText(place.name)}</b><small>${escapeAddressText(place.address)}</small></span>
    </button>`).join('');
}

function escapeAddressText(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character]);
}

function choose(place) {
  selected = { ...place };
  center = { lat: selected.lat, lon: selected.lon, zoom: Math.max(center.zoom, 16) };
  updateSelected();
  renderSuggestions();
  render();
}

function showFeedback(message) {
  document.getElementById('mapFeedback').textContent = message;
}

async function geocoder(url) {
  const wait = Math.max(0, 1100 - (Date.now() - lastSearchTime));
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  lastSearchTime = Date.now();
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Location lookup is temporarily unavailable. You can still select this point by its coordinates.');
  return response.json();
}

function fromSearchResult(result) {
  return {
    name: result.name || result.display_name.split(',')[0],
    address: result.display_name,
    lat: Number(result.lat),
    lon: Number(result.lon),
  };
}

async function selectMapCenter() {
  selected = {
    name: 'Selected map location',
    address: `${center.lat.toFixed(6)}, ${center.lon.toFixed(6)}`,
    lat: center.lat,
    lon: center.lon,
  };
  places = [selected];
  updateSelected();
  renderSuggestions();
  showFeedback('Finding the place under the pin…');
  try {
    const result = await geocoder(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${center.lat}&lon=${center.lon}`);
    if (!result.display_name) throw new Error('No address found for this point. The coordinates are ready to select.');
    const address = result.address || {};
    const isCompanyLocation = Math.hypot((center.lat - fallbackLocation.lat) * 111320, (center.lon - fallbackLocation.lon) * 111320 * Math.cos(center.lat * Math.PI / 180)) < 100;
    selected = {
      name: isCompanyLocation ? fallbackLocation.name : result.name || address.amenity || address.building || address.road || address.suburb || address.village || address.town || address.city || 'Selected location',
      address: isCompanyLocation ? fallbackLocation.address : result.display_name,
      lat: center.lat,
      lon: center.lon,
    };
    places = [selected];
    updateSelected();
    renderSuggestions();
    render();
    showFeedback('');
  } catch (error) {
    selected = {
      name: 'Selected map location',
      address: `${center.lat.toFixed(6)}, ${center.lon.toFixed(6)}`,
      lat: center.lat,
      lon: center.lon,
    };
    places = [selected];
    updateSelected();
    renderSuggestions();
    showFeedback(error.message);
  }
}

const map = document.getElementById('addressMap');
const addressSheet = document.querySelector('.address-bottom-sheet');
let isMapDragging = false;

function setMapDragging(isDragging) {
  isMapDragging = isDragging;
  addressSheet?.classList.toggle('is-map-dragging', isDragging);
}

map?.addEventListener('pointerdown', event => {
  if (event.target.closest('.address-map-topbar,.address-map-controls,.address-map-attribution,.address-map-marker')) return;
  const rect = map.getBoundingClientRect();
  dragStart = {
    x: event.clientX,
    y: event.clientY,
    mapX: event.clientX - rect.left,
    mapY: event.clientY - rect.top,
    world: toWorld(center.lat, center.lon, center.zoom),
  };
  map.setPointerCapture(event.pointerId);
});
map?.addEventListener('pointermove', event => {
  if (!dragStart) return;
  if (!isMapDragging && Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) > 6) {
    setMapDragging(true);
  }
  const point = fromWorld(dragStart.world.x - (event.clientX - dragStart.x), dragStart.world.y - (event.clientY - dragStart.y), center.zoom);
  center = { ...center, ...point };
  scheduleRender();
});
map?.addEventListener('pointerup', event => {
  if (!dragStart) return;
  const start = dragStart;
  const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6;
  dragStart = null;
  if (!moved) {
    const rect = map.getBoundingClientRect();
    const world = fromWorld(start.world.x + start.mapX - rect.width / 2, start.world.y + start.mapY - rect.height / 2, center.zoom);
    center = { ...center, ...world };
  }
  setMapDragging(false);
  selectMapCenter();
});
map?.addEventListener('pointercancel', () => { dragStart = null; setMapDragging(false); });
map?.addEventListener('wheel', event => {
  event.preventDefault();
  center.zoom = Math.max(3, Math.min(19, center.zoom + (event.deltaY < 0 ? 1 : -1)));
  scheduleRender();
}, { passive: false });

document.getElementById('locationSearchForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const query = document.getElementById('locationSearchInput').value.trim();
  if (!query) return;
  showFeedback('Searching for places…');
  try {
    const results = await geocoder(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`);
    places = results.map(fromSearchResult);
    if (!places.length) {
      showFeedback('No matching places found. Try another search or move the pin.');
      return;
    }
    showFeedback('');
    choose(places[0]);
  } catch (error) {
    showFeedback(error.message);
  }
});

document.getElementById('nearbyLocations')?.addEventListener('click', event => {
  const button = event.target.closest('[data-location-index]');
  if (button && places[Number(button.dataset.locationIndex)]) choose(places[Number(button.dataset.locationIndex)]);
});

document.getElementById('useCurrentLocation')?.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showFeedback('Your browser does not support location sharing.');
    return;
  }
  showFeedback('Finding your current location…');
  navigator.geolocation.getCurrentPosition(position => {
    currentLocation = { lat: position.coords.latitude, lon: position.coords.longitude };
    center = { ...currentLocation, zoom: 17 };
    scheduleRender();
    selectMapCenter();
  }, () => showFeedback('Location access was denied or is unavailable. Drag or tap the map to place the pin.'), { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 });
});

document.getElementById('zoomMapIn')?.addEventListener('click', () => {
  center.zoom = Math.min(19, center.zoom + 1);
  render();
});
document.getElementById('zoomMapOut')?.addEventListener('click', () => {
  center.zoom = Math.max(3, center.zoom - 1);
  render();
});

document.querySelector('.address-sheet-handle')?.addEventListener('pointerdown', event => {
  const sheet = document.querySelector('.address-bottom-sheet');
  const startY = event.clientY;
  const startHeight = sheet.getBoundingClientRect().height;
  const move = moveEvent => {
    const height = Math.max(innerHeight * .38, Math.min(innerHeight * .78, startHeight + startY - moveEvent.clientY));
    sheet.style.maxHeight = `${height}px`;
  };
  const stop = () => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', stop);
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', stop, { once: true });
});
addEventListener('resize', scheduleRender);
renderSuggestions();

window.addressMapPicker = {
  open(address) {
    selected = address ? {
      name: address.label,
      address: address.address,
      lat: Number(address.latitude) || fallbackLocation.lat,
      lon: Number(address.longitude) || fallbackLocation.lon,
    } : { ...fallbackLocation };
    center = { lat: selected.lat, lon: selected.lon, zoom: 16 };
    places = address ? [{ ...selected }] : [{ ...fallbackLocation }, { ...cityLocation }];
    document.body.classList.add('address-picker-open');
    document.getElementById('addressPicker').hidden = false;
    document.getElementById('addressLabel').value = address?.label || '';
    document.getElementById('locationSearchInput').value = '';
    showFeedback('');
    updateSelected();
    renderSuggestions();
    requestAnimationFrame(render);
  },
  close() {
    document.getElementById('addressPicker').hidden = true;
    document.body.classList.remove('address-picker-open');
    dragStart = null;
    setMapDragging(false);
  },
  selection() {
    return { address: selected.address, latitude: selected.lat, longitude: selected.lon };
  },
};
