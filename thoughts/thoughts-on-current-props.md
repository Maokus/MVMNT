# General comments

# Audio elements

- The channel inputs on audio locked oscilloscope and audio waveform don't seem to do anything. Fix this.

## Audio Locked Oscilloscope

- Blend mode sounds like a general blend mode, but only controls the blend mode of the main display. Fix this by renaming the property to "primary blend mode" and positioning it next to primary color and primary opacity.

## Audio Volume Meter

## Audio Spectrum

## Audio Waveform

- The secondary channel does not seem to work. Regardless of what channel I choose, there is no second line that shows up. Fix this.
- Blend mode appears in the background property group even though it changes the blendmode of the line. Fix this by adding an appropriately named blend mode property to each of primary, secondary.
- Add width and height properties.

# MIDI Displays

## CC Monitor

## Chord estimate display
