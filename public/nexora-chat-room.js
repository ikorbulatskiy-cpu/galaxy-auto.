/* NEXORA isolated mobile messenger + rooftop room. UI demo; chat transport is not connected yet. */
(()=>{"use strict";
const root=document.createElement("section");root.id="nx-chat-room";root.setAttribute("aria-label","Игровая чат-комната");
root.innerHTML=`<div class="nxcr-shell">
<header class="nxcr-header"><div class="nxcr-head-left"><button class="nxcr-icon" id="nxcr-menu" aria-label="Меню">☰</button><div class="nxcr-online">online <b id="nxcr-count">53</b></div></div><button class="nxcr-close" id="nxcr-exit">Выйти ✕</button></header>
<div class="nxcr-menu" id="nxcr-menu-panel"><button data-nxcr-menu="profile">Мой персонаж</button><button data-nxcr-menu="friends">Друзья</button><button data-nxcr-menu="close">Закрыть меню</button></div>
<div class="nxcr-chat" id="nxcr-chat" aria-live="polite">
<div class="nxcr-message"><div class="nxcr-avatar">✦</div><div class="nxcr-bubble"><div class="nxcr-meta"><span class="nxcr-name">Луна</span><time class="nxcr-time">10:21</time></div><div class="nxcr-text">Какой красивый сегодня закат на крыше 🌇</div></div></div>
<div class="nxcr-message"><div class="nxcr-avatar">☄</div><div class="nxcr-bubble"><div class="nxcr-meta"><span class="nxcr-name">Марк</span><time class="nxcr-time">10:22</time></div><div class="nxcr-text">Собрались здесь почти все. Привет!</div></div></div>
<div class="nxcr-message mine"><div class="nxcr-avatar">✧</div><div class="nxcr-bubble"><div class="nxcr-meta"><span class="nxcr-name">Ты</span><time class="nxcr-time">10:23</time></div><div class="nxcr-text">Привет всем 👋</div></div></div>
</div>
<form class="nxcr-compose" id="nxcr-form"><button class="nxcr-emoji" type="button" id="nxcr-emoji" aria-label="Смайлы">☺</button><input class="nxcr-input" id="nxcr-input" maxlength="500" autocomplete="off" placeholder="Написать сообщение…"><button class="nxcr-send" type="submit" aria-label="Отправить">➤</button></form>
<section class="nxcr-scene" aria-label="Игровая сцена: крыша на закате"><div class="nxcr-sun"></div><div class="nxcr-city"></div><div class="nxcr-scene-title">КРЫША · ЗАКАТ</div><div class="nxcr-rail"></div><div class="nxcr-roof"></div><div class="nxcr-actors" id="nxcr-actors">
<button class="nxcr-actor" data-name="Луна" aria-label="Выбрать Луну"><span class="nxcr-actor-name">Луна</span><canvas data-nexora-sprite data-size="full" data-look='{"gender":"female","body":"slim","hair":"long","outfit":"pink"}'></canvas></button>
<button class="nxcr-actor is-selected" data-name="Ты" aria-label="Выбрать своего персонажа"><span class="nxcr-actor-name">Ты</span><canvas data-nexora-sprite data-size="full" data-look='{"gender":"male","body":"regular","hair":"short","outfit":"blue"}'></canvas></button>
<button class="nxcr-actor" data-name="Марк" aria-label="Выбрать Марка"><span class="nxcr-actor-name">Марк</span><canvas data-nexora-sprite data-size="full" data-look='{"gender":"male","body":"athletic","hair":"short","outfit":"blue"}'></canvas></button>
</div></section>
<nav class="nxcr-toolbar"><button class="nxcr-tool" data-action="wave" aria-label="Помахать">✋</button><button class="nxcr-tool" data-action="move" aria-label="Переместить">➜</button><span class="nxcr-selected" id="nxcr-selected">Ты</span><button class="nxcr-tool" data-action="dance" aria-label="Танец">🚀</button></nav>
<div class="nxcr-notice" id="nxcr-notice"></div></div>`;
document.body.append(root);
const launcher=document.createElement("button");launcher.type="button";launcher.id="nxcr-launcher";launcher.textContent="▣ Чат-комната";
launcher.style.cssText="position:fixed;right:16px;bottom:18px;z-index:10010;border:1px solid #7b9a9a;border-radius:22px;padding:11px 15px;background:#174c50;color:#fff;font:700 13px Inter,-apple-system,sans-serif;box-shadow:0 5px 22px #0007;cursor:pointer";
document.body.append(launcher);
const $=s=>root.querySelector(s);let selected="Ты",noticeTimer;
function notice(text){const n=$("#nxcr-notice");n.textContent=text;n.classList.add("show");clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>n.classList.remove("show"),1700)}
function open(){root.classList.add("is-open");document.body.style.overflow="hidden";if(window.NexoraSpriteAvatar)window.NexoraSpriteAvatar.mountAll(root);$("#nxcr-chat").scrollTop=$("#nxcr-chat").scrollHeight}
function close(){root.classList.remove("is-open");document.body.style.overflow=""}
launcher.addEventListener("click",open);$("#nxcr-exit").addEventListener("click",close);
$("#nxcr-menu").addEventListener("click",()=>$("#nxcr-menu-panel").classList.toggle("open"));
$("#nxcr-menu-panel").addEventListener("click",e=>{const b=e.target.closest("[data-nxcr-menu]");if(!b)return;$("#nxcr-menu-panel").classList.remove("open");if(b.dataset.nxcrMenu==="close")return;if(b.dataset.nxcrMenu==="profile")notice("Профиль персонажа");else notice("Список друзей")});
$("#nxcr-actors").addEventListener("click",e=>{const actor=e.target.closest(".nxcr-actor");if(!actor)return;root.querySelectorAll(".nxcr-actor").forEach(x=>x.classList.toggle("is-selected",x===actor));selected=actor.dataset.name;$("#nxcr-selected").textContent=selected;notice("Выбран персонаж: "+selected)});
$("#nxcr-form").addEventListener("submit",e=>{e.preventDefault();const input=$("#nxcr-input"),value=input.value.trim();if(!value)return;const row=document.createElement("div");row.className="nxcr-message mine";const avatar=document.createElement("div");avatar.className="nxcr-avatar";avatar.textContent="✧";const bubble=document.createElement("div");bubble.className="nxcr-bubble";const meta=document.createElement("div");meta.className="nxcr-meta";const name=document.createElement("span");name.className="nxcr-name";name.textContent=selected;const time=document.createElement("time");time.className="nxcr-time";time.textContent=new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});meta.append(name,time);const text=document.createElement("div");text.className="nxcr-text";text.textContent=value;bubble.append(meta,text);row.append(avatar,bubble);$("#nxcr-chat").append(row);input.value="";$("#nxcr-chat").scrollTop=$("#nxcr-chat").scrollHeight;notice("Сообщение добавлено в локальный предпросмотр")});
$("#nxcr-emoji").addEventListener("click",()=>{const i=$("#nxcr-input");i.value+="🙂";i.focus()});
root.querySelectorAll("[data-action]").forEach(b=>b.addEventListener("click",()=>{const action=b.dataset.action;if(action==="move"){notice("Нажми на персонажа, чтобы выбрать его");return}const actor=root.querySelector(".nxcr-actor.is-selected");const canvas=actor?.querySelector("canvas");const sprite=canvas&&window.NexoraSpriteAvatar?.get(canvas);if(sprite)sprite.setAnimation(action==="wave"?"wave":"dance");notice(action==="wave"?"Персонаж машет рукой":"Персонаж запускает действие")}));
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&root.classList.contains("is-open"))close()});
if(window.NexoraSpriteAvatar)window.NexoraSpriteAvatar.mountAll(root);
})();