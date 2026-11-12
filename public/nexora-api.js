/* NEXORA API adapter: centralized REST, socket URL and opt-in fixtures. */
(() => {
  "use strict";
  const mocks = {
    planets: [{id:"mock-planet-1",slug:"newbies-1",name:"Зал новичков",settings:{theme:"sunset",modules:["magic","games","defender"]},is_current:true,rooms:1,online:3}],
    messages: [{id:"mock-message-1",body:"Добро пожаловать в NEXORA!",character_name:"Магия",created_at:new Date().toISOString(),system:true}],
    profiles: [{id:"mock-user-1",username:"pilot",display_name:"Пилот NEXORA",city:"Город",bio:"Демонстрационный профиль"}]
  };
  const mockEnabled = () => new URLSearchParams(location.search).get("nx-mock") === "1" || localStorage.getItem("nexora-mock-mode") === "on";
  async function request(url, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    try {
      const response = await fetch(url,{credentials:"same-origin",...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { const error = new Error(data.error || "Ошибка " + response.status); error.status = response.status; throw error; }
      return data;
    } catch (error) {
      if (method !== "GET" || !mockEnabled()) throw error;
      if (url.includes("/api/game/planets")) return {planets:mocks.planets};
      if (/\/api\/game\/rooms\/[^/]+\/messages/.test(url)) return {messages:mocks.messages};
      if (url.includes("/api/social/discover")) return {users:mocks.profiles};
      throw error;
    }
  }
  const websocketUrl = path => (location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host + path;
  window.NexoraAPI = Object.freeze({request,websocketUrl,mocks,mockEnabled});
})();
