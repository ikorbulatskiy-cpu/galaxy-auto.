const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

let state = {
  connected: false,
  character: null,
  planet: null,
  messages: []
};

app.get("/api/status", (req, res) => {
  res.json(state);
});

app.post("/api/planet", (req, res) => {
  const { planet } = req.body;

  if (!planet) {
    return res.status(400).json({
      error: "Укажите планету"
    });
  }

  state.planet = planet;

  res.json({
    success: true,
    planet
  });
});

app.get("/api/messages", (req, res) => {
  res.json(state.messages);
});

app.listen(3000, () => {
  console.log("CHERT AI запущен на порту 3000");
});
