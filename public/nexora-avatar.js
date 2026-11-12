/* NEXORA layered 2D avatar renderer and original sprite catalog. */
(()=> {
  const catalog = {
    body: {
      slim: "M31 160 Q32 113 46 101 L74 101 Q88 113 89 160 Z",
      regular: "M22 160 Q23 112 42 101 L78 101 Q98 113 99 160 Z",
      athletic: "M14 160 Q16 111 39 99 L81 99 Q104 111 106 160 Z"
    },
    hair: {
      short: "M31 47 Q30 12 60 14 Q91 12 89 49 L80 38 Q61 28 42 40 Z",
      long: "M30 50 Q27 12 60 14 Q94 12 90 50 L94 111 Q83 105 79 79 L41 79 Q36 102 26 111 Z",
      curly: "M30 49 Q21 25 39 18 Q48 5 61 15 Q78 4 87 22 Q101 31 89 53 L80 39 Q60 28 42 40 Z",
      bun: "M31 48 Q28 14 60 14 Q91 14 89 49 L80 38 Q60 28 42 40 Z M73 15 Q72 -1 88 4 Q101 11 88 23 Z",
      bob: "M29 51 Q26 12 60 14 Q94 12 91 51 L88 78 L78 72 L79 43 Q60 30 41 43 L42 72 L32 78 Z",
      ponytail: "M31 48 Q28 14 60 14 Q91 14 89 49 L80 38 Q60 28 42 40 Z M82 35 Q104 42 96 82 Q89 76 88 57 Z",
      spiky: "M31 49 L25 28 L42 35 L47 10 L61 31 L75 9 L78 35 L96 24 L88 53 L80 39 Q60 28 42 40 Z"
    },
    palettes: {
      skin: {light:"#f2c9a5",medium:"#d49a6c",tan:"#a96e45",dark:"#68402f"},
      hair: {black:"#211b28",brown:"#5b3825",blonde:"#f1cf73",red:"#b8463d",pink:"#ed72b2",blue:"#5f8de8",purple:"#9d68d3"},
      eyes: {brown:"#5b3825",blue:"#5f8de8",green:"#4d9a67",gray:"#8794a4"},
      outfit: {violet:"#8062d9",blue:"#477ed6",pink:"#dc6eaa",white:"#e6e9f2",green:"#4f9c77",gold:"#c99b3c"},
      shoes: {sneakers:"#30384b",boots:"#4a3540",heels:"#a34d76","moon-boots":"#a4b8d8"}
    },
    layers: ["background","shoes","body","outfit","arms","neck","face","eyes","expression","hair","headwear","accessories"]
  };
  const safe=(value, choices, fallback)=>Object.prototype.hasOwnProperty.call(choices,value)?choices[value]:fallback;
  function render(look={}, equipped=[], size="full") {
    const p=catalog.palettes;
    const skin=safe(look.skinTone,p.skin,p.skin.medium);
    const hair=safe(look.hairColor,p.hair,p.hair.brown);
    const eyes=safe(look.eyes,p.eyes,p.eyes.brown);
    const outfit=safe(look.outfit,p.outfit,p.outfit.violet);
    const shoes=safe(look.shoes,p.shoes,p.shoes.sneakers);
    const body=catalog.body[look.body]||catalog.body.regular;
    const hairPath=catalog.hair[look.hair]||catalog.hair.short;
    const head=look.head==="soft" ? '<ellipse cx="60" cy="54" rx="27" ry="31" fill="'+skin+'"/>' :
      look.head==="angular" ? '<path d="M60 23 Q88 23 88 51 L80 76 L60 86 L40 76 L32 51 Q32 23 60 23 Z" fill="'+skin+'"/>' :
      '<circle cx="60" cy="54" r="30" fill="'+skin+'"/>';
    const eyeLayer=look.eyeStyle==="wide" ? '<ellipse cx="49" cy="57" rx="4.5" ry="5.5" fill="'+eyes+'"/><ellipse cx="71" cy="57" rx="4.5" ry="5.5" fill="'+eyes+'"/>' :
      look.eyeStyle==="narrow" ? '<path d="M44 57 Q49 53 54 57 M66 57 Q71 53 76 57" fill="none" stroke="'+eyes+'" stroke-width="3" stroke-linecap="round"/>' :
      '<ellipse cx="49" cy="57" rx="3" ry="4" fill="'+eyes+'"/><ellipse cx="71" cy="57" rx="3" ry="4" fill="'+eyes+'"/>';
    const mouth=look.expression==="neutral" ? '<path d="M53 74 L67 74" stroke="#713e43" stroke-width="2" stroke-linecap="round"/>' :
      '<path d="M53 72 Q60 78 67 72" fill="none" stroke="#713e43" stroke-width="2" stroke-linecap="round"/>';
    const equippedList=Array.isArray(equipped)?equipped:[];
    const slugs=equippedList.map(x=>x.slug);
    const headwear=slugs.includes("nexora-crystal-crown") ? '<path d="M34 34 L42 17 L54 29 L61 12 L70 29 L82 17 L87 35 Z" fill="#a8e7ff" stroke="#f2fbff" stroke-width="2"/>' :
      slugs.includes("nexora-gold-halo") ? '<ellipse cx="60" cy="19" rx="22" ry="5" fill="none" stroke="#f5d46d" stroke-width="4"/>' :
      equippedList.some(x=>x.category==="head") ? '<path d="M29 43 Q31 12 60 12 Q89 12 91 43 L84 38 Q60 27 36 38 Z" fill="#8b6cff" stroke="#d6c7ff" stroke-width="2"/>' : "";
    const accessory=slugs.includes("nexora-star-glasses")||slugs.includes("nexora-neon-sunglasses") ?
      '<path d="M42 56 Q49 49 56 56 L54 63 Q48 67 43 62 Z M64 56 Q71 49 78 56 L77 62 Q71 67 65 63 Z M56 58 L64 58" stroke="#e8d9ff" stroke-width="2.5" fill="none"/>' :
      slugs.includes("nexora-silver-wings") ? '<path d="M35 105 Q4 83 17 60 Q38 70 43 101 M85 105 Q116 83 103 60 Q82 70 77 101" fill="#b9c9e9" stroke="#eef3ff" stroke-width="2"/>' :
      slugs.includes("nexora-heart-pendant") ? '<path d="M60 98 C44 87 50 77 60 85 C70 77 76 87 60 98 Z" fill="#ed78ae" stroke="#ffe2f1" stroke-width="1.5"/>' :
      slugs.includes("nexora-rainbow-scarf") ? '<path d="M43 91 Q60 103 77 91 L74 108 Q60 117 46 108 Z" fill="#c27be8" stroke="#f3d8ff" stroke-width="2"/>' : "";
    const wedding=equippedList.some(x=>x.category==="wedding") ? '<path d="M43 25 L48 14 L57 23 L64 12 L72 24 L79 15 L80 32 L43 32 Z" fill="#f4d57a" stroke="#fff0b2" stroke-width="1.5"/>' : "";
    const width=size==="mini"?60:size==="room"?60:120, height=size==="mini"?82:size==="room"?82:170;
    if(size==="mini"||size==="room"){
      const miniHair=look.hair==="long"?"M12 25 Q12 2 30 3 Q49 2 48 25 L50 58 L42 55 L40 31 Q30 22 20 31 L18 55 L10 58 Z":look.hair==="curly"?"M12 25 Q7 8 19 8 Q25 0 32 8 Q44 1 48 17 L43 31 Q30 21 18 31 Z":"M12 25 Q12 2 30 3 Q49 2 48 25 L42 18 Q30 12 18 19 Z";
      return '<svg viewBox="0 0 60 82" aria-hidden="true"><path d="M12 78 Q12 43 21 40 L39 40 Q48 43 48 78 Z" fill="'+outfit+'"/><circle cx="30" cy="26" r="17" fill="'+skin+'"/><path d="'+miniHair+'" fill="'+hair+'"/><circle cx="24" cy="28" r="2" fill="'+eyes+'"/><circle cx="36" cy="28" r="2" fill="'+eyes+'"/><path d="M25 36 Q30 40 35 36" stroke="#713e43" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>';
    }
    return '<svg class="avatar-svg" viewBox="0 0 120 170" role="img" aria-label="2D персонаж" data-avatar-layers="'+catalog.layers.join(",")+'"><g data-layer="shoes"><path d="M35 158 L57 158 L57 168 L31 168 Z M63 158 L85 158 L89 168 L63 168 Z" fill="'+shoes+'"/></g><g data-layer="body"><path d="'+body+'" fill="'+outfit+'"/><path d="M43 99 L43 86 L77 86 L77 101 Z" fill="'+skin+'"/></g><g data-layer="face">'+head+'</g><g data-layer="hair"><path d="'+hairPath+'" fill="'+hair+'"/></g><g data-layer="headwear">'+headwear+'</g><g data-layer="eyes">'+eyeLayer+mouth+'</g><g data-layer="accessories">'+accessory+wedding+'</g><g data-layer="arms"><path d="M30 126 L17 151 L32 157 L43 132 Z M90 126 L103 151 L88 157 L77 132 Z" fill="'+outfit+'"/></g></svg>';
  }
  function mountLibrary(host, form) {
    if(!host||!form||host.dataset.ready==="1")return;
    host.dataset.ready="1";
    const groups=[
      ["body","Телосложение"],["head","Форма лица"],["skinTone","Кожа"],["hair","Причёска"],["hairColor","Цвет волос"],["eyes","Глаза"],["eyeStyle","Форма глаз"],["expression","Выражение"],["outfit","Одежда"],["shoes","Обувь"]
    ];
    host.innerHTML='<div class="nx-avatar-layer-title">СЛОИ ПЕРСОНАЖА</div>'+groups.map(([key,label])=>{
      const control=form.elements[key];if(!control)return "";
      const options=[...control.options].map(option=>'<button type="button" class="nx-sprite-choice" data-avatar-field="'+key+'" data-avatar-value="'+option.value+'">'+option.textContent+'</button>').join("");
      return '<section class="nx-sprite-group"><b>'+label+'</b><div class="nx-sprite-options">'+options+'</div></section>';
    }).join("");
    host.addEventListener("click",event=>{
      const button=event.target.closest("[data-avatar-field]");if(!button)return;
      const control=form.elements[button.dataset.avatarField];if(!control)return;
      control.value=button.dataset.avatarValue;control.dispatchEvent(new Event("change",{bubbles:true}));
      host.querySelectorAll('[data-avatar-field="'+button.dataset.avatarField+'"]').forEach(item=>item.classList.toggle("active",item===button));
    });
    form.addEventListener("change",()=>{
      host.querySelectorAll("[data-avatar-field]").forEach(button=>{
        button.classList.toggle("active",form.elements[button.dataset.avatarField]?.value===button.dataset.avatarValue);
      });
    });
    form.dispatchEvent(new Event("change"));
  }
  window.NexoraAvatar={render,catalog,mountLibrary};
})();