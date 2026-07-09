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
    const duplicatePattern = new RegExp(`^${escapeRegExp(baseId)}_(\\d+)$`);
    let nextCopyNumber = 1;

    for (const existingId of ids) {
        const match = duplicatePattern.exec(existingId);
        if (!match) continue;
        nextCopyNumber = Math.max(nextCopyNumber, Number(match[1]) + 1);
    }

    let duplicateId = `${baseId}_${nextCopyNumber}`;
    while (existing.has(duplicateId)) {
        nextCopyNumber += 1;
        duplicateId = `${baseId}_${nextCopyNumber}`;
    }

    return duplicateId;
}
