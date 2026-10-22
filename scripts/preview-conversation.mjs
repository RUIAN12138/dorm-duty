import fs from "node:fs/promises";
import os from "node:os";
import { createConversationPreview } from "./lib/conversation-preview.mjs";
const preview = await createConversationPreview({
  port: Number(process.env.DORM_PREVIEW_PORT || 8092),
  host: "0.0.0.0",
});
const lan = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i?.family === "IPv4" && !i.internal)
  .map((i) => `http://${i.address}:${preview.port}`);
await fs.mkdir(new URL("../data/conversation-preview/", import.meta.url), {
  recursive: true,
});
await fs.writeFile(
  new URL("../data/conversation-preview/server.json", import.meta.url),
  JSON.stringify(
    {
      pid: process.pid,
      url: preview.url,
      lan,
      isolated: true,
      ai: "simulated",
      email: false,
      push: false,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    status: "ready",
    url: preview.url,
    lan,
    isolated: true,
    ai: "simulated",
    email: false,
    push: false,
  }),
);
for (const event of ["SIGINT", "SIGTERM"])
  process.once(event, async () => {
    await preview.close();
    process.exit(0);
  });
