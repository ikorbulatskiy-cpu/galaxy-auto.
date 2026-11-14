(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 const state={lastMessageId:0,poll:null,clockTimer:null,presenceTimer:null,movementTimer:null,viewingOtherPlayer:false,selectedPlayerId:null,reportTargetId:null,playerIds:new Set(),position:{x:50,bottom:12},facing:1};
 function updateVisitorClock(){
  const clock=$("visitor-clock");
  if(!clock)return;
  try{clock.textContent=new Intl.DateTimeFormat(undefined,{hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date());}
  catch{clock.textContent=new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});}
 }
 const room=$("room-screen");

 const rankRows=[["Новичок","0","—"],["Бывалый","1","✦"],["Уважаемый","2","✦✦"],["Мастер","3","✦✦✦"],["Профессионал","4","✦✦✦✦"],["Гуру","5–9","✦"],["Неприкасаемый","10–19","✦✦"],["Папа / Мама","20–99","✦✦"],["Ангел Галактики","100–199","✦✦✦✦"],["Бог / Богиня Галактики","200–999","✦✦✦✦✦"],["Всемогущий","1000–1999","✦✦✦✦✦✦"],["Mister / Miss Вселенная","2000–9999","✦✦✦✦✦✦"],["Легенда Галактики","10000–19999","✦✦✦✦✦✦✦"],["Премьер Галактики","20000–49999","✦✦✦✦✦✦✦"],["Император Галактики","50000+","✦✦✦✦✦✦✦"]];
 const auraNames={none:"Без ауры","dark-1":"Тёмная аура","blue-1":"Голубая аура"};
 const selectableAuras=[["none","Без ауры",""],["dark-1","Тёмная аура","aura-dark-1"],["blue-1","Голубая аура","aura-blue-1"]];
 let avatar={headId:1,bodyId:1,outfitId:0};

 const roomSpriteCrops={head:[[108,908,188,174],[503,885,202,202],[902,904,202,181],[108,1249,191,210],[503,1235,202,217],[902,1273,202,195]],body:[[101,983,202,188],[480,856,253,304],[897,897,224,275],[101,1193,210,347],[434,1229,325,318],[897,1236,224,311]]};
 const roomSpritePromises={};
 function removeScreenshotBackground(ctx,w,h){
  const frame=ctx.getImageData(0,0,w,h),pixels=frame.data;
  const corners=[[0,0],[w-1,0],[0,h-1],[w-1,h-1]];
  const bg=[0,1,2].map(ch=>Math.round(corners.reduce((sum,[x,y])=>sum+pixels[(y*w+x)*4+ch],0)/corners.length));
  for(let i=0;i<pixels.length;i+=4){
   const oldAlpha=pixels[i+3]/255;
   const distance=Math.hypot(pixels[i]-bg[0],pixels[i+1]-bg[1],pixels[i+2]-bg[2]);
   const alpha=Math.max(0,Math.min(1,(distance-16)/42))*oldAlpha;
   if(alpha<=0.01){pixels[i+3]=0;continue;}
   for(let ch=0;ch<3;ch++)pixels[i+ch]=Math.max(0,Math.min(255,Math.round((pixels[i+ch]-bg[ch]*(1-alpha))/alpha)));
   pixels[i+3]=Math.round(alpha*255);
  }
  ctx.putImageData(frame,0,0);
 }

 function trimmedSpriteDataUrl(canvas,w,h){
  // Keep the original crop frame: fixed transparent margins preserve each
  // part's anchor point, so heads and torsos stay aligned across selections.
  return canvas.toDataURL("image/png");
}

 function setSpriteImage(img,kind,id){
  if(!img)return;
  const safeId=Math.max(1,Math.min(6,Number(id)||1));
  if(kind==="head"){img.src="/assets/sprites/characters/nexora-devil-head-"+safeId+".svg?v=devil-heads-v2-20261115";return;}
  if(kind==="body"){img.src="/assets/sprites/characters/nexora-body-"+safeId+".svg?v=body-art-v3-20261115";return;}
  const key=kind+":"+id;
  if(!roomSpritePromises[key])roomSpritePromises[key]=new Promise((resolve,reject)=>{
   const source=new Image();source.onload=()=>{const [x,y,w,h]=roomSpriteCrops[kind][id-1];if(x+w>source.naturalWidth||y+h>source.naturalHeight){reject(new Error("Sprite crop exceeds source"));return;}const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;const ctx=canvas.getContext("2d");if(!ctx){reject(new Error("Canvas unavailable"));return;}ctx.drawImage(source,x,y,w,h,0,0,w,h);removeScreenshotBackground(ctx,w,h);resolve(trimmedSpriteDataUrl(canvas,w,h));};source.onerror=()=>reject(new Error("Cannot load "+kind+" atlas"));source.src="/assets/sprites/characters/IMG_415"+(kind==="head"?"7":"8")+".png?v=source-sprite-20261115";
  });
  roomSpritePromises[key].then(src=>{img.src=src;}).catch(error=>console.error("NEXORA sprite:",error));
 }
 let currentNickname="Персонаж";
 let selectedAura=localStorage.getItem("nexora-selected-aura")||"blue-1";if(selectedAura==="blue-2"||selectedAura==="dark-2"||selectedAura==="dark-3")selectedAura="blue-1";
 function ensureAvatarEditor(){
  if($("nexora-world-avatar"))return;
  const scene=$("room-scene");
  scene.insertAdjacentHTML("beforeend",'<div id="nexora-world-avatar" class="nexora-world-avatar aura-none" role="button" tabindex="0" aria-label="Открыть инфо" aria-expanded="false"><svg class="nexora-user-aura" viewBox="0 0 174 160" aria-hidden="true"><use id="nexora-world-aura" href=""></use></svg><div class="nexora-avatar-sprite" role="img" aria-label="Персонаж NEXORA"><img id="nexora-world-body" src="" alt=""><img id="nexora-world-head" src="" alt=""></div><div class="nexora-emperor-title" hidden>✦ ИМПЕРАТОР ГАЛАКТИКИ ✦</div><div id="nexora-world-rank" class="nexora-world-rank">Персонаж</div></div><section id="nexora-avatar-panel" class="nexora-avatar-panel hidden" aria-label="Инфо" aria-modal="true" role="dialog"><div class="nexora-avatar-window"><header class="nexora-info-header"><span>ИНФО</span><button id="nexora-avatar-close" class="nexora-avatar-close" type="button" aria-label="Закрыть">×</button></header><div id="nexora-profile-loading" class="nexora-profile-loading" role="status"><i></i><b>Загружаем анкету…</b><span>Скорость зависит от интернет-соединения</span></div><div id="nexora-profile-error" class="nexora-profile-error hidden" role="alert"></div><form id="nexora-info-form" class="nexora-info-form hidden"><div class="nexora-classic-profile"><div class="nexora-classic-top"><label class="nexora-classic-photo"><img id="nexora-info-photo" alt="Твоё фото" src=""><span>＋ Фото</span><input id="nexora-info-photo-file" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="nexora-classic-facts"><div class="nexora-classic-planet"><strong id="nexora-info-planet">Земля</strong></div><label><input name="relationship" maxlength="80" placeholder="Отношения"></label><div class="nexora-privilege-line"><span>Привилегии</span><strong id="nexora-info-privileges">—</strong></div><label><input name="status" maxlength="100" placeholder="Статус"></label><label><input name="lookingFor" maxlength="100" placeholder="Ищет…"></label></div></div><div class="nexora-classic-links"><span>Блог (0)</span><span>Фото (0)</span></div><label class="nexora-classic-ask">Спроси меня<input name="askMe" maxlength="300" placeholder="Напиши вопрос, на который готов ответить"></label><div class="nexora-classic-section">Анкета</div><div class="nexora-classic-questionnaire"><label>Пол<select name="gender"><option value="">Не указано</option><option value="Мужской">Мужской</option><option value="Женский">Женский</option><option value="Другое">Другое</option></select></label><label>Дата рождения<input name="birthDate" type="date" max="2100-12-31"></label><label class="wide">Город<input name="city" maxlength="80" placeholder="Твой город"></label><label class="wide">Род занятий<textarea name="occupation" maxlength="120" rows="2" placeholder="Чем занимаешься"></textarea></label><label class="wide">Интересы<textarea name="interests" maxlength="220" rows="2" placeholder="Спорт, музыка, путешествия…"></textarea></label><label class="wide">О себе<textarea name="about" maxlength="600" rows="3" placeholder="Расскажи немного о себе"></textarea></label></div></div><div class="nexora-info-actions"><button id="nexora-info-save" type="submit">Сохранить</button><span id="nexora-info-note" role="status"></span></div></form></div></section>');
  scene.insertAdjacentHTML("beforeend",'<section id="nexora-character-actions" class="nexora-character-actions hidden" role="dialog" aria-modal="true" aria-label="Действия"><div class="nexora-character-actions-card"><div class="nexora-character-actions-title">ДЕЙСТВИЯ</div><button id="nexora-action-info" type="button">Инфо</button><button id="nexora-action-emotions" type="button">Эмоции</button><button id="nexora-action-auras" type="button">Ауры</button><button id="nexora-action-report" type="button" class="hidden">Пожаловаться</button><button id="nexora-action-developer" type="button" class="hidden">Управление сервером</button><button id="nexora-action-exit" type="button" class="secondary">Выход</button></div></section><section id="nexora-developer-panel" class="nexora-developer-panel hidden" role="dialog" aria-modal="true" aria-label="Управление сервером"><div class="nexora-developer-window"><header><span id="nexora-management-title">Управление сервером</span><button id="nexora-developer-close" type="button" aria-label="Закрыть">×</button></header><div class="nexora-management-meta" id="nexora-management-meta">Проверка полномочий…</div><nav class="nexora-management-tabs" id="nexora-management-tabs"><button type="button" data-admin-tab="players" class="active">Игроки</button><button type="button" data-admin-tab="reports">Жалобы</button><button type="button" data-admin-tab="staff">Команда</button><button type="button" data-admin-tab="history">История</button><button type="button" data-admin-tab="economy">Экономика</button></nav><div id="nexora-management-note" class="nexora-management-note" role="status"></div><div id="nexora-management-content" class="nexora-management-content"><div class="nexora-management-loading">Загружаем данные сервера…</div></div></div></section><section id="nexora-report-panel" class="nexora-emotions-panel hidden" role="dialog" aria-modal="true" aria-label="Жалоба"><div class="nexora-emotions-window"><header>Жалоба<button id="nexora-report-close" type="button" aria-label="Закрыть">×</button></header><form id="nexora-report-form" class="nexora-report-form"><label>Причина<select name="reason" required><option value="">Выберите причину</option><option>Оскорбления</option><option>Спам</option><option>Неприемлемое поведение</option><option>Обман</option><option>Другое нарушение</option></select></label><label>Описание<textarea name="details" maxlength="1000" rows="4" placeholder="Опишите, что произошло" required></textarea></label><button type="submit">Отправить жалобу</button><p id="nexora-report-note" role="status"></p></form></div></section><section id="nexora-auras-panel" class="nexora-auras-panel nexora-emotions-panel hidden" role="dialog" aria-modal="true" aria-label="Ауры"><div class="nexora-emotions-window"><header>Ауры<button id="nexora-auras-close" type="button" aria-label="Закрыть">×</button></header><p class="nexora-auras-hint">Выбери свечение персонажа</p><div class="nexora-auras-list" id="nexora-auras-list"></div></div></section><section id="nexora-emotions-panel" class="nexora-emotions-panel hidden" role="dialog" aria-modal="true" aria-label="Эмоции"><div class="nexora-emotions-window"><header>Эмоции<button id="nexora-emotions-close" type="button" aria-label="Закрыть">×</button></header><div class="nexora-emotions-list" id="nexora-emotions-list"></div></div></section>');
  const worldAvatar=$("nexora-world-avatar");setSpriteImage($("nexora-world-body"),"body",1);setSpriteImage($("nexora-world-head"),"head",1);
  worldAvatar.setAttribute("aria-label","Открыть действия персонажа");
  worldAvatar.addEventListener("pointerdown",event=>event.stopPropagation());
  scene.addEventListener("pointerdown",event=>{
   if(event.button!==0||event.target.closest("button,input,textarea,select,a,.nexora-room-player,.nexora-avatar-panel,.nexora-character-actions,.nexora-emotions-panel,.nexora-developer-panel"))return;
   const rect=scene.getBoundingClientRect(),avatarRect=worldAvatar.getBoundingClientRect();
   const halfWidth=avatarRect.width/2/rect.width*100;
   const avatarHeight=avatarRect.height/rect.height*100;
   const x=Math.max(halfWidth,Math.min(100-halfWidth,(event.clientX-rect.left)/rect.width*100));
   // Feet stay on the walkable floor plane and never sink below its edge.
   const bottom=Math.max(13,Math.min(78-avatarHeight,(rect.bottom-event.clientY)/rect.height*100));
   moveWorldAvatarTo(x,bottom);
  });

  worldAvatar.addEventListener("click",openCharacterActions);
  worldAvatar.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openCharacterActions();}});
  $("nexora-action-info").addEventListener("click",()=>{const playerId=state.selectedPlayerId;closeCharacterActions();if(playerId)openOtherPlayer(playerId);else openAvatar();});
  $("nexora-action-emotions").addEventListener("click",openEmotions);
  $("nexora-action-auras").addEventListener("click",openAuras);
  $("nexora-action-report").addEventListener("click",()=>{state.reportTargetId=state.selectedPlayerId;closeCharacterActions();openReport();});
  $("nexora-report-close").addEventListener("click",closeReport);
  $("nexora-report-panel").addEventListener("click",event=>{if(event.target===$("nexora-report-panel"))closeReport();});
  $("nexora-report-form").addEventListener("submit",submitPlayerReport);
  $("nexora-action-developer").addEventListener("click",openDeveloperMode);
  $("nexora-developer-close").addEventListener("click",closeDeveloperMode);
  $("nexora-management-tabs").addEventListener("click",event=>{const button=event.target.closest("[data-admin-tab]");if(!button)return;managementTab=button.dataset.adminTab;renderManagementTab();});
  $("nexora-developer-panel").addEventListener("click",event=>{if(event.target===$("nexora-developer-panel"))closeDeveloperMode();});
  $("nexora-auras-close").addEventListener("click",closeAuras);
  $("nexora-auras-panel").addEventListener("click",event=>{if(event.target===$("nexora-auras-panel"))closeAuras();});
  $("nexora-action-exit").addEventListener("click",closeCharacterActions);
  $("nexora-emotions-close").addEventListener("click",closeEmotions);
  $("nexora-emotions-panel").addEventListener("click",event=>{if(event.target===$("nexora-emotions-panel"))closeEmotions();});
  buildEmotionOptions();
  buildAuraOptions();
  const initialAura=selectableAuras.find(item=>item[0]===selectedAura)?.[2],initialAuraNode=$("nexora-world-aura");if(initialAuraNode)initialAuraNode.setAttribute("href",initialAura?"/assets/sprites/characters/nexora-user-auras.svg?v=sprite-alpha-fix-v3-20261115#"+initialAura:"");
  $("nexora-character-actions").addEventListener("click",event=>{if(event.target===$("nexora-character-actions"))closeCharacterActions();});
  $("nexora-avatar-close").addEventListener("click",closeAvatar);
  $("nexora-avatar-panel").addEventListener("click",event=>{if(event.target===$("nexora-avatar-panel"))closeAvatar();});
  $("nexora-info-form").addEventListener("submit",saveCharacterInfo);
  $("nexora-info-photo-file").addEventListener("change",previewCharacterPhoto);
  document.addEventListener("keydown",event=>{
   if(event.key==="Escape"){closeAvatar();closeCharacterActions();closeEmotions();closeDeveloperMode();return;}
   if(room.classList.contains("hidden")||event.target.closest("input,textarea,select,[contenteditable=true]"))return;
   if(event.key==="ArrowLeft"||event.key.toLowerCase()==="a"){event.preventDefault();moveWorldAvatarBy(-5);}
   if(event.key==="ArrowRight"||event.key.toLowerCase()==="d"){event.preventDefault();moveWorldAvatarBy(5);}
   if(event.key==="ArrowUp"||event.key.toLowerCase()==="w"){event.preventDefault();moveWorldAvatarTo(state.position.x,Math.min(54,state.position.bottom+4));}
   if(event.key==="ArrowDown"||event.key.toLowerCase()==="s"){event.preventDefault();moveWorldAvatarTo(state.position.x,Math.max(13,state.position.bottom-4));}
  });
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
 function buildAuraOptions(){
  const list=$("nexora-auras-list");if(!list)return;
  selectableAuras.forEach(([key,label,sprite])=>{const button=document.createElement("button");button.type="button";button.className="nexora-aura-option";button.dataset.aura=key;const swatch=document.createElement("span");swatch.className="nexora-aura-thumb";if(sprite){const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox",sprite.startsWith("aura-dark")?"0 0 159 160":"0 0 174 160");const use=document.createElementNS("http://www.w3.org/2000/svg","use");use.setAttribute("href","/assets/sprites/characters/nexora-user-auras.svg?v=sprite-alpha-fix-v3-20261115#"+sprite);svg.append(use);swatch.append(svg);}else{swatch.textContent="—";}const name=document.createElement("span");name.textContent=label;const check=document.createElement("b");check.textContent="✓";button.append(swatch,name,check);button.addEventListener("click",()=>selectCharacterAura(key));list.append(button);});
  updateAuraSelection();
 }
 function updateAuraSelection(){document.querySelectorAll(".nexora-aura-option").forEach(button=>button.classList.toggle("selected",button.dataset.aura===(selectedAura||"none")));}
 function selectCharacterAura(key){
  selectedAura=key==="none"?"":key;
  if(selectedAura)localStorage.setItem("nexora-selected-aura",selectedAura);else localStorage.removeItem("nexora-selected-aura");
  const world=$("nexora-world-avatar");
  if(world){const rank=$("nexora-rank-title")?.textContent||"";const emperor=rank.includes("Император");world.className="nexora-world-avatar aura-"+(selectedAura||"none");const title=world.querySelector(".nexora-emperor-title");if(title)title.hidden=true;}
  const auraUse=$("nexora-world-aura");const sprite=selectableAuras.find(item=>item[0]===selectedAura)?.[2];if(auraUse)auraUse.setAttribute("href",sprite?"/assets/sprites/characters/nexora-user-auras.svg?v=sprite-alpha-fix-v3-20261115#"+sprite:"");
  const preview=$("nexora-aura-preview");if(preview){preview.className="nexora-aura-preview aura-"+(selectedAura||"none");preview.textContent="✦";}
  updateAuraSelection();closeAuras();closeCharacterActions();
 }
 function openAuras(){closeCharacterActions();$("nexora-auras-panel").classList.remove("hidden");updateAuraSelection();}
 function closeAuras(){const panel=$("nexora-auras-panel");if(panel)panel.classList.add("hidden");}
 function openEmotions(){closeCharacterActions();$("nexora-emotions-panel").classList.remove("hidden");}
 function closeEmotions(){const panel=$("nexora-emotions-panel");if(panel)panel.classList.add("hidden");}
 function moveWorldAvatarTo(x,bottom){
  const world=$("nexora-world-avatar");if(!world)return;
  const sprite=world.querySelector(".nexora-avatar-sprite");if(!sprite)return;
  const currentX=parseFloat(world.style.left)||state.position.x||50,currentBottom=13;
  const scene=$("room-scene"),rect=scene?.getBoundingClientRect(),worldRect=world.getBoundingClientRect();
  const halfWidth=rect?worldRect.width/2/rect.width*100:5;
  const spriteHeight=rect?worldRect.height/rect.height*100:18;
  x=Math.max(halfWidth,Math.min(100-halfWidth,Number(x)||currentX));
  bottom=13;
  const distance=Math.hypot((x-currentX)*8,(bottom-currentBottom)*8);
  state.facing=x>=currentX?1:-1;state.position={x,bottom};
  world.style.left=x+"%";world.style.bottom=bottom+"%";world.dataset.facing=String(state.facing);
  sprite.classList.toggle("facing-left",state.facing<0);
  sprite.classList.remove("nexora-walking");void sprite.offsetWidth;sprite.classList.add("nexora-walking");
  if(state.movementTimer)clearTimeout(state.movementTimer);
  state.movementTimer=setTimeout(()=>{sprite.classList.remove("nexora-walking");state.movementTimer=null;},Math.max(650,Math.min(2600,distance*7)));
  syncRoomPosition();
 }
 async function syncRoomPosition(){
  if(room.classList.contains("hidden"))return;
  try{await fetch("/api/room/presence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({xPercent:state.position.x,bottomPercent:state.position.bottom,facing:state.facing}),cache:"no-store"});}catch(error){console.warn("Could not sync player position:",error);}
 }
 function moveWorldAvatarBy(dx){
  const world=$("nexora-world-avatar");if(!world||room.classList.contains("hidden"))return;
  const x=parseFloat(world.style.left)||state.position.x||50,bottom=13;
  moveWorldAvatarTo(x+dx,bottom);
 }
 function openCharacterActions(playerId=null){
  ensureAvatarEditor();
  state.selectedPlayerId=playerId?String(playerId):null;
  const menu=$("nexora-character-actions");
  menu.classList.remove("hidden");
  const a=playerId?document.querySelector('.nexora-room-player[data-player-id="'+CSS.escape(String(playerId))+'"]'):$("nexora-world-avatar");
  if(a)a.setAttribute("aria-expanded","true");
  const title=menu.querySelector(".nexora-character-actions-title");if(title)title.textContent=playerId?"ИГРОК":"ДЕЙСТВИЯ";
  const reportButton=$("nexora-action-report");if(reportButton)reportButton.classList.toggle("hidden",!playerId);
 }
 let managementData={players:[],reports:[],actions:[]},managementTab="players";
 function managementNote(message,isError=false){const node=$("nexora-management-note");if(node){node.textContent=message||"";node.classList.toggle("error",Boolean(isError));}}
 function adminElement(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;}
 async function loadManagement(){
  const content=$("nexora-management-content");if(content)content.replaceChildren(adminElement("div","nexora-management-loading","Загружаем данные сервера…"));
  try{const response=await fetch("/api/management/overview",{cache:"no-store"}),data=await response.json();if(!response.ok)throw Error(data.error||"Не удалось загрузить управление сервером.");managementData=data;state.role=data.role;state.isDeveloper=data.role==="developer";state.isModerator=["moderator","senior_moderator"].includes(data.role);renderManagementTab();}
  catch(error){managementNote(error.message,true);if(content)content.replaceChildren(adminElement("div","nexora-management-empty",error.message));}
 }
 function renderManagementTab(){
  const content=$("nexora-management-content"),tabs=$("nexora-management-tabs");if(!content||!tabs)return;
  const developer=state.isDeveloper,senior=state.role==="senior_moderator";
  tabs.querySelectorAll("[data-admin-tab]").forEach(button=>{const key=button.dataset.adminTab;button.classList.toggle("active",key===managementTab);button.classList.toggle("hidden",(!developer&&(key==="staff"||key==="economy"))||(!developer&&!senior&&key==="staff"));});
  const meta=$("nexora-management-meta");if(meta)meta.textContent="Полномочия: "+({developer:"Разработчик",senior_moderator:"Старший модератор",moderator:"Модератор"}[state.role]||"Игрок");
  content.replaceChildren();
  if(managementTab==="players"||managementTab==="staff"){
   const search=adminElement("input","nexora-management-search");search.placeholder="Поиск игрока по нику или идентификатору";search.type="search";content.append(search);
   const list=adminElement("div","nexora-management-list");content.append(list);
   const draw=()=>{list.replaceChildren();const term=search.value.trim().toLocaleLowerCase("ru");const rows=managementData.players.filter(p=>(managementTab!=="staff"||p.role!=="player")&&(!term||(p.nickname+" "+p.id).toLocaleLowerCase("ru").includes(term)));if(!rows.length)list.append(adminElement("div","nexora-management-empty","Игроки не найдены."));rows.forEach(player=>list.append(makePlayerCard(player)));};
   search.addEventListener("input",draw);draw();return;
  }
  if(managementTab==="reports"){
   const list=adminElement("div","nexora-management-list");content.append(list);
   managementData.reports.forEach(report=>{const card=adminElement("article","nexora-management-card");card.append(adminElement("b","","Жалоба №"+report.id+" · "+(report.reason||"Без причины")),adminElement("p","","От: "+(report.reporter_nickname||"Удалённый аккаунт")+" · На: "+(report.target_nickname||"Неизвестный игрок")),adminElement("p","",report.details||"Описание отсутствует"));const actions=adminElement("div","nexora-management-actions");[["accepted","Принять"],["rejected","Отклонить"]].forEach(([status,label])=>{const button=adminElement("button","",label);button.type="button";button.addEventListener("click",()=>reviewReport(report.id,status));actions.append(button);});card.append(actions);list.append(card);});
   if(!managementData.reports.length)list.append(adminElement("div","nexora-management-empty","Новых жалоб нет."));return;
  }
  if(managementTab==="history"){
   const list=adminElement("div","nexora-management-list");content.append(list);managementData.actions.forEach(item=>{const card=adminElement("article","nexora-management-card");card.append(adminElement("b","",String(item.action||"Действие")),adminElement("p","",(item.actor_nickname||"Система")+" → "+(item.target_nickname||"сервер")),adminElement("p","",item.reason||"Без причины"),adminElement("small","",new Date(item.created_at).toLocaleString("ru-RU")));list.append(card);});if(!managementData.actions.length)list.append(adminElement("div","nexora-management-empty","История пока пуста."));return;
  }
  if(managementTab==="economy"){
   const form=adminElement("form","nexora-management-form");const player=adminElement("select");player.required=true;player.append(new Option("Выберите игрока",""));managementData.players.forEach(p=>player.append(new Option(p.nickname+" · "+p.diamonds+" DIAMONDS",p.id)));const amount=adminElement("input");amount.type="number";amount.step="1";amount.placeholder="Сумма: +100 или -100";amount.required=true;const reason=adminElement("input");reason.maxLength=500;reason.placeholder="Причина изменения";reason.required=true;const submit=adminElement("button","","Изменить баланс");submit.type="submit";form.append(adminElement("label","","Игрок"),player,adminElement("label","","Количество DIAMONDS"),amount,adminElement("label","","Причина"),reason,submit);form.addEventListener("submit",async event=>{event.preventDefault();await adminRequest("/api/management/economy",{accountId:player.value,amount:Number(amount.value),reason:reason.value});});content.append(form);
  }
 }
 function makePlayerCard(player){
  const card=adminElement("article","nexora-management-card"),head=adminElement("div","nexora-management-player-head");head.append(adminElement("b","",player.nickname||"Без имени"),adminElement("span",player.online?"online":"",player.online?"В сети":"Не в сети"));card.append(head,adminElement("small","","ID: "+player.id),adminElement("p","","Роль: "+({developer:"Разработчик",senior_moderator:"Старший модератор",moderator:"Модератор",player:"Игрок"}[player.role]||player.role)+" · "+player.diamonds+" DIAMONDS"));
  const actions=adminElement("div","nexora-management-actions");
  const addModerationAction=(action,label,danger=false,minutes=30)=>{const b=adminElement("button",danger?"danger":"",label);b.type="button";b.addEventListener("click",()=>{card.querySelector(".nexora-management-form")?.remove();const form=adminElement("form","nexora-management-form"),reason=adminElement("textarea");reason.required=true;reason.maxLength=500;reason.placeholder="Обязательно укажите причину";const submit=adminElement("button","", "Подтвердить действие"),cancel=adminElement("button","","Отмена");submit.type="submit";cancel.type="button";cancel.addEventListener("click",()=>form.remove());form.append(reason,submit,cancel);form.addEventListener("submit",event=>{event.preventDefault();adminRequest("/api/management/action",{accountId:player.id,action,reason:reason.value,minutes});});card.append(form);reason.focus();});actions.append(b);};
  addModerationAction("warning","Предупредить");addModerationAction("mute","Запретить чат");addModerationAction("kick","Отключить");
  if((state.isDeveloper||state.role==="senior_moderator")&&player.role!=="developer")addModerationAction("ban","Заблокировать",true,60);
  if(state.isDeveloper&&player.role!=="developer"){const select=adminElement("select","nexora-management-role");[["player","Игрок"],["moderator","Модератор"],["senior_moderator","Старший модератор"]].forEach(([value,label])=>select.append(new Option(label,value)));select.value=player.role;const set=adminElement("button","","Назначить роль");set.type="button";set.addEventListener("click",()=>adminRequest("/api/management/role",{accountId:player.id,role:select.value}));actions.append(select,set);}
  card.append(actions);return card;
 }
 async function adminRequest(url,payload){
  managementNote("Выполняем действие…");
  try{const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),data=await response.json();if(!response.ok)throw Error(data.error||"Операция не выполнена.");managementNote(data.message||"Изменения сохранены.");await loadManagement();}
  catch(error){managementNote(error.message,true);}
 }
 async function reviewReport(id,status){await adminRequest("/api/management/reports/"+id,{status});}
 function openReport(){const panel=$("nexora-report-panel");if(panel){panel.classList.remove("hidden");$("nexora-report-note").textContent="";}}
 function closeReport(){const panel=$("nexora-report-panel");if(panel)panel.classList.add("hidden");}
 async function submitPlayerReport(event){
  event.preventDefault();const form=event.currentTarget,button=form.querySelector("button[type=submit]"),note=$("nexora-report-note");
  if(!state.reportTargetId){note.textContent="Не удалось определить игрока.";return;}
  button.disabled=true;note.textContent="Отправляем жалобу…";
  try{const response=await fetch("/api/management/reports",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:state.reportTargetId,reason:form.elements.reason.value,details:form.elements.details.value})}),data=await response.json();if(!response.ok)throw Error(data.error||"Не удалось отправить жалобу.");note.textContent=data.message||"Жалоба отправлена.";form.reset();state.reportTargetId=null;setTimeout(closeReport,900);}
  catch(error){note.textContent=error.message;}
  finally{button.disabled=false;}
 }
 function openDeveloperMode(){if(!state.isDeveloper&&!state.isModerator)return;closeCharacterActions();$("nexora-developer-panel").classList.remove("hidden");managementTab="players";loadManagement();}
 function closeDeveloperMode(){const panel=$("nexora-developer-panel");if(panel)panel.classList.add("hidden");}
 function closeCharacterActions(){
  const menu=$("nexora-character-actions");if(menu)menu.classList.add("hidden");
  document.querySelectorAll(".nexora-room-player[aria-expanded=true]").forEach(node=>node.setAttribute("aria-expanded","false"));
  const a=$("nexora-world-avatar");if(a)a.setAttribute("aria-expanded","false");
  state.selectedPlayerId=null;
  const title=menu?.querySelector(".nexora-character-actions-title");if(title)title.textContent="ДЕЙСТВИЯ";
 }
 function setInfoReadonly(readonly){
  const form=$("nexora-info-form");if(!form)return;
  Array.from(form.elements).forEach(control=>{control.disabled=readonly;});
  const actions=document.querySelector(".nexora-info-actions");if(actions)actions.classList.toggle("hidden",readonly);
  const photo=$("nexora-info-photo-file");if(photo)photo.closest("label").classList.toggle("nexora-readonly-photo",readonly);
  const title=document.querySelector("#nexora-avatar-panel .nexora-info-header span");if(title)title.textContent=readonly?"ИНФО ИГРОКА":"ИНФО";
  state.viewingOtherPlayer=readonly;
 }
 function closeAvatar(){
  $("nexora-avatar-panel").classList.add("hidden");
  setInfoReadonly(false);
  const a=$("nexora-world-avatar");if(a&&a.id==="nexora-world-avatar")a.setAttribute("aria-expanded","false");
 }
 async function openOtherPlayer(playerId){
  ensureAvatarEditor();
  closeCharacterActions();closeEmotions();closeAuras();
  const panel=$("nexora-avatar-panel"),loading=$("nexora-profile-loading"),form=$("nexora-info-form"),error=$("nexora-profile-error");
  setInfoReadonly(true);panel.classList.remove("hidden");loading.classList.remove("hidden");form.classList.add("hidden");error.classList.add("hidden");
  loading.innerHTML='<i></i><b>Загружаем анкету игрока…</b><span>Получаем открытую информацию персонажа</span>';
  try{
   const response=await fetch("/api/room/player/"+encodeURIComponent(playerId),{cache:"no-store"});
   const data=await response.json();if(!response.ok)throw Error(data.error||"Не удалось загрузить анкету игрока");
   const p=data.profile||{},player=data.player||{},fields=form.elements;
   ["gender","birthDate","city","occupation","interests","about","status","relationship","lookingFor","askMe"].forEach(k=>{if(fields[k])fields[k].value=p[k]||"";});
   const planet=document.querySelector(".planet-name");$("nexora-info-planet").textContent=planet?planet.textContent.trim():"Земля";
   $("nexora-info-privileges").textContent=p.privileges||"—";
   $("nexora-info-photo").src=p.photoDataUrl||"";$("nexora-info-photo").classList.toggle("has-photo",Boolean(p.photoDataUrl));
   const header=document.querySelector("#nexora-avatar-panel .nexora-info-header span");if(header)header.textContent="ИНФО: "+String(player.nickname||"ИГРОК").toUpperCase();
   loading.classList.add("hidden");form.classList.remove("hidden");
  }catch(errorValue){
   loading.classList.add("hidden");error.classList.remove("hidden");error.textContent=errorValue.message||"Не удалось загрузить анкету игрока.";
   const retry=document.createElement("button");retry.type="button";retry.textContent="Повторить загрузку";retry.addEventListener("click",()=>openOtherPlayer(playerId));error.append(retry);
  }
 }
 async function openAvatar(){
  setInfoReadonly(false);
  ensureAvatarEditor();
  const panel=$("nexora-avatar-panel"),loading=$("nexora-profile-loading"),form=$("nexora-info-form"),error=$("nexora-profile-error");
  panel.classList.remove("hidden");loading.classList.remove("hidden");form.classList.add("hidden");error.classList.add("hidden");
  loading.innerHTML='<i></i><b>Загружаем анкету…</b><span>Это может занять время при медленном соединении</span>';
  const planet=document.querySelector(".planet-name");
  $("nexora-info-planet").textContent=planet?planet.textContent.trim():"Неизвестная планета";
  try{
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
   let response;try{response=await fetch("/api/account/profile",{cache:"no-store",signal:controller.signal});}finally{clearTimeout(timeout);}
   const data=await response.json();if(!response.ok)throw Error(response.status===401?"Сессия закончилась. Войди в аккаунт заново.":(data.error||"Не удалось загрузить анкету (ошибка "+response.status+")."));
   const p=data.profile||{};
   const fields=$("nexora-info-form").elements;
   ["gender","birthDate","city","occupation","interests","about","status","relationship","lookingFor","askMe"].forEach(k=>{if(fields[k])fields[k].value=p[k]||"";});
   const isDeveloper=Boolean(p.isDeveloper||data.account?.isDeveloper);state.isDeveloper=isDeveloper;const privilegeLabel=$("nexora-info-privileges");if(privilegeLabel)privilegeLabel.textContent=isDeveloper?"Разработчик":(p.privileges||"—");const developerButton=$("nexora-action-developer");if(developerButton)developerButton.classList.toggle("hidden",!isDeveloper);
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
   const payload={gender:fields.gender.value,birthDate:fields.birthDate.value,city:fields.city.value,occupation:fields.occupation.value,interests:fields.interests.value,about:fields.about.value,status:fields.status.value,relationship:fields.relationship.value,lookingFor:fields.lookingFor.value,askMe:fields.askMe.value};
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
  $("nexora-rank-title").textContent=rank+" "+("✦".repeat(Number(c.authority_stars)||0));const isEmperor=rank==="Император Галактики"||rank==="Император";const activeAura=selectedAura||"none";const worldAvatar=$("nexora-world-avatar");if(worldAvatar){worldAvatar.className="nexora-world-avatar aura-"+activeAura;const title=worldAvatar.querySelector(".nexora-emperor-title");if(title)title.hidden=true;}if(profileAvatar)profileAvatar.classList.toggle("aura-emperor",isEmperor);$("nexora-authority-count").textContent=points+" очков авторитета";
  $("nexora-aura-preview").className="nexora-aura-preview aura-"+activeAura;$("nexora-aura-preview").textContent="✦";
  const current=rankRows.findIndex(x=>x[0]===rank),next=rankRows[Math.min(rankRows.length-1,current+1)];
  const currentMin=Number(c.rank_min_points)||0,nextMin=next?Number(next[1].split(/[–+]/)[0]):currentMin;
  const progress=next&&nextMin>currentMin?Math.max(0,Math.min(100,(points-currentMin)/(nextMin-currentMin)*100)):100;
  $("nexora-authority-progress").style.width=progress+"%";
  $("nexora-rank-next").textContent=next?"Аура: "+(auraNames[aura]||"Особая")+" · Следующее звание: "+next[0]:"Высшее звание достигнуто";
 }
 function showAvatarTab(tab){
  [["nexora-world-head","nexora-profile-head","head",avatar.headId]].forEach(([worldId,profileId,kind,id])=>{[worldId,profileId].forEach(target=>{const node=$(target);if(node)setSpriteImage(node,"head",id);});});["nexora-world-outfit","nexora-profile-outfit"].forEach(target=>{const node=$(target);if(node)node.setAttribute("href",avatar.outfitId?"/assets/sprites/characters/nexora-emperor-set.svg#emperor-set":"");});
  document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  const box=$("nexora-avatar-content");
  if(tab==="emperor"){box.innerHTML='<div class="nexora-emperor-card"><div class="nexora-emperor-art"><svg viewBox="0 0 128 128"><use href="/assets/sprites/characters/nexora-emperor-set.svg#emperor-set"></use></svg></div><b>Император Галактики</b><span>Капюшон · мантия · коса · фиолетовая аура</span><button type="button" data-emperor="1">Надеть комплект</button><button type="button" data-emperor="0">Снять комплект</button></div>';box.querySelectorAll("[data-emperor]").forEach(b=>b.addEventListener("click",()=>{avatar.outfitId=Number(b.dataset.emperor);showAvatarTab("emperor");}));return;}
  if(tab==="ranks"){box.innerHTML='<div class="nexora-rank-table">'+rankRows.map((r,i)=>'<div class="nexora-rank-row"><b>'+r[0]+'</b><span>'+r[1]+'</span><strong>'+r[2]+'</strong></div>').join("")+'</div>';return;}
  const isHead=tab==="heads",count=6;
  box.innerHTML='<div class="nexora-choice-grid">'+Array.from({length:count},(_,i)=>'<button class="nexora-choice '+((isHead?avatar.headId:avatar.bodyId)===i+1?"selected":"")+'" data-choice="'+(i+1)+'" aria-label="'+(isHead?"Голова ":"Тело ")+(i+1)+'"><img alt=""></button>').join("")+'</div>';
  box.querySelectorAll("[data-choice]").forEach(b=>{const id=Number(b.dataset.choice);setSpriteImage(b.querySelector("img"),isHead?"head":"body",id);b.addEventListener("click",()=>{if(isHead)avatar.headId=id;else avatar.bodyId=id;applyWorldAvatar();showAvatarTab(tab);});});
 }
 function applyWorldAvatar(){const h=$("nexora-world-head"),b=$("nexora-world-body");if(h)setSpriteImage(h,"head",avatar.headId);if(b)setSpriteImage(b,"body",avatar.bodyId);}
 async function saveAvatar(){
  const b=$("nexora-avatar-save"),note=$("nexora-avatar-note");b.disabled=true;note.textContent="";
  try{const r=await fetch("/api/character",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({headId:avatar.headId,bodyId:avatar.bodyId,outfitId:avatar.outfitId})});const d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось сохранить");note.textContent="Внешность сохранена!";const head=$("nexora-world-head"),body=$("nexora-world-body"),outfit=$("nexora-world-outfit");applyWorldAvatar();if(outfit)outfit.setAttribute("href",avatar.outfitId?"/assets/sprites/characters/nexora-emperor-set.svg#emperor-set":"");}catch(e){note.textContent=e.message;}finally{b.disabled=false;}
 }

 async function showRoom(account){
  currentNickname=String(account&&account.nickname||account&&account.name||"Персонаж").trim().slice(0,24)||"Персонаж";
  ensureAvatarEditor();
  try{const response=await fetch("/api/account/profile",{cache:"no-store"});if(response.ok){const profile=await response.json(),character=profile.character||profile.profile?.character||{};state.role=profile.account?.role||(profile.account?.isDeveloper?"developer":"player");state.isDeveloper=Boolean(profile.account?.isDeveloper||profile.profile?.isDeveloper||state.role==="developer");state.isModerator=Boolean(profile.account?.isModerator||["moderator","senior_moderator"].includes(state.role));const developerButton=$("nexora-action-developer");if(developerButton){developerButton.classList.toggle("hidden",!state.isDeveloper&&!state.isModerator);developerButton.textContent=state.isDeveloper?"Режим разработчика":"Режим модератора";}avatar.headId=Math.max(1,Math.min(6,Number(character.headId??character.head_id)||1));avatar.bodyId=Math.max(1,Math.min(6,Number(character.bodyId??character.body_id)||1));applyWorldAvatar();}}catch(error){console.warn("Could not load saved avatar:",error);}
  const nameLabel=$("nexora-world-rank");if(nameLabel){nameLabel.textContent=currentNickname;}
  $("intro-screen").classList.add("hidden");
  room.classList.remove("hidden");
  updateVisitorClock();
  if(state.clockTimer)clearInterval(state.clockTimer);
  state.clockTimer=setInterval(updateVisitorClock,15000);
  loadMessages(true);
  if(state.poll)clearInterval(state.poll);
  state.poll=setInterval(()=>loadMessages(false),2200);
  const world=$("nexora-world-avatar");if(world){state.position={x:parseFloat(world.style.left)||50,bottom:13};world.style.left=state.position.x+"%";world.style.bottom=state.position.bottom+"%";}
  syncRoomPosition();
  loadRoomPresence();
  if(state.presenceTimer)clearInterval(state.presenceTimer);
  state.presenceTimer=setInterval(loadRoomPresence,2200);
 }
 function leaveRoom(){
  if(state.poll)clearInterval(state.poll);
  state.poll=null;
  if(state.presenceTimer)clearInterval(state.presenceTimer);
  state.presenceTimer=null;
  state.playerIds.clear();
  document.querySelectorAll(".nexora-room-player").forEach(node=>node.remove());
  if(state.clockTimer)clearInterval(state.clockTimer);
  state.clockTimer=null;
  room.classList.add("hidden");
  $("intro-screen").classList.remove("hidden");
 }
 async function loadRoomPresence(){
  try{
   const response=await fetch("/api/room/presence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({xPercent:state.position.x,bottomPercent:state.position.bottom,facing:state.facing}),cache:"no-store"});
   if(!response.ok)return;
   const data=await response.json(),scene=$("room-scene");
   const players=(data.players||[]).filter(player=>!player.mine).slice(0,8);
   const active=new Set(players.map(player=>String(player.id)));
   scene.querySelectorAll(".nexora-room-player").forEach(node=>{if(!active.has(node.dataset.playerId))node.remove();});
   const slots=[[8,13],[26,13],[74,13],[92,13],[8,53],[26,53],[74,53],[92,53]];
   players.forEach((player,index)=>{
    const id=String(player.id);let node=scene.querySelector('.nexora-room-player[data-player-id="'+CSS.escape(id)+'"]');
    if(!node){
     node=document.createElement("div");node.className="nexora-world-avatar nexora-room-player aura-"+(player.aura&&player.aura!=="none"?player.aura:"none");node.dataset.playerId=id;node.setAttribute("role","button");node.tabIndex=0;node.setAttribute("aria-label","Открыть анкету игрока "+String(player.nickname||"Игрок"));
     node.innerHTML='<svg class="nexora-user-aura" viewBox="0 0 174 160" aria-hidden="true"><use class="nexora-room-player-aura" href=""></use></svg><div class="nexora-avatar-sprite" role="img" aria-label="Персонаж NEXORA"><img class="nexora-room-player-body" alt=""><img class="nexora-room-player-head" alt=""></div><div class="nexora-emperor-title" hidden>✦ ИМПЕРАТОР ГАЛАКТИКИ ✦</div><div class="nexora-world-rank nexora-room-player-name"></div>';
     scene.append(node);
     setSpriteImage(node.querySelector(".nexora-room-player-body"),"body",Math.max(1,Math.min(6,Number(player.bodyId)||1)));
     setSpriteImage(node.querySelector(".nexora-room-player-head"),"head",Math.max(1,Math.min(6,Number(player.headId)||1)));
     node.addEventListener("click",event=>{event.stopPropagation();openCharacterActions(node.dataset.playerId);});
     node.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openCharacterActions(node.dataset.playerId);}});
    }
    const [slotX,slotY]=slots[index%slots.length];const x=Number.isFinite(Number(player.xPercent))?Number(player.xPercent):slotX;const y=13;const oldX=parseFloat(node.style.left),oldY=parseFloat(node.style.bottom);const moved=Number.isFinite(oldX)&&(Math.abs(oldX-x)>.15||Math.abs(oldY-y)>.15);node.style.left=x+"%";node.style.bottom=y+"%";node.dataset.facing=String(Number(player.facing)||1);const playerSprite=node.querySelector(".nexora-avatar-sprite");if(playerSprite){playerSprite.classList.toggle("facing-left",Number(player.facing)===-1);if(moved){playerSprite.classList.remove("nexora-walking");void playerSprite.offsetWidth;playerSprite.classList.add("nexora-walking");setTimeout(()=>playerSprite.classList.remove("nexora-walking"),760);}}
    node.className="nexora-world-avatar nexora-room-player aura-"+(player.aura&&player.aura!=="none"?player.aura:"none");
    const playerName=node.querySelector(".nexora-room-player-name");playerName.textContent=String(player.nickname||"Игрок").slice(0,24);
    const title=node.querySelector(".nexora-emperor-title");if(title)title.hidden=!String(player.authorityTitle||"").includes("Император");
    const aura=node.querySelector(".nexora-room-player-aura");if(aura)aura.setAttribute("href",player.aura&&player.aura!=="none"?"/assets/sprites/characters/nexora-user-auras.svg?v=sprite-alpha-fix-v3-20261115#aura-"+player.aura:"");
   });
  }catch(error){console.warn("Room players unavailable:",error);}
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