# Audio cache popup research

## Existing implementation

-   **State management**: `src/state/audioDiagnosticsStore.ts` owns the popup state. It tracks `missingPopupVisible`, `missingPopupSuppressed`, and `missingPopupFingerprint` alongside the cache diff data. When `recomputeDiffs` detects missing descriptors (via `buildMissingFingerprint`), it raises the popup unless the fingerprint matches an already-dismissed set.
-   **UI surface**: `src/workspace/components/CacheDiagnosticsPopup.tsx` renders the popup. It reads the state store, wires the dismiss/regenerate handlers, and styles the overlay. The component is referenced from `src/workspace/layout/MidiVisualizer.tsx`, so it mounts on every workspace view.
-   **Feature gating**: `CacheDiagnosticsPopup` checks `isFeatureEnabled('feature.audioVis.cacheDiagnosticsPhase3')`, and the default flag map in `src/utils/featureFlags.ts` sets that flag to `false`. The diagnostics banner, panel, and export hooks use the same flag, so enabling the phase‑3 diagnostics feature is required for any of these surfaces to render.
-   **Automations and subscriptions**: The store subscribes to `subscribeToAnalysisIntents` and the timeline store to recompute diagnostics whenever cache data, status, or track membership changes. That work was added with the popup logic so that "missing" descriptors automatically trigger UI.
-   **Tests**: There is dedicated coverage in `src/state/__tests__/audioDiagnosticsStore.missingPopup.test.ts` for the store logic and in `src/workspace/components/__tests__/CacheDiagnosticsPopup.test.tsx` for the UI behaviour (rendering, dismiss, calculate). These tests set the feature flag override explicitly before asserting visibility.
-   **Related planning**: `thoughts/audio-diagnostics-fixes-plan.md` documents broader cache-diagnostics work (grouping by audio source, dismissal resets, calculator registration), aligning with the store changes that now power the popup.

## Why the popup may not appear

1. **Feature flag disabled**: With `feature.audioVis.cacheDiagnosticsPhase3` defaulting to `false`, the popup short-circuits before rendering. Unless the flag is flipped via `window.__MVMNT_FLAGS__` or the `VITE_FLAG_FEATURE_AUDIOVIS_CACHEDIAGNOSTICSPHASE3` env var, the banner, panel, and popup stay hidden even if diagnostics data exists.
2. **Only non-missing issues present**: `buildMissingFingerprint` only considers descriptors in the `missing` bucket. Stale or extraneous entries alone will not trigger the popup, even though they surface in the panel/banner. If the cache only reports stale/extraneous records, the popup remains suppressed by design.
3. **Popup previously dismissed for the same fingerprint**: `dismissMissingPopup` marks the popup as suppressed while the `missingPopupFingerprint` stays unchanged. On subsequent `recomputeDiffs` calls, the store checks `missingPopupSuppressed`; if the fingerprint hasnt changed, visibility stays `false`. The popup reappears only when the missing set changes (new fingerprint) or is cleared and reintroduced.
4. **Diagnostics not recomputing**: The popup relies on `useAudioDiagnosticsStore.getState().recomputeDiffs()` running when analysis intents publish or caches update. If those subscriptions are bypassed (for example, running outside the workspace layout that registers `subscribeToAnalysisIntents`), `missingPopupVisible` never flips to `true`. Verifying that intents publish for the relevant elements is necessary when testing in alternate environments.

## Notes & next steps

-   Confirm the feature flag is enabled in the environment where the popup is expected.
-   If persistent visibility after dismissal is required, the suppression logic would need an explicit reset path (e.g., on navigation or after a timeout).
-   Consider extending `buildMissingFingerprint` to include stale descriptors if the popup should warn about them as well.
-   Ensure QA exercises the flow with fresh missing descriptors to differentiate between dismissal suppression and feature-flag gating.
