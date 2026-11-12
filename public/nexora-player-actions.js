/* NEXORA contextual player controls: move mode and emote menu. */
(() => {
  const root = document.getElementById("tab-world");
  if (!root) return;
  const scene = () => root.querySelector(".nx-scene");
  let activePopover = null;

  function closePopover() {
    activePopover?.remove();
    activePopover = null;
  }
  function showPopover(card) {
    closePopover();
    const stage = scene();
    if (!stage) return;
    const name = card.querySelector(".nx-avatar-name")?.textContent?.trim() || "Персонаж";
    const pop = document.createElement("div");
    pop.className = "nx-action-popover";
    pop.innerHTML = '<b class="nx-action-title"></b><button type="button" data-player-move>↗ Переместиться</button><button type="button" data-player-actions>✦ Действия</button>';
    pop.querySelector(".nx-action-title").textContent = name;
    const stageRect = stage.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(stage.clientWidth - 190, cardRect.left - stageRect.left + cardRect.width / 2 - 90)) + "px";
    pop.style.top = Math.max(8, cardRect.top - stageRect.top - 84) + "px";
    stage.append(pop);
    activePopover = pop;
    pop.querySelector("[data-player-move]").addEventListener("click", () => {
      closePopover();
      window.NexoraMovement?.beginPlacement();
    });
    pop.querySelector("[data-player-actions]").addEventListener("click", () => {
      pop.innerHTML = '<b class="nx-action-title"></b><div class="nx-action-options"><button data-emote="wave">👋 Привет</button><button data-emote="dance">♪ Танец</button><button data-emote="heart">♥ Сердце</button><button data-emote="happy">☺ Радость</button><button data-emote="idle">Стоять</button></div>';
      pop.querySelector(".nx-action-title").textContent = "Действия";
      pop.querySelectorAll("[data-emote]").forEach(button => button.addEventListener("click", () => {
        const action = button.dataset.emote;
        const isOwn = card.classList.contains("me");
        const canvas = card.querySelector("canvas[data-nexora-sprite]");
        const avatar = canvas && window.NexoraSpriteAvatar?.get(canvas);
        avatar?.setAnimation(action);
        // Only the authenticated player may broadcast their own emote.
        if (isOwn) window.NexoraMovement?.action(action);
        closePopover();
      }));
    });
  }

  if (!document.getElementById("nx-player-controls-style")) {
    const style = document.createElement("style");
    style.id = "nx-player-controls-style";
    style.textContent = [
      ".nx-action-popover{position:absolute;z-index:30;min-width:180px;padding:9px;background:#17202beF;border:1px solid #b7a77b;border-radius:12px;box-shadow:0 8px 28px #0008;display:grid;gap:6px;color:#fff;font:12px Arial,sans-serif}",
      ".nx-action-popover button{border:1px solid #64748b;border-radius:8px;background:#26374a;color:#fff;padding:8px;text-align:left;font:inherit}",
      ".nx-action-title{padding:2px 4px;color:#f4d99a}.nx-action-options{display:grid;grid-template-columns:1fr 1fr;gap:5px}",
      ".nx-placement-active{cursor:crosshair!important;touch-action:none}",
      ".nx-placement-marker{position:absolute;z-index:22;transform:translate(-50%,-100%);font:bold 32px/1 Arial;color:#ffe08a;text-shadow:0 2px 5px #000;pointer-events:none}",
      ".nx-placement-controls{position:absolute;z-index:25;left:50%;bottom:16px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #b9a77b;border-radius:14px;background:#101923ed;color:#fff;box-shadow:0 6px 24px #0007;font:12px Arial,sans-serif;white-space:nowrap}",
      ".nx-placement-controls button{width:38px;height:38px;border:1px solid #e1c77f;border-radius:10px;background:#26374a;color:#fff;font-size:25px;line-height:1}",
      ".nx-placement-controls button:disabled{opacity:.35}",
      "@media(max-width:600px){.nx-placement-controls{bottom:8px;max-width:calc(100% - 16px)}.nx-placement-controls span{max-width:145px;white-space:normal}}"
    ].join("");
    document.head.append(style);
  }

  root.addEventListener("click", event => {
    const card = event.target.closest("#nx-avatars .nx-avatar-card");
    if (card && !event.target.closest("button")) {
      event.stopPropagation();
      showPopover(card);
      return;
    }
    if (!event.target.closest(".nx-action-popover") && activePopover) closePopover();
  });
  root.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closePopover();
      window.NexoraMovement?.cancelPlacement();
    }
  });
  root.addEventListener("scroll", closePopover, true);
})();