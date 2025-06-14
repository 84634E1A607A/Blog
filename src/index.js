const LOG_KEY = 'blog_view_log';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const matchRead = url.pathname.match(/^\/api\/read\/(.+)$/);
    if (matchRead) {
      const key = matchRead[1];
      // Increment view count atomically
      await env.BLOG_VIEW_COUNT.put(key, ((parseInt(await env.BLOG_VIEW_COUNT.get(key)) || 0) + 1).toString());

      // Log the view, with page, user agent, user IP and timestamp
      const logEntry = {
        page: key,
        userAgent: request.headers.get('User-Agent'),
        userIP: request.headers.get('CF-Connecting-IP'),
        userLocation: request.cf.country + '-' + request.cf.city,
        timestamp: new Date().toISOString(),
      }
    
      console.log(logEntry);

      // Store log in KV
      const requestId = request.headers.get('CF-Request-ID');
      await env.BLOG_VIEW_COUNT.put(`${LOG_KEY}:${requestId}`, JSON.stringify(logEntry), {
        expirationTtl: 60 * 60 * 24 // 1 day
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

    // Testing purpose
    if (url.pathname === '/api/test') {
      await this.scheduled({ scheduled: true }, env, ctx);
      return new Response('Test completed', {
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-store',
        }
      });
    }

    // Return static content for other paths
    return env.STATIC_FILES.fetch(request);
  },

  // Scheduled event for daily email
  async scheduled(event, env, ctx) {
    const logs = [];
    let cursor;
    do {
      const list = await env.BLOG_VIEW_COUNT.list({ LOG_KEY, cursor });
      for (const key of list.keys) {
        const value = await env.BLOG_VIEW_COUNT.get(key.name);
        if (value) logs.push(JSON.parse(value));
      }
      cursor = list.cursor;
    } while (cursor);

    if (logs.length === 0) return;

    // Send email via Resend
    const rows = logs.map(log => `
      <tr>
      <td style="border: 1px solid #ddd; padding: 8px;">${log.page}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">${log.userAgent}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">${log.userIP}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">${log.userLocation}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">${log.timestamp}</td>
      </tr>
    `).join('');

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      },
      body: JSON.stringify({
      from: `Blog Worker <blog-worker@aajax.top>`,
      to: `Ajax <i@aajax.top>`,
      subject: `Blog Views Report - ${new Date().toISOString().split('T')[0]}`,
      html: `<p>Daily blog views report:</p>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
        <tr>
          <th style="border: 1px solid #ddd; padding: 8px;">Page</th>
          <th style="border: 1px solid #ddd; padding: 8px;">User Agent</th>
          <th style="border: 1px solid #ddd; padding: 8px;">User IP</th>
          <th style="border: 1px solid #ddd; padding: 8px;">Location</th>
          <th style="border: 1px solid #ddd; padding: 8px;">Timestamp</th>
        </tr>
        </thead>
        <tbody>
        ${rows}
        </tbody>
      </table>`,
      }),
    });
  }
};
