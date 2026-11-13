(() => {
  "use strict";
  const $=s=>document.querySelector(s);
  if (new URLSearchParams(location.search).get("embedded") === "1") {
    const back = $("#embedded-back");
    const brand = $(".brand");
    if (back) {
      back.hidden = false;
      back.addEventListener("click", () => window.parent.postMessage({ type: "nexora:galaxy-close" }, location.origin));
    }
    if (brand) brand.hidden = true;
  }
  const scene=new window.NexoraGalaxyScene($("#scene-viewport"),$("#galaxy-canvas"),openPlayer,setMoveTarget);
  const socket=io("/galaxy",{autoConnect:false});
  const me={id:null,nickname:""};
  let roomPlanet="starter",selected=null,moveTarget=null,moveMode=false,players=[],chatCollapsed=false;
  let planetCatalog=[],selectedPlanet=null,planetFilter="all",planetSearch="";
  const basePlanets=[
    {key:"starter",name:"Стартовая",description:"Главная точка встречи путешественников NEXORA.",theme:"nebula",color:"#536ed0",light:"#b9c9ff",glow:"#617dff",x:50,y:48,onlineCount:0},
    {key:"club",name:"Клуб",description:"Музыка, танцы и ночная жизнь галактики.",theme:"violet",color:"#a344c4",light:"#f1a7ff",glow:"#bd59e8",x:76,y:29,onlineCount:0},
    {key:"beach",name:"Пляж",description:"Тёплая планета для отдыха и общения.",theme:"ocean",color:"#168da8",light:"#9cf4ff",glow:"#38d9f2",x:23,y:72,onlineCount:0}
  ];
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
  function setPlayers(list){players=list||[];players.forEach(p=>{p.isMe=String(p.id)===String(me.id)});scene.setPlayers(players);scene.centerOn(me.id);updateOnline()}
  function openPlayer(player,clientX=innerWidth/2,clientY=innerHeight/2){selected=player;const menu=$("#context-menu");menu.hidden=false;$("#context-actions").hidden=true;menu.style.left=Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,clientX+14))+"px";menu.style.top=Math.max(62,Math.min(innerHeight-menu.offsetHeight-8,clientY-24))+"px";$("#context-title").textContent=player.nickname||"Персонаж";$("#context-move").hidden=String(player.id)!==String(me.id);$("#context-info").hidden=false}
  function closeContext(){$("#context-menu").hidden=true}
  function openInfo(){if(!selected)return;$("#profile-title").textContent=selected.nickname||"Персонаж";$("#profile-content").textContent=(selected.title||"Новичок")+" · "+(selected.authority||0)+" очков авторитета"+(selected.auraEnabled?" · Аура активна":"");$("#profile-modal").hidden=false;closeContext()}
  function setMoveTarget(x){if(!moveMode)return;moveTarget=x;scene.setCursor(x);$("#move-confirm-bar").hidden=false}
  function beginMove(){moveMode=true;moveTarget=null;scene.setMoveMode(true);scene.setCursor(.5);$("#move-confirm-bar").hidden=false;$("#move-hint").textContent="Проведите пальцем по линии, выберите место и нажмите ОК"}
  function cancelMove(){moveMode=false;moveTarget=null;scene.setMoveMode(false);scene.setCursor(null);$("#move-confirm-bar").hidden=true}
  function confirmMove(){
    if(moveTarget===null)return toast("Сначала выбери место на полу.");
    const target=moveTarget,mePlayer=players.find(p=>String(p.id)===String(me.id));if(!mePlayer)return;
    const start=Number(mePlayer.x||.5),distance=Math.abs(target-start),duration=Math.max(450,Math.min(2400,distance*3500)),steps=Math.max(1,Math.ceil(duration/140));let step=0;
    cancelMove();const timer=setInterval(()=>{step++;const x=start+(target-start)*Math.min(1,step/steps);socket.emit("player:move",{x,y:.82},result=>{if(result&&!result.ok&&step===1)toast(result.error)});if(step>=steps)clearInterval(timer)},140);
  }
  async function loadPlanets(){
    const select=$("#planet-select");select.replaceChildren();
    let builtInFavorites=[];try{builtInFavorites=JSON.parse(localStorage.getItem("nexora.favoritePlanets")||"[]")}catch{}
    planetCatalog=basePlanets.map(p=>({...p,favorite:builtInFavorites.includes(p.key)}));
    try{const d=await api("/api/planets");(d.worlds||[]).forEach(w=>{const base=planetCatalog.find(p=>p.key===w.key);if(base)base.onlineCount=Number(w.onlineCount||0)});(d.planets||[]).forEach((p,i)=>planetCatalog.push({key:"custom-"+p.id,id:String(p.id),name:p.name,description:p.description||"Планета сообщества NEXORA.",theme:p.theme||"nebula",color:p.accent_color||"#8068d8",light:"#e1d7ff",glow:p.accent_color||"#8068d8",onlineCount:Number(p.onlineCount||0),memberCount:Number(p.memberCount||0),totalVisits:Number(p.total_visits||0),favorite:Boolean(p.favorite),x:[18,43,72,86,34,61][i%6],y:[28,77,63,48,20,84][i%6]}))}catch(error){console.warn("Planet catalog:",error)}
    planetCatalog.forEach(p=>{const o=document.createElement("option");o.value=p.key;o.textContent=p.name;select.append(o)});
    select.value=roomPlanet;
  }
  function openPlanetMap(){renderPlanetMap();$("#planet-map").hidden=false}
  function closePlanetMap(){$("#planet-map").hidden=true}
  function renderPlanetMap(){
    const map=$("#planet-orbit-map"),needle=planetSearch.trim().toLocaleLowerCase("ru-RU"),items=planetCatalog.filter(p=>(planetFilter==="favorites"?p.favorite:planetFilter==="popular"?Number(p.totalVisits||p.onlineCount||0)>0:true)&&(!needle||(p.name+" "+(p.description||"")).toLocaleLowerCase("ru-RU").includes(needle)));
    map.replaceChildren();
    for(let i=0;i<42;i++){const star=document.createElement("i");star.className="star";star.style.left=((i*47+13)%97)+"%";star.style.top=((i*71+9)%93)+"%";star.style.opacity=String(.25+(i%5)*.14);map.append(star)}
    items.forEach((p,i)=>{const node=document.createElement("button");node.type="button";node.className="planet-node"+(selectedPlanet?.key===p.key?" selected":"");node.style.left=(p.x||((i*19+18)%85+7))+"%";node.style.top=(p.y||((i*31+17)%78+10))+"%";node.style.setProperty("--planet-color",p.color);node.style.setProperty("--planet-light",p.light);node.style.setProperty("--planet-glow",p.glow);node.innerHTML='<span class="planet-globe"></span><strong></strong><small></small>';node.querySelector("strong").textContent=p.name;node.querySelector("small").textContent=(p.onlineCount||0)+" онлайн";node.addEventListener("click",()=>selectPlanet(p));map.append(node)});
    $("#planet-map-count").textContent=items.length+" планет · "+planetCatalog.reduce((n,p)=>n+Number(p.onlineCount||0),0)+" онлайн";
    if(!items.some(p=>p.key===selectedPlanet?.key))selectedPlanet=items[0]||null;
    if(selectedPlanet)showPlanetDetails(selectedPlanet);else{$("#planet-detail").innerHTML="<small>НЕТ ПЛАНЕТ</small><h3>Пока пусто</h3><p>В этой категории планет пока нет.</p>";$("#planet-visit").disabled=true}
  }
  function selectPlanet(p){selectedPlanet=p;renderPlanetMap()}
  function showPlanetDetails(p){
    const panel=$("#planet-detail");panel.innerHTML='<div class="planet-detail-art"></div><small>ПЛАНЕТА NEXORA</small><h3></h3><p></p><div class="planet-detail-stats"><span class="planet-online"></span><span class="planet-visits"></span><span class="planet-fav"></span></div><button class="planet-favorite" type="button"></button>';
    panel.querySelector("h3").textContent=p.name;panel.querySelector("p").textContent=p.description||"Открой новую комнату и познакомься с жителями этой планеты.";
    panel.querySelector(".planet-detail-art").style.setProperty("--planet-color",p.color);panel.querySelector(".planet-detail-art").style.setProperty("--planet-light",p.light);panel.querySelector(".planet-detail-art").style.setProperty("--planet-glow",p.glow);
    panel.querySelector(".planet-online").textContent="♟ "+(p.onlineCount||0)+" онлайн";
    panel.querySelector(".planet-visits").textContent="✦ "+(p.totalVisits||0)+" посещений";
    panel.querySelector(".planet-fav").textContent=p.favorite?"★ В избранном":"☆ Не в избранном";
    const fav=panel.querySelector(".planet-favorite");fav.textContent=p.favorite?"★ Убрать из избранного":"☆ В избранное";
    fav.addEventListener("click",async()=>{try{if(p.id)await api("/api/planets/"+p.id+"/favorite",{method:p.favorite?"DELETE":"POST"});else{const keys=JSON.parse(localStorage.getItem("nexora.favoritePlanets")||"[]");const next=p.favorite?keys.filter(k=>k!==p.key):[...new Set([...keys,p.key])];localStorage.setItem("nexora.favoritePlanets",JSON.stringify(next))}p.favorite=!p.favorite;fav.textContent=p.favorite?"★ Убрать из избранного":"☆ В избранное";panel.querySelector(".planet-fav").textContent=p.favorite?"★ В избранном":"☆ Не в избранном";toast(p.favorite?"Добавлено в избранное":"Удалено из избранного");if(planetFilter==="favorites"&&!p.favorite)renderPlanetMap();else renderPlanetMap()}catch(e){toast(e.message)}});
    $("#planet-visit").disabled=p.key===roomPlanet;$("#planet-visit").textContent=p.key===roomPlanet?"Ты уже здесь":"Посетить планету ↗";
  }
  async function travelToPlanet(p){
    if(!p||p.key===roomPlanet)return;
    $("#flight-destination").textContent="Курс: "+p.name;$("#planet-flight").hidden=false;closePlanetMap();
    try{
      if(p.id)await api("/api/planets/"+p.id+"/visit",{method:"POST",body:JSON.stringify({})});
      await new Promise(resolve=>setTimeout(resolve,850));
      await new Promise(resolve=>socket.emit("planet:change",{planet:p.key},result=>{if(!result?.ok)return resolve(Promise.reject(new Error(result?.error||"Перелёт не выполнен")));resolve()}));
      roomPlanet=p.key;$("#planet-select").value=roomPlanet;$("#planet-name").textContent=p.name;$("#online-room-name").textContent=p.name;
      try{const recent=JSON.parse(localStorage.getItem("nexora.recentPlanets")||"[]").filter(k=>k!==p.key);localStorage.setItem("nexora.recentPlanets",JSON.stringify([p.key,...recent].slice(0,8)))}catch{}
    }catch(e){toast(e.message)}finally{setTimeout(()=>$("#planet-flight").hidden=true,350)}
  }
  function join(){socket.emit("player:join",{},result=>{if(!result?.ok){toast(result?.error||"Не удалось войти");return}$("#connection-state").textContent="В сети";roomPlanet=result.player.planet;$("#planet-select").value=roomPlanet;$("#planet-name").textContent=planetName(roomPlanet);$("#online-room-name").textContent=planetName(roomPlanet)})}
  socket.on("connect",join);
  socket.on("connect_error",error=>{toast(error.message==="AUTH_REQUIRED"?"Войди в NEXORA, чтобы открыть Galaxy.":"Не удалось подключиться к комнате.");$("#connection-state").textContent="Нет соединения"});
  socket.on("disconnect",()=>{$("#connection-state").textContent="Отключено"});
  socket.on("planet:state",data=>{roomPlanet=data.planet;$("#planet-select").value=roomPlanet;$("#planet-name").textContent=planetName(roomPlanet);$("#online-room-name").textContent=planetName(roomPlanet);setPlayers(data.players||[]);(data.history||[]).forEach(message=>addChat(message));addChat({system:true,text:"* Ты прилетел на планету "+planetName(roomPlanet)})});
  socket.on("player:joined",p=>{if(!players.some(x=>String(x.id)===String(p.id))){players.push(p);scene.upsert(p);updateOnline()}addChat({system:true,text:"* "+p.nickname+" прилетел на планету"})});
  socket.on("player:left",event=>{const p=players.find(x=>String(x.id)===String(event.id));players=players.filter(x=>String(x.id)!==String(event.id));scene.remove(event.id);updateOnline();if(p)addChat({system:true,text:"* "+p.nickname+" улетел с планеты"})});
  socket.on("player:moved",event=>{const p=players.find(x=>String(x.id)===String(event.id));if(p){p.x=event.x;p.y=event.y;scene.movePlayer(event.id,event.x,event.y)}});
  socket.on("chat:message",message=>addChat(message));
  socket.on("player:bubble",event=>scene.bubble(event.id,event.text||event.bubble?.text||""));
  socket.on("emotion:played",event=>{const p=players.find(x=>String(x.id)===String(event.id));if(p){p.emotion={type:event.emotion};scene.upsert(p)}});
  socket.on("player:action:played",event=>{const actor=players.find(p=>String(p.id)===String(event.fromId)),target=players.find(p=>String(p.id)===String(event.toId));const motion=({wave:"wave",smile:"smile",hug:"love",kiss:"kiss",dance:"dance",flower:"love"})[event.action]||"smile";if(actor){actor.emotion={type:motion,until:Date.now()+1800};scene.upsert(actor);scene.bubble(actor.id,event.label)}if(target){target.emotion={type:"smile",until:Date.now()+1300};scene.upsert(target);scene.bubble(target.id,event.label+" тебе")}toast(event.from+" "+event.label+" "+event.to)});
  socket.on("profile:updated",p=>{const i=players.findIndex(x=>String(x.id)===String(p.id));if(i>=0)players[i]=p;setPlayers(players)});

  $("#chat-form").addEventListener("submit",e=>{e.preventDefault();const input=$("#chat-input"),text=input.value.trim();if(!text)return;socket.emit("chat:send",{text},result=>{if(!result?.ok)toast(result?.error||"Не удалось отправить сообщение")});input.value=""});
  $("#emoji-button").addEventListener("click",()=>{$("#chat-input").value+=" 🙂";$("#chat-input").focus()});
  $("#chat-toggle").addEventListener("click",()=>{chatCollapsed=!chatCollapsed;$("#chat-log").hidden=chatCollapsed;$("#chat-form").hidden=chatCollapsed;$("#chat-toggle").textContent=chatCollapsed?"Развернуть +":"Свернуть −"});
  $("#players-toggle").addEventListener("click",()=>$("#players-panel").hidden=!$("#players-panel").hidden);
  $("#players-panel").addEventListener("click",e=>{if(e.target.closest("[data-close]"))$("#players-panel").hidden=true});
  $("#move-mode").addEventListener("click",beginMove);$("#move-confirm").addEventListener("click",confirmMove);$("#move-cancel").addEventListener("click",cancelMove);
  $("#my-character").addEventListener("click",()=>{const p=players.find(x=>String(x.id)===String(me.id));if(p)openPlayer(p)});
  $("#rejoin").addEventListener("click",()=>{if(socket.connected){socket.disconnect();setTimeout(()=>socket.connect(),180)}else socket.connect()});
  $("#planet-select").addEventListener("change",e=>{const p=planetCatalog.find(x=>x.key===e.target.value);if(p)travelToPlanet(p);else e.target.value=roomPlanet});
  $("#context-menu").addEventListener("click",e=>{const choice=e.target.closest("[data-action-choice]");if(choice){playCharacterAction(choice.dataset.actionChoice);return}const action=e.target.closest("[data-action]")?.dataset.action;if(!action)return;if(action==="info")openInfo();if(action==="move"){closeContext();beginMove()}if(action==="actions"){$("#context-actions").hidden=!$("#context-actions").hidden;$("#context-actions-toggle .context-chevron").textContent=$("#context-actions").hidden?"›":"⌄";$("#context-menu").style.top=Math.max(62,Math.min(innerHeight-$("#context-menu").offsetHeight-8,parseFloat($("#context-menu").style.top)||80))+"px"}if(action==="rejoin"){closeContext();$("#rejoin").click()}});
  function playCharacterAction(action){if(!selected)return;const own=String(selected.id)===String(me.id);if(own){const emotionMap={wave:"wave",smile:"smile",hug:"love",kiss:"kiss",dance:"dance",flower:"love"};socket.emit("emotion:play",{emotion:emotionMap[action]||"smile"},r=>{if(r&&!r.ok)toast(r.error||"Действие не выполнено")})}else{socket.emit("player:action",{targetId:selected.id,action},r=>{if(!r?.ok)toast(r?.error||"Действие не выполнено")})}closeContext()}
  document.addEventListener("click",e=>{if(!e.target.closest("#context-menu")&&!e.target.closest("#scene-viewport"))closeContext()});
  $("#profile-modal").addEventListener("click",e=>{if(e.target===e.currentTarget||e.target.closest("[data-close]"))$("#profile-modal").hidden=true});
  $("#planet-list").addEventListener("click",openPlanetMap);
  $("#planet-search").addEventListener("input",e=>{planetSearch=e.target.value;renderPlanetMap()});
  $("#planet-map").addEventListener("click",e=>{if(e.target===e.currentTarget||e.target.closest("[data-map-close]"))closePlanetMap();const filter=e.target.closest("[data-map-filter]");if(filter){planetFilter=filter.dataset.mapFilter;document.querySelectorAll("[data-map-filter]").forEach(b=>b.classList.toggle("active",b===filter));renderPlanetMap()}});
  $("#planet-visit").addEventListener("click",()=>travelToPlanet(selectedPlanet));
  async function start(){
    try{const d=await api("/api/me");me.id=String(d.account.id);me.nickname=d.account.nickname;roomPlanet=d.character.planet||"starter";await loadPlanets();$("#planet-select").value=roomPlanet;socket.connect();$("#connection-state").textContent="Подключение…"}
    catch(error){toast(error.message);$("#connection-state").textContent="Нужен вход";setTimeout(()=>location.href="/",1200)}
  }
  start();
})();