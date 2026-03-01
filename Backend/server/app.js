import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorMiddleware.js";
import authRoutes from "./routes/authRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import systemRoutes from "./routes/systemRoutes.js";

const app = express();

app.use(cors({ origin: env.CLIENT_URL === "*" ? true : env.CLIENT_URL }));
app.use(express.json());

app.use(systemRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
