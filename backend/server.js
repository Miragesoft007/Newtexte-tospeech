require("dotenv").config();
const express = require("express");
const cors = require("cors");
const ttsRoutes = require("./routes/tts");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/tts", ttsRoutes);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
