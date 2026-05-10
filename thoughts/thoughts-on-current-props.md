Make the neccessary code changes in line with the following comments:

Notes played tracker:

- Generalise the notes played tracker by adding a string input that allows users to format their own string, so the default will look something like

```
Num played notes: #playedNotes/#totalNotes (#percentNotes%)
Num played events: #playedEvents/#totalEvents (#percentEvents%)
```

- Use the stable layout box pattern for this element (make the text non-layout). Have the size of the layout box be estimated based on the input string.
- Ensure the background container logic also uses this intelligently computer bounds.

Text display element:

- Change the text content to a longstring prop.

Almamlike piano roll:

- Rename to Vidilike piano roll

Background:

- Remove border property group

Notes playing display:

- Currently, there are two issues with the notes playing display. Firstly, the layout bounds are quite unstable, so use a stable layout rectangle. Secondly, the element is not very flexible. Implement two alternate display modes "grid" and "letters".
- The "grid" display has a rectangle with a letter name for each note, in rows of 12. When the corresponding note is played, that rectangle appears.
- The "letters" display has 12 text elements spaced out. When notes are played (at any octave) the corresponding letter appears.
- Make "letters" the default.
