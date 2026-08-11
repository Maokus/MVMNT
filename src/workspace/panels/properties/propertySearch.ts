export function propertySearchMatches(searchTerm: string, ...candidates: Array<string | undefined>): boolean {
    const query = searchTerm.trim().toLocaleLowerCase();
    if (!query) return true;
    return candidates.some((candidate) => candidate?.toLocaleLowerCase().includes(query));
}

export function propertyVisibleForSearch(
    searchTerm: string,
    sectionTitle: string,
    ...propertyTerms: string[]
): boolean {
    return propertySearchMatches(searchTerm, sectionTitle) || propertySearchMatches(searchTerm, ...propertyTerms);
}

export function sectionVisibleForSearch(
    searchTerm: string,
    sectionTitle: string,
    propertyTerms: readonly string[]
): boolean {
    return (
        propertySearchMatches(searchTerm, sectionTitle) ||
        propertyTerms.some((term) => propertySearchMatches(searchTerm, term))
    );
}
