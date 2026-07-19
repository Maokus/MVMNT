# Creating audio elements with SDK 2

Audio plugins read host data only from the callback `context`. Declare `audio.raw.read` for PCM
or RMS windows and `audio.features.read` for cached analysis features. The identical declaration
must appear in the element's `plugin.json` entry.

Feature requirements are lifecycle scoped:

```ts
import { definePluginElement } from '@mvmnt-app/plugin-sdk';

export const meter = definePluginElement({
  type: 'meter',
  metadata: { name: 'Meter' },
  schema: { tabs: [] },
  capabilities: { required: ['audio.features.read'], optional: [] },
  load(context) {
    const registration = context.audio!.requireFeatures([{ feature: 'rms' }]);
    if (!registration.ok) throw new Error(registration.error.message);
  },
  render(_props, _state, time, context) {
    const frame = context.audio!.sampleFeature({
      trackId: 'audio-track', feature: 'rms', timeSeconds: time.seconds,
    });
    return frame.ok ? [] : [];
  },
});
```

The host automatically removes requirements, calculator registrations, and context-created
asset handles when their load or instance scope ends. See the packed
`fixtures/plugin-sdk-v2/feature-audio.ts` and `raw-audio.ts` sources for compiled examples.
