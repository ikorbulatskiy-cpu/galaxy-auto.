/* NEXORA room UX: chat mentions, slash commands, character carousel, planet creation. */
(() => {
  "use strict";
  const root=document.getElementById("tab-world");if(!root)return;
  const $=(s,r=root)=>r.querySelector(s);
  const commands=[["/гороскоп","✦ Гороскоп"],["/сон","☾ Сон"],["/любовь","♡ Любовь"],["/ответ","✉ Ответ"],["/5букв","▦ 5 букв"],["/викторина","❔ Викторина"],["/анаграмма","🔤 Анаграмма"],["/рейтинг","★ Рейтинг"]];
  let modal=null,selectedIndex=0;
  const safe=v=>String(v||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function showModal(title,body){
    if(!modal){modal=document.createElement("div");modal.className="nx-world-modal";modal.hidden=true;modal.innerHTML='<section class="nx-world-dialog" role="dialog" aria-modal="true"><button type="button" data-close style="float:right">×</button><div data-content></div></section>';root.append(modal);modal.addEventListener("click",e=>{if(e.target===modal||e.target.closest("[data-close]"))modal.hidden=true});document.addEventListener("keydown",e=>{if(e.key==="Escape"&&modal)modal.hidden=true})}
    modal.querySelector("[data-content]").innerHTML="<h2>"+safe(title)+"</h2>"+body;modal.hidden=false;return modal;
  }
  function openPlanetModal(create){
    const box=showModal("Создать планету",'<form data-planet-form><label>Название планеты</label><input name="name" minlength="3" maxlength="48" required placeholder="Например, Звёздная гавань"><label>Описание</label><textarea name="description" maxlength="300" rows="2"></textarea><label>Фон сцены</label><select name="theme"><option value="sunset">Закатный город</option><option value="space">Космос</option><option value="forest">Лесная поляна</option><option value="city">Ночной город</option><option value="underwater">Подводный мир</option></select><label>Погода</label><select name="weather"><option>Ясно</option><option>Звёздный дождь</option><option>Снег</option><option>Туман</option></select><label>Интерьер</label><input name="interior" maxlength="60" value="Центральный зал"><label>Модули планеты</label><label><input type="checkbox" name="modules" value="magic" checked> Магия и гороскопы</label><label><input type="checkbox" name="modules" value="games" checked> Игры и викторины</label><label><input type="checkbox" name="modules" value="defender"> Защитник</label><label><input type="checkbox" name="modules" value="love"> Любовный помощник</label><div class="nx-dialog-actions"><button type="button" data-close>Отмена</button><button class="primary" type="submit">Создать · 3 Coins</button></div><p class="muted">Оплата 3 Nexora Coins проверяется сервером.</p></form>');
    const form=box.querySelector("[data-planet-form]");
    form.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(form),payload={name:String(f.get("name")||"").trim(),description:String(f.get("description")||""),theme:String(f.get("theme")||"sunset"),weather:String(f.get("weather")||"Ясно"),interior:String(f.get("interior")||"Центральный зал"),modules:f.getAll("modules")};const button=form.querySelector('[type="submit"]');button.disabled=true;button.textContent="Создаём…";try{await create(payload);box.hidden=true}catch(error){const note=document.createElement("p");note.className="nx-planet-module-note";note.textContent=error.message||"Не удалось создать планету.";form.append(note);button.disabled=false;button.textContent="Повторить"}});
  }
  async function openMyPlanets(){
    let planets=[];try{const d=await window.NexoraAPI.request("/api/game/planets");planets=(d.planets||[]).filter(p=>p.is_owner)}catch(e){showModal("Мои планеты",'<div class="nx-my-planets-empty"><div class="crown">♛</div><b>Не удалось загрузить планеты</b><p>'+safe(e.message)+'</p></div>');return}
    const list=planets.length?planets.map(p=>'<div class="nx-my-planet-row"><span><b>'+safe(p.name)+'</b><small class="muted"> · '+Number(p.rooms||0)+' комнат · '+Number(p.online||0)+' онлайн</small></span><span>♛</span></div>').join(""):'<div class="nx-my-planets-empty"><div class="crown">♛</div><b>Здесь будут твои планеты</b><span class="muted">Создай собственную комнату и выбери её оформление.</span></div>';
    const box=showModal("Мои планеты",list+'<div class="nx-dialog-actions"><button type="button" data-close>Закрыть</button><button type="button" class="primary" data-buy>Купить планету</button></div>');
    box.querySelector("[data-buy]").addEventListener("click",()=>openPlanetModal(async payload=>{const d=await window.NexoraAPI.request("/api/game/planets",{method:"POST",body:JSON.stringify(payload)});if(window.nexoraWorldRefresh)await window.nexoraWorldRefresh();if(d.planet?.slug){const search=$("#nx-planet-search");if(search)search.value=d.planet.name;const go=$("#nx-planet-go");if(go)go.click()}await openMyPlanets()}));
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
  function installDrawer(){
    const menu=$("#nx-menu-panel");if(!menu||menu.dataset.extrasReady)return;menu.dataset.extrasReady="1";
    const grid=menu.querySelector(".nx-menu-grid");if(grid){const b=document.createElement("button");b.type="button";b.innerHTML="<span>♛</span>Мои планеты";b.onclick=()=>{menu.hidden=true;openMyPlanets()};grid.append(b)}
  }
  window.addEventListener("nexora:planet-modules",e=>{const names={magic:"Магия",defender:"Защитник",games:"Игры",horoscope:"Гороскопы",love:"Любовный помощник"};const active=(e.detail?.modules||[]).map(k=>names[k]||k);const note=document.createElement("div");note.className="nx-planet-module-note";note.textContent=active.length?"! На планете установлены модули: "+active.join(", "):"! Дополнительные модули не установлены.";const log=$("#nx-chat-log");if(log){log.append(note);log.scrollTo({top:log.scrollHeight,behavior:"smooth"})}});
  const scan=()=>{installChat();installCarousel();installDrawer()};new MutationObserver(scan).observe(root,{childList:true,subtree:true});scan();
  function showCharacterInfo(name){showModal("Информация о персонаже",'<p>'+safe(name)+'</p><p class="muted">Персонаж находится в текущей комнате NEXORA.</p><div class="nx-dialog-actions"><button type="button" data-close>Закрыть</button></div>');}
  window.NexoraExtras=Object.freeze({openPlanetModal,openMyPlanets,showCharacterInfo});
})();
