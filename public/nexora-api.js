/* NEXORA API adapter: centralized REST, socket URL and opt-in fixtures. */
(() => {
  "use strict";
  const mocks = {
    planets: [{id:"mock-planet-1",slug:"newbies-1",name:"Зал новичков",settings:{theme:"sunset",modules:["magic","games","defender","love"]},is_current:true,is_owner:false,rooms:1,online:2}],
    characters: [{id:"11111111-1111-4111-8111-111111111111",name:"Пилот",gender:"male",appearance:{spriteGender:"male",body:"regular",skinTone:"medium",hair:"short",hairColor:"brown",outfit:"blue",shoes:"sneakers"},aura:"none",is_active:true,level:1,experience:0}],
    rooms: [{id:"22222222-2222-4222-8222-222222222222",slug:"central-hall",name:"Зал новичков",capacity:100,online:2}],
    presence: [{user_id:"mock-profile",username:"pilot",character_name:"Пилот",character_appearance:{spriteGender:"male",body:"regular",skinTone:"medium"},character_aura:"none",is_me:false},{user_id:"mock-user",username:"you",character_name:"Ты",character_appearance:{spriteGender:"male",body:"regular",skinTone:"medium"},character_aura:"none",is_me:true}],
    positions: [{username:"you",x:50,y:78},{username:"pilot",x:68,y:78}],
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
      if (url.includes("/api/world/me")) return {profile:{display_name:"Пилот NEXORA",city:"Демо-город",bio:"Тестовый профиль",interests:["игры","общение"],coins:25,diamonds:2,level:1,authority:0,planet_name:"Зал новичков"}};
      if (url.includes("/api/game/planets")) return {planets:mocks.planets};
      if (url.includes("/api/game/characters")) return {characters:mocks.characters,limit:3};
      if (url.includes("/api/game/rooms?")) return {rooms:mocks.rooms};
      if (/\/api\/game\/rooms\/[^/]+\/messages/.test(url)) return {messages:mocks.messages};
      if (/\/api\/game\/rooms\/[^/]+\/presence/.test(url)) return {users:mocks.presence};
      if (/\/api\/movement\/rooms\/[^/]+\/positions/.test(url)) return {positions:mocks.positions};
      if (url.includes("/api/social/users/")) return {profile:{user_id:"mock-profile",username:"pilot",display_name:"Пилот NEXORA",city:"Демо-город",bio:"Демонстрационный профиль игрока",interests:["игры","общение"],level:4,authority:120,character_name:"Пилот"}};
      if (url.includes("/api/social/conversations")) return {conversations:[]};
      if (url.includes("/api/social/discover")) return {users:mocks.profiles};
      throw error;
    }
  }
  const websocketUrl = path => (location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host + path;
  window.NexoraAPI = Object.freeze({request,websocketUrl,mocks,mockEnabled});
})();
