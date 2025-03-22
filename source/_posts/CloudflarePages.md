---
title: Migrating to Cloudflare Pages & Self-hosted LFS
date: 2025-02-07 19:18:53
description: 本文记录了将博客迁移到 Cloudflare Pages 的过程，并介绍了如何解决 Git LFS 配额问题以及自建 LFS 服务的实践。
tags:
  - 网络
  - 技术
---

前两天我在翻腾 Cloudflare 尝试写一个 Cloudflare Workers 用来判断客户端 IP ([ip.aajax.top](https://ip.aajax.top)) 的时候看到了 Cloudflare 有一个新的功能 (新的, 指, 我上一次用 Cloudflare Worker 还是高中的时候折腾网课镜像站) Pages, 可以传静态网页直接部署. 于是我把博客整个搬到了 Cloudflare Pages 上面. 这篇文章记录了此次迁移.

<!-- more -->

## 迁移到 Cloudflare Pages

这一部分疑似是最简单直接的部分. Cloudflare 支持从 Github / Gitlab 导入公开的仓库直接跑生成脚本. 对于 Hexo 博客来说, 由于我的博客源码是公开的, 因此 CF 可以直接 Clone 下来用. 这之后, Cloudflare 会自动根据仓库的文件结构来选择用于编译的镜像 (比如由于我的仓库根目录有 `package.json` 和 `package-lock.json`, CF 自动使用了 NodeJS 镜像). 然后对于 Hexo, 在官方镜像里面使用 `npx hexo generate` 即可生成 dist. 此时 Cloudflare Pages 就上线了.

与 Github Pages 相比, Cloudflare Pages 有以下优势:

- 最重要的, Cloudflare Pages 在国内的 **访问性** 比 Github Pages 要好一些
- Cloudflare Pages **可以预览未发布的网站** 和  **回滚**, 这样在 PR 合并之前就可以充分检查 (我可以不用但是这玩意确实好用啊)
- Cloudflare Pages 里面还可以嵌入 *function*, 其实可以当做有后端的网站用了. 只不过这个要单独写些东西.

于是我十分欢欣鼓舞的就搬了过去.

## 移除 Github Pages

在此之后, 通过删除 `CNAME` 文件, 注释掉对应的 [CI 脚本](https://github.com/84634E1A607A/Blog/blob/c16dcdafc477d989f00a87e12f5ddf4b59d96630/.github/workflows/pages.yml) (对, 这个就是 Hexo 部署的 CI 脚本), 在设置里面点一下 *'Unpublish Site'*, 原来的 Github Pages 就下线了.

## www.aajax.top 怎么办

之前也听说过, 如果有两个长得一模一样的网站, 那么这两个网站会互相抢搜索引擎排名. 虽然我这个 `aajax` 和 `AJAX` (啊对, 就是 Asynchronous JavaScript And XML) 长得太像了所以搜索引擎也搜不太着我的博客 (乐), 但是聊胜于无, ~~我~~ ChatGPT 写了个 Worker 把 `www` 给 301 到 `@` 了. 

```js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
  
    // Construct the new URL with the desired redirect
    const newUrl = `https://aajax.top${url.pathname}${url.search}`;
    return Response.redirect(newUrl, 301)
  },
};
```

## Github LFS Quota

我本来以为到这里这事就算完活了, 也没什么需要写博客的, 毕竟都比较常规. 结果今天 Github 给我发邮件告诉我我的 Git LFS Quota (1GB/mo) 已经使用了 80%. 我一想, 坏了. Cloudflare Pages 克隆我的仓库是直接 Clone 的, 不像 Github Pages 有 '特权通道', 所以它做 CI Build 的时候 **会使用我的 LFS Quota**. 这可坏了! 我的博客的 LFS 仓库有将近 40MB, 多 Clone 两遍可不就超限了嘛... 这下最简单的解决方案就是 **要么用对象存储服务, 要么自建 LFS** 了.

用对象存储服务得加钱 (还可能莫名被打), 因此我选择了自建 Git LFS 仓库 (反正 Cloudflare Tunnel 进来就行).

## Gitea

于是我就去找了一下开源的 LFS 实现. 结果你猜咋, 仅实现了 LFS 功能的 Repo 都没啥人用, 高 Star 的方案都是一整套 Git + LFS + Docker Registry + ...... 的. 于是大的里面挑个小的, 那就 Gitea 了.

Gitea 的部署也很简单, 拿官方 Docker 镜像和 Compose 改吧改吧就行. 麻烦的又是网: 如果我纯用 Tunnel, 那么我本地上传就很费劲; 如果我纯用域名解析上来, 那么 ~~由于运营商的安全策略~~ (草了, 在写这句话的时候我才突然想起来, 这是我自己的安全策略, 我忘记改防火墙了 🤣🤣🤣), Cloudflare 无法访问我开放的端口; 而偏偏 LFS 这玩意又要求在 API 里面返回完整的 URL (这样才能用对象存储托管), 所以这事一根筋变成两头堵了 (什么). 我只好在我的 Nginx 上配置了一个 filter, 把返回的 `git.aajax.top` 给换成直接的地址了. (虽然疑似没有生效...) 一会再研究一下罢

## LFS Migration

然后是如何迁移 LFS Objects (这个是问的 ChatGLM):

- Step 1: Clone the Repository `git clone <repository-url>`
- Step 2: Fetch LFS Objects `git lfs fetch --all`
- Step 3: Set Up Your Own LFS Server
- Step 4: Configure Git to Use Your LFS Server `git config lfs.url <your-lfs-server-url>`
- Step 5: Push LFS Objects to Your LFS Server  `git lfs push --all <your-lfs-server-url>`

在此之后新建文件 `.lfsconfig`

```ini
[lfs]
url=https://git.aajax.top/Ajax/Blog.git/info/lfs/
```

这将使得后续 Clone 下来的 Repo 使用这个 LFS URL. 已经 Clone 下来的那些看上去 pull 到最新的之后也能用了.

## Nginx

经过了两个小时折腾, 我总算搞明白了是怎么回事了

```nginx
server {
    listen 3000 ssl http2;
    listen [::]:3000 ssl http2;
    server_name lfs.aajax.top;
    ssl_certificate /etc/nginx/ssl/lfs.aajax.top/fullchain.cer;
    ssl_certificate_key /etc/nginx/ssl/lfs.aajax.top/ssl.key;

    # 这一段用来把 Gitea 其他页面通通拒绝
    location / {
        deny all;
    }

    location ~ ^/([^/]+)/([^/]+)\.git/info/lfs/.+ {
        proxy_pass http://172.16.xxx.xxx:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 这句话用来推大文件
        client_max_body_size 500M;

        access_log /var/log/nginx/lfs.log;
        error_log /var/log/nginx/lfs_error.log warn;

        # 不要 gzip 否则替换可能爆炸
        gzip off;

        # 关掉 temp file, 给 1M 的 Buffer 够了
        proxy_buffers 16 1M;
        proxy_buffer_size 4k;
        proxy_max_temp_file_size 0;

        # 对 lfs 的 json API 处理, 替换 URL
        sub_filter_types application/vnd.git-lfs+json;
        sub_filter_once off;
        sub_filter 'https://git.aajax.top/' 'https://lfs.aajax.top:3000/';
    }
}
```

这样一来应该是没什么问题了 (吧)
