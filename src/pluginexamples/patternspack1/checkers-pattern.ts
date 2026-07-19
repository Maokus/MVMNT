import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { ClipLayer, Rectangle } from '@mvmnt-app/plugin-sdk/render';

interface CheckersProps extends Readonly<Record<string, unknown>> {
    readonly patternWidth: number;
    readonly patternHeight: number;
    readonly squareWidth: number;
    readonly squareHeight: number;
    readonly color1: string;
    readonly color2: string;
    readonly motionAngle: number;
    readonly motionSpeed: number;
}

/** Capability-free SDK 2 reference element. */
export const checkersPattern = definePluginElement<CheckersProps, undefined>({
    type: 'checkers-pattern',
    metadata: { name: 'Checkers Pattern', description: 'A scrolling checkerboard background pattern', category: 'Patterns Pack 1' },
    schema: { tabs: [{ id: 'appearance', label: 'Appearance', groups: [
        { id: 'checkerAppearance', label: 'Appearance', collapsed: false, description: 'Checkerboard colors and square size', properties: [
            { key: 'patternWidth', label: 'Width', type: 'number', default: 640, step: 1 },
            { key: 'patternHeight', label: 'Height', type: 'number', default: 360, step: 1 },
            { key: 'squareWidth', label: 'Square Width', type: 'number', default: 80, step: 1 },
            { key: 'squareHeight', label: 'Square Height', type: 'number', default: 80, step: 1 },
            { key: 'color1', label: 'Color 1', type: 'colorAlpha', default: '#222222FF' },
            { key: 'color2', label: 'Color 2', type: 'colorAlpha', default: '#444444FF' },
        ], presets: [
            { id: 'blackWhite', label: 'Black & White', values: { patternWidth: 640, patternHeight: 360, squareWidth: 80, squareHeight: 80, color1: '#000000FF', color2: '#FFFFFFFF' } },
            { id: 'blueGold', label: 'Blue & Gold', values: { patternWidth: 640, patternHeight: 360, squareWidth: 60, squareHeight: 60, color1: '#1E3A8AFF', color2: '#F59E0BFF' } },
        ] },
        { id: 'checkerMotion', label: 'Motion', collapsed: false, description: 'Pan direction and speed', properties: [
            { key: 'motionAngle', label: 'Motion Angle (deg)', type: 'number', default: 0, min: 0, max: 360, step: 1, description: '0 = right, 90 = down' },
            { key: 'motionSpeed', label: 'Motion Speed (px/s)', type: 'number', default: 60, step: 1 },
        ] },
    ] }] },
    capabilities: { required: [], optional: [] },
    render(props, _state, time) {
        const layoutRect = new Rectangle(0, 0, props.patternWidth, props.patternHeight, { fillColor: undefined });
        layoutRect.setLayoutParticipation('include');
        const angleRad = (props.motionAngle * Math.PI) / 180;
        const wrapX = ((Math.cos(angleRad) * time.seconds * props.motionSpeed % (props.squareWidth * 2)) + props.squareWidth * 2) % (props.squareWidth * 2);
        const wrapY = ((Math.sin(angleRad) * time.seconds * props.motionSpeed % (props.squareHeight * 2)) + props.squareHeight * 2) % (props.squareHeight * 2);
        const clip = new ClipLayer(props.patternWidth, props.patternHeight);
        clip.setLayoutParticipation('exclude');
        for (let row = -1; row < Math.ceil(props.patternHeight / props.squareHeight) + 3; row++) {
            for (let col = -1; col < Math.ceil(props.patternWidth / props.squareWidth) + 3; col++) {
                const color = (row + col) % 2 !== 0 ? props.color2 : props.color1;
                if (!color || color.endsWith('00')) continue;
                clip.addChild(new Rectangle(col * props.squareWidth - wrapX, row * props.squareHeight - wrapY, props.squareWidth, props.squareHeight, { fillColor: color }).setLayoutParticipation('exclude'));
            }
        }
        return [layoutRect, clip];
    },
});
