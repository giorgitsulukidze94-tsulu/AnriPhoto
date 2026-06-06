const CONFIG = window.VITRINA_CONFIG || {};
const WEB_APP_URL = CONFIG.WEB_APP_URL;

const state = {
  selectedFiles: [],
  photos: [],
  localFileById: new Map(),
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

  try {
    for (let i = 0; i < state.selectedFiles.length; i++) {
      const originalFile = state.selectedFiles[i];
      const uploadName = buildUploadName(baseName, i, state.selectedFiles.length);
      updateProgress(i, state.selectedFiles.length, `მზადდება ${i + 1}/${state.selectedFiles.length}`);

      const processed = await prepareImageForUpload(originalFile, uploadName);

      updateProgress(i, state.selectedFiles.length, `იტვირთება ${i + 1}/${state.selectedFiles.length}`);

      const response = await postToAppsScript({
        action: "upload",
        responseMode: "postMessage",
        fileName: uploadName,
        note: els.note.value.trim(),
        originalName: originalFile.name,
        mimeType: processed.mimeType,
        sizeBytes: processed.blob.size,
        imageBase64: processed.base64
      });

      if (!response || !response.ok) {
        throw new Error(response && response.error ? response.error : "ატვირთვა ვერ მოხერხდა");
      }

      if (response.photo && response.photo.ID) {
        const finalName = response.photo.FinalFileName || `${uploadName}.jpg`;
        const localFile = new File([processed.blob], finalName, { type: processed.mimeType });
        state.localFileById.set(response.photo.ID, localFile);
      }

      updateProgress(i + 1, state.selectedFiles.length, `ატვირთულია ${i + 1}/${state.selectedFiles.length}`);
    }

    showToast("ფოტოები აიტვირთა");
    clearSelectedFiles();
    await loadPhotos();
  } catch (error) {
    console.error(error);
    showToast(error.message || "შეცდომა ატვირთვისას");
  } finally {
    state.uploading = false;
    setUploadUi(false);
  }
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

    await navigator.share({
      files
    });

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
  if (!url) {
    throw new Error("ფოტოს URL ცარიელია");
  }

  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) {
    throw new Error("ფოტოს ჩამოტვირთვა ვერ მოხერხდა");
  }

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

async function prepareImageForUpload(file, uploadName) {
  const isImage = file.type && file.type.startsWith("image/");
  if (!isImage) {
    throw new Error("არჩეული ფაილი ფოტო არ არის");
  }

  const bitmap = await loadImageBitmap(file);
  const maxSide = 2200;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
  const base64 = await blobToBase64(blob);

  return {
    blob,
    base64,
    mimeType: "image/jpeg",
    finalName: `${uploadName}.jpg`
  };
}

function loadImageBitmap(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("ფოტოს წაკითხვა ვერ მოხერხდა"));
    };

    img.src = url;
  });
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

function postToAppsScript(payload) {
  return new Promise((resolve, reject) => {
    const iframeName = `upload_frame_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const form = document.createElement("form");
    const iframe = document.createElement("iframe");

    let finished = false;
    const timeoutMs = 120000;

    iframe.name = iframeName;
    iframe.style.display = "none";

    form.method = "POST";
    form.action = WEB_APP_URL;
    form.target = iframeName;
    form.style.display = "none";
    form.enctype = "application/x-www-form-urlencoded";

    Object.entries(payload).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value == null ? "" : String(value);
      form.appendChild(input);
    });

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      form.remove();
      iframe.remove();
    };

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error("ატვირთვის პასუხი დაგვიანდა"));
    }, timeoutMs);

    const onMessage = (event) => {
      const data = event.data;

      if (!data || data.source !== "vitrina-apps-script") {
        return;
      }

      if (finished) return;

      finished = true;
      clearTimeout(timer);
      cleanup();
      resolve(data.payload);
    };

    window.addEventListener("message", onMessage);

    document.body.appendChild(iframe);
    document.body.appendChild(form);
    form.submit();
  });
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
