import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe('onboarding preferences', () => {
    it('does not persist a view and only suppresses after an explicit choice', async () => {
        const { shouldShowWelcome, rememberOnboarding } = await import('../preferences');
        expect(shouldShowWelcome()).toBe(true);
        expect(localStorage.length).toBe(0);
        rememberOnboarding('dismissed');
        expect(shouldShowWelcome()).toBe(false);
    });
    it.each(['dismissed', 'started', 'completed'])('remembers %s across mounts', async (preference) => {
        localStorage.setItem('mvmnt_onboarding_v2', preference);
        const { shouldShowWelcome } = await import('../preferences');
        expect(shouldShowWelcome()).toBe(false);
    });
    it('falls back to session memory when reading and writing storage fail', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('Storage unavailable');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('Storage unavailable');
        });
        const { shouldShowWelcome, rememberOnboarding } = await import('../preferences');
        expect(shouldShowWelcome()).toBe(true);
        expect(() => rememberOnboarding('started')).not.toThrow();
        expect(shouldShowWelcome()).toBe(false);
    });
});
