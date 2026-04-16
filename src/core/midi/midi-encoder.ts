import type { MIDIData } from '@core/types';

function varLen(n: number): number[] {
    const bytes: number[] = [n & 0x7f];
    n >>= 7;
    while (n > 0) {
        bytes.unshift((n & 0x7f) | 0x80);
        n >>= 7;
    }
    return bytes;
}

function uint32BE(n: number): number[] {
    return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

/**
 * Encode a MIDIData object to a Format 0 binary MIDI file (Uint8Array).
 * Uses the events and ccEvents arrays (absolute tick values) from the parser output.
 * Tempo changes are derived from the seconds-based tempoMap.
 */
export function encodeMidiToBinary(midiData: MIDIData): Uint8Array {
    const tpq = midiData.ticksPerQuarter || 480;
    const tempoMap = (midiData as any).tempoMap as Array<{ time: number; tempo: number }> | undefined;

    // Convert seconds-based tempo map to tick-based tempo change events
    const tempoChanges: Array<{ tick: number; tempo: number }> = [];
    if (tempoMap && tempoMap.length > 0) {
        let prevTimeSec = 0;
        let prevTick = 0;
        let prevTempo = tempoMap[0].tempo;
        for (let i = 0; i < tempoMap.length; i++) {
            const seg = tempoMap[i];
            if (i === 0) {
                tempoChanges.push({ tick: 0, tempo: seg.tempo });
                prevTempo = seg.tempo;
            } else {
                const elapsedSec = seg.time - prevTimeSec;
                const elapsedTicks = Math.round((elapsedSec * 1_000_000 * tpq) / prevTempo);
                const tick = prevTick + elapsedTicks;
                tempoChanges.push({ tick, tempo: seg.tempo });
                prevTick = tick;
                prevTempo = seg.tempo;
            }
            prevTimeSec = seg.time;
        }
    } else {
        // Default 120 BPM
        tempoChanges.push({ tick: 0, tempo: 500000 });
    }

    type TrackEvent = { tick: number; bytes: number[] };
    const events: TrackEvent[] = [];

    // Tempo change meta events: FF 51 03 tt tt tt
    for (const tc of tempoChanges) {
        const t = tc.tempo;
        events.push({
            tick: tc.tick,
            bytes: [0xff, 0x51, 0x03, (t >>> 16) & 0xff, (t >>> 8) & 0xff, t & 0xff],
        });
    }

    // Note and other channel events
    for (const ev of midiData.events) {
        const tick = ev.tick ?? 0;
        const ch = ev.channel ?? 0;
        if (ev.type === 'noteOn') {
            events.push({ tick, bytes: [0x90 | ch, ev.note ?? 0, ev.velocity ?? 0] });
        } else if (ev.type === 'noteOff') {
            events.push({ tick, bytes: [0x80 | ch, ev.note ?? 0, ev.velocity ?? 0] });
        } else if (ev.type === 'controlChange') {
            events.push({ tick, bytes: [0xb0 | ch, ev.note ?? 0, ev.velocity ?? 0] });
        } else if (ev.type === 'programChange') {
            events.push({ tick, bytes: [0xc0 | ch, ev.note ?? 0] });
        } else if (ev.type === 'pitchBend') {
            const d = ev.data ?? [0, 64];
            events.push({ tick, bytes: [0xe0 | ch, d[0] & 0x7f, d[1] & 0x7f] });
        }
    }

    // CC events stored separately (parser puts only noteOn/noteOff in events)
    for (const ev of midiData.ccEvents ?? []) {
        const tick = ev.tick ?? 0;
        const ch = ev.channel ?? 0;
        events.push({ tick, bytes: [0xb0 | ch, ev.note ?? 0, ev.velocity ?? 0] });
    }

    // Sort by tick, with tempo changes before channel events at the same tick
    events.sort((a, b) => {
        if (a.tick !== b.tick) return a.tick - b.tick;
        const aMeta = a.bytes[0] === 0xff ? 0 : 1;
        const bMeta = b.bytes[0] === 0xff ? 0 : 1;
        return aMeta - bMeta;
    });

    // End of track: FF 2F 00
    const lastTick = events.length > 0 ? events[events.length - 1].tick : 0;
    events.push({ tick: lastTick, bytes: [0xff, 0x2f, 0x00] });

    // Encode track bytes: delta time + event bytes
    const trackBytes: number[] = [];
    let prevTick = 0;
    for (const ev of events) {
        const delta = Math.max(0, ev.tick - prevTick);
        trackBytes.push(...varLen(delta));
        trackBytes.push(...ev.bytes);
        prevTick = ev.tick;
    }

    // File layout: MThd + MTrk
    const fileBytes: number[] = [
        // MThd
        0x4d, 0x54, 0x68, 0x64,
        ...uint32BE(6),
        0x00, 0x00, // format 0
        0x00, 0x01, // 1 track
        (tpq >> 8) & 0xff, tpq & 0xff,
        // MTrk
        0x4d, 0x54, 0x72, 0x6b,
        ...uint32BE(trackBytes.length),
        ...trackBytes,
    ];

    return new Uint8Array(fileBytes);
}

/** Returns true if the bytes look like a binary MIDI file (MThd header). */
export function isMidiBinary(bytes: Uint8Array): boolean {
    return (
        bytes.length >= 4 &&
        bytes[0] === 0x4d &&
        bytes[1] === 0x54 &&
        bytes[2] === 0x68 &&
        bytes[3] === 0x64
    );
}
