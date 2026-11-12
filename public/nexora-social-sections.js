/* Adds app-like section headers and bottom shortcuts without changing feature forms or APIs. */
(() => {
 "use strict";
 const dashboard=document.getElementById("dashboard");
 if(!dashboard)return;
 const pages=[
  ["profile","Мой профиль","Анкета, внешний вид и личная информация","♙"],
  ["discover","Поиск людей","Находи новых игроков и знакомься","⌕"],
  ["friends","Друзья","Заявки и список друзей","♟"],
  ["messages","Почта и сообщения","Личные диалоги","✉"],
  ["characters","Персонажи","Твои игровые образы и внешность","♜"],
  ["notifications","Уведомления","События и ответы других игроков","♢"],
  ["clans","Кланы","Сообщества, участники и общий банк","⚑"],
  ["economy","Магазин и инвентарь","Предметы, подарки и игровой кошелёк","▣"],
  ["pets","Питомцы","Твои спутники в игровом мире","♧"],
  ["blogs","Блоги","Публикации и фотографии игроков","▤"],
  ["relationships","Отношения","Предложения и виртуальные церемонии","♡"],
  ["rankings","Рейтинги и достижения","Соревнования и прогресс","★"],
  ["admin","Администрирование","Инструменты модерации","⚙"]
 ];
 const titles=new Map(pages.map(x=>[x[0],x]));
 pages.forEach(([key,title,description,icon])=>{
  const section=document.getElementById("tab-"+key);
  if(!section||section.querySelector(".nx-section-heading"))return;
  const heading=document.createElement("header");
  heading.className="nx-section-heading";
  const copy=document.createElement("div");
  const h=document.createElement("h1");h.textContent=icon+" "+title;
  const p=document.createElement("p");p.textContent=description;
  copy.append(h,p);
  const back=document.createElement("button");back.type="button";back.textContent="⌂";back.setAttribute("aria-label","Вернуться в игровой мир");
  back.addEventListener("click",()=>window.switchTab?.("world"));
  heading.append(copy,back);
  section.insertBefore(heading,section.firstChild);
 });
 if(!dashboard.querySelector(".nx-social-bottom")){
  const nav=document.createElement("nav");nav.className="nx-social-bottom";nav.setAttribute("aria-label","Быстрая навигация");
  const shortcuts=[["world","◎","Игровой мир"],["friends","♟","Друзья"],["messages","✉","Почта"],["profile","♙","Профиль"]];
  shortcuts.forEach(([tab,icon,label])=>{
   const b=document.createElement("button");b.type="button";b.dataset.shortcut=tab;
   const glyph=document.createElement("span");glyph.textContent=icon;
   const caption=document.createElement("small");caption.textContent=label;
   b.append(glyph,caption);
   b.addEventListener("click",()=>window.switchTab?.(tab));
   nav.append(b);
  });
  dashboard.append(nav);
 }
 const sync=()=>{
  const active=dashboard.querySelector(".tabpane:not(.hidden)");
  const key=active?.id?.replace("tab-","");
  dashboard.querySelectorAll(".nx-social-bottom [data-shortcut]").forEach(b=>b.classList.toggle("active",b.dataset.shortcut===key));
 };
 new MutationObserver(sync).observe(dashboard,{attributes:true,subtree:true,attributeFilter:["class"]});
 dashboard.querySelectorAll(".dashnav [data-tab]").forEach(b=>b.addEventListener("click",()=>setTimeout(sync,0)));
 dashboard.querySelectorAll(".nx-social-bottom [data-shortcut]").forEach(b=>b.addEventListener("click",()=>setTimeout(sync,0)));
 sync();
})();