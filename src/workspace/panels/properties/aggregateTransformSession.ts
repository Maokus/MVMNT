import { aggregateTransformDelta } from './aggregateTransformDelta';

export interface AggregateTransformMergeSession {
    id: string;
    finalize?: boolean;
}

/** Stateful, UI-independent accumulator for multi-node transform gestures. */
export class AggregateTransformSession {
    private readonly values = new Map<string, number>();

    update(
        next: number,
        neutral: number,
        session: AggregateTransformMergeSession | undefined,
        mode: 'add' | 'multiply'
    ) {
        const previous = session ? (this.values.get(session.id) ?? neutral) : neutral;
        if (session?.finalize) this.values.delete(session.id);
        else if (session) this.values.set(session.id, next);

        return {
            delta: aggregateTransformDelta(next, neutral, previous, mode),
            resetInput: !session || Boolean(session.finalize),
        };
    }
}
