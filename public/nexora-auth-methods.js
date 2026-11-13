/* NEXORA email/password auth interface. */
(() => {
 const init=()=>{
  const form=document.getElementById("auth-form"), modal=document.getElementById("auth-modal");
  if(!form||!modal||form.dataset.emailAuthReady)return;
  form.dataset.emailAuthReady="1";
  const login=document.getElementById("login-fields"), reg=document.getElementById("nx-register-step-2");
  if(!login||!reg)return;
  const el=(tag,attrs={},txt="")=>{const n=document.createElement(tag);Object.entries(attrs).forEach(([k,v])=>k==="class"?n.className=v:n.setAttribute(k,v));if(txt)n.textContent=txt;return n;};
  const regEmail=el("input",{class:"field",type:"email",name:"registerEmail",placeholder:"Email",autocomplete:"email",maxlength:"254"});
  const regPass=el("input",{class:"field",type:"password",name:"registerPassword",placeholder:"Пароль (минимум 10 символов)",autocomplete:"new-password",minlength:"10",maxlength:"128"});
  reg.insertBefore(el("label",{},"Email для входа"),reg.querySelector(".nx-consent"));
  reg.insertBefore(regEmail,reg.querySelector(".nx-consent"));
  reg.insertBefore(el("label",{},"Пароль"),reg.querySelector(".nx-consent"));
  reg.insertBefore(regPass,reg.querySelector(".nx-consent"));regEmail.required=true;regPass.required=true;
  const switcher=el("div",{class:"nx-auth-switcher"});
  const emailTab=el("button",{type:"button",class:"btn small"},"Email и пароль");
  const codeTab=el("button",{type:"button",class:"btn small"},"Код персонажа");
  switcher.append(emailTab,codeTab);login.insertBefore(switcher,login.firstChild);
  const code=document.getElementById("nx-character-code"),codeSubmit=document.getElementById("auth-login-submit");
  const emailLabel=el("label",{},"Email"),email=el("input",{class:"field",type:"email",name:"loginEmail",placeholder:"Email",autocomplete:"username"});
  const passLabel=el("label",{},"Пароль"),pass=el("input",{class:"field",type:"password",name:"loginPassword",placeholder:"Пароль",autocomplete:"current-password"});
  const emailSubmit=el("button",{type:"submit",class:"btn primary"},"Войти по email");
  login.insertBefore(emailLabel,code);login.insertBefore(email,code);login.insertBefore(passLabel,code);login.insertBefore(pass,code);login.insertBefore(emailSubmit,code);
  const note=el("p",{class:"muted"},"Также можно войти по коду восстановления персонажа.");login.appendChild(note);
  const social=el("div",{class:"nx-social-auth"},"Google, Apple и VK ID: подключение появится после добавления ключей OAuth в настройки сервера.");
  reg.appendChild(social);login.appendChild(social.cloneNode(true));
  let method="email";
  const setMethod=v=>{
   method=v;const useCode=v==="code";
   [code,codeSubmit].forEach(x=>x.classList.toggle("hidden",!useCode));
   [emailLabel,email,passLabel,pass,emailSubmit].forEach(x=>x.classList.toggle("hidden",useCode));
   code.required=useCode;email.required=!useCode;pass.required=!useCode;
   emailTab.classList.toggle("primary",!useCode);codeTab.classList.toggle("primary",useCode);
  };
  emailTab.onclick=()=>setMethod("email");codeTab.onclick=()=>setMethod("code");setMethod("email");
  new MutationObserver(()=>{if(modal.classList.contains("open")&&!document.getElementById("register-wizard").classList.contains("hidden")){setMethod("email")}else if(modal.classList.contains("open")){setMethod("email")}}).observe(modal,{attributes:true,attributeFilter:["class"]});
  const message=t=>{const x=document.getElementById("toast");if(x){x.textContent=t;x.classList.add("show");setTimeout(()=>x.classList.remove("show"),4500)}else alert(t);};
  const post=async(url,payload)=>{const r=await fetch(url,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Ошибка авторизации");return d;};
  form.addEventListener("submit",async e=>{
   const registering=!document.getElementById("register-wizard").classList.contains("hidden");
   if(registering&&reg.classList.contains("hidden"))return;
   if(!registering&&method==="code")return;
   e.preventDefault();e.stopImmediatePropagation();
   const button=registering?document.getElementById("auth-submit"):method==="code"?codeSubmit:emailSubmit;if(button)button.disabled=true;
   try{
    let data;
    if(registering){
     const adult=form.querySelector("[name=adultConfirmed]");
     if(!adult?.checked)throw new Error("Подтверди возраст 18+ и согласие с политикой.");
     const gender=document.querySelector("[data-gender-choice].active")?.dataset.genderChoice||"female";
     const label=document.getElementById("nx-body-label")?.textContent||"Классическое";
     const body=label==="Стройное"?"slim":label==="Спортивное"?"athletic":"regular";
     data=await post("/api/auth/register-email",{email:regEmail.value.trim(),password:regPass.value,username:form.elements.username.value.trim(),gender,body,adultConfirmed:true});
    }else{
     data=await post("/api/auth/login-email",{email:email.value.trim(),password:pass.value});
    }
    try{localStorage.setItem("nexora-session-active","1");}catch{}
    message(data.characterCode?"Аккаунт создан. Сохрани код персонажа: "+data.characterCode:"Вход выполнен.");
    modal.classList.remove("open");setTimeout(()=>location.reload(),500);
   }catch(err){message(err.message);}finally{if(button)button.disabled=false;}
  },true);
 };
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();