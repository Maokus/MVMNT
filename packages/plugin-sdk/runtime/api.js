export const SDK_VERSION = '2.1.0';
export const PLUGIN_CAPABILITIES = Object.freeze({
  timelineRead: 'timeline.read',
  audioFeaturesRead: 'audio.features.read',
  audioRawRead: 'audio.raw.read',
  timingConversion: 'timing.conversion',
  midiUtils: 'midi.utils',
  audioCalculatorsRegister: 'audio.calculators.register',
});
export const ok = (value) => Object.freeze({ ok: true, value });
export const err = (error) => Object.freeze({ ok: false, error: Object.freeze(error) });
export class PluginContractError extends Error {
  constructor(message) { super(message); this.name = 'PluginContractError'; this.code = 'CONTRACT_VIOLATION'; }
}
