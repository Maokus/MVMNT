# Background exports

Desktop exports run in a hidden, throttling-disabled Electron renderer. The editor packages the scene when the job is queued, so the renderer imports an immutable `.mvt` snapshot and owns a separate canvas, visualizer, encoder, and audio mix. Editing the visible workspace therefore cannot change an active export.

The main process remains responsible for choosing and safely writing output files. The hidden renderer streams progress, cancellation, and terminal job state back to the editor through the desktop bridge. Only one job is processed at a time by the existing export queue.

Background exports are desktop-only. Browser exports retain the foreground path. An export does not survive quitting MVMNT: the close dialog offers to keep the application running or cancel active work, and partial temporary output is removed on cancellation.

The isolated renderer supports the same video, audio, transparent WebM, and PNG sequence settings as foreground export because it uses the existing `VideoExporter` and `ImageSequenceGenerator` after import.
