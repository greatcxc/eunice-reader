# 第三方组件与许可

Eunice Reader 自身以 [MIT](../LICENSE) 发布。它**分发**了以下第三方资源，
它们各自的许可条款同样适用于对应文件。本文件用于满足这些许可的「保留版权声明」要求。

---

## 一、内置字体

字体文件位于 `src/fonts/`（含 `faces/`、`wenkai/` 分片），随应用一起分发。

| 字体 | 版权 | 许可证 | 许可文本 |
|---|---|---|---|
| Noto Sans SC / Noto Serif SC | Google / Adobe | SIL Open Font License 1.1 | 见 `src/fonts/licenses/` 与应用内说明 |
| 霞鹜文楷 LXGW WenKai | LXGW | SIL OFL 1.1 | `src/fonts/licenses/` |
| 霞鹜新致宋 LXGW Neo ZhiSong | LXGW | SIL OFL 1.1 | [lxgw-neo-zhisong-notes.md](../src/fonts/licenses/lxgw-neo-zhisong-notes.md) |
| 狮尾圆体 Swei Gothic | 翰字铸造 / max32002 | SIL OFL 1.1 | [swei-gothic-OFL.txt](../src/fonts/licenses/swei-gothic-OFL.txt) |
| 更纱等宽 Sarasa Mono SC | Belleve Invis | SIL OFL 1.1 | [sarasa-mono-sc-OFL.txt](../src/fonts/licenses/sarasa-mono-sc-OFL.txt) |
| 未来荧黑 Glow Sans | Celestial Phineas | SIL OFL 1.1 | [glow-sans-notes.md](../src/fonts/licenses/glow-sans-notes.md) |
| Inter | Rasmus Andersson | SIL OFL 1.1 | 随 npm 包分发 |
| EB Garamond | Georg Duffner 等 | SIL OFL 1.1 | 随 npm 包分发 |
| JetBrains Mono | JetBrains | SIL OFL 1.1 | 随 npm 包分发 |

> **OFL 要点**：允许自由使用、修改、再分发（含商用），但
> **不得单独售卖字体本身**；修改后再分发需更换保留字体名（Reserved Font Name）；
> 分发时必须附带本许可文本。本项目对字体的处理仅为**子集化与格式转换**（TTF → WOFF2 分片），
> 未修改字形；若你二次分发本项目的字体文件，请一并保留上述许可文本。

## 二、界面图标

| 资源 | 许可证 | 说明 |
|---|---|---|
| [Lucide](https://lucide.dev) | ISC | `src/icons/*.svg`，由 `lucide-static` 复制并内联进构建产物 |

## 三、运行时依赖（npm）

| 包 | 许可证 |
|---|---|
| `@tauri-apps/api`、`@tauri-apps/plugin-*` | MIT / Apache-2.0 |
| `markdown-it`、`markdown-it-footnote`、`markdown-it-emoji`、`markdown-it-anchor`、`markdown-it-container` | MIT |
| `markdown-it-task-lists` | ISC |
| `@vscode/markdown-it-katex`、`katex` | MIT |
| `mermaid` | MIT |
| `dompurify` | MPL-2.0 OR Apache-2.0 |
| `highlight.js` | BSD-3-Clause |
| `codemirror`（含 `@codemirror/*`、`@lezer/*`） | MIT |
| `lucide-static` | ISC |
| `lxgw-wenkai-webfont` | OFL 1.1 |
| `@fontsource/*`、`@openfonts/*` | OFL 1.1（字体） / MIT（打包脚本） |
| `vite` | MIT |

完整的依赖树与其许可可通过 `npm ls` 或 `package-lock.json` 复核。

## 四、Rust 依赖

| crate | 许可证 |
|---|---|
| `tauri`、`tauri-plugin-*`、`tauri-build` | MIT / Apache-2.0 |
| `encoding_rs` | MIT / Apache-2.0（部分 BSD-3-Clause） |
| `serde` / `serde_json` | MIT / Apache-2.0 |
| `tokio` | MIT |
| `winreg` | MIT |
| `webview2-com`、`windows-core` | MIT / Apache-2.0 |

完整列表见 `src-tauri/Cargo.lock`。

---

如发现遗漏或归属有误，欢迎提 Issue 更正。
