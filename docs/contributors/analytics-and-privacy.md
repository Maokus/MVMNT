# Analytics and privacy

MVMNT uses PostHog EU Cloud for optional product analytics and renderer error reporting. Analytics
is disabled until the user explicitly opts in. Declining must not initialize the SDK, create a
PostHog identifier, or make a PostHog request.

## Privacy contract

- Consent policy version: `2026-08-17-v1`.
- Event and error retention: 12 months.
- Signed-in identity: Supabase account UUID only.
- Disabled features: autocapture, automatic page views and leaves, session replay, heatmaps,
  surveys, performance capture, console capture, dead/rage clicks, and feature flags.
- Prohibited data: email, username, scene or file names, paths, URLs and query strings, MIDI/audio/
  image/font contents, free-form content, plugin UIDs, passwords, tokens, and raw commands.
- Development builds stay disabled unless `VITE_PUBLIC_POSTHOG_ENABLE_DEVELOPMENT=true` and a
  separate development project token is configured.

All instrumentation goes through `src/app/analytics.ts`. Do not import `posthog-js` elsewhere.
Add new event names and typed properties to `AnalyticsEventMap`, keep properties categorical, and
extend the sanitizer tests whenever a new data category is introduced.

## Event catalog

| Area       | Events                                                                                             | Safe properties                                                           |
| ---------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Consent    | `analytics_consent_granted`, `analytics_consent_withdrawn`                                         | policy version                                                            |
| Navigation | `app_opened`, `screen_viewed`                                                                      | allowlisted screen                                                        |
| Activation | `document_created`, `document_opened`, `media_imported`, `scene_element_added`, `playback_started` | entry point, source, media type, built-in element type or `plugin`        |
| Creation   | `template_applied`, `document_saved`, `document_operation_failed`                                  | entry point, save mode, operation, failure category                       |
| Export     | `export_started`, `export_completed`, `export_failed`, `export_cancelled`                          | format, audio/transparency flags, execution mode, failure category        |
| Community  | sign-up/sign-in/sign-out, item download/open/install/upload/rating                                 | item type and numeric rating only                                         |
| Errors     | PostHog `$exception`                                                                               | error type, redacted value, sanitized stack coordinates, release metadata |

Milestone events derived from command telemetry must require success, reject transient commands,
and never forward command objects. High-frequency activation events are deduplicated once per app
session. Document, save, and export outcomes are emitted from their completion boundaries rather
than button clicks.

## PostHog project configuration

Create an EU Cloud project and configure these repository settings:

- Variable `POSTHOG_EU_PROJECT_TOKEN`: public ingestion token used in packaged renderer builds.
- Variable `POSTHOG_PROJECT_ID`: EU project ID used only for source-map upload.
- Secret `POSTHOG_API_KEY`: personal key scoped to error-tracking write and organization read.

In PostHog, discard client IP addresses, disable GeoIP enrichment and all disabled client features,
set event/error retention to 12 months, require MFA, limit project access, and complete the relevant
DPA/subprocessor review. The client settings are intentionally restrictive even if a project
setting is changed later.

Stable and nightly packaging uploads renderer source maps under release name `mvmnt-desktop`, using
the package version and build commit. The upload plugin deletes maps after upload, while its injected
chunk metadata remains in packaged JavaScript. If CI credentials are absent, builds still succeed
but source maps are not uploaded.

## Saved views

Create and maintain these PostHog views:

1. Activation funnel: `app_opened` → document created/opened → `media_imported` →
   `scene_element_added` → `playback_started` → `export_completed`.
2. Weekly retention: users who reached `export_completed`, returning via `app_opened`.
3. Adoption: template, media, element, export, and community events by their categorical fields.
4. Release health: `$exception`, document failures, and export failures by app version and channel.

## Access and deletion requests

Requests arrive through `https://maok.us`. Ask for the analytics identifier shown on MVMNT's Privacy
page. A Community user may instead verify the email attached to their account; use Supabase admin
tools to resolve it to the auth UUID. Never request a password or project file.

Use a PostHog administrator account or server-side API credential to locate the distinct ID, delete
the person and associated events, and record the request and completion date. Confirm asynchronous
event deletion has completed before closing the request. Administrator credentials must never be
placed in Vite variables, application code, logs, or client-accessible Supabase tables/functions.

Withdrawing consent stops future capture and resets the local analytics identity; it does not imply
deletion of previously collected events, which follows the verified request process above.
