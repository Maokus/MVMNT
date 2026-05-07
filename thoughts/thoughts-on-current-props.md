# General comments

- Stop using the "appearance" tab just to hold generic properties like "color" and "opacity". It's confusing. In general, scene elements have multiple complex components, and it makes more sense for the properties for a component's appearance to appear near to the properties of the component itself.
- Have all but the least important property groups default to being open.

# Audio elements

- Make the placement of properties within tabs more consistent.
- Currently, when no audio track is selected, the elements still appear as if the previously selected audio track was selected. Fix this.
- Make all the render objects inside the audio elements not included in layout bounds calculation except for a layout rectangle in order to improve layout stability.

## Audio Locked Oscilloscope

- Its not clear what a channel is or what you're supposed to enter in.

## Audio Volume Meter

- Same. What is channel?

## Audio Spectrum

- maximum　value doesn't do anything higher than 0
- when thickness is high, the line can mess with the layout bounds.
- in appearence, color and opacity appear, whereas in audio locked oscilloscope they don't.
- color and opacity are quite general maybe say "primary color" and "primary opacity".

## Audio Waveform

- secondary color, secondary opacity, background color, background opacity are in content
- Secondary channel doesn't seem to appear at all
- Changing primary channel doesn't do anything
- Linewidth should have a minimum of 0

# MIDI Displays

## CC Monitor

- Make this element use the stable layout rectangle pattern.

## Chord estimate display

- Add reasonable min and max on the property for future window
- Make this element use the stable layout rectangle pattern
- The text alignment control seems to cause the text to push out of the background.
