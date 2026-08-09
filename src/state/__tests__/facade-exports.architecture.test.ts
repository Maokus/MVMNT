import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
    return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('state facade stability', () => {
    it('keeps sceneStore as a composition facade', () => {
        const facade = source('src/state/sceneStore.ts');
        expect(facade).toContain("from './scene/storeComposition'");
        expect(facade).toContain("from './scene/sceneStoreRuntimeWiring'");
    });

    it('keeps the timeline command descriptor gateway public', () => {
        const facade = source('src/state/timelineStore.ts');
        expect(facade).toContain('export function dispatchTimelineCommandDescriptor');
        expect(facade).toContain('export const timelineCommandGateway');
    });
});
