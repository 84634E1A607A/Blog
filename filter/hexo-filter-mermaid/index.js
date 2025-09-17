hexo.extend.tag.register("mermaid", (args, diagram) => {
    const conf = hexo.config.mermaid || {
        darkModeEnabled: false,
        init: [""]
    };

    if (conf.darkModeEnabled) {
        return `<div class="mermaid-container">
        <pre class="mermaid mermaid-light">${conf.init[0]}\n${diagram}</pre>
        <pre class="mermaid mermaid-dark">${conf.init[1]}\n${diagram}</pre>
        <div class="mermaid-print-fallback" style="display: none;">
            <pre class="mermaid-code">${diagram}</pre>
        </div>
        </div>`;
    }

    return `<div class="mermaid-container">
    <pre class="mermaid">${conf.init[0]}\n${diagram}</pre>
    <div class="mermaid-print-fallback" style="display: none;">
        <pre class="mermaid-code">${diagram}</pre>
    </div>
    </div>`;
}, {
    async: true,
    ends: true
});

hexo.extend.filter.register('before_post_render', (data) => {
    if ('.md'.indexOf(data.source.substring(data.source.lastIndexOf('.')).toLowerCase()) > -1) {
        data.content = data.content
            .replace(/(\s*)(```) *(mermaid) *\n?([\s\S]+?)\s*(\2)(\n+|$)/g, (raw, start, startQuote, lang, content, endQuote, end) => {
                // replace with an async call
                return start + '{% ' + lang + ' %}' + content + '{% end' + lang + ' %}' + end;
            });
    }
}, 0);
