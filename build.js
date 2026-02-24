const esbuild = require("esbuild");

esbuild.build({
    entryPoints: ["src/server.js"], // your main backend file
    bundle: true,
    platform: "node",
    target: "node18",
    outfile: "dist/index.js",
    minify: true,
    sourcemap: true,
    external: [], // add things like ["express"] if needed
}).then(() => {
    console.log("Build successful 🚀");
}).catch(() => process.exit(1));