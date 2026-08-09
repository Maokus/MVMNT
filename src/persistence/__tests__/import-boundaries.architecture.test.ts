import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const importDirectory = resolve(process.cwd(), 'src/persistence/import');

describe('scene import module boundaries', () => {
    it('keeps capability modules independent from the public facade', () => {
        const modules = readdirSync(importDirectory).filter((file) => file.endsWith('.ts'));
        for (const module of modules) {
            const source = readFileSync(resolve(importDirectory, module), 'utf8');
            expect(source, module).not.toMatch(/from ['"]\.\.\/import['"]/);
        }
    });

    it('owns shared import contracts in one module', () => {
        const modules = readdirSync(importDirectory).filter((file) => file.endsWith('.ts') && file !== 'contracts.ts');
        for (const module of modules) {
            const source = readFileSync(resolve(importDirectory, module), 'utf8');
            expect(source, module).not.toMatch(
                /(?:interface|type)\s+(?:ParsedArtifact|ImportSceneOptions|ImportError)\b/
            );
        }
    });
});
