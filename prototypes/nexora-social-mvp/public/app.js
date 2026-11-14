(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 const state={account:null,recoveryCode:null};
 const toast=msg=>{const t=$("toast");t.textContent=msg;t.classList.add("visible");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("visible"),3000);};
 function modal(name,open){const m=$(name+"-modal");m.classList.toggle("open",open);m.setAttribute("aria-hidden",String(!open));}
 let selectedBody=1,selectedHead=1;
 function resetRegister(){$("register-step-one").classList.remove("hidden");$("register-step-customize").classList.add("hidden");$("register-step-two").classList.add("hidden");$("step-label").textContent="1 из 3";$("step-progress").style.width="33%";$("register-error").textContent="";$("finish-error").textContent="";$("customize-error").textContent="";$("register-next").disabled=false;selectedBody=1;selectedHead=1;renderCreator();}
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
   state.account=d.account;state.recoveryCode=d.recoveryCode;
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
 function creatorSprite(body,head){
  const skin=["#f4c9a8","#d99d7c","#f2d1b1","#bc805f","#e8b99a"][(head-1)%5],hair=["#30231f","#211c27","#d6b69a","#251a20","#4a3027","#17151d"][(head-1)%6],shirt=["#f1f1ed","#171717","#e9a9c4","#dce5ef","#a8c9d9","#7c8bd0"][(body-1)%6],pants=["#e8e8e8","#171717","#f3c4d6","#222735","#b8c9d8","#39466f"][(body-1)%6];
  return '<svg viewBox="0 0 120 190" role="img" aria-label="Предпросмотр персонажа" shape-rendering="crispEdges"><ellipse cx="60" cy="180" rx="43" ry="6" fill="#9cff64" opacity=".45"/><path d="M43 83h34l9 55H34z" fill="'+shirt+'" stroke="#111" stroke-width="3"/><path d="M43 132h16l-3 39H38zM62 132h16l4 39H63z" fill="'+pants+'" stroke="#111" stroke-width="3"/><path d="M37 169h20v9H34zM63 169h21v9H62z" fill="#eee" stroke="#111" stroke-width="3"/><path d="M39 87 27 122l8 4 16-29M80 87l13 35-8 4-16-30" fill="'+skin+'" stroke="#111" stroke-width="3"/><path d="M42 22h36v48H42z" fill="'+skin+'" stroke="#111" stroke-width="3"/><path d="M39 42V25l9-12h28l10 13v29l-8-8-3-20-15 7-14-2-2 20z" fill="'+hair+'" stroke="#111" stroke-width="3"/><path d="M49 47h6v4h-6zM66 47h6v4h-6z" fill="#211a1a"/><path d="M55 60q5 4 10 0" fill="none" stroke="#8c4d43" stroke-width="2"/><path d="M46 84h28l-5 9H51z" fill="'+shirt+'" stroke="#111" stroke-width="2"/></svg>';
 }
 function renderCreator(){
  const renderStrip=(kind,selected)=>{const root=$(kind+"-options");if(!root)return;const total=kind==="body"?12:12;root.innerHTML="";for(let n=0;n<5;n++){const id=((selected-1+n+total)%total)+1;const b=document.createElement("button");b.type="button";b.className="nexora-creator-choice"+(id===selected?" selected":"");b.setAttribute("aria-label",(kind==="body"?"Тело ":"Голова ")+id);b.innerHTML=creatorSprite(kind==="body"?id:selected,kind==="head"?id:selected);b.addEventListener("click",()=>{if(kind==="body")selectedBody=id;else selectedHead=id;renderCreator();});root.append(b);}};
  renderStrip("body",selectedBody);renderStrip("head",selectedHead);$("creator-preview").innerHTML=creatorSprite(selectedBody,selectedHead);
 }
 ["body","head"].forEach(kind=>{["prev","next"].forEach(dir=>{$(kind+"-"+dir).addEventListener("click",()=>{if(kind==="body")selectedBody=((selectedBody-1+(dir==="next"?1:11))%12)+1;else selectedHead=((selectedHead-1+(dir==="next"?1:11))%12)+1;renderCreator();});});});
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