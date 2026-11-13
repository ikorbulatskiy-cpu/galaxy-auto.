/* Adds app-like section headers and responsive navigation without changing feature APIs. */
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
 pages.forEach(([key,title,description,icon])=>{
  const section=document.getElementById("tab-"+key);
  if(!section||section.querySelector(".nx-section-heading"))return;
  const heading=document.createElement("header");
  heading.className="nx-section-heading";
  const copy=document.createElement("div");
  const h=document.createElement("h1");h.textContent=icon+" "+title;
  const p=document.createElement("p");p.textContent=description;
  copy.append(h,p);
  heading.append(copy);
  section.insertBefore(heading,section.firstChild);
 });
 if(!dashboard.querySelector(".nx-social-bottom")){
  const nav=document.createElement("nav");nav.className="nx-social-bottom";nav.setAttribute("aria-label","Основная навигация");
  const shortcuts=[["world","◎","Мир"],["friends","♟","Друзья"],["messages","✉","Почта"],["profile","♙","Профиль"]];
  shortcuts.forEach(([tab,icon,label])=>{
   const b=document.createElement("button");b.type="button";b.dataset.shortcut=tab;
   const glyph=document.createElement("span");glyph.textContent=icon;
   const caption=document.createElement("small");caption.textContent=label;
   b.append(glyph,caption);
   b.addEventListener("click",()=>dashboard.querySelector('.dashnav [data-tab="'+tab+'"]')?.click());
   nav.append(b);
  });
  const more=document.createElement("button");more.type="button";more.dataset.more="true";more.setAttribute("aria-haspopup","dialog");more.setAttribute("aria-expanded","false");
  const moreIcon=document.createElement("span");moreIcon.textContent="···";
  const moreLabel=document.createElement("small");moreLabel.textContent="Ещё";
  more.append(moreIcon,moreLabel);nav.append(more);dashboard.append(nav);
 }
 let backdrop=dashboard.querySelector(".nx-more-backdrop");
 if(!backdrop){
  backdrop=document.createElement("div");backdrop.className="nx-more-backdrop";backdrop.setAttribute("aria-hidden","true");
  const sheet=document.createElement("section");sheet.className="nx-more-sheet";sheet.setAttribute("role","dialog");sheet.setAttribute("aria-modal","true");sheet.setAttribute("aria-label","Дополнительные разделы");
  const head=document.createElement("div");head.className="nx-more-sheet-head";
  const title=document.createElement("h2");title.textContent="Разделы NEXORA";
  const close=document.createElement("button");close.type="button";close.className="nx-more-close";close.textContent="×";close.setAttribute("aria-label","Закрыть меню");
  head.append(title,close);
  const grid=document.createElement("div");grid.className="nx-more-grid";
  pages.filter(([key])=>!["world","friends","messages","profile"].includes(key)).forEach(([key,label,,icon])=>{
   if(dashboard.querySelector('.dashnav [data-tab="'+key+'"]')?.hidden)return;
   const b=document.createElement("button");b.type="button";b.className="nx-more-link";b.dataset.moreTab=key;
   const glyph=document.createElement("span");glyph.textContent=icon;
   const text=document.createElement("small");text.textContent=label;
   b.append(glyph,text);grid.append(b);
  });
  sheet.append(head,grid);backdrop.append(sheet);dashboard.append(backdrop);
  const closeMenu=()=>{backdrop.classList.remove("open");backdrop.setAttribute("aria-hidden","true");dashboard.querySelector("[data-more]")?.setAttribute("aria-expanded","false")};
  dashboard.querySelector("[data-more]")?.addEventListener("click",()=>{backdrop.classList.add("open");backdrop.setAttribute("aria-hidden","false");dashboard.querySelector("[data-more]")?.setAttribute("aria-expanded","true")});
  close.addEventListener("click",closeMenu);
  backdrop.addEventListener("click",event=>{if(event.target===backdrop)closeMenu()});
  grid.addEventListener("click",event=>{
   const button=event.target.closest("[data-more-tab]");if(!button)return;
   closeMenu();dashboard.querySelector('.dashnav [data-tab="'+button.dataset.moreTab+'"]')?.click();
  });
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&backdrop.classList.contains("open"))closeMenu()});
 }
 const sync=()=>{
  const active=dashboard.querySelector(".tabpane:not(.hidden)");
  const key=active?.id?.replace("tab-","");
  dashboard.querySelectorAll(".nx-social-bottom [data-shortcut]").forEach(b=>b.classList.toggle("active",b.dataset.shortcut===key));
  const more=dashboard.querySelector(".nx-social-bottom [data-more]");
  if(more)more.classList.toggle("active",!!key&&!["world","friends","messages","profile"].includes(key));
 };
 new MutationObserver(sync).observe(dashboard,{attributes:true,subtree:true,attributeFilter:["class"]});
 dashboard.querySelectorAll(".dashnav [data-tab]").forEach(b=>b.addEventListener("click",()=>setTimeout(sync,0)));
 dashboard.querySelectorAll(".nx-social-bottom [data-shortcut]").forEach(b=>b.addEventListener("click",()=>setTimeout(sync,0)));
 sync();
})();