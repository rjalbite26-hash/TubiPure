<section class="page" id="page-kmr">
  <div class="page-head"><div class="wrap">
    <div>
      <h1>Pricing &amp; Delivery Zones</h1>
      <p>Manage water prices, delivery rates, and delivery zones.</p>
    </div>
  </div></div>
  <div class="page-body"><div class="wrap">
    <section class="pricing-settings-page" id="pricingSettingsPanel" style="display:none;" aria-labelledby="pricingSettingsTitle">
      <form id="pricingSettingsForm" class="pricing-settings-layout">
        <div class="pricing-settings-column">
          <section class="card pricing-editor-card">
            <div class="pricing-card-heading">
              <span class="pricing-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/><path d="M9 16a3 3 0 0 0 3 3"/></svg></span>
              <div><h2 id="pricingSettingsTitle">Water Pricing</h2><p>Set the price per gallon for each water type.</p></div>
            </div>
            <div class="pricing-input-grid">
              <div class="pricing-field"><label for="alkalinePriceInput">Alkaline price per gallon (₱)</label><input type="number" name="alkaline_price_per_gallon" id="alkalinePriceInput" min="0.01" max="999999.99" step="0.01" required></div>
              <div class="pricing-field"><label for="purifiedPriceInput">Purified price per gallon (₱)</label><input type="number" name="purified_price_per_gallon" id="purifiedPriceInput" min="0.01" max="999999.99" step="0.01" required></div>
            </div>
          </section>

          <section class="card pricing-editor-card">
            <div class="pricing-card-heading">
              <span class="pricing-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 6h12v12H3zM15 10h4l3 3v5h-7z"/><circle cx="7" cy="19" r="1.5"/><circle cx="18" cy="19" r="1.5"/></svg></span>
              <div><h2>Delivery Pricing</h2><p>Delivery is calculated from the distance in kilometers.</p></div>
            </div>
            <div class="pricing-input-grid pricing-input-grid-single">
              <div class="pricing-field"><label for="deliveryKmPriceInput">Price per kilometer (₱)</label><input type="number" name="delivery_price_per_km" id="deliveryKmPriceInput" min="0.01" max="999999.99" step="0.01" required></div>
              <p class="pricing-calculation-note">Trips up to 1 km cost ₱5.00. Longer trips use the per-kilometer rate, with a ₱5.00 minimum.</p>
            </div>
          </section>

          <section class="card pricing-editor-card pricing-zones-card">
            <div class="pricing-card-heading pricing-zones-heading">
              <span class="pricing-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg></span>
              <div><h2>Delivery Zones</h2><p>Distance coverage used to identify delivery areas.</p></div>
            </div>
            <div class="pricing-zone-table-wrap"><table class="pricing-zone-table"><thead><tr><th>Zone</th><th>Distance range</th><th>Delivery rate</th></tr></thead><tbody id="pricingZonesTable"></tbody></table></div>
          </section>

        </div>

        <aside class="card pricing-preview-card" aria-labelledby="pricingPreviewTitle">
          <div class="pricing-preview-heading"><h2 id="pricingPreviewTitle">Current Settings Preview</h2><p>Here’s a summary of your current configuration.</p></div>
          <section class="pricing-preview-group">
            <div class="pricing-preview-group-heading"><span class="pricing-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/></svg></span><h3>Water Pricing</h3></div>
            <div class="pricing-preview-line"><span>Alkaline (per gallon)</span><strong id="previewAlkalinePrice">—</strong></div>
            <div class="pricing-preview-line"><span>Purified (per gallon)</span><strong id="previewPurifiedPrice">—</strong></div>
          </section>
          <section class="pricing-preview-group">
            <div class="pricing-preview-group-heading"><span class="pricing-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 6h12v12H3zM15 10h4l3 3v5h-7z"/><circle cx="7" cy="19" r="1.5"/><circle cx="18" cy="19" r="1.5"/></svg></span><h3>Delivery Pricing</h3></div>
            <div class="pricing-preview-line"><span>Price per kilometer</span><strong id="previewDeliveryRate">—</strong></div>
          </section>
          <section class="pricing-preview-group">
            <div class="pricing-preview-group-heading"><span class="pricing-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg></span><h3>Delivery Zones</h3></div>
            <div id="pricingPreviewZones"></div>
          </section>
          <div class="pricing-preview-actions"><button class="btn btn-ghost" id="resetPricingSettingsBtn" type="button">↻ <span>Reset Changes</span></button><button class="btn btn-primary" id="savePricingSettingsBtn" type="submit">▣ <span>Save Settings</span></button></div>
          <p class="pricing-settings-feedback" id="pricingSettingsFeedback" aria-live="polite"></p>
        </aside>
      </form>
    </section>

    <details class="card pricing-estimator">
      <summary>Delivery distance calculator</summary>
      <div class="kmr-grid">
        <div class="card">
          <div class="section-title"><h2>Enter delivery distance</h2></div>
          <div class="form-row"><label for="kmInput">Distance from station (km)</label><input type="number" id="kmInput" min="0" step="0.1" placeholder="e.g. 3.2"><div class="helper-text">Or pick a coverage zone below.</div></div>
          <div class="zone-radios" id="zoneRadios"></div>
        </div>
        <div class="card kmr-result"><div class="zone-map" id="zoneMap"></div><div class="kmr-zone-lbl" id="resultZoneLbl">Zone A</div><div class="kmr-price" id="resultPrice">₱5<span>/ km</span></div><div class="helper-text" id="resultNote">Enter a distance or select a zone to calculate the delivery fee.</div><table class="tier-table" id="tierTable"></table></div>
      </div>
    </details>
  </div></div>
</section>
