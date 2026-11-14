/* NEXORA 2D planet-room client. Uses existing authenticated game APIs and room WebSocket. */
(()=>{
 const root=document.getElementById("tab-world");if(!root)return;
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const api=window.NexoraAPI?window.NexoraAPI.request:async(url,options={})=>{const r=await fetch(url,{credentials:"same-origin",...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||"Ошибка "+r.status);return d};
 let planets=[],rooms=[],activePlanet="",activeRoom="",socket=null,meName="Ты",meAppearance={},meAura="none",activeCharacterId="",poll=null,reconnectTimer=null,reconnectAttempts=0,joinGeneration=0,roomAckTimer=null,planetObjects=[],travelInProgress=false;
 let galaxyPrefs={chat_bubbles:true,sound_enabled:true,system_messages:true};
 function playGalaxyNotice(){if(!galaxyPrefs.sound_enabled)return;try{const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;const ctx=new Ctx(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.type="sine";osc.frequency.value=660;gain.gain.setValueAtTime(.045,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.12);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.12);osc.onended=()=>ctx.close()}catch{}}
 function showChatBubble(message){if(!galaxyPrefs.chat_bubbles)return;const username=String(message.username||"");const card=[...document.querySelectorAll("#nx-avatars .nx-avatar-card")].find(node=>node.dataset.playerUsername===username);if(!card)return;let bubble=card.querySelector(".nx-chat-bubble");if(!bubble){bubble=document.createElement("div");bubble.className="nx-chat-bubble";card.append(bubble)}bubble.textContent=String(message.body||"").slice(0,100);bubble.hidden=false;clearTimeout(bubble._hideTimer);bubble._hideTimer=setTimeout(()=>{bubble.hidden=true},4500)}
 const palette={light:"#f2c9a5",medium:"#d49a6c",tan:"#a96e45",dark:"#68402f"};
 function avatar(look={},mini=false){const payload=esc(JSON.stringify(look||{}));return '<canvas class="nx-sprite-canvas" data-nexora-sprite data-size="'+(mini?"mini":"full")+'" data-look="'+payload+'" aria-label="Персонаж"></canvas>'}
 const customObjectAtlas=new Image();
 const customObjectTiles=Object.freeze({tree:[0,0],bench:[1,0],fountain:[2,0],lamp:[3,0],flowerbed:[0,1],kiosk:[1,1],palm:[2,1],beach_chair:[3,1],club_table:[0,2],dj_booth:[1,2],sofa:[2,2],plant:[3,2]});
 customObjectAtlas.decoding="async";
 function drawPlanetObjects(){
  const scene=root.querySelector(".nx-scene");if(!scene)return;
  let canvas=scene.querySelector(".nx-custom-objects-canvas");
  if(!canvas){canvas=document.createElement("canvas");canvas.className="nx-custom-objects-canvas";canvas.setAttribute("aria-hidden","true");scene.append(canvas)}
  const rect=scene.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
  if(!rect.width||!rect.height)return;
  canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);
  canvas.style.width=rect.width+"px";canvas.style.height=rect.height+"px";
  const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);
  const items=planetObjects.slice().sort((a,b)=>Number(a.y)-Number(b.y));
  for(const item of items){
   const tile=customObjectTiles[item.code],x=Number(item.x)*rect.width,y=Number(item.y)*rect.height;
   const scale=Math.max(.5,Math.min(2,Number(item.scale)||1)),size=78*scale;
   ctx.save();ctx.translate(x,y);ctx.rotate((Number(item.rotation)||0)*Math.PI/180);
   ctx.fillStyle="rgba(5,10,28,.24)";ctx.beginPath();ctx.ellipse(0,2,size*.39,size*.09,0,0,Math.PI*2);ctx.fill();
   if(tile&&customObjectAtlas.complete&&customObjectAtlas.naturalWidth)ctx.drawImage(customObjectAtlas,tile[0]*256,tile[1]*256,256,256,-size*.5,-size*.91,size,size);
   else{ctx.fillStyle="#8c8bd8";ctx.strokeStyle="#e1dcff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-size*.38,size*.22,0,Math.PI*2);ctx.fill();ctx.stroke()}
   ctx.restore();
  }
 }
 async function loadPlanetObjects(planet){
  planetObjects=[];
  if(!planet?.slug?.startsWith("custom-")){drawPlanetObjects();return}
  try{const result=await api("/api/game/planets/"+encodeURIComponent(planet.slug)+"/objects");if(activePlanet!==planet.slug)return;planetObjects=result.objects||[]}
  catch{planetObjects=[]}
  drawPlanetObjects();
 }
 customObjectAtlas.onload=drawPlanetObjects;
 customObjectAtlas.src="/assets/sprites/props/nexora-world-props-atlas.svg";
 window.addEventListener("resize",drawPlanetObjects);
 function cosmetics(look={}){const raw=Array.isArray(look.accessories)?look.accessories:String(look.accessories||"").split(",");const items=raw.map(x=>String(x).trim()).filter(Boolean).slice(0,3);if(look.wings)items.unshift("Крылья");if(look.halo)items.unshift("Ореол");return items.length?'<div class="nx-avatar-accessories">'+items.map(x=>'<span>'+esc(x)+'</span>').join("")+'</div>':""}
 function addEvent(message,kind="info"){const box=document.getElementById("nx-event-list");if(!box)return;const row=document.createElement("div");row.className="nx-event-item nx-event-"+kind;const stamp=document.createElement("time");stamp.textContent=new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});const body=document.createElement("span");body.textContent=message;row.append(stamp,body);box.prepend(row);while(box.children.length>18)box.lastElementChild.remove();const summary=document.getElementById("nx-system-message");if(summary)summary.textContent=message}
 function animatePortal(username,action){
  const name=String(username||"");
  const card=[...document.querySelectorAll("#nx-avatars .nx-avatar-card")].find(node=>node.dataset.playerUsername===name);
  if(!card)return;
  card.classList.remove("nx-portal-arriving","nx-portal-leaving");
  const fx=card.querySelector(".nx-avatar-portal-fx");if(fx)fx.remove();
  void card.offsetWidth;
  card.classList.add(action==="leaving"?"nx-portal-leaving":"nx-portal-arriving");
  const portal=document.createElement("span");portal.className="nx-avatar-portal-fx";portal.setAttribute("aria-hidden","true");card.append(portal);
  window.setTimeout(()=>{card.classList.remove("nx-portal-arriving","nx-portal-leaving");portal.remove()},1050);
 }
 function waitForRoomJoin(roomId,timeout=8000){
  if(!roomId||window.nexoraActiveRoom===roomId)return Promise.resolve(true);
  return new Promise(resolve=>{
   let settled=false;
   const finish=value=>{if(settled)return;settled=true;window.removeEventListener("nexora:room-joined",onJoined);clearTimeout(timer);resolve(value)};
   const onJoined=event=>{if(event.detail?.roomId===roomId)finish(true)};
   const timer=window.setTimeout(()=>finish(false),timeout);
   window.addEventListener("nexora:room-joined",onJoined);
  });
 }
 function getFavorites(){try{return JSON.parse(localStorage.getItem("nexora_favorites")||"[]")}catch{return[]}}
 function saveFavorites(items){localStorage.setItem("nexora_favorites",JSON.stringify(items))}
 function renderFavorites(){const box=document.getElementById("nx-favorites-list");if(!box)return;const items=getFavorites();box.innerHTML=items.length?items.map(x=>'<div class="nx-favorite-row"><span>'+esc(x.name)+'</span><button type="button" data-remove-fav="'+esc(x.key)+'">Убрать</button></div>').join(""):'Список избранного пуст.';box.querySelectorAll("[data-remove-fav]").forEach(b=>b.onclick=()=>{saveFavorites(getFavorites().filter(x=>x.key!==b.dataset.removeFav));renderFavorites();renderPlayers(lastPlayers)})}
 let lastPlayers=[];
 function renderPlayers(users=[]){
  lastPlayers=users.slice(0,14);const stage=document.getElementById("nx-avatars");if(!stage)return;
  const all=lastPlayers.slice();if(!all.some(u=>u.is_me))all.unshift({username:"you",character_name:meName,character_appearance:meAppearance,character_aura:meAura,is_me:true});
  const favorites=getFavorites();
  stage.innerHTML=all.map(u=>{
   const key=String(u.character_id||u.id||u.username||u.character_name||"player");
   const name=u.character_name||u.username||"Игрок";
   const fav=favorites.some(x=>x.key===key),aura=u.character_aura||"none";
   const rank=(aura&&aura!=="none")?'<span class="nx-rank-mark" aria-hidden="true">'+(aura==="angel"?"✧":aura==="god"?"☼":aura==="almighty"?"♛":aura==="universe"?"✹":"★")+'</span>':"";
   return '<div class="nx-avatar-card aura-'+esc(aura)+' '+(u.is_me?"me":"")+'" data-player-key="'+esc(key)+'" data-player-username="'+esc(u.username||"")+'" data-player-user-id="'+esc(u.user_id||"")+'">'+
    '<div class="nx-avatar-visual">'+rank+avatar(u.character_appearance||{})+cosmetics(u.character_appearance||{})+'</div>'+
    '<button type="button" class="nx-fav-toggle '+(fav?"is-favorite":"")+'" data-favorite="'+esc(key)+'" data-favorite-name="'+esc(name)+'" title="Добавить в избранное" aria-label="Добавить в избранное">'+(fav?"★":"☆")+'</button>'+
    '<div class="nx-avatar-name" title="'+esc(name)+'">'+(u.is_me?"♛ ":"")+esc(name)+'</div></div>';
  }).join("");
  if(window.NexoraSpriteAvatar)window.NexoraSpriteAvatar.mountAll(stage);
  stage.querySelectorAll("[data-favorite]").forEach(b=>b.onclick=e=>{
   e.stopPropagation();const key=b.dataset.favorite,name=b.dataset.favoriteName,items=getFavorites(),exists=items.some(x=>x.key===key);
   saveFavorites(exists?items.filter(x=>x.key!==key):items.concat([{key,name}]));renderPlayers(lastPlayers);renderFavorites();
  });
  const count=users.length;
  document.getElementById("nx-online").textContent="Игроков: "+count;
  document.getElementById("nx-event-online").textContent="● "+count+" игроков";
  document.getElementById("nx-player-list").innerHTML='<h4>В комнате:</h4>'+all.map(u=>'<div class="nx-player">'+avatar(u.character_appearance||{},true)+'<span>'+esc(u.character_name||u.username)+'</span></div>').join("");
  if(window.NexoraSpriteAvatar)window.NexoraSpriteAvatar.mountAll(document.getElementById("nx-player-list"));
 } function appendMessage(m){
  const log=document.getElementById("nx-chat-log");if(!log)return;
  const line=document.createElement("div");line.className="nx-chat-line";
  const time=new Date(m.created_at||Date.now()).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
  const name=document.createElement("b");name.textContent=(m.character_name||m.username||"Игрок")+": ";
  const body=document.createElement("span");body.textContent=m.body||"";
  const stamp=document.createElement("small");stamp.textContent=time;
  line.append(stamp,name,body);log.append(line);log.scrollTo({top:log.scrollHeight,behavior:"smooth"});
  if(!m.system)showChatBubble(m);
 }
 function layout(){
  root.innerHTML='<div class="nx-world nx-classic"><header class="nx-topbar"><div class="nx-logo">✦ NEXORA</div><div class="nx-current-planet"><small>ПЛАНЕТА</small><b id="nx-top-planet">Новички*1</b></div><div class="nx-clock" id="nx-clock">--:--</div><button type="button" class="nx-menu-trigger" data-nx="menu" aria-label="Открыть меню">☰ <span>Меню</span></button><div class="nx-account"><span id="nx-greeting"></span><div id="nx-account-actions"></div></div></header><div class="nx-planet-tools"><input class="nx-planet-select" id="nx-planet-search" list="nx-planet-options" placeholder="Название планеты для перелёта"><datalist id="nx-planet-options"></datalist><select class="nx-room-select" id="nx-room-select" aria-label="Выбрать комнату"><option value="">Комнаты…</option></select><button class="nx-small-btn" id="nx-refresh" type="button" title="Обновить">↻</button><span class="nx-online" id="nx-online">Игроков: —</span></div><section class="nx-chat-panel"><div class="nx-chat-title"><span id="nx-chat-title">Общий чат планеты</span><span class="nx-chat-hint">Публичная комната</span></div><div class="nx-chat-log" id="nx-chat-log" aria-live="polite"></div><form class="nx-chat-send" id="nx-chat-form"><input class="field" name="body" maxlength="1000" placeholder="Введите сообщение..." autocomplete="off"><button type="submit">Отправить</button></form></section><div class="nx-eventbar"><span class="nx-event-online" id="nx-event-online">● 0 игроков</span><span>✉ <b>Почта</b></span><span>♢ <b>Уведомления</b></span><span class="nx-event-status"><i class="nx-dot"></i><span id="nx-status">Соединение: готово</span></span><span class="nx-event-system" id="nx-system-message">Добро пожаловать в NEXORA</span><button type="button" class="nx-events-toggle" id="nx-events-toggle">События ▾</button></div><aside class="nx-events-panel" id="nx-events-panel" hidden><div class="nx-menu-heading">Лента событий <button type="button" id="nx-events-close">×</button></div><div id="nx-event-list" aria-live="polite"><div class="nx-event-item"><time>—</time><span>Добро пожаловать в NEXORA</span></div></div></aside><section class="nx-scene"><div class="nx-planet"></div><div class="nx-scene-arch"></div><div class="nx-scene-label" id="nx-room-label">🪐 Выбери комнату</div><div class="nx-scene-meta" id="nx-scene-meta"></div><div class="nx-avatars" id="nx-avatars"></div><div class="nx-action-bar" aria-label="Действия персонажа"><button type="button" data-avatar-action="idle">Стоять</button><button type="button" data-avatar-action="dance">Танец</button><button type="button" data-avatar-action="happy">Радость</button><button type="button" data-avatar-action="wave">Привет</button><button type="button" data-avatar-action="heart">Сердце</button></div><div class="nx-floor"></div><aside class="nx-player-list" id="nx-player-list"><h4>В комнате:</h4></aside></section><nav class="nx-bottom-nav"><button type="button" data-nx="menu"><span>☰</span>Меню</button><button type="button" data-tab="characters"><span>♙</span>Персонаж</button><button type="button" data-nx="planets"><span>◎</span>Планеты</button><button type="button" data-tab="economy"><span>▣</span>Инвентарь</button><button type="button" data-tab="friends"><span>♟</span>Друзья</button><button type="button" data-nx="exit"><span>↪</span>Выход</button></nav><aside class="nx-menu-panel" id="nx-menu-panel" hidden><div class="nx-menu-heading">✦ Меню игры <button type="button" id="nx-menu-close">×</button></div><div class="nx-menu-subtitle">АККАУНТ</div><div class="nx-menu-grid nx-primary-menu"><button type="button" data-open-tab="profile"><span>♙</span>Мой профиль</button><button type="button" data-open-tab="characters"><span>♜</span>Персонажи</button><button type="button" data-open-tab="discover"><span>⌕</span>Поиск людей</button></div><div class="nx-menu-subtitle">ОБЩЕНИЕ</div><div class="nx-menu-grid"><button type="button" data-open-tab="friends"><span>♟</span>Друзья и заявки</button><button type="button" data-open-tab="messages"><span>✉</span>Личные сообщения</button><button type="button" data-open-tab="notifications"><span>♢</span>Уведомления</button><button type="button" id="nx-menu-social"><span>♡</span>Социальный центр</button><button type="button" id="nx-menu-favorites"><span>★</span>Избранные игроки</button></div><div class="nx-menu-subtitle">МИР И ВОЗМОЖНОСТИ</div><div class="nx-menu-grid"><button type="button" id="nx-menu-planets"><span>◎</span>Планеты и комнаты</button><button type="button" data-open-tab="clans"><span>⚑</span>Кланы</button><button type="button" data-open-tab="economy"><span>▣</span>Магазин и инвентарь</button><button type="button" data-open-tab="pets"><span>♧</span>Питомцы</button><button type="button" data-open-tab="blogs"><span>▤</span>Блоги</button><button type="button" data-open-tab="relationships"><span>♡</span>Отношения</button><button type="button" data-open-tab="rankings"><span>★</span>Рейтинги и достижения</button><button type="button" data-open-tab="admin" id="nx-menu-admin" hidden><span>🛡</span>Администрирование</button></div><div class="nx-menu-subtitle">НАСТРОЙКИ</div><div class="nx-menu-grid"><button type="button" id="nx-menu-settings"><span>⚙</span>Настройки мира</button><button type="button" id="nx-menu-help"><span>?</span>Помощь</button><button type="button" id="nx-menu-exit"><span>↪</span>Выйти</button></div></aside><aside class="nx-favorites-panel" id="nx-favorites-panel" hidden><div class="nx-menu-heading">★ Избранные игроки <button type="button" id="nx-favorites-close">×</button></div><div id="nx-favorites-list" class="nx-favorites-list">Нажми ★ у персонажа, чтобы добавить его сюда.</div></aside><aside class="nx-settings-panel" id="nx-settings-panel" hidden><div class="nx-menu-heading">⚙ Настройки <button type="button" id="nx-settings-close">×</button></div><label class="nx-setting-row"><span><b>Анимации персонажей</b><small>Движения и эмоции в комнате</small></span><input type="checkbox" id="nx-setting-animations" checked></label><label class="nx-setting-row"><span><b>Компактный интерфейс</b><small>Уменьшить отступы игрового экрана</small></span><input type="checkbox" id="nx-setting-compact"></label></aside><aside class="nx-help-panel" id="nx-help-panel" hidden><div class="nx-menu-heading">? Помощь <button type="button" id="nx-help-close">×</button></div><p>Выбери планету через поиск и нажми ◎. Сообщения отправляются в общий чат выбранной комнаты. Нажми ★ у персонажа, чтобы сохранить его в избранное. Нижнее меню открывает профиль, персонажей, магазин и друзей.</p></aside><div class="nx-statusbar"><span>© NEXORA</span><span>2D социальный мир</span><span id="nx-statusbar-time"></span></div></div>';
  const menu=document.getElementById("nx-menu-panel"),toggle=document.getElementById("nx-menu-toggle");
  const closeMenu=()=>{menu.hidden=true;if(toggle)toggle.setAttribute("aria-expanded","false")};
  const closePanels=()=>{menu.hidden=true;document.getElementById("nx-favorites-panel").hidden=true;document.getElementById("nx-help-panel").hidden=true;document.getElementById("nx-settings-panel").hidden=true};
  document.getElementById("nx-menu-close").onclick=closeMenu;
  document.getElementById("nx-menu-favorites").onclick=()=>{closeMenu();const panel=document.getElementById("nx-favorites-panel");panel.hidden=false;renderFavorites()};
  const socialButton=document.getElementById("nx-menu-social");
  if(socialButton)socialButton.onclick=()=>{closePanels();if(window.NexoraGalaxySocial)window.NexoraGalaxySocial.open("friends");else status("Социальный центр загружается.")};
  document.getElementById("nx-menu-planets").onclick=()=>{closeMenu();const input=document.getElementById("nx-planet-search");input.focus();input.scrollIntoView({block:"nearest",behavior:"smooth"})};
  document.getElementById("nx-menu-help").onclick=()=>{closePanels();document.getElementById("nx-help-panel").hidden=false};
   document.getElementById("nx-menu-settings").onclick=()=>{closePanels();document.getElementById("nx-settings-panel").hidden=false};
   document.getElementById("nx-settings-close").onclick=closePanels;
   const animationSetting=document.getElementById("nx-setting-animations"),compactSetting=document.getElementById("nx-setting-compact");
   animationSetting.checked=localStorage.getItem("nx-setting-animations")!=="off";compactSetting.checked=localStorage.getItem("nx-setting-compact")==="on";
   root.classList.toggle("nx-no-avatar-animations",!animationSetting.checked);root.classList.toggle("nx-compact",compactSetting.checked);
   animationSetting.onchange=()=>{localStorage.setItem("nx-setting-animations",animationSetting.checked?"on":"off");root.classList.toggle("nx-no-avatar-animations",!animationSetting.checked)};
   compactSetting.onchange=()=>{localStorage.setItem("nx-setting-compact",compactSetting.checked?"on":"off");root.classList.toggle("nx-compact",compactSetting.checked)};
  document.getElementById("nx-menu-exit").onclick=()=>{closeMenu();const out=document.getElementById("logout");if(out)out.click()};
  const menuButton=root.querySelector('[data-nx="menu"]');root.querySelectorAll('[data-nx="menu"]').forEach(button=>button.onclick=()=>{const open=menu.hidden;closePanels();menu.hidden=!open});
  root.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{if(typeof window.switchTab==="function"){window.switchTab(b.dataset.tab);closePanels()}}));
  root.querySelectorAll("[data-open-tab]").forEach(b=>b.addEventListener("click",()=>{if(typeof window.switchTab==="function"){closePanels();window.switchTab(b.dataset.openTab)}}));
  const greeting=document.getElementById("nx-greeting"),welcome=document.getElementById("welcome");if(greeting&&welcome)greeting.textContent=welcome.textContent;
  const actions=document.getElementById("nx-account-actions"),logout=document.getElementById("logout");if(actions&&logout&&!actions.contains(logout))actions.appendChild(logout);
  document.getElementById("nx-refresh").onclick=()=>refreshWorld();
  const roomSelect=document.getElementById("nx-room-select");roomSelect.onchange=()=>{const selected=rooms.find(x=>x.id===roomSelect.value);if(selected)join(selected)};
  const eventsPanel=document.getElementById("nx-events-panel");document.getElementById("nx-events-toggle").onclick=()=>{eventsPanel.hidden=!eventsPanel.hidden};document.getElementById("nx-events-close").onclick=()=>{eventsPanel.hidden=true};
  const planetGo=document.getElementById("nx-planet-go");if(planetGo)planetGo.onclick=()=>{const input=document.getElementById("nx-planet-search");if(input.value.trim())findPlanet();else input.focus()};
  document.getElementById("nx-planet-search").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();findPlanet()}});
  document.getElementById("nx-chat-form").onsubmit=e=>{e.preventDefault();const input=e.currentTarget.elements.body,body=input.value.trim();if(!body)return;if(window.NexoraAPI?.mockEnabled()){appendMessage({body,character_name:meName,created_at:new Date().toISOString()});if(body.startsWith("/"))appendMessage({body:"Демо-ответ бота. В рабочей комнате ответ придёт от серверного модуля.",character_name:"Магия",created_at:new Date().toISOString(),system:true});input.value="";return}if(!socket||socket.readyState!==WebSocket.OPEN)return status("Нет подключения к чату");socket.send(JSON.stringify({type:"room_message",body}));input.value=""};
  const favoritesToggle=document.getElementById("nx-favorites-toggle");if(favoritesToggle)favoritesToggle.onclick=()=>{const panel=document.getElementById("nx-favorites-panel");const open=panel.hidden;closePanels();panel.hidden=!open;renderFavorites()};
  document.getElementById("nx-favorites-close").onclick=()=>document.getElementById("nx-favorites-panel").hidden=true;
  const helpToggle=document.getElementById("nx-help-toggle");if(helpToggle)helpToggle.onclick=()=>{const panel=document.getElementById("nx-help-panel");const open=panel.hidden;closePanels();panel.hidden=!open};
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
   const inviteSlug=new URLSearchParams(location.search).get("planet");
   if(inviteSlug&&planets.some(item=>item.slug===inviteSlug)&&inviteSlug!==activePlanet){
    const cleanUrl=new URL(location.href);cleanUrl.searchParams.delete("planet");history.replaceState({}, "", cleanUrl.pathname+cleanUrl.search+cleanUrl.hash);
    await travel(inviteSlug);
   }
  }catch(e){status(e.message);if(window.toast)toast(e.message)}
 }
 async function travel(slug){
  if(travelInProgress)return false;
  travelInProgress=true;
  const overlay=document.getElementById("nx-flight-overlay");
  try{
   const planet=planets.find(p=>p.slug===slug);
   if(!planet)throw new Error("Планета не найдена. Введи её название.");
   if(slug===activePlanet){status("Ты уже на этой планете.");return false}
   if(overlay){overlay.hidden=false;overlay.classList.add("is-active");document.getElementById("nx-flight-label").textContent="Вылет на планету «"+planet.name+"»";await new Promise(r=>setTimeout(r,1150))}
   await api("/api/world/travel",{method:"POST",body:JSON.stringify({planetSlug:slug})});
   activePlanet=slug;
   try{const recent=JSON.parse(localStorage.getItem("nexora_recent_planets")||"[]");localStorage.setItem("nexora_recent_planets",JSON.stringify([slug,...recent.filter(x=>x!==slug)].slice(0,8)))}catch{}
   disconnect();
   addEvent("Ты покинул предыдущую планету и отправился на «"+planet.name+"».","leave");
   applyPlanetScene(planet);
   if(overlay)document.getElementById("nx-flight-label").textContent="Прибытие на «"+planet.name+"»";
   await loadRooms();
   const arrived=await waitForRoomJoin(activeRoom,8000);
   if(!arrived&&activeRoom)status("Планета загружена. Подключение к комнате продолжается…");
   else status("Перелёт завершён");
   return true;
  }catch(e){
   status(e.message);if(window.toast)toast(e.message);return false;
  }finally{
   if(overlay){overlay.classList.remove("is-active");overlay.hidden=true}
   travelInProgress=false;
  }
 }
 function travelToNextPlanet(){
  if(!planets.length)return status("Список планет пока пуст.");
  const index=planets.findIndex(p=>p.slug===activePlanet);
  const target=planets[(index+1+planets.length)%planets.length];
  if(!target||target.slug===activePlanet)return status("Других планет пока нет.");
  return travel(target.slug);
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
  if(window.NexoraAPI?.mockEnabled()){status("Демо-режим: тестовые данные. Мультиплеер отключён.");window.dispatchEvent(new CustomEvent("nexora:room-joined",{detail:{roomId:room.id}}));return;}
  const ws=new WebSocket(window.NexoraAPI?window.NexoraAPI.websocketUrl("/ws"):(location.protocol==="https:"?"wss:":"ws:")+"//"+location.host+"/ws");socket=ws;
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
   if(packet.type==="room_message"&&packet.message){appendMessage(packet.message);if(!packet.message.system)playGalaxyNotice();if(galaxyPrefs.system_messages||!packet.message.system)addEvent((packet.message.character_name||packet.message.username||"Игрок")+": "+packet.message.body,"chat")}
   if(packet.type==="planet_modules"){window.dispatchEvent(new CustomEvent("nexora:planet-modules",{detail:{modules:packet.modules||[],planetName:packet.planetName||""}}))}
   if(packet.type==="presence"&&packet.roomId===room.id){
    if(packet.action==="left"){
     if(galaxyPrefs.system_messages)addEvent((packet.username||"Игрок")+" улетел с планеты.","leave");
     animatePortal(packet.username,"leaving");
     if(galaxyPrefs.sound_enabled)playGalaxyNotice();
     window.setTimeout(()=>loadPresence(room.id),850);
    }else if(packet.action==="joined"){
     if(galaxyPrefs.system_messages)addEvent((packet.username||"Игрок")+" прилетел на планету.","join");
     if(galaxyPrefs.sound_enabled)playGalaxyNotice();
     loadPresence(room.id).then(()=>window.setTimeout(()=>animatePortal(packet.username,"arriving"),80));
    }
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
 
 function applyPlanetScene(p){if(!p)return;const scene=root.querySelector(".nx-scene");scene.dataset.theme=p.settings?.theme||"custom";const king=p.slug==="newbies-1"?"Король планеты пока неизвестен":(p.owner_name?"Король: "+p.owner_name:"Король: неизвестен");const meta=document.getElementById("nx-scene-meta");if(meta)meta.textContent=[king,p.settings?.interior,p.settings?.weather].filter(Boolean).join(" · ");document.getElementById("nx-room-label").textContent="🪐 "+p.name;const top=document.getElementById("nx-top-planet");if(top)top.textContent=p.name;loadPlanetObjects(p)}
 function findPlanet(){const q=document.getElementById("nx-planet-search").value.trim().toLocaleLowerCase("ru");if(!q)return status("Введи название планеты.");const p=planets.find(x=>x.slug===q||x.name.toLocaleLowerCase("ru")===q||x.name.toLocaleLowerCase("ru").includes(q));if(!p)return status("Планета не найдена.");travel(p.slug)}
 async function createPlanet(){if(window.NexoraExtras?.openPlanetModal){window.NexoraExtras.openPlanetModal(async payload=>{const d=await api("/api/game/planets",{method:"POST",body:JSON.stringify(payload)});status("Планета создана. Ты её король!");await refreshWorld();document.getElementById("nx-planet-search").value=d.planet.name;await travel(d.planet.slug);return d});return}status("Конструктор планеты ещё загружается.");}
 async function openAuras(){try{const d=await api("/api/game/auras");const chars=d.characters||[];const active=chars.find(c=>c.id===activeCharacterId)||chars[0];if(!active)return status("Сначала создай персонажа.");const options=[["none","Новичок",0],["angel","Ангел",50],["god",active.gender==="female"?"Богиня":"Бог",null],["almighty","Всемогущий",100],["universe",active.gender==="female"?"Мисс Вселенная":"Мистер Вселенный",200],["legend","Легенда",300]];const text=options.map(x=>x[1]+(x[2]===null?" (цена уточняется)":x[2]?" ("+x[2]+" coins)":" (без ауры)")).join("\n");const chosen=prompt("Ауры персонажа:\n"+text+"\n\nВведи: none, angel, almighty, universe или legend",active.aura||"none");if(!chosen)return;if(chosen==="god")return status("Цена Бога / Богини пока не установлена.");await api("/api/game/characters/"+active.id+"/aura",{method:"POST",body:JSON.stringify({aura:chosen.trim().toLowerCase()})});status("Аура обновлена.");await refreshWorld()}catch(e){status(e.message);if(window.toast)toast(e.message)}}

 window.addEventListener("nexora:galaxy-preferences",event=>{galaxyPrefs={...galaxyPrefs,...(event.detail||{})};const room=rooms.find(item=>item.id===activeRoom);if(room&&socket?.readyState===WebSocket.OPEN)join(room)});
 window.nexoraWorldRefresh=refreshWorld;window.nexoraTravelTo=travel;window.nexoraTravelToNextPlanet=travelToNextPlanet;
 window.nexoraWorldGetPlanets=()=>planets.slice();
 window.nexoraWorldTogglePlanetFavorite=async slug=>{
  const planet=planets.find(item=>item.slug===slug);if(!planet)throw new Error("Планета не найдена.");
  await api("/api/game/planet-favorites/"+encodeURIComponent(slug),{method:planet.is_favorite?"DELETE":"POST"});
  await refreshWorld();return !planet.is_favorite;
 };

 layout();const overlay=document.createElement("div");overlay.className="nx-flight-overlay";overlay.id="nx-flight-overlay";overlay.hidden=true;overlay.innerHTML="<div class=nx-flight-stars></div><div class=nx-flight-ship>🚀</div><b id=nx-flight-label>Перелёт между планетами</b>";root.querySelector(".nx-world").appendChild(overlay);refreshWorld();
})();
