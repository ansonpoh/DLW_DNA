import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import detectionRoutes from "./routes/detectionRoutes.js";
import systemRoutes from "./routes/systemRoutes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorMiddleware.js";

const app = express();

app.use(cors({ origin: env.CLIENT_URL === "*" ? true : env.CLIENT_URL }));
app.use(express.json());

app.use(systemRoutes);
app.use("/api/detection", detectionRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
