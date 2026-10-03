import './theme.js';
import './address-map.js';
import './contact-directions.js';

(function(){
"use strict";

/* ---------------- DATA LAYER ---------------- */
const ZONES = [
  {id:'A', name:'Zone A', range:'0 – 2 km', max:2},
  {id:'B', name:'Zone B', range:'2 – 5 km', max:5},
  {id:'C', name:'Zone C', range:'5 km+', max:Infinity}
];
const MINIMUM_DELIVERY_FEE = 5;
function deliveryFeeForDistance(distanceInKilometers, ratePerKilometer){
  const distanceBasedFee=Math.round(distanceInKilometers*ratePerKilometer*100)/100;
  return distanceInKilometers<=1?MINIMUM_DELIVERY_FEE:Math.max(MINIMUM_DELIVERY_FEE,distanceBasedFee);
}
const COMPANY_LOCATION = {
  latitude:Number(document.querySelector('meta[name="company-latitude"]').content),
  longitude:Number(document.querySelector('meta[name="company-longitude"]').content)
};
const VISAYAN_VILLAGE_POLYGON=JSON.parse(document.getElementById('page-order')?.dataset.villageArea||'[]');
const OUTSIDE_DELIVERY_AREA_MESSAGE='Delivery is available only within Visayan Village, Tagum City. Choose pickup or select an address within the delivery area.';
function isWithinVisayanVillage(latitude,longitude){
  let inside=false;
  for(let current=0,previous=VISAYAN_VILLAGE_POLYGON.length-1;current<VISAYAN_VILLAGE_POLYGON.length;previous=current++){
    const [currentLongitude,currentLatitude]=VISAYAN_VILLAGE_POLYGON[current];
    const [previousLongitude,previousLatitude]=VISAYAN_VILLAGE_POLYGON[previous];
    const crossProduct=(longitude-currentLongitude)*(previousLatitude-currentLatitude)
      -(latitude-currentLatitude)*(previousLongitude-currentLongitude);
    const onSegment=Math.abs(crossProduct)<1e-10
      &&longitude>=Math.min(currentLongitude,previousLongitude)-1e-10
      &&longitude<=Math.max(currentLongitude,previousLongitude)+1e-10
      &&latitude>=Math.min(currentLatitude,previousLatitude)-1e-10
      &&latitude<=Math.max(currentLatitude,previousLatitude)+1e-10;
    if(onSegment) return true;
    const crossesLatitude=(currentLatitude>latitude)!==(previousLatitude>latitude);
    if(crossesLatitude&&longitude<(previousLongitude-currentLongitude)*(latitude-currentLatitude)/(previousLatitude-currentLatitude)+currentLongitude){
      inside=!inside;
    }
  }
  return inside;
}
const siteTimezone=document.querySelector('meta[name="app-timezone"]').content;
function localDateString(date){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:siteTimezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const todayStr = localDateString(new Date());
function currentSiteTimeSlot(){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:siteTimezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(part=>[part.type,part.value]));
  return `${parts.hour}:${parts.minute}`;
}
function addDays(base,n){ const d=new Date(`${base}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }

let customers = [];
let deliveries = [];
let registeredUsers = [];
let currentUser = null;
let pricingSettings = null;
let orderDeliveryDistanceKm = null;
let customerOrderFilter = 'all';
let customerOrderSort = 'newest';
let customerOrderDateFilter = '';
let liveNotificationUserId = null;
let isNotificationPollRunning = false;
let isLivePricingPollRunning = false;
let isPublicStatsPollRunning = false;
let pricingFormHasLocalEdits = false;
let dateTimeFormHasLocalEdits = false;

async function api(path, options={}){
  const {headers:requestHeaders={},...requestOptions}=options;
  const isFormData=requestOptions.body instanceof FormData;
  const response = await fetch('/api'+path, {
    credentials:'same-origin',
    ...requestOptions,
    headers:{'Accept':'application/json',...(isFormData?{}:{'Content-Type':'application/json'}),'X-CSRF-TOKEN':document.querySelector('meta[name="csrf-token"]').content,...requestHeaders}
  });
  const payload = await response.json().catch(()=>({}));
  if(payload.csrfToken){
    document.querySelector('meta[name="csrf-token"]').content = payload.csrfToken;
  }
  if(!response.ok){
    if(response.status===401){
      const sessionCheck=path==='/me'?response:await fetch('/api/me',{
        credentials:'same-origin',
        headers:{'Accept':'application/json'}
      }).catch(()=>null);
      if(sessionCheck?.status===401){
        currentUser=null; customers=[]; deliveries=[];
        updateAuthNavigation();
        setAuthMode('login');
        go('myaccount');
        document.getElementById('authFeedback').textContent='Your session ended. Please sign in again.';
      }
    }
    const messages = Object.values(payload.errors||{}).flat();
    const error = new Error(response.status===419 ? 'Your session expired. Refresh the page and sign in again.' : (messages[0] || payload.message || 'Something went wrong. Please try again.'));
    error.status = response.status;
    error.errors = payload.errors||{};
    throw error;
  }
  return payload;
}

function appendLocalResetLink(container, resetUrl){
  if(!resetUrl) return;
  let localUrl;
  try{
    localUrl=new URL(resetUrl,window.location.origin);
  }catch{
    return;
  }
  if(localUrl.origin!==window.location.origin) return;
  const link=document.createElement('a');
  link.className='auth-local-reset-link';
  link.href=localUrl.href;
  link.textContent='Open the local reset form';
  container.append(document.createElement('br'),link);
}

async function loadPricingSettings(){
  const response=await api('/pricing');
  pricingSettings=response.data;
  return pricingSettings;
}

function applyLivePricingSettings(settings){
  if(!settings) return;
  const previousSettings=JSON.stringify(pricingSettings);
  const nextSettings=JSON.stringify(settings);
  if(previousSettings===nextSettings) return;
  pricingSettings=settings;
  updateDeliveryHoursCard();
  renderOrderWaterPrices();
  const price=value=>`₱${Number(value).toFixed(2).replace(/\.00$/,'')}`;
  document.getElementById('homeAlkalinePrice').textContent=price(settings.alkaline_price_per_gallon);
  document.getElementById('homePurifiedPrice').textContent=price(settings.purified_price_per_gallon);
  document.getElementById('homeDeliveryPrice').textContent=price(settings.delivery_price_per_km);
  const activePage=document.querySelector('.page.active')?.id;
  if(activePage==='page-kmr'){
    if(!pricingFormHasLocalEdits) renderKmr();
    else{
      renderPricingPreview();
      const selectedZone=document.querySelector('.zone-radio.sel')?.dataset.zone||'A';
      selectZone(selectedZone);
    }
  }
  if(activePage==='page-datetime'){
    if(!pricingFormHasLocalEdits) renderPricingSettingsForm();
    if(!dateTimeFormHasLocalEdits) renderDateTimeSettingsForm();
  }
  if(activePage==='page-order') updateOrderSummary();
  toast('Live settings updated','Current prices and service hours are now up to date.');
}

async function pollLivePricingSettings(){
  if(document.hidden||isLivePricingPollRunning) return;
  isLivePricingPollRunning=true;
  try{
    const response=await api('/pricing');
    applyLivePricingSettings(response.data);
  }catch{
    // A failed live refresh should not interrupt the current page or account session.
  }finally{
    isLivePricingPollRunning=false;
  }
}

function renderPricingSettingsForm(){
  if(!pricingSettings) return;
  document.getElementById('alkalinePriceInput').value=pricingSettings.alkaline_price_per_gallon;
  document.getElementById('purifiedPriceInput').value=pricingSettings.purified_price_per_gallon;
  document.getElementById('deliveryKmPriceInput').value=pricingSettings.delivery_price_per_km;
  renderPricingPreview();
}

function renderPricingPreview(){
  const alkaline=Number(document.getElementById('alkalinePriceInput').value||0);
  const purified=Number(document.getElementById('purifiedPriceInput').value||0);
  const deliveryRate=Number(document.getElementById('deliveryKmPriceInput').value||0);
  document.getElementById('previewAlkalinePrice').textContent=`₱${alkaline.toFixed(2)}`;
  document.getElementById('previewPurifiedPrice').textContent=`₱${purified.toFixed(2)}`;
  document.getElementById('previewDeliveryRate').textContent=`₱${deliveryRate.toFixed(2)} / km`;
  document.getElementById('pricingZonesTable').innerHTML=ZONES.map(zone=>`
    <tr><td><span class="pricing-zone-dot pricing-zone-${zone.id.toLowerCase()}"></span>${escapeHtml(zone.name)}</td><td>${escapeHtml(zone.range)}</td><td>₱${deliveryRate.toFixed(2)} / km</td></tr>`).join('');
  document.getElementById('pricingPreviewZones').innerHTML=ZONES.map(zone=>`
    <div class="pricing-preview-line"><span><i class="pricing-zone-dot pricing-zone-${zone.id.toLowerCase()}"></i>${escapeHtml(zone.name)} (${escapeHtml(zone.range)})</span><strong>₱${deliveryRate.toFixed(2)} / km</strong></div>`).join('');
}

const scheduleWeekdays=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
function scheduleHoursForDay(scheduleType,day){
  const schedule=pricingSettings?.[scheduleType];
  if(schedule&&schedule[day]) return schedule[day];
  const isStation=scheduleType==='station_schedule';
  return {
    open:true,
    opens:String(pricingSettings?.[isStation?'opening_time':'delivery_start_time']||(isStation?'06:00':'07:00')).slice(0,5),
    closes:String(pricingSettings?.[isStation?'closing_time':'delivery_end_time']||(isStation?'18:00':'16:00')).slice(0,5)
  };
}
function renderDateTimeSettingsForm(){
  if(!pricingSettings) return;
  dateTimeFormHasLocalEdits=false;
  ['station_schedule','delivery_schedule'].forEach(scheduleType=>{
    scheduleWeekdays.forEach(day=>{
      const row=document.querySelector(`[data-schedule-row="${scheduleType}"][data-schedule-day="${day}"]`);
      if(!row) return;
      const hours=scheduleHoursForDay(scheduleType,day);
      const isOpen=Boolean(hours.open);
      row.classList.toggle('is-closed',!isOpen);
      const checkbox=row.querySelector('[data-schedule-open]');
      checkbox.checked=isOpen;
      row.querySelector('.datetime-closed-label').hidden=isOpen;
      row.querySelectorAll('.datetime-time-field button').forEach(button=>button.disabled=!isOpen);
      const opensInput=document.getElementById(`${scheduleType}${day}OpenInput`);
      const closesInput=document.getElementById(`${scheduleType}${day}CloseInput`);
      opensInput.value=String(hours.opens||'06:00').slice(0,5);
      closesInput.value=String(hours.closes||'18:00').slice(0,5);
      document.getElementById(`${scheduleType}${day}OpenDisplay`).textContent=formatTimeWithPeriod(opensInput.value);
      document.getElementById(`${scheduleType}${day}CloseDisplay`).textContent=formatTimeWithPeriod(closesInput.value);
    });
  });
}
function readWeeklySchedule(scheduleType){
  return Object.fromEntries(scheduleWeekdays.map(day=>{
    const row=document.querySelector(`[data-schedule-row="${scheduleType}"][data-schedule-day="${day}"]`);
    return [day,{
      open:row.querySelector('[data-schedule-open]').checked,
      opens:document.getElementById(`${scheduleType}${day}OpenInput`).value,
      closes:document.getElementById(`${scheduleType}${day}CloseInput`).value
    }];
  }));
}
function updateScheduleDayState(checkbox){
  const row=checkbox.closest('.datetime-day-row');
  row.classList.toggle('is-closed',!checkbox.checked);
  row.querySelector('.datetime-closed-label').hidden=checkbox.checked;
  row.querySelectorAll('.datetime-time-field button').forEach(button=>button.disabled=!checkbox.checked);
}

function renderOrderWaterPrices(){
  if(!pricingSettings) return;
  document.getElementById('alkalinePrice').textContent=`₱${Number(pricingSettings.alkaline_price_per_gallon).toFixed(2).replace(/\.00$/,'')}/gal`;
  document.getElementById('purifiedPrice').textContent=`₱${Number(pricingSettings.purified_price_per_gallon).toFixed(2).replace(/\.00$/,'')}/gal`;
}

async function loadStaffData(){
  const data = await api('/staff/dashboard');
  customers = data.customers;
  deliveries = data.deliveries;
  updatePendingOrderCount();
  populateDeliveryCustomerSelect();
}
function updatePendingOrderCount(){
  const activeOrderCount=deliveries.filter(delivery=>['Pending','Confirmed','Out for Delivery','Delayed'].includes(delivery.status)).length;
  const badge=document.getElementById('adminPendingOrderCount');
  if(!badge) return;
  badge.textContent=activeOrderCount>99?'99+':String(activeOrderCount);
  badge.hidden=activeOrderCount===0;
  badge.setAttribute('aria-label',`${activeOrderCount} active customer orders`);
  badge.closest('button')?.setAttribute('title',activeOrderCount?`Orders · ${activeOrderCount} active orders`:'Orders');
}
function newUsersLastSeenKey(){
  return currentUser?.role==='staff'?`tubipure-new-users-last-seen-${currentUser.id}`:null;
}
function getNewUsersLastSeen(){
  const key=newUsersLastSeenKey();
  if(!key) return Date.now();
  try{
    const storedTimestamp=localStorage.getItem(key);
    if(storedTimestamp){
      const timestamp=Number(storedTimestamp);
      return Number.isFinite(timestamp)?timestamp:Date.now();
    }
    const timestamp=Date.now();
    localStorage.setItem(key,String(timestamp));
    return timestamp;
  }catch{
    return Date.now();
  }
}
function markNewUsersAsSeen(){
  const key=newUsersLastSeenKey();
  if(!key) return;
  try{
    localStorage.setItem(key,String(Date.now()-1000));
  }catch{
    // Keep the Users page usable when browser storage is unavailable.
  }
}
function updateNewUserCount(users=registeredUsers){
  const badge=document.getElementById('adminNewUserCount');
  if(!badge) return;
  if(currentUser?.role!=='staff'){
    badge.hidden=true;
    return;
  }
  const lastSeen=getNewUsersLastSeen();
  const newUserCount=users.filter(user=>{
    const joinedAt=Date.parse(user.joinedAt||'');
    return Number.isFinite(joinedAt)&&joinedAt>lastSeen;
  }).length;
  badge.textContent=newUserCount>99?'99+':String(newUserCount);
  badge.hidden=newUserCount===0;
  badge.setAttribute('aria-label',`${newUserCount} newly registered accounts`);
  badge.closest('button')?.setAttribute('title',newUserCount?`Users · ${newUserCount} new accounts`:'Users');
}
async function refreshNewUserCount(){
  if(currentUser?.role!=='staff') return;
  const userId=String(currentUser.id);
  getNewUsersLastSeen();
  try{
    const result=await api('/staff/users');
    if(!currentUser||String(currentUser.id)!==userId||currentUser.role!=='staff') return;
    updateNewUserCount(result.data||[]);
  }catch{
    // Leave the current badge unchanged if the user list cannot be refreshed.
  }
}
let activeOrdersReport=null;
const ordersReportDialog=document.getElementById('ordersReportDialog');
const ordersReportPreviewDialog=document.getElementById('ordersReportPreviewDialog');
function openOrdersReportDialog(){
  document.getElementById('ordersReportFeedback').textContent='';
  if(!ordersReportDialog.open) ordersReportDialog.showModal();
}
function ordersReportDateRange(range,from,to){
  if(range==='custom') return {from,to,label:`${formatDeliveryDate(from)} – ${formatDeliveryDate(to)}`};
  if(range==='today') return {from:todayStr,to:todayStr,label:`Today · ${formatDeliveryDate(todayStr)}`};
  if(range==='week'){
    const weekday=new Date(`${todayStr}T12:00:00Z`).getUTCDay();
    const monday=addDays(todayStr,-((weekday+6)%7));
    const sunday=addDays(monday,6);
    return {from:monday,to:sunday,label:`This week · ${formatDeliveryDate(monday)} – ${formatDeliveryDate(sunday)}`};
  }
  const first=todayStr.slice(0,8)+'01';
  const nextMonth=new Date(`${first}T12:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1);
  const last=addDays(nextMonth.toISOString().slice(0,10),-1);
  return {from:first,to:last,label:`This month · ${formatDeliveryDate(first)} – ${formatDeliveryDate(last)}`};
}
function orderReportAmounts(delivery){
  const deliveryFee=Number(delivery.deliveryFee)||0;
  const orderTotal=delivery.orderTotal===null||delivery.orderTotal===undefined?null:Number(delivery.orderTotal)||0;
  const waterSales=delivery.waterSubtotal===null||delivery.waterSubtotal===undefined
    ?orderTotal===null?Number(delivery.ratePerGallon||0)*Number(delivery.gallons||0):Math.max(orderTotal-deliveryFee,0)
    :Number(delivery.waterSubtotal)||0;
  return {waterSales,deliveryFee,total:orderTotal===null?waterSales+deliveryFee:orderTotal};
}
function reportStatusLabel(status){
  return status==='Confirmed'?'Approved':status==='Cancelled'?'Rejected':status||'—';
}
function formatReportCurrency(value){
  return new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);
}
function orderReportRows(type,orders){
  if(type==='products'){
    const products=new Map();
    orders.forEach(order=>{
      const size=Number(order.containerSizeGallons)||1;
      const alkalineQuantity=Number(order.alkalineQuantity)||0;
      const purifiedQuantity=Number(order.purifiedQuantity)||0;
      const quantities={Alkaline:alkalineQuantity,Purified:purifiedQuantity};
      const hasQuantities=alkalineQuantity+purifiedQuantity>0;
      const selectedTypes=waterTypeNames(order);
      const gallonsByType=hasQuantities
        ?{Alkaline:alkalineQuantity*size,Purified:purifiedQuantity*size}
        :Object.fromEntries(selectedTypes.map(name=>[name,Number(order.gallons||0)/Math.max(selectedTypes.length,1)]));
      const totalGallons=Object.values(gallonsByType).reduce((sum,value)=>sum+value,0)||Number(order.gallons||0);
      Object.entries(gallonsByType).forEach(([name,gallons])=>{
        if(!gallons) return;
        const product=products.get(name)||{orders:new Set(),gallons:0,sales:0};
        product.orders.add(String(order.id));
        product.gallons+=gallons;
        product.sales+=orderReportAmounts(order).waterSales*(gallons/totalGallons);
        products.set(name,product);
      });
    });
    return {headers:['Water type','Orders','Gallons sold','Water sales (₱)'],rows:[...products.entries()].map(([name,product])=>[name,product.orders.size,product.gallons.toFixed(2),formatReportCurrency(product.sales)])};
  }
  if(type==='sales') return {headers:['Order #','Customer','Delivered date','Water sales (₱)','Delivery fees (₱)','Total revenue (₱)'],rows:orders.map(order=>{
    const amounts=orderReportAmounts(order);
    return [`ORD-${order.id}`,order.contactName||order.customer?.name||'Walk-in customer',formatDeliveryDate(order.date),formatReportCurrency(amounts.waterSales),formatReportCurrency(amounts.deliveryFee),formatReportCurrency(amounts.total)];
  })};
  if(type==='delivery') return {headers:['Order #','Customer','Method','Address / pickup','Scheduled date','Time','Status','Delivery fee (₱)'],rows:orders.map(order=>[
    `ORD-${order.id}`,order.contactName||order.customer?.name||'Walk-in customer',order.fulfillmentMethod==='pickup'?'Pickup':'Delivery',order.fulfillmentMethod==='pickup'?'TubiPure Water Refilling Station':order.address||order.customer?.address||'—',formatDeliveryDate(order.date),formatDeliveryOrderTime(order.time),reportStatusLabel(order.status),formatReportCurrency(orderReportAmounts(order).deliveryFee)
  ])};
  if(type==='cancellations') return {headers:['Order #','Customer','Contact','Cancelled date','Reason','Order total (₱)'],rows:orders.map(order=>[
    `ORD-${order.id}`,order.contactName||order.customer?.name||'Walk-in customer',order.contactPhone||'',formatDeliveryDate(order.date),order.statusNote||'No reason recorded',formatReportCurrency(orderReportAmounts(order).total)
  ])};
  return {headers:['Order #','Customer','Contact','Status','Water type','Gallons','Scheduled date','Time','Method','Water sales (₱)','Delivery fee (₱)','Total (₱)'],rows:orders.map(order=>{
    const amounts=orderReportAmounts(order);
    return [`ORD-${order.id}`,order.contactName||order.customer?.name||'Walk-in customer',order.contactPhone||'',reportStatusLabel(order.status),waterTypeNames(order).join(' + '),Number(order.gallons||0),formatDeliveryDate(order.date),formatDeliveryOrderTime(order.time),order.fulfillmentMethod==='pickup'?'Pickup':'Delivery',formatReportCurrency(amounts.waterSales),formatReportCurrency(amounts.deliveryFee),formatReportCurrency(amounts.total)];
  })};
}
function buildOrdersReport(){
  const type=document.getElementById('ordersReportType').value;
  const range=ordersReportDateRange(document.getElementById('ordersReportRange').value,document.getElementById('ordersReportDateFrom').value,document.getElementById('ordersReportDateTo').value);
  const status=document.getElementById('ordersReportStatus').value;
  const waterType=document.getElementById('ordersReportWaterType').value;
  const fulfillment=document.getElementById('ordersReportFulfillment').value;
  let filtered=deliveries.filter(order=>order.date>=range.from&&order.date<=range.to);
  if(status) filtered=filtered.filter(order=>order.status===status);
  if(waterType) filtered=filtered.filter(order=>waterTypeNames(order).includes(waterType));
  if(fulfillment) filtered=filtered.filter(order=>order.fulfillmentMethod===fulfillment);
  if(type==='cancellations') filtered=filtered.filter(order=>order.status==='Cancelled');
  if(type==='sales'||type==='products') filtered=filtered.filter(order=>order.status==='Delivered');
  const {headers,rows}=orderReportRows(type,filtered);
  const delivered=filtered.filter(order=>order.status==='Delivered');
  const totals=delivered.reduce((sum,order)=>{
    const amounts=orderReportAmounts(order);
    sum.water+=amounts.waterSales;sum.fees+=amounts.deliveryFee;sum.total+=amounts.total;
    return sum;
  },{water:0,fees:0,total:0});
  const reportTypes={orders:'Orders',sales:'Sales',products:'Product performance',delivery:'Delivery',cancellations:'Cancellations'};
  return {type,title:`${reportTypes[type]} report`,rangeLabel:range.label,headers,rows,orders:filtered,summary:[
    {label:type==='products'?'Products':type==='cancellations'?'Cancellations':'Orders',value:type==='products'?rows.length:filtered.length},
    {label:'Delivered',value:delivered.length},
    {label:'Water sales',value:formatReportCurrency(totals.water)},
    {label:'Delivery fees',value:formatReportCurrency(totals.fees)}
  ]};
}
function ordersReportCsv(report){
  const csvCell=(value,header)=>{
    let text=String(value??'');
    if((header==='Contact'&&/^[+\d\s().-]+$/.test(text))||/date/i.test(header)) text=`\t${text}`;
    const safeText=/^[\s]*[=+\-@]/.test(text)?`'${text}`:text;
    return `"${safeText.replace(/"/g,'""')}"`;
  };
  return [report.headers,...report.rows].map(row=>row.map((value,index)=>csvCell(value,report.headers[index]||'')).join(',')).join('\r\n');
}
function downloadOrdersReportCsv(report){
  const file=new Blob([`\uFEFF${ordersReportCsv(report)}`],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(file);
  const downloadLink=document.createElement('a');
  downloadLink.href=url;
  downloadLink.download=`tubipure-${report.type}-report-${todayStr}.csv`;
  document.body.append(downloadLink);downloadLink.click();downloadLink.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function ordersReportPrintHtml(report){
  const headers=report.headers.map(header=>`<th${header.includes('(₱)')||header.includes('Total (₱)')?' class="amount"':''}>${escapeHtml(header)}</th>`).join('');
  const rows=report.rows.map(row=>`<tr>${row.map((value,index)=>`<td${report.headers[index]?.includes('(₱)')||report.headers[index]?.includes('Total (₱)')?' class="amount"':''}>${escapeHtml(value)}</td>`).join('')}</tr>`).join('');
  const summary=report.summary.map(item=>`<div><small>${escapeHtml(item.label)}</small><strong>${escapeHtml(item.value)}</strong></div>`).join('');
  const generatedAt=new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:siteTimezone}).format(new Date());
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.title)}</title><style>
    :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#eef3f7;color:#172d40;font:13px/1.45 Arial,Helvetica,sans-serif}.page{max-width:1400px;margin:28px auto;padding:38px 42px;background:#fff;box-shadow:0 8px 35px rgba(14,39,59,.12)}.report-header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding-bottom:21px;border-bottom:2px solid #168dcc}.brand{color:#087fb8;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.report-code{padding:6px 10px;border:1px solid #c9d9e4;border-radius:5px;color:#536b7b;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}.title-block{padding:22px 0 15px}.title-block h1{margin:0 0 5px;color:#102b41;font-size:27px;line-height:1.2;letter-spacing:-.025em}.title-block p{margin:0;color:#647989;font-size:12px}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 21px}.summary div{min-height:67px;padding:12px 14px;border:1px solid #d3e0e8;border-top:3px solid #138ac5;border-radius:6px;background:#f7fafc}.summary small,.summary strong{display:block}.summary small{margin-bottom:6px;color:#657b8b;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}.summary strong{color:#16354b;font-size:17px;font-weight:750}.table-wrap{overflow:visible;border:1px solid #cddbe4;border-radius:6px}table{width:100%;border-collapse:collapse;table-layout:auto;font-size:10px}thead{display:table-header-group}th,td{padding:8px 9px;border-bottom:1px solid #dce5eb;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eaf2f7;color:#34566d;font-size:9px;font-weight:800;letter-spacing:.035em;text-transform:uppercase}tbody tr:nth-child(even){background:#f7fafc}tbody tr:last-child td{border-bottom:0}td{color:#233f53}.amount{text-align:right;white-space:nowrap}.empty{padding:24px;text-align:center;color:#657b8b}.report-footer{display:flex;justify-content:space-between;gap:12px;margin-top:16px;padding-top:9px;border-top:1px solid #dce5eb;color:#718594;font-size:9px}.print-button{display:block;margin:18px 0 0 auto;padding:10px 18px;border:0;border-radius:5px;background:#087fb8;color:#fff;font-weight:700;cursor:pointer}@page{size:landscape;margin:13mm}@page{@bottom-left{content:"TubiPure · Confidential";font:8px Arial,sans-serif;color:#657b8b}@bottom-right{content:"Page " counter(page);font:8px Arial,sans-serif;color:#657b8b}}@media print{body{background:#fff;font-size:10px}.page{max-width:none;margin:0;padding:0;box-shadow:none}.report-header{padding-bottom:12px}.title-block{padding:15px 0 11px}.title-block h1{font-size:21px}.summary{gap:8px;margin-bottom:14px}.summary div{min-height:54px;padding:8px 10px}.summary strong{font-size:14px}table{font-size:8px}th,td{padding:5px 6px}.report-footer{margin-top:10px}.print-button{display:none}tr{break-inside:avoid}thead{display:table-header-group}.table-wrap{overflow:visible}}
    @media(max-width:760px){.page{margin:0;padding:22px}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.report-header{flex-direction:column;gap:10px}}
    </style></head><body><main class="page"><header class="report-header"><div class="brand">TubiPure · Operations</div><span class="report-code">${escapeHtml(report.type)} report</span></header><section class="title-block"><h1>${escapeHtml(report.title)}</h1><p>${escapeHtml(report.rangeLabel)} &nbsp;·&nbsp; ${report.orders.length} matching order${report.orders.length===1?'':'s'} &nbsp;·&nbsp; Generated ${escapeHtml(generatedAt)}</p></section><section class="summary" aria-label="Report summary">${summary}</section><div class="table-wrap"><table><thead><tr>${headers}</tr></thead><tbody>${rows||`<tr><td class="empty" colspan="${report.headers.length}">No matching records for this report.</td></tr>`}</tbody></table></div><footer class="report-footer"><span>Prepared by TubiPure Admin</span><span>${escapeHtml(report.title)} · ${escapeHtml(report.rangeLabel)}</span></footer><button class="print-button" onclick="window.print()">Print report</button></main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));<\/script></body></html>`;
}
function printOrdersReport(report){
  const printWindow=window.open('','_blank');
  if(!printWindow){
    showOrdersReportPreview(report);
    toast('Print window blocked','Allow pop-ups to print this report.');
    return;
  }
  printWindow.document.open();printWindow.document.write(ordersReportPrintHtml(report));printWindow.document.close();
}
function pdfSafeText(value){
  return String(value??'').replace(/₱/g,'PHP ').replace(/[–—]/g,'-').replace(/·/g,'|').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,'?');
}
function pdfEscapeText(value){
  return pdfSafeText(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
}
function createOrdersReportPdf(report){
  const pageWidth=842,pageHeight=595,margin=34,tableWidth=pageWidth-margin*2;
  const pages=[];
  const color=(hex)=>{
    const digits=hex.replace('#','');
    return [0,2,4].map(index=>(parseInt(digits.slice(index,index+2),16)/255).toFixed(3)).join(' ');
  };
  const text=(x,y,value,size=8,bold=false,fill='#203b50')=>`BT /${bold?'F2':'F1'} ${size} Tf ${color(fill)} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEscapeText(value)}) Tj ET\n`;
  const rectangle=(x,y,width,height,fill,stroke=null)=>`${stroke?`${color(stroke)} RG 0.6 w `:''}${color(fill)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${stroke?'B':'f'}\n`;
  const line=(x1,y1,x2,y2,stroke='#dce5eb')=>`${color(stroke)} RG 0.55 w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;
  const wrap=(value,maxChars)=>{
    const words=pdfSafeText(value).split(/\s+/).filter(Boolean);
    if(!words.length) return [''];
    const result=[];let current='';
    words.forEach(word=>{
      if(word.length>maxChars){
        if(current){result.push(current);current='';}
        for(let index=0;index<word.length;index+=maxChars) result.push(word.slice(index,index+maxChars));
      }else if(!current) current=word;
      else if(`${current} ${word}`.length<=maxChars) current+=` ${word}`;
      else{result.push(current);current=word;}
    });
    if(current) result.push(current);
    return result;
  };
  const baseWidths=report.headers.map((header,index)=>{
    const longest=report.rows.reduce((max,row)=>Math.max(max,pdfSafeText(row[index]).length),pdfSafeText(header).length);
    return Math.min(Math.max(longest*4.1+13,38),index===1?105:115);
  });
  const baseTotal=baseWidths.reduce((sum,width)=>sum+width,0);
  const widths=baseWidths.map(width=>width*tableWidth/baseTotal);
  const columnCharLimits=widths.map(width=>Math.max(5,Math.floor((width-9)/4.3)));
  let currentPage='';let y=pageHeight-margin;
  const startPage=(firstPage)=>{
    currentPage='';
    y=pageHeight-margin;
    currentPage+=text(margin,y,'TUBIPURE  |  OPERATIONS REPORT',8,true,'#087fb8');
    currentPage+=text(pageWidth-margin-115,y,report.type.toUpperCase()+' REPORT',7,true,'#50697a');
    currentPage+=line(margin,y-9,pageWidth-margin,y-9,'#168dcc');
    y-=28;
    if(firstPage){
      currentPage+=text(margin,y,report.title,18,true,'#102b41');
      y-=17;
      const generatedAt=new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:siteTimezone}).format(new Date());
      currentPage+=text(margin,y,`${report.rangeLabel}  |  ${report.orders.length} matching orders  |  Generated ${generatedAt}`,8,false,'#647989');
      y-=18;
      const gap=9,cardWidth=(tableWidth-gap*3)/4,cardHeight=40;
      report.summary.forEach((item,index)=>{
        const x=margin+index*(cardWidth+gap);
        currentPage+=rectangle(x,y-cardHeight,cardWidth,cardHeight,'#f3f7fa','#d3e0e8');
        currentPage+=rectangle(x,y-cardHeight,cardWidth,3,'#138ac5');
        currentPage+=text(x+10,y-15,item.label.toUpperCase(),6,true,'#657b8b');
        currentPage+=text(x+10,y-31,item.value,10,true,'#16354b');
      });
      y-=cardHeight+14;
    }else y-=12;
    currentPage+=rectangle(margin,y-20,tableWidth,20,'#eaf2f7','#cddbe4');
    let x=margin;
    report.headers.forEach((header,index)=>{
      currentPage+=text(x+4,y-13,wrap(header,columnCharLimits[index])[0].toUpperCase(),5.8,true,'#34566d');
      x+=widths[index];
      if(index<widths.length-1) currentPage+=line(x,y-20,x,y,'#cddbe4');
    });
    y-=20;
  };
  startPage(true);
  const reportRows=report.rows.length?report.rows:[['No matching records for this report.']];
  reportRows.forEach((row,rowIndex)=>{
    const wrapped=row.map((value,index)=>wrap(value,columnCharLimits[index]||36));
    const lineCount=Math.max(1,...wrapped.map(lines=>lines.length));
    const rowHeight=Math.max(18,lineCount*7+7);
    if(y-rowHeight<margin+24){
      pages.push(currentPage+line(margin,margin+12,pageWidth-margin,margin+12));
      startPage(false);
    }
    currentPage+=rectangle(margin,y-rowHeight,tableWidth,rowHeight,rowIndex%2===1?'#f7fafc':'#ffffff','#dce5eb');
    let x=margin;
    wrapped.forEach((lines,index)=>{
      lines.forEach((value,lineIndex)=>{
        currentPage+=text(x+4,y-10-lineIndex*7,value,6.2,false,'#233f53');
      });
      x+=widths[index]||tableWidth;
      if(index<widths.length-1) currentPage+=line(x,y-rowHeight,x,y,'#e1e8ed');
    });
    y-=rowHeight;
  });
  pages.push(currentPage+line(margin,margin+12,pageWidth-margin,margin+12));
  const numberedPages=pages.map((page,index)=>page+text(margin,margin-2,`Prepared by TubiPure Admin  |  Page ${index+1} of ${pages.length}`,6,false,'#718594'));
  const objects=[];
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[2]=`<< /Type /Pages /Kids [${numberedPages.map((_,index)=>`${5+index*2} 0 R`).join(' ')}] /Count ${numberedPages.length} >>`;
  objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  numberedPages.forEach((content,index)=>{
    const pageObject=5+index*2,contentObject=pageObject+1;
    objects[pageObject]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject]=`<< /Length ${content.length} >>\nstream\n${content}endstream`;
  });
  const infoObject=objects.length;
  objects[infoObject]=`<< /Title (${pdfEscapeText(report.title)}) /Author (TubiPure Admin) /Creator (TubiPure Reports) >>`;
  let pdf='%PDF-1.4\n';
  const offsets=[0];
  for(let objectId=1;objectId<objects.length;objectId++){
    offsets[objectId]=pdf.length;
    pdf+=`${objectId} 0 obj\n${objects[objectId]}\nendobj\n`;
  }
  const xrefOffset=pdf.length;
  pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let objectId=1;objectId<objects.length;objectId++) pdf+=`${String(offsets[objectId]).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R /Info ${infoObject} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}
function downloadOrdersReportPdf(report){
  const pdfFile=new Blob([createOrdersReportPdf(report)],{type:'application/pdf'});
  const url=URL.createObjectURL(pdfFile);
  const downloadLink=document.createElement('a');
  downloadLink.href=url;
  downloadLink.download=`tubipure-${report.type}-report-${todayStr}.pdf`;
  document.body.append(downloadLink);downloadLink.click();downloadLink.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function showOrdersReportPreview(report){
  activeOrdersReport=report;
  document.getElementById('ordersReportPreviewTitle').textContent=report.title;
  document.getElementById('ordersReportPreviewDescription').textContent=`${report.rangeLabel} · ${report.orders.length} matching order${report.orders.length===1?'':'s'}`;
  document.getElementById('ordersReportPreviewSummary').innerHTML=report.summary.map(item=>`<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join('');
  const table=document.getElementById('ordersReportPreviewTable');
  table.innerHTML=`<table><thead><tr>${report.headers.map(header=>`<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${report.rows.length?report.rows.map(row=>`<tr>${row.map(value=>`<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join(''):`<tr><td class="orders-report-empty" colspan="${report.headers.length}">No matching records for these filters.</td></tr>`}</tbody></table>`;
  if(ordersReportDialog.open) ordersReportDialog.close();
  ordersReportPreviewDialog.showModal();
}
document.getElementById('ordersReportRange').addEventListener('change',event=>{
  const customRange=document.getElementById('ordersReportCustomRange');
  customRange.hidden=event.target.value!=='custom';
  document.getElementById('ordersReportDateFrom').required=event.target.value==='custom';
  document.getElementById('ordersReportDateTo').required=event.target.value==='custom';
});
document.querySelectorAll('input[name="ordersReportFormat"]').forEach(input=>input.addEventListener('change',()=>{
  document.querySelectorAll('.orders-report-format-card').forEach(card=>card.classList.toggle('is-selected',card.querySelector('input')?.checked===true));
}));
document.getElementById('ordersReportForm').addEventListener('submit',event=>{
  event.preventDefault();
  const feedback=document.getElementById('ordersReportFeedback');
  feedback.textContent='';
  if(currentUser?.role!=='staff') return;
  const range=document.getElementById('ordersReportRange').value;
  const from=document.getElementById('ordersReportDateFrom').value;
  const to=document.getElementById('ordersReportDateTo').value;
  if(range==='custom'&&(!from||!to||from>to)){
    feedback.textContent='Choose a valid custom date range.';
    return;
  }
  const report=buildOrdersReport();
  const format=document.querySelector('input[name="ordersReportFormat"]:checked').value;
  if(format==='csv'){
    downloadOrdersReportCsv(report);ordersReportDialog.close();
    toast('Report exported',`${report.rows.length} row${report.rows.length===1?'':'s'} saved as CSV.`);
  }else if(format==='pdf'){
    downloadOrdersReportPdf(report);
    if(ordersReportDialog.open) ordersReportDialog.close();
  }else showOrdersReportPreview(report);
});
function closeOrdersReportDialog(){if(ordersReportDialog.open) ordersReportDialog.close();}
document.getElementById('closeOrdersReportDialog').addEventListener('click',closeOrdersReportDialog);
document.getElementById('cancelOrdersReport').addEventListener('click',closeOrdersReportDialog);
document.getElementById('closeOrdersReportPreview').addEventListener('click',()=>ordersReportPreviewDialog.close());
document.getElementById('closeOrdersReportPreviewDone').addEventListener('click',()=>ordersReportPreviewDialog.close());
document.getElementById('ordersReportPreviewCsv').addEventListener('click',()=>{if(activeOrdersReport) downloadOrdersReportCsv(activeOrdersReport);});
document.getElementById('ordersReportPreviewPrint').addEventListener('click',()=>{if(activeOrdersReport) printOrdersReport(activeOrdersReport);});
document.getElementById('ordersReportPreviewPdf').addEventListener('click',()=>{if(activeOrdersReport) downloadOrdersReportPdf(activeOrdersReport);});
document.getElementById('adminCreateOrdersReport').addEventListener('click',openOrdersReportDialog);

function updateAuthNavigation(){
  document.querySelector('.nav-auth').style.display = currentUser ? 'none' : '';
  document.querySelector('.mobile-auth-links').style.display = currentUser ? 'none' : '';
  document.getElementById('mobileAccountLinks').style.display = currentUser ? '' : 'none';
  document.querySelectorAll('.mobile-user-nav-link').forEach(element=>{
    element.style.display = currentUser ? '' : 'none';
  });
  document.getElementById('navProfileMenuWrap').style.display = currentUser ? '' : 'none';
  setUserAvatar(document.getElementById('navProfileAvatar'),currentUser,false);
  document.getElementById('navProfileMenuName').textContent = currentUser?.name || '';
  document.getElementById('navProfileMenuRole').textContent = currentUser ? (currentUser.role === 'staff' ? 'Administrator account' : 'Customer account') : '';
  if(!currentUser) closeNavProfileMenu();
  bellBtn.style.display=currentUser?'':'none';
  if(!currentUser){
    notifPanel.classList.remove('open');
    bellBtn.setAttribute('aria-expanded','false');
  }
  document.querySelectorAll('[data-customer-order-action]').forEach(element=>{
    element.style.display = currentUser?.role === 'staff' ? 'none' : '';
  });
  document.querySelectorAll('.staff-only').forEach(element=>element.style.display = currentUser?.role==='staff' ? '' : 'none');
  document.querySelectorAll('[data-staff-route]').forEach(element=>element.style.display = currentUser?.role==='staff' ? '' : 'none');
  const pricingPanel=document.getElementById('pricingSettingsPanel');
  if(pricingPanel) pricingPanel.style.display=currentUser?.role==='staff'?'':'none';
  const dateTimePanel=document.getElementById('dateTimeSettingsPanel');
  if(dateTimePanel) dateTimePanel.style.display=currentUser?.role==='staff'?'':'none';
  renderNotifications();
}

/* ---------------- ROUTER ---------------- */
const pages = document.querySelectorAll('.page');
const navBtns = document.querySelectorAll('.navlinks button, #navDashboardBtn, #navProfileBtn, .admin-sidebar-link, .nav-profile-menu [data-route], .admin-sidebar-profile-menu [data-route]');
let pendingJump = null;
let lastScrollY = window.scrollY;
let scrollTicking = false;
const navbar = document.querySelector('.nav');
window.addEventListener('scroll', ()=>{
  if(scrollTicking) return;
  scrollTicking = true;
  window.requestAnimationFrame(()=>{
    const currentScrollY = window.scrollY;
    const mobileMenuOpen = document.getElementById('navlinks').classList.contains('mobile-open');
    if(currentScrollY < 80 || currentScrollY < lastScrollY || mobileMenuOpen){
      navbar.classList.remove('nav-hidden');
    }else if(currentScrollY > lastScrollY){
      navbar.classList.add('nav-hidden');
    }
    lastScrollY = currentScrollY;
    scrollTicking = false;
  });
}, {passive:true});
let authMode = 'login';
function setAuthMode(mode){
  authMode = ['signup','forgot','reset'].includes(mode) ? mode : 'login';
  if(mode!=='reset' && location.pathname.startsWith('/reset-password/')){
    history.replaceState(null,'','/#myaccount');
  }
  const isSignup = authMode === 'signup';
  const isForgot = authMode === 'forgot';
  const isReset = authMode === 'reset';
  const titles = {login:'Log in to your account',signup:'Create your account',forgot:'Reset your password',reset:'Choose a new password'};
  const descriptions = {login:'Enter your email and password to continue.',signup:'Enter your details to register with TubiPure.',forgot:'Enter your email and we’ll send a reset link if an account matches.',reset:'Choose a new password for your TubiPure account.'};
  const labels = {login:'Log in',signup:'Sign up',forgot:'Send reset link',reset:'Save new password'};
  document.getElementById('authFormTitle').textContent = titles[authMode];
  document.getElementById('authFormDescription').textContent = descriptions[authMode];
  document.getElementById('authSubmitBtn').textContent = labels[authMode];
  document.getElementById('authPassword').autocomplete = isSignup ? 'new-password' : 'current-password';
  document.querySelectorAll('.auth-signup-field').forEach(field=>field.style.display = isSignup ? 'block' : 'none');
  document.querySelectorAll('.auth-email-field').forEach(field=>field.style.display = isReset ? 'none' : 'block');
  document.querySelectorAll('.auth-password-field').forEach(field=>field.style.display = isSignup || authMode==='login' ? 'block' : 'none');
  document.querySelectorAll('.auth-reset-field').forEach(field=>field.style.display = isReset ? 'block' : 'none');
  document.getElementById('authForgotLink').style.display = authMode==='login' ? 'block' : 'none';
  document.getElementById('authSignupPageLink').style.display = authMode==='login' ? 'block' : 'none';
  document.getElementById('authReturnLogin').style.display = authMode==='login' ? 'none' : 'block';
  document.getElementById('authFeedback').textContent = '';
  document.getElementById('navlinks').classList.remove('mobile-open');
}
document.querySelectorAll('[data-auth-mode]').forEach(link=>{
  link.addEventListener('click', ()=>{
    setAuthMode(link.dataset.authMode);
    if(location.hash === '#myaccount'){
      go('myaccount');
    }
  });
});
document.getElementById('authForgotLink').addEventListener('click',()=>setAuthMode('forgot'));
document.getElementById('authReturnLogin').addEventListener('click',()=>setAuthMode('login'));
function updateAdminSidebarControls(isExpanded){
  const isMobileAdminNavigation=window.matchMedia('(max-width: 760px)').matches;
  const label=isExpanded
    ? (isMobileAdminNavigation?'Close admin navigation':'Collapse admin navigation')
    : 'Open admin navigation';
  [document.getElementById('adminSidebarToggle'),document.getElementById('adminSidebarReopen')].forEach(button=>{
    button.setAttribute('aria-expanded',String(isExpanded));
    button.setAttribute('aria-label',label);
    button.title=label;
  });
}
function closeAdminSidebarProfileMenu(){
  const menu=document.getElementById('adminSidebarProfileMenu');
  const button=document.getElementById('adminSidebarProfileToggle');
  menu.hidden=true;
  button.setAttribute('aria-expanded','false');
  const settingsMenu=document.getElementById('adminSidebarSettingsSubmenu');
  settingsMenu.hidden=true;
  document.getElementById('adminSidebarSettingsBtn').setAttribute('aria-expanded','false');
}
function go(route){
  if(route==='myaccount'&&!currentUser){
    window.location.assign('/login?intent=my-orders');
    return;
  }
  if(route==='order' && currentUser?.role==='staff'){
    route='dashboard';
    toast('Customer account required','Orders can only be placed from a customer account.');
  }
  if(route==='order' && !currentUser){
    window.location.assign('/login?intent=order');
    return;
  }
  if(['profile','change-password'].includes(route) && !currentUser){
    window.location.assign('/login');
    return;
  }
  if(route==='address' && !currentUser){
    window.location.assign('/login');
    return;
  }
  if(['dashboard','customers','users','scheduler','order-history','kmr','datetime'].includes(route) && currentUser?.role!=='staff'){
    const isSignedInCustomer = !!currentUser;
    route = 'myaccount';
    if(isSignedInCustomer){
      toast('Staff access required','Sign in with a staff account to open that page.');
    }else{
      document.getElementById('authFeedback').textContent = 'Please sign in with a staff account to open that page.';
    }
  }
  closeAdminSidebarProfileMenu();
  const isAdminWorkspace=currentUser?.role==='staff'&&['dashboard','scheduler','order-history','customers','users','kmr','datetime','profile','change-password'].includes(route);
  document.body.classList.toggle('admin-workspace',isAdminWorkspace);
  if(!isAdminWorkspace||window.matchMedia('(max-width: 760px)').matches) document.body.classList.remove('admin-sidebar-collapsed');
  document.getElementById('adminSidebar').style.display=isAdminWorkspace?'':'none';
  document.body.classList.remove('admin-sidebar-open');
  const isMobileAdminNavigation=window.matchMedia('(max-width: 760px)').matches;
  updateAdminSidebarControls(isAdminWorkspace&&!isMobileAdminNavigation&&!document.body.classList.contains('admin-sidebar-collapsed'));
  pages.forEach(p=>p.classList.toggle('active', p.id === 'page-'+route));
  navBtns.forEach(b=>b.classList.toggle('active', b.dataset.route === route));
  document.getElementById('adminSidebarProfileToggle').classList.toggle('active',['profile','change-password'].includes(route)&&isAdminWorkspace);
  document.getElementById('navMyOrderBtn').classList.toggle('active', route==='myaccount' && currentUser?.role!=='staff');
  document.getElementById('navCtaBtn').classList.toggle('active', route==='order');
  document.getElementById('navlinks').classList.remove('mobile-open');
  closeNavProfileMenu();
  closeMobileSettingsMenu();
  window.scrollTo({top:0, behavior:'instant' in window ? 'instant' : 'auto'});
  location.hash = route;
  if(route==='dashboard') renderDashboard();
  if(route==='customers') renderCustomers();
  if(route==='users') renderUsers();
  if(route==='scheduler') renderDeliveries();
  if(route==='order-history') renderOrderHistory();
  if(route==='kmr') renderKmr();
  if(route==='datetime') renderDateTimeSettingsForm();
  if(route==='home') renderHome();
  if(route==='myaccount') renderMyAccount();
  if(route==='order') renderCustomerOrder();
  if(route==='profile') renderProfile();
  if(route==='address') renderAddress();
}
document.querySelectorAll('[data-route]').forEach(el=>{
  el.addEventListener('click', ()=>{
    if(el.closest('#navProfileMenu')) closeNavProfileMenu();
    if(el.closest('#adminSidebarProfileMenu')) closeAdminSidebarProfileMenu();
    pendingJump = null;
    go(el.dataset.route);
  });
});
function closeNavProfileMenu(){
  const menu = document.getElementById('navProfileMenu');
  const button = document.getElementById('navProfileBtn');
  menu.hidden = true;
  button.setAttribute('aria-expanded','false');
  document.getElementById('navSettingsSubmenu').hidden=true;
  document.getElementById('navProfileSettingsBtn').setAttribute('aria-expanded','false');
}
function closeMobileSettingsMenu(){
  document.getElementById('mobileSettingsSubmenu').hidden=true;
  document.getElementById('navMobileSettingsBtn').setAttribute('aria-expanded','false');
}
document.getElementById('navProfileBtn').addEventListener('click',()=>{
  const button = document.getElementById('navProfileBtn');
  const menu = document.getElementById('navProfileMenu');
  const isOpen = !menu.hidden;
  menu.hidden = isOpen;
  button.setAttribute('aria-expanded',String(!isOpen));
});
document.getElementById('navProfileSettingsBtn').addEventListener('click',()=>{
  const button=document.getElementById('navProfileSettingsBtn');
  const submenu=document.getElementById('navSettingsSubmenu');
  submenu.hidden=!submenu.hidden;
  button.setAttribute('aria-expanded',String(!submenu.hidden));
});
document.getElementById('navMobileSettingsBtn').addEventListener('click',()=>{
  const button=document.getElementById('navMobileSettingsBtn');
  const submenu=document.getElementById('mobileSettingsSubmenu');
  submenu.hidden=!submenu.hidden;
  button.setAttribute('aria-expanded',String(!submenu.hidden));
});
document.addEventListener('click',event=>{
  if(!document.getElementById('navProfileMenuWrap').contains(event.target)) closeNavProfileMenu();
  if(!document.getElementById('adminSidebar').contains(event.target)) closeAdminSidebarProfileMenu();
});
document.getElementById('navProfileLogoutBtn').addEventListener('click',logoutCurrentUser);
document.getElementById('navMobileLogoutBtn').addEventListener('click',logoutCurrentUser);
document.getElementById('adminSidebarProfileToggle').addEventListener('click',()=>{
  const menu=document.getElementById('adminSidebarProfileMenu');
  const isOpen=menu.hidden;
  menu.hidden=!isOpen;
  document.getElementById('adminSidebarProfileToggle').setAttribute('aria-expanded',String(isOpen));
});
document.getElementById('adminSidebarSettingsBtn').addEventListener('click',()=>{
  const button=document.getElementById('adminSidebarSettingsBtn');
  const submenu=document.getElementById('adminSidebarSettingsSubmenu');
  submenu.hidden=!submenu.hidden;
  button.setAttribute('aria-expanded',String(!submenu.hidden));
});
document.getElementById('adminSidebarLogoutBtn').addEventListener('click',logoutCurrentUser);
function openOrderArea(jumpTarget){
  if(!currentUser){
    const intent = jumpTarget==='myOrdersCard' ? 'my-orders' : 'order';
    window.location.assign(`/login?intent=${intent}`);
    return;
  }
  if(jumpTarget==='order'){
    resetCustomerOrderForm();
    go('order');
    return;
  }
  pendingJump = jumpTarget;
  go('myaccount');
}
function resetCustomerOrderForm(){
  const form=document.getElementById('customerOrderForm');
  form.reset();
  form.querySelectorAll('input[name="water_selection"],input[name="fulfillment_method"]').forEach(input=>{input.checked=false;});
  ['orderQuantity','alkalineQuantity','purifiedQuantity'].forEach(id=>{document.getElementById(id).value='';});
  document.getElementById('orderPaymentMethod').value='';
  document.getElementById('orderAddress').value='';
  document.getElementById('orderDate').value='';
  document.getElementById('orderTime').value='';
  document.getElementById('orderTimeDisplay').textContent='Choose a time';
  document.getElementById('orderContactName').value='';
  document.getElementById('orderPhone').value='';
  document.getElementById('orderInstructions').value='';
  form.querySelectorAll('.is-invalid,.has-invalid').forEach(element=>{
    element.classList.remove('is-invalid','has-invalid');
    element.removeAttribute('aria-invalid');
  });
  form.querySelectorAll('[data-error-for]').forEach(element=>{
    element.textContent='';
    element.classList.remove('is-visible');
  });
  document.getElementById('orderFeedback').hidden=true;
  updateWaterQuantityFields();
}
function clearOrderFieldValidation(fieldName){
  const form=document.getElementById('customerOrderForm');
  const controls=Array.from(form.elements).filter(control=>control.name===fieldName);
  controls.forEach(control=>{
    control.classList.remove('is-invalid');
    control.removeAttribute('aria-invalid');
    control.closest('.order-choice-grid')?.classList.remove('has-invalid');
  });
  if(fieldName==='delivery_address'){
    document.getElementById('orderAddressTrigger').classList.remove('is-invalid');
    document.getElementById('orderAddressTrigger').removeAttribute('aria-invalid');
  }
  if(fieldName==='time_slot'){
    document.getElementById('orderTimeTrigger').classList.remove('is-invalid');
    document.getElementById('orderTimeTrigger').removeAttribute('aria-invalid');
  }
  if(fieldName==='delivery_zone'){
    document.getElementById('orderCoverageResult').classList.remove('is-invalid');
    document.getElementById('orderCoverageResult').removeAttribute('aria-invalid');
  }
  const error=Array.from(form.querySelectorAll('.order-field-error')).find(item=>item.dataset.errorFor===fieldName);
  if(error){
    error.textContent='';
    error.classList.remove('is-visible');
  }
}
function showOrderFieldError(fieldName,message,control=null){
  const form=document.getElementById('customerOrderForm');
  const controls=Array.from(form.elements).filter(item=>item.name===fieldName);
  const target=control||controls.find(item=>!item.disabled);
  if(target?.type==='radio'){
    target.closest('.order-choice-grid')?.classList.add('has-invalid');
    target.setAttribute('aria-invalid','true');
  }else if(fieldName==='delivery_address'){
    document.getElementById('orderAddressTrigger').classList.add('is-invalid');
    document.getElementById('orderAddressTrigger').setAttribute('aria-invalid','true');
  }else if(fieldName==='time_slot'){
    document.getElementById('orderTimeTrigger').classList.add('is-invalid');
    document.getElementById('orderTimeTrigger').setAttribute('aria-invalid','true');
  }else if(fieldName==='delivery_zone'){
    document.getElementById('orderCoverageResult').classList.add('is-invalid');
    document.getElementById('orderCoverageResult').setAttribute('aria-invalid','true');
  }else if(target){
    target.classList.add('is-invalid');
    target.setAttribute('aria-invalid','true');
  }
  const error=Array.from(form.querySelectorAll('.order-field-error')).find(item=>item.dataset.errorFor===fieldName);
  if(error){
    error.textContent=message;
    error.classList.add('is-visible');
  }
}
function validateOrderForm(form){
  form.querySelectorAll('.is-invalid').forEach(control=>{
    control.classList.remove('is-invalid');
    control.removeAttribute('aria-invalid');
  });
  form.querySelectorAll('.has-invalid').forEach(group=>group.classList.remove('has-invalid'));
  form.querySelectorAll('.order-field-error').forEach(error=>{
    error.textContent='';
    error.classList.remove('is-visible');
  });
  const invalidControls=Array.from(form.elements).filter(control=>control.willValidate&&!control.checkValidity());
  invalidControls.forEach(control=>{
    const message=control.validity.valueMissing?'Please fill in this required field.':control.validationMessage;
    showOrderFieldError(control.name,message,control);
  });
  const fulfillmentMethod=form.querySelector('input[name="fulfillment_method"]:checked')?.value;
  if(fulfillmentMethod==='delivery'&&!document.getElementById('orderAddress').value){
    showOrderFieldError('delivery_address','Please choose a saved address.');
  }
  if(!document.getElementById('orderTime').value){
    showOrderFieldError('time_slot','Please choose a preferred time.');
  }
  return invalidControls.length===0
    &&(fulfillmentMethod!=='delivery'||Boolean(document.getElementById('orderAddress').value))
    &&Boolean(document.getElementById('orderTime').value);
}
document.getElementById('heroOrderNowBtn').addEventListener('click', ()=>openOrderArea('order'));
document.getElementById('heroViewProductsBtn').addEventListener('click',()=>openOrderArea('myOrdersCard'));
document.getElementById('tutorialPlaceOrderBtn').addEventListener('click',()=>openOrderArea('order'));
document.getElementById('tutorialViewOrdersBtn').addEventListener('click',()=>openOrderArea('myOrdersCard'));
document.getElementById('navMyOrderBtn').addEventListener('click', ()=>openOrderArea('myOrdersCard'));
document.getElementById('navCtaBtn').addEventListener('click', ()=>openOrderArea('order'));
window.addEventListener('hashchange', ()=>{ const r=location.hash.replace('#',''); if(r) go(r); });
document.getElementById('navToggle').addEventListener('click', ()=>{
  document.getElementById('navlinks').classList.toggle('mobile-open');
});
document.getElementById('adminSidebarToggle').addEventListener('click',()=>{
  const isMobileAdminNavigation=window.matchMedia('(max-width: 760px)').matches;
  if(isMobileAdminNavigation) document.body.classList.remove('admin-sidebar-collapsed');
  const isOpen=isMobileAdminNavigation
    ? document.body.classList.toggle('admin-sidebar-open')
    : !document.body.classList.toggle('admin-sidebar-collapsed');
  updateAdminSidebarControls(isOpen);
});
document.getElementById('adminSidebarReopen').addEventListener('click',()=>{
  const isMobileAdminNavigation=window.matchMedia('(max-width: 760px)').matches;
  if(isMobileAdminNavigation){
    document.body.classList.remove('admin-sidebar-collapsed');
    document.body.classList.add('admin-sidebar-open');
  }else{
    document.body.classList.remove('admin-sidebar-collapsed');
  }
  updateAdminSidebarControls(true);
});
document.getElementById('adminSidebarBackdrop').addEventListener('click',()=>{
  document.body.classList.remove('admin-sidebar-open');
  updateAdminSidebarControls(false);
});

/* ---------------- TOASTS ---------------- */
function toast(title, msg){
  const stack = document.getElementById('toastStack');
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role','status');
  el.setAttribute('aria-hidden','true');
  el.innerHTML = `<div class="ti"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="1.8"/></svg></div>
    <div><b>${escapeHtml(title)}</b><p>${escapeHtml(msg)}</p></div>`;
  stack.appendChild(el);
  updateToastLayers(stack);
  if(stack.firstElementChild===el) activateToast(el,stack);
}
function updateToastLayers(stack){
  Array.from(stack.children).forEach((toast,index)=>{
    const isCurrent=index===0;
    toast.classList.toggle('is-current',isCurrent);
    toast.classList.toggle('is-behind',!isCurrent);
    toast.style.zIndex=String(stack.children.length-index);
    toast.style.setProperty('--toast-offset',`${-Math.min(index*7,21)}px`);
    toast.style.setProperty('--toast-scale',String(Math.max(.91,1-index*.03)));
    toast.setAttribute('aria-hidden',String(!isCurrent));
  });
}
function activateToast(el,stack){
  if(!el||el!==stack.firstElementChild) return;
  updateToastLayers(stack);
  el.classList.remove('is-behind','is-leaving');
  el.classList.add('is-current');
  el.setAttribute('aria-hidden','false');
  window.setTimeout(()=>{
    if(!el.isConnected) return;
    el.classList.add('is-leaving');
    window.setTimeout(()=>{
      if(el.isConnected) el.remove();
      updateToastLayers(stack);
      activateToast(stack.firstElementChild,stack);
    },320);
  },5000);
}
function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g, character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}
function waterTypeNames(delivery){
  const types=delivery.waterTypes||delivery.water_types||(delivery.waterType||delivery.water_type?String(delivery.waterType||delivery.water_type).split(','):[]);
  return (Array.isArray(types)?types:String(types).split(',')).map(type=>String(type).trim()).filter(Boolean).map(type=>type.charAt(0).toUpperCase()+type.slice(1));
}
function orderHasConsistentVolume(delivery){
  const typeCount=waterTypeNames(delivery).length;
  const alkalineQuantity=delivery.alkalineQuantity??delivery.alkaline_quantity;
  const purifiedQuantity=delivery.purifiedQuantity??delivery.purified_quantity;
  if(alkalineQuantity!==null&&alkalineQuantity!==undefined||purifiedQuantity!==null&&purifiedQuantity!==undefined){
    return !!delivery.containerSizeGallons&&delivery.containerSizeGallons*(Number(alkalineQuantity||0)+Number(purifiedQuantity||0))===delivery.gallons;
  }
  return !!delivery.containerSizeGallons&&!!delivery.quantity&&typeCount>0&&delivery.containerSizeGallons*delivery.quantity*typeCount===delivery.gallons;
}
function orderProductLabel(delivery){
  if(!orderHasConsistentVolume(delivery)) return `${delivery.gallons} gal`;
  const alkalineQuantity=delivery.alkalineQuantity??delivery.alkaline_quantity;
  const purifiedQuantity=delivery.purifiedQuantity??delivery.purified_quantity;
  if(alkalineQuantity!==null&&alkalineQuantity!==undefined||purifiedQuantity!==null&&purifiedQuantity!==undefined){
    const details=[];
    if(Number(alkalineQuantity)>0) details.push(delivery.containerSizeGallons===1?`${alkalineQuantity} gal Alkaline`:`${alkalineQuantity} × ${delivery.containerSizeGallons} gal Alkaline`);
    if(Number(purifiedQuantity)>0) details.push(delivery.containerSizeGallons===1?`${purifiedQuantity} gal Purified`:`${purifiedQuantity} × ${delivery.containerSizeGallons} gal Purified`);
    return details.join(' · ');
  }
  return delivery.containerSizeGallons===1?`${delivery.quantity} gal ${waterTypeNames(delivery).join(' + ')}`:`${delivery.quantity} × ${delivery.containerSizeGallons} gal ${waterTypeNames(delivery).join(' + ')}`;
}

/* ---------------- NOTIFICATIONS ---------------- */
const bellBtn = document.getElementById('bellBtn');
const notifPanel = document.getElementById('notifPanel');
let renderedNotificationOrders=[];
let notificationHighlightOrderId=null;
let notificationHighlightTimer=null;
let notificationHighlightExpiresAt=0;
let notificationHighlightScrollPending=false;
let customerNotificationHighlightOrderId=null;
let customerNotificationHighlightTimer=null;
let customerNotificationHighlightExpiresAt=0;
let customerNotificationHighlightScrollPending=false;
function queueAdminNotificationHighlight(orderId){
  const targetId=String(orderId);
  const currentCard=Array.from(document.querySelectorAll('.orders-delivery-item[data-id]'))
    .find(item=>item.dataset.id===targetId);
  currentCard?.classList.remove('is-notification-highlight');
  if(currentCard) void currentCard.offsetWidth;
  notificationHighlightOrderId=targetId;
  notificationHighlightExpiresAt=Date.now()+6500;
  notificationHighlightScrollPending=true;
  clearTimeout(notificationHighlightTimer);
  notificationHighlightTimer=setTimeout(()=>{
    const card=Array.from(document.querySelectorAll('.orders-delivery-item[data-id]'))
      .find(item=>item.dataset.id===targetId);
    card?.classList.remove('is-notification-highlight');
    if(notificationHighlightOrderId===targetId){
      notificationHighlightOrderId=null;
      notificationHighlightExpiresAt=0;
      notificationHighlightScrollPending=false;
    }
  },6500);
}
function queueCustomerNotificationHighlight(orderId){
  const targetId=String(orderId);
  const currentCard=Array.from(document.querySelectorAll('[data-customer-order-card]'))
    .find(item=>item.dataset.customerOrderCard===targetId);
  currentCard?.classList.remove('is-notification-highlight');
  if(currentCard) void currentCard.offsetWidth;
  customerNotificationHighlightOrderId=targetId;
  customerNotificationHighlightExpiresAt=Date.now()+6500;
  customerNotificationHighlightScrollPending=true;
  clearTimeout(customerNotificationHighlightTimer);
  customerNotificationHighlightTimer=setTimeout(()=>{
    const card=Array.from(document.querySelectorAll('[data-customer-order-card]'))
      .find(item=>item.dataset.customerOrderCard===targetId);
    card?.classList.remove('is-notification-highlight');
    if(customerNotificationHighlightOrderId===targetId){
      customerNotificationHighlightOrderId=null;
      customerNotificationHighlightExpiresAt=0;
      customerNotificationHighlightScrollPending=false;
    }
  },6500);
}
function highlightCustomerNotificationOrder(){
  if(!customerNotificationHighlightOrderId) return;
  if(Date.now()>=customerNotificationHighlightExpiresAt){
    customerNotificationHighlightOrderId=null;
    customerNotificationHighlightExpiresAt=0;
    customerNotificationHighlightScrollPending=false;
    return;
  }
  const highlightedOrder=Array.from(document.querySelectorAll('[data-customer-order-card]'))
    .find(card=>card.dataset.customerOrderCard===customerNotificationHighlightOrderId);
  if(!highlightedOrder) return;

  highlightedOrder.classList.add('is-notification-highlight');
  if(customerNotificationHighlightScrollPending){
    customerNotificationHighlightScrollPending=false;
    requestAnimationFrame(()=>highlightedOrder.scrollIntoView({behavior:'smooth',block:'center'}));
  }
}
function getReadNotificationKeys(){
  try{
    const storedKeys=JSON.parse(localStorage.getItem(`tubipure.notifications.read.${currentUser?.id||'guest'}`)||'[]');
    return new Set(Array.isArray(storedKeys)?storedKeys:[]);
  }catch{
    return new Set();
  }
}
function getNotificationKey(order){
  return `${order.id}:${order.status}`;
}
function getNotificationTimestamp(order){
  return Date.parse(order.updatedAt||order.updated_at||order.createdAt||'')
    || Date.parse(`${order.date||''}T00:00:00`)
    || 0;
}
function sortNotificationsNewestFirst(orders){
  return orders.sort((first,second)=>getNotificationTimestamp(second)-getNotificationTimestamp(first)||Number(second.id)-Number(first.id));
}
function getNotificationDestinationIcon(){
  if(currentUser?.role==='staff'){
    return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 2.8 8.2 4.7v9L12 21.2l-8.2-4.7v-9L12 2.8Z"/><path d="m3.8 7.5 8.2 4.8 8.2-4.8M12 12.3v8.9M8 5.1l8.2 4.8"/></svg>';
  }

  return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="7" width="16" height="14" rx="2"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/></svg>';
}
function getAdminNotificationFilter(status){
  if(status==='Cancelled') return 'Rejected';
  if(status==='Confirmed'||status==='Delayed') return 'to-deliver';
  return status;
}
function saveReadNotificationKeys(readKeys){
  try{
    localStorage.setItem(`tubipure.notifications.read.${currentUser?.id||'guest'}`,JSON.stringify([...readKeys]));
  }catch{}
}
function updateNotificationBadge(orders){
  const readKeys=getReadNotificationKeys();
  const unreadCount=orders.filter(order=>!readKeys.has(getNotificationKey(order))).length;
  const bellDot=document.getElementById('bellDot');
  bellDot.textContent=unreadCount>99?'99+':String(unreadCount);
  bellDot.style.display=unreadCount?'flex':'none';
  const dashboardBadge=document.getElementById('dashboardNotificationBadge');
  dashboardBadge.style.display=unreadCount?'inline-flex':'none';
  document.getElementById('navDashboardBtn').setAttribute('aria-label',unreadCount?`Dashboard, ${unreadCount} unread notifications`:'Dashboard');
  document.getElementById('markNotificationsRead').disabled=unreadCount===0;
  return unreadCount;
}
document.getElementById('markNotificationsRead').addEventListener('click',()=>{
  const readKeys=getReadNotificationKeys();
  renderedNotificationOrders.forEach(order=>readKeys.add(getNotificationKey(order)));
  saveReadNotificationKeys(readKeys);
  renderNotifications();
});
bellBtn.addEventListener('click', (e)=>{
  e.stopPropagation();
  const isOpen=notifPanel.classList.toggle('open');
  bellBtn.setAttribute('aria-expanded',String(isOpen));
  if(isOpen){
    renderNotifications();
  }
});
document.addEventListener('click', (e)=>{
  if(!notifPanel.contains(e.target) && e.target!==bellBtn){
    notifPanel.classList.remove('open');
    bellBtn.setAttribute('aria-expanded','false');
  }
});
document.getElementById('notifList').addEventListener('click',event=>{
  const notification=event.target.closest('[data-order-notification]');
  if(!notification) return;
  const orderId=String(notification.dataset.notificationOrderId);
  const readKeys=getReadNotificationKeys();
  readKeys.add(notification.dataset.notificationKey);
  saveReadNotificationKeys(readKeys);
  notifPanel.classList.remove('open');
  bellBtn.setAttribute('aria-expanded','false');
  renderNotifications();
  if(currentUser?.role==='staff'){
    const order=deliveries.find(item=>String(item.id)===String(orderId));
    if(order){
      document.getElementById('delStatusFilter').value=getAdminNotificationFilter(order.status);
      document.getElementById('delOrderSearch').value='';
      document.getElementById('delDateFrom').value='';
      document.getElementById('delDateTo').value='';
      deliveryPage=1;
      queueAdminNotificationHighlight(order.id);
    }else{
      toast('Order unavailable','This order is no longer in the current order list.');
    }
    go('scheduler');
  }else{
    customerOrderFilter='all';
    queueCustomerNotificationHighlight(orderId);
    go('myaccount');
  }
});
document.getElementById('dashboardReminderViewOrder').addEventListener('click',event=>{
  const delivery=deliveries.find(order=>String(order.id)===event.currentTarget.dataset.upcomingOrder);
  if(!delivery) return;
  go('scheduler');
  document.getElementById('delStatusFilter').value=getAdminNotificationFilter(delivery.status);
  document.getElementById('delOrderSearch').value=String(delivery.id);
  renderDeliveries();
  const orderRow=Array.from(document.querySelectorAll('#deliveryList [data-id]')).find(row=>row.dataset.id===String(delivery.id));
  if(orderRow){
    const details=orderRow.querySelector('.delivery-row-details');
    const detailsButton=orderRow.querySelector('[data-view-delivery]');
    if(details) details.hidden=false;
    detailsButton?.setAttribute('aria-expanded','true');
    orderRow.scrollIntoView({behavior:'smooth',block:'center'});
  }
});

function dueSoon(){
  return deliveries.filter(d => (d.date===todayStr) && ['Pending','Confirmed','Out for Delivery'].includes(d.status));
}
const deliveryReminderNotified=new Set();
function minutesUntilScheduledDelivery(delivery,now=new Date()){
  const dateMatch=String(delivery.date||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch=String(delivery.time||'').trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if(!dateMatch||!timeMatch) return null;
  const [,year,month,day]=dateMatch;
  let hour=Number(timeMatch[1]);
  const minute=Number(timeMatch[2]);
  const period=timeMatch[3]?.toUpperCase();
  if(period){
    if(hour<1||hour>12) return null;
    hour=(hour%12)+(period==='PM'?12:0);
  }
  if(hour>23||minute>59) return null;
  const nowParts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:siteTimezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now).map(part=>[part.type,part.value]));
  const scheduledAt=Date.UTC(Number(year),Number(month)-1,Number(day),hour,minute);
  const currentSiteTime=Date.UTC(Number(nowParts.year),Number(nowParts.month)-1,Number(nowParts.day),Number(nowParts.hour),Number(nowParts.minute),Number(nowParts.second));
  return Math.ceil((scheduledAt-currentSiteTime)/60000);
}
function formatDeliveryCountdown(minutes){
  if(minutes===null) return '';
  if(minutes===0) return 'Due now';
  const absoluteMinutes=Math.abs(minutes);
  const days=Math.floor(absoluteMinutes/1440);
  const hours=Math.floor((absoluteMinutes%1440)/60);
  const remainingMinutes=absoluteMinutes%60;
  const parts=[];
  if(days) parts.push(`${days} day${days===1?'':'s'}`);
  if(hours) parts.push(`${hours} hr${hours===1?'':'s'}`);
  if(remainingMinutes&&days===0) parts.push(`${remainingMinutes} min`);
  if(parts.length===0) parts.push('1 min');
  return minutes<0?`Overdue by ${parts.join(' ')}`:`Due in ${parts.join(' ')}`;
}
function updateDeliveryCountdowns(){
  document.querySelectorAll('[data-delivery-countdown]').forEach(countdown=>{
    const delivery=deliveries.find(item=>String(item.id)===countdown.dataset.deliveryCountdown);
    if(!delivery) return;
    const minutes=minutesUntilScheduledDelivery(delivery);
    countdown.textContent=formatDeliveryCountdown(minutes);
    countdown.classList.toggle('is-urgent',minutes!==null&&minutes>=0&&minutes<=60);
    countdown.classList.toggle('is-overdue',minutes!==null&&minutes<0);
  });
}
setInterval(updateDeliveryCountdowns,60_000);
function reminderSentTime(delivery){
  const timeMatch=String(delivery.time||'').trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if(!timeMatch) return '—';
  let hour=Number(timeMatch[1]);
  const minute=Number(timeMatch[2]);
  const period=timeMatch[3]?.toUpperCase();
  if(period){
    if(hour<1||hour>12) return '—';
    hour=(hour%12)+(period==='PM'?12:0);
  }
  if(hour>23||minute>59) return '—';
  hour=(hour+23)%24;
  return formatBusinessTime(`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`);
}
function upcomingDeliveryReminders(){
  return deliveries.filter(delivery=>['Confirmed','Out for Delivery','Delayed'].includes(delivery.status))
    .map(delivery=>({delivery,minutes:minutesUntilScheduledDelivery(delivery)}))
    .filter(reminder=>reminder.minutes!==null&&reminder.minutes>=0&&reminder.minutes<=60);
}
function checkUpcomingDeliveryReminders(){
  if(currentUser?.role!=='staff') return;
  const reminders=upcomingDeliveryReminders().sort((first,second)=>first.minutes-second.minutes);
  const reminderAlert=document.getElementById('deliveryReminderAlert');
  if(reminderAlert){
    reminderAlert.hidden=reminders.length===0;
    reminderAlert.innerHTML=reminders.length
      ? `<strong>Upcoming deliveries — please deliver by the customer’s preferred time:</strong><ul>${reminders.map(({delivery,minutes})=>`<li>Order #ORD-${escapeHtml(String(delivery.id))} for ${escapeHtml(delivery.customer?.name||'Customer')} at ${escapeHtml(formatDeliveryDate(delivery.date))}, ${escapeHtml(formatDeliveryOrderTime(delivery.time))}${minutes>0?` (in ${minutes} min)`:''}.</li>`).join('')}</ul>`
      : '';
  }
  const dashboardReminder=document.getElementById('dashboardUpcomingReminder');
  if(dashboardReminder){
    const upcoming=reminders[0];
    dashboardReminder.hidden=!upcoming;
    if(upcoming){
      const {delivery,minutes}=upcoming;
      const customerName=delivery.customer?.name||'Customer';
      document.getElementById('dashboardReminderInstruction').textContent=`Deliver ${customerName}’s order by the customer’s preferred delivery time.`;
      document.getElementById('dashboardReminderScheduledTime').textContent=formatDeliveryOrderTime(delivery.time);
      document.getElementById('dashboardReminderSentAt').textContent=reminderSentTime(delivery);
      document.querySelector('#dashboardReminderDue span').textContent=minutes>=60?'Due in 1 hour':minutes>1?`Due in ${minutes} minutes`:minutes===1?'Due in 1 minute':'Due now';
      document.getElementById('dashboardReminderViewOrder').dataset.upcomingOrder=String(delivery.id);
    }
  }
  reminders.forEach(({delivery})=>{
    const key=`tubipure:delivery-reminder:${delivery.id}:${delivery.date}:${delivery.time}`;
    let alreadyNotified=deliveryReminderNotified.has(key);
    try{ alreadyNotified=alreadyNotified||sessionStorage.getItem(key)==='shown'; }catch{}
    if(alreadyNotified) return;
    deliveryReminderNotified.add(key);
    try{ sessionStorage.setItem(key,'shown'); }catch{}
    toast('Delivery due in one hour',`Order #ORD-${delivery.id} is scheduled for ${formatDeliveryOrderTime(delivery.time)}. Please deliver by the customer’s preferred time.`);
  });
}
function renderNotifications(){
  const list = document.getElementById('notifList');
  const notificationTitle=document.getElementById('notifTitle');
  if(currentUser?.role==='customer'){
    notificationTitle.textContent='Order updates';
    const recentOrderUpdates=sortNotificationsNewestFirst([...deliveries]
      .filter(order=>['Pending','Confirmed','Out for Delivery','Delayed'].includes(order.status)
        || (['Delivered','Cancelled'].includes(order.status)&&isWithinDays(order.date,7))))
      .slice(0,6);
    renderedNotificationOrders=recentOrderUpdates;
    const notificationCount=updateNotificationBadge(recentOrderUpdates);
    const destinationIcon=getNotificationDestinationIcon();
    const readKeys=getReadNotificationKeys();
    bellBtn.setAttribute('aria-label',notificationCount?`Order notifications, ${notificationCount} updates`:'Order notifications');
    if(!recentOrderUpdates.length){
      list.innerHTML='<div class="notif-item">No order updates yet.</div>';
      return;
    }
    list.innerHTML=recentOrderUpdates.map(order=>{
      const message={
        Pending:'Your order is awaiting confirmation.',
        Confirmed:'Your order has been confirmed.',
        'Out for Delivery':order.fulfillmentMethod==='pickup'
          ? 'Your order is ready for pickup at TubiPure.'
          : `Your order is on its way${order.time?` · ${order.time}`:''}.`,
        Delayed:'Your order is delayed. Our team will update you soon.',
        Delivered:'Your order was marked delivered.',
        Cancelled:order.statusNote?`Your order was rejected. Reason: ${order.statusNote}`:'This order was cancelled.'
      }[order.status]||`Order status: ${order.status}.`;
      const displayStatus=displayOrderStatus(order);
      const unreadClass=readKeys.has(getNotificationKey(order))?'':' is-unread';
      return `<button type="button" class="notif-item notif-action${unreadClass}" data-order-notification data-notification-key="${escapeHtml(getNotificationKey(order))}" data-notification-order-id="${escapeHtml(String(order.id))}"><span class="ni-icon">${destinationIcon}</span><span><b>Order #${escapeHtml(String(order.id))} · ${escapeHtml(displayStatus)}</b><br>${escapeHtml(message)}</span></button>`;
    }).join('');
    return;
  }

  notificationTitle.textContent='Recent order activity';
  const allOrderActivity=sortNotificationsNewestFirst([...deliveries]
    .filter(order=>['Pending','Confirmed','Out for Delivery','Delayed'].includes(order.status)
      || (['Delivered','Cancelled'].includes(order.status)&&isWithinDays(order.date,7))));
  const recentOrderActivity=allOrderActivity;
  renderedNotificationOrders=allOrderActivity;
  const notificationCount=updateNotificationBadge(allOrderActivity);
  const destinationIcon=getNotificationDestinationIcon();
  const readKeys=getReadNotificationKeys();
  bellBtn.setAttribute('aria-label',notificationCount?`Order activity and delivery reminders, ${notificationCount} notifications`:'Order activity and delivery reminders');
  if(!recentOrderActivity.length){ list.innerHTML='<div class="notif-item">No recent order activity.</div>'; return; }
  list.innerHTML=recentOrderActivity.map(order=>{
    const message={
      Pending:`New order scheduled for ${order.date}.`,
      Confirmed:order.fulfillmentMethod==='pickup'
        ? `Pickup order scheduled for ${order.date} is approved.`
        : `Order scheduled for ${order.date} is approved and ready for delivery.`,
      'Out for Delivery':order.fulfillmentMethod==='pickup'
        ? `Pickup order scheduled for ${order.date} is ready for pickup.`
        : `Delivery scheduled for ${order.date} is in progress.`,
      Delayed:'This order needs an update.',
      Delivered:'This order was delivered.',
      Cancelled:'This order was rejected.'
    }[order.status]||`Order status: ${order.status}.`;
    const displayStatus=order.status==='Confirmed'?(order.fulfillmentMethod==='pickup'?'Approved':'To Deliver'):displayOrderStatus(order);
    const unreadClass=readKeys.has(getNotificationKey(order))?'':' is-unread';
    return `<button type="button" class="notif-item notif-action${unreadClass}" data-order-notification data-notification-key="${escapeHtml(getNotificationKey(order))}" data-notification-order-id="${escapeHtml(String(order.id))}"><span class="ni-icon">${destinationIcon}</span><span><b>${escapeHtml(order.customer?.name||'Customer')} · ${escapeHtml(displayStatus)}</b><br>${escapeHtml(message)}</span></button>`;
  }).join('');
}
function mapLiveCustomerOrder(order){
  const customer=order.customer||currentUser?.customer;
  return {
    id:order.id,
    createdAt:order.created_at,
    updatedAt:order.updated_at,
    customerId:order.customer_id,
    date:order.date,
    time:order.time_slot,
    gallons:order.gallons,
    status:order.status,
    statusNote:order.status_note,
    address:order.delivery_address||order.address||customer?.address,
    waterType:order.water_type,
    waterTypes:order.water_types,
    containerSizeGallons:order.container_size_gallons,
    quantity:order.quantity,
    alkalineQuantity:order.alkaline_quantity,
    purifiedQuantity:order.purified_quantity,
    fulfillmentMethod:order.fulfillment_method,
    deliveryLatitude:order.delivery_latitude,
    deliveryLongitude:order.delivery_longitude,
    paymentMethod:order.payment_method,
    deliveryZone:order.delivery_zone,
    ratePerGallon:order.rate_per_gallon,
    alkalineRatePerGallon:order.alkaline_rate_per_gallon,
    purifiedRatePerGallon:order.purified_rate_per_gallon,
    deliveryRatePerKm:order.delivery_rate_per_km,
    deliveryDistanceKm:order.delivery_distance_km,
    waterSubtotal:order.water_subtotal,
    deliveryFee:order.delivery_fee,
    orderTotal:order.order_total,
    contactName:order.contact_name,
    contactPhone:order.contact_phone,
    deliveryAddress:order.delivery_address,
    deliveryInstructions:order.delivery_instructions,
    customer:customer?{id:customer.id,name:customer.name}:null
  };
}
async function pollLiveNotifications(){
  if(!currentUser||document.hidden||isNotificationPollRunning) return;
  isNotificationPollRunning=true;
  const userId=String(currentUser.id);
  const activePage=document.querySelector('.page.active')?.id;
  const previousOrders=new Map(deliveries.map(order=>[String(order.id),order]));
  const previousCustomers=JSON.stringify(customers);
  let hasOrderChanges=false;
  let addressesChanged=false;
  let profileChanged=false;
  try{
    if(currentUser.role==='customer'&&currentUser.customer){
      const [ordersResult,addressesResult,accountResult]=await Promise.all([
        api('/my/orders'),
        api('/my/addresses'),
        api('/me')
      ]);
      if(!currentUser||String(currentUser.id)!==userId) return;
      const updatedDeliveries=(ordersResult.data||[]).map(mapLiveCustomerOrder);
      const updatedAddresses=addressesResult.data||[];
      const account=accountResult.user;
      const previousAddressSnapshot=JSON.stringify(currentUser.customer.addresses||[]);
      const previousProfileSnapshot=JSON.stringify({
        name:currentUser.name,
        email:currentUser.email,
        customerName:currentUser.customer.name,
        customerEmail:currentUser.customer.email,
        address:currentUser.customer.address,
        contact:currentUser.customer.contact
      });
      const updatedProfileSnapshot=JSON.stringify({
        name:account.name,
        email:account.email,
        customerName:account.customer?.name,
        customerEmail:account.customer?.email,
        address:account.customer?.address,
        contact:account.customer?.contact
      });
      addressesChanged=previousAddressSnapshot!==JSON.stringify(updatedAddresses);
      profileChanged=previousProfileSnapshot!==updatedProfileSnapshot;
      hasOrderChanges=JSON.stringify(deliveries)!==JSON.stringify(updatedDeliveries);
      currentUser={...currentUser,...account,customer:{...currentUser.customer,...account.customer,addresses:updatedAddresses,deliveries:updatedDeliveries}};
      deliveries=updatedDeliveries;
      customers=currentUser.customer?[currentUser.customer]:[];
      if(profileChanged) updateAuthNavigation();
    }else if(currentUser.role==='staff'){
      await loadStaffData();
      if(!currentUser||String(currentUser.id)!==userId) return;
      checkUpcomingDeliveryReminders();
      hasOrderChanges=JSON.stringify([...previousOrders.values()])!==JSON.stringify(deliveries);
      if(activePage==='page-users'){
        const usersResult=await api('/staff/users');
        if(!currentUser||String(currentUser.id)!==userId) return;
        const updatedUsers=usersResult.data||[];
        updateNewUserCount(updatedUsers);
        if(JSON.stringify(registeredUsers)!==JSON.stringify(updatedUsers)){
          registeredUsers=updatedUsers;
          renderUserRows();
        }
      }
      if(activePage==='page-profile'||activePage==='page-change-password'){
        const accountResult=await api('/me');
        if(!currentUser||String(currentUser.id)!==userId) return;
        const account=accountResult.user;
        if(account.name!==currentUser.name||account.email!==currentUser.email){
          currentUser={...currentUser,...account};
          updateAuthNavigation();
          if(activePage==='page-profile') renderProfile();
        }
      }
    }else{
      return;
    }
    const canNotify=liveNotificationUserId===userId;
    if(canNotify){
      deliveries.forEach(order=>{
        const previousOrder=previousOrders.get(String(order.id));
        if(!previousOrder){
          const customerName=order.customer?.name||currentUser.customer?.name||'Customer';
          toast('New order request',`Order #${order.id} from ${customerName}.`);
        }else if(previousOrder.status!==order.status){
          if(currentUser.role==='customer'&&order.status==='Cancelled'&&order.statusNote){
            toast('Order rejected',`Order #ORD-${order.id} was rejected. Reason: ${order.statusNote}`);
          }else{
            toast('Order status updated',`Order #${order.id} is now ${order.status}.`);
          }
        }
      });
    }
    const customerRecordsChanged=previousCustomers!==JSON.stringify(customers);
    if(hasOrderChanges||customerRecordsChanged){
      if(hasOrderChanges) renderNotifications();
      if(currentUser.role==='customer'&&activePage==='page-myaccount') renderMyAccount();
      if(currentUser.role==='customer'&&activePage==='page-profile'&&(profileChanged||addressesChanged)) renderProfile();
      if(currentUser.role==='customer'&&activePage==='page-order'&&addressesChanged) renderCustomerOrder();
      if(currentUser.role==='staff'){
        if(activePage==='page-dashboard') renderDashboard();
        if(activePage==='page-scheduler') renderDeliveries();
        if(activePage==='page-order-history') renderOrderHistory();
        if(activePage==='page-customers') renderCustomers();
      }
    }
    if(currentUser.role==='customer'&&activePage==='page-address'&&addressesChanged){
      renderCustomerAddresses();
    }
  }catch{
    // A failed live refresh should not interrupt the current page or account session.
  }finally{
    isNotificationPollRunning=false;
  }
}
async function pollLivePublicStats(){
  if(document.hidden||isPublicStatsPollRunning||document.querySelector('.page.active')?.id!=='page-home') return;
  isPublicStatsPollRunning=true;
  try{
    const stats=await api('/public/stats');
    document.getElementById('introCustomers').textContent=stats.customers;
    document.getElementById('introToday').textContent=stats.today;
    document.getElementById('introGallons').textContent=stats.gallons;
  }catch{
    // Public statistics can wait for the next refresh if the network is unavailable.
  }finally{
    isPublicStatsPollRunning=false;
  }
}
setInterval(pollLiveNotifications,3000);
setInterval(()=>{
  if(activePage!=='page-users') refreshNewUserCount();
},30000);
setInterval(pollLivePricingSettings,3000);
setInterval(pollLivePublicStats,5000);
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden){
    pollLiveNotifications();
    if(activePage!=='page-users') refreshNewUserCount();
    pollLivePricingSettings();
    pollLivePublicStats();
  }
});
setTimeout(()=>{
  if(currentUser?.role!=='staff') return;
  checkUpcomingDeliveryReminders();
}, 2500);

/* ---------------- HOME ---------------- */
function renderHome(){
  loadPricingSettings().then(settings=>{
    const price=value=>`₱${Number(value).toFixed(2).replace(/\.00$/,'')}`;
    document.getElementById('homeAlkalinePrice').textContent=price(settings.alkaline_price_per_gallon);
    document.getElementById('homePurifiedPrice').textContent=price(settings.purified_price_per_gallon);
    document.getElementById('homeDeliveryPrice').textContent=price(settings.delivery_price_per_km);
    updateDeliveryHoursCard();
  }).catch(()=>{
    document.getElementById('homeAlkalinePrice').textContent='Price unavailable';
    document.getElementById('homePurifiedPrice').textContent='Price unavailable';
    document.getElementById('homeDeliveryPrice').textContent='Rate unavailable';
  });
  api('/public/stats').then(stats=>{
    document.getElementById('introCustomers').textContent = stats.customers;
    document.getElementById('introToday').textContent = stats.today;
    document.getElementById('introGallons').textContent = stats.gallons;
  }).catch(()=>{
    document.getElementById('introCustomers').textContent='—';
    document.getElementById('introToday').textContent='—';
    document.getElementById('introGallons').textContent='—';
  });
}
function formatBusinessTime(value){
  const match=String(value||'').match(/^(\d{1,2}):(\d{2})/);
  if(!match) return '—';
  const hour=Number(match[1]);
  return `${hour%12||12}:${match[2]} ${hour>=12?'PM':'AM'}`;
}
function updateDeliveryHoursCard(){
  if(!pricingSettings) return;
  const weekday=new Intl.DateTimeFormat('en-US',{timeZone:siteTimezone,weekday:'long'}).format(new Date());
  const stationHours=scheduleHoursForDay('station_schedule',weekday);
  const deliveryHours=scheduleHoursForDay('delivery_schedule',weekday);
  const openingMinutes=Number(stationHours.opens.slice(0,2))*60+Number(stationHours.opens.slice(3,5));
  const closingMinutes=Number(stationHours.closes.slice(0,2))*60+Number(stationHours.closes.slice(3,5));
  const nowParts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:siteTimezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(part=>[part.type,part.value]));
  const currentMinutes=Number(nowParts.hour)*60+Number(nowParts.minute);
  const isOpen=stationHours.open&&currentMinutes>=openingMinutes&&currentMinutes<closingMinutes;
  const status=document.getElementById('deliveryOpenStatus');
  status.classList.toggle('is-open',isOpen);
  status.classList.toggle('is-closed',!isOpen);
  document.getElementById('deliveryOpenStatusText').textContent=isOpen?`Open now · closes ${formatBusinessTime(stationHours.closes)}`:stationHours.open?`Closed · opens ${formatBusinessTime(stationHours.opens)}`:'Closed today';
  document.getElementById('homeDeliveryHours').textContent=deliveryHours.open?`${formatBusinessTime(deliveryHours.opens)} – ${formatBusinessTime(deliveryHours.closes)}`:'Closed today';
  document.getElementById('homeStationHours').textContent=stationHours.open?`${formatBusinessTime(stationHours.opens)} – ${formatBusinessTime(stationHours.closes)}`:'Closed today';
  document.getElementById('footerDeliveryHours').textContent=document.getElementById('homeDeliveryHours').textContent;
  document.getElementById('footerStationHours').textContent=document.getElementById('homeStationHours').textContent;
  updateOrderTimeHelp();
}
setInterval(updateDeliveryHoursCard,60_000);
function isWithinDays(dateStr, days){
  const d = new Date(dateStr); const now = new Date(todayStr);
  const diff = (now - d)/(1000*60*60*24);
  return diff >= 0 && diff <= days;
}

/* ---------------- DASHBOARD ---------------- */
function renderDashboard(){
  const todays=deliveries.filter(delivery=>delivery.date===todayStr);
  const totalGallonsDelivered=deliveries.filter(delivery=>delivery.status==='Delivered')
    .reduce((total,delivery)=>total+Number(delivery.gallons||0),0);
  const statusCounts={
    'Pending':deliveries.filter(delivery=>delivery.status==='Pending').length,
    'Approved':deliveries.filter(delivery=>delivery.status==='Confirmed').length,
    'Out for Delivery':deliveries.filter(delivery=>['Out for Delivery','Delayed'].includes(delivery.status)).length,
    'Delivered':deliveries.filter(delivery=>delivery.status==='Delivered').length,
    'Rejected':deliveries.filter(delivery=>delivery.status==='Cancelled').length
  };
  const kpis=[
    {label:'Total customers',value:customers.length,icon:'user',tone:'blue'},
    {label:'Total orders',value:deliveries.length,icon:'orders',tone:'indigo'},
    {label:'Total gallons delivered',value:totalGallonsDelivered,icon:'drop',tone:'green'},
    {label:'Pending orders',value:statusCounts.Pending,icon:'clock',tone:'amber'}
  ];
  const icons={
    user:'<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2m8-10a4 4 0 100-8 4 4 0 000 8z"/>',
    orders:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8m-8 4h5"/>',
    drop:'<path d="M12 2S5 10.5 5 15.5a7 7 0 0014 0C19 10.5 12 2 12 2z"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    truck:'<path d="M3 6h11v12H3zM14 10h4l3 3v5h-7z"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="17.5" cy="19" r="1.5"/>',
    check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
    cancel:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>'
  };
  document.getElementById('dashboardDate').textContent=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',timeZone:siteTimezone}).format(new Date());
  renderDashboardRevenue();
  document.getElementById('kpiGrid').innerHTML=kpis.map(metric=>`
    <article class="kpi dashboard-kpi dashboard-kpi-${metric.tone}">
      <span class="kicon" aria-hidden="true">${metric.icon==='drop'?'<img src="/images/water-gallon-icon.png" alt="">':`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[metric.icon]}</svg>`}</span>
      <strong class="kval">${metric.value}</strong><span class="klbl">${escapeHtml(metric.label)}</span>
      ${metric.icon==='drop'?'<img class="dashboard-kpi-watermark dashboard-kpi-watermark-image" src="/images/water-gallon-icon.png" alt="">':`<svg class="dashboard-kpi-watermark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${icons[metric.icon]}</svg>`}
    </article>`).join('');

  renderDashboardStatus(statusCounts);
  renderDashboardToday(todays);
  renderDashboardRecentOrders();
  renderDashboardZones();
  drawChart();
}

function renderDashboardRevenue(){
  const archivedCustomerIds=new Set(customers.filter(customer=>customer.isArchived).map(customer=>String(customer.id)));
  const totals=deliveries.filter(delivery=>delivery.status==='Delivered'&&!archivedCustomerIds.has(String(delivery.customerId))).reduce((sum,delivery)=>{
    const shippingCost=delivery.deliveryFee===null||delivery.deliveryFee===undefined?0:Number(delivery.deliveryFee)||0;
    const orderTotal=delivery.orderTotal===null||delivery.orderTotal===undefined?null:Number(delivery.orderTotal);
    const waterSubtotal=delivery.waterSubtotal===null||delivery.waterSubtotal===undefined
      ? orderTotal!==null?Math.max(orderTotal-shippingCost,0):Number(delivery.ratePerGallon||0)*Number(delivery.gallons||0)
      : Number(delivery.waterSubtotal)||0;
    sum.water+=waterSubtotal;
    sum.shipping+=shippingCost;
    sum.overall+=orderTotal===null?waterSubtotal+shippingCost:orderTotal;
    return sum;
  },{water:0,shipping:0,overall:0});
  const formatMoney=value=>`₱${value.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  document.getElementById('dashboardWaterRevenue').textContent=formatMoney(totals.water);
  document.getElementById('dashboardShippingCost').textContent=formatMoney(totals.shipping);
  document.getElementById('dashboardOverallTotal').textContent=formatMoney(totals.overall);
}

function renderDashboardStatus(counts){
  const statusOrder=['Pending','Approved','Out for Delivery','Delivered','Rejected'];
  const colors={'Pending':'#f4c542','Approved':'#079ee8','Out for Delivery':'#20c76a','Delivered':'#087ee5','Rejected':'#ef4444'};
  const total=statusOrder.reduce((sum,status)=>sum+counts[status],0);
  let offset=0;
  const segments=statusOrder.filter(status=>counts[status]>0).map(status=>{
    const start=offset;
    offset+=counts[status]/Math.max(total,1)*100;
    return `${colors[status]} ${start}% ${offset}%`;
  });
  const donut=document.getElementById('statusDonut');
  donut.style.setProperty('--dashboard-donut',segments.length?`conic-gradient(${segments.join(',')})`:'conic-gradient(var(--theme-surface-soft) 0 100%)');
  document.getElementById('statusTotal').textContent=total;
  donut.setAttribute('aria-label',`Order status breakdown: ${total} total orders`);
  document.getElementById('statusSummary').innerHTML=statusOrder.map(status=>{
    const count=counts[status];
    const percent=total?Math.round(count/total*100):0;
    return `<div class="dashboard-status-row"><span><i style="--status-color:${colors[status]}"></i>${escapeHtml(status)}</span><strong>${count}</strong><small>${percent}%</small></div>`;
  }).join('');
}

function renderDashboardToday(todays){
  const body=document.getElementById('todayDeliveriesBody');
  const rows=[...todays].sort((first,second)=>String(first.time||'').localeCompare(String(second.time||''))).slice(0,6);
  body.innerHTML=rows.map((delivery,index)=>{
    const name=delivery.customer?.name||'—';
    const location=delivery.address||delivery.customer?.address||'—';
    return `<tr><td>${index+1}</td><td>${escapeHtml(name)}</td><td>${Number(delivery.gallons||0)} gal</td><td>${escapeHtml(formatDeliveryOrderTime(delivery.time))}</td><td>${escapeHtml(location)}</td><td>${adminStatusTag(delivery.status)}</td></tr>`;
  }).join('');
  document.getElementById('todayDeliveriesEmpty').hidden=rows.length>0;
}

function renderDashboardRecentOrders(){
  const rows=[...deliveries].sort((first,second)=>{
    const firstTime=Date.parse(first.createdAt||'')||Date.parse(`${first.date||''}T00:00:00`);
    const secondTime=Date.parse(second.createdAt||'')||Date.parse(`${second.date||''}T00:00:00`);
    return secondTime-firstTime;
  }).slice(0,5);
  document.getElementById('recentOrdersBody').innerHTML=rows.map((delivery,index)=>{
    const name=delivery.customer?.name||'—';
    const total=delivery.orderTotal===null||delivery.orderTotal===undefined?'—':`₱${Number(delivery.orderTotal).toFixed(0)}`;
    return `<tr><td>${index+1}</td><td>${escapeHtml(name)}</td><td>${Number(delivery.gallons||0)} gal</td><td>${total}</td><td>${adminStatusTag(delivery.status)}</td><td>${escapeHtml(formatDeliveryDate(deliveryOrderDate(delivery)))}</td></tr>`;
  }).join('');
  document.getElementById('recentOrdersEmpty').hidden=rows.length>0;
}

function renderDashboardZones(){
  const rate=Number(pricingSettings?.delivery_price_per_km||0);
  document.getElementById('dashboardZonesBody').innerHTML=ZONES.map(zone=>{
    const coverage=zone.id==='C'?`Beyond ${zone.max} km`:`Within ${zone.range}`;
    return `<tr><td><span class="dashboard-zone-dot dashboard-zone-${zone.id.toLowerCase()}"></span>${escapeHtml(zone.name)}</td><td>${escapeHtml(zone.range)}</td><td>₱${rate.toFixed(0)}/km</td><td>${escapeHtml(coverage)}</td></tr>`;
  }).join('');
}

function volumeChartBuckets(range){
  if(range==='day'){
    return Array.from({length:7},(_,index)=>{
      const date=addDays(todayStr,index-6);
      const dateObject=new Date(`${date}T00:00:00Z`);
      return {
        start:date,
        end:date,
        labelTop:new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'UTC'}).format(dateObject),
        labelBottom:new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(dateObject)
      };
    });
  }
  if(range==='week'){
    const today=new Date(`${todayStr}T00:00:00Z`);
    const daysSinceMonday=(today.getUTCDay()+6)%7;
    const currentWeekStart=addDays(todayStr,-daysSinceMonday);
    return Array.from({length:12},(_,index)=>{
      const start=addDays(currentWeekStart,(index-11)*7);
      const end=index===11?todayStr:addDays(start,6);
      return {start,end,labelTop:new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(`${start}T00:00:00Z`)),labelBottom:''};
    });
  }
  if(range==='month'){
    const currentMonth=new Date(`${todayStr}T00:00:00Z`);
    currentMonth.setUTCDate(1);
    return Array.from({length:12},(_,index)=>{
      const monthStart=new Date(currentMonth);
      monthStart.setUTCMonth(monthStart.getUTCMonth()+index-11);
      const nextMonth=new Date(monthStart);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1);
      nextMonth.setUTCDate(0);
      const start=monthStart.toISOString().slice(0,10);
      const end=index===11?todayStr:nextMonth.toISOString().slice(0,10);
      return {start,end,labelTop:new Intl.DateTimeFormat('en-US',{month:'short',timeZone:'UTC'}).format(monthStart),labelBottom:String(monthStart.getUTCFullYear())};
    });
  }
  const currentYear=Number(todayStr.slice(0,4));
  return Array.from({length:5},(_,index)=>{
    const year=currentYear+index-4;
    return {start:`${year}-01-01`,end:index===4?todayStr:`${year}-12-31`,labelTop:String(year),labelBottom:''};
  });
}

function deliveredGallonsByWaterType(delivery){
  const gallons=Number(delivery.gallons)||0;
  const containerSize=Number(delivery.containerSizeGallons)||1;
  const alkalineGallons=(Number(delivery.alkalineQuantity)||0)*containerSize;
  const purifiedGallons=(Number(delivery.purifiedQuantity)||0)*containerSize;
  if(alkalineGallons+purifiedGallons>0){
    const scale=Math.min(1,gallons/(alkalineGallons+purifiedGallons));
    return {alkaline:alkalineGallons*scale,purified:purifiedGallons*scale,total:gallons};
  }
  const waterTypes=waterTypeNames(delivery).map(type=>type.toLowerCase());
  if(waterTypes.length===1&&waterTypes[0]==='alkaline') return {alkaline:gallons,purified:0,total:gallons};
  if(waterTypes.length===1&&waterTypes[0]==='purified') return {alkaline:0,purified:gallons,total:gallons};
  return {alkaline:0,purified:0,total:gallons};
}

function drawChart(){
  const canvas=document.getElementById('volChart');
  const ctx=canvas.getContext('2d');
  const range=document.getElementById('deliveryVolumeRange').value;
  const chartType=document.querySelector('[data-volume-chart-type].is-active').dataset.volumeChartType;
  const waterType=document.getElementById('deliveryVolumeWaterType').value;
  const dpr=window.devicePixelRatio||1;
  const cssW=canvas.clientWidth||600;
  const cssH=230;
  canvas.width=cssW*dpr;
  canvas.height=cssH*dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssW,cssH);

  const buckets=volumeChartBuckets(range);
  const completedOrders=deliveries.filter(delivery=>delivery.status==='Delivered');
  const series=[
    {key:'alkaline',label:'Alkaline',color:'#079ee8'},
    {key:'purified',label:'Purified',color:'#00bd83'},
    {key:'total',label:'Total',color:'#8651f3'}
  ];
  const visibleSeries=waterType==='all'?series:series.filter(item=>item.key===waterType);
  const gallonsByOrder=new Map(completedOrders.map(delivery=>[String(delivery.id),deliveredGallonsByWaterType(delivery)]));
  const seriesValues=Object.fromEntries(visibleSeries.map(item=>[item.key,buckets.map(bucket=>completedOrders.reduce((total,delivery)=>{
    if(delivery.date<bucket.start||delivery.date>bucket.end) return total;
    return total+gallonsByOrder.get(String(delivery.id))[item.key];
  },0))]));
  const dailyTotals=new Map();
  completedOrders.forEach(delivery=>{
    if(delivery.date<buckets[0].start||delivery.date>buckets[buckets.length-1].end) return;
    const gallons=gallonsByOrder.get(String(delivery.id));
    const amount=waterType==='all'?gallons.total:gallons[waterType];
    dailyTotals.set(delivery.date,(dailyTotals.get(delivery.date)||0)+amount);
  });
  const totalDelivered=(waterType==='all'?seriesValues.total:seriesValues[waterType]).reduce((total,value)=>total+value,0);
  const startDate=new Date(`${buckets[0].start}T00:00:00Z`);
  const endDate=new Date(`${buckets[buckets.length-1].end}T00:00:00Z`);
  const daysInRange=Math.max(1,Math.round((endDate-startDate)/86400000)+1);
  const averagePerDay=totalDelivered/daysInRange;
  const highestDay=Math.max(0,...dailyTotals.values());
  const formatGallons=value=>`${Number(value).toLocaleString('en-US',{maximumFractionDigits:1})} gal`;
  document.getElementById('volumeTotalDelivered').textContent=formatGallons(totalDelivered);
  document.getElementById('volumeAveragePerDay').textContent=formatGallons(averagePerDay);
  document.getElementById('volumeHighestDay').textContent=formatGallons(highestDay);
  document.getElementById('dashboardVolumeLegend').innerHTML=visibleSeries.map(item=>`<span class="dashboard-volume-legend-item"><i class="dashboard-volume-legend-dot" style="--legend-tone:${item.color}"></i>${item.label}</span>`).join('');
  const allValues=Object.values(seriesValues).flat();
  const max=Math.max(...allValues,5);
  const padL=42,padR=14,padT=12,padB=42;
  const width=cssW-padL-padR;
  const height=cssH-padT-padB;
  const bottom=padT+height;
  const pointsBySeries=Object.fromEntries(visibleSeries.map(item=>[item.key,seriesValues[item.key].map((value,index)=>({
    x:buckets.length===1?padL+width/2:padL+(width/(buckets.length-1))*index,
    y:bottom-(value/max)*height,
    value
  }))]));
  const chartStyles=getComputedStyle(document.documentElement);
  const gridColor=chartStyles.getPropertyValue('--chart-grid').trim()||'#D6ECF9';
  const labelColor=chartStyles.getPropertyValue('--chart-label').trim()||'#78909c';
  const textColor=chartStyles.getPropertyValue('--theme-text').trim()||'#4C6377';

  ctx.lineWidth=1;
  ctx.font='10px Manrope, sans-serif';
  for(let index=0;index<=3;index++){
    const y=bottom-(height/3)*index;
    ctx.strokeStyle=gridColor;
    ctx.beginPath();
    ctx.moveTo(padL,y);
    ctx.lineTo(cssW-padR,y);
    ctx.stroke();
    ctx.fillStyle=labelColor;
    ctx.textAlign='right';
    ctx.fillText(String(Math.round(max/3*index)),padL-7,y+3);
  }

  ctx.save();
  ctx.translate(13,padT+height/2);
  ctx.rotate(-Math.PI/2);
  ctx.fillStyle=textColor;
  ctx.font='11px Manrope, sans-serif';
  ctx.textAlign='center';
  ctx.fillText('Gallons',0,0);
  ctx.restore();

  if(range==='day'){
    buckets.forEach((bucket,index)=>{
      if(index===0||index===buckets.length-1) return;
      const point=pointsBySeries[visibleSeries[0].key][index];
      ctx.strokeStyle=gridColor;
      ctx.globalAlpha=.3;
      ctx.beginPath();
      ctx.moveTo(point.x,padT);
      ctx.lineTo(point.x,bottom);
      ctx.stroke();
      ctx.globalAlpha=1;
    });
  }

  visibleSeries.forEach((item,seriesIndex)=>{
    const points=pointsBySeries[item.key];
    if(chartType==='bar'){
      const groupWidth=Math.min(42,(width/buckets.length)*.7);
      const barWidth=groupWidth/visibleSeries.length;
      points.forEach((point,index)=>{
        const x=point.x-groupWidth/2+seriesIndex*barWidth;
        ctx.globalAlpha=.88;
        ctx.fillStyle=item.color;
        ctx.fillRect(x+1,point.y,Math.max(1,barWidth-2),bottom-point.y);
        ctx.globalAlpha=1;
        if(item.key==='total'&&buckets.length<=7){
          ctx.fillStyle=textColor;
          ctx.font='10px Manrope, sans-serif';
          ctx.textAlign='center';
          ctx.fillText(String(Math.round(point.value*10)/10),x+barWidth/2,Math.max(padT+9,point.y-5));
        }
      });
      return;
    }
    if(points.length){
      ctx.beginPath();
      points.forEach((point,index)=>index===0?ctx.moveTo(point.x,point.y):ctx.lineTo(point.x,point.y));
      if(chartType==='area'){
        ctx.lineTo(points[points.length-1].x,bottom);
        ctx.lineTo(points[0].x,bottom);
        ctx.closePath();
        ctx.globalAlpha=item.key==='total'?.17:.1;
        ctx.fillStyle=item.color;
        ctx.fill();
        ctx.globalAlpha=1;
        ctx.beginPath();
        points.forEach((point,index)=>index===0?ctx.moveTo(point.x,point.y):ctx.lineTo(point.x,point.y));
      }
      ctx.strokeStyle=item.color;
      ctx.lineWidth=item.key==='total'?2.8:2.3;
      ctx.lineJoin='round';
      ctx.lineCap='round';
      ctx.stroke();
    }
    points.forEach(point=>{
      ctx.beginPath();
      ctx.arc(point.x,point.y,3.4,0,Math.PI*2);
      ctx.fillStyle=item.color;
      ctx.fill();
      if(item.key==='total'&&buckets.length<=7){
        ctx.fillStyle=textColor;
        ctx.font='10px Manrope, sans-serif';
        ctx.textAlign='center';
        ctx.fillText(String(Math.round(point.value*10)/10),point.x,Math.max(padT+9,point.y-9));
      }
    });
  });

  const labelStep=range==='day'?1:Math.max(1,Math.ceil(buckets.length/Math.max(4,Math.floor(width/54))));
  buckets.forEach((bucket,index)=>{
    if(index%labelStep!==0&&index!==buckets.length-1) return;
    const point=pointsBySeries[visibleSeries[0].key][index];
    ctx.fillStyle=labelColor;
    ctx.font='10px Manrope, sans-serif';
    ctx.textAlign=index===0?'left':index===buckets.length-1?'right':'center';
    ctx.fillText(bucket.labelTop,point.x,cssH-20);
    if(bucket.labelBottom) ctx.fillText(bucket.labelBottom,point.x,cssH-7);
  });
  const rangeDescription={day:'the last seven days',week:'the last twelve weeks, grouped by week',month:'the last twelve months, grouped by month',year:'the last five years, grouped by year'}[range];
  const typeDescription={line:'line graph',area:'area graph',bar:'bar graph'}[chartType];
  const waterDescription=waterType==='all'?'all water types':waterType;
  canvas.setAttribute('aria-label',`${typeDescription} of ${waterDescription} gallons delivered for ${rangeDescription}.`);
}
document.getElementById('deliveryVolumeRange').addEventListener('change',drawChart);
document.getElementById('deliveryVolumeWaterType').addEventListener('change',drawChart);
document.querySelectorAll('[data-volume-chart-type]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-volume-chart-type]').forEach(chartButton=>{
    const isActive=chartButton===button;
    chartButton.classList.toggle('is-active',isActive);
    chartButton.setAttribute('aria-pressed',String(isActive));
  });
  drawChart();
}));
document.addEventListener('tubipure-theme-change', drawChart);
window.addEventListener('resize',drawChart);

/* ---------------- CUSTOMERS ---------------- */
function initials(name){ return name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase(); }
function positionRecordActionsMenu(menu){
  if(!menu.open) return;
  const summary=menu.querySelector('summary');
  const panel=menu.querySelector('.record-actions-menu-panel');
  if(!summary||!panel) return;
  const anchor=summary.getBoundingClientRect();
  const bounds=panel.getBoundingClientRect();
  const left=Math.max(8,Math.min(anchor.right-bounds.width,window.innerWidth-bounds.width-8));
  const below=anchor.bottom+5+bounds.height<=window.innerHeight-8;
  const top=below?anchor.bottom+5:Math.max(8,anchor.top-bounds.height-5);
  panel.style.left=`${left}px`;
  panel.style.top=`${top}px`;
}
function prepareRecordActionsMenus(container){
  container.querySelectorAll('.record-actions-menu').forEach(menu=>{
    menu.addEventListener('toggle',()=>positionRecordActionsMenu(menu));
  });
}
function repositionOpenRecordActionsMenus(){
  document.querySelectorAll('.record-actions-menu[open]').forEach(positionRecordActionsMenu);
}
document.addEventListener('scroll',repositionOpenRecordActionsMenus,true);
window.addEventListener('resize',repositionOpenRecordActionsMenus);
function statusTag(status){
  const map = {'Pending':'tag-pending','Confirmed':'tag-confirmed','Approved':'tag-confirmed','Out for Delivery':'tag-transit','Ready for pickup':'tag-transit','Delivered':'tag-delivered','Delayed':'tag-delayed','Cancelled':'tag-cancelled','Rejected':'tag-cancelled'};
  return `<span class="tag ${map[status]||'tag-pending'}">${escapeHtml(status)}</span>`;
}
function displayOrderStatus(order){
  if(order.status==='Cancelled'&&order.statusNote) return 'Rejected';
  if(order.fulfillmentMethod==='pickup'&&order.status==='Out for Delivery') return 'Ready for pickup';
  return order.status;
}
function getOrderMapDestination(order){
  if(order.fulfillmentMethod==='pickup'){
    return `${COMPANY_LOCATION.latitude},${COMPANY_LOCATION.longitude}`;
  }
  const latitude=order.deliveryLatitude;
  const longitude=order.deliveryLongitude;
  if(latitude!==null&&latitude!==undefined&&String(latitude).trim()!==''
    &&longitude!==null&&longitude!==undefined&&String(longitude).trim()!==''){
    const parsedLatitude=Number(latitude);
    const parsedLongitude=Number(longitude);
    if(Number.isFinite(parsedLatitude)&&Number.isFinite(parsedLongitude)
      &&parsedLatitude>=-90&&parsedLatitude<=90&&parsedLongitude>=-180&&parsedLongitude<=180){
      return `${parsedLatitude},${parsedLongitude}`;
    }
  }
  return String(order.deliveryAddress||order.address||order.customer?.address||'').trim();
}
function orderMapLinks(order){
  const orderId=escapeHtml(String(order.id));
  return `<button class="orders-row-button orders-map-link" type="button" data-order-map="location" data-order-id="${orderId}" aria-label="View location for order ${orderId}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>View location</button><button class="orders-row-button orders-map-link" type="button" data-order-map="directions" data-order-id="${orderId}" aria-label="Generate directions for order ${orderId}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 12 4l8 8-8 8-8-8Z"/><path d="M8 12h8M13 9l3 3-3 3"/></svg>Get directions</button>`;
}
function orderMapMenuLinks(order){
  const orderId=escapeHtml(String(order.id));
  return `<button class="orders-row-button orders-map-link" type="button" data-order-map="location" data-order-id="${orderId}" aria-label="View location for order ${orderId}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>View location</button><button class="orders-row-button orders-map-link" type="button" data-order-map="directions" data-order-id="${orderId}" aria-label="Generate directions for order ${orderId}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 12 4l8 8-8 8-8-8Z"/><path d="M8 12h8M13 9l3 3-3 3"/></svg>Get directions</button>`;
}
const orderMapDialog=document.getElementById('orderMapDialog');
const orderMapCanvas=document.getElementById('orderMapCanvas');
const orderMapTileLayer=document.getElementById('orderMapTiles');
const orderMapRouteLayer=document.getElementById('orderMapRoute');
const orderMapMarkerLayer=document.getElementById('orderMapMarkers');
const orderMapTiles=new Map();
let orderMapCenter={latitude:COMPANY_LOCATION.latitude,longitude:COMPANY_LOCATION.longitude,zoom:15};
let orderMapRoute=null;
let activeOrderMapOrder=null;
let orderMapRequestId=0;

function orderMapCoordinates(order){
  if(order.fulfillmentMethod==='pickup') return {latitude:COMPANY_LOCATION.latitude,longitude:COMPANY_LOCATION.longitude};
  const rawLatitude=order.deliveryLatitude;
  const rawLongitude=order.deliveryLongitude;
  if(rawLatitude===null||rawLatitude===undefined||String(rawLatitude).trim()===''
    ||rawLongitude===null||rawLongitude===undefined||String(rawLongitude).trim()==='') return null;
  const latitude=Number(rawLatitude);
  const longitude=Number(rawLongitude);
  return Number.isFinite(latitude)&&Number.isFinite(longitude)&&latitude>=-90&&latitude<=90&&longitude>=-180&&longitude<=180
    ? {latitude,longitude}
    : null;
}

function orderMapWorldPoint(latitude,longitude,zoom){
  const size=256*2**zoom;
  const radians=Math.max(-85.0511,Math.min(85.0511,latitude))*Math.PI/180;
  return {x:((longitude+180)/360)*size,y:(0.5-Math.log((1+Math.sin(radians))/(1-Math.sin(radians)))/(4*Math.PI))*size};
}

function fitOrderMap(points){
  if(points.length===1){orderMapCenter={...points[0],zoom:16};return;}
  const bounds=points.reduce((result,point)=>({minLatitude:Math.min(result.minLatitude,point.latitude),maxLatitude:Math.max(result.maxLatitude,point.latitude),minLongitude:Math.min(result.minLongitude,point.longitude),maxLongitude:Math.max(result.maxLongitude,point.longitude)}),{minLatitude:Infinity,maxLatitude:-Infinity,minLongitude:Infinity,maxLongitude:-Infinity});
  const width=Math.max(120,orderMapCanvas.clientWidth-100);
  const height=Math.max(120,orderMapCanvas.clientHeight-90);
  let zoom=3;
  for(let candidate=3;candidate<=18;candidate+=1){
    const northwest=orderMapWorldPoint(bounds.maxLatitude,bounds.minLongitude,candidate);
    const southeast=orderMapWorldPoint(bounds.minLatitude,bounds.maxLongitude,candidate);
    if(southeast.x-northwest.x<=width&&southeast.y-northwest.y<=height) zoom=candidate;
    else break;
  }
  const northwest=orderMapWorldPoint(bounds.maxLatitude,bounds.minLongitude,zoom);
  const southeast=orderMapWorldPoint(bounds.minLatitude,bounds.maxLongitude,zoom);
  const midpoint={x:(northwest.x+southeast.x)/2,y:(northwest.y+southeast.y)/2};
  const size=256*2**zoom;
  orderMapCenter={latitude:Math.atan(Math.sinh(Math.PI*(1-(2*midpoint.y)/size)))*180/Math.PI,longitude:midpoint.x/size*360-180,zoom};
}

function renderOrderMap(){
  const bounds=orderMapCanvas.getBoundingClientRect();
  if(!bounds.width||!bounds.height) return;
  const world=orderMapWorldPoint(orderMapCenter.latitude,orderMapCenter.longitude,orderMapCenter.zoom);
  const left=world.x-bounds.width/2;
  const top=world.y-bounds.height/2;
  const limit=2**orderMapCenter.zoom;
  const retained=new Set();
  for(let y=Math.max(0,Math.floor(top/256)-1);y<=Math.min(limit-1,Math.floor((top+bounds.height)/256)+1);y+=1){
    for(let x=Math.floor(left/256)-1;x<=Math.floor((left+bounds.width)/256)+1;x+=1){
      const wrappedX=((x%limit)+limit)%limit;
      const key=`${orderMapCenter.zoom}/${x}/${y}`;
      let tile=orderMapTiles.get(key);
      if(!tile){
        tile=document.createElement('img');
        tile.className='order-map-tile';
        tile.alt='';
        tile.draggable=false;
        tile.decoding='async';
        tile.src=`https://tile.openstreetmap.org/${orderMapCenter.zoom}/${wrappedX}/${y}.png`;
        orderMapTiles.set(key,tile);
        orderMapTileLayer.append(tile);
      }
      tile.style.left=`${x*256-left}px`;
      tile.style.top=`${y*256-top}px`;
      retained.add(key);
    }
  }
  for(const [key,tile] of orderMapTiles){if(!retained.has(key)){tile.remove();orderMapTiles.delete(key);}}
  if(orderMapRoute){
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    const routePoints=orderMapRoute.geometry.coordinates.map(([longitude,latitude])=>{
      const point=orderMapWorldPoint(latitude,longitude,orderMapCenter.zoom);
      return [point.x-left,point.y-top];
    });
    path.setAttribute('d',routePoints.map(([x,y],index)=>`${index?'L':'M'} ${x} ${y}`).join(' '));
    orderMapRouteLayer.setAttribute('viewBox',`0 0 ${bounds.width} ${bounds.height}`);
    orderMapRouteLayer.replaceChildren(path);
  }else{orderMapRouteLayer.replaceChildren();}
  const destination=orderMapCoordinates(activeOrderMapOrder);
  const markers=[];
  if(destination){
    const point=orderMapWorldPoint(destination.latitude,destination.longitude,orderMapCenter.zoom);
    const marker=document.createElement('span');
    marker.className='order-map-marker order-map-marker-destination';
    marker.style.left=`${point.x-left}px`;
    marker.style.top=`${point.y-top}px`;
    marker.title=activeOrderMapOrder.fulfillmentMethod==='pickup'?'TubiPure pickup station':'Customer delivery address';
    marker.innerHTML='<svg viewBox="0 0 24 32" aria-hidden="true"><path d="M12 31S2 19.3 2 12a10 10 0 1 1 20 0c0 7.3-10 19-10 19Z" fill="currentColor"/><circle cx="12" cy="12" r="4" fill="white"/></svg>';
    markers.push(marker);
  }
  if(orderMapRoute){
    const start=orderMapWorldPoint(COMPANY_LOCATION.latitude,COMPANY_LOCATION.longitude,orderMapCenter.zoom);
    const marker=document.createElement('span');
    marker.className='order-map-marker order-map-marker-start';
    marker.style.left=`${start.x-left}px`;
    marker.style.top=`${start.y-top}px`;
    marker.title='TubiPure Water Refilling Station';
    markers.push(marker);
  }
  orderMapMarkerLayer.replaceChildren(...markers);
}

async function showOrderMap(order,mode){
  const requestId=++orderMapRequestId;
  activeOrderMapOrder=order;
  orderMapRoute=null;
  orderMapTiles.clear();
  orderMapTileLayer.replaceChildren();
  orderMapRouteLayer.replaceChildren();
  orderMapMarkerLayer.replaceChildren();
  const address=order.fulfillmentMethod==='pickup'?'TubiPure Water Refilling Station':String(order.deliveryAddress||order.address||order.customer?.address||'Delivery address');
  const coordinates=orderMapCoordinates(order);
  document.getElementById('orderMapEyebrow').textContent=mode==='directions'?'ORDER DIRECTIONS':'ORDER LOCATION';
  document.getElementById('orderMapTitle').textContent=mode==='directions'?'Directions to order':'Order location';
  document.getElementById('orderMapAddress').textContent=address;
  document.getElementById('orderMapSummary').hidden=true;
  const feedback=document.getElementById('orderMapFeedback');
  feedback.textContent=coordinates?'Map data © OpenStreetMap contributors.':`A map pin is not saved for this delivery address. Edit the customer's saved address to add its map location.`;
  if(!orderMapDialog.open) orderMapDialog.showModal();
  await new Promise(resolve=>requestAnimationFrame(resolve));
  if(requestId!==orderMapRequestId) return;
  if(!coordinates){
    return;
  }
  if(mode==='directions'&&order.fulfillmentMethod!=='pickup'){
    feedback.textContent='Calculating driving directions from TubiPure…';
    try{
      const url=`https://router.project-osrm.org/route/v1/driving/${COMPANY_LOCATION.longitude},${COMPANY_LOCATION.latitude};${coordinates.longitude},${coordinates.latitude}?overview=full&geometries=geojson&steps=false`;
      const response=await fetch(url,{headers:{Accept:'application/json'}});
      if(!response.ok) throw new Error('Directions are temporarily unavailable. Try again shortly.');
      const result=await response.json();
      if(requestId!==orderMapRequestId) return;
      const route=result.routes?.[0];
      if(result.code!=='Ok'||!route) throw new Error('No driving route was found for this order.');
      orderMapRoute=route;
      fitOrderMap(route.geometry.coordinates.map(([longitude,latitude])=>({latitude,longitude})));
      const summary=document.getElementById('orderMapSummary');
      const distance=route.distance>=1000?`${(route.distance/1000).toFixed(1)} km`:`${Math.round(route.distance)} m`;
      const minutes=Math.max(1,Math.round(route.duration/60));
      const duration=minutes>=60?`${Math.floor(minutes/60)} hr ${minutes%60} min`:`${minutes} min`;
      summary.textContent=`${distance} · about ${duration} by car`;
      summary.hidden=false;
      feedback.textContent='Route from the TubiPure station to this delivery address.';
    }catch(error){
      if(requestId!==orderMapRequestId) return;
      orderMapRoute={geometry:{coordinates:[[COMPANY_LOCATION.longitude,COMPANY_LOCATION.latitude],[coordinates.longitude,coordinates.latitude]]}};
      fitOrderMap([coordinates,{latitude:COMPANY_LOCATION.latitude,longitude:COMPANY_LOCATION.longitude}]);
      const distance=distanceInKilometers(coordinates.latitude,coordinates.longitude,COMPANY_LOCATION.latitude,COMPANY_LOCATION.longitude);
      const summary=document.getElementById('orderMapSummary');
      summary.textContent=`${distance.toFixed(2)} km straight-line distance · road route unavailable`;
      summary.hidden=false;
      feedback.textContent=`${error.message||'Directions could not be loaded.'} Showing both saved locations.`;
    }
  }else{
    fitOrderMap([coordinates]);
    feedback.textContent=mode==='directions'?'Pickup orders are collected at the TubiPure station.':'Showing the saved order location.';
  }
  renderOrderMap();
}

document.addEventListener('click',event=>{
  const mapButton=event.target.closest('[data-order-map]');
  if(mapButton){
    const order=deliveries.find(item=>String(item.id)===mapButton.dataset.orderId);
    if(order) showOrderMap(order,mapButton.dataset.orderMap);
  }
});
function closeOrdersRowOverflowMenus(returnFocus=false){
  document.querySelectorAll('.orders-row-overflow-menu:not([hidden])').forEach(menu=>{
    menu.hidden=true;
    const toggle=menu.parentElement.querySelector('[data-orders-overflow-toggle]');
    toggle?.setAttribute('aria-expanded','false');
    if(returnFocus) toggle?.focus();
  });
}
document.addEventListener('click',event=>{
  const toggle=event.target.closest('[data-orders-overflow-toggle]');
  if(toggle){
    const menu=toggle.parentElement.querySelector('.orders-row-overflow-menu');
    const shouldOpen=menu.hidden;
    closeOrdersRowOverflowMenus();
    if(shouldOpen){
      menu.hidden=false;
      toggle.setAttribute('aria-expanded','true');
    }
    return;
  }
  const menu=event.target.closest('.orders-row-overflow-menu');
  if(menu){
    menu.hidden=true;
    menu.parentElement.querySelector('[data-orders-overflow-toggle]')?.setAttribute('aria-expanded','false');
    return;
  }
  closeOrdersRowOverflowMenus();
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape') closeOrdersRowOverflowMenus(true);
});
document.getElementById('closeOrderMap').addEventListener('click',()=>{orderMapRequestId+=1;orderMapDialog.close();});
orderMapDialog.addEventListener('click',event=>{if(event.target===orderMapDialog){orderMapRequestId+=1;orderMapDialog.close();}});
window.addEventListener('resize',()=>{if(orderMapDialog.open&&orderMapCoordinates(activeOrderMapOrder)) renderOrderMap();});
function adminStatusTag(status){
  return statusTag(status==='Cancelled'?'Rejected':status);
}

let customerPage=1;
const customerPageSize=10;
let customerFilter='all';
let selectedCustomerId=null;
let customerDetailTab='overview';

function isCustomerNewThisMonth(customer){
  if(!customer.createdAt) return false;
  return localDateString(new Date(customer.createdAt)).slice(0,7)===todayStr.slice(0,7);
}

function customerLastOrderLabel(customer){
  return customer.lastOrderDate?formatDeliveryDate(customer.lastOrderDate):'—';
}

function renderCustomerMetrics(){
  const visibleCustomers=customers.filter(customer=>!customer.isArchived);
  const metrics=[
    {label:'Total customers',value:visibleCustomers.length,tone:'blue',icon:'<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0m3-12a3 3 0 0 1 0 6m0 2a5 5 0 0 1 3 4"/>'},
    {label:'Active customers',value:visibleCustomers.filter(customer=>customer.isActive).length,tone:'green',icon:'<circle cx="12" cy="7" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2z"/>'},
    {label:'New this month',value:visibleCustomers.filter(isCustomerNewThisMonth).length,tone:'purple',icon:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm11 2v6m-3-3h6"/>'},
    {label:'With pending orders',value:visibleCustomers.filter(customer=>customer.pendingOrderCount>0).length,tone:'amber',icon:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'}
  ];
  document.getElementById('customerKpiGrid').innerHTML=metrics.map(metric=>`
    <article class="kpi customer-kpi customer-kpi-${metric.tone}">
      <span class="kicon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${metric.icon}</svg></span>
      <strong class="kval">${metric.value}</strong><span class="klbl">${escapeHtml(metric.label)}</span>
      <svg class="customer-kpi-watermark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${metric.icon}</svg>
    </article>`).join('');
}

function renderCustomers(){
  renderCustomerMetrics();
  const query=document.getElementById('custSearch').value.trim().toLowerCase();
  const sortMode=document.getElementById('custSort').value;
  const visibleCustomers=customers.filter(customer=>!customer.isArchived);
  const matching=visibleCustomers.filter(customer=>{
    const matchesQuery=[customer.name,customer.address,customer.contact].some(value=>String(value||'').toLowerCase().includes(query));
    const matchesFilter=customerFilter==='all'
      || (customerFilter==='active'&&customer.isActive)
      || (customerFilter==='pending'&&customer.pendingOrderCount>0)
      || (customerFilter==='inactive'&&(!customer.lastOrderDate||!isWithinDays(customer.lastOrderDate,30)));
    return matchesQuery&&matchesFilter;
  });
  matching.sort((first,second)=>{
    if(sortMode==='orders') return (second.orderCount||0)-(first.orderCount||0)||first.name.localeCompare(second.name);
    if(sortMode==='last-order') return String(second.lastOrderDate||'').localeCompare(String(first.lastOrderDate||''))||first.name.localeCompare(second.name);
    return first.name.localeCompare(second.name);
  });

  const totalPages=Math.max(1,Math.ceil(matching.length/customerPageSize));
  customerPage=Math.min(customerPage,totalPages);
  const start=(customerPage-1)*customerPageSize;
  const list=matching.slice(start,start+customerPageSize);
  const tbody=document.getElementById('custTableBody');
  const empty=document.getElementById('custEmpty');
  empty.hidden=matching.length>0;
  tbody.innerHTML=list.map(customer=>{
    const status=customer.isActive?'Active':'Inactive';
    const address=customer.address||'—';
    return `<tr data-id="${customer.id}" class="${String(customer.id)===String(selectedCustomerId)?'is-selected':''}" aria-selected="${String(customer.id)===String(selectedCustomerId)}">
      <td><div class="name-cell"><span class="avatar">${escapeHtml(initials(customer.name))}</span>${escapeHtml(customer.name)}</div></td>
      <td class="customer-address-cell"><span title="${escapeHtml(address)}">${escapeHtml(address)}</span></td>
      <td>${escapeHtml(customer.contact||'—')}</td>
      <td>${customer.orderCount||0}</td>
      <td>${escapeHtml(customerLastOrderLabel(customer))}</td>
      <td><span class="customer-status ${customer.isActive?'is-active':'is-inactive'}">${status}</span></td>
      <td><div class="row-actions"><details class="record-actions-menu">
        <summary aria-label="More actions for ${escapeHtml(customer.name)}" title="Customer actions"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg></summary>
        <div class="record-actions-menu-panel"><button type="button" data-edit-customer="${customer.id}">Edit</button><button class="record-action-delete" type="button" data-remove-customer-record="${customer.id}">Remove from records</button></div>
      </details></div></td>
    </tr>`;
  }).join('');

  document.getElementById('customerPageSummary').textContent=matching.length
    ? `Showing ${start+1} to ${Math.min(start+customerPageSize,matching.length)} of ${matching.length} customers`
    : 'Showing 0 customers';
  renderCustomerPagination(totalPages,matching.length);
  prepareRecordActionsMenus(tbody);
  tbody.querySelectorAll('tr').forEach(row=>row.addEventListener('click',event=>{
    if(event.target.closest('.record-actions-menu')) return;
    openDetail(row.dataset.id);
  }));
  tbody.querySelectorAll('[data-edit-customer]').forEach(button=>button.addEventListener('click',event=>{
    event.stopPropagation();
    button.closest('.record-actions-menu').open=false;
    openCustomerForm(button.dataset.editCustomer);
  }));
  tbody.querySelectorAll('[data-remove-customer-record]').forEach(button=>button.addEventListener('click',event=>{
    event.stopPropagation();
    button.closest('.record-actions-menu').open=false;
    const customer=customers.find(item=>String(item.id)===button.dataset.removeCustomerRecord);
    if(customer) openAdminActionDialog('customer-record-remove',customer.id,customer.name);
  }));

  if(selectedCustomerId&&matching.some(customer=>String(customer.id)===String(selectedCustomerId))){
    renderCustomerDetail(selectedCustomerId);
  }else{
    selectedCustomerId=null;
    document.getElementById('customerDetailPanel').hidden=true;
    document.querySelector('.customer-records-layout').classList.add('is-detail-closed');
  }
}

function renderCustomerPagination(totalPages,totalCustomers){
  const pagination=document.getElementById('customerPagination');
  if(totalCustomers<=customerPageSize){pagination.innerHTML='';return;}
  const pages=Array.from({length:totalPages},(_,index)=>index+1);
  pagination.innerHTML=`<button type="button" data-customer-page="${Math.max(1,customerPage-1)}" aria-label="Previous page" ${customerPage===1?'disabled':''}>‹</button>${pages.map(page=>`<button type="button" data-customer-page="${page}" class="${page===customerPage?'active':''}" aria-current="${page===customerPage?'page':'false'}">${page}</button>`).join('')}<button type="button" data-customer-page="${Math.min(totalPages,customerPage+1)}" aria-label="Next page" ${customerPage===totalPages?'disabled':''}>›</button>`;
  pagination.querySelectorAll('[data-customer-page]').forEach(button=>button.addEventListener('click',()=>{
    customerPage=Number(button.dataset.customerPage);
    renderCustomers();
  }));
}

function renderCustomersSelectionOnly(){
  document.querySelectorAll('#custTableBody tr').forEach(row=>{
    const selected=String(row.dataset.id)===String(selectedCustomerId);
    row.classList.toggle('is-selected',selected);
    row.setAttribute('aria-selected',String(selected));
  });
}

async function renderUsers(){
  const tbody=document.getElementById('usersTableBody');
  const empty=document.getElementById('usersEmpty');
  const feedback=document.getElementById('usersFeedback');
  feedback.hidden=true;
  empty.hidden=true;
  tbody.innerHTML='<tr><td colspan="4">Loading registered users…</td></tr>';
  try{
    const result=await api('/staff/users');
    registeredUsers=result.data||[];
    markNewUsersAsSeen();
    updateNewUserCount(registeredUsers);
    renderUserRows();
  }catch(error){
    tbody.replaceChildren();
    feedback.textContent=error.message||'Users could not be loaded.';
    feedback.hidden=false;
  }
}

function renderUserRows(){
  renderUsersSummary();
  const query=document.getElementById('usersSearch').value.trim().toLowerCase();
  const statusFilter=document.getElementById('usersStatusFilter').value;
  const sortMode=document.getElementById('usersSort').value;
  const filteredUsers=registeredUsers.filter(user=>{
    const matchesQuery=[user.name,user.email,user.contact].some(value=>String(value||'').toLowerCase().includes(query));
    const matchesStatus=statusFilter==='all'||(user.status||'Active')===statusFilter;
    return matchesQuery&&matchesStatus;
  });
  filteredUsers.sort((first,second)=>{
    if(sortMode==='name') return String(first.name||'').localeCompare(String(second.name||''));
    const firstJoined=Date.parse(first.joinedAt||'')||0;
    const secondJoined=Date.parse(second.joinedAt||'')||0;
    return sortMode==='oldest'?firstJoined-secondJoined:secondJoined-firstJoined;
  });
  const tbody=document.getElementById('usersTableBody');
  document.getElementById('usersEmpty').hidden=filteredUsers.length>0;
  tbody.innerHTML=filteredUsers.map(user=>{
    const joined=user.joinedAt?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:siteTimezone}).format(new Date(user.joinedAt)):'—';
    const status=user.status||'Active';
    const initialsText=escapeHtml(initials(user.name||'User'));
    return `<tr><td><div class="users-name-cell"><span class="users-avatar">${initialsText}</span><span>${escapeHtml(user.name||'—')}</span></div></td><td>${escapeHtml(user.contact||'—')}</td><td>${escapeHtml(joined)}</td><td><span class="users-status is-${status.toLowerCase()}">${escapeHtml(status)}</span></td></tr>`;
  }).join('');
  document.getElementById('usersPageSummary').textContent=filteredUsers.length
    ? `Showing 1 to ${filteredUsers.length} of ${filteredUsers.length} users`
    : 'Showing 0 users';
}

function renderUsersSummary(){
  const total=registeredUsers.length;
  const active=registeredUsers.filter(user=>(user.status||'Active').toLowerCase()==='active').length;
  const disabled=registeredUsers.filter(user=>(user.status||'Active').toLowerCase()==='disabled').length;
  const now=new Date();
  const newThisMonth=registeredUsers.filter(user=>{
    if(!user.joinedAt) return false;
    const joinedAt=new Date(user.joinedAt);
    return !Number.isNaN(joinedAt.getTime())&&joinedAt.getFullYear()===now.getFullYear()&&joinedAt.getMonth()===now.getMonth();
  }).length;
  const stats={
    total:{count:total,share:total?100:0},
    active:{count:active,share:total?Math.round(active/total*100):0},
    newMonth:{count:newThisMonth,share:total?Math.round(newThisMonth/total*100):0},
    disabled:{count:disabled,share:total?Math.round(disabled/total*100):0}
  };
  document.getElementById('usersTotalCount').textContent=stats.total.count;
  document.getElementById('usersActiveCount').textContent=stats.active.count;
  document.getElementById('usersNewMonthCount').textContent=stats.newMonth.count;
  document.getElementById('usersDisabledCount').textContent=stats.disabled.count;
  document.getElementById('usersTotalShare').textContent=`${stats.total.share}%`;
  document.getElementById('usersActiveShare').textContent=`${stats.active.share}%`;
  document.getElementById('usersNewMonthShare').textContent=`${stats.newMonth.share}%`;
  document.getElementById('usersDisabledShare').textContent=`${stats.disabled.share}%`;
}

document.getElementById('usersSearch').addEventListener('input',renderUserRows);
document.getElementById('usersStatusFilter').addEventListener('change',renderUserRows);
document.getElementById('usersSort').addEventListener('change',renderUserRows);

let pendingAdminAction=null;
const adminActionDialog=document.getElementById('adminActionDialog');
function openAdminActionDialog(type,id,label){
  pendingAdminAction={type,id};
  const isCustomerRecordRemove=type==='customer-record-remove';
  const isOrderHistoryDelete=type==='delivery-history-delete';
  const isOrderReject=type==='delivery-cancel';
  const isOrderCancellation=type==='delivery-cancel-approved';
  const isDeliveryConfirmation=type==='delivery-out-for-delivery';
  const isPickupConfirmation=isDeliveryConfirmation&&deliveries.find(delivery=>String(delivery.id)===String(id))?.fulfillmentMethod==='pickup';
  const reasonField=document.getElementById('adminActionReasonField');
  const reasonInput=document.getElementById('adminActionReason');
  const requiresOrderReason=isOrderReject||isOrderCancellation;
  reasonField.hidden=!requiresOrderReason;
  reasonField.querySelector('label').textContent=isOrderCancellation?'Reason for cancellation':'Reason for rejection';
  reasonInput.required=requiresOrderReason;
  reasonInput.placeholder=isOrderCancellation?'Tell the customer why this order is being cancelled.':'Tell the customer why this order is being rejected.';
  reasonInput.value='';
  document.getElementById('adminActionEyebrow').textContent=isCustomerRecordRemove?'Customer record':isOrderHistoryDelete?'Order history':'Order';
  document.getElementById('adminActionTitle').textContent=isCustomerRecordRemove
    ? 'Remove this customer from records?'
    : isOrderHistoryDelete?'Delete this order from history?'
    : isDeliveryConfirmation?(isPickupConfirmation?'Mark this order ready for pickup?':'Send this order out for delivery?')
      : isOrderCancellation?'Cancel this order?':'Reject this order?';
  document.getElementById('adminActionDescription').textContent=isCustomerRecordRemove
    ? 'The customer will be hidden from Customer Records. Their registered login, order history, and saved addresses will be kept.'
    : isOrderHistoryDelete?'This permanently deletes the selected historical order and removes it from the customer’s order history. This action cannot be undone.'
    : isDeliveryConfirmation?(isPickupConfirmation?'Confirm that this order is ready for the customer to pick up. Its status will be updated.':'Confirm that this order is going out for delivery. Its status will be updated.')
      : isOrderCancellation?'This approved order will be cancelled and moved to Customer Records. Enter a reason to continue.'
        :'This order will be marked as rejected and will remain in the order history. Enter a reason to continue.';
  document.getElementById('adminActionRecordName').textContent=label;
  document.getElementById('adminActionConfirmButton').textContent=isCustomerRecordRemove
    ? 'Remove from records'
    : isOrderHistoryDelete?'Delete order'
    : isDeliveryConfirmation?(isPickupConfirmation?'Ready for pickup':'Out for Delivery')
      : isOrderCancellation?'Cancel order':'Reject order';
  document.getElementById('adminActionFeedback').textContent='';
  adminActionDialog.showModal();
}

function closeAdminActionDialog(){
  if(adminActionDialog.open) adminActionDialog.close();
  pendingAdminAction=null;
  document.getElementById('adminActionFeedback').textContent='';
}

document.getElementById('closeAdminActionDialog').addEventListener('click',closeAdminActionDialog);
document.getElementById('keepAdminActionButton').addEventListener('click',closeAdminActionDialog);
adminActionDialog.addEventListener('click',event=>{
  if(event.target===adminActionDialog) closeAdminActionDialog();
});
adminActionDialog.addEventListener('close',()=>{
  pendingAdminAction=null;
  document.getElementById('adminActionFeedback').textContent='';
  document.getElementById('adminActionReason').value='';
});
document.getElementById('adminActionConfirmButton').addEventListener('click',async event=>{
  if(!pendingAdminAction) return;
  const actionId=pendingAdminAction.id;
  const isOrderReject=pendingAdminAction.type==='delivery-cancel';
  const isOrderCancellation=pendingAdminAction.type==='delivery-cancel-approved';
  const isOrderHistoryDelete=pendingAdminAction.type==='delivery-history-delete';
  const reasonInput=document.getElementById('adminActionReason');
  if((isOrderReject||isOrderCancellation)&&!reasonInput.value.trim()){
    document.getElementById('adminActionFeedback').textContent=isOrderCancellation?'Enter a reason for cancelling this order.':'Enter a reason for rejecting this order.';
    reasonInput.focus();
    return;
  }
  const button=event.currentTarget;
  const keepButton=document.getElementById('keepAdminActionButton');
  button.disabled=true;
  keepButton.disabled=true;
  try{
    if(pendingAdminAction.type==='customer-record-remove'){
      await api(`/staff/customers/${pendingAdminAction.id}/archive`,{method:'PATCH',body:'{}'});
      await loadStaffData();
      renderCustomers();
      adminActionDialog.close();
      toast('Customer removed from records','Their registered account remains in Users.');
    }else if(isOrderHistoryDelete){
      await api(`/staff/deliveries/${pendingAdminAction.id}`,{method:'DELETE'});
      await loadStaffData();
      renderOrderHistory();
      renderDashboard();
      adminActionDialog.close();
      toast('Order deleted',`Order #ORD-${actionId} was removed from order history.`);
    }else if(isOrderReject||isOrderCancellation){
      await api(`/staff/deliveries/${pendingAdminAction.id}/cancel`,{method:'PATCH',body:JSON.stringify({reason:reasonInput.value.trim()})});
      await loadStaffData();
      renderDeliveries();
      renderDashboard();
      adminActionDialog.close();
      toast(isOrderCancellation?'Order cancelled':'Order moved to Customer Records',isOrderCancellation?`Order #ORD-${actionId} was cancelled and saved in the customer’s order history.`:`Order #ORD-${actionId} was rejected and saved in the customer’s order history.`);
    }else{
      const order=deliveries.find(delivery=>String(delivery.id)===String(pendingAdminAction.id));
      const isPickup=order?.fulfillmentMethod==='pickup';
      await api(`/staff/deliveries/${pendingAdminAction.id}/status`,{method:'PATCH',body:JSON.stringify({status:'Out for Delivery'})});
      await loadStaffData();
      renderDeliveries();
      renderDashboard();
      adminActionDialog.close();
      toast(isPickup?'Order ready for pickup':'Order is out for delivery',`Order #ORD-${actionId} is now marked ${isPickup?'Ready for pickup':'Out for Delivery'}.`);
    }
  }catch(error){
    document.getElementById('adminActionFeedback').textContent=error.message;
  }finally{
    button.disabled=false;
    keepButton.disabled=false;
  }
});

document.getElementById('custSearch').addEventListener('input',()=>{customerPage=1;renderCustomers();});
document.getElementById('custSort').addEventListener('change',()=>{customerPage=1;renderCustomers();});
document.querySelectorAll('[data-customer-filter]').forEach(button=>button.addEventListener('click',()=>{
  customerFilter=button.dataset.customerFilter;
  customerPage=1;
  document.querySelectorAll('[data-customer-filter]').forEach(pill=>pill.classList.toggle('active',pill===button));
  renderCustomers();
}));
document.getElementById('customerFilterToggle').addEventListener('click',()=>{
  document.querySelector('.customer-filter-pills').classList.toggle('is-emphasized');
});

function openDetail(id){
  selectedCustomerId=id;
  customerDetailTab='overview';
  renderCustomersSelectionOnly();
  renderCustomerDetail(id);
}

function renderCustomerDetail(id){
  const customer=customers.find(item=>String(item.id)===String(id));
  if(!customer) return;
  const panel=document.getElementById('customerDetailPanel');
  const history=customer.history||[];
  const deliveredOrders=history.filter(order=>order.status==='Delivered');
  const deliveredOrderCount=deliveredOrders.length;
  const deliveredGallons=deliveredOrders.reduce((total,order)=>total+(Number(order.gallons)||0),0);
  const deliveredTotalSpent=deliveredOrders.reduce((total,order)=>total+(Number(order.orderTotal)||0),0);
  const latestOrder=history[0]||null;
  const customerSince=customer.createdAt?formatDeliveryDate(localDateString(new Date(customer.createdAt))):'—';
  const status=customer.isActive?'Active':'Inactive';
  let content='';
  if(customerDetailTab==='history'){
    content=history.length?`<div class="customer-history-list">${history.map(order=>`<div class="customer-history-item"><span class="customer-history-date"><b>${escapeHtml(formatDeliveryDate(order.date))}</b><small>${escapeHtml(formatDeliveryOrderTime(order.time))}</small>${order.statusNote?`<small>Rejection reason: ${escapeHtml(order.statusNote)}</small>`:''}</span><span class="customer-history-total">${Number(order.gallons||0)} gal${order.orderTotal!==null&&order.orderTotal!==undefined?` · ₱${Number(order.orderTotal).toFixed(2)}`:''}</span>${adminStatusTag(order.status)}</div>`).join('')}</div>`:'<div class="customer-detail-empty">No order history on record yet.</div>';
  }else{
    content=`<div class="customer-detail-info-card">
      <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM4 7l8 6 8-6"/></svg><span>${escapeHtml(customer.email||'Email not provided')}</span></div>
      <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5h3l1.5 4-2 1.5a15 15 0 0 0 5.9 5.9l1.5-2 4 1.5v3c0 1.1-.9 2-2 2A16 16 0 0 1 4.6 5.5c0-1.1.9-2 2-2Z"/></svg><span>${escapeHtml(customer.contact||'Contact not provided')}</span></div>
      <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg><span>${escapeHtml(customer.address||'Address not provided')}</span></div>
      <div><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18"/></svg><span>${escapeHtml(customerSince)}<small>Date added</small></span></div>
    </div>
    <div class="customer-detail-stats"><div><b>${deliveredOrderCount}</b><span>Total orders</span></div><div><b>${deliveredGallons}</b><span>Total gallons</span></div><div><b>₱${deliveredTotalSpent.toFixed(0)}</b><span>Total spent</span></div></div>
    <div class="customer-last-order"><strong>Last order</strong>${latestOrder?`<div><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18"/></svg><span>${escapeHtml(formatDeliveryDate(latestOrder.date))}<small>${Number(latestOrder.gallons||0)} gallons${latestOrder.orderTotal!==null&&latestOrder.orderTotal!==undefined?` · ₱${Number(latestOrder.orderTotal).toFixed(2)}`:''}</small></span>${adminStatusTag(latestOrder.status)}</div>`:'<p>No orders yet.</p>'}</div>
    `;
  }
  panel.innerHTML=`<button class="customer-detail-close" id="customerDetailClose" type="button" aria-label="Close customer details">×</button>
    <div class="customer-detail-heading"><span class="customer-detail-avatar">${escapeHtml(initials(customer.name))}</span><div><div class="customer-detail-name-row"><h2>${escapeHtml(customer.name)}</h2><span class="customer-status ${customer.isActive?'is-active':'is-inactive'}">${status}</span></div><p>Customer since ${escapeHtml(customerSince)}</p></div></div>
    <div class="customer-detail-tabs" role="tablist" aria-label="Customer details"><button type="button" role="tab" aria-selected="${customerDetailTab==='overview'}" class="${customerDetailTab==='overview'?'active':''}" data-customer-detail-tab="overview">Overview</button><button type="button" role="tab" aria-selected="${customerDetailTab==='history'}" class="${customerDetailTab==='history'?'active':''}" data-customer-detail-tab="history">Order history</button></div>
    <div class="customer-detail-body">${content}</div>`;
  panel.hidden=false;
  panel.closest('.customer-records-layout').classList.remove('is-detail-closed');
  panel.querySelector('#customerDetailClose').addEventListener('click',()=>{
    panel.hidden=true;
    panel.closest('.customer-records-layout').classList.add('is-detail-closed');
    selectedCustomerId=null;
    renderCustomersSelectionOnly();
  });
  panel.querySelectorAll('[data-customer-detail-tab]').forEach(button=>button.addEventListener('click',()=>{
    customerDetailTab=button.dataset.customerDetailTab;
    renderCustomerDetail(customer.id);
  }));
}

/* customer add/edit form */
function openCustomerForm(id){
  clearErrors('customerModal');
  const isEdit = !!id;
  document.getElementById('custModalTitle').textContent = isEdit ? 'Edit customer' : 'Add new customer';
  const c = isEdit ? customers.find(x=>String(x.id)===String(id)) : {id:'',name:'',address:'',contact:''};
  document.getElementById('custId').value = c.id;
  document.getElementById('custName').value = c.name;
  document.getElementById('custAddress').value = c.address;
  document.getElementById('custContact').value = c.contact;
  openModal('customerModal');
}
document.getElementById('saveCustomerBtn').addEventListener('click', async ()=>{
  clearErrors('customerModal');
  const name = document.getElementById('custName').value.trim();
  const address = document.getElementById('custAddress').value.trim();
  const contact = document.getElementById('custContact').value.trim();
  let valid = true;
  if(!name){ markInvalid('fld-custName'); valid=false; }
  if(!address){ markInvalid('fld-custAddress'); valid=false; }
  if(!/^0\d{10}$/.test(contact)){ markInvalid('fld-custContact'); valid=false; }
  if(!valid) return;

  const id = document.getElementById('custId').value;
  const saveButton = document.getElementById('saveCustomerBtn');
  saveButton.disabled=true;
  try{
    await api(id?`/staff/customers/${id}`:'/staff/customers',{method:id?'PUT':'POST',body:JSON.stringify({name,address,contact})});
    await loadStaffData();
    closeModal('customerModal');
    renderCustomers();
    toast(id?'Customer updated':'Customer added', name+' was saved successfully.');
  }catch(error){ markServerErrors(error,{name:'fld-custName',address:'fld-custAddress',contact:'fld-custContact'}); toast('Could not save customer',error.message); }
  finally{ saveButton.disabled=false; }
});

function markInvalid(fieldId){ document.getElementById(fieldId).classList.add('invalid'); }
function clearErrors(modalId){ document.getElementById(modalId).querySelectorAll('.form-row').forEach(f=>f.classList.remove('invalid')); }
function markServerErrors(error, fieldMap){
  Object.keys(error.errors||{}).forEach(field=>{
    if(fieldMap[field]) markInvalid(fieldMap[field]);
  });
}

/* ---------------- DELIVERIES ---------------- */
function populateDeliveryCustomerSelect(){
  const sel = document.getElementById('delCustomer');
  sel.replaceChildren(...customers.map(customer=>{
    const option=document.createElement('option');
    option.value=customer.id;
    option.textContent=customer.name;
    return option;
  }));
}
let deliveryPage=1;
const deliveryPageSize=5;
function deliveryOrderDate(delivery){
  if(!delivery.createdAt) return delivery.date;
  const createdDate=new Date(delivery.createdAt);
  return Number.isNaN(createdDate.getTime())?delivery.date:localDateString(createdDate);
}
function formatDeliveryDate(dateValue){
  if(!dateValue) return '—';
  const date=new Date(`${dateValue}T12:00:00`);
  return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:siteTimezone}).format(date);
}
function customerOrderedDate(order){
  const createdAt=order.createdAt?new Date(order.createdAt):null;
  return createdAt&&!Number.isNaN(createdAt.getTime())?localDateString(createdAt):'';
}
function formatDeliveryOrderTime(value){
  return /^\d{1,2}:\d{2}$/.test(String(value||''))?formatTimeWithPeriod(value):String(value||'—');
}
function renderDeliveries(){
  updatePendingOrderCount();
  const filter=document.getElementById('delStatusFilter').value;
  const query=document.getElementById('delOrderSearch').value.trim().toLowerCase();
  const dateFrom=document.getElementById('delDateFrom').value;
  const dateTo=document.getElementById('delDateTo').value;
  const pendingQueue=deliveries.filter(delivery=>delivery.status==='Pending').sort(compareDeliveryArrival);
  const queuePositions=new Map(pendingQueue.map((delivery,index)=>[String(delivery.id),index+1]));
  const nextPendingDeliveryId=pendingQueue[0]?.id;
  const toDeliverQueue=deliveries.filter(delivery=>['Confirmed','Delayed'].includes(delivery.status))
    .sort((first,second)=>first.date.localeCompare(second.date)||compareDeliveryArrival(first,second));
  const toDeliverQueuePositions=new Map(toDeliverQueue.map((delivery,index)=>[String(delivery.id),index+1]));
  const nextToDeliverId=toDeliverQueue[0]?.id;
  const toDeliverCount=toDeliverQueue.length;
  const outForDeliveryCount=deliveries.filter(delivery=>delivery.status==='Out for Delivery').length;
  document.getElementById('ordersTotalCount').textContent=pendingQueue.length;
  document.getElementById('ordersToDeliverCount').textContent=toDeliverCount;
  document.getElementById('ordersOutForDeliveryCount').textContent=outForDeliveryCount;
  document.getElementById('ordersTotalCount').closest('.orders-summary-card').querySelector('.orders-summary-alert').hidden=pendingQueue.length===0;
  document.getElementById('ordersToDeliverCount').closest('.orders-summary-card').querySelector('.orders-summary-alert').hidden=toDeliverCount===0;
  document.getElementById('ordersOutForDeliveryCount').closest('.orders-summary-card').querySelector('.orders-summary-alert').hidden=outForDeliveryCount===0;
  document.getElementById('ordersDeliveredCount').textContent=deliveries.filter(delivery=>delivery.status==='Delivered').length;
  checkUpcomingDeliveryReminders();
  document.querySelectorAll('[data-orders-summary-filter]').forEach(card=>{
    const active=card.dataset.ordersSummaryFilter===filter;
    card.classList.toggle('is-active',active);
    card.setAttribute('aria-pressed',String(active));
  });
  document.getElementById('delStatusFilter').classList.toggle('is-active',filter==='all'||filter==='to-deliver');
  let list=deliveries.filter(delivery=>{
    if((delivery.status==='Cancelled'&&filter!=='Rejected')||(delivery.status==='Delivered'&&filter!=='Delivered')) return false;
    const matchesStatus=filter==='all'
      ||(filter==='to-deliver'?['Confirmed','Delayed'].includes(delivery.status)
        :filter==='Rejected'?delivery.status==='Cancelled'
          :delivery.status===filter);
    const address=delivery.address||delivery.customer?.address||'';
    const contact=delivery.contactPhone||delivery.customer?.contact||'';
    const matchesQuery=!query||[delivery.customer?.name,`ord-${delivery.id}`,delivery.id,address,contact].some(value=>String(value||'').toLowerCase().includes(query));
    const orderDate=deliveryOrderDate(delivery);
    const matchesDate=(!dateFrom||orderDate>=dateFrom)&&(!dateTo||orderDate<=dateTo);
    return matchesStatus&&matchesQuery&&matchesDate;
  });
  list.sort((first,second)=>{
    const firstIsPending=first.status==='Pending';
    const secondIsPending=second.status==='Pending';
    if(firstIsPending!==secondIsPending) return firstIsPending?-1:1;
    if(firstIsPending) return compareDeliveryArrival(first,second);
    return first.date.localeCompare(second.date)||compareDeliveryArrival(first,second);
  });
  if(notificationHighlightOrderId&&Date.now()>=notificationHighlightExpiresAt){
    notificationHighlightOrderId=null;
    notificationHighlightExpiresAt=0;
    notificationHighlightScrollPending=false;
  }
  if(notificationHighlightOrderId){
    const targetIndex=list.findIndex(delivery=>String(delivery.id)===notificationHighlightOrderId);
    if(targetIndex>=0) deliveryPage=Math.floor(targetIndex/deliveryPageSize)+1;
  }
  document.getElementById('ordersQueueStatus').textContent=pendingQueue.length
    ? `${pendingQueue.length} pending customer order${pendingQueue.length===1?'':'s'} · First come, first served`
    : 'No pending customer orders waiting for approval.';
  const pageCount=Math.max(1,Math.ceil(list.length/deliveryPageSize));
  deliveryPage=Math.min(deliveryPage,pageCount);
  const pageItems=list.slice((deliveryPage-1)*deliveryPageSize,deliveryPage*deliveryPageSize);
  const wrap=document.getElementById('deliveryList');
  const emptyState=document.getElementById('delEmpty');
  emptyState.textContent=filter==='Delivered'
    ? 'Delivered orders are also saved in Customer Records.'
    : filter==='Rejected'
      ? 'Rejected orders are saved in Customer Records and removed from Orders.'
    : filter==='all'&&deliveries.some(delivery=>delivery.status==='Delivered')
      ? 'No active orders. Delivered orders are saved in Customer Records.'
      : 'No orders match these filters.';
  emptyState.style.display=list.length?'none':'block';
  wrap.innerHTML=pageItems.map(delivery=>{
    const queuePosition=filter==='to-deliver'
      ? toDeliverQueuePositions.get(String(delivery.id))
      : queuePositions.get(String(delivery.id));
    const isNextInQueue=filter==='to-deliver'
      ? String(delivery.id)===String(nextToDeliverId)
      : queuePosition!==undefined&&String(delivery.id)===String(nextPendingDeliveryId);
    const customerName=delivery.contactName||delivery.customer?.name||'Walk-in customer';
    const initials=customerName.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part.charAt(0).toUpperCase()).join('')||'C';
    const address=delivery.fulfillmentMethod==='pickup'?'TubiPure Water Refilling Station':(delivery.address||delivery.customer?.address||'Address not provided');
    const contactName=delivery.contactName||customerName;
    const contactPhone=delivery.contactPhone||delivery.customer?.contact||'';
    const productTypes=waterTypeNames(delivery).join(' + ')||'Water refill';
    const orderTotal=delivery.orderTotal!==null&&delivery.orderTotal!==undefined?`₱${Number(delivery.orderTotal).toFixed(2)}`:'—';
    const isTerminal=['Delivered','Cancelled'].includes(delivery.status);
    const isPickup=delivery.fulfillmentMethod==='pickup';
    const countdownMinutes=['Confirmed','Out for Delivery','Delayed'].includes(delivery.status)
      ? minutesUntilScheduledDelivery(delivery)
      : null;
    const deliveryCountdown=countdownMinutes===null?'':`<span class="delivery-countdown${countdownMinutes<0?' is-overdue':countdownMinutes<=60?' is-urgent':''}" data-delivery-countdown="${delivery.id}">${escapeHtml(formatDeliveryCountdown(countdownMinutes))}</span>`;
    const deliveryStatusAction=filter==='to-deliver'||filter==='Out for Delivery'
      ? `<button class="orders-row-button orders-row-button-primary" type="button" data-update-delivery="${delivery.id}" data-next-status="${filter==='Out for Delivery'?'Delivered':'Out for Delivery'}">${filter==='Out for Delivery'?(isPickup?'Mark Picked Up':'Mark Delivered'):(isPickup?'Ready for pickup':'Out for Delivery')}</button>`
      : `<select class="orders-row-status-select" data-update-delivery="${delivery.id}" aria-label="Update status for order ${delivery.id}"><option value="" selected disabled>Update status</option><option value="Out for Delivery">${isPickup?'Ready for pickup':'Out for Delivery'}</option><option value="Delivered">${isPickup?'Picked up':'Delivered'}</option></select>`;
    const cancelDeliveryAction=['Confirmed','Delayed','Out for Delivery'].includes(delivery.status)
      ? `<button class="orders-row-button orders-row-button-cancel" type="button" data-cancel-approved="${escapeHtml(String(delivery.id))}">Cancel</button>`
      : '';
    return `<article class="delivery-item orders-delivery-item${isNextInQueue?' is-next-in-queue':''}${isTerminal?' is-terminal':''}" data-id="${delivery.id}">
      <div class="orders-customer-cell">
        <span class="orders-customer-avatar" aria-hidden="true">${escapeHtml(initials)}</span>
        <div class="orders-customer-copy"><strong>${escapeHtml(customerName)}</strong><span>Order #ORD-${escapeHtml(delivery.id)}</span>${contactPhone?`<small>${escapeHtml(contactPhone)}</small>`:''}<small>${escapeHtml(address)}</small>${queuePosition?`<span class="order-queue-position">${isNextInQueue?'Next in line':`#${queuePosition} in line`}</span>`:''}</div>
      </div>
      <div class="orders-product-cell"><span class="orders-product-icon" aria-hidden="true"><img src="/images/water-gallon-icon.png" alt=""></span><div><strong>${escapeHtml(orderProductLabel(delivery))}</strong><span>${escapeHtml(productTypes)}</span><small>Total ${Number(delivery.gallons||0)} gallons · ${escapeHtml(orderTotal)}</small></div></div>
      <div class="orders-schedule-cell"><p><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M16 3v4M8 3v4M3.5 10h17"/></svg><span>Order Date: <strong>${escapeHtml(formatDeliveryDate(deliveryOrderDate(delivery)))}</strong></span></p><p><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h12v11H3zM15 11h4l3 3v4h-7z"/><circle cx="7.5" cy="18" r="2"/><circle cx="18.5" cy="18" r="2"/></svg><span>${delivery.fulfillmentMethod==='pickup'?'Pickup':'Delivery'}: <strong>${escapeHtml(formatDeliveryDate(delivery.date))} · ${escapeHtml(formatDeliveryOrderTime(delivery.time))}</strong></span></p>${deliveryCountdown}</div>
      <div class="orders-actions-cell"><div class="orders-status-row">${statusTag(delivery.status==='Confirmed'?'Approved':displayOrderStatus(delivery))}</div><div class="orders-row-buttons">${isTerminal?'':delivery.status==='Pending'?`<button class="orders-row-button orders-row-button-primary" type="button" data-approve-delivery="${delivery.id}">Approve</button><button class="orders-row-button orders-row-button-cancel" type="button" data-cancel-del="${delivery.id}">Reject</button>`:`${deliveryStatusAction}${cancelDeliveryAction}`}<div class="orders-row-overflow"><button class="orders-row-button orders-row-more" type="button" data-orders-overflow-toggle aria-label="More actions for order ${escapeHtml(String(delivery.id))}" aria-expanded="false" aria-controls="orderActions-${escapeHtml(String(delivery.id))}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button><div class="orders-row-overflow-menu" id="orderActions-${escapeHtml(String(delivery.id))}" hidden><button class="orders-row-button" type="button" data-view-delivery="${escapeHtml(String(delivery.id))}" aria-expanded="false">View Details</button>${orderMapMenuLinks(delivery)}</div></div></div></div>
      <div class="delivery-row-details" data-delivery-details="${delivery.id}" hidden><div><span>Delivery address</span><strong>${escapeHtml(address)}</strong></div><div><span>Contact person</span><strong>${escapeHtml(contactName)}${contactPhone?` · ${escapeHtml(contactPhone)}`:''}</strong></div><div><span>Fulfillment &amp; payment</span><strong>${escapeHtml(delivery.fulfillmentMethod==='pickup'?'Pickup':'Delivery')} · ${escapeHtml(delivery.paymentMethod||'Cash on delivery')}</strong></div><div><span>Delivery instructions</span><strong>${escapeHtml(delivery.deliveryInstructions||'No special instructions')}</strong></div>${delivery.status==='Cancelled'&&delivery.statusNote?`<div><span>Rejection reason</span><strong>${escapeHtml(delivery.statusNote)}</strong></div>`:''}</div>
    </article>`;
  }).join('');
  if(notificationHighlightOrderId){
    const highlightedOrder=Array.from(wrap.children).find(item=>item.dataset.id===notificationHighlightOrderId);
    if(highlightedOrder){
      highlightedOrder.classList.add('is-notification-highlight');
      if(notificationHighlightScrollPending){
        notificationHighlightScrollPending=false;
        requestAnimationFrame(()=>highlightedOrder.scrollIntoView({behavior:'smooth',block:'center'}));
      }
    }
  }
  const firstItem=list.length?(deliveryPage-1)*deliveryPageSize+1:0;
  const lastItem=Math.min(deliveryPage*deliveryPageSize,list.length);
  document.getElementById('ordersPageSummary').textContent=list.length?`Showing ${firstItem}–${lastItem} of ${list.length} orders`:'Showing 0 orders';
  const pagination=document.getElementById('ordersPagination');
  pagination.hidden=pageCount<=1;
  pagination.innerHTML=pageCount<=1?'':`<button type="button" data-page="${deliveryPage-1}" aria-label="Previous page" ${deliveryPage===1?'disabled':''}>‹</button>${Array.from({length:pageCount},(_,index)=>index+1).map(page=>`<button type="button" data-page="${page}" aria-label="Page ${page}" aria-current="${page===deliveryPage?'page':'false'}" class="${page===deliveryPage?'is-current':''}">${page}</button>`).join('')}<button type="button" data-page="${deliveryPage+1}" aria-label="Next page" ${deliveryPage===pageCount?'disabled':''}>›</button>`;
  wrap.querySelectorAll('[data-view-delivery]').forEach(button=>button.addEventListener('click',()=>{
    const details=wrap.querySelector(`[data-delivery-details="${button.dataset.viewDelivery}"]`);
    details.hidden=!details.hidden;
    button.setAttribute('aria-expanded',String(!details.hidden));
    button.textContent=details.hidden?'View Details':'Hide Details';
  }));
  wrap.querySelectorAll('[data-approve-delivery]').forEach(button=>button.addEventListener('click',async()=>{
    const id=button.dataset.approveDelivery;
    const isPickup=deliveries.find(delivery=>String(delivery.id)===String(id))?.fulfillmentMethod==='pickup';
    button.disabled=true;
    try{
      await api(`/staff/deliveries/${id}/status`,{method:'PATCH',body:JSON.stringify({status:'Confirmed'})});
      await loadStaffData();
      document.getElementById('delStatusFilter').value='Pending';
      deliveryPage=1;
      renderDeliveries();
      renderDashboard();
      toast('Order approved',`Order #ORD-${id} remains in Orders and is ready for ${isPickup?'pickup':'delivery'} updates.`);
    }catch(error){
      toast('Could not approve order',error.message);
    }finally{
      button.disabled=false;
    }
  }));
  wrap.querySelectorAll('[data-update-delivery]').forEach(control=>control.addEventListener(control instanceof HTMLSelectElement?'change':'click',async()=>{
    const id=control.dataset.updateDelivery;
    const isStatusSelect=control instanceof HTMLSelectElement;
    const status=isStatusSelect?control.value:control.dataset.nextStatus;
    const isPickup=deliveries.find(delivery=>String(delivery.id)===String(id))?.fulfillmentMethod==='pickup';
    if(!status) return;
    control.disabled=true;
    try{
      await api(`/staff/deliveries/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});
      await loadStaffData();
      renderDeliveries();
      renderDashboard();
      if(status==='Delivered'){
        toast('Order moved to Customer Records',`Order #ORD-${id} was ${isPickup?'picked up':'delivered'}, saved in the customer's order history, and removed from Orders.`);
      }else{
        toast('Order status updated',`Order #ORD-${id} is now ${isPickup?'Ready for pickup':status}.`);
      }
    }catch(error){
      if(isStatusSelect){
        control.value=deliveries.find(item=>String(item.id)===String(id))?.status||'Pending';
      }
      toast('Could not update order status',error.message);
    }finally{
      control.disabled=false;
    }
  }));
  wrap.querySelectorAll('[data-cancel-del]').forEach(button=>button.addEventListener('click',()=>{
    const delivery=deliveries.find(item=>String(item.id)===button.dataset.cancelDel);
    if(delivery) openAdminActionDialog('delivery-cancel',delivery.id,`Order #ORD-${delivery.id} · ${delivery.customer?.name||'Customer'}`);
  }));
  wrap.querySelectorAll('[data-cancel-approved]').forEach(button=>button.addEventListener('click',()=>{
    const delivery=deliveries.find(item=>String(item.id)===button.dataset.cancelApproved);
    if(delivery) openAdminActionDialog('delivery-cancel-approved',delivery.id,`Order #ORD-${delivery.id} · ${delivery.customer?.name||'Customer'}`);
  }));
  pagination.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>{
    if(button.disabled) return;
    deliveryPage=Number(button.dataset.page);
    renderDeliveries();
  }));
  renderNotifications();
}
function compareDeliveryArrival(first,second){
  const firstCreatedAt=Date.parse(first.createdAt||'');
  const secondCreatedAt=Date.parse(second.createdAt||'');
  if(Number.isFinite(firstCreatedAt)&&Number.isFinite(secondCreatedAt)&&firstCreatedAt!==secondCreatedAt){
    return firstCreatedAt-secondCreatedAt;
  }
  return Number(first.id)-Number(second.id);
}
function renderOrderHistory(){
  const query=document.getElementById('orderHistorySearch').value.trim().toLowerCase();
  const statusFilter=document.getElementById('orderHistoryStatusFilter').value;
  const history=deliveries.filter(order=>['Delivered','Cancelled'].includes(order.status));
  const deliveredCount=history.filter(order=>order.status==='Delivered').length;
  const rejectedCount=history.filter(order=>order.status==='Cancelled').length;
  document.getElementById('orderHistoryTotal').textContent=history.length;
  document.getElementById('orderHistoryDelivered').textContent=deliveredCount;
  document.getElementById('orderHistoryRejected').textContent=rejectedCount;

  const matching=history.filter(order=>{
    const matchesStatus=statusFilter==='all'||order.status===statusFilter;
    const address=order.fulfillmentMethod==='pickup'?'TubiPure Water Refilling Station':(order.deliveryAddress||order.address||order.customer?.address||'');
    const searchValues=[order.id,`ORD-${order.id}`,order.customer?.name,order.contactName,order.contactPhone,address,waterTypeNames(order).join(' '),order.statusNote];
    const matchesQuery=!query||searchValues.some(value=>String(value||'').toLowerCase().includes(query));
    return matchesStatus&&matchesQuery;
  }).sort((first,second)=>deliveryOrderDate(second).localeCompare(deliveryOrderDate(first))||Number(second.id)-Number(first.id));

  const list=document.getElementById('orderHistoryList');
  const empty=document.getElementById('orderHistoryEmpty');
  empty.hidden=matching.length>0;
  list.innerHTML=matching.map(order=>{
    const customerName=order.customer?.name||order.contactName||'Customer';
    const address=order.fulfillmentMethod==='pickup'?'TubiPure Water Refilling Station':(order.deliveryAddress||order.address||order.customer?.address||'Address not provided');
    const total=order.orderTotal===null||order.orderTotal===undefined?'—':`₱${Number(order.orderTotal).toFixed(2)}`;
    const fulfillment=order.fulfillmentMethod==='pickup'?'Pickup':'Delivery';
    const status=order.status==='Cancelled'?'Rejected':'Delivered';
    return `<article class="order-history-card" data-order-history-id="${escapeHtml(String(order.id))}">
      <div class="order-history-card-head"><div><span class="order-history-id">ORDER #ORD-${escapeHtml(String(order.id))}</span><h2>${escapeHtml(customerName)}</h2><small>${escapeHtml(formatDeliveryDate(deliveryOrderDate(order)))} · ${escapeHtml(formatDeliveryOrderTime(order.time))}</small></div>${statusTag(status)}</div>
      <div class="order-history-card-grid"><div><span>Water</span><strong>${escapeHtml(orderProductLabel(order))}</strong><small>${escapeHtml(waterTypeNames(order).join(' + ')||'Water refill')} · ${Number(order.gallons||0)} gal</small></div><div><span>Fulfillment</span><strong>${fulfillment}</strong><small>${escapeHtml(address)}</small></div><div><span>Contact</span><strong>${escapeHtml(order.contactName||customerName)}</strong><small>${escapeHtml(order.contactPhone||'No contact number')}</small></div><div><span>Order total</span><strong>${total}</strong><small>${status}${order.statusNote?` · ${escapeHtml(order.statusNote)}`:''}</small></div></div>
      <div class="order-history-card-actions">${orderMapLinks(order)}<button class="orders-row-button orders-row-button-cancel" type="button" data-delete-history-order="${escapeHtml(String(order.id))}" aria-label="Delete order ${escapeHtml(String(order.id))}">Delete order</button></div>
    </article>`;
  }).join('');
  list.querySelectorAll('[data-delete-history-order]').forEach(button=>button.addEventListener('click',()=>{
    const order=history.find(delivery=>String(delivery.id)===String(button.dataset.deleteHistoryOrder));
    if(order){
      openAdminActionDialog('delivery-history-delete',order.id,`Order #ORD-${order.id} · ${order.customer?.name||order.contactName||'Customer'}`);
    }
  }));
  document.getElementById('orderHistoryCount').textContent=`Showing ${matching.length} of ${history.length} historical ${history.length===1?'order':'orders'}`;
}
document.getElementById('orderHistorySearch').addEventListener('input',renderOrderHistory);
document.getElementById('orderHistoryStatusFilter').addEventListener('change',renderOrderHistory);
document.getElementById('delStatusFilter').addEventListener('change',()=>{deliveryPage=1;renderDeliveries();});
document.getElementById('delOrderSearch').addEventListener('input',()=>{deliveryPage=1;renderDeliveries();});
document.getElementById('delDateFrom').addEventListener('change',()=>{deliveryPage=1;renderDeliveries();});
document.getElementById('delDateTo').addEventListener('change',()=>{deliveryPage=1;renderDeliveries();});
document.querySelectorAll('[data-orders-summary-filter]').forEach(button=>button.addEventListener('click',()=>{
  document.getElementById('delStatusFilter').value=button.dataset.ordersSummaryFilter;
  deliveryPage=1;
  renderDeliveries();
}));
function openDeliveryForm(id, {walkIn = false} = {}){
  clearErrors('deliveryModal');
  populateDeliveryCustomerSelect();
  const isEdit = !!id;
  const isWalkInOrder = walkIn && !isEdit;
  document.getElementById('delModalTitle').textContent = isEdit ? 'Edit delivery' : isWalkInOrder ? 'Record Walk-in Order' : 'Order';
  document.getElementById('delModalDescription').hidden = !isWalkInOrder;
  document.getElementById('walkInOrderLayout').hidden = !isWalkInOrder;
  document.getElementById('standardDeliveryFields').hidden = isWalkInOrder;
  document.getElementById('deliveryModalPanel').classList.toggle('is-walk-in',isWalkInOrder);
  document.getElementById(isWalkInOrder?'walkInWaterTypeMount':'standardWaterTypeMount').append(document.getElementById('fld-delWaterType'));
  document.getElementById(isWalkInOrder?'walkInGallonsMount':'standardGallonsMount').append(document.getElementById('fld-delGallons'),document.getElementById('walkInQuantityFields'));
  document.getElementById('fld-delWaterType').hidden = !isWalkInOrder;
  document.getElementById('fld-delStatus').hidden = isWalkInOrder;
  document.getElementById('saveDeliveryBtn').innerHTML = isWalkInOrder
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"/></svg>Record Walk-in Order'
    : 'Save delivery';
  const localTime=currentSiteTimeSlot();
  const d = isEdit ? deliveries.find(x=>String(x.id)===String(id)) : {id:'',customerId:customers[0]?customers[0].id:'',date:todayStr,time:isWalkInOrder?localTime:'8:00–10:00 AM',gallons:5,status:isWalkInOrder?'Delivered':'Pending'};
  document.getElementById('delId').value = d.id;
  document.getElementById('delCustomer').value = d.customerId;
  document.getElementById('delDate').value = d.date;
  document.getElementById('delDate').min = todayStr;
  const deliveryTimeSelect=document.getElementById('delTime');
  if(!Array.from(deliveryTimeSelect.options).some(option=>option.value===d.time)){
    const customTimeOption=document.createElement('option');
    customTimeOption.value=d.time;
    customTimeOption.textContent=`${d.time} (customer preference)`;
    deliveryTimeSelect.appendChild(customTimeOption);
  }
  document.getElementById('delTime').value = d.time;
  document.getElementById('delGallons').value = isWalkInOrder?'':d.gallons;
  document.getElementById('delAlkalineQuantity').value = '';
  document.getElementById('delPurifiedQuantity').value = '';
  document.getElementById('delGallons').max = '1000';
  document.getElementById('delStatus').value = d.status;
  document.getElementById('delWaterType').value = 'alkaline';
  document.getElementById('deliveryModal').dataset.walkInOrder = isWalkInOrder ? 'true' : 'false';
  updateWalkInOrderSummary();
  openModal('deliveryModal');
  if(isWalkInOrder){
    loadPricingSettings().then(updateWalkInOrderSummary).catch(()=>updateWalkInOrderSummary());
  }
}

document.getElementById('addOrderButton').addEventListener('click',()=>openDeliveryForm(null,{walkIn:true}));
function updateWalkInOrderSummary(){
  const waterType=document.getElementById('delWaterType').value;
  const quantity=Number(document.getElementById('delGallons').value)||0;
  const isBoth=waterType==='both';
  const alkalineQuantity=Number(document.getElementById('delAlkalineQuantity').value)||0;
  const purifiedQuantity=Number(document.getElementById('delPurifiedQuantity').value)||0;
  const alkalinePrice=Number(pricingSettings?.alkaline_price_per_gallon);
  const purifiedPrice=Number(pricingSettings?.purified_price_per_gallon);
  const price=Number(pricingSettings?.[`${waterType}_price_per_gallon`]);
  const bothPriceLabel=Number.isFinite(alkalinePrice)&&Number.isFinite(purifiedPrice)?`₱${alkalinePrice.toFixed(2)} + ₱${purifiedPrice.toFixed(2)}`:'Unavailable';
  const totalGallons=isBoth?alkalineQuantity+purifiedQuantity:quantity;
  document.getElementById('fld-delGallons').hidden=isBoth;
  document.getElementById('walkInQuantityFields').hidden=!isBoth;
  document.getElementById('delGallons').max='1000';
  document.getElementById('walkInSummaryWaterType').textContent=isBoth?'Alkaline + Purified':waterType==='purified'?'Purified':'Alkaline';
  document.getElementById('walkInSummaryGallonsLabel').textContent=isBoth?'Alkaline + purified':'Gallons';
  document.getElementById('walkInSummaryPriceLabel').textContent=isBoth?'Price per Gallon (A + P)':'Price per Gallon';
  document.getElementById('walkInSummaryGallons').textContent=isBoth
    ?(alkalineQuantity||purifiedQuantity?`${alkalineQuantity||'—'} + ${purifiedQuantity||'—'} = ${totalGallons}`:'—')
    :quantity?String(totalGallons):'—';
  document.getElementById('walkInSummaryPrice').textContent=isBoth?bothPriceLabel:Number.isFinite(price)?`₱${price.toFixed(2)}`:'Unavailable';
  const orderTotal=isBoth?alkalineQuantity*alkalinePrice+purifiedQuantity*purifiedPrice:price*quantity;
  document.getElementById('walkInSummaryTotal').textContent=Number.isFinite(orderTotal)?`₱${orderTotal.toFixed(2)}`:'Unavailable';
  updateOrderQuantityStepperButtons();
}
document.getElementById('delWaterType').addEventListener('change',updateWalkInOrderSummary);
document.getElementById('delGallons').addEventListener('input',updateWalkInOrderSummary);
document.getElementById('delAlkalineQuantity').addEventListener('input',updateWalkInOrderSummary);
document.getElementById('delPurifiedQuantity').addEventListener('input',updateWalkInOrderSummary);

document.getElementById('saveDeliveryBtn').addEventListener('click', async ()=>{
  clearErrors('deliveryModal');
  const isWalkInOrder = document.getElementById('deliveryModal').dataset.walkInOrder === 'true' && !document.getElementById('delId').value;
  const customerId = isWalkInOrder?'':document.getElementById('delCustomer').value;
  const date = isWalkInOrder?todayStr:document.getElementById('delDate').value;
  const time = isWalkInOrder?currentSiteTimeSlot():document.getElementById('delTime').value;
  const quantity = parseInt(document.getElementById('delGallons').value, 10);
  const alkalineQuantity = parseInt(document.getElementById('delAlkalineQuantity').value, 10);
  const purifiedQuantity = parseInt(document.getElementById('delPurifiedQuantity').value, 10);
  const status = document.getElementById('delStatus').value;
  const waterType = document.getElementById('delWaterType').value;
  const gallons = isWalkInOrder&&waterType==='both'?alkalineQuantity+purifiedQuantity:quantity;
  let valid = true;
  if(!customerId&&!isWalkInOrder){ markInvalid('fld-delCustomer'); valid=false; }
  if(!date){ markInvalid('fld-delDate'); valid=false; }
  if(isWalkInOrder&&waterType==='both'){
    if(!Number.isInteger(alkalineQuantity)||alkalineQuantity<1||alkalineQuantity>1000){ markInvalid('fld-delAlkalineQuantity'); valid=false; }
    if(!Number.isInteger(purifiedQuantity)||purifiedQuantity<1||purifiedQuantity>1000){ markInvalid('fld-delPurifiedQuantity'); valid=false; }
    if(alkalineQuantity+purifiedQuantity>1000){ markInvalid('fld-delPurifiedQuantity'); valid=false; }
  }else if(!Number.isInteger(quantity)||quantity<1||quantity>1000||!gallons){ markInvalid('fld-delGallons'); valid=false; }
  if(!valid) return;

  const id = document.getElementById('delId').value;
  const saveButton = document.getElementById('saveDeliveryBtn');
  saveButton.disabled=true;
  try{
    const orderData = {customer_id:customerId||null,date,time_slot:time,gallons,status};
    if(isWalkInOrder){
      orderData.is_walk_in = true;
      orderData.water_type = waterType;
      if(waterType==='both'){
        orderData.alkaline_quantity = alkalineQuantity;
        orderData.purified_quantity = purifiedQuantity;
      }else{
        orderData.quantity = quantity;
      }
    }
    await api(id?`/staff/deliveries/${id}`:'/staff/deliveries',{method:id?'PUT':'POST',body:JSON.stringify(orderData)});
    await loadStaffData();
    if(isWalkInOrder){
      document.getElementById('delStatusFilter').value = 'Delivered';
      deliveryPage = 1;
    }
    closeModal('deliveryModal'); renderDeliveries(); renderDashboard();
    toast(id?'Delivery updated':'Order created',id?'Changes were saved.':isWalkInOrder?'Walk-in order saved to order records.':'New order added to the schedule.');
  }catch(error){ markServerErrors(error,{customer_id:'fld-delCustomer',date:'fld-delDate',time_slot:'fld-delTime',gallons:'fld-delGallons',quantity:'fld-delGallons',alkaline_quantity:'fld-delAlkalineQuantity',purified_quantity:'fld-delPurifiedQuantity',water_type:'fld-delWaterType'}); toast('Could not save delivery',error.message); }
  finally{ saveButton.disabled=false; }
});

/* ---------------- KMR TOOL ---------------- */
function renderKmr(){
  pricingFormHasLocalEdits=false;
  const wrap = document.getElementById('zoneRadios');
  wrap.innerHTML = ZONES.map(z => `
    <button type="button" class="zone-radio" data-zone="${z.id}">
      <div><div class="zr-name">${z.name}</div><div class="zr-range">${z.range}</div></div>
      <div class="zr-price">Coverage</div>
    </button>`).join('');
  wrap.querySelectorAll('.zone-radio').forEach(el=>{
    el.addEventListener('click', ()=>{ document.getElementById('kmInput').value=''; selectZone(el.dataset.zone); });
  });
  const deliveryRate=Number(pricingSettings?.delivery_price_per_km||0);
  document.getElementById('tierTable').innerHTML = ZONES.map(z=>`<tr><td>${z.name} (${z.range})</td><td style="text-align:right; font-weight:700;">₱${deliveryRate.toFixed(2)}/km</td></tr>`).join('');
  renderPricingSettingsForm();
  const distance=Number(document.getElementById('kmInput').value);
  selectZone(Number.isFinite(distance)&&distance>=0?zoneForKm(distance).id:'A');
}
function zoneForKm(km){
  for(const z of ZONES){ if(km <= z.max) return z; }
  return ZONES[ZONES.length-1];
}
function distanceInKilometers(latitude,longitude,targetLatitude,targetLongitude){
  const radians=value=>value*Math.PI/180;
  const latitudeDifference=radians(targetLatitude-latitude);
  const longitudeDifference=radians(targetLongitude-longitude);
  const haversine=Math.sin(latitudeDifference/2)**2
    + Math.cos(radians(latitude))*Math.cos(radians(targetLatitude))*Math.sin(longitudeDifference/2)**2;
  return 6371*2*Math.asin(Math.min(1,Math.sqrt(haversine)));
}
function selectZone(zoneId){
  const zone = ZONES.find(z=>z.id===zoneId) || ZONES[0];
  const deliveryRate=Number(pricingSettings?.delivery_price_per_km||0);
  const distance=Number(document.getElementById('kmInput').value);
  document.querySelectorAll('.zone-radio').forEach(el=> el.classList.toggle('sel', el.dataset.zone===zone.id));
  document.getElementById('resultZoneLbl').textContent = zone.name+' · '+zone.range;
  const deliveryFee=Number.isFinite(distance)&&distance>0?deliveryFeeForDistance(distance,deliveryRate):null;
  document.getElementById('resultPrice').innerHTML = Number.isFinite(distance)&&distance>0
    ? `₱${deliveryFee.toFixed(2)}<span>delivery estimate</span>`
    : `₱${deliveryRate.toFixed(2)}<span>/ km</span>`;
  document.getElementById('resultNote').textContent = Number.isFinite(distance)&&distance>0
    ? distance<=1
      ? `Trips up to 1 km have a ₱${MINIMUM_DELIVERY_FEE.toFixed(2)} delivery fee.`
      : `${distance.toFixed(1)} km falls within ${zone.name} coverage, at ₱${deliveryRate.toFixed(2)} per kilometer (₱${MINIMUM_DELIVERY_FEE.toFixed(2)} minimum).`
    : 'Enter a distance to calculate the delivery fee.';
  drawZoneMap(zone.id);
}
document.getElementById('kmInput').addEventListener('input', function(){
  const val = parseFloat(this.value);
  if(isNaN(val) || val < 0){
    document.getElementById('resultZoneLbl').textContent='Select a zone';
    document.getElementById('resultPrice').innerHTML=`₱${Number(pricingSettings?.delivery_price_per_km||0).toFixed(2)}<span>/ km</span>`;
    document.getElementById('resultNote').textContent='Enter a distance to calculate the delivery fee.';
    document.querySelectorAll('.zone-radio').forEach(el=>el.classList.remove('sel'));
    return;
  }
  const zone = zoneForKm(val);
  selectZone(zone.id);
});

document.getElementById('pricingSettingsForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  if(!form.reportValidity()) return;
  const button=document.getElementById('savePricingSettingsBtn');
  const feedback=document.getElementById('pricingSettingsFeedback');
  button.disabled=true;
  feedback.textContent='Saving settings…';
  const data=Object.fromEntries(new FormData(form).entries());
  form.querySelectorAll('input[type="number"]').forEach(input=>data[input.name]=Number(data[input.name]));
  try{
    const response=await api('/staff/pricing',{method:'PUT',body:JSON.stringify(data)});
    pricingSettings=response.data;
    pricingFormHasLocalEdits=false;
    renderPricingSettingsForm();
    renderKmr();
    renderOrderWaterPrices();
    updateDeliveryHoursCard();
    feedback.textContent='Prices saved.';
    updateOrderSummary();
  }catch(error){
    feedback.textContent=error.message;
  }finally{
    button.disabled=false;
  }
});
document.querySelectorAll('#pricingSettingsForm input').forEach(input=>input.addEventListener('input',()=>{
  pricingFormHasLocalEdits=true;
  renderPricingPreview();
}));
document.getElementById('resetPricingSettingsBtn').addEventListener('click',()=>{
  pricingFormHasLocalEdits=false;
  renderPricingSettingsForm();
  document.getElementById('pricingSettingsFeedback').textContent='Unsaved changes were reset.';
});
document.getElementById('dateTimeSettingsForm').addEventListener('change',event=>{
  dateTimeFormHasLocalEdits=true;
  const checkbox=event.target.closest('[data-schedule-open]');
  if(checkbox) updateScheduleDayState(checkbox);
});
document.getElementById('dateTimeSettingsForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!pricingSettings) return;
  const button=document.getElementById('saveDateTimeSettingsBtn');
  const feedback=document.getElementById('dateTimeSettingsFeedback');
  const data={
    alkaline_price_per_gallon:Number(pricingSettings.alkaline_price_per_gallon),
    purified_price_per_gallon:Number(pricingSettings.purified_price_per_gallon),
    delivery_price_per_km:Number(pricingSettings.delivery_price_per_km),
    station_schedule:readWeeklySchedule('station_schedule'),
    delivery_schedule:readWeeklySchedule('delivery_schedule')
  };
  button.disabled=true;
  feedback.textContent='Saving hours…';
  try{
    const response=await api('/staff/pricing',{method:'PUT',body:JSON.stringify(data)});
    pricingSettings=response.data;
    pricingFormHasLocalEdits=false;
    dateTimeFormHasLocalEdits=false;
    renderDateTimeSettingsForm();
    renderPricingSettingsForm();
    renderOrderWaterPrices();
    updateDeliveryHoursCard();
    updateOrderSummary();
    feedback.textContent='Weekly hours saved.';
  }catch(error){
    feedback.textContent=error.message;
  }finally{
    button.disabled=false;
  }
});
function drawZoneMap(activeId){
  const el = document.getElementById('zoneMap');
  const sizes = {A:70,B:130,C:190};
  el.innerHTML = Object.keys(sizes).map(id=>{
    const s = sizes[id];
    return `<div class="zmap-ring ${id===activeId?'active':''}" style="width:${s}px;height:${s}px;"></div>`;
  }).join('') + '<div class="zmap-dot"></div>';
}

/* ---------------- CUSTOMER VIEW (MY TUBIPURE) ---------------- */
function renderMyAccount(){
  const c = currentUser?.customer;
  if(currentUser){
    document.getElementById('custLoginCard').style.display = 'none';
    document.getElementById('custSignedIn').style.display = 'block';
    document.getElementById('custViewTitle').textContent = currentUser.role==='customer'?'My Orders':'Welcome back, '+currentUser.name.split(' ')[0];
    document.getElementById('custViewSub').textContent = currentUser.role==='customer'?'Review order details and follow each order’s progress.':'You are signed in with staff access.';

    const myDeliveries = c?.deliveries||[];
    const canOrder = currentUser.role==='customer' && !!c;
    document.getElementById('myOrdersCard').style.display = canOrder ? '' : 'none';

    const allHistory=[...myDeliveries].sort((first,second)=>{
      const firstDate=String(first.createdAt||first.date||'');
      const secondDate=String(second.createdAt||second.date||'');
      return customerOrderSort==='newest'?secondDate.localeCompare(firstDate):firstDate.localeCompare(secondDate);
    });
    const orderCounts={
      Pending:allHistory.filter(order=>order.status==='Pending').length,
      Confirmed:allHistory.filter(order=>order.status==='Confirmed').length,
      'Out for Delivery':allHistory.filter(order=>['Out for Delivery','Delayed'].includes(order.status)).length,
      Delivered:allHistory.filter(order=>order.status==='Delivered').length
    };
    document.getElementById('cvTotalOrders').textContent=allHistory.length;
    document.getElementById('cvActiveOrders').textContent=orderCounts.Pending+orderCounts.Confirmed+orderCounts['Out for Delivery'];
    document.getElementById('cvDeliveredOrders').textContent=orderCounts.Delivered;
    document.querySelectorAll('[data-customer-order-filter]').forEach(button=>{
      const active=button.dataset.customerOrderFilter===customerOrderFilter;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    document.getElementById('cvHistorySort').value=customerOrderSort;
    document.getElementById('cvHistoryDate').value=customerOrderDateFilter;
    document.getElementById('cvHistoryDateClear').hidden=!customerOrderDateFilter;
    const visibleHistory=allHistory.filter(order=>(customerOrderFilter==='all'
      ||(customerOrderFilter==='Out for Delivery'?['Out for Delivery','Delayed'].includes(order.status):order.status===customerOrderFilter))
      &&(!customerOrderDateFilter||customerOrderedDate(order)===customerOrderDateFilter));
    const ordersByDate=new Map();
    visibleHistory.forEach(order=>{
      const date=customerOrderedDate(order)||'unknown';
      if(!ordersByDate.has(date)) ordersByDate.set(date,[]);
      ordersByDate.get(date).push(order);
    });
    document.getElementById('cvHistoryCount').textContent=`Showing ${visibleHistory.length} of ${allHistory.length} ${allHistory.length===1?'order':'orders'}`;
    document.getElementById('cvHistory').innerHTML=ordersByDate.size?[...ordersByDate.entries()].map(([date,orders])=>`<section class="customer-order-date-group" aria-label="Orders placed ${date==='unknown'?'on an unknown date':escapeHtml(formatDeliveryDate(date))}"><h3 class="customer-order-date-heading"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg><span>${date==='unknown'?'Order date unavailable':`Ordered ${escapeHtml(formatDeliveryDate(date))}`}</span></h3><div class="customer-order-date-cards">${orders.map(order=>{
      const isPickup=order.fulfillmentMethod==='pickup';
      const steps=['Pending','Confirmed',isPickup?'Ready for pickup':'Out for Delivery','Delivered'];
      const progressStatus=isPickup&&order.status==='Out for Delivery'?'Ready for pickup':order.status;
      const currentStep=steps.indexOf(progressStatus)>=0?steps.indexOf(progressStatus):(order.status==='Delayed'?1:0);
      const isCancelled=order.status==='Cancelled';
      const displayStatus=displayOrderStatus(order);
      const customerStatusLabel=order.status==='Confirmed'?'Approved':displayStatus;
      const progress=isCancelled
        ? `<p class="customer-order-cancelled">${order.statusNote?'This order was rejected.':'This order was cancelled.'}${order.statusNote?` Reason: ${escapeHtml(order.statusNote)}`:''}</p>`
        : `<div class="customer-order-progress" role="img" aria-label="Order progress: ${escapeHtml(displayStatus)}">${steps.map((step,index)=>{
          const stepClass=order.status==='Delivered'||index<currentStep?'done':(index===currentStep?'current':'');
          return `<div class="customer-order-progress-step ${stepClass}"><span class="customer-order-progress-dot">${index<currentStep||order.status==='Delivered'?'✓':index+1}</span><span>${step}</span></div>`;
        }).join('')}</div>${order.status==='Delayed'?'<p class="customer-order-delay">Your order is delayed. Our team will update you shortly.</p>':''}`;
      const fulfillment=order.fulfillmentMethod==='pickup'?'Pickup':'Delivery';
      const payment=order.paymentMethod==='cash_on_delivery'?'Cash on delivery':'Not recorded';
      const address=order.fulfillmentMethod==='pickup'?'TubiPure pickup station':(order.deliveryAddress||order.address||'—');
      const money=value=>value===null||value===undefined?'—':`₱${Number(value).toFixed(2)}`;
      const total=money(order.orderTotal);
      const deliveryFee=money(order.deliveryFee);
      const orderId=escapeHtml(String(order.id));
      const orderDate=formatDeliveryDate(order.date);
      const orderTime=formatDeliveryOrderTime(order.time);
      const actions=order.status==='Out for Delivery'
        ? `<button class="customer-order-action customer-order-action-primary" type="button" data-track-customer-order="${orderId}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.3"/></svg>${isPickup?'Pickup status':'Track Order'}</button>`
        : order.status==='Delivered'
          ? `<button class="customer-order-action customer-order-action-primary" type="button" data-order-again>↻ <span>Order Again</span></button>`
          : ['Pending','Confirmed'].includes(order.status)
            ? `<button class="customer-order-action customer-order-action-danger" type="button" data-cancel-customer-order="${orderId}" data-order-status="${escapeHtml(order.status)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>Cancel Order</button>`
            : '';
      return `<article class="customer-order-card" data-customer-order-card="${orderId}">
        <div class="customer-order-main">
          <div class="customer-order-product"><span class="customer-order-product-image"><img src="/images/water-gallon-icon.png" alt=""></span><div><span class="customer-order-id">ORDER #${orderId}</span><h3>${escapeHtml(orderProductLabel(order))}</h3><p>${escapeHtml(waterTypeNames(order).join(' + ')||'Water refill')}</p><span class="customer-order-scheduled">${escapeHtml(orderDate)} <i>·</i> ${escapeHtml(orderTime)}</span><small class="customer-order-preferred"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>Preferred delivery time</small></div></div>
          <div class="customer-order-progress-wrap">${progress}</div>
          <div class="customer-order-actions"><span class="customer-order-status customer-order-status-${escapeHtml(displayStatus.toLowerCase().replaceAll(' ','-'))}">${escapeHtml(customerStatusLabel)}</span><button class="customer-order-action customer-order-action-neutral" type="button" data-toggle-order-details="${orderId}">View Details</button>${actions}</div>
        </div>
        <div class="customer-order-summary"><div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/></svg><span>Quantity<b>${Number(order.gallons)||0} gal</b></span></div><div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg><span>Delivery Address<b>${escapeHtml(address)}</b></span></div><div><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></svg><span>Payment Method<b>${escapeHtml(payment)}</b></span></div><div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 7h13v11H2zM15 10h4l3 3v5h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg><span>Delivery Fee<b>${deliveryFee}</b></span></div><div><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg><span>Total Amount<b>${total}</b></span></div></div>
        <details class="customer-order-details" data-customer-order-details="${orderId}"><summary>More order details</summary><dl><div><dt>Fulfillment</dt><dd>${fulfillment}</dd></div>${order.deliveryZone?`<div><dt>Delivery coverage</dt><dd>${escapeHtml(order.deliveryZone)}</dd></div>`:''}${order.deliveryInstructions?`<div><dt>Delivery instructions</dt><dd>${escapeHtml(order.deliveryInstructions)}</dd></div>`:''}${order.statusNote?`<div><dt>Order update reason</dt><dd>${escapeHtml(order.statusNote)}</dd></div>`:''}</dl></details>
      </article>`;
    }).join('')}</div></section>`).join(''):'<p class="customer-orders-empty">No orders match this filter.</p>';

    if(pendingJump){
      const jumpId = pendingJump;
      pendingJump = null;
      setTimeout(()=> jumpTo(jumpId), 60);
    }
    if(customerNotificationHighlightOrderId){
      requestAnimationFrame(highlightCustomerNotificationOrder);
    }
  }else{
    document.getElementById('custLoginCard').style.display = 'block';
    document.getElementById('custSignedIn').style.display = 'none';
    document.getElementById('myOrdersCard').style.display = '';
    document.getElementById('custViewTitle').textContent = 'My TubiPure';
    document.getElementById('custViewSub').textContent = 'Check your orders, request a refill, and track your delivery.';
    if(pendingJump){
      pendingJump = null;
      setAuthMode('login');
      document.getElementById('authFeedback').textContent = 'Log in or sign up to place an order and view your delivery history.';
      setTimeout(()=>jumpTo('custLoginCard','authEmail'),60);
    }
  }
}

document.getElementById('cvHistoryFilters').addEventListener('click',event=>{
  const filterButton=event.target.closest('[data-customer-order-filter]');
  if(!filterButton) return;
  customerOrderFilter=filterButton.dataset.customerOrderFilter;
  if(currentUser?.role==='customer') renderMyAccount();
});
document.getElementById('cvHistorySort').addEventListener('change',event=>{
  customerOrderSort=event.currentTarget.value;
  if(currentUser?.role==='customer') renderMyAccount();
});
document.getElementById('cvHistoryDate').addEventListener('change',event=>{
  customerOrderDateFilter=event.currentTarget.value;
  if(currentUser?.role==='customer') renderMyAccount();
});
document.getElementById('cvHistoryDateClear').addEventListener('click',()=>{
  customerOrderDateFilter='';
  if(currentUser?.role==='customer') renderMyAccount();
});

let pendingOrderCancellationId=null;
const cancelOrderDialog=document.getElementById('cancelOrderDialog');
const closeCancelOrderDialog=()=>{
  if(cancelOrderDialog.open) cancelOrderDialog.close();
  pendingOrderCancellationId=null;
  document.getElementById('cancelOrderDialogFeedback').textContent='';
};

document.getElementById('cvHistory').addEventListener('click',event=>{
  const cancelButton=event.target.closest('[data-cancel-customer-order]');
  if(cancelButton){
    pendingOrderCancellationId=cancelButton.dataset.cancelCustomerOrder;
    document.getElementById('cancelOrderNumber').textContent=`#${pendingOrderCancellationId}`;
    document.getElementById('cancelOrderDescription').textContent=cancelButton.dataset.orderStatus==='Confirmed'
      ? 'This order is approved but has not gone out for delivery yet. Once cancelled, it can’t be restored.'
      : 'Your order is awaiting admin approval. Once cancelled, it can’t be restored.';
    document.getElementById('cancelOrderDialogFeedback').textContent='';
    cancelOrderDialog.showModal();
    return;
  }
  const detailsButton=event.target.closest('[data-toggle-order-details],[data-track-customer-order]');
  if(detailsButton){
    const orderCard=detailsButton.closest('[data-customer-order-card]');
    if(detailsButton.hasAttribute('data-track-customer-order')){
      orderCard?.querySelector('.customer-order-progress-wrap')?.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
    const details=orderCard?.querySelector('[data-customer-order-details]');
    if(details){
      details.open=!details.open;
      detailsButton.textContent=details.open?'Hide Details':'View Details';
      if(details.open){
        details.scrollIntoView({behavior:'smooth',block:'nearest'});
      }
    }
    return;
  }
  if(event.target.closest('[data-order-again]')) go('order');
});

document.getElementById('closeCancelOrderDialog').addEventListener('click',closeCancelOrderDialog);
document.getElementById('keepCustomerOrder').addEventListener('click',closeCancelOrderDialog);
cancelOrderDialog.addEventListener('click',event=>{
  if(event.target===cancelOrderDialog) closeCancelOrderDialog();
});
cancelOrderDialog.addEventListener('close',()=>{
  pendingOrderCancellationId=null;
  document.getElementById('cancelOrderDialogFeedback').textContent='';
});

document.getElementById('confirmCancelCustomerOrder').addEventListener('click',async event=>{
  if(!pendingOrderCancellationId) return;
  const confirmButton=event.currentTarget;
  const keepButton=document.getElementById('keepCustomerOrder');
  confirmButton.disabled=true;
  keepButton.disabled=true;
  try{
    await api(`/my/orders/${pendingOrderCancellationId}/cancel`,{method:'PATCH'});
    cancelOrderDialog.close();
    pendingOrderCancellationId=null;
    await refreshSession();
    renderMyAccount();
    toast('Order cancelled','Your order was cancelled.');
  }catch(error){
    document.getElementById('cancelOrderDialogFeedback').textContent=error.message;
  }finally{
    confirmButton.disabled=false;
    keepButton.disabled=false;
  }
});

function renderProfile(){
  if(!currentUser) return;

  const customer = currentUser.customer;
  setUserAvatar(document.getElementById('profileAvatar'),currentUser,false);
  document.getElementById('profileName').textContent = currentUser.name;
  document.getElementById('profileRole').textContent = currentUser.role === 'staff' ? 'Administrator' : 'Customer';
  document.getElementById('profileEmail').textContent = currentUser.email;

  const contactRow = document.getElementById('profileContactRow');
  contactRow.hidden = !customer?.contact;
  document.getElementById('profileContact').textContent = customer?.contact || '';
  document.getElementById('profileEditName').value = currentUser.name || '';
  document.getElementById('profileEditEmail').value = currentUser.email || '';
  document.getElementById('profileEditContact').value = customer?.contact || '';
  document.getElementById('profileEditContactField').hidden = !customer;
  const defaultAddress = customer?.addresses?.find(address => address.is_default) || customer?.addresses?.[0];
  document.getElementById('profileAddressRow').hidden = !customer || !defaultAddress;
  document.getElementById('profileAddress').textContent = defaultAddress?.address || '';
}

function setUserAvatar(element,user,useProfilePhoto=true){
  const photoUrl=useProfilePhoto?user?.profile_photo_url:null;
  element.textContent=photoUrl?'':(user?initials(user.name):'');
  element.classList.toggle('has-profile-photo',Boolean(photoUrl));
  element.style.backgroundImage=photoUrl?`url("${photoUrl.replaceAll('"','%22')}")`:'';
}

document.getElementById('editProfileButton').addEventListener('click',()=>{
  document.getElementById('profileDetails').hidden=true;
  document.getElementById('profileEditForm').hidden=false;
  document.getElementById('editProfileButton').hidden=true;
  document.getElementById('profileEditName').focus();
});
document.getElementById('cancelProfileEditButton').addEventListener('click',()=>{
  document.getElementById('profileEditForm').reset();
  document.querySelectorAll('#profileEditForm .form-row').forEach(row=>{
    row.classList.remove('invalid');
    row.querySelector('.err').textContent='';
  });
  document.getElementById('profileEditFeedback').hidden=true;
  document.getElementById('profileEditForm').hidden=true;
  document.getElementById('profileDetails').hidden=false;
  document.getElementById('editProfileButton').hidden=false;
  renderProfile();
});
document.getElementById('profileEditForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const saveButton=document.getElementById('saveProfileButton');
  const feedback=document.getElementById('profileEditFeedback');
  const fields={name:'profileEditName',email:'profileEditEmail',contact:'profileEditContact'};
  const payload={
    name:document.getElementById('profileEditName').value,
    email:document.getElementById('profileEditEmail').value
  };
  if(currentUser?.customer) payload.contact=document.getElementById('profileEditContact').value;
  form.querySelectorAll('.form-row').forEach(row=>{
    row.classList.remove('invalid');
    row.querySelector('.err').textContent='';
  });
  feedback.hidden=true;
  saveButton.disabled=true;
  try{
    await api('/profile',{method:'PUT',body:JSON.stringify(payload)});
    await refreshSession();
    renderProfile();
    document.getElementById('profileEditForm').hidden=true;
    document.getElementById('profileDetails').hidden=false;
    document.getElementById('editProfileButton').hidden=false;
    toast('Profile updated','Your personal information was saved.');
  }catch(error){
    markServerErrors(error,fields);
    Object.entries(error.errors||{}).forEach(([field,messages])=>{
      const row=document.getElementById(fields[field])?.closest('.form-row');
      const message=row?.querySelector('.err');
      if(message) message.textContent=messages[0]||'';
    });
    feedback.textContent=error.message;
    feedback.hidden=false;
  }finally{
    saveButton.disabled=false;
  }
});

document.getElementById('changePasswordForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const submitButton=document.getElementById('changePasswordButton');
  const feedback=document.getElementById('changePasswordFeedback');
  const fields={current_password:'currentPassword',password:'newPassword',password_confirmation:'newPasswordConfirmation'};
  form.querySelectorAll('.form-row').forEach(row=>{
    row.classList.remove('invalid');
    row.querySelector('.err').textContent='';
  });
  feedback.hidden=true;
  feedback.classList.remove('is-success');
  submitButton.disabled=true;
  try{
    await api('/password',{method:'PUT',body:JSON.stringify({
      current_password:document.getElementById('currentPassword').value,
      password:document.getElementById('newPassword').value,
      password_confirmation:document.getElementById('newPasswordConfirmation').value
    })});
    form.reset();
    feedback.textContent='Your password has been changed.';
    feedback.classList.add('is-success');
    feedback.hidden=false;
  }catch(error){
    Object.entries(error.errors||{}).forEach(([field,messages])=>{
      const row=document.getElementById(fields[field])?.closest('.form-row');
      const message=row?.querySelector('.err');
      if(row) row.classList.add('invalid');
      if(message) message.textContent=messages[0]||'';
    });
    feedback.textContent=error.message;
    feedback.hidden=false;
  }finally{
    submitButton.disabled=false;
  }
});

function renderAddress(){
  if(!currentUser) return;
  setUserAvatar(document.getElementById('addressPageAvatar'),currentUser);
  document.getElementById('addressPageName').textContent = currentUser.name;
  loadCustomerAddresses();
}

let editingAddressId = null;
async function loadCustomerAddresses(){
  const list = document.getElementById('addressList');
  list.innerHTML = '<p class="helper-text">Loading saved addresses…</p>';
  try{
    const response = await api('/my/addresses');
    currentUser.customer.addresses = response.data;
    renderCustomerAddresses();
  }catch(error){
    list.innerHTML = `<p class="helper-text">${escapeHtml(error.message)}</p>`;
  }
}

function renderCustomerAddresses(){
  const addresses = currentUser?.customer?.addresses || [];
  document.getElementById('addressCount').textContent = `${addresses.length} of 5 addresses saved`;
  document.getElementById('addressList').innerHTML = addresses.length ? addresses.map(address=>`
    <article class="address-entry">
      <div class="address-entry-content"><div class="address-entry-title"><h3>${escapeHtml(address.label)}</h3>${address.is_default?'<span class="address-default-badge">Default</span>':''}</div><p>${escapeHtml(address.address)}</p></div>
      <div class="address-entry-actions">
        <details class="address-actions-menu">
          <summary aria-label="More actions for ${escapeHtml(address.label)}" title="Address actions"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg></summary>
          <div class="address-actions-menu-panel">${address.is_default?'':'<button type="button" data-default-address="'+address.id+'">Set as default</button>'}
            <button type="button" data-edit-address="${address.id}">Edit</button>
            <button class="address-action-delete" type="button" data-delete-address="${address.id}">Delete</button>
          </div>
        </details>
      </div>
    </article>`).join('') : '<p class="helper-text">No saved addresses yet. Add an address to get started.</p>';
}

document.getElementById('addAddressBtn').addEventListener('click',()=>{
  if((currentUser?.customer?.addresses || []).length >= 5){
    toast('Address limit reached',"You've reached the 5-address limit. Delete a saved address before adding another.");
    return;
  }
  editingAddressId = null;
  document.getElementById('addressFormFeedback').textContent = '';
  window.addressMapPicker.open();
});
document.getElementById('closeAddressPicker').addEventListener('click',()=>window.addressMapPicker.close());
let pendingAddressDeleteId=null;
const addressDeleteDialog=document.getElementById('addressDeleteDialog');
function closeAddressDeleteDialog(){
  if(addressDeleteDialog.open) addressDeleteDialog.close();
  pendingAddressDeleteId=null;
  document.getElementById('addressDeleteFeedback').textContent='';
}

document.getElementById('addressList').addEventListener('click',async event=>{
  const defaultButton = event.target.closest('[data-default-address]');
  const editButton = event.target.closest('[data-edit-address]');
  const deleteButton = event.target.closest('[data-delete-address]');
  const addresses = currentUser?.customer?.addresses || [];
  if(defaultButton){
    defaultButton.closest('.address-actions-menu').open=false;
    try{
      await api(`/my/addresses/${defaultButton.dataset.defaultAddress}/default`,{method:'PATCH',body:'{}'});
      await loadCustomerAddresses();
      renderProfile();
      toast('Default address updated','Your profile and new orders will use this address by default.');
    }catch(error){
      toast('Could not update default address',error.message);
    }
    return;
  }
  if(editButton){
    editButton.closest('.address-actions-menu').open=false;
    const address = addresses.find(item=>String(item.id)===editButton.dataset.editAddress);
    if(!address) return;
    editingAddressId = address.id;
    document.getElementById('addressFormFeedback').textContent = '';
    window.addressMapPicker.open(address);
  }
  if(deleteButton){
    deleteButton.closest('.address-actions-menu').open=false;
    const address=addresses.find(item=>String(item.id)===deleteButton.dataset.deleteAddress);
    if(!address) return;
    pendingAddressDeleteId=address.id;
    document.getElementById('addressDeleteName').textContent=address.label;
    document.getElementById('addressDeleteFeedback').textContent='';
    addressDeleteDialog.showModal();
  }
});
document.addEventListener('click',event=>{
  if(event.target.closest('.address-actions-menu,.record-actions-menu')) return;
  document.querySelectorAll('.address-actions-menu[open],.record-actions-menu[open]').forEach(menu=>{menu.open=false;});
});
document.getElementById('closeAddressDeleteDialog').addEventListener('click',closeAddressDeleteDialog);
document.getElementById('keepAddressButton').addEventListener('click',closeAddressDeleteDialog);
addressDeleteDialog.addEventListener('click',event=>{
  if(event.target===addressDeleteDialog) closeAddressDeleteDialog();
});
addressDeleteDialog.addEventListener('close',()=>{
  pendingAddressDeleteId=null;
  document.getElementById('addressDeleteFeedback').textContent='';
});
document.getElementById('confirmDeleteAddressButton').addEventListener('click',async event=>{
  if(!pendingAddressDeleteId) return;
  const button=event.currentTarget;
  button.disabled=true;
  document.getElementById('keepAddressButton').disabled=true;
  try{
    await api(`/my/addresses/${pendingAddressDeleteId}`,{method:'DELETE'});
    addressDeleteDialog.close();
    pendingAddressDeleteId=null;
    await loadCustomerAddresses();
    toast('Address deleted','The saved address was removed.');
  }catch(error){
    document.getElementById('addressDeleteFeedback').textContent=error.message;
  }finally{
    button.disabled=false;
    document.getElementById('keepAddressButton').disabled=false;
  }
});
document.getElementById('addressForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const saveButton = document.getElementById('saveAddressBtn');
  saveButton.disabled = true;
  document.getElementById('addressFormFeedback').textContent = '';
  try{
    const addressId = editingAddressId;
    await api(addressId ? `/my/addresses/${addressId}` : '/my/addresses',{
      method:addressId ? 'PUT' : 'POST',
      body:JSON.stringify({label:document.getElementById('addressLabel').value.trim(),...window.addressMapPicker.selection()})
    });
    window.addressMapPicker.close();
    await loadCustomerAddresses();
  }catch(error){
    document.getElementById('addressFormFeedback').textContent = error.message;
  }finally{
    saveButton.disabled = false;
  }
});

document.getElementById('authSubmitBtn').addEventListener('click', async ()=>{
  const feedback = document.getElementById('authFeedback');
  const submitButton = document.getElementById('authSubmitBtn');
  const data = {};
  let path = '/login';
  if(authMode==='forgot'){
    path='/password/forgot';
    data.email=document.getElementById('authEmail').value.trim();
  }else if(authMode==='reset'){
    path='/password/reset';
    data.token=decodeURIComponent(location.pathname.split('/').pop());
    data.email=document.getElementById('resetEmail').value.trim();
    data.password=document.getElementById('resetPassword').value;
    data.password_confirmation=document.getElementById('resetPasswordConfirmation').value;
  }else{
    data.email=document.getElementById('authEmail').value.trim();
    data.password=document.getElementById('authPassword').value;
    if(authMode==='signup'){
      path='/register';
      data.name=document.getElementById('signupName').value.trim();
      data.address=document.getElementById('signupAddress').value.trim();
      data.contact=document.getElementById('signupContact').value.trim();
      data.password_confirmation=document.getElementById('signupPasswordConfirmation').value;
    }
  }
  submitButton.disabled=true;
  try{
    const result=await api(path,{method:'POST',body:JSON.stringify(data)});
    if(authMode==='forgot'){
      feedback.textContent=result.message;
      appendLocalResetLink(feedback,result.local_reset_url);
      return;
    }
    if(authMode==='reset'){
      setAuthMode('login');
      feedback.textContent=result.message;
      return;
    }
    await refreshSession();
    feedback.textContent = 'You are signed in.';
    document.getElementById('authEmail').value = '';
    document.getElementById('authPassword').value = '';
    go(currentUser.role==='staff'?'dashboard':'home');
  }catch(error){ feedback.textContent = error.message; }
  finally{ submitButton.disabled=false; }
});
['authEmail','authPassword','signupName','signupAddress','signupContact','signupPasswordConfirmation','resetEmail','resetPassword','resetPasswordConfirmation'].forEach(id=>{
  document.getElementById(id).addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();document.getElementById('authSubmitBtn').click();}
  });
});
function jumpTo(id, focusId){
  const el = document.getElementById(id);
  if(!el) return;
  el.scrollIntoView({behavior:'smooth', block:'start'});
  el.classList.add('jump-highlight');
  setTimeout(()=> el.classList.remove('jump-highlight'), 1000);
  if(focusId){ setTimeout(()=> document.getElementById(focusId).focus(), 350); }
}
function requireCustomerAccount(){
  if(currentUser?.role==='customer' && currentUser.customer){
    return true;
  }
  if(!currentUser){
    setAuthMode('login');
    go('myaccount');
    document.getElementById('authFeedback').textContent = 'Log in or sign up to place an order and view your delivery history.';
    jumpTo('custLoginCard','authEmail');
  }else{
    toast('Customer account required','Sign in with a customer account to place orders and view order history.');
  }
  return false;
}

async function logoutCurrentUser(){
  closeNavProfileMenu();
  closeAdminSidebarProfileMenu();
  try{
    await api('/logout',{method:'POST',body:'{}'});
    currentUser = null; customers=[]; deliveries=[];
    updateAuthNavigation(); renderMyAccount(); go('home');
  }catch(error){ toast('Could not sign out',error.message); }
}
function renderCustomerOrder(){
  const allowed= currentUser?.role==='customer' && !!currentUser.customer;
  document.getElementById('orderLoginNote').hidden=allowed;
  document.getElementById('orderFormShell').hidden=!allowed;
  if(!allowed) return;
  loadOrderPricing();
  const customer=currentUser.customer;
  const name=document.getElementById('orderContactName');
  const phone=document.getElementById('orderPhone');
  const address=document.getElementById('orderAddress');
  if(!name.value) name.value=customer.name||currentUser.name||'';
  if(!phone.value) phone.value=customer.contact||'';
  const savedAddresses=customer.addresses||[];
  const selectedAddressId=address.value;
  address.replaceChildren(new Option('Choose a saved address',''));
  savedAddresses.forEach(savedAddress=>{
    const fullLabel=`${savedAddress.label} — ${savedAddress.address}`;
    const option=new Option(fullLabel,String(savedAddress.id));
    option.dataset.fullLabel=fullLabel;
    address.add(option);
  });
  address.value=savedAddresses.some(savedAddress=>String(savedAddress.id)===selectedAddressId)
    ? selectedAddressId
    : '';
  renderOrderAddressOptions();
  updateOrderAddressDisplay();
  document.getElementById('orderAddressEmpty').hidden=savedAddresses.length>0;
  document.querySelector('.order-address-manage').hidden=savedAddresses.length===0;
  document.getElementById('orderDate').min=todayStr;
  document.getElementById('orderTimeDisplay').textContent=document.getElementById('orderTime').value
    ? formatTimeWithPeriod(document.getElementById('orderTime').value)
    : 'Choose a time';
  updateWaterQuantityFields();
  updateOrderSummary();
}

function updateOrderAddressDisplay({animate=false}={}){
  const address=document.getElementById('orderAddress');
  const display=document.getElementById('orderAddressMarquee');
  const viewport=display?.parentElement;
  if(!address||!display||!viewport) return;
  display.classList.remove('is-overflowing');
  display.style.removeProperty('transform');
  const selectedOption=address.selectedOptions[0];
  display.textContent=selectedOption?.dataset.fullLabel||selectedOption?.textContent||'Choose a saved address';
  const styles=getComputedStyle(viewport);
  const availableWidth=viewport.clientWidth-parseFloat(styles.paddingLeft)-parseFloat(styles.paddingRight);
  const overflowDistance=display.scrollWidth-availableWidth;
  display.style.setProperty('--marquee-distance',`${-Math.max(0,overflowDistance)}px`);
  if(animate&&overflowDistance>0){
    void display.offsetWidth;
    display.classList.add('is-overflowing');
  }
  document.querySelectorAll('#orderAddressOptions [role="option"]').forEach(option=>{
    option.setAttribute('aria-selected',String(option.dataset.addressValue===address.value));
  });
}

function renderOrderAddressOptions(){
  const address=document.getElementById('orderAddress');
  const options=document.getElementById('orderAddressOptions');
  options.replaceChildren();
  Array.from(address.options).forEach(addressOption=>{
    const option=document.createElement('button');
    const label=document.createElement('span');
    option.type='button';
    option.className='order-address-option';
    option.setAttribute('role','option');
    option.setAttribute('aria-selected',String(addressOption.value===address.value));
    option.dataset.addressValue=addressOption.value;
    label.className='order-address-option-label';
    label.textContent=addressOption.dataset.fullLabel||addressOption.textContent;
    option.append(label);
    option.addEventListener('click',()=>{
      address.value=option.dataset.addressValue;
      address.dispatchEvent(new Event('change',{bubbles:true}));
      closeOrderAddressOptions(true);
    });
    option.addEventListener('keydown',event=>{
      if(event.key==='Escape'){
        event.preventDefault();
        closeOrderAddressOptions(true);
      }else if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();
        const addressOptions=Array.from(options.querySelectorAll('[role="option"]'));
        const nextIndex=(addressOptions.indexOf(option)+(event.key==='ArrowDown'?1:-1)+addressOptions.length)%addressOptions.length;
        addressOptions[nextIndex]?.focus();
      }
    });
    options.append(option);
  });
}

function closeOrderAddressOptions(returnFocus=false){
  const options=document.getElementById('orderAddressOptions');
  const trigger=document.getElementById('orderAddressTrigger');
  options.hidden=true;
  trigger.setAttribute('aria-expanded','false');
  trigger.parentElement.classList.remove('is-open');
  if(returnFocus) trigger.focus();
}

document.getElementById('orderAddressTrigger').addEventListener('click',()=>{
  const options=document.getElementById('orderAddressOptions');
  if(options.hidden){
    options.hidden=false;
    document.getElementById('orderAddressTrigger').setAttribute('aria-expanded','true');
    document.querySelector('.order-address-select').classList.add('is-open');
    options.querySelector('[aria-selected="true"]')?.focus();
  }else{
    closeOrderAddressOptions();
  }
});
document.getElementById('orderAddressTrigger').addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'||event.key==='Enter'||event.key===' '){
    event.preventDefault();
    const options=document.getElementById('orderAddressOptions');
    options.hidden=false;
    document.getElementById('orderAddressTrigger').setAttribute('aria-expanded','true');
    document.querySelector('.order-address-select').classList.add('is-open');
    options.querySelector('[aria-selected="true"]')?.focus();
  }else if(event.key==='Escape'){
    closeOrderAddressOptions();
  }
});
document.addEventListener('click',event=>{
  const addressSelect=document.querySelector('.order-address-select');
  if(addressSelect&&!addressSelect.contains(event.target)) closeOrderAddressOptions();
});

async function loadOrderPricing(){
  try{
    await loadPricingSettings();
    renderOrderWaterPrices();
    updateOrderSummary();
  }catch(error){
    console.error('Could not load water prices:',error);
  }
}

function updateOrderCoverage(){
  const addressId=document.getElementById('orderAddress').value;
  const savedAddress=(currentUser?.customer?.addresses||[]).find(address=>String(address.id)===addressId);
  const zoneInput=document.getElementById('orderZone');
  const coverageResult=document.getElementById('orderCoverageResult');
  const coverageDetail=document.getElementById('orderCoverageDetail');
  const method=document.querySelector('input[name="fulfillment_method"]:checked')?.value;
  coverageResult.classList.remove('is-outside-service-area');
  coverageDetail.classList.remove('is-outside-service-area');
  orderDeliveryDistanceKm=null;
  zoneInput.value='';
  if(!method){
    coverageResult.textContent='Choose delivery or pickup.';
    coverageDetail.textContent='';
    return;
  }
  if(method==='pickup'){
    coverageResult.textContent='Coverage is not needed for pickup.';
    coverageDetail.textContent='';
    return;
  }
  if(!savedAddress){
    coverageResult.textContent='Choose a saved address to calculate coverage.';
    coverageDetail.textContent='';
    return;
  }
  if(savedAddress.latitude===null||savedAddress.latitude===undefined||String(savedAddress.latitude).trim()===''||savedAddress.longitude===null||savedAddress.longitude===undefined||String(savedAddress.longitude).trim()===''){
    coverageResult.textContent='This address needs a map pin.';
    coverageDetail.textContent='Edit this address in My Address and choose its location on the map.';
    return;
  }
  const latitude=Number(savedAddress.latitude);
  const longitude=Number(savedAddress.longitude);
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)){
    coverageResult.textContent='This address needs a map pin.';
    coverageDetail.textContent='Edit this address in My Address and choose its location on the map.';
    return;
  }
  if(!isWithinVisayanVillage(latitude,longitude)){
    coverageResult.textContent='Outside Visayan Village';
    coverageDetail.textContent=OUTSIDE_DELIVERY_AREA_MESSAGE;
    coverageResult.classList.add('is-outside-service-area');
    coverageDetail.classList.add('is-outside-service-area');
    return;
  }
  const distance=distanceInKilometers(latitude,longitude,COMPANY_LOCATION.latitude,COMPANY_LOCATION.longitude);
  orderDeliveryDistanceKm=Math.round(distance*100)/100;
  const zone=zoneForKm(orderDeliveryDistanceKm);
  zoneInput.value=zone.id;
  coverageResult.textContent=`${zone.name} · ${zone.range}`;
  const deliveryRate=Number(pricingSettings?.delivery_price_per_km||0);
  const deliveryFee=deliveryFeeForDistance(orderDeliveryDistanceKm,deliveryRate);
  coverageDetail.textContent=orderDeliveryDistanceKm<=1
    ? `Trips up to 1 km have a ₱${MINIMUM_DELIVERY_FEE.toFixed(2)} delivery fee.`
    : `${orderDeliveryDistanceKm.toFixed(2)} km × ₱${deliveryRate.toFixed(2)}/km = ₱${deliveryFee.toFixed(2)} (₱${MINIMUM_DELIVERY_FEE.toFixed(2)} minimum)`;
}

function updateOrderSummary(){
  updateOrderCoverage();
  const form=document.getElementById('customerOrderForm');
  const values=new FormData(form);
  const selection=values.get('water_selection');
  const waterTypes=selection==='both'?['alkaline','purified']:selection?[selection]:[];
  const type=waterTypes.map(value=>value.charAt(0).toUpperCase()+value.slice(1)).join(' + ')||'Choose a water type';
  const size=Number(values.get('container_size_gallons'))||1;
  const singleQuantity=Number(values.get('quantity'))||0;
  const alkalineQuantity=selection==='both'?Number(values.get('alkaline_quantity'))||0:(selection==='alkaline'?singleQuantity:0);
  const purifiedQuantity=selection==='both'?Number(values.get('purified_quantity'))||0:(selection==='purified'?singleQuantity:0);
  const quantity=alkalineQuantity+purifiedQuantity;
  const gallons=size*quantity;
  const method=values.get('fulfillment_method');
  const paymentMethod=document.getElementById('orderPaymentMethod');
  const paymentField=document.querySelector('.order-payment-field');
  const isPickup=method==='pickup';
  paymentField.hidden=isPickup;
  paymentMethod.disabled=isPickup;
  paymentMethod.required=!isPickup;
  if(isPickup){
    paymentMethod.value='';
    clearOrderFieldValidation('payment_method');
  }
  const zone=ZONES.find(item=>item.id===values.get('delivery_zone'));
  const selectedAddressId=values.get('delivery_address');
  const selectedAddress=(currentUser?.customer?.addresses||[]).find(address=>String(address.id)===String(selectedAddressId));
  const alkalinePrice=Number(pricingSettings?.alkaline_price_per_gallon||0);
  const purifiedPrice=Number(pricingSettings?.purified_price_per_gallon||0);
  const deliveryPricePerKm=Number(pricingSettings?.delivery_price_per_km||0);
  const hasPricing=alkalinePrice>0&&purifiedPrice>0&&deliveryPricePerKm>0;
  const waterSubtotal=Math.round((size*alkalineQuantity*alkalinePrice+size*purifiedQuantity*purifiedPrice)*100)/100;
  const deliveryFee=method==='delivery'&&orderDeliveryDistanceKm!==null
    ? deliveryFeeForDistance(orderDeliveryDistanceKm,deliveryPricePerKm)
    : null;
  const total=deliveryFee===null?null:Math.round((waterSubtotal+deliveryFee)*100)/100;
  const peso=value=>`₱${value.toFixed(2)}`;
  document.getElementById('summaryWater').textContent=type;
  document.getElementById('summaryContainer').textContent=!selection
    ? 'Choose water and quantity'
    : selection==='both'
      ? `Alkaline ${alkalineQuantity*size} gal · Purified ${purifiedQuantity*size} gal`
      : `${singleQuantity*size} ${singleQuantity*size===1?'gallon':'gallons'} ${type}`;
  document.getElementById('summaryGallons').textContent=`${gallons} gallons`;
  document.getElementById('summaryWaterSubtotal').textContent=hasPricing?peso(waterSubtotal):'Prices unavailable';
  document.getElementById('summaryFulfillment').textContent=!method?'Choose delivery or pickup':method==='delivery'?`Delivery · ${zone?.name||'Coverage pending'}`:'Pickup';
  document.getElementById('summaryPaymentMethod').textContent=isPickup?'Not required for pickup':values.get('payment_method')==='cash_on_delivery'?'Cash on delivery':'Choose a payment method';
  document.getElementById('summaryAddress').textContent=!method
    ? 'Choose delivery or pickup'
    : method==='delivery'
      ? selectedAddress?`${selectedAddress.label} — ${selectedAddress.address}`:'Choose a saved address'
      : 'Visayan Village, Purok Pioneer, Tagum, 8100 Davao del Norte';
  const isOutsideServiceArea=document.getElementById('orderCoverageResult').classList.contains('is-outside-service-area');
  document.getElementById('summaryDeliveryFee').textContent=!method?'Choose delivery or pickup':method==='pickup'?'₱0.00':isOutsideServiceArea?'Outside service area':deliveryFee===null?'Choose address':peso(deliveryFee);
  const date=values.get('date');
  const time=values.get('time_slot');
  document.getElementById('summarySchedule').textContent=date?`${date} · ${formatTimeWithPeriod(time)}`:'Choose date and time';
  document.getElementById('summaryTotal').textContent=!hasPricing?'Prices unavailable':!method?'Choose delivery or pickup':method==='delivery'?(total===null?'Choose address':peso(total)):peso(waterSubtotal);
  document.getElementById('summaryNote').textContent=!hasPricing
    ? 'The admin must set alkaline, purified, and delivery rates before orders can be priced.'
    : !method?'Choose water and fulfillment to calculate your total.'
      : method==='delivery'
      ? isOutsideServiceArea?OUTSIDE_DELIVERY_AREA_MESSAGE:deliveryFee===null?'Choose a saved address with a map pin to calculate your delivery fee.':`Water: ${peso(waterSubtotal)} · ${orderDeliveryDistanceKm<=1?'Delivery: ₱5.00 for trips up to 1 km.':`Delivery: ${orderDeliveryDistanceKm.toFixed(2)} km × ₱${deliveryPricePerKm.toFixed(2)}/km (₱5.00 minimum).`}`
      : `Pickup water price is based on ₱${alkalinePrice.toFixed(2)}/gal alkaline and ₱${purifiedPrice.toFixed(2)}/gal purified water.`;
  const delivery=method==='delivery';
  document.getElementById('orderDeliveryFields').hidden=!delivery;
  document.getElementById('orderPickupNote').hidden=method!=='pickup';
  document.getElementById('orderAddress').required=false;
  document.getElementById('orderAddress').disabled=!delivery;
  document.getElementById('orderAddressTrigger').disabled=!delivery||!(currentUser?.customer?.addresses||[]).length;
  if(!delivery) closeOrderAddressOptions();
}

function updateWaterQuantityFields(){
  const isBoth=document.querySelector('input[name="water_selection"]:checked')?.value==='both';
  document.getElementById('singleQuantityField').hidden=isBoth;
  document.getElementById('orderQuantity').disabled=isBoth;
  document.getElementById('bothQuantityFields').hidden=!isBoth;
  document.getElementById('alkalineQuantity').disabled=!isBoth;
  document.getElementById('purifiedQuantity').disabled=!isBoth;
  document.getElementById('alkalineQuantity').required=isBoth;
  document.getElementById('purifiedQuantity').required=isBoth;
  updateOrderQuantityStepperButtons();
}

function updateOrderQuantityStepperButtons(){
  document.querySelectorAll('[data-order-quantity-target]').forEach(button=>{
    const input=document.getElementById(button.dataset.orderQuantityTarget);
    const quantity=input.value===''?null:Number(input.value);
    const step=Number(button.dataset.quantityStep);
    const minimum=Number(input.min)||1;
    const maximum=Number(input.max)||50;
    button.disabled=input.disabled||(step<0&&(quantity===null||!Number.isFinite(quantity)||quantity<=minimum))||(step>0&&quantity!==null&&quantity>=maximum);
  });
}

document.querySelectorAll('[data-order-quantity-target]').forEach(button=>button.addEventListener('click',()=>{
  const input=document.getElementById(button.dataset.orderQuantityTarget);
  if(input.disabled) return;
  const quantity=input.value===''?null:Number(input.value);
  const step=Number(button.dataset.quantityStep);
  const minimum=Number(input.min)||1;
  const maximum=Number(input.max)||50;
  const nextQuantity=quantity===null?minimum:Math.min(maximum,Math.max(minimum,quantity+step));
  input.value=String(nextQuantity);
  input.dispatchEvent(new Event('input',{bubbles:true}));
}));

document.getElementById('customerOrderForm').addEventListener('change',event=>{
  if(event.target.name) clearOrderFieldValidation(event.target.name);
  updateOrderTimeHelp();
  updateOrderAddressDisplay({animate:event.target.id==='orderAddress'});
  updateWaterQuantityFields();
  updateOrderSummary();
});
document.getElementById('customerOrderForm').addEventListener('input',event=>{
  const field=event.target;
  if(field.name) clearOrderFieldValidation(field.name);
  updateOrderQuantityStepperButtons();
  document.getElementById('orderFeedback').hidden=true;
  updateOrderSummary();
});
window.addEventListener('resize',updateOrderAddressDisplay);
let pickerHour=8;
let pickerMinute=0;
let pickerPhase='hour';
let timePickerTarget='order';
function formatTimeWithPeriod(time){
  const [hour,minute]=String(time||'').split(':').map(Number);
  if(!Number.isInteger(hour)||!Number.isInteger(minute)) return String(time||'');
  const period=hour>=12?'PM':'AM';
  const displayHour=hour%12||12;
  return `${String(displayHour).padStart(2,'0')}:${String(minute).padStart(2,'0')} ${period}`;
}
function displayPickerHour(hour){
  return String(hour%12||12).padStart(2,'0');
}
function getOrderTimeBounds(){
  const toMinutes=(value,fallback)=>{
    const match=String(value||fallback).match(/^(\d{1,2}):(\d{2})/);
    return match?Number(match[1])*60+Number(match[2]):0;
  };
  const isPickup=document.querySelector('input[name="fulfillment_method"]:checked')?.value==='pickup';
  const selectedDate=document.getElementById('orderDate')?.value||todayStr;
  const date=new Date(`${selectedDate}T12:00:00Z`);
  const weekday=scheduleWeekdays[(date.getUTCDay()+6)%7];
  const hours=scheduleHoursForDay(isPickup?'station_schedule':'delivery_schedule',weekday);
  return {
    start:toMinutes(hours.opens,isPickup?'06:00':'07:00'),
    end:toMinutes(hours.closes,isPickup?'18:00':'16:00'),
    isPickup,
    isOpen:Boolean(hours.open),
    weekday
  };
}
function updateOrderTimeHelp(){
  if(!pricingSettings) return;
  const bounds=getOrderTimeBounds();
  const scheduleType=bounds.isPickup?'station_schedule':'delivery_schedule';
  const hours=scheduleHoursForDay(scheduleType,bounds.weekday);
  const start=hours.opens;
  const end=hours.closes;
  const orderTimeInput=document.getElementById('orderTime');
  const orderTimeTrigger=document.getElementById('orderTimeTrigger');
  const timeHelp=document.getElementById('orderTimeHelp');
  if(!bounds.isOpen){
    timeHelp.textContent=`${bounds.isPickup?'The station is':'Delivery is'} closed on ${bounds.weekday}. Choose another date.`;
    orderTimeTrigger.disabled=true;
    return;
  }
  orderTimeTrigger.disabled=false;
  timeHelp.textContent=`Available for ${bounds.isPickup?'pickup':'delivery'} on ${bounds.weekday} from ${formatBusinessTime(start)} to ${formatBusinessTime(end)}`;
  const [selectedHour,selectedMinute]=orderTimeInput.value.split(':').map(Number);
  if(orderTimeInput.value&&!isAvailableDeliveryTime(selectedHour,selectedMinute)){
    const firstAvailableTime=firstAvailableDeliveryTime();
    if(firstAvailableTime){
      const selectedTime=`${String(firstAvailableTime.hour).padStart(2,'0')}:${String(firstAvailableTime.minute).padStart(2,'0')}`;
      orderTimeInput.value=selectedTime;
      document.getElementById('orderTimeDisplay').textContent=formatTimeWithPeriod(selectedTime);
    }
  }
}
function isAvailableDeliveryTime(hour,minute){
  const bounds=getOrderTimeBounds();
  const totalMinutes=hour*60+minute;
  return bounds.isOpen&&totalMinutes>=bounds.start&&totalMinutes<=bounds.end&&minute%5===0;
}
function firstAvailableDeliveryTime(period=null){
  for(let hour=period==='AM'?0:period==='PM'?12:0;hour<(period==='AM'?12:24);hour++){
    for(let minute=0;minute<=55;minute+=5){
      if(isAvailableDeliveryTime(hour,minute)) return {hour,minute};
    }
  }
  return null;
}
function isCurrentPickerTimeAvailable(hour,minute){
  return timePickerTarget==='order'?isAvailableDeliveryTime(hour,minute):minute%5===0;
}
function firstAvailablePickerTime(period=null){
  if(timePickerTarget==='order') return firstAvailableDeliveryTime(period);
  for(let hour=period==='AM'?0:period==='PM'?12:0;hour<(period==='AM'?12:24);hour++){
    return {hour,minute:0};
  }
  return null;
}
function selectTimePickerPeriod(period){
  const availableTime=firstAvailablePickerTime(period);
  if(!availableTime) return;
  pickerHour=availableTime.hour;
  pickerMinute=availableTime.minute;
  document.getElementById('timePickerHour').textContent=displayPickerHour(pickerHour);
  document.getElementById('timePickerMinute').textContent=String(pickerMinute).padStart(2,'0');
  renderTimePickerFace();
}
function renderTimePickerFace(){
  const face=document.getElementById('timePickerFace');
  const instruction=document.getElementById('timePickerInstruction');
  document.getElementById('timePickerHour').classList.toggle('is-active',pickerPhase==='hour');
  document.getElementById('timePickerMinute').classList.toggle('is-active',pickerPhase==='minute');
  const selectedValue=pickerPhase==='hour'?pickerHour:pickerMinute;
  const values=pickerPhase==='hour'?Array.from({length:24},(_,hour)=>hour):Array.from({length:12},(_,minute)=>minute*5);
  const labels=values.map(value=>{
    const isUnavailable=pickerPhase==='hour'
      ? !Array.from({length:12},(_,index)=>index*5).some(minute=>isCurrentPickerTimeAvailable(value,minute))
      : !isCurrentPickerTimeAvailable(pickerHour,value);
    const innerRing=pickerPhase==='hour'&&value>=12;
    const dialValue=pickerPhase==='hour'?value%12:value/5;
    const angle=dialValue*30;
    const radius=pickerPhase==='hour'?(innerRing?26:41):41;
    const x=50+Math.sin(angle*Math.PI/180)*radius;
    const y=50-Math.cos(angle*Math.PI/180)*radius;
    const label=pickerPhase==='hour'?displayPickerHour(value):String(value).padStart(2,'0');
    const selected=value===selectedValue;
    const period=value<12?'AM':'PM';
    return `<button class="time-picker-option${selected?' is-selected':''}" type="button" data-picker-value="${value}" style="--option-x:${x}%;--option-y:${y}%" aria-pressed="${selected}" aria-label="${pickerPhase==='hour'?`${label} ${period}`:`${label} minutes`}"${isUnavailable?' disabled aria-disabled="true"':''}>${label}</button>`;
  }).join('');
  const selectedDialValue=pickerPhase==='hour'?pickerHour%12:pickerMinute/5;
  const angle=selectedDialValue*30;
  const handLength=pickerPhase==='hour'&&pickerHour>=12?26:41;
  face.dataset.phase=pickerPhase;
  face.innerHTML=`<div class="time-picker-hand" style="--hand-angle:${angle}deg;--hand-length:${handLength}%"><span></span></div>${labels}`;
  if(timePickerTarget==='order'){
    const bounds=getOrderTimeBounds();
    const [startHour,startMinute]=[Math.floor(bounds.start/60),bounds.start%60];
    const [endHour,endMinute]=[Math.floor(bounds.end/60),bounds.end%60];
    instruction.textContent=pickerPhase==='hour'
      ? `Available: ${formatTimeWithPeriod(`${String(startHour).padStart(2,'0')}:${String(startMinute).padStart(2,'0')}`)}–${formatTimeWithPeriod(`${String(endHour).padStart(2,'0')}:${String(endMinute).padStart(2,'0')}`)}.`
      : 'Choose a 5-minute time within delivery availability.';
  }else{
    instruction.textContent='Choose a time in 5-minute increments.';
  }
  document.getElementById('timePickerAmBtn').setAttribute('aria-pressed',String(pickerHour<12));
  document.getElementById('timePickerPmBtn').setAttribute('aria-pressed',String(pickerHour>=12));
  document.getElementById('orderTimeNextBtn').hidden=pickerPhase!=='hour';
  document.getElementById('orderTimeSetBtn').hidden=pickerPhase!=='minute';
  face.querySelectorAll('.time-picker-option').forEach(option=>option.addEventListener('click',()=>selectTimePickerValue(Number(option.dataset.pickerValue))));
}
function selectTimePickerValue(value){
  if(pickerPhase==='hour'){
    if(!Array.from({length:12},(_,index)=>index*5).some(minute=>isCurrentPickerTimeAvailable(value,minute))) return;
    pickerHour=value;
    if(!isCurrentPickerTimeAvailable(pickerHour,pickerMinute)){
      pickerMinute=Array.from({length:12},(_,index)=>index*5).find(minute=>isCurrentPickerTimeAvailable(pickerHour,minute))??0;
    }
    document.getElementById('timePickerHour').textContent=displayPickerHour(value);
    document.getElementById('timePickerMinute').textContent=String(pickerMinute).padStart(2,'0');
  }else{
    if(!isCurrentPickerTimeAvailable(pickerHour,value)) return;
    pickerMinute=value;
    document.getElementById('timePickerMinute').textContent=String(value).padStart(2,'0');
  }
  renderTimePickerFace();
}
function openTimePicker(target='order'){
  timePickerTarget=target;
  const targetInputId=target==='order'?'orderTime':target;
  const currentValue=document.getElementById(targetInputId).value;
  const [hour,minute]=currentValue.split(':').map(Number);
  if(Number.isInteger(hour)&&Number.isInteger(minute)&&isCurrentPickerTimeAvailable(hour,minute)){
    pickerHour=hour;
    pickerMinute=minute;
  }else{
    const availableTime=firstAvailablePickerTime();
    pickerHour=availableTime?.hour??7;
    pickerMinute=availableTime?.minute??0;
  }
  const isOrderPicker=target==='order';
  const pickerLabels={
    stationOpeningTimeInput:['STATION HOURS','Choose opening time'],
    stationClosingTimeInput:['STATION HOURS','Choose closing time'],
    deliveryStartTimeInput:['DELIVERY HOURS','Choose delivery start time'],
    deliveryEndTimeInput:['DELIVERY HOURS','Choose delivery end time']
  };
  const isStationSchedule=target.startsWith('station_schedule');
  const [eyebrow,title]=isOrderPicker?['ORDER SCHEDULE','Choose a time']:(pickerLabels[target]||[isStationSchedule?'STATION HOURS':'DELIVERY HOURS',isStationSchedule?'Choose station time':'Choose delivery time']);
  document.getElementById('timePickerEyebrow').textContent=eyebrow;
  document.getElementById('timePickerTitle').textContent=title;
  document.getElementById('orderTimeNextBtn').textContent='Next';
  pickerPhase='hour';
  document.getElementById('timePickerHour').textContent=displayPickerHour(pickerHour);
  document.getElementById('timePickerMinute').textContent=String(pickerMinute).padStart(2,'0');
  renderTimePickerFace();
  document.getElementById('orderTimeDialog').showModal();
}
function selectClockTimeFromPointer(event){
  const face=document.getElementById('timePickerFace');
  const bounds=face.getBoundingClientRect();
  const offsetX=event.clientX-(bounds.left+bounds.width/2);
  const offsetY=event.clientY-(bounds.top+bounds.height/2);
  const angle=(Math.atan2(offsetX,-offsetY)*180/Math.PI+360)%360;
  const steps=pickerPhase==='hour'?12:12;
  const dialValue=Math.round(angle/(360/steps))%steps;
  if(pickerPhase==='hour'){
    const pointerRadius=Math.hypot(offsetX,offsetY)/(bounds.width/2)*100;
    selectTimePickerValue(dialValue+(pointerRadius<34?12:0));
  }else{
    selectTimePickerValue(dialValue*5);
  }
}
document.getElementById('orderTimeTrigger').addEventListener('click',()=>openTimePicker('order'));
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-settings-time-picker]');
  if(button&&!button.disabled) openTimePicker(button.dataset.settingsTimePicker);
});
document.getElementById('orderTimeNextBtn').addEventListener('click',()=>{pickerPhase='minute';renderTimePickerFace();});
document.getElementById('timePickerAmBtn').addEventListener('click',()=>selectTimePickerPeriod('AM'));
document.getElementById('timePickerPmBtn').addEventListener('click',()=>selectTimePickerPeriod('PM'));
document.getElementById('timePickerHour').addEventListener('click',()=>{pickerPhase='hour';renderTimePickerFace();});
document.getElementById('timePickerMinute').addEventListener('click',()=>{pickerPhase='minute';renderTimePickerFace();});
const timePickerFace=document.getElementById('timePickerFace');
let isDraggingTimePicker=false;
timePickerFace.addEventListener('pointerdown',event=>{
  if(event.target.closest('.time-picker-option')) return;
  isDraggingTimePicker=true;
  timePickerFace.setPointerCapture(event.pointerId);
  selectClockTimeFromPointer(event);
});
timePickerFace.addEventListener('pointermove',event=>{if(isDraggingTimePicker) selectClockTimeFromPointer(event);});
timePickerFace.addEventListener('pointerup',()=>{isDraggingTimePicker=false;});
timePickerFace.addEventListener('pointercancel',()=>{isDraggingTimePicker=false;});
document.getElementById('orderTimeCloseBtn').addEventListener('click',()=>document.getElementById('orderTimeDialog').close());
document.getElementById('orderTimeCancelBtn').addEventListener('click',()=>document.getElementById('orderTimeDialog').close());
document.getElementById('orderTimeSetBtn').addEventListener('click',()=>{
  const selectedTime=`${String(pickerHour).padStart(2,'0')}:${String(pickerMinute).padStart(2,'0')}`;
  const isOrderPicker=timePickerTarget==='order';
  const targetInput=document.getElementById(isOrderPicker?'orderTime':timePickerTarget);
  targetInput.value=selectedTime;
  if(isOrderPicker){
    document.getElementById('orderTimeDisplay').textContent=formatTimeWithPeriod(selectedTime);
    clearOrderFieldValidation('time_slot');
  }else{
    document.getElementById(`${timePickerTarget.replace('Input','')}Display`).textContent=formatTimeWithPeriod(selectedTime);
    targetInput.dispatchEvent(new Event('input',{bubbles:true}));
    targetInput.dispatchEvent(new Event('change',{bubbles:true}));
  }
  document.getElementById('orderTimeDialog').close();
  if(isOrderPicker) updateOrderSummary();
});
document.getElementById('customerOrderForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!requireCustomerAccount()) return;
  const form=event.currentTarget;
  if(!validateOrderForm(form)){
    const firstInvalid=form.querySelector('.order-choice-grid.has-invalid input,.is-invalid');
    firstInvalid?.focus();
    return;
  }
  try{
    await loadPricingSettings();
  }catch(error){
    const feedback=document.getElementById('orderFeedback');
    feedback.textContent='Pricing could not be loaded. Please try again.';
    feedback.hidden=false;
    return;
  }
  updateOrderSummary();
  if(!pricingSettings||Number(pricingSettings.alkaline_price_per_gallon)<=0||Number(pricingSettings.purified_price_per_gallon)<=0||Number(pricingSettings.delivery_price_per_km)<=0){
    const feedback=document.getElementById('orderFeedback');
    feedback.textContent='Prices are not configured yet. Please contact TubiPure.';
    feedback.hidden=false;
    return;
  }
  if(new FormData(form).get('fulfillment_method')==='delivery'&&document.getElementById('orderCoverageResult').classList.contains('is-outside-service-area')){
    const feedback=document.getElementById('orderFeedback');
    feedback.textContent=OUTSIDE_DELIVERY_AREA_MESSAGE;
    feedback.hidden=false;
    return;
  }
  if(new FormData(form).get('fulfillment_method')==='delivery'&&!document.getElementById('orderZone').value){
    showOrderFieldError('delivery_zone','Choose a saved address with a map pin to calculate coverage.');
    return;
  }
  document.getElementById('orderFeedback').hidden=true;
  document.getElementById('orderSummaryDialog').showModal();
});

document.getElementById('orderEditBtn').addEventListener('click',()=>document.getElementById('orderSummaryDialog').close());
document.getElementById('orderConfirmBtn').addEventListener('click',async()=>{
  const form=document.getElementById('customerOrderForm');
  const feedback=document.getElementById('orderFeedback');
  const confirmButton=document.getElementById('orderConfirmBtn');
  confirmButton.disabled=true;
  confirmButton.textContent='Sending…';
  const formData=new FormData(form);
  const data=Object.fromEntries(formData.entries());
  data.container_size_gallons=Number(data.container_size_gallons);
  if(data.quantity) data.quantity=Number(data.quantity);
  if(data.alkaline_quantity) data.alkaline_quantity=Number(data.alkaline_quantity);
  if(data.purified_quantity) data.purified_quantity=Number(data.purified_quantity);
  try{
    const result=await api('/my/orders',{method:'POST',body:JSON.stringify(data)});
    document.getElementById('orderSummaryDialog').close();
    await refreshSession();
    const total=result.data.order_total;
    document.getElementById('orderSuccessTotal').textContent=`₱${Number(total).toFixed(2)}`;
    document.getElementById('orderSuccessMessage').textContent=result.data.fulfillment_method==='pickup'
      ? `Your pickup request is saved. Water total: ₱${Number(total).toFixed(2)}. Our team will confirm the schedule.`
      : `Your delivery request is saved. Estimated total: ₱${Number(total).toFixed(2)}. Our team will confirm the schedule.`;
    document.getElementById('orderSuccessDialog').showModal();
    form.reset();
    document.getElementById('orderDate').value=todayStr;
    renderCustomerOrder();
    window.scrollTo({top:0,behavior:'smooth'});
  }catch(error){
    document.getElementById('orderSummaryDialog').close();
    Object.entries(error.errors||{}).forEach(([field,messages])=>{
      const target=document.querySelector(`[data-error-for="${field}"]`);
      if(target) target.textContent=messages[0];
    });
    feedback.textContent=error.message;
    feedback.hidden=false;
  }finally{
    confirmButton.disabled=false;
    confirmButton.textContent='Confirm and send';
  }
});
document.getElementById('orderViewHistoryBtn').addEventListener('click',()=>{
  document.getElementById('orderSuccessDialog').close();
  pendingJump='myOrdersCard';
  go('myaccount');
});
document.getElementById('orderAgainBtn').addEventListener('click',()=>document.getElementById('orderSuccessDialog').close());
document.getElementById('closeOrderSuccessBtn').addEventListener('click',()=>document.getElementById('orderSuccessDialog').close());
document.getElementById('orderSuccessDialog').addEventListener('click',event=>{
  if(event.target===event.currentTarget) event.currentTarget.close();
});

/* ---------------- MODAL HELPERS ---------------- */
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.overlay').forEach(ov=>{
  ov.addEventListener('click', (e)=>{ if(e.target===ov) ov.classList.remove('open'); });
  ov.querySelectorAll('[data-close]').forEach(b=> b.addEventListener('click', ()=> ov.classList.remove('open')));
});
document.addEventListener('keydown', (e)=>{
  if(e.key==='Escape'){
    closeNavProfileMenu();
    document.querySelectorAll('.overlay.open').forEach(o=>o.classList.remove('open'));
  }
});

async function refreshSession(){
  const previousUserId=currentUser?.id;
  const data = await api('/me');
  currentUser = data.user;
  if(String(previousUserId||'')!==String(currentUser.id)) liveNotificationUserId=String(currentUser.id);
  updateAuthNavigation();
  const pricingResponse=await api('/pricing').catch(()=>null);
  pricingSettings=pricingResponse?.data||null;
  updateDeliveryHoursCard();
  if(currentUser.customer){
    currentUser.customer.addresses = currentUser.customer.addresses || [];
    const savedAddresses=await api('/my/addresses');
    currentUser.customer.addresses=savedAddresses.data;
    currentUser.customer.deliveries = (currentUser.customer.deliveries||[]).map(delivery=>({
      id:delivery.id,
      createdAt:delivery.created_at,
      customerId:delivery.customer_id,
      date:delivery.date,
      time:delivery.time_slot,
      gallons:delivery.gallons,
      status:delivery.status,
      statusNote:delivery.status_note,
      address:delivery.delivery_address||currentUser.customer.address,
      waterType:delivery.water_type,
      waterTypes:delivery.water_types,
      containerSizeGallons:delivery.container_size_gallons,
      quantity:delivery.quantity,
      alkalineQuantity:delivery.alkaline_quantity,
      purifiedQuantity:delivery.purified_quantity,
      fulfillmentMethod:delivery.fulfillment_method,
      deliveryLatitude:delivery.delivery_latitude,
      deliveryLongitude:delivery.delivery_longitude,
      paymentMethod:delivery.payment_method,
      deliveryZone:delivery.delivery_zone,
      ratePerGallon:delivery.rate_per_gallon,
      deliveryFee:delivery.delivery_fee,
      orderTotal:delivery.order_total,
      contactName:delivery.contact_name,
      contactPhone:delivery.contact_phone,
      deliveryAddress:delivery.delivery_address,
      deliveryInstructions:delivery.delivery_instructions,
      customer:{id:currentUser.customer.id,name:currentUser.customer.name}
    }));
  }
  if(currentUser.role==='staff') await loadStaffData();
  else{
    customers = currentUser.customer ? [currentUser.customer] : [];
    deliveries = currentUser.customer?.deliveries||[];
  }
  updateAuthNavigation();
}

/* ---------------- INIT ---------------- */
updateAuthNavigation();
const startRoute = (location.hash || '#home').replace('#','');
const validRoutes = ['home','dashboard','customers','users','scheduler','order-history','kmr','datetime','myaccount','order','profile','change-password','address','about','contact'];
const isPasswordResetRoute=location.pathname.startsWith('/reset-password/');
if(isPasswordResetRoute){
  document.getElementById('resetEmail').value=new URLSearchParams(location.search).get('email')||'';
  setAuthMode('reset');
}
refreshSession().then(()=>{
  const route = isPasswordResetRoute ? 'myaccount' : (validRoutes.includes(startRoute) ? startRoute : 'home');
  const intent = new URLSearchParams(location.search).get('intent');
  pendingJump = intent==='my-orders' ? 'myOrdersCard' : null;
  const requestedRoute=intent==='order' && currentUser?.role==='customer'?'order':route;
  go(currentUser.role==='staff' ? route : (['dashboard','customers','users','scheduler','order-history','kmr','datetime'].includes(route) ? 'myaccount' : requestedRoute));
  if(currentUser.role==='staff'&&activePage!=='page-users') refreshNewUserCount();
  renderNotifications();
}).catch(async()=>{
  if(currentUser){
    updateAuthNavigation();
    const route = isPasswordResetRoute ? 'myaccount' : (validRoutes.includes(startRoute) ? startRoute : 'home');
    const intent = new URLSearchParams(location.search).get('intent');
    const requestedRoute=intent==='order' && currentUser.role==='customer'?'order':route;
    go(currentUser.role==='staff' ? route : (['dashboard','customers','users','scheduler','order-history','kmr','datetime'].includes(route) ? 'myaccount' : requestedRoute));
    return;
  }
  currentUser=null;
  updateAuthNavigation();
  await loadPricingSettings().catch(()=>null);
  const route = isPasswordResetRoute ? 'myaccount' : (validRoutes.includes(startRoute) ? startRoute : 'home');
  go(['dashboard','customers','users','scheduler','order-history','kmr','datetime'].includes(route) ? 'myaccount' : route);
});

})();
