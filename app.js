const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "heic", "heif"]);
const VIDEO_EXTENSIONS = new Set(["mov", "mp4", "m4v", "webm"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "ogg", "flac"]);
const STORAGE_KEY = "galeria-social-state-v1";
const DEFAULT_COMMENT_AUTHOR = "Convidado";
const DEFAULT_START_TRACK = "Voltável - Ícaro e Gilmar.mp3";

const audioPanelContainer = document.getElementById("audioPanelContainer");
const galleryElement = document.getElementById("gallery");
const viewer = document.getElementById("viewer");
const viewerMedia = document.getElementById("viewerMedia");
const viewerTitle = document.getElementById("viewerTitle");
const viewerType = document.getElementById("viewerType");
const viewerMeta = document.getElementById("viewerMeta");
const closeViewerButton = document.getElementById("closeViewer");
const hostModeToggle = document.getElementById("hostModeToggle");
const hostHint = document.getElementById("hostHint");
const profilePostsCount = document.getElementById("profilePostsCount");
const profileNameEl = document.getElementById("profileName");
const profileAvatarEl = document.getElementById("profileAvatar");

let mediaItems = [];
let audioItems = [];
let activeAudioFile = "";
let viewerItem = null;
let libheifReady;

const socialState = loadSocialState();
const heicQueue = new Map();
const pendingHeicPreviews = [];
let activeHeicPreviews = 0;
const MAX_HEIC_PREVIEWS = 2;

const heicObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      const button = entry.target;
      const item = mediaItems.find((mediaItem) => mediaItem.fileName === button.dataset.fileName);
      const placeholder = button.querySelector(".media-loading");

      if (item && placeholder && !button.dataset.heicQueued) {
        button.dataset.heicQueued = "true";
        pendingHeicPreviews.push({ item, placeholder });
        drainHeicQueue();
      }

      heicObserver.unobserve(button);
    });
  },
  { rootMargin: "240px 0px" }
);

function loadSocialState() {
  try {
    const rawState = window.localStorage.getItem(STORAGE_KEY);
    if (!rawState) {
      return { hostMode: true, items: {} };
    }

    const parsedState = JSON.parse(rawState);
    return {
      hostMode: parsedState.hostMode !== undefined ? Boolean(parsedState.hostMode) : true,
      items: parsedState.items || {},
    };
  } catch (error) {
    console.warn("Falha ao carregar estado social.", error);
    return { hostMode: true, items: {} };
  }
}

function saveSocialState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(socialState));
}

function getItemSocialState(fileName) {
  if (!socialState.items[fileName]) {
    socialState.items[fileName] = {
      likes: 0,
      liked: false,
      meaning: "",
      comments: [],
    };
  }

  return socialState.items[fileName];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCommentCount(count) {
  return count === 1 ? "1 comentario" : `${count} comentarios`;
}

function humanTypeLabel(item) {
  if (item.type === "video") {
    return `Video ${item.extension.toUpperCase()}`;
  }

  if (item.type === "audio") {
    return `Audio ${item.extension.toUpperCase()}`;
  }

  return `Imagem ${item.extension.toUpperCase()}`;
}

function buildRelativePath(path) {
  return String(path)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function updateHostHint() {
  if (!hostHint) {
    return;
  }

  hostHint.textContent = socialState.hostMode
    ? "Modo host ativo. Agora voce pode escrever ou editar o significado de cada memoria."
    : "Modo visitante ativo. Curtidas e comentarios continuam liberados.";
}

function renderHeader() {
  const imageCount = mediaItems.filter((item) => item.type === "image").length;
  const videoCount = mediaItems.filter((item) => item.type === "video").length;
  const audioCount = audioItems.length;
  const formats = [...new Set([...mediaItems, ...audioItems].map((item) => item.extension.toUpperCase()))].join(" • ");

  // Atualiza contador no topo (se o elemento existir)
  try {
    if (profilePostsCount) {
      profilePostsCount.textContent = `${imageCount + videoCount}`;
    }
    if (profileNameEl && profileNameEl.textContent.trim() === "") {
      profileNameEl.textContent = "Pão de Queijo";
    }
    if (profileAvatarEl && !profileAvatarEl.getAttribute('src')) {
      profileAvatarEl.setAttribute('src', './Perfil.jpeg');
    }
  } catch (e) {
    // não crítico
    console.warn('Falha ao atualizar header:', e);
  }

  renderAudioPlayer(audioCount);
}

function getDefaultStartTrack() {
  return audioItems.find((item) => item.fileName === DEFAULT_START_TRACK) || audioItems[0];
}

function playNextAudioTrack() {
  if (!audioItems.length) {
    return;
  }

  const currentIndex = audioItems.findIndex((item) => item.fileName === activeAudioFile);
  const nextIndex = currentIndex >= 0 && currentIndex < audioItems.length - 1 ? currentIndex + 1 : 0;
  activeAudioFile = audioItems[nextIndex].fileName;
  renderAudioPlayer(audioItems.length);
}

function renderAudioPlayer(audioCount) {
  let player = document.getElementById("ambientAudioPanel");

  if (!audioCount) {
    player?.remove();
    return;
  }

  if (!activeAudioFile || !audioItems.some((item) => item.fileName === activeAudioFile)) {
    activeAudioFile = getDefaultStartTrack().fileName;
  }

  const activeTrack = audioItems.find((item) => item.fileName === activeAudioFile) || audioItems[0];
  if (!player) {
    player = document.createElement("section");
    player.id = "ambientAudioPanel";
    player.className = "audio-panel";
    audioPanelContainer.appendChild(player);
  }

  player.innerHTML = `
    <div class="audio-panel-copy">
      <strong>Trilha da galeria</strong>
      <span>${audioCount} faixa${audioCount === 1 ? "" : "s"} encontrada${audioCount === 1 ? "" : "s"}</span>
    </div>
    <div class="audio-panel-controls">
      <label class="audio-track-picker" for="audioTrackPicker">Faixa</label>
      <select id="audioTrackPicker" class="audio-select">
        ${audioItems
          .map(
            (item) =>
              `<option value="${escapeHtml(item.fileName)}" ${item.fileName === activeTrack.fileName ? "selected" : ""}>${escapeHtml(
                item.fileName
              )}</option>`
          )
          .join("")}
      </select>
      <audio id="ambientAudio" controls preload="metadata">
        <source src="${activeTrack.path}" type="audio/${activeTrack.extension === "mp3" ? "mpeg" : activeTrack.extension}" />
      </audio>
      <p id="audioStatus" class="audio-status">Tentando iniciar a reproducao automaticamente.</p>
    </div>
  `;

  const select = player.querySelector("#audioTrackPicker");
  const audio = player.querySelector("#ambientAudio");
  const status = player.querySelector("#audioStatus");

  select.addEventListener("change", () => {
    activeAudioFile = select.value;
    renderAudioPlayer(audioItems.length);
  });

  audio.addEventListener("ended", () => {
    playNextAudioTrack();
  });

  attemptAudioPlayback(audio, status, activeTrack.fileName);
}

function attemptAudioPlayback(audioElement, statusElement, fileName) {
  const startPlayback = async () => {
    try {
      await audioElement.play();
      statusElement.textContent = `Reproduzindo: ${fileName}`;
      document.removeEventListener("click", startPlayback);
      document.removeEventListener("keydown", startPlayback);
    } catch (error) {
      statusElement.textContent = "O navegador bloqueou o autoplay. Clique em play para ouvir a musica.";
    }
  };

  audioElement.addEventListener("play", () => {
    statusElement.textContent = `Reproduzindo: ${fileName}`;
  });

  audioElement.addEventListener("pause", () => {
    if (!audioElement.ended) {
      statusElement.textContent = "Musica pausada.";
    }
  });

  startPlayback();
  document.addEventListener("click", startPlayback, { once: true });
  document.addEventListener("keydown", startPlayback, { once: true });
}

function createErrorState(message) {
  const element = document.createElement("div");
  element.className = "media-error";
  element.textContent = message;
  return element;
}

function createCard(item) {
  const state = getItemSocialState(item.fileName);
  const card = document.createElement("article");
  card.className = "media-card";
  card.dataset.fileName = item.fileName;

  const postHeader = document.createElement("div");
  postHeader.className = "post-header";
  postHeader.innerHTML = `
    <img class="post-author-avatar" src="./Perfil.jpeg" alt="Avatar de Pão de Queijo" />
    <div class="post-author-copy">
      <strong>Pão de Queijo</strong>
      <span>@paodequeijo</span>
    </div>
  `;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "media-button";
  button.addEventListener("click", () => openViewer(item));

  const badge = document.createElement("span");
  badge.className = "media-badge";
  badge.textContent = item.type === "video" ? "video" : item.extension.toUpperCase();
  button.appendChild(badge);

  if (item.type === "video") {
    const video = document.createElement("video");
    video.src = item.path;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.autoplay = true;
    video.addEventListener("error", () => {
      video.replaceWith(createErrorState("Nao foi possivel reproduzir este video no navegador."));
    });
    const indicator = document.createElement("span");
    indicator.className = "media-play-indicator";
    indicator.textContent = "▶";
    button.appendChild(video);
    button.appendChild(indicator);
  } else if (item.extension === "heic" || item.extension === "heif") {
    const loading = document.createElement("div");
    loading.className = "media-loading";
    loading.textContent = "HEIC pronto para carregar";
    button.appendChild(loading);
    button.dataset.fileName = item.fileName;
    heicObserver.observe(button);
  } else {
    const image = document.createElement("img");
    image.src = item.path;
    image.alt = item.fileName;
    image.loading = "lazy";
    image.addEventListener("error", () => {
      image.replaceWith(createErrorState("Nao foi possivel abrir esta imagem."));
    });
    button.appendChild(image);
  }

  const info = document.createElement("div");
  info.className = "media-info";

  const name = document.createElement("div");
  name.className = "media-name";
  name.textContent = item.fileName;

  const meta = document.createElement("div");
  meta.className = "media-meta";
  meta.textContent = humanTypeLabel(item);

  info.append(name, meta);
  const caption = document.createElement("div");
  caption.className = "post-caption";
  caption.textContent = `${item.fileName} • ${humanTypeLabel(item)}`;
  card.append(postHeader, button, caption, info, createSocialSection(item, state));
  return card;
}

function createSocialSection(item, state) {
  const social = document.createElement("section");
  social.className = "social-panel";

  const meaningMarkup = state.meaning.trim()
    ? `<p class="meaning-text">${escapeHtml(state.meaning)}</p>`
    : '<p class="meaning-text meaning-text-empty">Sem significado escrito ainda.</p>';

  const commentMarkup = state.comments.length
    ? state.comments
        .map(
          (comment) => `
            <article class="comment-item">
              <strong>${escapeHtml(comment.author || DEFAULT_COMMENT_AUTHOR)}</strong>
              <p>${escapeHtml(comment.text)}</p>
            </article>
          `
        )
        .join("")
    : '<p class="comment-empty">Se quiser, deixe o primeiro comentario.</p>';

  social.innerHTML = `
    <div class="action-row">
      <div class="action-group">
        <button class="action-button ${state.liked ? "is-active" : ""}" type="button" data-action="like">${
          state.liked ? "Curtido" : "Curtir"
        }</button>
        <button class="action-button" type="button" data-action="open-viewer">Ampliar</button>
      </div>
      <div class="action-stats">
        <strong>${state.likes} curtidas</strong>
        <span>${formatCommentCount(state.comments.length)}</span>
      </div>
    </div>
    <div class="meaning-block">
      <div class="meaning-label-row">
        <strong>Significado</strong>
        <span>${socialState.hostMode ? "Editavel" : "Publicado"}</span>
      </div>
      <div class="meaning-preview">${meaningMarkup}</div>
      <form class="host-meaning-form ${socialState.hostMode ? "" : "is-hidden"}" data-action="meaning-form">
        <textarea name="meaning" rows="3" placeholder="Escreva aqui o significado desta memoria...">${escapeHtml(
          state.meaning
        )}</textarea>
        <button class="submit-button" type="submit">Salvar significado</button>
      </form>
    </div>
    <div class="comments-block">
      <div class="meaning-label-row">
        <strong>Comentarios</strong>
        <span>${state.comments.length}</span>
      </div>
      <div class="comment-list">${commentMarkup}</div>
      <form class="comment-form" data-action="comment-form">
        <input name="author" maxlength="40" placeholder="Seu nome" value="${DEFAULT_COMMENT_AUTHOR}" />
        <textarea name="comment" rows="2" maxlength="280" placeholder="Escreva um comentario..."></textarea>
        <button class="submit-button" type="submit">Comentar</button>
      </form>
    </div>
  `;

  social.querySelector('[data-action="like"]').addEventListener("click", () => toggleLike(item.fileName));
  social.querySelector('[data-action="open-viewer"]').addEventListener("click", () => openViewer(item));
  social.querySelector('[data-action="meaning-form"]').addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    updateMeaning(item.fileName, String(formData.get("meaning") || ""));
  });
  social.querySelector('[data-action="comment-form"]').addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const author = String(formData.get("author") || DEFAULT_COMMENT_AUTHOR).trim() || DEFAULT_COMMENT_AUTHOR;
    const text = String(formData.get("comment") || "").trim();

    if (!text) {
      return;
    }

    addComment(item.fileName, author, text);
    form.reset();
    form.elements.author.value = author;
  });

  return social;
}

function toggleLike(fileName) {
  const state = getItemSocialState(fileName);
  state.liked = !state.liked;
  state.likes = Math.max(0, state.likes + (state.liked ? 1 : -1));
  saveSocialState();
  refreshSocialSurfaces(fileName);
}

function addComment(fileName, author, text) {
  const state = getItemSocialState(fileName);
  state.comments.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    author,
    text,
  });
  saveSocialState();
  refreshSocialSurfaces(fileName);
}

function updateMeaning(fileName, text) {
  const state = getItemSocialState(fileName);
  state.meaning = text.trim();
  saveSocialState();
  refreshSocialSurfaces(fileName);
}

function refreshSocialSurfaces(fileName) {
  const item = mediaItems.find((mediaEntry) => mediaEntry.fileName === fileName);
  if (!item) {
    return;
  }

  const card = galleryElement.querySelector(`[data-file-name="${CSS.escape(fileName)}"]`);
  if (card) {
    const panel = card.querySelector(".social-panel");
    if (panel) {
      panel.replaceWith(createSocialSection(item, getItemSocialState(fileName)));
    }
  }

  if (viewerItem && viewerItem.fileName === fileName && viewer.open) {
    renderViewerMeta(item);
  }
}

function drainHeicQueue() {
  while (activeHeicPreviews < MAX_HEIC_PREVIEWS && pendingHeicPreviews.length > 0) {
    const nextEntry = pendingHeicPreviews.shift();
    activeHeicPreviews += 1;
    loadHeicInto(nextEntry.item, nextEntry.placeholder).finally(() => {
      activeHeicPreviews -= 1;
      drainHeicQueue();
    });
  }
}

async function getLibheif() {
  if (!libheifReady) {
    if (typeof window.libheif !== "function") {
      throw new Error("Biblioteca HEIC indisponivel.");
    }

    libheifReady = window.libheif();
  }

  return libheifReady;
}

async function convertHeic(item) {
  if (item.convertedUrl) {
    return item.convertedUrl;
  }

  if (heicQueue.has(item.fileName)) {
    return heicQueue.get(item.fileName);
  }

  const promise = (async () => {
    const libheif = await getLibheif();
    const response = await fetch(item.path);

    if (!response.ok) {
      throw new Error(`Falha ao carregar ${item.fileName}`);
    }

    const inputBuffer = await response.arrayBuffer();
    const decoder = new libheif.HeifDecoder();
    const images = decoder.decode(inputBuffer);
    const image = images[0];

    if (!image) {
      throw new Error("Nenhuma imagem HEIC foi encontrada no arquivo.");
    }

    const width = image.get_width();
    const height = image.get_height();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    const imageData = context.createImageData(width, height);

    await new Promise((resolve, reject) => {
      image.display(imageData, (displayData) => {
        if (!displayData) {
          reject(new Error("Falha ao decodificar HEIC para pixels."));
          return;
        }

        context.putImageData(displayData, 0, 0);
        resolve();
      });
    });

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((outputBlob) => {
        if (!outputBlob) {
          reject(new Error("Falha ao gerar blob JPEG a partir do HEIC."));
          return;
        }

        resolve(outputBlob);
      }, "image/jpeg", 0.9);
    });

    item.convertedUrl = URL.createObjectURL(blob);
    return item.convertedUrl;
  })();

  heicQueue.set(item.fileName, promise);
  try {
    return await promise;
  } finally {
    heicQueue.delete(item.fileName);
  }
}

async function loadHeicInto(item, placeholder) {
  try {
    const imageUrl = await convertHeic(item);
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = item.fileName;
    image.loading = "lazy";
    placeholder.replaceWith(image);
  } catch (error) {
    console.error(error);
    placeholder.replaceWith(createErrorState("Nao foi possivel converter este arquivo HEIC neste navegador."));
  }
}

function renderViewerMeta(item) {
  const state = getItemSocialState(item.fileName);
  const meaning = state.meaning.trim() || "Sem significado escrito ainda.";
  const commentsMarkup = state.comments.length
    ? state.comments
        .map(
          (comment) => `
            <article class="viewer-comment-item">
              <strong>${escapeHtml(comment.author || DEFAULT_COMMENT_AUTHOR)}</strong>
              <p>${escapeHtml(comment.text)}</p>
            </article>
          `
        )
        .join("")
    : '<p class="comment-empty">Ainda sem comentarios nesta memoria.</p>';

  viewerMeta.innerHTML = `
    <div class="viewer-social-card">
      <div class="viewer-social-row">
        <button class="action-button ${state.liked ? "is-active" : ""}" type="button" data-viewer-action="like">${
          state.liked ? "Curtido" : "Curtir"
        }</button>
        <div class="action-stats">
          <strong>${state.likes} curtidas</strong>
          <span>${formatCommentCount(state.comments.length)}</span>
        </div>
      </div>
      <div class="viewer-meaning">
        <strong>Significado</strong>
        <p>${escapeHtml(meaning)}</p>
      </div>
      <div class="viewer-comments">
        <strong>Comentarios</strong>
        <div class="viewer-comment-list">${commentsMarkup}</div>
      </div>
    </div>
  `;

  viewerMeta.querySelector('[data-viewer-action="like"]').addEventListener("click", () => toggleLike(item.fileName));
}

async function openViewer(item) {
  viewerItem = item;
  viewerTitle.textContent = item.fileName;
  viewerType.textContent = humanTypeLabel(item);
  viewerMedia.textContent = "";

  if (item.type === "video") {
    const video = document.createElement("video");
    video.src = item.path;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    viewerMedia.appendChild(video);
  } else {
    const image = document.createElement("img");
    image.alt = item.fileName;
    image.src = item.extension === "heic" || item.extension === "heif" ? await convertHeic(item) : item.path;
    viewerMedia.appendChild(image);
  }

  renderViewerMeta(item);
  viewer.showModal();
}

function closeViewer() {
  const media = viewerMedia.querySelector("video");
  if (media) {
    media.pause();
  }

  viewer.close();
  viewerMedia.textContent = "";
  viewerMeta.textContent = "";
  viewerItem = null;
}

function renderGallery() {
  renderHeader();
  galleryElement.textContent = "";

  if (mediaItems.length === 0) {
    galleryElement.innerHTML = '<div class="media-error">Nenhuma midia encontrada na pasta Galeria.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  mediaItems.forEach((item) => fragment.appendChild(createCard(item)));
  galleryElement.appendChild(fragment);
}

async function loadManifest() {
  try {
    const response = await fetch("./media-manifest.json", { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      if (Array.isArray(payload) && payload.length) {
        return payload;
      }
    }
  } catch (error) {
    console.warn("Falha ao carregar manifesto dinamico.", error);
  }

  if (Array.isArray(window.MEDIA_MANIFEST) && window.MEDIA_MANIFEST.length) {
    return window.MEDIA_MANIFEST;
  }

  throw new Error("Nenhum manifesto de midia disponivel.");
}

async function loadAudioManifest() {
  try {
    const response = await fetch("./audio-manifest.json", { cache: "no-store" });
    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    if (!payload) {
      return [];
    }

    return Array.isArray(payload) ? payload : [payload];
  } catch (error) {
    console.warn("Falha ao carregar manifesto de audio. Nenhuma faixa sera carregada.", error);
    return [];
  }
}

function normalizeItems(fileNames) {
  return fileNames.map((fileName) => {
    const extension = fileName.split(".").pop().toLowerCase();
    return {
      fileName,
      extension,
      type: VIDEO_EXTENSIONS.has(extension) ? "video" : "image",
      path: buildRelativePath(`Galeria/${fileName}`),
      convertedUrl: null,
    };
  });
}

function normalizeAudioItems(audioManifest) {
  return audioManifest.map((entry) => {
    const extension = entry.fileName.split(".").pop().toLowerCase();
    return {
      fileName: entry.fileName,
      extension,
      type: "audio",
      path: buildRelativePath(entry.relativePath),
    };
  });
}

async function bootstrap() {
  const [fileNames, audioManifest] = await Promise.all([loadManifest(), loadAudioManifest()]);
  mediaItems = normalizeItems(
    fileNames.filter((fileName) => {
      const extension = fileName.split(".").pop().toLowerCase();
      return IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension);
    })
  );
  audioItems = normalizeAudioItems(
    audioManifest.filter((entry) => {
      const extension = entry.fileName.split(".").pop().toLowerCase();
      return AUDIO_EXTENSIONS.has(extension);
    })
  );

  if (hostModeToggle) {
    hostModeToggle.checked = socialState.hostMode;
    hostModeToggle.addEventListener("change", () => {
      socialState.hostMode = hostModeToggle.checked;
      saveSocialState();
      updateHostHint();
      renderGallery();
    });
  }

  updateHostHint();
  renderGallery();
}


if (closeViewerButton) {
  closeViewerButton.addEventListener("click", closeViewer);
}

viewer.addEventListener("click", (event) => {
  if (event.target === viewer) {
    closeViewer();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && viewer.open) {
    closeViewer();
  }
});

bootstrap().catch((error) => {
  console.error(error);
  try {
    const msg = error && error.message ? error.message : String(error);
    galleryElement.innerHTML = `<div class="media-error">Nao foi possivel carregar a galeria. Erro: ${escapeHtml(msg)}</div>`;
  } catch (e) {
    galleryElement.innerHTML = '<div class="media-error">Nao foi possivel carregar a galeria.</div>';
  }
});
