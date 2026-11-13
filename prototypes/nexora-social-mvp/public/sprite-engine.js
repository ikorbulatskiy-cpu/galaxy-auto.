(() => {
  "use strict";
  const CELL_W = 80, CELL_H = 104, COLS = 8;
  const atlas = new Image();
  let ready = false;
  let failed = false;
  const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  atlas.onload = () => { ready = true; window.dispatchEvent(new Event("nexora:sprites-ready")); };
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
    } else if(avatar.hair==="bob"){
      ctx.fillStyle=hair;ctx.beginPath();ctx.moveTo(cx-width*.22,headY+height*.04);ctx.quadraticCurveTo(cx-width*.31,headY-height*.32,cx,headY-height*.31);ctx.quadraticCurveTo(cx+width*.31,headY-height*.32,cx+width*.22,headY+height*.04);ctx.lineTo(cx+width*.16,headY+height*.23);ctx.lineTo(cx-width*.16,headY+height*.23);ctx.closePath();ctx.fill();
    } else if(avatar.hair==="ponytail"){
      ctx.fillStyle=hair;ctx.beginPath();ctx.ellipse(cx+width*.20,headY+height*.14,width*.09,height*.22,-.15,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(cx,headY-height*.10,width*.22,Math.PI,Math.PI*2);ctx.lineTo(cx+width*.20,headY+height*.05);ctx.quadraticCurveTo(cx,headY-height*.10,cx-width*.20,headY+height*.05);ctx.fill();
    } else if(avatar.hair==="curly"){
      ctx.fillStyle=hair;for(let i=0;i<7;i++){const angle=Math.PI+i*Math.PI/6;ctx.beginPath();ctx.arc(cx+Math.cos(angle)*width*.17,headY-height*.10+Math.sin(angle)*height*.12,width*.095,0,Math.PI*2);ctx.fill();}
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
    } else if(avatar.accessory==="flower"){
      ctx.strokeStyle="#4b9a75";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx+width*.17,headY-height*.08);ctx.lineTo(cx+width*.23,headY-height*.28);ctx.stroke();
      ctx.fillStyle="#ff8fc5";for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ctx.beginPath();ctx.arc(cx+width*.23+Math.cos(a)*3,headY-height*.29+Math.sin(a)*3,2.5,0,Math.PI*2);ctx.fill();}
      ctx.fillStyle="#ffdf82";ctx.beginPath();ctx.arc(cx+width*.23,headY-height*.29,2,0,Math.PI*2);ctx.fill();
    } else if(avatar.accessory==="cap"){
      ctx.fillStyle="#344a82";ctx.strokeStyle="#202d55";ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(cx,headY-height*.12,width*.22,Math.PI,Math.PI*2);ctx.lineTo(cx+width*.28,headY-height*.02);ctx.quadraticCurveTo(cx,headY+height*.04,cx-width*.22,headY-height*.02);ctx.closePath();ctx.fill();ctx.stroke();
    } else if(avatar.accessory==="scarf"){
      ctx.fillStyle=avatar.suit||"#6d7cff";ctx.strokeStyle="rgba(255,255,255,.6)";ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(cx-width*.16,y+height*.39);ctx.lineTo(cx+width*.16,y+height*.39);ctx.lineTo(cx+width*.13,y+height*.49);ctx.lineTo(cx-width*.13,y+height*.49);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx+width*.10,y+height*.45);ctx.lineTo(cx+width*.18,y+height*.62);ctx.lineTo(cx+width*.12,y+height*.65);ctx.lineTo(cx+width*.06,y+height*.48);ctx.fill();
    }
    const outfit=avatar.outfit||"casual", suit=avatar.suit||"#6d7cff";
    ctx.save();ctx.lineWidth=Math.max(1,width*.018);ctx.lineCap="round";ctx.lineJoin="round";
    if(outfit==="hoodie"){
      ctx.strokeStyle="rgba(28,35,73,.9)";ctx.beginPath();ctx.arc(cx,headY+height*.44,width*.19,Math.PI,Math.PI*2);ctx.stroke();
      ctx.fillStyle="rgba(255,255,255,.22)";ctx.beginPath();ctx.moveTo(cx-width*.07,y+height*.51);ctx.lineTo(cx,y+height*.59);ctx.lineTo(cx+width*.07,y+height*.51);ctx.strokeStyle="rgba(255,255,255,.35)";ctx.stroke();
      ctx.fillStyle="rgba(18,25,57,.38)";ctx.beginPath();ctx.roundRect(cx-width*.13,y+height*.61,width*.26,height*.09,4);ctx.fill();
    } else if(outfit==="jacket"){
      ctx.strokeStyle="rgba(255,255,255,.75)";ctx.beginPath();ctx.moveTo(cx-width*.12,y+height*.45);ctx.lineTo(cx-width*.02,y+height*.69);ctx.lineTo(cx,y+height*.74);ctx.moveTo(cx+width*.12,y+height*.45);ctx.lineTo(cx+width*.02,y+height*.69);ctx.lineTo(cx,y+height*.74);ctx.stroke();
      ctx.fillStyle="#f6d88e";ctx.beginPath();ctx.arc(cx,y+height*.58,1.7,0,Math.PI*2);ctx.arc(cx,y+height*.68,1.7,0,Math.PI*2);ctx.fill();
    } else if(outfit==="dress"){
      ctx.fillStyle=suit;ctx.globalAlpha=.32;ctx.beginPath();ctx.moveTo(cx-width*.16,y+height*.53);ctx.lineTo(cx+width*.16,y+height*.53);ctx.lineTo(cx+width*.25,y+height*.83);ctx.lineTo(cx-width*.25,y+height*.83);ctx.closePath();ctx.fill();ctx.globalAlpha=1;
      ctx.strokeStyle="rgba(255,255,255,.55)";ctx.beginPath();ctx.moveTo(cx-width*.22,y+height*.82);ctx.lineTo(cx+width*.22,y+height*.82);ctx.stroke();
    } else if(outfit==="beach"){
      ctx.strokeStyle="rgba(255,255,255,.75)";ctx.beginPath();ctx.moveTo(cx-width*.13,y+height*.45);ctx.lineTo(cx-width*.18,y+height*.55);ctx.moveTo(cx+width*.13,y+height*.45);ctx.lineTo(cx+width*.18,y+height*.55);ctx.stroke();
      ctx.fillStyle="rgba(255,255,255,.24)";ctx.fillRect(cx-width*.14,y+height*.67,width*.28,height*.035);
    } else if(outfit==="club"){
      ctx.strokeStyle="#f6c5ff";ctx.shadowColor="#e879ef";ctx.shadowBlur=5;ctx.beginPath();ctx.moveTo(cx-width*.17,y+height*.48);ctx.lineTo(cx-width*.11,y+height*.74);ctx.moveTo(cx+width*.17,y+height*.48);ctx.lineTo(cx+width*.11,y+height*.74);ctx.stroke();ctx.shadowBlur=0;
    }
    ctx.restore();
    if(avatar.gender==="female"){
      ctx.fillStyle="#f4b5dc";ctx.beginPath();ctx.arc(cx-width*.19,headY+height*.11,2,0,Math.PI*2);ctx.arc(cx+width*.19,headY+height*.11,2,0,Math.PI*2);ctx.fill();
    }
    if(avatar.shoes==="boots"){
      ctx.fillStyle="#303044";ctx.fillRect(x+width*.19,y+height*.86,width*.25,height*.11);ctx.fillRect(x+width*.56,y+height*.86,width*.25,height*.11);
    } else if(avatar.shoes==="sandals"){
      ctx.strokeStyle="#d5b28c";ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(x+width*.20,y+height*.90);ctx.lineTo(x+width*.40,y+height*.94);ctx.moveTo(x+width*.60,y+height*.94);ctx.lineTo(x+width*.80,y+height*.90);ctx.stroke();
    } else if(avatar.shoes==="heels"){
      ctx.strokeStyle="#e7a6c9";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+width*.28,y+height*.89);ctx.lineTo(x+width*.28,y+height*.99);ctx.moveTo(x+width*.68,y+height*.89);ctx.lineTo(x+width*.68,y+height*.99);ctx.stroke();
    }
    ctx.restore();
  }
  function drawEmotion(ctx,x,y,width,height,emotion) {
    const type=String(emotion||"").toLowerCase();
    if(!type)return;
    const cx=x+width/2, faceY=y+height*.25;
    ctx.save();ctx.lineCap="round";ctx.lineJoin="round";
    if(type==="sad"){
      ctx.strokeStyle="#914e59";ctx.lineWidth=1.7;ctx.beginPath();ctx.arc(cx,faceY+height*.12,5,Math.PI+.15,Math.PI*2-.15);ctx.stroke();
      ctx.fillStyle="#72b9ef";ctx.beginPath();ctx.ellipse(cx+width*.2,faceY+height*.16,1.8,3,.3,0,Math.PI*2);ctx.fill();
    } else if(type==="happy"||type==="smile"||type==="laugh"){
      ctx.strokeStyle="#914e59";ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(cx,faceY+height*.07,5,.15,Math.PI-.15);ctx.stroke();
      if(type==="laugh"){ctx.fillStyle="#fff";ctx.beginPath();ctx.ellipse(cx,faceY+height*.10,3.5,2.2,0,0,Math.PI*2);ctx.fill();}
    } else if(type==="angry"){
      ctx.strokeStyle="#49334a";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx-width*.15,faceY-height*.015);ctx.lineTo(cx-width*.04,faceY+height*.015);ctx.moveTo(cx+width*.15,faceY-height*.015);ctx.lineTo(cx+width*.04,faceY+height*.015);ctx.stroke();
      ctx.strokeStyle="#914e59";ctx.beginPath();ctx.moveTo(cx-3,faceY+height*.13);ctx.lineTo(cx+3,faceY+height*.13);ctx.stroke();
    } else if(type==="love"||type==="kiss"){
      const hx=cx+width*.25,hy=faceY-height*.2;
      ctx.fillStyle="#ff76b9";ctx.beginPath();ctx.moveTo(hx,hy+5);ctx.bezierCurveTo(hx-11,hy-2,hx-5,hy-10,hx,hy-4);ctx.bezierCurveTo(hx+5,hy-10,hx+11,hy-2,hx,hy+5);ctx.fill();
    } else if(type==="surprise"){
      ctx.strokeStyle="#914e59";ctx.lineWidth=1.6;ctx.beginPath();ctx.ellipse(cx,faceY+height*.12,2.3,3.2,0,0,Math.PI*2);ctx.stroke();
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
    drawEmotion(ctx,dx,dy,width,height,emotion);
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