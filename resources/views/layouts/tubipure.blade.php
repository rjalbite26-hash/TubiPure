<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="app-timezone" content="{{ config('app.timezone') }}">
    <meta name="company-latitude" content="{{ config('water.company_location.latitude') }}">
    <meta name="company-longitude" content="{{ config('water.company_location.longitude') }}">
    <title>In-Order TubiPure — Water Delivery System</title>
    <link rel="icon" type="image/png" href="{{ asset('images/tubipure-logo.png') }}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap" rel="stylesheet">
    <script>
        (() => {
            try {
                const theme = localStorage.getItem('tubipure-theme');
                document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
            } catch {
                document.documentElement.dataset.theme = 'light';
            }
        })();
    </script>
    @vite(['resources/css/tubipure.css', 'resources/js/tubipure.js'])
</head>
<body>
    <aside class="admin-sidebar" id="adminSidebar" aria-label="Admin navigation" style="{{ auth()->user()?->role === 'staff' ? '' : 'display: none;' }}">
        <div class="admin-sidebar-header">
            <a class="admin-sidebar-brand" href="/#home" aria-label="TubiPure home">
                <img src="{{ asset('images/tubipure-logo.png') }}" alt="">
                <span class="admin-sidebar-brand-copy"><b>TubiPure</b><small>Admin workspace</small></span>
            </a>
            <button class="admin-sidebar-toggle" id="adminSidebarToggle" type="button" aria-label="Collapse admin navigation" aria-controls="adminSidebar" aria-expanded="true" title="Collapse sidebar">
                <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2"/><path d="M8 4v12"/></svg>
            </button>
        </div>
        <nav class="admin-sidebar-nav" aria-label="Admin sections">
            <button class="admin-sidebar-link" type="button" data-route="dashboard" title="Overview"><span class="admin-sidebar-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="4" rx="1.5"/><rect x="13.5" y="10.5" width="7" height="10" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/></svg></span><span class="admin-sidebar-label">Overview</span></button>
            <button class="admin-sidebar-link admin-sidebar-orders-link" type="button" data-route="scheduler" title="Orders"><span class="admin-sidebar-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 3 8.5 4.8v9.4L12 22l-8.5-4.8V7.8L12 3Z"/><path d="m3.5 7.8 8.5 4.9 8.5-4.9M12 12.7V22M8 5.3l8.5 4.9"/></svg></span><span class="admin-sidebar-label">Orders</span><span class="admin-sidebar-order-count" id="adminPendingOrderCount" hidden aria-label="Active orders"></span></button>
            <button class="admin-sidebar-link admin-sidebar-sub-link admin-sidebar-order-history-link" type="button" data-route="order-history" title="Order History"><span class="admin-sidebar-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5.5h16v15H4z"/><path d="M8 3.5v4M16 3.5v4M4 10h16M8 14h3M8 17h6"/></svg></span><span class="admin-sidebar-label">Order History</span></button>
            <button class="admin-sidebar-link" type="button" data-route="customers" title="Customer Records"><span class="admin-sidebar-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg></span><span class="admin-sidebar-label">Customer Records</span></button>
            <button class="admin-sidebar-link admin-sidebar-sub-link" type="button" data-route="users" title="Users"><span class="admin-sidebar-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M17 15a5 5 0 0 1 3.5 4.8"/></svg></span><span class="admin-sidebar-label">Users</span><span class="admin-sidebar-order-count" id="adminNewUserCount" hidden aria-label="Newly registered accounts"></span></button>
            <button class="admin-sidebar-link" type="button" data-route="kmr" title="Pricing"><span class="admin-sidebar-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v4c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 9v4c0 1.7 3.6 3 8 3s8-1.3 8-3V9M4 13v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4"/></svg></span><span class="admin-sidebar-label">Pricing</span></button>
            <button class="admin-sidebar-link" type="button" data-route="datetime" title="Date &amp; Time"><span class="admin-sidebar-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M12 13v4l2.5 1.5"/></svg></span><span class="admin-sidebar-label">Date &amp; Time</span></button>
        </nav>
        <div class="admin-sidebar-bottom">
            <button class="admin-sidebar-create-report" id="adminCreateOrdersReport" type="button" title="Create orders report" aria-label="Create orders report"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h8l4 4V20H6z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h6M9 8.5h2"/></svg><span>Create Report</span></button>
            <div class="admin-sidebar-account">
            <button class="admin-sidebar-link admin-sidebar-home-link" type="button" data-route="home" title="Back to Home" aria-label="Back to Home">
                <span class="admin-sidebar-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m3.5 10 8.5-7 8.5 7M5.5 9v11h13V9M9 20v-6h6v6"/></svg></span>
                <span class="admin-sidebar-label">Back to Home</span>
            </button>
            <div class="admin-sidebar-profile-wrap">
              <button class="admin-sidebar-link admin-sidebar-profile-toggle" id="adminSidebarProfileToggle" type="button" title="Profile" aria-label="Open profile actions" aria-haspopup="true" aria-expanded="false" aria-controls="adminSidebarProfileMenu">
                  <span class="admin-sidebar-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg></span>
                  <span class="admin-sidebar-label">Profile</span>
                  <svg class="admin-sidebar-profile-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              <div class="admin-sidebar-profile-menu" id="adminSidebarProfileMenu" aria-label="Profile actions" hidden>
                <button class="admin-sidebar-profile-menu-item" id="adminSidebarSettingsBtn" type="button" aria-expanded="false" aria-controls="adminSidebarSettingsSubmenu"><svg viewBox="0 0 24 24" aria-hidden="true"><mask id="adminSettingsGearHole"><rect width="24" height="24" fill="#fff"/><circle cx="12" cy="12" r="3.5" fill="#000"/></mask><g fill="currentColor" mask="url(#adminSettingsGearHole)"><circle cx="12" cy="12" r="8.2"/><rect x="9.8" y=".5" width="4.4" height="8" rx="1.5"/><rect x="9.8" y=".5" width="4.4" height="8" rx="1.5" transform="rotate(45 12 12)"/><rect x="9.8" y=".5" width="4.4" height="8" rx="1.5" transform="rotate(90 12 12)"/><rect x="9.8" y=".5" width="4.4" height="8" rx="1.5" transform="rotate(135 12 12)"/><rect x="9.8" y=".5" width="4.4" height="8" rx="1.5" transform="rotate(180 12 12)"/><rect x="9.8" y=".5" width="4.4" height="8" rx="1.5" transform="rotate(225 12 12)"/><rect x="9.8" y=".5" width="4.4" height="8" rx="1.5" transform="rotate(270 12 12)"/><rect x="9.8" y=".5" width="4.4" height="8" rx="1.5" transform="rotate(315 12 12)"/></g></svg><span>Settings</span><svg class="admin-settings-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
                <div class="admin-sidebar-settings-submenu" id="adminSidebarSettingsSubmenu" aria-label="Settings pages" hidden>
                    <button class="admin-sidebar-profile-menu-item" type="button" data-route="profile"><span>Personal Information</span></button>
                    <button class="admin-sidebar-profile-menu-item" type="button" data-route="change-password"><span>Change Password</span></button>
                    <button class="admin-sidebar-profile-menu-item admin-sidebar-theme-toggle" type="button" data-theme-toggle aria-label="Switch to dark mode" title="Switch to dark mode" aria-pressed="false">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 15.4A8.5 8.5 0 0 1 8.6 3.6 8.5 8.5 0 1 0 20.4 15.4Z"/></svg>
                        <span>Dark mode</span>
                        <span class="admin-theme-toggle-state" aria-hidden="true"></span>
                    </button>
                </div>
                <button class="admin-sidebar-profile-menu-item admin-sidebar-logout" id="adminSidebarLogoutBtn" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg><span>Log out</span></button>
              </div>
            </div>
            </div>
        </div>
    </aside>
    <button class="admin-sidebar-reopen" id="adminSidebarReopen" type="button" aria-label="Open admin navigation" aria-controls="adminSidebar" aria-expanded="false" title="Open sidebar">
        <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2"/><path d="M8 4v12"/></svg>
    </button>
    <button class="admin-sidebar-backdrop" id="adminSidebarBackdrop" type="button" aria-label="Close admin navigation" tabindex="-1"></button>
    @include('tubipure.partials.navigation')

    @yield('content')

    @include('tubipure.partials.footer')
    @include('tubipure.modals.customer-form')
    @include('tubipure.modals.customer-detail')
    @include('tubipure.modals.delivery-form')
    <dialog class="admin-action-dialog" id="adminActionDialog" aria-labelledby="adminActionTitle" aria-describedby="adminActionDescription">
        <div class="admin-action-dialog-card">
            <button class="admin-action-dialog-close" id="closeAdminActionDialog" type="button" aria-label="Close confirmation">&times;</button>
            <span class="admin-action-dialog-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 2.8 19a1.4 1.4 0 0 0 1.2 2.1h16a1.4 1.4 0 0 0 1.2-2.1L12 3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9v4.5m0 3h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
            <p class="admin-action-dialog-eyebrow" id="adminActionEyebrow">Admin action</p>
            <h2 id="adminActionTitle">Confirm this action?</h2>
            <p class="admin-action-dialog-description" id="adminActionDescription"></p>
            <p class="admin-action-dialog-record" id="adminActionRecordName"></p>
            <div class="admin-action-dialog-reason" id="adminActionReasonField" hidden>
                <label for="adminActionReason">Reason for rejection</label>
                <textarea id="adminActionReason" rows="3" maxlength="200" placeholder="Tell the customer why this order is being rejected."></textarea>
                <small>This reason will be saved with the order.</small>
            </div>
            <p class="admin-action-dialog-feedback" id="adminActionFeedback" role="status" aria-live="polite"></p>
            <div class="admin-action-dialog-buttons">
                <button class="btn btn-ghost" id="keepAdminActionButton" type="button" autofocus>Go back</button>
                <button class="btn" id="adminActionConfirmButton" type="button">Confirm</button>
            </div>
        </div>
    </dialog>
    <dialog class="orders-report-dialog" id="ordersReportDialog" aria-labelledby="ordersReportTitle">
        <form class="orders-report-card" id="ordersReportForm">
            <button class="orders-report-close" id="closeOrdersReportDialog" type="button" aria-label="Close report builder">&times;</button>
            <p class="orders-report-eyebrow">Orders workspace</p>
            <h2 id="ordersReportTitle">Create Report</h2>
            <p class="orders-report-description">Customize the information you want to include in your report.</p>

            <section class="orders-report-section" aria-labelledby="ordersReportDetailsHeading">
                <div class="orders-report-section-heading"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg><h3 id="ordersReportDetailsHeading">Report Details</h3><span></span></div>
                <div class="orders-report-fields orders-report-details-grid">
                    <label class="orders-report-field"><span>Report type</span><svg class="orders-report-control-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14v15H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg><select id="ordersReportType"><option value="orders" selected>Orders report</option><option value="sales">Sales report</option><option value="products">Product performance report</option><option value="delivery">Delivery report</option><option value="cancellations">Cancellations report</option></select></label>
                    <label class="orders-report-field"><span>Date range</span><svg class="orders-report-control-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/></svg><select id="ordersReportRange"><option value="today" selected>Today</option><option value="week">This week</option><option value="month">This month</option><option value="custom">Custom range</option></select></label>
                    <div class="orders-report-custom-range" id="ordersReportCustomRange" hidden>
                        <label class="orders-report-field"><span>From</span><input id="ordersReportDateFrom" type="date"></label>
                        <label class="orders-report-field"><span>To</span><input id="ordersReportDateTo" type="date"></label>
                    </div>
                </div>
            </section>

            <section class="orders-report-section" aria-labelledby="ordersReportFiltersHeading">
                <div class="orders-report-section-heading"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6.2 7.1v5.1l-3.6 1.8v-6.9L4 5Z"/></svg><h3 id="ordersReportFiltersHeading">Filters</h3><span></span></div>
                <div class="orders-report-fields orders-report-filters-grid">
                    <label class="orders-report-field"><span>Order status</span><svg class="orders-report-control-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h2M14 14l1.5 1.5L18 13"/></svg><select id="ordersReportStatus"><option value="">All statuses</option><option value="Pending">Pending</option><option value="Confirmed">Approved</option><option value="Out for Delivery">Out for delivery</option><option value="Delivered">Delivered</option><option value="Cancelled">Cancelled</option></select></label>
                    <label class="orders-report-field"><span>Water type</span><svg class="orders-report-control-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3s-6.5 7.7-6.5 12a6.5 6.5 0 0 0 13 0C18.5 10.7 12 3 12 3Z"/><path d="M9 16a3 3 0 0 0 3 2"/></svg><select id="ordersReportWaterType"><option value="">All water types</option><option value="Purified">Purified</option><option value="Alkaline">Alkaline</option></select></label>
                    <label class="orders-report-field"><span>Fulfillment method</span><svg class="orders-report-control-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7.5 9-4.5 9 4.5v9L12 21l-9-4.5v-9Z"/><path d="M12 21v-9M3.3 7.7 12 12l8.7-4.3M8 5l9 4.5"/></svg><select id="ordersReportFulfillment"><option value="">All methods</option><option value="delivery">Delivery</option><option value="pickup">Pickup</option></select></label>
                </div>
            </section>

            <fieldset class="orders-report-section orders-report-output-section">
                <legend class="sr-only">Report output format</legend>
                <div class="orders-report-section-heading"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg><h3>Report Output</h3><span></span></div>
                <div class="orders-report-format-grid">
                    <label class="orders-report-format-card is-selected">
                        <input type="radio" name="ordersReportFormat" value="preview" checked>
                        <svg class="orders-report-format-icon orders-report-preview-icon" viewBox="0 0 40 40" aria-hidden="true"><path d="M3 20s6.1-10 17-10 17 10 17 10-6.1 10-17 10S3 20 3 20Z"/><circle cx="20" cy="20" r="6"/></svg>
                        <span class="orders-report-format-copy"><strong>Preview</strong><small>View the report<br>before exporting.</small></span>
                        <span class="orders-report-radio-mark" aria-hidden="true"></span>
                    </label>
                    <label class="orders-report-format-card">
                        <input type="radio" name="ordersReportFormat" value="pdf">
                        <span class="orders-report-file-icon orders-report-pdf-icon" aria-hidden="true">PDF</span>
                        <span class="orders-report-format-copy"><strong>PDF</strong><small>Download the report<br>as a PDF file.</small></span>
                        <span class="orders-report-radio-mark" aria-hidden="true"></span>
                    </label>
                    <label class="orders-report-format-card">
                        <input type="radio" name="ordersReportFormat" value="csv">
                        <span class="orders-report-file-icon orders-report-csv-icon" aria-hidden="true"><svg viewBox="0 0 32 36"><path d="M6 2h13l8 8v23H6z"/><path d="M19 2v9h8"/><path d="M10 17h13M10 22h13M10 27h13"/></svg></span>
                        <span class="orders-report-format-copy"><strong>CSV</strong><small>Export the report<br>data as a CSV file.</small></span>
                        <span class="orders-report-radio-mark" aria-hidden="true"></span>
                    </label>
                </div>
            </fieldset>
            <p class="orders-report-feedback" id="ordersReportFeedback" role="status" aria-live="polite"></p>
            <div class="orders-report-actions">
                <button class="orders-report-cancel" id="cancelOrdersReport" type="button">Cancel</button>
                <button class="orders-report-generate" type="submit">Generate Report</button>
            </div>
        </form>
    </dialog>
    <dialog class="orders-report-dialog orders-report-preview-dialog" id="ordersReportPreviewDialog" aria-labelledby="ordersReportPreviewTitle">
        <section class="orders-report-preview-card">
            <button class="orders-report-close" id="closeOrdersReportPreview" type="button" aria-label="Close report preview">&times;</button>
            <p class="orders-report-eyebrow">Generated report</p>
            <h2 id="ordersReportPreviewTitle">Report preview</h2>
            <p class="orders-report-description" id="ordersReportPreviewDescription"></p>
            <div class="orders-report-summary" id="ordersReportPreviewSummary"></div>
            <div class="orders-report-table-wrap" id="ordersReportPreviewTable"></div>
            <div class="orders-report-actions">
                <button class="orders-report-cancel" id="closeOrdersReportPreviewDone" type="button">Done</button>
                <button class="orders-report-cancel" id="ordersReportPreviewCsv" type="button">Export CSV</button>
                <button class="orders-report-cancel" id="ordersReportPreviewPrint" type="button">Print</button>
                <button class="orders-report-generate" id="ordersReportPreviewPdf" type="button">Download PDF</button>
            </div>
        </section>
    </dialog>
    <div class="toast-stack" id="toastStack"></div>
</body>
</html>

