const STORAGE_KEY = "capture_items_v1";
const APP_VERSION = "2026.05.25.1510";
const VERSION_ENDPOINT = "./version.json";
const VERSION_RELOAD_GUARD_KEY = "capture_reloaded_for_version";

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
const itemsEl = document.getElementById("items");
const statusEl = document.getElementById("status");
const versionEl = document.getElementById("version");
const template = document.getElementById("itemTemplate");

let items = loadItems();
let recognition = null;
let speechSupported = false;
let recording = false;
let hasResultInSession = false;
let finalTextInSession = "";
let lastToggleAt = 0;
let detectedLang = "zh-CN";

render();
setupSpeech();
renderVersion();
checkForUpdate();

function renderVersion() {
  versionEl.textContent = `v${APP_VERSION}`;
}

async function checkForUpdate() {
  try {
    const res = await fetch(`${VERSION_ENDPOINT}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const remoteVersion = String(data.version || "").trim();
    if (!remoteVersion || remoteVersion === APP_VERSION) {
      sessionStorage.removeItem(VERSION_RELOAD_GUARD_KEY);
      return;
    }

    const alreadyReloaded = sessionStorage.getItem(VERSION_RELOAD_GUARD_KEY) === remoteVersion;
    if (alreadyReloaded) return;
    sessionStorage.setItem(VERSION_RELOAD_GUARD_KEY, remoteVersion);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("v", remoteVersion);
    window.location.replace(nextUrl.toString());
  } catch {
    // Ignore update check failures and keep app usable.
  }
}

function setupSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    speechSupported = false;
    recordBtn.disabled = true;
    statusEl.textContent = "当前浏览器不支持语音识别，请手动输入";
    return;
  }

  speechSupported = true;
  detectedLang = detectSpeechLanguage();
  recordBtn.disabled = false;
  recordBtn.textContent = "开始识别";
  statusEl.textContent = `实时模式：自动语言 ${detectedLang}，点击开始`;
}

function detectSpeechLanguage() {
  const raw = (navigator.languages && navigator.languages[0]) || navigator.language || "zh-CN";
  const norm = String(raw).toLowerCase();
  if (norm.startsWith("zh-tw") || norm.startsWith("zh-hk")) return "zh-TW";
  if (norm.startsWith("zh")) return "zh-CN";
  if (norm.startsWith("ja")) return "ja-JP";
  if (norm.startsWith("en")) return "en-US";
  return "zh-CN";
}

function buildRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = detectedLang;
  recognition.maxAlternatives = 3;

  recognition.onstart = () => {
    recording = true;
    hasResultInSession = false;
    finalTextInSession = "";
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
        finalTextInSession = `${finalTextInSession} ${piece}`.trim();
        hasResultInSession = true;
      } else {
        interimText = `${interimText} ${piece}`.trim();
      }
    }

    const merged = `${finalTextInSession} ${interimText}`.trim();
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
    recording = false;
    recordBtn.classList.remove("recording");
    recordBtn.textContent = "开始识别";
    finalTextInSession = "";
    if (!hasResultInSession) {
      statusEl.textContent = "未识别到内容，请慢一点并靠近麦克风";
    } else {
      statusEl.textContent = "识别已结束，点击可继续";
    }
  };

  return recognition;
}

function startRecording() {
  if (!speechSupported || recording) return;
  const rec = buildRecognition();
  if (!rec) return;
  try {
    rec.start();
  } catch {
    statusEl.textContent = "启动识别失败，请再试一次";
  }
}

function stopRecording() {
  if (recognition && recording) recognition.stop();
  if (speechSupported) {
    recordBtn.classList.remove("recording");
    recordBtn.textContent = "开始识别";
  }
}

function canToggle() {
  const now = Date.now();
  if (now - lastToggleAt < 450) return false;
  lastToggleAt = now;
  return true;
}

function toggleRecording() {
  if (!speechSupported || !canToggle()) return;
  if (recording) {
    stopRecording();
  } else {
    recordBtn.textContent = "停止识别";
    statusEl.textContent = "正在启动识别...";
    startRecording();
  }
}

function autoClassify(text) {
  const t = text.toLowerCase();

  const reminderHints = [
    "提醒", "记得", "明天", "后天", "今晚", "今天", "下周", "deadline", "due", "before", "by ", "点", "号", "月", "日", "am", "pm",
  ];
  const todoHints = [
    "要", "需要", "去", "做", "完成", "安排", "处理", "买", "修", "提交", "发送", "打电话", "todo", "task", "fix", "update",
  ];
  const ideaHints = [
    "想法", "灵感", "也许", "可以", "尝试", "创意", "方案", "点子", "idea", "maybe", "could", "brainstorm",
  ];

  const score = { reminder: 0, todo: 0, idea: 0 };
  reminderHints.forEach((k) => {
    if (t.includes(k)) score.reminder += 1;
  });
  todoHints.forEach((k) => {
    if (t.includes(k)) score.todo += 1;
  });
  ideaHints.forEach((k) => {
    if (t.includes(k)) score.idea += 1;
  });

  if (/\b\d{1,2}(:|点)\d{0,2}\b/.test(text) || /\b(明天|后天|今晚|下周)\b/.test(text)) {
    score.reminder += 2;
  }

  const top = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] === 0) return "other";
  return top[0];
}

recordBtn.addEventListener("touchend", (event) => {
  event.preventDefault();
  toggleRecording();
});

recordBtn.addEventListener("click", toggleRecording);

saveBtn.addEventListener("click", () => {
  const content = noteText.value.trim();
  if (!content) return;

  stopRecording();
  const autoType = autoClassify(content);

  items.unshift({
    id: crypto.randomUUID(),
    type: autoType,
    content,
    createdAt: new Date().toISOString(),
  });

  saveItems();
  render();
  noteText.value = "";
  statusEl.textContent = `已保存，并自动分类为：${typeMap[autoType]}`;
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
