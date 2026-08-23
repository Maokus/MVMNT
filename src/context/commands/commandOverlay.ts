const openContextMenus = new Set<string>();

export function markContextMenuOpen(id: string): () => void {
    openContextMenus.add(id);
    return () => openContextMenus.delete(id);
}

export function hasOpenContextMenu(): boolean {
    return openContextMenus.size > 0;
}

export function resetCommandOverlaysForTest(): void {
    openContextMenus.clear();
}
