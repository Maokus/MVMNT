import { computeScaledTransform } from './scale';
import { ScaleComputationParams } from './types';

const globAnchorX = 0.5;
const globAnchorY = 0.5;
const expectedValues = { newScaleX: 1, newScaleY: 1, newOffsetX: 50, newOffsetY: 50 };

const EPS = 1e-6;

function isExpected(newValues: any) {
    return (
        Math.abs(newValues.newScaleX - expectedValues.newScaleX) < EPS &&
        Math.abs(newValues.newScaleY - expectedValues.newScaleY) < EPS &&
        Math.abs(newValues.newOffsetX - expectedValues.newOffsetX) < EPS &&
        Math.abs(newValues.newOffsetY - expectedValues.newOffsetY) < EPS
    );
}

// Common geometry (100x100 square aligned with axes)
const baseBounds = { x: 0, y: 0, width: 100, height: 100, anchorX: globAnchorX, anchorY: globAnchorY };
const geom = {
    widthVec: { x: 100, y: 0 },
    heightVec: { x: 0, y: 100 },
    corners: { TL: { x: 0, y: 0 }, TR: { x: 100, y: 0 }, BR: { x: 100, y: 100 }, BL: { x: 0, y: 100 } },
    mids: {
        MTop: { x: 50, y: 0 },
        MRight: { x: 100, y: 50 },
        MBottom: { x: 50, y: 100 },
        MLeft: { x: 0, y: 50 },
    },
    baseBounds,
};

function buildParams(overrides: Partial<ScaleComputationParams>): ScaleComputationParams {
    return {
        mode: 'scale-se',
        origScaleX: 1,
        origScaleY: 1,
        baseBounds,
        fixedWorldPoint: { x: 0, y: 0 },
        fixedLocalPoint: { x: 0, y: 0 },
        dragLocalPoint: { x: 0, y: 0 },
        geom,
        origRotation: 0,
        origSkewX: 0,
        origSkewY: 0,
        origAnchorX: globAnchorX,
        origAnchorY: globAnchorY,
        ...overrides,
    };
}

console.log(`Original object is a square (100x100) with anchor ${globAnchorX}, ${globAnchorY}\n`);

(() => {
    const params = buildParams({ mode: 'scale-se', fixedWorldPoint: { x: 0, y: 0 } });
    const res = computeScaledTransform(100, 100, params, false);
    // Offsets for centered anchor: offsetX = 50*scaleX, offsetY = -50*scaleY
    console.log(`Touched SE handle. New values:`);
    console.log(res);
    console.log(isExpected(res) ? '✅ Test passed' : '❌ Test failed!');
})();

(() => {
    const params = buildParams({ mode: 'scale-sw', fixedWorldPoint: { x: 100, y: 0 } });
    const res = computeScaledTransform(0, 100, params, false);
    // Offsets for centered anchor: offsetX = 50*scaleX, offsetY = -50*scaleY
    console.log(`Touched SW handle. New values:`);
    console.log(res);
    console.log(isExpected(res) ? '✅ Test passed' : '❌ Test failed!');
})();

(() => {
    const params = buildParams({ mode: 'scale-ne', fixedWorldPoint: { x: 0, y: 100 } });
    const res = computeScaledTransform(100, 0, params, false);
    // Offsets for centered anchor: offsetX = 50*scaleX, offsetY = -50*scaleY
    console.log(`Touched NE handle. New values:`);
    console.log(res);
    console.log(isExpected(res) ? '✅ Test passed' : '❌ Test failed!');
})();

(() => {
    const params = buildParams({ mode: 'scale-NW', fixedWorldPoint: { x: 0, y: 0 } });
    const res = computeScaledTransform(100, 100, params, false);
    // Offsets for centered anchor: offsetX = 50*scaleX, offsetY = -50*scaleY
    console.log(`Touched NW handle. New values:`);
    console.log(res);
    console.log(isExpected(res) ? '✅ Test passed' : '❌ Test failed!');
})();

(() => {
    const params = buildParams({ mode: 'scale-w', fixedWorldPoint: { x: 100, y: 50 } });
    const res = computeScaledTransform(0, 50, params, false);
    // Offsets for centered anchor: offsetX = 50*scaleX, offsetY = -50*scaleY
    console.log(`Touched W handle. New values:`);
    console.log(res);
    console.log(isExpected(res) ? '✅ Test passed' : '❌ Test failed!');
})();

(() => {
    const params = buildParams({ mode: 'scale-e', fixedWorldPoint: { x: 0, y: 50 } });
    const res = computeScaledTransform(100, 50, params, false);
    // Offsets for centered anchor: offsetX = 50*scaleX, offsetY = -50*scaleY
    console.log(`Touched E handle. New values:`);
    console.log(res);
    console.log(isExpected(res) ? '✅ Test passed' : '❌ Test failed!');
})();

(() => {
    const params = buildParams({ mode: 'scale-n', fixedWorldPoint: { x: 50, y: 100 } });
    const res = computeScaledTransform(50, 0, params, false);
    // Offsets for centered anchor: offsetX = 50*scaleX, offsetY = -50*scaleY
    console.log(`Touched N handle. New values:`);
    console.log(res);
    console.log(isExpected(res) ? '✅ Test passed' : '❌ Test failed!');
})();

(() => {
    const params = buildParams({ mode: 'scale-s', fixedWorldPoint: { x: 50, y: 0 } });
    const res = computeScaledTransform(50, 100, params, false);
    // Offsets for centered anchor: offsetX = 50*scaleX, offsetY = -50*scaleY
    console.log(`Touched S handle. New values:`);
    console.log(res);
    console.log(isExpected(res) ? '✅ Test passed' : '❌ Test failed!');
})();

// Summary marker so it's easy to spot completion when running directly.
console.log('Finished computeScaledTransform tests.');
