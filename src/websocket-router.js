const routesByServer = new WeakMap();

function registerWebSocketRoute(server, pathname, webSocketServer) {
  let routes = routesByServer.get(server);
  if (!routes) {
    routes = new Map();
    routesByServer.set(server, routes);

    server.on("upgrade", (request, socket, head) => {
      let requestPath;
      try {
        requestPath = new URL(request.url, "http://localhost").pathname;
      } catch {
        socket.destroy();
        return;
      }

      const route = routes.get(requestPath);
      if (!route) {
        socket.destroy();
        return;
      }

      route.handleUpgrade(request, socket, head, webSocket => {
        route.emit("connection", webSocket, request);
      });
    });

    server.on("close", () => {
      for (const route of routes.values()) route.close();
      routes.clear();
      routesByServer.delete(server);
    });
  }

  if (routes.has(pathname)) {
    throw new Error("A WebSocket route is already registered for " + pathname);
  }
  routes.set(pathname, webSocketServer);
}

module.exports = { registerWebSocketRoute };
