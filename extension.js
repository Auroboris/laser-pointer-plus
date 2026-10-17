!function() {
  "use strict";

  const EXTENSION_ID = "laser-pointer-plus";
  const DEFAULTS = {
    enabled: true,
    toggleKey: "P",
    width: 4,
    length: 4000,
    originOffset: 0,
    colorPreset: "#ff3b30",
    customColor: "#ff3b30",
    resetAfterShot: true,
    resetDelay: 500
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
  let pointerActive = true;
  let pointerCoolingDown = false;
  let cooldownTimer = null;
  let shotHookInstalled = false;

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

  function getMe() {
    try {
      return Players.getMe();
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
    pointer.position.set(0, clamp(settings.originOffset, -200, 200));
    pointer.visible = !pointerCoolingDown;
    pointer.roundPixels = true;
  }

  function ensurePointer() {
    if (!gameReady || !settings.enabled || !pointerActive) {
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
    pointer.rotation = Math.PI;

    if (pointer.anchor && pointer.anchor.set) {
      pointer.anchor.set(0.5, 0);
    }

    stylePointer();
    shipSprite.addChild(pointer);
    pointerOwner = shipSprite;
  }

  function cancelPointerCooldown() {
    if (cooldownTimer) {
      clearTimeout(cooldownTimer);
      cooldownTimer = null;
    }

    pointerCoolingDown = false;
    if (pointer) pointer.visible = true;
  }

  function resetPointerAfterShot() {
    if (!gameReady || !settings.enabled || !pointerActive || !settings.resetAfterShot) {
      return;
    }

    pointerCoolingDown = true;
    if (pointer) pointer.visible = false;

    if (cooldownTimer) clearTimeout(cooldownTimer);
    cooldownTimer = setTimeout(function() {
      cooldownTimer = null;
      pointerCoolingDown = false;
      ensurePointer();
    }, clamp(settings.resetDelay, 100, 2000));
  }

  function isMyShot(packet) {
    const me = getMe();
    return me && packet && String(packet.id) === String(me.id) &&
      packet.projectiles && packet.projectiles.length > 0;
  }

  function installShotHook() {
    if (shotHookInstalled || typeof Network === "undefined" ||
      !Network.SERVERPACKET || typeof Players.network !== "function") {
      return;
    }

    const originalPlayersNetwork = Players.network;
    Players.network = function(packetType, packet) {
      const result = originalPlayersNetwork.apply(this, arguments);

      if (packetType === Network.SERVERPACKET.PLAYER_FIRE && isMyShot(packet)) {
        resetPointerAfterShot();
      }

      return result;
    };

    shotHookInstalled = true;
  }

  function normalizeKey(value) {
    let key = String(value || "").trim().toLowerCase();

    if (key === "spacebar") key = "space";
    if (/^key[a-z]$/.test(key)) key = key.slice(3);
    if (/^digit[0-9]$/.test(key)) key = key.slice(5);

    return key;
  }

  function eventMatchesToggleKey(event) {
    const wanted = normalizeKey(settings.toggleKey || DEFAULTS.toggleKey);
    if (!wanted) return false;

    return [event && event.key, event && event.code]
      .map(normalizeKey)
      .some(key => key === wanted);
  }

  function isTyping(event) {
    const target = event && event.target;
    const tagName = target && target.tagName
      ? String(target.tagName).toLowerCase()
      : "";

    if (["input", "textarea", "select"].includes(tagName) ||
      (target && target.isContentEditable)) {
      return true;
    }

    try {
      return typeof UI !== "undefined" && typeof UI.chatBoxOpen === "function" &&
        UI.chatBoxOpen();
    } catch (error) {
      return false;
    }
  }

  function handleKeyDown(event) {
    if (!event || event.repeat || isTyping(event) || !eventMatchesToggleKey(event)) {
      return;
    }

    pointerActive = !pointerActive;
    cancelPointerCooldown();
    ensurePointer();
  }

  function schedulePointerUpdate() {
    setTimeout(ensurePointer, 0);
  }

  function settingsApplied(values) {
    settings = Object.assign({}, DEFAULTS, values || {});
    if (!settings.resetAfterShot) cancelPointerCooldown();
    ensurePointer();
  }

  function createSettingsProvider() {
    const provider = new SettingsProvider(settings, settingsApplied);
    const section = provider.addSection("Laser Pointer+");

    section.addBoolean("enabled", "Show the laser pointer");
    section.addString("toggleKey", "Pointer toggle key", {maxLength: 20});
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
    section.addSliderField("originOffset", "Pointer origin offset (0 = standard)", {
      min: -200,
      max: 200,
      step: 5
    });
    section.addValuesField("colorPreset", "Pointer color", COLOR_OPTIONS);
    section.addString(
      "customColor",
      "Custom HEX color (select Custom above)",
      {maxLength: 7}
    );
    section.addBoolean("resetAfterShot", "Hide the pointer briefly after shooting");
    section.addSliderField("resetDelay", "Pointer return delay (milliseconds)", {
      min: 100,
      max: 2000,
      step: 100
    });

    return provider;
  }

  function startPointerTracking() {
    gameReady = true;
    installShotHook();
    ensurePointer();

    if (!attachmentTimer) {
      attachmentTimer = setInterval(ensurePointer, 500);
    }
  }

  SWAM.on("gameRunning", startPointerTracking);
  SWAM.on("gamePrep", startPointerTracking);
  SWAM.on("playerAdded", schedulePointerUpdate);
  SWAM.on("playerChangedType", schedulePointerUpdate);
  SWAM.on("keydown", handleKeyDown);

  SWAM.on("gameWipe", function() {
    gameReady = false;
    cancelPointerCooldown();
    removePointer();
  });

  SWAM.registerExtension({
    name: "Laser Pointer+",
    id: EXTENSION_ID,
    description: "Adjustable laser-pointer position, size, color, hotkey, and shot reset for StarMash.",
    author: "Auroboris",
    version: "1.2.0",
    settingsProvider: createSettingsProvider()
  });
}();
