import React from 'react';
import type { DockZone, GuideRect } from './dockZone';

const ZONE_LABELS: Record<DockZone, string> = {
    top: 'Dock top',
    bottom: 'Dock bottom',
    left: 'Dock left',
    right: 'Dock right',
    center: 'Merge as tab',
};

interface DockGuideProps {
    centerRect: GuideRect;
    zone: DockZone;
}

/** Names the destination zone above the pointer; the blue drop overlay shows where it lands. */
export const DockGuide: React.FC<DockGuideProps> = ({ centerRect, zone }) => (
    <div
        data-dock-guide="true"
        data-dock-guide-zone={zone}
        className="pointer-events-none fixed z-[1085] rounded px-2 py-1 text-[11px] font-semibold whitespace-nowrap"
        style={{
            left: centerRect.left + centerRect.width / 2,
            top: centerRect.top + centerRect.height / 2,
            transform: 'translate(-50%, calc(-100% - 24px))',
            backgroundColor: '#0e639c',
            color: '#ffffff',
        }}
        aria-hidden
    >
        {ZONE_LABELS[zone]}
    </div>
);
