import { CallbackElementRenderer } from '../../../../packages/plugin-sdk/src/scene';

/**
 * Host-owned migration adapter for legacy class-oriented renderers.
 * New SDK 2 plugins should consume callback capabilities directly.
 */
export abstract class HostCallbackElementRenderer extends CallbackElementRenderer {
    protected override hostApi(..._requirements: any[]): any {
        const context = this.context;
        const unwrap = (result: any) => (result?.ok ? result.value : null);
        const notes = (args: any) => {
            const result = context.timeline?.selectNotes({
                trackIds: args.trackIds,
                startSeconds: Math.max(0, args.startSec ?? 0),
                endSeconds: args.endSec,
            });
            return result?.ok
                ? result.value.map((note: any) => ({
                      ...note,
                      startTime: note.startSeconds,
                      endTime: note.endSeconds,
                      duration: note.durationSeconds,
                  }))
                : [];
        };
        const metadata = () => unwrap(context.timeline?.getMetadata());
        const timing = {
            secondsToTicks: (value: number) => unwrap(context.timing?.secondsToTicks(value)),
            ticksToSeconds: (value: number) => unwrap(context.timing?.ticksToSeconds(value)),
            secondsToBeats: (value: number) => unwrap(context.timing?.secondsToBeats(value)),
            beatsToSeconds: (value: number) => unwrap(context.timing?.beatsToSeconds(value)),
            beatsToTicks: (value: number) => unwrap(context.timing?.beatsToTicks(value)),
            ticksToBeats: (value: number) => unwrap(context.timing?.ticksToBeats(value)),
            getTimeSignature: () => unwrap(context.timing?.getTimeSignature()),
        };
        const timeline: any = {
            getStateSnapshot: () => {
                const value = metadata();
                return value
                    ? { timeline: { globalBpm: value.tempoBpm, beatsPerBar: value.timeSignature.numerator } }
                    : null;
            },
            getTimelineDuration: () => metadata()?.durationSeconds ?? 0,
            selectNotesInWindow: notes,
            selectDistinctNoteNumbers: (args: any = {}) =>
                [
                    ...new Set<number>(
                        notes({
                            ...args,
                            startSec: args.startSec ?? 0,
                            endSec: args.endSec ?? metadata()?.durationSeconds ?? 86400,
                        }).map((note: any) => note.note)
                    ),
                ].sort((a, b) => a - b),
            selectNotesByPitch: (pitch: number, args: any = {}) =>
                notes({
                    ...args,
                    startSec: args.startSec ?? 0,
                    endSec: args.endSec ?? metadata()?.durationSeconds ?? 86400,
                }).filter((note: any) => note.note === pitch),
            getNoteRange: (args: any = {}) => {
                const pitches = timeline.selectDistinctNoteNumbers(args);
                return pitches.length ? { min: pitches[0], max: pitches[pitches.length - 1] } : null;
            },
            getTrackById: (id: string) => unwrap(context.timeline?.getTrack(id)),
        };
        const audio = {
            getRmsInWindow: (args: any) =>
                unwrap(context.audio?.getRms({
                    trackId: args.trackId,
                    startSeconds: args.startSec,
                    endSeconds: args.endSec,
                })),
            getSampleRate: (args: any) => unwrap(context.audio?.getChannelMetadata(args.trackId))?.sampleRate ?? 0,
            sampleFeatureAtTime: (args: any) => {
                const frame = unwrap(context.audio?.sampleFeature({
                    trackId: args.trackId,
                    feature: args.feature,
                    timeSeconds: args.time,
                }));
                return frame ? { values: Array.isArray(frame.value) ? frame.value : [frame.value] } : null;
            },
            getRawSamples: (args: any) =>
                unwrap(context.audio?.getRawSamples({
                    trackId: args.trackId,
                    startSeconds: args.startSec,
                    endSeconds: args.endSec,
                    channel: args.channel,
                })),
            sampleFeatureRange: (args: any) => {
                const value = unwrap(context.audio?.sampleFeatureRange({
                    trackId: args.trackId,
                    feature: args.feature,
                    startSeconds: args.startTime,
                    endSeconds: args.endTime,
                    stepSeconds: args.stepSec,
                }));
                return (value ?? []).map((frame: any, index: number) => ({
                    time: frame.timeSeconds,
                    result: {
                        values: Array.isArray(frame.value) ? frame.value : [frame.value],
                        metadata: { frame: { frameIndex: index } },
                    },
                }));
            },
        };
        return {
            ok: true,
            status: 'ok',
            missingCapabilities: [],
            api: { timeline, timing, audio },
            renderFallback: () => [],
        };
    }
}
