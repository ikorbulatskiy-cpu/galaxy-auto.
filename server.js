const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (_req, res) => {
  res.json({
    online: true,
    app: "NEXORA",
    version: "0.1.0",
    stage: "prototype",
    message: "NEXORA server is running"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`NEXORA запущен на порту ${PORT}`);
});
