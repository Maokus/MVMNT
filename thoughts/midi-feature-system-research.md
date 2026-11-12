# MIDI feature analysis: research and design possibilities

Status: exploratory research and recommendations; no implementation proposed here is shipped.

Research date: 27 October 2026. Repository baseline: MVMNT 0.16.0, scene schema 10, SDK 2.2.

## Recommendation

A MIDI feature system would be useful, especially as a shared way to turn notes and controllers into musical signals that multiple visual elements can consume. Start with activity, onset density, velocity, register, and chroma, then move the existing chord analysis behind the same service. These provide understandable controls without requiring machine learning.

Reuse the audio system's approach to declarations, identity, cache validity, diagnostics, and deterministic sampling. Give MIDI its own analysis semantics and output types: exact events, piecewise signals, vectors, and labeled intervals. Requiring every MIDI result to become a regularly sampled audio-style array would lose timing precision and make categorical outputs awkward.

The strongest product opportunity is a reusable musical control layer: a scene could react to the bass line, harmonic changes, or arrangement density while individual plugins concentrate on drawing. Automatic property modulation, editable automation, and structural scene changes would be additional integrations, not automatic consequences of adding feature extraction.

## What MVMNT already has

### Audio: a lifecycle worth reusing

The implemented [audio system](../docs/contributors/audio-system.md) separates immutable source media, clip placement, derived analysis, and runtime sampling:

1. A scene element declares `audioFeatureDemands(props)`. Requests are replaced when its effective properties change and removed on disposal. Reading a sample does not request analysis.
2. A calculator registry resolves feature producers. Analysis profiles specify parameters such as window, hop, and FFT sizes.
3. The scheduler computes missing or stale artifacts, supports cancellation and progress, and shares source analysis between consumers. Failures require an explicit retry.
4. Cache tracks record calculator versions, profile identity, layout, timing, and typed payloads. Artifact identity and validity checks prevent incompatible results from being reused.
5. Sampling resolves the active clip, maps timeline time into source time, and applies presentation choices such as interpolation and smoothing. Gaps yield silence; feature and PCM reads are pre-fader.
6. Optional caches and demand snapshots can accompany scene exports. Runtime preparation and simulation readiness make unavailable data an explicit condition.

The actual registered built-ins are **spectrogram, peaks, and pitchGuide**, as confirmed by [calculator registration](../src/audio/features/audioFeatureAnalysis.ts) and the [SDK audio guide](../docs/plugin-api/audio.md). RMS is available through raw-audio reads; it is not a standalone built-in feature cache. The contributor audio overview's broader list should not be read as the exact registry. `pitchGuide` also carries RMS internally as part of its pitch-guidance payload.

Useful implementation entry points are [feature types](../src/audio/features/audioFeatureTypes.ts), [artifact identity](../src/audio/features/featureTrackIdentity.ts), [declarative demands](../src/audio/features/declarativeDemands.ts), [scheduler](../src/audio/features/audioFeatureScheduler.ts), and [sampling selectors](../src/state/selectors/audioFeatureSelectors.ts).

### MIDI: more than an unprocessed event stream

MVMNT already normalizes imported MIDI to canonical **960 PPQ**, pairs note messages into durations, retains controller events, and stores reusable source data separately from clips. The [timeline documentation](../docs/contributors/timeline-and-automation.md), [ingestion code](../src/core/midi/midi-ingest.ts), [clip model](../src/state/timeline/midiClips.ts), and [selectors](../src/state/selectors/timelineSelectors.ts) establish those semantics.

SDK plugins already use `timeline.read` to select notes and CC events, inspect tracks, and query sustain through the [timeline API](../packages/plugin-sdk/src/timeline.ts). Cheap note-driven drawing does not need a new analysis job just to access MIDI.

There is also substantial reusable musical analysis:

- The [chord pipeline](../src/core/midi/music-theory/chord-detection-pipeline.ts) builds active or windowed observations, computes weighted chroma, applies channel-scoped CC64 sustain, clusters event times, runs several detector methods, and stabilizes results.
- The [chord display](../src/core/scene/built-ins/midi-displays/chord-estimate-display.ts) currently orchestrates these queries and calculations during rendering, including separate bass-track and pitch-split modes.
- The [chord estimator](../src/core/midi/music-theory/chord-estimator.ts) and pattern detector supply algorithms and tests that a shared feature service could adopt.

The missing piece is a common MIDI feature lifecycle and consumption contract. A chord result currently computed for one display is not a general shared artifact with declared dependencies and reusable sampling.

There are input limitations too. The parser recognizes pitch bend and program change, but its playable output retains note events and CC separately; normalized `notesRaw`/`ccRaw` and the public timeline API do not expose the full expression stream. Pressure messages are skipped. Bend, vibrato, instrument-aware, and MPE features would need upstream preservation and API work first.

## What the literature contributes

This is a targeted literature review, not a systematic survey. The papers establish relevant methods and limitations; they do not demonstrate that a particular mapping will produce compelling MVMNT animations. Product recommendations below are inferences from the literature and the current architecture.

### Symbolic descriptors and extensible extraction

**McKay, Cumming, and Fujinaga (2018), “jSymbolic 2.2: Extracting Features from Symbolic Music for Use in Musicological and MIR Research,” ISMIR, pp. 348–354.** The paper describes 246 features producing 1,497 values, whole-piece and overlapping-window extraction, and an extensible dependency-aware framework. Its feature families cover pitch, melodic intervals, harmony, rhythm, instrumentation, and texture. It also directly addresses encoding bias: tempo, instrumentation, and dynamics can describe how a file was encoded rather than meaningful musical differences. [Paper](https://jmir.sourceforge.net/cmckay/papers/mckay18jsymbolic.pdf)

**Implication for MVMNT:** there is strong precedent for a feature registry and reusable intermediate analyses. Borrow a small vocabulary of explainable descriptors rather than the entire catalogue. Beat-relative measurements and explicit weighting choices should be first-class options. A feature that helps classify a whole piece is not necessarily a good frame-by-frame animation control.

**Cuthbert, Ariza, and Friedland (2011), “Feature Extraction and Machine Learning on Symbolic Music Using the music21 Toolkit,” ISMIR.** This work integrates established and new extractors with richer score transformations such as chord reduction, inferred key, and metrical strength. Its central relevance is that musically meaningful descriptors depend on preprocessing and representation, not simply counting MIDI messages. [Paper](https://ismir2011.ismir.net/papers/PS3-6.pdf)

**Implication for MVMNT:** share normalized notes, pedal interpretation, chroma, and analysis windows beneath more advanced features. A common intermediate observation can support chord labels, pitch-class displays, and harmonic-change measurements. Current [music21 documentation](https://music21.org/music21docs/moduleReference/moduleFeaturesJSymbolic.html) also marks several extractors as unimplemented, so a published feature catalogue should not be treated as a ready-to-port implementation inventory.

**Simonetta, Llorens, Serrano, García-Portugués, and Torrente (2023), “Optimizing Feature Extraction for Symbolic Music,” ISMIR.** The musif work compares extractors across repertoires and formats, discusses caching parsed and expensive intermediate representations, and finds that combining feature sets can outperform relying on one toolkit. Some features use score annotations rather than MIDI parameters. [Paper and publication details](https://arxiv.org/abs/2307.05107), [full text](https://arxiv.org/html/2307.05107v1)

**Implication for MVMNT:** keep calculators replaceable and benchmark useful workloads. Score-level dynamics, lyrics, and annotated harmony do not become available merely because a MIDI file exists. Python and Java toolkits are useful references and offline comparators; embedding one in the renderer would introduce a separate runtime and distribution decision.

### Representation, rhythm, and interpretation

**Raffel and Ellis (2014), “Intuitive Analysis, Creation and Manipulation of MIDI Data with pretty_midi,” ISMIR Late Breaking and Demo Papers.** The paper advocates an instrument/event representation that makes timing conversion, piano rolls, and common analysis accessible. It illustrates how much processing lies between raw MIDI messages and useful musical data. [Paper](https://colinraffel.com/publications/ismir2014intuitive.pdf)

The project's [instrument implementation](https://github.com/craffel/pretty-midi/blob/main/pretty_midi/instrument.py) provides concrete precedents for pedal-aware piano rolls, chroma, and duration/velocity-weighted pitch-class histograms.

**Implication for MVMNT:** retain exact source notes as the foundation and derive dense matrices only where consumers need them. Chroma is a useful MIDI counterpart to a spectrum visualization, but it represents pitch-class activity, not acoustic frequency energy or timbre.

**Longuet-Higgins and Lee (1984), “The Rhythmic Interpretation of Monophonic Music,” Music Perception 1(4), pp. 424–441.** The publisher abstract explains rhythmic interpretation in terms of underlying meter and parsing, and emphasizes rhythmic ambiguity and the influence of phrasing. Only the abstract was consulted here. [Publisher abstract](https://online.ucpress.edu/mp/article-abstract/1/4/424/46430/The-Rhythmic-Interpretation-of-Monophonic-Music)

**Implication for MVMNT:** onset counting is straightforward; syncopation and groove require explicit metrical assumptions. A general implementation must distinguish quarter-note units, notated beats, and bars, especially in compound and irregular meters. A single universal “groove” slider would conceal substantial interpretation.

### Tension, surprise, and higher-level signals

**Herremans and Chew (2016), “Tension Ribbons: Quantifying and Visualising Tonal Tension,” TENOR.** This paper develops three separate Spiral Array measures: cloud diameter, movement between successive clouds, and distance from tonal context. It visualizes their trajectories over scores and compares examples with empirical tension observations. The model distinguishes enharmonic spellings, and the paper shows that different measures respond to different aspects of a passage. [Paper](https://www.tenor-conference.org/proceedings/2016/02_Herremans_tenor2016.pdf)

**Implication for MVMNT:** tonal dispersion, harmonic movement, and distance from a chosen key could be separate visual controls. MIDI note numbers lack enharmonic spelling, so a faithful implementation would require spelling inference or additional score data. A pitch-class approximation must be labeled as an approximation. None of these measures should be presented as a universal measure of emotion.

**Pearce and Wiggins (2012), “Auditory Expectation: The Information Dynamics of Music Perception and Cognition,” Topics in Cognitive Science 4, pp. 625–652.** This account uses probabilistic modeling of musical expectation. Event surprisal is `-log2 P(event | context)`; predictive entropy describes uncertainty before the next event. IDyOM combines learning from a musical corpus with adaptation to the current melody. [Author-hosted paper](https://www.marcus-pearce.com/assets/papers/PearceWiggins2012.pdf)

**Implication for MVMNT:** learned surprise could drive occasional visual accents, while predictive uncertainty could drive a different effect. This requires a defined musical representation, training data, model version, and history. A large pitch leap or chroma difference is a useful heuristic, but is not equivalent to probabilistic surprise. This belongs after basic features, with a reproducible model and clearly stated stylistic scope.

### Structural analysis and visual communication

**Müller and Kurth (2006), “Enhancing Similarity Matrices for Music Audio Analysis,” ICASSP.** The paper examines similarity matrices and repeated musical structure in audio. It provides a relevant route from a feature sequence to larger-scale relationships. [Author-hosted paper](https://www.audiolabs-erlangen.de/fau/professor/mueller/publications/2006_MuellerKurth_EnhancingSimilarityMatrices_ICASSP.pdf)

**Implication for MVMNT:** comparing beat-windowed MIDI chroma and rhythm vectors could suggest repetitions or changes, allowing repeated passages to reuse visual themes. Applying this audio-oriented method to MIDI is a proposed adaptation, not a result established for this app. Similarity and local novelty are also insufficient on their own to label a passage “chorus” or “drop.” A full all-pairs matrix has quadratic storage, so long pieces need coarser resolution or bounded comparisons.

**Khulusi et al. (2020), “A Survey on Visualizations for Musical Data,” Computer Graphics Forum 39(6), pp. 82–110.** This survey classifies 129 works by musical data and task, and highlights uncertainty as a recurring visualization problem. [Article](https://onlinelibrary.wiley.com/doi/10.1111/cgf.13905)

**Implication for MVMNT:** distinguish a feature's meaning from its visual mapping. A bass contour, confidence-aware chord ribbon, and abstract harmonic color field serve different purposes even if they share analysis. Expose enough provenance and uncertainty for users to understand a result without requiring every visual to become an analytical chart.

## What a MIDI feature system would allow

The following are proposed capabilities, not existing bindings or promised detection accuracy.

| Feature                           | Meaning and useful representation                 | Possible visual use                      | Main qualification                                             |
| --------------------------------- | ------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| Onsets and releases               | Exact timestamped events with stable identity     | Bursts, cuts, note trails                | Preserve simultaneous notes and event boundaries               |
| Active-note count                 | Piecewise count of held keys or sustained notes   | Shape complexity, layer population       | State which definition of “held” applies                       |
| Onset density                     | Attacks per quarter note or second over a window  | Particle rate or camera activity         | A four-note chord can count as four attacks or one onset group |
| Velocity statistics               | Mean, maximum, or sum for a stated population     | Accent strength or scale                 | MIDI velocity is not measured loudness                         |
| Bass, top note, mean pitch, range | Nullable register values in semitones             | Vertical position, framing, spread       | Polyphonic extremes are not automatically melodic voices       |
| Chroma                            | Twelve pitch-class weights                        | Harmonic palette, radial display         | Declare duration/velocity weighting and drum exclusions        |
| Chord intervals and confidence    | Structured labels over spans                      | Chord ribbons, palette changes           | Preserve ambiguity and an unknown state                        |
| CC curves and pedal state         | Channel-scoped piecewise control values           | Opacity, deformation, visual sustain     | Controller defaults and carry-in state need policies           |
| Melodic contour and interval      | Ordered voice-specific events                     | Path direction or curvature              | Requires a selected or inferred voice                          |
| Rhythmic pattern descriptors      | Beat-relative onset patterns                      | Repeating motion motifs                  | Quantization and meter affect interpretation                   |
| Tonal movement or tension proxies | Model-specific scalar/vector curves               | Gradual spatial or color changes         | Key, spelling, and musical style affect validity               |
| Repetition and novelty            | Similarity relationships and candidate boundaries | Recurring themes and section transitions | Candidates should remain reviewable                            |

Three concrete combinations illustrate the value:

- **Arrangement-aware scenes:** drum onsets create short accents, bass register moves a focal point, and a smoothed density measure increases background complexity. Each feature can select different tracks.
- **Shared harmonic behavior:** a chord display, chroma wheel, and background palette use one observation/profile. Expensive harmonic analysis is reused, while each visual chooses its own presentation.
- **Audio/MIDI combinations:** audio RMS controls brightness while MIDI chords control hue and MIDI onsets trigger particles. This separates acoustic intensity from musical structure, provided the files are aligned.

Recorded MIDI also allows intentional lookahead: an animation can prepare for a known chord or note. That is a useful authoring capability, but must be an explicit window policy. A future live-input mode cannot provide equivalent future coverage.

## A suitable design for this repository

### Separate extraction, interpretation, and mapping

Use three layers:

```text
source notes and CC + clip composition + project timing
                         |
          exact queries / indexed observations
                         |
      named, versioned feature calculators and caches
                         |
    rendering, simulation, property mapping, or baking
```

Exact queries should remain inexpensive synchronous reads where possible. Derived windows or harmonic interpretation can be cached. Dense matrix output should be a bounded adapter for displays, not the only canonical format.

Support at least events, scalar/vector signals, and structured intervals. A chord label should step between intervals; it cannot be linearly interpolated. Empty bass pitch should be absent, not MIDI note 0. Valid silence, insufficient evidence, unavailable input, and failed analysis need distinguishable outcomes.

Adopt the audio demand lifecycle for prepared analyses: stable per-instance request IDs, read-only sampling, automatic preparation, cancellation, version checks, and explicit failures. Avoid introducing an arbitrary calculator dependency graph initially; shared observation helpers and a small fixed dependency chain may be sufficient.

### Make time, scope, and context explicit

Use canonical ticks for source note facts and musical windows; project timing remains the authority for mapping to seconds. A beat-relative density cache can survive a tempo edit, whereas attacks-per-second and a 200 ms chord window generally cannot.

For example, a one-quarter-note window with four attacks has density 4 attacks/quarter. At constant 120 BPM this is 8 attacks/second; at 60 BPM it is 4. A feature called just “density” hides an important choice.

Offer source-local and composed-timeline analysis as distinct scopes:

- Source-local indexing and context-free observations can be reused by duplicate clips.
- Track/group analysis observes enabled clips after placement, trim, and filtering. It is needed for windows crossing clip boundaries and harmony assembled from several tracks.

Do not always compute a complete feature per source and sample it through clips. A source-wide key or density window may include notes that were trimmed away. Conversely, resetting every window at each clip boundary can erase intended musical continuity. State the boundary and carry-in policy in the analysis profile.

### Define identity and invalidation before persistence

A proposed analysis key should account for source content/revision, calculator and version, analysis parameters, channel/pitch filters, weighting, sustain policy, time domain, and output schema. Composed analyses additionally depend on clip layout, selected tracks, relevant enabled/mute states, and timing revisions when the algorithm uses seconds or meter.

Presentation-only gain, palette, and ordinary display interpolation can stay outside identity. Window lengths, onset clustering, pedal interpretation, and chord stabilization that affect results belong inside it. Stateful smoothing cannot depend on the order frames happened to render.

| Edit                              | Source-local facts              | Composed/contextual feature                      |
| --------------------------------- | ------------------------------- | ------------------------------------------------ |
| Move a clip                       | Reuse                           | Revalidate affected windows                      |
| Trim or disable a clip            | Reuse                           | Recompute affected context and boundary state    |
| Change tempo                      | Reuse tick facts                | Invalidate seconds-dependent outputs/projections |
| Change meter                      | Reuse note facts                | Invalidate meter-dependent rhythm features       |
| Replace notes or CC               | Invalidate relevant source data | Invalidate dependents                            |
| Change visual color               | Reuse                           | Reuse                                            |
| Change detector or sustain policy | Reuse raw indexing              | Recompute affected interpretation                |

Jobs should capture immutable input revisions and discard obsolete completions. Array lengths alone are insufficient invalidation keys: changing pitches without changing note count must invalidate harmonic results.

### Keep integration costs visible

Implement the internal read service first. A public MIDI feature facet would be an additive, versioned SDK design, following [current compatibility rules](../docs/current-state.md); do not repurpose `audio.features.read` or remove existing timeline queries.

Generic property modulation is separate work. The current [binding union](../src/bindings/property-bindings.ts) supports constants, macros, and keyframes. Supporting “density drives scale” throughout the app needs a defined mapping model: normalization, input/output ranges, clamping, attack/release, fallback, and precedence relative to existing automation. Baking a chosen feature to editable keyframes is another useful option, but needs sampling and simplification policies.

Start with disposable runtime caches. Persistent user choices belong in the scene document, while cache readiness must not mark a document dirty or create undo entries. If feature declarations or new bindings are saved, add the required schema migration and fixtures; cached numerical results alone are not a substitute for the algorithm and settings needed to reproduce them.

Authored changes should follow the existing [state and command ownership](../docs/contributors/state-and-commands.md), [MIDI clip commands](../src/state/timeline/commands/midiClipCommands.ts), property edit coordination, and domain-specific selection/shortcut paths. Analysis does not need its own undo stack or implicit dependence on transient selection.

## Difficulties and decisions to resolve

### MIDI is precise about some things and incomplete about others

Imported note numbers and timestamps are available, but audible duration, loudness, expressive intent, melodic voice, spelling, and musical function are not fully determined by them. A synth release may continue after note-off; a pedal can extend notes; the same velocity can produce different acoustic energy on different instruments. Label features according to what is actually measured.

MVMNT's ingestion currently pairs active notes by note/channel, with a fallback duration for unmatched note-ons. Merged tracks with identical pitches/channels and overlapping retriggers deserve explicit review before treating normalized notes as ground truth for new analyses. This is a data-quality consideration, not a proposal to change import behavior as part of this research note.

Sustain and CC history are particularly subtle at trims and seeks. A controller set before a clip's visible region may define its initial state. Decide whether each clip carries that source state in or resets it, and keep results isolated by source/clip/channel so unrelated tracks cannot hold one another's notes.

Drum note numbers are often instrument identifiers rather than harmonic pitches. Provide an explicit percussion exclusion/role control instead of assuming every file follows one channel convention. A polyphonic track is also not necessarily one voice: “highest note” should remain distinct from “melody.”

### Windowing trades responsiveness for stability

Short chord windows flicker through passing tones and arpeggios; long windows mix neighboring harmonies and delay response. Past-only, centered, and future-looking windows produce different artistic behavior. The existing chord display's options demonstrate that there is no single correct setting.

Separate extraction window, event grouping tolerance, categorical hold, and display smoothing. A tiny note may occur between two video frames; exact onset queries must still find it. Frame sampling alone must not be the trigger mechanism.

### Deterministic export requires history to be reproducible

Preview playback, reverse scrubbing, random seeks, and offline export must agree at the same time. Avoid “consume this event once” state tied to playback. Query events in a documented half-open interval, such as `[start, end)`, with stable identities for simultaneous occurrences.

For attack/release envelopes, chord hysteresis, or learned expectation, either precompute the relevant history or reconstruct it from deterministic checkpoints. The existing [simulation readiness contract](../docs/plugin-api/simulation.md) should govern required prepared inputs, including missing calculators and analysis pending during export.

### Performance and storage depend on representation

An indexed event sweep or prefix aggregate can avoid scanning every note for every element on every frame. Cache expensive shared observations, bound range reads, and use workers only when benchmarks justify their overhead. Copying large note arrays between jobs can itself become a cost.

A hypothetical five-minute, 100 Hz, float32 representation needs about **0.12 MB per scalar**, **1.44 MB for 12-bin chroma**, or **15.36 MB for 128 pitches**, before metadata, temporary arrays, and multiple profiles. Sparse events and intervals can be much smaller. These are illustrative decimal byte calculations, not measurements of MVMNT.

### Confidence and normalization affect the result users see

Whole-piece normalization makes small differences visible but means replacing one passage can change an entire scene's apparent intensity. Local normalization adapts but can exaggerate silence or quiet sections. Fixed ranges are predictable but need feature-specific defaults. Preserve raw units and make normalization an explicit mapping choice.

Chord confidence is an algorithm score, not necessarily a calibrated probability. Tonal tension and surprise depend on a model and stylistic assumptions. Expose unknown results, configurable track roles, and manual overrides. Section boundaries are best introduced as suggestions that users can inspect or bake.

## Extending the proposal with typed temporal flows

The proposed value/temporal decomposition is a good candidate for the common data contract beneath audio features, MIDI analysis, and visualization models:

```text
Value form:     Scalar | Vector<V> | Category | Text | Record<{...}>
Temporal form:  Constant<V> | Signal<V> | PointEvent<V> | IntervalEvent<V>
```

These are two independent axes: what a value means, and how values occupy time. This section is a design recommendation, not an existing SDK API. A `Signal` means a value queryable over time; it need not be mathematically continuous, regularly sampled, or stored densely.

| Example           | Proposed form                                                | Important semantics                                        |
| ----------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| Configured tonic  | `Constant<Category>`                                         | Fixed within a configuration revision; can still be edited |
| Active-note count | `Signal<Scalar>`                                             | Integer-valued and stepwise                                |
| Chroma            | `Signal<Vector<Scalar>>`                                     | Twelve labeled pitch-class bins                            |
| Note onset        | `PointEvent<Record<{ pitch, velocity, channel }>>`           | Exact time and stable occurrence ID                        |
| Note duration     | `IntervalEvent<Record<{ pitch, velocity, channel }>>`        | Start/end, overlap, source/clip identity                   |
| Chord estimate    | `IntervalEvent<Record<{ root, quality, bass, confidence }>>` | Structured categories, optional bass, explicit unknown     |
| Lyric             | `PointEvent<Text>` or `IntervalEvent<Text>`                  | Depends on whether onset or display duration is known      |

`PointEvent<V>` and `IntervalEvent<V>` describe occurrences. A usable flow also needs a collection/query contract: several notes can start at exactly the same time, and intervals can overlap. Neither type should imply a single-valued function. Event identity must remain stable within a source/composition revision and distinguish duplicate clip occurrences.

### Add semantics around the type pair

The two axes do not by themselves define a complete port contract. Add metadata and capabilities where required:

- **Value schema:** scalar units/range, category IDs, vector dimensions and axis labels, record fields, optional values, and Boolean state. A chroma vector and a 12-bin spectrum have the same numerical shape but different meanings. Distinguish fixed vectors from variable collections rather than treating every array as a vector.
- **Time identity:** coordinate domain and origin, such as source ticks versus project ticks. Equal units do not imply the same coordinate space. Tempo conversion needs the appropriate timing revision.
- **Coverage and availability:** supported ranges, valid silence, unknown values, pending computation, and errors. A successful query returning no events differs from an unavailable query.
- **Interpretation:** interval boundaries and overlaps, sample reconstruction, causal versus future-looking support, required history, and analysis cadence. Numeric values do not automatically permit meaningful linear interpolation; counts and category IDs generally step.
- **Provenance:** producer/version, input revision, parameters, and confidence where meaningful. These inform caching and inspection without being embedded redundantly in every sample.

Keep data storage independent of this semantic contract. A signal may use regular float frames, sparse change points, or a deterministic evaluator. Interval events may be indexed records. The common API should expose useful reads without forcing all representations through the same allocation pattern.

### Make changes of temporal form explicit

Typed operators would express much of the feature proposal:

```text
notes: IntervalEvent<Note>
  -- onset --> PointEvent<Note>
  -- count in trailing one-quarter-note window --> Signal<Scalar>
  -- normalize / map --> Signal<Scalar> suitable for particle rate

notes: IntervalEvent<Note>
  -- weighted pitch-class occupancy --> Signal<Vector<Scalar>>
  -- chord interpretation / segmentation --> IntervalEvent<Chord>

onsets: PointEvent<Note>
  -- deterministic attack/release kernel --> Signal<Scalar>
```

These arrows encode decisions. An interval's beginning is not necessarily a fresh onset when a clip is trimmed. Turning events into a held signal requires a default before the first event, same-time ordering, and a gap policy. Turning overlapping intervals into one signal requires a reduction or selection rule. Triggering events from a signal requires thresholds, hysteresis, and boundary rules. Avoid automatic event-to-signal coercion that silently supplies those choices.

Provide a small set of tested operators first: value mapping, filtering, event-window aggregation, interval overlap queries, explicit onset extraction, and deterministic envelopes. Shared, expensive musical interpretation remains a versioned calculator; not every flow operation needs a scheduled job or saved cache.

### How this relates to temporal windows

The [temporal-window proposal and implementation status](temporal_window_system_overview.md) describe a complementary layer. Flow types answer **what occupies time**. Windows answer **which portion to materialize, where the anchor lies, and how to frame it**.

A trailing four-quarter-note analysis window can produce a density signal while a view shows eight seconds of its history. Changing the viewport should not invalidate musical analysis. Changing the analysis window should. A view's materialization request must include the history/lookahead required by upstream operators, in addition to any padding needed for visual tails or interpolation. Analysis cadence and render cadence remain independent.

## Separating plugin models and views

A model/view split is valuable here, especially if reusable feature flows become the boundary. Use three responsibilities:

```text
Shared analysis: source data -> reusable musical flows
Plugin model:   flows + authored behavior -> domain/animation data
Plugin view:    model data + visual properties + viewport -> render objects
```

Shared analysis might produce chord intervals or density. A plugin model might select a chord, derive event ages, or simulate particle positions. A view decides geometry, fonts, colors, clipping, and rendering resources. Layout and viewport mapping can remain in the view; moving drawing arithmetic elsewhere solely to satisfy the split adds little value.

This distinction allows one harmony model to feed a ribbon, label, or radial view, and lets one generic scalar-history view display MIDI density or audio RMS through explicit unit/range configuration. A single view can also combine several models. Compatibility should include semantic expectations, not just a structural match such as `Signal<Scalar>`.

Separate two levels of ambition:

1. **Development convention:** author a pure `evaluateModel(inputs, time, window)` helper and call it from the current `render()` callback, then pass its result to a drawing helper. This can be adopted now without a new SDK facet or scene format. Keep allocation caches separate from meaningful model state.
2. **Public composition feature:** register independent model and view definitions with typed ports, identities, instance ownership, properties, demands, and lifecycle. Users could connect or swap them. This requires new SDK design, inspector behavior, persistence, and compatibility work; it should follow successful examples rather than precede them.

The existing [simulation facet](../docs/plugin-api/simulation.md) already supplies part of this separation: deterministic state evolution is distinct from rendering its snapshots. A general model must also support stateless random-access evaluation. Do not make every plugin run a simulation or implement a new per-frame `update()` loop; feature signals and most display models can be queried directly at the requested time.

Keep analysis sharing distinct from animation-state sharing. Two views can intentionally observe one simulated particle system, but duplicating an element should not accidentally couple its random seed or motion history to another instance. Shared calculators can reuse identical input artifacts; plugin models normally remain per instance unless explicit connections define shared ownership.

The main costs are lifecycle and invalidation complexity, larger intermediate data transfers, coordinating independently automated model/view properties, input readiness, and compatibility between separately released components. A public composition layer would need immutable or safely scoped snapshots, capability checks, and versioned port schemas. Cache model outputs by actual dependencies: changing the font should not recompute chords, but changing the bass-track selection should.

Recommended next step: use these value and temporal forms to describe the small initial feature set, then prototype the existing chord display as a pure model plus drawing helper. Add a second view over the same musical data to test reuse. This tests the abstraction before committing to a general graph editor or replacing the SDK's existing element contract.

## A practical sequence of experiments

1. **Validate useful signals.** Prototype onset events, active-key count, attacks per quarter note, maximum onset velocity, bass/top pitch, and chroma using existing notes/CC. Build a small diagnostic view showing units, selected tracks, window, and empty states.
2. **Validate sharing and correctness.** Add revision-aware indexing and caching only where needed. Extract the existing chord display orchestration into shared observations while preserving its tested behavior. Compare random-seek and sequential results.
3. **Validate authoring value.** Make two or three visuals consume the same features. Trial explicit property mappings or feature-to-keyframe baking through existing command paths. Measure whether users can obtain useful results without tuning many analysis settings.
4. **Explore musical interpretation.** Trial harmonic-change curves, model-specific tension, metrical descriptors, and repetition candidates. Keep learned expectation and automatic structure labeling optional until their musical scope and reproducibility are demonstrated.
5. **Publish stable contracts.** Once the semantics work internally, design additive SDK reads/demands and any persisted declarations. Preserve SDK 2 compatibility and schema 1–10 imports as required.

Suggested evaluation material includes a monophonic line, sustained piano with CC64, arpeggiated chords, a percussion pattern, multiple tracks sharing channels, a tempo-changing piece, 6/8 and irregular meter, duplicate/trimmed clips, and malformed/unmatched notes. Use existing fixtures where possible and appropriately licensed new material.

Measure semantic correctness, preview/export agreement, random-seek determinism, responsiveness versus stability, analysis time, cache reuse, and memory. Add metamorphic checks: transposition rotates chroma without changing onset density; tempo changes preserve attacks per quarter but change attacks per second; disabling a clip removes its composed contribution; changing a pitch without changing note count invalidates harmony; a display-color edit does not rerun analysis.

For ambiguous features, include annotated musical examples and human review rather than relying only on unit tests. Agreement with a reference implementation establishes implementation consistency, not perceptual validity.

## Open questions

- Is the first audience plugin authors, users mapping properties, or users building analytical displays? These share extraction but require different interfaces.
- Should harmonic context default to one track, a named group, or all pitched tracks? A named group makes bass and percussion roles explicit.
- Which features need source-local reuse, and which should always observe the composed timeline?
- What are the defaults for sustain, controller carry-in, gaps, and notes crossing trimmed boundaries?
- Should the initial mapping workflow stay live or bake editable keyframes? Both are useful, but persistence and undo costs differ.
- Is live MIDI a real requirement? If so, label causal and future-looking analyses separately from the start.

The first worthwhile milestone is a small set of reliable musical measurements shared across several visuals. Richer interpretation can then be added with explicit evidence, models, and limits.
