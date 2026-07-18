import { config } from "./config";
import { getStorage } from "./storage";
import { createServer } from "./api/server";
import { Scheduler } from "./reminders/scheduler";

async function main() {
  const storage = await getStorage();

  const app = createServer(storage);
  app.listen(config.port, () => {
    console.log(`[server] listening on :${config.port}`);
  });

  const scheduler = new Scheduler(storage);
  scheduler.start();
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
