# Release notes — Audio feature macros

_Last updated: 2025-10-09_

## Highlights

- Audio track macros share the timeline track reference model, allowing creators to bind audio-driven
  elements through the same macro tooling used for MIDI tracks.
- Inspector panels display an **Audio Binding** group that combines the track selector and feature
  descriptor editor with inline copy to explain the workflow.
- Macro validation surfaces descriptive errors when a macro expects an audio track but receives a MIDI
  track (and vice versa), preventing silent misconfiguration.
- The bundled `default.mvt` template now includes an `audioSpectrumMacro` element wired to the
  `audioFeatureTrack` macro so new projects ship with an audio-driven example.

## Migration notes

Existing scenes continue to load without modification. Legacy audio feature bindings migrate to the new
track-reference model at import time, and macros without `allowedTrackTypes` default to MIDI so previous
projects keep their behavior. Creators can opt into audio track macros by reassigning the track selector in
the inspector and saving the updated macro.
