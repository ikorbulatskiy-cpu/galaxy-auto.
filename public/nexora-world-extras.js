/* NEXORA room UX: chat mentions, slash commands, character carousel, planet creation. */
(() => {
  "use strict";
  const root=document.getElementById("tab-world");if(!root)return;
  const $=(s,r=root)=>r.querySelector(s);
  const commands=[["/гороскоп","✦ Гороскоп"],["/сон","☾ Сон"],["/любовь","♡ Любовь"],["/ответ","✉ Ответ"],["/5букв","▦ 5 букв"],["/викторина","❔ Викторина"],["/анаграмма","🔤 Анаграмма"],["/рейтинг","★ Рейтинг"]];
  let modal=null,selectedIndex=0;
  const safe=v=>String(v||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function showModal(title,body){
    if(!modal){modal=document.createElement("div");modal.className="nx-world-modal";modal.hidden=true;modal.innerHTML='<section class="nx-world-dialog" role="dialog" aria-modal="true"><button type="button" data-close style="float:right">×</button><div data-content></div></section>';document.body.append(modal);modal.addEventListener("click",e=>{if(e.target===modal||e.target.closest("[data-close]"))modal.hidden=true});document.addEventListener("keydown",e=>{if(e.key==="Escape"&&modal)modal.hidden=true})}
    modal.querySelector("[data-content]").innerHTML="<h2>"+safe(title)+"</h2>"+body;modal.hidden=false;return modal;
  }
  function openPlanetModal(create){
    const box=showModal("Создать планету",'<form data-planet-form><label>Название планеты</label><input name="name" minlength="3" maxlength="48" required placeholder="Например, Звёздная гавань"><label>Описание</label><textarea name="description" maxlength="300" rows="2"></textarea><label>Фон сцены</label><select name="theme"><option value="sunset">Закатный город</option><option value="space">Космос</option><option value="forest">Лесная поляна</option><option value="city">Ночной город</option><option value="underwater">Подводный мир</option></select><label>Погода</label><select name="weather"><option>Ясно</option><option>Звёздный дождь</option><option>Снег</option><option>Туман</option></select><label>Интерьер</label><input name="interior" maxlength="60" value="Центральный зал"><label>Модули планеты</label><label><input type="checkbox" name="modules" value="magic" checked> Магия и гороскопы</label><label><input type="checkbox" name="modules" value="games" checked> Игры и викторины</label><label><input type="checkbox" name="modules" value="defender"> Защитник</label><label><input type="checkbox" name="modules" value="love"> Любовный помощник</label><div class="nx-dialog-actions"><button type="button" data-close>Отмена</button><button class="primary" type="submit">Создать · 3 Coins</button></div><p class="muted">Оплата 3 Nexora Coins проверяется сервером.</p></form>');
    const form=box.querySelector("[data-planet-form]");
    form.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(form),payload={name:String(f.get("name")||"").trim(),description:String(f.get("description")||""),theme:String(f.get("theme")||"sunset"),weather:String(f.get("weather")||"Ясно"),interior:String(f.get("interior")||"Центральный зал"),modules:f.getAll("modules")};const button=form.querySelector('[type="submit"]');button.disabled=true;button.textContent="Создаём…";try{await create(payload);box.hidden=true}catch(error){const note=document.createElement("p");note.className="nx-planet-module-note";note.textContent=error.message||"Не удалось создать планету.";form.append(note);button.disabled=false;button.textContent="Повторить"}});
  }
  const planetObjectChoices=[
    ["tree","Дерево"],["bench","Скамейка"],["fountain","Фонтан"],["lamp","Фонарь"],
    ["flowerbed","Клумба"],["kiosk","Киоск"],["palm","Пальма"],["beach_chair","Шезлонг"],
    ["club_table","Столик клуба"],["dj_booth","DJ-пульт"],["sofa","Диван"],["plant","Растение"]
  ];
  async function openPlanetDecorations(planet){
    let objects=[];
    try{const data=await window.NexoraAPI.request("/api/game/planets/"+encodeURIComponent(planet.slug)+"/objects");objects=data.objects||[]}
    catch(error){showModal("Декорации планеты",'<p class="muted">'+safe(error.message)+'</p>');return}
    const rows=objects.length?objects.map((o,index)=>'<div class="nx-planet-object-row"><span><b>'+safe(planetObjectChoices.find(x=>x[0]===o.code)?.[1]||o.code)+'</b><small class="muted">X '+Math.round(Number(o.x)*100)+'% · Y '+Math.round(Number(o.y)*100)+'% · масштаб '+Number(o.scale||1).toFixed(2)+'</small></span><button type="button" data-remove-object="'+index+'">Убрать</button></div>').join(""):'<p class="muted">На планете пока нет декораций.</p>';
    const options=planetObjectChoices.map(([code,label])=>'<option value="'+code+'">'+label+'</option>').join("");
    const box=showModal("Декорации: "+planet.name,
      '<form data-object-form><label>Объект</label><select name="code">'+options+'</select><div class="nx-object-coordinates"><label>X, %<input name="x" type="number" min="0" max="100" value="50" required></label><label>Y, %<input name="y" type="number" min="0" max="100" value="82" required></label></div><div class="nx-object-coordinates"><label>Поворот<input name="rotation" type="number" min="-360" max="360" value="0"></label><label>Масштаб<input name="scale" type="number" min="0.5" max="2" step="0.05" value="1"></label></div><div class="nx-dialog-actions"><button type="submit" class="primary">Добавить объект</button></div></form><div class="nx-planet-object-list">'+rows+'</div><div class="nx-dialog-actions"><button type="button" data-close>Готово</button></div>');
    const save=async next=>{
      await window.NexoraAPI.request("/api/game/planets/"+encodeURIComponent(planet.slug)+"/objects",{method:"PUT",body:JSON.stringify({objects:next})});
      if(window.nexoraWorldRefresh)await window.nexoraWorldRefresh();
      await openPlanetDecorations(planet);
    };
    box.querySelector("[data-object-form]").addEventListener("submit",async event=>{
      event.preventDefault();const form=new FormData(event.currentTarget);
      const item={code:String(form.get("code")),x:Number(form.get("x"))/100,y:Number(form.get("y"))/100,rotation:Number(form.get("rotation")||0),scale:Number(form.get("scale")||1)};
      try{await save(objects.concat([item]))}catch(error){const note=document.createElement("p");note.className="nx-planet-module-note";note.textContent=error.message;event.currentTarget.append(note)}
    });
    box.querySelectorAll("[data-remove-object]").forEach(button=>button.addEventListener("click",async()=>{
      const next=objects.filter((_,index)=>index!==Number(button.dataset.removeObject));
      try{await save(next)}catch(error){const note=document.createElement("p");note.className="nx-planet-module-note";note.textContent=error.message;box.append(note)}
    }));
  }
  async function openMyPlanets(){
    let planets=[];try{const d=await window.NexoraAPI.request("/api/game/planets");planets=(d.planets||[]).filter(p=>p.is_owner)}catch(e){showModal("Мои планеты",'<div class="nx-my-planets-empty"><div class="crown">♛</div><b>Не удалось загрузить планеты</b><p>'+safe(e.message)+'</p></div>');return}
    const list=planets.length?planets.map(p=>'<div class="nx-my-planet-row"><span><b>'+safe(p.name)+'</b><small class="muted"> · '+Number(p.rooms||0)+' комнат · '+Number(p.online||0)+' онлайн</small></span><span><button type="button" data-decorate-planet="'+safe(p.slug)+'">Декор</button> ♛</span></div>').join(""):'<div class="nx-my-planets-empty"><div class="crown">♛</div><b>Здесь будут твои планеты</b><span class="muted">Создай собственную комнату и выбери её оформление.</span></div>';
    const box=showModal("Мои планеты",list+'<div class="nx-dialog-actions"><button type="button" data-close>Закрыть</button><button type="button" class="primary" data-buy>Купить планету</button></div>');
    box.querySelectorAll("[data-decorate-planet]").forEach(button=>button.addEventListener("click",()=>{const planet=planets.find(p=>p.slug===button.dataset.decoratePlanet);if(planet)openPlanetDecorations(planet)}));
    box.querySelector("[data-buy]").addEventListener("click",()=>openPlanetModal(async payload=>{const d=await window.NexoraAPI.request("/api/game/planets",{method:"POST",body:JSON.stringify(payload)});if(window.nexoraWorldRefresh)await window.nexoraWorldRefresh();if(d.planet?.slug){const search=$("#nx-planet-search");if(search)search.value=d.planet.name;if(window.nexoraTravelTo)await window.nexoraTravelTo(d.planet.slug)}await openMyPlanets()}));
  }
  function installChat(){
    const form=$("#nx-chat-form"),input=form?.elements?.body,log=$("#nx-chat-log");if(!form||!input||form.dataset.extrasReady)return;form.dataset.extrasReady="1";
    const panel=document.createElement("div");panel.className="nx-command-suggestions";panel.hidden=true;
    commands.forEach(([cmd,label])=>{const b=document.createElement("button");b.type="button";b.textContent=label;b.addEventListener("click",()=>{input.value=cmd+" ";input.focus();panel.hidden=true});panel.append(b)});form.append(panel);
    input.addEventListener("input",()=>{panel.hidden=!input.value.trimStart().startsWith("/")});
    input.addEventListener("keydown",e=>{if(e.key==="Escape")panel.hidden=true});
    form.addEventListener("submit",()=>panel.hidden=true);
    log?.addEventListener("click",e=>{const author=e.target.closest(".nx-message-author");if(!author)return;const name=author.textContent.replace(/:\s*$/,"").trim();input.value=name+", "+input.value;input.focus()});
  }
  function installCarousel(){
    const scene=$(".nx-scene"),stage=$("#nx-avatars");if(!scene||!stage||$(".nx-stage-carousel",scene))return;
    const bar=document.createElement("div");bar.className="nx-stage-carousel";bar.innerHTML='<button type="button" data-prev aria-label="Предыдущий персонаж">‹</button><strong data-name>Персонаж</strong><button type="button" data-next aria-label="Следующий персонаж">›</button>';scene.append(bar);
    const select=i=>{const cards=[...stage.querySelectorAll(".nx-avatar-card")];if(!cards.length)return;selectedIndex=(i+cards.length)%cards.length;cards.forEach((c,n)=>c.classList.toggle("nx-selected",n===selectedIndex));bar.querySelector("[data-name]").textContent=cards[selectedIndex].querySelector(".nx-avatar-name")?.textContent?.trim()||"Персонаж"};
    bar.querySelector("[data-prev]").onclick=()=>select(selectedIndex-1);bar.querySelector("[data-next]").onclick=()=>select(selectedIndex+1);
    stage.addEventListener("click",e=>{const card=e.target.closest(".nx-avatar-card");if(card)select([...stage.querySelectorAll(".nx-avatar-card")].indexOf(card))});
    new MutationObserver(()=>select(Math.min(selectedIndex,Math.max(0,stage.querySelectorAll(".nx-avatar-card").length-1)))).observe(stage,{childList:true});select(0);
  }
  async function updateUnreadMail(){
    try{
      const data=await window.NexoraAPI.request("/api/social/conversations");
      const count=(data.conversations||[]).reduce((sum,item)=>sum+Number(item.unread_count||0),0);
      const mail=$("#nx-menu-panel [data-open-tab='messages']");
      if(!mail)return;
      let badge=mail.querySelector(".nx-mail-unread");
      if(count>0){if(!badge){badge=document.createElement("span");badge.className="nx-mail-unread";mail.append(badge)}badge.textContent=String(count)}
      else badge?.remove();
    }catch{}
  }
  function installDrawer(){
    const menu=$("#nx-menu-panel");if(!menu||menu.dataset.extrasReady)return;menu.dataset.extrasReady="1";
    const grid=menu.querySelector(".nx-menu-grid");if(grid){const b=document.createElement("button");b.type="button";b.innerHTML="<span>♛</span>Мои планеты";b.onclick=()=>{menu.hidden=true;openMyPlanets()};grid.append(b)}
  }
  window.addEventListener("nexora:planet-modules",e=>{const names={magic:"Магия",defender:"Защитник",games:"Игры",horoscope:"Гороскопы",love:"Любовный помощник"};const active=(e.detail?.modules||[]).map(k=>names[k]||k);const note=document.createElement("div");note.className="nx-planet-module-note";note.textContent=active.length?"! На планете установлены модули: "+active.join(", "):"! Дополнительные модули не установлены.";const log=$("#nx-chat-log");if(log){log.append(note);log.scrollTo({top:log.scrollHeight,behavior:"smooth"})}});
  const scan=()=>{installChat();installCarousel();installDrawer()};new MutationObserver(scan).observe(root,{childList:true,subtree:true});scan();updateUnreadMail();setInterval(updateUnreadMail,30000);
  async function showCharacterInfo(name,userId){
    const box=showModal("Информация о персонаже",'<p>'+safe(name)+'</p><p class="muted">Загружаем профиль…</p>');
    if(!userId){box.querySelector("[data-content]").innerHTML='<h2>Информация о персонаже</h2><p>'+safe(name)+'</p><p class="muted">Профиль пока недоступен.</p><div class="nx-dialog-actions"><button type="button" data-close>Закрыть</button></div>';return;}
    try{
      const data=await window.NexoraAPI.request("/api/social/users/"+encodeURIComponent(userId));
      const p=data.profile||{};
      const interests=Array.isArray(p.interests)?p.interests.join(", "):"";
      box.querySelector("[data-content]").innerHTML='<h2>Информация о персонаже</h2><p><b>'+safe(p.display_name||p.character_name||name)+'</b> · @'+safe(p.username)+'</p><p>Город: '+safe(p.city||"Не указан")+'</p><p>Уровень: '+Number(p.level||1)+' · Авторитет: '+Number(p.authority||0)+'</p><p>'+safe(p.bio||"Описание не заполнено.")+'</p><p>Интересы: '+safe(interests||"Не указаны")+'</p><div class="nx-dialog-actions"><button type="button" data-close>Закрыть</button></div>';
    }catch(error){box.querySelector("[data-content]").innerHTML='<h2>Информация о персонаже</h2><p>'+safe(name)+'</p><p class="muted">'+safe(error.message||"Профиль недоступен.")+'</p><div class="nx-dialog-actions"><button type="button" data-close>Закрыть</button></div>';}
  }
  window.NexoraExtras=Object.freeze({openPlanetModal,openMyPlanets,showCharacterInfo});
})();
