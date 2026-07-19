# Custom audio calculators with SDK 2

Declare both `audio.calculators.register` and `audio.features.read`. Register the calculator from
`load`, then request its feature through the scoped audio API. Context registrations are removed
automatically on disable, reload, upgrade, or unload.

```ts
import { definePluginElement, type AudioCalculator } from '@mvmnt-app/plugin-sdk';

const calculator: AudioCalculator = {
  id: 'com.example.zero-crossings',
  version: 1,
  featureKey: 'example.zero-crossings',
  calculate(context) {
    return { frameCount: context.frameCount, channels: 1, format: 'float32',
      data: new Float32Array(context.frameCount) };
  },
};

export const element = definePluginElement({
  type: 'zero-crossings', metadata: { name: 'Zero Crossings' }, schema: { tabs: [] },
  capabilities: {
    required: ['audio.calculators.register', 'audio.features.read'], optional: [],
  },
  load(context) {
    const calculatorResult = context.audioCalculators!.register(calculator);
    if (!calculatorResult.ok) throw new Error(calculatorResult.error.message);
    const featureResult = context.audio!.requireFeatures([
      { feature: calculator.featureKey, calculatorId: calculator.id },
    ]);
    if (!featureResult.ok) throw new Error(featureResult.error.message);
  },
  render() { return []; },
});
```

New calculators and elements must import only the packed `@mvmnt-app/plugin-sdk` package.
