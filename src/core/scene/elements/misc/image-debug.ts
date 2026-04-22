// Image Debug Element — visualises how VisualMedia lays out an image under
// different fit modes, and exposes the discrepancy between declared bounds
// (_getSelfBounds) and the actual drawn pixels when pivot != (0, 0).
//
// Layout (left to right): contain | cover | fill | none
// Per cell:
//   • dark grey   — container rect (what the element declares as its size)
//   • teal/orange/purple/sky outline — "declared bounds" rect (draw params
//     before pivot, matching what _getSelfBounds reports)
//   • red outline — actual drawn rect after pivot offset is applied
//     (only differs from declared bounds when pivotX/Y != 0)
//   • white dot   — pivot anchor point within the draw area
//   • label       — fit mode name + draw dimensions
import { SceneElement, type EnhancedConfigSchema, insertElementGroups, prop } from '@mvmnt/plugin-sdk';
import { Rectangle, Text, Arc, type RenderObject } from '@mvmnt/plugin-sdk/render';

const MODES = [
    { mode: 'contain' as const, color: '#2dd4bf', label: 'contain' },
    { mode: 'cover'   as const, color: '#fb923c', label: 'cover'   },
    { mode: 'fill'    as const, color: '#a78bfa', label: 'fill'    },
    { mode: 'none'    as const, color: '#38bdf8', label: 'none'    },
] as const;

/** Mirrors the draw-param logic in VisualMedia so the debug element doesn't
 *  need to import the render object just to call a private method. */
function calcDrawParams(
    imgW: number,
    imgH: number,
    cW: number,
    cH: number,
    mode: 'contain' | 'cover' | 'fill' | 'none',
    preserveAspectRatio: boolean
): { drawX: number; drawY: number; drawWidth: number; drawHeight: number } {
    if (!preserveAspectRatio || mode === 'fill' || !imgW || !imgH) {
        return { drawX: 0, drawY: 0, drawWidth: cW, drawHeight: cH };
    }
    const cAspect = cW / cH;
    const iAspect = imgW / imgH;
    let drawWidth: number, drawHeight: number, drawX: number, drawY: number;
    if (mode === 'contain') {
        if (iAspect > cAspect) {
            drawWidth = cW; drawHeight = cW / iAspect;
            drawX = 0; drawY = (cH - drawHeight) / 2;
        } else {
            drawHeight = cH; drawWidth = cH * iAspect;
            drawX = (cW - drawWidth) / 2; drawY = 0;
        }
    } else if (mode === 'cover') {
        if (iAspect > cAspect) {
            drawHeight = cH; drawWidth = cH * iAspect;
            drawX = (cW - drawWidth) / 2; drawY = 0;
        } else {
            drawWidth = cW; drawHeight = cW / iAspect;
            drawX = 0; drawY = (cH - drawHeight) / 2;
        }
    } else {
        // none
        drawWidth = Math.min(imgW, cW);
        drawHeight = Math.min(imgH, cH);
        drawX = (cW - drawWidth) / 2;
        drawY = (cH - drawHeight) / 2;
    }
    return { drawX, drawY, drawWidth, drawHeight };
}

export class ImageDebugElement extends SceneElement {
    constructor(id: string = 'image-debug', config: { [key: string]: any } = {}) {
        super('image-debug', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(super.getConfigSchema(), {
            name: 'Image Debug',
            description: 'Visualise VisualMedia fit modes and bounds discrepancies',
            category: 'Misc',
        }, [
            {
                id: 'debugImage',
                label: 'Hypothetical Image',
                variant: 'basic',
                collapsed: false,
                description: 'Dimensions of the image being simulated (no real image loaded).',
                properties: [
                    prop.number('imgWidth',  'Image Width',  300, { min: 1, step: 10 }),
                    prop.number('imgHeight', 'Image Height', 200, { min: 1, step: 10 }),
                ],
            },
            {
                id: 'debugContainer',
                label: 'Container',
                variant: 'basic',
                collapsed: false,
                description: 'Container size used for each fit-mode cell.',
                properties: [
                    prop.number('containerW', 'Container Width',  160, { min: 20, step: 10 }),
                    prop.number('containerH', 'Container Height', 160, { min: 20, step: 10 }),
                    prop.number('colGap',     'Column Gap',        24, { min: 0,  step: 4  }),
                ],
            },
            {
                id: 'debugPivot',
                label: 'Pivot',
                variant: 'basic',
                collapsed: false,
                description: 'Asset pivot (0–1). Non-zero values reveal the bounds bug: declared bounds and actual drawn area diverge.',
                properties: [
                    prop.number('pivotX', 'Pivot X', 0, { min: 0, max: 1, step: 0.05 }),
                    prop.number('pivotY', 'Pivot Y', 0, { min: 0, max: 1, step: 0.05 }),
                    prop.boolean('showPivot', 'Show Pivot Dot', true),
                ],
            },
        ]);
    }

    protected _buildRenderObjects(_config: any, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const imgW    = Math.max(1, (props.imgWidth  as number) ?? 300);
        const imgH    = Math.max(1, (props.imgHeight as number) ?? 200);
        const cW      = Math.max(20, (props.containerW as number) ?? 160);
        const cH      = Math.max(20, (props.containerH as number) ?? 160);
        const gap     = Math.max(0, (props.colGap    as number) ?? 24);
        const pivotX  = Math.max(0, Math.min(1, (props.pivotX  as number) ?? 0));
        const pivotY  = Math.max(0, Math.min(1, (props.pivotY  as number) ?? 0));
        const showPivot = (props.showPivot as boolean) ?? true;

        const objects: RenderObject[] = [];
        const labelY = cH + 6;
        const infoY  = labelY + 16;

        for (let i = 0; i < MODES.length; i++) {
            const { mode, color, label } = MODES[i];
            const ox = i * (cW + gap); // horizontal offset for this cell

            // Container background (dark grey fill, thin outline)
            const bg = new Rectangle(ox, 0, cW, cH, 'rgba(50,50,50,0.4)', '#555', 1);
            objects.push(bg);

            const p = calcDrawParams(imgW, imgH, cW, cH, mode, true);
            const { drawX, drawY, drawWidth, drawHeight } = p;

            // Declared bounds rect: what _getSelfBounds() reports.
            // For cover this may extend outside the container.
            const declaredRect = new Rectangle(
                ox + drawX, drawY, drawWidth, drawHeight,
                null, color, 2
            );
            objects.push(declaredRect);

            // Actual drawn rect: _renderSelf applies pivot offset.
            // px = drawX - pivotX * drawWidth
            const actualX = drawX - pivotX * drawWidth;
            const actualY = drawY - pivotY * drawHeight;

            if (pivotX !== 0 || pivotY !== 0) {
                // Only render the actual rect when it differs from declared bounds.
                const actualRect = new Rectangle(
                    ox + actualX, actualY, drawWidth, drawHeight,
                    'rgba(239,68,68,0.15)', '#ef4444', 1
                );
                objects.push(actualRect);
            }

            // Pivot anchor dot (the point within the image that aligns to
            // the draw origin — always at (drawX, drawY) in container space).
            if (showPivot) {
                const dotX = ox + drawX;
                const dotY = drawY;
                objects.push(new Arc(dotX, dotY, 4, 0, Math.PI * 2, false, { fillColor: '#fff', strokeColor: '#000', strokeWidth: 1 }));
            }

            // Fit mode label
            objects.push(new Text(ox + cW / 2, labelY, label, '11px monospace', '#aaa', 'center', 'top'));

            // Draw dimensions info
            const dw = Math.round(drawWidth);
            const dh = Math.round(drawHeight);
            objects.push(new Text(ox + cW / 2, infoY, `${dw}×${dh}`, '10px monospace', '#666', 'center', 'top'));
        }

        // Legend row
        const legendY = infoY + 20;
        const totalW = MODES.length * (cW + gap) - gap;
        objects.push(new Text(0, legendY, `container: ${cW}×${cH}   image: ${imgW}×${imgH}   pivot: (${pivotX}, ${pivotY})`, '10px sans-serif', '#555', 'left', 'top'));

        if (pivotX !== 0 || pivotY !== 0) {
            objects.push(new Text(0, legendY + 14,
                '  coloured outline = declared bounds (_getSelfBounds)   red outline = actual drawn area',
                '10px sans-serif', '#888', 'left', 'top'));
        }

        // Column headers: container outline for reference
        for (let i = 0; i < MODES.length; i++) {
            const ox = i * (cW + gap);
            // Thin white outline showing the container edge
            objects.push(new Rectangle(ox, 0, cW, cH, null, 'rgba(255,255,255,0.12)', 1));
        }

        void totalW; // used only for layout reference
        return objects;
    }
}
