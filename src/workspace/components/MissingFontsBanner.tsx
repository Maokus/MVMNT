import React, { useMemo } from 'react';
import { useSceneStore } from '@state/sceneStore';
import { parseFontSelectionToken } from '@state/scene/fonts';

function collectMissing(value: unknown, families = new Set<string>()): Set<string> {
    if (typeof value === 'string' && /^Missing(?:Google|Project):/.test(value)) {
        families.add(parseFontSelectionToken(value).family);
    } else if (Array.isArray(value)) {
        value.forEach((entry) => collectMissing(entry, families));
    } else if (value && typeof value === 'object') {
        Object.values(value).forEach((entry) => collectMissing(entry, families));
    }
    return families;
}

export const MissingFontsBanner: React.FC = () => {
    const bindings = useSceneStore((state) => state.bindings.byElement);
    const macros = useSceneStore((state) => state.macros.byId);
    const automation = useSceneStore((state) => state.automation.channels);
    const families = useMemo(
        () => [...collectMissing({ bindings, macros, automation })].sort(),
        [automation, bindings, macros]
    );
    if (!families.length) return null;
    return (
        <div role="status" className="border-b border-amber-700 bg-amber-950/80 px-4 py-2 text-xs text-amber-100">
            Missing fonts: {families.join(', ')}. Open Scene Settings → Fonts to reconnect, download, or replace them.
            Media export is disabled until every missing font is resolved.
        </div>
    );
};
