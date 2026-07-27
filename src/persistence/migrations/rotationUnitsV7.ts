type MaybeRecord = Record<string, any>;

const ROTATION_UNITS_SCHEMA_VERSION = 7;
const RAD_TO_DEG = 180 / Math.PI;
const BASIC_SHAPES_TYPE = 'basicShapes';
const DEGREE_MIGRATED_PROPERTIES = new Set(['elementRotation', 'startAngle', 'endAngle']);

interface MacroUsage {
    total: number;
    convertible: number;
}

function isRecord(value: unknown): value is MaybeRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function radiansToDegrees(value: unknown): unknown {
    return typeof value === 'number' && Number.isFinite(value) ? value * RAD_TO_DEG : value;
}

function shouldConvertProperty(elementType: unknown, propertyKey: string): boolean {
    if (propertyKey === 'elementRotation') return true;
    return elementType === BASIC_SHAPES_TYPE && (propertyKey === 'startAngle' || propertyKey === 'endAngle');
}

function migrateBindingValue(binding: unknown): unknown {
    if (typeof binding === 'number') return radiansToDegrees(binding);
    if (!isRecord(binding) || binding.type !== 'constant') return binding;
    return { ...binding, value: radiansToDegrees(binding.value) };
}

function migrateBezierHandle(handle: unknown): unknown {
    if (!isRecord(handle) || typeof handle.dv !== 'number' || !Number.isFinite(handle.dv)) return handle;
    return { ...handle, dv: radiansToDegrees(handle.dv) };
}

function migratePropertyMap(properties: unknown, elementType: unknown): unknown {
    if (!isRecord(properties)) return properties;
    let changed = false;
    const next: MaybeRecord = { ...properties };
    for (const propertyKey of DEGREE_MIGRATED_PROPERTIES) {
        if (!shouldConvertProperty(elementType, propertyKey) || !(propertyKey in next)) continue;
        const migrated = migrateBindingValue(next[propertyKey]);
        if (migrated !== next[propertyKey]) {
            next[propertyKey] = migrated;
            changed = true;
        }
    }
    return changed ? next : properties;
}

function migrateElement(element: unknown): unknown {
    if (!isRecord(element)) return element;
    const elementType = element.type;
    let changed = false;
    const next: MaybeRecord = { ...element };

    if (isRecord(element.properties)) {
        const migrated = migratePropertyMap(element.properties, elementType);
        if (migrated !== element.properties) {
            next.properties = migrated;
            changed = true;
        }
    }

    if (isRecord(element.config)) {
        const migrated = migratePropertyMap(element.config, elementType);
        if (migrated !== element.config) {
            next.config = migrated;
            changed = true;
        }
    }

    for (const propertyKey of DEGREE_MIGRATED_PROPERTIES) {
        if (!shouldConvertProperty(elementType, propertyKey) || !(propertyKey in element)) continue;
        const migrated = migrateBindingValue(element[propertyKey]);
        if (migrated !== element[propertyKey]) {
            next[propertyKey] = migrated;
            changed = true;
        }
    }

    return changed ? next : element;
}

function recordMacroUsage(usages: Map<string, MacroUsage>, binding: unknown, convertible: boolean): void {
    if (!isRecord(binding) || binding.type !== 'macro' || typeof binding.macroId !== 'string') return;
    const current = usages.get(binding.macroId) ?? { total: 0, convertible: 0 };
    current.total += 1;
    if (convertible) current.convertible += 1;
    usages.set(binding.macroId, current);
}

function collectMacroUsagesFromPropertyMap(
    usages: Map<string, MacroUsage>,
    properties: unknown,
    elementType: unknown
): void {
    if (!isRecord(properties)) return;
    for (const [propertyKey, binding] of Object.entries(properties)) {
        recordMacroUsage(usages, binding, shouldConvertProperty(elementType, propertyKey));
    }
}

function collectMacroUsagesFromElement(usages: Map<string, MacroUsage>, element: unknown): void {
    if (!isRecord(element)) return;
    const elementType = element.type;
    collectMacroUsagesFromPropertyMap(usages, element.properties, elementType);
    collectMacroUsagesFromPropertyMap(usages, element.config, elementType);
    for (const [propertyKey, binding] of Object.entries(element)) {
        if (propertyKey === 'properties' || propertyKey === 'config') continue;
        recordMacroUsage(usages, binding, shouldConvertProperty(elementType, propertyKey));
    }
}

function collectMacroUsages(elements: unknown): Map<string, MacroUsage> {
    const usages = new Map<string, MacroUsage>();
    if (Array.isArray(elements)) {
        elements.forEach((element) => collectMacroUsagesFromElement(usages, element));
    } else if (isRecord(elements)) {
        Object.values(elements).forEach((element) => collectMacroUsagesFromElement(usages, element));
    }
    return usages;
}

function migrateMacroValueFields(macro: MaybeRecord): MaybeRecord {
    const next: MaybeRecord = { ...macro };
    let changed = false;

    for (const key of ['value', 'defaultValue']) {
        if (!(key in next)) continue;
        const migrated = radiansToDegrees(next[key]);
        if (migrated !== next[key]) {
            next[key] = migrated;
            changed = true;
        }
    }

    if (isRecord(macro.options)) {
        const options: MaybeRecord = { ...macro.options };
        let optionsChanged = false;
        for (const key of ['min', 'max', 'step']) {
            if (!(key in options)) continue;
            const migrated = radiansToDegrees(options[key]);
            if (migrated !== options[key]) {
                options[key] = migrated;
                optionsChanged = true;
            }
        }
        if (optionsChanged) {
            next.options = options;
            changed = true;
        }
    }

    return changed ? next : macro;
}

function migrateMacros(macrosPayload: unknown, usages: Map<string, MacroUsage>): unknown {
    if (!isRecord(macrosPayload)) return macrosPayload;
    const macroRecords = isRecord(macrosPayload.macros)
        ? macrosPayload.macros
        : isRecord(macrosPayload.byId)
          ? macrosPayload.byId
          : null;
    if (!macroRecords) return macrosPayload;

    let changed = false;
    const nextMacroRecords: MaybeRecord = { ...macroRecords };

    for (const [macroId, macro] of Object.entries(macroRecords)) {
        const usage = usages.get(macroId);
        if (!usage || usage.total === 0 || usage.total !== usage.convertible) continue;
        if (!isRecord(macro) || macro.type !== 'number') continue;
        const migrated = migrateMacroValueFields(macro);
        if (migrated !== macro) {
            nextMacroRecords[macroId] = migrated;
            changed = true;
        }
    }

    if (!changed) return macrosPayload;
    if (isRecord(macrosPayload.macros)) return { ...macrosPayload, macros: nextMacroRecords };
    return { ...macrosPayload, byId: nextMacroRecords };
}

function migrateElementsCollection(elements: unknown): unknown {
    if (Array.isArray(elements)) {
        let changed = false;
        const next = elements.map((element) => {
            const migrated = migrateElement(element);
            if (migrated !== element) changed = true;
            return migrated;
        });
        return changed ? next : elements;
    }

    if (isRecord(elements)) {
        let changed = false;
        const next: MaybeRecord = { ...elements };
        for (const [id, element] of Object.entries(elements)) {
            const migrated = migrateElement(element);
            if (migrated !== element) {
                next[id] = migrated;
                changed = true;
            }
        }
        return changed ? next : elements;
    }

    return elements;
}

function collectElementTypes(elements: unknown): Map<string, unknown> {
    const types = new Map<string, unknown>();
    const visit = (element: unknown) => {
        if (!isRecord(element) || typeof element.id !== 'string') return;
        types.set(element.id, element.type);
    };

    if (Array.isArray(elements)) {
        elements.forEach(visit);
    } else if (isRecord(elements)) {
        Object.values(elements).forEach(visit);
    }

    return types;
}

function migrateAutomation(automation: unknown, elementTypes: Map<string, unknown>): unknown {
    if (!isRecord(automation) || !isRecord(automation.channels)) return automation;

    let changed = false;
    const nextChannels: MaybeRecord = { ...automation.channels };

    for (const [channelId, channel] of Object.entries(automation.channels)) {
        if (!isRecord(channel)) continue;
        const propertyKey = typeof channel.propertyKey === 'string' ? channel.propertyKey : channelId.split('.').pop();
        if (!propertyKey || !DEGREE_MIGRATED_PROPERTIES.has(propertyKey)) continue;

        const elementType = typeof channel.elementId === 'string' ? elementTypes.get(channel.elementId) : undefined;
        if (!shouldConvertProperty(elementType, propertyKey)) continue;
        if (!Array.isArray(channel.keyframes)) continue;

        let channelChanged = false;
        const keyframes = channel.keyframes.map((keyframe: unknown) => {
            if (!isRecord(keyframe)) return keyframe;
            const value = radiansToDegrees(keyframe.value);
            const leftHandle = migrateBezierHandle(keyframe.leftHandle);
            const rightHandle = migrateBezierHandle(keyframe.rightHandle);
            if (
                value === keyframe.value &&
                leftHandle === keyframe.leftHandle &&
                rightHandle === keyframe.rightHandle
            ) {
                return keyframe;
            }
            channelChanged = true;
            const migratedKeyframe: MaybeRecord = { ...keyframe, value };
            if ('leftHandle' in keyframe) migratedKeyframe.leftHandle = leftHandle;
            if ('rightHandle' in keyframe) migratedKeyframe.rightHandle = rightHandle;
            return migratedKeyframe;
        });

        if (channelChanged) {
            nextChannels[channelId] = { ...channel, keyframes };
            changed = true;
        }
    }

    return changed ? { ...automation, channels: nextChannels } : automation;
}

export function migrateSceneRotationUnitsV7<T extends MaybeRecord>(envelope: T): T {
    const schemaVersion = typeof envelope.schemaVersion === 'number' ? envelope.schemaVersion : 0;
    if (schemaVersion >= ROTATION_UNITS_SCHEMA_VERSION) return envelope;

    const scene = envelope.scene;
    if (!isRecord(scene)) return envelope;

    let changed = false;
    const nextScene: MaybeRecord = { ...scene };
    const elementTypes = collectElementTypes(scene.elements);
    const macroUsages = collectMacroUsages(scene.elements);

    const migratedElements = migrateElementsCollection(scene.elements);
    if (migratedElements !== scene.elements) {
        nextScene.elements = migratedElements;
        changed = true;
    }

    const migratedAutomation = migrateAutomation(scene.automation, elementTypes);
    if (migratedAutomation !== scene.automation) {
        nextScene.automation = migratedAutomation;
        changed = true;
    }

    const migratedMacros = migrateMacros(scene.macros, macroUsages);
    if (migratedMacros !== scene.macros) {
        nextScene.macros = migratedMacros;
        changed = true;
    }

    return changed ? ({ ...envelope, scene: nextScene } as T) : envelope;
}
