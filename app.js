const STORAGE_KEY = "capture_items_v1";

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
const typeSelect = document.getElementById("type");
const itemsEl = document.getElementById("items");
const statusEl = document.getElementById("status");
const template = document.getElementById("itemTemplate");

let items = loadItems();
let recognition = null;
let recording = false;
let hasResultInSession = false;

render();
setupSpeech();

function setupSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    recordBtn.disabled = true;
    statusEl.textContent = "当前浏览器不支持语音识别，请手动输入";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "zh-CN";
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    recording = true;
    hasResultInSession = false;
    recordBtn.classList.add("recording");
    recordBtn.textContent = "正在听...";
    statusEl.textContent = "请说话";
  };

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim() || "";
    if (transcript) {
      hasResultInSession = true;
      noteText.value = noteText.value ? `${noteText.value} ${transcript}` : transcript;
      statusEl.textContent = "已转文字，可直接保存";
    }
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
    recordBtn.textContent = "按住说话";
    if (!hasResultInSession) {
      statusEl.textContent = "未识别到内容，请按住按钮并清晰说话";
    }
  };
}

recordBtn.addEventListener("pointerdown", () => {
  if (!recognition) return;
  if (!recording) {
    recognition.start();
  }
});

const stopRecording = () => {
  if (!recognition || !recording) return;
  recognition.stop();
};

recordBtn.addEventListener("pointerup", stopRecording);
recordBtn.addEventListener("pointerleave", stopRecording);
recordBtn.addEventListener("pointercancel", stopRecording);

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
    empty.textContent = "还没有记录，按下“按住说话”开始。";
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
