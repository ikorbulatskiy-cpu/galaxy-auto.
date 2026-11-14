/* NEXORA Stage 2: authenticated 2D room movement. */
(() => {
  const api = window.NexoraAPI ? window.NexoraAPI.request : async url => {
    const response = await fetch(url, { credentials: "same-origin" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Не удалось загрузить позиции.");
    return data;
  };
  let socket = null;
  let roomId = "";
  let ownName = "";
  let moveTimer = null;
  let target = null;
  let current = { x: 50, y: 78 };
  let connecting = false;
  let reconnectTimer = null;
  let joinAckTimer = null;
  let reconnectAttempts = 0;
  let positionsLoading = false;
  let positionsLoadingRoom = "";
  let positionsRequestId = 0;
  let lastPositionRefresh = 0;
  const scene = () => document.querySelector("#tab-world .nx-scene");
  const avatars = () => document.getElementById("nx-avatars");
  const cards = () => [...document.querySelectorAll("#nx-avatars .nx-avatar-card")];

  function installStyles() {
    if (document.getElementById("nx-movement-style")) return;
    const style = document.createElement("style");
    style.id = "nx-movement-style";
    style.textContent = [
      ".nx-classic .nx-avatars{inset:0!important;left:0!important;right:0!important;top:0!important;bottom:0!important;display:block!important;pointer-events:none}",
      ".nx-classic .nx-avatars .nx-avatar-card{position:absolute!important;left:50%;top:78%;transform:translate(-50%,-100%);pointer-events:auto;transition:left .12s linear,top .12s linear}",
      ".nx-classic .nx-scene{cursor:crosshair}",
      ".nx-classic .nx-avatar-card.nx-moving .nx-sprite-canvas{animation:nx-side-hop .38s ease-in-out infinite alternate;transform-origin:50% 100%}",
      "@keyframes nx-side-hop{from{translate:0 0}to{translate:0 -9px}}",
      "@media(max-width:700px){.nx-classic .nx-avatars{overflow:visible!important}.nx-classic .nx-avatars .nx-avatar-card{min-width:48px!important}}"
    ].join("");
    document.head.append(style);
  }


  function applyAvatarAction(username, action, direction = "front") {
    const card = cards().find(node => node.dataset.playerUsername === username);
    const canvas = card?.querySelector("canvas[data-nexora-sprite]");
    const avatar = canvas && window.NexoraSpriteAvatar?.get(canvas);
    if (avatar) { avatar.setAnimation(action); avatar.setDirection(direction); }
    if (card) card.classList.toggle("nx-moving", action === "walk");
  }

  function sendAction(action, direction = "front") {
    if (window.NexoraAPI?.mockEnabled() && roomId) { applyAvatarAction(ownName,action,direction); return; }
    if (!socket || socket.readyState !== WebSocket.OPEN || !roomId) return;
    socket.send(JSON.stringify({ type: "action", action, direction }));
  }

  function applyPosition(username, x, y) {
    const card = cards().find(node => node.dataset.playerUsername === username);
    if (!card) return;
    card.style.left = Math.max(2, Math.min(98, Number(x))) + "%";
    card.style.top = "78%";
    card.style.bottom = "auto";
    if (card.classList.contains("me")) current = { x: Number(x), y: 78 };
  }

  async function loadPositions(id, force = false) {
    if ((positionsLoading && positionsLoadingRoom === id) || (!force && Date.now() - lastPositionRefresh < 12000)) return;
    positionsLoading = true;
    positionsLoadingRoom = id;
    const requestId = ++positionsRequestId;
    lastPositionRefresh = Date.now();
    try {
      const data = await api("/api/movement/rooms/" + encodeURIComponent(id) + "/positions");
      if (roomId === id && requestId === positionsRequestId) {
        (data.positions || []).forEach(item => applyPosition(item.username, item.x, item.y));
      }
    } catch (error) {
      const status = document.getElementById("nx-status");
      if (roomId === id && status) status.textContent = error.message;
    } finally {
      if (requestId === positionsRequestId) {
        positionsLoading = false;
        positionsLoadingRoom = "";
      }
    }
  }

  function closeSocket() {
    if (moveTimer) clearInterval(moveTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (joinAckTimer) clearTimeout(joinAckTimer);
    joinAckTimer = null;
    reconnectTimer = null;
    moveTimer = null;
    target = null;
    if (socket) {
      socket.onclose = null;
      socket.close();
      socket = null;
    }
    roomId = "";
    connecting = false;
    ownName = "";
    positionsRequestId++;
    positionsLoading = false;
    positionsLoadingRoom = "";
    lastPositionRefresh = 0;
  }

  function connectRoom(id) {
    if (!id || id === roomId || connecting) return;
    if (window.NexoraAPI?.mockEnabled()) { closeSocket(); roomId=id; connecting=false; ownName=placementCard()?.dataset.playerUsername||"you"; current={x:50,y:78}; loadPositions(id,true); return; }
    closeSocket();
    connecting = true;
    roomId = id;
    const ws = new WebSocket(window.NexoraAPI ? window.NexoraAPI.websocketUrl("/ws-movement") : (location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host + "/ws-movement");
    socket = ws;
    ws.onopen = () => {
      if (socket !== ws) return;
      joinAckTimer = setTimeout(() => {
        if (socket === ws && ws.readyState === WebSocket.OPEN) {
          addMovementEvent("Сервер не подтвердил подключение движения за 10 секунд.");
          ws.close(4001, "Movement join acknowledgement timeout");
        }
      }, 10000);
    };
    ws.onmessage = event => {
      let packet;
      try { packet = JSON.parse(event.data); } catch { return; }
      if (packet.type === "ready") {
        if (socket === ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "join_room", roomId: id }));
        return;
      }
      if (packet.type === "joined_room") {
        if (joinAckTimer) clearTimeout(joinAckTimer);
        joinAckTimer = null;
        reconnectAttempts = 0;
        connecting = false;
        current = { x: Number(packet.x), y: Number(packet.y) };
        const ownCard = cards().find(card => card.classList.contains("me"));
        if (ownCard) ownName = ownCard.dataset.playerUsername;
        if (ownName) applyPosition(ownName, current.x, 78);
      const movingCard=placementCard();if(movingCard)movingCard.classList.add("nx-moving");
        loadPositions(id, true);
      }
      if (packet.type === "position_list") {
        (packet.positions || []).forEach(item => applyPosition(item.username || item.user_id, item.x, item.y));
      }
      if (packet.type === "player_action" && packet.roomId === roomId) {
        applyAvatarAction(packet.username, packet.action, packet.direction);
      }
      if ((packet.type === "player_moved" || packet.type === "player_joined") && packet.roomId === roomId) {
        applyPosition(packet.username, packet.x, packet.y);
        if (packet.type === "player_joined" && packet.username !== ownName) {
          addMovementEvent((packet.username || "Игрок") + " появился в комнате.");
        }
      }
      if (packet.type === "error") {
        const status = document.getElementById("nx-status");
        if (status) status.textContent = packet.message;
        if (socket === ws && ws.readyState === WebSocket.OPEN) ws.close(1011, "Room join failed");
      }
    };
    ws.onclose = event => {
      if (joinAckTimer) clearTimeout(joinAckTimer);
      joinAckTimer = null;
      if (socket === ws) socket = null;
      addMovementEvent("Канал движения закрыт: код " + event.code + (event.reason ? " · " + event.reason : ""));
      if (roomId === id) {
        connecting = false;
        const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(reconnectAttempts++, 5)));
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (roomId === id) {
            roomId = "";
            connectRoom(id);
          }
        }, delay);
      }
    };
  }

  function addMovementEvent(message) {
    const status = document.getElementById("nx-status");
    if (status) status.textContent = message;
  }

  function moveTo(x, y) {
    if (window.NexoraAPI?.mockEnabled() && roomId) { const destination=Math.max(2,Math.min(98,x));const direction=destination<current.x?"left":"right";current={x:destination,y:78};if(ownName)applyPosition(ownName,current.x,78);applyAvatarAction(ownName,"walk",direction);setTimeout(()=>applyAvatarAction(ownName,"idle",direction),420);return; }
    if (!socket || socket.readyState !== WebSocket.OPEN || !roomId) return;
    target = { x: Math.max(2, Math.min(98, x)), y: 78 };
    const direction = target.x < current.x ? "left" : "right";
    sendAction("walk", direction);
    if (moveTimer) return;
    moveTimer = setInterval(() => {
      if (!target || !socket || socket.readyState !== WebSocket.OPEN) {
        clearInterval(moveTimer);
        moveTimer = null;
        return;
      }
      const dx = target.x - current.x;
      const distance = Math.abs(dx);
      if (distance < 1.2) {
        current = target;
        target = null;
        sendAction("idle");
        const ownCard=placementCard();if(ownCard)ownCard.classList.remove("nx-moving");
        clearInterval(moveTimer);
        moveTimer = null;
        return;
      }
      const step = Math.min(2.5, distance);
      current = { x: current.x + Math.sign(dx) * step, y: 78 };
      socket.send(JSON.stringify({ type: "move", x: Number(current.x.toFixed(2)), y: Number(current.y.toFixed(2)) }));
      if (ownName) applyPosition(ownName, current.x, current.y);
      const ownCard=placementCard();if(ownCard)ownCard.classList.add("nx-moving");
    }, 110);
  }

  let placementMode = false;
  let placementTarget = null;
  let placementOriginal = null;
  let placementMarker = null;
  let placementControls = null;

  function placementCard() {
    return cards().find(card => card.classList.contains("me"));
  }
  function previewPlacement(x, y) {
    if (!placementMode) return;
    placementTarget = { x: Math.max(2, Math.min(98, x)), y: 78 };
    const card = placementCard();
    if (card) {
      card.style.left = placementTarget.x + "%";
      card.style.top = "78%";
      card.style.bottom = "auto";
    }
    if (placementMarker) {
      placementMarker.style.left = placementTarget.x + "%";
      placementMarker.style.top = "78%";
    }
    if (placementControls) {
      const confirm = placementControls.querySelector("[data-placement-confirm]");
      if (confirm) confirm.disabled = false;
    }
  }
  function endPlacement(restore = true) {
    placementMode = false;
    const card = placementCard();
    if (restore && card && placementOriginal) {
      card.style.left = placementOriginal.x + "%";
      card.style.top = placementOriginal.y + "%";
      card.style.bottom = "auto";
    }
    placementMarker?.remove();
    placementControls?.remove();
    placementMarker = null;
    placementControls = null;
    placementTarget = null;
    placementOriginal = null;
    scene()?.classList.remove("nx-placement-active");
  }
  function beginPlacement() {
    if (!roomId || (!socket || socket.readyState !== WebSocket.OPEN) && !window.NexoraAPI?.mockEnabled()) {
      addMovementEvent("Сначала дождись подключения к комнате.");
      return false;
    }
    endPlacement(true);
    placementMode = true;
    placementOriginal = { x: current.x, y: 78 };
    const stage = scene();
    if (!stage) return false;
    stage.classList.add("nx-placement-active");
    placementMarker = document.createElement("div");
    placementMarker.className = "nx-placement-marker";
    placementMarker.textContent = "|";
    placementMarker.setAttribute("aria-hidden", "true");
    stage.append(placementMarker);
    placementControls = document.createElement("div");
    placementControls.className = "nx-placement-controls";
    placementControls.innerHTML = '<span>Выбери место в комнате</span><button type="button" data-placement-cancel aria-label="Отменить">−</button><button type="button" data-placement-confirm aria-label="Подтвердить" disabled>+</button>';
    stage.append(placementControls);
    placementControls.querySelector("[data-placement-cancel]").addEventListener("click", () => endPlacement(true));
    placementControls.querySelector("[data-placement-confirm]").addEventListener("click", () => {
      if (!placementTarget) return;
      const destination = { ...placementTarget };
      endPlacement(true);
      moveTo(destination.x, destination.y);
    });
    addMovementEvent("Режим перемещения: выбери место и нажми +.");
    return true;
  }

  function installScene() {
    const world = document.getElementById("tab-world");
    const selector = document.getElementById("nx-room-select");
    const stage = scene();
    if (!world || !stage) return;
    installStyles();
    if (roomId) loadPositions(roomId);
    stage.querySelector(".nx-movement-hint")?.remove();
    if (!stage.dataset.movementBound) {
      stage.dataset.movementBound = "true";
      stage.addEventListener("pointerdown", event => {
        if (event.target.closest("button, a, .nx-player-list, .nx-avatar-card, .nx-action-popover, .nx-placement-controls")) return;
        const bounds = stage.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width * 100;
        const y = (event.clientY - bounds.top) / bounds.height * 100;
        if (placementMode) { previewPlacement(x, y); return; }
        moveTo(x, y);
      });
      stage.addEventListener("pointermove", event => {
        if (!placementMode || !(event.buttons & 1 || event.pointerType === "touch")) return;
        const bounds = stage.getBoundingClientRect();
        previewPlacement((event.clientX - bounds.left) / bounds.width * 100, (event.clientY - bounds.top) / bounds.height * 100);
      });
    }
  }

  window.NexoraMovement = { join: connectRoom, leave: closeSocket, action: sendAction, beginPlacement, cancelPlacement: () => endPlacement(true), previewPlacement, step: delta => { if (roomId) moveTo(current.x + Number(delta || 0), 78); }, getPosition: () => ({ ...current }) };
  window.addEventListener("nexora:room-joined", event => connectRoom(event.detail?.roomId));
  window.addEventListener("nexora:room-left", closeSocket);

  const observer = new MutationObserver(() => {
    installScene();
    const active = document.querySelector("#nx-avatars .nx-avatar-card.me");
    if (active && active.dataset.playerUsername) ownName = active.dataset.playerUsername;
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  installScene();
  if (window.nexoraActiveRoom) connectRoom(window.nexoraActiveRoom);
})();
