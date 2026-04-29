/**
 * Visual source descriptors — typed descriptions of where to load visual data from.
 *
 * A descriptor is a value-type that fully describes a loading request. Passing the
 * same descriptor every frame is safe and idempotent: VisualResourceHandle compares
 * the derived cache key and only reloads when the source genuinely changes.
 *
 * Registry ID resolution (UUID → File) and bundled asset URL resolution happen
 * outside the descriptor layer. Callers convert project-level IDs to descriptors
 * before calling VisualResourceHandle.update().
 */

export type ImageSource = string | File;

/**
 * Layout descriptor for a sprite atlas: a single image divided into a uniform
 * grid of animation frames.
 */
export interface AtlasLayout {
    columns: number;
    rows: number;
    /** Total number of frames; defaults to columns × rows. */
    frameCount?: number;
    /** Duration of each frame in ms; defaults to 1000/12 (~83 ms, 12 fps). */
    frameDurationMs?: number;
}

/** Load a plain image or animated GIF. */
export interface ImageSourceDescriptor {
    kind: 'image';
    src: ImageSource;
}

/** Load a spritesheet as a uniform grid of animation frames. */
export interface AtlasSourceDescriptor {
    kind: 'atlas';
    src: ImageSource;
    layout: AtlasLayout;
}

/** Load a Sparrow v2 texture atlas (paired PNG + XML). */
export interface SparrowSourceDescriptor {
    kind: 'sparrow';
    imageSrc: ImageSource;
    xmlSrc: ImageSource;
    /** Default playback speed in frames per second; defaults to 24. */
    defaultFps?: number;
}

export type VisualSourceDescriptor = ImageSourceDescriptor | AtlasSourceDescriptor | SparrowSourceDescriptor;

// ─── Cache key helpers ───────────────────────────────────────────────────────

function makeSrcKey(src: ImageSource): string {
    if (typeof src === 'string') return src;
    return `file:${src.name}:${src.size}:${src.lastModified}`;
}

/** Derive a session-scoped cache key from any source descriptor. */
export function makeDescriptorKey(descriptor: VisualSourceDescriptor): string {
    switch (descriptor.kind) {
        case 'image':
            return `image:${makeSrcKey(descriptor.src)}`;
        case 'atlas': {
            const { columns: c, rows: r, frameCount, frameDurationMs } = descriptor.layout;
            const n = frameCount ?? c * r;
            const d = (frameDurationMs ?? 1000 / 12).toFixed(2);
            return `atlas:${makeSrcKey(descriptor.src)}:cols=${c}:rows=${r}:count=${n}:dur=${d}`;
        }
        case 'sparrow':
            return `sparrow:${makeSrcKey(descriptor.imageSrc)}:xml=${makeSrcKey(descriptor.xmlSrc)}`;
    }
}
