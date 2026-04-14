export interface HoveredPropertyInfo {
    elementId: string;
    propertyKey: string;
    propertyType: string;
}

/** Module-level ref tracking which automatable property row the cursor is over. */
export const hoveredPropertyRef: { current: HoveredPropertyInfo | null } = { current: null };
