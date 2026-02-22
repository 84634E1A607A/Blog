#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Convert RGB to hex
function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
        const hex = parseInt(x).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

// Parse catppuccin.css for RGB color values
function parseCatppuccinColors(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const colors = { light: {}, dark: {} };

    // Parse RGB color definitions
    const rgbRegex = /--color-(light|dark)-([\w-]+):\s*(\d+),\s*(\d+),\s*(\d+)/g;
    let match;

    while ((match = rgbRegex.exec(content)) !== null) {
        const [, mode, name, r, g, b] = match;
        colors[mode][name] = rgbToHex(r, g, b);
    }

    return colors;
}

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
function extractColors(variables, catppuccinColors) {
    const colors = {};

    // Font families
    colors.FONT_ARTICLE = resolveColor(variables['article-fonts'], variables) || variables['normal-fonts'] || 'sans-serif';
    colors.FONT_CODE = resolveColor(variables['code-fonts'], variables) || 'monospace';

    // Code highlight colors - using catppuccin colors
    // Light mode
    const light = catppuccinColors.light;
    colors.CODE_COMMENT = light.overlay2;
    colors.CODE_KEYWORD = light.blue;
    colors.CODE_STRING = light.cyan;
    colors.CODE_BUILTIN = light.green;
    colors.CODE_NUMBER = light.purple;
    colors.CODE_TITLE = light.text;
    colors.CODE_PARAMS = light.text;
    colors.CODE_ATTRIBUTE = light.pink;
    colors.CODE_SYMBOL = light.pink;
    colors.CODE_BACKGROUND_LIGHT = light.surface2;

    // Dark mode
    const dark = catppuccinColors.dark;
    colors.CODE_COMMENT_DARK = dark.overlay2;
    colors.CODE_KEYWORD_DARK = dark.blue;
    colors.CODE_STRING_DARK = dark.cyan;
    colors.CODE_BUILTIN_DARK = dark.green;
    colors.CODE_NUMBER_DARK = dark.purple;
    colors.CODE_TITLE_DARK = dark.text;
    colors.CODE_PARAMS_DARK = dark.text;
    colors.CODE_ATTRIBUTE_DARK = dark.pink;
    colors.CODE_SYMBOL_DARK = dark.pink;
    colors.CODE_BACKGROUND_DARK = dark.surface2;

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

// Main function
function buildGiscusTheme() {
    const scriptDir = __dirname;
    const themeDir = path.join(scriptDir, '..');
    const variablePath = path.join(themeDir, 'source', 'style', '_common', 'variable.styl');
    const catppuccinPath = path.join(themeDir, 'source', 'style', '_custom', 'catppuccin.css');
    const templatePath = path.join(scriptDir, 'giscus-theme.template.css');
    const outputPath = path.join(themeDir, 'source/giscus-theme.css');

    console.log('🎨 Building Giscus theme...');
    console.log(`📂 Reading variables from: ${variablePath}`);

    // Parse variables
    const variables = parseStylusVariables(variablePath);
    console.log(`✓ Parsed ${Object.keys(variables).length} variables`);

    // Parse catppuccin colors
    const catppuccinColors = parseCatppuccinColors(catppuccinPath);
    console.log(`✓ Parsed catppuccin colors: ${Object.keys(catppuccinColors.light).length + Object.keys(catppuccinColors.dark).length} colors`);

    // Extract colors
    const colors = extractColors(variables, catppuccinColors);
    console.log(`✓ Extracted ${Object.keys(colors).length} color mappings`);

    // Read template
    let template = fs.readFileSync(templatePath, 'utf-8');
    console.log(`✓ Loaded template: ${templatePath}`);

    // Replace placeholders
    let css = template;
    for (const [key, value] of Object.entries(colors)) {
        const placeholder = `\\$${key}\\$`;
        css = css.replace(new RegExp(placeholder, 'g'), value);
    }

    // Check for unreplaced placeholders
    const unreplaced = css.match(/\$[A-Z_]+\$/g);
    if (unreplaced) {
        console.warn(`⚠️  Warning: Some placeholders were not replaced: ${[...new Set(unreplaced)].join(', ')}`);
    }
    
    // Write CSS
    fs.writeFileSync(outputPath, css, 'utf-8');
    console.log(`✓ Generated: ${outputPath}`);

    // Show size
    const size = Buffer.byteLength(css, 'utf-8');
    console.log(`\n📊 Size: ${size} bytes`);
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
