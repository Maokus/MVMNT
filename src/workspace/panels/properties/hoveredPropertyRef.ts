export interface HoveredPropertyInfo {
    owner: { kind: 'element' | 'node'; id: string };
    propertyKey: string;
    propertyType: string;
}

/** Module-level ref tracking which automatable property row the cursor is over. */
export const hoveredPropertyRef: { current: HoveredPropertyInfo | null } = { current: null };
