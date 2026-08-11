import { describe, expect, it } from 'vitest';
import { reconcileHydratedFontTokens, type HydratedFontAsset } from '../fontHydration';

const brandSans: HydratedFontAsset = {
    asset: {
        id: 'brand-sans',
        family: 'Brand Sans',
        originalFileName: 'BrandSans.woff2',
        fileSize: 1024,
        createdAt: 1,
        updatedAt: 1,
        licensingAcknowledged: true,
        variants: [
            { id: 'regular', weight: 400, style: 'normal', sourceFormat: 'woff2' },
            { id: 'italic', weight: 400, style: 'italic', sourceFormat: 'woff2' },
        ],
    },
    variants: [{ id: 'regular', weight: 400, style: 'normal', sourceFormat: 'woff2' }],
};

describe('reconcileHydratedFontTokens', () => {
    it('repairs missing references throughout an imported scene using hydrated embedded faces', () => {
        const scene = {
            elements: {
                title: { properties: { fontFamily: { type: 'constant', value: 'MissingProject:Brand Sans|400' } } },
            },
            macros: { macros: { headingFont: { type: 'font', value: 'MissingGoogle:Brand Sans|400' } } },
            automation: { channels: { heading: { keyframes: [{ value: 'MissingProject:Brand Sans|400' }] } } },
        };

        expect(reconcileHydratedFontTokens(scene, [brandSans])).toEqual({
            elements: {
                title: { properties: { fontFamily: { type: 'constant', value: 'Project:brand-sans|400' } } },
            },
            macros: { macros: { headingFont: { type: 'font', value: 'Project:brand-sans|400' } } },
            automation: { channels: { heading: { keyframes: [{ value: 'Project:brand-sans|400' }] } } },
        });
    });

    it('keeps unavailable faces missing while retaining available faces from the same family', () => {
        const scene = {
            regular: 'MissingProject:Brand Sans|400',
            italic: 'MissingProject:Brand Sans|400i',
            unavailableProjectFace: 'Project:brand-sans|400i',
        };

        expect(reconcileHydratedFontTokens(scene, [brandSans])).toEqual({
            regular: 'Project:brand-sans|400',
            italic: 'MissingProject:Brand Sans|400i',
            unavailableProjectFace: 'MissingProject:Brand Sans|400i',
        });
    });
});
