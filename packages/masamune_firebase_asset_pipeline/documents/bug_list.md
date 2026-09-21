# generate_short_video Issues

[x] Image motion stops midway. For a 10-second scene, pan and zoom animations must keep moving for the full 10 seconds.
  - The second image remained still for about 5 seconds before moving. Keep the animation moving throughout the scene.
  - Cause: When AI-generated images were not 1920x1080, zoompan coordinate calculations went out of bounds and motion was clamped.
  - Fix 1: Resize images to exactly 1920x1080 with scale+crop filters before applying zoompan.
  - Fix 2: Increase the pan range to 15–30% of the screen width (previously 8–18%) to make motion more visible.
[x] Images have margins above and below. Keep margins outside the visible frame while panning or zooming.
[x] The second image does not animate. Always animate images when using them.
  - Increase the pan range to 8–18% of the screen width (previously 15–35 pixels; now 154–346 pixels).
[x] Images turn into a green screen.
  - Cause: fluent-ffmpeg did not process the filter array correctly.
  - Fix: Replace `.videoFilters([scaleFilter, effect])` with `.videoFilters(combinedFilter)` (combine filters into one string).
