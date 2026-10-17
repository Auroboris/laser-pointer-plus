!function() {
  "use strict";

  const EXTENSION_ID = "laser-pointer-plus";
  const SETTINGS_STORAGE_KEY = EXTENSION_ID + "-settings";
  const SCOPE_GLOW_DURATION = 350;
  const SHOT_CONFIRMATION_WINDOW = 1200;
  const DEFAULTS = {
    enabled: true,
    toggleKey: "P",
    width: 4,
    length: 4000,
    originOffset: 0,
    colorPreset: "#ff3b30",
    customColor: "#ff3b30",
    resetAfterShot: true,
    resetDelay: 500,
    gateToggleKey: "G",
    gateDistance: 4000,
    gateWidth: 400,
    gateSweepTime: 1500,
    gateCenterlineWidth: 4,
    gateCenterlineBrightness: 25,
    gateSweepWidth: 4,
    gateSweepBrightness: 90,
    gateSweepColorPreset: "match",
    gateSweepCustomColor: "#ffffff",
    gateCenteredShotGlow: true,
    gateBoundaryThickness: 4,
    gateBoundaryBrightness: 65,
    gateCenterSize: 14,
    gateCenterBrightness: 90
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

  const SWEEP_COLOR_OPTIONS = Object.assign({
    match: "Match pointer color"
  }, COLOR_OPTIONS);

  function loadSavedSettings() {
    try {
      if (typeof localStorage === "undefined") return {};
      const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}");
      return saved && typeof saved === "object" && !Array.isArray(saved)
        ? saved
        : {};
    } catch (error) {
      return {};
    }
  }

  let settings = Object.assign({}, DEFAULTS, loadSavedSettings());
  let pointer = null;
  let pointerOwner = null;
  let gameReady = false;
  let attachmentTimer = null;
  let pointerActive = true;
  let pointerCoolingDown = false;
  let cooldownTimer = null;
  let shotHookInstalled = false;
  let gateActive = false;
  let gateOwner = null;
  let gateSprites = null;
  let scanStartedAt = null;
  let scopeGlowUntil = 0;
  let pendingShotTiming = null;
  let animationFrame = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value)));
  }

  function getCurrentTime() {
    return typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
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

  function getSweepColor() {
    if (settings.gateSweepColorPreset === "match") return getPointerColor();

    const selected = settings.gateSweepColorPreset === "custom"
      ? settings.gateSweepCustomColor
      : settings.gateSweepColorPreset;
    const parsed = parseHexColor(selected);
    return parsed === null ? getPointerColor() : parsed;
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

  function removeRangeGate() {
    if (!gateSprites) return;

    Object.keys(gateSprites).forEach(function(key) {
      const sprite = gateSprites[key];
      if (sprite.parent) sprite.parent.removeChild(sprite);
      sprite.destroy();
    });

    gateSprites = null;
    gateOwner = null;
    scanStartedAt = null;
    scopeGlowUntil = 0;
    pendingShotTiming = null;
  }

  function createGateSprite(name, anchorX, anchorY) {
    const sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
    sprite.name = EXTENSION_ID + "-" + name;

    if (sprite.anchor && sprite.anchor.set) {
      sprite.anchor.set(anchorX, anchorY);
    }

    return sprite;
  }

  function isScopeGlowActive(timestamp) {
    return settings.gateCenteredShotGlow && scopeGlowUntil > timestamp;
  }

  function gateShouldBeVisible(timestamp) {
    return gameReady && settings.enabled && pointerActive && gateActive &&
      (!pointerCoolingDown || isScopeGlowActive(timestamp));
  }

  function stylePointer() {
    if (!pointer) return;

    const centerlineActive = gateActive;
    pointer.tint = getPointerColor();
    pointer.alpha = centerlineActive
      ? clamp(settings.gateCenterlineBrightness, 10, 100) / 100
      : 0.9;
    pointer.width = centerlineActive
      ? clamp(settings.gateCenterlineWidth, 1, 30)
      : clamp(settings.width, 1, 30);
    pointer.height = centerlineActive
      ? clamp(settings.gateDistance, 500, 8000)
      : clamp(settings.length, 500, 8000);
    pointer.position.set(0, clamp(settings.originOffset, -200, 200));
    pointer.visible = !pointerCoolingDown;
    pointer.roundPixels = true;
  }

  function styleRangeGate(timestamp) {
    if (!gateSprites) return;

    timestamp = Number.isFinite(timestamp) ? timestamp : getCurrentTime();

    const glowActive = isScopeGlowActive(timestamp);
    const visible = gateShouldBeVisible(timestamp);
    Object.keys(gateSprites).forEach(function(key) {
      gateSprites[key].visible = visible;
    });

    if (!visible) return;

    const origin = clamp(settings.originOffset, -200, 200);
    const distance = clamp(settings.gateDistance, 500, 8000);
    const width = clamp(settings.gateWidth, 50, 2000);
    const sweepTime = clamp(settings.gateSweepTime, 250, 5000);
    const sweepWidth = clamp(settings.gateSweepWidth, 1, 30);
    const sweepAlpha = clamp(settings.gateSweepBrightness, 10, 100) / 100;
    const boundaryThickness = clamp(settings.gateBoundaryThickness, 1, 30);
    const boundaryAlpha = clamp(settings.gateBoundaryBrightness, 10, 100) / 100;
    const centerSize = clamp(settings.gateCenterSize, 2, 60);
    const centerAlpha = clamp(settings.gateCenterBrightness, 10, 100) / 100;
    const color = getPointerColor();
    const sweepColor = getSweepColor();
    const glowScale = glowActive ? 2 : 1;

    if (scanStartedAt === null) scanStartedAt = timestamp;

    const elapsed = Math.max(0, timestamp - scanStartedAt);
    const endX = Math.sin(Math.PI * elapsed / sweepTime) * width / 2;
    const beamLength = Math.sqrt(distance * distance + endX * endX);
    const beamRotation = Math.PI + Math.atan2(endX, distance);
    const gateY = origin - distance;

    gateSprites.scan.position.set(0, origin);
    gateSprites.scan.width = sweepWidth * glowScale;
    gateSprites.scan.height = beamLength;
    gateSprites.scan.rotation = beamRotation;
    gateSprites.scan.tint = sweepColor;
    gateSprites.scan.alpha = glowActive ? 1 : sweepAlpha;

    gateSprites.bar.position.set(0, gateY);
    gateSprites.bar.width = width;
    gateSprites.bar.height = boundaryThickness * glowScale;

    gateSprites.left.position.set(-width / 2, gateY);
    gateSprites.right.position.set(width / 2, gateY);
    gateSprites.center.position.set(0, gateY);

    [gateSprites.left, gateSprites.right].forEach(function(sprite) {
      sprite.width = boundaryThickness * glowScale;
      sprite.height = 80;
    });

    gateSprites.center.width = centerSize * glowScale;
    gateSprites.center.height = centerSize * glowScale;

    [gateSprites.bar, gateSprites.left, gateSprites.right].forEach(function(sprite) {
      sprite.tint = color;
      sprite.alpha = glowActive ? 1 : boundaryAlpha;
    });

    gateSprites.center.tint = color;
    gateSprites.center.alpha = glowActive ? 1 : centerAlpha;
  }

  function getSweepEndX(timestamp) {
    if (scanStartedAt === null) return null;

    const width = clamp(settings.gateWidth, 50, 2000);
    const sweepTime = clamp(settings.gateSweepTime, 250, 5000);
    const elapsed = Math.max(0, timestamp - scanStartedAt);
    return Math.sin(Math.PI * elapsed / sweepTime) * width / 2;
  }

  function isSweepCentered(timestamp) {
    if (!gameReady || !settings.enabled || !pointerActive || !gateActive ||
      !gateSprites || scanStartedAt === null || pointerCoolingDown) {
      return false;
    }

    const endX = getSweepEndX(timestamp);
    const centerSize = clamp(settings.gateCenterSize, 2, 60);
    const sweepWidth = clamp(settings.gateSweepWidth, 1, 30);
    return endX !== null && Math.abs(endX) <= (centerSize + sweepWidth) / 2;
  }

  function rememberShotTiming(keyCode, isPressed) {
    if (keyCode !== "FIRE" || !isPressed) return;

    const timestamp = getCurrentTime();
    pendingShotTiming = {
      centered: isSweepCentered(timestamp),
      expiresAt: timestamp + SHOT_CONFIRMATION_WINDOW
    };
  }

  function handleConfirmedShot() {
    const timestamp = getCurrentTime();
    const hasFreshTiming = pendingShotTiming &&
      pendingShotTiming.expiresAt >= timestamp;
    const centered = hasFreshTiming
      ? pendingShotTiming.centered
      : isSweepCentered(timestamp);

    pendingShotTiming = null;

    if (settings.gateCenteredShotGlow && centered) {
      scopeGlowUntil = timestamp + SCOPE_GLOW_DURATION;
      if (gateSprites) styleRangeGate(timestamp);
    }

    resetPointerAfterShot(timestamp);
  }

  function ensureRangeGate(shipSprite) {
    if (!gateActive || !shipSprite) {
      removeRangeGate();
      return;
    }

    if (!gateSprites || gateOwner !== shipSprite) {
      removeRangeGate();

      gateSprites = {
        scan: createGateSprite("scan", 0.5, 0),
        bar: createGateSprite("gate-bar", 0.5, 0.5),
        left: createGateSprite("gate-left", 0.5, 0.5),
        right: createGateSprite("gate-right", 0.5, 0.5),
        center: createGateSprite("gate-center", 0.5, 0.5)
      };

      Object.keys(gateSprites).forEach(function(key) {
        shipSprite.addChild(gateSprites[key]);
      });
      gateOwner = shipSprite;
      scanStartedAt = null;
    }

    styleRangeGate(getCurrentTime());
  }

  function ensurePointer() {
    if (!gameReady || !settings.enabled || !pointerActive) {
      removePointer();
      removeRangeGate();
      return;
    }

    const shipSprite = getMyShipSprite();
    if (!shipSprite) {
      removePointer();
      removeRangeGate();
      return;
    }

    if (pointer && pointerOwner === shipSprite && pointer.parent === shipSprite) {
      stylePointer();
      ensureRangeGate(shipSprite);
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
    ensureRangeGate(shipSprite);
  }

  function cancelPointerCooldown() {
    if (cooldownTimer) {
      clearTimeout(cooldownTimer);
      cooldownTimer = null;
    }

    pointerCoolingDown = false;
    scopeGlowUntil = 0;
    pendingShotTiming = null;
    if (pointer) pointer.visible = true;
    scanStartedAt = null;
    if (gateSprites) styleRangeGate(getCurrentTime());
  }

  function resetPointerAfterShot(timestamp) {
    if (!gameReady || !settings.enabled || !pointerActive || !settings.resetAfterShot) {
      return;
    }

    timestamp = Number.isFinite(timestamp) ? timestamp : getCurrentTime();

    pointerCoolingDown = true;
    if (pointer) pointer.visible = false;
    if (gateSprites) styleRangeGate(timestamp);

    if (cooldownTimer) clearTimeout(cooldownTimer);
    cooldownTimer = setTimeout(function() {
      cooldownTimer = null;
      pointerCoolingDown = false;
      scanStartedAt = null;
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
    const originalSendKey = Network.sendKey;

    if (typeof originalSendKey === "function") {
      Network.sendKey = function(keyCode, isPressed) {
        rememberShotTiming(keyCode, isPressed);
        return originalSendKey.apply(this, arguments);
      };
    }

    Players.network = function(packetType, packet) {
      const result = originalPlayersNetwork.apply(this, arguments);

      if (packetType === Network.SERVERPACKET.PLAYER_FIRE && isMyShot(packet)) {
        handleConfirmedShot();
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

  function eventMatchesKey(event, configuredKey, fallbackKey) {
    const wanted = normalizeKey(configuredKey || fallbackKey);
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
    if (!event || event.repeat || isTyping(event)) return;

    if (eventMatchesKey(event, settings.toggleKey, DEFAULTS.toggleKey)) {
      pointerActive = !pointerActive;
      cancelPointerCooldown();
      ensurePointer();
      return;
    }

    if (eventMatchesKey(event, settings.gateToggleKey, DEFAULTS.gateToggleKey)) {
      gateActive = !gateActive;
      scanStartedAt = null;
      ensurePointer();
    }
  }

  function animateRangeGate(timestamp) {
    if (gameReady && gateSprites) styleRangeGate(timestamp);
    animationFrame = requestAnimationFrame(animateRangeGate);
  }

  function startRangeGateAnimation() {
    if (!animationFrame) {
      animationFrame = requestAnimationFrame(animateRangeGate);
    }
  }

  function stopRangeGateAnimation() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }

  function schedulePointerUpdate() {
    setTimeout(ensurePointer, 0);
  }

  function settingsApplied(values) {
    settings = Object.assign({}, DEFAULTS, values || {});

    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      }
    } catch (error) {
      // StarMash still keeps its own saved copy if local storage is unavailable.
    }

    if (!settings.resetAfterShot) cancelPointerCooldown();
    if (!settings.gateCenteredShotGlow) scopeGlowUntil = 0;
    ensurePointer();
  }

  function createSettingsProvider() {
    const provider = new SettingsProvider(settings, settingsApplied);
    const pointerSection = provider.addSection("Pointer");

    pointerSection.addBoolean("enabled", "Show the laser pointer");
    pointerSection.addString("toggleKey", "Pointer toggle key", {maxLength: 20});
    pointerSection.addSliderField("width", "Pointer width", {
      min: 1,
      max: 30,
      step: 1
    });
    pointerSection.addSliderField("length", "Pointer length", {
      min: 500,
      max: 8000,
      step: 250
    });
    pointerSection.addSliderField("originOffset", "Pointer origin offset (0 = standard)", {
      min: -200,
      max: 200,
      step: 5
    });
    pointerSection.addValuesField("colorPreset", "Pointer and scope color", COLOR_OPTIONS);
    pointerSection.addString(
      "customColor",
      "Custom HEX color (select Custom above)",
      {maxLength: 7}
    );

    const resetSection = provider.addSection("Shot Reset");

    resetSection.addBoolean("resetAfterShot", "Hide the pointer after shooting");
    resetSection.addSliderField("resetDelay", "Return delay (milliseconds)", {
      min: 100,
      max: 2000,
      step: 100
    });

    const scopeSection = provider.addSection("Scanning Scope");

    scopeSection.addString("gateToggleKey", "Scope toggle key", {
      maxLength: 20
    });
    scopeSection.addSliderField("gateDistance", "Scope distance", {
      min: 500,
      max: 8000,
      step: 250
    });
    scopeSection.addSliderField("gateWidth", "Scope width", {
      min: 50,
      max: 2000,
      step: 50
    });
    scopeSection.addSliderField("gateSweepTime", "Edge-to-edge sweep time (milliseconds)", {
      min: 250,
      max: 5000,
      step: 250
    });
    scopeSection.addBoolean(
      "gateCenteredShotGlow",
      "Glow scope after a centered sweep shot"
    );

    const linesSection = provider.addSection("Scope Lines");

    linesSection.addSliderField("gateCenterlineWidth", "Centerline thickness", {
      min: 1,
      max: 30,
      step: 1
    });
    linesSection.addSliderField("gateCenterlineBrightness", "Centerline brightness", {
      min: 10,
      max: 100,
      step: 5
    });
    linesSection.addSliderField("gateSweepWidth", "Sweep line thickness", {
      min: 1,
      max: 30,
      step: 1
    });
    linesSection.addSliderField("gateSweepBrightness", "Sweep line brightness", {
      min: 10,
      max: 100,
      step: 5
    });
    linesSection.addValuesField(
      "gateSweepColorPreset",
      "Sweep line color",
      SWEEP_COLOR_OPTIONS
    );
    linesSection.addString(
      "gateSweepCustomColor",
      "Custom sweep HEX color (select Custom above)",
      {maxLength: 7}
    );

    const boundarySection = provider.addSection("Scope Boundary");

    boundarySection.addSliderField("gateBoundaryThickness", "Boundary thickness", {
      min: 1,
      max: 30,
      step: 1
    });
    boundarySection.addSliderField("gateBoundaryBrightness", "Boundary brightness", {
      min: 10,
      max: 100,
      step: 5
    });
    boundarySection.addSliderField("gateCenterSize", "Center-point size", {
      min: 2,
      max: 60,
      step: 2
    });
    boundarySection.addSliderField("gateCenterBrightness", "Center-point brightness", {
      min: 10,
      max: 100,
      step: 5
    });

    return provider;
  }

  function startPointerTracking() {
    gameReady = true;
    installShotHook();
    ensurePointer();
    startRangeGateAnimation();

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
    stopRangeGateAnimation();
    removePointer();
    removeRangeGate();
  });

  SWAM.registerExtension({
    name: "Laser Pointer+",
    id: EXTENSION_ID,
    description: "Adjustable laser pointer with hotkeys, shot reset, and a scanning range gate for StarMash.",
    author: "Auroboris",
    version: "1.6.0",
    settingsProvider: createSettingsProvider()
  });
}();
