function getDuplicateBaseId(elementId: string): string {
    const numericSuffix = /^(.*)_(\d+)$/.exec(elementId);
    if (!numericSuffix) return elementId;

    const [, candidateBase] = numericSuffix;
    return candidateBase || elementId;
}

/** Allocates the next numbered duplicate label for elements and groups. */
export function createDuplicateName(name: string, existingNames: Iterable<string>): string {
    const ids = Array.from(existingNames);
    const existing = new Set(ids);
    const baseId = getDuplicateBaseId(name);
    let copyNumber = 1;
    while (existing.has(`${baseId}_${copyNumber}`)) copyNumber += 1;
    return `${baseId}_${copyNumber}`;
}

/** @deprecated Use createDuplicateName for element IDs and group names. */
export const createDuplicateElementId = createDuplicateName;
