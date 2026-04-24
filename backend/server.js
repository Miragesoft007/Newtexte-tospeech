require("dotenv").config();
const express = require("express");
const cors = require("cors");

const ttsRoutes = require("./routes/tts");
const authRoutes = require("./routes/auth");
const paymentRoutes = require("./routes/payment");

const app = express();
const PORT = process.env.PORT || 5000;

// Stripe webhook needs raw body — must be before express.json()
app.use("/api/payment/webhook", express.raw({ type: "application/json" }));

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/tts", ttsRoutes);
app.use("/api/payment", paymentRoutes);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
