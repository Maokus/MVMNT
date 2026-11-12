import type { ElementBindings } from '@state/sceneStore';

export interface TrackInputDef {
    key: string;
    label: string;
    allowedTrackTypes?: Array<'midi' | 'audio'>;
    allowMultiple?: boolean;
}

type Tracks = Record<string, { type: string } | undefined>;

export function compatibleTrackIds(input: TrackInputDef, tracks: Tracks): string[] {
    const allowed = input.allowedTrackTypes?.length ? input.allowedTrackTypes : ['midi'];
    return Object.keys(tracks).filter((id) => allowed.includes(tracks[id]?.type as 'midi' | 'audio'));
}

export function validTrackSelection(input: TrackInputDef, value: unknown, tracks: Tracks): boolean {
    const ids = input.allowMultiple ? (Array.isArray(value) ? value : []) : [value];
    const compatible = new Set(compatibleTrackIds(input, tracks));
    return ids.length > 0 && ids.every((id) => typeof id === 'string' && compatible.has(id));
}

export function unresolvedTrackInputs(
    inputs: TrackInputDef[],
    bindings: ElementBindings,
    tracks: Tracks
): TrackInputDef[] {
    return inputs.filter((input) => {
        const binding = bindings[input.key];
        // Authored macro/automation connections must not be replaced by setup.
        if (binding && binding.type !== 'constant') return false;
        return !validTrackSelection(input, binding?.value, tracks);
    });
}
