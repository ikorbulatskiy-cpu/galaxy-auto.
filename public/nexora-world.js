/* NEXORA 2D planet-room client. Uses existing authenticated game APIs and room WebSocket. */
(()=>{
 const root=document.getElementById("tab-world");if(!root)return;
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const api=async(url,options={})=>{const r=await fetch(url,{credentials:"same-origin",...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||"Ошибка "+r.status);return d};
 let planets=[],rooms=[],activePlanet="",activeRoom="",socket=null,meName="Ты",meAppearance={},meAura="none",activeCharacterId="",poll=null,reconnectTimer=null,reconnectAttempts=0,joinGeneration=0,roomAckTimer=null;
 const palette={light:"#f2c9a5",medium:"#d49a6c",tan:"#a96e45",dark:"#68402f"};
 function avatar(look={},mini=false){const payload=esc(JSON.stringify(look||{}));return '<canvas class="nx-sprite-canvas" data-nexora-sprite data-size="'+(mini?"mini":"full")+'" data-look="'+payload+'" aria-label="Персонаж"></canvas>'}
 function cosmetics(look={}){const raw=Array.isArray(look.accessories)?look.accessories:String(look.accessories||"").split(",");const items=raw.map(x=>String(x).trim()).filter(Boolean).slice(0,3);if(look.wings)items.unshift("Крылья");if(look.halo)items.unshift("Ореол");return items.length?'<div class="nx-avatar-accessories">'+items.map(x=>'<span>'+esc(x)+'</span>').join("")+'</div>':""}
 function addEvent(message,kind="info"){const box=document.getElementById("nx-event-list");if(!box)return;const row=document.createElement("div");row.className="nx-event-item nx-event-"+kind;const stamp=document.createElement("time");stamp.textContent=new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});const body=document.createElement("span");body.textContent=message;row.append(stamp,body);box.prepend(row);while(box.children.length>18)box.lastElementChild.remove();const summary=document.getElementById("nx-system-message");if(summary)summary.textContent=message}
 function getFavorites(){try{return JSON.parse(localStorage.getItem("nexora_favorites")||"[]")}catch{return[]}}
 function saveFavorites(items){localStorage.setItem("nexora_favorites",JSON.stringify(items))}
 function renderFavorites(){const box=document.getElementById("nx-favorites-list");if(!box)return;const items=getFavorites();box.innerHTML=items.length?items.map(x=>'<div class="nx-favorite-row"><span>'+esc(x.name)+'</span><button type="button" data-remove-fav="'+esc(x.key)+'">Убрать</button></div>').join(""):'Список избранного пуст.';box.querySelectorAll("[data-remove-fav]").forEach(b=>b.onclick=()=>{saveFavorites(getFavorites().filter(x=>x.key!==b.dataset.removeFav));renderFavorites();renderPlayers(lastPlayers)})}
 let lastPlayers=[];
 function renderPlayers(users=[]){
  lastPlayers=users.slice(0,14);const stage=document.getElementById("nx-avatars");if(!stage)return;
  const all=lastPlayers.slice();if(!all.some(u=>u.is_me))all.unshift({username:"you",character_name:meName,character_appearance:meAppearance,character_aura:meAura,is_me:true});
  const favorites=getFavorites();
  stage.innerHTML=all.map(u=>{const key=String(u.character_id||u.id||u.username||u.character_name||"player"),name=u.character_name||u.username||"Игрок",fav=favorites.some(x=>x.key===key),aura=u.character_aura||"none";return '<div class="nx-avatar-card aura-'+esc(aura)+' '+(u.is_me?"me":"")+'" data-player-key="'+esc(key)+'" data-player-username="'+esc(u.username||"")+'"><div class="nx-avatar-name">'+(u.is_me?"♛ ":"")+esc(name)+'</div><button type="button" class="nx-fav-toggle '+(fav?"is-favorite":"")+'" data-favorite="'+esc(key)+'" data-favorite-name="'+esc(name)+'" title="Добавить в избранное">'+(fav?"★":"☆")+'</button>'+((aura&&aura!=="none")?'<span class="nx-rank-mark">'+(aura==="angel"?"✧":aura==="god"?"☼":aura==="almighty"?"♛":aura==="universe"?"✹":"★")+'</span>':"")+avatar(u.character_appearance||{})+cosmetics(u.character_appearance||{})+'</div>'}).join("");if(window.NexoraSpriteAvatar)window.NexoraSpriteAvatar.mountAll(stage);
  stage.querySelectorAll("[data-favorite]").forEach(b=>b.onclick=e=>{e.stopPropagation();const key=b.dataset.favorite,name=b.dataset.favoriteName,items=getFavorites(),exists=items.some(x=>x.key===key);saveFavorites(exists?items.filter(x=>x.key!==key):items.concat([{key,name}]));renderPlayers(lastPlayers);renderFavorites()});
  const count=users.length;document.getElementById("nx-online").textContent="Игроков: "+count;document.getElementById("nx-event-online").textContent="● "+count+" игроков";
  document.getElementById("nx-player-list").innerHTML='<h4>В комнате:</h4>'+all.map(u=>'<div class="nx-player">'+avatar(u.character_appearance||{},true)+'<span>'+esc(u.character_name||u.username)+'</span></div>').join("");if(window.NexoraSpriteAvatar)window.NexoraSpriteAvatar.mountAll(document.getElementById("nx-player-list"));
 } function appendMessage(m){
  const log=document.getElementById("nx-chat-log");if(!log)return;
  const line=document.createElement("div");line.className="nx-chat-line";
  const time=new Date(m.created_at||Date.now()).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
  const name=document.createElement("b");name.textContent=(m.character_name||m.username||"Игрок")+": ";
  const body=document.createElement("span");body.textContent=m.body||"";
  const stamp=document.createElement("small");stamp.textContent=time;
  line.append(stamp,name,body);log.append(line);log.scrollTop=log.scrollHeight;
 }
 function layout(){
  root.innerHTML='<div class="nx-world nx-classic"><header class="nx-topbar"><div class="nx-logo">✦ NEXORA</div><div class="nx-current-planet"><small>ПЛАНЕТА</small><b id="nx-top-planet">Новички*1</b></div><div class="nx-clock" id="nx-clock">--:--</div><div class="nx-top-actions"><button class="nx-icon-btn" type="button" data-open-tab="messages" title="Почта">✉<small>Почта</small></button><button class="nx-icon-btn" type="button" data-open-tab="friends" title="Друзья">♟<small>Друзья</small></button><button class="nx-icon-btn" type="button" id="nx-favorites-toggle" title="Избранное">★<small>Избранное</small></button><button class="nx-icon-btn" type="button" id="nx-planet-go" title="Планеты">◎<small>Планеты</small></button><button class="nx-icon-btn" type="button" data-open-tab="profile" title="Настройки">⚙<small>Настройки</small></button><button class="nx-icon-btn" type="button" id="nx-help-toggle" title="Помощь">?<small>Помощь</small></button></div><div class="nx-account"><span id="nx-greeting"></span><div id="nx-account-actions"></div></div></header><div class="nx-planet-tools"><input class="nx-planet-select" id="nx-planet-search" list="nx-planet-options" placeholder="Название планеты для перелёта"><datalist id="nx-planet-options"></datalist><select class="nx-room-select" id="nx-room-select" aria-label="Выбрать комнату"><option value="">Комнаты…</option></select><button class="nx-small-btn" id="nx-refresh" type="button" title="Обновить">↻</button><span class="nx-online" id="nx-online">Игроков: —</span></div><section class="nx-chat-panel"><div class="nx-chat-title"><span id="nx-chat-title">Общий чат планеты</span><span class="nx-chat-hint">Публичная комната</span></div><div class="nx-chat-log" id="nx-chat-log" aria-live="polite"></div><form class="nx-chat-send" id="nx-chat-form"><input class="field" name="body" maxlength="1000" placeholder="Введите сообщение..." autocomplete="off"><button type="submit">Отправить</button></form></section><div class="nx-eventbar"><span class="nx-event-online" id="nx-event-online">● 0 игроков</span><span>✉ <b>Почта</b></span><span>♢ <b>Уведомления</b></span><span class="nx-event-status"><i class="nx-dot"></i><span id="nx-status">Соединение: готово</span></span><span class="nx-event-system" id="nx-system-message">Добро пожаловать в NEXORA</span><button type="button" class="nx-events-toggle" id="nx-events-toggle">События ▾</button></div><aside class="nx-events-panel" id="nx-events-panel" hidden><div class="nx-menu-heading">Лента событий <button type="button" id="nx-events-close">×</button></div><div id="nx-event-list" aria-live="polite"><div class="nx-event-item"><time>—</time><span>Добро пожаловать в NEXORA</span></div></div></aside><section class="nx-scene"><div class="nx-planet"></div><div class="nx-scene-arch"></div><div class="nx-scene-label" id="nx-room-label">🪐 Выбери комнату</div><div class="nx-scene-meta" id="nx-scene-meta"></div><div class="nx-avatars" id="nx-avatars"></div><div class="nx-action-bar" aria-label="Действия персонажа"><button type="button" data-avatar-action="idle">Стоять</button><button type="button" data-avatar-action="dance">Танец</button><button type="button" data-avatar-action="happy">Радость</button><button type="button" data-avatar-action="wave">Привет</button><button type="button" data-avatar-action="heart">Сердце</button></div><div class="nx-floor"></div><aside class="nx-player-list" id="nx-player-list"><h4>В комнате:</h4></aside></section><nav class="nx-bottom-nav"><button type="button" data-nx="menu"><span>☰</span>Меню</button><button type="button" data-tab="characters"><span>♙</span>Персонаж</button><button type="button" data-nx="planets"><span>◎</span>Планеты</button><button type="button" data-tab="economy"><span>▣</span>Инвентарь</button><button type="button" data-tab="friends"><span>♟</span>Друзья</button><button type="button" data-nx="exit"><span>↪</span>Выход</button></nav><aside class="nx-menu-panel" id="nx-menu-panel" hidden><div class="nx-menu-heading">✦ Меню игры <button type="button" id="nx-menu-close">×</button></div><div class="nx-menu-grid"><button type="button" data-tab="profile"><span>♙</span>Мой профиль</button><button type="button" data-tab="discover"><span>⌕</span>Поиск людей</button><button type="button" data-tab="friends"><span>♟</span>Друзья</button><button type="button" data-tab="messages"><span>✉</span>Почта и сообщения</button><button type="button" data-tab="characters"><span>♜</span>Персонажи</button><button type="button" data-tab="notifications"><span>♢</span>Уведомления</button><button type="button" data-tab="clans"><span>⚑</span>Кланы</button><button type="button" data-tab="economy"><span>▣</span>Магазин и инвентарь</button><button type="button" data-tab="pets"><span>♧</span>Питомцы</button><button type="button" data-tab="blogs"><span>▤</span>Блоги</button><button type="button" data-tab="relationships"><span>♡</span>Отношения</button><button type="button" data-tab="rankings"><span>★</span>Рейтинги</button></div></aside><aside class="nx-favorites-panel" id="nx-favorites-panel" hidden><div class="nx-menu-heading">★ Избранные игроки <button type="button" id="nx-favorites-close">×</button></div><div id="nx-favorites-list" class="nx-favorites-list">Нажми ★ у персонажа, чтобы добавить его сюда.</div></aside><aside class="nx-help-panel" id="nx-help-panel" hidden><div class="nx-menu-heading">? Помощь <button type="button" id="nx-help-close">×</button></div><p>Выбери планету через поиск и нажми ◎. Сообщения отправляются в общий чат выбранной комнаты. Нажми ★ у персонажа, чтобы сохранить его в избранное. Нижнее меню открывает профиль, персонажей, магазин и друзей.</p></aside><div class="nx-statusbar"><span>© NEXORA</span><span>2D социальный мир</span><span id="nx-statusbar-time"></span></div></div>';
  const menu=document.getElementById("nx-menu-panel"),toggle=document.getElementById("nx-menu-toggle");
  const closeMenu=()=>{menu.hidden=true;if(toggle)toggle.setAttribute("aria-expanded","false")};
  const closePanels=()=>{menu.hidden=true;document.getElementById("nx-favorites-panel").hidden=true;document.getElementById("nx-help-panel").hidden=true};
  document.getElementById("nx-menu-close").onclick=closeMenu;
  const menuButton=root.querySelector('[data-nx="menu"]');menuButton.onclick=()=>{const open=menu.hidden;closePanels();menu.hidden=!open};
  root.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{if(typeof window.switchTab==="function"){window.switchTab(b.dataset.tab);closePanels()}}));
  root.querySelectorAll("[data-open-tab]").forEach(b=>b.addEventListener("click",()=>{if(typeof window.switchTab==="function")window.switchTab(b.dataset.openTab)}));
  const greeting=document.getElementById("nx-greeting"),welcome=document.getElementById("welcome");if(greeting&&welcome)greeting.textContent=welcome.textContent;
  const actions=document.getElementById("nx-account-actions"),logout=document.getElementById("logout");if(actions&&logout&&!actions.contains(logout))actions.appendChild(logout);
  document.getElementById("nx-refresh").onclick=()=>refreshWorld();
  const roomSelect=document.getElementById("nx-room-select");roomSelect.onchange=()=>{const selected=rooms.find(x=>x.id===roomSelect.value);if(selected)join(selected)};
  const eventsPanel=document.getElementById("nx-events-panel");document.getElementById("nx-events-toggle").onclick=()=>{eventsPanel.hidden=!eventsPanel.hidden};document.getElementById("nx-events-close").onclick=()=>{eventsPanel.hidden=true};
  document.getElementById("nx-planet-go").onclick=()=>{const input=document.getElementById("nx-planet-search");if(input.value.trim())findPlanet();else input.focus()};
  document.getElementById("nx-planet-search").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();findPlanet()}});
  document.getElementById("nx-chat-form").onsubmit=e=>{e.preventDefault();const input=e.currentTarget.elements.body,body=input.value.trim();if(!body)return;if(!socket||socket.readyState!==WebSocket.OPEN)return status("Нет подключения к чату");socket.send(JSON.stringify({type:"room_message",body}));input.value=""};
  document.getElementById("nx-favorites-toggle").onclick=()=>{const panel=document.getElementById("nx-favorites-panel");const open=panel.hidden;closePanels();panel.hidden=!open;renderFavorites()};
  document.getElementById("nx-favorites-close").onclick=()=>document.getElementById("nx-favorites-panel").hidden=true;
  document.getElementById("nx-help-toggle").onclick=()=>{const panel=document.getElementById("nx-help-panel");const open=panel.hidden;closePanels();panel.hidden=!open};
  document.getElementById("nx-help-close").onclick=()=>document.getElementById("nx-help-panel").hidden=true;
  const updateClock=()=>{const now=new Date(),time=now.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});document.getElementById("nx-clock").textContent=time;document.getElementById("nx-statusbar-time").textContent=now.toLocaleDateString("ru-RU")};
  updateClock();setInterval(updateClock,30000);
  root.querySelectorAll("[data-nx]").forEach(b=>{if(b===menuButton)return;b.onclick=()=>{const action=b.dataset.nx;if(action==="exit"){const out=document.getElementById("logout");if(out)out.click()}else if(action==="planets"){const input=document.getElementById("nx-planet-search");input.focus();input.scrollIntoView({block:"nearest"})}}});
  root.querySelectorAll("[data-avatar-action]").forEach(button=>button.addEventListener("click",()=>{
   const action=button.dataset.avatarAction,card=root.querySelector("#nx-avatars .nx-avatar-card.me"),canvas=card?.querySelector("canvas[data-nexora-sprite]");
   const instance=canvas&&window.NexoraSpriteAvatar?.get(canvas);
   if(instance)instance.setAnimation(action);
   if(window.NexoraMovement)window.NexoraMovement.action(action);
   root.querySelectorAll("[data-avatar-action]").forEach(item=>item.classList.toggle("active",item===button));
  }));
  renderPlayers([]);
 } function status(s){const el=document.getElementById("nx-status");if(el)el.textContent=s}
 async function refreshWorld(){
  try{
   const [p,c]=await Promise.all([api("/api/game/planets"),api("/api/game/characters")]);
   planets=p.planets||[];const active=c.characters?.find(x=>x.is_active)||c.characters?.[0];if(active){meName=active.name;meAppearance=active.appearance||{};meAura=active.aura||"none";activeCharacterId=active.id}
   const current=planets.find(x=>x.is_current)||planets.find(x=>x.slug==="newbies-1")||planets[0];activePlanet=current?.slug||"";const list=document.getElementById("nx-planet-options");list.innerHTML=planets.map(x=>`<option value="${esc(x.name)}" label="${esc(x.slug)} · ${Number(x.online||0)} онлайн"></option>`).join("");applyPlanetScene(current);
   await loadRooms();
  }catch(e){status(e.message);if(window.toast)toast(e.message)}
 }
 async function travel(slug){
  try{const planet=planets.find(p=>p.slug===slug);if(!planet)throw new Error("Планета не найдена. Введи её название.");const overlay=document.getElementById("nx-flight-overlay");if(overlay){overlay.hidden=false;document.getElementById("nx-flight-label").textContent="Перелёт на "+planet.name;await new Promise(r=>setTimeout(r,1400))}await api("/api/world/travel",{method:"POST",body:JSON.stringify({planetSlug:slug})});activePlanet=slug;disconnect();addEvent("Перелёт на планету «"+planet.name+"» завершён.","success");applyPlanetScene(planet);await loadRooms();if(overlay)overlay.hidden=true;status("Перелёт завершён")}
  catch(e){const overlay=document.getElementById("nx-flight-overlay");if(overlay)overlay.hidden=true;status(e.message);if(window.toast)toast(e.message)}
 }
 async function loadRooms(){
  try{
   const d=await api("/api/game/rooms?planet="+encodeURIComponent(activePlanet));
   rooms=d.rooms||[];const select=document.getElementById("nx-room-select");select.innerHTML=rooms.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+' · '+Number(x.online||0)+' онлайн</option>').join("")||'<option value="">Нет комнат</option>';
   if(!rooms.length){disconnect();status("На этой планете пока нет комнат");document.getElementById("nx-room-label").textContent="🪐 Комнат пока нет";return}
   const old=activeRoom;const room=rooms.find(x=>x.id===old)||rooms[0];select.value=room.id;await join(room);
  }catch(e){status(e.message);document.getElementById("nx-room-label").textContent="Выбери доступную планету"}
 }
 function disconnect(){
  joinGeneration++;
  if(reconnectTimer)clearTimeout(reconnectTimer);
  if(roomAckTimer)clearTimeout(roomAckTimer);roomAckTimer=null;
  reconnectTimer=null;reconnectAttempts=0;
  if(poll)clearInterval(poll);poll=null;
  if(socket){socket.onclose=null;socket.close(1000,"Room changed");socket=null}
  activeRoom="";window.nexoraActiveRoom="";
  window.dispatchEvent(new Event("nexora:room-left"));
 }
 async function refreshRoomSnapshot(room,generation){
  const [m,p]=await Promise.all([api("/api/game/rooms/"+room.id+"/messages"),api("/api/game/rooms/"+room.id+"/presence")]);
  if(generation!==joinGeneration||activeRoom!==room.id)return;
  const log=document.getElementById("nx-chat-log");if(log)log.innerHTML="";
  (m.messages||[]).forEach(appendMessage);renderPlayers(p.users||[]);
 }
 function connectRoomSocket(room,generation){
  if(generation!==joinGeneration||activeRoom!==room.id)return;
  const wsProtocol=location.protocol==="https:"?"wss:":"ws:";
  const ws=new WebSocket(wsProtocol+"//"+location.host+"/ws");socket=ws;
  ws.onopen=()=>{
   if(socket!==ws||generation!==joinGeneration)return;
   status("Сервер проверяет подключение…");
   roomAckTimer=setTimeout(()=>{if(socket===ws&&ws.readyState===WebSocket.OPEN){addEvent("Сервер не подтвердил вход в комнату за 10 секунд.","warning");ws.close(4001,"Room join acknowledgement timeout")}},10000);
  };
  ws.onmessage=e=>{
   if(socket!==ws||generation!==joinGeneration)return;
   let packet;try{packet=JSON.parse(e.data)}catch{return}
   if(packet.type==="ready"){
    if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:"join_room",roomId:room.id}));
   }
   if(packet.type==="joined_room"&&packet.roomId===room.id){
    if(roomAckTimer)clearTimeout(roomAckTimer);roomAckTimer=null;
    reconnectAttempts=0;window.nexoraActiveRoom=room.id;
    window.dispatchEvent(new CustomEvent("nexora:room-joined",{detail:{roomId:room.id}}));
    status("Соединение: отличное");
    addEvent("Соединение с комнатой установлено.","success");
   }
   if(packet.type==="room_message"&&packet.message){appendMessage(packet.message);addEvent((packet.message.character_name||packet.message.username||"Игрок")+": "+packet.message.body,"chat")}
   if(packet.type==="presence"&&packet.roomId===room.id){
    if(packet.action==="joined")addEvent((packet.username||"Игрок")+" вошёл в комнату.","join");
    if(packet.action==="left")addEvent("Игрок покинул комнату.","leave");
    loadPresence(room.id);
   }
   if(packet.type==="error"){if(roomAckTimer)clearTimeout(roomAckTimer);roomAckTimer=null;status(packet.message);addEvent(packet.message,"warning")}
  };
  ws.onerror=()=>{if(socket===ws)status("Проблема сети. Восстанавливаем соединение…")};
  ws.onclose=event=>{
   if(roomAckTimer)clearTimeout(roomAckTimer);roomAckTimer=null;
   if(socket===ws)socket=null;
   addEvent("WebSocket закрыт: код "+event.code+(event.reason?" · "+event.reason:""),"warning");
   if(generation!==joinGeneration||activeRoom!==room.id)return;
   window.nexoraActiveRoom="";
   window.dispatchEvent(new Event("nexora:room-left"));
   status("Связь потеряна. Повторное подключение…");
   addEvent("Соединение прервано. Пытаемся вернуться в комнату.","warning");
   if(reconnectTimer)return;
   const delay=Math.min(30000,1000*Math.pow(2,Math.min(reconnectAttempts++,5)))+Math.floor(Math.random()*500);
   reconnectTimer=setTimeout(async()=>{
    reconnectTimer=null;
    if(generation!==joinGeneration||activeRoom!==room.id)return;
    try{
     await refreshRoomSnapshot(room,generation);
     if(generation===joinGeneration&&activeRoom===room.id)connectRoomSocket(room,generation);
    }catch(error){
     status("Комната временно недоступна. Повторяем подключение…");
     if(generation===joinGeneration&&activeRoom===room.id){
      reconnectTimer=setTimeout(()=>{reconnectTimer=null;if(generation===joinGeneration)connectRoomSocket(room,generation)},Math.min(30000,delay*2));
     }
    }
   },delay);
  };
 }
 async function join(room){
  disconnect();activeRoom=room.id;const generation=joinGeneration;
  const selector=document.getElementById("nx-room-select");if(selector)selector.value=room.id;
  addEvent("Ты вошёл в комнату «"+room.name+"».","join");
  document.getElementById("nx-room-label").textContent="🪐 "+room.name;
  document.getElementById("nx-chat-title").textContent="Общий чат · "+room.name;
  document.getElementById("nx-chat-log").innerHTML="";
  status("Подключение к комнате…");
  try{
   await refreshRoomSnapshot(room,generation);
   if(generation!==joinGeneration||activeRoom!==room.id)return;
   connectRoomSocket(room,generation);
   poll=setInterval(()=>loadPresence(room.id),25000);
  }catch(e){if(generation===joinGeneration){status(e.message);addEvent("Не удалось загрузить комнату: "+e.message,"warning")}}
 }
 async function loadPresence(id){try{const p=await api("/api/game/rooms/"+id+"/presence");if(activeRoom===id)renderPlayers(p.users||[])}catch{}}
 
 function applyPlanetScene(p){if(!p)return;const scene=root.querySelector(".nx-scene");scene.dataset.theme=p.settings?.theme||"custom";const king=p.slug==="newbies-1"?"Король планеты пока неизвестен":(p.owner_name?"Король: "+p.owner_name:"Король: неизвестен");const meta=document.getElementById("nx-scene-meta");if(meta)meta.textContent=[king,p.settings?.interior,p.settings?.weather].filter(Boolean).join(" · ");document.getElementById("nx-room-label").textContent="🪐 "+p.name;const top=document.getElementById("nx-top-planet");if(top)top.textContent=p.name}
 function findPlanet(){const q=document.getElementById("nx-planet-search").value.trim().toLocaleLowerCase("ru");if(!q)return status("Введи название планеты.");const p=planets.find(x=>x.slug===q||x.name.toLocaleLowerCase("ru")===q||x.name.toLocaleLowerCase("ru").includes(q));if(!p)return status("Планета не найдена.");travel(p.slug)}
 async function createPlanet(){const name=prompt("Название новой планеты (3-48 символов):");if(name===null)return;const description=prompt("Описание планеты:")||"";const weather=prompt("Погода на планете:","Ясно")||"Ясно";const interior=prompt("Интерьер планеты:","Космический зал")||"Космический зал";try{const d=await api("/api/game/planets",{method:"POST",body:JSON.stringify({name,description,weather,interior})});status("Планета создана. Ты её король!");await refreshWorld();document.getElementById("nx-planet-search").value=d.planet.name;travel(d.planet.slug)}catch(e){status(e.message);if(window.toast)toast(e.message)}}
 async function openAuras(){try{const d=await api("/api/game/auras");const chars=d.characters||[];const active=chars.find(c=>c.id===activeCharacterId)||chars[0];if(!active)return status("Сначала создай персонажа.");const options=[["none","Новичок",0],["angel","Ангел",50],["god",active.gender==="female"?"Богиня":"Бог",null],["almighty","Всемогущий",100],["universe",active.gender==="female"?"Мисс Вселенная":"Мистер Вселенный",200],["legend","Легенда",300]];const text=options.map(x=>x[1]+(x[2]===null?" (цена уточняется)":x[2]?" ("+x[2]+" coins)":" (без ауры)")).join("\n");const chosen=prompt("Ауры персонажа:\n"+text+"\n\nВведи: none, angel, almighty, universe или legend",active.aura||"none");if(!chosen)return;if(chosen==="god")return status("Цена Бога / Богини пока не установлена.");await api("/api/game/characters/"+active.id+"/aura",{method:"POST",body:JSON.stringify({aura:chosen.trim().toLowerCase()})});status("Аура обновлена.");await refreshWorld()}catch(e){status(e.message);if(window.toast)toast(e.message)}}

 window.nexoraWorldRefresh=refreshWorld;
 layout();const overlay=document.createElement("div");overlay.className="nx-flight-overlay";overlay.id="nx-flight-overlay";overlay.hidden=true;overlay.innerHTML="<div class=nx-flight-stars></div><div class=nx-flight-ship>🚀</div><b id=nx-flight-label>Перелёт между планетами</b>";root.querySelector(".nx-world").appendChild(overlay);refreshWorld();
})();
