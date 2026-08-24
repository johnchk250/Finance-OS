# Finance OS Windows patches

This is `flutter_inappwebview_windows` 0.6.0 under its original Apache-2.0
license. It is vendored so the Windows application can carry a narrowly scoped
precision-touchpad fix without changing the Android implementation.

## Native precision-touchpad scrolling

The published composition-mode host converts Flutter precision-touchpad pans
into WebView2 mouse-wheel messages. That path loses fractional movement and
causes Chromium's wheel smooth-scroll animation to lag behind the gesture.
This copy:

- sends each touchpad gesture to WebView2 as one continuous touch contact;
- forwards pixel-level pan updates until the gesture ends;
- lets WebView2 provide its native scrolling and inertia; and
- keeps mouse wheels on the separate wheel path, with fractional accumulation
  retained there as a fallback for high-resolution wheel hardware.

The approach follows upstream pull request 2786:
https://github.com/pichillilorenzo/flutter_inappwebview/pull/2786

## NuGet CLI bypass (CMake configure-time package download)

The upstream `windows/CMakeLists.txt` uses `find_program(NUGET nuget)` and
`add_custom_command` to download three NuGet packages at build time.
This requires the NuGet CLI to be installed and on `PATH`, which is not a
standard Flutter Windows prerequisite.

This copy replaces that block with a pure-CMake `file(DOWNLOAD)` +
`file(ARCHIVE_EXTRACT)` approach: NuGet packages are fetched directly from
`globalcdn.nuget.org` (they are ordinary ZIP archives) at **CMake configure
time**, cached in `build/windows/x64/packages/`, and never require `nuget.exe`.

This also resolves the spurious `CMake Warning (dev) CMP0175` produced by the
upstream `DEPENDS ${NUGET}` argument inside an `add_custom_command(TARGET …)`
call, which is not a supported keyword combination.
