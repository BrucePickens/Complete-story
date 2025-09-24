// ----------------------------
// Globals
// ----------------------------
let sentences = { simple: [], medium: [], hard: [] };
let sequenceSets = [];
let currentIdx = 0;
let wordTimer = 1000;

const flashWord = document.getElementById("flashWord");
const timerInput = document.getElementById("timer");
const timerValue = document.getElementById("timerValue");
const showFullToggle = document.getElementById("showFullToggle");
const speechToggle = document.getElementById("speechToggle");
const pauseToggle = document.getElementById("pauseToggle");
const showNotesToggle = document.getElementById("showNotesToggle");
const recallInput = document.getElementById("recallInput");
const partialInput = document.getElementById("partialRecallInput");

let memoryNotes = JSON.parse(localStorage.getItem("memoryNotes") || "{}");
let completedStories = JSON.parse(localStorage.getItem("completedStories") || "[]");

const DEFAULT_CATEGORIES = ["Names", "Animals", "Food", "Buildings", "Places", "Objects", "Days", "Actions"];
DEFAULT_CATEGORIES.forEach(cat => {
  if (!memoryNotes[cat]) memoryNotes[cat] = [];
});
saveNotes();

// ----------------------------
// Load Sentences
// ----------------------------
fetch("stories.json")
  .then(res => res.json())
  .then(data => {
    sentences = data;
    console.log("✅ Stories loaded");
  })
  .catch(err => console.error("❌ Error loading JSON", err));

// ----------------------------
// Speech
// ----------------------------
function speak(text) {
  if (!speechToggle.checked) return;
  if (!("speechSynthesis" in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

// ----------------------------
// Helpers
// ----------------------------
function cleanWordForKey(w) {
  return (w || "").replace(/[^\w]/g, "");
}
function appendNoteToText(originalWord, desc) {
  const m = originalWord.match(/^(.*?)([.!?,;:]+)$/);
  if (m) return `${m[1]} (${desc})${m[2]}`;
  return `${originalWord} (${desc})`;
}
function getDescription(wordKey) {
  const keyLower = wordKey.toLowerCase();
  for (const cat in memoryNotes) {
    const found = memoryNotes[cat].find(n => (n.word || "").toLowerCase() === keyLower);
    if (found) return found.desc;
  }
  return null;
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ----------------------------
// Completed Stories
// ----------------------------
function markStoryDone(title) {
  if (!completedStories.includes(title)) {
    completedStories.push(title);
    localStorage.setItem("completedStories", JSON.stringify(completedStories));
  }
}
function resetStories() {
  completedStories = [];
  localStorage.setItem("completedStories", JSON.stringify(completedStories));
  alert("✅ All stories reset!");
}

// ----------------------------
// Generate & Play
// ----------------------------
function generateSequence() {
  const diff = document.getElementById("difficulty").value;

  // filter out completed stories
  const pool = sentences[diff].filter(story => !completedStories.includes(story.title));
  if (pool.length === 0) {
    alert("⚠️ No unread stories left in this category.");
    return;
  }

  shuffle(pool);
  const chosen = pool[0];

  sequenceSets = chosen.sentences.map(s => s.split(/\s+/));
  currentIdx = 0;

  // mark story as completed
  markStoryDone(chosen.title);

  // reset UI
  recallInput.value = "";
  partialInput.value = "";
  document.getElementById("recallResult").textContent = "";
  document.getElementById("recallMistakes").textContent = "";
  document.getElementById("partialResult").textContent = "";
  document.getElementById("partialMistakes").textContent = "";

  playSentence();
}

function renderSentence(words) {
  flashWord.innerHTML = "";
  words.forEach(word => {
    const key = cleanWordForKey(word);
    const span = document.createElement("span");
    span.className = "sequence-word";
    const desc = getDescription(key);

    span.textContent =
      (desc && showNotesToggle && showNotesToggle.checked)
        ? appendNoteToText(word, desc)
        : word;

    if (desc && showNotesToggle.checked) span.classList.add("with-note");

    span.addEventListener("click", () => openDescriptionEditor(key, span, word));
    flashWord.appendChild(span);
    flashWord.append(" ");
  });
}

function playSentence() {
  if (currentIdx >= sequenceSets.length) {
    flashWord.textContent = "✅ Story complete!";
    return;
  }

  const sentenceWords = sequenceSets[currentIdx];
  const sentenceText = sentenceWords.join(" ");

  if (showFullToggle.checked) {
    renderSentence(sentenceWords);

    if (speechToggle.checked) {
      speak("Next sentence. " + sentenceText);
    }

    if (pauseToggle.checked) {
      return; // stop, wait for Next button
    } else {
      currentIdx++;
      setTimeout(playSentence, wordTimer);
    }
  } else {
    let wi = 0;
    const tick = () => {
      if (wi >= sentenceWords.length) {
        if (pauseToggle.checked) {
          return; // wait for Next
        } else {
          currentIdx++;
          setTimeout(playSentence, wordTimer);
        }
        return;
      }
      renderSentence([sentenceWords[wi]]);
      if (speechToggle.checked) {
        if (wi === 0) {
          speak("Next sentence. " + sentenceWords[wi]);
        } else {
          speak(sentenceWords[wi]);
        }
      }
      wi++;
      setTimeout(tick, wordTimer);
    };
    tick();
  }
}

// ----------------------------
// Next Button
// ----------------------------
document.getElementById("nextSentence").onclick = () => {
  if (currentIdx < sequenceSets.length) {
    currentIdx++;
    playSentence();
  }
};

// ----------------------------
// Recall Scoring
// ----------------------------
function normalizeToken(w) {
  return (w || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}
function allowedDistance(len) {
  if (len <= 4) return 1;
  if (len <= 7) return 2;
  return 3;
}
function compareSequences(input, reference) {
  const inputWords = (input || "").split(/\s+/).map(normalizeToken).filter(Boolean);
  const refWords = reference.map(normalizeToken).filter(Boolean);

  let matched = 0;
  const mistakes = [];

  const maxLen = Math.max(inputWords.length, refWords.length);
  for (let i = 0; i < maxLen; i++) {
    const iw = inputWords[i];
    const rw = refWords[i];

    if (!iw && rw) {
      mistakes.push(`❌ Missing: "${rw}"`);
      continue;
    }
    if (iw && !rw) {
      mistakes.push(`❌ Extra: "${iw}"`);
      continue;
    }

    if (iw === rw) {
      matched++;
    } else {
      const dist = levenshtein(iw, rw);
      if (dist <= allowedDistance(Math.max(iw.length, rw.length))) {
        matched++;
      } else {
        mistakes.push(`❌ Expected "${rw}", got "${iw}"`);
      }
    }
  }

  return { matched, total: refWords.length, mistakes };
}

function checkRecallFull() {
  if (sequenceSets.length === 0) return;
  const reference = sequenceSets.flat();
  const result = compareSequences(recallInput.value, reference);

  document.getElementById("recallResult").textContent =
    `Matched: ${result.matched}/${result.total}`;
  document.getElementById("recallMistakes").innerHTML =
    result.mistakes.length ? result.mistakes.join("<br>") : "✅ Perfect!";
}
function checkPartialRecall() {
  if (sequenceSets.length === 0) return;
  let lastN = parseInt(document.getElementById("lastN").value);
  if (Number.isNaN(lastN) || lastN < 1) lastN = 1;
  lastN = Math.min(lastN, sequenceSets.length);

  const subset = sequenceSets.slice(sequenceSets.length - lastN).flat();
  const result = compareSequences(partialInput.value, subset);

  document.getElementById("partialResult").textContent =
    `Matched: ${result.matched}/${result.total}`;
  document.getElementById("partialMistakes").innerHTML =
    result.mistakes.length ? result.mistakes.join("<br>") : "✅ Perfect!";
}

document.getElementById("checkRecall").addEventListener("click", checkRecallFull);
document.getElementById("checkPartial").addEventListener("click", checkPartialRecall);

// ----------------------------
// Memory Notes
// ----------------------------
const memoryHeader = document.getElementById("memoryHeader");
const memoryContent = document.getElementById("memoryContent");
const categoriesDiv = document.getElementById("categories");
const entryCategory = document.getElementById("entryCategory");
const entryWord = document.getElementById("entryWord");
const entryDesc = document.getElementById("entryDesc");
const addEntryBtn = document.getElementById("addEntryBtn");

memoryHeader.addEventListener("click", () => {
  const open = memoryContent.style.display !== "none";
  memoryContent.style.display = open ? "none" : "block";
  memoryHeader.textContent = open ? "Memory Notes ▼" : "Memory Notes ▲";
});

function saveNotes() {
  localStorage.setItem("memoryNotes", JSON.stringify(memoryNotes));
}
function renderCategories() {
  categoriesDiv.innerHTML = "";
  for (const cat in memoryNotes) {
    const div = document.createElement("div");
    div.className = "category-block";

    const header = document.createElement("h4");
    header.textContent = cat;
    header.style.cursor = "pointer";

    const ul = document.createElement("ul");
    ul.style.display = "none";
    header.onclick = () => { ul.style.display = ul.style.display === "none" ? "block" : "none"; };

    memoryNotes[cat].forEach((note, idx) => {
      const li = document.createElement("li");
      li.textContent = `${note.word} → ${note.desc || ""}`;
      ul.appendChild(li);
    });

    div.appendChild(header);
    div.appendChild(ul);
    categoriesDiv.appendChild(div);
  }
  refreshEntryCategoryDropdown();
}
function refreshEntryCategoryDropdown() {
  entryCategory.innerHTML = "";
  for (const cat in memoryNotes) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    entryCategory.appendChild(opt);
  }
}
addEntryBtn.addEventListener("click", () => {
  const cat = entryCategory.value;
  const word = (entryWord.value || "").trim();
  const desc = (entryDesc.value || "").trim();
  if (!cat || !word) return;
  if (!memoryNotes[cat]) memoryNotes[cat] = [];
  const existing = memoryNotes[cat].find(n => n.word.toLowerCase() === word.toLowerCase());
  if (existing) existing.desc = desc;
  else memoryNotes[cat].push({ word, desc });
  saveNotes();
  renderCategories();
  entryWord.value = "";
  entryDesc.value = "";
});

// Inline word editor
function openDescriptionEditor(wordKey, span, originalWord) {
  const existing = span.parentElement.querySelector(".description-box");
  if (existing) existing.remove();

  const editor = document.createElement("div");
  editor.className = "description-box";

  const dropdown = document.createElement("select");
  for (const cat in memoryNotes) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    dropdown.appendChild(opt);
  }

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Description";
  const current = getDescription(wordKey);
  if (current) input.value = current;

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";

  saveBtn.onclick = () => {
    const cat = dropdown.value;
    if (!memoryNotes[cat]) memoryNotes[cat] = [];
    const existing = memoryNotes[cat].find(n => n.word.toLowerCase() === wordKey.toLowerCase());
    if (existing) existing.desc = input.value;
    else memoryNotes[cat].push({ word: wordKey, desc: input.value });
    saveNotes();
    renderCategories();
    editor.remove();
    span.textContent = input.value ? appendNoteToText(originalWord, input.value) : originalWord;
    if (input.value && showNotesToggle.checked) span.classList.add("with-note");
    else span.classList.remove("with-note");
  };

  editor.appendChild(dropdown);
  editor.appendChild(input);
  editor.appendChild(saveBtn);
  span.insertAdjacentElement("afterend", editor);
}

// ----------------------------
// Import / Export
// ----------------------------
document.getElementById("exportNotes").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(memoryNotes, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "memory_notes.json";
  a.click();
  URL.revokeObjectURL(url);
});
document.getElementById("importBtn").addEventListener("click", () => {
  document.getElementById("importNotes").click();
});
document.getElementById("importNotes").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      memoryNotes = data;
      saveNotes();
      renderCategories();
      alert("✅ Notes imported successfully!");
    } catch {
      alert("❌ Invalid file format.");
    }
  };
  reader.readAsText(file);
});

// ----------------------------
// Search
// ----------------------------
const searchBox = document.getElementById("searchBox");
const searchResult = document.getElementById("searchResult");
searchBox.addEventListener("input", () => {
  const query = (searchBox.value || "").trim().toLowerCase();
  searchResult.innerHTML = "";
  if (!query) return;
  for (const cat in memoryNotes) {
    memoryNotes[cat].forEach(note => {
      if ((note.word || "").toLowerCase().includes(query)) {
        const div = document.createElement("div");
        div.textContent = note.desc || "(no description)";
        searchResult.appendChild(div);
      }
    });
  }
});

// ----------------------------
// Init
// ----------------------------
document.getElementById("startBtn").addEventListener("click", generateSequence);
document.getElementById("resetStories").addEventListener("click", resetStories);
timerInput.addEventListener("input", () => {
  wordTimer = parseInt(timerInput.value);
  timerValue.textContent = wordTimer;
});
renderCategories();
refreshEntryCategoryDropdown();
