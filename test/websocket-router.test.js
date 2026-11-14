const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { WebSocket, WebSocketServer } = require("ws");
const { registerWebSocketRoute } = require("../src/websocket-router");

test("dispatches chat and movement upgrades to their own WebSocket servers", async () => {
  const server = http.createServer();
  const chat = new WebSocketServer({ noServer: true });
  const movement = new WebSocketServer({ noServer: true });
  registerWebSocketRoute(server, "/ws", chat);
  registerWebSocketRoute(server, "/ws-movement", movement);
  chat.on("connection", socket => socket.send("chat"));
  movement.on("connection", socket => socket.send("movement"));

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const connect = pathname => new Promise((resolve, reject) => {
    const socket = new WebSocket("ws://127.0.0.1:" + address.port + pathname);
    socket.once("message", data => resolve({ socket, message: data.toString() }));
    socket.once("error", reject);
  });

  let chatClient;
  let movementClient;
  try {
    const chatResult = await connect("/ws");
    chatClient = chatResult.socket;
    assert.equal(chatResult.message, "chat");

    const movementResult = await connect("/ws-movement");
    movementClient = movementResult.socket;
    assert.equal(movementResult.message, "movement");
  } finally {
    for (const client of [chatClient, movementClient]) {
      if (client && client.readyState !== WebSocket.CLOSED) client.close();
    }
    await new Promise(resolve => server.close(resolve));
  }
});
