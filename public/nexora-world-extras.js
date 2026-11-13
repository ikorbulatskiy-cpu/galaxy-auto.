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
    const box=showModal("Создать планету",'<form data-planet-form><label>Название твоей планеты</label><input name="name" minlength="3" maxlength="48" required autocomplete="off" placeholder="Например, Звёздная гавань"><p class="muted">Название будет видно всем игрокам в списке планет и над комнатой.</p><div class="nx-dialog-actions"><button type="button" data-close>Отмена</button><button class="primary" type="submit">Создать за 2.99 Coins</button></div><p class="muted">Стоимость спишется с баланса только после успешного создания. Комната и статус владельца создаются автоматически.</p></form>');
    const form=box.querySelector("[data-planet-form]");
    form.addEventListener("submit",async e=>{
      e.preventDefault();
      const name=String(new FormData(form).get("name")||"").trim();
      const button=form.querySelector('[type="submit"]');
      button.disabled=true;button.textContent="Создаём планету…";
      try{await create({name});box.hidden=true}
      catch(error){
        const note=form.querySelector(".nx-planet-module-note")||document.createElement("p");
        note.className="nx-planet-module-note";note.textContent=error.message||"Не удалось создать планету.";
        if(!note.parentNode)form.append(note);
        button.disabled=false;button.textContent="Повторить · 2.99 Coins";
      }
    });
  }
  async function openMyPlanets(){
    let planets=[];try{const d=await window.NexoraAPI.request("/api/game/planets");planets=(d.planets||[]).filter(p=>p.is_owner)}catch(e){showModal("Мои планеты",'<div class="nx-my-planets-empty"><div class="crown">♛</div><b>Не удалось загрузить планеты</b><p>'+safe(e.message)+'</p></div>');return}
    const list=planets.length?planets.map(p=>'<div class="nx-my-planet-row"><span><b>'+safe(p.name)+'</b><small class="muted"> · '+Number(p.rooms||0)+' комнат · '+Number(p.online||0)+' онлайн</small></span><span>♛</span></div>').join(""):'<div class="nx-my-planets-empty"><div class="crown">♛</div><b>Здесь будут твои планеты</b><span class="muted">Создай собственную комнату и выбери её оформление.</span></div>';
    const box=showModal("Мои планеты",list+'<div class="nx-dialog-actions"><button type="button" data-close>Закрыть</button><button type="button" class="primary" data-buy>Купить планету</button></div>');
    box.querySelector("[data-buy]").addEventListener("click",()=>openPlanetModal(async payload=>{const d=await window.NexoraAPI.request("/api/game/planets",{method:"POST",body:JSON.stringify(payload)});if(window.nexoraWorldRefresh)await window.nexoraWorldRefresh();if(d.planet?.name){const search=$("#nx-planet-search");if(search)search.value=d.planet.name}await openMyPlanets()}));
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
