# Ajax's Blog (code repo)

This is the code repository for my blog ([aajax.top](https://aajax.top))

Credits to Cloudflare Workers! It has better connectivity than Github Pages, especially in China.

## Setting up the project

```bash
npm i -g hexo-cli
pnpm install
```

## Running the project

```bash
pnpm run build   # Generate static files
pnpm run server  # Start the local server with dev overrides (neat disabled)
pnpm run dev     # Generate into public/ and live-reload in browser (neat disabled)
```
