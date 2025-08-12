# Glow Dictionary — v0.3

在网页上基于**本地词典**高亮术语、短语与句子，鼠标悬浮显示卡片（翻译/词性/示例/语义场景）。支持**中英双语界面**、**右键快速加词**、**词库分版本（v0.2 / v0.3）**、**导入/导出自定义词库**，以及**一键静默**：在**当前域名**或**所有网站**对某个词不再提示。

---

## 特色功能

* **页面高亮 + 悬浮卡片**
  * 英文：长度优先的词边界匹配；中文：Trie + 最大匹配。
  * 独立 **Shadow DOM**，不受站点样式影响。
* **右键快速加词**（低输入）
  * 选中 → 右键 → 表单内**下拉/复选**减少输入量。
  * 自动按英文小写归一化存储。
* **分版本默认词库（v0.2 / v0.3）**
  * `v0.2`：四级常用，**words≈2000**；
  * `v0.3`：四级进阶，**words≈1500**；
  * 短语/句子按相近比例切分（可自定义）。
  * 在 Popup/Options 中选择版本与启用“单词/短语/句子”分类。
* **自定义词库**
  * 独立存储，支持 **导入/导出 JSON**，换设备直接迁移。
  * 右键加词默认写入自定义词库，不改动内置词库。
* **一键静默（v0.3 新增）**
  * 在提示卡右上角：
    * 🏷️ **站点静音**：仅当前**主域名**不再提示该词。
    * 🚫 **全局静音**：在**所有网站**不再提示该词。
  * 立即移除当前页所有命中，持久化保存。
* **多语言 UI**
  * 根据 `chrome.i18n.getUILanguage()` 自动使用**中文或英文**。

---

## 安装与试用

1. 克隆或下载本仓库，确保目录结构如下：

```pgsql
glow-dictionary/
├─ manifest.json
├─ background.js
├─ content.js
├─ content.css
├─ popup.html
├─ popup.js
├─ options.html
├─ options.js
└─ assets/
   └─ dicts/
      ├─ v0.2/{words.json, phrases.json, sentences.json}
      └─ v0.3/{words.json, phrases.json, sentences.json}

```

2. 打开 `chrome://extensions` → 开启**开发者模式** → **加载已解压的扩展程序** → 选择 `glow-dictionary`。
3. （可选）需要在 `file://` 页面生效：在扩展**详情**中勾选**允许访问文件网址**。

---

## 快速上手

* 工具栏点击 **Glow Dictionary** 图标 → Popup 里：
  * 开关：启用高亮
  * 版本：`v0.2` 或 `v0.3`
  * 分类：启用“单词/短语/句子”
  * 按钮：**打开设置（Options）**
* 网页内选中文本 → 右键 → **加入 Glow Dictionary 词典**
  * 尽量下拉/复选，无需大量手填。
* 悬浮卡右上角图标：
  * 🏷️ 本域隐藏该词
  * 🚫 所有网站隐藏该词

---

## 词库管理

### 默认词库（只读）

* 路径：`assets/dicts/<版本>/{words.json, phrases.json, sentences.json}`
* 在 **Popup/Options** 中选择版本与分类启用。

### 自定义词库（可编辑）

* 存储键：`gdCustomDict`（`chrome.storage.local`）
* 在 **Options** 中编辑/导入/导出：
  * 导出文件：`glow-custom-dictionary.json`
  * JSON 结构（示例）：

    ```js
    {
      "latency": {
        "translation": "延迟",
        "pos": "n.",
        "tags": ["技术"],
        "examples": ["Lower latency ensures smoother monitoring."],
        "scenes": "技术写作"
      }
    }

    ```
  * 英文键建议**小写**；中文原样。

---

## 大规模词库构建（CET-4 切分为 v0.2 / v0.3）

> v0.3 引入了**词库版本化**与**规模切分**。项目自带脚本将你的 CET-4 词表一键分配到两套版本与三类 JSON 中。

1. 准备 CSV（放到 `tools/input/`）：

   * `cet4_words.csv`、`cet4_phrases.csv`、`cet4_sentences.csv`
   * 列：`term,translation,pos,tags,examples,scenes`
   * 其中 `tags`/`examples` 可用英文分号 `;` 分隔多个值。
2. 运行脚本（Node 18+）：

   ```bash
   node tools/build_packs.js
   ```

   * 默认切分：
     * words：`v0.2=2000`、`v0.3=1500`
     * phrases：`v0.2=800`、`v0.3=600`
     * sentences：`v0.2=200`、`v0.3=150`
   * 修改数量：编辑 `tools/build_packs.js` 中的 `splitCounts`。
3. 输出覆盖到：

   ```bash
   assets/dicts/v0.2/*.json
   assets/dicts/v0.3/*.json
   ```

---

## 目录结构

```pgsql
glow-dictionary/
├─ manifest.json
├─ background.js            # 右键菜单、注入兜底、提示兜底
├─ content.js               # 匹配/高亮/卡片；加词面板；静音图标；版本化词库加载
├─ content.css              # 高亮样式（可按需调整）
├─ popup.html / popup.js    # 轻量开关：启用、版本、分类、打开 Options
├─ options.html / options.js# 启用项 + 自定义词库导入/导出/编辑
├─ assets/
│  └─ dicts/
│     ├─ v0.2/{words.json, phrases.json, sentences.json}
│     └─ v0.3/{words.json, phrases.json, sentences.json}
└─ tools/
   └─ build_packs.js        # 从 CSV 生成两套版本的三类 JSON

```

---

## 权限说明

* `storage`：读写本地词库与静音清单。
* `contextMenus`：右键“加入词典”。
* `activeTab`、`scripting`：在当前页注入脚本/样式（失败兜底）。
* `notifications`：当页面不可注入时发通知提示。
* `host_permissions: <all_urls>`：在更多站点上工作（仅需要时注入）。

> **隐私**：所有数据默认保存在你的浏览器本地（`chrome.storage.local`），扩展不发出网络请求（除非你自己引入外部数据源）。

---

## 常见问题

**Q: 提示“Receiving end does not exist”？**
A: 该页面可能不允许注入（如 `chrome://`、Chrome Web Store、内置 PDF 预览）。v0.3 已做注入兜底并给出 Toast/Badge/通知提示。

**Q: 导入的 JSON 没效果？**
A: 确认 JSON 顶层为对象、键为术语（英文小写），字段名与示例一致；导入后会即时生效，如未生效请刷新页面。

**Q: 站点静音/全局静音如何恢复？**
A: v0.3 已保存到本地（`gdMuteByDomain` / `gdMuteGlobal`）。v0.4 计划在 Options 增加**可视化管理**（查看/删除）。

---

## v0.3 变更日志

* **新增**：提示卡两个图标（🏷️ 当前域名静音；🚫 全局静音），即时移除并持久化。
* **新增**：词库**分版本**（`v0.2` / `v0.3`），Popup/Options 可切换；仅加载启用的“单词/短语/句子”。
* **新增**：`tools/build_packs.js` 脚本，按配置切分 CET-4 词表为两套版本、三类 JSON。
* **改进**：扫描与增量处理更稳健；注入失败的兜底提示更清晰。
* **保留**：右键快速加词、Shadow DOM 卡片、双语界面、自定义词库导入/导出。

---

## 路线图（节选）

* **v0.3.x**：Options 面板加入**静音清单管理**（导入/导出/单条恢复）。
* **v0.4**：视口扫描 + 分桶优化、就地编辑卡片内容、词形派生。
* **v0.5**：Worker 化与缓存、学习模式（SRS）、Anki/Quizlet 导出。

> 详见 `docs/ROADMAP.md`（如未创建，可向我索取模板）。

---

## 贡献

欢迎 Issue/PR：

* 请附复现链接、浏览器版本、控制台日志/Network 截图、样例词库或 CSV。
* 代码建议：ES2020+、零依赖为先；文档 Markdown；提交信息清晰。

— Happy reading with **Glow Dictionary v0.3** ✨
