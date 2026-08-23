# Product demo media

Drop a looping vertical (or 16:9) workspace recording here as:

`demo-preview.mp4`

The Reel Creator loads `/media/demo-preview.mp4` automatically during **Solution** and **Result** split-screen segments. If the file is missing, an animated 62-language workspace UI layer is used as fallback product proof.

## Studio hook b-roll (35s reels)

Optional bundled vertical hook footage:

`hook-broll.mp4`

Studio checks this file **before** Pexels. Use 9:16 portrait MP4 (~10s+). If missing, the generate API fetches Pexels portrait clips when `PEXELS_API_KEY` is set.
