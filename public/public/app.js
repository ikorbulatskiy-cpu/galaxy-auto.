const eventLog = [];

function addLog(message) {
const entry = {
time: new Date().toLocaleTimeString(“ru-RU”),
message
};

eventLog.unshift(entry);

if (eventLog.length > 100) {
eventLog.pop();
}

renderLog();
}

function renderLog() {
const container = document.getElementById(“eventLog”);
if (!container) return;

container.replaceChildren();

for (const entry of eventLog) {
const row = document.createElement(“p”);
row.textContent = [${entry.time}] ${entry.message};
container.appendChild(row);
}
}

async function checkConnection() {
try {
const response = await fetch(”/api/status”);
if (!response.ok) throw new Error(“Ошибка сервера”);

const data = await response.json();
document.getElementById("status").textContent =
  data.connected
    ? "Соединение установлено"
    : "Galaxy не подключён";
addLog("Статус сервера обновлён");

} catch {
document.getElementById(“status”).textContent =
“Сервер недоступен”;

addLog("Нет соединения с веб-сервером");

}
}

setInterval(checkConnection, 15000);
checkConnection();
