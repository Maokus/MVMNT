/** Allocates the lowest available numbered duplicate label for scene entities. */
export function createDuplicateName(name: string, existingNames: Iterable<string>): string {
    const numericSuffix = /^(.*)_(\d+)$/.exec(name);
    const baseName = numericSuffix?.[1] || name;
    const existing = new Set(existingNames);
    let copyNumber = 1;
    while (existing.has(`${baseName}_${copyNumber}`)) copyNumber += 1;
    return `${baseName}_${copyNumber}`;
}
