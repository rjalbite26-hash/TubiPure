<section class="page order-page" id="page-order" data-village-area="{{ json_encode(config('water.village_polygon')) }}">
  <div class="page-head"><div class="wrap">
    <div><h1>Place an order</h1><p>Choose your water and tell us when and where you’d like it.</p></div>
  </div></div>
  <div class="page-body"><div class="wrap">
    <div class="order-login-note card" id="orderLoginNote" hidden>
      <h2>Sign in to place your order</h2>
      <p class="helper-text">Your order and delivery details are saved securely to your customer account.</p>
      <a class="btn btn-primary" href="{{ route('login', ['intent' => 'order']) }}">Log in or sign up</a>
    </div>
    <dialog class="order-success-dialog" id="orderSuccessDialog" aria-labelledby="orderSuccessTitle" aria-describedby="orderSuccessMessage">
      <div class="order-success" id="orderSuccess" role="status">
        <div class="order-success-sparkles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <button class="order-success-close" id="closeOrderSuccessBtn" type="button" aria-label="Close confirmation">×</button>
        <span class="order-success-mark" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="m13 24 7.5 7.5L35 17"/></svg></span>
        <div class="order-success-copy"><h2 id="orderSuccessTitle">Order request received</h2><p id="orderSuccessMessage">We’ll confirm your order soon.</p></div>
        <div class="order-success-total"><span class="order-success-total-icon" aria-hidden="true"><svg viewBox="0 0 40 48"><path d="M10 3h14l11 11v30H10z"/><path d="M24 3v12h11M16 24h13M16 31h13M16 38h9"/></svg></span><span><small>Order Total</small><strong id="orderSuccessTotal">₱0.00</strong></span></div>
        <div class="order-success-actions"><button class="order-success-orders" id="orderViewHistoryBtn" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>View my orders</button><button class="order-success-again" id="orderAgainBtn" type="button">Order Again</button></div>
      </div>
    </dialog>
    <div class="order-shell" id="orderFormShell" hidden>
      <form class="order-form" id="customerOrderForm" novalidate>
        <div class="order-form-card">
          <div class="order-section-head"><span>01</span><div><h2>Choose your water</h2><p>Choose one type or both. Set a separate quantity for alkaline and purified water when ordering both.</p></div></div>
          <fieldset class="order-fieldset">
            <legend>Water type</legend>
            <div class="order-choice-grid order-water-type-grid">
              <label class="order-choice"><input type="radio" name="water_selection" value="alkaline" required><span class="order-choice-copy"><b>Alkaline</b><small>Mineral-balanced everyday hydration</small></span><strong class="order-choice-price" id="alkalinePrice">₱50/gal</strong></label>
              <label class="order-choice"><input type="radio" name="water_selection" value="purified"><span class="order-choice-copy"><b>Purified</b><small>Clean, refreshing drinking water</small></span><strong class="order-choice-price" id="purifiedPrice">₱25/gal</strong></label>
              <label class="order-choice"><input type="radio" name="water_selection" value="both"><span class="order-choice-copy"><b>Both</b><small>Alkaline and purified</small></span></label>
            </div>
            <p class="order-field-error" data-error-for="water_selection"></p>
          </fieldset>
          <fieldset class="order-fieldset">
            <input type="hidden" name="container_size_gallons" value="1">
            <div class="order-quantity-single" id="singleQuantityField">
              <div class="order-quantity">
                <label class="order-quantity-label" for="orderQuantity">Gallons</label>
                <div class="order-quantity-stepper">
                  <button type="button" data-order-quantity-target="orderQuantity" data-quantity-step="-1" aria-label="Decrease gallons">−</button>
                  <input type="number" name="quantity" id="orderQuantity" value="" min="1" max="50" required inputmode="numeric" aria-label="Gallons">
                  <button type="button" data-order-quantity-target="orderQuantity" data-quantity-step="1" aria-label="Increase gallons">+</button>
                </div>
                <small>Number of gallons</small>
              </div>
            </div>
            <div class="order-quantity-both" id="bothQuantityFields" hidden>
              <div class="order-quantity">
                <label class="order-quantity-label" for="alkalineQuantity">Alkaline gallons</label>
                <div class="order-quantity-stepper">
                  <button type="button" data-order-quantity-target="alkalineQuantity" data-quantity-step="-1" aria-label="Decrease alkaline gallons">−</button>
                  <input type="number" name="alkaline_quantity" id="alkalineQuantity" value="" min="1" max="50" disabled inputmode="numeric" aria-label="Alkaline gallons">
                  <button type="button" data-order-quantity-target="alkalineQuantity" data-quantity-step="1" aria-label="Increase alkaline gallons">+</button>
                </div>
                <small>Gallons of alkaline water</small>
              </div>
              <div class="order-quantity">
                <label class="order-quantity-label" for="purifiedQuantity">Purified gallons</label>
                <div class="order-quantity-stepper">
                  <button type="button" data-order-quantity-target="purifiedQuantity" data-quantity-step="-1" aria-label="Decrease purified gallons">−</button>
                  <input type="number" name="purified_quantity" id="purifiedQuantity" value="" min="1" max="50" disabled inputmode="numeric" aria-label="Purified gallons">
                  <button type="button" data-order-quantity-target="purifiedQuantity" data-quantity-step="1" aria-label="Increase purified gallons">+</button>
                </div>
                <small>Gallons of purified water</small>
              </div>
            </div>
            <p class="order-field-error" data-error-for="quantity"></p>
            <p class="order-field-error" data-error-for="alkaline_quantity"></p>
            <p class="order-field-error" data-error-for="purified_quantity"></p>
          </fieldset>
        </div>

        <div class="order-form-card">
          <div class="order-section-head"><span>02</span><div><h2>Delivery or pickup</h2><p>Choose how you’d like to receive your order.</p></div></div>
          <fieldset class="order-fieldset">
            <legend>Fulfillment method</legend>
            <div class="order-choice-grid order-fulfillment-grid">
              <label class="order-choice"><input type="radio" name="fulfillment_method" value="delivery" required><span class="order-choice-icon" aria-hidden="true">⌖</span><span><b>Delivery</b><small>Bring it to your address</small></span></label>
              <label class="order-choice"><input type="radio" name="fulfillment_method" value="pickup"><span class="order-choice-icon" aria-hidden="true">⌂</span><span><b>Pickup</b><small>Collect from our station</small></span></label>
            </div>
          </fieldset>
          <div class="form-row order-payment-field"><label for="orderPaymentMethod">Payment method</label><select name="payment_method" id="orderPaymentMethod" required><option value="" selected disabled>Choose a payment method</option><option value="cash_on_delivery">Cash on delivery</option></select><p class="order-time-help">Pay when your order arrives or when you pick it up.</p><p class="order-field-error" data-error-for="payment_method"></p></div>
          <div class="order-delivery-fields" id="orderDeliveryFields">
            <div class="order-input-grid">
              <div class="form-row"><label id="orderAddressLabel" for="orderAddressTrigger">Delivery address</label><div class="order-address-select"><select class="order-address-native" name="delivery_address" id="orderAddress" tabindex="-1" aria-hidden="true"><option value="">Choose a saved address</option></select><button class="order-address-trigger" id="orderAddressTrigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="orderAddressOptions" aria-labelledby="orderAddressLabel"><span class="order-address-selected" aria-hidden="true"><span class="order-address-marquee" id="orderAddressMarquee"></span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="order-address-options" id="orderAddressOptions" role="listbox" aria-labelledby="orderAddressLabel" hidden></div></div><p class="order-field-error" data-error-for="delivery_address"></p><p class="order-address-empty" id="orderAddressEmpty" hidden>No saved addresses yet. <a href="#address" data-route="address">Add an address in My Address</a> before placing a delivery order.</p><a class="order-address-manage" href="#address" data-route="address">Manage saved addresses</a></div>
              <div class="form-row" id="orderZoneField"><label>Delivery coverage</label><output class="order-coverage-result" id="orderCoverageResult">Choose a saved address to calculate coverage.</output><p class="order-coverage-detail" id="orderCoverageDetail"></p><input type="hidden" name="delivery_zone" id="orderZone"><p class="order-field-error" data-error-for="delivery_zone"></p></div>
            </div>
          </div>
          <div class="order-pickup-note" id="orderPickupNote" hidden>
            <b>Pickup location</b>
            <span>Visayan Village, Purok Pioneer, Tagum, 8100 Davao del Norte</span>
            <a href="https://www.google.com/maps/place/Tubipure+Water+Refilling+Station/@7.4286962,125.798159,20z/data=!4m6!3m5!1s0x32f953001ebdfba3:0x72221dd436aa39f2!8m2!3d7.4288167!4d125.7984943!16s%2Fg%2F11nc1fmjg2" target="_blank" rel="noopener noreferrer">Open pickup location in Google Maps ↗</a>
          </div>
          <div class="order-input-grid order-schedule-grid">
            <div class="form-row"><label for="orderDate">Preferred date</label><input type="date" name="date" id="orderDate" required><p class="order-field-error" data-error-for="date"></p></div>
            <div class="form-row order-time-field"><label for="orderTimeTrigger">Preferred time</label><button class="order-time-trigger" id="orderTimeTrigger" type="button" aria-haspopup="dialog" aria-controls="orderTimeDialog"><span id="orderTimeDisplay">Choose a time</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button><input type="hidden" name="time_slot" id="orderTime" value=""><p class="order-time-help" id="orderTimeHelp">Available from 7:00 AM to 4:00 PM</p><p class="order-field-error" data-error-for="time_slot"></p></div>
          </div>
        </div>

        <div class="order-form-card">
          <div class="order-section-head"><span>03</span><div><h2>Your contact details</h2><p>We’ll use these details to confirm and coordinate your order.</p></div></div>
          <div class="order-input-grid">
            <div class="form-row"><label for="orderContactName">Contact name</label><input name="contact_name" id="orderContactName" autocomplete="name" maxlength="255" required readonly><p class="order-field-error" data-error-for="contact_name"></p></div>
            <div class="form-row"><label for="orderPhone">Contact number</label><input type="tel" name="contact_phone" id="orderPhone" autocomplete="tel" inputmode="numeric" pattern="[0-9]{11}" maxlength="11" title="Enter exactly 11 digits." placeholder="09XXXXXXXXX" required><p class="order-field-error" data-error-for="contact_phone"></p></div>
          </div>
          <div class="form-row order-instructions-row"><label for="orderInstructions">Delivery instructions <span>(optional)</span></label><textarea name="delivery_instructions" id="orderInstructions" rows="3" maxlength="1000" placeholder="Landmarks, gate details, or other helpful notes"></textarea><p class="order-field-error" data-error-for="delivery_instructions"></p></div>
        </div>
        <div class="order-feedback" id="orderFeedback" role="alert" hidden></div>
        <div class="order-submit-row">
          <p class="order-next-step"><span class="order-next-step-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 3.75h7l4 4v12.5H7z"/><path d="M14 3.75v4h4M9.5 12h6M9.5 15.5h6M9.5 9h1.5"/></svg></span><span><strong>Next step:</strong> Review your order before submitting.</span></p>
          <button type="submit" class="btn btn-primary order-submit" id="orderSubmitBtn"><span>Send Order Request</span><span aria-hidden="true">→</span></button>
        </div>
      </form>
    </div>
    <dialog class="order-summary-dialog" id="orderSummaryDialog" aria-labelledby="orderSummaryTitle">
      <div class="order-summary-card">
        <div class="order-summary-title"><span aria-hidden="true">◷</span><div><h2 id="orderSummaryTitle">Review your order</h2><p>Check your details before sending your request.</p></div></div>
        <dl class="order-summary-list">
          <div><dt>Water</dt><dd id="summaryWater">Purified</dd></div>
          <div><dt>Water quantity</dt><dd id="summaryContainer">3 gallons</dd></div>
          <div><dt>Total quantity</dt><dd id="summaryGallons">3 gallons</dd></div>
          <div><dt>Water subtotal</dt><dd id="summaryWaterSubtotal">—</dd></div>
          <div><dt>Fulfillment</dt><dd id="summaryFulfillment">Delivery · Zone A</dd></div>
          <div><dt>Payment method</dt><dd id="summaryPaymentMethod">Cash on delivery</dd></div>
          <div><dt>Address</dt><dd id="summaryAddress">Choose a saved address</dd></div>
          <div><dt>Delivery fee</dt><dd id="summaryDeliveryFee">—</dd></div>
          <div><dt>Schedule</dt><dd id="summarySchedule">Choose date and time</dd></div>
        </dl>
        <div class="order-total-row"><span>Estimated total</span><strong id="summaryTotal">₱75</strong></div>
        <p class="order-summary-note" id="summaryNote">Delivery is calculated by distance at the configured rate per kilometer.</p>
        <p class="order-privacy-note"><span aria-hidden="true">✓</span> Your contact details are shared only with our team to arrange this order.</p>
        <div class="order-confirm-actions">
          <button class="btn btn-ghost" id="orderEditBtn" type="button">Go back and edit</button>
          <button class="btn btn-primary" id="orderConfirmBtn" type="button">Confirm and send</button>
        </div>
      </div>
    </dialog>
  </div></div>
</section>
