import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({ command }) => {
  // vite build（生产）时为 true，vite dev / middlewareMode（开发）时为 false
  const isProductionBuild = command === 'build';
  return {
    // 性能测试样张（public/perf-samples 下的写实照片）只在开发模式提供，
    // 生产构建不拷贝这些测试资源，避免随产物一起发布。
    publicDir: isProductionBuild ? false : 'public',
    define: {
      // 性能测试项目开关：开发模式启用，生产构建关闭。
      // 编译期常量，生产包中该分支会被直接移除。
      __PERF_TEST_FIXTURE__: JSON.stringify(!isProductionBuild),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/api/t8star': {
          target: 'https://ai.t8star.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/t8star/, ''),
        }
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
