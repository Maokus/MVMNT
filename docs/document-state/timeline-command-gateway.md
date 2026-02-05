# Timeline Command Gateway

_Last reviewed: 2024-04-05_

The timeline command gateway provides a queueing facade for executing timeline mutations with
undo/redo support and telemetry. All callers—including scripting integrations—should dispatch
commands through the gateway instead of mutating the store directly.

## Default Gateway

The default gateway is exported from the timeline store:

```ts
import { timelineCommandGateway } from '@state/timelineStore';
```

### Dispatching Command Instances

```ts
const result = await timelineCommandGateway.dispatchById('timeline.addTrack', {
    type: 'midi',
    name: 'Script Track',
    midiData: serializedMidi,
});

const trackId = result.result?.trackId;
```

### Serialized Descriptors

Scripting clients can submit JSON descriptors. Version `1` is required. Use
`dispatchTimelineCommandDescriptor` for convenience when bridging automation layers.

```ts
import { dispatchTimelineCommandDescriptor } from '@state/timelineStore';

await dispatchTimelineCommandDescriptor({
    type: 'timeline.removeTracks',
    version: 1,
    payload: { trackIds: ['trk_alpha', 'trk_beta'] },
    options: { source: 'automation-layer' },
});
```

Descriptors return the same payload as imperative dispatches, including patches, metadata, and
command-specific results.

## Telemetry

Each dispatch emits a `TimelineCommandTelemetryEvent`. The payload matches the existing scene
command schema and includes:

- `commandId` and `mode`
- `undoLabel` and `telemetryEvent`
- `patch` with `timeline/` namespaced actions
- `source`, `mergeKey`, and `transient`

Register listeners via `registerTimelineCommandListener` to integrate with analytics or tooling.

## Lifecycle

The gateway queues commands serially by default. Commands marked `mode: 'concurrent'` execute in
parallel without waiting for earlier tasks. Callers should `await dispatch` to preserve ordering
promises.
