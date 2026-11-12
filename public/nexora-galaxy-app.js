/* NEXORA Galaxy app interaction layer. Reuses the existing authenticated REST/WebSocket client. */
(()=>{
 "use strict";
 const dashboard=document.getElementById("dashboard");
 if(!dashboard)return;
 const $=(s,r=document)=>r.querySelector(s);
 const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
 const toast=message=>{const node=document.querySelector(".toast");if(node){node.textContent=message;node.classList.add("show");setTimeout(()=>node.classList.remove("show"),2200)}};
 let worldReady=false;
 function decorateMessages(log){
  if(!log)return;
  log.querySelectorAll(".nx-chat-line:not([data-galaxy-decorated])").forEach(line=>{
   const old=[...line.childNodes];
   const stamp=old.find(n=>n.nodeType===1&&n.tagName==="SMALL");
   const name=old.find(n=>n.nodeType===1&&n.tagName==="B");
   const body=old.find(n=>n.nodeType===1&&n.tagName==="SPAN");
   if(!name||!body)return;
   const label=name.textContent.replace(/:\s*$/,"").trim();
   const initials=(label||"N").slice(0,1).toLocaleUpperCase("ru-RU");
   const avatar=make("span","nx-message-avatar",initials);avatar.setAttribute("aria-hidden","true");
   const bubble=make("div","nx-message-bubble");
   const meta=make("div","nx-message-meta");
   name.className="nx-message-author";
   const time=make("time","",stamp?.textContent||"");
   meta.append(name,time);
   const text=make("div","nx-message-text",body.textContent||"");
   bubble.append(meta,text);
   if(/galaxy|система|бот/i.test(label))bubble.classList.add("system");
   line.replaceChildren(avatar,bubble);
   line.dataset.galaxyDecorated="1";
  });
 }
 function addTopic(log){
  if(!log||log.querySelector(".nx-chat-topic"))return;
  const topic=make("div","nx-chat-topic");
  topic.append(make("span","","✉"));
  const copy=make("div");
  copy.append(make("b","","Топик"));
  copy.append(make("p","","Добро пожаловать на планету! Общайся уважительно, знакомься и соблюдай правила комнаты."));
  topic.append(copy);log.prepend(topic);
 }
 function openPlanetSheet(sheet){sheet.classList.add("open");sheet.setAttribute("aria-hidden","false");document.body.style.overflow="hidden"}
 function closePlanetSheet(sheet){sheet.classList.remove("open");sheet.setAttribute("aria-hidden","true");document.body.style.overflow=""}
 function enhanceWorld(world){
  if(world.dataset.galaxyAppReady)return;
  world.dataset.galaxyAppReady="1";worldReady=true;
  const top=$(".nx-topbar",world),planet=$(".nx-current-planet",world),tools=$(".nx-planet-tools",world);
  if(!top||!planet||!tools)return;
  planet.setAttribute("role","button");planet.setAttribute("tabindex","0");planet.setAttribute("aria-label","Сменить планету");
  const online=$("#nx-online",world);
  if(online){online.classList.add("nx-online");top.insertBefore(online,planet.nextSibling)}
  const statusSource=$("#nx-status",world);
  if(statusSource){
   let badge=$("#nx-connection-indicator",top);
   if(!badge){
    badge=make("div","nx-connection-status");
    badge.id="nx-connection-indicator";
    badge.setAttribute("role","status");
    badge.setAttribute("aria-live","polite");
    const exit= $(".nx-exit-button",top);
    if(exit)top.insertBefore(badge,exit);else top.append(badge);
   }
   const updateConnection=()=>{
    const raw=(statusSource.textContent||"").trim();
    const lower=raw.toLocaleLowerCase("ru");
    let state="pending",label="Подключение";
    if(/соединение:\s*(отличное|стабильное|активно)|соединение с комнатой установлено|подключен к комнате|connected/.test(lower)){
     state="connected";label="На связи";
    }else if(/связь потеряна|проблема сети|закрыт|ошиб|недоступ|не удалось|timeout|failed/.test(lower)){
     state="error";label="Нет связи";
    }else if(/подключ|восстанавливаем|ожидан|проверяет подключение/.test(lower)){
     state="pending";label="Подключение";
    }else if(badge.dataset.state==="connected"){
     state="connected";label="На связи";
    }else if(badge.dataset.state==="error"){
     state="error";label="Нет связи";
    }
    badge.dataset.state=state;
    badge.textContent=label;
    badge.title=raw||"Состояние подключения";
   };
   updateConnection();
   new MutationObserver(updateConnection).observe(statusSource,{childList:true,characterData:true,subtree:true});
  }
  const backdrop=make("div","nx-planet-sheet-backdrop");
  backdrop.setAttribute("aria-hidden","true");
  const sheet=make("section","nx-planet-sheet");sheet.setAttribute("role","dialog");sheet.setAttribute("aria-modal","true");sheet.setAttribute("aria-label","Сменить планету");
  sheet.append(make("div","nx-planet-sheet-handle"),make("h2","","◎ Сменить планету"));
  const cats=make("div","nx-planet-categories");
  [["◷","Последние"],["★","Избранные"],["🔥","Популярные"],["⌖","Планеты города"],["♛","Мои планеты"],["♟","Планеты с друзьями"],["⌕","Поиск планет"]].forEach(([icon,label],i)=>{
   const b=make("button","",icon+"  "+label);b.type="button";if(i===6)b.classList.add("active");
   b.addEventListener("click",()=>{cats.querySelectorAll("button").forEach(x=>x.classList.remove("active"));b.classList.add("active");const input=$("#nx-planet-search",sheet);if(input){input.focus();input.placeholder=label==="Поиск планет"?"Название планеты для поиска":"Планета: "+label}});
   cats.append(b);
  });
  sheet.append(cats,tools);
  const close=make("button","btn","Закрыть");close.type="button";close.style.width="100%";close.style.marginTop="10px";close.addEventListener("click",()=>closePlanetSheet(backdrop));sheet.append(close);backdrop.append(sheet);document.body.append(backdrop);
  const open=()=>openPlanetSheet(backdrop);
  planet.addEventListener("click",open);planet.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open()}});
  backdrop.addEventListener("click",e=>{if(e.target===backdrop)closePlanetSheet(backdrop)});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&backdrop.classList.contains("open"))closePlanetSheet(backdrop)});
  $("#nx-refresh",sheet)?.addEventListener("click",()=>setTimeout(()=>closePlanetSheet(backdrop),100));
  $("#nx-room-select",sheet)?.addEventListener("change",()=>setTimeout(()=>closePlanetSheet(backdrop),250));
  $("#nx-planet-search",sheet)?.addEventListener("change",()=>setTimeout(()=>closePlanetSheet(backdrop),250));
  const log=$("#nx-chat-log",world);addTopic(log);decorateMessages(log);
  if(log)new MutationObserver(()=>decorateMessages(log)).observe(log,{childList:true});
  const nav=$(".nx-bottom-nav",world);
  if(nav){
   const buttons=[...nav.querySelectorAll("button")];
   const hide=buttons.find(b=>/Выход/.test(b.textContent));hide?.remove();
   buttons.forEach(b=>{if(/Планеты/.test(b.textContent)){b.addEventListener("click",e=>{e.preventDefault();open()})}});
  }
 }
 function enhanceSections(){
  const discover=$("#tab-discover");
  if(discover&&!discover.querySelector(".nx-search-filters")){
   const form=$("#search-form",discover);
   if(form){
    const filters=make("div","nx-search-filters");
    [["users","Пользователи"],["profiles","Анкеты"],["planets","Планеты"],["clans","Кланы"]].forEach(([key,label],i)=>{
     const b=make("button","",label);b.type="button";b.dataset.kind=key;if(i===0)b.classList.add("active");
     b.addEventListener("click",()=>{
      filters.querySelectorAll("button").forEach(x=>x.classList.remove("active"));b.classList.add("active");
      if(key==="planets"){window.switchTab?.("world");return}
      if(key==="clans"){window.switchTab?.("clans");return}
      const input=$('input[name="q"]',form);if(input)input.placeholder=key==="profiles"?"Имя, возраст или город":"Ник, планета или клан";
     });filters.append(b);
    });
    form.before(filters);
    const age=make("button","btn nx-search-age-city","☷ Поиск по возрасту и городу");age.type="button";
    age.addEventListener("click",()=>{const input=$('input[name="q"]',form);if(input){input.placeholder="Укажи город или возраст в запросе";input.focus()}else toast("Поиск по городу доступен через строку поиска.")});
    filters.after(age);
   }
  }
  const friends=$("#tab-friends");
  if(friends&&!friends.querySelector(".nx-friends-city-banner")){
   const banner=make("div","nx-friends-city-banner");
   banner.append(make("b","","🌍 Найди друзей рядом"),document.createTextNode("Укажи город в профиле, чтобы другим игрокам было проще находить тебя."));
   const grid=$(".dashgrid",friends);if(grid)grid.before(banner);
  }
  const messages=$("#tab-messages");
  if(messages&&!messages.querySelector(".nx-new-message-fab")){
   const fab=make("button","nx-new-message-fab","＋");fab.type="button";fab.setAttribute("aria-label","Найти собеседника");
   fab.addEventListener("click",()=>window.switchTab?.("discover"));messages.append(fab);
  }
 }
 const scan=()=>{
  const world=$("#tab-world>.nx-world");
  if(world)enhanceWorld(world);
  enhanceSections();
 };
 scan();
 new MutationObserver(scan).observe(dashboard,{childList:true,subtree:true});
})();