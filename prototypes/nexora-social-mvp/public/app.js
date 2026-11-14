(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 const state={account:null,recoveryCode:null,headId:1,bodyId:1,characterCreated:false};
 const toast=msg=>{const t=$("toast");t.textContent=msg;t.classList.add("visible");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("visible"),3000);};
 function modal(name,open){const m=$(name+"-modal");m.classList.toggle("open",open);m.setAttribute("aria-hidden",String(!open));}
 function resetRegister(){$("register-step-one").classList.remove("hidden");$("register-step-customize").classList.add("hidden");$("register-step-two").classList.add("hidden");$("step-label").textContent="1 из 3";$("step-progress").style.width="33%";$("register-error").textContent="";$("customize-error").textContent="";$("finish-error").textContent="";$("register-next").disabled=false;state.headId=1;state.bodyId=1;state.characterCreated=false;renderCreator();}
 $("open-register").addEventListener("click",()=>{resetRegister();modal("register",true);setTimeout(()=>$("register-nickname").focus(),60);});
 $("open-login").addEventListener("click",()=>{$("login-error").textContent="";modal("login",true);setTimeout(()=>$("login-code").focus(),60);});
 document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>modal(b.dataset.close,false)));
 document.querySelectorAll(".modal").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)modal(m.id.replace("-modal",""),false);}));
 $("register-form").addEventListener("submit",async e=>{
  e.preventDefault();$("register-error").textContent="";
  const nickname=$("register-nickname").value.trim();
  if(nickname.length<3){$("register-error").textContent="Ник должен содержать минимум 3 символа.";return;}
  const b=$("register-next");b.disabled=true;
  try{
   const r=await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nickname})});
   const d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось создать персонажа");
   state.account=d.account;state.recoveryCode=d.recoveryCode;$("recovery-code").textContent=d.recoveryCode||"Код не получен";
   $("register-step-one").classList.add("hidden");$("register-step-customize").classList.remove("hidden");
   $("step-label").textContent="2 из 3";$("step-progress").style.width="66%";renderCreator();
  }catch(err){$("register-error").textContent=err.message;b.disabled=false;}
 });
 $("enter-world").addEventListener("click",async()=>{
  const b=$("enter-world");b.disabled=true;$("finish-error").textContent="";
  try{
   await ensureCharacter();
   modal("register",false);
   window.NexoraRoom.show(state.account);
   toast("Персонаж создан. Добро пожаловать в Мишкин Домик!");
  }catch(err){$("finish-error").textContent=err.message;}
  finally{b.disabled=false;}
 });
 $("login-form").addEventListener("submit",async e=>{
  e.preventDefault();$("login-error").textContent="";
  const b=$("login-submit");b.disabled=true;
  try{
   const r=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recoveryCode:$("login-code").value.trim()})});
   const d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось войти");
   state.account=d.account;$("login-code").value="";
   await ensureCharacter();modal("login",false);
   window.NexoraRoom.show(state.account);
   toast("Вход выполнен. Добро пожаловать!");
  }catch(err){$("login-error").textContent=err.message;}
  finally{b.disabled=false;}
 });
$("customize-back").addEventListener("click",()=>{$("register-step-customize").classList.add("hidden");$("register-step-one").classList.remove("hidden");$("step-label").textContent="1 из 3";$("step-progress").style.width="33%";});
 $("customize-continue").addEventListener("click",async()=>{const b=$("customize-continue");b.disabled=true;$("customize-error").textContent="";try{const r=await fetch("/api/character",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({headId:state.headId,bodyId:state.bodyId})});const d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось сохранить внешний вид персонажа");state.characterCreated=true;$("register-step-customize").classList.add("hidden");$("register-step-two").classList.remove("hidden");$("step-label").textContent="3 из 3";$("step-progress").style.width="100%";}catch(err){$("customize-error").textContent=err.message;}finally{b.disabled=false;}});

 $("head-prev").addEventListener("click",()=>changeCreatorChoice("head",-1));$("head-next").addEventListener("click",()=>changeCreatorChoice("head",1));
 function changeCreatorChoice(kind,delta){const key=kind==="head"?"headId":"bodyId",max=kind==="head"?24:6;state[key]=((state[key]-1+delta+max)%max)+1;renderCreator();}
 function renderCreator(){
  const bodyList=$("body-options"),headList=$("head-options"),preview=$("creator-preview");if(!headList||!preview)return;if(bodyList){bodyList.replaceChildren();const picker=bodyList.closest(".nexora-creator-picker");if(picker)picker.hidden=true;}
  const bodyHref="/assets/sprites/characters/nexora-user-bodies.svg#body-";
  const headHref="/assets/sprites/characters/nexora-detailed-atlas.svg#head-";
  const makeChoice=(kind,id,href,selected)=>{const button=document.createElement("button");button.type="button";button.className="nexora-creator-choice"+(selected?" selected":"");button.setAttribute("aria-label",(kind==="head"?"Голова ":"Тело ")+id);button.setAttribute("aria-pressed",String(selected));const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox",kind==="head"?"0 0 64 64":"0 0 64 104");const use=document.createElementNS("http://www.w3.org/2000/svg","use");use.setAttribute("href",href+id);if(kind==="body"){use.setAttribute("x","0");use.setAttribute("y","0");use.setAttribute("width","64");use.setAttribute("height","104");}svg.append(use);button.append(svg);button.addEventListener("click",()=>{state[kind==="head"?"headId":"bodyId"]=id;renderCreator();});return button;};
  
  headList.replaceChildren();for(let i=1;i<=24;i++)headList.append(makeChoice("head",i,headHref,state.headId===i));
  preview.innerHTML='<svg viewBox="0 0 64 64" role="img" aria-label="Предпросмотр головы"><use href="'+headHref+state.headId+'" x="0" y="0" width="64" height="64"></use></svg>';
 }
  async function ensureCharacter(){
  const profileResponse=await fetch("/api/account/profile");
  if(!profileResponse.ok)throw Error("Не удалось загрузить профиль. Попробуй войти ещё раз.");
  const profile=await profileResponse.json();
  if(!profile.character){
   const createResponse=await fetch("/api/character",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({headId:state.headId,bodyId:state.bodyId})});
   const created=await createResponse.json();if(!createResponse.ok)throw Error(created.error||"Не удалось создать персонажа.");
  }
 }
 async function status(){
  try{const r=await fetch("/api/status");const d=await r.json();$("server-status").textContent=d.database==="connected"?"● Сервер и база данных онлайн":"● Сервер доступен";}
  catch{$("server-status").textContent="Нет связи с сервером";}
 }
 async function session(){
  // Do not silently enter the room from a remembered cookie.
  // Returning players must explicitly authenticate with their recovery code.
  try{
   const r=await fetch("/api/auth/me",{cache:"no-store"});
   if(!r.ok)throw Error("Не удалось проверить аккаунт");
   const d=await r.json();
   state.account=null;
   if(d.authenticated){
    $("open-login").textContent="Войти в свой аккаунт";
   }
  }catch(err){console.warn("Session check failed:",err.message);}
 }
 status();session();setInterval(status,30000);
})();