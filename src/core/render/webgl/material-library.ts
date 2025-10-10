import type { MaterialDescriptor } from './material';

const COMMON_VERTEX_TRANSFORM = `
    attribute vec2 a_position;
    uniform vec2 u_resolution;
    vec4 projectPosition(vec2 position) {
        vec2 clip = (position / u_resolution) * 2.0 - 1.0;
        clip.y = -clip.y;
        return vec4(clip, 0.0, 1.0);
    }
`;

export const SOLID_ROUNDED_MATERIAL: MaterialDescriptor = {
    id: 'solid-rounded@1',
    vertexSource: `
        ${COMMON_VERTEX_TRANSFORM}
        attribute vec2 a_local;
        attribute vec2 a_size;
        attribute vec2 a_params; // radius, strokeWidth (-1 for fill)
        attribute vec4 a_color;
        varying vec2 v_local;
        varying vec2 v_size;
        varying vec2 v_params;
        varying vec4 v_color;
        void main() {
            v_local = a_local;
            v_size = a_size;
            v_params = a_params;
            v_color = a_color;
            gl_Position = projectPosition(a_position);
        }
    `,
    fragmentSource: `
        precision mediump float;
        varying vec2 v_local;
        varying vec2 v_size;
        varying vec2 v_params;
        varying vec4 v_color;
        float roundedRectSdf(vec2 p, vec2 size, float radius) {
            vec2 halfSize = size * 0.5;
            vec2 q = abs(p - halfSize) - (halfSize - vec2(radius));
            return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
        }
        void main() {
            float radius = max(0.0, v_params.x);
            float strokeWidth = v_params.y;
            float dist = roundedRectSdf(v_local, max(vec2(0.0001), v_size), radius);
            float alpha;
            if (strokeWidth >= 0.0) {
                float outer = smoothstep(0.5, -0.5, dist);
                float inner = smoothstep(0.5, -0.5, dist + strokeWidth);
                alpha = clamp(outer - inner, 0.0, 1.0);
            } else {
                alpha = smoothstep(0.5, -0.5, dist);
            }
            if (alpha <= 0.0) {
                discard;
            }
            gl_FragColor = vec4(v_color.rgb * alpha, v_color.a * alpha);
        }
    `,
    attributes: [
        { name: 'a_position', size: 2, stride: 12 * 4, offset: 0 },
        { name: 'a_local', size: 2, stride: 12 * 4, offset: 2 * 4 },
        { name: 'a_size', size: 2, stride: 12 * 4, offset: 4 * 4 },
        { name: 'a_params', size: 2, stride: 12 * 4, offset: 6 * 4 },
        { name: 'a_color', size: 4, stride: 12 * 4, offset: 8 * 4 },
    ],
    uniforms: [{ name: 'u_resolution', kind: 'vec2' }],
};

export const SHADOW_MATERIAL: MaterialDescriptor = {
    id: 'shadow-rounded@1',
    vertexSource: `
        ${COMMON_VERTEX_TRANSFORM}
        attribute vec2 a_local;
        attribute vec2 a_size;
        attribute vec4 a_shadow; // radius, blur, offsetX, offsetY
        attribute vec4 a_color;
        varying vec2 v_local;
        varying vec2 v_size;
        varying vec4 v_shadow;
        varying vec4 v_color;
        void main() {
            v_local = a_local;
            v_size = a_size;
            v_shadow = a_shadow;
            v_color = a_color;
            gl_Position = projectPosition(a_position);
        }
    `,
    fragmentSource: `
        precision mediump float;
        varying vec2 v_local;
        varying vec2 v_size;
        varying vec4 v_shadow;
        varying vec4 v_color;
        float roundedRectSdf(vec2 p, vec2 size, float radius) {
            vec2 halfSize = size * 0.5;
            vec2 q = abs(p - halfSize) - (halfSize - vec2(radius));
            return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
        }
        void main() {
            float radius = max(0.0, v_shadow.x);
            float blur = max(0.5, v_shadow.y);
            vec2 offset = v_shadow.zw;
            float dist = roundedRectSdf(v_local - offset, max(vec2(0.0001), v_size), radius);
            float alpha = smoothstep(blur, 0.0, dist);
            if (alpha <= 0.0) discard;
            gl_FragColor = vec4(v_color.rgb * alpha, v_color.a * alpha);
        }
    `,
    attributes: [
        { name: 'a_position', size: 2, stride: 14 * 4, offset: 0 },
        { name: 'a_local', size: 2, stride: 14 * 4, offset: 2 * 4 },
        { name: 'a_size', size: 2, stride: 14 * 4, offset: 4 * 4 },
        { name: 'a_shadow', size: 4, stride: 14 * 4, offset: 6 * 4 },
        { name: 'a_color', size: 4, stride: 14 * 4, offset: 10 * 4 },
    ],
    uniforms: [{ name: 'u_resolution', kind: 'vec2' }],
};

export const IMAGE_MATERIAL: MaterialDescriptor = {
    id: 'image@1',
    vertexSource: `
        ${COMMON_VERTEX_TRANSFORM}
        attribute vec2 a_texCoord;
        attribute float a_opacity;
        varying vec2 v_texCoord;
        varying float v_opacity;
        void main() {
            v_texCoord = a_texCoord;
            v_opacity = a_opacity;
            gl_Position = projectPosition(a_position);
        }
    `,
    fragmentSource: `
        precision mediump float;
        varying vec2 v_texCoord;
        varying float v_opacity;
        uniform sampler2D u_sampler;
        void main() {
            vec4 color = texture2D(u_sampler, v_texCoord);
            if (color.a <= 0.0) discard;
            gl_FragColor = vec4(color.rgb * v_opacity, color.a * v_opacity);
        }
    `,
    attributes: [
        { name: 'a_position', size: 2, stride: 5 * 4, offset: 0 },
        { name: 'a_texCoord', size: 2, stride: 5 * 4, offset: 2 * 4 },
        { name: 'a_opacity', size: 1, stride: 5 * 4, offset: 4 * 4 },
    ],
    uniforms: [
        { name: 'u_resolution', kind: 'vec2' },
        { name: 'u_sampler', kind: 'int' },
    ],
};

export const TEXT_MATERIAL: MaterialDescriptor = {
    id: 'text@1',
    vertexSource: `
        ${COMMON_VERTEX_TRANSFORM}
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;
        void main() {
            v_texCoord = a_texCoord;
            gl_Position = projectPosition(a_position);
        }
    `,
    fragmentSource: `
        precision mediump float;
        varying vec2 v_texCoord;
        uniform sampler2D u_sampler;
        uniform vec4 u_color;
        void main() {
            float alpha = texture2D(u_sampler, v_texCoord).a;
            if (alpha <= 0.0) discard;
            gl_FragColor = vec4(u_color.rgb * alpha, u_color.a * alpha);
        }
    `,
    attributes: [
        { name: 'a_position', size: 2, stride: 4 * 4, offset: 0 },
        { name: 'a_texCoord', size: 2, stride: 4 * 4, offset: 2 * 4 },
    ],
    uniforms: [
        { name: 'u_resolution', kind: 'vec2' },
        { name: 'u_sampler', kind: 'int' },
        { name: 'u_color', kind: 'vec4' },
    ],
};

export const SOLID_COLOR_MATERIAL: MaterialDescriptor = {
    id: 'solid-color@1',
    vertexSource: `
        ${COMMON_VERTEX_TRANSFORM}
        attribute vec4 a_color;
        varying vec4 v_color;
        void main() {
            v_color = a_color;
            gl_Position = projectPosition(a_position);
        }
    `,
    fragmentSource: `
        precision mediump float;
        varying vec4 v_color;
        void main() {
            if (v_color.a <= 0.0) discard;
            gl_FragColor = v_color;
        }
    `,
    attributes: [
        { name: 'a_position', size: 2, stride: 6 * 4, offset: 0 },
        { name: 'a_color', size: 4, stride: 6 * 4, offset: 2 * 4 },
    ],
    uniforms: [{ name: 'u_resolution', kind: 'vec2' }],
};
