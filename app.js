const STORAGE_KEY = "capture_items_v1";
const APP_VERSION = "2026.05.26.1";
const VERSION_ENDPOINT = "./version.json";
const VERSION_RELOAD_GUARD_KEY = "capture_reloaded_for_version";

const typeMap = {
  todo: "Todo",
  idea: "灵感",
  reminder: "提醒",
  other: "其他",
};

const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const wipeBtn = document.getElementById("wipeBtn");
const noteText = document.getElementById("noteText");
const itemsEl = document.getElementById("items");
const statusEl = document.getElementById("status");
const versionEl = document.getElementById("version");
const template = document.getElementById("itemTemplate");

let items = loadItems();

render();
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
    // Keep capture available when the lightweight version check cannot complete.
  }
}

function autoClassify(text) {
  const normalizedText = text.toLowerCase();
  const reminderHints = [
    "提醒", "记得", "明天", "后天", "今晚", "今天", "下周", "deadline",
    "due", "before", "by ", "点", "号", "月", "日", "am", "pm",
  ];
  const todoHints = [
    "要", "需要", "去", "做", "完成", "安排", "处理", "买", "修", "提交",
    "发送", "打电话", "todo", "task", "fix", "update",
  ];
  const ideaHints = [
    "想法", "灵感", "也许", "可以", "尝试", "创意", "方案", "点子",
    "idea", "maybe", "could", "brainstorm",
  ];
  const score = { reminder: 0, todo: 0, idea: 0 };

  reminderHints.forEach((hint) => {
    if (normalizedText.includes(hint)) score.reminder += 1;
  });
  todoHints.forEach((hint) => {
    if (normalizedText.includes(hint)) score.todo += 1;
  });
  ideaHints.forEach((hint) => {
    if (normalizedText.includes(hint)) score.idea += 1;
  });

  if (/\b\d{1,2}(:|点)\d{0,2}\b/.test(text) || /\b(明天|后天|今晚|下周)\b/.test(text)) {
    score.reminder += 2;
  }

  const topType = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return !topType || topType[1] === 0 ? "other" : topType[0];
}

noteText.addEventListener("focus", () => {
  statusEl.textContent = "可以键入，或点击键盘麦克风听写";
});

noteText.addEventListener("input", () => {
  statusEl.textContent = noteText.value.trim() ? "内容已收到，点击保存" : "等待输入";
});

saveBtn.addEventListener("click", () => {
  const content = noteText.value.trim();
  if (!content) {
    statusEl.textContent = "请先输入或听写一条内容";
    noteText.focus();
    return;
  }

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
  noteText.focus();
  statusEl.textContent = "已清空，可以继续听写";
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
    empty.textContent = "还没有记录，用键盘麦克风说下第一件事吧。";
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
      items = items.filter((existingItem) => existingItem.id !== item.id);
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
