/** Only an unmodified, vertical-dominant wheel gesture pans a curve's value axis. */
export function isValueRangeWheel(event: Pick<WheelEvent, 'ctrlKey' | 'metaKey' | 'deltaX' | 'deltaY'>): boolean {
    return !event.ctrlKey && !event.metaKey && event.deltaY !== 0 && Math.abs(event.deltaY) >= Math.abs(event.deltaX);
}
