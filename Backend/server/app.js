import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorMiddleware.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import systemRoutes from "./routes/systemRoutes.js";
import telegramRoutes from "./routes/telegramRoutes.js";

const app = express();

app.use(cors({ origin: env.CLIENT_URL === "*" ? true : env.CLIENT_URL }));
app.use(express.json());

app.use(systemRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/telegram", telegramRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
