import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
const output = await build({
  entryPoints: ["frontend/src/interaction/statsPalette.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "ref-only",
      setup(b) {
        b.onResolve({ filter: /^vue$/ }, () => ({
          path: "vue",
          namespace: "test",
        }));
        b.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents: "export const ref=value=>({value});",
        }));
      },
    },
  ],
});
const saved = new Map();
globalThis.localStorage = {
  getItem: (k) => saved.get(k) ?? null,
  setItem: (k, v) => saved.set(k, v),
  removeItem: (k) => saved.delete(k),
};
const palette = await import(
  "data:text/javascript;base64," +
    Buffer.from(output.outputFiles[0].text).toString("base64")
);
assert.equal(palette.readStatsColor("{broken"), "#aaaaaa");
assert.equal(palette.readStatsColor('{"base":"url(evil)"}'), "#aaaaaa");
assert.equal(palette.readStatsColor('{"base":"#123AbC"}'), "#123abc");
palette.saveStatsColor("#444444");
assert.equal(palette.statsBaseColor.value, "#444444");
assert.equal(JSON.parse(saved.get("lundao-stats-colors-v1")).base, "#444444");
palette.saveStatsColor("red;opacity:0");
assert.equal(palette.statsBaseColor.value, "#444444");
palette.resetStatsColors();
assert.equal(palette.statsBaseColor.value, "#aaaaaa");
assert.equal(palette.readStatsColor('{"base":"#555555"}'), "#aaaaaa");
assert.equal(palette.statsFill("#aaaaaa", 0, false), "#ffffff");
assert.equal(palette.statsFill("#aaaaaa", 1, false), "#aaaaaa");
assert.equal(palette.statsFill("#aaaaaa", 0, true), "#ffffff");
assert.equal(palette.statsFill("#aaaaaa", 1, true), "#b0b0b0");
assert.equal(palette.readStatsColor('{"base":"#b98a48"}'), "#aaaaaa");
assert.equal(
  palette.statsInk(palette.statsFill("#aaaaaa", 0, false)),
  "#000000",
);
assert.equal(
  palette.statsInk(palette.statsFill("#aaaaaa", 1, false)),
  "#000000",
);
assert.equal(palette.statsElapsedShade(null), 0);
assert.equal(palette.statsElapsedShade(0.99), 0, "fresh day stays white");
assert.equal(palette.statsElapsedShade(1), 1 / 30);
assert.equal(palette.statsElapsedShade(30), 1);
assert.equal(palette.statsElapsedShade(100), 1);
for (const dark of [false, true]) {
  let last = 255;
  for (let day = 0; day <= 30; day++) {
    const channel = parseInt(
      palette
        .statsFill("#aaaaaa", palette.statsElapsedShade(day), dark)
        .slice(1, 3),
      16,
    );
    assert(
      last - channel >= 0 && last - channel <= 3,
      "each day deepens just 2–3 RGB steps",
    );
    last = channel;
  }
}
const rgb = (hex) =>
  hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16));
for (const dark of [false, true])
  for (const base of ["#000000", "#ffffff", "#555555", "#123456", "#7ac4a2"]) {
    let previous = rgb(palette.statsFill(base, 0, dark));
    for (let i = 1; i <= 1000; i++) {
      const color = palette.statsFill(base, i / 1000, dark),
        current = rgb(color);
      assert(
        current.every(
          (v, index) => v <= previous[index] && previous[index] - v <= 1,
        ),
        "warning depth is continuous and never reverses",
      );
      const linear = current.map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        }),
        l = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
      const contrast =
        palette.statsInk(color) === "#000000"
          ? (l + 0.05) / 0.05
          : 1.05 / (l + 0.05);
      assert(contrast >= 4.5, "custom colours retain readable ink");
      previous = current;
    }
  }
console.log(
  "PASS: daytime neutral grey and nighttime grey/white, validated persistence/reset, 10000 monotone depth samples, dark adaptation and WCAG text contrast.",
);

palette.saveStatsTaskColor("floor", "#b98a48", false);
palette.saveStatsTaskColor("floor", "#759fc1", true);
const customStatsKey = `task_${"c".repeat(32)}`;
palette.saveStatsTaskColor(customStatsKey, "#9986bc", false);
palette.saveStatsTaskColor(customStatsKey, "#759fc1", true);
assert.equal(palette.statsColorFor("floor", false), "#b98a48");
assert.equal(palette.statsColorFor("floor", true), "#759fc1");
assert.equal(palette.statsColorFor(customStatsKey, false), "#9986bc");
assert.equal(palette.statsColorFor(customStatsKey, true), "#759fc1");
assert.equal(palette.statsColorFor("toilet", false), "#aaaaaa");
assert.equal(palette.statsFill("#b98a48", 1, true, "#759fc1"), "#759fc1");
assert.equal(
  palette.statsFill("#faf0ee", 1, false),
  "#faf0ee",
  "custom colours are not clipped",
);
assert.equal(palette.statsFill("#b98a48", 0, true, "#759fc1"), "#ffffff");
assert.deepEqual(
  palette.readStatsTaskColors(saved.get("lundao-stats-task-colors-v2")),
  {
    floor: { light: "#b98a48", dark: "#759fc1" },
    [customStatsKey]: { light: "#9986bc", dark: "#759fc1" },
  },
);
palette.saveStatsTaskColor("floor", "url(evil)", false);
palette.saveStatsTaskColor("bad", "#000000", false);
assert.equal(palette.statsColorFor("floor", false), "#b98a48");
assert.deepEqual(
  palette.readStatsTaskColors(
    '{"floor":{"dark":"bad"},"sink":{"light":"#AABBCC"}}',
  ),
  { sink: { light: "#aabbcc" } },
);
assert.deepEqual(
  palette.readStatsTaskColors(`{"${customStatsKey}":{"dark":"#AABBCC"},"task_bad":{"light":"#000000"}}`),
  { [customStatsKey]: { dark: "#aabbcc" } },
);
palette.resetStatsColors();
assert.equal(palette.statsColorFor("floor", true), "#b0b0b0");
console.log(
  "PASS: independent task/day/night colours, exact custom endpoints, validated persistence and reset.",
);

assert.equal(
  saved.has("lundao-stats-task-colors-v2"),
  false,
  "reset removes persisted per-task colours",
);
