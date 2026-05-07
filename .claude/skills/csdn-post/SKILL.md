---
name: csdn-post
description: Cross-post a blog article from aajax.top to CSDN using MCP Chrome DevTools. Use when asked to publish, repost, or cross-post a local Hexo blog post to CSDN.
---

# CSDN Cross-Posting Skill

## Usage
Use this skill when the user asks to cross-post a blog article from `aajax.top` to CSDN.

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
  curl -sI https://aajax.top/YYYY/MM/DD/article-slug/ | head -1
  ```
  Use only a URL that returns `HTTP/2 200` or `HTTP/1.1 200`. If none work, prompt the user.

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

### 6. Manage Tags
**Delete wrong tags** (php, 开发语言 are common auto-suggestions):
```javascript
// Find and click delete button on unwanted tags
const unwantedTags = new Set(['php', '开发语言']);
const tags = document.querySelectorAll('[class*="tag"], [class*="Tag"]');
for (const tag of tags) {
  const text = tag.textContent.trim();
  if (unwantedTags.has(text)) {
    const deleteBtn = tag.querySelector('[class*="close"], [class*="Close"], button');
    if (deleteBtn) deleteBtn.click();
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
Use JavaScript to directly click the close button within the tag element.
