(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 let authMode="register", authenticated=false;
 const toast=message=>{const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),2600);};
 function setMode(mode){
  authMode=mode;
  document.querySelectorAll("[data-auth]").forEach(b=>b.classList.toggle("active",b.dataset.auth===mode));
  $("auth-title").textContent=mode==="login"?"Войти в NEXORA":"Создать персонажа";
  $("submit-auth").textContent=mode==="login"?"Войти":"Создать персонажа";
  $("recovery-login-label").classList.toggle("hidden",mode!=="login");
  $("recovery-login").required=mode==="login";
  $("form-error").textContent="";
 }
 function openAuth(mode){
  setMode(mode);
  $("auth-form").classList.remove("hidden");
  $("account-state").classList.add("hidden");
  $("auth-modal").classList.add("open");
  $("auth-modal").setAttribute("aria-hidden","false");
  setTimeout(()=>$("nickname").focus(),80);
 }
 function closeAuth(){
  if(authenticated)return;
  $("auth-modal").classList.remove("open");
  $("auth-modal").setAttribute("aria-hidden","true");
 }
 function showAccount(account,code){
  authenticated=true;
  $("landing").classList.add("hidden");
  $("auth-modal").classList.add("open");
  $("auth-modal").setAttribute("aria-hidden","false");
  $("auth-form").classList.add("hidden");
  $("account-state").classList.remove("hidden");
  $("auth-title").textContent="Твой персонаж";
  document.querySelector(".auth-switch").classList.add("hidden");
  $("account-name").textContent=account.nickname;
  if(code){$("recovery-value").textContent=code;$("recovery-value").classList.add("recovery-code");}
  else{$("recovery-value").textContent="Код доступен только владельцу аккаунта. При необходимости создай новый.";$("recovery-value").classList.remove("recovery-code");}
  loadPlayerProfile();
 }
 async function loadPlayerProfile(){
  try{const r=await fetch("/api/account/profile");if(!r.ok)return;const d=await r.json();if(d.character){$("head-choice").value=String(d.character.head_id);$("body-choice").value=String(d.character.body_id);$("create-character").textContent="Обновить персонажа";}}
  catch{}
 }
 document.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>openAuth(b.dataset.open)));
 document.querySelectorAll("[data-auth]").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.auth)));
 $("close-auth").addEventListener("click",closeAuth);
 $("auth-modal").addEventListener("click",e=>{if(e.target===$("auth-modal"))closeAuth();});
 document.addEventListener("keydown",e=>{if(e.key==="Escape")closeAuth();});
 $("auth-form").addEventListener("submit",async e=>{
  e.preventDefault();$("form-error").textContent="";
  const payload=authMode==="login"?{nickname:$("nickname").value.trim(),recoveryCode:$("recovery-login").value.trim()}:{nickname:$("nickname").value.trim()};
  const endpoint=authMode==="login"?"/api/auth/login":"/api/auth/register";
  $("submit-auth").disabled=true;
  try{
   const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const d=await r.json();if(!r.ok)throw Error(d.error||"Ошибка запроса");
   showAccount(d.account,d.recoveryCode||null);
   toast(authMode==="login"?"С возвращением!":"Персонаж создан. Сохрани код восстановления.");
  }catch(err){$("form-error").textContent=err.message;}
  finally{$("submit-auth").disabled=false;}
 });
 $("recovery-generate").addEventListener("click",async()=>{
  try{const r=await fetch("/api/account/recovery-code",{method:"POST"}),d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось создать код");$("recovery-value").textContent=d.recoveryCode;$("recovery-value").classList.add("recovery-code");toast("Новый код создан. Старый больше не действует.");}
  catch(e){toast(e.message);}
 });
 $("create-character").addEventListener("click",async()=>{
  const b=$("create-character");b.disabled=true;$("character-error").textContent="";
  try{const r=await fetch("/api/character",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({headId:Number($("head-choice").value),bodyId:Number($("body-choice").value)})}),d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось сохранить персонажа");b.textContent="Обновить персонажа";toast("Внешность персонажа сохранена.");}
  catch(e){$("character-error").textContent=e.message;}
  finally{b.disabled=false;}
 });
 $("logout").addEventListener("click",async()=>{
  try{await fetch("/api/auth/logout",{method:"POST"});}catch{}
  authenticated=false;$("auth-modal").classList.remove("open");$("auth-modal").setAttribute("aria-hidden","true");$("landing").classList.remove("hidden");$("auth-form").classList.remove("hidden");$("account-state").classList.add("hidden");document.querySelector(".auth-switch").classList.remove("hidden");$("nickname").value="";$("recovery-login").value="";$("recovery-value").textContent="Код доступен только владельцу аккаунта.";$("recovery-value").classList.remove("recovery-code");setMode("login");toast("Вы вышли из аккаунта.");
 });
 async function checkSession(){
  try{const r=await fetch("/api/auth/me"),d=await r.json();if(d.authenticated)showAccount(d.account,null);}
  catch{}
 }
 async function updateStatus(){
  try{const [s,t]=await Promise.all([fetch("/api/status"),fetch("/api/account/online")]);const status=await s.json(),online=await t.json();$("connection").textContent=status.database==="connected"?"● Сервер онлайн · "+online.online+" онлайн":"● Сервер доступен";}
  catch{$("connection").textContent="● Нет связи с сервером";}
 }
 function updateTime(){$("header-time").textContent=new Intl.DateTimeFormat("ru-RU",{hour:"2-digit",minute:"2-digit"}).format(new Date());}
 setMode("register");checkSession();updateStatus();updateTime();setInterval(updateTime,30000);setInterval(updateStatus,30000);
})();