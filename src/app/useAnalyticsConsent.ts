import { useSyncExternalStore } from 'react';
import { getAnalyticsConsent, subscribeToAnalyticsConsent } from './analytics';

export function useAnalyticsConsent() {
    return useSyncExternalStore(subscribeToAnalyticsConsent, getAnalyticsConsent, () => 'unknown' as const);
}
