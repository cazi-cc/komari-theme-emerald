<h3 align="center"> Komari Emerald Cazi </h3>
<p align="center">
基于 Komari Emerald 定制的 Komari Monitor 多任务监控主题
</p>

![preview](/docs/preview.png)

## 使用

### 远程导入

1. 登录 Komari 后台，进入 `设置` → `主题管理`
2. 点击 `导入主题`
3. 输入 `https://github.com/cazi-cc/komari-theme-emerald`
4. 检测完成后确认导入，并将 `Emerald-Cazi` 设为当前主题

### ZIP 上传

也可以从 [Release 页面](https://github.com/cazi-cc/komari-theme-emerald/releases) 下载最新的
`komari-theme-emerald.zip`，再通过后台的 `上传主题` 安装。

## 定制功能

- 每个节点可独立选择、排序最多 8 个首页延迟监测任务
- 首页直接显示 Komari 延迟监测任务名称，延迟在左、丢包在右
- 首页卡片统一任务行数可在 1–8 行之间自定义，无数据和未配置位置以 `--` 占位
- 首页卡片延迟/丢包统计范围可自定义为 1–168 小时，固定 10 格均匀覆盖完整范围；所有卡片共享查询，刷新间隔按范围从 1 分钟逐步放宽到 15 分钟
- 首页、节点详情和线路对比统一读取后端时间窗统计：丢包率按 `ping.loss` 样本数加权，延迟统计排除失败哨兵值；降采样条形图和趋势图只负责可视化，不再参与总览数值计算
- 已删除或已取消分配的首页任务会自动清理，卡片对应位置恢复显示“未配置”
- 独立的 Emerald 后台设置面板支持节点任务、颜色、阈值、图表和原主题设置，直接继承 Komari 后台原生明暗模式与配色变量
- 后台“最近访客”按需分页显示访问时间、来源 IP、页面和浏览器；记录仅管理员可见并由 Komari 自动保留 30 天
- 访客设备浮条只在浏览器本机识别设备与浏览器，不再把访客 IP 发送给第三方定位服务
- 节点详情提供默认可见的任务分析面板，并支持 1 小时至 7 天、双轴合图/分图、缩放、异常阈值、自动刷新及 PNG/CSV 导出
- 详情数据采用浏览器短时缓存和请求合并，后台标签页暂停自动刷新
- 最优延迟和最低丢包默认使用醒目的 `#5EEAA6`，下一档使用 `#47B592`，并允许自定义
- 节点名称下方单独显示公开备注
- 首页提供“线路对比”“TCP 质量”“ChatGPT 解锁线路”三个等高分析入口，桌面端三列、手机端三行，均使用主题绿呼吸光；可在 Emerald 设置中逐项显示、隐藏和排序
- 线路对比包含节点排名、P0.5-P99.5 主要波动区间、延迟/丢包散点、多节点趋势和指标明细
- 公开线路对比和静态分析缓存仅显示任务名称，不包含被监测目标的 IP 地址或域名
- “同任务网络质量对比指数”综合丢包、P50、P95、波动和数据覆盖率，权重与门槛可配置
- 评分模型 v2 默认使用 `40 / 30 / 25 / 3 / 2` 权重和 `95 / 85 / 70` 评级门槛，波动率改为固定尺度，避免放大组内很小的差异
- 延迟区间默认展示覆盖约 99% 有效样本的 P0.5-P99.5，并在内部高亮 P50-P95；散点悬停或轻触可查看节点名称、公开备注和完整指标
- 桌面端统计卡片与左右分析栏使用同一网格中线和统一间距
- 丢包次数和样本数来自 Komari 完整聚合计数，趋势图降采样不会抹去总览中的偶发丢包
- 线路对比新增按需“探测诊断”，展示网络可达率、HTTP 状态合格率、最小–最大延迟、大小包样本、DNS/TCP/TLS/TTFB 与连接级 TCP 重传
- 探测诊断只查询后端 5 分钟浏览器缓存的汇总指标，不会因访客打开页面触发主动探测
- 服务器端定期生成共享静态缓存，访客不会重复触发全量统计
- 修正首页统一行数滑块与 1–8 刻度的中心对齐
- 新增任务优先的“TCP 连接质量”分析页，按省份、运营商和 IP 版本比较不同节点的 SYN 首包丢失、P50、P95、趋势与目标明细
- TCP 质量页和公开接口只展示测试目标标签，不返回目录中的 IP、域名或端口
- TCP 综合分可同时纳入 ICMP、标准 SYN 和实验性大小包；默认权重、丢失率封顶保护、评级门槛、最少运行次数与覆盖率均可在 Emerald 设置中调整并恢复推荐值
- TCP 统计由 Komari 后台每 5 分钟预计算固定快照，打开分析页不会触发主动探测或全量聚合
- 新增“ChatGPT 解锁线路”分析页，以节点实际系统 DNS 发起真实 HTTPS 请求，覆盖 DNS、Smart DNS 规则、内部入口及其后方代理出口的完整链路
- 高频检测默认每 60 秒仅检查主 Web 链路，完整校验默认每 15 分钟检查 Web、认证、API、静态资源和 Cloudflare 路由；对照 DNS 与固定入口诊断默认关闭
- 解锁线路评分由解锁状态 40%、HTTPS 成功率 25%、TTFB 20%、TCP 与 TLS 10%、稳定性 5% 组成，并对部分可用、地区受限、失败率异常设置封顶保护
- 解锁分析提供节点排名、TTFB/失败率分布、最小/P50/P95/最大趋势、出口国家、Cloudflare Colo 与指标明细
- 解锁快照由后端分级预计算：1 小时每分钟，6–24 小时每 5 分钟，3–7 天每 15 分钟；查询不读取私有诊断载荷，访客打开页面不会产生探测
- 公开解锁接口不返回检测域名、解析地址、系统或对照 DNS、固定入口和地址指纹

> 3 天和 7 天范围需要 Komari 将 `ping.latency_ms` 与 `ping.loss` 指标至少保留 7 天。

## 线路对比缓存

线路对比的排名、分布和明细读取服务器共享缓存。配套脚本及 systemd
单元位于 [`ops/emerald-analytics`](./ops/emerald-analytics)，默认策略为：

- 1 小时：每 5 分钟更新
- 6 小时、12 小时、1 天：每 10 分钟更新
- 3 天、7 天：每 30 分钟更新
- 单进程文件锁、低 CPU 优先级、空闲 I/O 调度、30% CPU 和 192 MB 内存上限

缓存失败时保留上一份可用 JSON。多节点趋势由用户按需加载，并在浏览器缓存 5 分钟。

## 隐私后端

生产环境配套使用 [cazi-cc/komari](https://github.com/cazi-cc/komari)：

- 匿名节点接口始终移除 IPv4、IPv6、私有备注、版本和令牌
- 监测目标、任务 DNS、解析 IP 及其短指纹均不写入公开指标；访客只能看到任务名称和非敏感质量统计
- 访客记录的 IP 与 User-Agent 只由服务端请求上下文生成，前端不能伪造
- 匿名写入有速率限制；结构化访客查询接口仅允许管理员调用
- 前端仅上报不含查询参数的站内路径，不上报搜索词、Cookie、剪贴板或页面内容

## 发布策略

项目固定使用滚动 `v1.0.0` Release。后续提交会覆盖同一标签、说明和
`komari-theme-emerald.zip`，除非项目所有者明确批准发布新的版本号。

## 上游更新

项目保留 `upstream=https://github.com/Tokinx/komari-theme-emerald.git`。每周工作流只把上游 `master` 合并到 `sync/upstream-master` 并创建待审查 PR，不会自动覆盖滚动 `v1.0.0` Release，也不会自动部署生产环境。合并前必须重新检查首页任务、访客隐私、线路对比、TCP 质量和暗色模式。

## 环境要求

- Node.js: `^20.19.0` 或 `>=22.12.0`
- Bun: `>=1.2.0`

## 开发

```bash
# 安装依赖
bun install

# 启动开发服务器
bun run dev

# 代码检查
bun run lint
```

## 构建

```bash
# 类型检查 + 生产构建
bun run build

# 预览生产构建
bun run preview
```

## 技术栈

| 类别     | 技术                             |
| -------- | -------------------------------- |
| 框架     | Vue 3                            |
| 构建工具 | Vite 7                           |
| UI 组件  | reka-ui（shadcn-vue 风格组件）   |
| 样式方案 | Tailwind CSS v4 + tw-animate-css |
| 状态管理 | Pinia 3                          |
| 路由     | Vue Router 5                     |
| 提示系统 | vue-sonner（Toaster）            |
| 图标     | @iconify/vue                     |
| 图表     | vue-echarts                      |
| 3D 地球  | cobe                             |
| 实用工具 | @vueuse/core, dayjs              |
| 代码规范 | ESLint (@antfu/eslint-config)    |

## 鸣谢

- [Komari Emerald](https://github.com/Tokinx/komari-theme-emerald)
- [Komari](https://github.com/komari-monitor/komari)
- [Komari Next](https://github.com/tonyliuzj/komari-next)
- [Komari Naive](https://github.com/lyimoexiao/komari-theme-naive)
- [Vue 3](https://vuejs.org/)
- [Vite](https://vitejs.dev/)
- [reka-ui](https://reka-ui.com/)
- [Tailwind CSS](https://tailwindcss.com/)

本项目 fork 自 [Tokinx/komari-theme-emerald](https://github.com/Tokinx/komari-theme-emerald)，原主题基座基于 [Komari Naive](https://github.com/lyimoexiao/komari-theme-naive)，特此感谢。

## License

[MIT](./LICENSE)
