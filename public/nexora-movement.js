/* NEXORA Stage 2: authenticated 2D room movement. */
(() => {
  const api = async url => {
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
      ".nx-movement-hint{position:absolute;z-index:5;left:10px;bottom:10px;padding:5px 8px;background:#10151bdc;border:1px solid #818890;color:#f0dfad;font:10px Tahoma,Arial,sans-serif;pointer-events:none}",
      "@media(max-width:700px){.nx-classic .nx-avatars{overflow:visible!important}.nx-classic .nx-avatars .nx-avatar-card{min-width:48px!important}}"
    ].join("");
    document.head.append(style);
  }

  function applyPosition(username, x, y) {
    const card = cards().find(node => node.dataset.playerUsername === username);
    if (!card) return;
    card.style.left = Math.max(2, Math.min(98, Number(x))) + "%";
    card.style.top = Math.max(8, Math.min(92, Number(y))) + "%";
    card.style.bottom = "auto";
    if (card.classList.contains("me")) current = { x: Number(x), y: Number(y) };
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
    closeSocket();
    connecting = true;
    roomId = id;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(protocol + "//" + location.host + "/ws-movement");
    socket.onopen = () => {
      reconnectAttempts = 0;
      socket.send(JSON.stringify({ type: "join_room", roomId: id }));
    };
    socket.onmessage = event => {
      let packet;
      try { packet = JSON.parse(event.data); } catch { return; }
      if (packet.type === "ready") return;
      if (packet.type === "joined_room") {
        connecting = false;
        current = { x: Number(packet.x), y: Number(packet.y) };
        const ownCard = cards().find(card => card.classList.contains("me"));
        if (ownCard) ownName = ownCard.dataset.playerUsername;
        if (ownName) applyPosition(ownName, current.x, current.y);
        loadPositions(id, true);
      }
      if (packet.type === "position_list") {
        (packet.positions || []).forEach(item => applyPosition(item.username || item.user_id, item.x, item.y));
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
        if (socket && socket.readyState === WebSocket.OPEN) socket.close(1011, "Room join failed");
      }
    };
    socket.onclose = () => {
      if (roomId === id) {
        connecting = false;
        socket = null;
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
    if (!socket || socket.readyState !== WebSocket.OPEN || !roomId) return;
    target = { x: Math.max(2, Math.min(98, x)), y: Math.max(8, Math.min(92, y)) };
    if (moveTimer) return;
    moveTimer = setInterval(() => {
      if (!target || !socket || socket.readyState !== WebSocket.OPEN) {
        clearInterval(moveTimer);
        moveTimer = null;
        return;
      }
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 1.2) {
        current = target;
        target = null;
        clearInterval(moveTimer);
        moveTimer = null;
        return;
      }
      const step = Math.min(2.5, distance);
      current = { x: current.x + dx / distance * step, y: current.y + dy / distance * step };
      socket.send(JSON.stringify({ type: "move", x: Number(current.x.toFixed(2)), y: Number(current.y.toFixed(2)) }));
      if (ownName) applyPosition(ownName, current.x, current.y);
    }, 110);
  }

  function installScene() {
    const world = document.getElementById("tab-world");
    const selector = document.getElementById("nx-room-select");
    const stage = scene();
    if (!world || !stage) return;
    installStyles();
    if (roomId) loadPositions(roomId);
    let hint = stage.querySelector(".nx-movement-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "nx-movement-hint";
      hint.textContent = "Нажми на площадку, чтобы пройти туда";
      stage.append(hint);
    }
    if (!stage.dataset.movementBound) {
      stage.dataset.movementBound = "true";
      stage.addEventListener("pointerdown", event => {
        if (event.target.closest("button, a, .nx-player-list")) return;
        const bounds = stage.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width * 100;
        const y = (event.clientY - bounds.top) / bounds.height * 100;
        moveTo(x, y);
      });
    }
  }

  window.NexoraMovement = { join: connectRoom, leave: closeSocket };
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
