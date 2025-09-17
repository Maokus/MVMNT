/* Phase 2 guardrails: forbid direct doc writes and encourage action-based mutations */
module.exports = {
    root: true,
    env: { browser: true, es2021: true, node: true },
    parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    ignorePatterns: ['build/', 'dist/', 'node_modules/'],
    rules: {
        'no-restricted-syntax': [
            'error',
            {
                selector: "AssignmentExpression[left.property.name='doc']",
                message: 'Do not assign to doc; use commit via actions.',
            },
            {
                selector: "AssignmentExpression[left.object.property.name='doc']",
                message: 'Do not mutate doc.*; use commit via actions.',
            },
        ],
        'no-restricted-imports': [
            'error',
            {
                patterns: [
                    {
                        group: ['**/state/document/documentStore'],
                        message: 'Import document actions instead of the raw store in UI code.',
                    },
                ],
            },
        ],
    },
};
