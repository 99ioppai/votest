export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const origin = `${url.protocol}//${url.host}`;

  // --- 1. API: 获取所有视频列表 ---
  if (path === '/api/videos' && request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare("SELECT * FROM videos ORDER BY id DESC").all();
      return Response.json(results);
    } catch (e) {
      return Response.json([], { status: 500 });
    }
  }

  // --- 2. API: 后台添加视频 ---
  if (path === '/api/videos' && request.method === 'POST') {
    try {
      const body = await request.json();
      if (!body.title || !body.m3u8 || !body.cover) {
        return Response.json({ success: false, error: "缺少必要字段" }, { status: 400 });
      }
      await env.DB.prepare(
        "INSERT INTO videos (title, category, tags, cover, m3u8) VALUES (?, ?, ?, ?, ?)"
      ).bind(body.title, body.category || '默认分类', body.tags || '', body.cover, body.m3u8).run();
      return Response.json({ success: true });
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  // --- 3. API: 后台删除视频 ---
  if (path.startsWith('/api/videos/') && request.method === 'DELETE') {
    const id = path.split('/').pop();
    await env.DB.prepare("DELETE FROM videos WHERE id = ?").bind(id).run();
    return Response.json({ success: true });
  }

  // --- 4. 自动生成 Sitemap.xml (支持百度与 Google 视频富媒体抓取) ---
  if (path === '/sitemap.xml') {
    const { results } = await env.DB.prepare("SELECT id, title, cover, created_at FROM videos").all();
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n`;
    
    results.forEach(v => {
      const videoUrl = `${origin}/?v=${v.id}`;
      xml += `  <url>\n`;
      xml += `    <loc>${videoUrl}</loc>\n`;
      xml += `    <lastmod>${v.created_at ? v.created_at.split(' ')[0] : new Date().toISOString().split('T')[0]}</lastmod>\n`;
      xml += `    <video:video>\n`;
      xml += `      <video:thumbnail_loc>${v.cover}</video:thumbnail_loc>\n`;
      xml += `      <video:title><![CDATA[${v.title}]]></video:title>\n`;
      xml += `      <video:player_loc>${videoUrl}</video:player_loc>\n`;
      xml += `    </video:video>\n`;
      xml += `  </url>\n`;
    });
    xml += `</urlset>`;

    return new Response(xml, {
      headers: { "Content-Type": "application/xml;charset=UTF-8" }
    });
  }

  // --- 5. 针对搜索引擎与直接链接的 SSR 动态渲染 ---
  const videoId = url.searchParams.get('v');
  if (videoId) {
    try {
      const stmt = await env.DB.prepare("SELECT * FROM videos WHERE id = ?").bind(videoId).first();
      if (stmt) {
        const html = generateSSRHTML({
          title: stmt.title,
          cover: stmt.cover,
          m3u8: stmt.m3u8,
          tags: stmt.tags,
          siteUrl: origin,
          videoId: stmt.id
        });
        return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }
    } catch (e) {
      // 降级交由前端单页应用处理
    }
  }

  // 默认返回静态前端页面
  return env.ASSETS.fetch(request);
}

function generateSSRHTML({ title, cover, m3u8, tags, siteUrl, videoId }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - 视频在线播放</title>
    <meta name="description" content="${title} - 标签：${tags || ''}">
    <meta name="keywords" content="${tags || ''}">
    <!-- Open Graph 社交与爬虫结构 -->
    <meta property="og:title" content="${title}">
    <meta property="og:image" content="${cover}">
    <meta property="og:type" content="video.other">
    <!-- Google Schema.org VideoObject 结构化数据 -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      "name": "${title}",
      "description": "${title}",
      "thumbnailUrl": "${cover}",
      "uploadDate": "${new Date().toISOString()}",
      "contentUrl": "${m3u8}",
      "embedUrl": "${siteUrl}/?v=${videoId}"
    }
    </script>
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <div class="site-header">
       <a href="/" class="logo">🎬 视频分享</a>
    </div>
    <div class="container player-page">
        <h1 class="video-title">${title}</h1>
        <div class="video-meta-tags">
           ${(tags || '').split(/[\s,]+/).filter(Boolean).map(t => `<span class="tag-badge">#${t}</span>`).join('')}
        </div>
        <div class="player-wrapper">
            <video id="videoPlayer" controls autoplay></video>
        </div>
        <p style="margin-top: 20px;"><a href="/" class="back-btn">← 返回视频列表首页</a></p>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script>
        document.addEventListener("DOMContentLoaded", () => {
            const video = document.getElementById('videoPlayer');
            const videoSrc = "${m3u8}";
            if (Hls.isSupported()) {
                const hls = new Hls();
                hls.loadSource(videoSrc);
                hls.attachMedia(video);
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = videoSrc;
            }
        });
    </script>
</body>
</html>`;
}