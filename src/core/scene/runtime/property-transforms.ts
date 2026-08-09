import type { SceneElementInterface } from '@core/scene/runtime/schema';
import type { PropertyTransform } from '@core/scene/runtime/bound-scene-element';

export const asNumber: PropertyTransform<number, SceneElementInterface> = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
};

export const asBoolean: PropertyTransform<boolean, SceneElementInterface> = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    if (typeof value === 'number') return value !== 0;
    return undefined;
};

export const asString: PropertyTransform<string, SceneElementInterface> = (value) => {
    if (typeof value === 'string') return value;
    if (value == null) return undefined;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return undefined;
};

export const asTrimmedString: PropertyTransform<string, SceneElementInterface> = (value, element) => {
    const stringValue = asString(value, element);
    if (typeof stringValue !== 'string') return undefined;
    const trimmed = stringValue.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};
