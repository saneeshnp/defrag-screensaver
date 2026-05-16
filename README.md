# Defrag Screensaver

Remember staring at the screen for hours, watching little blocks shuffle from one place to another, hypnotized by the rhythm of it all? That was Defrag. The most mesmerizing utility Microsoft ever shipped, pretending to do something important so you could call it productivity.

This is a tiny web tribute to that screen. Pick your flavor of old Windows, hit Start, and let the clusters slide around like it's 1996 again. No drives are being defragmented. Nothing is actually optimizing. It just looks like it is, and honestly that was always the best part.

## Try it

Open `index.html` in any modern browser. Or visit the GitHub Pages site once it goes live.

## The vibes on offer

- **MS-DOS 6.22** for the purists. Pale blue background, white blocks, yellow flashes, the whole deal.
- **Windows 3.1** if you remember Program Manager fondly.
- **Windows 95 / 98** for the era of beige towers and the startup chime.
- **Windows XP** if you want the friendlier blue and red bar version that came later.

Pick a duration (5, 10, or 30 minutes), toggle the PC speaker beeps, and decide if you want it to take over your whole screen. Press Escape to come back to reality.

## How it pretends to work

A grid of clusters gets randomly scattered. One slot at the top picks a random used block from somewhere else on the disk, flashes `r` and `W` a few times like it's reading and writing, then settles into place. Occasionally a move takes a little longer, like it hit a stubborn file. Scattered cells flicker in the background, just for fun. Once the disk is "optimized" it gets lightly re-fragmented and starts over, so you can let it run as long as you want.

The Windows XP version is the same idea but with the horizontal colored bars instead of the cluster grid.

## Why does this exist

Because sometimes you want a moment of pixelated nostalgia. Because watching progress bars is a lost art. Because that one screen, more than any other, defined what a PC felt like in the 90s.

Also because GitHub Pages is free and hosting a screensaver in 2026 is funny.

## Hosting it yourself

It's three files. `index.html`, `styles.css`, `script.js`. Drop them on any static host. For GitHub Pages, push to a repo and enable Pages on the main branch. That's the whole deployment story.

## Notes

- Sound effects are squarewave beeps via WebAudio. If they sound a bit harsh, that's on purpose.
- The fonts are VT323 from Google Fonts, the closest free thing to the old VGA text font.
- All your settings (OS, duration, sound, fullscreen) get saved in localStorage so they stick around.

Now go watch some blocks move.
