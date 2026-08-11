import React, { useMemo, useState } from 'react';
import {
    addGoogleFontFamilyToProject,
    fetchGoogleFontCatalog,
    hasGoogleFontsApiKey,
    readCachedGoogleFontCatalog,
} from '@fonts/google-fonts-client';
import { useSceneStore } from '@state/sceneStore';
import { collectMissingFontReferences } from '@state/scene/fonts';

export const MissingFontsBanner: React.FC = () => {
    const bindings = useSceneStore((state) => state.bindings.byElement);
    const macros = useSceneStore((state) => state.macros.byId);
    const automation = useSceneStore((state) => state.automation.channels);
    const [retrying, setRetrying] = useState(false);
    const [retryMessage, setRetryMessage] = useState<string | null>(null);
    const missing = useMemo(
        () => collectMissingFontReferences({ bindings, macros, automation }),
        [automation, bindings, macros]
    );
    const families = missing.map((reference) => reference.family);
    const googleFamilies = missing.filter((reference) => reference.source === 'google');

    const retryGoogleFonts = async () => {
        if (!googleFamilies.length || retrying) return;
        setRetrying(true);
        setRetryMessage(null);
        try {
            if (!hasGoogleFontsApiKey()) {
                throw new Error('Google Fonts requires an API key configured in this MVMNT build.');
            }
            const catalog = readCachedGoogleFontCatalog() ?? (await fetchGoogleFontCatalog());
            const catalogByFamily = new Map(catalog.items.map((family) => [family.family.toLocaleLowerCase(), family]));
            let completed = 0;
            const failures: string[] = [];
            for (const missingFamily of googleFamilies) {
                const family = catalogByFamily.get(missingFamily.family.toLocaleLowerCase());
                if (!family) {
                    failures.push(`${missingFamily.family} is unavailable`);
                    continue;
                }
                try {
                    await addGoogleFontFamilyToProject(family);
                    completed += 1;
                } catch (error) {
                    failures.push(`${missingFamily.family}: ${(error as Error).message}`);
                }
            }
            setRetryMessage(
                failures.length
                    ? `Downloaded ${completed}/${googleFamilies.length}. ${failures.join('; ')}`
                    : `Downloaded ${completed} ${completed === 1 ? 'font family' : 'font families'}.`
            );
        } catch (error) {
            setRetryMessage((error as Error).message);
        } finally {
            setRetrying(false);
        }
    };

    if (!families.length) return null;
    return (
        <div className="border-b border-amber-700 bg-amber-950/80 px-4 py-2 text-xs text-amber-100">
            <div role="status">
                Missing fonts: {families.join(', ')}. Open Scene Settings → Fonts to reconnect, download, or replace
                them. Media export is disabled until every missing font is resolved.
            </div>
            {googleFamilies.length > 0 && (
                <button
                    type="button"
                    disabled={retrying}
                    onClick={() => void retryGoogleFonts()}
                    className="mt-2 rounded border border-amber-500/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-900/60 disabled:cursor-wait disabled:opacity-60"
                >
                    {retrying
                        ? `Retrying ${googleFamilies.length} Google ${googleFamilies.length === 1 ? 'font' : 'fonts'}…`
                        : `Retry ${googleFamilies.length} Google ${googleFamilies.length === 1 ? 'font' : 'fonts'}`}
                </button>
            )}
            {retryMessage && <p className="mt-2 text-[11px] text-amber-200">{retryMessage}</p>}
        </div>
    );
};
