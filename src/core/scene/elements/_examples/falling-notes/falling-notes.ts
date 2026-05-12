// Example: Falling Notes
//
// Displays upcoming MIDI notes as blocks that fall toward a "now" line at the
// bottom of the element. Notes higher in the window will play sooner. This is
// the same top-down layout used by many rhythm games.
//
// Key concepts demonstrated:
//   - Timeline API: selectNotesInWindow with a time lookahead window
//   - Mapping note pitch (0–127) to an X position across the element width
//   - Mapping note time to a Y position that advances each frame
//   - Velocity → colour alpha via hex manipulation
//   - Velocity-tinted colours and a static "now" line as visual anchor
//
// To use: run `npm run create-example`, pick "falling-notes", and choose a plugin ID.
import {
    SceneElement,
    prop,
    insertElementGroups,
    tab,
    getRequiredPluginApi,
    PLUGIN_CAPABILITIES,
    Rectangle,
    Line,
    Text,
    type RenderObject,
    type TimelineNoteEvent,
} from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

export class FallingNotesElement extends SceneElement {
    constructor(id: string = 'fallingNotes', config: Record<string, unknown> = {}) {
        super('falling-notes', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Falling Notes',
                description: 'MIDI notes falling toward a now-line, piano-roll style',
                category: 'Examples',
            },
            [
                tab.properties([
                    {
                        id: 'midiSource',
                        label: 'MIDI Source',
                        collapsed: false,
                        properties: [
                            prop.midiTrack('midiTrackId', 'MIDI Track', {
                                description: 'Track whose notes to display',
                            }),
                            prop.number('lookaheadSec', 'Lookahead (sec)', 3, {
                                min: 0.5,
                                max: 10,
                                step: 0.5,
                                description: 'How many seconds ahead of now to show',
                            }),
                        ],
                    },
                    {
                        id: 'layout',
                        label: 'Layout',
                        collapsed: false,
                        properties: [
                            prop.number('width', 'Width', 600, { step: 10 }),
                            prop.number('height', 'Height', 300, { step: 10 }),
                            prop.number('noteHeight', 'Note Height', 10, { min: 2, max: 60, step: 1 }),
                            prop.colorAlpha('noteColor', 'Note Color', '#34D399FF'),
                            prop.colorAlpha('nowLineColor', 'Now-Line Color', '#F87171FF'),
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        if (!props.midiTrackId) {
            return [new Text(0, 0, 'Select a MIDI track', '14px Inter, sans-serif', '#94a3b8', 'left', 'top')];
        }

        // Request timeline read capability.
        const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.timelineRead]);
        if (!host.ok) return host.renderFallback();

        const w = props.width as number;
        const h = props.height as number;
        const lookahead = props.lookaheadSec as number;
        const noteH = props.noteHeight as number;
        const noteColor = props.noteColor as string; // '#RRGGBBAA'
        const nowColor = props.nowLineColor as string;

        // Query all notes visible in the lookahead window.
        // We include a small tail behind now (0.1 s) so notes that just fired
        // linger at the bottom momentarily rather than vanishing abruptly.
        const notes: TimelineNoteEvent[] = host.api.timeline.selectNotesInWindow({
            trackIds: [props.midiTrackId],
            startSec: targetTime - 0.1,
            endSec: targetTime + lookahead,
        });

        const objects: RenderObject[] = [];

        for (const note of notes) {
            // Y: future notes start at the top (y ≈ 0), current notes are at the bottom (y ≈ h).
            //    As time advances the note slides down, reaching the now-line at startSec.
            const timeUntil = note.startTime - targetTime; // seconds until note fires
            const yFraction = 1 - timeUntil / lookahead; // 0 = top, 1 = bottom
            const y = yFraction * h - noteH;

            // X: spread notes across the full width by MIDI pitch (0 = left, 127 = right).
            const noteWidth = Math.max(4, w / 60);
            const x = (note.note / 127) * (w - noteWidth);

            // Encode velocity into the color's alpha channel so louder notes are more opaque.
            // noteColor is '#RRGGBBAA'; we replace the last two hex digits.
            const velocity = (note as any).velocity ?? 100;
            const alpha = Math.round((0.35 + (velocity / 127) * 0.65) * 255);
            const alphaHex = alpha.toString(16).padStart(2, '0').toUpperCase();
            const color = noteColor.slice(0, 7) + alphaHex;

            objects.push(new Rectangle(x, y, noteWidth, noteH, color));
        }

        // Draw the "now" line as a visual anchor at the very bottom.
        objects.push(new Line(0, h, w, h, nowColor, 2));

        if (notes.length === 0) {
            objects.push(
                new Text(w / 2, h / 2, 'No notes in window', '12px Inter, sans-serif', '#64748b', 'center', 'middle')
            );
        }

        return objects;
    }
}
