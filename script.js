const CONFIG = window.VITRINA_CONFIG || {};
const WEB_APP_URL = CONFIG.WEB_APP_URL;

const state = {
  selectedFiles: [],
  photos: [],
  localFileById: new Map(),
  localFileByName: new Map(),
  uploading: false
};

const $ = (id) => document.getElementById(id);

const els = {
  photoName: $("photoName"),
  note: $("note"),
  autoNumber: $("autoNumber"),
  photoInput: $("photoInput"),
  selectedPreview: $("selectedPreview"),
  uploadBtn: $("uploadBtn"),
  clearSelectedBtn: $("clearSelectedBtn"),
  uploadProgress: $("uploadProgress"),
  progressBar: $("progressBar"),
  progressText: $("progressText"),
  refreshBtn: $("refreshBtn"),
  fromDate: $("fromDate"),
  toDate: $("toDate"),
  searchName: $("searchName"),
  todayBtn: $("todayBtn"),
  weekBtn: $("weekBtn"),
  clearFilterBtn: $("clearFilterBtn"),
  applyFilterBtn: $("applyFilterBtn"),
  downloadZipBtn: $("downloadZipBtn"),
  deleteSelectedBtn: $("deleteSelectedBtn"),
  selectAllBtn: $("selectAllBtn"),
  unselectAllBtn: $("unselectAllBtn"),
  shareWhatsAppBtn: $("shareWhatsAppBtn"),
  photoList: $("photoList"),
  countText: $("countText"),
  toast: $("toast")
};

document.addEventListener("DOMContentLoaded", () => {
  setTodayFilter();
  bindEvents();
  loadPhotos();
});

function bindEvents() {
  els.photoInput.addEventListener("change", handleFileSelect);
  els.uploadBtn.addEventListener("click", uploadSelectedFiles);
  els.clearSelectedBtn.addEventListener("click", clearSelectedFiles);

  els.refreshBtn.addEventListener("click", loadPhotos);
  els.applyFilterBtn.addEventListener("click", loadPhotos);
  els.todayBtn.addEventListener("click", () => {
    setTodayFilter();
    loadPhotos();
  });
  els.weekBtn.addEventListener("click", () => {
    setCurrentWeekFilter();
    loadPhotos();
  });
  els.clearFilterBtn.addEventListener("click", () => {
    els.fromDate.value = "";
    els.toDate.value = "";
    els.searchName.value = "";
    loadPhotos();
  });

  els.selectAllBtn.addEventListener("click", () => setAllChecked(true));
  els.unselectAllBtn.addEventListener("click", () => setAllChecked(false));
  els.shareWhatsAppBtn.addEventListener("click", shareSelectedToWhatsApp);
  els.downloadZipBtn.addEventListener("click", createZipForSelectedOrFilter);
  els.deleteSelectedBtn.addEventListener("click", deleteSelectedPhotos);
}

function handleFileSelect(event) {
  const files = Array.from(event.target.files || []);
  state.selectedFiles = files;
  renderSelectedPreview();
}

function renderSelectedPreview() {
  if (!state.selectedFiles.length) {
    els.selectedPreview.className = "preview-list empty";
    els.selectedPreview.textContent = "ფოტო ჯერ არჩეული არ არის";
    return;
  }

  els.selectedPreview.className = "preview-list";
  els.selectedPreview.innerHTML = "";

  const baseName = sanitizeFileName(els.photoName.value.trim()) || "PHOTO";

  state.selectedFiles.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "preview-item";

    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.onload = () => URL.revokeObjectURL(img.src);

    const info = document.createElement("div");
    info.className = "preview-info";

    const finalName = buildUploadName(baseName, index, state.selectedFiles.length);
    info.innerHTML = `
      <strong>${escapeHtml(finalName)}</strong>
      <small>${escapeHtml(file.name)} • ${formatBytes(file.size)}</small>
    `;

    const removeBtn = document.createElement("button");
    removeBtn.className = "glass-btn small";
    removeBtn.type = "button";
    removeBtn.textContent = "წაშლა";
    removeBtn.addEventListener("click", () => {
      state.selectedFiles.splice(index, 1);
      renderSelectedPreview();
    });

    item.append(img, info, removeBtn);
    els.selectedPreview.appendChild(item);
  });
}

async function uploadSelectedFiles() {
  if (state.uploading) return;

  const rawName = els.photoName.value.trim();
  const baseName = sanitizeFileName(rawName);

  if (!baseName) {
    showToast("ჯერ ჩაწერე ფოტოს სახელი ან მაღაზიის კოდი");
    els.photoName.focus();
    return;
  }

  if (!state.selectedFiles.length) {
    showToast("ჯერ აირჩიე ან გადაიღე ფოტო");
    return;
  }

  state.uploading = true;
  setUploadUi(true);

  const total = state.selectedFiles.length;

  // Get global (unfiltered) photo count for reliable new-photo detection.
  // One quick API call here avoids the need for a complex count comparison later.
  updateProgress(0, 100, "მზადდება...");
  let globalCountBefore = state.photos.length;
  try {
    const baseline = await jsonp({ action: "list", status: "ACTIVE" });
    if (baseline && baseline.ok) globalCountBefore = (baseline.photos || []).length;
  } catch (e) { /* use filtered count as fallback */ }

  const optimisticBlobUrls = [];

  try {
    for (let i = 0; i < total; i++) {
      const originalFile = state.selectedFiles[i];
      const uploadName = buildUploadName(baseName, i, total);

      const phaseBase = i * 3;
      const phaseTotal = total * 3;

      // Step 1: decode + compress
      updateProgress(phaseBase, phaseTotal, `${i + 1}/${total}: ფოტო იხსნება...`);
      const processed = await prepareImageForUpload(originalFile, uploadName, (msg) => {
        updateProgress(phaseBase + 1, phaseTotal, `${i + 1}/${total}: ${msg}`);
      });

      // Show photo IMMEDIATELY in gallery (optimistic UI) before server confirms
      const blobUrl = URL.createObjectURL(processed.blob);
      optimisticBlobUrls.push(blobUrl);
      addOptimisticPhoto(blobUrl, `${uploadName}.jpg`, els.note.value.trim());

      const expectedFinalName = `${uploadName}.jpg`;
      state.localFileByName.set(
        expectedFinalName.toLowerCase(),
        new File([processed.blob], expectedFinalName, { type: processed.mimeType })
      );

      // Step 2: send to Apps Script
      updateProgress(phaseBase + 2, phaseTotal, `${i + 1}/${total}: სერვერზე იგზავნება...`);
      await postToAppsScript({
        action: "upload",
        fileName: uploadName,
        note: els.note.value.trim(),
        originalName: originalFile.name,
        mimeType: processed.mimeType,
        sizeBytes: processed.blob.size,
        imageBase64: processed.base64
      });
    }

    clearSelectedFiles();
    showToast("გაიგზავნა — სერვერი ამუშავებს...");

    // Poll until the real server photo appears, then swap out the optimistic placeholder
    const appeared = await pollForNewPhotos(globalCountBefore, optimisticBlobUrls);
    if (appeared) {
      showToast("ატვირთვა დასრულდა ✓");
    } else {
      removeOptimisticPhotos(optimisticBlobUrls);
      showToast("გაიგზავნა. სიაში არ ჩანს — ცოტა ხანში განახლება სცადე.");
      await loadPhotos();
    }
  } catch (error) {
    removeOptimisticPhotos(optimisticBlobUrls);
    console.error(error);
    showToast(error.message || "შეცდომა ატვირთვისას");
  } finally {
    state.uploading = false;
    setUploadUi(false);
  }
}

// Add a placeholder photo item to the gallery immediately while uploading
function addOptimisticPhoto(blobUrl, name, note) {
  // Remove loader / empty-state if present
  const placeholder = els.photoList.querySelector(".loader, .empty-state");
  if (placeholder) placeholder.remove();

  const item = document.createElement("div");
  item.className = "photo-item uploading";
  item.dataset.optimisticUrl = blobUrl;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "photo-check";
  checkbox.disabled = true;

  const img = document.createElement("img");
  img.className = "photo-thumb";
  img.src = blobUrl;

  const info = document.createElement("div");
  info.className = "photo-info";
  info.innerHTML = `
    <strong>${escapeHtml(name)}</strong>
    <small>${note ? escapeHtml(note) + " • " : ""}იტვირთება...</small>
  `;

  const linkArea = document.createElement("div");
  linkArea.className = "photo-links";
  linkArea.style.cssText = "color:var(--muted);font-size:12px;padding-right:4px";
  linkArea.textContent = "⏳";

  item.append(checkbox, img, info, linkArea);

  // Prepend so newest photo is at the top
  if (els.photoList.firstChild) {
    els.photoList.insertBefore(item, els.photoList.firstChild);
  } else {
    els.photoList.appendChild(item);
  }

  // Keep count text in sync
  const match = els.countText.textContent.match(/\d+/);
  const prev = match ? parseInt(match[0]) : 0;
  els.countText.textContent = `ნაპოვნია ${prev + 1} ფოტო`;
}

// Remove all optimistic placeholders and free their blob URLs
function removeOptimisticPhotos(blobUrls) {
  (blobUrls || []).forEach(url => URL.revokeObjectURL(url));
  document.querySelectorAll(".photo-item.uploading").forEach(el => el.remove());
}

// Poll every 1.5s (up to 10 times = 15s) until global photo count grows.
// Using no filter for detection so new photo is found regardless of active date/name filter.
async function pollForNewPhotos(globalCountBefore, optimisticBlobUrls, maxAttempts = 10, intervalMs = 1500) {
  const maxSec = Math.round((maxAttempts * intervalMs) / 1000);
  for (let i = 0; i < maxAttempts; i++) {
    const elapsed = Math.round(((i + 1) * intervalMs) / 1000);
    updateProgress(100, 100, `შემოწმება... ${elapsed}/${maxSec}წმ`);
    await sleep(intervalMs);
    try {
      const result = await jsonp({ action: "list", status: "ACTIVE" });
      if (result && result.ok && Array.isArray(result.photos) && result.photos.length > globalCountBefore) {
        removeOptimisticPhotos(optimisticBlobUrls);
        await loadPhotos(); // reload with current filter to display correctly
        return true;
      }
    } catch (e) {
      // network hiccup — keep polling
    }
  }
  return false;
}

function setUploadUi(isUploading) {
  els.uploadBtn.disabled = isUploading;
  els.clearSelectedBtn.disabled = isUploading;
  els.photoInput.disabled = isUploading;
  els.uploadProgress.classList.toggle("hidden", !isUploading);

  if (!isUploading) {
    els.progressBar.style.width = "0%";
    els.progressText.textContent = "იტვირთება...";
  }
}

function updateProgress(done, total, text) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  els.progressBar.style.width = `${percent}%`;
  els.progressText.textContent = text;
}

function clearSelectedFiles() {
  state.selectedFiles = [];
  els.photoInput.value = "";
  renderSelectedPreview();
}

async function loadPhotos() {
  els.photoList.innerHTML = `<div class="loader">იტვირთება...</div>`;
  els.countText.textContent = "ფოტოები იტვირთება...";

  try {
    const params = {
      action: "list",
      status: "ACTIVE",
      from: els.fromDate.value || "",
      to: els.toDate.value || "",
      q: els.searchName.value.trim()
    };

    const result = await jsonp(params);

    if (!result || !result.ok) {
      throw new Error(result && result.error ? result.error : "ფოტოების სია ვერ ჩაიტვირთა");
    }

    state.photos = result.photos || [];
    renderPhotoList();
  } catch (error) {
    console.error(error);
    els.photoList.innerHTML = `<div class="empty-state">შეცდომა: ${escapeHtml(error.message)}</div>`;
    els.countText.textContent = "ვერ ჩაიტვირთა";
  }
}

function renderPhotoList() {
  els.countText.textContent = `ნაპოვნია ${state.photos.length} ფოტო`;

  if (!state.photos.length) {
    els.photoList.innerHTML = `<div class="empty-state">ამ ფილტრით ფოტოები არ არის</div>`;
    return;
  }

  els.photoList.innerHTML = "";

  state.photos.forEach((photo) => {
    const item = document.createElement("div");
    item.className = "photo-item";
    item.dataset.id = photo.ID;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "photo-check";
    checkbox.value = photo.ID;

    const img = document.createElement("img");
    img.className = "photo-thumb";
    img.src = photo.ThumbUrl || photo.ImageUrl || "";
    img.alt = photo.FinalFileName || "";

    const info = document.createElement("div");
    info.className = "photo-info";
    info.innerHTML = `
      <strong>${escapeHtml(photo.FinalFileName || photo.UserFileName || "")}</strong>
      <small>${escapeHtml(photo.DateKey || "")} ${escapeHtml(photo.TimeKey || "")}${photo.Note ? " • " + escapeHtml(photo.Note) : ""}</small>
    `;

    const links = document.createElement("div");
    links.className = "photo-links";

    const viewLink = document.createElement("a");
    viewLink.className = "link-btn";
    viewLink.href = photo.ImageUrl || photo.DisplayUrl || "#";
    viewLink.target = "_blank";
    viewLink.rel = "noopener";
    viewLink.textContent = "ნახვა";

    const downloadLink = document.createElement("a");
    downloadLink.className = "link-btn";
    downloadLink.href = photo.ImageUrl || "#";
    downloadLink.download = photo.FinalFileName || "photo.jpg";
    downloadLink.target = "_blank";
    downloadLink.rel = "noopener";
    downloadLink.textContent = "ჩამოტვირთვა";

    links.append(viewLink, downloadLink);
    item.append(checkbox, img, info, links);

    els.photoList.appendChild(item);
  });
}

async function shareSelectedToWhatsApp() {
  const selected = getSelectedPhotos();

  if (!selected.length) {
    showToast("ჯერ მონიშნე გასაგზავნი ფოტოები");
    return;
  }

  if (!navigator.share) {
    showToast("ამ ბრაუზერში პირდაპირი გაზიარება არ არის მხარდაჭერილი");
    return;
  }

  try {
    showToast("ფოტოები მზადდება გასაგზავნად...");

    const files = [];

    for (const photo of selected) {
      if (state.localFileById.has(photo.ID)) {
        files.push(state.localFileById.get(photo.ID));
        continue;
      }

      const finalNameKey = String(photo.FinalFileName || "").toLowerCase();
      if (finalNameKey && state.localFileByName.has(finalNameKey)) {
        files.push(state.localFileByName.get(finalNameKey));
        continue;
      }

      const file = await downloadPhotoAsFile(photo);
      files.push(file);
    }

    if (!files.length) {
      showToast("გასაგზავნი ფაილი ვერ მომზადდა");
      return;
    }

    if (navigator.canShare && !navigator.canShare({ files })) {
      showToast("ამ ტელეფონზე რამდენიმე ფოტოს პირდაპირ WhatsApp-ზე გაგზავნა არ გამოვიდა. სცადე ნაკლები ფოტო ან სხვა ბრაუზერი.");
      return;
    }

    await navigator.share({ files });

    showToast("გაზიარება გაიხსნა — აირჩიე WhatsApp");
  } catch (error) {
    console.error(error);

    if (error && error.name === "AbortError") {
      showToast("გაზიარება გაუქმდა");
    } else {
      showToast("ფოტოების WhatsApp-ზე გაგზავნა ვერ მოხერხდა ამ ბრაუზერში");
    }
  }
}

async function downloadPhotoAsFile(photo) {
  const url = photo.ImageUrl || photo.DisplayUrl;
  if (!url) throw new Error("ფოტოს URL ცარიელია");

  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error("ფოტოს ჩამოტვირთვა ვერ მოხერხდა");

  const blob = await response.blob();
  const type = blob.type || "image/jpeg";
  const name = photo.FinalFileName || photo.UserFileName || "photo.jpg";

  return new File([blob], name, { type });
}

async function createZipForSelectedOrFilter() {
  const selectedIds = getSelectedIds();

  const params = {
    action: "createZip",
    ids: selectedIds.length ? JSON.stringify(selectedIds) : "",
    from: selectedIds.length ? "" : (els.fromDate.value || ""),
    to: selectedIds.length ? "" : (els.toDate.value || ""),
    q: selectedIds.length ? "" : els.searchName.value.trim()
  };

  if (!selectedIds.length && !params.from && !params.to && !params.q) {
    const ok = confirm("ფილტრი არ გაქვს არჩეული. ZIP-ში ყველა აქტიური ფოტო მოხვდება. გავაგრძელო?");
    if (!ok) return;
  }

  try {
    showToast("ZIP მზადდება...");
    const result = await jsonp(params);

    if (!result || !result.ok) {
      throw new Error(result && result.error ? result.error : "ZIP ვერ შეიქმნა");
    }

    if (result.downloadUrl) {
      window.open(result.downloadUrl, "_blank", "noopener");
      showToast(`ZIP მზადაა: ${result.count} ფოტო`);
    } else {
      showToast("ZIP შეიქმნა, მაგრამ ჩამოტვირთვის ლინკი ვერ მივიღე");
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || "ZIP-ის შექმნა ვერ მოხერხდა");
  }
}

async function deleteSelectedPhotos() {
  const selectedIds = getSelectedIds();

  if (!selectedIds.length) {
    showToast("ჯერ მონიშნე წასაშლელი ფოტოები");
    return;
  }

  const ok = confirm(`ნამდვილად გინდა ${selectedIds.length} ფოტოს წაშლა? ეს ფოტოები ImgBB-დანაც წაიშლება.`);
  if (!ok) return;

  try {
    showToast("ფოტოები იშლება...");

    const result = await jsonp({
      action: "delete",
      ids: JSON.stringify(selectedIds)
    });

    if (!result || !result.ok) {
      throw new Error(result && result.error ? result.error : "წაშლა ვერ მოხერხდა");
    }

    showToast(`წაიშალა: ${(result.deleted || []).length}`);
    await loadPhotos();
  } catch (error) {
    console.error(error);
    showToast(error.message || "წაშლა ვერ მოხერხდა");
  }
}

function getSelectedIds() {
  return Array.from(document.querySelectorAll(".photo-check:checked"))
    .map((checkbox) => checkbox.value)
    .filter(Boolean);
}

function getSelectedPhotos() {
  const ids = new Set(getSelectedIds());
  return state.photos.filter((photo) => ids.has(photo.ID));
}

function setAllChecked(value) {
  document.querySelectorAll(".photo-check").forEach((checkbox) => {
    checkbox.checked = value;
  });
}

function setTodayFilter() {
  const today = toDateInputValue(new Date());
  els.fromDate.value = today;
  els.toDate.value = today;
}

function setCurrentWeekFilter() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;

  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  els.fromDate.value = toDateInputValue(monday);
  els.toDate.value = toDateInputValue(sunday);
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildUploadName(baseName, index, total) {
  const clean = sanitizeFileName(baseName);

  if (els.autoNumber.checked || total > 1) {
    return `${clean}_${String(index + 1).padStart(3, "0")}`;
  }

  return clean;
}

function sanitizeFileName(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|#%{}~&]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

// Decode file to drawable image, using the fast native createImageBitmap where available
async function decodeImageToBitmap(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch (e) { /* fall through to legacy path */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("ფოტოს წაკითხვა ვერ მოხერხდა")); };
    img.src = url;
  });
}

// onProgress(msg) is called at each stage for granular progress display
async function prepareImageForUpload(file, uploadName, onProgress) {
  const isImage = file.type && file.type.startsWith("image/");
  if (!isImage) throw new Error("არჩეული ფაილი ფოტო არ არის");

  onProgress && onProgress("ფოტო იხსნება...");
  const bitmap = await decodeImageToBitmap(file);

  // 1600px max — ~50% fewer pixels than 2200px, significantly faster compress + upload
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.drawImage(bitmap, 0, 0, width, height);
  if (typeof bitmap.close === "function") bitmap.close(); // free ImageBitmap memory

  onProgress && onProgress("კომპრესია...");
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.85); // 0.85 vs 0.9 → ~30% smaller

  onProgress && onProgress("მზადდება...");
  const base64 = await blobToBase64(blob);

  return {
    blob,
    base64,
    mimeType: "image/jpeg",
    finalName: `${uploadName}.jpg`
  };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("ფოტოს მომზადება ვერ მოხერხდა"));
    }, type, quality);
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, ""));
    };

    reader.onerror = () => reject(new Error("ფოტოს Base64-ში გადაყვანა ვერ მოხერხდა"));
    reader.readAsDataURL(blob);
  });
}

async function postToAppsScript(payload) {
  // URLSearchParams (application/x-www-form-urlencoded) is reliably parsed
  // by Apps Script via e.parameter — more stable than raw text/plain JSON.
  const params = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    params.append(key, value === null || value === undefined ? "" : String(value));
  });

  try {
    await fetch(WEB_APP_URL, {
      method: "POST",
      mode: "no-cors",
      body: params
    });
  } catch (err) {
    throw new Error("სერვერთან კავშირი ვერ მოხერხდა: " + (err.message || String(err)));
  }

  return { ok: true };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonp(params) {
  return new Promise((resolve, reject) => {
    const callbackName = `vitrinaCallback_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const url = new URL(WEB_APP_URL);

    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value) !== "") {
        url.searchParams.set(key, String(value));
      }
    });

    url.searchParams.set("callback", callbackName);

    const script = document.createElement("script");
    let finished = false;

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error("სერვერმა პასუხი არ დააბრუნა"));
    }, 45000);

    window[callbackName] = (data) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error("სერვერთან დაკავშირება ვერ მოხერხდა"));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);

  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let toastTimer = null;

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");

  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 3600);
}
