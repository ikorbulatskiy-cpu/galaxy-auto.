(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 const state={lastMessageId:0,poll:null,selected:null,randomTimer:null,clockTimer:null};
 const room=$("room-screen"),scene=$("room-scene");
 const avatars=()=>Array.from(scene.querySelectorAll(".avatar"));
 function bubble(avatar,text){const node=avatar.querySelector(".bubble");if(!node)return;node.textContent=text;node.classList.add("show");clearTimeout(node.hideTimer);node.hideTimer=setTimeout(()=>node.classList.remove("show"),3200);}
 function showRoom(account){
  $("intro-screen").classList.add("hidden");room.classList.remove("hidden");
  $("room-nickname").textContent=account?.nickname||"Игрок";$("player-label").textContent=account?.nickname||"Ты";
  updateClock();loadWallet();loadMessages(true);
  if(state.poll)clearInterval(state.poll);state.poll=setInterval(()=>loadMessages(false),2200);
  if(state.clockTimer)clearInterval(state.clockTimer);state.clockTimer=setInterval(updateClock,1000);
  scheduleRandomAction();
 }
 function leaveRoom(){
  if(state.poll)clearInterval(state.poll);if(state.randomTimer)clearTimeout(state.randomTimer);if(state.clockTimer)clearInterval(state.clockTimer);
  state.poll=state.randomTimer=state.clockTimer=null;room.classList.add("hidden");$("intro-screen").classList.remove("hidden");
 }
 function updateClock(){$("room-clock").textContent=new Intl.DateTimeFormat("ru-RU",{hour:"2-digit",minute:"2-digit"}).format(new Date());}
 async function loadWallet(){try{const r=await fetch("/api/account/wallet");if(!r.ok)throw Error();const d=await r.json();$("diamond-balance").textContent=Number(d.diamonds).toLocaleString("ru-RU");}catch{$("diamond-balance").textContent="—";}}
 async function loadMessages(initial){
  try{const r=await fetch("/api/room/messages?after="+(initial?0:state.lastMessageId));if(!r.ok)throw Error();const d=await r.json();(d.messages||[]).forEach(addMessage);}
  catch(e){$("chat-error").textContent="Чат временно недоступен";setTimeout(()=>$("chat-error").textContent="",3000);}
 }
 function addMessage(m){
  if(!m||Number(m.id)<=state.lastMessageId)return;state.lastMessageId=Number(m.id);
  const list=scene.parentElement.querySelector(".chat-space");const row=document.createElement("div");row.className="chat-line"+(m.mine?" mine":"");
  const name=document.createElement("b");name.textContent=m.nickname+":";
  const body=document.createElement("span");body.textContent=m.message;row.append(name,body);list.append(row);list.scrollTop=list.scrollHeight;
 }
 async function sendMessage(){
  const input=$("chatInput"),message=input.value.trim();if(!message)return;
  const button=$("send-chat");button.disabled=true;
  try{const r=await fetch("/api/room/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message})});const d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось отправить сообщение");input.value="";addMessage(d.message);}
  catch(e){$("chat-error").textContent=e.message;setTimeout(()=>$("chat-error").textContent="",3500);}
  finally{button.disabled=false;input.focus();}
 }
 $("chat-form").addEventListener("submit",e=>{e.preventDefault();sendMessage();});
 $("toggle-emojis").addEventListener("click",()=>$("emoji-panel").classList.toggle("hidden"));
 $("emoji-panel").addEventListener("click",e=>{const b=e.target.closest("[data-emoji]");if(!b)return;const input=$("chatInput");input.value+=b.dataset.emoji;input.focus();});
 $("toggle-actions").addEventListener("click",()=>$("action-panel").classList.toggle("hidden"));
 $("action-panel").addEventListener("click",e=>{const b=e.target.closest("[data-action]");if(!b)return;const target=state.selected||$("player-avatar");bubble(target,b.dataset.action);});
 $("leave-room").addEventListener("click",leaveRoom);$("room-home").addEventListener("click",leaveRoom);
 $("diamonds").addEventListener("click",loadWallet);
 avatars().forEach(a=>{a.addEventListener("click",()=>selectAvatar(a));a.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();selectAvatar(a);}});});
 function selectAvatar(a){avatars().forEach(x=>x.classList.remove("selected"));a.classList.add("selected");state.selected=a;}
 scene.addEventListener("dblclick",e=>{
  if(e.target.closest(".avatar,.actions"))return;const target=state.selected||$("player-avatar");
  const r=scene.getBoundingClientRect();target.style.left=Math.max(4,Math.min(96,(e.clientX-r.left)/r.width*100))+"%";
  target.style.top=Math.max(48,Math.min(91,(e.clientY-r.top)/r.height*100))+"%";
 });
 function scheduleRandomAction(){
  const phrases=["Привет всем!","Как дела?","💕","Красивая комната!","😊","Рада вас видеть!"];
  state.randomTimer=setTimeout(()=>{const list=avatars(),a=list[Math.floor(Math.random()*list.length)];bubble(a,phrases[Math.floor(Math.random()*phrases.length)]);scheduleRandomAction();},5000+Math.random()*5000);
 }
 window.NexoraRoom={show:showRoom,leave:leaveRoom};
})();