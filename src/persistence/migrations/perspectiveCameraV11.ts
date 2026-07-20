import { cameraDistanceToPerspectiveStrength } from '@math/perspective-warp';

export const PERSPECTIVE_CAMERA_SCHEMA_VERSION = 11;

const LEGACY_CORNER_KEYS = [
    'warpTopLeftX', 'warpTopLeftY',
    'warpTopRightX', 'warpTopRightY',
    'warpBottomRightX', 'warpBottomRightY',
    'warpBottomLeftX', 'warpBottomLeftY',
] as const;

const CURRENT_CAMERA_KEYS = [
    'perspectiveRotationX', 'perspectiveRotationY',
    'perspectiveStrength', 'perspectiveCameraDistance',
    'perspectivePivotLinked', 'perspectivePivotX', 'perspectivePivotY',
    'perspectiveOriginX', 'perspectiveOriginY',
    'perspectiveVanishingPointX', 'perspectiveVanishingPointY',
] as const;

function constantValue(binding: any): unknown {
    return binding?.type === 'constant' ? binding.value : undefined;
}

function sameNumber(a: unknown, b: unknown): boolean {
    return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-8;
}

function migrateElement(element: any): { element: any; hadLegacyCorners: boolean } {
    if (!element || typeof element !== 'object') return { element, hadLegacyCorners: false };
    const source = element.properties ?? element.bindings;
    if (!source || typeof source !== 'object') return { element, hadLegacyCorners: false };
    const properties = { ...source };
    const hadLegacyCorners = LEGACY_CORNER_KEYS.some((key) => Object.prototype.hasOwnProperty.call(properties, key));
    const hadCameraControls = CURRENT_CAMERA_KEYS.some((key) => Object.prototype.hasOwnProperty.call(properties, key));
    for (const key of LEGACY_CORNER_KEYS) delete properties[key];

    const cameraDistance = constantValue(properties.perspectiveCameraDistance);
    if (properties.perspectiveStrength === undefined && typeof cameraDistance === 'number') {
        properties.perspectiveStrength = {
            type: 'constant',
            value: cameraDistanceToPerspectiveStrength(cameraDistance),
        };
    }
    delete properties.perspectiveCameraDistance;

    if (properties.perspectivePivotX === undefined && properties.perspectiveOriginX !== undefined) {
        properties.perspectivePivotX = properties.perspectiveOriginX;
    }
    if (properties.perspectivePivotY === undefined && properties.perspectiveOriginY !== undefined) {
        properties.perspectivePivotY = properties.perspectiveOriginY;
    }
    if (properties.perspectivePivotLinked === undefined &&
        (properties.perspectiveOriginX !== undefined || properties.perspectiveOriginY !== undefined)) {
        const originX = constantValue(properties.perspectiveOriginX) ?? 0.5;
        const originY = constantValue(properties.perspectiveOriginY) ?? 0.5;
        const anchorX = constantValue(properties.anchorX) ?? 0.5;
        const anchorY = constantValue(properties.anchorY) ?? 0.5;
        properties.perspectivePivotLinked = {
            type: 'constant',
            value: sameNumber(originX, anchorX) && sameNumber(originY, anchorY),
        };
    }
    delete properties.perspectiveOriginX;
    delete properties.perspectiveOriginY;

    if (hadLegacyCorners && !hadCameraControls) {
        properties.warpEnabled = { type: 'constant', value: false };
    }
    const containerKey = element.properties ? 'properties' : 'bindings';
    return { element: { ...element, [containerKey]: properties }, hadLegacyCorners };
}

/** Remove retired corner pins and normalize the camera-based perspective model. */
export function migrateScenePerspectiveCameraV11<T extends Record<string, any>>(envelope: T): T {
    const version = typeof envelope.schemaVersion === 'number' ? envelope.schemaVersion : 0;
    if (version >= PERSPECTIVE_CAMERA_SCHEMA_VERSION) return envelope;
    const elements = envelope.scene?.elements;
    if (!elements || typeof elements !== 'object') {
        return { ...envelope, schemaVersion: PERSPECTIVE_CAMERA_SCHEMA_VERSION } as T;
    }

    const nextElements: Record<string, any> = {};
    for (const [id, element] of Object.entries(elements)) {
        const migrated = migrateElement(element);
        nextElements[id] = migrated.element;
    }

    const automation = envelope.scene?.automation;
    const channels = automation?.channels;
    let nextAutomation = automation;
    if (channels && typeof channels === 'object') {
        const nextChannels: Record<string, any> = {};
        for (const [channelId, channel] of Object.entries(channels)) {
            const propertyKey = (channel as any)?.propertyKey ?? channelId.slice(channelId.indexOf('.') + 1);
            if (LEGACY_CORNER_KEYS.includes(propertyKey as any)) continue;
            if (propertyKey === 'perspectiveCameraDistance') {
                const nextId = channelId.replace(/perspectiveCameraDistance$/, 'perspectiveStrength');
                nextChannels[nextId] = {
                    ...(channel as any),
                    id: nextId,
                    propertyKey: 'perspectiveStrength',
                    keyframes: Array.isArray((channel as any)?.keyframes)
                        ? (channel as any).keyframes.map((keyframe: any) => ({
                              ...keyframe,
                              value: cameraDistanceToPerspectiveStrength(keyframe.value),
                          }))
                        : (channel as any)?.keyframes,
                };
                continue;
            }
            nextChannels[channelId] = channel;
        }
        nextAutomation = { ...automation, channels: nextChannels };
    }

    return {
        ...envelope,
        schemaVersion: PERSPECTIVE_CAMERA_SCHEMA_VERSION,
        scene: {
            ...envelope.scene,
            elements: nextElements,
            ...(nextAutomation ? { automation: nextAutomation } : {}),
        },
    } as T;
}
