(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 const state={lastMessageId:0,poll:null,clockTimer:null};
 function updateVisitorClock(){
  const clock=$("visitor-clock");
  if(!clock)return;
  try{clock.textContent=new Intl.DateTimeFormat(undefined,{hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date());}
  catch{clock.textContent=new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});}
 }
 const room=$("room-screen");
 function showRoom(account){
  $("intro-screen").classList.add("hidden");
  room.classList.remove("hidden");
  updateVisitorClock();
  if(state.clockTimer)clearInterval(state.clockTimer);
  state.clockTimer=setInterval(updateVisitorClock,15000);
  loadMessages(true);
  if(state.poll)clearInterval(state.poll);
  state.poll=setInterval(()=>loadMessages(false),2200);
 }
 function leaveRoom(){
  if(state.poll)clearInterval(state.poll);
  state.poll=null;
  if(state.clockTimer)clearInterval(state.clockTimer);
  state.clockTimer=null;
  room.classList.add("hidden");
  $("intro-screen").classList.remove("hidden");
 }
 async function loadMessages(initial){
  try{
   const response=await fetch("/api/room/messages?after="+(initial?0:state.lastMessageId));
   if(!response.ok)throw new Error("Chat unavailable");
   const data=await response.json();
   (data.messages||[]).forEach(addMessage);
  }catch{
   $("chat-error").textContent="Чат временно недоступен";
   setTimeout(()=>$("chat-error").textContent="",3000);
  }
 }
 function addMessage(message){
  if(!message||Number(message.id)<=state.lastMessageId)return;
  state.lastMessageId=Number(message.id);
  const list=$("room-screen").querySelector(".chat-space");
  const row=document.createElement("div");
  row.className="chat-line"+(message.mine?" mine":"");
  const name=document.createElement("b");
  name.textContent=message.nickname+":";
  const body=document.createElement("span");
  body.textContent=message.message;
  row.append(name,body);
  list.append(row);
  list.scrollTop=list.scrollHeight;
 }
 async function sendMessage(){
  const input=$("chatInput");
  const message=input.value.trim();
  if(!message)return;
  const button=$("send-chat");
  button.disabled=true;
  try{
   const response=await fetch("/api/room/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"Не удалось отправить сообщение");
   input.value="";
   addMessage(data.message);
  }catch(error){
   $("chat-error").textContent=error.message;
   setTimeout(()=>$("chat-error").textContent="",3500);
  }finally{
   button.disabled=false;
   input.focus();
  }
 }
 $("chat-form").addEventListener("submit",event=>{event.preventDefault();sendMessage();});
 const actionsButton=$("room-actions");
 if(actionsButton)actionsButton.addEventListener("click",()=>{
  const toast=$("toast");
  toast.textContent="Действия персонажа появятся здесь.";
  toast.classList.add("visible");
  clearTimeout(state.toastTimer);
  state.toastTimer=setTimeout(()=>toast.classList.remove("visible"),2500);
 });
 const exitButton=$("room-exit");
 if(exitButton)exitButton.addEventListener("click",leaveRoom);
 window.NexoraRoom={show:showRoom,leave:leaveRoom};
})();