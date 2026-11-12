/* NEXORA room cleanup and avatar alignment. */
(()=>{
 "use strict";
 const root=document.getElementById("tab-world");
 if(!root)return;
 const cleanText=new Set(["Новички","Зал новичков","Публичная комната","Общий чат","Нажми слева или справа, чтобы персонаж подпрыгнул туда","Нажми слева или справа, чтобы персонаж подпрыгнул туда."]);
 const norm=s=>(s||"").replace(/\\s+/g," ").trim();
 function removeLegacyLabels(){
  root.querySelectorAll("h1,h2,h3,h4,p,small,span,div,label,button").forEach(el=>{
   if(el.closest(".nx-avatar-name,.nx-avatar-card,.nx-connection-status"))return;
   if(el.children.length===0&&cleanText.has(norm(el.textContent)))el.remove();
   else if(el.matches("h1,h2,h3,h4,p,small,label")&&cleanText.has(norm(el.textContent)))el.remove();
  });
  const select=root.querySelector("#nx-room-select,.nx-room-select,select[name='room']");
  if(select){
   [...select.options].forEach(option=>{
    if(/новичк|публичная комната|общий чат/i.test(norm(option.textContent)))option.remove();
   });
   const first=[...select.options].find(o=>!o.disabled);
   if(first&&select.selectedIndex<0)select.value=first.value;
  }
  root.querySelectorAll(".nx-scene-hint,.nx-scene-meta").forEach(el=>{
   if(/нажми слева|подпрыгнул|♛\\s*тест/i.test(norm(el.textContent)))el.remove();
  });
 }
 function alignAvatar(){
  const scene=root.querySelector(".nx-scene");
  const avatars=root.querySelector(".nx-avatars");
  if(!scene||!avatars)return;
  avatars.style.position="absolute";
  avatars.style.inset="0";
  avatars.style.overflow="visible";
  const own=avatars.querySelector(".nx-avatar-card.me")||avatars.querySelector(".nx-avatar-card[data-self='true']");
  if(own&&!own.dataset.nxCentered){
   own.dataset.nxCentered="1";
   own.style.position="absolute";
   own.style.left="50%";
   own.style.right="auto";
   own.style.top="auto";
   own.style.bottom="34px";
   own.style.transform="translateX(-50%)";
   own.style.zIndex="15";
  }
  avatars.querySelectorAll(".nx-avatar-card").forEach(card=>{
   const name=card.querySelector(".nx-avatar-name");
   if(name){name.style.display="inline-block";name.style.visibility="visible";name.style.opacity="1";}
  });
 }
 function keepActionsVisible(){
  root.querySelectorAll(".nx-action-popover").forEach(pop=>{
   pop.style.zIndex="100";
   pop.style.visibility="visible";
   pop.style.opacity="1";
   pop.style.pointerEvents="auto";
  });
 }
 function run(){removeLegacyLabels();alignAvatar();keepActionsVisible();}
 run();
 const observer=new MutationObserver(run);
 observer.observe(root,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["class","hidden"]});
 window.addEventListener("resize",run,{passive:true});
})();