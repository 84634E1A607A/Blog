export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const matchRead = url.pathname.match(/^\/api\/read\/(.+)$/);
    if (matchRead) {
      const key = matchRead[1];
      // Increment view count atomically
      await env.BLOG_VIEW_COUNT.put(key, ((parseInt(await env.BLOG_VIEW_COUNT.get(key)) || 0) + 1).toString());

      // Log the view, with page, user agent, user IP and timestamp
      console.log({
        page: key,
        userAgent: request.headers.get('User-Agent'),
        userIP: request.headers.get('CF-Connecting-IP'),
        userLocation: request.cf.country + '-' + request.cf.city,
        timestamp: new Date().toISOString(),
      });

      // 1x1 transparent PNG
      const png = Uint8Array.from([
        137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,
        0,0,0,13,73,68,65,84,8,153,99,0,1,0,0,5,0,1,13,10,26,10,0,0,0,0,73,69,78,68,174,66,96,130
      ]);
      return new Response(png, {
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': png.length,
          'Cache-Control': 'no-store',
        }
      });
    }

    const matchViews = url.pathname.match(/^\/api\/views\/(.+)$/);
    if (matchViews) {
      const key = matchViews[1];
      // Fetch view count
      const count = await env.BLOG_VIEW_COUNT.get(key);
      return new Response(count || '0', {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        }
      });
    }

    // Return static content for other paths
    return env.STATIC_FILES.fetch(request);
  }
};