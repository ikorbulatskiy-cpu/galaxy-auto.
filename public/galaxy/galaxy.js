import { GalaxySocket } from "./galaxy-socket.js";
import { GalaxyScene } from "./galaxy-scene.js";

const $=s=>document.querySelector(s);
const toast=message=>{const el=$("#toast");el.textContent=message;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),2600)};
const api=async(url,options={})=>{const r=await fetch(url,{credentials:"same-origin",...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Ошибка запроса");return data};
let me=null,room=null,planet=null,moveTarget=null,selected=null,socketReady={chat:false,movement:false};
const scene=new GalaxyScene($("#scene-viewport"),$("#scene-world"),$("#players-layer"),(id,row,el)=>openContext(id,row,el),x=>{if(moveTarget!==null){moveTarget=x;$("#position-cursor").style.left=(x*24)+"px";}});
const socket=new GalaxySocket(onSocketEvent);

function addChat(message){
 const log=$("#chat-log"),row=document.createElement("div");row.className="chat-line";
 const system=message.system||message.type==="presence";
 const body=message.body||message.text||"";
 const name=message.character_name||message.username||"Система";
 if(system){row.classList.add("system");row.textContent=message.body||("* "+name+(message.action==="joined"?" прилетел на планету":" улетел с планеты")); }
 else{
  const time=document.createElement("time");time.textContent=new Date(message.created_at||Date.now()).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
  const nick=document.createElement("b");nick.textContent=name;nick.addEventListener("click",()=>{$("#chat-input").value=name+", ";$("#chat-input").focus()});
  const text=document.createElement("span");text.textContent=": "+body;
  row.append(time,nick,text);
  if(body.toLocaleLowerCase("ru-RU").includes((me?.username||"").toLocaleLowerCase("ru-RU")))row.classList.add("mentioned");
 }
 log.append(row);while(log.children.length>120)log.firstChild.remove();log.scrollTop=log.scrollHeight;
}
function onSocketEvent(event){
 if(event.type==="socket_open"){socketReady[event.kind]=true;$("#connection-state").textContent=socketReady.chat&&socketReady.movement?"На связи":"Подключение…";if(socketReady.chat&&socketReady.movement&&room)socket.join(room.id);return}
 if(event.type==="socket_close"||event.type==="socket_error"){socketReady[event.kind]=false;$("#connection-state").textContent="Нет соединения";return}
 if(event.type==="ready"){return}
 if(event.type==="joined_room"){return}
 if(event.type==="position_list"){scene.setPlayers(event.positions||[],me.id);return}
 if(event.type==="player_joined"){refreshPresence();return}
 if(event.type==="player_moved"){scene.movePlayer(event.userId,event.x,500);return}
 if(event.type==="player_action"){const el=scene.getPlayer(event.userId);if(el)el.querySelector(".player-avatar").textContent=({dance:"💃",happy:"😄",wave:"👋",heart:"💗"}[event.action]||"🧑");return}
 if(event.type==="room_message"){const m=event.message||{};addChat(m);scene.bubble(m.user_id||m.userId||m.character_id||"",m.body||"");return}
 if(event.type==="presence"){addChat({type:"presence",action:event.action,username:event.username});refreshPresence();return}
 if(event.type==="planet_modules"){if(event.planetName)$("#room-title").textContent=event.planetName+" · "+(room?.name||"Комната");return}
 if(event.type==="error"){toast(event.message);return}
}
async function refreshPresence(){
 if(!room)return;
 try{const d=await api("/api/game/rooms/"+room.id+"/presence");$("#online-count").textContent=d.users.length;$("#players-list").replaceChildren(...d.users.map(u=>{const row=document.createElement("div");row.className="player-row";row.textContent=(u.character_name||u.username)+(u.is_me?" · Вы":"");return row}));scene.setPlayers(d.users.map((u,i)=>({...u,x:u.x??(10+i*11)})),me.id)}catch{}
}
async function loadMessages(){try{const d=await api("/api/game/rooms/"+room.id+"/messages?limit=60");d.messages.forEach(addChat)}catch(e){toast(e.message)}}
async function joinDefaultRoom(){
 const rooms=await api("/api/game/rooms");
 if(!rooms.rooms.length)throw new Error("На этой планете пока нет комнат.");
 room=rooms.rooms[0];$("#room-title").textContent=room.planet_name+" · "+room.name;
 socket.join(room.id);await refreshPresence();await loadMessages();
}
async function loadPlanets(){
 const d=await api("/api/game/planets");const select=$("#planet-select");select.replaceChildren();
 d.planets.forEach(p=>{const option=document.createElement("option");option.value=p.slug;option.textContent=p.name;if(p.is_current){planet=p;option.selected=true}select.append(option)});
 if(!planet)planet=d.planets[0];
}
async function travel(slug){
 await api("/api/world/travel",{method:"POST",body:JSON.stringify({planetSlug:slug})});
 socket.close();socketReady={chat:false,movement:false};room=null;planet=null;
 await loadPlanets();await joinDefaultRoom();socket.connect();
}
function openContext(id,row,el){selected={id,row,el};const menu=$("#context-menu");menu.hidden=false;menu.style.left=Math.min(innerWidth-205,Math.max(8,el.getBoundingClientRect().left))+"px";menu.style.top=Math.min(innerHeight-190,el.getBoundingClientRect().top+20)+"px"}
function closeContext(){$("#context-menu").hidden=true}
function beginMove(){moveTarget=50;$("#move-bar").hidden=false;$("#position-cursor").hidden=false;$("#position-cursor").style.left=(50*24)+"px";toast("Нажми на пол в нужном месте.");}
async function confirmMove(){
 if(moveTarget===null)return;
 const target=moveTarget;$("#move-bar").hidden=true;$("#position-cursor").hidden=true;moveTarget=null;
 const mine=scene.getPlayer(me.id);const start=Number.parseFloat(mine?.style.left)||50;const duration=Math.max(450,Math.min(2600,Math.abs(target-start)*35));const steps=Math.max(1,Math.ceil(duration/130));let sent=0;
 const timer=setInterval(()=>{sent++;const x=start+(target-start)*Math.min(1,sent/steps);socket.sendMovement({type:"move",x});if(sent>=steps)clearInterval(timer)},130);
 scene.movePlayer(me.id,target,duration);
}
function openProfile(id,row){const p=row||selected?.row||{};$("#profile-content").textContent=(p.character_name||p.username||selected?.el?.dataset.name||"Персонаж")+" · "+(p.is_me?"Ваш персонаж":"Персонаж комнаты");$("#profile-modal").hidden=false}
$("#chat-form").addEventListener("submit",e=>{e.preventDefault();const input=$("#chat-input"),body=input.value.trim();if(!body)return;socket.sendChat({type:"room_message",body});input.value=""});
$("#emoji-button").addEventListener("click",()=>{const input=$("#chat-input");input.value+=" 🙂";input.focus()});
$("#chat-toggle").addEventListener("click",()=>{const log=$("#chat-log"),form=$("#chat-form"),closed=log.hidden;log.hidden=!closed;form.hidden=!closed;$("#chat-toggle").textContent=closed?"Свернуть −":"Развернуть +";$("#chat-toggle").setAttribute("aria-expanded",String(closed))});
$("#players-toggle").addEventListener("click",()=>$("#players-panel").hidden=!$("#players-panel").hidden);
$("#players-panel").addEventListener("click",e=>{if(e.target.closest("[data-close]"))$("#players-panel").hidden=true});
$("#move-mode").addEventListener("click",beginMove);$("#my-character").addEventListener("click",()=>openProfile(me.id,{username:me.username,is_me:true}));
$("#move-cancel").addEventListener("click",()=>{moveTarget=null;$("#move-bar").hidden=true;$("#position-cursor").hidden=true});
$("#move-confirm").addEventListener("click",confirmMove);
$("#rejoin").addEventListener("click",()=>{socket.close();socketReady={chat:false,movement:false};socket.connect();toast("Перезалетаем…")});
$("#planet-list").addEventListener("click",()=>$("#planet-select").focus());
$("#planet-select").addEventListener("change",e=>travel(e.target.value).catch(err=>toast(err.message)));
$("#context-menu").addEventListener("click",e=>{const action=e.target.dataset.action;if(!action)return;closeContext();if(action==="move")beginMove();if(action==="info")openProfile(selected?.id,selected?.row);if(action==="rejoin")$("#rejoin").click();if(action==="emote"){socket.sendMovement({type:"action",action:"wave",direction:"front"});toast("👋 Приветствие отправлено")}});
document.addEventListener("click",e=>{if(!e.target.closest("#context-menu,.galaxy-player"))closeContext()});
$("#profile-modal").addEventListener("click",e=>{if(e.target===e.currentTarget||e.target.closest("[data-close]"))$("#profile-modal").hidden=true});
window.addEventListener("resize",()=>{if(moveTarget!==null)$("#position-cursor").style.left=(moveTarget*24)+"px"});
async function start(){
 try{
  const auth=await api("/api/auth/me");me=auth.user;
  await loadPlanets();await joinDefaultRoom();
  socket.connect();
 }catch(error){toast(error.message);$("#connection-state").textContent="Требуется вход";setTimeout(()=>location.href="/",1400)}
}
start();
