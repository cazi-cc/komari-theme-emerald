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
- 已删除或已取消分配的首页任务会自动清理，卡片对应位置恢复显示“未配置”
- 独立的 Emerald 后台设置面板支持节点任务、颜色、阈值、图表和原主题设置，直接继承 Komari 后台原生明暗模式与配色变量
- 后台“最近访客”按需分页显示访问时间、来源 IP、页面和浏览器；记录仅管理员可见并由 Komari 自动保留 30 天
- 访客设备浮条只在浏览器本机识别设备与浏览器，不再把访客 IP 发送给第三方定位服务
- 节点详情提供默认可见的任务分析面板，并支持 1 小时至 7 天、双轴合图/分图、缩放、异常阈值、自动刷新及 PNG/CSV 导出
- 详情数据采用浏览器短时缓存和请求合并，后台标签页暂停自动刷新
- 最优延迟和最低丢包默认使用醒目的 `#5EEAA6`，下一档使用 `#47B592`，并允许自定义
- 节点名称下方单独显示公开备注
- 首页提供带主题绿呼吸光的“线路对比”入口，可按同一延迟监测任务比较不同节点；减少动态效果时自动静态化
- 线路对比包含节点排名、P0.5-P99.5 主要波动区间、延迟/丢包散点、多节点趋势和指标明细
- 公开线路对比和静态分析缓存仅显示任务名称，不包含被监测目标的 IP 地址或域名
- “同任务网络质量对比指数”综合丢包、P50、P95、波动和数据覆盖率，权重与门槛可配置
- 评分模型 v2 默认使用 `40 / 30 / 25 / 3 / 2` 权重和 `95 / 85 / 70` 评级门槛，波动率改为固定尺度，避免放大组内很小的差异
- 延迟区间默认展示覆盖约 99% 有效样本的 P0.5-P99.5，并在内部高亮 P50-P95；散点悬停或轻触可查看节点名称、公开备注和完整指标
- 桌面端统计卡片与左右分析栏使用同一网格中线和统一间距
- 丢包次数和样本数来自 Komari 完整聚合计数，趋势图降采样不会抹去总览中的偶发丢包
- 服务器端定期生成共享静态缓存，访客不会重复触发全量统计
- 修正首页统一行数滑块与 1–8 刻度的中心对齐

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
- 访客记录的 IP 与 User-Agent 只由服务端请求上下文生成，前端不能伪造
- 匿名写入有速率限制；结构化访客查询接口仅允许管理员调用
- 前端仅上报不含查询参数的站内路径，不上报搜索词、Cookie、剪贴板或页面内容

## 发布策略

项目固定使用滚动 `v1.0.0` Release。后续提交会覆盖同一标签、说明和
`komari-theme-emerald.zip`，除非项目所有者明确批准发布新的版本号。

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
