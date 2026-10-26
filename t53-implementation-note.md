# t53 实施说明：启动浏览器时透传 workingDirectory（依据 C/t52 调研裁决）

> 执行人：A。范围：仅读 dsh-browser 源码 + 本说明文档；不重启 DSH、不杀 dsh node.exe（PID 5452）、不 vendor-edit harness。
> 依赖：t52 调研报告（根因 = Cordis 核心 get 陷阱，run_code 子 fiber 未注入 workingDirectory 服务）。

## 一、最终结论（dsh-browser 侧）

**dsh-browser 无需任何行为性代码改动。** 对原始设想「在启动浏览器时增加 args 设置 workingDirectory 以透传 configDir」经 t52 调研裁决为**不对症**，理由逐条如下。本任务按 captain 的 t53 方向校正，落地为「确认无补丁可做 + 给出中文实施说明」。

## 二、浏览器是否经 browser_call 启动？

**否。** 浏览器进程由 BrowserService 内部**懒加载启动**，跨调用复用，由 ctx.effect 在插件卸载时关闭：

- `src/browser-service.ts` —— BrowserService.launch() 执行 `pw.chromium.launch(launchOptions)`（约 L613-625 区域），仅在首次 ensureActivePage() 时触发。
- `src/index.ts` —— `apply()` 内 `new BrowserService(resolved)` + `ctx.effect(() => () => void service.close())`；构造期仅建立默认 AuthProfileStore，无 workingDirectory/configDir 引用。
- `browser_call`（或其 flat 投影）只是**派发某个 action**，本身不启动浏览器。

## 三、为什么「在启动浏览器加 args 设 workingDirectory」不对症

1. **报错的时机早于浏览器启动。** `cannot get property "workingDirectory" without inject` 来自 Cordis 核心 context 代理的 get 陷阱（`@deepseek-ai/cordis/src/reflect.ts:144` / `:159-161`），在「某 fiber 未声明/未激活该服务却读取它」的**服务解析层**就抛出，与浏览器是否启动无关。
2. **launch() 没有可接收 Cordis 服务注入的入口。** BrowserService.launch() 仅消费 Playwright 启动选项（`headless/channel/executablePath/args/cdpPort`，见 browser-service.ts 构造与 launch 段）。configDir 是每次 action 调用期（per-call）才解析并透传给 `transientContext(opts.configDir?)`，根本不进入 launch 的参数面。
3. **加 args 只能补 configDir，补不了 host inject 层缺失的 ctx 对象。** 即便在 args 里塞入一个 workingDirectory 字符串，也只是把 configDir 的来源从 `process.cwd()` 换成另一个目录；它**无法修复**「子工具 fiber 缺失 workingDirectory 服务导致 Cordis 守卫抛错」这条根因链。

## 四、dsh-browser 现有兜底逻辑（已正确，无需改）

`src/tools.ts`（actionContext 构造，约 L105-108）：

```ts
const wd = (ctx as any).workingDirectory
const configDir = wd?.get(exec?.agent?.session) ?? process.cwd()
```

- 用**可选链 + process.cwd() 兜底**：当 workingDirectory 服务不存在时（如 run_code 子 fiber），不会抛错，直接回退到 cwd。
- 该 configDir 已随每次调用透传进 ActionContext 与 transientContext，用于按调用解析 authProfiles/rulePacks 目录（与 authProfilesDirectory 对等模型一致）。
- `src/index.ts` inject 数组为 `["tools"]`，未声明 workingDirectory —— 缺失正是 Cordis 守卫命中场景，但 tools.ts 已用可选链规避，故 dsh-browser 自身不会因缺该服务而报错。

## 五、本会话（run_code 子 fiber）的正确调用路径

- 本会话的 run_code 经 ptc-runtime 为子工具建立独立执行 fiber，该 fiber 未携带 workingDirectory 服务（由 dsh-working-directory 插件在主 fiber 提供），触发 Cordis 守卫抛 `without inject`。
- 因此：**本会话无法驱动 browser_call**。需要浏览器自动化时，请走 **DSH Web GUI（http://127.0.0.1:3080）** 发起调用——GUI 跑在主 fiber，workingDirectory 服务已注入，可正常解析 configDir。
- 等价地：任何在主 fiber（而非 run_code 子 fiber）中执行的 dsh-browser 调用，均会命中 wd?.get(session) 拿到正确 configDir，无需改动。

## 六、彻底修复建议（超出 dsh-browser 权限，仅记录，不 vendor-edit）

若要从 harness 层面消除该报错，应在 **run_code / ptc-runtime 的子工具调度层**把 workingDirectory（及相关 fs 等服务）注入到子工具执行 fiber；或在 `dsh-tools` 的 run_code 解析层显式把当前会话目录经参数/上下文传给子工具，而非依赖子 fiber 直接读取 `ctx.workingDirectory`。

- 相关报错点：`dsh-tools/lib/index.js:2883-2884` `this.ctx.get("workingDirectory")`（缺失时抛 `dsh-tools: run_code with an Agent requires workingDirectory`）。
- 该修复属于 harness / dsh-tools 仓库，不在 dsh-browser 项目范围内，**本次不做**。

## 七、最终改动清单

- **源码（src/）**：无改动。现有 `?? process.cwd()` 兜底已是正确且充分的实现。
- **lib/**：无改动，无需重建（lib/tools.js 已含 workingDirectory 可选链 + process.cwd() 兜底，已校验为 true）。
- **文档**：仅新增本说明文档 `t53-implementation-note.md`，作为「dsh-browser 侧无补丁可做」的落地结论与后续 harness 修复建议记录。

> 现状约束遵守确认：本任务未重启 DSH、未杀 dsh node.exe（PID 5452），未修改 harness/dsh-tools。
