import { describe, expect, it } from 'vitest';
import { EmptyRenderObject, Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import { notesPlayingDisplay } from '../midi-displays/notes-playing-display';

const baseProps = {
    midiTrackId: 'midi-1',
    showAllAvailableTracks: false,
    displayMode: 'grid',
    fadeOutDuration: 0.5,
    lettersSpacing: 32,
    gridColumns: 2,
    gridRows: 2,
    gridRowNoteOffset: 12,
    gridStartNote: 60,
    gridCellWidth: 20,
    gridCellHeight: 20,
    gridCellGap: 4,
    gridCornerRadius: 3,
    gridStrokeWidth: 1,
    gridStrokeColor: '#112233',
    gridStrokeOpacity: 0.5,
    animationType: 'bump',
    textColor: '#ffffff',
    textOpacity: 1,
    gridFillColor: '#abcdef',
    gridFillOpacity: 0.8,
    fontFamily: 'BuiltIn:inter|400',
    fontSize: 12,
    textAlign: 'left',
    lineSpacing: 4,
    showBackground: false,
    backgroundColor: '#000000',
    backgroundOpacity: 0.8,
    backgroundPaddingX: 8,
    backgroundPaddingY: 4,
    backgroundCornerRadius: 4,
};

interface TestNote {
    note: number;
    startSeconds: number;
    endSeconds: number;
}

const renderAt = (
    current: number,
    {
        notes = [{ note: 60, startSeconds: 1, endSeconds: 2 }],
        props = {},
    }: { notes?: TestNote[]; props?: Partial<typeof baseProps> } = {}
): RenderObject[] =>
    notesPlayingDisplay.render({
        props: { ...baseProps, ...props },
        resources: undefined,
        simulation: undefined,
        time: { seconds: current } as any,
        context: {
            timeline: {
                selectNotes: () => ({ ok: true, value: notes }),
                getMetadata: () => ({ ok: true, value: { durationSeconds: 4 } }),
            },
        } as any,
    }) as RenderObject[];

const getPad = (objects: RenderObject[]): EmptyRenderObject =>
    objects.find((object) => object instanceof EmptyRenderObject) as EmptyRenderObject;

describe('notes playing display grid', () => {
    it('uses one stable layout rectangle while animated visuals remain excluded', () => {
        const frames = [
            renderAt(0.5, { notes: [], props: { animationType: 'softPop' } }),
            renderAt(1, { props: { animationType: 'softPop', showBackground: true } }),
            renderAt(1.1, { props: { animationType: 'softPop', showBackground: true } }),
            renderAt(1.4, { props: { animationType: 'softPop', showBackground: true } }),
            renderAt(2.25, { props: { animationType: 'softPop', showBackground: true } }),
        ];

        for (const objects of frames) {
            expect(objects[0]).toBeInstanceOf(Rectangle);
            expect(objects[0].layoutParticipation).toBe('include');
            expect(objects[0].getLayoutBounds()).toEqual({ x: 0, y: 0, width: 44, height: 44 });
            expect(objects.slice(1).every((object) => object.getLayoutBounds() === null)).toBe(true);

            for (const object of objects.slice(1)) {
                expect(object.layoutParticipation).toBe('exclude');
                for (const child of object.getChildren()) expect(child.layoutParticipation).toBe('exclude');
            }
        }
    });

    it('anchors the pad and label together at the cell center', () => {
        const pad = getPad(renderAt(1.07, { props: { animationType: 'bump' } }));
        const [cell, label] = pad.getChildren() as [Rectangle, Text];

        expect(pad.x).toBe(10);
        expect(pad.y).toBe(34);
        expect(pad.scaleX).toBeCloseTo(1.08);
        expect(pad.scaleY).toBeCloseTo(1.08);
        expect(cell).toMatchObject({ x: -10, y: -10, width: 20, height: 20 });
        expect(label).toMatchObject({ x: 0, y: 0, text: 'C4', align: 'center', baseline: 'middle' });
    });

    it.each([
        ['bump', 1.07, 1.08, 34, 1],
        ['scale', 1, 0.82, 34, 0],
        ['softPop', 1.1, 1.04, 34, 1],
        ['lift', 1, 0.97, 36.4, 0],
    ])('applies the %s entrance motion to the whole pad', (animationType, current, scale, y, opacity) => {
        const pad = getPad(renderAt(current, { props: { animationType } }));

        expect(pad.scaleX).toBeCloseTo(scale);
        expect(pad.scaleY).toBeCloseTo(scale);
        expect(pad.y).toBeCloseTo(y);
        expect(pad.opacity).toBeCloseTo(opacity);
    });

    it('settles every animation and fades the complete pad after release', () => {
        for (const animationType of ['bump', 'scale', 'softPop', 'lift']) {
            const held = getPad(renderAt(1.5, { props: { animationType } }));
            expect(held).toMatchObject({ scaleX: 1, scaleY: 1, opacity: 1, y: 34 });

            const released = getPad(renderAt(2.25, { props: { animationType } }));
            expect(released).toMatchObject({ scaleX: 1, scaleY: 1, y: 34 });
            expect(released.opacity).toBeCloseTo(0.5);
        }
    });

    it('keeps the grid active-only unless idle preview is enabled', () => {
        expect(renderAt(0.5, { notes: [] })).toHaveLength(1);

        const preview = renderAt(0.5, {
            notes: [],
            props: { showAllAvailableTracks: true, animationType: 'lift' },
        });
        expect(preview).toHaveLength(5);
        expect(preview.slice(1).every((object) => object.opacity === 1)).toBe(true);
    });

    it.each([
        ['left', 0],
        ['center', -22],
        ['right', -44],
    ])('aligns the stable grid bounds to the %s', (textAlign, expectedX) => {
        const [layout] = renderAt(0.5, { notes: [], props: { textAlign } });
        expect(layout.getLayoutBounds()?.x).toBe(expectedX);
    });

    it('defaults to Bump and exposes the polished grid modes', () => {
        const schema = notesPlayingDisplay.schema as any;
        const animation = schema.tabs
            .flatMap((tab: any) => tab.groups)
            .flatMap((group: any) => group.properties)
            .find((property: any) => property.key === 'animationType');

        expect(animation.default).toBe('bump');
        expect(animation.options.map((option: any) => option.value)).toEqual([
            'none',
            'bump',
            'scale',
            'softPop',
            'lift',
        ]);
    });
});
