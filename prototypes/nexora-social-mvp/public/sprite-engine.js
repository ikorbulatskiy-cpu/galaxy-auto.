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
    if (avatar.skin && /^#[0-9a-f]{6}$/i.test(avatar.skin)) {
      ctx.fillStyle = avatar.skin;
      ctx.beginPath(); ctx.ellipse(x+width*.5,y+height*.25,width*.17,height*.19,0,0,Math.PI*2); ctx.fill();
    }
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
  function drawAppearanceDetails(ctx, x, y, width, height, avatar) {
    if (!avatar) return;
    const cx=x+width/2, headY=y+height*.25, hair=avatar.hairColor||"#352a43";
    ctx.save();
    ctx.lineCap="round";ctx.lineJoin="round";
    if(avatar.hair==="long"){
      ctx.strokeStyle=hair;ctx.lineWidth=Math.max(3,width*.09);
      ctx.beginPath();ctx.moveTo(cx-width*.17,headY-2);ctx.quadraticCurveTo(cx-width*.29,headY+height*.17,cx-width*.20,y+height*.58);ctx.moveTo(cx+width*.17,headY-2);ctx.quadraticCurveTo(cx+width*.29,headY+height*.17,cx+width*.20,y+height*.58);ctx.stroke();
    } else if(avatar.hair==="spiky"){
      ctx.fillStyle=hair;ctx.beginPath();ctx.moveTo(cx-width*.22,headY-height*.09);ctx.lineTo(cx-width*.20,headY-height*.25);ctx.lineTo(cx-width*.07,headY-height*.16);ctx.lineTo(cx,headY-height*.31);ctx.lineTo(cx+width*.08,headY-height*.17);ctx.lineTo(cx+width*.22,headY-height*.25);ctx.lineTo(cx+width*.22,headY-height*.02);ctx.closePath();ctx.fill();
    }
    if(avatar.accessory==="glasses"){
      ctx.strokeStyle="#202943";ctx.lineWidth=1.8;ctx.fillStyle="rgba(155,220,255,.18)";
      ctx.beginPath();ctx.roundRect(cx-width*.18,headY-height*.015,width*.15,height*.075,3);ctx.roundRect(cx+width*.03,headY-height*.015,width*.15,height*.075,3);ctx.moveTo(cx-width*.03,headY+height*.02);ctx.lineTo(cx+width*.03,headY+height*.02);ctx.stroke();ctx.fill();
    } else if(avatar.accessory==="headphones"){
      ctx.strokeStyle="#c6d4ff";ctx.lineWidth=3;ctx.beginPath();ctx.arc(cx,headY+height*.01,width*.23,Math.PI,Math.PI*2);ctx.stroke();
      ctx.fillStyle="#8298ed";ctx.fillRect(cx-width*.23,headY,width*.07,height*.12);ctx.fillRect(cx+width*.16,headY,width*.07,height*.12);
    } else if(avatar.accessory==="crown"){
      ctx.fillStyle="#ffd66d";ctx.strokeStyle="#9b6a35";ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(cx-width*.17,headY-height*.10);ctx.lineTo(cx-width*.20,headY-height*.27);ctx.lineTo(cx-width*.06,headY-height*.18);ctx.lineTo(cx,headY-height*.31);ctx.lineTo(cx+width*.07,headY-height*.18);ctx.lineTo(cx+width*.20,headY-height*.27);ctx.lineTo(cx+width*.17,headY-height*.10);ctx.closePath();ctx.fill();ctx.stroke();
    }
    if(avatar.gender==="female"){
      ctx.fillStyle="#f4b5dc";ctx.beginPath();ctx.arc(cx-width*.19,headY+height*.11,2,0,Math.PI*2);ctx.arc(cx+width*.19,headY+height*.11,2,0,Math.PI*2);ctx.fill();
    }
    if(avatar.shoes==="boots"){
      ctx.fillStyle="#303044";ctx.fillRect(x+width*.19,y+height*.86,width*.25,height*.11);ctx.fillRect(x+width*.56,y+height*.86,width*.25,height*.11);
    } else if(avatar.shoes==="heels"){
      ctx.strokeStyle="#e7a6c9";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+width*.28,y+height*.89);ctx.lineTo(x+width*.28,y+height*.99);ctx.moveTo(x+width*.68,y+height*.89);ctx.lineTo(x+width*.68,y+height*.99);ctx.stroke();
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
    drawAppearanceDetails(ctx,dx,dy,width,height,avatar);
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