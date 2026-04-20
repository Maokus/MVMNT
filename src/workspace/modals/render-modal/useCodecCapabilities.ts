import { useState, useEffect, useCallback } from 'react';
// @ts-ignore – mediabunny lacks type declarations
import { getEncodableVideoCodecs, getEncodableAudioCodecs } from 'mediabunny';
import type { VideoContainer } from './types';

// Canonical priority order per container; used for both auto-selection and container-change defaults.
export const VIDEO_CODEC_PRIORITY: Record<VideoContainer, string[]> = {
    webm: ['vp9', 'av1', 'h264', 'avc'],
    mp4: ['h264', 'avc', 'hevc', 'av1', 'vp9'],
};

export const AUDIO_CODEC_PRIORITY: Record<VideoContainer, string[]> = {
    webm: ['opus', 'vorbis', 'flac', 'pcm-s16', 'mp3'],
    mp4: ['aac', 'mp3', 'pcm-s16', 'opus', 'vorbis', 'flac'],
};

export interface CodecCapabilities {
    videoCodecs: string[];
    audioCodecs: string[];
    capLoaded: boolean;
    getPreferredVideoCodec: (container: VideoContainer) => string;
    getPreferredAudioCodec: (container: VideoContainer) => string;
}

export function useCodecCapabilities(): CodecCapabilities {
    const [videoCodecs, setVideoCodecs] = useState<string[]>([]);
    const [audioCodecs, setAudioCodecs] = useState<string[]>(['pcm-s16', 'mp3']);
    const [capLoaded, setCapLoaded] = useState(false);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const vcs = await (getEncodableVideoCodecs?.() || []);
                if (mounted && Array.isArray(vcs)) {
                    const mapped = vcs.map((c: string) => (c === 'avc' ? 'h264' : c));
                    if (!mapped.includes('h264') && vcs.includes('avc')) mapped.unshift('h264');
                    setVideoCodecs(mapped);
                }
            } catch { /* ignore */ }
            try {
                const acs = await (getEncodableAudioCodecs?.() || []);
                if (mounted) {
                    const normalizeCodec = (codec: unknown): string | null => {
                        if (typeof codec !== 'string') return null;
                        const id = codec.toLowerCase();
                        if (id === 'mp4a.40.2' || id === 'audio/aac' || id === 'aac-lc') return 'aac';
                        return codec;
                    };
                    const preferOrder = ['aac', 'pcm-s16', 'mp3', 'opus', 'vorbis', 'flac'];
                    const discovered = Array.isArray(acs)
                        ? acs.map(normalizeCodec).filter((c): c is string => Boolean(c))
                        : [];
                    const merged = Array.from(new Set(['aac', 'pcm-s16', 'mp3', ...discovered]));
                    const ordered = [
                        ...preferOrder.filter((c) => merged.includes(c)),
                        ...merged.filter((c) => !preferOrder.includes(c)),
                    ];
                    setAudioCodecs(ordered);
                }
            } catch {
                if (mounted) setAudioCodecs(['pcm-s16', 'mp3']);
            }
            if (mounted) setCapLoaded(true);
        })();
        return () => { mounted = false; };
    }, []);

    const getPreferredVideoCodec = useCallback((container: VideoContainer): string => {
        const priority = VIDEO_CODEC_PRIORITY[container];
        return priority.find((c) => videoCodecs.includes(c)) ?? videoCodecs[0] ?? (container === 'webm' ? 'vp9' : 'h264');
    }, [videoCodecs]);

    const getPreferredAudioCodec = useCallback((container: VideoContainer): string => {
        const priority = AUDIO_CODEC_PRIORITY[container];
        return priority.find((c) => audioCodecs.includes(c)) ?? audioCodecs[0] ?? (container === 'webm' ? 'opus' : 'aac');
    }, [audioCodecs]);

    return { videoCodecs, audioCodecs, capLoaded, getPreferredVideoCodec, getPreferredAudioCodec };
}
