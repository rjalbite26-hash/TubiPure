<div class="overlay" id="deliveryModal">
  <div class="modal delivery-modal" id="deliveryModalPanel">
    <div class="delivery-modal-head">
      <span class="walk-in-order-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="M8 20h32v22H8zM5 18l4-10h30l4 10M5 18c0 3 5 3 5 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 5 3 5 0" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M18 42V29h12v13" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg></span>
      <div class="delivery-modal-title-copy"><h3 id="delModalTitle">Record Walk-in Order</h3><p id="delModalDescription">Record gallons purchased directly at the station.<br>This will automatically update the Overview totals.</p></div>
      <button class="delivery-modal-close" type="button" data-close aria-label="Close dialog">×</button>
    </div>
    <div class="modal-body delivery-modal-body">
      <input type="hidden" id="delId">
      <div class="delivery-standard-fields" id="standardDeliveryFields">
        <div class="form-row" id="fld-delCustomer"><label>Customer</label><select id="delCustomer"></select><div class="err">Please select a customer.</div></div>
        <div class="form-grid2">
          <div class="form-row" id="fld-delDate"><label>Delivery date</label><input type="date" id="delDate"><div class="err">Please choose a date.</div></div>
          <div class="form-row" id="fld-delTime"><label>Time slot</label><select id="delTime"><option value="8:00–10:00 AM">8:00–10:00 AM</option><option value="10:00 AM–12:00 PM">10:00 AM–12:00 PM</option><option value="1:00–3:00 PM">1:00–3:00 PM</option><option value="3:00–5:00 PM">3:00–5:00 PM</option></select></div>
        </div>
        <div id="standardGallonsMount"></div>
        <div id="standardWaterTypeMount"></div>
        <div class="form-row" id="fld-delStatus"><label>Status</label><select id="delStatus"><option>Pending</option><option>Confirmed</option><option>Out for Delivery</option><option>Delivered</option></select></div>
      </div>
      <div class="walk-in-order-layout" id="walkInOrderLayout" hidden>
        <div class="walk-in-order-fields">
          <div id="walkInWaterTypeMount"></div>
          <div id="walkInGallonsMount"></div>
          <p class="walk-in-order-note" id="walkInOrderNote"><span class="walk-in-info-icon" aria-hidden="true">i</span><span>Recorded gallons will be added to today’s sales and gallon totals in Overview.</span></p>
        </div>
        <aside class="walk-in-order-summary" aria-labelledby="walkInSummaryTitle">
          <h4 id="walkInSummaryTitle"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l5 5v13H6zM14 3v6h5M9 13h7M9 17h7"/></svg>Order Summary</h4>
          <dl>
            <div><dt>Water Type</dt><dd id="walkInSummaryWaterType">Alkaline</dd></div>
            <div><dt id="walkInSummaryGallonsLabel">Gallons</dt><dd id="walkInSummaryGallons">—</dd></div>
            <div><dt id="walkInSummaryPriceLabel">Price per Gallon</dt><dd id="walkInSummaryPrice">₱0.00</dd></div>
          </dl>
          <div class="walk-in-summary-total"><strong>Total</strong><b id="walkInSummaryTotal">₱0.00</b></div>
        </aside>
      </div>
      <div class="form-row" id="fld-delGallons"><label id="delGallonsLabel" for="delGallons">Quantity (gallons)</label><input class="delivery-quantity-input" type="number" id="delGallons" min="1" max="1000" step="1" placeholder="Enter quantity"><div class="err">Enter a valid quantity.</div></div>
      <div id="walkInQuantityFields" hidden>
        <div class="form-row" id="fld-delAlkalineQuantity">
          <label for="delAlkalineQuantity">Alkaline gallons</label>
          <div class="walk-in-gallons-control">
            <button type="button" data-order-quantity-target="delAlkalineQuantity" data-quantity-step="-1" aria-label="Decrease alkaline gallons">−</button>
            <input class="delivery-quantity-input" type="number" id="delAlkalineQuantity" min="1" max="1000" step="1" inputmode="numeric" aria-label="Alkaline gallons">
            <button type="button" data-order-quantity-target="delAlkalineQuantity" data-quantity-step="1" aria-label="Increase alkaline gallons">+</button>
          </div>
          <div class="err">Enter a valid quantity.</div>
        </div>
        <div class="form-row" id="fld-delPurifiedQuantity">
          <label for="delPurifiedQuantity">Purified gallons</label>
          <div class="walk-in-gallons-control">
            <button type="button" data-order-quantity-target="delPurifiedQuantity" data-quantity-step="-1" aria-label="Decrease purified gallons">−</button>
            <input class="delivery-quantity-input" type="number" id="delPurifiedQuantity" min="1" max="1000" step="1" inputmode="numeric" aria-label="Purified gallons">
            <button type="button" data-order-quantity-target="delPurifiedQuantity" data-quantity-step="1" aria-label="Increase purified gallons">+</button>
          </div>
          <div class="err">Enter a valid quantity. Combined quantity cannot exceed 1,000 gallons.</div>
        </div>
      </div>
      <div class="form-row" id="fld-delWaterType"><label for="delWaterType">Water Type</label><div class="walk-in-water-select"><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2.8S5.1 11 5.1 15.4a6.9 6.9 0 1 0 13.8 0C18.9 11 12 2.8 12 2.8Z"/></svg></span><select id="delWaterType"><option value="alkaline">Alkaline</option><option value="purified">Purified</option><option value="both">Both</option></select><svg class="walk-in-water-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></div></div>
    </div>
    <div class="modal-foot delivery-modal-foot">
      <button class="btn btn-ghost" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" id="saveDeliveryBtn" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"/></svg>Record Walk-in Order</button>
    </div>
  </div>
</div>
