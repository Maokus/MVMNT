const TONE_CLASSES = {
    blue: 'bg-[#0e639c]',
    emerald: 'bg-emerald-500',
} as const;

export function ProgressBar({
    value,
    label,
    tone = 'blue',
}: {
    value: number;
    label: string;
    tone?: keyof typeof TONE_CLASSES;
}) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    return (
        <div
            className="h-2 w-full overflow-hidden rounded bg-neutral-800"
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={clamped}
        >
            <div
                className={`h-full ${TONE_CLASSES[tone]} transition-[width] duration-150`}
                style={{ width: `${clamped}%` }}
            />
        </div>
    );
}
