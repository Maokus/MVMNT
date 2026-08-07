import { describe, expect, it } from 'vitest';
import { AggregateTransformSession } from '../aggregateTransformSession';

describe('AggregateTransformSession', () => {
    it('uses the prior value within a gesture and resets after finalization', () => {
        const session = new AggregateTransformSession();

        expect(session.update(10, 0, { id: 'drag' }, 'add')).toEqual({ delta: 10, resetInput: false });
        expect(session.update(25, 0, { id: 'drag' }, 'add')).toEqual({ delta: 15, resetInput: false });
        expect(session.update(25, 0, { id: 'drag', finalize: true }, 'add')).toEqual({
            delta: 0,
            resetInput: true,
        });
        expect(session.update(5, 0, { id: 'drag' }, 'add')).toEqual({ delta: 5, resetInput: false });
    });
});
