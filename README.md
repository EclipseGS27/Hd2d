# HD-2D Look

Gives any Foundry scene the HD-2D look of modern pixel-art JRPGs: a diorama-like tilt-shift focus, glowing lights, soft light shafts, cinematic color, and pixel sprites that stand on the map. It reads each scene's colors and darkness and tunes itself to them. Works with any system (made for Project FU tables). Foundry v13.

## Install
In Foundry: Add-on Modules → Install Module → paste this Manifest URL:
`https://github.com/EclipseGS27/Hd2d/releases/latest/download/module.json`

## Use it
- **Shift+H** turns it on or off. The mountain button in the Token and Lighting controls (or Module Settings → HD-2D look) opens the panel.
- Everything is per player, so someone on a slow laptop can lower Quality or turn it off without changing it for anyone else.

## What it does
- **Tilt-shift depth of field**: the top and bottom of the screen go soft, like looking at a miniature. The sharp band **follows your token** (or whoever is acting, or stays in the middle).
- **Bloom**: torches, lights, fire and magic glow, from a real bright pass blurred at half size.
- **Light shafts** drifting from the key light, and **floating motes** in the light: dust by day, embers in warm, fiery scenes, fireflies at night.
- **Color grading**: exposure, contrast, saturation, warmth, and split toning (cool shadows, warm highlights), then vignette, film grain and a little lens fringe toward the corners.
- **Sprites**: soft contact shadows under every token so they stand on the map, and **crisp pixel art** (nearest-neighbor scaling) for small sprites or every token.
- **Auto-tune**: reads the scene's background (brightness, colorfulness, dominant hue) and its darkness, and leans the look to match: dark maps get a lift, nights go blue with stronger bloom and fireflies, cool scenes get a cooler grade. The panel shows what it read ("daylight, neutral", the three tint colors and the mote kind); ⟳ reads it again. It re-reads when the scene's background or darkness changes.
- **Presets**: Classic HD-2D, Soft and dreamy, Crisp and clean, Dramatic, Subtle. Then a slider for every part: depth of field, focus band, bloom and threshold, light shafts, motes, exposure, contrast, saturation, warmth, split toning, vignette, grain, lens fringe, sprite shadows.
- **GM**: save the current sliders as a scene's own look (everyone sees it there, unless a player turns off "Use the GM's scene looks"), clear it, or turn the look off for a scene.

The look is applied to the scene only: the UI, token bars, rulers and chat stay sharp. The API is at `game.modules.get('fu-hd2d').api` (`toggle()`, `open()`, `engine`).
