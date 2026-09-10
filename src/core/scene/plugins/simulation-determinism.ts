import { parseScript } from 'meriyah';
import type { PluginElementDefinition } from '../../../../packages/plugin-sdk/src/scene';

const PROHIBITED_MEMBERS = new Map([
    ['Math', new Set(['random'])],
    ['Date', new Set(['now'])],
    ['performance', new Set(['now'])],
]);

function staticMemberName(node: any): string | undefined {
    if (!node?.computed && node?.property?.type === 'Identifier') return node.property.name;
    if (node?.computed && node?.property?.type === 'Literal' && typeof node.property.value === 'string')
        return node.property.value;
    return undefined;
}

function ambientObjectName(node: any): string | undefined {
    if (node?.type === 'Identifier') return node.name;
    if (node?.type !== 'MemberExpression') return undefined;
    const root = node.object;
    if (root?.type === 'Identifier' && (root.name === 'globalThis' || root.name === 'window' || root.name === 'self'))
        return staticMemberName(node);
    return undefined;
}

function findProhibitedApi(node: any): string | undefined {
    if (!node || typeof node !== 'object') return undefined;
    if (node.type === 'MemberExpression') {
        const object = ambientObjectName(node.object);
        const member = staticMemberName(node);
        if (object && member && PROHIBITED_MEMBERS.get(object)?.has(member)) return `${object}.${member}()`;
    }
    for (const value of Object.values(node)) {
        if (!value || typeof value !== 'object') continue;
        if (Array.isArray(value)) {
            for (const child of value) {
                const found = findProhibitedApi(child);
                if (found) return found;
            }
        } else {
            const found = findProhibitedApi(value);
            if (found) return found;
        }
    }
    return undefined;
}

function parseCallback(callback: Function): any {
    const source = Function.prototype.toString.call(callback);
    for (const candidate of [`(${source})`, `({${source}})`]) {
        try {
            return parseScript(candidate, { next: true });
        } catch {
            // Method syntax needs the object-literal form; arrow/function syntax needs the expression form.
        }
    }
    throw new Error('could not be statically inspected');
}

/** Validate only callbacks that can alter canonical state; this is not a security sandbox. */
export function validateSimulationDeterminism(definition: PluginElementDefinition<any, any, any, any>): void {
    if (!definition.simulation) return;
    for (const name of ['initialize', 'step'] as const) {
        let prohibited: string | undefined;
        try {
            prohibited = findProhibitedApi(parseCallback(definition.simulation[name]));
        } catch (error) {
            throw new Error(
                `Deterministic simulation callback '${name}' ${error instanceof Error ? error.message : String(error)}`
            );
        }
        if (prohibited)
            throw new Error(
                `Deterministic simulation callback '${name}' uses prohibited ambient API ${prohibited}. ` +
                    `Use context.random (or initialize({ random })) with a stable key instead.`
            );
    }
}
