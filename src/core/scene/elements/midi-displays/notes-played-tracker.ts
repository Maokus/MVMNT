// Notes Played Tracker element: shows counts of played notes and events from a MIDI file
import { SceneElement } from '../base';
import type { EnhancedConfigSchema } from '@core/types.js';
import { RenderObject, Text } from '@core/render/render-objects';
// Timeline-backed migration: remove per-element MidiManager usage
import { ensureFontLoaded, parseFontSelection } from '@fonts/font-loader';
import { getPluginHostApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';
import { prop, insertElementGroups } from '@core/scene/plugins/plugin-sdk-prop-factories';

export class NotesPlayedTrackerElement extends SceneElement {
    // Phase 3 reference pattern: intentionally consume timeline data through the public plugin API.
    constructor(id: string = 'notesPlayedTracker', config: { [key: string]: any } = {}) {
        super('notesPlayedTracker', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(super.getConfigSchema(), {
            name: 'Notes Played Tracker',
            description: 'Displays how many notes/events have played so far (timeline-backed)',
            category: 'MIDI Displays',
        }, [
            {
                id: 'trackerSource',
                label: 'Source',
                variant: 'basic',
                collapsed: false,
                description: 'Select the MIDI track whose progress is tracked.',
                properties: [
                    prop.midiTrack('midiTrackId', 'MIDI Track'),
                ],
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
                    prop.select('textJustification', 'Text Alignment', 'left', [
                        { value: 'left', label: 'Left' },
                        { value: 'right', label: 'Right' },
                    ]),
                    prop.font('fontFamily', 'Font Family', 'Inter', {
                        description: 'Choose the font family (Google Fonts supported).',
                    }),
                    prop.number('fontSize', 'Font Size (px)', 30, { min: 6, max: 72, step: 1 }),
                    prop.color('color', 'Text Color', '#cccccc'),
                    prop.number('lineSpacing', 'Line Spacing (px)', 4, { min: 0, max: 40, step: 1 }),
                ],
                presets: [
                    {
                        id: 'studio',
                        label: 'Studio Monitor',
                        values: { fontSize: 28, color: '#f8fafc', lineSpacing: 6 },
                    },
                    { id: 'sidebar', label: 'Sidebar', values: { fontSize: 22, color: '#22d3ee', lineSpacing: 3 } },
                    {
                        id: 'bigBoard',
                        label: 'Big Board',
                        values: { fontSize: 36, color: '#f97316', lineSpacing: 8 },
                    },
                ],
            },
        ]);
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const renderObjects: RenderObject[] = [];

        const effectiveTime = Math.max(0, targetTime);
        const { api, status, missingCapabilities } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);

        // Compute counts from notes via timeline
        const trackId = props.midiTrackId;
        // To compute totals, we need all notes; if service doesn't expose a direct getter, approximate using a large window
        let totalNotes = 0;
        let playedNotes = 0;
        let playedEvents = 0;
        if (trackId && (!api || status !== 'ok')) {
            const message =
                status === 'unsupported-version'
                    ? 'Plugin API version unsupported'
                    : missingCapabilities.includes(PLUGIN_CAPABILITIES.timelineRead)
                    ? 'Timeline API unavailable (requires timeline.read)'
                    : 'Plugin host API unavailable';
            renderObjects.push(new Text(0, 0, message, '12px Inter, sans-serif', '#64748b', 'left', 'top'));
            return renderObjects;
        }
        if (trackId) {
            const all = api?.timeline.selectNotesInWindow({
                trackIds: [trackId],
                startSec: 0,
                endSec: Number.POSITIVE_INFINITY,
            }) ?? [];
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
        const fontSelection = props.fontFamily ?? 'Inter';
        const { family: fontFamily, weight: weightPart } = parseFontSelection(fontSelection);
        const fontWeight = (weightPart || '400').toString();
        const fontSize = props.fontSize ?? 30;
        const color = props.color ?? '#cccccc';
        const lineSpacing = props.lineSpacing ?? 4;
        if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
        const font = `${fontWeight} ${fontSize}px ${fontFamily || 'Inter'}, sans-serif`;

        const line1 = `Num played notes: ${playedNotes}/${totalNotes} (${pctNotes.toFixed(2)}%)`;
        const line2 = `Num played events: ${playedEvents}/${totalEvents} (${pctEvents.toFixed(2)}%)`;
        const justification = props.textJustification ?? ('left' as CanvasTextAlign);
        const text1 = new Text(0, 0, line1, font, color, justification, 'top');
        const text2 = new Text(0, fontSize + lineSpacing, line2, font, color, justification, 'top');

        renderObjects.push(text1, text2);
        return renderObjects;
    }

    dispose(): void {
        super.dispose();
    }
}
