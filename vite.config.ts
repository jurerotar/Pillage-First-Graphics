import { type UserConfig, defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import vitePluginSvgr from 'vite-plugin-svgr';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vitePluginSvgr({
      svgrOptions: {
        exportType: 'default',
      },
    }),
    viteStaticCopy({
      structured: true,
      targets: [
        {
          src: 'graphic-packs/**/*.avif',
          dest: '',
        },
      ],
    }),
  ],
  build: {
    lib: {
      entry: 'index.ts',
      fileName: 'index',
      formats: ['es'],
    },
    assetsDir: './svg',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'index.ts',
      },
      external: ['react'],
    },
  },
}) satisfies UserConfig;
