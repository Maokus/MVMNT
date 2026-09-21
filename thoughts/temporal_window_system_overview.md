# Temporal Window Systems for Real-Time Visualisation

## Overview

A temporal window system defines **which part of a time-varying data stream is currently considered relevant, how that data is positioned relative to the present, and which portion of it is visible on screen**.

The key idea is to separate three questions that are often conflated in real-time visualisation code:

1. **What data should exist right now?**  
   A *materialisation window* selects or constructs the temporal data that is currently available to the visualisation.

2. **Where is that data relative to a temporal reference point?**  
   An *anchor* and a temporal coordinate system determine how samples or events are positioned in time.

3. **What part of that materialised data should be visible?**  
   A *viewport window* determines how the available temporal data is mapped into the visible visual space.

Keeping these concerns separate makes it possible to describe scrolling traces, accumulating histories, triggered displays, transport-synchronised views, and other temporal behaviours using the same small set of concepts.

---

## 1. Temporal data

A real-time visualisation usually consumes one or more forms of time-varying data. A useful distinction is:

- **Continuous signals**: values that conceptually exist at every point in time, such as amplitude, pitch, or a control parameter.
- **Point events**: values associated with discrete moments, such as note-on events, detected onsets, or beat markers.
- **Interval events**: values that occupy a span of time, such as notes with duration, regions, phrases, or detected segments.

The window model does not need to prescribe how these values are produced. It only needs a consistent notion of **when** each value belongs in time.

---

## 2. The temporal anchor

A window is interpreted relative to an **anchor**: the temporal reference point around which the current view is defined.

The most common anchor is **now**, but other anchors are possible:

- the current playback position,
- the most recent trigger,
- the start of a phrase,
- the beginning of a recording,
- a selected event,
- or any externally supplied temporal reference.

If the anchor time is written as `A`, other temporal positions can be described relative to it.

For example, a sample occurring two seconds before the anchor has a relative time of:

```text
relativeTime = sampleTime - A = -2 s
```

Using relative time rather than absolute time is useful because many visual behaviours depend on **age** or **distance from the present**, rather than on an absolute timestamp.

---

## 3. The materialisation window

The **materialisation window** determines which portion of temporal data is currently available to the visualisation.

A simple bounded history might be written conceptually as:

```text
[A - historyLength, A]
```

If the history length is five seconds, the visualisation contains only data from the five seconds leading up to the anchor.

This produces the familiar behaviour of a scrolling scope: new data enters at one edge while old data eventually leaves the window.

### Bounded windows

A bounded window has a finite temporal extent.

Examples include:

- the last 10 seconds of audio,
- the previous four beats,
- events within 500 ms of the current time,
- one bar before and one bar after the playhead.

Bounded windows are useful when the display should represent a moving local context.

### Accumulating windows

An accumulating window has a fixed origin and a moving end:

```text
[origin, A]
```

As time advances, the amount of materialised history increases.

This is useful for displays such as:

- a waveform that grows during recording,
- notes accumulated since the beginning of a phrase,
- an event history since the most recent reset,
- a performance timeline that progressively fills.

Accumulation is therefore different from simply choosing a very large bounded window: its beginning is semantically meaningful and remains fixed until the window is reset.

---

## 4. Window coordinate systems

Window bounds do not need to be measured in seconds.

A temporal window can use any monotonic coordinate system relevant to the application, for example:

- seconds,
- samples,
- video frames,
- musical beats,
- bars,
- transport ticks,
- or another domain-specific temporal unit.

The important requirement is that the system can determine the position of data and the anchor within the same coordinate system.

For music software, this distinction is particularly useful because a four-beat window and a two-second window behave differently when tempo changes. A beat-based window stays musically stable, while a seconds-based window stays physically stable.

---

## 5. Cadence: when the window updates

The anchor and the data inside a window do not necessarily have to update continuously.

**Cadence** describes when a temporal state is refreshed.

Common behaviours include:

- **continuous** — updated every rendering or processing cycle,
- **periodic** — updated at a fixed interval,
- **transport-relative** — updated at beat, subdivision, or bar boundaries,
- **event-driven** — updated only when a trigger occurs.

Cadence can be applied to the anchor, the data entering the window, or both.

For example, a display may sample a value only once per beat while still animating the resulting mark smoothly between beat boundaries.

---

## 6. Reconstruction between updates

When temporal state changes less frequently than the display refresh rate, the visualisation must decide what happens between updates.

This is the role of **reconstruction**.

Two useful reconstruction modes are:

### Hold

The most recent state remains unchanged until the next update.

```text
update        update        update
  |-------------|-------------|
  value A       value B       value C
```

This produces discrete or stepped visual motion.

### Interpolate

The display moves continuously between successive states.

```text
A ---------> B ---------> C
```

This produces smoother movement while preserving a lower underlying update cadence.

Cadence and reconstruction should therefore be treated as separate concepts:

- **cadence** determines *when authoritative temporal states are produced*;
- **reconstruction** determines *how those states are presented between updates*.

---

## 7. Temporal metadata

Once data has been placed inside a window, it is often useful to derive window-relative metadata for visual mapping.

Typical values include:

### Relative time

```text
relativeTime = itemTime - anchorTime
```

This expresses where an item lies relative to the anchor.

### Age

```text
age = anchorTime - itemTime
```

This is convenient when older data should fade, shrink, or otherwise change appearance.

### Normalised position

A temporal value can be mapped into a `0..1` interval representing its position within the window:

```text
position = (itemTime - windowStart) / (windowEnd - windowStart)
```

This provides a coordinate that can be used directly for visual placement without requiring the rendering layer to understand the original time units.

For an interval event, the same calculation can be performed for both its start and end, producing two positions that can define the width or span of a visual mark.

---

## 8. The viewport window

The **viewport window** is distinct from the materialisation window.

The materialisation window answers:

> Which temporal data currently exists for the visualisation?

The viewport answers:

> Which temporal region is currently visible, and how is it mapped onto the display?

These windows may be identical, but they do not have to be.

### Coupled viewport

The simplest configuration is for the viewport to match the materialisation window exactly.

For example:

```text
materialised data:  [ -5 s ---------------- 0 ]
visible viewport:   [ -5 s ---------------- 0 ]
```

All materialised data is visible.

### Independent viewport

The viewport can instead show only part of the available materialised history.

```text
materialised data:  [ -20 s --------------------------- 0 ]
visible viewport:              [ -8 s ----------- -2 s ]
```

This makes behaviours such as zooming, panning, fixed temporal framing, or delayed views possible without changing what data is retained.

This separation is important because **data lifetime and visual framing are different concerns**.

---

## 9. Clipping and visibility

When a viewport is narrower than the materialised window, some data may exist but not currently be visible.

A visualisation system therefore needs a policy for values outside the viewport. Common choices are:

- discard them before rendering,
- retain them but clip them at the visual boundary,
- draw partial interval marks where only part of an interval intersects the viewport,
- or apply a custom visibility rule.

For interval data, visibility should generally be based on **intersection** rather than whether the start point alone lies inside the viewport.

---

## 10. Common temporal behaviours

The concepts above can describe several recurring real-time visualisation patterns.

### Scrolling history

- Anchor follows the current time.
- Materialisation window has a fixed history length.
- Viewport matches the materialisation window.
- Old values leave as new values arrive.

Typical use: waveform or level history.

### Accumulating history

- Window has a fixed origin.
- End follows the current anchor.
- Data remains present until the window is reset.

Typical use: recorded waveform, note history, performance timeline.

### Triggered snapshot

- Anchor changes only when a trigger occurs.
- Window is defined relative to the trigger.
- Display remains stable between triggers.

Typical use: transient inspection or onset-aligned visualisation.

### Stepped musical window

- Temporal coordinates are expressed in beats.
- Anchor advances at beat or subdivision boundaries.
- Reconstruction may hold or interpolate between those updates.

Typical use: beat-synchronised motion or bar-oriented displays.

### Fixed viewport over live data

- Materialisation window continues to update.
- Viewport remains fixed or moves independently.

Typical use: inspecting a selected historical region while acquisition continues.

---

## 11. A useful conceptual decomposition

A general temporal window system can be understood as five mostly independent decisions:

| Concern | Question |
|---|---|
| **Temporal coordinate system** | In what units is time represented? |
| **Anchor** | What temporal point acts as the current reference? |
| **Materialisation** | Which temporal values currently exist? |
| **Cadence and reconstruction** | When does temporal state update, and what happens between updates? |
| **Viewport** | Which part of the available temporal data is visible? |

This decomposition is useful because many apparently different visualisations vary along only one or two of these dimensions.

A scrolling waveform and an accumulating waveform may use the same data source, rendering logic, and mappings; they differ mainly in how the materialisation window is defined. Likewise, a continuously scrolling display and a beat-stepped display may share the same window extent but differ in anchor cadence and reconstruction.

---

## 12. Implementation guidance

A system implementing this model does not need to expose every concept directly to users, but it should keep them distinct internally.

A practical implementation can follow this sequence:

1. Convert incoming data into a common temporal representation.
2. Determine the current anchor.
3. Determine the materialisation window bounds.
4. Select or construct data that intersects those bounds.
5. Derive relative and normalised temporal metadata.
6. Determine the viewport bounds.
7. Map viewport-relative positions into visual coordinates.
8. Clip or suppress values outside the viewport.
9. Apply cadence and reconstruction rules as the anchor or data state changes.

The important architectural principle is that **temporal selection, temporal positioning, and visual framing should remain separate stages**. This keeps the model general enough to support different kinds of real-time visualisations without requiring each visualisation to reimplement its own notion of history, scrolling, triggering, or temporal framing.

---

## Summary

The window model can be reduced to a simple idea:

> A real-time visualisation maintains a temporally defined set of data around an anchor, derives each item's position within that temporal context, and independently chooses which portion of that context is visible.

From this foundation, scrolling, accumulation, triggering, beat-synchronised updates, temporal zooming, and many other behaviours emerge as configurations of the same underlying concepts rather than as separate special cases.
