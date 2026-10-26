# DSH 插件修复任务协作规约（ABC 并行 + 经 agent-team 完成）

> 适用：所有涉及 dsh-browser 插件源码修改、cordis 配置、Profile / 规则包管理、
> GUI 设置、隐藏/显示插件市场（dshmarket）等修复、分析、隐藏类任务。
> 本规约与 `docs/team-roles.md` 互为补充：本文件规定「谁来做、怎么做派发」，
> 后者规定各角色职责。

## 硬性要求（用户明确要求，必须执行）

1. **所有任务必须由当前 agent-team 的 A、B、C 三名成员并行完成。**
   - 不得由单名成员串行包揽全部修复/分析/隐藏工作；
   - 能并行的子任务（如「实现」与「文档/记忆」）应通过并行任务同时下发，
     而非等前序任务结束再派下一个。
2. **任何修复 / 分析 / 隐藏类任务都通过当前 agent-team（dsh-rulepacks-dynamic）派发。**
   - 队长（captain）只做调度与只读定位（读取文件、运行只读诊断、汇总结果）；
   - 队长**不直接改动代码，也不亲自做验证/测试**。
3. **禁止 captain 亲自做代码修改或验证**，统一走团队任务（claim → in_progress →
   completed/failed + 结构化 acceptanceResults/commandsRun）下发到 A/B/C。
4. **报告语言：中文。** 所有状态报告、记忆页、决策文档均用中文书写。

## 角色分工（与 dsh-rulepacks-dynamic 的 A/B/C 映射）

- **Captain（队长）**：拆 DAG、按角色分配、汇总、决定 HMR 重建时机；只读定位，
  不改码、不验证。
- **A / B / C（三名成员）**：并行承接具体任务。本团队中：
  - A：源码/配置实现 + 重建 `lib/`（如目录动态加载、字段移除、GUI 验证）；
  - B：GUI/前端实现 + 重建 `lib/`（如启用开关、布局/行高对齐、dshmarket 隐藏）；
  - C：测试桩/渲染测试对齐、单测回归、记忆与文档（本任务 t21 属此类）。
  （具体分工随任务而定，但始终保持 A/B/C 三人并行、各领一块。）

## 工作流程

1. 用户需求 → Captain 拆成可并行的子任务，写入 agent-team 任务列表。
2. 自动/手动派发：A、B、C 各自 `claim_task`，标记 `in_progress`，独立推进。
3. 每个任务完成后：提交 `acceptanceResults` + `commandsRun`（实现/修复类还需
   `changedPaths`），并向 captain 发送中文报告。
4. Captain 汇总，确认无重启 DSH、字段已移除、测试全绿，再整体收尾。

## 全局约束（重申，详见 team-roles.md）

- **绝不重启 DSH**（主进程 PID 13632 保持存活，变更走 HMR 重建 `lib/`）。
- 源码/测试保持 CRLF；JSON/YAML 保持 LF。
- 本会话审批已禁用，文件策略 `danger-full-access`，勿请求 sandbox 升级。

## 关联文档

- `docs/team-roles.md`：团队角色与职责模板。
- `docs/dshmarket-hide.md`：插件市场（dshmarket）显示机制与隐藏决策。
