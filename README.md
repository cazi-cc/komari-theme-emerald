<h3 align="center"> Komari Emerald Cazi </h3>
<p align="center">
基于 Komari Emerald 定制的 Komari Monitor 双栈监控主题
</p>

![preview](/docs/preview.png)

## 使用

1. 从 [Release 页面](https://github.com/cazi-cc/komari-theme-emerald/releases) 下载最新的 `komari-theme-emerald-build-*.zip` 文件
2. 登录 Komari Monitor 后，点击 `设置`，选择 `主题管理` 选项卡
3. 点击 `上传主题` 按钮，选择下载的 `komari-theme-emerald-build-*.zip` 文件
4. 刷新页面，即可看到新的主题

## 定制功能

- 首页节点卡片按 IPv4、IPv6 两行独立显示延迟和丢包，不再合并双栈任务数据
- 最优延迟和最低丢包使用更醒目的 `#5EEAA6`，下一档使用 `#47B592`
- 节点名称下方单独显示公开备注

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
