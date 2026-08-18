export type AnalyticsDialogueOutcome = 'enabled' | 'dismissed' | 'ignored';
export type AnalyticsDialogueNodeId = 'intro' | 'returning' | 'last_ask' | 'dismissed' | 'enabled';

export interface AnalyticsDialogueNode {
    title: string;
    body: string;
    transitions: Record<AnalyticsDialogueOutcome, AnalyticsDialogueNodeId | 'support'>;
}

/**
 * The home-screen analytics conversation. Edit the title/body strings here to tune its voice;
 * transitions describe what users see after enabling, dismissing, or ignoring a request.
 */
export const ANALYTICS_DIALOGUE_TREE: Record<AnalyticsDialogueNodeId, AnalyticsDialogueNode> = {
    intro: {
        title: 'cookie? 🥺',
        body: 'With your permission, I can learn which parts of MVMNT are useful and where it needs work.',
        transitions: { enabled: 'enabled', dismissed: 'dismissed', ignored: 'returning' },
    },
    returning: {
        title: 'hello again!!!!',
        body: 'Would you consider helping me understand which parts of MVMNT work well?',
        transitions: { enabled: 'enabled', dismissed: 'dismissed', ignored: 'last_ask' },
    },
    last_ask: {
        title: 'coookieeeeeeeeee',
        body: "pleaseeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\ni don't even use cookies lol",
        transitions: { enabled: 'enabled', dismissed: 'dismissed', ignored: 'last_ask' },
    },
    dismissed: {
        title: 'Pretty please??',
        body: 'It really helps me make MVMNT better!!! And you can change your mind any time on the privacy page. ',
        transitions: { enabled: 'enabled', dismissed: 'support', ignored: 'last_ask' },
    },
    enabled: {
        title: 'Thank you!',
        body: 'I really appreciate the help. You can change this any time on the privacy page.',
        transitions: { enabled: 'support', dismissed: 'support', ignored: 'support' },
    },
};

export function analyticsDialogueNodeForImpressions(impressions: number): AnalyticsDialogueNodeId {
    if (impressions <= 1) return 'intro';
    if (impressions === 2) return 'returning';
    return 'last_ask';
}

export const SUPPORT_NOTICE_COPY = {
    title: 'Support MVMNT',
    body: 'I develop and host MVMNT at my own expense. If you enjoy the app, please check out how you can support it!',
    frequentUserBody:
        "You've opened MVMNT {count} times. If you enjoy the app, please check out how you can support it!",
};
