import esbuild from "esbuild";
import builtins from "builtin-modules";

const production = process.argv[2] === "production";

await esbuild
  .build({
    entryPoints: ["src/main.ts"],
    bundle: true,
    format: "cjs",
    target: "es2018",
    platform: "browser",
    logLevel: "info",
    sourcemap: production ? false : "inline",
    treeShaking: true,
    outfile: "main.js",
    external: [
      "obsidian",
      "electron",
      "@codemirror/autocomplete",
      "@codemirror/collab",
      "@codemirror/commands",
      "@codemirror/language",
      "@codemirror/lint",
      "@codemirror/search",
      "@codemirror/state",
      "@codemirror/view",
      "@lezer/common",
      "@lezer/highlight",
      "@lezer/lr",
      ...builtins,
    ],
  })
  .catch(() => process.exit(1));
