export class GalaxySocket {
  constructor(onEvent) { this.onEvent = onEvent; this.chat = null; this.movement = null; }
  connect() {
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    this.chat = new WebSocket(scheme + "//" + location.host + "/ws");
    this.movement = new WebSocket(scheme + "//" + location.host + "/ws-movement");
    for (const [kind, socket] of [["chat", this.chat], ["movement", this.movement]]) {
      socket.addEventListener("open", () => this.onEvent({ type: "socket_open", kind }));
      socket.addEventListener("close", () => this.onEvent({ type: "socket_close", kind }));
      socket.addEventListener("error", () => this.onEvent({ type: "socket_error", kind }));
      socket.addEventListener("message", event => {
        try { this.onEvent({ ...JSON.parse(event.data), channel: kind }); } catch {}
      });
    }
  }
  sendChat(packet) { if (this.chat?.readyState === WebSocket.OPEN) this.chat.send(JSON.stringify(packet)); }
  sendMovement(packet) { if (this.movement?.readyState === WebSocket.OPEN) this.movement.send(JSON.stringify(packet)); }
  join(roomId) {
    this.sendChat({ type: "join_room", roomId });
    this.sendMovement({ type: "join_room", roomId });
  }
  close() { this.chat?.close(); this.movement?.close(); this.chat = null; this.movement = null; }
}
