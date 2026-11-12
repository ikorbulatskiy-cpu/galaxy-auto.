/* NEXORA 2D planet-room client. Uses existing authenticated game APIs and room WebSocket. */
(()=>{
 const root=document.getElementById("tab-world");if(!root)return;
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const api=async(url,options={})=>{const r=await fetch(url,{credentials:"same-origin",...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||"Ошибка "+r.status);return d};
 let planets=[],activePlanet="",activeRoom="",socket=null,meName="Ты",meAppearance={},poll=null;
 const palette={light:"#f2c9a5",medium:"#d49a6c",tan:"#a96e45",dark:"#68402f"};
 function avatar(look={},mini=false){
  const skin=palette[look.skinTone]||"#d49a6c";
  const hair=({black:"#211b28",brown:"#5b3825",blonde:"#f1cf73",red:"#b8463d",pink:"#ed72b2",blue:"#5f8de8",purple:"#9d68d3"})[look.hairColor]||"#302236";
  const clothes=({violet:"#8062d9",blue:"#477ed6",pink:"#dc6eaa",white:"#e6e9f2",green:"#4f9c77",gold:"#c99b3c"})[look.outfit]||"#8062d9";
  const hairPath=look.hair==="long"?"M14 32 Q12 2 40 3 Q69 2 66 32 L70 91 L58 85 L56 45 Q40 30 24 45 L22 85 L10 91 Z":look.hair==="curly"?"M14 32 Q8 9 25 9 Q35 -2 43 9 Q62 0 67 27 L60 43 Q40 27 22 43 Z":"M14 32 Q12 2 40 3 Q69 2 66 32 L58 43 Q40 28 22 43 Z";
  return '<svg viewBox="0 0 80 150" role="img" aria-label="2D персонаж"><ellipse cx="40" cy="145" rx="25" ry="4" fill="#17152b" opacity=".5"/><path d="M23 77 Q10 83 13 113 L21 114 L27 91 L29 121 L24 143 L35 143 L40 108 L46 143 L57 143 L51 119 L53 91 L60 114 L68 112 Q70 84 56 77 Z" fill="'+clothes+'" stroke="#272039" stroke-width="2"/><path d="M27 70 L27 81 Q40 91 53 81 L53 70" fill="'+skin+'"/><ellipse cx="40" cy="37" rx="25" ry="29" fill="'+skin+'" stroke="#573d46" stroke-width="1.5"/><path d="'+hairPath+'" fill="'+hair+'" stroke="#1e1827" stroke-width="2"/><ellipse cx="31" cy="39" rx="2.4" ry="3" fill="#342536"/><ellipse cx="49" cy="39" rx="2.4" ry="3" fill="#342536"/><path d="M34 52 Q40 57 46 52" fill="none" stroke="#9a515c" stroke-width="2" stroke-linecap="round"/><path d="M26 81 L16 109 M54 81 L64 109" stroke="'+skin+'" stroke-width="7" stroke-linecap="round"/><path d="M22 143 L35 143 M46 143 L59 143" stroke="#e9e4f7" stroke-width="7" stroke-linecap="round"/></svg>';
 }
 function renderPlayers(users=[]){
  const stage=document.getElementById("nx-avatars");if(!stage)return;
  const all=users.slice(0,14);
  if(!all.some(u=>u.is_me))all.unshift({username:"you",character_name:meName,character_appearance:meAppearance,is_me:true});
  stage.innerHTML=all.map(u=>'<div class="nx-avatar-card '+(u.is_me?"me":"")+'"><div class="nx-avatar-name">'+(u.is_me?"👑 ":"")+esc(u.character_name||u.username)+'</div>'+avatar(u.character_appearance||{})+'</div>').join("");
  document.getElementById("nx-online").textContent="Онлайн: "+users.length;
  document.getElementById("nx-player-list").innerHTML='<h4>В комнате:</h4>'+all.map(u=>'<div class="nx-player">'+avatar(u.character_appearance||{},true)+'<span>'+esc(u.character_name||u.username)+'</span></div>').join("");
 }
 function appendMessage(m){
  const log=document.getElementById("nx-chat-log");if(!log)return;
  const line=document.createElement("div");line.className="nx-chat-line";
  const time=new Date(m.created_at||Date.now()).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
  const name=document.createElement("b");name.textContent=(m.character_name||m.username||"Игрок")+": ";
  const body=document.createElement("span");body.textContent=m.body||"";
  const stamp=document.createElement("small");stamp.textContent=time;
  line.append(stamp,name,body);log.append(line);log.scrollTop=log.scrollHeight;
 }
 function layout(){
  root.innerHTML='<div class="nx-world"><header class="nx-topbar"><div class="nx-logo">✦ NEXORA</div><select class="nx-planet-select" id="nx-planet"><option>Загрузка планет…</option></select><div class="nx-account"><span id="nx-greeting"></span><div id="nx-account-actions"></div></div><div class="nx-online" id="nx-online">Онлайн: —</div><button class="nx-icon-btn" id="nx-menu-toggle" aria-expanded="false">☰ Меню</button><button class="nx-icon-btn" id="nx-refresh" title="Обновить">↻</button></header><div class="nx-chat-layout"><section class="nx-chat-panel"><div class="nx-chat-title" id="nx-chat-title">Общий чат планеты</div><div class="nx-chat-log" id="nx-chat-log" aria-live="polite"></div><form class="nx-chat-send" id="nx-chat-form"><input class="field" name="body" maxlength="1000" placeholder="Написать сообщение…" autocomplete="off"><button>➤</button></form></section><aside class="nx-player-list" id="nx-player-list"><h4>В комнате:</h4></aside></div><section class="nx-scene"><div class="nx-planet"></div><div class="nx-scene-arch"></div><div class="nx-scene-label" id="nx-room-label">🪐 Выбери комнату</div><div class="nx-avatars" id="nx-avatars"></div><div class="nx-floor"></div></section><nav class="nx-bottom-nav"><button data-nx="menu"><span>⌂</span>Меню</button><button data-nx="action"><span>⭐</span>Действие</button><button data-nx="planets"><span>🌍</span>Планеты</button><button data-nx="friends"><span>👥</span>Друзья</button><button data-nx="gifts"><span>🎁</span>Подарки</button><button data-nx="exit"><span>⇥</span>Выход</button></nav><aside class="nx-menu-panel" id="nx-menu-panel" hidden><div class="nx-menu-heading">✦ Мир NEXORA <button type="button" id="nx-menu-close">×</button></div><div class="nx-menu-grid"><button type="button" data-tab="profile"><span>👤</span>Мой профиль</button><button type="button" data-tab="discover"><span>⌕</span>Поиск людей</button><button type="button" data-tab="friends"><span>👥</span>Друзья</button><button type="button" data-tab="messages"><span>💬</span>Сообщения</button><button type="button" data-tab="characters"><span>🎭</span>Персонажи</button><button type="button" data-tab="notifications"><span>🔔</span>Уведомления</button><button type="button" data-tab="clans"><span>⚑</span>Кланы</button><button type="button" data-tab="economy"><span>🛍</span>Магазин</button><button type="button" data-tab="pets"><span>🐾</span>Питомцы</button><button type="button" data-tab="blogs"><span>📝</span>Блоги</button><button type="button" data-tab="relationships"><span>💞</span>Отношения</button><button type="button" data-tab="rankings"><span>🏆</span>Рейтинги</button></div></aside><div class="nx-statusbar"><i class="nx-dot"></i><span id="nx-status">Соединение: готово</span><span style="margin-left:auto">NEXORA · виртуальный мир</span></div></div>';
  const menu=document.getElementById("nx-menu-panel");const toggle=document.getElementById("nx-menu-toggle");const closeMenu=()=>{menu.hidden=true;toggle.setAttribute("aria-expanded","false")};toggle.onclick=()=>{menu.hidden=!menu.hidden;toggle.setAttribute("aria-expanded",String(!menu.hidden))};document.getElementById("nx-menu-close").onclick=closeMenu;root.addEventListener("click",e=>{const b=e.target.closest("[data-tab]");if(b&&typeof window.switchTab==="function"){window.switchTab(b.dataset.tab);closeMenu()}});const greeting=document.getElementById("nx-greeting");const welcome=document.getElementById("welcome");if(greeting&&welcome)greeting.textContent=welcome.textContent;const actions=document.getElementById("nx-account-actions");const logout=document.getElementById("logout");if(actions&&logout&&!actions.contains(logout))actions.appendChild(logout);document.getElementById("nx-refresh").onclick=()=>refreshWorld();
  document.getElementById("nx-planet").onchange=e=>travel(e.target.value);
  document.getElementById("nx-chat-form").onsubmit=e=>{e.preventDefault();const input=e.currentTarget.elements.body;const body=input.value.trim();if(!body)return;if(!socket||socket.readyState!==WebSocket.OPEN)return status("Нет подключения к чату");socket.send(JSON.stringify({type:"room_message",body}));input.value=""};
  root.querySelectorAll("[data-nx]").forEach(b=>b.onclick=()=>{const action=b.dataset.nx;if(action==="exit"){if(typeof switchTab==="function")switchTab("profile")}else if(action==="planets"){document.getElementById("nx-planet").focus()}else if(action==="action"){const me=root.querySelector(".nx-avatar-card.me");if(me){me.classList.remove("nx-emote");void me.offsetWidth;me.classList.add("nx-emote")}status("Персонаж выполнил действие")}else if(action==="friends"&&typeof switchTab==="function")switchTab("friends");else if(action==="gifts"&&typeof switchTab==="function")switchTab("economy");else if(action==="menu"){const panel=document.getElementById("nx-menu-panel");const toggle=document.getElementById("nx-menu-toggle");panel.hidden=!panel.hidden;toggle.setAttribute("aria-expanded",String(!panel.hidden))}});
  renderPlayers([]);
 }
 function status(s){const el=document.getElementById("nx-status");if(el)el.textContent=s}
 async function refreshWorld(){
  try{
   const [p,c]=await Promise.all([api("/api/game/planets"),api("/api/game/characters")]);
   planets=p.planets||[];const active=c.characters?.find(x=>x.is_active)||c.characters?.[0];if(active){meName=active.name;meAppearance=active.appearance||{}}
   const current=planets.find(x=>x.is_current)||planets[0];activePlanet=current?.slug||"";
   const select=document.getElementById("nx-planet");select.innerHTML=planets.map(x=>'<option value="'+esc(x.slug)+'">'+esc(x.name)+' · '+Number(x.online||0)+' онлайн</option>').join("");select.value=activePlanet;
   await loadRooms();
  }catch(e){status(e.message);if(window.toast)toast(e.message)}
 }
 async function travel(slug){
  try{await api("/api/world/travel",{method:"POST",body:JSON.stringify({planetSlug:slug})});activePlanet=slug;disconnect();await loadRooms();status("Перелёт завершён")}catch(e){status(e.message);if(window.toast)toast(e.message)}
 }
 async function loadRooms(){
  try{
   const d=await api("/api/game/rooms?planet="+encodeURIComponent(activePlanet));
   const rooms=d.rooms||[];if(!rooms.length){status("На этой планете пока нет комнат");document.getElementById("nx-room-label").textContent="🪐 Комнат пока нет";return}
   const old=activeRoom;const room=rooms.find(x=>x.id===old)||rooms[0];await join(room);
  }catch(e){status(e.message);document.getElementById("nx-room-label").textContent="Выбери доступную планету"}
 }
 function disconnect(){if(poll)clearInterval(poll);poll=null;if(socket){socket.onclose=null;socket.close();socket=null}activeRoom=""}
 async function join(room){
  disconnect();activeRoom=room.id;document.getElementById("nx-room-label").textContent="🪐 "+room.name;document.getElementById("nx-chat-title").textContent="Общий чат · "+room.name;document.getElementById("nx-chat-log").innerHTML="";status("Подключение к комнате…");
  try{
   const [m,p]=await Promise.all([api("/api/game/rooms/"+room.id+"/messages"),api("/api/game/rooms/"+room.id+"/presence")]);
   (m.messages||[]).forEach(appendMessage);renderPlayers(p.users||[]);
   const ws=location.protocol==="https:"?"wss:":"ws:";socket=new WebSocket(ws+"//"+location.host+"/ws");
   socket.onopen=()=>socket.send(JSON.stringify({type:"join_room",roomId:room.id}));
   socket.onmessage=e=>{let packet;try{packet=JSON.parse(e.data)}catch{return}if(packet.type==="joined_room")status("Соединение: отличное");if(packet.type==="room_message"&&packet.message)appendMessage(packet.message);if(packet.type==="presence")loadPresence(room.id);if(packet.type==="error")status(packet.message)};
   socket.onclose=()=>{if(activeRoom===room.id)status("Связь с комнатой потеряна")};
   poll=setInterval(()=>loadPresence(room.id),25000);
  }catch(e){status(e.message)}
 }
 async function loadPresence(id){try{const p=await api("/api/game/rooms/"+id+"/presence");if(activeRoom===id)renderPlayers(p.users||[])}catch{}}
 window.nexoraWorldRefresh=refreshWorld;
 layout();refreshWorld();
})();
