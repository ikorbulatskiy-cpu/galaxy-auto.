(() => {
  "use strict";
  class GalaxyScene {
    constructor(viewport, canvas, onSelect, onFloor) {
      this.viewport=viewport;this.canvas=canvas;this.ctx=canvas.getContext("2d");
      this.width=2400;this.height=480;this.camera=0;this.players=new Map();this.onSelect=onSelect;this.onFloor=onFloor;this.cursor=null;this.drag=null;
      this.resize();window.addEventListener("resize",()=>this.resize());
      viewport.addEventListener("pointerdown",e=>this.down(e));
      viewport.addEventListener("pointermove",e=>this.move(e));
      viewport.addEventListener("pointerup",e=>this.up(e));
      viewport.addEventListener("pointercancel",()=>this.drag=null);
      this.frame=requestAnimationFrame(t=>this.draw(t));
    }
    resize(){this.height=Math.max(320,this.viewport.clientHeight);this.canvas.width=this.width;this.canvas.height=this.height;this.canvas.style.width=this.width+"px";this.canvas.style.height=this.height+"px";this.canvas.style.transform="translateX("+(-this.camera)+"px)";}
    down(e){this.drag={x:e.clientX,camera:this.camera,moved:false,id:e.pointerId};this.viewport.setPointerCapture?.(e.pointerId)}
    move(e){if(!this.drag)return;const dx=e.clientX-this.drag.x;if(Math.abs(dx)>4)this.drag.moved=true;this.camera=Math.max(0,Math.min(this.width-this.viewport.clientWidth,this.drag.camera-dx));this.canvas.style.transform="translateX("+(-this.camera)+"px)";}
    up(e){if(!this.drag)return;const moved=this.drag.moved;this.drag=null;if(moved)return;const rect=this.viewport.getBoundingClientRect();const x=(e.clientX-rect.left+this.camera)/this.width;const hit=[...this.players.values()].find(p=>Math.abs(p.x-x)<.035);if(hit){this.onSelect?.(hit);return;}this.onFloor?.(Math.max(.04,Math.min(.96,x)));}
    setPlayers(rows){const keep=new Set();for(const raw of rows||[]){const id=String(raw.id);keep.add(id);const p=this.players.get(id)||{id,bubbles:[]};Object.assign(p,raw,{x:Number(raw.x??.5),y:Number(raw.y??.82)});this.players.set(id,p)}for(const [id] of this.players)if(!keep.has(id))this.players.delete(id)}
    upsert(p){if(!p?.id)return;const current=this.players.get(String(p.id))||{bubbles:[]};Object.assign(current,p,{id:String(p.id)});this.players.set(String(p.id),current)}
    remove(id){this.players.delete(String(id))}
    movePlayer(id,x,y,duration=140){const p=this.players.get(String(id));if(p){const from=p.renderX??p.x;p.move={from,to:x,started:performance.now(),duration};p.x=x;p.y=y;p.direction=x<from?"left":"right";p.moving=true;clearTimeout(p.moveTimer);p.moveTimer=setTimeout(()=>{p.moving=false;p.move=null;p.renderX=p.x},duration+40)}}
    bubble(id,text){const p=this.players.get(String(id));if(!p)return;p.bubbles.push({text,until:Date.now()+7000});if(p.bubbles.length>3)p.bubbles.shift()}
    setCursor(x){this.cursor=x}
    drawBackground(ctx,t){
      const sky=ctx.createLinearGradient(0,0,0,this.height);sky.addColorStop(0,"#07132d");sky.addColorStop(.62,"#182b50");sky.addColorStop(1,"#3b4a67");ctx.fillStyle=sky;ctx.fillRect(0,0,this.width,this.height);
      for(let i=0;i<180;i++){const x=(i*137)%this.width,y=(i*71)%Math.floor(this.height*.64);ctx.globalAlpha=.3+((i*19)%70)/100;ctx.fillStyle="#dceaff";ctx.fillRect(x,y,(i%9===0)?2:1,(i%9===0)?2:1)}ctx.globalAlpha=1;
      const nebula=ctx.createRadialGradient(1150,190,10,1150,190,900);nebula.addColorStop(0,"rgba(116,91,183,.20)");nebula.addColorStop(1,"rgba(116,91,183,0)");ctx.fillStyle=nebula;ctx.fillRect(150,0,1800,this.height);
      ctx.fillStyle="#273f66";ctx.beginPath();ctx.moveTo(0,this.height*.68);for(let x=0;x<=this.width;x+=120)ctx.lineTo(x,this.height*.61+Math.sin(x*.007)*25);ctx.lineTo(this.width,this.height);ctx.lineTo(0,this.height);ctx.fill();
      const floorY=this.height*.83;ctx.fillStyle="#293d5b";ctx.fillRect(0,floorY,this.width,this.height-floorY);ctx.fillStyle="#83b8e8";ctx.fillRect(0,floorY,this.width,2);
      ctx.strokeStyle="rgba(157,197,237,.22)";ctx.lineWidth=1;for(let x=0;x<this.width;x+=80){ctx.beginPath();ctx.moveTo(x,floorY);ctx.lineTo(x,this.height);ctx.stroke()}
      ctx.fillStyle="rgba(15,26,47,.6)";ctx.fillRect(0,floorY+5,this.width,3);
    }
    drawPlayer(ctx,p,t){
      let px=p.x;if(p.move){const progress=Math.min(1,(t-p.move.started)/p.move.duration);px=p.move.from+(p.move.to-p.move.from)*progress;p.renderX=px;if(progress>=1)p.move=null}else p.renderX=px;const x=px*this.width,y=p.y*this.height,scale=1.22;
      if(p.auraEnabled&&p.auraType&&p.auraType!=="NONE"){const colors={GREEN:"#65ffad",GOLD_SOFT:"#ffd86d",GOLD_PREMIUM:"#ffc63f",FIRE_RED:"#ff715f",VIOLET:"#c17aff",CYAN:"#61eaff"};ctx.save();ctx.shadowColor=colors[p.auraType]||"#7abfff";ctx.shadowBlur=20;ctx.strokeStyle=colors[p.auraType]||"#7abfff";ctx.globalAlpha=.62;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,y-43,31,54,0,0,Math.PI*2);ctx.stroke();ctx.restore()}
      if(window.NexoraSpriteEngine?.ready){window.NexoraSpriteEngine.draw(ctx,x,y,scale,p.avatar,p.direction||"down",Boolean(p.moving),p.emotion?.type)}
      else{ctx.font="64px sans-serif";ctx.textAlign="center";ctx.fillText("🧑",x,y)}
      const title=p.title||"Новичок",name=p.nickname||"Игрок";ctx.font="bold 12px Arial";const width=Math.max(ctx.measureText(name).width,ctx.measureText(title).width)+18;
      ctx.fillStyle="rgba(8,15,31,.94)";ctx.strokeStyle=p.isMe?"#e9c86e":"#5c8dc9";ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x-width/2,y-110,width,34,6);ctx.fill();ctx.stroke();
      ctx.fillStyle="#a9c8ef";ctx.font="9px Arial";ctx.textAlign="center";ctx.fillText("✦ "+title,x,y-98);
      ctx.fillStyle=p.isMe?"#ffdc83":"#f2f6ff";ctx.font="bold 11px Arial";ctx.fillText(name,x,y-84);
      p.bubbles=p.bubbles.filter(b=>b.until>Date.now());p.bubbles.forEach((b,i)=>{const by=y-137-i*34;ctx.font="12px Arial";const bw=Math.min(230,ctx.measureText(b.text).width+22);ctx.fillStyle="#fff4dd";ctx.beginPath();ctx.roundRect(x-bw/2,by-24,bw,27,8);ctx.fill();ctx.beginPath();ctx.moveTo(x-6,by+3);ctx.lineTo(x+6,by+3);ctx.lineTo(x,by+10);ctx.fill();ctx.fillStyle="#25212a";ctx.textAlign="center";ctx.fillText(b.text.slice(0,100),x,by-7,bw-12)});
    }
    draw(t){this.ctx.clearRect(0,0,this.width,this.height);this.drawBackground(this.ctx,t);for(const p of this.players.values())this.drawPlayer(this.ctx,p,t);if(this.cursor!==null){const x=this.cursor*this.width,y=this.height*.83;this.ctx.save();this.ctx.fillStyle="#9be9ff";this.ctx.shadowColor="#54caff";this.ctx.shadowBlur=20;this.ctx.font="34px Arial";this.ctx.textAlign="center";this.ctx.fillText("➤",x,y-4);this.ctx.restore()}this.frame=requestAnimationFrame(time=>this.draw(time))}
  }
  window.NexoraGalaxyScene=GalaxyScene;
})();