// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/vitest';
import { setCanonicalPPQ } from '@core/timing/ppq';

// Canonical PPQ for tests: defaults to 480. Override with TEST_CANONICAL_PPQ to validate tick/beat conversions at other resolutions (e.g. 960).
(() => {
    const envVal = (import.meta as any).env?.TEST_CANONICAL_PPQ ?? process.env.TEST_CANONICAL_PPQ;
    const desired = envVal ? Number(envVal) : 480;
    if (Number.isFinite(desired) && desired > 0) {
        setCanonicalPPQ(desired);
    }
})();
