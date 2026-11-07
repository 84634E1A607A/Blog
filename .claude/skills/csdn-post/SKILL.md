---
name: csdn-post
description: Cross-post a blog article from aajax.top to CSDN using MCP Chrome DevTools. Use when asked to publish, repost, or cross-post a local Hexo blog post to CSDN.
---

# CSDN Cross-Posting Skill

## Usage
Use this skill when the user asks to cross-post a blog article from `aajax.top` to CSDN.

**!!!IMPORTANT!!!** NEVER create snapshots or save any files in this blog repository. This skill is a read-only workflow — it only reads article content and operates in the browser via MCP Chrome DevTools. The one exception is `npx hexo generate` (step 7), which rebuilds `public/`; nothing else may write under `/home/ajax/source/Blog`.

When you need to dump a snapshot to disk (long pages, tag dialogs), pass an explicit `/tmp/...` path — `take_snapshot` defaults to the current working directory, which is often inside the repo.

## Workflow

### 1. Prepare Content
- Read the article from `source/_posts/<post>.md`.
- Get `title`, `description`, `date`, and `tags` from frontmatter.
- Use at most 2-3 relevant tags for CSDN.
- Get the canonical URL with `curl`. The production URL date can differ from the local frontmatter date because of timezone handling:
  1. Derive the slug from the post filename.
  2. Try `https://aajax.top/YYYY/MM/DD/article-slug/` using the frontmatter date.
  3. If that returns `404`, also try the previous day and next day.
  ```bash
  curl -sI -L https://aajax.top/YYYY/MM/DD/article-slug/ | grep -E "^HTTP/(1\.1 200|2 200)" | tail -1
  ```
  Use only a URL that returns `HTTP/2 200` or `HTTP/1.1 200`. If none work, prompt the user.
  Note: `tail -1` is used instead of `head -1` because a proxy returns `HTTP/1.1 200 Connection established` as the first line; the actual target status is on the last matching line.

### 2. Open CSDN Editor
```
mcp__chrome-devtools__new_page(url="https://mp.csdn.net/mp_blog/creation/editor")
```
To edit an existing article instead, navigate to `https://mp.csdn.net/mp_blog/creation/editor/<article-id>`.

**Login check**: If the page shows a login form instead of the editor, **stop and prompt the user** to log in manually in the browser. Do not attempt to fill in credentials.

### 3. Fill Article Metadata
- **Title**: Set from frontmatter `title`, TRANSLATE TO CHINESE if needed.
- **Article type**: Select "转载" radio button
- **Original URL**: Fill with canonical URL

**Set the title via JavaScript, not `fill`.** Long Chinese titles get mangled by the fill tool — it silently drops characters around `-` and spaces (a 22-char title came back as `运维笑话一则我的 S干掉了我的`, 15 chars). Use the native value setter and verify the length afterwards:

```javascript
const el = document.querySelector('textarea[placeholder*="文章标题"]');
Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, 'FULL TITLE');
el.dispatchEvent(new Event('input', { bubbles: true }));
el.dispatchEvent(new Event('change', { bubbles: true }));
el.dispatchEvent(new Event('blur', { bubbles: true }));
```

**The title and summary textareas share `class="el_mcm-textarea__inner"`.** A selector like `textarea.el_mcm-textarea__inner` matches the TITLE first, so a summary written that way overwrites the title. Always disambiguate by placeholder:

- title: `textarea[placeholder*="文章标题"]`
- summary: `textarea[placeholder^="摘要"]`

**Selecting the 转载 radio**: clicking it with `evaluate_script` may report `checked: false` because Element UI re-renders asynchronously. Confirm via a fresh snapshot instead — the radio should read `checked`. Selecting 转载 is what reveals the 原文链接 field, so do it before trying to fill that field.

### 4. Add Lead Paragraph
The content always opens with this credit text, before any article text. Wrap it in a `<blockquote>` and follow it with an `<hr/>`:

```
本文原载于我的个人博客：<a href="CANONICAL_URL">TITLE</a>，如需阅读完整内容（包括图片、代码块等），请前往我的博客阅读。
```

### 5. Copy Article Content

**!!!IMPORTANT!!!** USE CHINESE. IF THE ARTICLE IS IN ENGLISH, TRANSLATE IT TO CHINESE.

**DO NOT** switch the editor into Markdown mode — feed the rich text editor instead.

- Copy the article body. If `<!-- more -->` exists, use the content on both sides of it (delete only the comment).
- Mermaid diagrams do not render on CSDN. Omit them with a short note to read the original post, with canonical URL attached.
- Replace internal links such as `{% post_link ... %}` with direct `https://aajax.top/.../` links — these also need their canonical URL resolved.
- Replace blog-specific shortcodes with the equivalent HTML.
- Preserve code fences and language identifiers where CSDN supports them.

#### Injecting content into the Rich Text Editor

The CSDN editor is a **CKEditor** instance. Convert the article to HTML and set it through the CKEditor API rather than typing into the iframe:

```javascript
const editor = window.CKEDITOR.instances.editor;
editor.setData(`<blockquote>本文原载于我的个人博客：<a href="CANONICAL_URL">TITLE</a>，如需阅读完整内容（包括图片、代码块等），请前往我的博客阅读。</blockquote><hr/>` + bodyHtml);
```

Map Markdown to `<h2>`/`<h3>`, `<p>`, `<strong>`, `<a>`, `<ul>`/`<ol>`, `<table>`, `<pre><code>`, `<code>`. For long articles, append in chunks with `editor.setData(editor.getData() + chunkHtml)`.

### 6. Manage Tags
Tags live in `.tag-box` as `.el_mcm-tag` elements; each has a `.el_mcm-tag__close` to remove it. `php` and `开发语言` are common auto-suggestions — delete them:

```javascript
['php', '开发语言'].forEach(t => [...document.querySelectorAll('.tag-box .el_mcm-tag')]
  .find(el => el.textContent.trim() === t)?.querySelector('.el_mcm-tag__close')?.click());
```

To add tags, click "添加文章标签", then target `input[placeholder*="请输入文字搜索"]` — never a fixed snapshot uid. Set `.value`, dispatch `input`, press `Enter`, one tag at a time. Verify by reading back `.tag-box .el_mcm-tag`, then close the dropdown with `Escape` before screenshotting for the user.

### 7. Add Cover
Every article gets the cover that the blog itself already generated — do not design one.

**Find the file locally, do not download it over HTTP.** `scripts/ogp.js` renders a 1200×630 card per page at `after_generate` and writes it under `public/ogp/`. The filename is `sha256(page.path || page.source || page.slug || page.title)` truncated to **24 hex characters**, plus `.jpg`. Page path for a post is the post's permalink path.

- If the post frontmatter has `ogp_image`, that override wins and there is **no** generated card — use the override asset instead, from its published location under `public/` (e.g. `ogp_image.url: mem_error.jpg` on `DellMemoryMirrorMode` → `public/2025/07/24/DellMemoryMirrorMode/mem_error.jpg`, matching the post's real date).
- `ls` the resolved path first; if it does not exist yet, run `npx hexo generate` or skip the article and tell the user.

To attach it, take a snapshot and find the `button "从本地上传"` uid — it changes every load, so never reuse one:

```
grep -n "从本地上传" /tmp/sn.txt
```

Then, in order:

1. `upload_file(uid=<uid>, filePaths=["/home/ajax/source/Blog/public/ogp/<hash>.jpg"])`
2. The 图片编辑 crop dialog opens. **"确认上传" is a `div`, not a `button`** — click it via `document.querySelector('.vicp-operate-btn').click()`.
3. Confirm: `.preview-box img.preview` must have `naturalWidth > 0` and `.vue-image-crop-upload` must have `display: none`, i.e. the dialog closed.

CSDN crops to 16:9 in its editor, so the 1200×630 card loses a little off the top and bottom. That is platform behaviour, not a bug — do not pre-crop the file.

Adding a cover to an **already published** article works the same way and still ends with 发布博客; the daily quota only gates new articles.

### 8. Fill Summary
- Use frontmatter `description` field
- Character limit: 256
- If description is longer, truncate to ~250 characters
- Target it precisely — `document.querySelector('textarea[placeholder^="摘要"]')` — and set it with the native value setter as in step 3. Verify the counter next to the field reads the expected `N / 256`, and re-check the title afterwards in case it got clobbered.

### 9. Check Authorization
**Important**: The authorization checkbox must be checked:
```javascript
const checkboxes = document.querySelectorAll('input[type="checkbox"]');
for (const cb of checkboxes) {
  const labelText = cb.closest('label')?.textContent || cb.parentElement?.textContent || '';
  if (labelText.includes('原文允许转载')) {
    cb.click();   // prefer click() over setting .checked — the Vue model syncs on it
  }
}
```
Return `cb.checked` from the same script and confirm it is `true`.

### 10. Publish
- ASK THE USER TO REVIEW THE FILLED INFORMATION IN THE BROWSER. DO NOT PROCEED WITHOUT USER CONFIRMATION.
- Before asking, run one `evaluate_script` that returns the title, summary length, original URL, tags, radio state, checkbox state and whether a cover is present, so the summary you give the user is accurate rather than assumed.
- If approved, click "发布博客".

### 11. Verify the Result
A publish click lands on `https://mp.csdn.net/mp_blog/creation/success/<id>`; the live post is `https://blog.csdn.net/ajax_dong/article/details/<id>`. `curl` against `blog.csdn.net` returns **521** (anti-bot), so verify in the browser by navigating to the live URL and checking:

- `h1` matches the title
- the lead paragraph and all `aajax.top` links render
- tables and `<pre>` code blocks survived
- `meta[property="og:image"]` is the cover you uploaded

Sections render as `h3` (CSDN demotes headings by one level) — that is expected, not breakage. Also check `/mp_blog/manage/article`: the post should be listed under 已发布 as 转载, and the 审核中/未通过 count should not include it.

## Troubleshooting

### Elements don't respond to clicks or typing
Element UI re-renders constantly, so a uid from an earlier snapshot can go stale ("Node is detached from document"). Take a fresh snapshot, prefer stable CSS selectors over uids where one exists, and re-read state afterwards instead of trusting the click.

### Cover upload appears to do nothing
"确认上传" is a `div.vicp-operate-btn`, so `querySelectorAll('button')` will not find it and the crop dialog just stays open. Click it with `document.querySelector('.vicp-operate-btn').click()`, then re-read `.preview-box img.preview` — its `src` must change to a fresh `i-blog.csdnimg.cn/direct/...` URL before publishing.

### Finding the editor instance
If `window.CKEDITOR.instances.editor` doesn't work, list the instances with `Object.keys(window.CKEDITOR.instances)`. The content iframe has class `cke_wysiwyg_frame cke_reset`.
