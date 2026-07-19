import { err, ok } from './api.js';
export const checkCapability = (available, capability) => available.includes(capability)
  ? ok(true)
  : err({ code: 'CAPABILITY_UNAVAILABLE', message: `Capability '${capability}' is unavailable`, capability });
export const limitRenderObjects = (objects, maximum) => objects.length <= maximum ? objects : objects.slice(0, maximum);
