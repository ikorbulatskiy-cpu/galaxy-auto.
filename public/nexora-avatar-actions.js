/* NEXORA contextual avatar actions. Uses the existing authenticated room action channel. */
(()=>{"use strict";
 const ACTIONS=[["👋","Привет","wave"],["💃","Танец","dance"],["❤️","Сердце","heart"],["😊","Радость","happy"],["🧍","Стоять","idle"]];
 let popover=null,selected=null;
 const stage=()=>document.querySelector("#tab-world .nx-scene");
 const close=()=>{if(popover)popover.hidden=true;if(selected)selected.classList.remove("selected");selected=null};
 function ensure(){
  const root=stage();if(!root)return;
  if(!root.querySelector(".nx-scene-hint")){const hint=document.createElement("div");hint.className="nx-scene-hint";hint.textContent="Нажми на свободное место, чтобы пройти. Нажми на персонажа для действий.";root.append(hint)}
  if(!popover){popover=document.createElement("div");popover.className="nx-action-popover";popover.hidden=true;popover.setAttribute("role","menu");popover.innerHTML='<div class="nx-action-title">ДЕЙСТВИЯ ПЕРСОНАЖА</div>'+ACTIONS.map(([icon,label,key])=>'<button type="button" role="menuitem" data-nx-action="'+key+'">'+icon+' '+label+'</button>').join("");root.append(popover);
   popover.addEventListener("click",e=>{const b=e.target.closest("[data-nx-action]");if(!b)return;const action=b.dataset.nxAction;const own=selected?.classList.contains("me");if(own&&window.NexoraMovement?.action)window.NexoraMovement.action(action);else if(selected){const canvas=selected.querySelector("canvas[data-nexora-sprite]");const avatar=canvas&&window.NexoraSpriteAvatar?.get(canvas);avatar?.setAnimation(action)}close()});
  }
  const avatars=root.querySelector("#nx-avatars");if(avatars&&!avatars.dataset.actionBound){avatars.dataset.actionBound="1";avatars.addEventListener("click",e=>{if(e.target.closest("button[data-favorite]"))return;const card=e.target.closest(".nx-avatar-card");if(!card)return;e.stopPropagation();if(selected===card&&!popover.hidden){close();return}close();selected=card;card.classList.add("selected");const r=card.getBoundingClientRect(),s=root.getBoundingClientRect();popover.style.left=Math.max(94,Math.min(s.width-94,r.left-s.left+r.width/2))+"px";popover.style.top=Math.max(210,r.top-s.top+5)+"px";popover.hidden=false;});}
  if(!root.dataset.popoverClose){root.dataset.popoverClose="1";root.addEventListener("pointerdown",e=>{if(!e.target.closest(".nx-action-popover,.nx-avatar-card"))close()})}
 }
 const observer=new MutationObserver(ensure);observer.observe(document.documentElement,{childList:true,subtree:true});document.addEventListener("DOMContentLoaded",ensure);ensure();
 window.NexoraAvatarActions={close};
})();