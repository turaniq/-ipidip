const state = {
  me: null,
  posts: [],
  imageDataUrl: null,
  pollTimer: null,
  activeTab: 'chat',
};

const el = (id) => document.getElementById(id);

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

function formatMoney(n) {
  return Number(n || 0).toLocaleString('tr-TR');
}

function timeAgo(iso) {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return 'az önce';
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
  return `${Math.floor(diff / 86400)} gün önce`;
}

function getYoutubeEmbed(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : str;
  return d.innerHTML;
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

function showError(id, msg) {
  const node = el(id);
  node.textContent = msg;
  node.classList.remove('hidden');
}
function hideError(id) {
  el(id).classList.add('hidden');
}

/* ---------- Giriş / oturum ---------- */
async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) {
      showGate();
      return;
    }
    state.me = await res.json();
    enterApp();
  } catch (e) {
    showGate();
  }
}

function showGate() {
  el('gate').classList.remove('hidden');
  el('appRoot').classList.add('hidden');
}

function enterApp() {
  el('gate').classList.add('hidden');
  el('appRoot').classList.remove('hidden');

  el('balanceAmount').textContent = formatMoney(state.me.balance);
  el('composerAvatar').textContent = initials(state.me.name);

  if (state.me.avatar) {
    el('userAvatar').src = state.me.avatar;
    el('userAvatar').classList.remove('hidden');
  }

  loadPosts();
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    loadPosts();
    if (state.activeTab === 'leaderboard') loadLeaderboard();
    refreshBalance();
  }, 8000);
}

async function refreshBalance() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) return;
    const me = await res.json();
    state.me = me;
    el('balanceAmount').textContent = formatMoney(me.balance);
  } catch (e) {
    // sessizce geç
  }
}

el('logoutBtn').addEventListener('click', async () => {
  try {
    await fetch('/auth/logout', { method: 'POST' });
  } finally {
    clearInterval(state.pollTimer);
    location.reload();
  }
});

/* ---------- Sekmeler ---------- */
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  el(`tab-${tab}`).classList.remove('hidden');
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');
  if (tab === 'leaderboard') loadLeaderboard();
}

/* ---------- Sohbet akışı ---------- */
async function loadPosts() {
  try {
    const res = await fetch('/api/posts');
    if (!res.ok) throw new Error('İstek başarısız');
    state.posts = await res.json();
    renderFeed();
  } catch (e) {
    console.error('Akış yüklenemedi:', e);
  }
}

function renderFeed() {
  const feed = el('feed');
  if (state.posts.length === 0) {
    feed.innerHTML = '<p class="empty-state">ekonomiX şu an sessiz. İlk notu sen bırak.</p>';
    return;
  }
  feed.innerHTML = state.posts.map(postCardHtml).join('');
}

function postCardHtml(post) {
  const embed = post.video_url ? getYoutubeEmbed(post.video_url) : null;
  const textHtml = post.body ? `<p class="post-text">${escapeHtml(post.body)}</p>` : '';
  const imageHtml = post.image ? `<img class="post-image" src="${escapeAttr(post.image)}" alt="paylaşım" />` : '';
  const avatarHtml = post.avatar_url
    ? `<img class="avatar avatar-lg" src="${escapeAttr(post.avatar_url)}" alt="" />`
    : `<div class="avatar avatar-lg">${escapeHtml(initials(post.author))}</div>`;

  let videoHtml = '';
  if (post.video_url) {
    if (embed) {
      videoHtml = `<div class="post-video-wrap"><iframe src="${embed}" title="video" allowfullscreen></iframe></div>`;
    } else {
      videoHtml = `<div class="post-video-wrap"><video src="${escapeAttr(post.video_url)}" controls></video></div>`;
    }
  }

  return `
    <div class="card post-card">
      <span class="pin"></span>
      <div class="post-row">
        ${avatarHtml}
        <div class="post-body">
          <div class="post-meta">
            <span class="post-author">${escapeHtml(post.author)}</span>
            <span class="post-time">· ${timeAgo(post.created_at)}</span>
          </div>
          ${textHtml}
          ${imageHtml}
          ${videoHtml}
        </div>
      </div>
    </div>
  `;
}

/* ---------- Paylaşım oluşturma ---------- */
el('imageBtn').addEventListener('click', () => el('imageInput').click());
el('imageInput').addEventListener('change', handleImageSelect);

el('removeImageBtn').addEventListener('click', () => {
  state.imageDataUrl = null;
  el('imagePreviewWrap').classList.add('hidden');
  updateShareButtonState();
});

el('videoBtn').addEventListener('click', () => {
  el('videoRow').classList.toggle('hidden');
});

el('cancelVideoBtn').addEventListener('click', () => {
  el('videoRow').classList.add('hidden');
  el('videoUrlInput').value = '';
  updateShareButtonState();
});

el('refreshBtn').addEventListener('click', () => {
  loadPosts();
  refreshBalance();
  if (state.activeTab === 'leaderboard') loadLeaderboard();
});

el('shareBtn').addEventListener('click', handleShare);
el('postText').addEventListener('input', updateShareButtonState);
el('videoUrlInput').addEventListener('input', updateShareButtonState);

function updateShareButtonState() {
  const hasContent = Boolean(
    el('postText').value.trim() || state.imageDataUrl || el('videoUrlInput').value.trim()
  );
  el('shareBtn').disabled = !hasContent;
}

function handleImageSelect(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showError('composeError', 'Lütfen bir resim dosyası seç.');
    return;
  }
  hideError('composeError');

  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 1000;
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      state.imageDataUrl = canvas.toDataURL('image/jpeg', 0.78);
      el('imagePreview').src = state.imageDataUrl;
      el('imagePreviewWrap').classList.remove('hidden');
      updateShareButtonState();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

async function handleShare() {
  const text = el('postText').value.trim();
  const videoUrl = el('videoUrlInput').value.trim();
  if (!text && !state.imageDataUrl && !videoUrl) return;

  const shareBtn = el('shareBtn');
  const originalHtml = shareBtn.innerHTML;
  shareBtn.disabled = true;
  shareBtn.textContent = 'Gönderiliyor...';
  hideError('composeError');

  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text, image: state.imageDataUrl, videoUrl }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Paylaşım gönderilemedi');
    }

    el('postText').value = '';
    state.imageDataUrl = null;
    el('imagePreviewWrap').classList.add('hidden');
    el('videoUrlInput').value = '';
    el('videoRow').classList.add('hidden');
    await loadPosts();
  } catch (e) {
    showError('composeError', e.message || 'Not gönderilemedi, tekrar dener misin?');
  } finally {
    shareBtn.innerHTML = originalHtml;
    updateShareButtonState();
  }
}

/* ---------- Sıralama ---------- */
async function loadLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    if (!res.ok) throw new Error();
    renderLeaderboard(await res.json());
  } catch (e) {
    el('leaderboardList').innerHTML = '<p class="empty-state">Sıralama yüklenemedi.</p>';
  }
}

function renderLeaderboard(list) {
  if (!list.length) {
    el('leaderboardList').innerHTML = '<p class="empty-state">Henüz kimse yok.</p>';
    return;
  }
  el('leaderboardList').innerHTML = list.map((u, i) => `
    <div class="lb-row">
      <span class="lb-rank">${i + 1}</span>
      ${u.avatar_url
        ? `<img class="lb-avatar" src="${escapeAttr(u.avatar_url)}" alt="" />`
        : `<div class="avatar avatar-sm">${escapeHtml(initials(u.name))}</div>`}
      <span class="lb-name">${escapeHtml(u.name)}</span>
      <span class="lb-balance">${formatMoney(u.balance)} TL</span>
    </div>
  `).join('');
}

/* ---------- Başlat ---------- */
updateShareButtonState();
checkAuth();
