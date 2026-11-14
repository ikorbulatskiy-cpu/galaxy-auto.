/* Planet title menu: switch, information, invitations, online count and local chat clear. */
(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let modal,current;
  const planets=()=>window.nexoraWorldGetPlanets?.()||[];
  const currentPlanet=()=>{const label=$("#nx-top-planet")?.textContent?.trim();return planets().find(p=>p.name===label)||planets().find(p=>p.is_current)||null};
  function ensureModal(){
    if(modal?.isConnected)return modal;
    modal=document.createElement("section");modal.id="nx-planet-actions-modal";modal.className="nx-planet-actions-modal";modal.hidden=true;
    modal.innerHTML='<div class="nx-planet-actions-backdrop" data-close></div><div class="nx-planet-actions-card" role="dialog" aria-modal="true" aria-labelledby="nx-planet-actions-title"><header><div><small>ТЕКУЩАЯ ПЛАНЕТА</small><h2 id="nx-planet-actions-title"></h2></div><button type="button" data-close aria-label="Закрыть">×</button></header><div class="nx-planet-actions-content"></div></div>';
    document.body.append(modal);
    modal.addEventListener("click",async e=>{
      if(e.target.closest("[data-close]")){modal.hidden=true;return}
      const b=e.target.closest("[data-planet-action]");if(!b)return;
      const action=b.dataset.planetAction;
      if(action==="switch"){
        modal.hidden=true;
        const move=window.nexoraTravelToNextPlanet;
        if(typeof move==="function")move();
        return;
      }
      if(action==="back"){renderMain();return}
      if(action==="travel"){
        const slug=b.dataset.slug;modal.hidden=true;
        if(slug)window.nexoraTravelTo?.(slug);
        return;
      }
      if(action==="info"){renderInfo();return}
      if(action==="invite"){await invite();return}
      if(action==="clear"){
        const log=$("#nx-chat-log");
        if(!log)return;
        if(!window.confirm("Очистить сообщения из окна чата на этом устройстве? История на сервере и у других игроков останется."))return;
        log.replaceChildren();
        const note=document.createElement("div");note.className="nx-chat-cleared-note";note.textContent="Окно чата очищено.";
        log.append(note);
        window.toast?.("Окно чата очищено.");
        return;
      }
    });
    return modal;
  }
  function titleFor(p){return p?.name||$("#nx-top-planet")?.textContent?.trim()||"Планета"}
  function renderMain(){
    const p=currentPlanet()||current;
    const title=titleFor(p),online=Number(p?.online||0);
    $("#nx-planet-actions-title",modal).textContent=title;
    $(".nx-planet-actions-content",modal).innerHTML=
      '<button class="nx-planet-action" data-planet-action="switch"><span>🪐</span><span><b>Сменить планету</b><small>Сразу перелететь на следующую планету</small></span><i>›</i></button>'+
      '<button class="nx-planet-action" data-planet-action="info"><span>ⓘ</span><span><b>Инфо планеты</b><small>Описание и владелец</small></span><i>›</i></button>'+
      '<button class="nx-planet-action" data-planet-action="invite"><span>✉</span><span><b>Позвать на планету</b><small>Отправить приглашение друзьям</small></span><i>›</i></button>'+
      '<div class="nx-planet-online"><span>● Сейчас онлайн</span><b>'+online+'</b><small>Игроков на планете</small></div>'+
      '<button class="nx-planet-action nx-planet-action-danger" data-planet-action="clear"><span>⌫</span><span><b>Очистить чат</b><small>Очистить окно чата только у тебя</small></span><i>›</i></button>';
  }
  function renderSwitch(){
    $("#nx-planet-actions-title",modal).textContent="Сменить планету";
    const list=planets();
    $(".nx-planet-actions-content",modal).innerHTML='<button class="nx-planet-back" data-planet-action="back">‹ Назад</button>'+
      (list.length?list.map(p=>'<button class="nx-planet-action '+(p.is_current?"is-current":"")+'" data-planet-action="travel" data-slug="'+esc(p.slug)+'"><span>🪐</span><span><b>'+esc(p.name)+'</b><small>'+Number(p.online||0)+' онлайн · '+(p.is_current?"Вы здесь":"Перелететь")+'</small></span><i>'+(p.is_current?"✓":"›")+'</i></button>').join(""):'<p class="nx-planet-empty">Список планет пока пуст.</p>');
  }
  function renderInfo(){
    const p=currentPlanet()||current;
    $("#nx-planet-actions-title",modal).textContent="Инфо планеты";
    $(".nx-planet-actions-content",modal).innerHTML='<button class="nx-planet-back" data-planet-action="back">‹ Назад</button>'+
      '<div class="nx-planet-info"><h3>'+esc(titleFor(p))+'</h3><p>'+esc(p?.description||"Описание этой планеты пока не добавлено.")+'</p><dl><div><dt>Сейчас онлайн</dt><dd>'+Number(p?.online||0)+'</dd></div><div><dt>Владелец</dt><dd>'+esc(p?.owner_name||"Не указан")+'</dd></div><div><dt>Комнаты</dt><dd>'+Number(p?.rooms||0)+'</dd></div><div><dt>Доступ</dt><dd>'+esc(p?.access_type||"Открытый")+'</dd></div></dl></div>';
  }
  async function invite(){
    const p=currentPlanet()||current,name=titleFor(p);
    const url=new URL(location.href);url.searchParams.set("planet",p?.slug||"");
    const message="Присоединяйся ко мне на планете «"+name+"» в NEXORA: "+url.toString();
    try{
      if(navigator.share)await navigator.share({title:"Приглашение в NEXORA",text:message,url:url.toString()});
      else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(message);window.toast?.("Приглашение скопировано.");}
      else{window.prompt("Скопируй приглашение:",message);}
    }catch(e){if(e?.name!=="AbortError")window.toast?.("Не удалось отправить приглашение.");}
  }
  function setup(){
    const world=$("#tab-world .nx-world"),bar=$(".nx-topbar",world);
    if(!world||!bar||bar.dataset.planetTitleReady)return false;
    const logo=$(".nx-logo",bar),planet=$(".nx-current-planet",bar),hamburger=$(".nx-menu-trigger",bar);
    if(!planet||!hamburger)return false;
    bar.dataset.planetTitleReady="1";
    logo?.remove();
    const small=$("small",planet);if(small)small.remove();
    planet.classList.add("nx-planet-title-trigger");
    planet.setAttribute("role","button");planet.setAttribute("tabindex","0");
    planet.setAttribute("aria-haspopup","dialog");planet.setAttribute("aria-label","Открыть меню планеты");
    hamburger.insertAdjacentElement("afterend",planet);
    const open=()=>{ensureModal();current=currentPlanet();renderMain();modal.hidden=false};
    planet.addEventListener("click",open);
    planet.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open()}});
    const exit=$("#nx-menu-exit");if(exit)exit.hidden=true;
    const online=$("#nx-online");if(online)online.hidden=true;
    const count=$("#nx-event-online");if(count)count.hidden=true;
    return true;
  }
  if(!setup()){
    const observer=new MutationObserver(()=>{if(setup())observer.disconnect()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
  window.addEventListener("nexora:room-joined",()=>{if(modal&&!modal.hidden){current=currentPlanet();renderMain()}});
})();
