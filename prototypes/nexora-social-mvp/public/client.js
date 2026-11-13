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
    me: null, players: new Map(), planet: "starter", selected: null,
    stars: [], chat: [], roomEvents: [], unreadEvents: 0, width: 0, height: 0, dpr: 1, toastTimer: null, movementFrame: 0,
    auraQuality: localStorage.getItem("nexora-aura-quality") === "low" ? "low" : "high"
  };

  function avatarSettings() {
    return {
      gender: $("#gender").value,
      skin: $("#skin").value,
      hair: $("#hair").value,
      suit: $("#suit").value,
      hairColor: $("#hair-color").value,
      shoes: $("#shoes").value,
      accessory: $("#accessory").value
    };
  }


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
    const skin=avatar?.skin||skins[0],suit=avatar?.suit||suits[0],female=avatar?.gender==="female",hair=avatar?.hair||"short",hairColor=avatar?.hairColor||"#30233d",shoes=avatar?.shoes||"sneakers",accessory=avatar?.accessory||"none",time=Date.now()/1000,phase=moving?Math.sin(time*13):0,bob=emotion==="dance"?Math.sin(time*9)*3:moving?Math.abs(Math.sin(time*13))*1.8:Math.sin(time*2.2)*1.1;
    target.save();target.translate(x,y+bob);target.scale(scale*facing,scale);
    target.fillStyle="rgba(3,7,24,.48)";target.beginPath();target.ellipse(0,40,19+Math.abs(phase),5,0,0,Math.PI*2);target.fill();
    target.strokeStyle="#20294f";target.lineCap="round";target.lineWidth=7;target.beginPath();target.moveTo(-7,17);target.lineTo(-8-phase*4,33);target.moveTo(7,17);target.lineTo(8+phase*4,33);target.stroke();
    target.fillStyle=shoes==="boots"?"#30364f":shoes==="heels"?"#8f466f":"#dfe7ff";target.beginPath();target.roundRect(-14-phase*4,32,12,shoes==="boots"?7:5,2);target.roundRect(2+phase*4,32,12,shoes==="boots"?7:5,2);target.fill();
    target.strokeStyle=skin;target.lineCap="round";target.lineWidth=7;target.beginPath();
    if(emotion==="wave"){target.moveTo(-11,1);target.lineTo(-18,17);target.moveTo(11,1);target.lineTo(19,-13);}
    else {target.moveTo(-11,1);target.lineTo(-18,17+phase*3);target.moveTo(11,1);target.lineTo(18,16-phase*3);}
    target.stroke();
    target.strokeStyle=suit;target.lineWidth=8;target.beginPath();
    if(emotion==="wave"){target.moveTo(-12,1);target.lineTo(-16,10);target.moveTo(12,1);target.lineTo(18,-9);}
    else {target.moveTo(-12,1);target.lineTo(-16,10+phase*2);target.moveTo(12,1);target.lineTo(16,9-phase*2);}
    target.stroke();
    target.fillStyle=skin;target.beginPath();target.arc(-18,18+phase*2,3.5,0,Math.PI*2);target.arc(emotion==="wave"?19:18,emotion==="wave"?-13:17-phase*2,3.5,0,Math.PI*2);target.fill();
    target.fillStyle="rgba(3,7,24,.38)";target.beginPath();target.roundRect(-15,-5,30,30,8);target.fill();target.fillStyle=suit;target.beginPath();
    if(female){target.moveTo(-12,-3);target.lineTo(12,-3);target.lineTo(18,23);target.lineTo(-18,23);}else target.roundRect(-14,-4,28,28,7);target.closePath();target.fill();
    target.fillStyle="rgba(255,255,255,.22)";target.beginPath();target.roundRect(-9,-1,18,3,2);target.fill();target.fillStyle="rgba(8,14,39,.3)";target.fillRect(-2,2,4,17);
    target.fillStyle="#e5d8ff";target.beginPath();target.moveTo(-4,-2);target.lineTo(0,5);target.lineTo(4,-2);target.closePath();target.fill();
    target.fillStyle=skin;target.beginPath();target.roundRect(-4,-10,8,10,3);target.fill();target.beginPath();target.arc(-12,-15,3.2,0,Math.PI*2);target.arc(12,-15,3.2,0,Math.PI*2);target.fill();target.beginPath();target.ellipse(0,-16,12.5,14.5,0,0,Math.PI*2);target.fill();
    target.fillStyle="rgba(255,255,255,.18)";target.beginPath();target.ellipse(-4,-22,4,3,-.4,0,Math.PI*2);target.fill();target.fillStyle="#25203b";target.beginPath();target.ellipse(-4.2,-16,1.35,2,0,0,Math.PI*2);target.ellipse(4.2,-16,1.35,2,0,0,Math.PI*2);target.fill();
    target.strokeStyle="#8b4d50";target.lineWidth=1.2;target.beginPath();if(emotion==="sad")target.arc(0,-8,3,Math.PI+.2,Math.PI*2-.2);else if(emotion==="surprise")target.ellipse(0,-9,1.6,2.2,0,0,Math.PI*2);else target.arc(0,-11,3,.2,Math.PI-.2);target.stroke();
    target.fillStyle=hairColor;
    if(hair==="long"){target.beginPath();target.arc(0,-19,14,Math.PI,Math.PI*2);target.lineTo(14,9);target.quadraticCurveTo(9,13,8,4);target.lineTo(8,-9);target.lineTo(-8,-9);target.lineTo(-8,4);target.quadraticCurveTo(-10,13,-14,9);target.closePath();target.fill();}
    else if(hair==="spiky"){target.beginPath();target.moveTo(-13,-17);target.lineTo(-15,-27);target.lineTo(-6,-23);target.lineTo(0,-32);target.lineTo(6,-23);target.lineTo(15,-27);target.lineTo(13,-12);target.closePath();target.fill();}
    else{target.beginPath();target.arc(0,-19,14,Math.PI,Math.PI*2);target.lineTo(13,-10);target.quadraticCurveTo(6,-16,0,-12);target.quadraticCurveTo(-7,-18,-13,-10);target.closePath();target.fill();}
    target.strokeStyle="rgba(255,255,255,.16)";target.lineWidth=1;target.beginPath();target.arc(-2,-20,10,Math.PI*1.08,Math.PI*1.7);target.stroke();target.fillStyle="#f4d88b";target.beginPath();target.arc(0,7,1.5,0,Math.PI*2);target.fill();
    if(female){target.fillStyle="#f4b5dc";target.beginPath();target.arc(10,-27,2.2,0,Math.PI*2);target.fill();}
    if(accessory==="glasses"){target.strokeStyle="#26324f";target.lineWidth=1.5;target.beginPath();target.roundRect(-8,-19,7,6,2);target.roundRect(1,-19,7,6,2);target.moveTo(-1,-16);target.lineTo(1,-16);target.stroke();}
    else if(accessory==="headphones"){target.strokeStyle="#aab7e8";target.lineWidth=3;target.beginPath();target.arc(0,-17,15,Math.PI,Math.PI*2);target.stroke();target.fillStyle="#7788c9";target.fillRect(-15,-17,4,8);target.fillRect(11,-17,4,8);}
    else if(accessory==="crown"){target.fillStyle="#ffd76a";target.beginPath();target.moveTo(-9,-28);target.lineTo(-7,-37);target.lineTo(-2,-32);target.lineTo(2,-38);target.lineTo(7,-32);target.lineTo(9,-28);target.closePath();target.fill();}
    const icons={wave:"👋",kiss:"💋",dance:"♪",smile:"😊",sad:"😢",laugh:"😂",surprise:"😮",love:"💗",angry:"💢",blush:"☺",sleep:"💤",music:"♫"};if(emotion&&icons[emotion]){target.font="15px sans-serif";target.textAlign="center";target.fillText(icons[emotion],18,-31);}target.restore();
  }

  function preview() {
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    drawAvatar(previewCtx, 90, 130, 2.5, avatarSettings(), 1, null);
  }
  ["gender","skin","hair","suit","hair-color","shoes","accessory"].forEach(id=>$("#"+id).addEventListener("change",preview));
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

  function addHistory(message, whisper = false) {
    state.chat.push({ ...message, whisper });
    if (state.chat.length > 50) state.chat.shift();
    renderHistory();
  }

  function renderHistory() {
    const container = $("#chat-history");
    container.replaceChildren();
    state.chat.forEach((message) => {
      const row = document.createElement("div");
      row.className = "history-message";
      const name = document.createElement("button");
      name.type = "button";
      name.className = "history-author";
      name.textContent = message.whisper ? "Шёпот" : (message.system ? "✦ NEXORA" : message.nickname);
      if(message.system)name.classList.add("system-author");
      if (!message.whisper) name.addEventListener("click", () => {
        const player = [...state.players.values()].find(item => item.nickname === message.nickname);
        if (player) openProfile(player);
      });
      const text = document.createElement("span");
      text.textContent = message.text;
      const time = document.createElement("time");
      time.textContent = new Date(message.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      row.append(name, text, time);
      container.append(row);
    });
    container.scrollTop = container.scrollHeight;
  }

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
    player.moveDuration=Math.max(180,Math.min(2400,distance/185*1000));player.facing=targetX>=fromX?1:-1;
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

  function drawScene() {
    if (gameScreen.classList.contains("hidden")) return;
    const w = state.width, h = state.height;
    const palette = PLANETS[state.planet];
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

    const ordered = [...state.players.values()].sort((a,b)=>(a.renderY??a.y??.82)-(b.renderY??b.y??.82));
    const now = performance.now();
    ordered.forEach((player) => {
      advancePlayerMovement(player, now);
      const drawX = (player.renderX ?? player.x) * w;
      const depth = Math.max(.60,Math.min(.86,player.renderY ?? player.y ?? .82));
      const scale = .78 + ((depth-.60)/.26)*.24;
      const y = depth*h;
      const isMe = String(player.id) === String(state.me?.id);
      const emotion = player.emotion?.until > Date.now() ? player.emotion.type : null;
      if(player.bubble?.until>Date.now()){
        const bubbleText=player.bubble.text;ctx.font="11px sans-serif";
        const bubbleWidth=Math.min(w-24,Math.max(70,ctx.measureText(bubbleText).width+20));
        const bubbleX=Math.max(8,Math.min(w-bubbleWidth-8,drawX-bubbleWidth/2));
        const bubbleY=y-91*scale;ctx.fillStyle="rgba(255,255,255,.94)";
        roundRect(ctx,bubbleX,bubbleY,bubbleWidth,27,10);ctx.fill();
        ctx.fillStyle="#1a2146";ctx.textAlign="center";ctx.fillText(bubbleText,bubbleX+bubbleWidth/2,bubbleY+17,bubbleWidth-12);ctx.textAlign="start";
      }
      if(String(state.selected)===String(player.id)){
        ctx.save();ctx.strokeStyle="#e7dcff";ctx.lineWidth=2;ctx.shadowColor="#a58cff";ctx.shadowBlur=16;
        ctx.beginPath();ctx.ellipse(drawX,y+2,25*scale,46*scale,0,0,Math.PI*2);ctx.stroke();ctx.restore();
      }
      drawAura(ctx,drawX,y,scale,player.auraType,player.auraEnabled,state.auraQuality);
      drawAvatar(ctx,drawX,y,scale,player.avatar,player.facing||1,emotion,Boolean(player.moving));
      drawAuraHalo(ctx,drawX,y,scale,player.auraType,player.auraEnabled,state.auraQuality);
      if(player.action?.until>Date.now()){ctx.save();ctx.font="20px sans-serif";ctx.textAlign="center";ctx.fillText(player.action.icon,drawX+20*scale,y-58*scale-Math.sin(Date.now()/120)*3);ctx.restore();}
      // Only the nickname stays above the avatar. Rank and authority belong in the info card.
      ctx.save();ctx.textAlign="center";ctx.font=(isMe?"700 ":"600 ")+Math.max(10,11*scale)+"px Inter,sans-serif";
      ctx.fillStyle=isMe?"#fff1b8":"#fff";ctx.shadowColor="#080b20";ctx.shadowBlur=7;
      ctx.fillText(player.nickname,drawX,y-72*scale,132);ctx.restore();
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

  async function enterWorld() {
    loginError.textContent = "";
    const meResponse = await fetch("/api/me");
    if (!meResponse.ok) {
      loginError.textContent = "Сначала создай аккаунт или войди по коду восстановления.";
      return;
    }
    socket.connect();
    socket.once("connect", () => {
      socket.emit("player:join", {}, (result) => {
        if (!result?.ok) {
          loginError.textContent = result?.error || "Не удалось загрузить персонажа.";
          return;
        }
        state.me = result.player;
        state.planet = result.player.planet;
        refreshTopbarWallet();
        setConnectionStatus("online","На связи");
        pushRoomEvent("Добро пожаловать","Вы вошли на планету "+(PLANETS[state.planet]?.name||state.planet)+".","✦");
        loginScreen.classList.add("hidden");
        gameScreen.classList.remove("hidden");
        $("#planet-title").textContent = PLANETS[state.planet].name;
    $("#room-location-title").textContent = PLANETS[state.planet].location;
        resize();
        requestAnimationFrame(drawScene);
        refreshSocial();
        refreshDeveloperAccess();
        renderRoomPlayers();
      });
    });
    socket.once("connect_error", () => {
      loginError.textContent = "Не удалось подключиться. Проверь авторизацию и сервер.";
    });
  }

  async function submitAuth(endpoint) {
    loginError.textContent = "";
    $("#recovery-result").classList.add("hidden");
    const registering = endpoint.endsWith("/register");
    const payload = registering
      ? { nickname: nicknameInput.value.trim(), avatar: avatarSettings() }
      : { recoveryCode: $("#recovery-code").value.trim() };
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ошибка авторизации.");
      if (data.recoveryCode) {
        const box = $("#recovery-result");
        box.textContent = "АККАУНТ СОЗДАН. ТВОЙ КОД: " + data.recoveryCode + ". Сохрани его, затем введи этот код в поле выше и нажми «Войти». В комнату ты попадёшь только после проверки кода.";
        box.classList.remove("hidden");
        $("#recovery-code").value = "";
        $("#register-mode").classList.add("hidden");
        $("#login-mode").classList.remove("hidden");
        $("#recovery-code").focus();
        return;
      }
      await enterWorld();
    } catch (error) {
      loginError.textContent = error.message || "Не удалось выполнить запрос.";
    }
  }
  $("#register-button").addEventListener("click", () => submitAuth("/api/auth/register"));
  $("#login-button").addEventListener("click", () => submitAuth("/api/auth/login"));
  $("#show-register").addEventListener("click", () => {
    $("#login-mode").classList.add("hidden");
    $("#register-mode").classList.remove("hidden");
    $("#recovery-result").classList.add("hidden");
    loginError.textContent = "";
    nicknameInput.focus();
  });
  $("#show-login").addEventListener("click", () => {
    $("#register-mode").classList.add("hidden");
    $("#login-mode").classList.remove("hidden");
    loginError.textContent = "";
    $("#recovery-code").focus();
  });

  socket.on("planet:state", (data) => {
    state.planet = data.planet;
    state.players.clear();
    data.players.forEach((player) => state.players.set(player.id, { ...player, y: player.y ?? .82, renderX: player.x, renderY: player.y ?? .82 }));
    state.chat = data.history || [];
    renderHistory();
    $("#planet-title").textContent = PLANETS[state.planet].name;
    $("#room-location-title").textContent = PLANETS[state.planet].location;
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
      socket.emit("player:move",{x:targetX,y:targetY},result=>{if(!result?.ok)showToast(result?.error||"Не удалось переместить персонажа.");});
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

  function updateOnline() {
    $("#online-count").textContent = String(state.players.size);
    renderRoomPlayers();
  }

  function renderRoomPlayers(){const box=$("#room-player-list");if(!box)return;const query=($("#room-player-search")?.value||"").trim().toLocaleLowerCase("ru-RU");const rows=[...state.players.values()].filter(p=>!query||p.nickname.toLocaleLowerCase("ru-RU").includes(query)).sort((a,b)=>{if(String(a.id)===String(state.me?.id))return -1;if(String(b.id)===String(state.me?.id))return 1;return String(a.nickname).localeCompare(String(b.nickname),"ru");});$("#room-player-count").textContent=String(state.players.size);box.replaceChildren();if(!rows.length){const empty=document.createElement("p");empty.className="developer-muted";empty.textContent=query?"Игроки не найдены.":"В комнате пока никого нет.";box.append(empty);return;}rows.forEach(player=>{const row=document.createElement("button");row.type="button";row.className="room-player-row"+(String(state.selected)===String(player.id)?" selected":"");const avatar=document.createElement("canvas");avatar.className="room-player-avatar";avatar.width=64;avatar.height=72;drawAvatar(avatar.getContext("2d"),32,54,.78,player.avatar,1,null);const meta=document.createElement("span");meta.className="room-player-meta";const name=document.createElement("strong");name.textContent=player.nickname+(String(player.id)===String(state.me?.id)?" · Вы":"");const rank=document.createElement("small");rank.textContent=(player.title||"Новичок")+(player.auraEnabled?" · Аура активна":"");meta.append(name,rank);const status=document.createElement("i");status.className="room-player-status";row.append(avatar,meta,status);row.addEventListener("click",()=>{openProfile(player);closeRoomFlyouts("players");});box.append(row);});}
  $("#room-player-search")?.addEventListener("input",renderRoomPlayers);

  function closeRoomFlyouts(except = "") {
    const panels = {menu:"#room-main-menu",emotions:"#room-emotions-panel",players:"#room-players-panel",events:"#room-events-panel"};
    Object.entries(panels).forEach(([key,selector]) => {
      if (key !== except) $(selector).classList.add("hidden");
      const button = document.querySelector('[data-room-toggle="'+key+'"]');
      if (button) button.classList.toggle("active",key === except);
    });
  }
  function toggleRoomFlyout(name) {
    const panels = {menu:"#room-main-menu",emotions:"#room-emotions-panel",players:"#room-players-panel",events:"#room-events-panel"};
    const panel = $(panels[name]); const shouldOpen = panel.classList.contains("hidden");
    closeRoomFlyouts(shouldOpen ? name : "");
    panel.classList.toggle("hidden",!shouldOpen);
    const button = document.querySelector('[data-room-toggle="'+name+'"]');
    if (button) button.setAttribute("aria-expanded",String(shouldOpen));
    if(name==="events"&&shouldOpen){state.unreadEvents=0;renderRoomEvents();}
  }
  document.querySelectorAll("[data-room-toggle]").forEach(button => button.addEventListener("click",() => {
    const name = button.dataset.roomToggle;
    if(name==="chat"){
      const opening=$("#chat-drawer").classList.contains("hidden");
      $("#chat-drawer").classList.toggle("hidden",!opening);
      gameScreen.classList.toggle("chat-open",opening);
      button.classList.toggle("active",opening);
      button.setAttribute("aria-expanded",String(opening));
      closeRoomFlyouts();
      if(opening)setTimeout(()=>$("#chat-input").focus(),80);
      return;
    }
    const chatDrawer = $("#chat-drawer");
    if (!chatDrawer.classList.contains("hidden")) {
      chatDrawer.classList.add("hidden");
      gameScreen.classList.remove("chat-open");
      const chatButton = $('#room-toolbar [data-room-toggle="chat"]');
      if (chatButton) {
        chatButton.classList.remove("active");
        chatButton.setAttribute("aria-expanded", "false");
      }
    }
    toggleRoomFlyout(name);
  }));
  document.querySelectorAll("[data-room-close]").forEach(button => button.addEventListener("click",() => closeRoomFlyouts()));
  document.querySelectorAll("[data-room-action]").forEach(button => button.addEventListener("click",() => {
    const action = button.dataset.roomAction;
    closeRoomFlyouts();
    $("#chat-drawer").classList.add("hidden");
    gameScreen.classList.remove("chat-open");
    const chatButton = $('#room-toolbar [data-room-toggle="chat"]');
    if (chatButton) {
      chatButton.classList.remove("active");
      chatButton.setAttribute("aria-expanded", "false");
    }
    if (action === "profile") openMyProfile();
    else if (action === "chat") { $("#room-toolbar [data-room-toggle=\"chat\"]").click(); }
    else if (action === "friends") openSocialTab("friends");
    else if (action === "messages") openSocialTab("messages");
    else if (action === "gifts") { if (state.selected && String(state.selected) !== String(state.me?.id)) { $("#gift-options").classList.remove("hidden"); $("#profile-menu").classList.remove("hidden"); } else showToast("Выбери игрока в комнате, чтобы отправить подарок."); }
    else if (action === "shop") openShop();
    else if (action === "authority") openAuthorityPanel();
    else if (action === "planets") $("#planets-button").click();
    else if (action === "developer") $("#developer-open").click();
    else if (action === "exit") $("#exit-room").click();
    else if (action === "aura-quality") {
      state.auraQuality = state.auraQuality === "high" ? "low" : "high";
      localStorage.setItem("nexora-aura-quality", state.auraQuality);
      const label = $("#aura-quality-action span");
      if (label) label.textContent = "Качество аур: " + (state.auraQuality === "high" ? "высокое" : "экономное");
      showToast("Качество аур: " + (state.auraQuality === "high" ? "высокое" : "экономное"));
    }
  }));
  const auraQualityLabel = $("#aura-quality-action span");
  if (auraQualityLabel) auraQualityLabel.textContent = "Качество аур: " + (state.auraQuality === "high" ? "высокое" : "экономное");
  document.querySelectorAll("[data-room-emotion]").forEach(button => button.addEventListener("click",() => {
    socket.emit("emotion:play",{emotion:button.dataset.roomEmotion});
    closeRoomFlyouts();
  }));
  $("#room-developer-action").classList.toggle("hidden",$("#developer-open").classList.contains("hidden"));


  function openProfile(player) {
    state.selected = player.id;
    $("#profile-name").textContent = player.nickname;
    $("#profile-rank").textContent = (player.title || "Новичок") + " · Авторитет " + (player.authority ?? 0);
    $("#profile-aura").textContent = player.auraEnabled ? "Аура активна" : "Аура выключена";
    $("#profile-online-status").textContent = "● В этой комнате";
    const ownProfile = String(player.id) === String(state.me?.id);
    ["#dm-open-button","#whisper-button","#gift-button","#friend-button"].forEach(selector => $(selector).classList.toggle("hidden", ownProfile));
    $("#my-profile-context").classList.toggle("hidden", !ownProfile);
    $("#profile-menu").classList.remove("hidden");
    $("#character-action-list").classList.toggle("hidden",ownProfile);
    $("#gift-options").classList.add("hidden");
    renderRoomPlayers();
  }
  function closeProfile() {
    state.selected = null;
    $("#profile-menu").classList.add("hidden");
    $("#character-action-list").classList.add("hidden");
    $("#my-profile-context").classList.add("hidden");
    ["#dm-open-button","#whisper-button","#gift-button","#friend-button"].forEach(selector => $(selector).classList.remove("hidden"));
    renderRoomPlayers();
  }
  $("#close-profile").addEventListener("click", closeProfile);
  $("#my-profile-context").addEventListener("click", () => { closeProfile(); openMyProfile(); });
  $("#gift-button").addEventListener("click", () => $("#gift-options").classList.toggle("hidden"));
  $("#dm-open-button").addEventListener("click", async () => {
    const peerId = state.selected;
    if (!peerId) return;
    try {
      const result = await socialApi("/conversations", { method: "POST", body: JSON.stringify({ peerId }) });
      closeProfile();
      openSocialTab("messages");
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
  $("#friend-button").addEventListener("click", async () => {
    if (!state.selected) return closeProfile();
    try {
      const result = await socialApi("/requests", { method: "POST", body: JSON.stringify({ targetId: state.selected }) });
      showToast("Заявка отправлена игроку " + result.nickname);
    } catch (error) { showToast(error.message); }
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
    const input = $("#chat-input");
    const text = input.value.trim();
    if (!text) return;
    socket.emit("chat:send", { text }, (result) => {
      if (!result?.ok) showToast(result?.error || "Сообщение не отправлено.");
    });
    input.value = "";
    $("#chat-emoji-picker").classList.add("hidden");
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
      state.players.clear();
      state.selected = null;
      state.chat = [];
      state.roomEvents=[];state.unreadEvents=0;renderRoomEvents();
      $("#planet-picker").classList.add("hidden");
      $("#chat-drawer").classList.add("hidden");
      $("#profile-menu").classList.add("hidden");
      $("#gift-options").classList.add("hidden");
      $("#recovery-result").classList.add("hidden");
      loginError.textContent = "";
      gameScreen.classList.add("hidden");
      loginScreen.classList.remove("hidden");
      button.disabled = false;
    }
  });

  $("#planets-button").addEventListener("click", () => $("#planet-picker").classList.toggle("hidden"));
  $("#planet-picker").querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      socket.emit("planet:change", { planet: button.dataset.planet }, (result) => {
        if (!result?.ok) showToast(result?.error || "Не удалось сменить планету.");
        else $("#planet-picker").classList.add("hidden");
      });
    });
  });
  $("#close-history").addEventListener("click",()=>{
    $("#chat-drawer").classList.add("hidden");
    gameScreen.classList.remove("chat-open");
    const chatButton = $("#room-toolbar [data-room-toggle=\"chat\"]");
    if (chatButton) { chatButton.classList.remove("active"); chatButton.setAttribute("aria-expanded","false"); }
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
      hairColor: $("#edit-hair-color").value,
      shoes: $("#edit-shoes").value,
      accessory: $("#edit-accessory").value
    };
  }
  function drawProfilePreview() {
    profileCtx.clearRect(0, 0, profileCanvas.width, profileCanvas.height);
    drawAvatar(profileCtx, 90, 96, 1.8, editorAvatarSettings(), 1, null);
  }
  ["edit-gender","edit-skin","edit-hair","edit-suit","edit-hair-color","edit-shoes","edit-accessory"].forEach(id=>$("#"+id).addEventListener("change",drawProfilePreview));

  async function openMyProfile() {
    const panel = $("#profile-editor");
    const save = $("#profile-save");
    const errorBox = $("#profile-editor-error");
    errorBox.textContent = "";
    panel.classList.remove("hidden");
    save.disabled = true;
    try {
      const response = await fetch("/api/profile", { credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить профиль.");
      const p = data.profile;
      $("#profile-editor-nickname").textContent = p.nickname;
      $("#profile-editor-meta").textContent = "Уровень " + p.level + " · " + p.experience + " XP";
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
      $("#edit-hair-color").value = avatar.hairColor || "#30233d";
      $("#edit-shoes").value = avatar.shoes || "sneakers";
      $("#edit-accessory").value = avatar.accessory || "none";
      drawProfilePreview();
      save.disabled = false;
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
  async function developerRequest(path) {
    const response = await fetch("/api/developer" + path, { credentials: "same-origin" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Нет доступа к панели.");
    return data;
  }
  async function refreshDeveloperAccess() {
    try {
      const data = await developerRequest("/access");
      developerPermissions = data.permissions || [];
      $("#developer-open").classList.toggle("hidden", !data.allowed);
    $("#room-developer-action").classList.toggle("hidden", !data.allowed);
      $("#developer-roles-tab").classList.toggle("hidden", !developerPermissions.includes("roles.manage"));
      $("#developer-authority-tab").classList.toggle("hidden", !developerPermissions.some(permission => permission.startsWith("authority.")));
    } catch (_error) { $("#developer-open").classList.add("hidden"); }
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
            const warn = document.createElement("button"); warn.type = "button"; warn.textContent = "Предупредить";
            warn.addEventListener("click", async () => { const reason = prompt("Причина предупреждения"); if (!reason) return; try { await developerRequest("/players/"+p.id+"/warn",{method:"POST",body:JSON.stringify({reason})}); showToast("Предупреждение выдано."); } catch(error){showToast(error.message);} });
            row.append(warn);
            const ban = document.createElement("button"); ban.type = "button"; ban.textContent = p.banned ? "Разблокировать" : "Заблокировать";
            ban.addEventListener("click", async () => {
              const reason = prompt(p.banned ? "Причина разблокировки" : "Причина блокировки"); if (!reason) return;
              try {
                if (p.banned) await developerRequest("/players/"+p.id+"/ban",{method:"DELETE",body:JSON.stringify({reason})});
                else { const duration = prompt("Срок в часах. Оставь пустым для постоянной блокировки.","24"); if (duration===null) return; await developerRequest("/players/"+p.id+"/ban",{method:"POST",body:JSON.stringify({reason,hours:duration===""?null:Number(duration)})}); }
                showToast("Действие модерации выполнено."); loadDeveloperTab("players");
              } catch(error){showToast(error.message);}
            });
            row.append(ban); list.append(row);
          });
        };
        renderPlayers(d.players);
        let searchTimer;
        search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer=setTimeout(async()=>{try{const result=await developerRequest("/players?q="+encodeURIComponent(search.value));renderPlayers(result.players);}catch(error){showToast(error.message);}},250);});
      } else if (tab === "moderation") {
        const d = await developerRequest("/moderation");
        developerRender("История модерации", d.entries.map(e => ({title: e.action_type + " · " + e.target_nickname + " · ID " + e.target_account_id, detail: e.reason + " · " + e.actor_nickname + " · " + new Date(e.created_at).toLocaleString("ru-RU") + (e.expires_at ? " · до " + new Date(e.expires_at).toLocaleString("ru-RU") : "") + (e.revoked_at ? " · отменено" : "")})));
      } else if (tab === "world") {
        const d = await developerRequest("/world");
        developerRender("Планеты и комнаты", d.world.map(p => ({ title: p.title, detail: p.online + " онлайн · " + p.rooms + " комнат" })));

      } else if (tab === "authority") {
        if (!developerPermissions.some(permission => permission.startsWith("authority."))) throw new Error("Недостаточно прав.");
        const data=await authorityApi("/");
        content.replaceChildren();
        const heading=document.createElement("h3");heading.textContent="Выдача авторитетов и аур";content.append(heading);
        const form=document.createElement("form");form.className="developer-authority-form";
        const searchInput=document.createElement("input");searchInput.type="search";searchInput.maxLength=18;searchInput.placeholder="Найти игрока по ID или никнейму";
        const searchResults=document.createElement("div");searchResults.className="developer-search-results";
        const account=document.createElement("input");account.type="text";account.inputMode="numeric";account.required=true;account.placeholder="ID аккаунта игрока";
        const searchButton=document.createElement("button");searchButton.type="button";searchButton.textContent="Найти игрока";
        searchButton.addEventListener("click",async()=>{
          searchButton.disabled=true;searchResults.replaceChildren();
          try{
            const found=await authorityApi("/admin/players?q="+encodeURIComponent(searchInput.value.trim()));
            if(!found.players.length){const empty=document.createElement("p");empty.textContent="Игроки не найдены.";searchResults.append(empty);}
            found.players.forEach(player=>{
              const pick=document.createElement("button");pick.type="button";pick.textContent=player.nickname+" · ID "+player.id;
              pick.addEventListener("click",()=>{account.value=player.id;showToast("Выбран игрок "+player.nickname);});
              searchResults.append(pick);
            });
          }catch(error){showToast(error.message);}finally{searchButton.disabled=false;}
        });
        const title=document.createElement("select");
        data.titles.forEach(item=>{const option=document.createElement("option");option.value=item.title_key;option.textContent=item.title_label;title.append(option);});
        const auraPreview=document.createElement("div");auraPreview.className="authority-aura-preview";
        const auraPreviewOrb=document.createElement("span");auraPreviewOrb.className="authority-aura-preview-orb";
        const auraPreviewText=document.createElement("strong");
        auraPreview.append(auraPreviewOrb,auraPreviewText);
        const refreshAuraPreview=()=>{
          const selected=data.titles.find(item=>item.title_key===title.value);
          auraPreview.dataset.aura=selected?.aura_type||"NONE";
          auraPreviewText.textContent=(selected?.title_label||"Новичок")+" · "+(selected?.aura_type||"NONE");
        };
        title.addEventListener("change",refreshAuraPreview);refreshAuraPreview();
        const reason=document.createElement("input");reason.maxLength=500;reason.required=true;reason.placeholder="Причина выдачи / изменения";
        const auraLabel=document.createElement("label");const aura=document.createElement("input");aura.type="checkbox";aura.checked=true;auraLabel.append(aura,document.createTextNode("Включить ауру"));
        const submit=document.createElement("button");submit.type="submit";submit.textContent="Выдать звание";
        form.append(searchInput,searchButton,searchResults,account,title,auraPreview,reason,auraLabel,submit);content.append(form);
        if(!developerPermissions.includes("authority.assign"))form.classList.add("hidden");
        if(developerPermissions.includes("authority.remove")){
          const removeButton=document.createElement("button");removeButton.type="button";removeButton.textContent="Снять звание · вернуть Новичка";
          removeButton.addEventListener("click",async()=>{
            if(!account.value||!reason.value.trim())return showToast("Укажите ID игрока и причину.");
            removeButton.disabled=true;
            try{
              const response=await fetch("/api/authority/admin/remove/"+encodeURIComponent(account.value),{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason:reason.value})});
              const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"Не удалось снять звание.");
              showToast("Звание сброшено до Новичка.");
            }catch(error){showToast(error.message);}finally{removeButton.disabled=false;}
          });
          content.append(removeButton);
        }
        form.addEventListener("submit",async event=>{
          event.preventDefault();submit.disabled=true;
          try{
            const response=await fetch("/api/authority/admin/assign",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:account.value,titleKey:title.value,reason:reason.value,auraEnabled:aura.checked})});
            const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"Не удалось выдать звание.");
            showToast("Звание обновлено для аккаунта "+result.accountId);reason.value="";
          }catch(error){showToast(error.message);}finally{submit.disabled=false;}
        });
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
        ["DEVELOPER","ADMIN","MODERATOR","HELPER","USER"].forEach(value => {
          const option = document.createElement("option"); option.value = value; option.textContent = value; role.append(option);
        });
        const reason = document.createElement("input");
        reason.maxLength = 500; reason.placeholder = "Причина назначения";
        const permissionWrap = document.createElement("div");
        permissionWrap.className = "developer-permission-grid";
        const available = ["players.view","players.ban","players.unban","players.warn","moderation.view","world.view","world.manage","economy.view","economy.manage","items.view","items.manage","system.view","logs.view","authority.view","authority.assign","authority.remove","authority.configure","authority.history"];
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
  $("#developer-open").addEventListener("click", () => {
    $("#developer-panel").classList.remove("hidden");
    $("#profile-editor").classList.add("hidden");
    loadDeveloperTab("overview");
  });
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
        { text: "Написать", run: async () => {
          try {
            const result = await socialApi("/conversations", { method: "POST", body: JSON.stringify({ peerId: friend.id }) });
            openSocialTab("messages"); await loadConversations(); await openConversation(result.conversationId);
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
      result.users.forEach(user => box.append(makeSocialRow(user.nickname, "Игрок NEXORA", [
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
  function openSocialTab(tab) {
    $("#social-panel").classList.remove("hidden");
    const labels = { friends: "Друзья", messages: "Сообщения", notifications: "Уведомления" };
    $("#social-title").textContent = labels[tab] || "Социальное";
    document.querySelectorAll("[data-social-tab]").forEach(button => button.classList.toggle("active", button.dataset.socialTab === tab));
    $("#social-friends-view").classList.toggle("hidden", tab !== "friends");
    $("#social-messages-view").classList.toggle("hidden", tab !== "messages");
    $("#social-notifications-view").classList.toggle("hidden", tab !== "notifications");
    if (tab === "friends") loadFriends().catch(error => showToast(error.message));
    if (tab === "messages") loadConversations().catch(error => showToast(error.message));
    if (tab === "notifications") {
      loadNotifications().then(() => socialApi("/notifications/read", { method: "POST" })).then(loadNotifications).catch(error => showToast(error.message));
    }
  }
  $("#social-open").addEventListener("click", () => openSocialTab("friends"));
  $("#social-close").addEventListener("click", () => $("#social-panel").classList.add("hidden"));
  document.querySelectorAll("[data-social-tab]").forEach(button => button.addEventListener("click", () => openSocialTab(button.dataset.socialTab)));
  $("#social-search").addEventListener("input", event => searchSocialUsers(event.target.value));
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
    if (!$("#social-panel").classList.contains("hidden")) loadNotifications().catch(() => {});
  });

  if (window.Telegram?.WebApp) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  }

  // Premium shop UI. Catalog is presentation-only until server-side economy endpoints exist.
  const SHOP_CATEGORIES = [
    { id:"featured", label:"✦ Популярное" }, { id:"vip", label:"👑 VIP" },
    { id:"quests", label:"🎯 Задания" }, { id:"gifts", label:"🎁 Подарки" },
    { id:"chests", label:"📦 Сундуки" }, { id:"authority", label:"⭐ Авторитет" },
    { id:"pets", label:"🐾 Питомцы" }, { id:"clothes", label:"👕 Одежда" },
    { id:"auras", label:"✨ Ауры" }, { id:"teleports", label:"🌀 Телепорты" },
    { id:"planets", label:"🪐 Планеты" }, { id:"banners", label:"🖼️ Баннеры" }
  ];
  const SHOP_ITEMS = [
    {cat:"featured",icon:"👑",name:"VIP статус",desc:"Особый статус и визуальные привилегии",price:"Скоро",badge:"ХИТ"},
    {cat:"featured",icon:"🐉",name:"Дракон-компаньон",desc:"Редкий спутник для твоего персонажа",price:"Скоро",badge:"RARE"},
    {cat:"featured",icon:"🌌",name:"Космическая аура",desc:"Мягкое сияние вокруг аватара",price:"Скоро",badge:"NEW"},
    {cat:"vip",icon:"👑",name:"VIP на 30 дней",desc:"Премиальный статус NEXORA",price:"Скоро",badge:"VIP"},
    {cat:"vip",icon:"💎",name:"VIP навсегда",desc:"Постоянный премиальный статус",price:"Скоро"},
    {cat:"quests",icon:"🎯",name:"Ежедневные задания",desc:"Набор игровых испытаний и наград",price:"Бесплатно",badge:"DAILY"},
    {cat:"gifts",icon:"🌹",name:"Букет роз",desc:"Подарок другому игроку",price:"Скоро"},
    {cat:"gifts",icon:"💝",name:"Сердце",desc:"Покажи внимание друзьям",price:"Скоро"},
    {cat:"chests",icon:"🎁",name:"Таинственный сундук",desc:"Содержимое будет определяться сервером",price:"Скоро",badge:"MYSTERY"},
    {cat:"authority",icon:"⭐",name:"Звания авторитета",desc:"Прокачка статуса за Koins",price:"Смотреть цены"},
    {cat:"pets",icon:"🦊",name:"Лисёнок",desc:"Питомец-компаньон",price:"Скоро",badge:"NEW"},
    {cat:"pets",icon:"🐈",name:"Космический кот",desc:"Питомец с особым обликом",price:"Скоро"},
    {cat:"clothes",icon:"🧥",name:"Неоновый костюм",desc:"Новый образ для персонажа",price:"Скоро"},
    {cat:"clothes",icon:"👟",name:"Кроссовки Nova",desc:"Деталь твоего стиля",price:"Скоро"},
    {cat:"auras",icon:"💫",name:"Ауры званий",desc:"Аура открывается вместе со званием",price:"Входит в звание"},
    {cat:"auras",icon:"🔥",name:"Огненная аура Создателя",desc:"Открывается со званием Создатель",price:"Входит в звание"},
    {cat:"teleports",icon:"🌀",name:"Портал домой",desc:"Быстрый переход между локациями",price:"Скоро"},
    {cat:"planets",icon:"🪐",name:"Новая планета",desc:"Дополнительная игровая локация",price:"Скоро"},
    {cat:"banners",icon:"🌠",name:"Звёздный баннер",desc:"Оформление карточки профиля",price:"Скоро"}
  ];
  let activeShopCategory = "featured";
  function renderShopCategories() {
    const box = $("#shop-categories");
    box.replaceChildren();
    SHOP_CATEGORIES.forEach(category => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "shop-category" + (category.id === activeShopCategory ? " active" : "");
      button.textContent = category.label;
      button.addEventListener("click", () => { activeShopCategory = category.id; renderShopCategories(); renderShopItems(); });
      box.append(button);
    });
  }
  function renderShopItems() {
    const box = $("#shop-items"); box.replaceChildren();
    const items = activeShopCategory === "featured" ? SHOP_ITEMS.filter(item => item.cat === "featured") : SHOP_ITEMS.filter(item => item.cat === activeShopCategory);
    const category = SHOP_CATEGORIES.find(item => item.id === activeShopCategory);
    $("#shop-category-title").textContent = category ? category.label.replace(/^\S+\s/,"") : "Популярное";
    $("#shop-item-count").textContent = items.length + " предмета";
    items.forEach(item => {
      const card = document.createElement("article"); card.className = "shop-item";
      const art = document.createElement("div"); art.className = "shop-item-art"; art.textContent = item.icon;
      if (item.badge) { const badge = document.createElement("span"); badge.className = "shop-item-badge"; badge.textContent = item.badge; art.append(badge); }
      const body = document.createElement("div"); body.className = "shop-item-body";
      const name = document.createElement("strong"); name.textContent = item.name;
      const desc = document.createElement("p"); desc.textContent = item.desc;
      const price = document.createElement("div"); price.className = "shop-item-price"; price.textContent = item.price;
      const button = document.createElement("button"); button.type = "button"; button.textContent = "Скоро в продаже"; button.disabled = true;
      if (item.cat === "authority" || item.cat === "auras") {
        button.disabled = false; button.textContent = "Открыть звания";
        button.addEventListener("click", () => { $("#shop-panel").classList.add("hidden"); openAuthorityPanel(); });
      }
      body.append(name,desc,price,button); card.append(art,body); box.append(card);
    });
    if (!items.length) { const empty = document.createElement("p"); empty.className = "shop-notice"; empty.textContent = "Новые предметы этой категории появятся позже."; box.append(empty); }
  }
  async function openShop() {
    $("#shop-panel").classList.remove("hidden");
    $("#profile-editor").classList.add("hidden");
    $("#developer-panel").classList.add("hidden");
    activeShopCategory = "featured"; renderShopCategories(); renderShopItems();
    $("#shop-character-name").textContent = state.me?.nickname || "Персонаж NEXORA";
    const shopCanvas = $("#shop-character-canvas"), shopCtx = shopCanvas.getContext("2d");
    shopCtx.clearRect(0,0,shopCanvas.width,shopCanvas.height);
    drawAvatar(shopCtx,110,165,3.0,state.me?.avatar || {},1,null);
    $("#shop-koins").textContent = "— ✦";
    try {
      const response = await fetch("/api/profile",{credentials:"same-origin"});
      const data = await response.json().catch(()=>({}));
      if (response.ok && data.profile) $("#shop-koins").textContent = Number(data.profile.koins || 0).toLocaleString("ru-RU") + " ✦";
      else $("#shop-koins").textContent = "— ✦";
    } catch (_error) { $("#shop-koins").textContent = "— ✦"; }
  }
  $("#shop-open").addEventListener("click",openShop);
  $("#shop-close").addEventListener("click",() => $("#shop-panel").classList.add("hidden"));
  document.querySelectorAll("[data-shop-tab]").forEach(button => button.addEventListener("click",() => {
    const tab = button.dataset.shopTab;
    document.querySelectorAll("[data-shop-tab]").forEach(item => item.classList.toggle("active",item === button));
    ["store","inventory","character"].forEach(name => $("#shop-"+name+"-view").classList.toggle("hidden",name !== tab));
  }));
  $("#shop-edit-profile").addEventListener("click",() => { $("#shop-panel").classList.add("hidden"); openMyProfile(); });

})();