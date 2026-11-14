/* NEXORA retro social additions. Status selection is persisted through the existing /api/profile endpoint. */
(() => {
  "use strict";
  const game = document.getElementById("game-screen");
  const toolbar = document.getElementById("room-toolbar");
  if (!game || !toolbar) return;

  const statusGroups = [
    {title:"😊 Настроение",items:[["🤝","Брать"],["❤️","Люблю"],["🚫","Занят"],["😄","Весело"],["🤣","Очень весело"],["😜","Дразнюсь"],["😳","Смущение"],["😢","Грустно"],["😲","Удивление"],["😐","Апатия"],["🤔","Сомнение"],["😤","Гордый"],["😕","Недоумение"]]},
    {title:"💕 Чувства",items:[["😞","Очень грустно"],["🤫","Тихуюсь"],["🍺","Отдыхаю"],["😡","Злой"],["😍","Влюблён"],["💋","Целую"],["💼","Тружусь"],["💙","Дружеская любовь"],["🚗","Еду"],["🍽️","Кушаю"],["😴","Сплю"],["🎵","Слушаю музыку"],["🤒","Болею"]]},
    {title:"😴 Действия",items:[["📚","Ботаю"],["💻","За компом"],["📺","Смотрю телевизор"],["🔒","В привате"],["🛁","Купаюсь"],["😎","Крутой"],["☕","Пью чай/кофе"],["🏋️","Тренируюсь"],["🎮","Играю"]]},
    {title:"🎭 Состояния",items:[["🌐","На связи"],["⭐","Ищу друзей"],["💬","Готов общаться"],["🌙","Не беспокоить"],["✈️","В путешествии"]]}
  ];

  const statusButton = document.createElement("button");
  statusButton.type = "button";
  statusButton.id = "retro-status-open";
  statusButton.innerHTML = "😊<span>Статусы</span>";
  const themeButton = document.createElement("button");
  themeButton.type = "button";
  themeButton.id = "retro-theme-toggle";
  themeButton.innerHTML = "▦<span>Ретро</span>";
  toolbar.append(statusButton, themeButton);

  const panel = document.createElement("aside");
  panel.id = "retro-status-panel";
  panel.hidden = true;
  panel.setAttribute("role","dialog");
  panel.setAttribute("aria-modal","true");
  panel.setAttribute("aria-label","Выбор статуса");
  panel.innerHTML = '<div class="retro-status-head"><strong>😊 ВЫБЕРИТЕ СВОЙ СТАТУС</strong><button type="button" id="retro-status-close" aria-label="Закрыть">×</button></div><div class="retro-status-grid" id="retro-status-grid"></div><div class="retro-status-foot">Выбранный статус будет сохранён в профиле NEXORA. После выбора нажми «Установить статус».</div><div style="padding:0 7px 7px"><button type="button" class="retro-status-save" id="retro-status-save">УСТАНОВИТЬ СТАТУС</button></div>';
  game.append(panel);

  const grid = panel.querySelector("#retro-status-grid");
  let selectedStatus = "";
  const savedStatus = () => document.getElementById("profile-status")?.value || "";
  statusGroups.forEach(group => {
    const column = document.createElement("section");
    column.className = "retro-status-column";
    const heading = document.createElement("h4");
    heading.textContent = group.title;
    column.append(heading);
    group.items.forEach(([icon,label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "retro-status-option";
      button.dataset.status = label;
      const iconNode = document.createElement("span");
      iconNode.className = "retro-status-icon";
      iconNode.textContent = icon;
      const labelNode = document.createElement("span");
      labelNode.textContent = label;
      button.append(iconNode,labelNode);
      button.addEventListener("click",() => {
        selectedStatus = label;
        grid.querySelectorAll(".retro-status-option").forEach(item => item.classList.toggle("selected",item === button));
      });
      column.append(button);
    });
    grid.append(column);
  });

  function closeStatusPanel(){panel.hidden=true;}
  statusButton.addEventListener("click",() => {
    selectedStatus = savedStatus();
    grid.querySelectorAll(".retro-status-option").forEach(item => item.classList.toggle("selected",item.dataset.status === selectedStatus));
    panel.hidden = false;
  });
  panel.querySelector("#retro-status-close").addEventListener("click",closeStatusPanel);
  panel.addEventListener("click",event => {if(event.target === panel)closeStatusPanel();});
  panel.querySelector("#retro-status-save").addEventListener("click",async() => {
    if(!selectedStatus){window.alert("Сначала выбери статус.");return;}
    const saveButton = panel.querySelector("#retro-status-save");
    saveButton.disabled = true;
    try {
      // Reuse the existing profile editor so bio and avatar values are loaded before saving.
      document.getElementById("my-profile")?.click();
      const deadline = Date.now() + 5000;
      let input = document.getElementById("profile-status");
      let save = document.getElementById("profile-save");
      while ((!input || !save || document.getElementById("profile-editor")?.classList.contains("hidden") || save.disabled) && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve,100));
        input = document.getElementById("profile-status");
        save = document.getElementById("profile-save");
      }
      if(!input || !save || document.getElementById("profile-editor")?.classList.contains("hidden")) {
        throw new Error("Не удалось открыть профиль для сохранения статуса.");
      }
      input.value = selectedStatus;
      save.click();
      while (!document.getElementById("profile-editor")?.classList.contains("hidden") && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve,100));
      }
      if(document.getElementById("profile-editor")?.classList.contains("hidden")) closeStatusPanel();
      else throw new Error(document.getElementById("profile-editor-error")?.textContent || "Сохранение статуса не подтвердилось.");
    } catch(error) {
      window.alert(error.message || "Не удалось сохранить статус.");
    } finally { saveButton.disabled = false; }
  });

  const themeKey = "nexora-retro-theme";
  function setRetro(enabled) {
    game.classList.toggle("retro-mode",enabled);
    themeButton.classList.toggle("active",enabled);
    themeButton.setAttribute("aria-pressed",String(enabled));
    themeButton.innerHTML = enabled ? "✦<span>Обычный</span>" : "▦<span>Ретро</span>";
    try { localStorage.setItem(themeKey,enabled ? "on" : "off"); } catch {}
  }
  let enabled = false;
  try { enabled = localStorage.getItem(themeKey) === "on"; } catch {}
  setRetro(enabled);
  themeButton.addEventListener("click",() => setRetro(!game.classList.contains("retro-mode")));
})();
