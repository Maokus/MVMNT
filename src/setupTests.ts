// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/vitest';
import { setCanonicalPPQ } from '@core/timing/ppq';

// Canonical PPQ for tests: defaults to 960. Override with TEST_CANONICAL_PPQ to validate tick/beat conversions at other resolutions (e.g. 960).
(() => {
    const envVal = (import.meta as any).env?.TEST_CANONICAL_PPQ ?? process.env.TEST_CANONICAL_PPQ;
    const desired = envVal ? Number(envVal) : 960;
    if (Number.isFinite(desired) && desired > 0) {
        setCanonicalPPQ(desired);
    }
})();

if (typeof HTMLCanvasElement !== 'undefined') {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as any).getContext = function getContext(type: string, ...args: unknown[]) {
        if (type === '2d') {
            const stub = {
                canvas: this,
                measureText: () =>
                    ({
                        width: 0,
                        actualBoundingBoxAscent: 0,
                        actualBoundingBoxDescent: 0,
                        actualBoundingBoxLeft: 0,
                        actualBoundingBoxRight: 0,
                        fontBoundingBoxAscent: 0,
                        fontBoundingBoxDescent: 0,
                        emHeightAscent: 0,
                        emHeightDescent: 0,
                        hangingBaseline: 0,
                        alphabeticBaseline: 0,
                        ideographicBaseline: 0,
                    } as TextMetrics),
            } as unknown as CanvasRenderingContext2D;
            return stub;
        }
        return originalGetContext ? originalGetContext.call(this, type, ...args) : null;
    };
}
