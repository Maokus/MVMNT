export function LoadingSpinner({ size = 44 }: { size?: number }) {
    const dimension = { width: size, height: size };
    return (
        <span className="relative flex items-center justify-center" style={dimension} aria-hidden="true">
            <span className="absolute inset-0 animate-ping rounded-full bg-neutral-500/20" />
            <span className="relative h-full w-full animate-spin rounded-full border-[3px] border-neutral-400/60 border-t-transparent" />
        </span>
    );
}
