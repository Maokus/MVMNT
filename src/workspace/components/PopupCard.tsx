import type { ReactNode } from 'react';

export function PopupCard({ title, children }: { title: ReactNode; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-3 rounded border border-amber-800 bg-neutral-950 p-4 text-[12px] text-neutral-100">
            <div className="text-[13px] font-semibold text-amber-100">{title}</div>
            {children}
        </div>
    );
}
