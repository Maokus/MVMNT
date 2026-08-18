import type { AnalyticsExceptionReport, AnalyticsStackFrame } from './contracts';

const deniedPropertyPattern =
    /(email|username|name|filename|file_name|path|url|href|referrer|query|content|password|token|secret)/i;
const urlPropertyNames = new Set([
    '$current_url',
    '$host',
    '$pathname',
    '$referrer',
    '$referring_domain',
    '$initial_current_url',
    '$initial_referrer',
    '$initial_referring_domain',
    '$gclid',
    '$dclid',
    '$gad_source',
    '$gclsrc',
    '$wbraid',
    '$gbraid',
    '$fbclid',
    '$msclkid',
    '$twclid',
    '$la_fat_id',
    '$mc_cid',
    '$igshid',
    '$ttclid',
]);

export function redactAnalyticsString(value: string): string {
    return value
        .replace(/[A-Z]:\\Users\\[^\\\s]+/gi, 'C:\\Users\\[redacted]')
        .replace(/\/Users\/[^/\s]+/g, '/Users/[redacted]')
        .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
        .replace(/([?&](?:token|key|secret|password)=)[^&\s]+/gi, '$1[redacted]');
}

export function sanitizeAnalyticsValue(value: unknown): unknown {
    if (typeof value === 'string') return redactAnalyticsString(value);
    if (Array.isArray(value)) return value.map(sanitizeAnalyticsValue);
    if (value && typeof value === 'object') return sanitizeAnalyticsObject(value as Record<string, unknown>);
    return value;
}

export function sanitizeAnalyticsObject(value: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, property] of Object.entries(value)) {
        if (urlPropertyNames.has(key) || deniedPropertyPattern.test(key)) continue;
        sanitized[key] = sanitizeAnalyticsValue(property);
    }
    return sanitized;
}

function stackFrames(stack: unknown): AnalyticsStackFrame[] {
    if (typeof stack !== 'string') return [];
    return stack
        .split('\n')
        .slice(1, 31)
        .reduce<AnalyticsStackFrame[]>((frames, line) => {
            const match = line.trim().match(/^at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
            if (!match) return frames;
            frames.push({
                ...(match[1] ? { function: redactAnalyticsString(match[1]) } : {}),
                filename: redactAnalyticsString(match[2]).replace(/\?.*$/, ''),
                lineno: Number(match[3]),
                colno: Number(match[4]),
            });
            return frames;
        }, []);
}

export function createAnalyticsExceptionReport(
    value: unknown,
    mechanism: AnalyticsExceptionReport['mechanism']
): AnalyticsExceptionReport {
    const error = value instanceof Error ? value : null;
    return {
        type: error?.name ? redactAnalyticsString(error.name) : 'Error',
        level: mechanism === 'onerror' ? 'error' : 'fatal',
        fatal: mechanism === 'onunhandledrejection',
        mechanism,
        frames: stackFrames(error?.stack),
    };
}
