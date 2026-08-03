export function aggregateTransformDelta(
    next: number,
    neutral: number,
    previous: number | undefined,
    mode: 'add' | 'multiply'
): number {
    const baseline = previous ?? neutral;
    return mode === 'add' ? next - baseline : next / baseline;
}
