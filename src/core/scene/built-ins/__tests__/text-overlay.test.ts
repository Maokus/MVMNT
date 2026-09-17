import { describe, expect, it } from 'vitest';
import { EmptyRenderObject, Rectangle, Text } from '@core/render/render-objects';
import { textOverlay } from '../misc/text-overlay';
import { sceneElementRegistry } from '@core/scene/registry';

describe('text overlay anchoring', () => {
    it('applies separate fill, stroke, and background opacity properties', () => {
        const objects = textOverlay.render({
            props: {
                text: 'Text',
                lineSpacing: 4,
                color: '#336699',
                opacity: 0.5,
                blendMode: 'source-over',
                fontFamily: 'Arial|400',
                fontSize: 10,
                justification: 'left',
                letterSpacing: 0,
                strokeColor: '#112233',
                strokeOpacity: 0.25,
                strokeWidth: 2,
                showBackground: true,
                backgroundColor: '#445566',
                backgroundOpacity: 0.75,
                backgroundPaddingX: 0,
                backgroundPaddingY: 0,
                backgroundCornerRadius: 0,
            },
            resources: undefined,
            simulation: undefined,
            time: {} as any,
            context: {} as any,
        });

        expect((objects[0] as Rectangle).fillColor).toBe('#445566BF');
        expect((objects[1] as Text).color).toBe('#33669980');
        expect((objects[1] as Text).strokeColor).toBe('#11223340');
    });

    it('anchors the selected horizontal text-block edge at the element origin', () => {
        const objects = textOverlay.render({
            props: {
                text: 'Long\nShort',
                lineSpacing: 4,
                color: '#FFFFFFFF',
                opacity: 1,
                blendMode: 'source-over',
                fontFamily: 'Arial|400',
                fontSize: 10,
                justification: 'left',
                letterSpacing: 0,
                strokeColor: '#000000',
                strokeOpacity: 1,
                strokeWidth: 0,
                showBackground: true,
                backgroundColor: '#000000',
                backgroundOpacity: 1,
                backgroundPaddingX: 0,
                backgroundPaddingY: 0,
                backgroundCornerRadius: 0,
            },
            resources: undefined,
            simulation: undefined,
            time: {} as any,
            context: {} as any,
        });

        const background = objects[0] as Rectangle;
        const lines = objects.slice(1) as Text[];

        expect(background.x).toBeLessThan(0);
        expect(lines.map((line) => line.x)).toEqual([background.x, background.x]);
        expect(lines.map((line) => line.align)).toEqual(['left', 'left']);
    });

    it('justifies lines independently inside the horizontally aligned block', () => {
        const objects = textOverlay.render({
            props: {
                text: 'Long\nShort',
                lineSpacing: 4,
                color: '#FFFFFFFF',
                opacity: 1,
                blendMode: 'source-over',
                fontFamily: 'Arial|400',
                fontSize: 10,
                justification: 'right',
                letterSpacing: 0,
                strokeColor: '#000000',
                strokeOpacity: 1,
                strokeWidth: 0,
                showBackground: true,
                backgroundColor: '#000000',
                backgroundOpacity: 1,
                backgroundPaddingX: 0,
                backgroundPaddingY: 0,
                backgroundCornerRadius: 0,
            },
            resources: undefined,
            simulation: undefined,
            time: {} as any,
            context: {} as any,
        });

        const background = objects[0] as Rectangle;
        const lines = objects.slice(1) as Text[];

        expect(lines.map((line) => line.x)).toEqual([background.x + background.width, background.x + background.width]);
        expect(lines.map((line) => line.align)).toEqual(['right', 'right']);
    });

    it('anchors the selected vertical text-block edge at the element origin', () => {
        const [line] = textOverlay.render({
            props: {
                text: 'Text',
                lineSpacing: 4,
                color: '#FFFFFFFF',
                opacity: 1,
                blendMode: 'source-over',
                fontFamily: 'Arial|400',
                fontSize: 10,
                justification: 'left',
                letterSpacing: 0,
                strokeColor: '#000000',
                strokeOpacity: 1,
                strokeWidth: 0,
                showBackground: false,
                backgroundColor: '#000000',
                backgroundOpacity: 1,
                backgroundPaddingX: 0,
                backgroundPaddingY: 0,
                backgroundCornerRadius: 0,
            },
            resources: undefined,
            simulation: undefined,
            time: {} as any,
            context: {} as any,
        });

        expect((line as Text).y).toBe(-5);
    });

    it('delegates text-block placement to the shared content anchor', () => {
        const element = sceneElementRegistry.createElement('textOverlay', {
            id: 'text',
            text: 'Text',
            contentAnchorX: 1,
            contentAnchorY: 1,
            justification: 'right',
        });
        expect(element).not.toBeNull();
        const [container] = element!.buildRenderObjects({}, 0) as EmptyRenderObject[];

        container.getVisualBounds();
        expect(container.originX).toBeCloseTo(container.baseBounds!.x + container.baseBounds!.width);
        expect(container.originY).toBeCloseTo(container.baseBounds!.y + container.baseBounds!.height);
    });
});
