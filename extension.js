!function() {
  "use strict";

  const EXTENSION_ID = "laser-pointer-plus";
  const DEFAULTS = {
    enabled: true,
    width: 4,
    length: 4000,
    colorPreset: "#ff3b30",
    customColor: "#ff3b30"
  };

  const COLOR_OPTIONS = {
    "#ff3b30": "Red",
    "#ff9500": "Orange",
    "#ffcc00": "Yellow",
    "#34c759": "Green",
    "#00ffff": "Cyan",
    "#007aff": "Blue",
    "#af52de": "Purple",
    "#ffffff": "White",
    custom: "Custom HEX color"
  };

  let settings = Object.assign({}, DEFAULTS);
  let pointer = null;
  let pointerOwner = null;
  let gameReady = false;
  let attachmentTimer = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value)));
  }

  function parseHexColor(value) {
    const normalized = String(value || "")
      .trim()
      .replace(/^0x/i, "")
      .replace(/^#/, "");

    if (/^[0-9a-f]{3}$/i.test(normalized)) {
      return parseInt(normalized.split("").map(char => char + char).join(""), 16);
    }

    if (/^[0-9a-f]{6}$/i.test(normalized)) {
      return parseInt(normalized, 16);
    }

    return null;
  }

  function getPointerColor() {
    const selected = settings.colorPreset === "custom"
      ? settings.customColor
      : settings.colorPreset;
    const parsed = parseHexColor(selected);
    return parsed === null ? parseHexColor(DEFAULTS.colorPreset) : parsed;
  }

  function getMyShipSprite() {
    try {
      const me = Players.getMe();
      return me && me.sprites ? me.sprites.sprite : null;
    } catch (error) {
      return null;
    }
  }

  function removePointer() {
    if (!pointer) return;

    if (pointer.parent) {
      pointer.parent.removeChild(pointer);
    }

    pointer.destroy();
    pointer = null;
    pointerOwner = null;
  }

  function stylePointer() {
    if (!pointer) return;

    pointer.tint = getPointerColor();
    pointer.alpha = 0.9;
    pointer.width = clamp(settings.width, 1, 30);
    pointer.height = clamp(settings.length, 500, 8000);
    pointer.roundPixels = true;
  }

  function ensurePointer() {
    if (!gameReady || !settings.enabled) {
      removePointer();
      return;
    }

    const shipSprite = getMyShipSprite();
    if (!shipSprite) {
      removePointer();
      return;
    }

    if (pointer && pointerOwner === shipSprite && pointer.parent === shipSprite) {
      stylePointer();
      return;
    }

    removePointer();

    pointer = new PIXI.Sprite(PIXI.Texture.WHITE);
    pointer.name = EXTENSION_ID;
    pointer.position.set(0, 0);
    pointer.rotation = Math.PI;

    if (pointer.anchor && pointer.anchor.set) {
      pointer.anchor.set(0.5, 0);
    }

    stylePointer();
    shipSprite.addChild(pointer);
    pointerOwner = shipSprite;
  }

  function schedulePointerUpdate() {
    setTimeout(ensurePointer, 0);
  }

  function settingsApplied(values) {
    settings = Object.assign({}, DEFAULTS, values || {});
    ensurePointer();
  }

  function createSettingsProvider() {
    const provider = new SettingsProvider(settings, settingsApplied);
    const section = provider.addSection("Laser Pointer+");

    section.addBoolean("enabled", "Show the laser pointer");
    section.addSliderField("width", "Pointer width", {
      min: 1,
      max: 30,
      step: 1
    });
    section.addSliderField("length", "Pointer length", {
      min: 500,
      max: 8000,
      step: 250
    });
    section.addValuesField("colorPreset", "Pointer color", COLOR_OPTIONS);
    section.addString(
      "customColor",
      "Custom HEX color (select Custom above)",
      {maxLength: 7}
    );

    return provider;
  }

  function startPointerTracking() {
    gameReady = true;
    ensurePointer();

    if (!attachmentTimer) {
      attachmentTimer = setInterval(ensurePointer, 500);
    }
  }

  SWAM.on("gameRunning", startPointerTracking);
  SWAM.on("gamePrep", startPointerTracking);
  SWAM.on("playerAdded", schedulePointerUpdate);
  SWAM.on("playerChangedType", schedulePointerUpdate);

  SWAM.on("gameWipe", function() {
    gameReady = false;
    removePointer();
  });

  SWAM.registerExtension({
    name: "Laser Pointer+",
    id: EXTENSION_ID,
    description: "Adjustable laser-pointer width, length, and color for StarMash.",
    author: "Auroboris",
    version: "1.1.0",
    settingsProvider: createSettingsProvider()
  });
}();
