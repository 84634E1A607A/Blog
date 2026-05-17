---
name: csdn-post
description: Cross-post a blog article from aajax.top to CSDN using MCP Chrome DevTools. Use when asked to publish, repost, or cross-post a local Hexo blog post to CSDN.
---

# CSDN Cross-Posting Skill

## Usage
Use this skill when the user asks to cross-post a blog article from `aajax.top` to CSDN.

**!!!IMPORTANT!!!** NEVER create snapshots or save any files in this blog repository. This skill is a read-only workflow — it only reads article content and operates in the browser via MCP Chrome DevTools. Do not write, create, or modify any files under `/home/ajax/source/Blog`.

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
Use MCP Chrome DevTools:
```
mcp__chrome_devtools__new_page(url="https://mp.csdn.net/mp_blog/creation/editor")
```

**Login check**: After the page loads, take a snapshot. If the page shows a login form instead of the editor (e.g., URL redirected to a login page or login UI is visible), **stop and prompt the user** to log in manually in the browser before continuing. Do not attempt to fill in credentials.

### 3. Fill Article Metadata
- **Title**: Set from frontmatter `title`, TRANSLATE TO CHINESE if needed.
- **Article type**: Select "转载" radio button
- **Original URL**: Fill with canonical URL

### 4. Add Lead Paragraph
At the top of the content, add:
```
> 本文原载于我的个人博客：[文章标题](canonical_url)，如需阅读完整内容（包括图片、代码块等），请前往我的博客阅读。

---
```

### 5. Copy Article Content

**!!!IMPORTANT!!!** USE CHINESE. IF THE ARTICLE IS IN ENGLISH, TRANSLATE IT TO CHINESE.

**DO NOT** open the Markdown editor, just paste content to the Rich text editor.

- Copy the article body. If `<!-- more -->` exists, use the content BEFORE AND AFTER it (ONLY DELETE THIS COMMENT).
- Mermaid diagrams do not render on CSDN. Omit them with a short note to read the original post, with canonical URL attached.
- Replace internal links such as `{% post_link ... %}` with direct `https://aajax.top/.../` links, you NEED TO RESOLVE THE CANONICAL LINK for these too.
- Replace blog-specific shortcodes with standard Markdown.
- Preserve code fences and language identifiers where CSDN supports them.

#### Injecting content into the Rich Text Editor

The CSDN editor is a **CKEditor** instance. To set content, use `evaluate_script` to call the CKEditor API:

```javascript
// Discover the editor instance
const editor = window.CKEDITOR.instances.editor;

// Build HTML content (translate to Chinese, add lead paragraph, etc.)
const htmlContent = `<blockquote>本文原载于我的个人博客：<a href="CANONICAL_URL">TITLE</a>，如需阅读完整内容（包括图片、代码块等），请前往我的博客阅读。</blockquote><hr/><p>...</p>`;

// Set initial content
editor.setData(htmlContent);

// Append more content (for long articles, inject in chunks)
editor.setData(editor.getData() + additionalHtml);
```

**HTML format reference** for CKEditor injection:
- Blockquote (lead paragraph): `<blockquote>...</blockquote>`
- Horizontal rule: `<hr/>`
- Headings: `<h2>...</h2>`, `<h3>...</h3>`, `<h4>...</h4>`
- Paragraphs: `<p>...</p>`
- Bold: `<strong>...</strong>`
- Links: `<a href="URL">text</a>`
- Lists: `<ul><li>...</li></ul>` or `<ol><li>...</li></ol>`
- Tables: `<table><thead><tr><th>...</th></tr></thead><tbody><tr><td>...</td></tr></tbody></table>`
- Code blocks: `<pre><code>...</code></pre>`
- Inline code: `<code>...</code>`

**For long articles**, break the content into multiple chunks and append each using `editor.setData(editor.getData() + chunkHtml)` to avoid hitting any size limits.

### 6. Manage Tags
**Delete wrong tags** (php, 开发语言 are common auto-suggestions):
```javascript
// CSDN tags use el_mcm-tag class with el_mcm-tag__content for text and el_mcm-tag__close for close
const tagBox = document.querySelector('.tag-box');
const tags = Array.from(tagBox.querySelectorAll('.el_mcm-tag'));
const unwanted = ['php', '开发语言'];
for (const tag of tags) {
  const content = tag.querySelector('.el_mcm-tag__content');
  const text = content ? content.textContent.trim() : '';
  if (unwanted.includes(text)) {
    const closeBtn = tag.querySelector('.el_mcm-tag__close');
    if (closeBtn) closeBtn.click();
  }
}
```

**Add correct tags**:
- Click "添加文章标签" button
- Click the tag input field. Do not rely on a fixed snapshot uid; take a fresh snapshot if the page changed.
- Type tag name and press Enter

### 7. Fill Summary
- Use frontmatter `description` field
- Character limit: 256
- If description is longer, truncate to ~250 characters

### 8. Check Authorization
**Important**: The authorization checkbox must be checked:
```javascript
const checkboxes = document.querySelectorAll('input[type="checkbox"]');
for (const cb of checkboxes) {
  const labelText = cb.closest('label')?.textContent || cb.parentElement?.textContent || '';
  if (labelText.includes('原文允许转载')) {
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    cb.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
```

### 9. Publish
- ASK THE USER TO REVIEW THE FILLED INFORMATION IN THE BROWSER. DO NOT PROCEED WITHOUT USER CONFIRMATION.
- If none, click "发布博客" button

## Troubleshooting

### Checkbox won't click
Use JavaScript evaluation as shown above.

### Focus issues
Take snapshot to verify current state. Click intended element explicitly.

### Tags persist after delete attempt
Use JavaScript to directly click the `.el_mcm-tag__close` button within the `.el_mcm-tag` element, as shown in the Manage Tags section.

### Finding the editor instance
If `window.CKEDITOR.instances.editor` doesn't work, discover available instances:
```javascript
Object.keys(window.CKEDITOR.instances)
```
The iframe containing the editor content has class `cke_wysiwyg_frame cke_reset`.

### Content too long for single setData call
Break content into multiple chunks and append each:
```javascript
editor.setData(editor.getData() + additionalHtml);
```
Check current content length with: `editor.getData().length`
