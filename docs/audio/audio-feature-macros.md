# Audio feature macros

_Last reviewed: 2025-10-09_

## Overview

Audio-driven elements now use the shared timeline track reference model, so the same macro tooling that
controls MIDI tracks can drive audio feature visualizations. Audio track macros store the track binding
while feature descriptors continue to live on the element, making it easy to swap calculators without
rewiring assignments.

## Assigning audio tracks to macros

1. Select an audio-reactive element (for example, **Audio Spectrum**) in the inspector.
2. Use the new **Audio Binding** group to pick an audio track, then configure the feature descriptor.
3. Click the link icon to create or assign a macro. The macro is created with `allowedTrackTypes: ['audio']`,
   so only audio tracks appear in macro dialogs and Timeline selectors.
4. Reuse the macro on any element that expects an audio track reference.

## Inspector layout

The inspector now groups the track selector and descriptor editor together with inline guidance. When an
audio track is assigned via a macro, the descriptor stays editable so creators can tweak smoothing and
channel preferences without editing the macro payload.

## Validation rules

Scene macros validate their assignments against the timeline store. If a macro that only accepts audio
tracks is set to a MIDI track (or vice versa), the store raises an error describing the mismatch. Existing
macros that reference missing tracks remain valid, preserving backward compatibility with older projects.

## Template spotlight

The bundled `default.mvt` template ships with an `audioSpectrumMacro` element wired to the new
`audioFeatureTrack` macro. This demonstrates how audio track macros drive feature sampling out of the box
and gives creators a starting point for further customization.
