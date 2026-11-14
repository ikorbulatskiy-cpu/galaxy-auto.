(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 const state={lastMessageId:0,poll:null,clockTimer:null};
 function updateVisitorClock(){
  const clock=$("visitor-clock");
  if(!clock)return;
  try{clock.textContent=new Intl.DateTimeFormat(undefined,{hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date());}
  catch{clock.textContent=new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});}
 }
 const room=$("room-screen");

 const rankRows=[["Новичок","0","—"],["Бывалый","1","✦"],["Уважаемый","2","✦✦"],["Мастер","3","✦✦✦"],["Профессионал","4","✦✦✦✦"],["Гуру","5–9","✦"],["Неприкасаемый","10–19","✦✦"],["Папа / Мама","20–99","✦✦"],["Ангел Галактики","100–199","✦✦✦✦"],["Бог / Богиня Галактики","200–999","✦✦✦✦✦"],["Всемогущий","1000–1999","✦✦✦✦✦✦"],["Mister / Miss Вселенная","2000–9999","✦✦✦✦✦✦"],["Легенда Галактики","10000–19999","✦✦✦✦✦✦✦"],["Премьер Галактики","20000–49999","✦✦✦✦✦✦✦"],["Император Галактики","50000+","✦✦✦✦✦✦✦"]];
 const auraNames={none:"Без ауры",violet:"Фиолетовая",silver:"Серебряная",rose:"Розовая",blue:"Синяя",red:"Красная",ember:"Огненная",purple:"Пурпурная",green:"Зелёная",gold:"Золотая",diamond:"Алмазная"};
 let avatar={headId:1,bodyId:1,outfitId:0};
 function ensureAvatarEditor(){
  if($("nexora-world-avatar"))return;
  const scene=$("room-scene");
  scene.insertAdjacentHTML("beforeend",'<div id="nexora-world-avatar" class="nexora-world-avatar aura-none" role="button" tabindex="0" aria-label="Открыть информацию о персонаже" aria-expanded="false"><svg viewBox="0 0 128 128"><use id="nexora-world-body" href="/assets/sprites/characters/nexora-customization-atlas.svg#body-1" x="32" y="18" width="64" height="104"></use><use id="nexora-world-head" href="/assets/sprites/characters/nexora-customization-atlas.svg#head-1" x="32" y="18" width="64" height="64"></use><use id="nexora-world-outfit" href="" x="0" y="0" width="128" height="128"></use></svg><div id="nexora-world-rank" class="nexora-world-rank">Новичок ✦</div></div><section id="nexora-avatar-panel" class="nexora-avatar-panel hidden" aria-label="Персонаж и авторитет"><button id="nexora-avatar-close" class="nexora-avatar-close">×</button><header class="nexora-rank-head"><div id="nexora-profile-avatar" class="nexora-profile-avatar aura-none"><svg viewBox="0 0 128 128"><use id="nexora-profile-body" href="/assets/sprites/characters/nexora-customization-atlas.svg#body-1" x="32" y="18" width="64" height="104"></use><use id="nexora-profile-head" href="/assets/sprites/characters/nexora-customization-atlas.svg#head-1" x="32" y="18" width="64" height="64"></use><use id="nexora-profile-outfit" href="" x="0" y="0" width="128" height="128"></use></svg></div><div class="nexora-aura-preview" id="nexora-aura-preview">✦</div><div><small>ТВОЙ АВТОРИТЕТ</small><h2 id="nexora-rank-title">Новичок</h2><span id="nexora-authority-count">0 очков</span></div></header><div class="nexora-progress"><i id="nexora-authority-progress"></i></div><div class="nexora-rank-sub" id="nexora-rank-next">Следующее звание: Бывалый</div><div class="nexora-tabs"><button class="active" data-tab="heads">Головы</button><button data-tab="bodies">Костюмы</button><button data-tab="emperor">Император</button><button data-tab="ranks">Ранги</button></div><div id="nexora-avatar-content" class="nexora-avatar-content"></div><button id="nexora-avatar-save" class="nexora-avatar-save">Сохранить внешний вид</button><p id="nexora-avatar-note" role="status"></p></section>');
  const worldAvatar=$("nexora-world-avatar");
  const toggleProfile=()=>{if($("nexora-avatar-panel").classList.contains("hidden"))openAvatar();else closeAvatar();};
  worldAvatar.addEventListener("click",toggleProfile);
  worldAvatar.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();toggleProfile();}});
  $("nexora-avatar-close").addEventListener("click",closeAvatar);
  $("nexora-avatar-save").addEventListener("click",saveAvatar);
  document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>showAvatarTab(b.dataset.tab)));
 }
 function closeAvatar(){$("nexora-avatar-panel").classList.add("hidden");const a=$("nexora-world-avatar");if(a)a.setAttribute("aria-expanded","false");}
 async function openAvatar(){
  ensureAvatarEditor();$("nexora-avatar-panel").classList.remove("hidden");const worldAvatar=$("nexora-world-avatar");if(worldAvatar)worldAvatar.setAttribute("aria-expanded","true");
  try{const r=await fetch("/api/account/profile");if(!r.ok)throw Error("Не удалось загрузить профиль");const d=await r.json();if(d.character){avatar.headId=Number(d.character.head_id)||1;avatar.bodyId=Number(d.character.body_id)||1;avatar.outfitId=Number(d.character.outfit_id)||0;renderAuthority(d.character);}showAvatarTab("heads");}
  catch(e){$("nexora-avatar-note").textContent=e.message;}
 }
 function renderAuthority(c){
  const points=Number(c.authority_points)||0,rank=c.authority_title||"Новичок",aura=c.aura||"none";
  const rankLabel=$("nexora-world-rank");if(rankLabel)rankLabel.textContent=rank+" "+("✦".repeat(Number(c.authority_stars)||0));const profileAvatar=$("nexora-profile-avatar");if(profileAvatar)profileAvatar.className="nexora-profile-avatar aura-"+aura;
  $("nexora-rank-title").textContent=rank+" "+("✦".repeat(Number(c.authority_stars)||0));$("nexora-world-avatar").className="nexora-world-avatar aura-"+aura;$("nexora-authority-count").textContent=points+" очков авторитета";
  $("nexora-aura-preview").className="nexora-aura-preview aura-"+aura;$("nexora-aura-preview").textContent="✦";
  const current=rankRows.findIndex(x=>x[0]===rank),next=rankRows[Math.min(rankRows.length-1,current+1)];
  const currentMin=Number(c.rank_min_points)||0,nextMin=next?Number(next[1].split(/[–+]/)[0]):currentMin;
  const progress=next&&nextMin>currentMin?Math.max(0,Math.min(100,(points-currentMin)/(nextMin-currentMin)*100)):100;
  $("nexora-authority-progress").style.width=progress+"%";
  $("nexora-rank-next").textContent=next?"Аура: "+(auraNames[aura]||"Особая")+" · Следующее звание: "+next[0]:"Высшее звание достигнуто";
 }
 function showAvatarTab(tab){
  [["nexora-world-body","nexora-profile-body","body",avatar.bodyId],["nexora-world-head","nexora-profile-head","head",avatar.headId]].forEach(([worldId,profileId,kind,id])=>{[worldId,profileId].forEach(target=>{const node=$(target);if(node)node.setAttribute("href","/assets/sprites/characters/nexora-customization-atlas.svg#"+kind+"-"+id);});});["nexora-world-outfit","nexora-profile-outfit"].forEach(target=>{const node=$(target);if(node)node.setAttribute("href",avatar.outfitId?"/assets/sprites/characters/nexora-emperor-set.svg#emperor-set":"");});
  document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  const box=$("nexora-avatar-content");
  if(tab==="emperor"){box.innerHTML='<div class="nexora-emperor-card"><div class="nexora-emperor-art"><svg viewBox="0 0 128 128"><use href="/assets/sprites/characters/nexora-emperor-set.svg#emperor-set"></use></svg></div><b>Император Галактики</b><span>Капюшон · мантия · коса · фиолетовая аура</span><button type="button" data-emperor="1">Надеть комплект</button><button type="button" data-emperor="0">Снять комплект</button></div>';box.querySelectorAll("[data-emperor]").forEach(b=>b.addEventListener("click",()=>{avatar.outfitId=Number(b.dataset.emperor);showAvatarTab("emperor");}));return;}
  if(tab==="ranks"){box.innerHTML='<div class="nexora-rank-table">'+rankRows.map((r,i)=>'<div class="nexora-rank-row"><b>'+r[0]+'</b><span>'+r[1]+'</span><strong>'+r[2]+'</strong></div>').join("")+'</div>';return;}
  const isHead=tab==="heads",count=24,kind=isHead?"head":"body";
  box.innerHTML='<div class="nexora-choice-grid">'+Array.from({length:count},(_,i)=>'<button class="nexora-choice '+((isHead?avatar.headId:avatar.bodyId)===i+1?"selected":"")+'" data-choice="'+(i+1)+'" aria-label="'+(isHead?"Голова ":"Тело ")+(i+1)+'"><svg viewBox="0 0 64 '+(isHead?64:104)+'"><use href="/assets/sprites/characters/nexora-customization-atlas.svg#'+kind+'-'+(i+1)+'"></use></svg></button>').join("")+'</div>';
  box.querySelectorAll("[data-choice]").forEach(b=>b.addEventListener("click",()=>{const id=Number(b.dataset.choice);if(isHead)avatar.headId=id;else avatar.bodyId=id;showAvatarTab(tab);}));
 }
 async function saveAvatar(){
  const b=$("nexora-avatar-save"),note=$("nexora-avatar-note");b.disabled=true;note.textContent="";
  try{const r=await fetch("/api/character",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({headId:avatar.headId,bodyId:avatar.bodyId,outfitId:avatar.outfitId})});const d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось сохранить");note.textContent="Внешность сохранена!";const body=$("nexora-world-body"),head=$("nexora-world-head"),outfit=$("nexora-world-outfit");if(body)body.setAttribute("href","/assets/sprites/characters/nexora-customization-atlas.svg#body-"+avatar.bodyId);if(head)head.setAttribute("href","/assets/sprites/characters/nexora-customization-atlas.svg#head-"+avatar.headId);if(outfit)outfit.setAttribute("href",avatar.outfitId?"/assets/sprites/characters/nexora-emperor-set.svg#emperor-set":"");}catch(e){note.textContent=e.message;}finally{b.disabled=false;}
 }

 function showRoom(account){
  ensureAvatarEditor();
  $("intro-screen").classList.add("hidden");
  room.classList.remove("hidden");
  updateVisitorClock();
  if(state.clockTimer)clearInterval(state.clockTimer);
  state.clockTimer=setInterval(updateVisitorClock,15000);
  loadMessages(true);
  if(state.poll)clearInterval(state.poll);
  state.poll=setInterval(()=>loadMessages(false),2200);
 }
 function leaveRoom(){
  if(state.poll)clearInterval(state.poll);
  state.poll=null;
  if(state.clockTimer)clearInterval(state.clockTimer);
  state.clockTimer=null;
  room.classList.add("hidden");
  $("intro-screen").classList.remove("hidden");
 }
 async function loadMessages(initial){
  try{
   const response=await fetch("/api/room/messages?after="+(initial?0:state.lastMessageId));
   if(!response.ok)throw new Error("Chat unavailable");
   const data=await response.json();
   (data.messages||[]).forEach(addMessage);
  }catch{
   $("chat-error").textContent="Чат временно недоступен";
   setTimeout(()=>$("chat-error").textContent="",3000);
  }
 }
 function addMessage(message){
  if(!message||Number(message.id)<=state.lastMessageId)return;
  state.lastMessageId=Number(message.id);
  const list=$("room-screen").querySelector(".chat-space");
  const row=document.createElement("div");
  row.className="chat-line"+(message.mine?" mine":"");
  const name=document.createElement("b");
  name.textContent=message.nickname+":";
  const body=document.createElement("span");
  body.textContent=message.message;
  row.append(name,body);
  list.append(row);
  list.scrollTop=list.scrollHeight;
 }
 async function sendMessage(){
  const input=$("chatInput");
  const message=input.value.trim();
  if(!message)return;
  const button=$("send-chat");
  button.disabled=true;
  try{
   const response=await fetch("/api/room/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"Не удалось отправить сообщение");
   input.value="";
   addMessage(data.message);
  }catch(error){
   $("chat-error").textContent=error.message;
   setTimeout(()=>$("chat-error").textContent="",3500);
  }finally{
   button.disabled=false;
   input.focus();
  }
 }
 $("chat-form").addEventListener("submit",event=>{event.preventDefault();sendMessage();});
 window.NexoraRoom={show:showRoom,leave:leaveRoom};
})();