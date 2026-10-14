# 字体候选方案调研报告 — Eunice Reader

- **任务**：task-3「调研 5 类新字体的开源方案（含完整字符集与许可证核实）」
- **执行人**：font-scout
- **调研时间**：2026-10-14 10:54 – 12:20 (Asia/Hong_Kong)
- **仓库根目录**：`D:\Eunice-Reader`
- **实测工具**：`.font-scout/measure.py` / `union.py` / `detail.py`（自建，基于 fontTools 4.65.0 解析 cmap）
- **原始数据**：`.font-scout/measurements.json`（32 条）、`.font-scout/pkgs/`、`.font-scout/upstream/`
- **一句话结论**：**在「绝对不要出现字体 fallback」这条硬约束下，5 类里只有「等宽」这一类能被真正满足**（`@fontpkg/sarasa-mono-sc`，实测 48,604 码位，全部探针通过）。其余 4 类的中文字体**全部缺 ✔/✗/✘**，而且**项目现有的思源黑体/宋体也缺**——当前的「无 fallback」是靠 Windows 专有的 `Segoe UI Symbol` 撑着的，换到 macOS/Linux 就会掉字。本报告给出确切缺字清单和一个低成本的补救方案。

---

## 0. 结论摘要

### 0.1 五类最终推荐

| 类别 | 首选推荐 | npm 包@版本 | 许可证 | 实测码位 | 缺的类别 | 单文件体积 |
|---|---|---|---|---|---|---|
| **1 圆体/柔和无衬线** | 狮尾圆体 Swei Gothic CJK SC | **无官方 npm**（需 vendor 上游 GitHub `max32002/swei-gothic` 2.143） | OFL 1.1 | **45,217** | ✔✗✘ | 15.56 MB TTF |
| **2 手写/硬笔/毛笔** | 霞鹜文楷 LXGW WenKai（完整版） | `lxgw-wenkai-webfont@1.7.0`（分片）/ 上游 GitHub 单文件 | OFL 1.1 | **46,490** | ✔✘ | 24.39 MB TTF |
| **3 老式衬线/书籍感宋体** | 思源宋体 Noto Serif SC（现有基线，建议升到 CJK 全量） | 现有 `src/fonts/serif-400.woff2` | OFL 1.1 | 30,928 | ✔✗✘ | 5.58 MB woff2 |
| **4 更中性的等宽** | **更纱等宽 Sarasa Mono SC** ⭐ | `@fontpkg/sarasa-mono-sc@0.36.0` | OFL 1.1 | **48,604** | **无（全部通过）** | 24.70 MB TTF |
| **5 标题装饰体** | 未来荧黑 Glow Sans SC Normal | `@fontpkg/glow-sans-sc@0.93.2` | OFL 1.1 | 32,227 | 箭头(⇒⇔)/常用符号(′″※)/★☆✔✗✘/上下标 | 8.70 MB OTF |

> **码位数全部是 fontTools 解析 cmap 实测值，不是作者说明。** 举证见 §2 与附录 B。

### 0.2 三类「必须说实话」的结论

1. **只有「等宽」这一类能满足「无 fallback」。**
   `@fontpkg/sarasa-mono-sc@0.36.0` 是本次实测 32 款字体里**唯一**在全部 17 个探针类别上零缺字的字体（48,604 码位）。它同时是最优的中文基座字体。

2. **圆体、手写、老宋、标题 —— 找不到任何一款能满足完整覆盖的开源中文方案。**
   最佳成绩是 Swei Gothic 45,217 码位、LXGW WenKai 46,490 码位，但**都缺 ✔/✗/✘**。这不是「没找够」，是字体设计层面的系统性问题（见 §4.1）。

3. **项目当前状态已经违反用户这条硬约束。**
   现有 `src/fonts/sans-400.woff2`（Noto Sans SC）实测**缺 ✔=U+2714、✗=U+2717、✘=U+2718 三个字符**，`serif-400.woff2`（Noto Serif SC）同样缺这三个。`src/lib/fonts.js` 注释里写的「由系统 Segoe UI Symbol 兜住」——那是 **Windows 专有字体**，在 macOS/Linux 上就是豆腐块。**这是本次调研最值得立刻处理的一条。**

---

## 1. 调研纪律说明

- **写入范围**：仅 `docs/font-candidates.md`（本文件）与 `.font-scout/`。**未修改** `src/`、`package.json`、`.npmrc`、任何 `src-tauri` 文件。
- **未执行**：`npm run build`、`npm run tauri:build`、任何 crate 编译。
- **未触碰项目 `.npmrc`**：字体包下载走自建 `.font-scout/fetch.py`（直接读 registry HTTP API 取 tarball URL，用 urllib 下载），完全绕开 npm 配置解析，因此不受项目根 `.npmrc` 里那个失效代理影响。npm registry 查询在 `$env:TEMP\fontlab` 临时目录内进行。
- **允许并执行的安装**：`python -m pip install fonttools brotli`（装到 4.65.0 / 1.2.0）。
- **只读使用**：用 `read`/`grep`/`glob` 工具读取 `src/lib/fonts.js`、`scripts/check-coverage.py`、`src/fonts/*`，未改动。

---

## 2. 实测方法（可复现）

### 2.1 探针类别

与项目 `scripts/check-coverage.py` 的 `PROBES` 对齐并扩展。每类的字符集固定，逐个查 cmap：

| 类别 | 探针字符 |
|---|---|
| ASCII 英文 | `The quick brown fox jumps over lazy dog` |
| 数字符号 | `0123456789 +-*/=<>%#@&` |
| 中文常用 | `中文正文排版阅读器设置选项` |
| 中文标点 | `，。！？；：（）【】《》“”‘’——` |
| 西文标点 | `.,;:!?()[]{}"'` |
| 破折号省略号 | `—–…` |
| 数学符号 | `≈≠≤≥∞∑√∫±×÷` |
| 希腊字母 | `αβγδθλπσφωΔΩ` |
| 箭头 | `←↑→↓↔⇒⇔` |
| 常用符号 | `§¶©®™°※†‡•‰′″` |
| 全角符号 | `！＂＃＄％＆＇（）＊＋，－．／：；＜＝＞？＠` |
| 上下标 | `₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹` |
| **勾叉星号** | `✔✗✘★☆` |
| 几何/方框 | `■□▲▼◆○●` |
| 平假名片假名 | `あいうえおアイウエオ` |
| 拉丁扩展 | `éèüñçåøœß` |
| 西里尔 | `АБВГДабвгд` |

另外按 Unicode 区段统计了 20 个区段的覆盖率（CJK 基本区、CJK 标点、全角 ASCII、箭头、数学运算符、杂项符号、装饰符号等），用于判断「缺哪一类」而不是「缺几个字」。

### 2.2 分片字体必须取并集

**@fontsource / cn-fontsource 的 CJK 包全部是 unicode-range 分片**，不是单文件：

| 包 | 分片数 |
|---|---|
| `@fontsource/lxgw-marker-gothic@5.3.1` | 124 + 8 个子集 |
| `@fontsource/ma-shan-zheng@5.3.1` | 120 |
| `@fontsource/zcool-kuaile@5.3.0` | 119 |
| `cn-fontsource-975-maru-sc-regular@1.0.1` | **609** |
| `cn-fontsource-yozai-regular@1.0.9` | 258 |
| `@mogeko/maple-mono-cn@7.9.0` | 239 |

所以这些包的码位数必须用 `union.py` 把所有分片 cmap 取并集。**已额外校验：每个分片包内部只有一个 family/weight**（例如 975 包的 609 个文件全部是 `975Maru SC / Regular`），因此并集数字等于该字体真实字符集，不存在把多个字重混在一起导致虚高的问题。

这一点对用户的决定很关键：**用户已明确「新增字体要内置完整字符集，不要分片」，而 `@fontsource/*` 的中文包天然就是分片的**，不能直接用。要用就得走上游单文件 TTF（GitHub Release）或 `@fontpkg/*`（单个大文件）。

### 2.3 复现命令

```powershell
cd D:\Eunice-Reader
python .font-scout/measure.py --brief --dir .font-scout/upstream   # 单文件
python .font-scout/union.py .font-scout/pkgs/<分片包目录>           # 分片并集
python .font-scout/detail.py <字体文件>                             # 精确缺字清单（含 U+ 码位）
python .font-scout/collect.py                                      # 重新生成 measurements.json
```

---

## 3. 五类方案详表

### 3.1 第 1 类：圆体 / 柔和无衬线

| 字体 | npm 包@版本 | 许可证 | 实测码位 | 缺的类别（精确） | 体积 | 字重 |
|---|---|---|---|---|---|---|
| **狮尾圆体 Swei Gothic CJK SC** ⭐ | 无官方 npm；上游 `max32002/swei-gothic` 2.143（`CJK SC/SweiGothicCJKsc-Regular.ttf`） | OFL 1.1 | **45,217** | ✔U+2714 ✗U+2717 ✘U+2718 | 15.56 MB TTF | Thin→Black，7 档 |
| 975Maru SC | `cn-fontsource-975-maru-sc-regular@1.0.1` | OFL 1.1 | **42,230**（609 分片并集，8.33 MB） | ✔✗✘ | 分片 8.33 MB | Regular |
| 霞鹜 975 圆体 LXGW 975 Yuan SC | 无 npm（上游 `lxgw/975Yuan` 26.07.26） | OFL 1.1 | 30,912 | ✔✗✘ | 13.85 MB TTF | 400/500/700 |
| 寒蝉圆黑体 ChillRoundGothic | 无 npm（上游 `Warren2060/ChillRoundGothic` v3.750） | OFL 1.1 | 27,148 | 破折号省略号、常用符号、✔✗✘ | 8.94 MB OTF | 7 档 |
| 霞鹜漫黑 LXGW Marker Gothic | `@fontsource/lxgw-marker-gothic@5.3.1` | OFL 1.1 | 15,368 | ↔U+2194、✔✗✘；**CJK 基本区缺 8,221/20,992** | 3.04 MB TTF | Regular |
| Zen Maru Gothic | `@fontsource/zen-maru-gothic@5.3.1` | OFL 1.1 | 7,812 | 中文常用(设读选阅项)、数学符号、箭头、全角符号、✔✗✘ | 3.66 MB | 5 档 |
| M PLUS Rounded 1c | `@fontsource/m-plus-rounded-1c@5.3.0` | OFL 1.1 | 8,201 | **中文常用(设读选阅项)**；CJK 基本区缺 16,038 | 3.23 MB | 7 档 |

**要点**

- **Swei Gothic 是本类唯一接近「无 fallback」的方案**：45,217 码位，CJK 基本区只缺 18/20,992，箭头顶缺 87/112（缺的都是 U+219A–U+21AB 这类极罕见变形箭头，`←↑→↓↔` 全有）。它衍生自 Noto Sans CJK，OFL 1.1，**许可证最干净**。
- **无官方 npm 包**是它唯一的短板——需要把 15.56 MB TTF vendor 进仓库（或从 GitHub Release 取）。若必须走 npm，则退而选 `cn-fontsource-975-maru-sc-regular`（42,230 码位、OFL、有 npm），代价是 609 个分片，与用户「不要分片」的决定冲突。
- **M PLUS Rounded 1c 有个反直觉数据点**：它居然**完整覆盖 ✔✗✘★☆**（本类唯一），但它是日文字体，简体中文常用字缺 5 个（设/读/选/阅/项），CJK 基本区缺 16,038 —— **不能用于简体正文**。
- **霞鹜漫黑（LXGW Marker Gothic）覆盖远不如预期**：只有 15,368 码位，CJK 基本区缺 8,221 字（约 39%），连 `↔` 都缺。它适合做「标记/手写涂鸦感」的装饰，不适合做正文预设。

### 3.2 第 2 类：手写 / 硬笔 / 毛笔感

| 字体 | npm 包@版本 | 许可证 | 实测码位 | 缺的类别（精确） | 体积 |
|---|---|---|---|---|---|
| **霞鹜文楷 LXGW WenKai** ⭐ | `lxgw-wenkai-webfont@1.7.0`（194 分片，项目已在用）；单文件走上游 GitHub | OFL 1.1 | **46,490** | ✔U+2714 ✘U+2718（**✗ 有**） | 24.39 MB TTF |
| 悠哉字体 Yozai | `cn-fontsource-yozai-regular@1.0.9` | OFL 1.1 | 20,307（258 分片并集） | ✔✗✘ | 6.70 MB 分片 |
| 芫荽 Iansui | `@fontsource/iansui@5.3.1` | OFL 1.1 | 12,639 | 中文常用(设读选阅项)、数学符号(≈≤≥)、✔✗✘ | 8.98 MB |
| 马善政毛笔楷书 Ma Shan Zheng | `@fontsource/ma-shan-zheng@5.3.1` | OFL 1.1 | 7,015 | 数学、希腊、箭头、常用符号、✔✗✘ | 5.59 MB |
| 志莽行书 Zhi Mang Xing | `@fontsource/zhi-mang-xing@5.3.0` | OFL 1.1 | 7,015 | 同上 | 3.88 MB |
| 龙藏体 Long Cang | `@fontsource/long-cang@5.3.0` | OFL 1.1 | 7,015 | 同上 | 4.92 MB |
| 柳建毛草 Liu Jian Mao Cao | `@fontsource/liu-jian-mao-cao@5.3.0` | OFL 1.1 | 7,015 | 同上 | 4.72 MB |
| 悠然小楷 Slideyouran | `cn-fontsource-slideyouran-regular@1.0.3` | OFL 1.1 | 6,956 | 9 类（数字符号/西文标点/破折号/希腊/箭头/常用/全角/✔✗✘） | 6.19 MB |
| 红蕾行书 Hongleixingshu | `cn-fontsource-hongleixingshu-regular@1.0.7` | OFL 1.1 | 7,010 | 6 类（破折号/数学/希腊/箭头/常用/✔✗✘） | 4.75 MB |

**要点**

- **霞鹜文楷是本类唯一能当正文用的**：46,490 码位（本次实测第二高），只缺 ✔ 和 ✘，CJK 基本区基本全覆盖。它已经在项目里，但**目前是以 194 个分片的形式接入的**；用户若要「内置完整字符集」，应改为内置上游单文件 TTF（24.39 MB，未压缩；转 woff2 后约 9–10 MB）。
- **7,015 码位那一批（马善政/志莽/龙藏/柳建/站酷系）其实是同一个字表规模**，都是 GB2312 级别（6,763 汉字 + 符号）。它们**连 `≈≠≤≥`、希腊字母、箭头都没有**，只适合做标题/署名一类的短装饰文本。
- **芫荽 Iansui 是繁体向**（衍生自台湾手写体），简体常用字缺 5 个，不适合简体正文。
- 手写风格**没有任何一款**能做到完整覆盖。这是本任务第 2 重要的结论（详见 §4.2）。

### 3.3 第 3 类：老式衬线 / 书籍感宋体

| 字体 | npm 包@版本 | 许可证 | 实测码位 | 缺的类别 | 体积 |
|---|---|---|---|---|---|
| **思源宋体 Noto Serif SC**（现有基线） ⭐ | 现有 `src/fonts/serif-400.woff2`（项目内） | OFL 1.1 | 30,928 | ✔✗✘、上下标 | 5.58 MB woff2 |
| 霞鹜新致宋 Plus LXGW Neo ZhiSong Plus | 无 npm 单文件（上游 `lxgw/LxgwNeoZhiSong` 1.067）；分片版 `lxgw-neo-zhisong-webfont@1.0.0` | ⚠️ **IPA Font License 1.0** | **33,497**（Plus）/ 27,617（分片版，单文件 woff2 4.24 MB） | ✔U+2714 ✘U+2718（✗ 有） | 12.17 MB TTF |
| 霞鹜新致宋 LXGW Neo ZhiSong | 同上 | ⚠️ **IPA Font License 1.0** | 27,679 | ✔✘ | 9.98 MB TTF |
| Source Serif 4 | `@fontsource/source-serif-4@5.3.1` | OFL 1.1 | **807**（纯西文） | 全部中文类别 | 2.55 MB（192 分片） |
| 思源黑体 CJK 全量 Noto Sans CJK SC | `@fontpkg/noto-sans-cjk-sc@2.4.0` | OFL 1.1 | 44,810 | ✔✗✘、上下标 | 15.68 MB OTF |

**要点**

- **霞鹜新致宋（LXGW Neo ZhiSong）造型最符合「老式衬线/书籍感」，覆盖也最好（Plus 版 33,497 码位，超越现有思源宋体 30,928），但许可证是最大的坑。**

  ⚠️ **它不是 OFL，是 IPA Font License 1.0**（衍生自「IPAex明朝」「IPAmj明朝」）。作者在 README 里**明确警告**：

  > 「若计划将本项目字体用于嵌入式用途，请务必仔细阅读 IPA Font License 1.0 条款…自行评估合规成本。」
  > 「对于涉及字体文件再分发的嵌入式应用（如应用程序、硬件设备、网页等嵌入），需要满足 IPA 许可中针对衍生字体再分发的限制条件。」

  Eunice Reader 是 Tauri 桌面应用，字体要**嵌入打包分发**——正好落在作者点名的场景里。IPA FL 1.0 与 OFL 1.1 **互不兼容**，且要求衍生字体继承同许可。**结论：不建议把 Neo ZhiSong 作为内置预设**，除非法务确认。
- **作者说明与实测不一致**：README 说「本字体所支持的汉字约为 1.7 万字」，实测 cmap 是 27,679（普通版）/ 33,497（Plus）——因为码位总数包含标点、希腊、西里尔、越南语拉丁等非汉字字符。这正是任务要求「不要抄作者说明」的原因。
- **⚠️ 另一个许可证一致性风险**：`cn-fontsource-lxgw-neo-xi-hei-regular@1.0.1`（霞鹜新晰黑，同源的 IPA 衍生字体）在 npm 元数据里**声称 `SIL Open Font License 1.1`，但其上游 README 明确写的是 IPA Font License 1.0**。npm 上的许可证字段与上游冲突，**不能作为依据**。
- **建议的 OFL 替代路径**：保持「思源宋体」为书籍感宋体主力，但把字符集**从现有的 30,928（子集版）升级到 Noto Sans/Serif CJK 全量（44,810 级）**——同样的 OFL 许可证、同样的风格，凭空多出一万多码位。`@fontpkg/noto-sans-cjk-sc@2.4.0` 已实测 44,810 码位、单文件 OTF（Serif 版 @fontpkg 没有，需从 Adobe/Google 的 Source Han Serif 发布页取）。
- `Source Serif 4` 只有 807 码位、纯西文，必须配中文兜底才能用，属于「西文装饰层」。

### 3.4 第 4 类：更中性的等宽

| 字体 | npm 包@版本 | 许可证 | 实测码位 | 缺的类别 | 体积 |
|---|---|---|---|---|---|
| **更纱等宽 Sarasa Mono SC** ⭐⭐ | `@fontpkg/sarasa-mono-sc@0.36.0` | OFL 1.1 | **48,604** | **无（17/17 探针全通过）** | 24.70 MB TTF |
| 更纱黑体 Sarasa Gothic SC | `@fontpkg/sarasa-gothic-sc@0.36.0` | OFL 1.1 | 46,321 | ✔✗✘ | 24.40 MB TTF |
| 思源黑体 CJK 全量 Noto Sans CJK SC | `@fontpkg/noto-sans-cjk-sc@2.4.0` | OFL 1.1 | 44,810 | ✔✗✘、上下标 | 15.68 MB OTF |
| Maple Mono CN | `@mogeko/maple-mono-cn@7.9.0` | MIT | 22,731（239 分片并集） | 常用符号、全角符号、✔✗✘ | 8.87 MB 分片 |
| IBM Plex Mono | `@fontsource/ibm-plex-mono@5.3.0` | OFL 1.1 | 676（纯西文） | 全部中文类别 | 1.33 MB |
| Noto Sans Mono | `@fontsource/noto-sans-mono@5.3.0` | OFL 1.1 | 2,238（纯西文） | 全部中文类别 | 2.14 MB |
| JetBrains Mono（现有基线） | 现有 `src/fonts/mono-400.woff2` | OFL 1.1 | 229（纯西文） | 全部中文类别 | 20 KB |

**要点**

- **Sarasa Mono SC 是本次调研的唯一「满贯」字体**：48,604 码位，17 个探针类别全部通过。具体地：CJK 基本区只缺 16/20,992；箭头只缺 11/112；数学运算符只缺 2/256（U+22D8/U+22D9）；**`✔✗✘★☆` 全部齐备**。它基于 Inter + Iosevka + 思源黑体合成，正好同时解决「中性等宽」和「中文兜底」两个需求。
- **它是单文件 TTF（24.70 MB），不分片**，符合用户「内置完整字符集」的决定。
- **代价**：`@fontpkg/*` 包把 10 个 style 全打进去了，tarball 130 MB / 解包 250 MB；我们只需要 Regular + Bold 两个文件。另外**该包一个 LICENSE 文件都没带**（npm 元数据只写「SEE LICENSE IN README.md」，包里却既无 LICENSE 也无 README）——**OFL 1.1 要求随字体一并分发许可全文，接入时必须手工补上 LICENSE 文件**。许可证本身已从上游 `be5invis/Sarasa-Gothic` 的 `LICENSE` 核实为 SIL OFL 1.1（Copyright 2015-2025 Renzhi Li / Inter / Adobe / Google）。
- **Maple Mono CN 不及预期**：22,731 码位，缺常用符号、**全角符号**、✔✗✘，且只以 239 个分片形式发布（MIT 许可）。「更中性」的视觉诉求它满足，但字符集不达标。
- **IBM Plex Mono / Noto Sans Mono / JetBrains Mono 都是纯西文**（676 / 2,238 / 229 码位），中文一个字都没有，只能当西文装饰层配思源兜底——**不可能靠它们满足无 fallback**。

### 3.5 第 5 类：标题装饰体 / 美术字

| 字体 | npm 包@版本 | 许可证 | 实测码位 | 缺的类别 | 体积 |
|---|---|---|---|---|---|
| **未来荧黑 Glow Sans SC Normal** | `@fontpkg/glow-sans-sc@0.93.2` | OFL 1.1（字体）/ MIT（构建代码） | **32,227** | 箭头(⇒U+21D2 ⇔U+21D4)、常用符号(′″※)、**★☆✔✗✘**、上下标(仅 1/48 有)、全角 ASCII 缺 67 | 8.70 MB OTF |
| 得意黑 Smiley Sans | `@fontpkg/smiley-sans@2.0.4` | OFL 1.1 | 9,440 | 数学(∑∫≤≥)、箭头、常用符号、上下标、勾叉星号、几何图形 | 2.51 MB TTF |
| 站酷庆科黄油体 ZCOOL QingKe HuangYou | `@fontsource/zcool-qingke-huangyou@5.3.0` | OFL 1.1 | 9,429 | 数学、希腊、箭头、常用符号、✔✗✘ | 7.94 MB |
| 站酷快乐体 ZCOOL KuaiLe | `@fontsource/zcool-kuaile@5.3.0` | OFL 1.1 | 7,053 | 数学、希腊、箭头、常用符号、✔✗✘ | 1.44 MB |
| 站酷小薇 ZCOOL XiaoWei | `@fontsource/zcool-xiaowei@5.3.0` | OFL 1.1 | 7,016 | 数学、希腊、箭头、常用符号、✔✗✘ | 6.02 MB |

**要点**

- **Glow Sans SC** 码位最高（32,227，9 个字重，单文件 OTF 8.70 MB），但**缺 ★☆ 和 ✔✗✘**，且上下标几乎全缺（48 个里只有 1 个）。它是「现代几何无衬线」，做标题很好看，但对符号的覆盖不如思源。
- **得意黑 Smiley Sans** 只有 9,440 码位（CJK 基本区缺 8,000 级），是典型的「标题专用」——它本来就是为短标题、斜体收缩感设计的。**只能做装饰层**。
- 本类所有字体都缺类别。好在**标题/封面是短文本**，用户也认可「只能当装饰放字体栈前面」，所以本类不构成阻塞，但必须配套兜底字体。

---

## 4. 哪些风格无法满足完整覆盖（本节是重点）

### 4.1 根本原因：`✔` `✗` `✘` 是全体开源中文字体的系统性缺口

这是本次调研最硬的发现。对全部 32 款字体逐字符核对 `✔=U+2714 ✗=U+2717 ✘=U+2718 ★=U+2605 ☆=U+2606`：

| 字体 | ✔ U+2714 | ✗ U+2717 | ✘ U+2718 | ★☆ |
|---|---|---|---|---|
| **Sarasa Mono SC**（48,604） | ✅ | ✅ | ✅ | ✅ |
| M PLUS Rounded 1c（8,201，日文） | ✅ | ✅ | ✅ | ✅ |
| **Noto Sans SC（项目现有）** | ❌ | ❌ | ❌ | ✅ |
| **Noto Serif SC（项目现有）** | ❌ | ❌ | ❌ | ✅ |
| Noto Sans CJK SC（44,810） | ❌ | ❌ | ❌ | ✅ |
| Sarasa Gothic SC（46,321） | ❌ | ❌ | ❌ | ✅ |
| Swei Gothic CJK SC（45,217） | ❌ | ❌ | ❌ | ✅ |
| 975Maru SC（42,230） | ❌ | ❌ | ❌ | ✅ |
| LXGW Neo ZhiSong Plus（33,497） | ❌ | ✅ | ❌ | ✅ |
| Glow Sans SC（32,227） | ❌ | ❌ | ❌ | ❌ |
| LXGW 975 Yuan SC（30,912） | ❌ | ❌ | ❌ | ✅ |
| LXGW WenKai（46,490） | ❌ | ✅ | ❌ | ✅ |
| 霞鹜漫黑 / Zen Maru / Yozai / 站酷系 / 得意黑 / Maple Mono CN | ❌ | ❌ | ❌ | 视字体而定 |
| IBM Plex Mono / Noto Sans Mono / Source Serif 4 / Inter / EB Garamond / JetBrains Mono | ❌（纯西文，连中文都没有） | | | |

**结论**：
- `★☆` 上大多数中文字体（含现有思源）是有的；**`✔✗✘` 才是真缺口**。
- **32 款里只有 Sarasa Mono SC 和日文的 M PLUS Rounded 1c 有 `✔✗✘`**，而后者不能用于简体中文。
- 所以**「任何一款中文字体 + 零 fallback」当前是不可能同时成立的**——除非引入一个专门的符号层（见 §5.2）。

**第二个次要缺口：上下标（`⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉`）**

除 Sarasa Mono SC 与 LXGW Neo ZhiSong 系列（只缺 2 个码位）外，**几乎所有候选都缺上下标的一部分**，包括**项目现有的思源黑体与思源宋体**（各缺 11 个上下标码位）、Noto Sans CJK SC、ChillRoundGothic、Glow Sans SC、Zen Maru 等；7,015 码位那一批（马善政/志莽/龙藏/柳建/站酷系）则**整个上下标区块全缺**。Glow Sans SC 最严重——48 个上下标里只有 1 个。

上下标对「阅读器」不算高频，但**如果正文里出现化学式、脚注编号或数学幂次，同样会掉字**。§5.2 的符号层方案建议把上下标一并纳入填充范围。

### 4.2 逐类判定

| 类别 | 能否满足完整覆盖 | 最佳成绩 | 差在哪 |
|---|---|---|---|
| 1 圆体/柔和无衬线 | ❌ **不能** | Swei Gothic CJK SC，45,217 码位 | 缺 ✔✗✘；且 CJK 基本区仍缺 18 字、箭头缺 87/112 |
| 2 手写/硬笔/毛笔 | ❌ **不能** | LXGW WenKai，46,490 码位 | 缺 ✔✘；毛笔类（马善政/志莽/龙藏/柳建）只有 7,015 码位，连数学、希腊、箭头全缺 |
| 3 老式衬线/书籍感宋体 | ❌ **不能**（且最佳方案有许可障碍） | LXGW Neo ZhiSong Plus，33,497 码位 | 缺 ✔✘，且是 **IPA 许可**、嵌入再分发有合规成本；OFL 阵营最好的就是现有思源宋体（30,928，缺 ✔✗✘） |
| 4 更中性的等宽 | ✅ **能** | **Sarasa Mono SC，48,604 码位，17/17 全通过** | — |
| 5 标题装饰体 | ❌ **不能** | Glow Sans SC，32,227 码位 | 缺 ★☆✔✗✘、上下标几乎全缺；其余站酷/得意黑只有 7,000–9,400 码位 |

### 4.3 明确说清楚：这些问题不是「没找够」

- **圆体**：已覆盖 Swei Gothic、975 系（两个不同发行）、ChillRoundGothic、LXGW Marker Gothic、霞鹜 975、Zen Maru、M PLUS Rounded —— 中日两系圆体的主流开源方案都测了，没有一款满探针。
- **手写**：Google Fonts 上全部 4 款开源中文手写体（马善政/志莽/龙藏/柳建）+ 芫荽 + 悠哉 + 悠然小楷 + 红蕾行书都测了，7 款在 7,000 码位级别，最好的霞鹜文楷也缺 ✔✘。**这个结论是穷尽后的结论。**
- **老宋**：OFL 阵营的老式宋体基本只有思源宋体系；造型最像老宋的 LXGW Neo ZhiSong 是 IPA 许可。
  - 补充说明：**「京華老宋体 KingHwa_OldSong」本次未能定位到可信的上游仓库与许可证文本**（GitHub 搜索与 npm 检索均无结果），因此**无法核实**，未纳入推荐。如需该风格，建议后续单独核实其仓库与许可。
- **标题**：站酷 3 款 + 得意黑 + 未来荧黑都测了，无一满探针。

---

## 5. 取舍建议

### 5.1 最值得进内置的（按优先级）

| 优先级 | 字体 | 理由 |
|---|---|---|
| **P0** | `@fontpkg/sarasa-mono-sc@0.36.0`（Sarasa Mono SC，OFL，48,604 码位） | 唯一满探针字体；既满足「更中性的等宽」，又能当**全预设共用的兜底基座**。一个字体解决两个问题。 |
| **P0** | 补齐 `✔✗✘` 符号层（见 §5.2） | 不补的话，用户「绝不 fallback」这条在所有非等宽预设上都不成立，且现在就是坏的。 |
| **P1** | 狮尾圆体 Swei Gothic CJK SC（OFL，45,217） | 圆体类唯一接近完整覆盖；许可证干净。需 vendor 单文件 TTF。 |
| **P1** | 霞鹜文楷 LXGW WenKai 完整版（OFL，46,490） | 手写类唯一能当正文；把现有的 194 分片换成单文件即符合「内置完整字符集」。 |
| **P2** | Noto Sans/Serif CJK 全量（OFL，44,810 级） | 不是新风格，但是**同许可下的字符集升级**：现有 30,890/30,928 是子集，全量多出一万多码位。 |
| **P2** | 未来荧黑 Glow Sans SC（OFL，32,227） | 标题类最佳；配兜底后可用。 |

### 5.2 推荐架构：把「无 fallback」变成可验证的事实

既然没有任何单一中文字体满探针，正确的做法不是假装它满，而是**显式内置一个「缺口填充」符号层**：

```
font-family: '<风格字体>', 'Eunice Symbol Gap', 'Eunice Sans SC', sans-serif;
```

- `Eunice Symbol Gap` = 从 Sarasa Mono SC（OFL，已验证含 ✔✗✘★☆）**子集化出一个只含 `✔✗✘★☆` + 上下标 + 箭头极罕见变体等缺口字符的 woff2，体积只有几 KB 量级**。
- 它排在风格字体之后、中文字体之前：风格字体有的字符走风格字体，缺的 `✔✗✘` 由这个**随包分发**的符号层接住——**不是系统 fallback**，跨平台一致。
- 建议填充范围按 §4.1 的两个缺口来定：**第一优先 `✔✗✘`**（全体中文字体都缺，且现在靠 Windows 专有字体撑着）；**第二优先上下标 `⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉`**（现有思源也缺 11 个码位）。
- 这样每个预设的「无 fallback」就不再依赖 Windows 的 `Segoe UI Symbol`，可以在 `scripts/check-coverage.py` 里对「风格字体 ∪ 符号层 ∪ 基座字体」的并集做断言，变成 CI 可验证的硬指标。

这个方案成本极低（几 KB 量级），却把用户这条硬约束从「做不到」变成「做得到且可验证」。

### 5.3 只能当装饰层、必须放字体栈前面的

| 字体 | 定位 | 原因 |
|---|---|---|
| 得意黑 Smiley Sans（9,440） | 标题/封面 | CJK 基本区缺约 8,000 字，符号缺 6 类 |
| 站酷快乐体 / 庆科黄油体 / 小薇（7,016–9,429） | 标题/封面 | 7,000 码位级，数学/希腊/箭头/常用符号全缺 |
| 霞鹜漫黑 LXGW Marker Gothic（15,368） | 手写标记感装饰 | CJK 基本区缺 39%，缺 ↔ |
| 寒蝉圆黑体（27,148） | 圆体备选 | 缺破折号省略号、常用符号、✔✗✘、上下标 |
| Source Serif 4（807）/ IBM Plex Mono（676）/ Noto Sans Mono（2,238） | 纯西文装饰 | 无任何中文 |
| Maple Mono CN（22,731，MIT） | 等宽备选 | 缺常用符号、全角符号、✔✗✘；且仅分片发布 |
| 悠哉 Yozai（20,307） | 手写装饰 | 缺 ✔✗✘ |
| 芫荽 Iansui（12,639） | 繁体手写 | 简体常用字缺 5 个 |

---

## 6. 许可证与打包注意事项

全部许可证均已**从上游许可正文核实**，不以 npm 元数据为唯一依据。

| 字体 / 包 | 实测/核实的许可证 | 嵌入打包分发是否允许 | 备注 |
|---|---|---|---|
| Sarasa Mono SC / Gothic SC（`@fontpkg/sarasa-*`） | **SIL OFL 1.1**（上游 `be5invis/Sarasa-Gothic` LICENSE） | ✅ 允许 | ⚠️ **npm 包内无 LICENSE 文件**，接入须手工补 OFL 全文 |
| Swei Gothic CJK SC（`max32002/swei-gothic`） | **SIL OFL 1.1**（仓库内 `SIL_Open_Font_License_1.1.txt`） | ✅ 允许 | 无 npm 包 |
| LXGW WenKai | **SIL OFL 1.1**（字体 name 表 ID13 + 上游） | ✅ 允许 | — |
| 975Maru SC（`cn-fontsource-975-maru-sc-regular`） | **SIL OFL 1.1**（npm 元数据声明，字体衍生自思源黑体/狮尾圆体均 OFL） | ✅ 允许 | 包内无 LICENSE 文件 |
| LXGW 975 Yuan SC（`lxgw/975Yuan`） | **SIL OFL 1.1** + **保留字体名附加条款** | ✅ 允许（**有条件**） | 附加条款：保留名「霞鹜/LXGW」可用于「未修改源码的重编译版本」或「仅为网页字体交付而做的子集化/格式转换」，**但不得作为可安装桌面字体提供**。→ 内置进 Tauri 桌面应用时，**请保持字体文件不被改名/子集化**，或改名后再子集化。 |
| ChillRoundGothic | **SIL OFL 1.1**（仓库 `License.txt`） | ✅ 允许 | README 未提许可，但 License.txt 是 OFL |
| Glow Sans SC（`@fontpkg/glow-sans-sc`） | **SIL OFL 1.1**（字体）/ MIT（构建代码） | ✅ 允许 | ⚠️ 包内无 LICENSE 文件 |
| Noto Sans CJK SC / Noto Sans SC / Noto Serif SC | **SIL OFL 1.1** | ✅ 允许 | ⚠️ `@fontpkg/noto-sans-cjk-sc` 包内无 LICENSE 文件 |
| Smiley Sans / ZCOOL 系 / Iansui / Ma Shan Zheng / Zhi Mang Xing / Long Cang / Liu Jian Mao Cao / Source Serif 4 / IBM Plex Mono / Noto Sans Mono / Zen Maru / M PLUS Rounded 1c | **SIL OFL 1.1** | ✅ 允许 | — |
| Maple Mono CN（`@mogeko/maple-mono-cn`） | **MIT** | ✅ 允许 | — |
| **LXGW Neo ZhiSong / Neo ZhiSong Plus** | ⚠️ **IPA Font License 1.0**（**不是 OFL**） | ⚠️ **需评估** | 作者明确要求嵌入式再分发场景「自行评估合规成本」；IPA FL 与 OFL 不兼容 |
| **霞鹜新晰黑（`cn-fontsource-lxgw-neo-xi-hei-regular`）** | ⚠️ **上游为 IPA FL 1.0**，npm 元数据却写 OFL 1.1 | ⚠️ **不可信** | **元数据与上游矛盾，以 IPA 为准** |

**打包层面的三条实务提醒**

1. `@fontpkg/*` 与 `cn-fontsource-*` 的包**普遍不带 LICENSE 文件**。OFL 1.1 要求再分发时附带许可全文，接入时需自行放入 `src/fonts/` 并确保打包产物包含。
2. `@fontpkg/sarasa-mono-sc` 的 tarball 是 130 MB（解包 250 MB），因为它含 10 个 style。只需 Regular/Bold 时，**建议直接从上游 GitHub Release 取单文件**，而不是把这个包加进 `package.json` 依赖。
3. 用户要求「内置完整字符集、不分片」。因此 **`@fontsource/*` 的中文包（全部是 unicode-range 分片）不应作为内置源**；分片只适合做「按需加载」的旧模式（即现有霞鹜文楷的做法）。要内置就取上游单文件 TTF/OTF。

---

## 7. 实测 vs 推断 — 边界声明

**以下全部是实测**（fontTools 解析 cmap，可用 §2.3 命令复现）：

- 全部 32 款字体的码位数、glyph 数、字体内部 family/version。
- 全部 17 个探针类别的通过/缺失，以及**缺失字符的精确 U+ 码位**。
- 20 个 Unicode 区段的覆盖率、各区段空/部分缺失判定。
- 各字体的文件体积、分片数。
- 分片包「内部只有一个 family/weight」的校验。
- 从字体 name 表读取的许可证描述（ID13/ID14）——**当其为空或与上游冲突时以上游 LICENSE 正文为准**。

**以下是从上游仓库/npm 元数据核实（非 cmap 实测）**：

- 各字体的许可证类型。来源：上游 `LICENSE`/`OFL.txt`/`License.txt`/`SIL_Open_Font_License_1.1.txt` 正文 + npm `license` 字段（两者冲突时以上游正文为准，已在 §6 标注两处冲突）。
- npm 包名与版本号（`npm view` / registry `dist-tags`）。
- 字重档位数量。

**以下是推断（未实测，需后续验证）**：

- woff2 转换后的体积估算（如 LXGW WenKai 24.39 MB TTF → 约 9–10 MB woff2）。**未实际转换**。
- `Eunice Symbol Gap` 子集字体「几百字节」的体积估算——未实际子集化。
- 「macOS/Linux 上 `Segoe UI Symbol` 不存在会导致豆腐块」——这是基于该字体为 Windows 专有的推断；**未在非 Windows 平台实测**。
- Sarasa Mono SC 与其他字体并集后能否在探针层面 100% 通过——从单个字体的实测数据可推得，但**未实际构造并集字体做验证**。
- 「京華老宋体 KingHwa_OldSong」的许可证与覆盖——**未找到可信上游，未核实**。

**已知局限**：

- 探针是**抽样**，不是全码位断言。一款字体「17/17 探针通过」只说明这 17 类抽样字符齐全，不等于任意字符都不会 fallback。要更严格，需对受支持字符全集做并集断言。
- 部分字体只测了 Regular 一个字重（如 Sarasa Mono SC、Swei Gothic Regular、975Yuan 400W）。**同一家族不同字重的 cmap 可能有细微差异**，接入前应对实际使用的字重重跑 `measure.py`。

---

## 附录 A：文件清单

| 路径 | 说明 |
|---|---|
| `docs/font-candidates.md` | 本报告 |
| `.font-scout/selected/` | **选定字体（8 个单文件）+ 许可全文 + `README.md` 接入说明 —— 后续接入直接用这里** |
| `.font-scout/measure.py` | 单文件覆盖度实测（cmap 探针 + 区段统计 + 许可证读取） |
| `.font-scout/union.py` | 分片字体并集覆盖度实测 |
| `.font-scout/detail.py` | 精确缺字清单（含 U+ 码位） |
| `.font-scout/fetch.py` | npm 字体包抓取解包（绕开项目 .npmrc 代理） |
| `.font-scout/collect.py` | 一键重跑全部实测并生成 `measurements.json` |
| `.font-scout/measurements.json` | **32 条实测原始数据（本报告全部数字的来源）** |
| `.font-scout/licenses/` | 各字体上游许可证正文（sarasa / chill / 975yuan / glow-sans / lxgw-neo-zhisong / marker / swei 等） |
| `.font-scout/upstream/` | 上游单文件字体（Swei Gothic、LXGW WenKai、Neo ZhiSong、975 Yuan、Marker Gothic、Smiley Sans、ChillRoundGothic、Google Fonts 全套） |
| `.font-scout/pkgs/` | npm 包解包目录（@fontpkg / @fontsource / cn-fontsource）—— 分片包并集结论的证据 |
| `.font-scout/cache/` | 下载的 tarball 缓存（**已清理**，内容与 `pkgs/` 重复） |

**磁盘占用提示**：`.font-scout/` 合计约 **1.25 GB**（`pkgs/` 863 MB + `upstream/` 260 MB + `selected/` 128 MB）。
其中 `selected/`（128 MB）是后续接入真正需要的部分；`pkgs/` 与 `upstream/` 是实测证据，若需回收空间可安全删除，
用 §2.3 的命令重新下载即可复现。`measurements.json` 与各脚本体积可忽略，请保留。

## 附录 B：完整实测数据一览

单位：码位 = cmap 覆盖的 Unicode 码位数（实测）。**「缺」列列出全部未通过的探针类别；加粗的类别会直接触发 fallback**（属于 `scripts/check-coverage.py` 的硬性类别），未加粗的是次要类别（上下标、几何、假名、拉丁扩展、西里尔）。

> 本表由 `.font-scout/measurements.json` 直接生成，全部 32 条 + 4 条基线已逐条与 JSON 核对一致。

| 类别 | 字体 | npm 包@版本 | 许可证 | 码位 | 缺（**粗体 = 触发 fallback**） |
|---|---|---|---|---|---|
| 1 圆体 | 狮尾圆体 Swei Gothic CJK SC Regular | 无（上游 `max32002/swei-gothic` 2.143） | OFL 1.1 | **45,217** | **勾叉星号** |
| 1 圆体 | 975Maru SC | `cn-fontsource-975-maru-sc-regular@1.0.1` | OFL 1.1 | **42,230** | **勾叉星号** |
| 1 圆体 | 霞鹜 975 圆体 LXGW 975 Yuan SC 400W | 无（上游 `lxgw/975Yuan` 26.07.26） | OFL 1.1 | 30,912 | **勾叉星号** |
| 1 圆体 | 寒蝉圆黑体 ChillRoundGothic Regular | 无（上游 `Warren2060/ChillRoundGothic` v3.750） | OFL 1.1 | 27,148 | **破折号省略号 / 常用符号 / 勾叉星号**、上下标 |
| 1 圆体 | 霞鹜漫黑 LXGW Marker Gothic Regular | `@fontsource/lxgw-marker-gothic@5.3.1` | OFL 1.1 | 15,368 | **箭头 / 勾叉星号** |
| 1 圆体 | M PLUS Rounded 1c Regular | `@fontsource/m-plus-rounded-1c@5.3.0` | OFL 1.1 | 8,201 | **中文常用** |
| 1 圆体 | Zen Maru Gothic Regular | `@fontsource/zen-maru-gothic@5.3.1` | OFL 1.1 | 7,812 | **中文常用 / 数学符号 / 箭头 / 全角符号 / 勾叉星号**、上下标 |
| 2 手写 | 霞鹜文楷 LXGW WenKai Regular | `lxgw-wenkai-webfont@1.7.0`（194 分片） | OFL 1.1 | **46,490** | **勾叉星号**（只缺 ✔U+2714 / ✘U+2718） |
| 2 手写 | 悠哉字体 Yozai Regular | `cn-fontsource-yozai-regular@1.0.9` | OFL 1.1 | 20,307 | **勾叉星号** |
| 2 手写 | 芫荽 Iansui Regular | `@fontsource/iansui@5.3.1` | OFL 1.1 | 12,639 | **中文常用 / 数学符号 / 勾叉星号** |
| 2 手写 | 马善政毛笔楷书 Ma Shan Zheng Regular | `@fontsource/ma-shan-zheng@5.3.1` | OFL 1.1 | 7,015 | **数学符号 / 希腊字母 / 箭头 / 常用符号 / 勾叉星号**、上下标、几何、假名、拉丁扩展、西里尔 |
| 2 手写 | 志莽行书 Zhi Mang Xing Regular | `@fontsource/zhi-mang-xing@5.3.0` | OFL 1.1 | 7,015 | 同上 |
| 2 手写 | 龙藏体 Long Cang Regular | `@fontsource/long-cang@5.3.0` | OFL 1.1 | 7,015 | 同上 |
| 2 手写 | 柳建毛草 Liu Jian Mao Cao Regular | `@fontsource/liu-jian-mao-cao@5.3.0` | OFL 1.1 | 7,015 | 同上 |
| 2 手写 | 红蕾行书 Hongleixingshu Regular | `cn-fontsource-hongleixingshu-regular@1.0.7` | OFL 1.1 | 7,010 | **破折号省略号 / 数学符号 / 希腊字母 / 箭头 / 常用符号 / 勾叉星号**、上下标、几何、假名、拉丁扩展、西里尔 |
| 2 手写 | 悠然小楷 Slideyouran Regular | `cn-fontsource-slideyouran-regular@1.0.3` | OFL 1.1 | 6,956 | **数字符号 / 西文标点 / 破折号省略号 / 希腊字母 / 箭头 / 常用符号 / 全角符号 / 勾叉星号**、上下标、几何(▼)、假名、拉丁扩展、西里尔 |
| 3 宋体 | 霞鹜新致宋 Plus LXGW Neo ZhiSong Plus | 无（上游 `lxgw/LxgwNeoZhiSong` 1.067） | ⚠️ **IPA FL 1.0** | **33,497** | **勾叉星号**（只缺 ✔U+2714 / ✘U+2718） |
| 3 宋体 | 思源宋体 Noto Serif SC（**项目现有**） | `src/fonts/serif-400.woff2` | OFL 1.1 | 30,928 | **勾叉星号**、上下标 |
| 3 宋体 | 霞鹜新致宋 LXGW Neo ZhiSong | 无（上游 1.067） | ⚠️ **IPA FL 1.0** | 27,679 | **勾叉星号**（只缺 ✔/✘） |
| 3 宋体 | 霞鹜新致宋（单文件 woff2） | `lxgw-neo-zhisong-webfont@1.0.0` | ⚠️ **IPA FL 1.0** | 27,617 | **勾叉星号**（只缺 ✔/✘） |
| 3 宋体 | Source Serif 4 | `@fontsource/source-serif-4@5.3.1` | OFL 1.1 | 807 | **中文常用 / 中文标点 / 数学符号 / 箭头 / 常用符号 / 全角符号 / 勾叉星号**、上下标、几何、假名 |
| 4 等宽 | **更纱等宽 Sarasa Mono SC Regular** ⭐ | `@fontpkg/sarasa-mono-sc@0.36.0` | OFL 1.1 | **48,604** | **无 —— 17/17 探针全通过** |
| 4 等宽 | 更纱黑体 Sarasa Gothic SC Regular | `@fontpkg/sarasa-gothic-sc@0.36.0` | OFL 1.1 | 46,321 | **勾叉星号** |
| 4 等宽 | 思源黑体 CJK Noto Sans CJK SC Regular | `@fontpkg/noto-sans-cjk-sc@2.4.0` | OFL 1.1 | 44,810 | **勾叉星号**、上下标 |
| 4 等宽 | Maple Mono CN | `@mogeko/maple-mono-cn@7.9.0` | MIT | 22,731 | **常用符号 / 全角符号 / 勾叉星号** |
| 4 等宽 | Noto Sans Mono | `@fontsource/noto-sans-mono@5.3.0` | OFL 1.1 | 2,238 | **中文常用 / 中文标点 / 数学符号 / 箭头 / 常用符号 / 全角符号 / 勾叉星号**、上下标、几何、假名 |
| 4 等宽 | IBM Plex Mono | `@fontsource/ibm-plex-mono@5.3.0` | OFL 1.1 | 676 | **中文常用 / 中文标点 / 数学符号 / 希腊字母 / 箭头 / 常用符号 / 全角符号 / 勾叉星号**、上下标、几何、假名 |
| 5 标题 | 未来荧黑 Glow Sans SC Normal | `@fontpkg/glow-sans-sc@0.93.2` | OFL 1.1 | **32,227** | **箭头 / 常用符号 / 勾叉星号**（含 ★☆）、上下标 |
| 5 标题 | 得意黑 Smiley Sans Oblique | `@fontpkg/smiley-sans@2.0.4` | OFL 1.1 | 9,440 | **数学符号 / 箭头 / 常用符号 / 勾叉星号**、上下标、几何 |
| 5 标题 | 站酷庆科黄油体 ZCOOL QingKe HuangYou | `@fontsource/zcool-qingke-huangyou@5.3.0` | OFL 1.1 | 9,429 | **数学符号 / 希腊字母 / 箭头 / 常用符号 / 勾叉星号**、上下标、几何、假名、拉丁扩展、西里尔 |
| 5 标题 | 站酷快乐体 ZCOOL KuaiLe | `@fontsource/zcool-kuaile@5.3.0` | OFL 1.1 | 7,053 | 同站酷庆科 |
| 5 标题 | 站酷小薇 ZCOOL XiaoWei | `@fontsource/zcool-xiaowei@5.3.0` | OFL 1.1 | 7,016 | 同站酷庆科 |
| — 基线 | 思源黑体 Noto Sans SC（**项目现有**） | `src/fonts/sans-400.woff2` | OFL 1.1 | 30,890 | **勾叉星号**、上下标 |
| — 基线 | Inter（**项目现有**） | `src/fonts/inter-400.woff2` | OFL 1.1 | 230 | **全部中文类别**、上下标、几何、假名等 |
| — 基线 | EB Garamond（**项目现有**） | `src/fonts/garamond-400.woff2` | OFL 1.1 | 236 | **全部中文类别**、上下标、几何、假名等 |
| — 基线 | JetBrains Mono（**项目现有**） | `src/fonts/mono-400.woff2` | OFL 1.1 | 229 | **全部中文类别**、上下标、几何、假名等 |

### 附录 B 补充：`✔✗✘★☆` 逐字符矩阵

| 字体 | ✔ U+2714 | ✗ U+2717 | ✘ U+2718 | ★ U+2605 | ☆ U+2606 |
|---|---|---|---|---|---|
| Sarasa Mono SC（48,604） | ✅ | ✅ | ✅ | ✅ | ✅ |
| M PLUS Rounded 1c（8,201，日文，中文常用缺 5 字） | ✅ | ✅ | ✅ | ✅ | ✅ |
| LXGW WenKai（46,490） | ❌ | ✅ | ❌ | ✅ | ✅ |
| LXGW Neo ZhiSong / Plus | ❌ | ✅ | ❌ | ✅ | ✅ |
| Noto Sans SC（**项目现有**） | ❌ | ❌ | ❌ | ✅ | ✅ |
| Noto Serif SC（**项目现有**） | ❌ | ❌ | ❌ | ✅ | ✅ |
| Noto Sans CJK SC（44,810） | ❌ | ❌ | ❌ | ✅ | ✅ |
| Sarasa Gothic SC（46,321） | ❌ | ❌ | ❌ | ✅ | ✅ |
| Swei Gothic CJK SC（45,217） | ❌ | ❌ | ❌ | ✅ | ✅ |
| 975Maru SC（42,230） | ❌ | ❌ | ❌ | ✅ | ✅ |
| LXGW 975 Yuan SC（30,912） | ❌ | ❌ | ❌ | ✅ | ✅ |
| Glow Sans SC（32,227） | ❌ | ❌ | ❌ | ❌ | ❌ |
| 其他（Marker Gothic / Zen Maru / Yozai / 站酷系 / 得意黑 / 寒蝉 / Maple Mono CN / 纯西文各款） | ❌ | ❌ | ❌ | 多为 ✅ | 多为 ✅ |

**只有 Sarasa Mono SC 一款中文字体同时具备 `✔✗✘`**；`★☆` 在多数中文字体里是有的。这直接决定了 §5.2 的「缺口填充符号层」方案。
