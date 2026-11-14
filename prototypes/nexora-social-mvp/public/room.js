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
 let currentNickname="Персонаж";
 let demonAuraVisible=localStorage.getItem("nexora-demon-aura")!=="off";
 function applyDemonAura(){document.querySelectorAll(".nexora-demon-layers").forEach(node=>node.classList.toggle("aura-hidden",!demonAuraVisible));const button=$("nexora-aura-toggle");if(button){button.textContent=demonAuraVisible?"Скрыть ауру":"Показать ауру";button.setAttribute("aria-pressed",String(demonAuraVisible));}}
 function toggleDemonAura(){demonAuraVisible=!demonAuraVisible;localStorage.setItem("nexora-demon-aura",demonAuraVisible?"on":"off");applyDemonAura();}
 function ensureAvatarEditor(){
  if($("nexora-world-avatar"))return;
  const scene=$("room-scene");
  scene.insertAdjacentHTML("beforeend",'<div id="nexora-world-avatar" class="nexora-world-avatar aura-none" role="button" tabindex="0" aria-label="Открыть инфо" aria-expanded="false"><span class="nexora-demon-layers" aria-label="Основной персонаж"><img class="nexora-demon-body" src="/assets/sprites/characters/nexora-demon-body.webp" alt=""><img class="nexora-demon-aura" src="/assets/sprites/characters/nexora-demon-aura.webp" alt=""></span><div id="nexora-world-rank" class="nexora-world-rank">Персонаж</div></div><section id="nexora-avatar-panel" class="nexora-avatar-panel hidden" aria-label="Инфо" aria-modal="true" role="dialog"><div class="nexora-avatar-window"><header class="nexora-info-header"><span>ИНФО</span><button id="nexora-avatar-close" class="nexora-avatar-close" type="button" aria-label="Закрыть">×</button></header><div id="nexora-profile-loading" class="nexora-profile-loading" role="status"><i></i><b>Загружаем анкету…</b><span>Скорость зависит от интернет-соединения</span></div><div id="nexora-profile-error" class="nexora-profile-error hidden" role="alert"></div><form id="nexora-info-form" class="nexora-info-form hidden"><div class="nexora-classic-profile"><div class="nexora-classic-top"><label class="nexora-classic-photo"><img id="nexora-info-photo" alt="Твоё фото" src=""><span>＋ Фото</span><input id="nexora-info-photo-file" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="nexora-classic-facts"><div class="nexora-classic-planet">🌍 <strong id="nexora-info-planet">Земля</strong></div><label>💞 <input name="relationship" maxlength="80" placeholder="Отношения"></label><label>💎 <input name="privileges" maxlength="100" placeholder="Привилегии"></label><label>🧍 <input name="status" maxlength="100" placeholder="Статус"></label><label>🔎 <input name="lookingFor" maxlength="100" placeholder="Ищет…"></label></div></div><div class="nexora-classic-links"><span>Блог (0)</span><span>Фото (0)</span></div><label class="nexora-classic-ask">Спроси меня<input name="askMe" maxlength="300" placeholder="Напиши вопрос, на который готов ответить"></label><div class="nexora-classic-section">Анкета</div><div class="nexora-classic-questionnaire"><label>Пол<select name="gender"><option value="">Не указано</option><option value="Мужской">Мужской</option><option value="Женский">Женский</option><option value="Другое">Другое</option></select></label><label>🎂 Дата рождения<input name="birthDate" type="date" max="2100-12-31"></label><label class="wide">🌍 Город<input name="city" maxlength="80" placeholder="Твой город"></label><label class="wide">Род занятий<textarea name="occupation" maxlength="120" rows="2" placeholder="Чем занимаешься"></textarea></label><label class="wide">Интересы<textarea name="interests" maxlength="220" rows="2" placeholder="Спорт, музыка, путешествия…"></textarea></label><label class="wide">О себе<textarea name="about" maxlength="600" rows="3" placeholder="Расскажи немного о себе"></textarea></label></div></div><div class="nexora-info-actions"><button id="nexora-info-save" type="submit">Сохранить</button><span id="nexora-info-note" role="status"></span></div></form></div></section>');
  scene.insertAdjacentHTML("beforeend",'<section id="nexora-character-actions" class="nexora-character-actions hidden" role="dialog" aria-modal="true" aria-label="Действия"><div class="nexora-character-actions-card"><div class="nexora-character-actions-title">ДЕЙСТВИЯ</div><button id="nexora-action-info" type="button">Инфо</button><button id="nexora-action-emotions" type="button">Эмоции</button><button id="nexora-action-exit" type="button" class="secondary">Выход</button></div></section><section id="nexora-emotions-panel" class="nexora-emotions-panel hidden" role="dialog" aria-modal="true" aria-label="Эмоции"><div class="nexora-emotions-window"><header>Эмоции<button id="nexora-emotions-close" type="button" aria-label="Закрыть">×</button></header><div class="nexora-emotions-list" id="nexora-emotions-list"></div></div></section>');
  applyDemonAura();
  const worldAvatar=$("nexora-world-avatar");
  worldAvatar.setAttribute("aria-label","Открыть действия персонажа");
  worldAvatar.addEventListener("click",openCharacterActions);
  worldAvatar.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openCharacterActions();}});
  $("nexora-action-info").addEventListener("click",()=>{closeCharacterActions();openAvatar();});
  $("nexora-action-emotions").addEventListener("click",openEmotions);
  $("nexora-action-exit").addEventListener("click",closeCharacterActions);
  $("nexora-emotions-close").addEventListener("click",closeEmotions);
  $("nexora-emotions-panel").addEventListener("click",event=>{if(event.target===$("nexora-emotions-panel"))closeEmotions();});
  buildEmotionOptions();
  $("nexora-character-actions").addEventListener("click",event=>{if(event.target===$("nexora-character-actions"))closeCharacterActions();});
  $("nexora-avatar-close").addEventListener("click",closeAvatar);
  $("nexora-avatar-panel").addEventListener("click",event=>{if(event.target===$("nexora-avatar-panel"))closeAvatar();});
  $("nexora-info-form").addEventListener("submit",saveCharacterInfo);
  $("nexora-info-photo-file").addEventListener("change",previewCharacterPhoto);
  document.addEventListener("keydown",event=>{if(event.key==="Escape"){closeAvatar();closeCharacterActions();closeEmotions();}});
 }
 const characterEmotions=[["Убрать","",""],["❤️","Люблю","love"],["⛔","Занят","busy"],["🙂","Весело","happy"],["😄","Очень весело","very-happy"],["😛","Дразнюсь","teasing"],["😳","Смущение","shy"],["😞","Грустно","sad"],["😮","Удивление","surprised"],["😐","Апатия","apathetic"],["🤔","Сомнение","doubt"],["😎","Гордый","proud"],["😕","Недоумение","confused"],["😢","Очень грустно","very-sad"]];
 function buildEmotionOptions(){
  const list=$("nexora-emotions-list");if(!list)return;
  characterEmotions.forEach(([emoji,label,key])=>{const button=document.createElement("button");button.type="button";button.className="nexora-emotion-option"+(!key?" remove":"");button.innerHTML=emoji?'<span class="emoji"></span><span class="label"></span>':'<span class="label"></span>';button.querySelector(".label").textContent=label;if(emoji)button.querySelector(".emoji").textContent=emoji;button.addEventListener("click",()=>selectCharacterEmotion(key,emoji,label));list.append(button);});
  const saved=localStorage.getItem("nexora-character-emotion");if(saved){const found=characterEmotions.find(item=>item[2]===saved);if(found)showCharacterEmotion(found[0],found[1]);}
 }
 function selectCharacterEmotion(key,emoji,label){
  if(key)localStorage.setItem("nexora-character-emotion",key);else localStorage.removeItem("nexora-character-emotion");
  showCharacterEmotion(emoji,label);closeEmotions();closeCharacterActions();
 }
 function showCharacterEmotion(emoji,label){
  const avatar=$("nexora-world-avatar");if(!avatar)return;
  let bubble=$("nexora-current-emotion");if(!bubble){bubble=document.createElement("div");bubble.id="nexora-current-emotion";bubble.className="nexora-current-emotion";bubble.setAttribute("aria-label","Эмоция персонажа");avatar.append(bubble);}
  bubble.textContent=label?emoji:"";bubble.title=label||"";bubble.classList.toggle("hidden",!label);
 }
 function openEmotions(){closeCharacterActions();$("nexora-emotions-panel").classList.remove("hidden");}
 function closeEmotions(){const panel=$("nexora-emotions-panel");if(panel)panel.classList.add("hidden");}
 function openCharacterActions(){
  ensureAvatarEditor();
  $("nexora-character-actions").classList.remove("hidden");
  const a=$("nexora-world-avatar");if(a)a.setAttribute("aria-expanded","true");
 }
 function closeCharacterActions(){
  const menu=$("nexora-character-actions");if(menu)menu.classList.add("hidden");
  const a=$("nexora-world-avatar");if(a)a.setAttribute("aria-expanded","false");
 }
 function closeAvatar(){
  $("nexora-avatar-panel").classList.add("hidden");
  const a=$("nexora-world-avatar");if(a)a.setAttribute("aria-expanded","false");
 }
 async function openAvatar(){
  ensureAvatarEditor();
  const panel=$("nexora-avatar-panel"),loading=$("nexora-profile-loading"),form=$("nexora-info-form"),error=$("nexora-profile-error");
  panel.classList.remove("hidden");loading.classList.remove("hidden");form.classList.add("hidden");error.classList.add("hidden");
  loading.innerHTML='<i></i><b>Загружаем анкету…</b><span>Это может занять время при медленном соединении</span>';
  const planet=document.querySelector(".planet-name");
  $("nexora-info-planet").textContent=planet?planet.textContent.trim():"Неизвестная планета";
  try{
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
   let response;try{response=await fetch("/api/account/profile",{cache:"no-store",signal:controller.signal});}finally{clearTimeout(timeout);}
   const data=await response.json();if(!response.ok)throw Error(data.error||"Не удалось загрузить анкету");
   const p=data.profile||{};
   const fields=$("nexora-info-form").elements;
   ["gender","birthDate","city","occupation","interests","about","status","relationship","privileges","lookingFor","askMe"].forEach(k=>{if(fields[k])fields[k].value=p[k]||"";});
   $("nexora-info-photo").src=p.photoDataUrl||"";
   $("nexora-info-photo").classList.toggle("has-photo",Boolean(p.photoDataUrl));
   $("nexora-info-note").textContent="";
   loading.classList.add("hidden");form.classList.remove("hidden");
  }catch(e){
   loading.classList.add("hidden");error.classList.remove("hidden");
   error.textContent=e.name==="AbortError"?"Соединение слишком медленное. Проверь интернет и попробуй снова.":(e.message||"Не удалось загрузить анкету.");
   const retry=document.createElement("button");retry.type="button";retry.textContent="Повторить загрузку";retry.addEventListener("click",openAvatar);error.append(retry);
  }
 }
 let pendingCharacterPhoto="";
 function previewCharacterPhoto(event){
  const file=event.target.files&&event.target.files[0];if(!file)return;
  if(!/^image\/(jpeg|png|webp)$/.test(file.type)){ $("nexora-info-note").textContent="Выбери JPG, PNG или WebP.";return; }
  if(file.size>8*1024*1024){$("nexora-info-note").textContent="Фото должно быть меньше 8 МБ.";return;}
  const reader=new FileReader();
  reader.onload=()=>{const img=new Image();img.onload=()=>{const canvas=document.createElement("canvas"),scale=Math.min(1,720/Math.max(img.width,img.height));canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);pendingCharacterPhoto=canvas.toDataURL("image/jpeg",.78);$("nexora-info-photo").src=pendingCharacterPhoto;$("nexora-info-photo").classList.add("has-photo");$("nexora-info-note").textContent="Фото готово к сохранению.";};img.src=String(reader.result);};
  reader.readAsDataURL(file);
 }
 async function saveCharacterInfo(event){
  event.preventDefault();const button=$("nexora-info-save"),note=$("nexora-info-note"),form=$("nexora-info-form"),fields=form.elements;
  button.disabled=true;note.textContent="Сохраняем…";
  try{
   const payload={gender:fields.gender.value,birthDate:fields.birthDate.value,city:fields.city.value,occupation:fields.occupation.value,interests:fields.interests.value,about:fields.about.value,status:fields.status.value,relationship:fields.relationship.value,privileges:fields.privileges.value,lookingFor:fields.lookingFor.value,askMe:fields.askMe.value};
   if(pendingCharacterPhoto)payload.photoDataUrl=pendingCharacterPhoto;
   const response=await fetch("/api/account/profile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const data=await response.json();if(!response.ok)throw Error(data.error||"Не удалось сохранить анкету");
   pendingCharacterPhoto="";note.textContent="Анкета сохранена.";
  }catch(e){note.textContent=e.message||"Ошибка сохранения.";}
  finally{button.disabled=false;}
 }
 function renderAuthority(c){
  const points=Number(c.authority_points)||0,rank=c.authority_title||"Новичок",aura=c.aura||"none";
  const rankLabel=$("nexora-world-rank");if(rankLabel)rankLabel.textContent=currentNickname;const profileAvatar=$("nexora-profile-avatar");if(profileAvatar)profileAvatar.className="nexora-profile-avatar aura-"+aura;
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
  currentNickname=String(account&&account.nickname||account&&account.name||"Персонаж").trim().slice(0,24)||"Персонаж";
  ensureAvatarEditor();
  const nameLabel=$("nexora-world-rank");if(nameLabel)nameLabel.textContent=currentNickname;
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