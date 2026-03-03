import fs from "fs";
import path from "path";
import localtunnel from "localtunnel";

const port = Number(process.env.PORT || 3001);
const subdomain = String(process.env.TUNNEL_SUBDOMAIN || "").trim() || undefined;
const outputPath = path.resolve(process.cwd(), "tunnel-url.txt");

async function main() {
  const tunnel = await localtunnel({ port, subdomain });
  const url = String(tunnel.url || "").trim();
  if (!url) {
    throw new Error("Tunnel URL was not returned.");
  }

  fs.writeFileSync(outputPath, `${url}\n`, "utf8");
  console.log(`Tunnel URL: ${url}`);

  const keepAlive = setInterval(() => {
    // Keep process alive and provide basic heartbeat for logs.
    process.stdout.write("");
  }, 30000);

  tunnel.on("close", () => {
    clearInterval(keepAlive);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
