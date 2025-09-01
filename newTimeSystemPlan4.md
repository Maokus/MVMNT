Rewritten timing and transport overhaul plan for MVMNT (tailored to the current codebase)

Context from the repo
- The codebase already contains a robust core timing utility at src/core/timing-manager.ts with:
  - Tempo map support (seconds ↔ beats; cumulative segments; binary search).
  - Conversions: beatsToSeconds, secondsToBeats, ticksToSeconds, secondsToTicks, barBeatTickToTime, timeToBarBeatTick.
  - Grid helpers: getBeatGridInWindow, getTimeUnitWindow.
  - Config and tempo/time signature control (setTempoMap, setBPM, setBeatsPerBar, setTimeSignature).
- Core types include an interface named TimingManager (src/core/types.ts) that overlaps with the actual TimingManager class. This should be reconciled to avoid naming conflicts and ambiguity.
- The app is React-based; the AboutPage confirms standard routing and UI infra.
- The plan below assumes a central transport will orchestrate timing using the existing TimingManager’s conversion logic, with a scheduler moved to a Worker and UI subscribed via a store.

Goals
- Single source of truth for transport: Transport state in a dedicated store slice; other layers derive from it.
- Deterministic timing: AudioContext-based master clock, look-ahead scheduling, drift correction.
- Clear layering: Pure timeline data → transport/controller → scheduler (Worker) → rendering (Visualizer/UI).
- Real-time safety: Scheduling off the UI thread; consumers read snapshots.
- Extensibility: Tempo changes, time signatures, looping, scrubbing, quantization, rate, and track/event plugins.

Architecture overview
- Core timebase and transport controller
  - Responsibility
    - Own the master clock and state machine: stopped, starting, playing, pausing, seeking, looping.
    - Use AudioContext.currentTime for the wall clock; fallback to performance.now if needed.
    - Convert musical time ↔ real time via a TempoMap, delegating conversions to src/core/timing-manager.ts.
    - Publish a monotonic, drift-corrected getNow for all consumers.
    - Orchestrate the scheduler (start, stop, seek) and emit lightweight ticks.
  - Public API (imperative)
    - play(opts?: { quantizeTo?: GridValue })
    - pause(), stop()
    - seek(to: TimePoint, opts?: { snap?: GridValue })
    - setTempo(bpm), setTimeSignature(n, d), setRate(rate), setLoop({ on, start, end })
    - getNow(): { secTime, musicalTime, audioTime }
    - subscribe(fn): state/tick subscription
  - Notes for MVMNT
    - Reuse TimingManager instance(s) for conversions. Keep one authoritative TempoMap in transport; element-level TimingManager configs can remain for per-element overrides, but transport is the master for playback time.

- Timeline data model (pure state)
  - Entities
    - Track: id, type, mute/solo, color, pluginType, params
    - Clip/Region: id, trackId, start, end, contentRef, offset, looped, gain, fades
    - Event: id, trackId, start, duration, type, payload (keyframes, cues, automation points)
    - Automation: paramId, points [{ time, value, curve }]
    - Markers: id, time, label, color
    - TempoMap: segments [{ start, bpm, timeSig, swing, cumulativeSec }]
  - Time representations
    - Musical beats as primary with cached or on-demand seconds via TempoMap.
    - Utility conversions provided by TimingManager and exposed via a thin wrapper in transport.
  - Invariants
    - Events sorted by start; O(log n) insertion and range queries.
    - No overlapping clips on a track unless allowed by type.
    - Pure mutations; incremental recompute of derived caches.

- Scheduler (Worker)
  - Responsibility
    - Compile “renderable” events within [now, now + lookAhead].
    - Incremental recompute on seek, loop, tempo change, or edits.
    - Emit small time-batched schedules for Visualizer and any audio/physics consumers.
  - Design
    - Web Worker to avoid UI thread jank.
    - Min-heap priority queue keyed by absolute secTime.
    - Per-track compiled cache: clips + events → ordered triggers with resolved automation.
    - Loop aware: reseed on boundary crossings.
  - Output
    - Batches: [{ timeSec, timeBeats, trackId, eventId, type, payload, renderHints }] grouped by 10–20 ms windows or frame windows.

- Store integration (Zustand or equivalent)
  - transportSlice (authoritative transport state)
    - status, isPlaying
    - positionBeats (derived/live), positionSec (derived/live)
    - bpm, timeSig, rate
    - loop { on, startBeats, endBeats }
    - quantize, swing
    - startTimeAnchor (audioTime when play begins), latencyComp
    - actions: play, pause, stop, seek, setTempo, setTimeSig, setLoop, setQuantize, setRate
  - timelineSlice
    - tracks, clips, events, automation, markers, tempoMap
    - actions: add/update/remove track/clip/event, setAutomation, setMarkers, setTempoMap
  - uiSlice
    - selection, toolMode, gridResolution, zoom, scroll, hover, drag
    - actions: setSelection, setGrid, setZoom, setScroll
  - Flow
    - UI dispatches store actions only.
    - Transport controller subscribes to store selectors and acts imperatively (clock ops, worker messaging).
    - Worker receives compact diffs of relevant store slices and emits schedule batches.
    - Visualizer subscribes to derived selectors and scheduler outputs.

- UI and Visualizer integration
  - Controls
    - Transport bar: play/pause/stop, position (BBT + sec), tempo/time signature, loop, quantize, metronome.
    - Timeline canvas: scrubbing, dragging, resizing, automation editing (pure actions).
  - Behavior
    - Scrub dispatches seek(toBeats). Snap/quantize applied as configured.
    - Editing triggers timeline diffs → scheduler incremental recompute → immediate visual feedback.
    - Playhead rendered via transport.getNow() per rAF.
  - Performance
    - Shallow-equal/memoized selectors for large timelines.
    - Debounce mass operations and coalesce schedule recomputes.
    - Render pointer with getNow() to decouple from store update cadence.

- Messaging and boundaries
  - Main thread → Worker: INIT, UPDATE_STATE, SEEK, PLAY, PAUSE with compact patches.
  - Worker → Main: SCHEDULE_BATCH with [startSec, endSec] and events.
  - Optional ring buffer (SharedArrayBuffer + Atomics) for ultra-low latency.

- Tempo changes, rate, looping, and drift
  - TempoMap conversions are already implemented in TimingManager; use those for:
    - O(log n) secToBeats and beatsToSec via cumulative segments and binary search.
  - Rate scales beats/sec mapping globally.
  - Looping enforced at controller level; scheduler pre-fills across boundaries.
  - Drift correction by periodic re-anchoring:
    - positionBeats = beatsAtStart + (audioTime - startTimeAnchor) × (bpm/60) × rate (mod loop).

- Transport FSM
  - States: stopped → starting → playing → pausing → stopped
  - Guards
    - No seek while starting; queue intent until playing.
    - Suspend scheduling during heavy edits; resume after consolidated diff.

- Determinism and testing
  - SimulatedClock for unit tests (manual advance).
  - Snapshot tests for schedule compilation windows.
  - Property tests: loop wrap, quantization, mid-timeline tempo/time signature changes.
  - Validate TimingManager conversions with targeted tests (beats/seconds/ticks round-trips, segment boundaries).

- Extensibility
  - Track/event plugin registry:
    - register(type) → compile(trackState) → schedule(events).
  - Event type registry with serializer/deserializer and renderHints.
  - Optional audio engine as another consumer of schedule events.

- Persistence and history
  - JSON-serializable timeline + tempo map.
  - Command stack of pure actions; time-sensitive commands store beats for tempo-robust undo/redo.
  - Versioned schema with migrations.

Repo-aligned implementation notes
- Leverage src/core/timing-manager.ts:
  - Treat this as the canonical tempo and time conversion utility.
  - Do not duplicate conversions in transport; instead wrap TimingManager to expose the transport-level API for getNow, conversions, and grid.
- Resolve type naming conflict:
  - Rename the interface in src/core/types.ts to TransportLike or ITimingHandle to avoid confusion with the class TimingManager.
  - Provide a single barrel export for timing utilities (core/timing).
- Keep element-specific TimingManager optional:
  - Elements can maintain independent timing for artistic effects, but global transport time is the authoritative playhead for scheduling and export.

Phased execution plan (with outcomes)
- Phase 0: Foundations and type alignment
  - Actions
    - Reconcile TimingManager naming conflict between core/types.ts and core/timing-manager.ts.
    - Add a timing barrel export (core/timing/index.ts).
    - Add targeted tests for TimingManager: conversions, segments, grid windows.
  - Outcomes
    - One authoritative conversion utility, green tests, clean imports.

- Phase 1: Transport Facade v1 (read-only time unification)
  - Actions
    - Implement transport.getNow() using AudioContext.currentTime and TimingManager for beat mapping.
    - Replace all UI/Visualizer direct time reads with getNow() while keeping existing playback controls.
  - Outcomes
    - Single time source across UI; no behavioral change yet; measured drift characteristics.

- Phase 2: Store slices and declarative transport state
  - Actions
    - Introduce transportSlice, timelineSlice, uiSlice with actions and selectors.
    - Move tempoMap ownership into timelineSlice; expose selectors that feed transport’s TimingManager.
  - Outcomes
    - Unidirectional data flow; transport can be driven by store updates.

- Phase 3: Worker-based scheduler
  - Actions
    - Implement Worker with min-heap and look-ahead window (100–200 ms; refill 25–50 ms).
    - Build compileTimeline(window) per track with automation resolution and diffs.
    - Wire messages: INIT, UPDATE_STATE, PLAY, PAUSE, SEEK; emit SCHEDULE_BATCH.
  - Outcomes
    - Smooth scheduling off the UI thread; first visible reduction of UI jank.

- Phase 4: Transport FSM, looping, quantization, rate
  - Actions
    - Replace ad-hoc timers with AudioContext clock + FSM transitions.
    - Implement loop start/end in beats; boundary events; quantized play/seek; rate scaling.
  - Outcomes
    - Deterministic transport transitions; correct loop wraps and quantized behavior.

- Phase 5: Diff bridge and performance hardening
  - Actions
    - Send compact patches to Worker; memoize heavy selectors; debounce mass edits.
    - Instrument scheduling latency and batch sizes.
  - Outcomes
    - Stable performance on large sessions.

- Phase 6: UI integration and controls
  - Actions
    - Hook transport bar to store actions; scrub/drag dispatches seek; grid snapping from uiSlice.
    - Visualizer renders via rAF and getNow(); consumes scheduler batches for time-locked visuals.
  - Outcomes
    - Feature-complete UI with accurate playhead and event timing.

- Phase 7: Deterministic export path
  - Actions
    - Add fixed-step mode and SimulatedClock for frame-accurate export.
    - Ensure schedule compilation is pure and deterministic given time windows.
  - Outcomes
    - Reproducible exports across machines.

- Phase 8: Documentation and guardrails
  - Actions
    - Author INTERNALS_TIMING.md, ARCHITECTURE.md; add ESLint rules to protect layering (UI → core via barrels only).
  - Outcomes
    - Sustainable contributor onboarding and boundary enforcement.

Acceptance criteria by phase (samples)
- Phase 1
  - getNow() returns consistent sec/beat times across components; playhead renders smoothly with UI updates paused.
- Phase 3
  - Under a 200 ms look-ahead and 30 tracks × 5k events, UI remains responsive and batches arrive on time.
- Phase 4
  - Loop wraps do not miss events at the boundary; quantized play waits for the next grid; seek cancels stale events.
- Phase 7
  - Exporting the same scene twice yields identical frame timings and event triggers.

Risk and mitigations
- Clock start gating and autoplay restrictions: lazily create/resume AudioContext on user gesture; provide fallback clock for silent preview.
- Double-firing around loop/seek: enforce FSM guards; flush and reseed the Worker queue on SEEK/LOOP boundary.
- Tempo map edits mid-play: send diffs and invalidate only affected segments; rely on TimingManager’s O(log n) conversions.
- Large project performance: cap batch size, adjust look-ahead per load, coalesce edit bursts, and prefer SharedArrayBuffer if needed.

Open questions
- Is there a shared audio engine that requires sample-accurate scheduling, or is this visuals-only?
- Should play/stop/seek be quantized by default?
- Are mid-timeline tempo and time signature changes common in target sessions?
- Typical project scale (tracks, events) to size look-ahead and batch parameters.