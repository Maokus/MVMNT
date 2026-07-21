# Electron desktop improvements roadmap

Status: proposed. The secure Electron shell, native project open/save lifecycle, recovery snapshots,
file associations, installers, and updater are already implemented. See
[`docs/electron-desktop.md`](../docs/electron-desktop.md) for the shipped architecture. This roadmap
covers capabilities that the desktop boundary now makes practical, with export reliability and
performance as the first priority.

The ordering is intentional: phases 1–5 use platform-neutral web, Node, and Electron primitives.
Features with native binaries, OS-specific media frameworks, device drivers, or materially different
macOS/Windows behavior are deferred to phases 6–8.

## Decisions

- Keep the renderer sandboxed. Do not expose Node, arbitrary filesystem paths, shell execution, or
  untyped IPC to application or plugin code.
- Keep `.mvt` as the canonical, portable project format and preserve browser import/export
  compatibility where practical.
- Preserve the deterministic scene clock and renderer as the source of export frames. Desktop
  improvements should change transport, storage, isolation, and encoding without changing scene
  semantics.
- Treat every export as an immutable snapshot of project state and settings taken at job creation.
- Prefer capability detection and explicit fallbacks over assuming a codec, GPU, or native helper is
  available.
- Do not require a native encoder for ordinary MP4, WebM, audio, or image-sequence exports.
- Add benchmark evidence before claiming that a desktop path is faster than the existing WebCodecs
  path.

## Phase 1: Durable export destinations

Goal: remove browser-download behavior and whole-file memory pressure from desktop exports without
changing rendering or codec behavior.

### Work

- Add a typed `exports` preload API separate from project-document APIs. It should expose job-scoped
  operations such as selecting a destination, opening a writable sink, appending bytes, finalizing,
  cancelling, and querying free space. Renderer code must receive opaque job identifiers rather than
  generic filesystem access.
- Select the output file or image-sequence directory before rendering starts.
- Write files to a sibling temporary path and atomically rename them only after successful
  finalization. Cancelled and failed exports must remove their temporary output.
- Add backpressure so an encoder cannot produce data faster than the main process can write it.
- Investigate Mediabunny's streaming/custom-target facilities and route container chunks directly to
  the desktop sink. Retain the current `BufferTarget` and Blob download as the browser fallback.
- Write PNG sequences directly into a selected directory. Use deterministic, zero-padded filenames
  and a small manifest containing range, resolution, frame rate, transparency, and completion state.
- Validate available disk space against the existing estimate before starting, then continue checking
  write failures during export.
- Provide native overwrite, create-directory, retry, and cancel handling.
- Add unit tests for job state, destination validation, temporary-file cleanup, backpressure, and
  failed finalization. Add an Electron integration test that exports a short fixture into a temporary
  directory.

### Exit criteria

- Long video exports no longer require a second in-memory copy of the completed container.
- Image-sequence export memory is bounded independently of sequence length.
- No incomplete output is presented as a finished export.
- Browser builds retain their existing Blob/download behavior.

## Phase 2: Export jobs, cancellation, and recovery

Goal: make export a durable operation with a clear lifecycle rather than a modal-bound promise.

### Work

- Introduce an export-job model with queued, preparing, rendering, encoding, finalizing, completed,
  cancelled, and failed states.
- Snapshot the scene, timeline, referenced assets, plugin versions, export settings, and
  reproducibility inputs at job creation.
- Add reliable cancellation checkpoints between frames, audio stages, encoder writes, and
  finalization. Cancellation must restore canvas dimensions and visualizer state.
- Add an export queue with reorder, remove, retry, and duplicate actions. Run one job by default until
  profiling establishes safe parallelism.
- Persist job metadata, but not large frame buffers, so the next launch can explain interrupted jobs,
  locate partial files, clean them up, or restart from the immutable snapshot.
- Allow the export modal to close while a job continues. Surface progress in a compact global status
  area and prevent accidental application exit while finalization is in progress.
- Store structured logs for each job: resolved codecs, fallbacks, timing, peak memory when available,
  mix peak, output size, warnings, and failure causes.
- Add completion and failure notifications through Electron's portable notification API, with an
  in-app fallback.

### Exit criteria

- Closing the configuration modal does not cancel or hide an active job.
- Every job reaches one terminal state and owns cleanup of its temporary resources.
- Retrying a failed job uses the same scene snapshot and settings.
- Interrupted jobs are explained on restart and never silently mistaken for completed exports.

## Phase 3: Portable performance and memory improvements

Goal: improve throughput and responsiveness using capabilities available in the bundled Chromium
runtime on both supported operating systems.

### Work

- Build repeatable benchmark scenes and record render, readback, encode, mux, disk-write, memory, and
  total elapsed time separately.
- Add bounded frame pipelining so rendering, WebCodecs encoding, and disk writes overlap while obeying
  backpressure.
- Remove unused per-frame Blob retention and audit every export path for accidental buffer copies.
- Evaluate `OffscreenCanvas` and workers for compatible rendering stages. Keep DOM-dependent scene
  elements and plugin behavior on the existing path until parity is proven.
- Move audio mixing, hashing, PNG compression, and other transferable-data work away from the UI
  thread where doing so does not change deterministic results.
- Use an Electron utility process for CPU-heavy non-rendering work that benefits from crash and memory
  isolation. Keep its IPC schema versioned and job-scoped.
- Add renderer/encoder backpressure metrics and adaptive queue depths based on frame size and observed
  memory rather than fixed frame counts.
- Benchmark software and hardware-backed WebCodecs configurations. Select defaults from measured
  capability and quality results, not codec names alone.
- Add a diagnostics report users can attach to bug reports without exposing document contents or
  private paths.

### Exit criteria

- The editor remains responsive enough to cancel and inspect an active export.
- Peak memory has a documented bound for video and image-sequence exports.
- Benchmark results detect regressions in deterministic output, throughput, and memory.
- Every optimized path has a tested fallback to the current renderer behavior.

## Phase 4: Professional export workflow

Goal: use desktop storage and job infrastructure to support repeatable production workflows.

### Work

- Add named export presets for platform, resolution, frame rate, codec, bitrate, audio, range, and
  filename template. Store user presets outside project files and allow selected presets to be
  embedded in `.mvt` files.
- Add batch export of multiple ranges, aspect ratios, resolutions, or presets from one scene
  snapshot.
- Add marker- and selection-based range lists, handles, and optional pre/post-roll.
- Add collision-safe filename templates using scene, preset, dimensions, frame rate, range, date, and
  version fields.
- Add reveal-in-file-manager, copy-output-path, and open-output actions after completion.
- Add optional separate audio stems per timeline track or bus, alongside the combined mix.
- Add WAV master options for bit depth, sample rate, mono/stereo, normalization policy, and silence
  padding. Preserve the exact audio mix used for the muxed output.
- Write an export manifest beside optional master outputs with reproducibility hash, application
  version, plugin inventory, settings, warnings, and checksums.
- Add post-export verification: file exists, size is plausible, container duration matches the range,
  required audio/video tracks exist, and the file can be reopened by the bundled media stack.

### Exit criteria

- A user can configure a scene once and produce all required deliverables as a batch.
- Outputs are traceable to a scene snapshot and exact export settings.
- A successful status means the output passed structural verification, not merely that encoding
  returned without throwing.

## Phase 5: Portable desktop automation and workspace improvements

Goal: expose repeatable desktop workflows without taking dependencies on OS-specific native media
stacks.

### Work

- Add a command-line render entry point for `.mvt` files, presets, ranges, output destinations, and
  machine-readable progress. Use the same validation and job implementation as the GUI.
- Add a headless or hidden-window mode only after testing that GPU and font output matches visible
  rendering. Return meaningful exit codes and structured error output.
- Add project-level autosave versions and a recovery browser with timestamp, document name, and size.
- Add multiple-project windows after making caches, active paths, dirty state, shortcuts, and export
  jobs window-scoped.
- Improve drag-and-drop for projects, plugins, MIDI, audio, images, fonts, and templates while applying
  the same validation and trust boundaries as native Open dialogs.
- Add user preference storage for window layout, render defaults, cache limits, notification choices,
  and export directories.
- Add cache inspection and cleanup tools for recovery data, decoded audio, feature caches, temporary
  exports, and old application versions.
- Add a local plugin-development workflow with explicit directory grants, rebuild/watch status, safe
  reload, and clear separation from installed production plugins.
- Add automation/deep-link commands only for an allowlisted schema; never accept arbitrary scripts,
  paths, or plugin execution through the custom protocol.

### Exit criteria

- GUI and command-line exports share one job contract and produce equivalent output.
- Multiple windows cannot overwrite one another's documents, caches, or export state.
- All persistent desktop data has a visible location, size policy, and cleanup mechanism.

## Phase 6: Operating-system integration

Goal: polish the installed application after the shared job and storage foundations are stable.

This phase comes later because seemingly portable Electron APIs still differ in lifecycle, security,
installer, and desktop-environment behavior.

### Work

- Display export progress and error state in the macOS Dock and Windows taskbar.
- Use a scoped power-save blocker during active rendering/finalization, with guaranteed release on
  every terminal path.
- Add platform-appropriate recent projects, Jump List/Dock actions, application badges, and
  notification actions.
- Add Finder/Explorer Quick Look or preview metadata only if it can be generated without loading
  untrusted plugin code.
- Harden file associations, protocol registration, and installer migrations across upgrades and
  uninstall/reinstall cycles.
- Add crash dumps and opt-in diagnostics with platform privacy requirements documented.
- Complete signed-update rollback, staged rollout, and installer recovery testing on physical macOS
  and Windows machines.
- Evaluate accessibility, menu conventions, fullscreen behavior, window restoration, high-DPI
  scaling, and keyboard layouts separately on each supported OS.

### Exit criteria

- Platform integration never changes export contents or job state semantics.
- Sleep prevention, taskbar/Dock status, notifications, and installer state are cleaned up after
  success, failure, cancellation, crash, and update.
- Signed install, update, rollback, file-open, and uninstall paths pass platform-specific test
  matrices.

## Phase 7: Optional native encoding toolchain

Goal: add professional codecs and potentially faster encoding without making native binaries a
requirement for core exports.

This phase has substantial cross-platform packaging, signing, licensing, driver, and codec-support
risk and must remain optional behind capability detection.

### Work

- Define a versioned encoder-helper protocol based on frame/audio streams, metadata, progress,
  cancellation, and structured errors. The helper must not receive arbitrary shell commands.
- Evaluate a bundled FFmpeg distribution or a smaller purpose-built helper, including AGPL
  compatibility, codec patent exposure, redistribution terms, binary provenance, and update policy.
- Package, sign, notarize, and verify separate binaries for macOS architectures and Windows x64/ARM64
  targets actually supported by MVMNT.
- Add MOV/ProRes, DNxHR, lossless intermediates, advanced image sequences, alpha-capable outputs, and
  richer color metadata where the selected encoder supports them.
- Add explicit hardware paths such as VideoToolbox, NVENC, and Intel Quick Sync only after a startup
  probe and a short correctness test. Always provide a software or WebCodecs fallback.
- Detect unsupported profiles, pixel formats, dimensions, driver versions, and alpha/color-space
  combinations before a long export starts.
- Compare native output against the deterministic frame source for timing, frame count, audio sync,
  color, alpha, and quality.
- Isolate helper crashes, capture stderr safely, clean partial outputs, and let the user retry with the
  portable encoder.

### Exit criteria

- Removing or disabling the native helper leaves normal cross-platform exports functional.
- Native presets are only shown when their complete capability probe passes.
- Hardware failure falls back predictably and never produces a silently degraded file.
- Licensing, binary provenance, signing, and update responsibilities are documented for every shipped
  artifact.

## Phase 8: Platform-specific live media and hardware workflows

Goal: consider integrations that make MVMNT participate in professional live-production pipelines.

These are last because each option has distinct SDKs, drivers, permissions, deployment rules, and
maintenance costs. Each should be approved and planned as a separate product feature rather than
treated as routine Electron work.

### Candidates

- Native MIDI device access with background input, reconnect handling, device identity persistence,
  and platform permission UX.
- Virtual camera output.
- Transparent/live texture sharing through Syphon on macOS and Spout on Windows.
- NDI or similar network video output, subject to SDK licensing and network security review.
- Professional audio-device selection, low-latency drivers, multichannel routing, and live monitoring.
- OS media-key and control-surface integration.
- Native color-management and HDR output paths.
- Platform-native share/export destinations and editor handoff workflows.

### Entry criteria

- A concrete user workflow and supported-platform matrix exist for the candidate.
- Licensing, signing, driver, permission, and update implications are understood.
- The feature can be isolated behind a capability boundary and removed without breaking projects.
- Preview, recording, and offline export semantics are defined before implementation begins.

## Cross-phase quality gates

Every phase that changes export behavior must verify:

- deterministic frame count, timestamps, tempo-map handling, and audio/video synchronization;
- preview/export pixel parity for representative Canvas, GPU, media, text, and plugin scenes;
- cancellation and cleanup at every asynchronous boundary;
- bounded memory and backpressure under long 4K fixtures;
- operation with no network connection;
- behavior with missing, disabled, crashing, or incompatible plugins;
- paths and filenames containing Unicode, spaces, long names, and reserved characters;
- low disk space, read-only destinations, disconnected volumes, and destination disappearance;
- macOS and Windows packaged builds, not only development mode;
- preservation of the sandbox and the narrow preload API.

The repository-level verification remains `npm run test`, `npm run build`, and `npm run compile`.
Desktop integration changes additionally require `npm run test:electron` and packaged smoke tests on
each affected operating system.

## Open questions

- Does the current Mediabunny version expose a streaming target suitable for a backpressured IPC
  sink, or should MVMNT implement a dedicated writable target?
- Which export sizes and durations should define the supported baseline for memory and elapsed-time
  benchmarks?
- Can enough of the renderer run with `OffscreenCanvas` to justify worker migration without breaking
  DOM-dependent elements and third-party plugins?
- Should background jobs prevent all scene editing, allow editing against an immutable snapshot, or
  run in a dedicated hidden renderer?
- Which professional formats have demonstrated user demand sufficient to justify native binary and
  licensing costs?
- Is command-line rendering expected to be visually identical across different GPUs, or only
  deterministic on the same validated runtime and hardware class?
- Should export manifests be embedded into supported containers, written as sidecars, or both?
