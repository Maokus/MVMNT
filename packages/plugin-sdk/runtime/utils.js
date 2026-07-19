export function midiNoteToName(note) {
  if (!Number.isFinite(note)) return 'C-1';
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const value = Math.max(0, Math.min(127, Math.round(note)));
  return `${names[value % 12]}${Math.floor(value / 12) - 1}`;
}
export const ensureEightDigitHex = (color) => {
  const normalized = color.startsWith('#') ? color : `#${color}`;
  return normalized.length === 7 ? `${normalized}FF` : normalized;
};
