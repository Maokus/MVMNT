// vite.config.ts
import { defineConfig } from "file:///Users/markus/webdev/VISUALISERS/MVMNT/node_modules/vitest/dist/config.js";
import react from "file:///Users/markus/webdev/VISUALISERS/MVMNT/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import tsconfigPaths from "file:///Users/markus/webdev/VISUALISERS/MVMNT/node_modules/vite-tsconfig-paths/dist/index.js";
var __vite_injected_original_dirname = "/Users/markus/webdev/VISUALISERS/MVMNT";
var vite_config_default = defineConfig(({ mode }) => ({
  // Use a dynamic base so the app can be hosted under a sub-path in production
  // Production target path: https://maok.us/playbox/projects/mvmnt/
  // Local dev remains at root '/'
  base: mode === "production" ? "/playbox/projects/mvmnt/" : mode === "beta" ? "/playbox/projects/mvmnt_beta/" : "/",
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"]
  },
  server: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin"
    }
  },
  // React SWC plugin already enables Fast Refresh by default; ensure our component
  // modules use named function declarations for providers for consistent boundaries.
  plugins: [react(), tsconfigPaths()],
  assetsInclude: ["**/*.icns", "**/*.mvt"],
  build: {
    outDir: "build",
    sourcemap: true
  },
  define: {
    "process.env": {}
    // lightweight shim
  },
  alias: {
    "@": path.resolve(__vite_injected_original_dirname, "src")
    // optional shortcut
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx,js,jsx}"],
    assetsInclude: ["**/*.icns", "**/*.mvt"]
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvbWFya3VzL3dlYmRldi9WSVNVQUxJU0VSUy9NVk1OVFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL21hcmt1cy93ZWJkZXYvVklTVUFMSVNFUlMvTVZNTlQvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL21hcmt1cy93ZWJkZXYvVklTVUFMSVNFUlMvTVZNTlQvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlc3QvY29uZmlnJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2MnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgdHNjb25maWdQYXRocyBmcm9tICd2aXRlLXRzY29uZmlnLXBhdGhzJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4gKHtcbiAgICAvLyBVc2UgYSBkeW5hbWljIGJhc2Ugc28gdGhlIGFwcCBjYW4gYmUgaG9zdGVkIHVuZGVyIGEgc3ViLXBhdGggaW4gcHJvZHVjdGlvblxuICAgIC8vIFByb2R1Y3Rpb24gdGFyZ2V0IHBhdGg6IGh0dHBzOi8vbWFvay51cy9wbGF5Ym94L3Byb2plY3RzL212bW50L1xuICAgIC8vIExvY2FsIGRldiByZW1haW5zIGF0IHJvb3QgJy8nXG4gICAgYmFzZTogbW9kZSA9PT0gJ3Byb2R1Y3Rpb24nID8gJy9wbGF5Ym94L3Byb2plY3RzL212bW50LycgOiBtb2RlID09PSAnYmV0YScgPyAnL3BsYXlib3gvcHJvamVjdHMvbXZtbnRfYmV0YS8nIDogJy8nLFxuICAgIG9wdGltaXplRGVwczoge1xuICAgICAgICBleGNsdWRlOiBbJ0BmZm1wZWcvZmZtcGVnJywgJ0BmZm1wZWcvdXRpbCddLFxuICAgIH0sXG4gICAgc2VydmVyOiB7XG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICdDcm9zcy1PcmlnaW4tRW1iZWRkZXItUG9saWN5JzogJ3JlcXVpcmUtY29ycCcsXG4gICAgICAgICAgICAnQ3Jvc3MtT3JpZ2luLU9wZW5lci1Qb2xpY3knOiAnc2FtZS1vcmlnaW4nLFxuICAgICAgICB9LFxuICAgIH0sXG4gICAgLy8gUmVhY3QgU1dDIHBsdWdpbiBhbHJlYWR5IGVuYWJsZXMgRmFzdCBSZWZyZXNoIGJ5IGRlZmF1bHQ7IGVuc3VyZSBvdXIgY29tcG9uZW50XG4gICAgLy8gbW9kdWxlcyB1c2UgbmFtZWQgZnVuY3Rpb24gZGVjbGFyYXRpb25zIGZvciBwcm92aWRlcnMgZm9yIGNvbnNpc3RlbnQgYm91bmRhcmllcy5cbiAgICBwbHVnaW5zOiBbcmVhY3QoKSwgdHNjb25maWdQYXRocygpXSxcbiAgICBhc3NldHNJbmNsdWRlOiBbJyoqLyouaWNucycsICcqKi8qLm12dCddLFxuICAgIGJ1aWxkOiB7XG4gICAgICAgIG91dERpcjogJ2J1aWxkJyxcbiAgICAgICAgc291cmNlbWFwOiB0cnVlLFxuICAgIH0sXG4gICAgZGVmaW5lOiB7XG4gICAgICAgICdwcm9jZXNzLmVudic6IHt9LCAvLyBsaWdodHdlaWdodCBzaGltXG4gICAgfSxcbiAgICBhbGlhczoge1xuICAgICAgICAnQCc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICdzcmMnKSwgLy8gb3B0aW9uYWwgc2hvcnRjdXRcbiAgICB9LFxuICAgIHRlc3Q6IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6ICdqc2RvbScsXG4gICAgICAgIHNldHVwRmlsZXM6IFsnLi9zcmMvc2V0dXBUZXN0cy50cyddLFxuICAgICAgICBnbG9iYWxzOiB0cnVlLFxuICAgICAgICBpbmNsdWRlOiBbJ3NyYy8qKi8qLnt0ZXN0LHNwZWN9Lnt0cyx0c3gsanMsanN4fSddLFxuICAgICAgICBhc3NldHNJbmNsdWRlOiBbJyoqLyouaWNucycsICcqKi8qLm12dCddLFxuICAgIH0sXG59KSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQW9TLFNBQVMsb0JBQW9CO0FBQ2pVLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFDakIsT0FBTyxtQkFBbUI7QUFIMUIsSUFBTSxtQ0FBbUM7QUFLekMsSUFBTyxzQkFBUSxhQUFhLENBQUMsRUFBRSxLQUFLLE9BQU87QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUl2QyxNQUFNLFNBQVMsZUFBZSw2QkFBNkIsU0FBUyxTQUFTLGtDQUFrQztBQUFBLEVBQy9HLGNBQWM7QUFBQSxJQUNWLFNBQVMsQ0FBQyxrQkFBa0IsY0FBYztBQUFBLEVBQzlDO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDSixTQUFTO0FBQUEsTUFDTCxnQ0FBZ0M7QUFBQSxNQUNoQyw4QkFBOEI7QUFBQSxJQUNsQztBQUFBLEVBQ0o7QUFBQTtBQUFBO0FBQUEsRUFHQSxTQUFTLENBQUMsTUFBTSxHQUFHLGNBQWMsQ0FBQztBQUFBLEVBQ2xDLGVBQWUsQ0FBQyxhQUFhLFVBQVU7QUFBQSxFQUN2QyxPQUFPO0FBQUEsSUFDSCxRQUFRO0FBQUEsSUFDUixXQUFXO0FBQUEsRUFDZjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ0osZUFBZSxDQUFDO0FBQUE7QUFBQSxFQUNwQjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0gsS0FBSyxLQUFLLFFBQVEsa0NBQVcsS0FBSztBQUFBO0FBQUEsRUFDdEM7QUFBQSxFQUNBLE1BQU07QUFBQSxJQUNGLGFBQWE7QUFBQSxJQUNiLFlBQVksQ0FBQyxxQkFBcUI7QUFBQSxJQUNsQyxTQUFTO0FBQUEsSUFDVCxTQUFTLENBQUMsc0NBQXNDO0FBQUEsSUFDaEQsZUFBZSxDQUFDLGFBQWEsVUFBVTtBQUFBLEVBQzNDO0FBQ0osRUFBRTsiLAogICJuYW1lcyI6IFtdCn0K
