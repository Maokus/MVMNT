import React from 'react';

import type { ColorPickerGesture } from './ColorPicker';
import { ColorField } from './ColorField';

interface ColorAlphaInputProps {
    id: string;
    value: unknown;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: string, gesture?: ColorPickerGesture) => void;
}

const ColorAlphaInput: React.FC<ColorAlphaInputProps> = (props) => <ColorField {...props} includeAlpha />;

export default ColorAlphaInput;
