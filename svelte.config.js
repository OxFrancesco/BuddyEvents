import adapter from "@sveltejs/adapter-vercel";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    alias: {
      "@": ".",
    },
    experimental: {
      remoteFunctions: true,
    },
    files: {
      assets: "public",
    },
  },
  compilerOptions: {
    experimental: {
      async: true,
    },
  },
  vitePlugin: {
    dynamicCompileOptions: ({ filename }) =>
      filename.includes("node_modules") ? undefined : { runes: true },
  },
};

export default config;
