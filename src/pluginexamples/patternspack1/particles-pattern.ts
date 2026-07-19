import { definePluginElement } from '@mvmnt-app/plugin-sdk';
import { Arc, Rectangle, type RenderObject } from '@mvmnt-app/plugin-sdk/render';

interface ParticlesProps extends Readonly<Record<string, unknown>> {
    readonly elementWidth: number; readonly elementHeight: number; readonly gravity: number;
    readonly gravityDirection: number; readonly particleCount: number; readonly particleSize: number;
    readonly particleOpacity: number; readonly particleColor: string;
}
const random = (seed: number) => { const value = Math.sin(seed + 1) * 10000; return value - Math.floor(value); };
const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

/** Capability-free SDK 2 reference element with deterministic motion. */
export const particlesPattern = definePluginElement<ParticlesProps, undefined>({
    type: 'particles-pattern',
    metadata: { name: 'Particles Pattern', description: 'Floating circles with configurable gravity and direction.', category: 'Patterns Pack 1' },
    schema: { tabs: [{ id: 'properties', label: 'Properties', groups: [
        { id: 'particlesBounds', label: 'Bounds', collapsed: false, description: 'Element dimensions.', properties: [
            { key: 'elementWidth', label: 'Width', type: 'number', default: 1000, step: 1 }, { key: 'elementHeight', label: 'Height', type: 'number', default: 1000, step: 1 },
        ] },
        { id: 'particlesGravity', label: 'Gravity', collapsed: false, description: 'Controls movement speed and direction.', properties: [
            { key: 'gravity', label: 'Gravity', type: 'number', default: 80, step: 1, description: 'Particle speed in pixels per second.' },
            { key: 'gravityDirection', label: 'Direction (°)', type: 'number', default: 90, min: 0, max: 360, step: 1 },
        ], presets: [
            { id: 'falling', label: 'Falling', values: { gravity: 80, gravityDirection: 90 } }, { id: 'rising', label: 'Rising', values: { gravity: 60, gravityDirection: 270 } }, { id: 'sideways', label: 'Sideways', values: { gravity: 100, gravityDirection: 0 } },
        ] },
        { id: 'particlesAppearance', label: 'Particles', collapsed: false, description: 'Particle appearance settings.', properties: [
            { key: 'particleCount', label: 'Count', type: 'number', default: 40, step: 1 }, { key: 'particleSize', label: 'Size', type: 'number', default: 3, step: 1 },
            { key: 'particleOpacity', label: 'Opacity', type: 'number', default: 0.7, min: 0, max: 1, step: 0.01 }, { key: 'particleColor', label: 'Color', type: 'colorAlpha', default: '#FFFFFFFF' },
        ], presets: [
            { id: 'snowflakes', label: 'Snowflakes', values: { particleCount: 60, particleSize: 8, particleOpacity: 0.85, particleColor: '#FFFFFFFF' } },
            { id: 'embers', label: 'Embers', values: { particleCount: 30, particleSize: 5, particleOpacity: 0.9, particleColor: '#FF6600FF' } },
            { id: 'bubbles', label: 'Bubbles', values: { particleCount: 25, particleSize: 20, particleOpacity: 0.4, particleColor: '#88CCFFFF' } },
        ] },
    ] }] },
    capabilities: { required: [], optional: [] },
    render(props, _state, time) {
        const anchor = new Rectangle(-props.elementWidth / 2, -props.elementHeight / 2, props.elementWidth, props.elementHeight, { fillColor: undefined });
        anchor.setLayoutParticipation('include');
        const angle = props.gravityDirection * Math.PI / 180;
        const vx = Math.cos(angle) * props.gravity;
        const vy = Math.sin(angle) * props.gravity;
        const color = props.particleColor.length === 9 ? props.particleColor.slice(0, 7) : props.particleColor;
        const objects: RenderObject[] = [anchor];
        for (let index = 0; index < props.particleCount; index++) {
            const seed = index * 6;
            const radius = props.particleSize * (0.3 + random(seed + 2) * 0.7);
            const speed = 0.5 + random(seed + 3);
            const x = vx ? mod(random(seed) * props.elementWidth + random(seed + 5) * props.elementWidth + vx * speed * time.seconds, props.elementWidth) : random(seed) * props.elementWidth;
            const y = vy ? mod(random(seed + 1) * props.elementHeight + random(seed + 5) * props.elementHeight + vy * speed * time.seconds, props.elementHeight) : random(seed + 1) * props.elementHeight;
            const particle = new Arc(-props.elementWidth / 2 + x, -props.elementHeight / 2 + y, radius, {
                startAngle: 0,
                endAngle: Math.PI * 2,
                fillColor: color,
                strokeColor: null,
            });
            particle.opacity = props.particleOpacity * (0.4 + random(seed + 4) * 0.6);
            particle.setLayoutParticipation('exclude');
            objects.push(particle);
        }
        return objects;
    },
});
