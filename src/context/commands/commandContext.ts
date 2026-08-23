export type CommandSurface = 'scene-tree' | 'preview' | 'properties' | 'timeline-clips' | 'timeline-automation';

let activeSurface: CommandSurface | null = null;

function surfaceFromElement(element: Element | null): CommandSurface | null {
    if (!element || typeof element.closest !== 'function') return null;
    return element.closest<HTMLElement>('[data-command-surface]')?.dataset.commandSurface as CommandSurface | null;
}

export function activateCommandSurface(surface: CommandSurface): void {
    activeSurface = surface;
}

export function activateCommandSurfaceFromTarget(target: EventTarget | null): void {
    const surface = surfaceFromElement(target as Element | null);
    if (surface) activeSurface = surface;
}

export function getActiveCommandSurface(event?: Pick<KeyboardEvent, 'target'>): CommandSurface | null {
    return (
        surfaceFromElement(event?.target as Element | null) ??
        surfaceFromElement(typeof document === 'undefined' ? null : document.activeElement) ??
        activeSurface
    );
}

export function isCommandSurfaceActive(
    surface: CommandSurface | readonly CommandSurface[],
    event?: Pick<KeyboardEvent, 'target'>
): boolean {
    const current = getActiveCommandSurface(event);
    return Array.isArray(surface) ? surface.includes(current as CommandSurface) : current === surface;
}

export function resetCommandContextForTest(): void {
    activeSurface = null;
}
