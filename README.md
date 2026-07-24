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
`komari-theme-emerald-build-*.zip`，再通过后台的 `上传主题` 安装。

## 定制功能

- 每个节点可独立选择、排序最多 8 个首页延迟监测任务
- 首页直接显示 Komari 延迟监测任务名称，延迟在左、丢包在右
- 首页卡片统一任务行数可在 1–8 行之间自定义，无数据和未配置位置以 `--` 占位
- 独立的 Emerald 后台设置面板，支持节点任务、颜色、阈值、图表和原主题设置
- 节点详情提供默认可见的任务分析面板，并支持 1 小时至 7 天、双轴合图/分图、缩放、异常阈值、自动刷新及 PNG/CSV 导出
- 详情数据采用浏览器短时缓存和请求合并，后台标签页暂停自动刷新
- 最优延迟和最低丢包默认使用醒目的 `#5EEAA6`，下一档使用 `#47B592`，并允许自定义
- 节点名称下方单独显示公开备注

> 3 天和 7 天范围需要 Komari 将 `ping.latency_ms` 与 `ping.loss` 指标至少保留 7 天。

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
