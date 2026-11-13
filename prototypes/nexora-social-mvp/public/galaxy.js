(() => {
  "use strict";
  const $=s=>document.querySelector(s);
  const scene=new window.NexoraGalaxyScene($("#scene-viewport"),$("#galaxy-canvas"),openPlayer,setMoveTarget);
  const socket=io("/galaxy",{autoConnect:false});
  const me={id:null,nickname:""};
  let roomPlanet="starter",selected=null,moveTarget=null,moveMode=false,players=[],chatCollapsed=false;
  const defaults=[{key:"starter",name:"Стартовая"},{key:"club",name:"Клуб"},{key:"beach",name:"Пляж"}];
  const toast=message=>{const el=$("#galaxy-toast");el.textContent=message;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),2600)};
  async function api(url,options={}){const r=await fetch(url,{credentials:"same-origin",...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Ошибка запроса");return d}
  function planetName(key){return defaults.find(p=>p.key===key)?.name||$("#planet-select").selectedOptions[0]?.textContent||"Планета"}
  function addChat(message){
    const log=$("#chat-log"),row=document.createElement("div");row.className="chat-line";
    if(message.system){row.classList.add("system");row.textContent=message.text;log.append(row);log.scrollTop=log.scrollHeight;return}
    const time=document.createElement("time");time.textContent=new Date(message.time||Date.now()).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
    const nick=document.createElement("b");nick.textContent=message.nickname||"Игрок";nick.addEventListener("click",()=>{$("#chat-input").value=nick.textContent+", ";$("#chat-input").focus()});
    const body=document.createElement("span");body.textContent=": "+(message.text||"");
    row.append(time,nick,body);if(me.nickname&&String(message.text||"").toLocaleLowerCase("ru-RU").includes(me.nickname.toLocaleLowerCase("ru-RU")))row.classList.add("mentioned");
    log.append(row);while(log.children.length>120)log.firstChild.remove();log.scrollTop=log.scrollHeight;
  }
  function updateOnline(){const count=players.length;$("#online-count").textContent=count;$("#players-list").replaceChildren(...players.map(p=>{const row=document.createElement("button");row.className="player-row";row.textContent=(p.nickname||"Игрок")+(String(p.id)===String(me.id)?" · Вы":"");row.addEventListener("click",()=>openPlayer(p));return row}))}
  function setPlayers(list){players=list||[];players.forEach(p=>{p.isMe=String(p.id)===String(me.id)});scene.setPlayers(players);updateOnline()}
  function openPlayer(player){selected=player;const menu=$("#context-menu");menu.hidden=false;menu.style.left=Math.max(8,Math.min(innerWidth-200,innerWidth/2-90))+"px";menu.style.top=Math.max(70,Math.min(innerHeight-220,innerHeight/2-50))+"px";$("#context-title").textContent=player.nickname||"Персонаж";$("#context-move").hidden=String(player.id)!==String(me.id);$("#context-info").hidden=false}
  function closeContext(){$("#context-menu").hidden=true}
  function openInfo(){if(!selected)return;$("#profile-title").textContent=selected.nickname||"Персонаж";$("#profile-content").textContent=(selected.title||"Новичок")+" · "+(selected.authority||0)+" очков авторитета"+(selected.auraEnabled?" · Аура активна":"");$("#profile-modal").hidden=false;closeContext()}
  function setMoveTarget(x){if(!moveMode)return;moveTarget=x;scene.setCursor(x);$("#move-confirm-bar").hidden=false}
  function beginMove(){moveMode=true;moveTarget=null;scene.setCursor(.5);$("#move-confirm-bar").hidden=false;$("#move-hint").textContent="Выберите место и нажмите ОК"}
  function cancelMove(){moveMode=false;moveTarget=null;scene.setCursor(null);$("#move-confirm-bar").hidden=true}
  function confirmMove(){
    if(moveTarget===null)return toast("Сначала выбери место на полу.");
    const target=moveTarget,mePlayer=players.find(p=>String(p.id)===String(me.id));if(!mePlayer)return;
    const start=Number(mePlayer.x||.5),distance=Math.abs(target-start),duration=Math.max(450,Math.min(2400,distance*3500)),steps=Math.max(1,Math.ceil(duration/140));let step=0;
    cancelMove();const timer=setInterval(()=>{step++;const x=start+(target-start)*Math.min(1,step/steps);socket.emit("player:move",{x,y:.82},result=>{if(result&&!result.ok&&step===1)toast(result.error)});if(step>=steps)clearInterval(timer)},140);
  }
  async function loadPlanets(){
    const select=$("#planet-select");select.replaceChildren();
    defaults.forEach(p=>{const o=document.createElement("option");o.value=p.key;o.textContent=p.name;select.append(o)});
    try{const d=await api("/api/planets");(d.planets||[]).forEach(p=>{const o=document.createElement("option");o.value="custom-"+p.id;o.textContent=p.name;select.append(o)})}catch{}
    select.value=roomPlanet;
  }
  function join(){socket.emit("player:join",{},result=>{if(!result?.ok){toast(result?.error||"Не удалось войти");return}$("#connection-state").textContent="В сети";roomPlanet=result.player.planet;$("#planet-select").value=roomPlanet;$("#planet-name").textContent=planetName(roomPlanet);$("#online-room-name").textContent=planetName(roomPlanet)})}
  socket.on("connect",join);
  socket.on("connect_error",error=>{toast(error.message==="AUTH_REQUIRED"?"Войди в NEXORA, чтобы открыть Galaxy.":"Не удалось подключиться к комнате.");$("#connection-state").textContent="Нет соединения"});
  socket.on("disconnect",()=>{$("#connection-state").textContent="Отключено"});
  socket.on("planet:state",data=>{roomPlanet=data.planet;$("#planet-select").value=roomPlanet;$("#planet-name").textContent=planetName(roomPlanet);$("#online-room-name").textContent=planetName(roomPlanet);setPlayers(data.players||[]);addChat({system:true,text:"* Ты прилетел на планету "+planetName(roomPlanet)})});
  socket.on("player:joined",p=>{if(!players.some(x=>String(x.id)===String(p.id))){players.push(p);scene.upsert(p);updateOnline()}addChat({system:true,text:"* "+p.nickname+" прилетел на планету"})});
  socket.on("player:left",event=>{const p=players.find(x=>String(x.id)===String(event.id));players=players.filter(x=>String(x.id)!==String(event.id));scene.remove(event.id);updateOnline();if(p)addChat({system:true,text:"* "+p.nickname+" улетел с планеты"})});
  socket.on("player:moved",event=>{const p=players.find(x=>String(x.id)===String(event.id));if(p){p.x=event.x;p.y=event.y;scene.movePlayer(event.id,event.x,event.y)}});
  socket.on("chat:message",message=>addChat(message));
  socket.on("player:bubble",event=>scene.bubble(event.id,event.text||event.bubble?.text||""));
  socket.on("emotion:played",event=>{const p=players.find(x=>String(x.id)===String(event.id));if(p){p.emotion={type:event.emotion};scene.upsert(p)}});
  socket.on("player:action:played",event=>{toast(event.from+" "+event.label+" "+event.to)});
  socket.on("profile:updated",p=>{const i=players.findIndex(x=>String(x.id)===String(p.id));if(i>=0)players[i]=p;setPlayers(players)});

  $("#chat-form").addEventListener("submit",e=>{e.preventDefault();const input=$("#chat-input"),text=input.value.trim();if(!text)return;socket.emit("chat:send",{text},result=>{if(!result?.ok)toast(result?.error||"Не удалось отправить сообщение")});input.value=""});
  $("#emoji-button").addEventListener("click",()=>{$("#chat-input").value+=" 🙂";$("#chat-input").focus()});
  $("#chat-toggle").addEventListener("click",()=>{chatCollapsed=!chatCollapsed;$("#chat-log").hidden=chatCollapsed;$("#chat-form").hidden=chatCollapsed;$("#chat-toggle").textContent=chatCollapsed?"Развернуть +":"Свернуть −"});
  $("#players-toggle").addEventListener("click",()=>$("#players-panel").hidden=!$("#players-panel").hidden);
  $("#players-panel").addEventListener("click",e=>{if(e.target.closest("[data-close]"))$("#players-panel").hidden=true});
  $("#move-mode").addEventListener("click",beginMove);$("#move-confirm").addEventListener("click",confirmMove);$("#move-cancel").addEventListener("click",cancelMove);
  $("#my-character").addEventListener("click",()=>{const p=players.find(x=>String(x.id)===String(me.id));if(p)openPlayer(p)});
  $("#rejoin").addEventListener("click",()=>{if(socket.connected){socket.disconnect();setTimeout(()=>socket.connect(),180)}else socket.connect()});
  $("#planet-select").addEventListener("change",e=>{const next=e.target.value;socket.emit("planet:change",{planet:next},result=>{if(!result?.ok){toast(result?.error||"Перелёт не выполнен");e.target.value=roomPlanet;return}roomPlanet=next;$("#planet-name").textContent=planetName(next);$("#online-room-name").textContent=planetName(next)})});
  $("#context-menu").addEventListener("click",e=>{const action=e.target.dataset.action;if(!action)return;if(action==="info")openInfo();if(action==="move"){closeContext();beginMove()}if(action==="emote"){closeContext();socket.emit("emotion:play",{emotion:"wave"})}if(action==="rejoin"){closeContext();$("#rejoin").click()}if(action==="wave"&&selected){socket.emit("player:action",{targetId:selected.id,action:"wave"},r=>{if(!r?.ok)toast(r?.error||"Действие не выполнено")});closeContext()}});
  document.addEventListener("click",e=>{if(!e.target.closest("#context-menu")&&!e.target.closest("#scene-viewport"))closeContext()});
  $("#profile-modal").addEventListener("click",e=>{if(e.target===e.currentTarget||e.target.closest("[data-close]"))$("#profile-modal").hidden=true});
  $("#planet-list").addEventListener("click",()=>$("#planet-select").focus());
  $("#emote").addEventListener("click",()=>socket.emit("emotion:play",{emotion:"dance"}));
  async function start(){
    try{const d=await api("/api/me");me.id=String(d.account.id);me.nickname=d.account.nickname;roomPlanet=d.character.planet||"starter";await loadPlanets();$("#planet-select").value=roomPlanet;socket.connect();$("#connection-state").textContent="Подключение…"}
    catch(error){toast(error.message);$("#connection-state").textContent="Нужен вход";setTimeout(()=>location.href="/",1200)}
  }
  start();
})();