(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 const state={account:null,recoveryCode:null};
 const toast=msg=>{const t=$("toast");t.textContent=msg;t.classList.add("visible");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("visible"),3000);};
 function modal(name,open){const m=$(name+"-modal");m.classList.toggle("open",open);m.setAttribute("aria-hidden",String(!open));}
 let selectedBody=1,selectedHead=1;
 function resetRegister(){state.account=null;state.recoveryCode=null;$("register-step-one").classList.remove("hidden");$("register-step-customize").classList.add("hidden");$("register-step-two").classList.add("hidden");$("step-label").textContent="1 из 3";$("step-progress").style.width="33%";$("register-error").textContent="";$("finish-error").textContent="";$("customize-error").textContent="";$("register-next").disabled=false;selectedBody=1;selectedHead=1;renderCreator();}
 $("open-register").addEventListener("click",()=>{resetRegister();modal("register",true);setTimeout(()=>$("register-nickname").focus(),60);});
 $("open-login").addEventListener("click",()=>{$("login-error").textContent="";modal("login",true);setTimeout(()=>$("login-code").focus(),60);});
 document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>modal(b.dataset.close,false)));
 document.querySelectorAll(".modal").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)modal(m.id.replace("-modal",""),false);}));
 $("register-form").addEventListener("submit",async e=>{
  e.preventDefault();$("register-error").textContent="";
  const nickname=$("register-nickname").value.trim();
  if(nickname.length<3){$("register-error").textContent="Ник должен содержать минимум 3 символа.";return;}
  if(state.account){$("register-step-one").classList.add("hidden");$("register-step-customize").classList.remove("hidden");$("step-label").textContent="2 из 3";$("step-progress").style.width="66%";return;}
  const b=$("register-next");b.disabled=true;
  try{
   const r=await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nickname})});
   const d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось создать персонажа");
   state.account=d.account;state.recoveryCode=d.recoveryCode;b.disabled=false;
   $("register-step-one").classList.add("hidden");$("register-step-customize").classList.remove("hidden");
   $("step-label").textContent="2 из 3";$("step-progress").style.width="66%";
  }catch(err){$("register-error").textContent=err.message;b.disabled=false;}
 });
 $("customize-back").addEventListener("click",()=>{$("register-step-customize").classList.add("hidden");$("register-step-one").classList.remove("hidden");$("step-label").textContent="1 из 3";$("step-progress").style.width="33%";});
 $("customize-continue").addEventListener("click",()=>{$("register-step-customize").classList.add("hidden");$("register-step-two").classList.remove("hidden");$("recovery-code").textContent=state.recoveryCode||"Код не получен";$("step-label").textContent="3 из 3";$("step-progress").style.width="100%";});
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
 const characterAtlas="/assets/sprites/characters/nexora-detailed-atlas.svg";
 function creatorSprite(body,head){
  return '<svg viewBox="0 0 128 160" role="img" aria-label="Предпросмотр персонажа" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><ellipse cx="64" cy="151" rx="43" ry="6" fill="#9cff64" opacity=".45"/><use href="'+characterAtlas+'#body-'+body+'" x="0" y="42" width="128" height="112"/><use href="'+characterAtlas+'#head-'+head+'" x="20" y="0" width="88" height="88"/></svg>';
 }
 function renderCreator(){
  const renderStrip=(kind,selected)=>{
   const root=$(kind+"-options");if(!root)return;
   const total=24;root.innerHTML="";
   for(let n=0;n<5;n++){
    const id=((selected-1+n+total)%total)+1;
    const b=document.createElement("button");b.type="button";
    b.className="nexora-creator-choice"+(id===selected?" selected":"");
    b.setAttribute("aria-label",(kind==="body"?"Тело ":"Голова ")+id);
    b.innerHTML=kind==="body"
     ?'<svg viewBox="0 0 128 160" aria-hidden="true"><use href="'+characterAtlas+'#body-'+id+'" x="20" y="42" width="88" height="112"/></svg>'
     :'<svg viewBox="0 0 128 100" aria-hidden="true"><use href="'+characterAtlas+'#head-'+id+'" x="18" y="0" width="92" height="92"/></svg>';
    b.addEventListener("click",()=>{if(kind==="body")selectedBody=id;else selectedHead=id;renderCreator();});
    root.append(b);
   }
  };
  renderStrip("body",selectedBody);renderStrip("head",selectedHead);
  $("creator-preview").innerHTML=creatorSprite(selectedBody,selectedHead);
 }
 ["body","head"].forEach(kind=>{["prev","next"].forEach(dir=>{$(kind+"-"+dir).addEventListener("click",()=>{if(kind==="body")selectedBody=((selectedBody-1+(dir==="next"?1:23))%24)+1;else selectedHead=((selectedHead-1+(dir==="next"?1:23))%24)+1;renderCreator();});});});
 async function ensureCharacter(){
  const profileResponse=await fetch("/api/account/profile");
  if(!profileResponse.ok)throw Error("Не удалось загрузить профиль. Попробуй войти ещё раз.");
  const profile=await profileResponse.json();
  if(!profile.character){
   const createResponse=await fetch("/api/character",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({headId:selectedHead,bodyId:selectedBody})});
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