(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 let authenticated=false, pendingAccount=null, pendingRecovery=null;
 const toast=message=>{const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),2600);};
 function openModal(name){const el($(name+"-modal"));el.classList.add("open");el.setAttribute("aria-hidden","false");}
 function el(x){return typeof x==="string"?$(x):x;}
 function closeModal(name){const modal=$(name+"-modal");modal.classList.remove("open");modal.setAttribute("aria-hidden","true");}
 function resetRegister(){ $("register-step-1").classList.remove("hidden");$("register-step-2").classList.add("hidden");$("register-step-label").textContent="1 из 2";$("register-progress-fill").style.width="50%";$("register-error").textContent="";$("register-character-error").textContent="";$("register-next").disabled=false; }
 function showAccount(account,code){
  authenticated=true;["register","login"].forEach(closeModal);$("landing").classList.add("hidden");openModal("account");
  $("account-name").textContent=account.nickname;
  if(code){$("recovery-value").textContent=code;$("recovery-value").classList.add("recovery-code");}
  else{$("recovery-value").textContent="Код доступен только владельцу аккаунта. При необходимости создай новый.";$("recovery-value").classList.remove("recovery-code");}
  loadPlayerProfile();
 }
 async function loadPlayerProfile(){try{const r=await fetch("/api/account/profile");if(!r.ok)return;const d=await r.json();if(d.character){$("head-choice").value=String(d.character.head_id);$("body-choice").value=String(d.character.body_id);}}catch{}}
 document.querySelectorAll('[data-open="register"]').forEach(b=>b.addEventListener("click",()=>{resetRegister();openModal("register");setTimeout(()=>$("register-nickname").focus(),80);}));
 document.querySelectorAll('[data-open="login"]').forEach(b=>b.addEventListener("click",()=>{ $("login-error").textContent="";openModal("login");setTimeout(()=>$("login-nickname").focus(),80);}));
 document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeModal(b.dataset.close)));
 document.querySelectorAll(".modal").forEach(m=>m.addEventListener("click",e=>{if(e.target===m&&!authenticated)closeModal(m.id.replace("-modal",""));}));
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!authenticated)["register","login"].forEach(closeModal);});
 $("register-form").addEventListener("submit",async e=>{
  e.preventDefault();$("register-error").textContent="";
  const nickname=$("register-nickname").value.trim();if(nickname.length<3){$("register-error").textContent="Ник должен содержать минимум 3 символа.";return;}
  const b=$("register-next");b.disabled=true;
  try{
   const r=await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nickname})});const d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось создать персонажа");
   pendingAccount=d.account;pendingRecovery=d.recoveryCode;
   $("new-recovery-code").textContent=pendingRecovery||"Код не получен. Не закрывай окно и обратись в поддержку.";
   $("register-step-1").classList.add("hidden");$("register-step-2").classList.remove("hidden");$("register-step-label").textContent="2 из 2";$("register-progress-fill").style.width="100%";
  }catch(err){$("register-error").textContent=err.message;b.disabled=false;}
 });
 $("finish-register").addEventListener("click",async()=>{
  const b=$("finish-register");b.disabled=true;$("register-character-error").textContent="";
  try{const r=await fetch("/api/character",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({headId:Number($("register-head").value),bodyId:Number($("register-body").value)})});const d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось сохранить внешность");showAccount(pendingAccount,pendingRecovery);toast("Персонаж создан. Сохрани код восстановления.");pendingAccount=null;pendingRecovery=null;}
  catch(err){$("register-character-error").textContent=err.message;b.disabled=false;}
 });
 $("login-form").addEventListener("submit",async e=>{
  e.preventDefault();$("login-error").textContent="";const b=$("login-submit");b.disabled=true;
  try{const r=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nickname:$("login-nickname").value.trim(),recoveryCode:$("login-recovery").value.trim()})});const d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось войти");showAccount(d.account,null);$("login-recovery").value="";toast("С возвращением!");}
  catch(err){$("login-error").textContent=err.message;}
  finally{b.disabled=false;}
 });
 $("recovery-generate").addEventListener("click",async()=>{try{const r=await fetch("/api/account/recovery-code",{method:"POST"}),d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось создать код");$("recovery-value").textContent=d.recoveryCode;$("recovery-value").classList.add("recovery-code");toast("Новый код создан. Старый больше не действует.");}catch(e){toast(e.message);}});
 $("save-character").addEventListener("click",async()=>{const b=$("save-character");b.disabled=true;$("character-error").textContent="";try{const r=await fetch("/api/character",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({headId:Number($("head-choice").value),bodyId:Number($("body-choice").value)})}),d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось сохранить персонажа");toast("Внешность персонажа сохранена.");}catch(e){$("character-error").textContent=e.message;}finally{b.disabled=false;}});
 $("logout").addEventListener("click",async()=>{try{await fetch("/api/auth/logout",{method:"POST"});}catch{}authenticated=false;closeModal("account");$("landing").classList.remove("hidden");$("login-nickname").value="";$("login-recovery").value="";resetRegister();toast("Вы вышли из аккаунта.");});
 async function checkSession(){try{const r=await fetch("/api/auth/me"),d=await r.json();if(d.authenticated)showAccount(d.account,null);}catch{}}
 async function updateStatus(){try{const [s,t]=await Promise.all([fetch("/api/status"),fetch("/api/account/online")]);const status=await s.json(),online=await t.json();$("connection").textContent=status.database==="connected"?"● Сервер онлайн · "+online.online+" онлайн":"● Сервер доступен";}catch{$("connection").textContent="● Нет связи с сервером";}}
 function updateTime(){$("header-time").textContent=new Intl.DateTimeFormat("ru-RU",{hour:"2-digit",minute:"2-digit"}).format(new Date());}
 resetRegister();checkSession();updateStatus();updateTime();setInterval(updateTime,30000);setInterval(updateStatus,30000);
})();