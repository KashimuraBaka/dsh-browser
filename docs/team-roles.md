# 团队角色与职责（dsh-browser 插件开发 / zedbbs 项目测试）

> 适用：所有涉及 dsh-browser 插件源码修改、cordis 配置、Profile / 规则包管理、
> 以及 zedbbs Vue 项目端到端测试 / 调试的任务，都应通过「团队任务」编排，
> 按下列角色拆分并分配。本文作为下次创建团队时的角色模板。

## 0. 全局约束（所有成员必须遵守）

- **绝不重启 DSH**：主进程 PID 13632（`node …/dsh/lib/bin.js web`，监听 3080）
  必须保持存活。任何配置 / 代码变更一律通过 HMR（重建 dsh-browser 的 `lib/` +
  触发 profile 重组）生效，**不得重启**。
- **文件行尾**：`src/`、`test/`、`README.md` 保持 CRLF；
  `cordis.patch.yml`、`*.json`、`package.json` 保持 LF。
- **审批**：本会话审批提示已禁用，不要请求 `sandbox_permissions`；文件策略 `danger-full-access`。
- **关键路径**：
  - 插件源码：`G:\dsh-plugins\dsh-browser`
  - DSH 安装：`D:\Software\nvm\v26.8.1\node_modules\@deepseek-ai\dsh\`
  - Web GUI：`http://127.0.0.1:3080`
  - 本地测试配置：`H:\Code\Vue\zedbbs-tampermonkey-vue3.0\tests\configs`
  - 知识库：`G:\dsh-plugins\dsh-browser\docs`
- **配置读取方式（重要变更）**：不再使用全局 `authProfilesDirectory` /
  `rulePacksDirectory`。统一通过「对话动作目录」——即 `ActionContext.configDir`
  （由 host 软注入 `workingDirectory`，缺失则回退 `process.cwd()`）——
  在**动作执行时**动态解析 authProfile 与 rulePack。

## 1. 角色定义

### 1.1 Captain / 协调员（captain）
- **职责**：把需求拆成 DAG；按角色分配任务；汇总各成员结果；决定 HMR 重建时机；
  全程确保 PID 13632 不重启。
- **输入**：用户需求。
- **输出**：任务计划、中文状态报告。
- **注意**：不亲手改源码细节，除非成员空缺时兜底。

### 1.2 Plugin 源码工程师（plugin-engineer）
- **职责**：修改 `dsh-browser/src` 下的 TypeScript。典型工作：
  - 在 `actions/types.ts` 的 `ActionContext` 增加 `configDir?: string` 字段；
  - 在 `tools.ts` 的 `actionContext(exec)` 中**软获取** `ctx.workingDirectory`
    （**禁止**写入硬 `inject` 数组，否则插件永久 pending 且无法不重启恢复），
    计算 `configDir = wd?.get(exec?.agent?.session) ?? process.cwd()`；
  - 在 `browser-service.ts` 的 `transientContext` / `ensureActivePage` /
    `open` / `render` / `snapshot` / `crawl` / `interact` /
    `runBuiltinScript` / `runUserscript` / 以及 `auth.list` / `auth.inspect`
    的 `opts` 增加 `configDir?` 并透传；当 `configDir` 存在时，执行期调用
    `resolveAuthProfilesFromDirectory(dir)` / `resolveRulePacksFromDirectory(dir)`
    动态解析，而非使用构造期的静态 `this.authProfiles` / `this.config.rulePacks`。
- **输入**：设计决策（如 configDir 透传方案）。
- **输出**：源码改动 + 重建 `lib/`（用 pnpm 全路径）。
- **注意**：保持 CRLF；改动后**必须重建 lib** 才能让 HMR 生效。

### 1.3 配置与 Profile 管理员（config-manager）
- **职责**：
  - 维护 `cordis.patch.yml`：移除 `defaultAuthProfile`、`authProfilesDirectory`、
    `rulePacksDirectory`（保留 `headless` / `automationMode` / `channel` / `viewport`）；
  - 管理 `tests/configs` 下的 `publish.json`（authProfile）、`bbs.json`（rulePack）、
    Cookie 载荷文件、`bbs-inject.init.js`；修正内部 `storageStatePath` /
    `initScriptPath` 指向 `tests/configs` 内部。
- **输入**：目录约定。
- **输出**：配置文件 + 路径修正记录。
- **注意**：LF 行尾；`bbs.json` 的 `initScriptSha256` 必须与 `bbs-inject.init.js` 内容一致。

### 1.4 文档知识库维护员（docs-maintainer）
- **职责**：把设计决策、团队角色、操作手册写入 dsh-browser 的 `docs/`（如本文件）。
- **输入**：变更摘要。
- **输出**：`docs/` 下 Markdown。

### 1.5 QA / HMR 验证员（qa-verifier）
- **职责**：验证 HMR 是否生效（profile 重组后插件可用）；用 `target.open` +
  `authProfile` / `rulePack` 跑端到端 smoke；检查 Cookie 注入、
  init 脚本把 `s.zombieden.cn` 代理到 Vite dev（`localhost:8080`）。
- **输入**：重建后的插件。
- **输出**：验证报告（成功 / 失败、截图路径）。
- **注意**：需 Vite dev server 运行；**不重启 DSH**。

### 1.6 逆向 / 接口分析员（analyst）
- **职责**：分析 zedbbs 站点接口、Cookie、SSO、规则包匹配逻辑；产出
  接口分析文档。
- **输入**：站点 / 网络抓包。
- **输出**：接口文档（`docs/` 下）。

## 2. 推荐团队创建参数

- 每个角色一个成员；`captain` 单独。
- 模型建议：`plugin-engineer` 用强代码模型；其余可用默认。
- 任务 DAG 示例（当前 dsh-browser 改造）：
  1. `config-manager` 迁移 `tests/configs` 四文件并修路径
     → 2. `plugin-engineer` 改源码 + 重建 `lib/`
     → 3. `docs-maintainer` 写角色文档 / 更新调试文档
     → 4. `qa-verifier` HMR 验收。

## 3. 当前可分配的团队任务种子（dsh-browser 改造）

- [ ] `ActionContext` 增加 `configDir` 字段（`actions/types.ts`）
- [ ] `tools.ts` 的 `actionContext(exec)` 软获取 `workingDirectory` 并算 `configDir`
- [ ] `browser-service.ts` 各方法 `opts` 透传 `configDir` + 执行期动态解析分支
- [ ] `cordis.patch.yml` 移除 `defaultAuthProfile` / `authProfilesDirectory` / `rulePacksDirectory`
- [ ] 迁移 `publish.json` / `bbs.json` / Cookie 载荷 / `bbs-inject.init.js` 到 `tests/configs` 并修路径
- [ ] 写 docs 知识库条目
- [ ] 重建 `lib/` 经 HMR（不重启 DSH）

## 4. 关联文档

- `docs/validation/`：插件校验报告。
