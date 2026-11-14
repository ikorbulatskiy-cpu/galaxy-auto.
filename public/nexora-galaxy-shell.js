/* NEXORA Galaxy-style drawer, one-step travel and character-foot anchored actions. */
(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  let wired=false,menu,backdrop,world,tools;

  function closeDrawer(){
    if(!menu)return;
    menu.hidden=true;
    document.body.classList.remove("nx-drawer-open");
    const trigger=$(".nx-menu-trigger");
    trigger?.setAttribute("aria-expanded","false");
  }
  function openDrawer(){
    if(!menu)return;
    menu.hidden=false;
    document.body.classList.add("nx-drawer-open");
    $(".nx-menu-trigger")?.setAttribute("aria-expanded","true");
  }
  function travelFromInput(){
    const input=$("#nx-planet-search");
    const query=input?.value.trim().toLocaleLowerCase("ru");
    if(!query){input?.focus({preventScroll:true});return}
    const planets=window.nexoraWorldGetPlanets?.()||[];
    const planet=planets.find(p=>p.slug===query||p.name.toLocaleLowerCase("ru")===query||p.name.toLocaleLowerCase("ru").includes(query));
    if(!planet){const status=$("#nx-status");if(status)status.textContent="Планета не найдена";return}
    closeDrawer();
    $$("[data-nx-panel]").forEach(p=>p.hidden=true);
    window.nexoraTravelTo?.(planet.slug);
  }
  function setup(){
    world=$("#tab-world .nx-world");
    menu=$("#nx-menu-panel");
    if(!world||!menu||wired)return false;
    wired=true;

    backdrop=document.createElement("button");
    backdrop.type="button";
    backdrop.className="nx-drawer-backdrop";
    backdrop.setAttribute("aria-label","Закрыть меню");
    backdrop.addEventListener("click",closeDrawer);
    document.body.append(backdrop);

    // Move the existing, fully wired menu out of the transformed game container.
    document.body.append(menu);
    menu.classList.add("nx-side-drawer");
    menu.setAttribute("aria-label","Навигация NEXORA");

    // The planet and room controls live in the drawer, not as a second navigation bar.
    tools=$(".nx-planet-tools",world);
    const heading=$(".nx-menu-heading",menu);
    if(tools&&heading){
      const wrap=document.createElement("section");
      wrap.className="nx-drawer-travel";
      wrap.innerHTML='<div class="nx-menu-subtitle">ПЛАНЕТА И КОМНАТА</div>';
      wrap.append(tools);
      heading.after(wrap);
      const input=$("#nx-planet-search",tools);
      if(input){
        input.placeholder="Выбери планету";
        input.setAttribute("aria-label","Выбрать планету для перелёта");
      }
      const go=document.createElement("button");
      go.type="button";go.className="nx-travel-button";go.innerHTML='<span>🚀</span> Перелететь';
      go.addEventListener("click",travelFromInput);
      tools?.append(go);
      input?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();travelFromInput()}});
    }

    // All navigation is consolidated into the hamburger drawer.
    const bottom=$(".nx-bottom-nav",world);
    if(bottom)bottom.hidden=true;
    const trigger=$(".nx-menu-trigger",world);
    if(trigger){
      trigger.setAttribute("aria-expanded","false");
      trigger.addEventListener("click",e=>{
        e.preventDefault();e.stopPropagation();
        menu.hidden?openDrawer():closeDrawer();
      },true);
    }
    const planetsButton=$("#nx-menu-planets",menu);
    if(planetsButton)planetsButton.onclick=e=>{
      e.preventDefault();
      openDrawer();
      $("#nx-planet-search")?.focus({preventScroll:true});
    };
    $("#nx-menu-close",menu)?.addEventListener("click",closeDrawer);
    menu.addEventListener("click",e=>{
      const nav=e.target.closest("[data-open-tab],#nx-menu-social,#nx-menu-favorites,#nx-menu-settings,#nx-menu-help,#nx-menu-exit");
      if(nav&&nav.id!=="nx-menu-planets")closeDrawer();
    });
    document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDrawer()});

    // Keep the drawer state in sync with existing menu code that sets .hidden.
    const stateObserver=new MutationObserver(()=>{
      const opened=!menu.hidden;
      document.body.classList.toggle("nx-drawer-open",opened);
      trigger?.setAttribute("aria-expanded",String(opened));
    });
    stateObserver.observe(menu,{attributes:true,attributeFilter:["hidden"]});

    // The previous touch prototype had a second planet picker. Remove it; travel() owns the
    // full-screen spaceship/loading transition and is the only route to another planet.
    $$(".nx-flight-picker,.nx-flight-trigger").forEach(n=>n.remove());

    // Keep player action sheet attached to the selected avatar's feet.
    const positionPlayerSheet=()=>{
      const sheet=$(".nx-player-sheet");
      const card=$(".nx-avatar-card.nx-player-selected");
      if(!sheet||sheet.hidden||!card)return;
      const r=card.getBoundingClientRect(),w=Math.min(310,window.innerWidth-16);
      const left=Math.max(8,Math.min(window.innerWidth-w-8,r.left+r.width/2-w/2));
      const h=sheet.getBoundingClientRect().height||170;
      let top=r.bottom+7;
      if(top+h>window.innerHeight-8)top=Math.max(8,r.top-h-7);
      sheet.style.left=left+"px";sheet.style.top=top+"px";sheet.style.bottom="auto";
      sheet.style.transform="none";sheet.style.width=w+"px";
    };
    const playerObserver=new MutationObserver(positionPlayerSheet);
    playerObserver.observe(world,{subtree:true,childList:true,attributes:true,attributeFilter:["class","hidden"]});
    document.addEventListener("click",e=>{if(e.target.closest("#nx-avatars .nx-avatar-card"))requestAnimationFrame(positionPlayerSheet)},true);
    window.addEventListener("resize",positionPlayerSheet);
    window.addEventListener("scroll",positionPlayerSheet,true);

    // Hide the redundant floating player list on narrow screens; the room count stays visible.
    const list=$("#nx-player-list",world);
    if(list)list.setAttribute("aria-hidden","true");
    return true;
  }
  if(!setup()){
    const observer=new MutationObserver(()=>{if(setup())observer.disconnect()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
})();
