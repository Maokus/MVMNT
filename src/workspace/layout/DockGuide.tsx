import React from 'react';
import type { DockZone, GuideRect } from './dockZone';

const CELL = 40;
const GAP = 4;

interface ZoneCellProps {
    zone: DockZone;
    active: boolean;
    arrow: string;
    label: string;
}

const ZoneCell: React.FC<ZoneCellProps> = ({ zone, active, arrow, label }) => (
    <div
        data-dock-guide-zone={zone}
        data-active={active ? 'true' : undefined}
        className={`flex items-center justify-center rounded border text-[16px] leading-none ${
            active ? 'border-white/80 text-white' : 'border-neutral-600/70 text-neutral-400'
        }`}
        style={{
            width: CELL,
            height: CELL,
            backgroundColor: active ? 'rgba(55,148,255,0.75)' : 'rgba(24,24,27,0.75)',
        }}
        title={label}
    >
        {arrow}
    </div>
);

interface DockGuideProps {
    /** The centre column the compass is anchored to. */
    centerRect: GuideRect;
    /** Zone the pointer is currently over, highlighted in the guide. */
    zone: DockZone;
}

/**
 * Roblox-style dock compass: five zones pinned to the centre of the workspace while a
 * panel tab is dragged, with the zone the pointer is over lit up. Purely an indicator —
 * the exact landing area is drawn separately by the drop marker.
 */
export const DockGuide: React.FC<DockGuideProps> = ({ centerRect, zone }) => {
    const size = CELL * 3 + GAP * 2;
    const left = centerRect.left + centerRect.width / 2 - size / 2;
    const top = centerRect.top + centerRect.height / 2 - size / 2;
    return (
        <div data-dock-guide="true" className="pointer-events-none fixed z-[1085]" style={{ left, top }} aria-hidden>
            <div className="grid" style={{ gridTemplateColumns: `repeat(3, ${CELL}px)`, gap: GAP }}>
                <div />
                <ZoneCell zone="top" active={zone === 'top'} arrow="↑" label="Dock top" />
                <div />
                <ZoneCell zone="left" active={zone === 'left'} arrow="←" label="Dock left" />
                <ZoneCell zone="center" active={zone === 'center'} arrow="+" label="Merge as tab" />
                <ZoneCell zone="right" active={zone === 'right'} arrow="→" label="Dock right" />
                <div />
                <ZoneCell zone="bottom" active={zone === 'bottom'} arrow="↓" label="Dock bottom" />
                <div />
            </div>
        </div>
    );
};
