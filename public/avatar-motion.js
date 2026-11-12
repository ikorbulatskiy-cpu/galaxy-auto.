/* NEXORA original 2D avatar motion controls */
(() => {
  const stage = document.getElementById("character-avatar-preview");
  if (!stage) return;
  const motions = {
    idle: {label:"Ожидание", icon:"✨", note:"Спокойная анимация персонажа."},
    wave: {label:"Привет", icon:"👋", note:"Персонаж приветствует других."},
    dance: {label:"Танец", icon:"💃", note:"Танцевальная анимация."},
    heart: {label:"Сердце", icon:"💖", note:"Романтическая эмоция."},
    clap: {label:"Аплодисменты", icon:"👏", note:"Персонаж аплодирует."}
  };
  function install() {
    if (!stage.querySelector(".avatar-svg") || stage.querySelector(".avatar-motion-controls")) return;
    const controls = document.createElement("div");
    controls.className = "avatar-motion-controls";
    controls.setAttribute("aria-label", "Анимации персонажа");
    Object.entries(motions).forEach(([key, item]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.motion = key;
      button.textContent = item.icon + " " + item.label;
      button.setAttribute("aria-pressed", key === "idle" ? "true" : "false");
      controls.append(button);
    });
    const note = document.createElement("div");
    note.className = "avatar-motion-note";
    note.textContent = motions.idle.note;
    const fx = document.createElement("span");
    fx.className = "nx-motion-fx";
    fx.setAttribute("aria-hidden", "true");
    stage.append(controls, note, fx);
    controls.addEventListener("click", event => {
      const button = event.target.closest("button[data-motion]");
      if (!button) return;
      const key = button.dataset.motion;
      stage.classList.remove("nx-motion-wave","nx-motion-dance","nx-motion-heart","nx-motion-clap");
      if (key !== "idle") {
        void stage.offsetWidth;
        stage.classList.add("nx-motion-" + key);
      }
      controls.querySelectorAll("button").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
      note.textContent = motions[key].note;
      fx.textContent = key === "heart" ? "💖" : key === "wave" ? "✨" : key === "dance" ? "⭐" : key === "clap" ? "👏" : "";
    });
  }
  const observer = new MutationObserver(install);
  observer.observe(stage, {childList:true, subtree:true});
  install();
})();
