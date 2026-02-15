import { ModuleRegistry } from "../src/boot/moduleRegistry";
import { DEFAULTS } from "../src/config/defaults";
import { DummyMarketFeed } from "../src/modules/dummyMarketFeed";

async function main(): Promise<void> {
  const registry = new ModuleRegistry();
  const feed = new DummyMarketFeed(registry, {
    instruments: DEFAULTS.instruments,
    minTicksPerSecond: 500,
    maxTicksPerSecond: 1000,
    frameMs: 25
  });

  let count = 0;
  const start = Date.now();
  const durationMs = 5000;

  const unsub = registry.on("market.tick", () => {
    count += 1;
  });

  await feed.start();
  await new Promise<void>((resolve) => setTimeout(resolve, durationMs));
  await feed.stop();
  unsub();

  const elapsed = Date.now() - start;
  const tps = (count / elapsed) * 1000;
  console.log(`bench: ticks=${count} elapsedMs=${elapsed} approxTicksPerSec=${tps.toFixed(2)}`);
}

void main();
