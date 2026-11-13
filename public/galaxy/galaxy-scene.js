export class GalaxyScene {
  constructor(viewport, world, layer, onSelect, onFloor) {
    this.viewport=viewport; this.world=world; this.layer=layer; this.onSelect=onSelect; this.onFloor=onFloor;
    this.players=new Map(); this.camera=0; this.drag=null;
    viewport.addEventListener("pointerdown",e=>this.pointerDown(e));
    viewport.addEventListener("pointermove",e=>this.pointerMove(e));
    viewport.addEventListener("pointerup",e=>this.pointerUp(e));
    viewport.addEventListener("pointercancel",()=>this.drag=null);
  }
  pointerDown(e) {
    if(e.target.closest(".galaxy-player,.players-panel"))return;
    this.drag={x:e.clientX,camera:this.camera,moved:false,id:e.pointerId};
    this.viewport.setPointerCapture?.(e.pointerId);
  }
  pointerMove(e) {
    if(!this.drag)return;
    const dx=e.clientX-this.drag.x;
    if(Math.abs(dx)>4)this.drag.moved=true;
    this.camera=Math.max(0,Math.min(2400-this.viewport.clientWidth,this.drag.camera-dx));
    this.world.style.transform="translateX("+(-this.camera)+"px)";
  }
  pointerUp(e) {
    if(!this.drag)return;
    const moved=this.drag.moved;this.drag=null;
    if(!moved&&this.onFloor){const rect=this.viewport.getBoundingClientRect();const x=Math.max(0,Math.min(100,((e.clientX-rect.left+this.camera)/2400)*100));this.onFloor(x);}
  }
  setPlayers(rows,meId) {
    const next=new Set();
    rows.forEach((row,index)=>{
      const id=String(row.user_id||row.userId||row.id);next.add(id);
      let el=this.players.get(id);
      if(!el){
        el=document.createElement("div");el.className="galaxy-player";
        const bubble=document.createElement("div");bubble.className="speech-bubble";bubble.hidden=true;
        const label=document.createElement("div");label.className="player-label";
        const avatar=document.createElement("div");avatar.className="player-avatar";avatar.innerHTML='<span class="player-aura"></span>🧑';
        el.append(bubble,label,avatar);el.addEventListener("click",event=>{event.stopPropagation();this.onSelect?.(id,row,el)});
        this.layer.append(el);this.players.set(id,el);
      }
      const name=row.character_name||row.username||row.characterName||"Игрок";
      el.querySelector(".player-label").textContent=name+(id===String(meId)?" · Вы":"");
      el.classList.toggle("me",id===String(meId));
      const x=Number(row.x);el.style.left=(Number.isFinite(x)?x:12+index*10)+"%";
      el.dataset.name=name;el.dataset.id=id;
    });
    for(const [id,el] of this.players){if(!next.has(id)){el.remove();this.players.delete(id)}}
  }
  movePlayer(id,x,duration=800) {
    const el=this.players.get(String(id));if(!el)return;
    el.style.transition="left "+duration+"ms linear";el.style.left=x+"%";
    setTimeout(()=>{el.style.transition=""},duration+50);
  }
  bubble(id,text) {
    const el=this.players.get(String(id));if(!el)return;
    const bubble=el.querySelector(".speech-bubble");bubble.textContent=text;bubble.hidden=false;
    clearTimeout(bubble._hideTimer);bubble._hideTimer=setTimeout(()=>bubble.hidden=true,7000);
  }
  getPlayer(id){return this.players.get(String(id))}
}
