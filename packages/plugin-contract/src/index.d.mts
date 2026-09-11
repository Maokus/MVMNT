export const PLUGIN_ID_PATTERN: RegExp;
export function isValidPluginId(value: unknown): value is string;
export function targetsSdkMajor(value: unknown, major: number): boolean;
export function targetsSdk2(value: unknown): boolean;
