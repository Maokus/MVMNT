# Scene Element Rotation Properties

This table lists configurable properties in `src/core/scene/elements`,
`src/pluginexamples`, and `src/plugins` whose values are rotation or angle values
denominated in degrees.

| Source | Element | Property | Label | Unit | Default | Range / step | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `src/core/scene/elements/base.ts` | All `SceneElement` subclasses | `elementRotation` | `Rotation (°)` | degrees | `0` | step `1` | Rotates the whole element container. Available on every first-party element and plugin element that extends `SceneElement`. |
| `src/core/scene/elements/misc/basic-shapes.ts` | Basic Shapes | `startAngle` | `Start Angle (°)` | degrees | `0` | min `0`, max `360`, step `1` | Arc start angle. Visible when `shapeType` is `circle`. |
| `src/core/scene/elements/misc/basic-shapes.ts` | Basic Shapes | `endAngle` | `End Angle (°)` | degrees | `360` | min `0`, max `360`, step `1` | Arc end angle. Visible when `shapeType` is `circle`. |
| `src/pluginexamples/patternspack1/checkers-pattern.ts` | Checkers Pattern | `motionAngle` | `Motion Angle (deg)` | degrees | `0` | min `0`, max `360`, step `1` | Controls pattern pan direction. `0` means right; `90` means down. |
| `src/pluginexamples/midipack1/circular-piano-roll.ts` | Circular Piano Roll | `startAngle` | `Start Angle (°)` | degrees | `0` | min `0`, max `360`, step `1` | Start angle for the circular piano roll span. |
| `src/pluginexamples/midipack1/circular-piano-roll.ts` | Circular Piano Roll | `endAngle` | `End Angle (°)` | degrees | `360` | min `0`, max `360`, step `1` | End angle for the circular piano roll span. |
| `src/plugins/pixelperfect/ditherator.ts` | Ditherator | `texRotate` | `Rotate` | degrees | `0` | min `-180`, max `180`, step `0.1` | Rotates texture UV coordinates around the grid centre. |

## Excluded Properties

The following properties were intentionally excluded because they are not
rotation values denominated in degrees:

- `anchorX` and `anchorY`: pivot fractions, not angles.
- `elementSkewX` and `elementSkewY`: angular shear controls, but not rotation.
- `anticlockwise`: arc direction boolean, not an angle.
- `orientation`: layout option, not an angle.
- `lineLength`: length in pixels, not an angle.
- `radius`, `innerRadius`, `cornerRadius`, `rippleRadius`, and `bloomRadius`:
  distances or sizes, not angular values.

Several renderers and note animations also assign internal rotations directly
to render objects. Those are implementation details rather than configurable
properties, so they are not included in the table.
