Make the neccessary code changes in line with the following comments:

Text display element:

- Make the text renderobject compatible with rendering newlines.
- Make the longstring property styling more consistent with the rest of the application. The color of the text in the textbox should be light, and the background of the textbox should be dark.

Notes played tracker:

- Make use of the new multiline text render object
- Remove all current presets, and add a new preset which resets the format string to the default

Basic shapes:

- Change the color property to fill color and opacity to fill opacity
- Give the rectangle the same stroke properties as the rest of the basic shapes
- Move the "size" property group under "shape". Add a boolean property "star" that appears for polygons. When "star" is checked also add an inner radius property.
- Add a dash offset property.

Image:

- When an image is dragged in from the asset manager, have the image element width and height be created at the width and height of the image itself.
- Make the default fit mode cover.
- The "shadow" properties don't seem to be working. Fix this.

Progress display:

- The text alignment and letter spacing properties don't seem to do anything. Fix this.
- Add a "count down" boolean property which causes the text to count down rather than count up. When count down is on, instead of "current time/total time" just print "remaining time"

Text:

- Change letter spacing and stroke width to numeric inputs without maximum values.
- Currently, it seems the layout bounds of the text input do not take into account letter spacing. Fix this.

Time display:

- Change the background
