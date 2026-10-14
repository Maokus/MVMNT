import React from 'react';

import type { ColorPickerGesture } from './ColorPicker';
import { ColorField, normalizeColor } from './ColorField';

export { normalizeColor };

interface ColorInputProps {
    id: string;
    value: unknown;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: string, gesture?: ColorPickerGesture) => void;
}

const ColorInput: React.FC<ColorInputProps> = (props) => <ColorField {...props} includeAlpha={false} />;

export default ColorInput;
