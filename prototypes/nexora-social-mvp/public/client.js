(() => {
  const socket = io({ autoConnect: false });
  const $ = (selector) => document.querySelector(selector);
  const loginScreen = $("#login-screen");
  const gameScreen = $("#game-screen");
  const previewCanvas = $("#preview-canvas");
  const previewCtx = previewCanvas.getContext("2d");
  const canvas = $("#world-canvas");
  const ctx = canvas.getContext("2d");
  const nicknameInput = $("#nickname");
  const loginError = $("#login-error");

  const PLANETS = {
    starter: { name: "Стартовая", location: "Главная площадь", sky: ["#10183d", "#24245c"], ground: "#493b83", glow: "#8e82ff" },
    club: { name: "Клуб", location: "Танцпол", sky: ["#241039", "#64285d"], ground: "#713a79", glow: "#ff7bc7" },
    beach: { name: "Пляж", location: "Берег океана", sky: ["#06344e", "#167b91"], ground: "#b47a54", glow: "#74e5df" }
  };
  const skins = ["#f4c7a1", "#c9875b", "#75452f"];
  const suits = ["#6d7cff", "#ef6c9b", "#35bca5"];
  const state = {
    me: null, players: new Map(), planet: "starter", selected: null, customPlanetObjects: [], unreadChat: 0,
    stars: [], chat: [], roomEvents: [], unreadEvents: 0, width: 0, height: 0, dpr: 1, toastTimer: null, movementFrame: 0,
    joystick: { active: false, pointerId: null, dx: 0, dy: 0, lastSentAt: 0 },
    auraQuality: localStorage.getItem("nexora-aura-quality") === "low" ? "low" : "high"
  };

  const customObjectAtlas = new Image();
  const customObjectTiles = Object.freeze({
    tree:[0,0], bench:[1,0], fountain:[2,0], lamp:[3,0],
    flowerbed:[0,1], kiosk:[1,1], palm:[2,1], beach_chair:[3,1],
    club_table:[0,2], dj_booth:[1,2], sofa:[2,2], plant:[3,2]
  });
  customObjectAtlas.decoding = "async";
  customObjectAtlas.onload = () => { if (state.customPlanetObjects.length) drawScene(); };
  customObjectAtlas.src = "/assets/sprites/props/nexora-world-props-atlas.svg";

  const HEAD_PRESETS = [
    { name: "Классика", skin: "#f4c7a1", hair: "short", hairColor: "#30233d" },
    { name: "Каштан", skin: "#c9875b", hair: "short", hairColor: "#6b432c" },
    { name: "Блонд", skin: "#f4c7a1", hair: "long", hairColor: "#e5c07b" },
    { name: "Каре", skin: "#f4c7a1", hair: "bob", hairColor: "#bd5de5" },
    { name: "Кудри", skin: "#75452f", hair: "curly", hairColor: "#30233d" },
    { name: "Хвост", skin: "#c9875b", hair: "ponytail", hairColor: "#e9eef8" }
  ];
  const BODY_PRESETS = [
    { name: "Повседневное", outfit: "casual", suit: "#6d7cff", shoes: "sneakers" },
    { name: "Худи", outfit: "hoodie", suit: "#35bca5", shoes: "sneakers" },
    { name: "Куртка", outfit: "jacket", suit: "#ef6c9b", shoes: "boots" },
    { name: "Платье", outfit: "dress", suit: "#bd7bdc", shoes: "heels" },
    { name: "Пляжное", outfit: "beach", suit: "#35bca5", shoes: "sandals" },
    { name: "Клубное", outfit: "club", suit: "#6d7cff", shoes: "boots" }
  ];
  let selectedHead = 0;
  let selectedBody = 0;
  function avatarSettings() {
    const head = HEAD_PRESETS[selectedHead], body = BODY_PRESETS[selectedBody];
    return {
      gender: $("#gender").value,
      skin: head.skin, hair: head.hair, hairColor: head.hairColor,
      outfit: body.outfit, suit: body.suit, shoes: body.shoes,
      accessory: "none"
    };
  }
  function updateAppearanceLabels() {
    $("#head-style-name").textContent = HEAD_PRESETS[selectedHead].name;
    $("#body-style-name").textContent = BODY_PRESETS[selectedBody].name;
  }
  $("#head-prev").addEventListener("click", () => { selectedHead = (selectedHead - 1 + HEAD_PRESETS.length) % HEAD_PRESETS.length; updateAppearanceLabels(); preview(); });
  $("#head-next").addEventListener("click", () => { selectedHead = (selectedHead + 1) % HEAD_PRESETS.length; updateAppearanceLabels(); preview(); });
  $("#body-prev").addEventListener("click", () => { selectedBody = (selectedBody - 1 + BODY_PRESETS.length) % BODY_PRESETS.length; updateAppearanceLabels(); preview(); });
  $("#body-next").addEventListener("click", () => { selectedBody = (selectedBody + 1) % BODY_PRESETS.length; updateAppearanceLabels(); preview(); });


  function drawAura(target, x, y, scale, type, enabled, quality = "high") {
    if (!enabled || !type || type === "NONE") return;
    const palette = {
      GOLD_SOFT: ["#fff9bd", "#ffd34f", "#f59a2d"],
      GOLD_PREMIUM: ["#fffde0", "#ffd044", "#ff8a24"],
      GREEN: ["#e1ffe8", "#64ff9e", "#16c88b"],
      FIRE_RED: ["#fff0bd", "#ff815f", "#e52c69"],
      VIOLET: ["#f8dcff", "#c17aff", "#713bff"],
      CYAN: ["#e0ffff", "#60edff", "#397cff"],
      PINK: ["#ffe8f8", "#ff83d0", "#bd54ff"]
    };
    const colors = palette[type] || palette.GOLD_SOFT;
    const t = Date.now() / 1000;
    const reduced = quality === "low" || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const pulse = reduced ? 1 : .91 + Math.sin(t * 2.2) * .09;
    const premium = type === "GOLD_PREMIUM" || type === "VIOLET" || type === "FIRE_RED";
    target.save();
    target.translate(x, y);
    target.scale(scale, scale);
    target.globalCompositeOperation = "lighter";

    // Layered volumetric cloud around the full character silhouette.
    for (let layer = 0; layer < (reduced ? 3 : 5); layer++) {
      const drift = reduced ? 0 : Math.sin(t * 1.15 + layer * 1.7) * 3;
      const width = 28 + layer * 5 + (reduced ? 0 : Math.sin(t * 1.8 + layer) * 2);
      const height = 43 + layer * 4;
      const cloud = target.createRadialGradient(0, 0, 5, 0, 0, 58 + layer * 3);
      cloud.addColorStop(0, colors[0] + (layer === 0 ? "45" : "24"));
      cloud.addColorStop(.48, colors[1] + "25");
      cloud.addColorStop(1, colors[1] + "00");
      target.fillStyle = cloud;
      target.globalAlpha = pulse * (layer === 0 ? .9 : .72 - layer * .07);
      target.beginPath();
      target.ellipse(drift, 1, width, height, Math.sin(t + layer) * .035, 0, Math.PI * 2);
      target.fill();
    }

    // Fine contour ribbons give the aura a visible, drawn silhouette.
    target.shadowColor = colors[1];
    target.shadowBlur = reduced ? 8 : (premium ? 24 : 17);
    for (let ribbon = 0; ribbon < (reduced ? 1 : 3); ribbon++) {
      target.globalAlpha = .34 + ribbon * .09;
      target.strokeStyle = ribbon === 0 ? colors[0] : colors[1];
      target.lineWidth = ribbon === 0 ? 2.2 : 1.25;
      target.beginPath();
      for (let step = 0; step <= 48; step++) {
        const a = step / 48 * Math.PI * 2;
        const wobble = reduced ? 0 : Math.sin(a * 5 + t * 2 + ribbon) * 2.2;
        const rx = 25 + ribbon * 4 + wobble;
        const ry = 43 + ribbon * 3 + wobble * .8;
        const px = Math.cos(a) * rx + (reduced ? 0 : Math.sin(t + a * 2 + ribbon) * 2);
        const py = Math.sin(a) * ry + 2;
        if (step === 0) target.moveTo(px, py); else target.lineTo(px, py);
      }
      target.closePath();
      target.stroke();
    }

    // Orbiting sparks and short energy streaks rise around the body.
    const sparks = reduced ? 5 : (premium ? 22 : 16);
    target.shadowBlur = reduced ? 5 : 12;
    for (let i = 0; i < sparks; i++) {
      const phase = reduced ? i * .8 : t * (type === "FIRE_RED" ? 1.2 : .72) + i * 2.17;
      const rise = reduced ? 7 + i * 8 : ((phase * 12 + i * 11) % 66);
      const side = i % 2 ? 1 : -1;
      const px = side * (17 + Math.sin(phase * .8) * 11);
      const py = 30 - rise;
      target.globalAlpha = .28 + (1 - rise / 66) * .68;
      target.strokeStyle = i % 3 ? colors[0] : colors[2];
      target.fillStyle = target.strokeStyle;
      if (i % 3 === 0) {
        target.lineWidth = 1.5;
        target.beginPath();
        target.moveTo(px, py + 4);
        target.lineTo(px + side * 2, py - 4);
        target.stroke();
      } else {
        target.beginPath();
        target.arc(px, py, 1.1 + (i % 3) * .55, 0, Math.PI * 2);
        target.fill();
      }
    }

    // Premium ranks receive flowing flame-like side wisps.
    if (!reduced && premium) {
      for (const side of [-1, 1]) {
        const sway = Math.sin(t * 2.1 + side) * 5;
        target.globalAlpha = .42;
        target.fillStyle = colors[2];
        target.beginPath();
        target.moveTo(side * 19, 27);
        target.bezierCurveTo(side * (34 + sway), 12, side * (19 - sway), -7, side * 29, -28);
        target.bezierCurveTo(side * 25, -8, side * 40, 12, side * 19, 27);
        target.closePath();
        target.fill();
      }
    }
    target.restore();
  }

  function drawAuraHalo(target, x, y, scale, type, enabled, quality = "high") {
    if (!enabled || !type || type === "NONE") return;
    const palette = {
      GOLD_SOFT: ["#fffbd0", "#ffd45c"],
      GOLD_PREMIUM: ["#fffde7", "#ffc52f"],
      GREEN: ["#effff1", "#70ffad"],
      FIRE_RED: ["#fff0c4", "#ff735f"],
      VIOLET: ["#fff0ff", "#c27aff"],
      CYAN: ["#e8ffff", "#61eaff"],
      PINK: ["#fff0fa", "#ff82d2"]
    };
    const colors = palette[type] || palette.GOLD_SOFT;
    const t = Date.now() / 1000;
    const reduced = quality === "low" || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const count = type === "GOLD_SOFT" ? 1 : type === "GOLD_PREMIUM" ? 2 : type === "GREEN" ? 2 : 3;
    target.save();
    target.translate(x, y);
    target.scale(scale, scale);
    target.globalCompositeOperation = "lighter";
    target.shadowColor = colors[1];
    target.shadowBlur = reduced ? 8 : 20;

    // Distinct, polished golden halo rings floating above the head.
    for (let ring = count - 1; ring >= 0; ring--) {
      const bob = reduced ? 0 : Math.sin(t * 2 + ring * .85) * 2.1;
      const tilt = reduced ? 0 : Math.sin(t * 1.25 + ring) * .12;
      const rx = 12 + ring * 3.7;
      const ry = 4.1 + ring * .8;
      const cy = -49 - ring * 6.3 + bob;
      target.save();
      target.translate(0, cy);
      target.rotate(tilt);
      target.globalAlpha = .9 - ring * .12;
      target.lineWidth = ring === 0 ? 2.6 : 1.8;
      target.strokeStyle = colors[0];
      target.beginPath();
      target.ellipse(0, 0, rx + 2, ry + 1.2, 0, 0, Math.PI * 2);
      target.stroke();
      target.globalAlpha = .92 - ring * .14;
      target.lineWidth = 1.2;
      target.strokeStyle = colors[1];
      target.beginPath();
      target.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      target.stroke();
      target.globalAlpha = .7;
      target.fillStyle = colors[0];
      target.beginPath();
      target.arc(-rx * .72, -.4, 1.15, 0, Math.PI * 2);
      target.arc(rx * .72, .4, 1.15, 0, Math.PI * 2);
      target.fill();
      target.restore();
    }

    // Tiny glints travel around the upper halo.
    if (!reduced) {
      for (let i = 0; i < 4; i++) {
        const a = t * .9 + i * Math.PI / 2;
        const px = Math.cos(a) * 20;
        const py = -52 + Math.sin(a) * 5;
        target.globalAlpha = .45 + (Math.sin(t * 3 + i) + 1) * .25;
        target.fillStyle = colors[0];
        target.beginPath();
        target.arc(px, py, 1.1, 0, Math.PI * 2);
        target.fill();
      }
    }
    target.restore();
  }

  function drawAvatar(target,x,y,scale,avatar,facing=1,emotion=null,moving=false){
    if(window.NexoraSpriteEngine?.draw(target,x,y,scale,avatar,"down",moving,emotion))return;
    const skin=avatar?.skin||skins[0],suit=avatar?.suit||suits[0],female=avatar?.gender==="female",hair=avatar?.hair||"short",hairColor=avatar?.hairColor||"#30233d",shoes=avatar?.shoes||"sneakers",accessory=avatar?.accessory||"none",time=Date.now()/1000,phase=moving?Math.sin(time*13):0,bob=emotion==="dance"?Math.sin(time*9)*2.8:moving?Math.abs(Math.sin(time*13))*1.5:Math.sin(time*2.2)*.65;
    const shade=(hex,amount)=>{const raw=String(hex).replace("#","");if(!/^[0-9a-f]{6}$/i.test(raw))return hex;const n=parseInt(raw,16),r=Math.max(0,Math.min(255,(n>>16)+amount)),g=Math.max(0,Math.min(255,((n>>8)&255)+amount)),b=Math.max(0,Math.min(255,(n&255)+amount));return "#"+[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join("");};
    const path=(points,fill,stroke="#222642",line=1.2)=>{target.beginPath();points.forEach((p,i)=>i?target.lineTo(p[0],p[1]):target.moveTo(p[0],p[1]));target.closePath();if(fill){target.fillStyle=fill;target.fill();}if(stroke){target.lineWidth=line;target.strokeStyle=stroke;target.stroke();}};
    const rounded=(x1,y1,w,h,r,fill,stroke=null,line=1)=>{target.beginPath();target.roundRect(x1,y1,w,h,r);if(fill){target.fillStyle=fill;target.fill();}if(stroke){target.lineWidth=line;target.strokeStyle=stroke;target.stroke();}};
    const gradient=(x1,y1,x2,y2,a,b)=>{const g=target.createLinearGradient(x1,y1,x2,y2);g.addColorStop(0,a);g.addColorStop(1,b);return g;};
    target.save();target.translate(x,y+bob);target.scale(scale*facing,scale);
    // Ground shadow and soft character rim light.
    target.fillStyle="rgba(3,7,24,.42)";target.beginPath();target.ellipse(0,40,17+Math.abs(phase)*.8,4.5,0,0,Math.PI*2);target.fill();
    target.save();target.globalAlpha=.22;target.shadowColor=suit;target.shadowBlur=15;target.strokeStyle=suit;target.lineWidth=2;target.beginPath();target.ellipse(0,-1,19,39,0,0,Math.PI*2);target.stroke();target.restore();

    // Legs, shaped trousers and articulated shoes.
    const legSwing=moving?phase*3:emotion==="dance"?Math.sin(time*9)*2:0;
    target.lineCap="round";target.lineJoin="round";
    target.strokeStyle="#20243c";target.lineWidth=9;target.beginPath();target.moveTo(-6,16);target.lineTo(-7-legSwing,31);target.moveTo(6,16);target.lineTo(7+legSwing,31);target.stroke();
    target.strokeStyle=gradient(-8,15,8,31,shade(suit,-45),shade(suit,-68));target.lineWidth=7;target.beginPath();target.moveTo(-6,16);target.lineTo(-7-legSwing,30);target.moveTo(6,16);target.lineTo(7+legSwing,30);target.stroke();
    target.fillStyle=shoes==="boots"?"#34394e":shoes==="heels"?"#a74f7e":"#e9edff";
    target.strokeStyle="#252a45";target.lineWidth=1.1;
    target.beginPath();target.roundRect(-15-legSwing,29,13,7,shoes==="heels"?3:4);target.roundRect(2+legSwing,29,13,7,shoes==="heels"?3:4);target.fill();target.stroke();
    target.fillStyle="rgba(255,255,255,.55)";target.fillRect(-12-legSwing,30,6,1.2);target.fillRect(5+legSwing,30,6,1.2);
    if(shoes==="boots"){target.strokeStyle="#8d9abb";target.lineWidth=1;target.beginPath();target.moveTo(-12-legSwing,33);target.lineTo(-6-legSwing,33);target.moveTo(5+legSwing,33);target.lineTo(11+legSwing,33);target.stroke();}
    if(shoes==="heels"){target.strokeStyle="#f2c4dd";target.lineWidth=1.5;target.beginPath();target.moveTo(-5-legSwing,34);target.lineTo(-4-legSwing,37);target.moveTo(12+legSwing,34);target.lineTo(13+legSwing,37);target.stroke();}

    // Arms are drawn behind the jacket, with sleeves and cuffs.
    const waving=emotion==="wave",armLift=waving?1:0;
    target.lineCap="round";target.strokeStyle="#282b48";target.lineWidth=8;target.beginPath();
    target.moveTo(-11,-2);target.lineTo(-18,13+phase*2);target.moveTo(11,-2);target.lineTo(waving?19:18,waving?-17:13-phase*2);target.stroke();
    target.strokeStyle=gradient(-18,-2,18,17,shade(suit,20),shade(suit,-35));target.lineWidth=6;
    target.beginPath();target.moveTo(-11,-2);target.lineTo(-18,12+phase*2);target.moveTo(11,-2);target.lineTo(waving?19:18,waving?-16:12-phase*2);target.stroke();
    target.strokeStyle=shade(suit,-48);target.lineWidth=2;target.beginPath();target.moveTo(-15,6+phase);target.lineTo(-20,12+phase*2);if(!waving){target.moveTo(15,6-phase);target.lineTo(20,12-phase*2);}target.stroke();

    // Neck, jacket silhouette, inner shirt and waist details.
    rounded(-4,-12,8,13,3,shade(skin,-8),"#6c4b4d",.8);
    path([[-13,-7],[13,-7],[16,17],[10,23],[-10,23],[-16,17]],gradient(-16,-8,16,23,shade(suit,28),shade(suit,-42)),"#252943",1.5);
    path([[-8,-6],[0,1],[8,-6],[5,12],[0,17],[-5,12]],"#f5f0ff","#b8b6d5",.8);
    path([[-3,-4],[0,3],[3,-4],[1,10],[0,13],[-1,10]],"#d9c9ff",null);
    target.strokeStyle="rgba(255,255,255,.35)";target.lineWidth=1.1;target.beginPath();target.moveTo(-12,-2);target.lineTo(-10,15);target.moveTo(12,-2);target.lineTo(10,15);target.stroke();
    target.fillStyle="#f5d58a";target.beginPath();target.arc(0,8,1.5,0,Math.PI*2);target.fill();
    rounded(-11,17,22,3,1.5,shade(suit,-32),"rgba(255,255,255,.2)",.6);
    rounded(-3,18,6,4,1,"#d7b76d","#705a42",.7);
    if(female){
      path([[-12,-5],[12,-5],[18,20],[13,24],[-13,24],[-18,20]],gradient(-15,-4,15,24,shade(suit,28),shade(suit,-38)),"#252943",1.4);
      target.strokeStyle="rgba(255,255,255,.22)";target.lineWidth=1;target.beginPath();target.moveTo(-11,1);target.lineTo(-14,18);target.moveTo(11,1);target.lineTo(14,18);target.stroke();
      target.fillStyle="#f3d7eb";target.beginPath();target.arc(0,21,1.2,0,Math.PI*2);target.fill();
    }
    // Hands and fingers.
    target.fillStyle=skin;target.strokeStyle=shade(skin,-35);target.lineWidth=.8;
    target.beginPath();target.arc(-19,14+phase*2,3.8,0,Math.PI*2);target.arc(waving?20:18,waving?-18:14-phase*2,3.8,0,Math.PI*2);target.fill();target.stroke();
    if(waving){target.strokeStyle=skin;target.lineWidth=1.5;target.beginPath();for(let i=0;i<3;i++){target.moveTo(19+i*1.2,-19);target.lineTo(17+i*2,-24-i*1.4);}target.stroke();}

    // Head, ears and face shading.
    target.fillStyle=shade(skin,-28);target.beginPath();target.arc(-12,-19,3.7,0,Math.PI*2);target.arc(12,-19,3.7,0,Math.PI*2);target.fill();
    target.fillStyle=skin;target.beginPath();target.ellipse(0,-21,13.2,15.2,0,0,Math.PI*2);target.fill();target.strokeStyle=shade(skin,-32);target.lineWidth=1;target.stroke();
    const faceShade=target.createLinearGradient(-10,-32,10,-7);faceShade.addColorStop(0,"rgba(255,255,255,.22)");faceShade.addColorStop(1,"rgba(89,43,38,.13)");target.fillStyle=faceShade;target.beginPath();target.ellipse(0,-21,12.2,14.2,0,0,Math.PI*2);target.fill();
    target.fillStyle="rgba(255,255,255,.32)";target.beginPath();target.ellipse(-5,-29,4,2.4,-.45,0,Math.PI*2);target.fill();
    // Eyebrows, eyes, pupils and catchlights.
    target.strokeStyle=shade(hairColor,-12);target.lineWidth=1.4;target.lineCap="round";target.beginPath();target.moveTo(-8,-26);target.quadraticCurveTo(-5,-28,-2.5,-26);target.moveTo(2.5,-26);target.quadraticCurveTo(5,-28,8,-26);target.stroke();
    target.fillStyle="#fff";target.beginPath();target.ellipse(-4.5,-22,2.5,3.1,0,0,Math.PI*2);target.ellipse(4.5,-22,2.5,3.1,0,0,Math.PI*2);target.fill();
    target.fillStyle="#493a48";target.beginPath();target.ellipse(-4.2,-21.5,1.25,2.1,0,0,Math.PI*2);target.ellipse(4.2,-21.5,1.25,2.1,0,0,Math.PI*2);target.fill();
    target.fillStyle="#fff";target.beginPath();target.arc(-4.7,-22.5,.65,0,Math.PI*2);target.arc(3.7,-22.5,.65,0,Math.PI*2);target.fill();
    target.strokeStyle=shade(skin,-34);target.lineWidth=.8;target.beginPath();target.moveTo(0,-20);target.quadraticCurveTo(-1,-16,1,-16);target.stroke();
    target.fillStyle="rgba(242,111,139,.25)";target.beginPath();target.ellipse(-8,-15,2.6,1.4,0,0,Math.PI*2);target.ellipse(8,-15,2.6,1.4,0,0,Math.PI*2);target.fill();
    target.strokeStyle="#914e59";target.lineWidth=1.25;target.beginPath();
    if(emotion==="sad")target.arc(0,-10,3,Math.PI+.15,Math.PI*2-.15);
    else if(emotion==="surprise")target.ellipse(0,-11,1.7,2.4,0,0,Math.PI*2);
    else if(emotion==="angry"){target.moveTo(-2,-11);target.quadraticCurveTo(0,-9,2,-11);}
    else target.arc(0,-13,3,.18,Math.PI-.18);
    target.stroke();

    // Hair base and three supported silhouettes.
    target.fillStyle=hairColor;target.strokeStyle=shade(hairColor,-35);target.lineWidth=1;
    if(hair==="long"){
      target.beginPath();target.moveTo(-12,-24);target.quadraticCurveTo(-16,-38,0,-38);target.quadraticCurveTo(16,-37,13,-22);target.lineTo(15,8);target.quadraticCurveTo(11,13,8,5);target.lineTo(7,-9);target.lineTo(-8,-9);target.lineTo(-9,6);target.quadraticCurveTo(-14,13,-15,5);target.closePath();target.fill();target.stroke();
      target.fillStyle=hairColor;target.beginPath();target.arc(0,-31,13,Math.PI,Math.PI*2);target.quadraticCurveTo(12,-29,8,-25);target.quadraticCurveTo(2,-30,-2,-26);target.quadraticCurveTo(-8,-29,-13,-23);target.closePath();target.fill();target.stroke();
      target.strokeStyle="rgba(255,255,255,.22)";target.lineWidth=1;target.beginPath();target.moveTo(-11,-10);target.quadraticCurveTo(-13,-1,-11,4);target.moveTo(10,-10);target.quadraticCurveTo(12,-1,11,4);target.stroke();
    }else if(hair==="spiky"){
      path([[-13,-22],[-16,-34],[-8,-30],[-3,-40],[2,-31],[10,-37],[14,-25],[11,-17],[5,-25],[0,-22],[-6,-25]],hairColor,shade(hairColor,-35),1);
      target.strokeStyle="rgba(255,255,255,.25)";target.lineWidth=1;target.beginPath();target.moveTo(-8,-31);target.lineTo(-3,-37);target.moveTo(3,-30);target.lineTo(9,-34);target.stroke();
    }else{
      target.beginPath();target.arc(0,-26,14,Math.PI,Math.PI*2);target.quadraticCurveTo(15,-24,12,-15);target.quadraticCurveTo(7,-22,2,-18);target.quadraticCurveTo(-5,-24,-12,-16);target.quadraticCurveTo(-15,-23,-13,-29);target.closePath();target.fill();target.stroke();
      target.strokeStyle="rgba(255,255,255,.25)";target.lineWidth=1.1;target.beginPath();target.arc(-2,-28,9,Math.PI*1.08,Math.PI*1.62);target.stroke();
    }

    // Jewelry and selected accessory.
    if(female){target.fillStyle="#f4b5dc";target.strokeStyle="#9e5f94";target.lineWidth=.6;target.beginPath();target.arc(-12,-16,1.8,0,Math.PI*2);target.arc(12,-16,1.8,0,Math.PI*2);target.fill();target.stroke();}
    if(accessory==="glasses"){
      target.strokeStyle="#29304d";target.lineWidth=1.5;target.fillStyle="rgba(153,211,255,.18)";
      target.beginPath();target.roundRect(-9,-25,8,7,2);target.roundRect(1,-25,8,7,2);target.moveTo(-1,-22);target.lineTo(1,-22);target.stroke();target.fill();
    }else if(accessory==="headphones"){
      target.strokeStyle="#b8c9ff";target.lineWidth=3;target.beginPath();target.arc(0,-22,16,Math.PI,Math.PI*2);target.stroke();rounded(-16,-23,4,9,2,"#7588d5","#d7e1ff",.8);rounded(12,-23,4,9,2,"#7588d5","#d7e1ff",.8);
    }else if(accessory==="crown"){
      target.shadowColor="#ffdb74";target.shadowBlur=7;path([[-10,-34],[-8,-43],[-3,-37],[0,-45],[4,-37],[9,-42],[10,-33]],gradient(-10,-45,10,-33,"#fff2a7","#d99a27"),"#8a5a25",1);target.shadowBlur=0;
      target.fillStyle="#fff3c3";target.beginPath();target.arc(0,-40,1.5,0,Math.PI*2);target.fill();
    }
    // Collar pin and animated emotion marker.
    target.fillStyle="#f7dc91";target.beginPath();target.arc(0,3,1.2,0,Math.PI*2);target.fill();
    const icons={wave:"👋",kiss:"💋",dance:"♪",smile:"😊",sad:"😢",laugh:"😂",surprise:"😮",love:"💗",angry:"💢",blush:"☺",sleep:"💤",music:"♫"};
    if(emotion&&icons[emotion]){target.save();target.font="15px sans-serif";target.textAlign="center";target.shadowColor="#11152f";target.shadowBlur=4;target.fillText(icons[emotion],19,-35);target.restore();}
    target.restore();
  }

  function preview() {
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    drawAvatar(previewCtx, previewCanvas.width / 2, previewCanvas.height - 16, 2.05, avatarSettings(), 1, null);
    const maleCanvas = $("#gender-male-preview"), femaleCanvas = $("#gender-female-preview");
    if (maleCanvas) { const target=maleCanvas.getContext("2d"); target.clearRect(0,0,maleCanvas.width,maleCanvas.height); drawAvatar(target,maleCanvas.width/2,maleCanvas.height-10,1.35,{...avatarSettings(),gender:"male"},1,null); }
    if (femaleCanvas) { const target=femaleCanvas.getContext("2d"); target.clearRect(0,0,femaleCanvas.width,femaleCanvas.height); drawAvatar(target,femaleCanvas.width/2,femaleCanvas.height-10,1.35,{...avatarSettings(),gender:"female"},1,null); }
    document.querySelectorAll("[data-gender]").forEach(button=>{const selected=button.dataset.gender===$("#gender").value;button.classList.toggle("selected",selected);button.setAttribute("aria-pressed",String(selected));});
    $("#register-next").disabled=!$("#gender").value;
  }
  $("#gender").addEventListener("change", preview);
  updateAppearanceLabels();
  document.querySelectorAll("[data-gender]").forEach(button=>button.addEventListener("click",()=>{$("#gender").value=button.dataset.gender;preview();}));
  preview();

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.add("hidden"), 2600);
  }

  function renderRoomEvents(){const list=$("#room-event-list");if(!list)return;list.replaceChildren();if(!state.roomEvents.length){const empty=document.createElement("p");empty.className="room-event-empty";empty.textContent="Здесь появятся события комнаты.";list.append(empty);}state.roomEvents.forEach(event=>{const row=document.createElement("article");row.className="room-event-row";const icon=document.createElement("span");icon.className="room-event-icon";icon.textContent=event.icon||"✦";const body=document.createElement("div");const title=document.createElement("strong");title.textContent=event.title;const detail=document.createElement("p");detail.textContent=event.detail;const time=document.createElement("time");time.textContent=new Date(event.time).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});body.append(title,detail,time);row.append(icon,body);list.append(row);});const badge=$("#room-event-count");if(badge){badge.textContent=String(state.unreadEvents);badge.classList.toggle("hidden",state.unreadEvents<1);}}
  function pushRoomEvent(title,detail,icon="✦"){state.roomEvents.unshift({title:String(title||"Событие"),detail:String(detail||""),icon,time:Date.now()});if(state.roomEvents.length>40)state.roomEvents.length=40;if($("#room-events-panel")?.classList.contains("hidden"))state.unreadEvents+=1;renderRoomEvents();}
  function setConnectionStatus(status,label){const pill=$("#connection-status");if(!pill)return;pill.dataset.state=status;const text=pill.querySelector("span");if(text)text.textContent=label;}

  function createHistoryRow(message) {
    const row = document.createElement("article");
    const isSelf = String(message.playerId) === String(state.me?.id);
    row.className = "history-message" + (isSelf ? " is-self" : "") + (message.system ? " is-system" : "") + (message.whisper ? " is-whisper" : "");

    const name = document.createElement("button");
    name.type = "button";
    name.className = "history-author";
    name.textContent = message.whisper ? "Личное" : (message.system ? "✦ NEXORA" : String(message.nickname || "Игрок"));
    if (!message.whisper && !message.system) {
      name.addEventListener("click", () => {
        const player = [...state.players.values()].find(item => item.nickname === message.nickname);
        if (player) openProfile(player);
      });
    } else {
      name.disabled = true;
    }

    const body = document.createElement("span");
    body.className = "history-text";
    body.textContent = String(message.text || "");

    const time = document.createElement("time");
    const timestamp = Number(message.time);
    time.textContent = new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    row.append(name, body, time);
    return row;
  }

  function updateChatUnread() {
    const badge = $("#chat-new-count");
    if (!badge) return;
    badge.textContent = state.unreadChat + " новых";
    badge.classList.toggle("hidden", state.unreadChat < 1);
  }

  function addHistory(message, whisper = false) {
    const container = $("#chat-history");
    if (!container) return;
    const entry = { ...message, whisper };
    if (entry.id && state.chat.some(item => String(item.id) === String(entry.id))) return;
    const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 32;
    state.chat.push(entry);
    if (state.chat.length > 80) state.chat.shift();
    container.append(createHistoryRow(entry));
    while (container.children.length > 80) container.firstElementChild.remove();
    if (wasAtBottom) {
      container.scrollTop = container.scrollHeight;
      state.unreadChat = 0;
    } else if (String(entry.playerId) !== String(state.me?.id)) {
      state.unreadChat += 1;
    }
    updateChatUnread();
  }

  function renderHistory(keepBottom = true) {
    const container = $("#chat-history");
    if (!container) return;
    const fragment = document.createDocumentFragment();
    state.chat.slice(-80).forEach(message => fragment.append(createHistoryRow(message)));
    container.replaceChildren(fragment);
    if (keepBottom) {
      container.scrollTop = container.scrollHeight;
      state.unreadChat = 0;
    }
    updateChatUnread();
  }

  $("#clear-chat-button")?.addEventListener("click", () => {
    const before = state.chat.length;
    // Clear only public room messages in this browser. Private whispers stay intact.
    state.chat = state.chat.filter(message => message.whisper);
    state.unreadChat = 0;
    renderHistory();
    const removed = before - state.chat.length;
    showToast(removed ? "История общего чата очищена только у вас." : "Общий чат уже пуст.");
  });

  $("#chat-history")?.addEventListener("scroll", () => {
    const container = $("#chat-history");
    if (container.scrollHeight - container.scrollTop - container.clientHeight < 24) {
      state.unreadChat = 0;
      updateChatUnread();
    }
  }, { passive: true });

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = rect.width;
    state.height = rect.height;
    canvas.width = Math.round(rect.width * state.dpr);
    canvas.height = Math.round(rect.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.stars = Array.from({ length: Math.max(45, Math.floor(rect.width * rect.height / 6500)) }, () => ({
      x: Math.random() * rect.width,
      y: Math.random() * rect.height * .72,
      r: Math.random() * 1.5 + .3,
      a: Math.random() * .65 + .2
    }));
  }
  window.addEventListener("resize", resize);

  function surfaceY(x) {
    const w = state.width;
    const h = state.height;
    const normalized = (x / w - .5) * 2;
    return h * .82 - (1 - normalized * normalized) * h * .16;
  }

  function drawPlanetBackdrop(){const w=state.width,h=state.height,t=Date.now()/1000;ctx.save();if(state.planet==="starter"){const moon=ctx.createRadialGradient(w*.76,h*.25,4,w*.76,h*.25,Math.min(w,h)*.16);moon.addColorStop(0,"rgba(210,220,255,.9)");moon.addColorStop(.72,"rgba(135,151,222,.24)");moon.addColorStop(1,"rgba(135,151,222,0)");ctx.fillStyle=moon;ctx.beginPath();ctx.arc(w*.76,h*.25,Math.min(w,h)*.16,0,Math.PI*2);ctx.fill();for(let i=0;i<12;i++){const bw=24+(i%4)*13,bh=h*(.12+((i*7)%5)*.035),bx=i*w/11-8;ctx.fillStyle=i%2?"rgba(23,34,79,.72)":"rgba(31,42,93,.78)";ctx.fillRect(bx,h*.69-bh,bw,bh);ctx.fillStyle="rgba(151,190,255,.38)";for(let wy=h*.69-bh+9;wy<h*.68;wy+=13)for(let wx=bx+6;wx<bx+bw-4;wx+=11)ctx.fillRect(wx,wy,3,4);}}else if(state.planet==="club"){for(let i=0;i<5;i++){const x=w*(.12+i*.19),top=h*(.16+(i%2)*.1);ctx.globalAlpha=.16+Math.sin(t*1.8+i)*.05;ctx.strokeStyle=i%2?"#ff75d1":"#68eaff";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x+Math.sin(t+i)*w*.08,h*.68);ctx.stroke();}ctx.globalAlpha=.3;ctx.fillStyle="#f36acb";ctx.beginPath();ctx.ellipse(w*.5,h*.61,w*.36,12,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;for(let i=0;i<7;i++){ctx.fillStyle=i%2?"rgba(16,21,57,.78)":"rgba(35,18,65,.8)";ctx.fillRect(i*w/7,h*(.47+(i%3)*.035),w/10,h*.2);}}else{const sun=ctx.createRadialGradient(w*.78,h*.22,2,w*.78,h*.22,Math.min(w,h)*.2);sun.addColorStop(0,"rgba(255,239,183,.92)");sun.addColorStop(.55,"rgba(255,196,133,.25)");sun.addColorStop(1,"rgba(255,196,133,0)");ctx.fillStyle=sun;ctx.beginPath();ctx.arc(w*.78,h*.22,Math.min(w,h)*.2,0,Math.PI*2);ctx.fill();ctx.fillStyle="rgba(255,255,255,.12)";for(let i=0;i<4;i++){const x=((i*.31+t*.012)%1.25-.1)*w,y=h*(.25+i*.075);ctx.beginPath();ctx.ellipse(x,y,34,8,0,0,Math.PI*2);ctx.ellipse(x+22,y-4,22,7,0,0,Math.PI*2);ctx.fill();}for(const px of [w*.12,w*.9]){ctx.strokeStyle="rgba(29,67,61,.78)";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(px,h*.73);ctx.quadraticCurveTo(px+18,h*.48,px+2,h*.34);ctx.stroke();for(let j=0;j<5;j++){ctx.strokeStyle="rgba(33,89,75,.88)";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(px+2,h*.36);ctx.quadraticCurveTo(px+(j-2)*15,h*.28,px+(j-2)*27,h*.34);ctx.stroke();}}ctx.fillStyle="rgba(116,222,220,.18)";ctx.fillRect(0,h*.62,w,h*.07);ctx.fillStyle="rgba(255,255,255,.22)";for(let i=0;i<8;i++){const x=((i*.17+t*.02)%1.15-.05)*w;ctx.fillRect(x,h*(.64+(i%3)*.018),28,1);}}ctx.restore();}

  function beginPlayerMovement(player,targetX,targetY){
    if(!player)return;
    const now=performance.now(),fromX=Number.isFinite(player.renderX)?player.renderX:player.x,fromY=Number.isFinite(player.renderY)?player.renderY:(player.y??.82);
    const distance=Math.hypot((targetX-fromX)*Math.max(1,state.width),(targetY-fromY)*Math.max(1,state.height));
    player.moveFromX=fromX;player.moveFromY=fromY;player.moveToX=targetX;player.moveToY=targetY;player.moveStartedAt=now;
    player.moveDuration=Math.max(180,Math.min(2400,distance/185*1000));const dx=targetX-fromX,dy=targetY-fromY;const screenDx=dx*Math.max(1,state.width),screenDy=dy*Math.max(1,state.height);player.direction=Math.abs(screenDx)>Math.abs(screenDy)?(screenDx>=0?"right":"left"):(screenDy>=0?"down":"up");if(Math.abs(screenDx)>2)player.facing=screenDx>=0?1:-1;
    player.x=targetX;player.y=targetY;player.moving=distance>3;
    if(!player.moving){player.renderX=targetX;player.renderY=targetY;}
  }
  function advancePlayerMovement(player,now){
    if(!Number.isFinite(player.moveStartedAt)||!Number.isFinite(player.moveDuration)){player.renderX??=player.x;player.renderY??=player.y??.82;return;}
    const progress=Math.min(1,(now-player.moveStartedAt)/player.moveDuration),eased=progress*progress*(3-2*progress);
    player.renderX=player.moveFromX+(player.moveToX-player.moveFromX)*eased;
    player.renderY=player.moveFromY+(player.moveToY-player.moveFromY)*eased;
    if(progress>=1){player.renderX=player.moveToX;player.renderY=player.moveToY;player.moving=false;player.moveStartedAt=null;player.moveDuration=null;}else player.moving=true;
  }

  function drawCustomPlanetObject(ctx,item,w,h){
    const tile=customObjectTiles[item.code];
    const x=Number(item.x)*w,y=Number(item.y)*h;
    const scale=Math.max(.45,Math.min(1.6,Number(item.scale)||1));
    const size=78*scale;
    ctx.save();ctx.translate(x,y);ctx.rotate((Number(item.rotation)||0)*Math.PI/180);
    ctx.fillStyle="rgba(5,10,28,.24)";ctx.beginPath();ctx.ellipse(0,2,size*.39,size*.09,0,0,Math.PI*2);ctx.fill();
    if(tile&&customObjectAtlas.complete&&customObjectAtlas.naturalWidth){
      ctx.drawImage(customObjectAtlas,tile[0]*256,tile[1]*256,256,256,-size*.5,-size*.91,size,size);
    }else{
      ctx.fillStyle="#8c8bd8";ctx.strokeStyle="#e1dcff";ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(0,-size*.38,size*.22,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
    ctx.restore();
  }

  function drawScene() {
    if (gameScreen.classList.contains("hidden")) return;
    const w = state.width, h = state.height;
    const palette = PLANETS[state.planet] || { name: "Авторская планета", location: "Космическое пространство", sky: ["#11183b", "#29245f"], ground: "#51458a", glow: "#a28cff" };
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, palette.sky[0]);
    gradient.addColorStop(1, palette.sky[1]);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);

    state.stars.forEach((star, index) => {
      ctx.globalAlpha = star.a * (.75 + Math.sin(Date.now() / 900 + index) * .2);
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    drawPlanetBackdrop();

    const glow = ctx.createRadialGradient(w / 2, h * .8, 8, w / 2, h * .8, w * .7);
    glow.addColorStop(0, palette.glow + "44");
    glow.addColorStop(1, palette.glow + "00");
    ctx.fillStyle = glow; ctx.fillRect(0, h * .45, w, h * .55);

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) ctx.lineTo(x, surfaceY(x));
    ctx.lineTo(w, h); ctx.closePath();
    ctx.fillStyle = palette.ground; ctx.fill();
    ctx.strokeStyle = palette.glow; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) {
      if (x === 0) ctx.moveTo(x, surfaceY(x)); else ctx.lineTo(x, surfaceY(x));
    }
    ctx.stroke();

    // Detailed, planet-specific world geometry is rendered beneath player avatars.
    window.NexoraWorldScene?.draw(ctx, w, h, state.planet, Date.now());

    // Visible perspective frame around the walkable floor. Server coordinates are clamped to the same room.
    ctx.save();ctx.strokeStyle="rgba(220,225,255,.24)";ctx.lineWidth=1.5;ctx.setLineDash([7,6]);
    ctx.beginPath();ctx.moveTo(w*.025,h*.615);ctx.lineTo(w*.975,h*.615);ctx.lineTo(w*.992,h*.91);ctx.lineTo(w*.008,h*.91);ctx.closePath();ctx.stroke();
    ctx.setLineDash([]);ctx.restore();
    // All world props are rendered first. Avatars are always on the foreground layer,
    // so trees, lamps, benches and custom decorations can never cover a character.
    const props = window.NexoraWorldObjects?.get(state.planet,w,h,Date.now()) || [];
    const customProps=String(state.planet).startsWith("custom-")?state.customPlanetObjects.map(object=>({depth:Number(object.y),custom:object})):[];
    props.slice().sort((a,b)=>(a.depth??0)-(b.depth??0)).forEach(object=>window.NexoraWorldObjects?.render(ctx,[object]));
    customProps.sort((a,b)=>a.depth-b.depth).forEach(item=>drawCustomPlanetObject(ctx,item.custom,w,h));

    const now = performance.now();
    const orderedPlayers=[...state.players.values()].sort((a,b)=>(a.renderY??a.y??.82)-(b.renderY??b.y??.82));
    orderedPlayers.forEach((player) => {
      advancePlayerMovement(player, now);
      const drawX = (player.renderX ?? player.x) * w;
      // Keep every avatar on one shared ground line. The former name position becomes the feet line.
      const depth = .72;
      const scale = .78 + ((.82-.60)/.26)*.24;
      const y = depth*h;
      const avatarGroundY = y + 53*scale;
      const isMe = String(player.id) === String(state.me?.id);
      const emotion = player.emotion?.until > Date.now() ? player.emotion.type : null;
      if(player.bubble?.until>Date.now()){
        const bubbleText=String(player.bubble.text||"");ctx.save();ctx.font="11px sans-serif";
        const maxTextWidth=Math.max(48,Math.min(220,w-44));const words=bubbleText.split(/\s+/);const lines=[];let line="";
        words.forEach(word=>{const next=line?line+" "+word:word;if(ctx.measureText(next).width>maxTextWidth&&line){lines.push(line);line=word;}else line=next;});
        if(line)lines.push(line);const visibleLines=lines.slice(0,3);if(lines.length>3)visibleLines[2]=visibleLines[2].replace(/\s+$/,"")+"…";
        const bubbleWidth=Math.min(w-20,Math.max(76,...visibleLines.map(item=>ctx.measureText(item).width+20)));
        const bubbleHeight=18+visibleLines.length*14;const bubbleX=Math.max(10,Math.min(w-bubbleWidth-10,drawX-bubbleWidth/2));
        const bubbleY=Math.max(8,Math.min(h-bubbleHeight-8,avatarGroundY-119*scale-bubbleHeight+29));
        ctx.fillStyle="rgba(255,255,255,.97)";roundRect(ctx,bubbleX,bubbleY,bubbleWidth,bubbleHeight,10);ctx.fill();
        ctx.fillStyle="#1a2146";ctx.textAlign="center";visibleLines.forEach((item,index)=>ctx.fillText(item,bubbleX+bubbleWidth/2,bubbleY+15+index*14,maxTextWidth));ctx.textAlign="start";ctx.restore();
      }
      if(String(state.selected)===String(player.id)){
        ctx.save();ctx.strokeStyle="#e7dcff";ctx.lineWidth=2;ctx.shadowColor="#a58cff";ctx.shadowBlur=16;
        ctx.beginPath();ctx.ellipse(drawX,avatarGroundY-31*scale,25*scale,46*scale,0,0,Math.PI*2);ctx.stroke();ctx.restore();
      }
      const auraCenterY=avatarGroundY-28*scale;
      drawAura(ctx,drawX,auraCenterY,scale,player.auraType,player.auraEnabled,state.auraQuality);
      const spriteDirection=player.direction||"down";
      const spriteDrawn=window.NexoraSpriteEngine?.draw(ctx,drawX,avatarGroundY,scale,player.avatar,spriteDirection,Boolean(player.moving),emotion);
      if(!spriteDrawn)drawAvatar(ctx,drawX,avatarGroundY-37*scale,scale,player.avatar,player.facing||1,emotion,Boolean(player.moving));
      drawAuraHalo(ctx,drawX,auraCenterY,scale,player.auraType,player.auraEnabled,state.auraQuality);

      // Draw exactly one compact nickname plate below the avatar feet.
      const groundNickname=String(player.nickname||"Игрок").trim().slice(0,18);
      ctx.save();
      ctx.font="700 10px sans-serif";
      ctx.textAlign="center";
      ctx.textBaseline="middle";
      const plateWidth=Math.min(150,Math.max(44,ctx.measureText(groundNickname).width+18));
      const plateHeight=18;
      const plateX=Math.max(plateWidth/2+4,Math.min(w-plateWidth/2-4,drawX));
      const plateY=Math.min(h-plateHeight-3,avatarGroundY+5);
      ctx.fillStyle="rgba(8,12,28,.88)";
      roundRect(ctx,plateX-plateWidth/2,plateY,plateWidth,plateHeight,7);
      ctx.fill();
      ctx.strokeStyle="rgba(190,190,255,.28)";
      ctx.lineWidth=1;
      ctx.stroke();
      ctx.fillStyle="#f4f2ff";
      ctx.fillText(groundNickname,plateX,plateY+plateHeight/2,plateWidth-12);
      ctx.restore();

      if(player.action?.until>Date.now()){ctx.save();ctx.font="20px sans-serif";ctx.textAlign="center";ctx.fillText(player.action.icon,drawX+20*scale,avatarGroundY-58*scale-Math.sin(Date.now()/120)*3);ctx.restore();}
      // A single compact nickname plate sits directly below the avatar's feet.
      ctx.save();
      ctx.font="700 10px system-ui, sans-serif";
      const fullNickname=String(player.nickname||"Игрок");
      const maxNameWidth=Math.max(42,Math.min(148,w-24));
      let visibleNickname=fullNickname;
      while(visibleNickname.length>1&&ctx.measureText(visibleNickname).width>maxNameWidth-14) visibleNickname=visibleNickname.slice(0,-2)+"…";
      const nameWidth=Math.min(maxNameWidth,Math.max(42,ctx.measureText(visibleNickname).width+14));
      const nameHeight=17;
      const nameX=Math.max(8,Math.min(w-nameWidth-8,drawX-nameWidth/2));
      const nameY=avatarGroundY+14*scale;
      ctx.fillStyle="rgba(8,12,29,.86)";
      ctx.strokeStyle="rgba(190,183,255,.28)";
      ctx.lineWidth=1;
      ctx.shadowColor="rgba(0,0,0,.3)";
      ctx.shadowBlur=5;
      roundRect(ctx,nameX,nameY,nameWidth,nameHeight,7);
      ctx.fill();ctx.stroke();
      ctx.shadowBlur=0;
      ctx.fillStyle="#f1efff";
      ctx.textAlign="center";
      ctx.textBaseline="middle";
      ctx.fillText(visibleNickname,drawX,nameY+nameHeight/2,maxNameWidth-10);
      ctx.restore();
      // Deliberately do not draw the duplicate nickname above the avatar. Keep the existing ground-level name only.
    });
    requestAnimationFrame(drawScene);
  }

  function roundRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }

  let pendingRegistration = null;
  async function enterWorld() {
    loginError.textContent="";
    const meResponse=await fetch("/api/me",{credentials:"same-origin"});
    if(!meResponse.ok){loginError.textContent="Сначала создай персонажа или войди по коду восстановления.";return false;}
    return new Promise(resolve=>{
      let finished=false;
      const finish=ok=>{if(finished)return;finished=true;socket.off("connect",onConnect);socket.off("connect_error",onError);resolve(ok);};
      const onError=()=>{loginError.textContent="Не удалось подключиться к миру. Проверь соединение и повтори попытку.";finish(false);};
      const onConnect=()=>socket.emit("player:join",{},result=>{
        if(!result?.ok){loginError.textContent=result?.error||"Не удалось загрузить персонажа.";finish(false);return;}
        state.me=result.player;state.planet=result.player.planet;refreshTopbarWallet();setConnectionStatus("online","На связи");
        pushRoomEvent("Добро пожаловать","Вы вошли на планету "+(PLANETS[state.planet]?.name||state.planet)+".","✦");
        loginScreen.classList.add("hidden");gameScreen.classList.remove("hidden");
        $("#planet-title").textContent=(PLANETS[state.planet]||{name:"Авторская планета"}).name;
        $("#room-location-title").textContent=(PLANETS[state.planet]||{location:"Космическое пространство"}).location;
        syncOnlineRoomName();
        resize();requestAnimationFrame(drawScene);refreshSocial();refreshDeveloperAccess();renderRoomPlayers();finish(true);
      });
      socket.once("connect",onConnect);socket.once("connect_error",onError);
      if(socket.connected)onConnect();else socket.connect();
    });
  }
  async function submitLogin(){
    loginError.textContent="";const code=$("#recovery-code").value.trim();
    if(!code){loginError.textContent="Введи код восстановления.";return;}
    const button=$("#login-button");button.disabled=true;
    try{
      const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({recoveryCode:code})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось войти.");
      const entered=await enterWorld();if(!entered)throw new Error(loginError.textContent||"Не удалось загрузить персонажа.");
    }catch(error){loginError.textContent=error.message||"Не удалось выполнить вход.";}finally{button.disabled=false;}
  }
  async function submitRegistration(){
    if(!pendingRegistration)return;const button=$("#confirm-registration");button.disabled=true;$("#age-confirm-error").textContent="";
    try{
      const response=await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({
        nickname:pendingRegistration.nickname,skipNickname:pendingRegistration.skipNickname,avatar:pendingRegistration.avatar,
        acceptedPersonalData:true,acceptedLegalTerms:true,ageConfirmed:true,legalVersion:"2026-11-14"
      })});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось создать персонажа.");
      $("#age-confirm-modal").classList.add("hidden");
      const entered=await enterWorld();if(!entered)loginError.textContent=loginError.textContent||"Аккаунт создан. Войди по коду восстановления.";
      $("#recovery-code-display").textContent=data.recoveryCode||"Код восстановления не получен.";
      $("#recovery-success-modal").classList.remove("hidden");pendingRegistration=null;
    }catch(error){$("#age-confirm-error").textContent=error.message||"Не удалось создать персонажа.";}
    finally{button.disabled=!$("#age-terms-checkbox").checked;}
  }
  function beginRegistration(skipNickname){
    loginError.textContent="";
    if(!$("#personal-data-consent").checked){loginError.textContent="Подтверди согласие на обработку персональных данных.";return;}
    const nickname=skipNickname?"":nicknameInput.value.trim();
    if(!skipNickname&&(nickname.length<2||nickname.length>18)){loginError.textContent="Ник должен содержать от 2 до 18 символов. Или выбери вход без ника.";nicknameInput.focus();return;}
    if(!$("#gender").value){loginError.textContent="Сначала выбери пол персонажа.";$("#register-step-one").classList.remove("hidden");$("#register-step-two").classList.add("hidden");return;}
    pendingRegistration={skipNickname,nickname,avatar:avatarSettings()};
    $("#age-terms-checkbox").checked=false;$("#confirm-registration").disabled=true;$("#age-confirm-error").textContent="";$("#age-confirm-modal").classList.remove("hidden");
  }
  $("#show-register").addEventListener("click",()=>{
    $("#auth-home").classList.add("hidden");$("#login-mode").classList.add("hidden");$("#register-mode").classList.remove("hidden");
    $("#register-step-one").classList.remove("hidden");$("#register-step-two").classList.add("hidden");$("#gender").value="";loginError.textContent="";preview();
  });
  $("#show-login").addEventListener("click",()=>{
    $("#auth-home").classList.add("hidden");$("#register-mode").classList.add("hidden");$("#login-mode").classList.remove("hidden");
    $("#recovery-result").classList.add("hidden");loginError.textContent="";$("#recovery-code").focus();
  });
  $("#login-cancel").addEventListener("click",()=>{$("#login-mode").classList.add("hidden");$("#auth-home").classList.remove("hidden");loginError.textContent="";});
  $("#register-next").addEventListener("click",()=>{
    if(!$("#gender").value)return;$("#register-step-one").classList.add("hidden");$("#register-step-two").classList.remove("hidden");loginError.textContent="";preview();nicknameInput.focus();
  });
  $("#register-back").addEventListener("click",()=>{$("#register-step-two").classList.add("hidden");$("#register-step-one").classList.remove("hidden");loginError.textContent="";});
  document.querySelectorAll(".register-cancel").forEach(button=>button.addEventListener("click",()=>{
    $("#register-mode").classList.add("hidden");$("#auth-home").classList.remove("hidden");
    $("#register-step-one").classList.remove("hidden");$("#register-step-two").classList.add("hidden");
    $("#gender").value="";$("#nickname").value="";$("#personal-data-consent").checked=false;
    pendingRegistration=null;loginError.textContent="";
  }));
  $("#register-button").addEventListener("click",()=>beginRegistration(false));
  $("#skip-nickname").addEventListener("click",()=>beginRegistration(true));
  $("#login-button").addEventListener("click",submitLogin);
  $("#age-terms-checkbox").addEventListener("change",()=>{$("#confirm-registration").disabled=!$("#age-terms-checkbox").checked;});
  $("#cancel-registration").addEventListener("click",()=>{$("#age-confirm-modal").classList.add("hidden");$("#age-confirm-error").textContent="";pendingRegistration=null;});
  $("#confirm-registration").addEventListener("click",()=>{if($("#age-terms-checkbox").checked)submitRegistration();else $("#age-confirm-error").textContent="Подтверди возраст и принятие документов.";});
  $("#copy-recovery-code").addEventListener("click",async()=>{
    const code=$("#recovery-code-display").textContent.trim();
    try{await navigator.clipboard.writeText(code);$("#copy-recovery-code").textContent="Скопировано ✓";}
    catch{const field=document.createElement("textarea");field.value=code;document.body.append(field);field.select();document.execCommand("copy");field.remove();$("#copy-recovery-code").textContent="Скопировано ✓";}
  });
  $("#enter-after-register").addEventListener("click",()=>$("#recovery-success-modal").classList.add("hidden"));
  socket.on("connect", () => {
    const status = $("#chat-connection-status");
    if (status) { status.dataset.state = "online"; status.lastChild.textContent = "В сети"; }
  });
  socket.on("disconnect", () => {
    const status = $("#chat-connection-status");
    if (status) { status.dataset.state = "offline"; status.lastChild.textContent = "Нет связи"; }
  });
  socket.on("connect_error", () => {
    const status = $("#chat-connection-status");
    if (status) { status.dataset.state = "offline"; status.lastChild.textContent = "Переподключение"; }
  });

  socket.on("planet:state", (data) => {
    state.planet = data.planet;
    state.players.clear();
    data.players.forEach((player) => state.players.set(player.id, { ...player, y: player.y ?? .82, renderX: player.x, renderY: player.y ?? .82 }));
    // Public chat is session-only: a fresh join never restores old messages.
    state.chat = [];
    state.unreadChat = 0;
    renderHistory();
    $("#planet-title").textContent = (PLANETS[state.planet] || {name:"Авторская планета"}).name;
    $("#room-location-title").textContent = (PLANETS[state.planet] || {location:"Космическое пространство"}).location;
    syncOnlineRoomName();
    updateOnline();
  });
  socket.on("player:joined",player=>{state.players.set(player.id,{...player,y:player.y??.82,renderX:player.x,renderY:player.y??.82});updateOnline();pushRoomEvent("Игрок вошёл",player.nickname+" присоединился к планете.","✦");});
  socket.on("player:left",({id})=>{const departed=state.players.get(id);state.players.delete(id);updateOnline();if(departed)pushRoomEvent("Игрок вышел",departed.nickname+" покинул планету.","↗");if(state.selected===id)closeProfile();});
  socket.on("player:moved",({id,x,y})=>{
    const player=state.players.get(String(id));
    if(!player||!Number.isFinite(Number(x))||!Number.isFinite(Number(y)))return;
    beginPlayerMovement(player,Number(x),Number(y));
  });
  socket.on("player:bubble", ({ id, bubble }) => {
    const player = state.players.get(id);
    if (player) player.bubble = bubble;
  });
  socket.on("chat:message",message=>{addHistory(message);if(!message.system&&String(message.playerId)!==String(state.me?.id))pushRoomEvent("Новое сообщение",message.nickname+": "+message.text,"💬");});
  socket.on("player:action:played",event=>{const icon=({wave:"👋",smile:"😊",hug:"🤗",kiss:"💋",dance:"💃",flower:"🌹"})[event.action]||"✦";[event.fromId,event.toId].forEach(id=>{const p=state.players.get(String(id));if(p)p.action={icon,until:Date.now()+1900};});pushRoomEvent("Социальное действие",event.from+" · "+event.label+" · "+event.to,icon);});
  socket.on("emotion:played", ({ id, emotion }) => {
    const player = state.players.get(id);
    if (player) {
      player.emotion = { type: emotion, until: Date.now() + 1800 };
      player.moving = true;
      setTimeout(() => { if (player) player.moving = false; }, 900);
    }
  });
  socket.on("whisper:received", (message) => {
    addHistory({ nickname: "От " + message.from, text: message.text, time: message.time }, true);
    pushRoomEvent("Личное сообщение","Шёпот от "+message.from,"💌");
    showToast("💌 Шёпот от " + message.from + ": " + message.text);
  });
  socket.on("whisper:sent",({to})=>{pushRoomEvent("Шёпот отправлен","Сообщение для "+to,"💌");showToast("Шёпот отправлен игроку "+to);});
  socket.on("gift:received", (event) => {
    const el = document.createElement("span");
    el.className = "gift-fly";
    el.textContent = event.icon;
    el.style.setProperty("--dx", (Math.random() * 100 - 50) + "px");
    $("#gift-layer").append(el);
    setTimeout(() => el.remove(), 1300);
    pushRoomEvent("Подарок",event.from+" подарил "+event.icon+" игроку "+event.to,"🎁");
    if (event.toId === state.me?.id) {
      const me = state.players.get(state.me?.id);
      if (me) me.authority += event.authorityAdded;
      showToast(event.icon + " " + event.from + " подарил вам подарок! +" + event.authorityAdded + " авторитета");
    } else {
      showToast(event.from + " подарил " + event.icon + " игроку " + event.to);
    }
  });
  socket.on("profile:updated", (player) => {
    const previous = state.players.get(player.id);
    state.players.set(player.id,{...previous,...player,y:player.y??previous?.y??.82,renderX:previous?.renderX??player.x,renderY:previous?.renderY??player.y??.82});
    if (String(player.id) === String(state.me?.id)) {
      state.me = { ...state.me, ...player };
      if (!$("#profile-editor").classList.contains("hidden")) paintAuthorityProfile(state.me);
    }
    if (String(state.selected) === String(player.id)) {
      $("#profile-rank").textContent = (player.title || "Новичок") + " · Авторитет " + (player.authority ?? 0);
      $("#profile-aura").textContent = player.auraEnabled ? "Аура активна" : "Аура выключена";
    }
  });
  socket.on("friend:result", ({ nickname, already }) => showToast(already ? nickname + " уже в друзьях" : nickname + " добавлен в друзья"));
  socket.on("friend:notice",({nickname})=>{pushRoomEvent("Новый друг",nickname+" добавил вас в друзья.","⭐");showToast(nickname+" добавил вас в друзья");});

  canvas.addEventListener("pointerdown",(event)=>{
    if(event.button!==undefined&&event.button!==0)return;
    const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
    let nearest=null,nearestDistance=Infinity;
    for(const player of state.players.values()){
      const px=(player.renderX??player.x)*state.width,py=(player.renderY??player.y??.82)*state.height-18;
      const distance=Math.hypot(px-x,py-y);
      if(distance<38&&distance<nearestDistance){nearest=player;nearestDistance=distance;}
    }
    if(nearest){openProfile(nearest);return;}
    const relativeY=y/Math.max(1,state.height);
    if(relativeY>=.55&&relativeY<=.97){
      closeProfile();
      const targetX=Math.max(.04,Math.min(.96,x/state.width)),targetY=Math.max(.60,Math.min(.86,relativeY));
      state.moveTarget={x:targetX,y:targetY,until:Date.now()+900};
      socket.emit("player:move",{x:targetX,y:targetY},result=>{if(!result?.ok){state.moveTarget=null;showToast(result?.error||"Не удалось переместить персонажа.");}});
    }else closeProfile();
  });

  async function refreshTopbarWallet() {
    const balance = $("#topbar-koins");
    if (!balance) return;
    try {
      const response = await fetch("/api/profile", { credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.profile) balance.textContent = Number(data.profile.koins || 0).toLocaleString("ru-RU");
      else balance.textContent = "—";
    } catch (_) { balance.textContent = "—"; }
  }

  function syncOnlineRoomName() {
    const title = $("#planet-title")?.textContent?.trim() || "Комната";
    const label = $("#online-room-name");
    if (label) label.textContent = title;
  }
  function updateOnline() {
    $("#online-count").textContent = String(state.players.size);
    syncOnlineRoomName();
    renderRoomPlayers();
  }

  function renderRoomPlayers() {
    const box = $("#room-player-list");
    if (!box) return;
    const rows = [...state.players.values()].sort((a, b) => {
      if (String(a.id) === String(state.me?.id)) return -1;
      if (String(b.id) === String(state.me?.id)) return 1;
      return String(a.nickname).localeCompare(String(b.nickname), "ru");
    });
    $("#room-player-count").textContent = String(state.players.size);
    box.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "developer-muted";
      empty.textContent = "В комнате пока никого нет.";
      box.append(empty);
      return;
    }
    rows.forEach(player => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "room-player-row" + (String(state.selected) === String(player.id) ? " selected" : "");
      const avatar = document.createElement("canvas");
      avatar.className = "room-player-avatar";
      avatar.width = 64;
      avatar.height = 72;
      drawAvatar(avatar.getContext("2d"), 32, 54, .78, player.avatar, 1, null);
      const meta = document.createElement("span");
      meta.className = "room-player-meta";
      const name = document.createElement("strong");
      name.textContent = player.nickname + (String(player.id) === String(state.me?.id) ? " · Вы" : "");
      const rank = document.createElement("small");
      rank.textContent = (player.title || "Новичок") + (player.auraEnabled ? " · Аура активна" : "");
      meta.append(name, rank);
      const status = document.createElement("i");
      status.className = "room-player-status";
      row.append(avatar, meta, status);
      row.addEventListener("click", () => {
        openProfile(player);
        closeRoomFlyouts("players");
      });
      box.append(row);
    });
  }
  let globalSearchTimer = null;
  let globalSearchSequence = 0;
  function renderGlobalSearch(data, query) {
    const box = $("#room-global-search-results");
    box.replaceChildren();
    const addSection = (title, entries, renderEntry) => {
      if (!entries.length) return;
      const heading = document.createElement("strong");
      heading.className = "room-global-search-heading";
      heading.textContent = title;
      box.append(heading);
      entries.forEach(entry => box.append(renderEntry(entry)));
    };
    const characterRow = player => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "room-global-search-row";
      const icon = document.createElement("span");
      icon.className = "room-global-search-icon";
      icon.textContent = "👤";
      const meta = document.createElement("span");
      meta.className = "room-global-search-meta";
      const name = document.createElement("strong");
      name.textContent = player.nickname;
      const detail = document.createElement("small");
      detail.textContent = (player.online ? "В сети" : "Не в сети") + " · " + (player.authorityTitle === "NOVICE" ? "Новичок" : player.authorityTitle) + " · ID " + player.id;
      meta.append(name, detail);
      button.append(icon, meta);
      button.addEventListener("click", () => {
        closeRoomFlyouts();
        openPublicProfile(player.id);
      });
      return button;
    };
    const planetRow = planet => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "room-global-search-row";
      const icon = document.createElement("span");
      icon.className = "room-global-search-icon";
      icon.textContent = "🪐";
      const meta = document.createElement("span");
      meta.className = "room-global-search-meta";
      const name = document.createElement("strong");
      name.textContent = planet.name;
      const detail = document.createElement("small");
      detail.textContent = "Планета · " + (planet.ownerNickname || "NEXORA") + " · " + (planet.onlineCount || 0) + " онлайн";
      meta.append(name, detail);
      button.append(icon, meta);
      button.addEventListener("click", () => {
        closeRoomFlyouts();
        enterPlanet(planet);
      });
      return button;
    };
    const builtin = [
      { id:"starter", key:"starter", name:"Стартовая", description:"Главная площадь NEXORA", ownerNickname:"NEXORA", onlineCount:state.planet==="starter"?state.players.size:0, builtin:true },
      { id:"club", key:"club", name:"Клуб", description:"Музыка, танцы и общение", ownerNickname:"NEXORA", onlineCount:state.planet==="club"?state.players.size:0, builtin:true },
      { id:"beach", key:"beach", name:"Пляж", description:"Отдых у океана", ownerNickname:"NEXORA", onlineCount:state.planet==="beach"?state.players.size:0, builtin:true }
    ].filter(planet => planet.name.toLocaleLowerCase("ru-RU").includes(query.toLocaleLowerCase("ru-RU")));
    addSection("ПЕРСОНАЖИ", data.characters || [], characterRow);
    addSection("ПЛАНЕТЫ", [...builtin, ...(data.planets || []).map(planet => ({...planet,key:"custom-"+planet.id,builtin:false}))], planetRow);
    if (!box.children.length) {
      const empty = document.createElement("p");
      empty.textContent = "Ничего не найдено. Попробуй другой запрос.";
      box.append(empty);
    }
  }
  $("#room-global-search-input")?.addEventListener("input", () => {
    const input = $("#room-global-search-input");
    const box = $("#room-global-search-results");
    const query = input.value.trim();
    clearTimeout(globalSearchTimer);
    const sequence = ++globalSearchSequence;
    if (query.length < 2) {
      box.replaceChildren();
      const hint = document.createElement("p");
      hint.textContent = "Введи минимум 2 символа: ник, ID или название планеты.";
      box.append(hint);
      return;
    }
    box.textContent = "Ищем персонажей и планеты…";
    globalSearchTimer = setTimeout(async () => {
      try {
        const response = await fetch("/api/social/search?q=" + encodeURIComponent(query), { credentials:"same-origin" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Поиск временно недоступен.");
        if (sequence !== globalSearchSequence) return;
        renderGlobalSearch(data, query);
      } catch (error) {
        if (sequence !== globalSearchSequence) return;
        box.textContent = error.message;
      }
    }, 220);
  });


  function closeCompetingPanels(except = "") {
    const panels = ["#profile-menu","#social-panel","#public-profile","#profile-editor","#authority-panel","#shop-panel","#developer-panel","#planets-panel","#room-main-menu","#room-dice-panel","#room-emotions-panel","#room-players-panel","#room-events-panel"];
    panels.forEach(selector => { if (selector !== except) $(selector)?.classList.add("hidden"); });
    $("#chat-drawer")?.classList.remove("hidden");
  }

  function closeRoomFlyouts(except = "") {
    const panels = {menu:"#room-main-menu",dice:"#room-dice-panel",emotions:"#room-emotions-panel",players:"#room-players-panel",events:"#room-events-panel"};
    Object.entries(panels).forEach(([key,selector]) => {
      if (key !== except) $(selector).classList.add("hidden");
      const button = document.querySelector('[data-room-toggle="'+key+'"]');
      if (button) button.classList.toggle("active",key === except);
    });
  }
  function toggleRoomFlyout(name) {
    const panels = {menu:"#room-main-menu",dice:"#room-dice-panel",emotions:"#room-emotions-panel",players:"#room-players-panel",events:"#room-events-panel"};
    const panel = $(panels[name]); const shouldOpen = panel.classList.contains("hidden");
    closeCompetingPanels(shouldOpen ? panels[name] : "");
    closeRoomFlyouts(shouldOpen ? name : "");
    panel.classList.toggle("hidden",!shouldOpen);
    const button = document.querySelector('[data-room-toggle="'+name+'"]');
    if (button) button.setAttribute("aria-expanded",String(shouldOpen));
    if(name==="events"&&shouldOpen){state.unreadEvents=0;renderRoomEvents();}
  }
  document.querySelectorAll("[data-room-toggle]").forEach(button => button.addEventListener("click",() => {
    toggleRoomFlyout(button.dataset.roomToggle);
  }));
  document.querySelectorAll("[data-room-close]").forEach(button => button.addEventListener("click",() => closeRoomFlyouts()));
  document.querySelector("[data-room-search-back]")?.addEventListener("click", () => {
    $("#room-global-search")?.classList.add("hidden");
    $("#room-main-menu .room-menu-grid")?.classList.remove("hidden");
    $("#room-global-search-input").value = "";
    $("#room-global-search-results").innerHTML = "<p>Введи имя персонажа или название планеты.</p>";
  });
  document.querySelectorAll("[data-room-action]").forEach(button => button.addEventListener("click",() => {
    const action = button.dataset.roomAction;
    if (action !== "search" && action !== "dice") closeRoomFlyouts();
    if (action === "profile") openMyProfile();
    else if (action === "rating") openSocialTab("rating");
    else if (action === "friends") openMyProfile("friends");
    else if (action === "messages") openMyProfile("messages");
    else if (action === "gifts") { if (state.selected && String(state.selected) !== String(state.me?.id)) { $("#gift-options").classList.remove("hidden"); $("#profile-menu").classList.remove("hidden"); } else showToast("Выбери игрока в комнате, чтобы отправить подарок."); }
    else if (action === "search") {
      $("#room-main-menu .room-menu-grid")?.classList.add("hidden");
      $("#room-global-search")?.classList.remove("hidden");
      $("#room-global-search-input")?.focus();
    }
    else if (action === "shop") openShop();
    else if (action === "planets") $("#planets-button").click();
    else if (action === "dice") { closeCompetingPanels("#room-dice-panel"); closeRoomFlyouts(); $("#room-dice-panel").classList.remove("hidden"); }
    else if (action === "developer") $("#developer-open").click();
    else if (action === "exit") $("#exit-room").click();
    else if (action === "players") toggleRoomFlyout("players");
    else if (action === "events") toggleRoomFlyout("events");
  }));
  const diceFaces=["⚀","⚁","⚂","⚃","⚄","⚅"];
  let dicePlayerWins=0,diceBotWins=0;
  $("#dice-roll")?.addEventListener("click",()=>{
    const player=[1,2].map(()=>Math.floor(Math.random()*6)+1);
    const bot=[1,2].map(()=>Math.floor(Math.random()*6)+1);
    const playerTotal=player[0]+player[1],botTotal=bot[0]+bot[1];
    $("#dice-player-value").textContent=player.map(n=>diceFaces[n-1]).join(" ");
    $("#dice-bot-value").textContent=bot.map(n=>diceFaces[n-1]).join(" ");
    if(playerTotal>botTotal){dicePlayerWins++;$("#dice-result").textContent="Ты победил! "+playerTotal+" : "+botTotal;}
    else if(playerTotal<botTotal){diceBotWins++;$("#dice-result").textContent="NEXORA победила. "+playerTotal+" : "+botTotal;}
    else $("#dice-result").textContent="Ничья! "+playerTotal+" : "+botTotal;
    $("#dice-player-score").textContent=dicePlayerWins+" побед";
    $("#dice-bot-score").textContent=diceBotWins+" побед";
  });

  document.querySelectorAll("[data-room-emotion]").forEach(button => button.addEventListener("click",() => {
    socket.emit("emotion:play",{emotion:button.dataset.roomEmotion});
    closeRoomFlyouts();
  }));
  $("#room-developer-action").classList.toggle("hidden",$("#developer-open").classList.contains("hidden"));


  function openProfile(player) {
    closeCompetingPanels("#profile-menu");
    state.selected = player.id;
    $("#profile-name").textContent = player.nickname;
    $("#profile-rank").textContent = (player.title || "Новичок") + " · Авторитет " + (player.authority ?? 0);
    $("#profile-aura").textContent = player.auraEnabled ? "Аура активна" : "Аура выключена";
    $("#profile-online-status").textContent = "● В этой комнате";
    const ownProfile = String(player.id) === String(state.me?.id);
    ["#dm-open-button","#whisper-button","#gift-button","#friend-button","#block-user-button"].forEach(selector => $(selector).classList.toggle("hidden", ownProfile));
    $("#my-profile-context").classList.toggle("hidden", !ownProfile);
    $("#my-character-actions").classList.toggle("hidden", !ownProfile);
    $("#profile-menu").classList.remove("hidden");
    $("#character-action-list").classList.toggle("hidden",ownProfile);
    $("#gift-options").classList.add("hidden");
    $("#report-user-button").classList.toggle("hidden",ownProfile);
    renderRoomPlayers();
    renderDeveloperPlayerActions(player, ownProfile);
  }

  $("#profile-info-button").addEventListener("click",()=>{const id=state.selected;$("#profile-menu").classList.add("hidden");if(id!=null)openPublicProfile(id);});

  async function renderDeveloperPlayerActions(player, ownProfile) {
    let panel=$("#developer-player-actions");
    if(!panel){panel=document.createElement("section");panel.id="developer-player-actions";panel.className="developer-player-actions hidden";panel.setAttribute("aria-label","Действия разработчика");$("#profile-menu").append(panel);}
    panel.replaceChildren();
    const canAssign=developerPermissions.includes("authority.assign");
    const canRemove=developerPermissions.includes("authority.remove");
    if (ownProfile) {
      if (!developerIsOwner && !developerPermissions.length) { panel.classList.add("hidden"); return; }
      panel.classList.remove("hidden");
      const heading=document.createElement("strong");heading.textContent="Режим разработчика";panel.append(heading);
      const open=document.createElement("button");open.type="button";open.textContent="🛠️ Открыть панель разработчика";
      open.addEventListener("click",()=>{closeProfile();openDeveloperPanel("overview");});
      panel.append(open);
      return;
    }
    if(!canAssign&&!canRemove){panel.classList.add("hidden");return;}
    panel.classList.remove("hidden");
    const heading=document.createElement("strong");heading.textContent="Управление игроком";panel.append(heading);
    try{
      const data=await authorityApi("/");
      if(String(state.selected)!==String(player.id))return;
      const select=document.createElement("select");
      data.titles.filter(item=>item.title_key!=="NOVICE").forEach(item=>{const option=document.createElement("option");option.value=item.title_key;option.textContent=item.title_label;select.append(option);});
      const currentKey=player.authorityTitle||player.authority_title||"NOVICE";
      if([...select.options].some(option=>option.value===currentKey))select.value=currentKey;
      const rankLine=document.createElement("small");rankLine.textContent="Сейчас: "+(player.title||"Новичок")+" · "+(player.auraEnabled?"Аура включена":"Аура выключена");panel.append(rankLine);
      if(canAssign){
        const assign=document.createElement("button");assign.type="button";assign.textContent="Выдать звание";
        assign.addEventListener("click",async()=>{assign.disabled=true;try{
          const response=await fetch("/api/authority/admin/assign",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:player.id,titleKey:select.value,auraEnabled:true})});
          const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"Не удалось выдать звание.");
          Object.assign(player,{authorityTitle:result.titleKey,auraType:result.auraType||player.auraType,auraEnabled:Boolean(result.auraEnabled),title:data.titles.find(item=>item.title_key===result.titleKey)?.title_label||"Новичок"});
          $("#profile-rank").textContent=player.title+" · Авторитет "+(player.authority??0);$("#profile-aura").textContent=player.auraEnabled?"Аура активна":"Аура выключена";
          showToast("Звание выдано игроку "+player.nickname);renderDeveloperPlayerActions(player,false);
        }catch(error){showToast(error.message);}finally{assign.disabled=false;}});
        panel.append(select,assign);
        const aura=document.createElement("button");aura.type="button";aura.textContent=player.auraEnabled?"Выключить ауру":"Включить ауру";
        aura.disabled=currentKey==="NOVICE";
        aura.addEventListener("click",async()=>{aura.disabled=true;try{
          const response=await fetch("/api/authority/admin/assign",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:player.id,titleKey:currentKey,auraEnabled:!player.auraEnabled})});
          const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"Не удалось изменить ауру.");
          player.auraEnabled=Boolean(result.auraEnabled);$("#profile-aura").textContent=player.auraEnabled?"Аура активна":"Аура выключена";showToast(player.auraEnabled?"Аура включена":"Аура выключена");renderDeveloperPlayerActions(player,false);
        }catch(error){showToast(error.message);}finally{aura.disabled=false;}});
        panel.append(aura);
      }
      if(canRemove){
        const remove=document.createElement("button");remove.type="button";remove.textContent="Снять звание · Новичок";
        remove.disabled=currentKey==="NOVICE";
        remove.addEventListener("click",async()=>{remove.disabled=true;try{
          const response=await fetch("/api/authority/admin/remove/"+encodeURIComponent(player.id),{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({})});
          const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"Не удалось снять звание.");
          Object.assign(player,{authorityTitle:"NOVICE",authority_title:"NOVICE",auraEnabled:false,aura_enabled:false,auraType:null,title:"Новичок"});
          $("#profile-rank").textContent="Новичок · Авторитет 0";$("#profile-aura").textContent="Аура выключена";showToast("Звание снято. Игрок возвращён в Новички.");renderDeveloperPlayerActions(player,false);
        }catch(error){showToast(error.message);}finally{remove.disabled=false;}});
        panel.append(remove);
      }
    }catch(error){panel.classList.add("hidden");showToast(error.message);}
  }

  function closeProfile() {
    state.selected = null;
    $("#profile-menu").classList.add("hidden");
    $("#character-action-list").classList.add("hidden");
    $("#my-profile-context").classList.add("hidden");
    $("#my-character-actions").classList.add("hidden");
    $("#developer-player-actions")?.classList.add("hidden");
    ["#dm-open-button","#whisper-button","#gift-button","#friend-button","#report-user-button"].forEach(selector => $(selector).classList.remove("hidden"));
    renderRoomPlayers();
  }
  $("#close-profile").addEventListener("click", closeProfile);
  $("#my-profile-context").addEventListener("click", () => { closeProfile(); openMyProfile(); });
  document.querySelectorAll("[data-my-context]").forEach(button => button.addEventListener("click", () => {
    const action = button.dataset.myContext;
    closeProfile();
    if (action === "friends") openMyProfile("friends");
    else if (action === "messages") openMyProfile("messages");
    else if (action === "social") openMyProfile("friends");
    else if (action === "emotions") toggleRoomFlyout("emotions");
  }));
  $("#gift-button").addEventListener("click", () => $("#gift-options").classList.toggle("hidden"));
  $("#dm-open-button").addEventListener("click", async () => {
    const peerId = state.selected;
    if (!peerId) return;
    try {
      const result = await socialApi("/conversations", { method: "POST", body: JSON.stringify({ peerId }) });
      closeProfile();
      await openMyProfile("messages");
      await loadConversations();
      await openConversation(result.conversationId);
    } catch (error) { showToast(error.message); }
  });
  $("#whisper-button").addEventListener("click", () => {
    const text = prompt("Текст приватного сообщения:");
    if (text?.trim()) socket.emit("whisper:send", { targetId: state.selected, text }, (result) => {
      if (!result?.ok) showToast(result?.error || "Не удалось отправить.");
    });
    closeProfile();
  });
  $("#block-user-button").addEventListener("click",async()=>{
    const targetId=state.selected;
    if(!targetId||String(targetId)===String(state.me?.id))return;
    if(!window.confirm("Заблокировать этого игрока? Он исчезнет из ваших социальных взаимодействий."))return;
    try{
      await socialApi("/blocks/"+encodeURIComponent(targetId),{method:"POST"});
      closeProfile();await refreshSocial();showToast("Игрок заблокирован.");
    }catch(error){showToast(error.message);}
  });
  $("#friend-button").addEventListener("click", async () => {
    if (!state.selected) return closeProfile();
    try {
      const result = await socialApi("/requests", { method: "POST", body: JSON.stringify({ targetId: state.selected }) });
      showToast("Заявка отправлена игроку " + result.nickname);
    } catch (error) { showToast(error.message); }
    closeProfile();
  });
  $("#report-user-button").addEventListener("click",async()=>{
    const targetId=state.selected;if(!targetId)return;
    const details=prompt("Опишите нарушение (до 500 символов):");
    if(details===null)return;
    try{await economyRequest("/reports",{method:"POST",body:JSON.stringify({targetId:Number(targetId),category:"other",details})});showToast("Жалоба отправлена модераторам.");}
    catch(error){showToast(error.message);}
    closeProfile();
  });
  document.querySelectorAll("[data-character-action]").forEach(button=>button.addEventListener("click",()=>{const targetId=state.selected;if(!targetId||String(targetId)===String(state.me?.id))return;socket.emit("player:action",{targetId,action:button.dataset.characterAction},result=>{if(!result?.ok)showToast(result?.error||"Действие не выполнено.");else showToast("Действие отправлено.");});}));

  document.querySelectorAll("[data-gift]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.selected) socket.emit("gift:send", { targetId: state.selected, gift: button.dataset.gift }, (result) => {
        if (!result?.ok) showToast(result?.error || "Не удалось отправить подарок.");
        else showToast("Подарок отправлен!");
      });
      closeProfile();
    });
  });

  document.querySelectorAll("[data-emotion]").forEach((button) => {
    button.addEventListener("click", () => socket.emit("emotion:play", { emotion: button.dataset.emotion }));
  });
  $("#chat-emoji-button").addEventListener("click", () => {
    const picker = $("#chat-emoji-picker");
    const opening = picker.classList.contains("hidden");
    picker.classList.toggle("hidden", !opening);
    $("#chat-emoji-button").setAttribute("aria-expanded", String(opening));
  });
  document.querySelectorAll("[data-chat-emoji]").forEach(button => button.addEventListener("click", () => {
    const input = $("#chat-input");
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.setRangeText(button.dataset.chatEmoji, start, end, "end");
    input.focus();
    $("#chat-emoji-picker").classList.add("hidden");
    $("#chat-emoji-button").setAttribute("aria-expanded", "false");
  }));
  $("#chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = $("#chat-input");
    const sendButton = form.querySelector('button[type="submit"]');
    const messageText = input.value.trim();
    if (!messageText || sendButton.disabled) return;
    if (!socket.connected) {
      showToast("Нет соединения. Сообщение осталось в поле ввода.");
      return;
    }
    sendButton.disabled = true;
    sendButton.classList.add("is-sending");
    sendButton.textContent = "…";
    socket.timeout(8000).emit("chat:send", { text: messageText }, (error, result) => {
      sendButton.disabled = false;
      sendButton.classList.remove("is-sending");
      sendButton.textContent = "➤";
      if (error || !result?.ok) {
        showToast(result?.error || "Не удалось отправить. Текст сохранён в поле ввода.");
        return;
      }
      if (input.value.trim() === messageText) input.value = "";
      $("#chat-emoji-picker").classList.add("hidden");
      $("#chat-emoji-button").setAttribute("aria-expanded", "false");
      input.focus();
    });
  });

  $("#exit-room").addEventListener("click", async () => {
    const button = $("#exit-room");
    button.disabled = true;
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });
    } catch (error) {
      console.error("Logout request failed:", error);
    } finally {
      socket.disconnect();
      state.me = null;
      developerPermissions = [];
      developerRole = "USER";
      developerIsOwner = false;
      $("#developer-open").classList.add("hidden");
      $("#room-developer-action").classList.add("hidden");
      state.players.clear();
      state.selected = null;
      state.chat = [];
      state.unreadChat = 0;
      renderHistory();
      state.roomEvents=[];state.unreadEvents=0;renderRoomEvents();
      $("#planet-picker").classList.add("hidden");
      $("#chat-drawer").classList.remove("hidden");
      $("#profile-menu").classList.add("hidden");
      $("#gift-options").classList.add("hidden");
      $("#recovery-result").classList.add("hidden");
      loginError.textContent = "";
      gameScreen.classList.add("hidden");
      loginScreen.classList.remove("hidden");
      $("#auth-home").classList.remove("hidden");
      $("#register-mode").classList.add("hidden");
      $("#login-mode").classList.add("hidden");
      $("#age-confirm-modal").classList.add("hidden");
      $("#recovery-success-modal").classList.add("hidden");
      button.disabled = false;
    }
  });

  $("#planets-button").addEventListener("click", openPlanetsPanel);
  $("#planet-picker").querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      socket.emit("planet:change", { planet: button.dataset.planet }, (result) => {
        if (!result?.ok) showToast(result?.error || "Не удалось сменить планету.");
        else $("#planet-picker").classList.add("hidden");
      });
    });
  });



  document.querySelectorAll("[data-chat-view]").forEach(button=>button.addEventListener("click",()=>{
    const view=button.dataset.chatView;
    document.querySelectorAll("[data-chat-view]").forEach(tab=>tab.classList.toggle("active",tab===button));
    if(view==="general"){
      $("#chat-drawer").classList.remove("hidden");
      $("#social-panel").classList.add("hidden");
      $("#chat-online-label").textContent="Все игроки этой планеты";
      state.unreadChat=0;renderHistory();
      return;
    }
    $("#chat-drawer").classList.add("hidden");
    const chatButton=$("#room-toolbar [data-room-toggle=\"chat\"]");
    if(chatButton){chatButton.classList.remove("active");chatButton.setAttribute("aria-expanded","false");}
    openSocialTab(view==="messages"?"messages":"friends");
  }));

  // Persistent user-created planets: catalog, owner identity and room transitions.
  const planetThemes = {
    nebula:["#11183b","#29245f","#51458a","#a28cff"],
    aurora:["#092d3d","#145d69","#286d76","#69f0d1"],
    sunset:["#3c183d","#8b3d62","#a85c65","#ff9a8b"],
    ocean:["#052b49","#087b91","#287b91","#63e7ef"],
    violet:["#20113f","#54318a","#694ca2","#c19aff"],
    emerald:["#092c2c","#17604c","#36775c","#76e6a8"]
  };
  let planetSearchTimer = null;
  function planetRequest(url, options={}) {
    return fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options}).then(async response=>{
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Не удалось выполнить запрос.");
      return data;
    });
  }
  function planetAvatar(value) {
    const gender=value?.gender;
    return gender==="female"?"👑":"✦";
  }
  async function loadPlanetCatalog() {
    const box=$("#planet-catalog");box.replaceChildren();
    const query=$("#planet-search").value.trim(),category=$("#planet-category").value;
    try {
      const data=await planetRequest("/api/planets?q="+encodeURIComponent(query)+"&category="+encodeURIComponent(category));
      const builtin=[
        {id:"starter",key:"starter",name:"Стартовая",description:"Главная площадь NEXORA",category:"social",theme:"nebula",access_mode:"public",memberCount:0,onlineCount:0,capacity:"∞",ownerNickname:"NEXORA",builtin:true},
        {id:"club",key:"club",name:"Клуб",description:"Музыка, танцы и общение",category:"music",theme:"violet",access_mode:"public",memberCount:0,onlineCount:0,capacity:"∞",ownerNickname:"NEXORA",builtin:true},
        {id:"beach",key:"beach",name:"Пляж",description:"Отдых у океана",category:"social",theme:"ocean",access_mode:"public",memberCount:0,onlineCount:0,capacity:"∞",ownerNickname:"NEXORA",builtin:true}
      ].filter(p=>!query||p.name.toLowerCase().includes(query.toLowerCase()));
      const items=[...builtin,...data.planets];
      if(!items.length){const empty=document.createElement("p");empty.className="planet-empty";empty.textContent="Планеты не найдены. Создай первую собственную планету.";box.append(empty);return;}
      items.forEach(p=>{
        const theme=planetThemes[p.theme]||planetThemes.nebula;
        const card=document.createElement("article");card.className="planet-card";
        const art=document.createElement("div");art.className="planet-card-art";art.style.setProperty("--planet-a",theme[0]);art.style.setProperty("--planet-b",theme[1]);art.style.setProperty("--planet-glow",theme[3]);
        const orb=document.createElement("i");orb.textContent="✦";art.append(orb);
        const body=document.createElement("div");body.className="planet-card-body";
        const title=document.createElement("strong");title.textContent=p.name;
        const desc=document.createElement("p");desc.textContent=p.description||"Новый мир NEXORA";
        const owner=document.createElement("div");owner.className="planet-owner";owner.textContent="👑 "+(p.ownerNickname||"NEXORA");
        const meta=document.createElement("small");meta.textContent=(p.onlineCount||0)+" онлайн · "+(p.capacity||"∞")+" мест · "+(p.access_mode==="private"?"Приватная":p.access_mode==="invite"?"По приглашению":"Открытая");
        const enter=document.createElement("button");enter.type="button";enter.textContent="Перейти";enter.addEventListener("click",()=>enterPlanet(p));
        body.append(title,desc,owner,meta,enter);
        card.append(art,body);box.append(card);
      });
    } catch(error) { const empty=document.createElement("p");empty.className="planet-empty";empty.textContent=error.message;box.append(empty); }
  }
  async function enterPlanet(planet) {
    try {
      if(planet.builtin){socket.emit("planet:change",{planet:planet.key},result=>{if(!result?.ok)showToast(result?.error||"Переход не выполнен.");else $("#planets-panel").classList.add("hidden");});return;}
      await planetRequest("/api/planets/"+encodeURIComponent(planet.id)+"/visit",{method:"POST",body:JSON.stringify({})});
      socket.emit("planet:change",{planet:"custom-"+planet.id},result=>{
        if(!result?.ok){showToast(result?.error||"Переход не выполнен.");return;}
        $("#planets-panel").classList.add("hidden");
        showToast("🪐 Вы прибыли на планету "+planet.name);
      });
    } catch(error){showToast(error.message);}
  }
  async function openPlanetsPanel() {
    closeCompetingPanels("#planets-panel");
    $("#planets-panel").classList.remove("hidden");
    $("#planet-create-form").classList.add("hidden");
    $("#planet-catalog").classList.remove("hidden");
    await loadPlanetCatalog();
  }
  $("#planets-close").addEventListener("click",()=>$("#planets-panel").classList.add("hidden"));
  $("#planet-search").addEventListener("input",()=>{clearTimeout(planetSearchTimer);planetSearchTimer=setTimeout(loadPlanetCatalog,180);});
  $("#planet-category").addEventListener("change",loadPlanetCatalog);
  $("#planet-create-open").addEventListener("click",()=>{
    $("#planet-catalog").classList.add("hidden");
    $("#planet-create-form").classList.remove("hidden");
    $("#planet-create-error").textContent="";
  });
  $("#planet-create-cancel").addEventListener("click",()=>{
    $("#planet-create-form").classList.add("hidden");
    $("#planet-catalog").classList.remove("hidden");
  });
  $("#planet-create-submit").addEventListener("click",async()=>{
    const button=$("#planet-create-submit"),error=$("#planet-create-error");
    const name=$("#planet-new-name").value.trim();
    if(!name){error.textContent="Введи название планеты.";$("#planet-new-name").focus();return;}
    button.disabled=true;error.textContent="";
    try{
      const created=await planetRequest("/api/planets",{method:"POST",body:JSON.stringify({name})});
      $("#planet-new-name").value="";
      await enterPlanet({id:created.planet.id,key:created.planet.key,name:created.planet.name});
    }catch(e){error.textContent=e.message;}finally{button.disabled=false;}
  });

  socket.on("planet:access-revoked",event=>{
    showToast(event?.message||"Доступ к планете закрыт.");
    socket.emit("planet:change",{planet:"starter"},()=>{});
  });
  socket.on("planet:objects-updated",objects=>{
    state.customPlanetObjects=Array.isArray(objects)?objects:[];
    drawScene();
  });
  socket.on("planet:state",async data=>{
    state.customPlanetObjects=[];
    if(!String(data.planet).startsWith("custom-")){drawScene();return;}
    const id=String(data.planet).slice(7);
    try{
      const result=await planetRequest("/api/planets/"+encodeURIComponent(id));
      const p=result.planet,theme=planetThemes[p.theme]||planetThemes.nebula;
      try{const objects=await planetRequest("/api/planets/"+encodeURIComponent(id)+"/objects");state.customPlanetObjects=objects.objects||[];}catch(_error){state.customPlanetObjects=[];}
      PLANETS[data.planet]={name:p.name,location:"Владелец: "+p.owner_nickname,sky:theme.slice(0,2),ground:theme[2],glow:theme[3],ownerId:String(p.ownerId),ownerNickname:p.owner_nickname};
      $("#planet-title").textContent=p.name;
      $("#room-location-title").textContent="👑 "+p.owner_nickname;
      syncOnlineRoomName();
      drawScene();
    }catch(_error){}
  });

  socket.on("connect",()=>setConnectionStatus("online","На связи"));
  socket.on("reconnect_attempt",()=>setConnectionStatus("reconnecting","Переподключение"));
  socket.on("connect_error",()=>{setConnectionStatus("offline","Нет соединения");if(!gameScreen.classList.contains("hidden")){pushRoomEvent("Соединение потеряно","Пытаемся восстановить подключение.","⚠️");showToast("Потеряно соединение с сервером.");}});
  socket.on("disconnect",()=>{setConnectionStatus("reconnecting","Переподключение");if(!gameScreen.classList.contains("hidden")){pushRoomEvent("Переподключение","Соединение с сервером прервано.","↻");showToast("Соединение прервано. Выполняется переподключение.");}});



  const profileCanvas = $("#profile-preview");
  const profileCtx = profileCanvas.getContext("2d");
  function editorAvatarSettings() {
    return {
      gender: $("#edit-gender").value,
      skin: $("#edit-skin").value,
      hair: $("#edit-hair").value,
      suit: $("#edit-suit").value,
      outfit: $("#edit-outfit").value,
      hairColor: $("#edit-hair-color").value,
      shoes: $("#edit-shoes").value,
      accessory: $("#edit-accessory").value
    };
  }
  function drawProfilePreview() {
    profileCtx.clearRect(0, 0, profileCanvas.width, profileCanvas.height);
    drawAvatar(profileCtx, 90, 96, 1.8, editorAvatarSettings(), 1, null);
  }
  window.addEventListener("nexora:sprites-ready",()=>{preview();if(!$("#profile-editor").classList.contains("hidden"))drawProfilePreview();});
  ["edit-gender","edit-skin","edit-hair","edit-outfit","edit-suit","edit-hair-color","edit-shoes","edit-accessory"].forEach(id=>$("#"+id).addEventListener("change",drawProfilePreview));

  function showProfileSocialTab(tab) {
    if (!["friends","messages"].includes(tab)) return;
    const panel = $("#profile-editor");
    panel.classList.add("social-mode");
    $("#profile-social-title").textContent = tab === "friends" ? "Друзья и социальное" : "Личные сообщения";
    $("#social-friends-view").classList.toggle("hidden", tab !== "friends");
    $("#social-messages-view").classList.toggle("hidden", tab !== "messages");
    document.querySelectorAll("[data-profile-social-tab]").forEach(button => button.classList.toggle("active", button.dataset.profileSocialTab === tab));
    if (tab === "friends") {
      loadFriends().catch(error => showToast(error.message));
      loadNotifications().then(() => socialApi("/notifications/read", { method: "POST" })).then(loadNotifications).catch(error => showToast(error.message));
    } else {
      loadConversations().catch(error => showToast(error.message));
    }
  }
  document.querySelectorAll("[data-profile-social-tab]").forEach(button => button.addEventListener("click", () => showProfileSocialTab(button.dataset.profileSocialTab)));
  $("#profile-social-back").addEventListener("click", () => {
    $("#profile-editor").classList.remove("social-mode");
    $("#social-friends-view").classList.add("hidden");
    $("#social-messages-view").classList.add("hidden");
  });

  async function openMyProfile(socialTab = "") {
    closeCompetingPanels("#profile-editor");
    const panel = $("#profile-editor");
    const save = $("#profile-save");
    const errorBox = $("#profile-editor-error");
    panel.classList.remove("social-mode");
    $("#social-friends-view").classList.add("hidden");
    $("#social-messages-view").classList.add("hidden");
    errorBox.textContent = "";
    panel.classList.remove("hidden");
    save.disabled = true;
    try {
      const response = await fetch("/api/profile", { credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить профиль.");
      const p = data.profile;
      $("#profile-editor-nickname").textContent = p.nickname;
      $("#profile-editor-meta").textContent = (p.authorityTitle==="NOVICE"?"Новичок":({BEDA:"Беда",PAPA:"Папа",ANGEL:"Ангел",CREATOR:"Создатель"})[p.authorityTitle]||"Новичок") + " · Авторитет " + Number(p.authority||0);
      $("#profile-editor-developer").classList.toggle("hidden", !p.isDeveloper);
      $("#profile-editor-created").textContent = "В NEXORA с " + new Date(p.createdAt).toLocaleDateString("ru-RU");
      $("#profile-friends-count").textContent = p.friendsCount;
      $("#profile-gifts-count").textContent = p.giftsReceived;
      $("#profile-authority").textContent = p.authority;
      $("#profile-koins").textContent = p.koins;
      $("#profile-nickname-display").textContent = p.nickname;
      const authorityState=await authorityApi("/");
      paintAuthorityProfile(p,authorityState.titles);
      $("#profile-status").value = p.status || "";
      $("#profile-bio").value = p.bio || "";
      const avatar = p.avatar || {};
      $("#edit-gender").value = avatar.gender || "male";
      $("#edit-skin").value = avatar.skin || skins[0];
      $("#edit-hair").value = avatar.hair || "short";
      $("#edit-suit").value = avatar.suit || suits[0];
      $("#edit-outfit").value = avatar.outfit || "casual";
      $("#edit-hair-color").value = avatar.hairColor || "#30233d";
      $("#edit-shoes").value = avatar.shoes || "sneakers";
      $("#edit-accessory").value = avatar.accessory || "none";
      drawProfilePreview();
      save.disabled = false;
      if (socialTab) showProfileSocialTab(socialTab);
    } catch (error) {
      errorBox.textContent = error.message;
      save.disabled = true;
    }
  }

  function paintAuthorityProfile(profile, titles = []) {
    const labels={NOVICE:"Новичок",BEDA:"Беда",PAPA:"Папа",ANGEL:"Ангел",CREATOR:"Создатель"};
    const colors={NOVICE:"#d7def9",BEDA:"#ffe17a",PAPA:"#ffca55",ANGEL:"#78f0a5",CREATOR:"#ff655c"};
    const key=profile.authorityTitle||"NOVICE";
    $("#profile-authority-title").textContent=(labels[key]||labels.NOVICE).toUpperCase();
    $("#profile-authority-title").style.color=colors[key]||colors.NOVICE;
    $("#profile-authority-aura").textContent=profile.auraEnabled
      ? "Активная аура: "+(key==="BEDA"?"золотое сияние":key==="PAPA"?"премиальное золотое сияние":key==="ANGEL"?"зелёное сияние":key==="CREATOR"?"красное пламя и искры":"нет")
      : "Без активной ауры";
    const order=["NOVICE","BEDA","PAPA","ANGEL","CREATOR"],index=order.indexOf(key),next=order[index+1];
    const nextConfig=titles.find(item=>item.title_key===next);
    const threshold=Number(nextConfig?.min_authority ?? [25,75,150,300][index] ?? 300);
    const progress=Math.min(100,Math.max(0,Number(profile.authority||0)/Math.max(1,threshold)*100));
    $("#profile-authority-progress").style.width=index>=4?"100%":progress+"%";
    $("#profile-authority-next").textContent=next?( "Следующее звание: "+labels[next]+" · "+threshold+" авторитета"):"Максимальное звание достигнуто";
  }
  async function authorityApi(path="",options={}) {
    const response=await fetch("/api/authority"+path,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Ошибка системы авторитета.");
    return data;
  }
  async function openAuthorityPanel() {
    closeCompetingPanels("#authority-panel");
    const panel=$("#authority-panel"),list=$("#authority-title-list"),message=$("#authority-message");
    panel.classList.remove("hidden");$("#profile-editor").classList.add("hidden");
    $("#developer-panel").classList.add("hidden");$("#shop-panel").classList.add("hidden");
    list.textContent="Загрузка званий…";message.textContent="";
    try {
      const data=await authorityApi("/"),current=data.current;
      $("#authority-current-label").textContent="Текущее звание: "+current.title+" · Koins: "+Number(current.koins).toLocaleString("ru-RU");
      const currentOrder=data.titles.find(item=>item.title_key===current.titleKey)?.sort_order??0;
      list.replaceChildren();
      const icons={NOVICE:"✦",BEDA:"☀",PAPA:"👑",ANGEL:"✧",CREATOR:"🔥"};
      data.titles.forEach(item=>{
        const card=document.createElement("article");card.className="authority-title-card"+(item.title_key===current.titleKey?" current":"");card.dataset.aura=item.aura_type;
        const icon=document.createElement("div");icon.className="authority-title-icon";icon.textContent=icons[item.title_key]||"✦";
        const info=document.createElement("div");info.className="authority-title-info";
        const name=document.createElement("strong");name.textContent=item.title_label;
        const desc=document.createElement("small");
        desc.textContent=item.title_key==="NOVICE"?"Начальное звание персонажа. Без специальной ауры."
          :item.title_key==="BEDA"?"Мягкое золотое сияние и частицы."
          :item.title_key==="PAPA"?"Премиальная золотая аура с искрами."
          :item.title_key==="ANGEL"?"Зелёное свечение и лёгкие частицы."
          :"Красное пламя, огненные частицы и сверкающие искры.";
        const price=document.createElement("em");price.textContent=item.sort_order===0?"Стартовое звание":Number(item.koins_price).toLocaleString("ru-RU")+" Koins · "+item.min_authority+" авторитета";
        info.append(name,desc,price);card.append(icon,info);
        const button=document.createElement("button");button.type="button";
        if(item.title_key===current.titleKey){button.textContent="Текущее звание";button.disabled=true;}
        else if(item.sort_order<currentOrder){button.textContent="Уже пройдено";button.disabled=true;}
        else if(item.sort_order!==currentOrder+1||!item.enabled){button.textContent=item.enabled?"Сначала предыдущее звание":"Недоступно";button.disabled=true;}
        else if(Number(current.authority)<Number(item.min_authority)){button.textContent="Нужно "+item.min_authority+" авторитета";button.disabled=true;}
        else {
          button.textContent="Повысить за "+Number(item.koins_price).toLocaleString("ru-RU")+" Koins";
          button.addEventListener("click",async()=>{
            button.disabled=true;message.textContent="Проверяем покупку…";
            try {
              const result=await authorityApi("/purchase",{method:"POST",body:JSON.stringify({titleKey:item.title_key,requestId:crypto.randomUUID()})});
              message.textContent="Звание «"+item.title_label+"» получено!";
              state.me={...state.me,authorityTitle:result.current.titleKey,auraType:item.aura_type,auraEnabled:result.current.auraEnabled};
              const me=state.players.get(state.me?.id);if(me)Object.assign(me,{authorityTitle:result.current.titleKey,auraType:item.aura_type,auraEnabled:result.current.auraEnabled});
              $("#authority-current-label").textContent="Текущее звание: "+result.current.title+" · Koins: "+Number(result.current.koins).toLocaleString("ru-RU");
              const profileResponse=await fetch("/api/profile",{credentials:"same-origin"}),profileData=await profileResponse.json();
              if(profileResponse.ok){$("#profile-koins").textContent=profileData.profile.koins;const refreshedAuthority=await authorityApi("/");paintAuthorityProfile(profileData.profile,refreshedAuthority.titles);}
              showToast("Новое звание: "+item.title_label);await openAuthorityPanel();
            }catch(error){message.textContent=error.message;button.disabled=false;}
          });
        }
        card.append(button);list.append(card);
      });
    }catch(error){list.textContent=error.message;}
  }
  $("#authority-open").addEventListener("click",openAuthorityPanel);
  $("#authority-close").addEventListener("click",()=>$("#authority-panel").classList.add("hidden"));
  $("#my-profile").addEventListener("click", openMyProfile);
  $("#profile-editor-close").addEventListener("click", () => $("#profile-editor").classList.add("hidden"));
  function syncAuraQualityLabel() {
    const button = $("#profile-aura-quality-toggle");
    if (button) button.textContent = "✨ Качество аур: " + (state.auraQuality === "high" ? "высокое" : "экономное");
  }
  $("#profile-aura-quality-toggle").addEventListener("click", () => {
    state.auraQuality = state.auraQuality === "high" ? "low" : "high";
    localStorage.setItem("nexora-aura-quality", state.auraQuality);
    syncAuraQualityLabel();
    showToast("Качество аур: " + (state.auraQuality === "high" ? "высокое" : "экономное"));
  });
  syncAuraQualityLabel();
  $("#profile-save").addEventListener("click", async () => {
    const button = $("#profile-save");
    const errorBox = $("#profile-editor-error");
    button.disabled = true;
    errorBox.textContent = "";
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: $("#profile-status").value,
          bio: $("#profile-bio").value,
          avatar: editorAvatarSettings()
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить профиль.");
      $("#profile-editor-nickname").textContent = data.profile.nickname;
      showToast("Профиль сохранён.");
      $("#profile-editor").classList.add("hidden");
    } catch (error) {
      errorBox.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });


  let developerTab = "overview";
  let developerPermissions = [];
  let developerRole = "USER";
  let developerIsOwner = false;
  let developerAdminAssigned = false;
  async function developerRequest(path, options = {}) {
    const response = await fetch("/api/developer" + path, {
      credentials: "same-origin",
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Нет доступа к панели.");
    return data;
  }
  async function refreshDeveloperAccess() {
    try {
      const data = await developerRequest("/access");
      developerPermissions = data.permissions || [];
      developerRole = data.role || "USER";
      developerIsOwner = Boolean(data.isOwner);
      $("#developer-open").classList.toggle("hidden", !data.allowed);
      $("#room-developer-action").classList.toggle("hidden", !data.allowed);
      $("#developer-roles-tab").classList.toggle("hidden", !developerPermissions.includes("roles.manage"));
      if (state.selected && String(state.selected) === String(state.me?.id)) {
        const own = state.players.get(String(state.me.id)) || state.me;
        renderDeveloperPlayerActions(own, true);
      }
      $("#developer-authority-tab").classList.toggle("hidden", !developerPermissions.some(permission => permission.startsWith("authority.")));
      $("#developer-planets-tab").classList.toggle("hidden", !developerPermissions.includes("planets.view"));
    } catch (_error) {
      developerPermissions = [];
      developerRole = "USER";
      developerIsOwner = false;
      $("#developer-open").classList.add("hidden");
      $("#room-developer-action").classList.add("hidden");
    }
  }
  function developerRender(title, rows) {
    const content = $("#developer-content");
    content.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = title;
    content.append(heading);
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "developer-muted";
      empty.textContent = "Пока нет данных.";
      content.append(empty);
      return;
    }
    rows.forEach((row) => {
      const item = document.createElement("div");
      item.className = "developer-row";
      const label = document.createElement("strong");
      label.textContent = String(row.title || "Событие");
      const detail = document.createElement("span");
      detail.textContent = String(row.detail || "");
      item.append(label, detail);
      content.append(item);
    });
  }
  async function loadDeveloperTab(tab = developerTab) {
    developerTab = tab;
    document.querySelectorAll("[data-developer-tab]").forEach((button) => button.classList.toggle("active", button.dataset.developerTab === tab));
    const content = $("#developer-content");
    content.textContent = "Загрузка…";
    try {
      if (tab === "overview") {
        const d = await developerRequest("/overview");
        developerRender("Состояние NEXORA", [
          { title: "Статус сервера", detail: d.server }, { title: "Игроки онлайн", detail: d.onlinePlayers },
          { title: "Аккаунты", detail: d.accounts }, { title: "Персонажи", detail: d.characters },
          { title: "Активные комнаты", detail: d.activeRooms }, { title: "База данных", detail: d.database }
        ]);
      } else if (tab === "players") {
        const d = await developerRequest("/players");
        content.replaceChildren();
        const heading = document.createElement("h3"); heading.textContent = "Управление игроками"; content.append(heading);
        const search = document.createElement("input"); search.type = "search"; search.maxLength = 18; search.placeholder = "Поиск по ID или никнейму"; content.append(search);
        const list = document.createElement("div"); content.append(list);
        const renderPlayers = rows => {
          list.replaceChildren();
          rows.forEach(p => {
            const row = document.createElement("div"); row.className = "developer-row";
            const label = document.createElement("strong"); label.textContent = p.nickname + " · ID " + p.id + (p.banned ? " · ЗАБЛОКИРОВАН" : "");
            const detail = document.createElement("span"); detail.textContent = (p.online ? "В сети" : "Не в сети") + " · " + p.planet + " · Koins: " + p.balance;
            row.append(label, detail);
            if (developerPermissions.includes("players.warn")) {
              const warn = document.createElement("button"); warn.type = "button"; warn.textContent = "Предупредить";
              warn.addEventListener("click", async () => { const reason = prompt("Причина предупреждения"); if (!reason) return; try { await developerRequest("/players/"+p.id+"/warn",{method:"POST",body:JSON.stringify({reason})}); showToast("Предупреждение выдано."); } catch(error){showToast(error.message);} });
              row.append(warn);
            }
            const canBan = developerPermissions.includes("players.ban");
            const canUnban = developerPermissions.includes("players.unban");
            if ((!p.banned && canBan) || (p.banned && canUnban)) {
              const ban = document.createElement("button"); ban.type = "button"; ban.textContent = p.banned ? "🔓 Разблокировать персонажа" : "🔒 Заблокировать персонажа";
              ban.addEventListener("click", async () => {
                const reason = prompt(p.banned ? "Причина разблокировки" : "Причина блокировки"); if (!reason?.trim()) return;
                ban.disabled = true;
                try {
                  if (p.banned) {
                    const result = await developerRequest("/players/"+p.id+"/ban",{method:"DELETE",body:JSON.stringify({reason})});
                    if (!result.revoked) throw new Error("Активная блокировка не найдена.");
                    showToast("Персонаж разблокирован. Теперь он может войти в NEXORA.");
                  } else {
                    const duration = prompt("Срок в часах. Оставь пустым для постоянной блокировки.","24");
                    if (duration===null) return;
                    await developerRequest("/players/"+p.id+"/ban",{method:"POST",body:JSON.stringify({reason,hours:duration===""?null:Number(duration)})});
                    showToast("Персонаж заблокирован.");
                  }
                  loadDeveloperTab("players");
                } catch(error){showToast(error.message);ban.disabled=false;}
              });
              row.append(ban);
            }
            if (developerPermissions.includes("players.delete")) {
              const remove = document.createElement("button");
              remove.type = "button";
              remove.textContent = "Удалить персонажа";
              remove.className = "danger-button";
              remove.addEventListener("click", async () => {
                const confirmation = prompt("ВНИМАНИЕ: будет удалён персонаж и аккаунт, включая друзей, переписки, Koins и инвентарь. Для подтверждения введи ник: " + p.nickname);
                if (confirmation === null) return;
                const reason = prompt("Причина удаления персонажа:");
                if (!reason?.trim()) return;
                remove.disabled = true;
                try {
                  await developerRequest("/players/" + p.id, { method: "DELETE", body: JSON.stringify({ confirmNickname: confirmation, reason }) });
                  showToast("Персонаж " + p.nickname + " удалён.");
                  loadDeveloperTab("players");
                } catch (error) { showToast(error.message); remove.disabled = false; }
              });
              row.append(remove);
            }
            list.append(row);
          });
        };
        renderPlayers(d.players);
        let searchTimer;
        search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer=setTimeout(async()=>{try{const result=await developerRequest("/players?q="+encodeURIComponent(search.value));renderPlayers(result.players);}catch(error){showToast(error.message);}},250);});
      } else if (tab === "moderation") {
        const d = await developerRequest("/moderation");
        developerRender("История модерации", d.entries.map(e => ({title: e.action_type + " · " + e.target_nickname + " · ID " + e.target_account_id, detail: e.reason + " · " + e.actor_nickname + " · " + new Date(e.created_at).toLocaleString("ru-RU") + (e.expires_at ? " · до " + new Date(e.expires_at).toLocaleString("ru-RU") : "") + (e.revoked_at ? " · отменено" : "")})));
        const reportsTitle=document.createElement("h3");reportsTitle.textContent="Жалобы игроков";content.append(reportsTitle);
        (d.reports||[]).forEach(report=>{
          const row=document.createElement("div");row.className="developer-row";
          const title=document.createElement("strong");title.textContent="#"+report.id+" · "+report.category+" · "+report.target_nickname+" (ID "+report.target_account_id+")";
          const detail=document.createElement("span");detail.textContent="От: "+report.reporter_nickname+" · "+report.details+" · "+report.status+" · "+new Date(report.created_at).toLocaleString("ru-RU");
          row.append(title,detail);
          if(developerPermissions.includes("reports.manage")&&report.status!=="resolved"&&report.status!=="dismissed"){
            const actions=document.createElement("div");actions.className="developer-actions";
            [["reviewing","В работу"],["resolved","Закрыть"],["dismissed","Отклонить"]].forEach(([status,label])=>{
              const button=document.createElement("button");button.type="button";button.textContent=label;
              button.addEventListener("click",async()=>{button.disabled=true;try{await developerRequest("/reports/"+report.id,{method:"PATCH",body:JSON.stringify({status})});showToast("Статус жалобы обновлён.");loadDeveloperTab("moderation");}catch(error){showToast(error.message);button.disabled=false;}});
              actions.append(button);
            });
            row.append(actions);
          }
          content.append(row);
        });
        if(!(d.reports||[]).length){const empty=document.createElement("p");empty.className="developer-muted";empty.textContent="Новых жалоб нет.";content.append(empty);}
      } else if (tab === "world") {
        const d = await developerRequest("/world");
        developerRender("Планеты и комнаты", d.world.map(p => ({ title: p.title, detail: p.online + " онлайн · " + p.rooms + " комнат" })));

      } else if (tab === "planets") {
        if(!developerPermissions.includes("planets.view"))throw new Error("Недостаточно прав.");
        const d=await developerRequest("/planets");
        content.replaceChildren();
        const heading=document.createElement("h3");heading.textContent="Управление пользовательскими планетами";content.append(heading);
        d.planets.forEach(p=>{
          const row=document.createElement("div");row.className="developer-row";
          const title=document.createElement("strong");title.textContent=p.name+" · ID "+p.id+" · "+p.owner_nickname;
          const detail=document.createElement("span");detail.textContent=p.status+" · "+p.online+" онлайн · "+p.total_visits+" посещений · "+p.access_mode;
          row.append(title,detail);
          if(developerPermissions.includes("planets.manage")){
            const action=document.createElement("select");["hide","block","restore","transfer","delete"].forEach(value=>{const option=document.createElement("option");option.value=value;option.textContent=({hide:"Скрыть",block:"Заблокировать",restore:"Восстановить",transfer:"Передать владельца",delete:"Удалить"})[value];action.append(option);});
            const run=document.createElement("button");run.type="button";run.textContent="Применить";
            run.addEventListener("click",async()=>{
              const value=action.value,reason=prompt("Причина действия")||"";if(!reason)return;
              const accountId=value==="transfer"?prompt("ID нового владельца"):"";if(value==="transfer"&&!accountId)return;
              if(value==="delete"&&!confirm("Удалить планету "+p.name+"? Это действие необратимо."))return;
              try{const response=await fetch("/api/developer/planets/"+p.id+"/action",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:value,reason,accountId})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Ошибка");showToast("Действие выполнено.");loadDeveloperTab("planets");}
              catch(error){showToast(error.message);}
            });
            row.append(action,run);
          }
          content.append(row);
        });
      } else if (tab === "authority") {
        if (!developerPermissions.some(permission => permission.startsWith("authority."))) throw new Error("Недостаточно прав.");
        const data=await authorityApi("/");
        content.replaceChildren();
        const heading=document.createElement("h3");heading.textContent="Выдача авторитетов и аур";content.append(heading);
        const hint=document.createElement("p");hint.className="developer-muted";hint.textContent="Введи ник игрока, выбери его и выполни нужное действие. Причина не требуется.";content.append(hint);
        const form=document.createElement("form");form.className="developer-authority-form developer-authority-quick";
        const searchInput=document.createElement("input");searchInput.type="search";searchInput.maxLength=24;searchInput.autocomplete="off";searchInput.placeholder="Ник игрока или ID";
        const searchButton=document.createElement("button");searchButton.type="button";searchButton.textContent="Найти игрока";
        const searchResults=document.createElement("div");searchResults.className="developer-search-results";
        const selectedCard=document.createElement("section");selectedCard.className="developer-selected-player hidden";
        const selectedName=document.createElement("strong");const selectedStatus=document.createElement("span");
        selectedCard.append(selectedName,selectedStatus);
        const title=document.createElement("select");
        data.titles.forEach(item=>{const option=document.createElement("option");option.value=item.title_key;option.textContent=item.title_label;title.append(option);});
        const auraLabel=document.createElement("label");auraLabel.className="developer-aura-toggle";
        const aura=document.createElement("input");aura.type="checkbox";aura.checked=true;
        auraLabel.append(aura,document.createTextNode("Включить ауру"));
        const submit=document.createElement("button");submit.type="submit";submit.textContent="Выдать звание";
        const removeButton=document.createElement("button");removeButton.type="button";removeButton.className="developer-remove-rank";removeButton.textContent="Снять звание · вернуть Новичка";
        const auraButton=document.createElement("button");auraButton.type="button";auraButton.className="developer-aura-action";auraButton.textContent="Включить ауру";
        form.append(searchInput,searchButton,searchResults,selectedCard,title,auraLabel,submit);
        if(developerPermissions.includes("authority.remove"))form.append(removeButton);
        if(developerPermissions.includes("authority.assign"))form.append(auraButton);
        content.append(form);
        let selectedPlayer=null;
        const labelFor=key=>data.titles.find(item=>item.title_key===key)?.title_label||"Новичок";
        const updateSelected=()=>{
          if(!selectedPlayer){selectedCard.classList.add("hidden");submit.disabled=true;removeButton.disabled=true;auraButton.disabled=true;return;}
          selectedCard.classList.remove("hidden");
          selectedName.textContent=selectedPlayer.nickname+" · ID "+selectedPlayer.id;
          const rank=selectedPlayer.authority_title||"NOVICE";
          selectedStatus.textContent=labelFor(rank)+" · "+(rank==="NOVICE"?"NONE":(selectedPlayer.aura_enabled?"Аура включена":"Аура выключена"));
          if([...title.options].some(option=>option.value===rank))title.value=rank;
          aura.checked=rank!=="NOVICE"&&Boolean(selectedPlayer.aura_enabled);
          submit.disabled=!developerPermissions.includes("authority.assign");
          removeButton.disabled=!developerPermissions.includes("authority.remove")||rank==="NOVICE";
          auraButton.disabled=!developerPermissions.includes("authority.assign")||rank==="NOVICE";
          auraButton.textContent=selectedPlayer.aura_enabled?"Выключить ауру":"Включить ауру";
        };
        async function findDeveloperPlayers(){
          const query=searchInput.value.trim();
          if(!query){searchResults.replaceChildren();const note=document.createElement("p");note.textContent="Введи ник или ID игрока.";searchResults.append(note);return;}
          searchButton.disabled=true;searchResults.replaceChildren();
          try{
            const found=await authorityApi("/admin/players?q="+encodeURIComponent(query));
            if(!found.players.length){const empty=document.createElement("p");empty.textContent="Игроки не найдены.";searchResults.append(empty);return;}
            found.players.forEach(player=>{
              const pick=document.createElement("button");pick.type="button";
              const rank=player.authority_title||"NOVICE";
              pick.textContent=player.nickname+" · "+labelFor(rank)+" · "+(rank==="NOVICE"?"NONE":(player.aura_enabled?"Аура включена":"Аура выключена"));
              pick.addEventListener("click",()=>{
                selectedPlayer={...player};
                searchResults.replaceChildren();
                updateSelected();
              });
              searchResults.append(pick);
            });
          }catch(error){showToast(error.message);}finally{searchButton.disabled=false;}
        }
        searchButton.addEventListener("click",findDeveloperPlayers);
        searchInput.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();findDeveloperPlayers();}});
        title.addEventListener("change",()=>{aura.checked=title.value!=="NOVICE";});
        async function applyRank(titleKey,auraEnabled,button,successText){
          if(!selectedPlayer)return showToast("Сначала найди игрока.");
          button.disabled=true;
          try{
            const response=await fetch("/api/authority/admin/assign",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:selectedPlayer.id,titleKey,auraEnabled})});
            const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"Не удалось выполнить действие.");
            selectedPlayer.authority_title=result.titleKey;
            selectedPlayer.aura_enabled=Boolean(result.auraEnabled);
            updateSelected();
            showToast(successText+" · "+selectedPlayer.nickname);
          }catch(error){showToast(error.message);}finally{button.disabled=false;}
        }
        form.addEventListener("submit",async event=>{
          event.preventDefault();
          if(!developerPermissions.includes("authority.assign"))return showToast("Недостаточно прав.");
          await applyRank(title.value,aura.checked,submit,"Звание выдано");
        });
        removeButton.addEventListener("click",async()=>{
          if(!selectedPlayer)return showToast("Сначала найди игрока.");
          removeButton.disabled=true;
          try{
            const response=await fetch("/api/authority/admin/remove/"+encodeURIComponent(selectedPlayer.id),{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({})});
            const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"Не удалось снять звание.");
            selectedPlayer.authority_title="NOVICE";selectedPlayer.aura_enabled=false;updateSelected();
            showToast("Возвращён статус Новичок · NONE.");
          }catch(error){showToast(error.message);}finally{removeButton.disabled=false;}
        });
        auraButton.addEventListener("click",async()=>{
          if(!selectedPlayer)return showToast("Сначала найди игрока.");
          const rank=selectedPlayer.authority_title||"NOVICE";
          if(rank==="NOVICE")return showToast("Сначала выдай игроку звание.");
          await applyRank(rank,!selectedPlayer.aura_enabled,auraButton,selectedPlayer.aura_enabled?"Аура выключена":"Аура включена");
        });
        updateSelected();
        if(developerPermissions.includes("authority.configure")){
          const configTitle=document.createElement("h3");configTitle.textContent="Стоимость и требования";content.append(configTitle);
          const response=await fetch("/api/authority/admin/config",{credentials:"same-origin"}),config=await response.json();
          if(!response.ok)throw new Error(config.error||"Не удалось загрузить настройки.");
          (config.titles||[]).forEach(item=>{
            const row=document.createElement("div");row.className="authority-config-row";
            const name=document.createElement("strong");name.textContent=item.title_label;
            const priceLabel=document.createElement("label");priceLabel.textContent="Цена Koins";
            const price=document.createElement("input");price.type="number";price.min="0";price.value=item.koins_price;
            const minLabel=document.createElement("label");minLabel.textContent="Требуемый авторитет";
            const minimum=document.createElement("input");minimum.type="number";minimum.min="0";minimum.value=item.min_authority;
            const enabledLabel=document.createElement("label");const enabled=document.createElement("input");enabled.type="checkbox";enabled.checked=item.enabled;enabledLabel.append(enabled,document.createTextNode("Доступно"));
            const save=document.createElement("button");save.type="button";save.textContent="Сохранить";
            save.addEventListener("click",async()=>{
              save.disabled=true;
              try{
                const result=await fetch("/api/authority/admin/config/"+item.title_key,{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({koinsPrice:Number(price.value),minAuthority:Number(minimum.value),enabled:enabled.checked})}).then(r=>r.json());
                if(!result.ok)throw new Error(result.error||"Ошибка сохранения");showToast("Настройки "+item.title_label+" сохранены.");
              }catch(error){showToast(error.message);}finally{save.disabled=false;}
            });
            row.append(name,priceLabel,price,minLabel,minimum,enabledLabel,save);content.append(row);
          });
        }
        if(developerPermissions.includes("authority.history")){
          const historyHeading=document.createElement("h3");historyHeading.textContent="История игрока";content.append(historyHeading);
          const historyId=document.createElement("input");historyId.placeholder="ID аккаунта";historyId.inputMode="numeric";content.append(historyId);
          const historyButton=document.createElement("button");historyButton.type="button";historyButton.textContent="Загрузить историю";content.append(historyButton);
          historyButton.addEventListener("click",async()=>{
            try{
              const response=await fetch("/api/authority/admin/history/"+encodeURIComponent(historyId.value),{credentials:"same-origin"}),result=await response.json();
              if(!response.ok)throw new Error(result.error||"Ошибка истории");
              const box=document.createElement("div");
              (result.history||[]).forEach(entry=>{
                const row=document.createElement("div");row.className="developer-row";
                const strong=document.createElement("strong");strong.textContent=entry.old_title+" → "+entry.new_title;
                const detail=document.createElement("span");detail.textContent=entry.source+" · "+(entry.actor_nickname||"Система")+" · "+(entry.reason||"")+(entry.koins_spent?" · списано "+Number(entry.koins_spent).toLocaleString("ru-RU")+" Koins":"")+" · "+new Date(entry.created_at).toLocaleString("ru-RU");
                row.append(strong,detail);box.append(row);
              });
              content.append(box);
            }catch(error){showToast(error.message);}
          });
        }
      } else if (tab === "roles") {
        if (!developerPermissions.includes("roles.manage")) throw new Error("Недостаточно прав.");
        const d = await developerRequest("/roles");
        content.replaceChildren();
        const heading = document.createElement("h3");
        heading.textContent = "Управление ролями";
        content.append(heading);
        const form = document.createElement("form");
        form.className = "developer-role-form";
        const account = document.createElement("input");
        account.type = "number"; account.min = "1"; account.required = true; account.placeholder = "ID аккаунта";
        const role = document.createElement("select");
        ["DEVELOPER","MODERATOR","HELPER","USER"].forEach(value => {
          const option = document.createElement("option"); option.value = value; option.textContent = value; role.append(option);
        });
        const reason = document.createElement("input");
        reason.maxLength = 500; reason.placeholder = "Причина назначения";
        const permissionWrap = document.createElement("div");
        permissionWrap.className = "developer-permission-grid";
        const available = ["players.view","players.ban","players.unban","players.warn","players.delete","moderation.view","reports.manage","world.view","world.manage","economy.view","economy.manage","items.view","items.manage","system.view","logs.view","authority.view","authority.assign","authority.remove","authority.configure","authority.history","planets.view","planets.manage"];
        available.forEach(value => {
          const label = document.createElement("label");
          const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.value = value;
          label.append(checkbox, document.createTextNode(value)); permissionWrap.append(label);
        });
        const submit = document.createElement("button");
        submit.type = "submit"; submit.textContent = "Сохранить роль";
        form.append(account, role, reason, permissionWrap, submit);
        form.addEventListener("submit", async event => {
          event.preventDefault(); submit.disabled = true;
          try {
            const permissions = [...permissionWrap.querySelectorAll("input:checked")].map(input => input.value);
            const response = await fetch("/api/developer/roles", {
              method: "POST", credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ accountId: account.value, role: role.value, reason: reason.value, permissions })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || "Не удалось изменить роль.");
            showToast("Роль игрока обновлена.");
            loadDeveloperTab("roles");
          } catch (error) { showToast(error.message); }
          finally { submit.disabled = false; }
        });
        content.append(form);
        const listTitle = document.createElement("h3"); listTitle.textContent = "Назначенные роли"; content.append(listTitle);
        d.assignments.forEach(assignment => {
          const row = document.createElement("div"); row.className = "developer-row";
          const name = document.createElement("strong"); name.textContent = assignment.nickname + " · ID " + assignment.id;
          const detail = document.createElement("span"); detail.textContent = assignment.role + " · " + (assignment.permissions || []).join(", ");
          row.append(name, detail); content.append(row);
        });
      } else if (tab === "audit") {
        const d = await developerRequest("/audit");
        developerRender("Последние действия", d.entries.map(e => ({ title: e.action, detail: e.actorNickname + " · " + e.createdAt + (e.reason ? " · " + e.reason : "") })));
      }
    } catch (error) { content.textContent = error.message; }
  }
  function openDeveloperPanel(tab = "overview") {
    closeCompetingPanels("#developer-panel");
    $("#developer-panel").classList.remove("hidden");
    $("#profile-editor").classList.add("hidden");
    loadDeveloperTab(tab);
  }
  $("#developer-open").addEventListener("click", () => openDeveloperPanel("overview"));
  $("#developer-close").addEventListener("click", () => $("#developer-panel").classList.add("hidden"));
  document.querySelectorAll("[data-developer-tab]").forEach(button => button.addEventListener("click", () => loadDeveloperTab(button.dataset.developerTab)));

  let activeConversationId = null;
  let socialUnread = 0;

  async function socialApi(path, options = {}) {
    const response = await fetch("/api/social" + path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Ошибка социального раздела.");
    return data;
  }
  function makeSocialRow(title, subtitle, actions = []) {
    const row = document.createElement("div");
    row.className = "social-row";
    const label = document.createElement("div");
    label.className = "social-name";
    label.textContent = title;
    if (subtitle) {
      const small = document.createElement("small");
      small.textContent = subtitle;
      label.append(small);
    }
    row.append(label);
    actions.forEach(({ text, run }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.addEventListener("click", run);
      row.append(button);
    });
    return row;
  }
  function emptySocial(container, text) {
    const p = document.createElement("p");
    p.className = "social-empty";
    p.textContent = text;
    container.replaceChildren(p);
  }
  async function refreshSocial() {
    try {
      await Promise.all([loadFriends(), loadNotifications()]);
      await loadConversations();
    } catch (error) { console.warn("Social refresh:", error.message); }
  }
  async function loadFriends() {
    const [friends, requests] = await Promise.all([
      socialApi("/friends"), socialApi("/requests")
    ]);
    const friendsBox = $("#social-friends");
    friendsBox.replaceChildren();
    if (!friends.friends.length) emptySocial(friendsBox, "Пока нет друзей.");
    friends.friends.forEach(friend => {
      friendsBox.append(makeSocialRow(friend.nickname, (friend.online ? "В сети" : "Не в сети") + (friend.planet ? " · " + friend.planet : "") + (friend.profile_status ? " · " + friend.profile_status : ""), [
        { text: "Профиль", run: () => openPublicProfile(friend.id) },
        { text: "Написать", run: async () => {
          try {
            const result = await socialApi("/conversations", { method: "POST", body: JSON.stringify({ peerId: friend.id }) });
            await openMyProfile("messages"); await loadConversations(); await openConversation(result.conversationId);
          } catch (error) { showToast(error.message); }
        }},
        { text: "Удалить", run: async () => {
          try { await socialApi("/friends/" + friend.id, { method: "DELETE" }); await loadFriends(); showToast("Друг удалён."); }
          catch (error) { showToast(error.message); }
        }}
      ]));
    });
    const outgoingBox = $("#social-outgoing");
    outgoingBox.replaceChildren();
    if (!requests.outgoing.length) emptySocial(outgoingBox, "Нет отправленных заявок.");
    requests.outgoing.forEach(request => outgoingBox.append(makeSocialRow(request.nickname, "Ожидает ответа", [
      { text: "Отменить", run: async () => {
        try { await socialApi("/requests/" + request.id, { method: "DELETE" }); await loadFriends(); }
        catch (error) { showToast(error.message); }
      }}
    ])));
    const requestBox = $("#social-requests");
    requestBox.replaceChildren();
    if (!requests.incoming.length) emptySocial(requestBox, "Новых заявок нет.");
    requests.incoming.forEach(request => {
      requestBox.append(makeSocialRow(request.nickname, "Хочет добавить вас в друзья", [
        { text: "Принять", run: async () => {
          try { await socialApi("/requests/" + request.id + "/accept", { method: "POST" }); await loadFriends(); showToast("Теперь вы друзья."); }
          catch (error) { showToast(error.message); }
        }},
        { text: "Отклонить", run: async () => {
          try { await socialApi("/requests/" + request.id + "/decline", { method: "POST" }); await loadFriends(); }
          catch (error) { showToast(error.message); }
        }}
      ]));
    });
  }
  async function searchSocialUsers(query) {
    const box = $("#social-search-results");
    if (query.trim().length < 2) { box.replaceChildren(); return; }
    try {
      const result = await socialApi("/users?q=" + encodeURIComponent(query.trim()));
      box.replaceChildren();
      if (!result.users.length) return emptySocial(box, "Игроки не найдены.");
      result.users.forEach(user => box.append(makeSocialRow(user.nickname,
        (user.online ? "● В сети" : "○ Не в сети") + " · " + (user.title || "Новичок") + " · Ур. " + user.level,
        [
          { text: "Инфо", run: () => openPublicProfile(user.id) },
          { text: "Добавить", run: async () => {
            try {
              await socialApi("/requests", { method: "POST", body: JSON.stringify({ targetId: user.id }) });
              showToast("Заявка отправлена: " + user.nickname);
              await loadFriends();
            } catch (error) { showToast(error.message); }
          }}
        ])));
    } catch (error) { showToast(error.message); }
  }
  let messageSearchTimer;
  async function searchMessagePlayers(query) {
    const box=$("#message-player-results");
    clearTimeout(messageSearchTimer);
    const value=String(query||"").trim();
    if(value.length<2){box.replaceChildren();return;}
    messageSearchTimer=setTimeout(async()=>{
      try{
        const result=await socialApi("/users?q="+encodeURIComponent(value));
        box.replaceChildren();
        if(!result.users.length){emptySocial(box,"Персонажи не найдены.");return;}
        result.users.forEach(user=>{
          box.append(makeSocialRow(user.nickname,(user.online?"● В сети":"○ Не в сети")+" · "+(user.title||"Новичок"),[
            {text:"Профиль",run:()=>openPublicProfile(user.id)},
            {text:user.isFriend?"Написать":"Добавить",run:async()=>{
              try{
                if(!user.isFriend){
                  await socialApi("/requests",{method:"POST",body:JSON.stringify({targetId:user.id})});
                  showToast("Заявка отправлена. После принятия можно будет переписываться.");
                  return;
                }
                const conversation=await socialApi("/conversations",{method:"POST",body:JSON.stringify({peerId:user.id})});
                $("#message-player-search").value="";
                box.replaceChildren();
                await loadConversations();
                await openConversation(conversation.conversationId);
              }catch(error){showToast(error.message);}
            }}
          ]));
        });
      }catch(error){showToast(error.message);}
    },220);
  }
  async function loadConversations() {
    const result = await socialApi("/conversations");
    const box = $("#social-conversations");
    box.replaceChildren();
    if (!result.conversations.length) emptySocial(box, "Личных переписок пока нет. Добавьте друга.");
    result.conversations.forEach(item => {
      const subtitle = (item.last_message || "Начните общение") + (Number(item.unread_count) ? " · Новых: " + item.unread_count : "");
      box.append(makeSocialRow(item.nickname, subtitle, [
        { text: "Открыть", run: () => openConversation(item.id) }
      ]));
    });
  }
  async function openConversation(id) {
    activeConversationId = String(id);
    const result = await socialApi("/conversations/" + encodeURIComponent(id) + "/messages");
    const thread = $("#social-thread");
    thread.replaceChildren();
    if (!result.messages.length) emptySocial(thread, "Напишите первое сообщение.");
    result.messages.forEach(message => {
      const row = document.createElement("div");
      row.className = "social-message";
      const author = document.createElement("strong");
      author.textContent = message.nickname + ":";
      const body = document.createElement("span");
      body.textContent = message.body;
      const time = document.createElement("time");
      time.textContent = new Date(message.created_at).toLocaleString();
      row.append(author, body, time);
      thread.append(row);
    });
    thread.scrollTop = thread.scrollHeight;
    await loadConversations();
  }
  async function loadNotifications() {
    const result = await socialApi("/notifications");
    const box = $("#social-notifications");
    box.replaceChildren();
    const unread = result.notifications.filter(item => !item.read_at).length;
    $("#notification-count").textContent = unread ? String(unread) : "";
    if (!result.notifications.length) emptySocial(box, "Уведомлений пока нет.");
    result.notifications.forEach(item => {
      const title = item.type === "friend_request" ? "Новая заявка в друзья" :
        item.type === "friend_accepted" ? "Заявка принята" :
        item.type === "direct_message" ? "Новое личное сообщение" : "Уведомление";
      const actor = item.actor_nickname ? "От: " + item.actor_nickname : "";
      box.append(makeSocialRow(title, actor + (item.read_at ? "" : " · Новое")));
    });
  }
  async function loadOwnerProfileTools(profile) {
    const content = $("#public-profile-owner-content");
    content.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "developer-muted";
    loading.textContent = "Загружаю данные персонажа…";
    content.append(loading);
    try {
      const data = await developerRequest("/players/" + encodeURIComponent(profile.id));
      const player = data.player || {};
      content.replaceChildren();
      const summary = document.createElement("div");
      summary.className = "developer-row";
      const title = document.createElement("strong");
      title.textContent = player.nickname + " · ID " + player.id;
      const detail = document.createElement("span");
      detail.textContent = (player.planet || "Неизвестная комната") + " · " + (player.banned ? "Заблокирован" : "Не заблокирован") + " · Баланс: " + (player.balance || "0") + " Koins";
      summary.append(title, detail);
      content.append(summary);
      const inventory = document.createElement("div");
      inventory.className = "developer-row";
      inventory.textContent = "Предметов в инвентаре: " + (data.inventory || []).length;
      content.append(inventory);
      const punishments = document.createElement("div");
      punishments.className = "developer-row";
      punishments.textContent = "Записей модерации: " + (data.punishments || []).length;
      content.append(punishments);
      const actions = document.createElement("div");
      actions.className = "public-profile-owner-actions";
      const addAction = (label, handler) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", async () => {
          button.disabled = true;
          try { await handler(); }
          catch (error) { showToast(error.message); }
          finally { button.disabled = false; }
        });
        actions.append(button);
      };
      if (developerPermissions.includes("players.warn")) {
        addAction("Выдать предупреждение", async () => {
          const reason = prompt("Причина предупреждения");
          if (!reason?.trim()) return;
          await developerRequest("/players/" + player.id + "/warn", { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
          showToast("Предупреждение выдано.");
          await loadOwnerProfileTools(profile);
        });
      }
      if ((!player.banned && developerPermissions.includes("players.ban")) || (player.banned && developerPermissions.includes("players.unban"))) {
        addAction(player.banned ? "🔓 Разблокировать персонажа" : "🔒 Заблокировать персонажа", async () => {
          const reason = prompt(player.banned ? "Причина разблокировки" : "Причина блокировки");
          if (!reason?.trim()) return;
          if (player.banned) {
            const result = await developerRequest("/players/" + player.id + "/ban", { method: "DELETE", body: JSON.stringify({ reason: reason.trim() }) });
            if (!result.revoked) throw new Error("Активная блокировка не найдена.");
            showToast("Персонаж разблокирован.");
          } else {
            const hours = prompt("Срок в часах. Оставь пустым для постоянной блокировки.", "24");
            if (hours === null) return;
            await developerRequest("/players/" + player.id + "/ban", { method: "POST", body: JSON.stringify({ reason: reason.trim(), hours: hours === "" ? null : Number(hours) }) });
            showToast("Персонаж заблокирован.");
          }
          await loadOwnerProfileTools(profile);
        });
      }
      if (developerPermissions.includes("players.delete") && String(player.id) !== String(state.me?.id)) {
        addAction("Удалить персонажа", async () => {
          const reason = prompt("Причина удаления персонажа");
          if (!reason?.trim()) return;
          const confirmation = prompt("Для подтверждения введи точный ник: " + player.nickname);
          if (confirmation !== player.nickname) throw new Error("Ник не совпадает. Удаление отменено.");
          await developerRequest("/players/" + player.id, { method: "DELETE", body: JSON.stringify({ reason: reason.trim(), confirmNickname: confirmation }) });
          $("#public-profile-owner-tools").classList.add("hidden");
          $("#public-profile").classList.add("hidden");
          showToast("Персонаж удалён.");
        });
      }
      if (developerIsOwner && String(player.id) !== String(state.me?.id)) {
        addAction("Сбросить код доступа", async () => {
          if (!confirm("Сбросить код входа персонажа? Все его активные сессии будут завершены.")) return;
          const result = await developerRequest("/players/" + player.id + "/access-code/reset", { method: "POST", body: "{}" });
          const codeBox = document.createElement("div");
          codeBox.className = "developer-row owner-code-result";
          const label = document.createElement("strong");
          label.textContent = "Новый код доступа. Показывается только сейчас:";
          const value = document.createElement("code");
          value.textContent = result.code;
          const copy = document.createElement("button");
          copy.type = "button";
          copy.textContent = "Копировать код";
          copy.addEventListener("click", async () => {
            try { await navigator.clipboard.writeText(result.code); showToast("Код скопирован."); }
            catch { showToast("Выдели код и скопируй вручную."); }
          });
          codeBox.append(label, value, copy);
          content.append(codeBox);
          showToast("Код обновлён. Предыдущие сессии завершены.");
        });
      }
      addAction("Открыть полную панель разработчика", async () => {
        $("#public-profile").classList.add("hidden");
        openDeveloperPanel("players");
      });
      content.append(actions);
      if (data.inventory?.length) {
        const list = document.createElement("div");
        list.className = "developer-row";
        list.textContent = "Инвентарь: " + data.inventory.map(item => item.item_code + " × " + item.quantity).join(", ");
        content.append(list);
      }
      if (data.punishments?.length) {
        const list = document.createElement("div");
        list.className = "developer-row";
        list.textContent = "Последние действия: " + data.punishments.slice(0, 5).map(item => item.action_type + " · " + item.reason).join(" | ");
        content.append(list);
      }
    } catch (error) {
      content.replaceChildren();
      const message = document.createElement("p");
      message.className = "developer-muted";
      message.textContent = error.message;
      content.append(message);
    }
  }

  async function openPublicProfile(id) {
    closeCompetingPanels("#public-profile");
    const panel=$("#public-profile");
    panel.classList.remove("hidden");
    $("#public-profile-name").textContent="Загрузка...";
    try{
      const response=await fetch("/api/profile/"+encodeURIComponent(id),{credentials:"same-origin"});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Не удалось загрузить профиль.");
      const p=data.profile;
      const ownerTools = $("#public-profile-owner-tools");
      ownerTools.classList.toggle("hidden", !developerIsOwner);
      const ownerToggle = $("#public-profile-owner-toggle");
      const ownerContent = $("#public-profile-owner-content");
      ownerContent.replaceChildren();
      ownerContent.classList.add("hidden");
      ownerToggle.onclick = async () => {
        const opening = ownerContent.classList.contains("hidden");
        ownerContent.classList.toggle("hidden", !opening);
        if (opening) await loadOwnerProfileTools(p);
      };
      $("#public-profile-name").textContent=p.nickname;
      $("#public-profile-developer").classList.toggle("hidden", !p.isDeveloper);
      $("#public-profile-presence").textContent=p.online?"● Сейчас в сети":"○ Не в сети";
      $("#public-profile-joined").textContent="В NEXORA с "+new Date(p.createdAt).toLocaleDateString("ru-RU");
      $("#public-profile-title").textContent=(p.authorityTitle==="NOVICE"?"Новичок":({BEDA:"Беда",PAPA:"Папа",ANGEL:"Ангел",CREATOR:"Создатель"})[p.authorityTitle]||"Новичок")+" · Авторитет "+p.authority;
      $("#public-profile-aura").textContent=p.auraEnabled?"✦ Аура активна":"Аура выключена";
      $("#public-profile-level").textContent=String(p.authorityTitle==="NOVICE"?"Новичок":({BEDA:"Беда",PAPA:"Папа",ANGEL:"Ангел",CREATOR:"Создатель"})[p.authorityTitle]||"Новичок");
      $("#public-profile-level").nextElementSibling.textContent="Звание";
      $("#public-profile-authority").textContent=String(p.authority);
      $("#public-profile-friends").textContent=String(p.friendsCount);
      $("#public-profile-gifts").textContent=String(p.giftsReceived);
      $("#public-profile-status").textContent=p.status||"";
      $("#public-profile-bio").textContent=p.bio||"Игрок пока ничего не рассказал о себе.";
      const avatar=$("#public-profile-avatar"),avatarCtx=avatar.getContext("2d");
      avatarCtx.clearRect(0,0,avatar.width,avatar.height);
      drawAvatar(avatarCtx,90,105,1.8,p.avatar||{},1,null);
      const planetButton=$("#public-profile-planet-travel");
      const planetLabel=$("#public-profile-planet");
      const canTravelToFriend=Boolean(p.isFriend&&p.online&&p.planetKey);
      planetLabel.textContent=p.planetName ? "🪐 Планета: "+p.planetName : (p.online?"🪐 В сети":"🪐 Планета не указана");
      planetLabel.classList.toggle("hidden",!p.isFriend);
      planetButton.classList.toggle("hidden",!canTravelToFriend);
      planetButton.disabled=!canTravelToFriend;
      planetButton.onclick=()=>{
        if(!p.planetKey)return;
        planetButton.disabled=true;
        socket.emit("planet:change",{planet:p.planetKey},result=>{
          planetButton.disabled=false;
          if(!result?.ok)return showToast(result?.error||"Не удалось перейти на планету друга.");
          $("#public-profile").classList.add("hidden");
          showToast("Вы перешли на планету друга.");
        });
      };
      const friendButton=$("#public-profile-friend"),messageButton=$("#public-profile-message");
      friendButton.classList.toggle("hidden",p.isMe||p.isFriend);
      friendButton.textContent=p.requestIncoming?"Принять заявку":p.requestPending?"Заявка отправлена":"Добавить в друзья";
      friendButton.disabled=Boolean(p.requestPending&&!p.requestIncoming);
      messageButton.classList.toggle("hidden",p.isMe||!p.isFriend);
      friendButton.onclick=async()=>{
        try{
          if(p.requestIncoming&&p.requestId){await socialApi("/requests/"+encodeURIComponent(p.requestId)+"/accept",{method:"POST"});friendButton.classList.add("hidden");messageButton.classList.remove("hidden");showToast("Теперь вы друзья.");}
          else{await socialApi("/requests",{method:"POST",body:JSON.stringify({targetId:p.id})});friendButton.disabled=true;friendButton.textContent="Заявка отправлена";showToast("Заявка отправлена.");}
          await loadFriends();
        }catch(error){showToast(error.message);}
      };
      messageButton.onclick=async()=>{
        try{const result=await socialApi("/conversations",{method:"POST",body:JSON.stringify({peerId:p.id})});panel.classList.add("hidden");await openMyProfile("messages");await loadConversations();await openConversation(result.conversationId);}
        catch(error){showToast(error.message);}
      };
    }catch(error){panel.classList.add("hidden");showToast(error.message);}
  }
  $("#public-profile-close").addEventListener("click",()=>$("#public-profile").classList.add("hidden"));

  async function loadRating(category="authority") {
    const box=$("#social-rating-list");
    box.dataset.category=category;
    document.querySelectorAll("[data-rating-category]").forEach(button=>button.classList.toggle("active",button.dataset.ratingCategory===category));
    const response=await fetch("/api/profile/rating?category="+encodeURIComponent(category),{credentials:"same-origin"});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||"Не удалось загрузить рейтинг.");
    box.replaceChildren();
    if(!result.entries.length)emptySocial(box,"Пока нет игроков в рейтинге.");
    result.entries.filter(item=>item.position<=50).forEach(item=>{
      const rankName = item.title || item.authorityTitle || item.authority_title || "Звание не назначено";
      const auraState = item.auraEnabled || item.aura_enabled ? "Аура активна" : "Аура не активна";
      const detail = category === "authority"
        ? rankName + " · Авторитет " + item.score + " · " + auraState
        : category === "level" ? "Уровень " + item.score : "Популярность " + item.score;
      const row=makeSocialRow("#"+item.position+" · "+item.nickname, detail,
        [{text:"Инфо",run:()=>openPublicProfile(item.id)}]);
      row.classList.toggle("rating-top-three",item.position<=3);
      box.append(row);
    });
    $("#social-rating-me").textContent=result.me?"Ваше место: #"+result.me.position+" · "+result.me.nickname:"Ваш рейтинг пока не сформирован.";
  }
  document.querySelectorAll("[data-rating-category]").forEach(button=>button.addEventListener("click",()=>loadRating(button.dataset.ratingCategory).catch(error=>showToast(error.message))));

  function openSocialTab(tab) {
    if (tab === "friends" || tab === "messages") return openMyProfile(tab);
    if (tab !== "rating") return;
    closeCompetingPanels("#social-panel");
    $("#social-panel").classList.remove("hidden");
    $("#social-title").textContent = "Рейтинг игроков";
    $("#social-rating-view").classList.remove("hidden");
    loadRating($("#social-rating-list").dataset.category || "authority").catch(error => showToast(error.message));
  }
  $("#social-open").addEventListener("click", () => openMyProfile("friends"));
  $("#social-close").addEventListener("click", () => $("#social-panel").classList.add("hidden"));
  $("#social-search").addEventListener("input", event => searchSocialUsers(event.target.value));
  $("#message-player-search").addEventListener("input", event => searchMessagePlayers(event.target.value));
  $("#social-message-form").addEventListener("submit", async event => {
    event.preventDefault();
    const input = $("#social-message-input");
    const body = input.value.trim();
    if (!body || !activeConversationId) return;
    try {
      await socialApi("/conversations/" + encodeURIComponent(activeConversationId) + "/messages", { method: "POST", body: JSON.stringify({ body }) });
      input.value = "";
      await openConversation(activeConversationId);
    } catch (error) { showToast(error.message); }
  });
  socket.on("dm:message", message => {
    if (String(message.conversationId) === activeConversationId) openConversation(activeConversationId).catch(() => {});
    else showToast("💬 Новое сообщение от " + message.nickname);
    loadConversations().catch(() => {});
  });
  socket.on("social:notification", () => {
    socialUnread += 1;
    $("#notification-count").textContent = String(socialUnread);
    showToast("🔔 Новое уведомление");
    if (!$("#profile-editor").classList.contains("hidden") && $("#profile-editor").classList.contains("social-mode") && !$("#social-friends-view").classList.contains("hidden")) loadNotifications().catch(() => {});
  });

  if (window.Telegram?.WebApp) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  }

  // NEXORA 11.0 server-backed shop and inventory.
  const SHOP_CATEGORIES = [
    {id:"all",label:"✦ Всё"},{id:"clothes",label:"👕 Одежда"},
    {id:"hair",label:"💇 Причёски"},{id:"accessories",label:"🕶️ Аксессуары"}
  ];
  let activeShopCategory="all",shopCatalog=[],shopInventory=[];
  async function economyRequest(path,options={}){
    const response=await fetch("/api/economy"+path,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Не удалось выполнить запрос.");
    return data;
  }
  function renderShopCategories(){
    const box=$("#shop-categories");box.replaceChildren();
    SHOP_CATEGORIES.forEach(category=>{
      const button=document.createElement("button");button.type="button";
      button.className="shop-category"+(category.id===activeShopCategory?" active":"");
      button.textContent=category.label;
      button.addEventListener("click",()=>{activeShopCategory=category.id;renderShopCategories();renderShopItems();});
      box.append(button);
    });
  }
  function renderShopItems(){
    const box=$("#shop-items");box.replaceChildren();
    const items=shopCatalog.filter(item=>activeShopCategory==="all"||item.category===activeShopCategory);
    $("#shop-category-title").textContent=SHOP_CATEGORIES.find(x=>x.id===activeShopCategory)?.label.replace(/^\S+\s/,"")||"Магазин";
    $("#shop-item-count").textContent=items.length+" предметов";
    const owned=new Set(shopInventory.map(item=>item.code));
    items.forEach(item=>{
      const card=document.createElement("article");card.className="shop-item";
      const art=document.createElement("div");art.className="shop-item-art";art.textContent=item.icon||"✦";
      const body=document.createElement("div");body.className="shop-item-body";
      const name=document.createElement("strong");name.textContent=item.name;
      const desc=document.createElement("p");desc.textContent=item.description||"Предмет NEXORA";
      const price=document.createElement("div");price.className="shop-item-price";price.textContent=Number(item.price).toLocaleString("ru-RU")+" ✦";
      const button=document.createElement("button");button.type="button";
      button.textContent=owned.has(item.code)?"Уже куплено":"Купить";
      button.disabled=owned.has(item.code);
      button.addEventListener("click",async()=>{
        button.disabled=true;button.textContent="Покупка…";
        try{
          const result=await economyRequest("/purchase",{method:"POST",body:JSON.stringify({code:item.code,requestId:crypto.randomUUID()})});
          $("#shop-koins").textContent=Number(result.balance).toLocaleString("ru-RU")+" ✦";
          await loadShopInventory();renderShopItems();showToast("Предмет добавлен в инвентарь.");
        }catch(error){button.disabled=false;button.textContent="Купить";showToast(error.message);}
      });
      body.append(name,desc,price,button);card.append(art,body);box.append(card);
    });
    if(!items.length){const empty=document.createElement("p");empty.className="shop-notice";empty.textContent="В этой категории пока нет предметов.";box.append(empty);}
  }
  async function loadShopInventory(){
    const data=await economyRequest("/inventory");shopInventory=data.items||[];
    $("#shop-koins").textContent=Number(data.balance||0).toLocaleString("ru-RU")+" ✦";
    const box=$("#shop-inventory-items");if(!box)return;
    box.replaceChildren();
    if(!shopInventory.length){const empty=document.createElement("p");empty.className="shop-notice";empty.textContent="Инвентарь пока пуст. Купленные предметы появятся здесь.";box.append(empty);return;}
    shopInventory.forEach(item=>{
      const card=document.createElement("article");card.className="shop-item";
      const art=document.createElement("div");art.className="shop-item-art";art.textContent=item.icon||"✦";
      const body=document.createElement("div");body.className="shop-item-body";
      const name=document.createElement("strong");name.textContent=item.name||item.code;
      const desc=document.createElement("p");desc.textContent=item.description||"Предмет в коллекции";
      const button=document.createElement("button");button.type="button";button.textContent="Надеть";
      button.addEventListener("click",async()=>{
        button.disabled=true;
        try{
          const result=await economyRequest("/equip",{method:"POST",body:JSON.stringify({code:item.code})});
          if(state.me)state.me.avatar=result.avatar;
          const canvas=$("#shop-character-canvas"),ctx=canvas?.getContext("2d");
          if(ctx){ctx.clearRect(0,0,canvas.width,canvas.height);drawAvatar(ctx,110,165,3.0,result.avatar,1,null);}
          showToast("Внешность обновлена.");
        }catch(error){showToast(error.message);}finally{button.disabled=false;}
      });
      body.append(name,desc,button);card.append(art,body);box.append(card);
    });
  }
  async function loadShopHistory(){
    const data=await economyRequest("/transactions");
    const box=$("#shop-history-items");box.replaceChildren();
    if(!data.transactions?.length){const empty=document.createElement("p");empty.className="shop-notice";empty.textContent="Покупок пока нет.";box.append(empty);return;}
    data.transactions.forEach(tx=>{
      const row=document.createElement("div");row.className="developer-row";
      const title=document.createElement("strong");title.textContent=(shopCatalog.find(item=>item.code===tx.code)?.name||tx.code)+" · −"+Number(tx.amount).toLocaleString("ru-RU")+" ✦";
      const detail=document.createElement("span");detail.textContent="Остаток: "+Number(tx.balance_after).toLocaleString("ru-RU")+" ✦ · "+new Date(tx.created_at).toLocaleString("ru-RU");
      row.append(title,detail);box.append(row);
    });
  }
  async function openShop(){
    closeCompetingPanels("#shop-panel");
    $("#shop-panel").classList.remove("hidden");$("#profile-editor").classList.add("hidden");$("#developer-panel").classList.add("hidden");
    $("#shop-character-name").textContent=state.me?.nickname||"Персонаж NEXORA";
    const canvas=$("#shop-character-canvas"),ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);drawAvatar(ctx,110,165,3.0,state.me?.avatar||{},1,null);
    $("#shop-koins").textContent="Загрузка…";
    try{
      const data=await economyRequest("/catalog");shopCatalog=data.items||[];
      await loadShopInventory();activeShopCategory="all";renderShopCategories();renderShopItems();
    }catch(error){$("#shop-koins").textContent="— ✦";showToast(error.message);}
  }
  $("#shop-open").addEventListener("click",openShop);
  $("#shop-close").addEventListener("click",()=>$("#shop-panel").classList.add("hidden"));
  document.querySelectorAll("[data-shop-tab]").forEach(button=>button.addEventListener("click",async()=>{
    const tab=button.dataset.shopTab;
    document.querySelectorAll("[data-shop-tab]").forEach(item=>item.classList.toggle("active",item===button));
    ["store","inventory","character"].forEach(name=>$("#shop-"+name+"-view").classList.toggle("hidden",name!==tab));
    if(tab==="inventory")try{await loadShopInventory();}catch(error){showToast(error.message);}
    if(tab==="history")try{await loadShopHistory();}catch(error){showToast(error.message);}
  }));
  $("#shop-edit-profile").addEventListener("click",()=>{$("#shop-panel").classList.add("hidden");openMyProfile();});

})();