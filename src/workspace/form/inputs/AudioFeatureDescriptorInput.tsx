import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import type {
    AudioFeatureAnalysisProfileDescriptor,
    AudioFeatureDescriptor,
} from '@audio/features/audioFeatureTypes';

type DescriptorValue = AudioFeatureDescriptor[] | null;

type DescriptorSchema = {
    requiredFeatureKey?: string;
    autoFeatureLabel?: string;
    trackId?: string | string[] | null;
    profileValue?: string | null;
    profilePropertyKey?: string;
    glossaryTerms?: {
        featureDescriptor?: string;
        analysisProfile?: string;
    };
};

type FeatureOption = {
    key: string;
    label: string;
    category: string;
    channels: number;
    channelAliases?: string[] | null;
    calculatorId?: string;
    analysisProfileId?: string | null;
    format?: string;
};

type TrackFeatureState = {
    options: FeatureOption[];
    featureTracks: Record<string, FeatureOption>;
    analysisProfiles: Record<string, AudioFeatureAnalysisProfileDescriptor>;
    defaultProfileId: string | null;
    statusLabel: string;
    statusMessage?: string;
};

type DescriptorChangeMeta = {
    linkedUpdates?: Record<string, any>;
};

const CATEGORY_ORDER = ['Waveform', 'Spectrum', 'Loudness', 'Dynamics', 'Rhythm', 'Other'];

const clampSmoothing = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(64, Math.round(value)));
};

const normalizeTrackId = (trackId: DescriptorSchema['trackId']): string | null => {
    if (!trackId) return null;
    if (Array.isArray(trackId)) {
        return trackId.find((entry) => typeof entry === 'string' && entry.length > 0) ?? null;
    }
    return typeof trackId === 'string' && trackId.length > 0 ? trackId : null;
};

const categorizeFeature = (option: FeatureOption): string => {
    const base = option.category;
    if (base && base !== 'Other') return base;
    const label = option.label.toLowerCase();
    const key = option.key.toLowerCase();
    if (label.includes('wave') || key.includes('wave') || key.includes('osc')) return 'Waveform';
    if (label.includes('spect') || key.includes('spect')) return 'Spectrum';
    if (label.includes('loud') || label.includes('rms') || key.includes('db')) return 'Loudness';
    if (label.includes('dynamic') || key.includes('comp')) return 'Dynamics';
    if (label.includes('tempo') || key.includes('beat')) return 'Rhythm';
    return 'Other';
};

const sortCategories = (categories: Set<string>): string[] => {
    const list = Array.from(categories);
    list.sort((a, b) => {
        const aIndex = CATEGORY_ORDER.indexOf(a);
        const bIndex = CATEGORY_ORDER.indexOf(b);
        if (aIndex === -1 && bIndex === -1) {
            return a.localeCompare(b);
        }
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
    });
    return list;
};

const buildDescriptorKey = (descriptor: AudioFeatureDescriptor): string => {
    const channel = descriptor.channelIndex != null ? `c${descriptor.channelIndex}` : 'auto';
    return `${descriptor.featureKey}:${channel}`;
};

const areDescriptorsEqual = (
    a: DescriptorValue,
    b: DescriptorValue,
): boolean => {
    const normalize = (list: DescriptorValue): string[] => {
        if (!list || !list.length) return [];
        return list
            .map((descriptor) => {
                const channel = descriptor.channelIndex != null ? `c${descriptor.channelIndex}` : 'auto';
                const smoothing = descriptor.smoothing != null ? descriptor.smoothing : 0;
                const band = descriptor.bandIndex != null ? `b${descriptor.bandIndex}` : 'b*';
                const alias = descriptor.channelAlias ? `a${descriptor.channelAlias}` : 'a*';
                const calculator = descriptor.calculatorId ? `calc:${descriptor.calculatorId}` : '';
                return `${descriptor.featureKey}:${channel}:${band}:${alias}:${smoothing}:${calculator}`;
            })
            .sort();
    };
    const listA = normalize(a);
    const listB = normalize(b);
    if (listA.length !== listB.length) return false;
    for (let index = 0; index < listA.length; index += 1) {
        if (listA[index] !== listB[index]) return false;
    }
    return true;
};

const deriveRecommendedProfileId = (
    descriptors: AudioFeatureDescriptor[],
    featureTracks: Record<string, FeatureOption>,
): { suggestion: string | null; conflict: boolean } => {
    const required = new Set<string>();
    for (const descriptor of descriptors) {
        const option = featureTracks[descriptor.featureKey];
        if (!option?.analysisProfileId) continue;
        required.add(option.analysisProfileId);
        if (required.size > 1) {
            return { suggestion: null, conflict: true };
        }
    }
    const [only] = Array.from(required);
    return { suggestion: only ?? null, conflict: false };
};

const sortDescriptors = (
    descriptors: AudioFeatureDescriptor[],
    featureTracks: Record<string, FeatureOption>,
): AudioFeatureDescriptor[] => {
    const enriched = descriptors.map((descriptor) => {
        const option = featureTracks[descriptor.featureKey];
        return {
            descriptor,
            label: option?.label ?? descriptor.featureKey,
            channelOrder: descriptor.channelIndex ?? -1,
        };
    });
    enriched.sort((a, b) => {
        if (a.label === b.label) {
            return a.channelOrder - b.channelOrder;
        }
        return a.label.localeCompare(b.label);
    });
    return enriched.map((entry) => entry.descriptor);
};

const buildGlossaryTitle = (term: string | undefined, label: string): string | undefined => {
    if (!term) return undefined;
    return `${label}. See docs/audio-feature-bindings.md#${term}`;
};

const logSelectorEvent = (event: string, detail: Record<string, unknown>) => {
    if (typeof window === 'undefined') return;
    try {
        console.debug('[audio-feature-selector]', event, {
            ...detail,
            timestamp: Date.now(),
        });
    } catch {
        /* ignore */
    }
};

const sanitizeDescriptors = (
    value: DescriptorValue,
    featureTracks: Record<string, FeatureOption>,
    requiredFeatureKey?: string,
): AudioFeatureDescriptor[] => {
    const entries = Array.isArray(value) ? value : [];
    const seen = new Set<string>();
    const result: AudioFeatureDescriptor[] = [];
    for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        const featureKey = entry.featureKey;
        if (typeof featureKey !== 'string' || featureKey.length === 0) continue;
        const option = featureTracks[featureKey];
        if (!option) continue;
        const channelIndex = entry.channelIndex != null ? entry.channelIndex : null;
        const dedupeKey = `${featureKey}:${channelIndex ?? 'auto'}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const channelAlias = (() => {
            if (entry.channelAlias) return entry.channelAlias;
            if (channelIndex == null) return null;
            const aliases = option.channelAliases;
            if (Array.isArray(aliases) && aliases[channelIndex]) {
                return aliases[channelIndex] ?? null;
            }
            return `Channel ${channelIndex + 1}`;
        })();
        result.push({
            featureKey,
            calculatorId: entry.calculatorId ?? option.calculatorId ?? null,
            bandIndex: entry.bandIndex ?? null,
            channelIndex,
            channelAlias,
            smoothing: clampSmoothing(entry.smoothing ?? 0),
        });
    }
    if (requiredFeatureKey && featureTracks[requiredFeatureKey]) {
        const hasRequired = result.some((descriptor) => descriptor.featureKey === requiredFeatureKey);
        if (!hasRequired) {
            result.unshift({
                featureKey: requiredFeatureKey,
                calculatorId: featureTracks[requiredFeatureKey].calculatorId ?? null,
                bandIndex: null,
                channelIndex: null,
                channelAlias: null,
                smoothing: 0,
            });
        }
    }
    return sortDescriptors(result, featureTracks);
};

interface AudioFeatureDescriptorInputProps {
    id: string;
    value: DescriptorValue;
    schema: DescriptorSchema;
    disabled?: boolean;
    title?: string;
    onChange: (value: DescriptorValue | { value: DescriptorValue; meta?: DescriptorChangeMeta }) => void;
}

const AudioFeatureDescriptorInput: React.FC<AudioFeatureDescriptorInputProps> = ({
    id,
    value,
    schema,
    disabled = false,
    title,
    onChange,
}) => {
    const trackId = normalizeTrackId(schema?.trackId);
    const trackKey = trackId ?? '';

    const { options, featureTracks, analysisProfiles, defaultProfileId, statusLabel, statusMessage } = useTimelineStore(
        useCallback(
            (state): TrackFeatureState => {
                if (!trackId) {
                    return {
                        options: [],
                        featureTracks: {},
                        analysisProfiles: {},
                        defaultProfileId: null,
                        statusLabel: 'unbound',
                    };
                }
                const track = state.tracks[trackId];
                if (!track || track.type !== 'audio') {
                    return {
                        options: [],
                        featureTracks: {},
                        analysisProfiles: {},
                        defaultProfileId: null,
                        statusLabel: 'unavailable',
                    };
                }
                const sourceId = track.audioSourceId ?? track.id;
                const cache = state.audioFeatureCaches[sourceId];
                const status = state.audioFeatureCacheStatus[sourceId];
                const rawFeatureTracks = cache?.featureTracks ?? {};
                const profileMap = cache?.analysisProfiles ?? {};
                const defaultProfile = cache?.defaultAnalysisProfileId ?? null;
                const optionList: FeatureOption[] = [];
                const featureEntries: [string, FeatureOption][] = [];
                const categories = new Set<string>();
                for (const feature of Object.values(rawFeatureTracks)) {
                    if (!feature) continue;
                    const channels = Math.max(1, feature.channels || 1);
                    const label = String(
                        (feature.metadata as Record<string, unknown> | undefined)?.label ?? feature.key,
                    );
                    const aliasSource =
                        Array.isArray(feature.channelAliases) && feature.channelAliases.length
                            ? feature.channelAliases
                            : cache?.channelAliases ?? null;
                    const option: FeatureOption = {
                        key: feature.key,
                        label,
                        category: categorizeFeature({
                            key: feature.key,
                            label,
                            category: String((feature.metadata as Record<string, unknown> | undefined)?.category ?? ''),
                            channels,
                            channelAliases: aliasSource,
                            calculatorId: feature.calculatorId,
                            analysisProfileId: feature.analysisProfileId ?? null,
                            format: feature.format,
                        }),
                        channels,
                        channelAliases: aliasSource,
                        calculatorId: feature.calculatorId,
                        analysisProfileId: feature.analysisProfileId ?? null,
                        format: feature.format,
                    };
                    categories.add(option.category);
                    optionList.push(option);
                    featureEntries.push([feature.key, option]);
                }
                optionList.sort((a, b) => a.label.localeCompare(b.label));
                const featureMap = Object.fromEntries(featureEntries);
                return {
                    options: optionList,
                    featureTracks: featureMap,
                    analysisProfiles: profileMap,
                    defaultProfileId: defaultProfile,
                    statusLabel: status?.state ?? (cache ? 'ready' : 'idle'),
                    statusMessage: status?.message,
                };
            },
            [trackKey],
        ),
    );

    const sanitizedDescriptors = useMemo(
        () => sanitizeDescriptors(value, featureTracks, schema?.requiredFeatureKey),
        [value, featureTracks, schema?.requiredFeatureKey],
    );

    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [activeFeatureKey, setActiveFeatureKey] = useState<string | null>(schema?.requiredFeatureKey ?? null);

    useEffect(() => {
        if (activeFeatureKey && featureTracks[activeFeatureKey]) {
            return;
        }
        if (schema?.requiredFeatureKey && featureTracks[schema.requiredFeatureKey]) {
            setActiveFeatureKey(schema.requiredFeatureKey);
            return;
        }
        const firstSelected = sanitizedDescriptors.find((descriptor) => featureTracks[descriptor.featureKey]);
        if (firstSelected) {
            setActiveFeatureKey(firstSelected.featureKey);
            return;
        }
        setActiveFeatureKey(options[0]?.key ?? null);
    }, [activeFeatureKey, featureTracks, options, sanitizedDescriptors, schema?.requiredFeatureKey]);

    const emitDescriptors = useCallback(
        (
            descriptors: AudioFeatureDescriptor[] | null,
            options?: { recommendedProfile?: string | null },
        ) => {
            if (disabled) return;
            const nextValue = descriptors && descriptors.length ? sortDescriptors(descriptors, featureTracks) : null;
            const suggestedProfile = options?.recommendedProfile;
            if (
                suggestedProfile &&
                schema?.profilePropertyKey &&
                schema?.profileValue !== suggestedProfile
            ) {
                onChange({
                    value: nextValue,
                    meta: {
                        linkedUpdates: {
                            [schema.profilePropertyKey]: suggestedProfile,
                        },
                    },
                });
            } else {
                onChange(nextValue);
            }
        },
        [disabled, featureTracks, onChange, schema?.profilePropertyKey, schema?.profileValue],
    );

    useEffect(() => {
        if (disabled) return;
        if (!trackId || options.length === 0) {
            if (value && (Array.isArray(value) ? value.length > 0 : true)) {
                emitDescriptors(null);
            }
            return;
        }
        const normalized = sanitizedDescriptors;
        if (!areDescriptorsEqual(normalized, value)) {
            const { suggestion } = deriveRecommendedProfileId(normalized, featureTracks);
            emitDescriptors(normalized.length ? normalized : null, suggestion ? { recommendedProfile: suggestion } : undefined);
        }
    }, [disabled, emitDescriptors, featureTracks, options.length, sanitizedDescriptors, trackId, value]);

    const smoothingValue = useMemo(
        () => clampSmoothing(sanitizedDescriptors[0]?.smoothing ?? 0),
        [sanitizedDescriptors],
    );

    const descriptorsByFeature = useMemo(() => {
        const map = new Map<string, AudioFeatureDescriptor[]>();
        for (const descriptor of sanitizedDescriptors) {
            const list = map.get(descriptor.featureKey) ?? [];
            list.push(descriptor);
            map.set(descriptor.featureKey, list);
        }
        return map;
    }, [sanitizedDescriptors]);

    const channelSelections = useMemo(() => {
        if (!activeFeatureKey) return new Set<string>();
        const descriptorsForFeature = descriptorsByFeature.get(activeFeatureKey) ?? [];
        if (!descriptorsForFeature.length) return new Set<string>();
        const tokens = descriptorsForFeature.map((descriptor) =>
            descriptor.channelIndex != null ? String(descriptor.channelIndex) : 'auto',
        );
        return new Set(tokens);
    }, [activeFeatureKey, descriptorsByFeature]);

    const filteredOptions = useMemo(() => {
        if (activeCategory === 'all') return options;
        return options.filter((option) => option.category === activeCategory);
    }, [activeCategory, options]);

    const categories = useMemo(() => {
        const set = new Set<string>();
        options.forEach((option) => set.add(option.category));
        return ['all', ...sortCategories(set)];
    }, [options]);

    const { suggestion: recommendedProfile, conflict: profileConflict } = useMemo(
        () => deriveRecommendedProfileId(sanitizedDescriptors, featureTracks),
        [sanitizedDescriptors, featureTracks],
    );

    const currentProfile = schema?.profileValue ?? defaultProfileId ?? null;
    const profileMismatch = Boolean(
        recommendedProfile && currentProfile && recommendedProfile !== currentProfile,
    );
    const profileUnset = Boolean(recommendedProfile && !currentProfile);

    const disableInputs = disabled || !trackId || options.length === 0;

    const handleCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setActiveCategory(event.target.value);
    };

    const handleFeatureChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const nextKey = event.target.value || null;
        setActiveFeatureKey(nextKey);
        if (!nextKey || disableInputs) return;
        const existing = descriptorsByFeature.get(nextKey);
        if (existing && existing.length > 0) {
            return;
        }
        const option = featureTracks[nextKey];
        if (!option) return;
        const descriptor: AudioFeatureDescriptor = {
            featureKey: nextKey,
            calculatorId: option.calculatorId ?? null,
            bandIndex: null,
            channelIndex: null,
            channelAlias: null,
            smoothing: smoothingValue,
        };
        const next = [...sanitizedDescriptors, descriptor];
        const { suggestion } = deriveRecommendedProfileId(next, featureTracks);
        emitDescriptors(next, suggestion ? { recommendedProfile: suggestion } : undefined);
        logSelectorEvent('feature-add', { featureKey: nextKey, total: next.length });
    };

    const handleChannelToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
        const token = event.target.value;
        if (!activeFeatureKey || disableInputs) return;
        const option = featureTracks[activeFeatureKey];
        if (!option) return;
        const selections = new Set(channelSelections);
        const isAuto = token === 'auto';
        if (isAuto) {
            if (selections.has('auto')) {
                selections.delete('auto');
            } else {
                selections.clear();
                selections.add('auto');
            }
        } else {
            if (selections.has(token)) {
                selections.delete(token);
            } else {
                selections.delete('auto');
                selections.add(token);
            }
        }
        if (selections.size === 0) {
            if (schema?.requiredFeatureKey === activeFeatureKey) {
                selections.add('auto');
            } else {
                selections.add(token);
            }
        }
        const base = sanitizedDescriptors.filter((descriptor) => descriptor.featureKey !== activeFeatureKey);
        const template = descriptorsByFeature.get(activeFeatureKey)?.[0];
        const smoothing = template ? clampSmoothing(template.smoothing ?? smoothingValue) : smoothingValue;
        const nextFeatureDescriptors: AudioFeatureDescriptor[] = [];
        selections.forEach((selection) => {
            if (selection === 'auto') {
                nextFeatureDescriptors.push({
                    featureKey: activeFeatureKey,
                    calculatorId: option.calculatorId ?? null,
                    bandIndex: null,
                    channelIndex: null,
                    channelAlias: null,
                    smoothing,
                });
            } else {
                const channelIndex = Number(selection);
                const alias = option.channelAliases?.[channelIndex] ?? `Channel ${channelIndex + 1}`;
                nextFeatureDescriptors.push({
                    featureKey: activeFeatureKey,
                    calculatorId: option.calculatorId ?? null,
                    bandIndex: null,
                    channelIndex,
                    channelAlias: alias,
                    smoothing,
                });
            }
        });
        const next = [...base, ...nextFeatureDescriptors];
        const { suggestion } = deriveRecommendedProfileId(next, featureTracks);
        emitDescriptors(next, suggestion ? { recommendedProfile: suggestion } : undefined);
        logSelectorEvent('channel-toggle', {
            featureKey: activeFeatureKey,
            selections: Array.from(selections),
        });
    };

    const handleSmoothingChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const nextSmoothing = clampSmoothing(Number(event.target.value));
        const next = sanitizedDescriptors.map((descriptor) => ({
            ...descriptor,
            smoothing: nextSmoothing,
        }));
        const { suggestion } = deriveRecommendedProfileId(next, featureTracks);
        emitDescriptors(next, suggestion ? { recommendedProfile: suggestion } : undefined);
        logSelectorEvent('smoothing-change', { smoothing: nextSmoothing });
    };

    const handleRemoveDescriptor = (descriptor: AudioFeatureDescriptor) => {
        if (disableInputs) return;
        if (schema?.requiredFeatureKey === descriptor.featureKey) {
            const remaining = descriptorsByFeature.get(descriptor.featureKey) ?? [];
            if (remaining.length <= 1) {
                return;
            }
        }
        const next = sanitizedDescriptors.filter(
            (entry) => buildDescriptorKey(entry) !== buildDescriptorKey(descriptor),
        );
        const { suggestion } = deriveRecommendedProfileId(next, featureTracks);
        emitDescriptors(next, suggestion ? { recommendedProfile: suggestion } : undefined);
        logSelectorEvent('descriptor-remove', {
            featureKey: descriptor.featureKey,
            channel: descriptor.channelIndex ?? 'auto',
        });
    };

    const handleApplyRecommendation = () => {
        if (!recommendedProfile || !schema?.profilePropertyKey) return;
        emitDescriptors(sanitizedDescriptors, { recommendedProfile });
        logSelectorEvent('profile-apply', { profile: recommendedProfile });
    };

    const channelOptions = useMemo(() => {
        if (!activeFeatureKey) return [];
        const option = featureTracks[activeFeatureKey];
        if (!option) return [];
        const entries = [{ value: 'auto', label: 'Mix (auto)' }];
        for (let index = 0; index < option.channels; index += 1) {
            const alias = option.channelAliases?.[index];
            entries.push({
                value: String(index),
                label: alias && alias.trim().length > 0 ? alias : `Channel ${index + 1}`,
            });
        }
        return entries;
    }, [activeFeatureKey, featureTracks]);

    const descriptorChips = useMemo(() => {
        return sanitizedDescriptors.map((descriptor) => {
            const option = featureTracks[descriptor.featureKey];
            const featureLabel = option?.label ?? descriptor.featureKey;
            const channelLabel = descriptor.channelAlias
                ? descriptor.channelAlias
                : descriptor.channelIndex != null
                ? `Channel ${descriptor.channelIndex + 1}`
                : 'Mix';
            const removable =
                schema?.requiredFeatureKey === descriptor.featureKey
                    ? (descriptorsByFeature.get(descriptor.featureKey)?.length ?? 0) > 1
                    : true;
            return {
                key: buildDescriptorKey(descriptor),
                descriptor,
                label: `${featureLabel} – ${channelLabel}`,
                removable,
            };
        });
    }, [descriptorsByFeature, featureTracks, sanitizedDescriptors, schema?.requiredFeatureKey]);

    const featureTooltip = buildGlossaryTitle(schema?.glossaryTerms?.featureDescriptor, 'Feature descriptor');
    const profileTooltip = buildGlossaryTitle(schema?.glossaryTerms?.analysisProfile, 'Analysis profile');

    return (
        <div
            className="audio-feature-descriptor"
            title={title}
            style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor={`${id}-category`} title={featureTooltip} style={{ fontWeight: 600 }}>
                    Feature category
                </label>
                <select
                    id={`${id}-category`}
                    value={activeCategory}
                    onChange={handleCategoryChange}
                    disabled={disableInputs}
                >
                    {categories.map((category) => (
                        <option key={category} value={category}>
                            {category === 'all' ? 'All categories' : category}
                        </option>
                    ))}
                </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor={`${id}-feature`} title={featureTooltip} style={{ fontWeight: 600 }}>
                    Feature descriptor
                </label>
                <select
                    id={`${id}-feature`}
                    value={activeFeatureKey ?? ''}
                    onChange={handleFeatureChange}
                    disabled={disableInputs || filteredOptions.length === 0}
                >
                    {filteredOptions.length === 0 && <option value="">No analyzed features</option>}
                    {filteredOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                            {option.label}
                        </option>
                    ))}
                </select>
                {schema?.requiredFeatureKey && schema.autoFeatureLabel && (
                    <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
                        {schema.autoFeatureLabel}
                    </span>
                )}
            </div>

            {channelOptions.length > 0 && (
                <fieldset
                    style={{
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '4px',
                        padding: '8px',
                    }}
                >
                    <legend style={{ padding: '0 4px' }}>Channels</legend>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {channelOptions.map((option) => (
                            <label key={option.value} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                    type="checkbox"
                                    value={option.value}
                                    checked={channelSelections.has(option.value)}
                                    onChange={handleChannelToggle}
                                    disabled={disableInputs}
                                />
                                <span>{option.label}</span>
                            </label>
                        ))}
                    </div>
                </fieldset>
            )}

            <label htmlFor={`${id}-smoothing`} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span>Smoothing (frames): {smoothingValue}</span>
                <input
                    id={`${id}-smoothing`}
                    type="range"
                    min={0}
                    max={64}
                    step={1}
                    value={smoothingValue}
                    onChange={handleSmoothingChange}
                    disabled={disableInputs}
                />
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontWeight: 600 }}>Selected descriptors</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {descriptorChips.length === 0 && (
                        <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
                            No descriptors selected.
                        </span>
                    )}
                    {descriptorChips.map((chip) => (
                        <span
                            key={chip.key}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 8px',
                                borderRadius: '12px',
                                backgroundColor: 'rgba(148, 163, 184, 0.2)',
                                fontSize: '12px',
                            }}
                        >
                            {chip.label}
                            {chip.removable && (
                                <button
                                    type="button"
                                    onClick={() => handleRemoveDescriptor(chip.descriptor)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'inherit',
                                        cursor: 'pointer',
                                        padding: 0,
                                    }}
                                    aria-label={`Remove ${chip.label}`}
                                >
                                    ×
                                </button>
                            )}
                        </span>
                    ))}
                </div>
            </div>

            <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
                <strong>{`Status: ${statusLabel || 'idle'}`}</strong>
                {statusMessage ? ` – ${statusMessage}` : ''}
            </div>
            {!trackId && (
                <div style={{ fontSize: '12px', color: '#fbbf24' }}>
                    Select an audio track to configure feature options.
                </div>
            )}

            {(profileMismatch || profileUnset || profileConflict) && (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        padding: '8px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(251, 191, 36, 0.12)',
                        color: '#fbbf24',
                    }}
                    title={profileTooltip}
                >
                    {profileConflict && (
                        <span>
                            Selected features require different analysis profiles. Split them across elements or
                            regenerate caches with a unified profile.
                        </span>
                    )}
                    {!profileConflict && recommendedProfile && (
                        <span>
                            Features were analysed with profile <strong>{recommendedProfile}</strong>. Update the analysis
                            profile to avoid stale cache reads.
                        </span>
                    )}
                    {schema?.profilePropertyKey && recommendedProfile && (
                        <button
                            type="button"
                            onClick={handleApplyRecommendation}
                            style={{
                                alignSelf: 'flex-start',
                                backgroundColor: '#fbbf24',
                                color: '#1f2937',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                cursor: 'pointer',
                                fontSize: '12px',
                            }}
                        >
                            Use {recommendedProfile}
                        </button>
                    )}
                    <a
                        href="docs/audio-feature-bindings.md#analysis-profile"
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#facc15' }}
                    >
                        Analysis profile glossary
                    </a>
                </div>
            )}

            {analysisProfiles && Object.keys(analysisProfiles).length > 0 && (
                <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
                    Available profiles: {Object.keys(analysisProfiles).join(', ')}
                </div>
            )}
        </div>
    );
};

export default AudioFeatureDescriptorInput;
