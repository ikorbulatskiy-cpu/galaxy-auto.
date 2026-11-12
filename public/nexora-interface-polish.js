/* NEXORA connection indicator and non-obstructive avatar controls. */
(() => {
  "use strict";
  const root=document.getElementById("tab-world");
  if(!root)return;
  const header=root.querySelector(".nx-topbar");
  const source=root.querySelector("#nx-status");
  if(header&&source&&!header.querySelector(".nx-connection-status")){
    const badge=document.createElement("div");
    badge.className="nx-connection-status";
    badge.id="nx-connection-indicator";
    badge.setAttribute("role","status");
    badge.setAttribute("aria-live","polite");
    badge.textContent="Ожидание";
    header.append(badge);
    const update=()=>{
      const raw=(source.textContent||"").trim();
      const value=raw.replace(/^Соединение:\s*/i,"").replace(/^Канал движения\s*/i,"").trim();
      const text=value||"Ожидание";
      const lower=text.toLocaleLowerCase("ru");
      let state="pending",label=text;
      if(/подключен|в комнате|соединение установлено|готово к обмену|connected/.test(lower)){state="connected";label="На связи"}
      else if(/ошиб|потерян|закрыт|отключ|не удалось|отказ|timeout|failed/.test(lower)){state="error";label="Нет связи"}
      else if(/подключ|ожидан|соединен|готово|загрузка/.test(lower)){state="pending";label="Подключение"}
      badge.dataset.state=state;
      badge.textContent=label.length>18?label.slice(0,17)+"…":label;
      badge.title=raw||"Состояние подключения";
    };
    update();
    new MutationObserver(update).observe(source,{childList:true,characterData:true,subtree:true});
  }
  // The character menu is docked in the upper-right corner of the scene,
  // leaving the selected avatar fully visible and tappable.
  root.addEventListener("click",event=>{
    const pop=event.target.closest(".nx-action-popover");
    if(!pop)return;
    event.stopPropagation();
  },true);
  const style=document.getElementById("nx-interface-polish-popover");
  if(!style){
    const node=document.createElement("style");
    node.id="nx-interface-polish-popover";
    node.textContent=".nx-action-popover{top:7px!important;right:7px!important;left:auto!important}";
    document.head.append(node);
  }
})();
