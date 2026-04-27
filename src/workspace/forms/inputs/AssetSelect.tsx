import React, { useCallback } from 'react';
import { useVisualAssetRegistryStore } from '@state/visualAssetRegistryStore';

interface Props {
    id: string;
    value: string | null;
    schema: {
        allowedAssetTypes?: Array<'image' | 'gif' | 'sparrow'>;
    };
    disabled?: boolean;
    title?: string;
    onChange: (value: string | null) => void;
}

const AssetSelect: React.FC<Props> = ({ id, value, schema, disabled, title, onChange }) => {
    const allowedTypes = schema?.allowedAssetTypes;
    const allowedSet = allowedTypes?.length ? new Set(allowedTypes) : null;

    const { assets, assetsOrder } = useVisualAssetRegistryStore(
        useCallback(
            (state) => ({ assets: state.assets, assetsOrder: state.assetsOrder }),
            []
        )
    );

    const filtered = assetsOrder
        .map((id) => assets[id])
        .filter((entry) => entry && (!allowedSet || allowedSet.has(entry.type)));

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        onChange(e.target.value || null);
    };

    return (
        <select
            id={id}
            disabled={disabled}
            title={title}
            value={typeof value === 'string' ? value : ''}
            onChange={handleChange}
        >
            <option value="">Select Image…</option>
            {filtered.map((entry) => (
                <option key={entry.id} value={entry.id}>
                    {entry.type === 'gif' ? `GIF · ${entry.name}` : entry.type === 'sparrow' ? `Sparrow · ${entry.name}` : entry.name}
                </option>
            ))}
        </select>
    );
};

export default AssetSelect;
