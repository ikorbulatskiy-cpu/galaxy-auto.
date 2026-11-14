(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 const state={account:null,recoveryCode:null};
 const toast=msg=>{const t=$("toast");t.textContent=msg;t.classList.add("visible");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("visible"),3000);};
 function modal(name,open){const m=$(name+"-modal");m.classList.toggle("open",open);m.setAttribute("aria-hidden",String(!open));}
 function resetRegister(){$("register-step-one").classList.remove("hidden");$("register-step-two").classList.add("hidden");$("step-label").textContent="1 из 2";$("step-progress").style.width="50%";$("register-error").textContent="";$("finish-error").textContent="";$("register-next").disabled=false;}
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
   $("register-step-one").classList.add("hidden");$("register-step-two").classList.remove("hidden");
   $("step-label").textContent="2 из 2";$("step-progress").style.width="100%";
  }catch(err){$("register-error").textContent=err.message;b.disabled=false;}
 });
 $("enter-world").addEventListener("click",async()=>{
  const b=$("enter-world");b.disabled=true;$("finish-error").textContent="";
  try{
   await ensureCharacter();
   modal("register",false);
   $("player-label").textContent=state.account?.nickname||"Ты";
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
   $("player-label").textContent=state.account?.nickname||"Ты";
   window.NexoraRoom.show(state.account);
   toast("Вход выполнен. Добро пожаловать!");
  }catch(err){$("login-error").textContent=err.message;}
  finally{b.disabled=false;}
 });
 async function ensureCharacter(){
  const profileResponse=await fetch("/api/account/profile");
  if(!profileResponse.ok)throw Error("Не удалось загрузить профиль. Попробуй войти ещё раз.");
  const profile=await profileResponse.json();
  if(!profile.character){
   const createResponse=await fetch("/api/character",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({headId:1,bodyId:1})});
   const created=await createResponse.json();if(!createResponse.ok)throw Error(created.error||"Не удалось создать персонажа.");
  }
 }
 async function status(){
  try{const r=await fetch("/api/status");const d=await r.json();$("server-status").textContent=d.database==="connected"?"● Сервер и база данных онлайн":"● Сервер доступен";}
  catch{$("server-status").textContent="Нет связи с сервером";}
 }
 async function session(){
  try{const r=await fetch("/api/auth/me");const d=await r.json();if(d.authenticated){state.account=d.account;const profile=await fetch("/api/account/profile");if(profile.ok){const p=await profile.json();if(p.character){$("player-label").textContent=d.account?.nickname||"Ты";window.NexoraRoom.show(d.account);}}}}
  catch(err){console.warn("Session restore failed:",err.message);}
 }
 status();session();setInterval(status,30000);
})();