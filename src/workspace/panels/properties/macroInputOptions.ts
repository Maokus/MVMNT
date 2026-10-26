import type { ElementPropertyDefinition } from '@mvmnt-app/plugin-sdk';
import type { PropertyTarget } from '@automation/types';
import {
    elementPropertyDescriptors,
    hostPropertyDescriptors,
    type PropertyPresentationCodec,
} from '@state/scene/propertyCatalog';
import type { Macro, MacroOptions } from '@state/scene/macros';

type ElementTypes = Readonly<Record<string, { type: string } | undefined>>;

function definitionForTarget(target: PropertyTarget, elements: ElementTypes) {
    if (target.owner.kind === 'node') {
        const descriptor = hostPropertyDescriptors(target.owner.id).find(
            (candidate) => candidate.definition.key === target.propertyPath
        );
        return descriptor
            ? {
                  kind: `node:${target.propertyPath}`,
                  definition: descriptor.definition,
                  presentation: descriptor.presentation,
              }
            : null;
    }
    const elementType = elements[target.owner.id]?.type;
    if (!elementType) return null;
    const descriptor = elementPropertyDescriptors(target.owner.id, elementType).find(
        (candidate) => candidate.definition.key === target.propertyPath
    );
    return descriptor
        ? {
              kind: `element:${elementType}:${target.propertyPath}`,
              definition: descriptor.definition,
              presentation: descriptor.presentation,
          }
        : null;
}

function inheritedOptions(
    definition: ElementPropertyDefinition,
    presentation: PropertyPresentationCodec
): MacroOptions {
    const options: MacroOptions = {};
    if (definition.type === 'number') {
        const numeric = (value: number, delta = false) => {
            const converted =
                delta && presentation.fromDisplayDelta
                    ? presentation.fromDisplayDelta(value)
                    : presentation.fromDisplay(value);
            return typeof converted === 'number' ? converted : value;
        };
        if (definition.min !== undefined) options.min = numeric(definition.min);
        if (definition.max !== undefined) options.max = numeric(definition.max);
        if (definition.step !== undefined) options.step = numeric(definition.step, true);
    }
    if (definition.type === 'select' && definition.options) {
        options.selectOptions = definition.options.map((entry) => ({ ...entry }));
    }
    if (definition.accept !== undefined) options.accept = definition.accept;
    if (definition.allowMultiple !== undefined) options.allowMultiple = definition.allowMultiple;
    if (definition.allowedTrackTypes) options.allowedTrackTypes = [...definition.allowedTrackTypes];
    if (definition.allowedAssetTypes) options.allowedAssetTypes = [...definition.allowedAssetTypes];
    return options;
}

export function effectiveMacroInputOptions(
    macro: Pick<Macro, 'type' | 'options'>,
    targets: readonly PropertyTarget[],
    elements: ElementTypes
): MacroOptions {
    if (targets.length === 0) return macro.options;
    const resolved = targets.map((target) => definitionForTarget(target, elements));
    const first = resolved[0];
    if (!first || resolved.some((entry) => !entry || entry.kind !== first.kind)) return macro.options;
    const propertyType = first.definition.type === 'longString' ? 'string' : first.definition.type;
    if (macro.type !== propertyType && !(first.definition.type === 'file' && macro.type.startsWith('file-'))) {
        return macro.options;
    }
    const inherited = inheritedOptions(first.definition, first.presentation);
    return {
        ...inherited,
        ...Object.fromEntries(Object.entries(macro.options).filter(([, value]) => value !== undefined)),
    };
}
