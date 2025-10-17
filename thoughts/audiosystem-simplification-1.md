Refactoring the Audio Cache System for Simplicity and Intuitiveness
Introduction

The audio cache system in MVMNT is a powerful bridge between raw audio and real-time visual elements. It analyzes audio to produce tempo-aligned feature tracks (like spectrograms, RMS loudness, waveforms) and caches them for efficient reuse. However, the current design introduces multiple overlapping concepts – audio feature descriptors, channel aliasing, and a multi-step scene element interface – that can overwhelm new developers. This report reviews those complexities and proposes a refactored design that simplifies the developer experience while preserving the system’s flexibility.
Challenges in the Current Design
Descriptor and Channel Aliasing Complexity

Audio Feature Descriptors serve as the contract between scene elements and the cache, specifying what audio data is needed. In the current design, a descriptor is a structured object with numerous fields: a featureKey (e.g. "spectrogram" or "rms"), an optional calculatorId (if multiple algorithms output the same feature), an optional bandIndex for multi-band data, a smoothing factor, and two different ways to indicate the channel – either a channelIndex (numeric) or a channelAlias (semantic label like "L" or "Right"). This richness introduces significant cognitive load for newcomers. For example, a developer must understand when to use a numeric channel index versus a named alias, and how the system will resolve an alias to an actual channel at runtime. The documentation notes that helper utilities will fill in defaults and map aliases to indices under the hood, but as a new developer, keeping track of these subtleties (and knowing that a single-channel track can ignore channel fields entirely) is non-trivial. Optional fields like bandIndex (for selecting a specific frequency bin in a spectrogram) and calculatorId further complicate the mental model, even though in typical cases they can be left unset. In summary, the descriptor concept currently exposes many parameters and dual channel-specification mechanisms, which can confuse developers who simply want “the left-channel volume” or “the overall waveform” without delving into alias resolution logic.
Scene Element Interface Complexity

Using audio features within a scene element currently involves a multi-step process that must be managed manually. As illustrated in the documentation’s usage pattern, a scene element developer needs to: (1) construct or coerce an audio feature descriptor (to ensure all required fields are set), (2) emit an analysis intent to notify the system of the needed feature, and (3) call sampleFeatureFrame each frame to retrieve the data. This is a lot of boilerplate just to access audio-driven values. For example, a simple use-case requires:

    Preparing a descriptor object (or array of descriptors) and using a helper to fill defaults.

    Calling emitAnalysisIntent(this, trackId, 'default', descriptors) to request analysis (remembering to include an analysis profile like 'default' every time).

    Calling sampleFeatureFrame(trackId, descriptors[0], time) to get the data and handling the case where data isn’t ready yet (e.g. returning an empty result if sample.values is undefined).

In React-based scenes, the pattern is even more involved: one typically uses an effect hook to emit the intent when the component mounts and clear it on unmount, and must manually resolve channel aliases to an index before sampling on each render. The need to call a special resolveDescriptorChannelIndex function to map a label like "Left" to the correct channel number at runtime is an example of the low-level detail leaking into the scene usage. Moreover, developers must remember to clear the intent (by emitting an empty intent or null track) when an element is removed, to keep the system’s dependency graph accurate. Forgetting this could lead to stale analysis jobs or memory leaks. All these requirements – understanding the intent bus, managing lifecycle events, specifying profile IDs, and handling channel alias resolution – add up to a high cognitive overhead for new developers trying to make an audio-reactive scene element.
Proposed Refactored Design

The refactored design aims to streamline the above pain points by reducing the number of concepts a developer must juggle. The core idea is to present a simpler, more intuitive API for scene elements while the underlying system (analysis scheduler, caching, etc.) continues to provide flexibility and performance. Key improvements include unifying how channels are specified, simplifying descriptor usage, and offering a higher-level scene element interface that hides the intent emission mechanics.
Unified Channel Specification in Descriptors

To eliminate confusion around channelIndex vs channelAlias, the new design collapses these into a single channel identifier field. A descriptor can have a property (for example, called simply channel) which accepts either an index or a semantic name, but developers do not need to manage both. For instance, a descriptor might be defined as:

const descriptor = { feature: "rms", channel: "Left", smoothing: 0.2 };

Under the hood, the system will interpret channel: "Left" by looking up the track’s channel configuration (e.g. mapping "Left" to index 0, "Right" to index 1 for a stereo track). If the track is mono or if no specific channel is provided, the system can default to channel 0 (mono mix) without any extra effort from the developer. This approach removes an entire decision point for the user – they no longer have to decide between alias or index or understand the alias resolution algorithm. The goal is that for most use cases, channel selection “just works”: if a track has a standard stereo layout, using "Left" or "Right" is intuitive; if there is only one channel, no channel specification is required (and the system will automatically treat it as mono). Internally, the audio cache can still maintain a list of channel aliases (e.g. for multi-channel or surround scenarios), but this is abstracted away from the scene API. By unifying channel specification, we also remove the need for manual calls to resolve aliases at sample time – the API will ensure that when you request data for "Left", you get the correct channel’s data without an extra step by the developer.
Simplified Descriptor Structure and Defaults

Along with channel unification, the AudioFeatureDescriptor format can be simplified for common scenarios. Many of the descriptor fields can be optional or inferred, allowing developers to specify only the essentials. In the refactored design:

    Feature Key Only: A developer typically only needs to specify the feature type (e.g. 'spectrogram', 'rms') and, if desired, the channel and a smoothing factor. The system can automatically choose the correct calculator for the given feature key, so the calculatorId becomes optional in practice (unless a non-default algorithm is explicitly needed). This means for 99% of use cases, one can omit calculatorId entirely – eliminating a point of confusion about multiple calculators producing the same feature.

    Implicit Defaults: Fields like smoothing and bandIndex will have sensible defaults. For example, smoothing could default to 0 (no smoothing) unless specified. The bandIndex (used for multi-band features like spectrogram) can be omitted to get the full spectrum frame; if an advanced use-case requires a specific frequency band, the developer can either supply bandIndex or use a specialized helper to extract bands from the full spectrogram. By not exposing band indexing in the common API path, new users won’t be distracted by it.

    Profile Handling: The analysis profile (which appears as the 'default' in the current intent call) can be managed behind the scenes or simplified to a top-level optional parameter. For example, if all features use the default profile unless stated otherwise, the emitAnalysisIntent (or its replacement) can assume 'default' by default. Only if a developer wants a non-default analysis profile would they need to specify it. This removes yet another parameter from the most common code path.

With these changes, constructing a descriptor (or equivalent query object) becomes much more straightforward. A developer can think in terms of “I want this feature (maybe on this channel) with maybe some smoothing” and not worry about the rest. Internally, we preserve the flexibility – the descriptor data model can still include calculator IDs, exact channel indices, etc. – but these are filled in automatically by the system’s coercion logic rather than by the developer upfront. This reduces the chance of mistakes (e.g. forgetting to include a required field) and lowers the learning curve to use the audio cache.
Streamlined Scene Element API

Perhaps the most impactful improvement is providing a more intuitive scene element interface for requesting and sampling audio features. The refactored design replaces the manual three-step sequence (declare → emit intent → sample) with a higher-level abstraction. There are a few possible approaches to achieve this, outlined below, all aiming to make the process feel like a single logical action:

    Automatic Intent Emission: Integrate the analysis intent step into the data sampling call or element lifecycle so that developers do not explicitly call emitAnalysisIntent at all. For example, calling a new function sampleAudioFeature(trackId, descriptor, time) could internally check if the requested feature for that track is already analyzed or in progress; if not, it would initiate the analysis (emitting the intent behind the scenes) and return a placeholder or null data until the analysis is ready. On subsequent calls (or frames), the actual data would be returned once available. This lazy initiation model lets a developer simply attempt to sample data and handle a “not ready yet” case, which they are already doing in the current pattern, without separately managing an intent. Essentially, the act of sampling would implicitly subscribe the element to that feature. This can dramatically simplify usage: a single call can replace the previous three, with the system taking care of queuing the analysis.

    Dedicated Subscription API: Alternatively, provide a clearer, higher-level function for the initial subscription and tie it to the scene element’s lifecycle. For instance, a function like subscribeFeatureData(element, trackId, descriptors, profile?) could encapsulate the intent emission. A scene element would call this once (e.g. in an initialization method or effect), and the system would handle emitting the intent and cleaning it up when the element is destroyed or when trackId changes. This reduces the ceremony by hiding the bus mechanics. The element can then simply call sampleFeatureFrame (or a variant of it) without worrying about the analysis not being started – because the subscription ensured it. In React, this logic could be further wrapped in a custom hook (e.g. useAudioFeature(trackId, feature, options)) so that a single line hook call sets up the subscription and returns a sampling function. This was partially demonstrated in the docs with a custom hook example – our proposal is to provide such utilities out-of-the-box so that individual developers don’t need to write their own effect and cleanup logic for every feature they use.

    Scene Element Base Class Support: At an architectural level, we can build these patterns into the scene element base classes. For example, if an element has a property like features (as seen in the config usage in the docs) and a trackId, the base class could automatically call emitAnalysisIntent when the element is added to the scene or when its trackId changes, based on those properties. The developer of the element would then only be responsible for sampling the data when rendering, not for managing the subscription. This leverages declarative configuration: an element “declares” it needs certain audio features, and the engine ensures those are provided.

In all of these approaches, the common theme is reducing the steps and API surface the developer interacts with. As a concrete illustration, consider how a refactored usage might look compared to the original:

Original approach: (multiple calls and manual management)

// Original usage in a scene element
const trackId = this.getProperty<string>('audioTrackId');
const descriptor = { featureKey: 'spectrogram', smoothing: 0 };
emitAnalysisIntent(this, trackId, 'default', [descriptor]); // request analysis :contentReference[oaicite:18]{index=18}
const sample = sampleFeatureFrame(trackId, descriptor, currentTime); // get data :contentReference[oaicite:19]{index=19}
if (!sample?.values) return []; // handle not ready :contentReference[oaicite:20]{index=20}
useData(sample.values);

Refactored approach: (simplified subscription and sampling)

// Proposed usage (pseudo-code)
AudioFeature.request(trackId, 'spectrogram', { channel: 'Left' });
const values = AudioFeature.getFrame(trackId, 'spectrogram', { channel: 'Left' }, currentTime);
if (!values) return []; // if not ready, no data yet (analysis in progress)
useData(values);

In this pseudocode, AudioFeature.request is a one-time call (which could even be optional if getFrame itself triggers the request), and AudioFeature.getFrame returns the feature data array directly for the given time. There is no explicit mention of analysis intent, profiles, or descriptor objects – those concepts are handled internally. A variant of this could integrate with the element’s lifecycle to avoid needing the explicit request line, making it even closer to a single step from the developer’s point of view. The result is that a developer can treat audio features similarly to any other data source: request it and use it, with minimal ceremony.
Example: Before vs. After

For clarity, here’s a side-by-side comparison of how a developer’s code might change with these refactorings:

    Before (Current Design):

// Inside scene element render function (current design)
const trackId = this.getProperty<string>("featureTrackId");
const descriptors = coerceFeatureDescriptors(
this.getProperty<AudioFeatureDescriptor[]>("features"),
{ featureKey: "spectrogram", smoothing: 0 }
);
emitAnalysisIntent(this, trackId, "default", descriptors);
const frame = sampleFeatureFrame(trackId, descriptors[0], time);
if (!frame?.values) return []; // no data yet
// use frame.values for visualization...

After (Proposed Design):

    // Inside scene element render function (refactored design)
    const trackId = this.getProperty<string>("featureTrackId");
    // Intent emission handled internally by the following call:
    const data = AudioFeature.get(trackId, { feature: "spectrogram", channel: "Left" }, time);
    if (!data) return [];  // analysis still running
    // use data (e.g., an array of magnitudes) for visualization...

In the “after” code, there is no explicit descriptor coercion or intent emission in user code – AudioFeature.get (name tentative) abstracts those away. The developer provides just the needed info: which track, which feature, and optionally which channel and other simple options. The returned data could be directly the values array for that frame (as shown), or a small object if metadata like frameIndex are needed. Either way, it’s a single access point for the feature. This code is shorter, easier to read, and less error-prone (there’s no risk of forgetting to emit or to clear an intent, because those are not manual steps anymore).
Retaining Flexibility and Extensibility

Crucially, these simplifications do not remove any capabilities of the audio cache system – they merely hide the complexity until it’s needed. The refactored design still preserves flexibility in several ways:

    Multiple Calculators & Custom Features: If there are indeed multiple calculators for the same feature (e.g., two different algorithms for spectral analysis), the system can allow specifying a calculator identifier in advanced scenarios. For instance, the unified descriptor could still accept a calculatorId field when a non-default algorithm is desired. New developers won’t use this unless they need to, but power users have the hook to access alternative or custom analysis methods. The underlying registry of calculators and the mechanism to invalidate caches on version upgrades remain unchanged – ensuring that extending the system with new analysis types or improved algorithms is still fully supported.

    Analysis Profiles: The concept of analysis profiles (different parameter presets for analysis quality/performance) is retained, but the default profile is assumed so that beginners don’t have to think about it. Should an application or an advanced user need to request a “high-detail” profile, the high-level API could expose a way to do so (for example, an optional parameter in the subscription call or a different method like AudioFeature.requestWithProfile(track, feature, profileName)). Internally, the timeline store and cache handling still use the profile ID to manage compatibility of data. We’re simply making the common case (using the default) frictionless.

    Multi-Channel and Multi-Band Data: The ability to handle multi-channel audio is preserved. By unifying channel specification, we haven’t removed any routing ability – developers can still address any channel of a multichannel track, or even request multiple channels by making multiple feature requests (or we could consider an API to retrieve all channels at once). Similarly, for features like spectrograms that produce multi-band outputs, the default behavior would be to supply the full data frame, but advanced use could filter or downsample it. The new design can include convenience methods (e.g., a helper to get a specific frequency band by name or index) rather than requiring the band index in the primary descriptor. This preserves functionality while keeping the primary API surface clean.

    Lifecycle Management and Diagnostics: The analysis intent bus and cache status tracking remain under the hood to ensure that work is not duplicated and that the system knows which features are in use. The refactored API would tie into this same bus – for example, AudioFeature.get() internally would publish an intent if needed. From an architectural perspective, we are not removing the pub-sub mechanism or the scheduler; we are wrapping it in a more developer-friendly layer. This means all the existing diagnostics and tooling (like the caches panel, progress reporting, and stale-cache detection) continue to function with the new API. New developers can ignore those details initially, but as they become more advanced, they can still tap into the diagnostics to troubleshoot issues (e.g., if data isn’t appearing, they can check the cache status to see if analysis is still pending or failed, just as before).

In short, the refactoring is additive in convenience but neutral in power – everything you could do before, you can still do. The difference is you don’t have to do it the hard way by default. The architecture of the system (timeline store, analysis scheduler, feature calculators, etc.) remains robust and in place; we are mainly reorganizing how developers interact with it.
Architectural Changes and Comparison to Original

Below is a high-level summary of how the proposed design contrasts with the original, highlighting changes in key areas:

    Channel Handling: Original: Two parallel concepts (channelIndex and channelAlias) required understanding resolution rules. Refactored: A unified channel parameter (number or name) covers both, and the system performs any necessary resolution internally. This reduces ambiguity and removes an extra utility call for the developer.

    Descriptor Simplicity: Original: Descriptors expose many fields and options up front, and developers had to manually construct or coerce descriptor objects even for basic cases. Refactored: The descriptor (or feature request) can be minimal – often just the feature name and perhaps a channel – with sensible defaults for everything else. Advanced fields (alternative calculator IDs, band indices) are available but not mandatory, streamlining the common use-case.

    Scene Element API: Original: Using audio data involved multiple calls (coerceFeatureDescriptors, emitAnalysisIntent, sampleFeatureFrame) and careful ordering, plus manual intent cleanup. Refactored: Fewer calls are needed – possibly a single function or a clearly defined pair of “subscribe and sample” calls. The responsibility of issuing and clearing analysis intents is handled by the framework (or a provided utility), not by each developer’s custom code. This yields shorter, clearer scene element code and reduces the chance of errors (like forgetting to emit or clear an intent).

    Concept Count: Original: New developers had to grasp the notions of feature keys vs. calculator IDs, channel aliases vs. indices, analysis profiles, intent buses, etc., just to get started. Refactored: Many of these concepts are consolidated – e.g. the difference between alias and index is hidden, the intent bus works behind the scenes – so the initial mental model is simply “track → feature → data.” As developers advance, they can learn about profiles or custom calculators gradually, rather than being confronted with everything at once.

    Behavioral Parity: Importantly, everything the original system could do, the new interface can do as well. The changes are primarily in API ergonomics. The caching mechanism still prevents duplicate work (so if two elements ask for the same feature, the analysis runs once and is shared), and the performance characteristics remain the same. The difference is that now the API is working for the developer, not the other way around – it encapsulates the flexible but complex machinery behind a simpler façade.

In conclusion, this refactored design dramatically lowers the entry barrier for developers interacting with the audio cache system. By reducing cognitive overhead around descriptors and channel selection, and by simplifying the scene element API to require fewer steps, we make audio-reactive programming more approachable. At the same time, the design preserves the system’s versatility – ensuring that as developers grow more comfortable, they can still leverage the full power of custom features, multi-channel audio, and detailed control when needed. The architecture becomes simpler to use but remains just as powerful under the hood, achieving a better balance between intuitiveness and flexibility.

Sources: The analysis and recommendations above were based on the original audio cache system documentation and aim to maintain the integrity of its described capabilities while improving developer experience.
