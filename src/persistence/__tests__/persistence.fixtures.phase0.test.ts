import { describe, it, expect } from 'vitest';
import { importScene, exportScene } from '../';

function readFixture(path: string): string {
    // In Vite/Vitest, import.meta.glob can import raw JSON via ?raw; keep it simple with require for Node-based Vitest.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    return fs.readFileSync(path, 'utf-8');
}

describe('Persistence Phase 0 Fixtures', () => {
    it('imports basic empty scene fixture', () => {
        const json = readFixture(__dirname + '/__fixtures__/basic-empty-scene.v1.json');
        const res = importScene(json);
        expect(res.ok).toBe(true);
    });

    it('imports more complex fixture and can export after', () => {
        const json = readFixture(__dirname + '/__fixtures__/single-track-simple-element.v1.json');
        const res = importScene(json);
        expect(res.ok).toBe(true);
        const out = exportScene();
        expect(out.ok).toBe(true);
        // Ensure we produce an envelope with same schema/format
        if (out.ok) {
            expect(out.envelope.schemaVersion).toBe(1);
            expect(out.envelope.format).toBe('mvmnt.scene');
        }
    });
});
