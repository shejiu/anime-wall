# 🎌 Anime Wall — Anime Discovery

**2,330 anime database · Tokyo Night × Shinkai Style**

> 🌐 在线访问：**[shejiu.github.io/anime-wall](https://shejiu.github.io/anime-wall/)**

## 🚀 GitHub Pages 自动部署

### 已配置

- ✅ GitHub Actions 自动部署 (`git push` → 自动更新)
- ✅ `.nojekyll` — 防止 Jekyll 忽略资源
- ✅ 所有路径使用 `./` 相对路径
- ✅ GitHub Pages 兼容

### 更新网站

```bash
git add .
git commit -m "更新网站"
git push
# → GitHub Actions 自动部署 → 1 分钟后生效
```

### 首次部署

1. **创建 GitHub 仓库** — 如 `anime-wall`
2. **上传项目**
   ```bash
   git init
   git add .
   git commit -m "🎌 Anime Discovery"
   git branch -M main
   git remote add origin https://github.com/YOUR_USER/anime-wall.git
   git push -u origin main
   ```
3. **开启 Pages** → Settings → Pages → Source: **GitHub Actions**
4. **等待部署** → 访问 `https://用户名.github.io/anime-wall/`

## 🛠️ 数据更新

```bash
npm run generate   # 从 AniList API 获取最新数据
npm run download   # 下载封面
npm run optimize   # 转 WebP + 压缩
git add . && git commit -m "数据更新" && git push
```

## ⚡ Features

- 🔍 中文 / 日文 / 英文 / 罗马音搜索
- 🏷️ 多维标签 AND 筛选 (类型/情绪/氛围)
- 📅 年代筛选 (80s → Recent)
- 👑 TOP 100 金 gradient 排名
- 🌸 樱花 Canvas 粒子
- 📱 PWA · 手机适配 · 离线缓存
- 🎨 深夜东京 × 新海诚风

## 📁 Tech Stack

| Layer | Tech |
|-------|------|
| 数据 | AniList GraphQL API |
| 图片 | Sharp → WebP (300px, 22KB avg) |
| 前端 | Vanilla JS · CSS Grid · Canvas |
| 性能 | content-visibility · DOM recycling · IntersectionObserver |
| 部署 | GitHub Pages · GitHub Actions |
