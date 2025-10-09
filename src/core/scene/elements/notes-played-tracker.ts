// Notes Played Tracker element: shows counts of played notes and events from a MIDI file
import { SceneElement } from './base';
import { EnhancedConfigSchema } from '@core/types.js';
import { RenderObject, Text } from '@core/render/render-objects';
// Timeline-backed migration: remove per-element MidiManager usage
import { ensureFontLoaded, parseFontSelection } from '@fonts/font-loader';
import { useTimelineStore } from '@state/timelineStore';
import { selectNotesInWindow } from '@selectors/timelineSelectors';

export class NotesPlayedTrackerElement extends SceneElement {
    constructor(id: string = 'notesPlayedTracker', config: { [key: string]: any } = {}) {
        super('notesPlayedTracker', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const baseBasicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const baseAdvancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        return {
            name: 'Notes Played Tracker',
            description: 'Displays how many notes/events have played so far (timeline-backed)',
            category: 'MIDI Info',
            groups: [
                ...baseBasicGroups,
                {
                    id: 'trackerSource',
                    label: 'Source',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Select the MIDI track whose progress is tracked.',
                    properties: [{ key: 'midiTrackId', type: 'timelineTrackRef', label: 'MIDI Track', default: null }],
                    presets: [
                        { id: 'leadTrack', label: 'Lead Track', values: {} },
                        { id: 'rhythmTrack', label: 'Rhythm Track', values: {} },
                    ],
                },
                {
                    id: 'appearance',
                    label: 'Typography',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Adjust alignment and styling for the counters.',
                    properties: [
                        {
                            key: 'textJustification',
                            type: 'select',
                            label: 'Text Alignment',
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
                            description: 'Choose the font family (Google Fonts supported).',
                        },
                        {
                            key: 'fontSize',
                            type: 'number',
                            label: 'Font Size (px)',
                            default: 30,
                            min: 6,
                            max: 72,
                            step: 1,
                        },
                        { key: 'color', type: 'color', label: 'Text Color', default: '#cccccc' },
                        {
                            key: 'lineSpacing',
                            type: 'number',
                            label: 'Line Spacing (px)',
                            default: 4,
                            min: 0,
                            max: 40,
                            step: 1,
                        },
                    ],
                    presets: [
                        { id: 'studio', label: 'Studio Monitor', values: { fontSize: 28, color: '#f8fafc', lineSpacing: 6 } },
                        { id: 'sidebar', label: 'Sidebar', values: { fontSize: 22, color: '#22d3ee', lineSpacing: 3 } },
                        { id: 'bigBoard', label: 'Big Board', values: { fontSize: 36, color: '#f97316', lineSpacing: 8 } },
                    ],
                },
                ...baseAdvancedGroups,
            ],
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        if (!this.getProperty('visible')) return [];

        const renderObjects: RenderObject[] = [];

        const effectiveTime = Math.max(0, targetTime);

        // Compute counts from notes via timeline
        const trackId = (this.getProperty('midiTrackId') as string) || null;
        // To compute totals, we need all notes; if service doesn't expose a direct getter, approximate using a large window
        let totalNotes = 0;
        let playedNotes = 0;
        let playedEvents = 0;
        if (trackId) {
            const state = useTimelineStore.getState();
            const all = selectNotesInWindow(state, {
                trackIds: [trackId],
                startSec: 0,
                endSec: Number.POSITIVE_INFINITY,
            });
            totalNotes = all.length;
            if (targetTime >= 0) {
                for (const note of all) {
                    if ((note.startTime ?? 0) <= effectiveTime) {
                        playedNotes += 1;
                        playedEvents += 1;
                    }
                    if ((note.endTime ?? 0) <= effectiveTime) {
                        playedEvents += 1;
                    }
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
