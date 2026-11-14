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

 $("head-prev").addEventListener("click",()=>changeCreatorChoice("head",-1));$("head-next").addEventListener("click",()=>changeCreatorChoice("head",1));$("body-prev").addEventListener("click",()=>changeCreatorChoice("body",-1));$("body-next").addEventListener("click",()=>changeCreatorChoice("body",1));
 function changeCreatorChoice(kind,delta){const key=kind==="head"?"headId":"bodyId",max=kind==="head"?6:6;state[key]=((state[key]-1+delta+max)%max)+1;renderCreator();}
 const spriteCrops={
  head:[[108,908,188,174],[503,885,202,202],[902,904,202,181],[108,1249,191,210],[503,1235,202,217],[902,1273,202,195]],
  body:[[101,983,202,188],[480,856,253,304],[897,897,224,275],[101,1193,210,347],[434,1229,325,318],[897,1236,224,311]]
 };
 const spritePromises={};
 function removeScreenshotBackground(ctx,w,h){
  const frame=ctx.getImageData(0,0,w,h),pixels=frame.data;
  const corners=[[0,0],[w-1,0],[0,h-1],[w-1,h-1]];
  const bg=[0,1,2].map(ch=>Math.round(corners.reduce((sum,[x,y])=>sum+pixels[(y*w+x)*4+ch],0)/corners.length));
  for(let i=0;i<pixels.length;i+=4){
   const oldAlpha=pixels[i+3]/255;
   const distance=Math.hypot(pixels[i]-bg[0],pixels[i+1]-bg[1],pixels[i+2]-bg[2]);
   const alpha=Math.max(0,Math.min(1,(distance-16)/42))*oldAlpha;
   if(alpha<=0.01){pixels[i+3]=0;continue;}
   for(let ch=0;ch<3;ch++)pixels[i+ch]=Math.max(0,Math.min(255,Math.round((pixels[i+ch]-bg[ch]*(1-alpha))/alpha)));
   pixels[i+3]=Math.round(alpha*255);
  }
  ctx.putImageData(frame,0,0);
 }

 function trimmedSpriteDataUrl(canvas,w,h){
 const d=canvas.getContext("2d").getImageData(0,0,w,h).data;let x0=w,y0=h,x1=-1,y1=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(d[(y*w+x)*4+3]>18){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
 if(x1<x0||y1<y0)return canvas.toDataURL("image/png");
 x0=Math.max(0,x0-2);y0=Math.max(0,y0-2);x1=Math.min(w-1,x1+2);y1=Math.min(h-1,y1+2);
 const out=document.createElement("canvas");out.width=x1-x0+1;out.height=y1-y0+1;
 out.getContext("2d").drawImage(canvas,x0,y0,out.width,out.height,0,0,out.width,out.height);
 return out.toDataURL("image/png");
}

 function getSprite(kind,id){
  const safeId=Math.max(1,Math.min(6,Number(id)||1));
  if(kind==="head")return Promise.resolve("/assets/sprites/characters/nexora-devil-head-"+safeId+".svg?v=devil-heads-v1");
  if(kind==="body")return Promise.resolve("/assets/sprites/characters/nexora-body-"+safeId+".svg?v=body-art-v2-20261115");
  const key=kind+":"+id;
  if(spritePromises[key])return spritePromises[key];
  spritePromises[key]=new Promise((resolve,reject)=>{
   const source=new Image();
   source.onload=()=>{
    const [x,y,w,h]=spriteCrops[kind][id-1];
    if(x+w>source.naturalWidth||y+h>source.naturalHeight){reject(new Error("Sprite crop exceeds source image"));return;}
    const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d");
    if(!ctx){reject(new Error("Canvas is unavailable"));return;}
    ctx.clearRect(0,0,w,h);ctx.drawImage(source,x,y,w,h,0,0,w,h);removeScreenshotBackground(ctx,w,h);
    resolve(trimmedSpriteDataUrl(canvas,w,h));
   };
   source.onerror=()=>reject(new Error("Не удалось загрузить исходный спрайт "+kind));
   source.src="/assets/sprites/characters/IMG_415"+(kind==="head"?"7":"8")+".png?v=source-sprite-20261115";
  });
  return spritePromises[key];
 }
 function applySprite(img,kind,id){
  if(!img)return;
  img.alt=kind==="head"?"Голова "+id:"Тело "+id;
  getSprite(kind,id).then(src=>{img.src=src;}).catch(error=>{console.error("NEXORA sprite error:",error);img.alt="Спрайт недоступен";});
 }
 function renderCreator(){
  const bodyList=$("body-options"),headList=$("head-options"),preview=$("creator-preview");if(!headList||!preview)return;
  const bodyPicker=bodyList&&bodyList.closest(".nexora-creator-picker");if(bodyPicker)bodyPicker.hidden=false;
  const makeChoice=(kind,id,selected)=>{
   const button=document.createElement("button");button.type="button";button.className="nexora-creator-choice"+(selected?" selected":"");
   button.setAttribute("aria-label",(kind==="head"?"Голова ":"Тело ")+id);button.setAttribute("aria-pressed",String(selected));
   const img=document.createElement("img");img.alt=(kind==="head"?"Голова ":"Тело ")+id;img.draggable=false;button.append(img);applySprite(img,kind,id);
   button.addEventListener("click",()=>{state[kind==="head"?"headId":"bodyId"]=id;renderCreator();});return button;
  };
  if(bodyList){bodyList.replaceChildren();for(let i=1;i<=6;i++)bodyList.append(makeChoice("body",i,state.bodyId===i));}
  headList.replaceChildren();for(let i=1;i<=6;i++)headList.append(makeChoice("head",i,state.headId===i));
  preview.innerHTML='<div class="nexora-creator-preview-stack"><img class="creator-preview-body" alt="Тело"><img class="creator-preview-head" alt="Голова"></div>';
  applySprite(preview.querySelector(".creator-preview-body"),"body",state.bodyId);
  applySprite(preview.querySelector(".creator-preview-head"),"head",state.headId);
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