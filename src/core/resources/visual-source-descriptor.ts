/**
 * Visual source descriptors — typed descriptions of where to load visual data from.
 *
 * A descriptor is a value-type that fully describes a loading request. Passing the
 * same descriptor every frame is safe and idempotent: VisualResourceHandle compares
 * the derived cache key and only reloads when the source genuinely changes.
 *
 * ## Format vs. origin
 *
 * Descriptor `kind` describes the *format* of the source data (how to decode it),
 * not where it came from or who can create it. Origin constraints — e.g. whether
 * an asset is user-uploadable or plugin-bundled only — are enforced at the
 * ProjectAsset registry layer, not here.
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
export interface GridAtlasSourceDescriptor {
    kind: 'grid-atlas';
    src: ImageSource;
    layout: AtlasLayout;
}

/**
 * Per-animation metadata override for a Sparrow atlas.
 *
 * Applied after the cache builds animations from prefix grouping. Use this to
 * set loopMode or fps per animation without modifying the XML.
 */
export interface SparrowAnimationOverride {
    /** Loop behaviour for this animation. Defaults to 'loop'. */
    loopMode?: 'loop' | 'once' | 'pingpong';
    /** Playback speed in frames per second. Overrides the descriptor's defaultFps for this animation. */
    fps?: number;
}

/** Load a Sparrow v2 texture atlas (paired PNG + XML). */
export interface SparrowSourceDescriptor {
    kind: 'sparrow';
    imageSrc: ImageSource;
    xmlSrc: ImageSource;
    /** Default playback speed in frames per second; defaults to 24. */
    defaultFps?: number;
    /**
     * Optional per-animation metadata overrides, keyed by animation name.
     *
     * Applied after the XML is parsed and animations are built from prefix grouping.
     * Use to override loopMode or fps without modifying the XML.
     *
     * @example
     * { kind: 'sparrow', imageSrc, xmlSrc, animations: { death: { loopMode: 'once' } } }
     */
    animations?: Record<string, SparrowAnimationOverride>;
}

export type VisualSourceDescriptor = ImageSourceDescriptor | GridAtlasSourceDescriptor | SparrowSourceDescriptor;

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
        case 'grid-atlas': {
            const { columns: c, rows: r, frameCount, frameDurationMs } = descriptor.layout;
            const n = frameCount ?? c * r;
            const d = (frameDurationMs ?? 1000 / 12).toFixed(2);
            return `grid-atlas:${makeSrcKey(descriptor.src)}:cols=${c}:rows=${r}:count=${n}:dur=${d}`;
        }
        case 'sparrow': {
            let key = `sparrow:${makeSrcKey(descriptor.imageSrc)}:xml=${makeSrcKey(descriptor.xmlSrc)}`;
            if (descriptor.animations) {
                // Sort entries for a deterministic key regardless of property insertion order.
                const overridePart = Object.entries(descriptor.animations)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([name, o]) => `${name}:${o.loopMode ?? ''}:${o.fps != null ? o.fps.toFixed(2) : ''}`)
                    .join(',');
                if (overridePart) key += `:anims=${overridePart}`;
            }
            return key;
        }
    }
}
