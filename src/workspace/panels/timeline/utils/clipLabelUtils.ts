import type { TimeSignature } from '@core/timing/meter';
import { formatTickAsBBT } from '@core/timing/time-domain';

export function formatClipStartLabel(tick: number, ticksPerQuarter: number, meter: TimeSignature): string {
    const position =
        tick < 0
            ? `-${formatTickAsBBT(Math.abs(tick), ticksPerQuarter, meter)}`
            : formatTickAsBBT(tick, ticksPerQuarter, meter);
    return `Start ${position}`;
}
