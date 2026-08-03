import { describe, expect, it } from 'vitest';
import { Rectangle, Text } from '@core/render/render-objects';
import { textOverlay } from '../misc/text-overlay';

describe('text overlay alignment and justification', () => {
    it('positions the text block independently from its line justification', () => {
        const objects = textOverlay.render(
            {
                text: 'Long\nShort',
                lineSpacing: 4,
                color: '#FFFFFFFF',
                opacity: 1,
                blendMode: 'source-over',
                fontFamily: 'Arial|400',
                fontSize: 10,
                textAlign: 'right',
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

    it('uses the legacy alignment value as justification when the new property is absent', () => {
        const [line] = textOverlay.render(
            {
                text: 'Text',
                lineSpacing: 4,
                color: '#FFFFFFFF',
                opacity: 1,
                blendMode: 'source-over',
                fontFamily: 'Arial|400',
                fontSize: 10,
                textAlign: 'right',
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

        expect((line as Text).align).toBe('right');
    });
});
