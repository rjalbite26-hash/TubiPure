import './theme.js';

(() => {
    'use strict';

    const page = document.querySelector('.auth-page');
    const form = document.getElementById('authForm');
    const submitButton = document.getElementById('authSubmit');
    const feedback = document.getElementById('authFeedback');
    const mode = page.dataset.authMode;

    const requestedIntent = new URLSearchParams(window.location.search).get('intent');
    if (['order', 'my-orders'].includes(requestedIntent)) {
        document.querySelectorAll('.auth-switch a').forEach((link) => {
            const url = new URL(link.href);
            url.searchParams.set('intent', requestedIntent);
            link.href = url.toString();
        });
    }

    const endpointByMode = {
        login: '/api/login',
        signup: '/api/register',
        forgot: '/api/password/forgot',
        reset: '/api/password/reset',
    };

    function clearFieldErrors() {
        form.querySelectorAll('.auth-field').forEach((field) => {
            field.classList.remove('has-error');
            field.querySelector('.auth-field-error').textContent = '';
        });

        feedback.className = 'auth-feedback';
        feedback.textContent = '';
    }

    function showFeedback(message, success = false) {
        feedback.textContent = message;
        feedback.className = `auth-feedback is-visible${success ? ' is-success' : ''}`;
    }

    function showLocalResetLink(resetUrl) {
        if (!resetUrl) {
            return;
        }

        const localUrl = new URL(resetUrl, window.location.origin);
        if (localUrl.origin !== window.location.origin) {
            return;
        }

        const link = document.createElement('a');
        link.className = 'auth-local-reset-link';
        link.href = localUrl.href;
        link.textContent = 'Open the local reset form';
        feedback.append(document.createElement('br'), link);
    }

    function showValidationErrors(errors) {
        Object.entries(errors || {}).forEach(([name, messages]) => {
            const field = form.querySelector(`[data-field="${name}"]`);
            if (!field) {
                return;
            }

            field.classList.add('has-error');
            field.querySelector('.auth-field-error').textContent = Array.isArray(messages) ? messages[0] : String(messages);
        });
    }

    form.querySelectorAll('input').forEach((input) => {
        input.addEventListener('input', () => {
            const field = input.closest('.auth-field');
            if (field) {
                field.classList.remove('has-error');
                field.querySelector('.auth-field-error').textContent = '';
            }
        });
    });

    document.querySelectorAll('[data-toggle-password]').forEach((button) => {
        button.addEventListener('click', () => {
            const input = document.getElementById(button.dataset.togglePassword);
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            button.textContent = isHidden ? 'Hide' : 'Show';
            button.setAttribute('aria-label', `${isHidden ? 'Hide' : 'Show'} password`);
        });
    });

    if (mode === 'login' && new URLSearchParams(window.location.search).get('reset') === 'success') {
        showFeedback('Your password has been updated. You can now log in.', true);
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearFieldErrors();

        if (!form.reportValidity()) {
            return;
        }

        const data = Object.fromEntries(new FormData(form).entries());
        data.email = data.email?.trim().toLowerCase();
        data.name = data.name?.trim();
        data.contact = data.contact?.trim();
        if (mode === 'reset') {
            data.token = page.dataset.resetToken;
        }

        submitButton.disabled = true;
        submitButton.classList.add('is-loading');

        try {
            const response = await fetch(endpointByMode[mode], {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content,
                },
                body: JSON.stringify(data),
            });
            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                showValidationErrors(payload.errors);
                const firstError = Object.values(payload.errors || {}).flat()[0];
                showFeedback(response.status === 419
                    ? 'Your session expired. Refresh the page and try again.'
                    : (firstError || payload.message || 'We could not complete that request. Please try again.'));
                return;
            }

            if (mode === 'forgot') {
                form.reset();
                showFeedback(payload.message, true);
                showLocalResetLink(payload.local_reset_url);
                return;
            }

            if (mode === 'reset') {
                window.location.assign('/login?reset=success');
                return;
            }

            if (payload.user?.role === 'staff') {
                window.location.assign('/#dashboard');
                return;
            }

            const safeIntent = ['order', 'my-orders'].includes(requestedIntent)
                ? `?intent=${requestedIntent}`
                : '';
            const destination = requestedIntent === 'order'
                ? '#order'
                : (requestedIntent === 'my-orders' ? '#myaccount' : '#home');
            window.location.assign(`/${safeIntent}${destination}`);
        } catch {
            showFeedback('We could not reach the server. Check your connection and try again.');
        } finally {
            submitButton.disabled = false;
            submitButton.classList.remove('is-loading');
        }
    });
})();
