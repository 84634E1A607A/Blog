#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Parse Stylus variable file
function parseStylusVariables(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const variables = {};
    
    // Regular expression to match Stylus variable declarations
    const varRegex = /^\$?([\w-]+)\s*=\s*(.+?)(?:\s*\/\/.*)?$/gm;
    
    let match;
    while ((match = varRegex.exec(content)) !== null) {
        const [, name, value] = match;
        variables[name] = value.trim();
    }
    
    // Parse hash/object values like $global-setting
    const hashRegex = /^\$?([\w-]+)\s*=\s*\{([^}]+)\}/gm;
    while ((match = hashRegex.exec(content)) !== null) {
        const [, name, props] = match;
        const propsObj = {};
        const propRegex = /([\w-]+):\s*([^,\n]+)/g;
        let propMatch;
        while ((propMatch = propRegex.exec(props)) !== null) {
            propsObj[propMatch[1].trim()] = propMatch[2].trim();
        }
        variables[name] = propsObj;
    }
    
    return variables;
}

// Resolve color values (replace variables, convert Stylus mix() to CSS color-mix())
function resolveColor(value, variables) {
    if (!value) return value;
    
    // First, replace variable references
    let resolved = value;
    const varRefRegex = /\$([a-zA-Z0-9_-]+)(?:\['([^']+)'\])?/g;
    
    let iterations = 0;
    const maxIterations = 10;
    
    while (varRefRegex.test(resolved) && iterations < maxIterations) {
        varRefRegex.lastIndex = 0;
        resolved = resolved.replace(varRefRegex, (match, varName, propName) => {
            if (propName && typeof variables[varName] === 'object') {
                return variables[varName][propName] || match;
            }
            return variables[varName] || match;
        });
        iterations++;
    }
    
    // Convert Stylus mix() to CSS color-mix()
    // Stylus: mix(color1, color2, weight%) -> CSS: color-mix(in srgb, color1 weight%, color2)
    const mixRegex = /mix\(([^,]+),\s*([^,]+),\s*(\d+(?:\.\d+)?)%\)/g;
    resolved = resolved.replace(mixRegex, (match, color1, color2, percentage) => {
        const c1 = color1.trim();
        const c2 = color2.trim();
        return `color-mix(in srgb, ${c1} ${percentage}%, ${c2})`;
    });
    
    return resolved;
}

// Extract color and font values from parsed variables
function extractColors(variables) {
    const colors = {};
    
    // Font families
    colors.FONT_ARTICLE = resolveColor(variables['article-fonts'], variables) || variables['normal-fonts'] || 'sans-serif';
    colors.FONT_CODE = resolveColor(variables['code-fonts'], variables) || 'monospace';
    
    // Code highlight colors - Light mode
    colors.CODE_COMMENT = resolveColor(variables['color-code-comment'], variables);
    colors.CODE_PLAIN = resolveColor(variables['color-code-plain'], variables);
    colors.CODE_LINE = resolveColor(variables['color-code-line'], variables);
    colors.CODE_KEYWORD = resolveColor(variables['color-code-keyword'], variables);
    colors.CODE_BUILTIN = resolveColor(variables['color-code-builtIn'], variables);
    colors.CODE_STRING = resolveColor(variables['color-code-string'], variables);
    colors.CODE_PARAMS = resolveColor(variables['color-code-params'], variables);
    colors.CODE_NUMBER = resolveColor(variables['color-code-number'], variables);
    colors.CODE_TITLE = resolveColor(variables['color-code-title'], variables);
    colors.CODE_ATTRIBUTE = resolveColor(variables['color-code-attribute'], variables);
    colors.CODE_SYMBOL = resolveColor(variables['color-code-symbol'], variables);
    colors.CODE_BACKGROUND_LIGHT = resolveColor(variables['color-code-background'], variables);
    
    // Code highlight colors - Dark mode
    colors.CODE_COMMENT_DARK = resolveColor(variables['color-code-comment-dark'], variables);
    colors.CODE_PLAIN_DARK = resolveColor(variables['color-code-plain-dark'], variables);
    colors.CODE_LINE_DARK = resolveColor(variables['color-code-line-dark'], variables);
    colors.CODE_KEYWORD_DARK = resolveColor(variables['color-code-keyword-dark'], variables);
    colors.CODE_BUILTIN_DARK = resolveColor(variables['color-code-builtIn-dark'], variables);
    colors.CODE_STRING_DARK = resolveColor(variables['color-code-string-dark'], variables);
    colors.CODE_PARAMS_DARK = resolveColor(variables['color-code-params-dark'], variables);
    colors.CODE_NUMBER_DARK = resolveColor(variables['color-code-number-dark'], variables);
    colors.CODE_TITLE_DARK = resolveColor(variables['color-code-title-dark'], variables);
    colors.CODE_ATTRIBUTE_DARK = resolveColor(variables['color-code-attribute-dark'], variables);
    colors.CODE_SYMBOL_DARK = resolveColor(variables['color-code-symbol-dark'], variables);
    colors.CODE_BACKGROUND_DARK = resolveColor(variables['color-code-background-dark'], variables);
    
    // Theme text colors - Light mode
    colors.TEXT_MAIN = resolveColor(variables['theme-text-color-main'], variables);
    colors.TEXT_SUB = resolveColor(variables['theme-text-color-sub'], variables);
    colors.TEXT_DESC = resolveColor(variables['theme-text-color-desc'], variables);
    colors.TEXT_COMMENT = resolveColor(variables['theme-text-color-comment'], variables);
    
    // Theme text colors - Dark mode
    colors.TEXT_MAIN_DARK = resolveColor(variables['theme-text-color-main-dark'], variables);
    colors.TEXT_SUB_DARK = resolveColor(variables['theme-text-color-sub-dark'], variables);
    colors.TEXT_DESC_DARK = resolveColor(variables['theme-text-color-desc-dark'], variables);
    colors.TEXT_COMMENT_DARK = resolveColor(variables['theme-text-color-comment-dark'], variables);
    
    // Theme colors - Light mode
    colors.THEME_MAIN = resolveColor(variables['theme-color-main'], variables);
    colors.THEME_HOVER = resolveColor(variables['theme-color-hover'], variables);
    colors.THEME_LINK = resolveColor(variables['theme-color-link'], variables);
    colors.LINE_COLOR = resolveColor(variables['theme-line-color'], variables);
    colors.CONTENT_BACKGROUND = resolveColor(variables['theme-color-content-background'], variables);
    
    // Theme colors - Dark mode
    colors.THEME_MAIN_DARK = resolveColor(variables['theme-color-main-dark'], variables);
    colors.THEME_HOVER_DARK = resolveColor(variables['theme-color-hover-dark'], variables);
    colors.THEME_LINK_DARK = resolveColor(variables['theme-color-link-dark'], variables);
    colors.LINE_COLOR_DARK = resolveColor(variables['theme-line-color-dark'], variables);
    colors.CONTENT_BACKGROUND_DARK = resolveColor(variables['theme-color-content-background-dark'], variables);
    
    // Global settings
    const globalSetting = variables['global-setting'];
    const globalSettingDark = variables['global-setting-dark'];
    
    colors.BACKGROUND = globalSetting && typeof globalSetting === 'object' ? 
        globalSetting.background : '#fff';
    colors.BACKGROUND_DARK = globalSettingDark && typeof globalSettingDark === 'object' ? 
        globalSettingDark.background : '#101010';
    
    return colors;
}

// Minify CSS
function minifyCSS(css) {
    return css
        // Remove comments
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // Remove whitespace
        .replace(/\s+/g, ' ')
        // Remove spaces around certain characters
        .replace(/\s*([{}:;,>+~])\s*/g, '$1')
        // Remove trailing semicolons
        .replace(/;}/g, '}')
        // Remove leading/trailing whitespace
        .trim();
}

// Main function
function buildGiscusTheme() {
    const scriptDir = __dirname;
    const themeDir = path.join(scriptDir, '..');
    const variablePath = path.join(themeDir, 'source', 'style', '_common', 'variable.styl');
    const templatePath = path.join(scriptDir, 'giscus-theme.template.css');
    const outputPath = path.join(scriptDir, 'giscus-theme.css');
    const minOutputPath = path.join(scriptDir, 'giscus-theme.min.css');
    
    console.log('🎨 Building Giscus theme from Stylus variables...');
    console.log(`📂 Reading variables from: ${variablePath}`);
    
    // Parse variables
    const variables = parseStylusVariables(variablePath);
    console.log(`✓ Parsed ${Object.keys(variables).length} variables`);
    
    // Extract colors
    const colors = extractColors(variables);
    console.log(`✓ Extracted ${Object.keys(colors).length} color mappings`);
    
    // Read template
    let template = fs.readFileSync(templatePath, 'utf-8');
    console.log(`✓ Loaded template: ${templatePath}`);
    
    // Replace placeholders
    let css = template;
    for (const [key, value] of Object.entries(colors)) {
        const placeholder = `{{${key}}}`;
        css = css.replace(new RegExp(placeholder, 'g'), value);
    }
    
    // Check for unreplaced placeholders
    const unreplaced = css.match(/\{\{[A-Z_]+\}\}/g);
    if (unreplaced) {
        console.warn(`⚠️  Warning: Some placeholders were not replaced: ${[...new Set(unreplaced)].join(', ')}`);
    }
    
    // Write regular CSS
    fs.writeFileSync(outputPath, css, 'utf-8');
    console.log(`✓ Generated: ${outputPath}`);
    
    // Write minified CSS
    const minifiedCSS = minifyCSS(css);
    fs.writeFileSync(minOutputPath, minifiedCSS, 'utf-8');
    console.log(`✓ Generated: ${minOutputPath}`);
    
    // Show size comparison
    const originalSize = Buffer.byteLength(css, 'utf-8');
    const minifiedSize = Buffer.byteLength(minifiedCSS, 'utf-8');
    const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
    
    console.log(`\n📊 Size comparison:`);
    console.log(`   Regular:  ${originalSize} bytes`);
    console.log(`   Minified: ${minifiedSize} bytes (${reduction}% smaller)`);
    console.log(`\n✨ Build complete!`);
}

// Run if executed directly
if (require.main === module) {
    try {
        buildGiscusTheme();
    } catch (error) {
        console.error('❌ Error building Giscus theme:', error.message);
        process.exit(1);
    }
}

module.exports = { buildGiscusTheme, parseStylusVariables, extractColors };
