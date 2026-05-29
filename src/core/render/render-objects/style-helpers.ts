interface HasShadow {
    shadowColor: string | null;
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
}

interface HasDash {
    lineDash: number[];
    lineDashOffset: number;
}

interface HasStroke {
    strokeColor: string | null;
    strokeWidth: number;
}

interface HasFill {
    fillColor: string | null;
}

export function applyShadow(ctx: CanvasRenderingContext2D, s: HasShadow): void {
    if (s.shadowColor && s.shadowBlur > 0) {
        ctx.shadowColor = s.shadowColor;
        ctx.shadowBlur = s.shadowBlur;
        ctx.shadowOffsetX = s.shadowOffsetX;
        ctx.shadowOffsetY = s.shadowOffsetY;
    }
}

export function clearShadow(ctx: CanvasRenderingContext2D, s: HasShadow): void {
    if (s.shadowColor && s.shadowBlur > 0) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }
}

export function applyDash(ctx: CanvasRenderingContext2D, s: HasDash): void {
    if (s.lineDash.length > 0) {
        ctx.setLineDash(s.lineDash);
        ctx.lineDashOffset = s.lineDashOffset;
    }
}

export function clearDash(ctx: CanvasRenderingContext2D, s: HasDash): void {
    if (s.lineDash.length > 0) {
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
    }
}

export function applyStroke(ctx: CanvasRenderingContext2D, s: HasStroke): void {
    if (s.strokeColor && s.strokeWidth > 0) {
        ctx.strokeStyle = s.strokeColor;
        ctx.lineWidth = s.strokeWidth;
    }
}

export function applyFill(ctx: CanvasRenderingContext2D, s: HasFill): void {
    if (s.fillColor) {
        ctx.fillStyle = s.fillColor;
    }
}
