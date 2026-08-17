import posthog from 'posthog-js';

const projectToken = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;

if (projectToken && host) {
    posthog.init(projectToken, {
        api_host: host,
        defaults: '2026-01-30',
        capture_exceptions: {
            capture_unhandled_errors: true,
            capture_unhandled_rejections: true,
            capture_console_errors: false,
        },
    });
} else if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    const missingVariable = projectToken ? 'VITE_PUBLIC_POSTHOG_HOST' : 'VITE_PUBLIC_POSTHOG_PROJECT_TOKEN';
    throw new Error(
        `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`
    );
}

export { posthog };
