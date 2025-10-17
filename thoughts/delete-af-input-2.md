# AudioFeatureDescriptorInput Removal Follow-up
_Status: Tracking_
_Created: 14 February 2026_

## Future Work
-   Audit property schemas for lingering `audioFeatureDescriptor` types in saved scenes or fixtures; add validation that surfaces a user-facing error when unsupported types are encountered.
-   Consider introducing a lightweight helper around `TimelineTrackSelect` if future features need to pair audio tracks with other dependent inputs.
-   Review analytics and onboarding flows to ensure documentation updates adequately cover the absence of the descriptor editor.

## Remaining Cleanup for Complete Removal
-   Delete legacy CSS selectors such as `.ae-audio-binding-*` if they exist in static stylesheets once verified unused.
-   Re-run content audit on `/docs/audio` topics to replace any screenshots or walkthroughs that referenced the removed control.
-   Confirm scene migration utilities (`unifyChannelField`, cache migrations) no longer mention descriptor editors to avoid confusion for maintainers.

## References
-   `docs/audio/audio-cache-system.md`
-   `thoughts/as-implementation-3.md`
