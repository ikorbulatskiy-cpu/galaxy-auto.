/* Clickable player nameplates and Galaxy-like player browsing controls. */
(() => {
 const root=()=>document.querySelector("#tab-world .nx-world");
 const scene=()=>document.querySelector("#tab-world .nx-scene");
 const cards=()=>[...document.querySelectorAll("#nx-avatars .nx-avatar-card")];
 let selected=0;
 function ensure(){
  const stage=scene();if(!stage||stage.querySelector(".nx-player-switcher"))return;
  const panel=document.createElement("div");panel.className="nx-player-switcher";panel.hidden=true;
  panel.innerHTML='<button type="button" data-player-prev aria-label="Предыдущий персонаж">‹</button><div class="nx-player-switcher-name" data-player-title>Персонаж</div><button type="button" data-player-next aria-label="Следующий персонаж">›</button><div class="nx-player-switcher-actions"><button type="button" data-player-left>← Сместиться</button><button type="button" data-player-actions>Действия</button><button type="button" data-player-right>Сместиться →</button></div>';
  stage.append(panel);
  panel.addEventListener("click",e=>{
   const button=e.target.closest("button");if(!button)return;
   const list=cards();if(!list.length)return;
   if(button.hasAttribute("data-player-prev"))select(selected-1);
   if(button.hasAttribute("data-player-next"))select(selected+1);
   if(button.hasAttribute("data-player-left")){if(list[selected]?.classList.contains("me"))window.NexoraMovement?.step(-8)}
   if(button.hasAttribute("data-player-right")){if(list[selected]?.classList.contains("me"))window.NexoraMovement?.step(8)}
   if(button.hasAttribute("data-player-actions")){scene()?.classList.toggle("nx-actions-open")}
  });
 }
 function select(index){
  const list=cards();if(!list.length)return;
  selected=(index+list.length)%list.length;
  list.forEach((card,i)=>card.classList.toggle("nx-player-selected",i===selected));
  const card=list[selected],panel=scene()?.querySelector(".nx-player-switcher");if(!panel)return;
  const name=card.querySelector(".nx-avatar-name")?.textContent?.trim()||"Персонаж";
  panel.querySelector("[data-player-title]").textContent=name+(card.classList.contains("me")?" · это ты":"");
  panel.hidden=false;
  panel.querySelector("[data-player-left]").disabled=!card.classList.contains("me");
  panel.querySelector("[data-player-right]").disabled=!card.classList.contains("me");
  panel.querySelector("[data-player-left]").style.opacity=card.classList.contains("me")?"1":".4";
  panel.querySelector("[data-player-right]").style.opacity=card.classList.contains("me")?"1":".4";
 }
 document.addEventListener("click",e=>{
  const name=e.target.closest("#nx-avatars .nx-avatar-name");
  if(name){e.preventDefault();e.stopPropagation();ensure();select(cards().indexOf(name.closest(".nx-avatar-card")));return}
  if(!e.target.closest(".nx-player-switcher")&&!e.target.closest("#nx-avatars .nx-avatar-card")) {
   const panel=scene()?.querySelector(".nx-player-switcher");if(panel)panel.hidden=true;
  }
 });
 document.addEventListener("keydown",e=>{
  const name=e.target.closest?.("#nx-avatars .nx-avatar-name");if(name&&(e.key==="Enter"||e.key===" ")){e.preventDefault();name.click()}
 });
 const observer=new MutationObserver(()=>{const stage=document.getElementById("nx-avatars");if(!stage)return;stage.querySelectorAll(".nx-avatar-name").forEach(n=>{n.setAttribute("role","button");n.setAttribute("tabindex","0");n.setAttribute("aria-label","Открыть персонажа: "+n.textContent.trim())});ensure()});
 observer.observe(document.documentElement,{childList:true,subtree:true});
 if(root())ensure();
 const compact=document.getElementById("nx-setting-compact");
 if(compact){compact.checked=localStorage.getItem("nx-setting-compact")==="on"}
})();
