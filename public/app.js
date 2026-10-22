let allVideos = [];
let currentCategory = '全部';
let currentTag = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. 检查路由：判断是否为前端单页播放页 (例如 ?v=1)
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');

    if (videoId) {
        // 如果带了 ?v= 参数但服务端没有走 SSR，前端兜底渲染播放页
        renderClientPlayer(videoId);
        return;
    }

    // 2. 加载全站视频
    await loadVideos();

    // 3. 监听隐蔽后台唤起方式 (方式 A: 浏览器输入 #admin 路径，方式 B: 快捷键 Ctrl + Shift + A)
    checkAdminHash();
    window.addEventListener('hashchange', checkAdminHash);
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyA') {
            e.preventDefault();
            verifyAndOpenAdmin();
        }
    });

    // 4. 后台表单提交事件
    document.getElementById('videoForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newVideo = {
            title: document.getElementById('titleInput').value,
            category: document.getElementById('categoryInput').value,
            tags: document.getElementById('tagsInput').value,
            cover: document.getElementById('coverInput').value,
            m3u8: document.getElementById('m3u8Input').value
        };

        const res = await fetch('/api/videos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newVideo)
        });

        if (res.ok) {
            alert('视频添加成功！');
            document.getElementById('videoForm').reset();
            loadVideos();
            renderAdminTable();
        } else {
            alert('添加失败');
        }
    });

    document.getElementById('closeAdminBtn').addEventListener('click', () => {
        document.getElementById('adminModal').style.display = 'none';
        window.location.hash = '';
    });
});

// 加载视频列表
async function loadVideos() {
    try {
        const res = await fetch('/api/videos');
        allVideos = await res.json();
        renderFilters();
        renderVideoGrid();
    } catch (e) {
        console.error('加载视频失败', e);
    }
}

// 渲染分类与标签筛选栏
function renderFilters() {
    const categories = ['全部', ...new Set(allVideos.map(v => v.category))];
    const categoryContainer = document.getElementById('categoryChips');
    categoryContainer.innerHTML = categories.map(cat => `
        <span class="chip ${currentCategory === cat ? 'active' : ''}" onclick="filterByCategory('${cat}')">${cat}</span>
    `).join('');

    const allTags = new Set();
    allVideos.forEach(v => {
        if (v.tags) {
            v.tags.split(/[\s,]+/).forEach(t => { if(t) allTags.add(t); });
        }
    });
    const tagContainer = document.getElementById('tagChips');
    tagContainer.innerHTML = Array.from(allTags).map(tag => `
        <span class="chip ${currentTag === tag ? 'active' : ''}" onclick="filterByTag('${tag}')">#${tag}</span>
    `).join('') || '<span style="color:#666;font-size:12px;">暂无标签</span>';
}

function filterByCategory(cat) {
    currentCategory = cat;
    currentTag = null; // 切换分类时重置标签
    renderFilters();
    renderVideoGrid();
}

function filterByTag(tag) {
    currentTag = currentTag === tag ? null : tag; // 再次点击取消标签
    renderFilters();
    renderVideoGrid();
}

// 渲染视频卡片网格
function renderVideoGrid() {
    const grid = document.getElementById('videoGrid');
    let filtered = allVideos;

    if (currentCategory !== '全部') {
        filtered = filtered.filter(v => v.category === currentCategory);
    }
    if (currentTag) {
        filtered = filtered.filter(v => v.tags && v.tags.split(/[\s,]+/).includes(currentTag));
    }

    if (filtered.length === 0) {
        grid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:#8a99ad; padding:40px;">暂无相关视频</p>`;
        return;
    }

    grid.innerHTML = filtered.map(v => {
        const tagsHtml = (v.tags || '').split(/[\s,]+/).filter(Boolean).map(t => `<span class="tag-badge">#${t}</span>`).join('');
        return `
            <div class="video-card" onclick="window.location.href='/?v=${v.id}'">
                <div class="thumbnail-box">
                    <img src="${v.cover}" alt="${v.title}" loading="lazy">
                </div>
                <div class="card-info">
                    <div class="card-title">${v.title}</div>
                    <div class="card-tags">${tagsHtml}</div>
                </div>
            </div>
        `;
    }).join('');
}

// 前端纯净播放页兜底渲染
async function loadVideoListForClient() {
    if(allVideos.length === 0) {
        const res = await fetch('/api/videos');
        allVideos = await res.json();
    }
}
async function renderClientPlayer(videoId) {
    await loadVideoListForClient();
    const video = allVideos.find(v => v.id == videoId);
    if (!video) {
        document.getElementById('mainContainer').innerHTML = `<h2>视频不存在或已被删除</h2><p><a href="/">返回首页</a></p>`;
        return;
    }

    const tagsHtml = (video.tags || '').split(/[\s,]+/).filter(Boolean).map(t => `<span class="tag-badge">#${t}</span>`).join('');
    document.getElementById('mainContainer').innerHTML = `
        <div class="player-page">
            <h1 class="video-title">${video.title}</h1>
            <div class="video-meta-tags">${tagsHtml}</div>
            <div class="player-wrapper">
                <video id="clientVideoPlayer" controls autoplay></video>
            </div>
            <p style="margin-top: 20px;"><a href="/" class="back-btn">← 返回视频列表首页</a></p>
        </div>
    `;

    const videoElement = document.getElementById('clientVideoPlayer');
    if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(video.m3u8);
        hls.attachMedia(videoElement);
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        videoElement.src = video.m3u8;
    }
}

// 隐蔽后台逻辑
function checkAdminHash() {
    if (window.location.hash === '#admin') {
        verifyAndOpenAdmin();
    }
}

function verifyAndOpenAdmin() {
    const pwd = prompt("请输入管理员密码：");
    if (pwd === "admin888") {  // 默认密码，可在此处修改
        document.getElementById('adminModal').style.display = 'flex';
        renderAdminTable();
    } else {
        alert("密码错误");
        window.location.hash = '';
    }
}

async function renderAdminTable() {
    const tbody = document.getElementById('adminTableBody');
    tbody.innerHTML = allVideos.map(v => `
        <tr>
            <td>${v.id}</td>
            <td>${v.title}</td>
            <td>${v.category}</td>
            <td><button class="btn btn-danger" style="padding:4px 8px;font-size:12px;" onclick="deleteVideo(${v.id})">删除</button></td>
        </tr>
    `).join('');
}

async function deleteVideo(id) {
    if (confirm("确定要删除该视频吗？")) {
        const res = await fetch(`/api/videos/${id}`, { method: 'DELETE' });
        if (res.ok) {
            loadVideos();
            renderAdminTable();
        } else {
            alert('删除失败');
        }
    }
}