---
title: Cloudflare Workers return 404 when accessing with browser, while 200 when with curl, why?
updated: 2026-01-20 14:52:53
date: 2026-01-19 21:57:39
description: "Explaining why Cloudflare Workers return 404 in browsers but 200 in curl, this article attributes the issue to the Sec-Fetch-Mode: navigate header triggering static asset handling and concludes that using run_worker_first or _redirects configuration effectively resolves it."
tags:
  - 网络
  - 技术
---

TL, DR: Web browsers send `Sec-Fetch-Mode: navigate` header when accessing a page, while `curl` does not. With **STATIC_FILES** bindings in Cloudflare Workers:

```json
"assets": {
  "directory": "./public/",
  "not_found_handling": "404-page",
  "binding": "STATIC_FILES"
}
```

Cloudflare will directly serve static files with `Sec-Fetch-Mode: navigate` present and return 404 if file not found, without invoking the Worker script. Without this header, Cloudflare will invoke the Worker script, which may return 200.

The solution: add `"run_worker_first": ["/Ajax.gpg*"]` to ask Cloudflare to always invoke the Worker script first for matching paths.

<!-- more -->

---

## The Story

As we know, {% post_link CloudflarePages "this blog once ran on Cloudflare Pages" %}. Later, I heard from [hash](https://land.hash.moe/) that [Cloudflare Pages is discouraged](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/), against running on Cloudflare Workers with static assets. So I migrated this blog to run on Workers, added a page access statistics system, and later added Email reporting system (so that I receive one email per day to notify me that my blog still have readers).

Later, I introduced [Utterances](https://utteranc.es/) comments to my blog, and ultimately (at least for now) migrated to use [Gisgus](https://giscus.app/). I found then, that Giscus supports importing a custom CSS file for stylesheet, so I can fit Giscus better for my blog (see below... I mean just scroll down to see the comments section).

When I was experimenting on the custom CSS file, I added a branch to my Workers script to serve the CSS file from KV Cache (so that when experimenting the CSS, I don't need to push tens of single-line commits to my blog repo).

```js
    if (url.pathname === '/giscus-theme.css') {
        ...
    }
```

When testing the CSS file, my browser returned 404, while `curl` returned 200. I was confused. More confusingly, when I added this URL to Giscus as the custom CSS file, it actually fetched it correctly.

Anyway, it worked. Snowed in research work, I just left it alone.

## The Problem

Until recently (2026-01-18). I happened to find that my WPS Office from yay was REALLY OLD; happened to find that `wps-office-bin` AUR is gone; happened to find that the current one is [`wps-office-cn`](https://aur.archlinux.org/packages/wps-office-cn); happened to find that it was version 12.1.2.23578-1, while the latest version is 12.1.2.24722 released 2026-01-16 so I flagged it as out-of-date; the author of this package, [Clover Yan](https://www.khyan.top/), happened to find my blog out of curiosity, and he happened to use GPG email. I forgot to update my GPG key on this blog, so he sent me an email encrypted with my old GPG key.

I struggled to decrypt the email (my old Canokey had poor contact on my laptop, and any movement would cause failure) and wondered why it could be encrypted with the old key. Later, I realized that my blog was still serving the old GPG key with a file `/Ajax.gpg`, so I decided to change that to a 302 redirect to [OpenPGP key server](https://keys.openpgp.org/vks/v1/by-fingerprint/C2938BB2BE46925BC3AD831CC342EF3F96F5AA37).

Just like before, I added a branch to my Workers script to handle this rediect:

```js
    if (url.pathname === '/Ajax.gpg') {
        xxx
    }
```

And, *just like before*, my browser returned 404, while `curl` returned 302.

What was *not like before* was that I have to figure this out this time, or this redirect will not lead viewers to my updated GPG key.

So I turned to ChatGPT. I pasted browser and curl headers and asked why the difference. The same as me, he suspected caching machnisms first. But after I confirmed that I have cleared browser cache and Cloudflare cache, and asked him to search for other possible reasons, he found the answer.

> Your Worker code is fine. The reason you still see a cached 404 is that your request is not reaching your Worker code at all — it is being handled by Workers Static Assets routing (the “asset handler”), which can return its own 404 and attach the default static-asset headers you’re seeing
>
> ...
>
> This typically happens when you have assets.not_found_handling configured (for SPA or custom 404 behavior). Cloudflare’s Static Assets docs call out that this option changes how requests that don’t match an uploaded file are handled.
>
> In that mode, a “miss” like /Ajax.gpg can be answered by the asset layer (e.g., serve 404.html), and that answer is cached at the edge, producing the CF-Cache-Status: HIT you keep seeing.

See [Navigation requests prefer asset serving](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#navigation-requests-prefer-asset-serving).

## The Solution

Initially, I followed ChatGPT's suggestion to add a query string to bypass the static asset handler. But at the time I am writing this, I find another, better solution: [Page Redirects](https://developers.cloudflare.com/workers/static-assets/redirects/). By adding `_rediects` file, Cloudflare Workers static assets handler will call 302 redirect directly, without need to invoke the Worker script.
