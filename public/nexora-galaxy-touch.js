/* NEXORA Galaxy player selection, bounded action sheet and flight controls. */
(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const stage = () => $("#tab-world .nx-scene");
  const world = () => $("#tab-world .nx-world");
  const cards = () => $$("#nx-avatars .nx-avatar-card");
  let selected = null;
  let panel, flightPanel;

  function closeWorldPanels() {
    ["nx-menu-panel","nx-favorites-panel","nx-settings-panel","nx-help-panel","nx-events-panel"].forEach(id => {
      const el = document.getElementById(id); if (el) el.hidden = true;
    });
    $$(".nx-action-popover,.nx-planet-modules,.nx-module-panel,#nx-planet-modules-panel").forEach(el => el.hidden = true);
  }

  function ensurePlayerPanel() {
    if (panel?.isConnected) return panel;
    panel = document.createElement("section");
    panel.className = "nx-player-sheet";
    panel.hidden = true;
    panel.setAttribute("role","dialog");
    panel.setAttribute("aria-label","Персонаж");
    panel.innerHTML = `
      <div class="nx-player-sheet-head">
        <div class="nx-player-sheet-title"><small>ПЕРСОНАЖ</small><b data-player-name>Игрок</b><span data-player-subtitle></span></div>
        <div class="nx-player-sheet-nav"><button type="button" data-player-prev aria-label="Предыдущий">‹</button><button type="button" data-player-next aria-label="Следующий">›</button><button type="button" data-player-close aria-label="Закрыть">×</button></div>
      </div>
      <div class="nx-player-sheet-actions" data-player-actions></div>
      <div class="nx-player-sheet-foot" data-player-foot></div>`;
    document.body.append(panel);
    panel.addEventListener("click", e => {
      const b=e.target.closest("button"); if(!b)return;
      if(b.hasAttribute("data-player-close")) return hidePlayer();
      const list=cards(); if(!list.length)return;
      if(b.hasAttribute("data-player-prev")) return selectPlayer((list.indexOf(selected)-1+list.length)%list.length);
      if(b.hasAttribute("data-player-next")) return selectPlayer((list.indexOf(selected)+1)%list.length);
      const action=b.dataset.playerAction;
      if(action==="favorite") {
        const fav=selected?.querySelector("[data-favorite]");
        if(fav) fav.click();
        renderPlayer();
      }
      if(action==="move-left") window.NexoraMovement?.step(-8);
      if(action==="move-right") window.NexoraMovement?.step(8);
      if(action==="emote") {
        const type=b.dataset.emote;
        if(selected?.classList.contains("me")) {
          const canvas=$('canvas[data-nexora-sprite]',selected);
          const avatar=canvas&&window.NexoraSpriteAvatar?.get(canvas);
          if(avatar) avatar.setAnimation(type);
          window.NexoraMovement?.action(type);
        }
      }
    });
    return panel;
  }

  function hidePlayer() {
    if(panel) panel.hidden=true;
    cards().forEach(c=>c.classList.remove("nx-player-selected"));
    selected=null;
  }

  function selectPlayer(indexOrCard) {
    const list=cards(); if(!list.length)return;
    const index=typeof indexOrCard==="number" ? indexOrCard : list.indexOf(indexOrCard);
    selected=list[Math.max(0,Math.min(list.length-1,index))];
    list.forEach(c=>c.classList.toggle("nx-player-selected",c===selected));
    renderPlayer();
  }

  function renderPlayer() {
    if(!selected?.isConnected)return hidePlayer();
    const p=ensurePlayerPanel();
    const name=$(".nx-avatar-name",selected)?.textContent?.trim().replace(/^♛\s*/,"")||"Игрок";
    const me=selected.classList.contains("me");
    const username=selected.dataset.playerUsername||"";
    const userId=selected.dataset.playerUserId||"";
    $("[data-player-name]",p).textContent=name;
    $("[data-player-subtitle]",p).textContent=me?"Ваш персонаж":"Игрок планеты";
    const actions=$("[data-player-actions]",p);
    actions.innerHTML=me
      ? '<button type="button" data-player-action="move-left">← Влево</button><button type="button" data-player-action="move-right">Вправо →</button><button type="button" data-player-action="emote" data-emote="wave">Привет</button><button type="button" data-player-action="emote" data-emote="dance">Танец</button><button type="button" data-player-action="emote" data-emote="happy">Радость</button><button type="button" data-player-action="emote" data-emote="heart">Сердце</button>'
      : '<button type="button" data-player-action="favorite">☆ В избранное</button><span class="nx-player-sheet-note">Выбран персонаж · '+(userId?"ID "+userId:username?"@"+username:"информация профиля")+'</span>';
    if(!me) {
      const fav=selected.querySelector("[data-favorite]");
      if(fav?.classList.contains("is-favorite")) actions.querySelector('[data-player-action="favorite"]').textContent="★ Убрать из избранного";
    }
    $("[data-player-foot]",p).textContent=me?"Управление доступно только вашему персонажу.":"Нажмите ☆, чтобы сохранить игрока в избранном.";
    p.hidden=false;
  }

  function ensureFlightButton() {
    const s=stage(); if(!s || $(".nx-flight-trigger",s))return;
    const b=document.createElement("button");
    b.type="button"; b.className="nx-flight-trigger"; b.textContent="🚀 Перелёт";
    b.addEventListener("click",()=>{
      closeWorldPanels();
      const input=$("#nx-planet-search");
      if(input){ input.focus({preventScroll:true}); input.scrollIntoView({block:"nearest",behavior:"smooth"}); }
      if(flightPanel) flightPanel.hidden=false;
    });
    s.append(b);
    if(!flightPanel) {
      flightPanel=document.createElement("div");
      flightPanel.className="nx-flight-picker";
      flightPanel.hidden=true;
      flightPanel.innerHTML='<label>Перелёт на планету<input type="text" inputmode="search" placeholder="Название планеты" aria-label="Название планеты"></label><button type="button" data-flight-go>Перелететь</button><button type="button" data-flight-close aria-label="Закрыть">×</button>';
      document.body.append(flightPanel);
      flightPanel.addEventListener("click",e=>{
        if(e.target.closest("[data-flight-close]")){flightPanel.hidden=true;return}
        if(!e.target.closest("[data-flight-go]"))return;
        const q=$("input",flightPanel).value.trim().toLocaleLowerCase("ru");
        const options=window.nexoraWorldGetPlanets?.()||[];
        const planet=options.find(x=>x.slug===q||x.name.toLocaleLowerCase("ru")===q||x.name.toLocaleLowerCase("ru").includes(q));
        if(!planet){$("input",flightPanel).focus();return}
        closeWorldPanels(); flightPanel.hidden=true; hidePlayer();
        window.nexoraTravelTo?.(planet.slug);
      });
    }
  }

  document.addEventListener("click",e=>{
    const card=e.target.closest("#nx-avatars .nx-avatar-card");
    if(card && !e.target.closest("button")) {
      e.preventDefault(); e.stopPropagation();
      ensurePlayerPanel(); selectPlayer(card); closeWorldPanels();
      return;
    }
    if(e.target.closest("#nx-menu-panel [data-open-tab],#nx-menu-panel [data-nx],.nx-bottom-nav button")) {
      hidePlayer(); if(flightPanel)flightPanel.hidden=true;
    }
    if(panel && !panel.hidden && !e.target.closest(".nx-player-sheet") && !e.target.closest("#nx-avatars .nx-avatar-card")) hidePlayer();
    if(flightPanel && !flightPanel.hidden && !e.target.closest(".nx-flight-picker") && !e.target.closest(".nx-flight-trigger")) flightPanel.hidden=true;
  },true);

  document.addEventListener("keydown",e=>{if(e.key==="Escape"){hidePlayer();if(flightPanel)flightPanel.hidden=true}});
  document.addEventListener("focusin",e=>{
    if(e.target.matches("input,textarea,select")) {
      e.target.style.scrollMarginBottom="12px";
      document.documentElement.classList.add("nx-input-focused");
    }
  });
  document.addEventListener("focusout",e=>{if(e.target.matches("input,textarea,select"))document.documentElement.classList.remove("nx-input-focused")});

  const observer=new MutationObserver(()=>{
    ensureFlightButton();
    const list=cards();
    if(selected && !selected.isConnected)hidePlayer();
    list.forEach(n=>{
      const name=$(".nx-avatar-name",n);
      if(name){name.setAttribute("role","button");name.setAttribute("tabindex","0")}
    });
    $$(".nx-planet-modules,.nx-module-panel,#nx-planet-modules-panel,[data-planet-modules]").forEach(el=>el.hidden=true);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  ensureFlightButton();
  window.addEventListener("nexora:room-joined",()=>{closeWorldPanels();hidePlayer();if(flightPanel)flightPanel.hidden=true});
})();
