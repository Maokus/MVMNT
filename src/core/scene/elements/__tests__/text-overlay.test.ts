import { describe, expect, it } from 'vitest';
import { Rectangle, Text } from '@core/render/render-objects';
import { TextOverlayElement, textOverlay } from '../misc/text-overlay';

describe('text overlay anchoring', () => {
    it('anchors the selected horizontal text-block edge at the element origin', () => {
        const objects = textOverlay.render(
            {
                text: 'Long\nShort',
                lineSpacing: 4,
                color: '#FFFFFFFF',
                opacity: 1,
                blendMode: 'source-over',
                fontFamily: 'Arial|400',
                fontSize: 10,
                textAnchorX: 1,
                textAnchorY: 0.5,
                justification: 'left',
                letterSpacing: 0,
                strokeColor: '#000000',
                strokeWidth: 0,
                showBackground: true,
                backgroundColor: '#000000',
                backgroundOpacity: 1,
                backgroundPaddingX: 0,
                backgroundPaddingY: 0,
                backgroundCornerRadius: 0,
            },
            undefined,
            {} as any,
            {} as any
        );

        const background = objects[0] as Rectangle;
        const lines = objects.slice(1) as Text[];

        expect(background.x).toBeLessThan(0);
        expect(lines.map((line) => line.x)).toEqual([background.x, background.x]);
        expect(lines.map((line) => line.align)).toEqual(['left', 'left']);
    });

    it('justifies lines independently inside the horizontally aligned block', () => {
        const objects = textOverlay.render(
            {
                text: 'Long\nShort',
                lineSpacing: 4,
                color: '#FFFFFFFF',
                opacity: 1,
                blendMode: 'source-over',
                fontFamily: 'Arial|400',
                fontSize: 10,
                textAnchorX: 0,
                textAnchorY: 0.5,
                justification: 'right',
                letterSpacing: 0,
                strokeColor: '#000000',
                strokeWidth: 0,
                showBackground: true,
                backgroundColor: '#000000',
                backgroundOpacity: 1,
                backgroundPaddingX: 0,
                backgroundPaddingY: 0,
                backgroundCornerRadius: 0,
            },
            undefined,
            {} as any,
            {} as any
        );

        const background = objects[0] as Rectangle;
        const lines = objects.slice(1) as Text[];

        expect(lines.map((line) => line.x)).toEqual([background.x + background.width, background.x + background.width]);
        expect(lines.map((line) => line.align)).toEqual(['right', 'right']);
    });

    it('anchors the selected vertical text-block edge at the element origin', () => {
        const [line] = textOverlay.render(
            {
                text: 'Text',
                lineSpacing: 4,
                color: '#FFFFFFFF',
                opacity: 1,
                blendMode: 'source-over',
                fontFamily: 'Arial|400',
                fontSize: 10,
                textAnchorX: 0,
                textAnchorY: 1,
                justification: 'left',
                letterSpacing: 0,
                strokeColor: '#000000',
                strokeWidth: 0,
                showBackground: false,
                backgroundColor: '#000000',
                backgroundOpacity: 1,
                backgroundPaddingX: 0,
                backgroundPaddingY: 0,
                backgroundCornerRadius: 0,
            },
            undefined,
            {} as any,
            {} as any
        );

        expect((line as Text).y).toBe(-10);
    });

    it('keeps the element wrapper origin at the aligned text origin', () => {
        const [container] = new TextOverlayElement('text', {
            text: 'Text',
            textAnchorX: 1,
            textAnchorY: 1,
            justification: 'right',
        }).buildRenderObjects({}, 0);

        expect(container.originX).toBe(0);
        expect(container.originY).toBe(0);
    });
});
