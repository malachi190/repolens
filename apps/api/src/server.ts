import "dotenv/config";

import { createApp } from "./app.js";
import { PostgresAnalysisJobStore } from "./postgres-analysis-job-store.js";

const port = Number(process.env.PORT ?? 3001);
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required. Run the database migration before starting the API.");
const store = new PostgresAnalysisJobStore(connectionString);
try {
  await store.assertReady();
} catch (error) {
  await store.close();
  throw error;
}
const app = createApp(store);

app.listen(port, "127.0.0.1", () => {
  console.log(`RepoLens API listening on http://localhost:${port}`);
});
