import { defineConfig } from 'vite';

// Tauri 在 Windows 上用 WebView2 通过 file:// 加载前端，
// 因此资源路径必须是相对路径，且端口必须固定。
export default defineConfig({
  root: '.',
  base: './',
  clearScreen: false,
  server: {
    port: 5183,
    strictPort: true,
    host: '127.0.0.1',
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  // mermaid 只在文档里出现图表时才动态加载。dev 模式下如果不显式预构建，
  // 首次 import 会一直挂在依赖预构建上（页面表现为图表不渲染且无报错）。
  optimizeDeps: {
    include: ['mermaid'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    sourcemap: false,
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      output: {
        // 这里刻意**不再手写 manualChunks**。
        //
        // 曾经的写法是「把 node_modules/mermaid 单独拆一个 chunk」，出发点是
        // 让冷启动不加载它 —— 实际结果是反的：手写 chunk 会把 mermaid 的
        // **共享依赖**（entities、dompurify）一起吸进那个块，而入口又需要
        // entities/dompurify，于是入口被迫静态 import 整个 mermaid 块，
        // 冷启动白白背上 4.85MB JS（实测解析+编译 109ms，占首屏 JS 的 78%）。
        //
        // 现在改成只依赖 import() 做分包：mermaid / katex / hljs / editor
        // 全部由各自的动态 import 自然切成独立 chunk，共享依赖由打包器
        // 提到入口或公共块，不会再出现「为了拿一个小模块而拖进整个大块」。
        // 约束由 scripts/check-build-perf.py 做构建断言，不靠人盯。
      },
    },
  },
});
