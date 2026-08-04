function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getDuplicateBaseId(elementId: string, existingIds: Iterable<string>): string {
    const numericSuffix = /^(.*)_(\d+)$/.exec(elementId);
    if (!numericSuffix) return elementId;

    const [, candidateBase] = numericSuffix;
    if (!candidateBase) return elementId;

    const siblingPattern = new RegExp(`^${escapeRegExp(candidateBase)}_\\d+$`);
    for (const existingId of existingIds) {
        if (existingId === candidateBase || (existingId !== elementId && siblingPattern.test(existingId))) {
            return candidateBase;
        }
    }

    return elementId;
}

export function createDuplicateElementId(elementId: string, existingIds: Iterable<string>): string {
    const ids = Array.from(existingIds);
    const existing = new Set(ids);
    const baseId = getDuplicateBaseId(elementId, ids);
    let copyNumber = 1;
    while (existing.has(`${baseId}_${copyNumber}`)) copyNumber += 1;
    return `${baseId}_${copyNumber}`;
}
