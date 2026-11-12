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
    const exitButton=header.querySelector('.nx-exit-button');
    if(exitButton)header.insertBefore(badge,exitButton);else header.append(badge);
    let connectionState="pending";
    const update=()=>{
      const raw=(source.textContent||"").trim();
      const lower=raw.toLocaleLowerCase("ru");
      let label="Подключение";
      if(/соединение:\s*(отличное|стабильное|активно)|соединение с комнатой установлено|подключен к комнате|connected/.test(lower)){
        connectionState="connected";label="На связи";
      }else if(/связь потеряна|проблема сети|закрыт|ошиб|недоступ|не удалось|timeout|failed/.test(lower)){
        connectionState="error";label="Нет связи";
      }else if(/подключ|восстанавливаем|ожидан|проверяет подключение/.test(lower)){
        connectionState="pending";label="Подключение";
      }else if(connectionState==="connected"){
        label="На связи";
      }else if(connectionState==="error"){
        label="Нет связи";
      }
      badge.dataset.state=connectionState;
      badge.textContent=label;
      badge.title=raw||"Состояние подключения";
    };
    update();
    new MutationObserver(update).observe(source,{childList:true,characterData:true,subtree:true});
  }
  // The character menu is docked in the scene header by the isolated CSS override.
  const style=document.getElementById("nx-interface-polish-popover");
  if(!style){
    const node=document.createElement("style");
    node.id="nx-interface-polish-popover";
    node.textContent=".nx-action-popover{top:7px!important;right:7px!important;left:auto!important}";
    document.head.append(node);
  }
})();
