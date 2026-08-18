const APP_OPEN_COUNT_STORAGE_KEY = 'mvmnt.app-open-count.v1';
const APP_OPEN_RECORDED_SESSION_KEY = 'mvmnt.app-open-recorded.v1';
const ANALYTICS_PROMPT_IMPRESSIONS_STORAGE_KEY = 'mvmnt.analytics-prompt-impressions.v1';
const ANALYTICS_PROMPT_RECORDED_SESSION_KEY = 'mvmnt.analytics-prompt-recorded.v1';
const ANALYTICS_PROMPT_HIDDEN_STORAGE_KEY = 'mvmnt.analytics-prompt-hidden.v1';
const ANALYTICS_PROMPT_DISMISSED_SESSION_KEY = 'mvmnt.analytics-prompt-dismissed.v1';

function readCount(key: string): number {
    try {
        const value = Number.parseInt(localStorage.getItem(key) ?? '0', 10);
        return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    } catch {
        return 0;
    }
}

export function getAppOpenCount(): number {
    return readCount(APP_OPEN_COUNT_STORAGE_KEY);
}

export function getNextAppOpenCount(): number {
    try {
        return sessionStorage.getItem(APP_OPEN_RECORDED_SESSION_KEY) ? getAppOpenCount() : getAppOpenCount() + 1;
    } catch {
        return getAppOpenCount();
    }
}

export function recordAppOpen(): number {
    try {
        if (sessionStorage.getItem(APP_OPEN_RECORDED_SESSION_KEY)) return getAppOpenCount();
        const count = getAppOpenCount() + 1;
        localStorage.setItem(APP_OPEN_COUNT_STORAGE_KEY, String(count));
        sessionStorage.setItem(APP_OPEN_RECORDED_SESSION_KEY, 'true');
        return count;
    } catch {
        return getAppOpenCount();
    }
}

export function getAnalyticsPromptImpressions(): number {
    return readCount(ANALYTICS_PROMPT_IMPRESSIONS_STORAGE_KEY);
}

export function getNextAnalyticsPromptImpression(): number {
    try {
        return sessionStorage.getItem(ANALYTICS_PROMPT_RECORDED_SESSION_KEY)
            ? getAnalyticsPromptImpressions()
            : getAnalyticsPromptImpressions() + 1;
    } catch {
        return getAnalyticsPromptImpressions();
    }
}

export function recordAnalyticsPromptImpression(): number {
    try {
        if (sessionStorage.getItem(ANALYTICS_PROMPT_RECORDED_SESSION_KEY)) return getAnalyticsPromptImpressions();
        const impressions = getAnalyticsPromptImpressions() + 1;
        localStorage.setItem(ANALYTICS_PROMPT_IMPRESSIONS_STORAGE_KEY, String(impressions));
        sessionStorage.setItem(ANALYTICS_PROMPT_RECORDED_SESSION_KEY, 'true');
        return impressions;
    } catch {
        return getAnalyticsPromptImpressions();
    }
}

export function isAnalyticsPromptHidden(): boolean {
    try {
        return localStorage.getItem(ANALYTICS_PROMPT_HIDDEN_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

export function hideAnalyticsPrompt(): void {
    try {
        localStorage.setItem(ANALYTICS_PROMPT_HIDDEN_STORAGE_KEY, 'true');
    } catch {
        // A request prompt must never block the application when browser storage is unavailable.
    }
}

export function isAnalyticsPromptDismissedForSession(): boolean {
    try {
        return sessionStorage.getItem(ANALYTICS_PROMPT_DISMISSED_SESSION_KEY) === 'true';
    } catch {
        return false;
    }
}

export function dismissAnalyticsPromptForSession(): void {
    try {
        sessionStorage.setItem(ANALYTICS_PROMPT_DISMISSED_SESSION_KEY, 'true');
    } catch {
        // A request prompt must never block the application when browser storage is unavailable.
    }
}
