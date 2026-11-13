(() => {
  "use strict";
  const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
  function drawTree(ctx,x,y,s=1,palette=["#4f9b83","#367e70"]) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    ctx.fillStyle="rgba(8,14,27,.22)";ctx.beginPath();ctx.ellipse(0,1,23,6,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#795448";ctx.lineWidth=7;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(4,-22,-2,-45);ctx.stroke();
    for(let i=0;i<6;i++){ctx.fillStyle=palette[i%2];ctx.beginPath();ctx.arc(Math.sin(i*2.2)*13-2,-42-(i%3)*8,13,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
  function drawBench(ctx,x,y,s=1) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    ctx.fillStyle="rgba(5,9,24,.2)";ctx.beginPath();ctx.ellipse(0,4,25,5,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#b77a55";ctx.strokeStyle="#694b55";ctx.lineWidth=2;
    ctx.beginPath();ctx.roundRect(-23,-12,46,9,3);ctx.fill();ctx.stroke();
    ctx.fillStyle="#795a57";ctx.fillRect(-18,-3,4,12);ctx.fillRect(14,-3,4,12);
    ctx.fillStyle="#d59a68";ctx.fillRect(-22,-15,44,4);ctx.restore();
  }
  function drawFountain(ctx,x,y,s=1,time=0) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    ctx.fillStyle="rgba(4,12,30,.22)";ctx.beginPath();ctx.ellipse(0,2,34,9,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#8297c9";ctx.strokeStyle="#d3dcff";ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(0,-3,32,9,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle="#4dc9df";ctx.beginPath();ctx.ellipse(0,-6,25,5,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#8ff4ff";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-8);ctx.quadraticCurveTo(Math.sin(time/240)*4,-25,0,-35);ctx.stroke();
    ctx.fillStyle="#a7f7ff";ctx.beginPath();ctx.arc(0,-35,2.5,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function drawPalm(ctx,x,y,s=1,time=0) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    ctx.strokeStyle="#986c4f";ctx.lineWidth=8;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(8,-28,-1,-53);ctx.stroke();
    for(let i=0;i<7;i++){const a=-Math.PI+i*Math.PI/6;ctx.strokeStyle=i%2?"#3b956f":"#59b87b";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-1,-52);ctx.quadraticCurveTo(Math.cos(a)*22,-72+Math.sin(time/500+i)*2,Math.cos(a)*43,-51+Math.sin(a)*12);ctx.stroke();}
    ctx.restore();
  }
  function drawClubTable(ctx,x,y,s=1) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    ctx.fillStyle="rgba(5,7,20,.25)";ctx.beginPath();ctx.ellipse(0,5,21,6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#33254e";ctx.strokeStyle="#d26bc2";ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,-8,20,8,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle="#9d75c5";ctx.fillRect(-2,-8,4,15);ctx.restore();
  }
  function drawBeachChair(ctx,x,y,s=1) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.strokeStyle="#805f54";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-18,-2);ctx.lineTo(17,-2);ctx.lineTo(24,7);ctx.moveTo(-18,-2);ctx.lineTo(-23,7);ctx.stroke();ctx.fillStyle="#f4e8cf";ctx.beginPath();ctx.moveTo(-17,-7);ctx.lineTo(14,-7);ctx.lineTo(18,-2);ctx.lineTo(-17,-2);ctx.closePath();ctx.fill();ctx.restore();
  }
  function drawShopKiosk(ctx,x,y,s=1) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    ctx.fillStyle="rgba(5,10,28,.2)";ctx.beginPath();ctx.ellipse(0,3,29,6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#e7c48a";ctx.strokeStyle="#785c61";ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-24,-36,48,38,5);ctx.fill();ctx.stroke();
    ctx.fillStyle="#d96e91";ctx.beginPath();ctx.moveTo(-28,-35);ctx.lineTo(0,-51);ctx.lineTo(28,-35);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle="#8fd8e7";ctx.fillRect(-15,-25,13,15);ctx.fillRect(3,-25,13,15);
    ctx.fillStyle="#fff1ce";ctx.font="bold 7px sans-serif";ctx.textAlign="center";ctx.fillText("NEXORA",0,-7);ctx.restore();
  }
  function drawDjBooth(ctx,x,y,s=1,time=0) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    ctx.fillStyle="rgba(4,6,20,.25)";ctx.beginPath();ctx.ellipse(0,4,34,7,0,0,Math.PI*2);ctx.fill();
    const glow=ctx.createLinearGradient(-30,-25,30,0);glow.addColorStop(0,"#7e55dc");glow.addColorStop(1,"#df61bb");
    ctx.fillStyle=glow;ctx.strokeStyle="#f2a7ef";ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-31,-29,62,28,7);ctx.fill();ctx.stroke();
    ctx.fillStyle="#171b3b";ctx.beginPath();ctx.roundRect(-22,-23,44,13,3);ctx.fill();
    for(let i=0;i<5;i++){ctx.fillStyle=i%2?"#63eaff":"#ff9bdd";ctx.globalAlpha=.6+Math.sin(time/130+i)*.3;ctx.fillRect(-17+i*8,-20,4,7);}
    ctx.globalAlpha=1;ctx.fillStyle="#f7d9ff";ctx.font="bold 7px sans-serif";ctx.textAlign="center";ctx.fillText("DJ NEXORA",0,-33);ctx.restore();
  }
  function drawFlowerBed(ctx,x,y,s=1) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.fillStyle="#74536a";ctx.beginPath();ctx.roundRect(-22,-5,44,10,4);ctx.fill();
    for(let i=0;i<5;i++){const px=-16+i*8;ctx.strokeStyle="#4d9a75";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px,-4);ctx.lineTo(px,-15-(i%2)*3);ctx.stroke();ctx.fillStyle=i%2?"#ffb2d6":"#ffe28b";ctx.beginPath();ctx.arc(px,-17-(i%2)*3,4,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
  function drawStreetLamp(ctx,x,y,s=1,time=0) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    ctx.fillStyle="rgba(4,10,24,.22)";ctx.beginPath();ctx.ellipse(0,3,12,4,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#58678e";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-54);ctx.quadraticCurveTo(0,-62,10,-62);ctx.stroke();
    ctx.fillStyle="#ffe8a6";ctx.shadowColor="#ffe8a6";ctx.shadowBlur=12+Math.sin(time/350)*3;
    ctx.beginPath();ctx.roundRect(6,-67,12,8,3);ctx.fill();ctx.shadowBlur=0;
    ctx.restore();
  }
  function drawBusStop(ctx,x,y,s=1) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    ctx.fillStyle="rgba(5,10,28,.2)";ctx.beginPath();ctx.ellipse(0,3,31,5,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#7185aa";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-25,0);ctx.lineTo(-25,-43);ctx.lineTo(25,-43);ctx.lineTo(25,0);ctx.stroke();
    ctx.fillStyle="rgba(135,194,225,.18)";ctx.fillRect(-22,-39,44,34);
    ctx.fillStyle="#3f5579";ctx.fillRect(-20,-12,40,4);ctx.fillRect(-17,-8,3,8);ctx.fillRect(14,-8,3,8);
    ctx.fillStyle="#f6d58d";ctx.fillRect(-7,-35,14,8);ctx.fillStyle="#33466d";ctx.font="bold 5px sans-serif";ctx.textAlign="center";ctx.fillText("NEXORA",0,-29);
    ctx.restore();
  }
  function drawNeonArch(ctx,x,y,s=1,time=0) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    ctx.shadowColor="#e96bd8";ctx.shadowBlur=14+Math.sin(time/260)*4;
    ctx.strokeStyle="#e96bd8";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-28,0);ctx.lineTo(-28,-38);ctx.quadraticCurveTo(0,-62,28,-38);ctx.lineTo(28,0);ctx.stroke();
    ctx.shadowBlur=0;ctx.fillStyle="#ffe2fa";ctx.font="bold 8px sans-serif";ctx.textAlign="center";ctx.fillText("NEXORA",0,-45);
    ctx.restore();
  }
  function drawSofa(ctx,x,y,s=1) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    ctx.fillStyle="rgba(3,6,20,.25)";ctx.beginPath();ctx.ellipse(0,4,31,6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#55427c";ctx.strokeStyle="#c28be5";ctx.lineWidth=2;
    ctx.beginPath();ctx.roundRect(-29,-19,58,22,7);ctx.fill();ctx.stroke();
    ctx.fillStyle="#8062a8";ctx.beginPath();ctx.roundRect(-24,-28,48,18,7);ctx.fill();ctx.stroke();
    ctx.fillStyle="#d6b7ef";ctx.beginPath();ctx.roundRect(-19,-24,16,12,4);ctx.roundRect(3,-24,16,12,4);ctx.fill();
    ctx.restore();
  }
  function drawLifeguardTower(ctx,x,y,s=1) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    ctx.fillStyle="rgba(5,10,24,.2)";ctx.beginPath();ctx.ellipse(0,3,27,5,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#795a4d";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-15,0);ctx.lineTo(-10,-34);ctx.moveTo(15,0);ctx.lineTo(10,-34);ctx.stroke();
    ctx.fillStyle="#f6e4c9";ctx.strokeStyle="#8b655a";ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-20,-39,40,14,3);ctx.fill();ctx.stroke();
    ctx.fillStyle="#e76d7d";ctx.fillRect(-20,-39,40,5);ctx.fillStyle="#78c8e6";ctx.fillRect(-12,-33,9,7);ctx.fillRect(3,-33,9,7);
    ctx.fillStyle="#fff";ctx.font="bold 6px sans-serif";ctx.textAlign="center";ctx.fillText("LIFE",0,-42);
    ctx.restore();
  }
  function drawSurfboard(ctx,x,y,s=1) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.rotate(-.18);
    ctx.fillStyle="rgba(5,10,24,.2)";ctx.beginPath();ctx.ellipse(0,2,8,4,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#f4f0df";ctx.strokeStyle="#d36d91";ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,-36);ctx.quadraticCurveTo(12,-26,10,-7);ctx.quadraticCurveTo(8,7,0,12);ctx.quadraticCurveTo(-8,7,-10,-7);ctx.quadraticCurveTo(-12,-26,0,-36);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle="#52b9d1";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-29);ctx.lineTo(0,4);ctx.stroke();ctx.restore();
  }
  function get(planet,w,h,time=Date.now()) {
    const objects=[];
    const add=(x,y,draw)=>objects.push({x,y,depth:y/h,draw:()=>draw(x,y)});
    if(planet==="starter"){
      add(w*.09,h*.77,(x,y)=>drawTree(ctxRef,x,y,.95));
      add(w*.90,h*.78,(x,y)=>drawTree(ctxRef,x,y,1.05));
      add(w*.23,h*.84,(x,y)=>drawBench(ctxRef,x,y,.9));
      add(w*.76,h*.85,(x,y)=>drawBench(ctxRef,x,y,.9));
      add(w*.5,h*.88,(x,y)=>drawFountain(ctxRef,x,y,.9,time));
      add(w*.39,h*.84,(x,y)=>drawFlowerBed(ctxRef,x,y,.9));
      add(w*.62,h*.84,(x,y)=>drawShopKiosk(ctxRef,x,y,.85));
      add(w*.34,h*.84,(x,y)=>drawStreetLamp(ctxRef,x,y,.9,time));
      add(w*.68,h*.90,(x,y)=>drawBusStop(ctxRef,x,y,.82));
    } else if(planet==="club"){
      add(w*.20,h*.83,(x,y)=>drawClubTable(ctxRef,x,y,.95));
      add(w*.80,h*.84,(x,y)=>drawClubTable(ctxRef,x,y,.95));
      add(w*.5,h*.82,(x,y)=>drawDjBooth(ctxRef,x,y,1.05,time));
      add(w*.5,h*.70,(x,y)=>drawNeonArch(ctxRef,x,y,.85,time));
      add(w*.22,h*.89,(x,y)=>drawSofa(ctxRef,x,y,.8));
      add(w*.78,h*.89,(x,y)=>drawSofa(ctxRef,x,y,.8));
    } else if(planet==="beach"){
      add(w*.12,h*.79,(x,y)=>drawPalm(ctxRef,x,y,.9,time));
      add(w*.87,h*.78,(x,y)=>drawPalm(ctxRef,x,y,1.05,time));
      add(w*.34,h*.86,(x,y)=>drawBeachChair(ctxRef,x,y,.9));
      add(w*.68,h*.87,(x,y)=>drawBeachChair(ctxRef,x,y,.9));
      add(w*.52,h*.82,(x,y)=>drawShopKiosk(ctxRef,x,y,.78));
      add(w*.22,h*.90,(x,y)=>drawLifeguardTower(ctxRef,x,y,.82));
      add(w*.78,h*.90,(x,y)=>drawSurfboard(ctxRef,x,y,.9));
    }
    return objects;
  }
  let ctxRef=null;
  function render(ctx,items){ctxRef=ctx;items.forEach(item=>item.draw());ctxRef=null;}
  window.NexoraWorldObjects=Object.freeze({get,render});
})();