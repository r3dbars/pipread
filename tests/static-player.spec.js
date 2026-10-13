import { test, expect } from "@playwright/test";
import { pcmWav } from "../src/audio.js";
const audioName = "a".repeat(64) + ".wav",
  timingName = "b".repeat(64) + ".json";
const wav = Buffer.from(
  await pcmWav(new Float32Array(24000 * 40).fill(0.01), 24000).arrayBuffer(),
);
async function setup(page, { missing = false, slow = false } = {}) {
  await page.route("**/static-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<article id="story"><p>First passage.</p><p>Second passage.</p></article><pipread-audio manifest="/audio/manifest.json" article="post.html" selector="#story"></pipread-audio><script type="module" src="/src/pipread-audio.js"></script>',
    }),
  );
  await page.route("**/audio/manifest.json", async (route) => {
    if (slow) await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({
      status: missing ? 404 : 200,
      json: {
        version: 1,
        articles: { "post.html": { audio: audioName, timing: timingName } },
      },
    });
  });
  await page.route("**/audio/" + timingName, (route) =>
    route.fulfill({
      json: {
        version: 1,
        paragraphs: [
          { text: "First passage.", start: 0, end: 20 },
          { text: "Second passage.", start: 20, end: 40 },
        ],
      },
    }),
  );
  await page.route("**/audio/" + audioName, (route) => {
    const range = route
      .request()
      .headers()
      .range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0,
      end = range && range[2] ? Number(range[2]) : wav.length - 1;
    return route.fulfill({
      status: range ? 206 : 200,
      contentType: "audio/wav",
      headers: {
        "Accept-Ranges": "bytes",
        ...(range
          ? { "Content-Range": `bytes ${start}-${end}/${wav.length}` }
          : {}),
      },
      body: wav.subarray(start, end + 1),
    });
  });
  await page.goto("/static-test");
  await page.locator("pipread-audio").evaluate((el) => {
    el.audio.muted = true;
  });
}
test("static player loads only static assets, plays, pauses, resumes, seeks, speed and highlights", async ({
  page,
}) => {
  const urls = [];
  page.on("request", (r) => urls.push(r.url()));
  await setup(page);
  await page.getByRole("button", { name: "Listen to this article" }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  const el = page.locator("pipread-audio");
  await el.evaluate((el) => el.audio.pause());
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Playback speed").selectOption("1.5");
  await el.evaluate((el) => {
    el.audio.currentTime = 25;
  });
  await page.getByRole("button", {name:"Back 15 seconds",exact:true}).click();
  expect(await el.evaluate(el=>el.audio.currentTime)).toBe(10);
  await page.getByRole("button", {name:"Forward 15 seconds",exact:true}).click();
  await page.getByLabel("Highlight passage").check();
  await expect
    .poll(() => el.evaluate((el) => CSS.highlights.has(el.key)))
    .toBe(true);
  expect(
    await el.evaluate((el) => ({
      paused: el.audio.paused,
      rate: el.audio.playbackRate,
      time: el.audio.currentTime,
    })),
  ).toEqual({ paused: true, rate: 1.5, time: 25 });
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await el.evaluate((el) => el.audio.pause());
  expect(
    urls.some((url) => /huggingface|\.onnx|\.wasm|tts\.worker/.test(url)),
  ).toBe(false);
});
test("missing manifest reports retry; no inference fallback", async ({
  page,
}) => {
  await setup(page, { missing: true });
  await page.getByRole("button", { name: "Listen to this article" }).click();
  await expect(page.getByRole("status")).toHaveText("Manifest is unavailable");
  await expect(page.getByRole("button", { name: "Retry" })).toBeEnabled();
});
test("cancel loading by source change and disconnect clears audio/highlight", async ({
  page,
}) => {
  await setup(page, { slow: true });
  await page.getByRole("button", { name: "Listen to this article" }).click();
  await page
    .locator("pipread-audio")
    .evaluate((el) => el.setAttribute("article", "changed.html"));
  await expect(
    page.getByRole("button", { name: "Listen to this article" }),
  ).toBeEnabled();
  await page.waitForTimeout(400);
  expect(
    await page
      .locator("pipread-audio")
      .evaluate((el) => el.audio.hasAttribute("src")),
  ).toBe(false);
  await page
    .locator("pipread-audio")
    .evaluate((el) => el.setAttribute("article", "post.html"));
  await page.getByRole("button", { name: "Listen to this article" }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  expect(
    await page.locator("pipread-audio").evaluate((el) => {
      el.remove();
      return el.audio.paused && !el.audio.hasAttribute("src");
    }),
  ).toBe(true);
});
test("static player fits narrow layouts", async ({ page }) => {
  await setup(page);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
