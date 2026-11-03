/* 分享本本 PWA - app.js */
// ============================================================
// 預設資料 (首次開啟時載入；使用者一旦新增/編輯即覆寫為 localStorage)
// ============================================================
const initialData = [];

const STORAGE_KEY = 'fenxiang_benben_data';

document.addEventListener('alpine:init', () => {
  Alpine.data('passwordManager', () => ({
    passwords: [],
    searchQuery: '',
    isModalOpen: false,
    editingId: null,
    showPasswordInModal: false,
    revealedPasswords: {},
    toasts: [],
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    formData: { siteName: '', url: '', username: '', password: '', notes: '' },

    // ============================================================
    // Lifecycle
    // ============================================================
    init() {
      this.loadFromStorage();
      this.registerServiceWorker();
      this.adjustContentOffset();
      this.setupOnlineStatus();
    },

    setupOnlineStatus() {
      this.isOnline = navigator.onLine;
      const update = () => {
        this.isOnline = navigator.onLine;
        if (!this.isOnline) {
          this.showToast('已進入離線模式，資料仍可本機使用', 'info');
        }
      };
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
    },

    adjustContentOffset() {
      const header = document.getElementById('app-header');
      const main = document.getElementById('main-content');
      if (!header || !main) return;
      const apply = () => {
        const h = header.getBoundingClientRect().height;
        main.style.paddingTop = h + 'px';
      };
      apply();
      window.addEventListener('resize', apply);
      window.addEventListener('orientationchange', () => setTimeout(apply, 200));
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(apply);
      }
    },

    loadFromStorage() {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          this.passwords = JSON.parse(saved);
        } catch (e) {
          console.error("解析儲存資料失敗", e);
          this.passwords = [...initialData];
        }
      } else {
        this.passwords = [...initialData];
      }
    },

    registerServiceWorker() {
      if (!('serviceWorker' in navigator)) return;
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('SW Registered:', reg.scope))
          .catch(err => console.error('SW Registration Failed:', err));
      });
    },

    // ============================================================
    // Persistence
    // ============================================================
    saveToLocalStorage() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.passwords));
    },

    // ============================================================
    // Computed
    // ============================================================
    get filteredPasswords() {
      const q = this.searchQuery.trim().toLowerCase();
      if (!q) return this.passwords;
      return this.passwords.filter(p =>
        (p.siteName || '').toLowerCase().includes(q) ||
        (p.username || '').toLowerCase().includes(q) ||
        (p.notes || '').toLowerCase().includes(q) ||
        (p.url || '').toLowerCase().includes(q)
      );
    },

    // ============================================================
    // Modal
    // ============================================================
    openModal() {
      this.editingId = null;
      this.formData = { siteName: '', url: '', username: '', password: '', notes: '' };
      this.showPasswordInModal = false;
      this.isModalOpen = true;
    },

    editItem(item) {
      this.editingId = item.id;
      this.formData = { ...item };
      this.showPasswordInModal = false;
      this.isModalOpen = true;
    },

    closeModal() {
      this.isModalOpen = false;
    },

    saveItem() {
      if (!this.formData.siteName.trim() || !this.formData.username.trim() || !this.formData.password.trim()) {
        this.showToast('網站名稱、帳號、密碼為必填', 'error');
        return;
      }
      const data = { ...this.formData };
      data.siteName = data.siteName.trim();
      data.url = (data.url || '').trim();
      data.username = data.username.trim();
      data.notes = (data.notes || '').trim();

      if (this.editingId) {
        const idx = this.passwords.findIndex(p => p.id === this.editingId);
        if (idx !== -1) {
          this.passwords[idx] = { ...data, id: this.editingId };
          this.showToast('項目已更新', 'success');
        }
      } else {
        data.id = String(Date.now()) + Math.random().toString(36).slice(2, 8);
        this.passwords.push(data);
        this.showToast('項目已新增', 'success');
      }
      this.saveToLocalStorage();
      this.closeModal();
    },

    deleteItem(id) {
      if (!confirm('確定要刪除此項目？此操作無法復原。')) return;
      this.passwords = this.passwords.filter(p => p.id !== id);
      this.saveToLocalStorage();
      this.showToast('項目已刪除', 'success');
    },

    // ============================================================
    // Password helpers
    // ============================================================
    generatePassword() {
      const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      const lower = 'abcdefghijkmnpqrstuvwxyz';
      const digits = '23456789';
      const symbols = '!@#$%^&*-_+=?';
      const pools = [upper, lower, digits, symbols];
      let pwd = '';
      for (let i = 0; i < 4; i++) {
        pwd += pools[i].charAt(Math.floor(Math.random() * pools[i].length));
      }
      const all = pools.join('');
      for (let i = 0; i < 12; i++) {
        pwd += all.charAt(Math.floor(Math.random() * all.length));
      }
      pwd = pwd.split('').sort(() => Math.random() - 0.5).join('');
      this.formData.password = pwd;
      this.showPasswordInModal = true;
    },

    copyToClipboard(text, message) {
      const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        this.showToast(message, 'success');
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => this.showToast(message, 'success'))
          .catch(() => fallback());
      } else {
        fallback();
      }
    },

    // ============================================================
    // Import / Export
    // ============================================================
    exportToJson() {
      if (this.passwords.length === 0) {
        this.showToast('沒有可匯出的資料', 'error');
        return;
      }
      const blob = new Blob([JSON.stringify(this.passwords, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `分享本本_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('已匯出 JSON', 'success');
    },

    async importFromJson(event) {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data)) {
          this.showToast('JSON 格式錯誤：必須是陣列', 'error');
          return;
        }
        const valid = data.filter(item => item && item.siteName && item.username && item.password);
        if (valid.length === 0) {
          this.showToast('找不到有效項目（需含 siteName, username, password）', 'error');
          return;
        }
        const normalized = valid.map(item => ({
          siteName: String(item.siteName),
          url: String(item.url || ''),
          username: String(item.username),
          password: String(item.password),
          notes: String(item.notes || ''),
          id: item.id || String(Date.now()) + Math.random().toString(36).slice(2, 8)
        }));
        if (confirm(`即將匯入 ${normalized.length} 筆項目，要合併還是取代現有資料？\n\n按「確定」=合併至現有資料\n按「取消」=取代全部現有資料`)) {
          this.passwords = [...this.passwords, ...normalized];
        } else {
          this.passwords = normalized;
        }
        this.saveToLocalStorage();
        this.showToast(`已匯入 ${normalized.length} 筆`, 'success');
      } catch (e) {
        console.error(e);
        this.showToast('匯入失敗：無法解析 JSON', 'error');
      }
      event.target.value = '';
    },

    exportToHtml() {
      if (this.passwords.length === 0) {
        this.showToast('沒有可匯出的資料', 'error');
        return;
      }
      const rows = this.passwords.map(p => `
        <tr>
          <td>${this.escapeHtml(p.siteName)}</td>
          <td>${p.url ? `<a href="${this.escapeHtml(p.url.startsWith('http') ? p.url : 'https://' + p.url)}" target="_blank">${this.escapeHtml(p.url)}</a>` : ''}</td>
          <td><code>${this.escapeHtml(p.username)}</code></td>
          <td><code>${this.escapeHtml(p.password)}</code></td>
          <td>${this.escapeHtml(p.notes || '').replace(/\n/g, '<br>')}</td>
        </tr>`).join('');
      const html = `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>分享本本 匯出</title>
        <style>body{font-family:-apple-system,sans-serif;margin:24px;color:#1e293b}table{width:100%;border-collapse:collapse;font-size:14px}th,td{border:1px solid #e2e8f0;padding:10px;text-align:left}th{background:#4f46e5;color:#fff}tr:nth-child(even){background:#f8fafc}code{font-family:monospace}</style>
        </head><body><h1>分享本本 匯出 (${new Date().toLocaleString('zh-TW')})</h1><table>
        <thead><tr><th>網站</th><th>網址</th><th>帳號</th><th>密碼</th><th>備忘錄</th></tr></thead>
        <tbody>${rows}</tbody></table></body></html>`;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `分享本本_${new Date().toISOString().slice(0, 10)}.html`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('已匯出 HTML', 'success');
    },

    escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = String(str);
      return div.innerHTML;
    },

    // ============================================================
    // Toast
    // ============================================================
    showToast(message, type = 'info') {
      const id = Date.now() + Math.random();
      this.toasts.push({ id, message, type });
      setTimeout(() => {
        this.toasts = this.toasts.filter(t => t.id !== id);
      }, 2500);
    }
  }));
});
