MVMNT for macOS

Drag the app from this disk image to Applications. This build is unsigned, so
macOS may block it when you first try to open it. If you downloaded MVMNT from
the official MVMNT GitHub release or Actions build, open Terminal and run the
command for the app you installed:

Stable release:
xattr -dr com.apple.quarantine "/Applications/MVMNT.app"

Nightly build:
xattr -dr com.apple.quarantine "/Applications/MVMNT Nightly.app"

Then open the app from Applications. Only remove quarantine from a build you
trust.
