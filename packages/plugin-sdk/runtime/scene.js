import { PluginContractError } from './api.js';

export function definePluginElement(input) {
    if (!input || typeof input !== 'object')
        throw new PluginContractError('definePluginElement() requires a definition object');
    if (!/^[a-z][a-z0-9-]*$/.test(input.type)) throw new PluginContractError(`Invalid element type: ${input.type}`);
    if (typeof input.render !== 'function')
        throw new PluginContractError(`Element '${input.type}' must define render()`);
    const all = [...(input.capabilities?.required ?? []), ...(input.capabilities?.optional ?? [])];
    if (new Set(all).size !== all.length)
        throw new PluginContractError('Element capabilities must not contain duplicates');
    return Object.freeze({ ...input, kind: 'mvmnt.plugin-element.v2' });
}

export const isPluginElementDefinition = (value) =>
    Boolean(value && typeof value === 'object' && value.kind === 'mvmnt.plugin-element.v2');
