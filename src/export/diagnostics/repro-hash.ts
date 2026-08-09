/**
 * Reproducibility Hash Utility
 * -------------------------------------------------
 * Computes SHA‑256 over canonical JSON (see `audio_feature_plan_v4.md` section 8) so that identical
 * project state + export parameters yield identical hashes. This underpins deterministic export validation.
 *
 * Inputs:
 *  - app version, tempoBPM, ppq (fixed 960), ticksPerSecond, exportRange, normalized tracks array, fps.
 * Track Normalization:
 *  - Only persistence/significant timing & mix fields included (id, type, offset, region bounds, gain, mute, solo).
 *  - Non‑audio tracks reduced to minimal shape (id, type, offset) to avoid future accidental drift.
 */

export interface ReproHashInput {
    version: string;
    tempoBPM: number;
    ppq: number; // should be 960
    ticksPerSecond: number;
    exportRange: { start: number; end: number };
    tracks: any[]; // already normalized track subset (caller ensures order: timeline order)
    fps: number;
}

/** Normalize tracks from raw timeline state into spec shape. */
export function normalizeTracksForHash(rawTracks: Record<string, any>, order: string[]): any[] {
    const list: any[] = [];
    for (const id of order) {
        const t = rawTracks[id];
        if (!t) continue;
        if (t.type === 'audio') {
            list.push({
                id: t.id,
                type: 'audio',
                offset: t.offsetTicks || 0,
                regionStart: t.regionStartTick ?? null,
                regionEnd: t.regionEndTick ?? null,
                gain: t.gain ?? 1,
                mute: !!t.mute,
                solo: !!t.solo,
            });
        } else {
            // Generic normalization for non-audio track types (only include id & offset if present)
            list.push({
                id: t.id,
                type: t.type || 'unknown',
                offset: t.offsetTicks || 0,
            });
        }
    }
    return list;
}

export async function computeReproHash(input: ReproHashInput): Promise<string> {
    const canonical = canonicalJSONString(input);
    const data = new TextEncoder().encode(canonical);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return bufferToHex(digest);
}

function canonicalJSONString(obj: any): string {
    // Ensure stable key order manually per spec root order.
    const root: any = {
        version: obj.version,
        tempoBPM: obj.tempoBPM,
        ppq: obj.ppq,
        ticksPerSecond: obj.ticksPerSecond,
        exportRange: { start: obj.exportRange.start, end: obj.exportRange.end },
        tracks: obj.tracks.map((t: any) => canonicalTrack(t)),
        fps: obj.fps,
    };
    return JSON.stringify(root);
}

function canonicalTrack(t: any): any {
    if (t.type === 'audio') {
        return {
            id: t.id,
            type: 'audio',
            offset: t.offset ?? 0,
            regionStart: t.regionStart === undefined || t.regionStart === null ? null : t.regionStart,
            regionEnd: t.regionEnd === undefined || t.regionEnd === null ? null : t.regionEnd,
            gain: t.gain ?? 1,
            mute: !!t.mute,
            solo: !!t.solo,
        };
    }
    return {
        id: t.id,
        type: t.type,
        offset: t.offset ?? 0,
    };
}

function bufferToHex(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
    return s;
}
