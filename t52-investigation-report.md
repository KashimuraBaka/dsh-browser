# t52 调研报告：浏览器启动方式与 workingDirectory 注入缺口根因

## 一、结论速览
1. 浏览器不是由 browser_call 直接启动的。browser_call（或其 flat 投影）仅派发某个 action；浏览器进程在 BrowserService 内部懒加载启动，且跨调用复用，由 ctx.effect 关闭。
2. 报错 cannot get property "workingDirectory" without inject 的根源不在 dsh 主包，也不在 dsh-browser。它来自 Cordis 核心的 context 代理 get 陷阱（@deepseek-ai/cordis）。这是 Cordis 的服务解析守卫，在“某 fiber 未声明/未激活该服务却读取它”时抛错。
3. run_code 子工具路径缺失 inject：run_code 经 ptc-runtime 为子工具创建独立执行 fiber；workingDirectory 由 dsh-working-directory 插件在主 fiber 提供，但子工具插件自身的 Cordis fiber 并未携带该服务，触发守卫抛错。
4. workingDirectory / configDir 均为“每次调用”解析，非浏览器启动期。启动浏览器的 launch() 完全不依赖 workingDirectory。
5. “在启动浏览器时增加 args 设置 workingDirectory”对该症状无效（不对症）。抛错发生在工具派发的 Cordis 服务解析层，早于/独立于浏览器启动；而 launch() 也无可接收 Cordis 服务注入的启动参数。正确修复应在 harness 的 run_code/ptc-runtime 调度层把 workingDirectory 注入子工具 fiber。

## 二、关键证据（file:line）
- 启动链（懒加载、复用、effect 关闭）：
  - G:\dsh-plugins\dsh-browser\src\browser-service.ts:613-625 — launch() 执行 pw.chromium.launch(launchOptions)；只读 headless/channel/executablePath/args/cdpPort，与 workingDirectory 无关。
  - browser-service.ts:442 构造期建立默认 AuthProfileStore；:1049 ensureActivePage() 首次调用才触发启动；:672/676-677 transientContext(opts.configDir?) 按调用透传 configDir。
  - G:\dsh-plugins\dsh-browser\src\index.ts — apply() 内 new BrowserService(resolved) + ctx.effect(() => () => void service.close())；无 workingDirectory/configDir 引用。
- 报错根因（Cordis 守卫）：
  - D:\Software\nvm\v26.8.1\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\cordis\src\reflect.ts:144 new Error(`cannot get property "${prop}" without inject`)
  - reflect.ts:159-161 当 prop in fiber.inject 时改写为 cannot get required service "${prop}" in inactive context 并抛出。
  - 编译产物 cordis\lib\index.js:676 / :688 同逻辑；web-frontend 打包版 index-*.js 亦有同款字符串。
- dsh-browser 自身已优雅降级（不会因缺失 workingDirectory 抛错）：
  - G:\dsh-plugins\dsh-browser\src\tools.ts:105-108 — const wd = (ctx as any).workingDirectory; const configDir = wd?.get(exec?.agent?.session) ?? process.cwd()（可选链 + cwd 兜底，无 throw）。
  - index.ts:32 — export const inject = ["tools"]（未注入 workingDirectory；缺失该项时正是守卫命中场景）。
- workingDirectory 提供方与 run_code 解析：
  - D:\...\dsh-working-directory\lib\index.js:25 super(ctx, "workingDirectory")（主 fiber 注册）；:76-77 get(session)。
  - D:\...\dsh-tools\lib\index.js:2883-2884 — this.ctx.get("workingDirectory")，缺失则抛 dsh-tools: run_code with an Agent requires workingDirectory（另一处相关报错，同一注入缺口）。
- ptc-runtime 子工具调度（注入缺口所在层）：
  - D:\...\dsh-ptc-runtime-node\lib\process.js 与 dsh-ptc-runtime\lib：run_code 子工具在独立 fiber 执行；该 fiber 未携带 workingDirectory 服务 → 守卫抛 without inject。

## 三、对“在启动浏览器增加 args 设置 workingDirectory”的评估
- 不对症。理由：(a) 抛错发生在子工具 fiber 的 Cordis 服务解析阶段，早于浏览器启动；(b) BrowserService.launch() 仅接收 Playwright 启动选项（headless/channel/executablePath/args/cdpPort），没有把 Cordis 服务注入子 fiber 的入口；(c) dsh-browser 自身已对缺失 workingDirectory 做了 ?? process.cwd() 兜底，本不该抛错——真正抛错的是 run_code 派发路径里由 ptc-runtime 建立的子 fiber。
- 建议修复方向：在 harness 的 run_code / ptc-runtime 子工具调度层，将 workingDirectory（及 fs 等相关服务）注入到子工具执行 fiber；或在 dsh-tools 的 run_code 解析层显式把当前会话目录经参数/上下文传给子工具，而非依赖子 fiber 直接读取 ctx.workingDirectory。

## 四、范围声明
本次为只读调研，未修改任何源码或文档。cordis.patch.yml 当前无 browser 配置块、config.ts 无三项被移除字段（与 t47 结论一致，与此任务不冲突）。