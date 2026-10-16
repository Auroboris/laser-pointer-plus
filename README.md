# Laser Pointer+

Laser Pointer+ is a StarMash/SWAM extension for
[`starmash.airmash.rocks`](https://starmash.airmash.rocks). It adds a laser
pointer to your aircraft with controls in **Mod Settings → Laser Pointer+**.

## Features

- Turn the pointer on or off.
- Adjust its width with a left-to-right slider.
- Choose a preset pointer color or enter a custom HEX color.
- Reattaches automatically after respawning or changing aircraft.

## Install

Add this URL to StarMash's extension loader:

```text
https://raw.githubusercontent.com/Auroboris/laser-pointer-plus/main/extension.js
```

Then reload StarMash, join a game, and open **Mod Settings → Laser Pointer+**
to change the width and color. For a custom color, select **Custom HEX color**
and enter a value such as `#ff33cc`.

This is a StarMash extension loaded by URL; it is not a Chrome Web Store
extension.

## Compatibility

The extension uses StarMash's public `SWAM`, `SettingsProvider`, `Players`, and
`PIXI` globals. Its pointer attachment follows the laser-pointer approach in
[`starmash-ext/starmash-things`](https://github.com/starmash-ext/starmash-things).
