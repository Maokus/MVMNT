import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import packageManifest from '../../package.json';

const require = createRequire(import.meta.url);
const forgeConfig = require('../../forge.config.cjs');

describe('macOS packaging dependencies', () => {
    it('makes appdmg optional so Linux verification installs succeed', () => {
        expect(packageManifest.optionalDependencies.appdmg).toBeDefined();

        if (process.platform === 'darwin') {
            expect(require.resolve('appdmg')).toContain('node_modules/appdmg');
        }
    });

    it('only passes appdmg-supported options to the DMG maker', () => {
        const dmgMaker = forgeConfig.makers.find((maker: { name: string }) => maker.name.includes('maker-dmg'));

        expect(dmgMaker?.config.additionalDMGOptions).toBeUndefined();
    });
});
