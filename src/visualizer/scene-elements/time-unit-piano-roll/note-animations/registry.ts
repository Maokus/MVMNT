import { BaseNoteAnimation } from './base';

export interface AnimationDefinition {
    name: string; // internal id
    label: string; // user-facing label
    class: new () => BaseNoteAnimation; // constructor (no-arg)
}

const animationRegistry: Map<string, AnimationDefinition> = new Map();

export function registerAnimation(def: AnimationDefinition) {
    if (!def?.name) {
        console.warn('[animation-registry] Invalid animation definition', def);
        return;
    }
    if (animationRegistry.has(def.name)) {
        console.warn(`[animation-registry] Animation '${def.name}' already registered. Skipping.`);
        return;
    }
    animationRegistry.set(def.name, def);
}

export function createAnimationInstance(type: string): BaseNoteAnimation {
    if (type === 'none') {
        const fallback = animationRegistry.get('expand') || [...animationRegistry.values()][0];
        if (!fallback) throw new Error('No animations registered');
        return new fallback.class();
    }
    const def = animationRegistry.get(type) || animationRegistry.get('expand') || [...animationRegistry.values()][0];
    if (!def) throw new Error('No animations registered');
    return new def.class();
}

export function getAvailableAnimations(): AnimationDefinition[] {
    return [...animationRegistry.values()];
}

export function getAnimationSelectOptions() {
    return getAvailableAnimations().map((d) => ({ value: d.name, label: d.label }));
}
