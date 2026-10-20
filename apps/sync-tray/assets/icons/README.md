# Tray icon assets

`source/` contains byte-for-byte copies of the eleven supplied PNGs. They remain
1254×1254 with their original black backgrounds so every generated asset can be
traced back to the source artwork.

`tools/build.ps1` produces the files in `generated/` with this fixed source
rectangle and rounded mask:

- Source rectangle: `(317, 306, 619, 627)`
- Corner radius: `176 px` in the source image
- Output: `160×160`, 32-bit PNG with a transparent background

The crop removes the black canvas and the rounded mask follows the icon body.
The artwork itself is not repainted or regenerated. Only the generated 160 px
PNGs are embedded in `InceptSync.exe`; the source PNGs are not.

| Generated asset | Original PNG | Use |
| --- | --- | --- |
| `running.png` | `013e72f2-af60-4e18-bc27-3074ccbf6517.png` | connected, attention base |
| `paused.png` | `cf52a678-4b66-4387-97c9-769513f3547a.png` | paused |
| `offline.png` | `3209ce34-20f9-4aa1-954b-7f2bbed82b76.png` | offline |
| `sync-0.png` | `703a2b7c-83fc-42b5-b04f-20671bd52d31.png` | spinner, top |
| `sync-1.png` | `370c3b99-069e-4bf4-9677-7a34a856dd25.png` | spinner, upper right |
| `sync-2.png` | `c505eb6a-01ff-4f6b-95a7-cad7126a4e7a.png` | spinner, right |
| `sync-3.png` | `6f938482-8567-49b3-9126-f2826ca88871.png` | spinner, lower right |
| `sync-4.png` | `59558536-db8a-4b28-8d44-e1b7e5dbd43a.png` | spinner, bottom |
| `sync-5.png` | `a489524b-0cbe-4063-a0c7-acf264edfe95.png` | spinner, lower left |
| `sync-6.png` | `14cfc74a-c957-4e6a-b322-6de116b8e173.png` | spinner, left |
| `sync-7.png` | `f2af5f0f-8b24-48a4-9b0b-e803901eaec8.png` | spinner, upper left |

Embedded resource names follow `InceptSync.Assets.Icon.<generated-name>`. The
`generated/InceptSync.ico` file supplies the executable icon.
