const KEY = 'mvmnt_onboarding_v2';

type OnboardingPreference = 'dismissed' | 'started' | 'completed';
let sessionPreference: OnboardingPreference | undefined;

export function shouldShowWelcome(): boolean {
    if (sessionPreference) return false;
    try {
        const preference = localStorage.getItem(KEY);
        return !(
            preference === 'dismissed' ||
            preference === 'started' ||
            preference === 'completed' ||
            localStorage.getItem('mvmnt_onboarded_v1')
        );
    } catch {
        return true;
    }
}

export function rememberOnboarding(preference: OnboardingPreference): void {
    try {
        localStorage.setItem(KEY, preference);
    } catch {
        // Remember the choice for this session when storage is unavailable.
        sessionPreference = preference;
    }
}
