const STORAGE_KEY = "capture_items_v1";
const API_KEY_STORAGE = "capture_openai_key_v1";

const typeMap = {
  todo: "Todo",
  idea: "灵感",
  reminder: "提醒",
  other: "其他",
};

const recordBtn = document.getElementById("recordBtn");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const wipeBtn = document.getElementById("wipeBtn");
const noteText = document.getElementById("noteText");
const langSelect = document.getElementById("lang");
const engineSelect = document.getElementById("engine");
const apiRow = document.getElementById("apiRow");
const apiKeyInput = document.getElementById("apiKey");
const typeSelect = document.getElementById("type");
const itemsEl = document.getElementById("items");
const statusEl = document.getElementById("status");
const template = document.getElementById("itemTemplate");

let items = loadItems();
let recognition = null;
let speechSupported = false;
let realtimeRecording = false;
let hasResultInSession = false;
let sessionFinalText = "";
let lastRealtimeToggleAt = 0;

let mediaRecorder = null;
let accurateRecording = false;
let audioChunks = [];
let mediaStream = null;
let accurateMimeType = "";

render();
setupSpeech();
setupAccurateUI();

function setupSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    speechSupported = false;
    if (engineSelect.value === "realtime") {
      recordBtn.disabled = true;
      statusEl.textContent = "当前浏览器不支持实时语音识别，请切换到高精度模式";
    }
    return;
  }
  speechSupported = true;
}

function setupAccurateUI() {
  const savedKey = localStorage.getItem(API_KEY_STORAGE) || "";
  apiKeyInput.value = savedKey;
  engineSelect.addEventListener("change", refreshByEngine);
  apiKeyInput.addEventListener("input", () => {
    localStorage.setItem(API_KEY_STORAGE, apiKeyInput.value.trim());
  });
  refreshByEngine();
}

function refreshByEngine() {
  stopAllRecording();

  const accurate = engineSelect.value === "accurate";
  apiRow.classList.toggle("hidden", !accurate);

  if (accurate) {
    recordBtn.disabled = false;
    recordBtn.textContent = accurateRecording ? "停止录音" : "开始录音";
    statusEl.textContent = "高精度模式：点击开始，再点击停止";
    return;
  }

  recordBtn.textContent = "开始识别";
  if (!speechSupported) {
    recordBtn.disabled = true;
    statusEl.textContent = "当前浏览器不支持实时语音识别，请切换到高精度模式";
  } else {
    recordBtn.disabled = false;
    statusEl.textContent = "实时模式：点击开始，再点击停止";
  }
}

function buildRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = langSelect.value;
  recognition.maxAlternatives = 3;

  recognition.onstart = () => {
    realtimeRecording = true;
    hasResultInSession = false;
    sessionFinalText = "";
    recordBtn.classList.add("recording");
    recordBtn.textContent = "停止识别";
    statusEl.textContent = "正在识别，可连续说话";
  };

  recognition.onresult = (event) => {
    let interimText = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const piece = event.results[i]?.[0]?.transcript?.trim() || "";
      if (!piece) continue;
      if (event.results[i].isFinal) {
        sessionFinalText = `${sessionFinalText} ${piece}`.trim();
        hasResultInSession = true;
      } else {
        interimText = `${interimText} ${piece}`.trim();
      }
    }
    const merged = `${sessionFinalText} ${interimText}`.trim();
    if (merged) noteText.value = merged;
    statusEl.textContent = interimText ? "正在识别中..." : "已转文字，可直接保存";
  };

  recognition.onerror = (event) => {
    const err = event?.error || "unknown";
    if (err === "not-allowed" || err === "service-not-allowed") {
      statusEl.textContent = "麦克风权限被拒绝，请在浏览器地址栏开启麦克风权限";
      return;
    }
    if (err === "no-speech") {
      statusEl.textContent = "没有听到声音，请靠近麦克风再试一次";
      return;
    }
    if (err === "audio-capture") {
      statusEl.textContent = "未检测到可用麦克风设备";
      return;
    }
    if (err === "network") {
      statusEl.textContent = "语音服务连接失败，请稍后再试";
      return;
    }
    statusEl.textContent = "识别失败，请再试一次";
  };

  recognition.onend = () => {
    realtimeRecording = false;
    recordBtn.classList.remove("recording");
    if (engineSelect.value === "realtime") recordBtn.textContent = "开始识别";
    sessionFinalText = "";
    if (!hasResultInSession && engineSelect.value === "realtime") {
      statusEl.textContent = "未识别到内容，请慢一点并靠近麦克风";
    } else if (engineSelect.value === "realtime") {
      statusEl.textContent = "识别已结束，点击可继续";
    }
  };

  return recognition;
}

function startRealtimeRecording() {
  if (!speechSupported || realtimeRecording) return;
  const rec = buildRecognition();
  if (!rec) return;
  try {
    rec.start();
  } catch {
    statusEl.textContent = "启动识别失败，请再试一次";
  }
}

function stopRealtimeRecording() {
  if (recognition && realtimeRecording) recognition.stop();
  if (engineSelect.value === "realtime") {
    recordBtn.classList.remove("recording");
    recordBtn.textContent = "开始识别";
    statusEl.textContent = "已停止识别";
  }
}

async function startAccurateRecording() {
  if (accurateRecording) return;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    accurateMimeType = "";
    if (window.MediaRecorder && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      accurateMimeType = "audio/webm;codecs=opus";
    } else if (window.MediaRecorder && MediaRecorder.isTypeSupported("audio/mp4")) {
      accurateMimeType = "audio/mp4";
    }
    mediaRecorder = accurateMimeType
      ? new MediaRecorder(mediaStream, { mimeType: accurateMimeType })
      : new MediaRecorder(mediaStream);
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };
    mediaRecorder.onstop = transcribeAccurateAudio;
    mediaRecorder.start();
    accurateRecording = true;
    recordBtn.classList.add("recording");
    recordBtn.textContent = "停止录音";
    statusEl.textContent = "高精度录音中...";
  } catch {
    statusEl.textContent = "无法启动麦克风，请检查权限";
  }
}

function stopAccurateRecording() {
  if (!mediaRecorder || !accurateRecording) return;
  mediaRecorder.stop();
  accurateRecording = false;
  recordBtn.classList.remove("recording");
  recordBtn.textContent = "开始录音";
  stopMediaTracks();
}

async function transcribeAccurateAudio() {
  const apiKey = (apiKeyInput.value || "").trim();
  if (!apiKey) {
    statusEl.textContent = "请先输入 OpenAI API Key";
    return;
  }
  if (!audioChunks.length) {
    statusEl.textContent = "未录到音频，请重试";
    return;
  }

  statusEl.textContent = "正在高精度转写...";
  try {
    const blobType = accurateMimeType || audioChunks[0]?.type || "audio/webm";
    const ext = blobType.includes("mp4") ? "mp4" : "webm";
    const blob = new Blob(audioChunks, { type: blobType });
    const formData = new FormData();
    formData.append("file", blob, `capture.${ext}`);
    formData.append("model", "gpt-4o-mini-transcribe");
    formData.append("language", langSelect.value.slice(0, 2));

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      statusEl.textContent = "高精度转写失败，请检查 Key 或网络";
      return;
    }

    const data = await res.json();
    const text = (data.text || "").trim();
    if (!text) {
      statusEl.textContent = "没有识别到有效文字";
      return;
    }

    noteText.value = noteText.value ? `${noteText.value} ${text}` : text;
    statusEl.textContent = "高精度转写完成，可直接保存";
  } catch {
    statusEl.textContent = "转写请求失败，请稍后重试";
  }
}

function stopMediaTracks() {
  if (!mediaStream) return;
  mediaStream.getTracks().forEach((track) => track.stop());
  mediaStream = null;
}

function stopAllRecording() {
  stopRealtimeRecording();
  stopAccurateRecording();
}

function canToggleRealtime() {
  const now = Date.now();
  if (now - lastRealtimeToggleAt < 450) return false;
  lastRealtimeToggleAt = now;
  return true;
}

function handleRealtimeToggle() {
  if (engineSelect.value === "accurate") {
    return;
  }
  if (!speechSupported) return;
  if (!canToggleRealtime()) return;
  if (realtimeRecording) {
    stopRealtimeRecording();
  } else {
    recordBtn.textContent = "停止识别";
    statusEl.textContent = "正在启动识别...";
    startRealtimeRecording();
  }
}

recordBtn.addEventListener("touchend", (event) => {
  if (engineSelect.value !== "realtime") return;
  event.preventDefault();
  handleRealtimeToggle();
});

recordBtn.addEventListener("click", () => {
  if (engineSelect.value === "accurate") {
    if (accurateRecording) {
      stopAccurateRecording();
    } else {
      startAccurateRecording();
    }
    return;
  }
  handleRealtimeToggle();
});

saveBtn.addEventListener("click", () => {
  const content = noteText.value.trim();
  if (!content) return;

  items.unshift({
    id: crypto.randomUUID(),
    type: typeSelect.value,
    content,
    createdAt: new Date().toISOString(),
  });

  saveItems();
  render();
  noteText.value = "";
  statusEl.textContent = "已保存";
});

clearBtn.addEventListener("click", () => {
  noteText.value = "";
  statusEl.textContent = "已清空输入";
});

wipeBtn.addEventListener("click", () => {
  if (!confirm("确认清空全部记录？")) return;
  items = [];
  saveItems();
  render();
});

function render() {
  itemsEl.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("li");
    empty.textContent = "还没有记录，开始一次语音收集吧。";
    empty.className = "item";
    itemsEl.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".tag").textContent = typeMap[item.type] || typeMap.other;
    node.querySelector("time").textContent = new Date(item.createdAt).toLocaleString();
    node.querySelector(".content").textContent = item.content;

    node.querySelector(".delete-btn").addEventListener("click", () => {
      items = items.filter((x) => x.id !== item.id);
      saveItems();
      render();
    });

    itemsEl.appendChild(node);
  });
}

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}
