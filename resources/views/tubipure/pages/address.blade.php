<section class="page" id="page-address">
  <div class="address-page-map-background" aria-hidden="true">
    <div class="address-page-background-image"></div>
    <div class="address-page-map-wash"></div>
  </div>
  <div class="page-head"><div class="wrap">
    <div>
      <h1>My Address</h1>
      <p>Your saved delivery address.</p>
    </div>
  </div></div>
  <div class="page-body"><div class="wrap">
    <article class="card profile-card" aria-labelledby="addressPageName">
      <div class="profile-heading">
        <span class="avatar profile-avatar" id="addressPageAvatar" aria-hidden="true"></span>
        <div class="profile-heading-copy">
          <h2 id="addressPageName"></h2>
          <span class="profile-role">Delivery address</span>
        </div>
      </div>
      <div class="address-manager">
        <div class="address-manager-heading">
          <p id="addressCount" class="helper-text">0 of 5 addresses saved</p>
          <button class="btn btn-primary" type="button" id="addAddressBtn">Add address</button>
        </div>
        <div id="addressList" class="address-list" aria-live="polite"></div>
      </div>
    </article>
  </div></div>
  <dialog class="address-delete-dialog" id="addressDeleteDialog" aria-labelledby="addressDeleteTitle" aria-describedby="addressDeleteDescription">
    <div class="address-delete-dialog-card">
      <button class="address-delete-dialog-close" id="closeAddressDeleteDialog" type="button" aria-label="Close confirmation">&times;</button>
      <span class="address-delete-dialog-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 2.8 19a1.4 1.4 0 0 0 1.2 2.1h16a1.4 1.4 0 0 0 1.2-2.1L12 3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9v4.5m0 3h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
      <p class="address-delete-dialog-eyebrow">Saved address</p>
      <h2 id="addressDeleteTitle">Delete this address?</h2>
      <p id="addressDeleteDescription">This address will be removed from your saved addresses.</p>
      <p class="address-delete-dialog-name" id="addressDeleteName"></p>
      <p class="address-delete-dialog-feedback" id="addressDeleteFeedback" role="status" aria-live="polite"></p>
      <div class="address-delete-dialog-actions">
        <button class="btn btn-ghost" id="keepAddressButton" type="button" autofocus>Keep address</button>
        <button class="btn" id="confirmDeleteAddressButton" type="button">Delete address</button>
      </div>
    </div>
  </dialog>
  <div class="address-picker" id="addressPicker" hidden>
    <div class="address-picker-map" id="addressMap" role="application" aria-label="Interactive map. Drag or tap anywhere to place the pin and select that location.">
      <div class="address-map-tiles" id="addressMapTiles"></div>
      <div class="address-map-markers" id="addressMapMarkers"></div>
      <span class="address-current-indicator" id="addressCurrentIndicator" hidden aria-label="Your current location"></span>
      <div class="address-map-center-pin" aria-hidden="true"><svg viewBox="0 0 32 42"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 41 16 41s15-14 15-25.2C31 7.6 24.3 1 16 1Z" fill="currentColor"/><circle cx="16" cy="16" r="5" fill="white"/></svg></div>
      <div class="address-map-topbar">
        <button type="button" class="address-map-back" id="closeAddressPicker" aria-label="Back to saved addresses"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6M9 12h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <form class="address-map-search" id="locationSearchForm">
          <span class="address-search-pin" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" fill="currentColor"/><circle cx="12" cy="10" r="2.5" fill="white"/></svg></span>
          <input id="locationSearchInput" type="search" placeholder="Enter a location" autocomplete="off" aria-label="Search for a place">
        </form>
      </div>
      <div class="address-map-controls">
        <button type="button" id="zoomMapIn" aria-label="Zoom in">+</button>
        <button type="button" id="zoomMapOut" aria-label="Zoom out">−</button>
        <button type="button" class="address-current-location" id="useCurrentLocation" aria-label="Use my current location" title="Use my current location"><span>Your location</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      </div>
      <a class="address-map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>
      <p class="address-map-feedback" id="mapFeedback" role="status" aria-live="polite"></p>
    </div>
    <form id="addressForm" class="address-bottom-sheet">
      <div class="address-sheet-handle" aria-hidden="true"><span></span></div>
      <div class="address-selected-location">
        <span class="address-selected-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" fill="currentColor"/><circle cx="12" cy="10" r="2.5" fill="white"/></svg></span>
        <div><h2 id="selectedLocationName">Tubipure Water Refilling Station</h2><p id="addressInputText">Visayan Village, Purok Pioneer, Tagum, 8100 Davao del Norte</p></div>
      </div>
      <p class="address-map-selection-hint">Drag or tap anywhere on the map to place the pin.</p>
      <div class="address-nearby-heading"><h3>Nearby locations</h3><span>Tap to choose</span></div>
      <div id="nearbyLocations" class="address-nearby-list"></div>
      <div class="address-label-row"><label for="addressLabel">Save as</label><input id="addressLabel" name="label" maxlength="80" placeholder="Home, Work, etc." required></div>
      <p id="addressFormFeedback" class="address-form-feedback" role="status" aria-live="polite"></p>
      <button class="address-select-button" type="submit" id="saveAddressBtn">Select</button>
    </form>
  </div>
</section>
