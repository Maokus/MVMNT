// @ts-nocheck
import { defineRendererElement } from '@mvmnt-app/plugin-sdk';
import {
    CallbackElementRenderer,
    Text,
    prop,
    insertElementConfig,
    tab,
    type RenderObject,
} from '@mvmnt-app/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt-app/plugin-sdk';

class TrackerlikeMidiDisplayElement extends CallbackElementRenderer {
    constructor(id: string = 'trackerlike-midi-display', config: Record<string, unknown> = {}) {
        super('trackerlike-midi-display', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Trackerlike Midi Display',
                description: 'A tracker-style MIDI display showing notes per beat in monospace text',
            },
            [
                tab.content([
                    {
                        id: 'midiSource',
                        label: 'MIDI Source',
                        collapsed: false,
                        properties: [
                            prop.midiTrack('midiTrackId', 'MIDI Track', {
                                description: 'The MIDI track to display notes from',
                            }),
                        ],
                    },
                    {
                        id: 'trackerLayout',
                        label: 'Layout',
                        collapsed: false,
                        properties: [
                            prop.number('division', 'Division (rows per beat)', 4, {
                                min: 1,
                                max: 32,
                                step: 1,
                                description: '1 = quarter notes, 2 = 8th, 4 = 16th, etc.',
                            }),
                            prop.number('rowCount', 'Rows per page', 8, { step: 1 }),
                            prop.number('columns', 'Note columns', 4, {
                                min: 1,
                                max: 8,
                                step: 1,
                                description: 'How many simultaneous notes to show per row',
                            }),
                            prop.boolean('showTrackName', 'Show Track Name', true),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'trackerAppearance',
                        label: 'Appearance',
                        collapsed: false,
                        properties: [
                            prop.number('fontSize', 'Font Size', 16, { step: 1 }),
                            prop.colorAlpha('textColor', 'Text Color', '#e2e8f0FF'),
                            prop.colorAlpha('activeColor', 'Active Row Color', '#10B981FF'),
                            prop.colorAlpha('headerColor', 'Header Color', '#94a3b8FF'),
                        ],
                    },
                ]),
            ]
        );
    }

    override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const objects: RenderObject[] = [];

        if (!props.midiTrackId) {
            objects.push(new Text(0, 0, 'Select a MIDI track', '14px monospace', {
                color: '#94a3b8', align: 'left', baseline: 'top',
            }));
            return objects;
        }

        const timeline = this.context.timeline;
        const timing = this.context.timing;
        if (!timeline || !timing) {
            objects.push(new Text(0, 0, 'Timeline API unavailable', '12px monospace', {
                color: '#64748b', align: 'left', baseline: 'top',
            }));
            return objects;
        }

        const division = Math.max(1, Math.round(props.division));
        const rowCount = props.rowCount;
        const columns = Math.max(1, Math.round(props.columns));
        const fontSize = props.fontSize;
        const lineHeight = Math.round(fontSize * 1.6);
        const font = `${fontSize}px monospace`;

        // Current position in subbeats (beats * division)
        const currentBeatsResult = timing.secondsToBeats(targetTime);
        const currentBeats = currentBeatsResult.ok ? currentBeatsResult.value : 0;
        const currentSubbeat = Math.floor(Math.max(0, currentBeats) * division);

        // Page: which group of rowCount subbeats are we in
        const pageStart = Math.floor(currentSubbeat / rowCount) * rowCount;
        const activeRowIndex = currentSubbeat - pageStart; // 0-indexed row within this page

        let yOffset = 0;

        // Header row
        if (props.showTrackName) {
            const track = timeline.getTrack(props.midiTrackId);
            const trackLabel = track.ok ? track.value.name : '?';
            objects.push(new Text(0, 0, ` T> ${trackLabel}`, font, {
                color: props.headerColor, align: 'left', baseline: 'top',
            }));
            yOffset = lineHeight;
        }

        // Subbeat rows
        for (let i = 0; i < rowCount; i++) {
            const subbeat = pageStart + i; // 0-indexed absolute subbeat
            const isActive = i === activeRowIndex;

            // Time window for this subbeat (1/division of a beat wide)
            const startResult = timing.beatsToSeconds(subbeat / division);
            const endResult = timing.beatsToSeconds((subbeat + 1) / division);
            const subbeatStartSec = startResult.ok ? startResult.value : subbeat / division;
            const subbeatEndSec = endResult.ok ? endResult.value : (subbeat + 1) / division;

            // Get notes that START within this subbeat's window, up to `columns` of them
            const selected = timeline.selectNotes({
                trackIds: [props.midiTrackId],
                startSeconds: subbeatStartSec,
                endSeconds: subbeatEndSec,
            });
            const starting = (selected.ok ? selected.value : [])
                .filter((n) => n.startSeconds >= subbeatStartSec && n.startSeconds < subbeatEndSec)
                .slice(0, columns);

            // Build note columns: each is 4 chars wide ("C3  ", "C#3 ", "-- ")
            const noteCells = Array.from({ length: columns }, (_, col) => {
                const note = starting[col];
                return note ? (this.context.midi?.noteName(note.note) ?? String(note.note)).padEnd(4) : '--  ';
            });

            const cursor = isActive ? '>' : ' ';
            const rowNum = String(i + 1).padStart(2);
            const line = `${cursor}${rowNum} ${noteCells.join(' ')}`;

            const color = isActive ? props.activeColor : props.textColor;
            const y = yOffset + lineHeight * i;
            objects.push(new Text(0, y, line, font, { color, align: 'left', baseline: 'top' }));
        }

        return objects;
    }
}

export const trackerlikeMidiDisplay = defineRendererElement(
    {
        type: 'trackerlike-midi-display',
        capabilities: { required: ['timeline.read', 'timing.conversion'], optional: [] },
    },
    TrackerlikeMidiDisplayElement
);
export default trackerlikeMidiDisplay;
