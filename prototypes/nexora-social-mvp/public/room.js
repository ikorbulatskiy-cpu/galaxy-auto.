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
 const d=canvas.getContext("2d").getImageData(0,0,w,h).data;let x0=w,y0=h,x1=-1,y1=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(d[(y*w+x)*4+3]>18){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
 if(x1<x0||y1<y0)return canvas.toDataURL("image/png");
 x0=Math.max(0,x0-2);y0=Math.max(0,y0-2);x1=Math.min(w-1,x1+2);y1=Math.min(h-1,y1+2);
 const out=document.createElement("canvas");out.width=x1-x0+1;out.height=y1-y0+1;
 out.getContext("2d").drawImage(canvas,x0,y0,out.width,out.height,0,0,out.width,out.height);
 return out.toDataURL("image/png");
}

 function setSpriteImage(img,kind,id){
  if(!img)return;const key=kind+":"+id;
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
  scene.insertAdjacentHTML("beforeend",'<section id="nexora-character-actions" class="nexora-character-actions hidden" role="dialog" aria-modal="true" aria-label="Действия"><div class="nexora-character-actions-card"><div class="nexora-character-actions-title">ДЕЙСТВИЯ</div><button id="nexora-action-info" type="button">Инфо</button><button id="nexora-action-emotions" type="button">Эмоции</button><button id="nexora-action-auras" type="button">Ауры</button><button id="nexora-action-developer" type="button" class="hidden">Режим разработчика</button><button id="nexora-action-exit" type="button" class="secondary">Выход</button></div></section><section id="nexora-developer-panel" class="nexora-developer-panel hidden" role="dialog" aria-modal="true" aria-label="Режим разработчика"><div class="nexora-developer-window"><header>Режим разработчика<button id="nexora-developer-close" type="button" aria-label="Закрыть">×</button></header><p>Доступ подтверждён для аккаунта «Первый».</p><span class="nexora-developer-role">Привилегия: Разработчик</span></div></section><section id="nexora-auras-panel" class="nexora-auras-panel nexora-emotions-panel hidden" role="dialog" aria-modal="true" aria-label="Ауры"><div class="nexora-emotions-window"><header>Ауры<button id="nexora-auras-close" type="button" aria-label="Закрыть">×</button></header><p class="nexora-auras-hint">Выбери свечение персонажа</p><div class="nexora-auras-list" id="nexora-auras-list"></div></div></section><section id="nexora-emotions-panel" class="nexora-emotions-panel hidden" role="dialog" aria-modal="true" aria-label="Эмоции"><div class="nexora-emotions-window"><header>Эмоции<button id="nexora-emotions-close" type="button" aria-label="Закрыть">×</button></header><div class="nexora-emotions-list" id="nexora-emotions-list"></div></div></section>');
  const worldAvatar=$("nexora-world-avatar");setSpriteImage($("nexora-world-body"),"body",1);setSpriteImage($("nexora-world-head"),"head",1);
  worldAvatar.setAttribute("aria-label","Открыть действия персонажа");
  worldAvatar.addEventListener("click",openCharacterActions);
  worldAvatar.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openCharacterActions();}});
  $("nexora-action-info").addEventListener("click",()=>{closeCharacterActions();openAvatar();});
  $("nexora-action-emotions").addEventListener("click",openEmotions);
  $("nexora-action-auras").addEventListener("click",openAuras);\n  $("nexora-action-developer").addEventListener("click",openDeveloperMode);\n  $("nexora-developer-close").addEventListener("click",closeDeveloperMode);\n  $("nexora-developer-panel").addEventListener("click",event=>{if(event.target===$("nexora-developer-panel"))closeDeveloperMode();});
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
 function openCharacterActions(){
  ensureAvatarEditor();
  $("nexora-character-actions").classList.remove("hidden");
  const a=$("nexora-world-avatar");if(a)a.setAttribute("aria-expanded","true");
 }
 function openDeveloperMode(){if(!state.isDeveloper)return;closeCharacterActions();$("nexora-developer-panel").classList.remove("hidden");}\n function closeDeveloperMode(){const panel=$("nexora-developer-panel");if(panel)panel.classList.add("hidden");}\n function closeCharacterActions(){
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
   ["gender","birthDate","city","occupation","interests","about","status","relationship","lookingFor","askMe"].forEach(k=>{if(fields[k])fields[k].value=p[k]||"";});\n   const isDeveloper=Boolean(p.isDeveloper||data.account?.isDeveloper);state.isDeveloper=isDeveloper;const privilegeLabel=$("nexora-info-privileges");if(privilegeLabel)privilegeLabel.textContent=isDeveloper?"Разработчик":(p.privileges||"—");const developerButton=$("nexora-action-developer");if(developerButton)developerButton.classList.toggle("hidden",!isDeveloper);
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
  try{const response=await fetch("/api/account/profile",{cache:"no-store"});if(response.ok){const profile=await response.json(),character=profile.character||profile.profile?.character||{};state.isDeveloper=Boolean(profile.account?.isDeveloper||profile.profile?.isDeveloper);const developerButton=$("nexora-action-developer");if(developerButton)developerButton.classList.toggle("hidden",!state.isDeveloper);avatar.headId=Math.max(1,Math.min(6,Number(character.headId??character.head_id)||1));avatar.bodyId=Math.max(1,Math.min(6,Number(character.bodyId??character.body_id)||1));applyWorldAvatar();}}catch(error){console.warn("Could not load saved avatar:",error);}
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