# Plugin SDK 2 quickstart

MVMNT plugins use the independently consumable `@mvmnt/plugin-sdk` package. SDK 2 elements
are definitions rather than subclasses. MVMNT supplies a capability-scoped context to each
lifecycle and render callback.

## Define an element

```ts
import { definePluginElement } from '@mvmnt/plugin-sdk/scene';
import { Rectangle } from '@mvmnt/plugin-sdk/render';

export const pulse = definePluginElement<{ color: string }, undefined>({
    type: 'pulse',
    metadata: { name: 'Pulse', category: 'Examples' },
    schema: { tabs: [] },
    capabilities: {
        required: ['timeline.read'],
        optional: ['audio.features.read'],
    },
    render(props, _state, time, context) {
        const duration = context.timeline.getMetadata();
        if (!duration.ok) return [];
        const size = 40 + 20 * Math.sin(time.seconds * Math.PI * 2);
        return [new Rectangle(-size / 2, -size / 2, size, size, { fillColor: props.color })];
    },
});
```

Required facets are present in callbacks because the loader skips the element when the host
cannot grant them. Optional facets are `undefined` when unavailable. Expected failures return
`Result<T, PluginDiagnostic>`; check `ok` before reading `value`.

## Add the manifest

```json
{
  "id": "com.example.pulse",
  "name": "Pulse",
  "version": "1.0.0",
  "apiVersion": "^2.0.0",
  "elements": [{
    "type": "pulse",
    "entry": "pulse.ts",
    "capabilities": {
      "required": ["timeline.read"],
      "optional": ["audio.features.read"]
    }
  }]
}
```

Manifest and definition capability lists must match exactly, including required/optional
classification and order. Unknown and duplicate capabilities are rejected before execution.

## Build and develop

```sh
npm install
npm run build-plugin path/to/plugin
npm run dev-plugin path/to/plugin
```

The builder keeps all SDK root and domain imports external and produces CJS bundles. Application
aliases such as `@core/*`, `@state/*`, and `@audio/*` are not public and are rejected for v2.

Raw PCM reads are synchronous and return a new `Float32Array`. They intentionally have no sample
cap, so long ranges may allocate significant memory. Use feature sampling when PCM detail is not
necessary and observe the callback `AbortSignal` during asynchronous work.

The compilable source for this guide is maintained in `fixtures/plugin-sdk-v2`.
