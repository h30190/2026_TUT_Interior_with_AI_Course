// 🧱 材料表：匯入 DXF 帶進來的材料（壁／地／主秀壁…）可在這裡編輯、新增，並上傳材質照片
// 照片會先縮到 200px 再存（存進資料檔，畫在施工圖材料表旁）

const photoCache = {};

// 照片（data URL）轉成可畫的圖片；第一次載入完成後重畫
function materialPhoto(m) {
  if (!m.photo) return null;
  let img = photoCache[m.photo];
  if (!img) {
    img = new Image();
    img.onload = () => { if (typeof refresh === 'function') refresh(); };
    img.src = m.photo;
    photoCache[m.photo] = img;
  }
  return img.complete && img.naturalWidth ? img : null;
}

// 縮圖：最長邊 200px，存成 JPEG
function shrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 200 / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src);
      resolve(cv.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('不是看得懂的圖片'));
    img.src = URL.createObjectURL(file);
  });
}

function renderMaterialsUI() {
  const host = $('materialsContainer');
  if (!host) return;
  host.innerHTML = '';
  if (!projectMaterials.length) {
    host.innerHTML = '<div class="syncnote">目前沒有材料：匯入 DXF 會自動帶入，或按「新增材料」。</div>';
    return;
  }
  projectMaterials.forEach((m, i) => {
    const card = document.createElement('div');
    card.className = 'opblk mat-card';
    card.innerHTML = `
      <div class="mat-photo" data-i="${i}" title="點一下上傳材質照片">${m.photo ? `<img src="${m.photo}" alt="">` : '📷<br>照片'}</div>
      <div class="mat-fields">
        <div class="row2">
          <div><label>用途</label><input data-i="${i}" data-f="role" value="${escapeAttr(m.role)}" placeholder="壁／地／主秀壁"></div>
          <div><label>尺寸與名稱</label><input data-i="${i}" data-f="spec" value="${escapeAttr(m.spec)}" placeholder="120*120 白玉(亮)"></div>
        </div>
        <div class="row2">
          <div><label>型號</label><input data-i="${i}" data-f="code" value="${escapeAttr(m.code)}"></div>
          <div><label>填縫劑</label><input data-i="${i}" data-f="grout" value="${escapeAttr(m.grout)}"></div>
        </div>
        <button type="button" class="btn-del-op" data-del="${i}">🗑️ 刪除</button>
      </div>`;
    host.appendChild(card);
  });
  host.querySelectorAll('input[data-f]').forEach(el => el.addEventListener('input', e => {
    const m = projectMaterials[+e.target.dataset.i];
    m[e.target.dataset.f] = e.target.value;
    if (e.target.dataset.f === 'spec') {
      const t = parseTileSize(m.spec);
      m.size = t ? [t.TL, t.TW] : null;
    }
    refresh();
  }));
  host.querySelectorAll('.mat-photo').forEach(el => el.addEventListener('click', () => {
    const inp = $('materialPhotoFile');
    inp.dataset.i = el.dataset.i;
    inp.click();
  }));
  host.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', () => {
    projectMaterials.splice(+el.dataset.del, 1);
    renderMaterialsUI(); refresh();
  }));
}

function escapeAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function initMaterials() {
  if ($('btnAddMaterial')) $('btnAddMaterial').addEventListener('click', () => {
    projectMaterials.push({ role: '壁', code: '', spec: '', grout: '', size: null });
    renderMaterialsUI(); refresh();
  });
  const inp = $('materialPhotoFile');
  if (inp) inp.addEventListener('change', () => {
    const f = inp.files[0], m = projectMaterials[+inp.dataset.i];
    inp.value = '';
    if (!f || !m) return;
    shrinkPhoto(f).then(url => { m.photo = url; renderMaterialsUI(); refresh(); }, e => alert('照片讀取失敗：' + e.message));
  });
  renderMaterialsUI();
}
