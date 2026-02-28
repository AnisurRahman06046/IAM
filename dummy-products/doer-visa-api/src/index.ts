import express from "express";
import cors from "cors";
import { parseUser } from "./middleware/parse-user.js";
import { applicationRoutes } from "./routes/applications.js";

const app = express();
const PORT = process.env.PORT || 4001;

app.use(cors());
app.use(express.json());
app.use(parseUser);

app.get("/api/visa/health", (_req, res) => {
  res.json({ status: "ok", service: "doer-visa-api" });
});

app.use("/api/visa", applicationRoutes);

app.listen(PORT, () => {
  console.log(`doer-visa-api running on port ${PORT}`);
});
