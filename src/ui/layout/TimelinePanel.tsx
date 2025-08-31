import React from 'react';

interface TimelinePanelProps {
    visible?: boolean;
}

const placeholderRows = Array.from({ length: 8 }).map((_, i) => ({
    id: `row-${i + 1}`,
    name: `Layer ${i + 1}`
}));

const TimelinePanel: React.FC<TimelinePanelProps> = () => {
    return (
        <div className="timeline-panel" role="region" aria-label="Timeline panel">
            <div className="timeline-header">
                <h3 className="m-0 text-[13px] font-semibold text-neutral-300">🕒 Timeline</h3>
                <div className="timeline-ruler" aria-hidden="true">
                    {/* Simple tick marks placeholder */}
                    {Array.from({ length: 20 }).map((_, i) => (
                        <div key={i} className="tick">
                            <span className="label">{i}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="timeline-body">
                <div className="track-list">
                    {placeholderRows.map(row => (
                        <div key={row.id} className="timeline-row">
                            <div className="track-label" title={row.name}>{row.name}</div>
                            <div className="track-lane">
                                {/* Placeholder clips */}
                                <div className="clip" style={{ left: '5%', width: '18%' }} />
                                <div className="clip" style={{ left: '30%', width: '25%' }} />
                                <div className="clip" style={{ left: '65%', width: '20%' }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TimelinePanel;
