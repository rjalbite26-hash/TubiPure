<section class="page active" id="page-home">
  <div class="hero-v2">
    <div class="wrap hero-v2-inner">
      <div>
        <div class="hero-eyebrow-v2"><span class="dash"></span>Pure Water Delivery</div>
        <h1 class="hero-v2-h1">Fresh &amp; Clean Water<span>Delivered to Your Door</span></h1>
        <p class="hero-v2-p"><strong>TubiPure provides safe, high-quality drinking water with fast and reliable delivery. Order now and enjoy clean, refreshing water — anytime, anywhere.</strong></p>
        <div class="hero-feat-row">
          <div class="hf-item">
            <div class="hf-ic"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 2L43 9v13c0 11-8 18-19 24C13 40 5 33 5 22V9Z" fill="currentColor"/><path d="m15 23 6 6 13-14" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <b>Safe &amp; Clean</b><span>Premium quality water</span>
          </div>
          <div class="hf-item">
            <div class="hf-ic"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 4h16l24 24a4 4 0 010 6L32 47a4 4 0 01-6 0L2 23V7a3 3 0 013-3Z" fill="currentColor"/><circle cx="12" cy="13" r="3" fill="white"/></svg></div>
            <b>Affordable Prices</b><span>Great value for your family</span>
          </div>
          <div class="hf-item">
            <div class="hf-ic"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M43 4C24 12 4 5 6 33c9-14 20-11 30-21C24 29 11 23 7 45c8-20 37-8 36-41Z" fill="currentColor"/></svg></div>
            <b>Healthy Life</b><span>Clean water, better tomorrow</span>
          </div>
        </div>
        <div class="hero-v2-cta">
          <button class="btn btn-primary" id="heroOrderNowBtn" data-customer-order-action style="{{ auth()->user()?->role === 'staff' ? 'display: none;' : '' }}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="21" r="1.4" fill="currentColor"/><circle cx="18" cy="21" r="1.4" fill="currentColor"/><path d="M2.5 3h2l2.3 12.4a2 2 0 002 1.6h8.4a2 2 0 002-1.6L21 7H6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Order Now
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="btn btn-outline-blue" id="heroViewProductsBtn" data-customer-order-action type="button" style="{{ auth()->user()?->role === 'staff' ? 'display: none;' : '' }}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            My Order
          </button>
        </div>
      </div>
      <div class="hero-v2-photo">
        <img src="/images/tubipure-delivery.png" alt="TubiPure delivery tricycle loaded with water gallons outside the refilling station in Visayan Village, Tagum City">
      </div>
      <aside class="delivery-hours-card" aria-label="TubiPure station and delivery hours">
        <div class="delivery-hours-card-heading">
          <div><span class="delivery-hours-eyebrow">PLAN YOUR REFILL</span><h2>Delivery hours</h2></div>
          <span class="delivery-open-status is-open" id="deliveryOpenStatus" aria-live="polite"><span class="delivery-open-status-dot"></span><span id="deliveryOpenStatusText">Open now · closes 6:00 PM</span></span>
        </div>
        <div class="delivery-hours-row"><span>Delivery available</span><strong id="homeDeliveryHours">7:00 AM – 4:00 PM</strong></div>
        <div class="delivery-hours-row"><span>Station hours</span><strong id="homeStationHours">6:00 AM – 6:00 PM</strong></div>
      </aside>
    </div>
    <svg class="hero-wave" viewBox="0 0 1440 160" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="waveGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#009FEF"/>
          <stop offset="1" stop-color="#0063bb"/>
        </linearGradient>
      </defs>
      <path d="M0,32 C260,155 370,18 620,38 C850,48 980,165 1190,94 C1290,60 1380,8 1440,0 L1440,160 L0,160 Z" fill="#BFE3F7"/>
      <path d="M0,43 C260,166 370,29 620,49 C850,59 980,176 1190,105 C1290,71 1380,19 1440,11 L1440,160 L0,160 Z" fill="url(#waveGrad)"/>
    </svg>
  </div>

  <div class="intro">
    <div class="wrap">
      <div class="intro-copy">
        <h2>Clean water, close to home</h2>
        <p>TubiPure is a water refilling station based in Visayan Village, Purok Pioneer, Tagum, 8100 Davao del Norte, serving households and businesses with alkaline and purified drinking water. This system helps our riders and staff keep every order, schedule, and delivery zone organized — no paper logs required.</p>
      </div>
      <section class="intro-water-guide" aria-labelledby="waterGuideTitle">
        <div class="intro-water-guide-heading">
          <span>WATER GUIDE</span>
          <h3 id="waterGuideTitle">Two ways to refresh</h3>
          <p>Choose the water that best suits your taste.</p>
        </div>
        <div class="intro-water-options">
          <article class="intro-water-option intro-water-option-alkaline">
            <span class="intro-water-mark" aria-hidden="true">A</span>
            <div><h4>Alkaline</h4><p>A higher-pH profile with a smooth, mineral-balanced taste.</p></div>
            <span class="intro-water-detail">SMOOTH &amp; MINERAL-BALANCED</span>
          </article>
          <article class="intro-water-option intro-water-option-purified">
            <span class="intro-water-mark" aria-hidden="true">P</span>
            <div><h4>Purified</h4><p>Carefully filtered for a crisp, clean, refreshing taste.</p></div>
            <span class="intro-water-detail">CRISP &amp; CLEAN</span>
          </article>
        </div>
      </section>
      <div class="intro-stats">
        <div class="stat-box"><div class="num" id="introCustomers">0</div><div class="lbl">Customers served</div></div>
        <div class="stat-box"><div class="num" id="introToday">0</div><div class="lbl">Deliveries today</div></div>
        <div class="stat-box"><div class="num" id="introGallons">0</div><div class="lbl">Gallons this week</div></div>
      </div>
    </div>
  </div>

  <section class="home-pricing" aria-labelledby="homePricingTitle">
    <div class="wrap">
      <div class="home-pricing-heading">
        <span class="home-pricing-eyebrow">CLEAR, SIMPLE RATES</span>
        <h2 id="homePricingTitle">Water pricing</h2>
        <p>Choose the water you need. Delivery is priced by the distance to your address.</p>
      </div>
      <div class="home-pricing-grid">
        <article class="home-pricing-card">
          <span class="home-pricing-label">ALKALINE</span>
          <h3>Alkaline water</h3>
          <p class="home-pricing-price" id="homeAlkalinePrice" aria-live="polite">Loading price…</p>
          <span class="home-pricing-unit">per gallon</span>
        </article>
        <article class="home-pricing-card">
          <span class="home-pricing-label">PURIFIED</span>
          <h3>Purified water</h3>
          <p class="home-pricing-price" id="homePurifiedPrice" aria-live="polite">Loading price…</p>
          <span class="home-pricing-unit">per gallon</span>
        </article>
        <article class="home-pricing-card home-delivery-pricing-card">
          <span class="home-pricing-label">DELIVERY</span>
          <h3>Distance-based delivery</h3>
          <p class="home-pricing-price" id="homeDeliveryPrice" aria-live="polite">Loading rate…</p>
          <span class="home-pricing-unit">per kilometer</span>
          <p class="home-pricing-note">Your delivery fee depends on the distance from TubiPure to your saved address.</p>
        </article>
      </div>
    </div>
  </section>

  <div class="features" id="featuresSection">
    <div class="wrap">
      <h2>How to place and track your order</h2>
      <p>Follow these steps to order water and check its progress afterward.</p>
      <div class="feat-grid">
        <article class="feat-card tutorial-card">
          <div class="ic" style="background:var(--deep);" aria-hidden="true">1</div>
          <h3>Choose your water</h3>
          <p>Sign in, select alkaline, purified, or both, then enter your quantities and choose delivery or pickup.</p>
          <button class="tutorial-action" id="tutorialPlaceOrderBtn" data-customer-order-action type="button">Start an order →</button>
        </article>
        <article class="feat-card tutorial-card">
          <div class="ic" style="background:var(--blue);" aria-hidden="true">2</div>
          <h3>Review and send</h3>
          <p>Check your address, schedule, water subtotal, and delivery fee. Submit the request and confirm the order.</p>
        </article>
        <article class="feat-card tutorial-card">
          <div class="ic" style="background:var(--leaf);" aria-hidden="true">3</div>
          <h3>View your order</h3>
          <p>Open My Orders to see your order details and follow its status as the team approves and delivers it.</p>
          <button class="tutorial-action" id="tutorialViewOrdersBtn" data-customer-order-action type="button">Open My Orders →</button>
        </article>
      </div>
    </div>
  </div>
</section>
