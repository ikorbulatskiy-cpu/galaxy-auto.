(() => {
  "use strict";

  const rounded = (ctx, x, y, w, h, r, fill, stroke) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  };

  function drawStarter(ctx, w, h, time) {
    const base = h * .69;
    // Distant city blocks and illuminated windows.
    for (let i = 0; i < 11; i++) {
      const bw = w * (.055 + (i % 3) * .018);
      const bh = h * (.12 + ((i * 7) % 5) * .026);
      const x = i * w / 10 - bw * .35;
      rounded(ctx, x, base - bh, bw, bh, 5, i % 2 ? "#202c60" : "#29366d");
      ctx.fillStyle = "rgba(161,190,255,.36)";
      for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
        if ((row + col + i) % 3) ctx.fillRect(x + 7 + col * 10, base - bh + 10 + row * 13, 4, 6);
      }
      ctx.fillStyle = "rgba(12,18,49,.55)";
      ctx.fillRect(x + bw * .42, base - 18, 9, 18);
    }
    // Central plaza path.
    ctx.fillStyle = "rgba(188,190,255,.12)";
    ctx.beginPath(); ctx.moveTo(w * .39, base); ctx.lineTo(w * .45, h); ctx.lineTo(w * .59, h); ctx.lineTo(w * .55, base); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(214,215,255,.16)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w * .47, base); ctx.lineTo(w * .5, h); ctx.stroke();
    // Garden beds, benches and lamps.
    for (const x of [w * .13, w * .78]) {
      rounded(ctx, x, base - 7, w * .12, 13, 7, "#263c59", "#6682a8");
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 ? "#65bd91" : "#83d8a5";
        ctx.beginPath(); ctx.arc(x + 12 + i * 13, base - 10 - (i % 2) * 5, 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const x of [w * .27, w * .72]) {
      ctx.strokeStyle = "#53658e"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, base - 2); ctx.lineTo(x, base - h * .17); ctx.stroke();
      ctx.fillStyle = "#ffe6a0"; ctx.shadowColor = "#ffe6a0"; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(x, base - h * .17, 5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      rounded(ctx, x - 16, base - 1, 32, 5, 2, "#48577d");
    }
    // Stylized trees.
    for (const x of [w * .06, w * .93]) {
      ctx.strokeStyle = "#765b67"; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(x, base + 3); ctx.lineTo(x, base - h * .16); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i % 2 ? "#397d75" : "#4c9a85";
        ctx.beginPath(); ctx.arc(x + Math.sin(i * 2) * 17, base - h * .17 - (i % 3) * 12, 17, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Soft plaza lights.
    ctx.globalAlpha = .12 + Math.sin(time / 700) * .025;
    ctx.fillStyle = "#a7a0ff"; ctx.fillRect(w * .34, base - 2, w * .32, 2);
    ctx.globalAlpha = 1;
  }

  function drawClub(ctx, w, h, time) {
    const floor = h * .70;
    // Club facade.
    rounded(ctx, w * .08, h * .34, w * .84, h * .37, 18, "rgba(17,12,43,.74)", "rgba(255,126,220,.42)");
    for (let i = 0; i < 5; i++) {
      const x = w * (.14 + i * .145);
      ctx.strokeStyle = i % 2 ? "rgba(91,231,255,.62)" : "rgba(255,102,211,.62)";
      ctx.lineWidth = 3;
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(x, h * .37); ctx.lineTo(x, floor - 5); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    // Dance floor with perspective tiles.
    ctx.fillStyle = "rgba(117,59,143,.48)";
    ctx.beginPath(); ctx.moveTo(w * .25, floor - 10); ctx.lineTo(w * .75, floor - 10); ctx.lineTo(w * .92, h); ctx.lineTo(w * .08, h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(117,226,255,.24)"; ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const y = floor + i * h * .045;
      ctx.beginPath(); ctx.moveTo(w * (.25 - i * .025), y); ctx.lineTo(w * (.75 + i * .025), y); ctx.stroke();
    }
    for (let i = 0; i < 9; i++) {
      const x = w * (.18 + i * .08);
      ctx.beginPath(); ctx.moveTo(w * .5, floor - 10); ctx.lineTo(x, h); ctx.stroke();
    }
    // Speakers and equalizer.
    for (const x of [w * .12, w * .82]) {
      rounded(ctx, x, h * .48, w * .07, h * .2, 9, "#17182f", "#a45cbb");
      for (let j = 0; j < 3; j++) {
        ctx.fillStyle = j % 2 ? "#4bd9ed" : "#ef65c8";
        ctx.globalAlpha = .55 + Math.sin(time / 150 + j) * .2;
        ctx.beginPath(); ctx.arc(x + w * .035, h * (.52 + j * .055), w * .014, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // Moving spotlights.
    for (let i = 0; i < 4; i++) {
      const x = w * (.2 + i * .2);
      ctx.globalAlpha = .10;
      ctx.fillStyle = i % 2 ? "#66eaff" : "#ff70d5";
      ctx.beginPath(); ctx.moveTo(x, h * .27); ctx.lineTo(x + Math.sin(time / 550 + i) * w * .13, floor); ctx.lineTo(x + w * .07, floor); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    rounded(ctx, w * .36, h * .29, w * .28, 24, 10, "rgba(15,18,49,.88)", "rgba(255,117,218,.55)");
    ctx.fillStyle = "#f7b8ef"; ctx.font = "800 11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("NEXORA  •  CLUB", w * .5, h * .29 + 16); ctx.textAlign = "start";
  }

  function drawBeach(ctx, w, h, time) {
    const seaY = h * .60;
    // Ocean and animated wave bands.
    const ocean = ctx.createLinearGradient(0, seaY, 0, h * .84);
    ocean.addColorStop(0, "rgba(39,178,194,.68)");
    ocean.addColorStop(1, "rgba(8,92,126,.82)");
    ctx.fillStyle = ocean; ctx.fillRect(0, seaY, w, h * .25);
    for (let row = 0; row < 5; row++) {
      ctx.strokeStyle = "rgba(204,255,249," + (.12 + row * .025) + ")";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 12) {
        const y = seaY + row * h * .035 + Math.sin(x / 43 + time / 480 + row) * 3;
        if (!x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Sand bank.
    ctx.fillStyle = "#d5a06e";
    ctx.beginPath(); ctx.moveTo(0, h * .72); ctx.quadraticCurveTo(w * .5, h * .63, w, h * .73); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,239,190,.26)";
    ctx.beginPath(); ctx.moveTo(0, h * .75); ctx.quadraticCurveTo(w * .5, h * .67, w, h * .76); ctx.lineWidth = 4; ctx.strokeStyle = "rgba(255,246,206,.4)"; ctx.stroke();
    // Palm trees.
    for (const x of [w * .10, w * .89]) {
      ctx.strokeStyle = "#8d6048"; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(x, h * .76); ctx.quadraticCurveTo(x + 15, h * .51, x - 2, h * .36); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI + i * Math.PI / 5;
        ctx.strokeStyle = i % 2 ? "#347d60" : "#4c9c6e"; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(x - 2, h * .37); ctx.quadraticCurveTo(x + Math.cos(a) * 35, h * .25, x + Math.cos(a) * 57, h * .37 + Math.sin(a) * 18); ctx.stroke();
      }
    }
    // Umbrellas and sun loungers.
    for (const x of [w * .31, w * .68]) {
      ctx.strokeStyle = "#765c56"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, h * .77); ctx.lineTo(x, h * .66); ctx.stroke();
      ctx.fillStyle = x < w / 2 ? "#ef7d9b" : "#6b9ee9";
      ctx.beginPath(); ctx.moveTo(x - 28, h * .66); ctx.quadraticCurveTo(x, h * .59, x + 28, h * .66); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#745b55"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 20, h * .81); ctx.lineTo(x + 18, h * .81); ctx.lineTo(x + 24, h * .85); ctx.stroke();
    }
    // Sun reflection.
    ctx.globalAlpha = .25 + Math.sin(time / 900) * .05;
    ctx.fillStyle = "#fff1b5"; ctx.fillRect(w * .73, seaY + 7, w * .12, 2);
    ctx.globalAlpha = 1;
  }

  const sceneAssets = {};
  for (const name of ["starter","club","beach"]) {
    const image = new Image();
    image.src = "/assets/sprites/planets/" + name + ".svg";
    sceneAssets[name] = image;
  }

  function draw(ctx, width, height, planet, time = Date.now()) {
    if (!ctx || width < 1 || height < 1) return;
    ctx.save();
    ctx.lineJoin = "round";
    const art = sceneAssets[planet];
    if (art && art.complete && art.naturalWidth > 0) {
      ctx.drawImage(art, 0, 0, width, height);
      if (planet === "beach") {
        ctx.save(); ctx.globalAlpha = .25; ctx.strokeStyle = "#e6ffff"; ctx.lineWidth = 2;
        for (let row=0; row<4; row++) {
          ctx.beginPath();
          for (let x=0; x<=width; x+=16) {
            const y=height*.59+row*height*.035+Math.sin(x/38+time/430+row)*2.5;
            if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
          }
          ctx.stroke();
        }
        ctx.restore();
      } else if (planet === "club") {
        ctx.save(); ctx.globalAlpha=.12;
        for(let i=0;i<4;i++){
          const x=width*(.18+i*.21);
          ctx.fillStyle=i%2?"#65eaff":"#ff78d8";
          ctx.beginPath();ctx.moveTo(x,height*.17);ctx.lineTo(x+Math.sin(time/470+i)*width*.14,height*.72);ctx.lineTo(x+width*.06,height*.72);ctx.closePath();ctx.fill();
        }
        ctx.restore();
      } else {
        ctx.save();ctx.globalAlpha=.14;ctx.fillStyle="#fff1bd";
        for(let i=0;i<5;i++){const x=(i*193+time/45)%Math.max(1,width);const y=height*(.13+(i%3)*.09);ctx.beginPath();ctx.arc(x,y,1.4,0,Math.PI*2);ctx.fill();}
        ctx.restore();
      }
    } else if (planet === "club") drawClub(ctx, width, height, time);
    else if (planet === "beach") drawBeach(ctx, width, height, time);
    else drawStarter(ctx, width, height, time);
    ctx.restore();
  }

  window.NexoraWorldScene = Object.freeze({ draw });
})();
