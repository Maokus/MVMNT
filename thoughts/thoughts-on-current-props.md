Make the neccessary code changes in line with the following comments:

# General comments

# MIDI Displays

## CC Monitor

## Chord estimate display

## Notes Played Tracker

Notes played tracker:

- Generalise the notes played tracker by adding a string input that allows users to format their own string, so the default will look something like

```
Num played notes: #playedNotes/#totalNotes (#percentNotes%)
Num played events: #playedEvents/#totalEvents (#percentEvents%)
```

- Use the stable layout box pattern for this element (make the text non-layout). Have the size of the layout box be estimated based on the input string.

Text display element:

Change the text content to a longstring prop.
