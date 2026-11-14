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

 const rankRows=[["Новичок","0","—"],["Бывалый","1","✦"],["Уважаемый","2","✦✦"],["Мастер","3","✦✦✦"],["Профессионал","4","✦✦✦✦"],["Гуру","5–9","✦"],["Неприкасаемый","10–19","✦✦"],["Папа / Мама","20–99","✦✦"],["Ангел Галактики","100–199","✦✦✦✦"],["Бог / Богиня Галактики","200–999","✦✦✦✦✦"],["Всемогущий","1000–1999","✦✦✦✦✦✦"],["Mister / Miss Вселенная","2000–9999","✦✦✦✦✦✦"],["Легенда Галактики","10000–19999","✦✦✦✦✦✦✦"],["Премьер Галактики","20000+","✦✦✦✦✦✦✦"]];
 const auraNames={none:"Без ауры",violet:"Фиолетовая",silver:"Серебряная",rose:"Розовая",blue:"Синяя",red:"Красная",ember:"Огненная",purple:"Пурпурная",green:"Зелёная",gold:"Золотая",diamond:"Алмазная"};
 let avatar={headId:1,bodyId:1};
 function ensureAvatarEditor(){
  if($("nexora-avatar-open"))return;
  const scene=$("room-scene");
  scene.insertAdjacentHTML("beforeend",'<div id="nexora-world-avatar" class="nexora-world-avatar aura-none"><svg viewBox="0 0 64 104"><use id="nexora-world-body" href="/assets/sprites/characters/nexora-customization-atlas.svg#body-1"></use><use id="nexora-world-head" href="/assets/sprites/characters/nexora-customization-atlas.svg#head-1"></use></svg></div><button id="nexora-avatar-open" class="nexora-avatar-open">✦ Персонаж</button><section id="nexora-avatar-panel" class="nexora-avatar-panel hidden" aria-label="Персонаж и авторитет"><button id="nexora-avatar-close" class="nexora-avatar-close">×</button><header class="nexora-rank-head"><div class="nexora-aura-preview" id="nexora-aura-preview">✦</div><div><small>ТВОЙ АВТОРИТЕТ</small><h2 id="nexora-rank-title">Новичок</h2><span id="nexora-authority-count">0 очков</span></div></header><div class="nexora-progress"><i id="nexora-authority-progress"></i></div><div class="nexora-rank-sub" id="nexora-rank-next">Следующее звание: Бывалый</div><div class="nexora-tabs"><button class="active" data-tab="heads">Головы</button><button data-tab="bodies">Тела</button><button data-tab="ranks">Звания</button></div><div id="nexora-avatar-content" class="nexora-avatar-content"></div><button id="nexora-avatar-save" class="nexora-avatar-save">Сохранить внешний вид</button><p id="nexora-avatar-note" role="status"></p></section>');
  $("nexora-avatar-open").addEventListener("click",openAvatar);
  $("nexora-avatar-close").addEventListener("click",()=> $("nexora-avatar-panel").classList.add("hidden"));
  $("nexora-avatar-save").addEventListener("click",saveAvatar);
  document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>showAvatarTab(b.dataset.tab)));
 }
 async function openAvatar(){
  ensureAvatarEditor();$("nexora-avatar-panel").classList.remove("hidden");
  try{const r=await fetch("/api/account/profile");if(!r.ok)throw Error("Не удалось загрузить профиль");const d=await r.json();if(d.character){avatar.headId=Number(d.character.head_id)||1;avatar.bodyId=Number(d.character.body_id)||1;renderAuthority(d.character);}showAvatarTab("heads");}
  catch(e){$("nexora-avatar-note").textContent=e.message;}
 }
 function renderAuthority(c){
  const points=Number(c.authority_points)||0,rank=c.authority_title||"Новичок",aura=c.aura||"none";
  $("nexora-rank-title").textContent=rank+" "+("✦".repeat(Number(c.authority_stars)||0));$("nexora-world-avatar").className="nexora-world-avatar aura-"+aura;$("nexora-authority-count").textContent=points+" очков авторитета";
  $("nexora-aura-preview").className="nexora-aura-preview aura-"+aura;$("nexora-aura-preview").textContent="✦";
  const current=rankRows.findIndex(x=>x[0]===rank),next=rankRows[Math.min(rankRows.length-1,current+1)];
  const currentMin=Number(c.rank_min_points)||0,nextMin=next?Number(next[1].split(/[–+]/)[0]):currentMin;
  const progress=next&&nextMin>currentMin?Math.max(0,Math.min(100,(points-currentMin)/(nextMin-currentMin)*100)):100;
  $("nexora-authority-progress").style.width=progress+"%";
  $("nexora-rank-next").textContent=next?"Аура: "+(auraNames[aura]||"Особая")+" · Следующее звание: "+next[0]:"Высшее звание достигнуто";
 }
 function showAvatarTab(tab){
  const body=$("nexora-world-body"),head=$("nexora-world-head");if(body)body.setAttribute("href","/assets/sprites/characters/nexora-customization-atlas.svg#body-"+avatar.bodyId);if(head)head.setAttribute("href","/assets/sprites/characters/nexora-customization-atlas.svg#head-"+avatar.headId);
  document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  const box=$("nexora-avatar-content");
  if(tab==="ranks"){box.innerHTML='<div class="nexora-rank-table">'+rankRows.map((r,i)=>'<div class="nexora-rank-row"><b>'+r[0]+'</b><span>'+r[1]+'</span><strong>'+r[2]+'</strong></div>').join("")+'</div>';return;}
  const isHead=tab==="heads",count=24,kind=isHead?"head":"body";
  box.innerHTML='<div class="nexora-choice-grid">'+Array.from({length:count},(_,i)=>'<button class="nexora-choice '+((isHead?avatar.headId:avatar.bodyId)===i+1?"selected":"")+'" data-choice="'+(i+1)+'" aria-label="'+(isHead?"Голова ":"Тело ")+(i+1)+'"><svg viewBox="0 0 64 '+(isHead?64:104)+'"><use href="/assets/sprites/characters/nexora-customization-atlas.svg#'+kind+'-'+(i+1)+'"></use></svg></button>').join("")+'</div>';
  box.querySelectorAll("[data-choice]").forEach(b=>b.addEventListener("click",()=>{const id=Number(b.dataset.choice);if(isHead)avatar.headId=id;else avatar.bodyId=id;showAvatarTab(tab);}));
 }
 async function saveAvatar(){
  const b=$("nexora-avatar-save"),note=$("nexora-avatar-note");b.disabled=true;note.textContent="";
  try{const r=await fetch("/api/character",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({headId:avatar.headId,bodyId:avatar.bodyId})});const d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось сохранить");note.textContent="Внешность сохранена!";const body=$("nexora-world-body"),head=$("nexora-world-head");if(body)body.setAttribute("href","/assets/sprites/characters/nexora-customization-atlas.svg#body-"+avatar.bodyId);if(head)head.setAttribute("href","/assets/sprites/characters/nexora-customization-atlas.svg#head-"+avatar.headId);}catch(e){note.textContent=e.message;}finally{b.disabled=false;}
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