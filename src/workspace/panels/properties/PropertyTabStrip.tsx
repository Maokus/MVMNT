import React from 'react';
import { PropertyTab } from '@core/types';

interface PropertyTabStripProps {
    tabs: PropertyTab[];
    activeTabId: string;
    onTabChange: (id: string) => void;
}

const PropertyTabStrip: React.FC<PropertyTabStripProps> = ({ tabs, activeTabId, onTabChange }) => {
    return (
        <div className="ae-tab-strip">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    className={`ae-tab${tab.id === activeTabId ? ' ae-tab--active' : ''}`}
                    onClick={() => onTabChange(tab.id)}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
};

export default PropertyTabStrip;
