import { ensureFontLoaded, ensureFontVariantsRegistered } from '@fonts/font-loader';
import { FontBinaryStore } from '@persistence/font-binary-store';
import type { FontAsset } from '@state/scene/fonts';

type RecordValue = Record<string, any>;

export const TEXT_BOUNDS_SCHEMA_VERSION = 11;

const TEXT_OVERLAY_TYPE = 'textOverlay';

interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

function isRecord(value: unknown): value is RecordValue {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function constantValue(value: unknown, macros: RecordValue): unknown {
    if (!isRecord(value)) return value;
    if (value.type === 'constant') return value.value;
    if (value.type === 'macro' && typeof value.macroId === 'string') return macros[value.macroId]?.value;
    return undefined;
}

function union(a: Bounds | null, b: Bounds): Bounds {
    if (!a) return b;
    const right = Math.max(a.x + a.width, b.x + b.width);
    const bottom = Math.max(a.y + a.height, b.y + b.height);
    return {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: right - Math.min(a.x, b.x),
        height: bottom - Math.min(a.y, b.y),
    };
}

function measurementContext(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
    try {
        const canvas =
            typeof OffscreenCanvas !== 'undefined'
                ? new OffscreenCanvas(1, 1)
                : typeof document !== 'undefined'
                  ? document.createElement('canvas')
                  : null;
        return canvas?.getContext('2d') ?? null;
    } catch {
        return null;
    }
}

/**
 * The offset correction must use the same glyph metrics as the renderer. Text
 * overlays request their Google fonts lazily during their first render, which
 * is too late for an import migration. Load constant Google selections and
 * register referenced embedded-font variants before measuring.
 */
export async function prepareTextBoundsMigrationFonts(
    envelope: RecordValue,
    fontPayloads: ReadonlyMap<string, Uint8Array> = new Map()
): Promise<void> {
    if (!isRecord(envelope.scene) || !isRecord(envelope.scene.elements) || !measurementContext()) return;
    const macroRoot = isRecord(envelope.scene.macros) ? envelope.scene.macros : {};
    const macros = isRecord(macroRoot.macros) ? macroRoot.macros : isRecord(macroRoot.byId) ? macroRoot.byId : {};
    const googleSelections = new Set<string>();
    const customAssetIds = new Set<string>();

    for (const element of Object.values(envelope.scene.elements)) {
        if (!isRecord(element) || element.type !== TEXT_OVERLAY_TYPE) continue;
        const properties = isRecord(element.properties)
            ? element.properties
            : isRecord(element.config)
              ? element.config
              : null;
        if (!properties) continue;
        const selection = constantValue(properties.fontFamily, macros);
        if (typeof selection !== 'string' || !selection) continue;
        if (selection.startsWith('Custom:')) {
            const assetId = selection.slice('Custom:'.length).split('|')[0]?.trim();
            if (assetId) customAssetIds.add(assetId);
        } else {
            googleSelections.add(selection);
        }
    }

    const fontAssets = isRecord(envelope.scene.fontAssets) ? envelope.scene.fontAssets : {};
    await Promise.all([
        ...[...googleSelections].map((selection) =>
            ensureFontLoaded(selection).catch(() => {
                // Continue with the renderer's fallback font when the font is unavailable.
            })
        ),
        ...[...customAssetIds].map(async (assetId) => {
            const asset = fontAssets[assetId] as FontAsset | undefined;
            const payload = fontPayloads.get(assetId);
            if (!asset) return;
            if (payload) await FontBinaryStore.put(assetId, payload);
            await ensureFontVariantsRegistered(asset, asset.variants ?? []);
        }),
    ]);
}

/**
 * Returns the change in the element's local anchor caused by d4dff3d's
 * ink-bound text measurement. A null result means the platform cannot measure
 * text, so it is safer to leave the scene untouched than apply an estimate.
 */
function textOverlayAnchorDelta(
    properties: RecordValue,
    macros: RecordValue,
    fontAssets: RecordValue
): { x: number; y: number } | null {
    const ctx = measurementContext();
    if (!ctx) return null;

    const value = (key: string, fallback: any) => {
        const resolved = constantValue(properties[key], macros);
        return resolved === undefined ? fallback : resolved;
    };
    const text = value('text', 'Sample Text');
    const fontSize = value('fontSize', 36);
    if (typeof text !== 'string' || !finite(fontSize)) return null;

    const fontSelection = value('fontFamily', 'Inter|400');
    const [selectedFamily = 'Inter', weight = '400'] =
        typeof fontSelection === 'string' ? fontSelection.split('|') : [];
    const customAssetId = selectedFamily.startsWith('Custom:')
        ? selectedFamily.slice('Custom:'.length).trim()
        : undefined;
    const family = customAssetId
        ? ((fontAssets[customAssetId] as FontAsset | undefined)?.family ?? selectedFamily)
        : selectedFamily;
    const font = `${weight || '400'} ${fontSize}px ${family || 'Inter'}, sans-serif`;
    const align = value('textAlign', 'center');
    const letterSpacing = finite(value('letterSpacing', 0)) ? value('letterSpacing', 0) : 0;
    const strokeWidth = Math.max(0, finite(value('strokeWidth', 0)) ? value('strokeWidth', 0) : 0);
    const hasStroke = strokeWidth > 0;
    const lineSpacing = finite(value('lineSpacing', 4)) ? value('lineSpacing', 4) : 4;
    const lines = text.split(/\r?\n/);
    const totalHeight = lines.length * fontSize + Math.max(0, lines.length - 1) * lineSpacing;
    const startY = -totalHeight / 2;
    const previousFont = ctx.font;
    const previousBaseline = ctx.textBaseline;
    ctx.font = font;
    try {
        let oldBounds: Bounds | null = null;
        let newBounds: Bounds | null = null;
        for (const [index, line] of lines.entries()) {
            const y = startY + index * (fontSize + lineSpacing);
            if (letterSpacing !== 0) (ctx as any).letterSpacing = `${letterSpacing}px`;
            const oldMetrics = ctx.measureText(line);
            if (letterSpacing !== 0) (ctx as any).letterSpacing = '0px';
            ctx.textBaseline = 'top';
            if (letterSpacing !== 0) (ctx as any).letterSpacing = `${letterSpacing}px`;
            const newMetrics = ctx.measureText(line);
            if (letterSpacing !== 0) (ctx as any).letterSpacing = '0px';

            const width = oldMetrics.width || 0;
            const ascent = oldMetrics.actualBoundingBoxAscent ?? fontSize * 0.8;
            const descent = oldMetrics.actualBoundingBoxDescent ?? fontSize * 0.2;
            const height = ascent + descent;
            const oldStrokePad = hasStroke ? strokeWidth : 0;
            const oldWidth = width + oldStrokePad;
            const oldHeight = height + oldStrokePad;
            const oldX = align === 'center' ? -oldWidth / 2 : align === 'right' || align === 'end' ? -oldWidth : 0;
            oldBounds = union(oldBounds, { x: oldX, y, width: oldWidth, height: oldHeight });

            const actualLeft = newMetrics.actualBoundingBoxLeft;
            const actualRight = newMetrics.actualBoundingBoxRight;
            const hasInkBounds =
                Number.isFinite(actualLeft) &&
                Number.isFinite(actualRight) &&
                (actualLeft > 0 || actualRight > 0 || width === 0);
            const inkLeft = hasInkBounds ? actualLeft : 0;
            const inkRight = hasInkBounds ? actualRight : width;
            const advanceStart = align === 'center' ? -width / 2 : align === 'right' || align === 'end' ? -width : 0;
            const newAscent = newMetrics.actualBoundingBoxAscent ?? fontSize * 0.8;
            const newDescent = newMetrics.actualBoundingBoxDescent ?? fontSize * 0.2;
            const radius = hasStroke ? strokeWidth / 2 : 0;
            newBounds = union(newBounds, {
                x: advanceStart - inkLeft - radius,
                y: y - newAscent - radius,
                width: inkLeft + inkRight + radius * 2,
                height: newAscent + newDescent + radius * 2,
            });
        }
        if (!oldBounds || !newBounds) return null;

        // The optional background is unchanged by the text-bounds implementation.
        // When it contains both old and new text bounds it naturally stabilises the anchor.
        if (value('showBackground', false) === true) {
            const widths = lines.map((line) => {
                const width = ctx.measureText(line).width;
                return width + line.length * letterSpacing;
            });
            const width = Math.max(1, ...widths);
            const paddingX = finite(value('backgroundPaddingX', 8)) ? value('backgroundPaddingX', 8) : 8;
            const paddingY = finite(value('backgroundPaddingY', 4)) ? value('backgroundPaddingY', 4) : 4;
            const x = align === 'center' ? -width / 2 : align === 'right' ? -width : 0;
            const background = {
                x: x - paddingX,
                y: startY - paddingY,
                width: width + paddingX * 2,
                height: totalHeight + paddingY * 2,
            };
            oldBounds = union(oldBounds, background);
            newBounds = union(newBounds, background);
        }

        const anchorX = finite(value('anchorX', 0.5)) ? value('anchorX', 0.5) : 0.5;
        const anchorY = finite(value('anchorY', 0.5)) ? value('anchorY', 0.5) : 0.5;
        return {
            x: newBounds.x + newBounds.width * anchorX - (oldBounds.x + oldBounds.width * anchorX),
            y: newBounds.y + newBounds.height * anchorY - (oldBounds.y + oldBounds.height * anchorY),
        };
    } finally {
        (ctx as any).letterSpacing = '0px';
        ctx.textBaseline = previousBaseline;
        ctx.font = previousFont;
    }
}

function addToOffsetBinding(binding: unknown, amount: number): unknown {
    if (finite(binding)) return binding + amount;
    if (!isRecord(binding) || binding.type !== 'constant' || !finite(binding.value)) return binding;
    return { ...binding, value: binding.value + amount };
}

/** Preserve pre-d4dff3d text placement by translating the element by its changed local anchor. */
export function migrateSceneTextBoundsV11<T extends RecordValue>(envelope: T): T {
    const version = finite(envelope.schemaVersion) ? envelope.schemaVersion : 0;
    if (version >= TEXT_BOUNDS_SCHEMA_VERSION || !isRecord(envelope.scene) || !isRecord(envelope.scene.elements))
        return envelope;
    const macroRoot = isRecord(envelope.scene.macros) ? envelope.scene.macros : {};
    const macros = isRecord(macroRoot.macros) ? macroRoot.macros : isRecord(macroRoot.byId) ? macroRoot.byId : {};
    const fontAssets = isRecord(envelope.scene.fontAssets) ? envelope.scene.fontAssets : {};
    const deltas = new Map<string, { x: number; y: number }>();
    let elementsChanged = false;
    const elements: RecordValue = { ...envelope.scene.elements };

    for (const [id, element] of Object.entries(envelope.scene.elements)) {
        if (!isRecord(element) || element.type !== TEXT_OVERLAY_TYPE) continue;
        const containerKey = isRecord(element.properties) ? 'properties' : isRecord(element.config) ? 'config' : null;
        if (!containerKey) continue;
        const delta = textOverlayAnchorDelta(element[containerKey], macros, fontAssets);
        if (!delta || (!delta.x && !delta.y)) continue;
        deltas.set(id, delta);
        const properties = element[containerKey];
        const nextProperties = { ...properties };
        const nextX = addToOffsetBinding(properties.offsetX, delta.x);
        const nextY = addToOffsetBinding(properties.offsetY, delta.y);
        if (nextX !== properties.offsetX) nextProperties.offsetX = nextX;
        if (nextY !== properties.offsetY) nextProperties.offsetY = nextY;
        if (nextX !== properties.offsetX || nextY !== properties.offsetY) {
            elements[id] = { ...element, [containerKey]: nextProperties };
            elementsChanged = true;
        }
    }

    let automation = envelope.scene.automation;
    if (deltas.size && isRecord(automation) && isRecord(automation.channels)) {
        let changed = false;
        const channels: RecordValue = { ...automation.channels };
        for (const [channelId, channel] of Object.entries(automation.channels)) {
            if (!isRecord(channel) || !Array.isArray(channel.keyframes)) continue;
            const propertyKey =
                typeof channel.propertyKey === 'string' ? channel.propertyKey : channelId.split('.').pop();
            const elementId =
                typeof channel.elementId === 'string'
                    ? channel.elementId
                    : channelId.slice(0, channelId.lastIndexOf('.'));
            const delta = deltas.get(elementId);
            const amount = propertyKey === 'offsetX' ? delta?.x : propertyKey === 'offsetY' ? delta?.y : undefined;
            if (!finite(amount)) continue;
            let channelChanged = false;
            const keyframes = channel.keyframes.map((keyframe: unknown) => {
                if (!isRecord(keyframe) || !finite(keyframe.value)) return keyframe;
                channelChanged = true;
                return { ...keyframe, value: keyframe.value + amount };
            });
            if (channelChanged) {
                channels[channelId] = { ...channel, keyframes };
                changed = true;
            }
        }
        if (changed) automation = { ...automation, channels };
    }

    return {
        ...envelope,
        schemaVersion: TEXT_BOUNDS_SCHEMA_VERSION,
        scene: {
            ...envelope.scene,
            ...(elementsChanged ? { elements } : {}),
            ...(automation !== envelope.scene.automation ? { automation } : {}),
        },
    } as T;
}
