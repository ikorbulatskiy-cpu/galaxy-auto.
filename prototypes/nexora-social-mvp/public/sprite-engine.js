(() => {
  "use strict";
  const CELL_W = 80, CELL_H = 104, COLS = 8;
  const atlas = new Image();
  let ready = false;
  let failed = false;
  const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  atlas.onload = () => { ready = true; };
  atlas.onerror = () => { failed = true; };
  atlas.src = "/assets/sprites/characters/nexora-avatar-atlas.svg";

  function directionRow(direction) {
    return ({ down: 0, left: 1, right: 2, up: 3 })[direction] ?? 0;
  }
  function animationFrames(moving, emotion) {
    const key = String(emotion || "").toUpperCase();
    if (key === "DANCE") return [6];
    if (key === "WAVE") return [7];
    if (["HAPPY", "SAD", "ANGRY", "LAUGH", "LOVE"].includes(key)) {
      return ({ HAPPY: [1], SAD: [0], ANGRY: [1], LAUGH: [6], LOVE: [7] })[key];
    }
    return moving ? [2, 3, 4, 5] : [0, 1];
  }
  function tint(ctx, x, y, width, height, avatar) {
    if (!avatar) return;
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = .28;
    if (avatar.suit && /^#[0-9a-f]{6}$/i.test(avatar.suit)) {
      ctx.fillStyle = avatar.suit;
      ctx.beginPath();
      ctx.moveTo(x + width*.23, y + height*.43);
      ctx.lineTo(x + width*.77, y + height*.43);
      ctx.lineTo(x + width*.83, y + height*.76);
      ctx.lineTo(x + width*.17, y + height*.76);
      ctx.closePath(); ctx.fill();
    }
    if (avatar.hairColor && /^#[0-9a-f]{6}$/i.test(avatar.hairColor)) {
      ctx.fillStyle = avatar.hairColor;
      ctx.beginPath(); ctx.ellipse(x+width*.5,y+height*.17,width*.2,height*.12,0,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
  function draw(ctx, x, groundY, scale, avatar, direction, moving, emotion) {
    if (!ready || failed) return false;
    const frames = animationFrames(moving, emotion);
    const frame = frames.length === 1 || reducedMotion()
      ? frames[0]
      : frames[Math.floor(performance.now() / (moving ? 125 : 680)) % frames.length];
    const row = directionRow(direction);
    const width = 58 * scale, height = 76 * scale;
    const dx = x - width/2, dy = groundY - height + 7*scale;
    const sx = frame * CELL_W, sy = row * CELL_H;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(atlas, sx, sy, CELL_W, CELL_H, dx, dy, width, height);
    tint(ctx, dx, dy, width, height, avatar);
    ctx.restore();
    return true;
  }
  window.NexoraSpriteEngine = Object.freeze({
    draw,
    get ready() { return ready; },
    get failed() { return failed; },
    get atlasUrl() { return atlas.src; }
  });
})();