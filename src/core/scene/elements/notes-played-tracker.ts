// Notes Played Tracker element: shows counts of played notes and events from a MIDI file
import { SceneElement } from './base';
import { EnhancedConfigSchema } from '@core/types.js';
import { RenderObject, Text } from '@core/render/render-objects';
// Timeline-backed migration: remove per-element MidiManager usage
import { ensureFontLoaded, parseFontSelection } from '@shared/services/fonts/font-loader';
import { useTimelineStore } from '@state/timelineStore';
import { selectNotesInWindow } from '@selectors/timelineSelectors';

export class NotesPlayedTrackerElement extends SceneElement {
    constructor(id: string = 'notesPlayedTracker', config: { [key: string]: any } = {}) {
        super('notesPlayedTracker', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            name: 'Notes Played Tracker',
            description: 'Displays how many notes/events have played so far (timeline-backed)',
            category: 'info',
            groups: [
                ...base.groups,
                {
                    id: 'content',
                    label: 'Content',
                    collapsed: false,
                    properties: [
                        { key: 'midiTrackId', type: 'midiTrackRef', label: 'MIDI Track', default: null },
                        {
                            key: 'timeOffset',
                            type: 'number',
                            label: 'Time Offset (s)',
                            default: 0,
                            step: 0.01,
                            description: 'Offset applied to target time (can be negative)',
                        },
                    ],
                },
                {
                    id: 'appearance',
                    label: 'Appearance',
                    collapsed: true,
                    properties: [
                        {
                            key: 'textJustification',
                            type: 'select',
                            label: 'Text Justification',
                            default: 'left',
                            options: [
                                { value: 'left', label: 'Left' },
                                { value: 'right', label: 'Right' },
                            ],
                        },
                        {
                            key: 'fontFamily',
                            type: 'font',
                            label: 'Font Family',
                            default: 'Inter',
                            description: 'Choose the font family (Google Fonts supported)',
                        },
                        {
                            key: 'fontSize',
                            type: 'number',
                            label: 'Font Size',
                            default: 30,
                            min: 6,
                            max: 72,
                            step: 1,
                        },
                        { key: 'color', type: 'color', label: 'Text Color', default: '#cccccc' },
                        {
                            key: 'lineSpacing',
                            type: 'number',
                            label: 'Line Spacing',
                            default: 4,
                            min: 0,
                            max: 40,
                            step: 1,
                        },
                    ],
                },
            ],
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        if (!this.getProperty('visible')) return [];

        const renderObjects: RenderObject[] = [];

        const timeOffset = (this.getProperty('timeOffset') as number) || 0;
        const actualTime = targetTime + timeOffset;
        const effectiveTime = Math.max(0, actualTime);

        // Compute counts from notes via timeline
        const trackId = (this.getProperty('midiTrackId') as string) || null;
        // To compute totals, we need all notes; if service doesn't expose a direct getter, approximate using a large window
        let totalNotes = 0;
        let playedNotes = 0;
        let playedEvents = 0;
        if (trackId) {
            const state = useTimelineStore.getState();
            const track = state.tracks[trackId];
            const offset = track ? track.offsetSec || 0 : 0;
            // Attempt to estimate duration from cache when available
            const cacheKey = track?.midiSourceId ?? trackId;
            const cache = state.midiCache[cacheKey];
            const localDur = cache?.notesRaw?.reduce((m: number, n: any) => Math.max(m, n.endTime || 0), 0) || 0;
            const duration = localDur;
            const startSec = Math.max(0, offset + 0);
            const endSec = duration ? offset + duration : effectiveTime + 600; // fallback large window
            const all = selectNotesInWindow(state, { trackIds: [trackId], startSec, endSec });
            totalNotes = all.length;
            if (actualTime >= 0) {
                playedNotes = all.filter((n) => (n.startTime ?? 0) <= effectiveTime).length;
                for (const n of all) {
                    if ((n.startTime ?? 0) <= effectiveTime) playedEvents++;
                    if ((n.endTime ?? 0) <= effectiveTime) playedEvents++;
                }
            }
        }
        const totalEvents = totalNotes * 2;

        const pctNotes = totalNotes > 0 ? (playedNotes / totalNotes) * 100 : 0;
        const pctEvents = totalEvents > 0 ? (playedEvents / totalEvents) * 100 : 0;

        // Appearance
        const fontSelection = (this.getProperty('fontFamily') as string) || 'Inter';
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const fontWeight = (weightPart || '400').toString();
        const fontSize = (this.getProperty('fontSize') as number) || 14;
        const color = (this.getProperty('color') as string) || '#cccccc';
        const lineSpacing = (this.getProperty('lineSpacing') as number) ?? 4;
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const font = `${fontWeight} ${fontSize}px ${fontFamily || 'Inter'}, sans-serif`;

        const line1 = `Num played notes: ${playedNotes}/${totalNotes} (${pctNotes.toFixed(2)}%)`;
        const line2 = `Num played events: ${playedEvents}/${totalEvents} (${pctEvents.toFixed(2)}%)`;
        const justification = ((this.getProperty('textJustification') as string) || 'left') as CanvasTextAlign;
        const text1 = new Text(0, 0, line1, font, color, justification, 'top');
        const text2 = new Text(0, fontSize + lineSpacing, line2, font, color, justification, 'top');

        renderObjects.push(text1, text2);
        return renderObjects;
    }

    dispose(): void {
        super.dispose();
    }
}
