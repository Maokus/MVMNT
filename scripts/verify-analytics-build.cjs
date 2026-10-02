const token = process.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
const host = process.env.VITE_PUBLIC_POSTHOG_HOST;

if (!token || host !== 'https://eu.i.posthog.com') {
    console.error('Packaged builds require POSTHOG_EU_PROJECT_TOKEN and the EU PostHog ingestion host.');
    process.exitCode = 1;
}
