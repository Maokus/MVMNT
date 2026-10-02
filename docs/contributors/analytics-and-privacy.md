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

All instrumentation goes through the provider-neutral `analytics` service exported by
`src/app/analytics.ts`. Application and domain code must not import `posthog-js` or depend on
PostHog event shapes. The service owns consent, runtime event validation, common build context,
milestone deduplication, and consent-gated renderer exception listeners. Provider adapters own SDK
loading, transport, provider persistence, and final wire-format defenses.

Add new event names, typed properties, and matching runtime validators together. Properties must be
categorical or bounded numeric values, except for the random UUID that pairs one export attempt
with its outcome. Events with unknown properties or invalid values are rejected before they reach
a provider. A replacement provider implements `AnalyticsProvider`; application call sites and
consent behavior remain unchanged.

PostHog's browser SDK puts the public project token in each event's properties for ingestion. The
provider's final privacy guard strips incoming `token` values, then restores only its configured
public project token. This transport field is separate from application event properties and must
remain present for events to be accepted.

## Event catalog

| Area       | Events                                                                                                                                                   | Safe properties                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Consent    | `analytics_consent_granted`, `analytics_consent_withdrawn`                                                                                               | policy version                                                                                               |
| Navigation | `app_opened`, `screen_viewed`                                                                                                                            | allowlisted screen                                                                                           |
| Tutorial   | start, bounded step completion, completion, dismissal, setup failure                                                                                     | fixed step and failure-stage labels only                                                                     |
| Activation | `document_created`, `document_opened`, `independent_project_started`, `media_imported`, `media_import_failed`, `scene_element_added`, `playback_started` | entry point, source, media type, bounded import stage, built-in element type or `plugin`                     |
| Creation   | `template_applied`, `document_saved`, `document_operation_failed`                                                                                        | entry point, save mode, operation, failure category                                                          |
| Export     | `export_started`, `export_completed`, `export_failed`, `export_cancelled`                                                                                | random attempt UUID, format, audio/transparency flags, execution mode, bounded duration and failure category |
| Community  | sign-up/sign-in/sign-out, item download/open/install/upload/rating                                                                                       | item type and numeric rating only                                                                            |
| Plugins    | `plugin_operation_failed`                                                                                                                                | install/upgrade and download/load stage only                                                                 |
| Errors     | provider-neutral renderer exception report                                                                                                               | error type, fatal state, mechanism, sanitized stack coordinates                                              |

The PostHog adapter maps renderer exception reports to `$exception` only at its boundary. Milestone
events derived from command telemetry must require success, reject transient commands,
and never forward command objects. Playback is deduplicated once per app session; media imports
and element additions are deduplicated once per category per app session. Document, save, and export
outcomes are emitted from their completion boundaries rather than button clicks. User-cancelled
document imports and saves do not count as failures. Background export setup failures use the
`output` category; renderer failures use `render`. Export attempt IDs are random job UUIDs used
only to pair one start with one terminal outcome. Duration is bucketed from job creation to its
terminal status, including background setup time. Missing or invalid timestamps use `unknown`.
Tutorial `render` completion means rendering started, not that the export succeeded; successful
export is measured separately. Tutorial progress and independent-project starts never include
scene content or project identifiers.

## PostHog project configuration

Create an EU Cloud project and configure these repository settings:

- Variable `POSTHOG_EU_PROJECT_TOKEN`: public ingestion token used in packaged renderer builds.
- Variable `POSTHOG_PROJECT_ID`: EU project ID used only for source-map upload.
- Secret `POSTHOG_API_KEY`: personal key scoped to error-tracking write and organization read.

In PostHog, discard client IP addresses, disable GeoIP enrichment and all disabled client features,
set event/error retention to 12 months, require MFA, limit project access, and complete the relevant
DPA/subprocessor review. Every PostHog event also sets `$geoip_disable=true`; client settings remain
restrictive even if a project setting changes later. The authorized-URLs health warning is accepted
as inapplicable while page views and web analytics remain disabled for the Electron renderer.

Stable and nightly packaging uploads renderer source maps under release name `mvmnt-desktop`, using
the same exact version and commit injected into analytics. The upload plugin uses hidden maps and
deletes them after upload; packaging also excludes all `.map` files. If CI credentials are absent,
the build succeeds without emitting renderer maps.

Every event receives these provider-neutral dimensions:

- `app_version`: exact manifest version, including the unique nightly prerelease.
- `app_release_line`: base `major.minor.patch` used to aggregate a nightly series with its intended release.
- `build_channel`: `development`, `nightly`, or `stable`.
- `build_commit`: exact source revision used for the build.
- `runtime`, coarse `platform`, and `consent_policy_version`.

Stable and opted-in nightly builds use the production EU project. The Product Health dashboard
includes both channels; filter `build_channel` or `app_version` to inspect one release. Development
analytics is off by default and must use a separate development project when explicitly enabled.

## Saved views

The [MVMNT Product Health dashboard](https://eu.posthog.com/project/250591/dashboard/899765)
is pinned in the production project. It shows:

1. Weekly distinct opted-in users from `app_opened`, by channel and exact app version.
2. An ordered creation-to-export funnel: `app_opened` → successful document created/opened →
   `export_started` → `export_completed`. Media import, element addition, and playback are useful
   feature milestones, but none is required for every valid export workflow.
3. Weekly retention after a user's first `app_opened`, and separately after their first
   `export_completed`, each measured by a later `app_opened`.
4. Weekly export starts, completions, failures, and cancellations, plus completed exports by
   format. The dashboard also shows creation, save, media, element, template, and Community
   activity. Media imports are broken down by type, and Community actions are shown separately.
5. Release health: `$exception`, document operation failures, media import failures, and export
   plugin failures and export failures, with channel and version filters.
6. Tutorial starts, completions, dismissals, and setup failures; independent-project journeys;
   and successful export duration buckets.

The [MVMNT Workflow Diagnostics dashboard](https://eu.posthog.com/project/250591/dashboard/992915)
shows tutorial steps, media and plugin failure stages, export duration, and release health. The
independent-project funnel links events by opted-in user within 30 days, not by project file.
Tutorial, independent-project, duration, and failure-stage events are absent from older builds;
filter by `app_version` when comparing releases.

These are opt-in measures, not download or installation totals. `app_opened` is captured once per
app run after consent; media and element milestones are captured once per type per app run. Export,
save, and Community action counts reflect completed actions or attempts as named by each event.
Retention cohorts need subsequent weeks of data. A release-health chart with no data means no
recorded failures in the selected period, not that ingestion has stopped; check weekly active users
and the Activity event feed to confirm ingestion. The generic PostHog starter dashboard uses
autocapture and page-view events that MVMNT intentionally disables and is therefore unpinned.

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

## Administrative acceptance checklist

- GitHub variables: `POSTHOG_EU_PROJECT_TOKEN` and `POSTHOG_PROJECT_ID`.
- GitHub secret: scoped `POSTHOG_API_KEY`; never expose it to Vite or packaged code.
- PostHog: enforced 12-month retention, IP/GeoIP controls, restricted access, MFA, and completed DPA review.
- Releases: one stable and one nightly symbol set verified after CI packaging.
- Cleanup: remove synthetic smoke events and retire unwanted data in the former US project.
