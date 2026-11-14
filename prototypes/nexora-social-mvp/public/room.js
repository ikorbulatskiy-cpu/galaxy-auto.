(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 const state={lastMessageId:0,poll:null,selectedAvatar:null};
 const escapeText=value=>String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
 const room=$("room-screen");
 function showRoom(account){$("intro-screen").classList.add("hidden");room.classList.remove("hidden");$("room-nickname").textContent=account?.nickname||"Игрок";loadMessages(true);if(state.poll)clearInterval(state.poll);state.poll=setInterval(()=>loadMessages(false),2200);}
 function leaveRoom(){if(state.poll)clearInterval(state.poll);state.poll=null;room.classList.add("hidden");$("intro-screen").classList.remove("hidden");}
 async function loadMessages(initial){
  try{const r=await fetch("/api/room/messages?after="+(initial?0:state.lastMessageId));if(!r.ok)return;const d=await r.json();(d.messages||[]).forEach(addMessage);}
  catch(e){console.warn("Chat refresh:",e.message);}
 }
 function addMessage(m){if(!m||Number(m.id)<=state.lastMessageId)return;state.lastMessageId=Number(m.id);const list=$("chat-messages");const row=document.createElement("div");row.className="chat-message"+(m.mine?" mine":"");const name=document.createElement("b");name.textContent=m.nickname;const body=document.createElement("span");body.textContent=m.message;row.append(name,body);list.append(row);list.scrollTop=list.scrollHeight;}
 async function sendMessage(){const input=$("chatInput"),message=input.value.trim();if(!message)return;const button=$("send-chat");button.disabled=true;try{const r=await fetch("/api/room/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message})});const d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось отправить сообщение");input.value="";addMessage(d.message);}catch(e){$("chat-error").textContent=e.message;setTimeout(()=>$("chat-error").textContent="",3500);}finally{button.disabled=false;input.focus();}}
 $("chat-form").addEventListener("submit",e=>{e.preventDefault();sendMessage();});
 $("toggle-emojis").addEventListener("click",()=>{$("emoji-panel").classList.toggle("hidden");$("action-panel").classList.add("hidden");});
 $("toggle-actions").addEventListener("click",()=>{$("action-panel").classList.toggle("hidden");$("emoji-panel").classList.add("hidden");});
 $("emoji-panel").addEventListener("click",e=>{const b=e.target.closest("[data-emoji]");if(b){const input=$("chatInput");input.value+=b.dataset.emoji;input.focus();}});
 $("action-panel").addEventListener("click",e=>{const b=e.target.closest("[data-action]");if(!b)return;const bubble=$("player-bubble");bubble.textContent=b.dataset.action;bubble.classList.add("show");});
 $("leave-room").addEventListener("click",leaveRoom);
 $("room-home").addEventListener("click",leaveRoom);
 document.querySelectorAll(".room-avatar").forEach(a=>a.addEventListener("click",()=>{document.querySelectorAll(".room-avatar").forEach(x=>x.classList.remove("selected"));a.classList.add("selected");state.selectedAvatar=a;}));
 let moving=false;
 $("room-scene").addEventListener("pointerdown",e=>{if(e.target.closest(".room-avatar,.room-decoration"))return;moving=true;movePlayer(e);});
 $("room-scene").addEventListener("pointermove",e=>{if(moving)movePlayer(e);});
 window.addEventListener("pointerup",()=>moving=false);
 function movePlayer(e){const scene=$("room-scene"),rect=scene.getBoundingClientRect(),x=Math.max(5,Math.min(95,(e.clientX-rect.left)/rect.width*100)),y=Math.max(40,Math.min(92,(e.clientY-rect.top)/rect.height*100));$("player-avatar").style.left=x+"%";$("player-avatar").style.top=y+"%";}
 window.NexoraRoom={show:showRoom,leave:leaveRoom};
})();