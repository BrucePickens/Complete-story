// ----------------------------
// Globals
// ----------------------------
let stories = { simple: [], medium: [], hard: [] };
let currentStory = null;
let sentenceIdx = 0;
let wordTimer = 1000;
let memoryNotes = JSON.parse(localStorage.getItem("memoryNotes") || "{}");

const flashWord = document.getElementById("flashWord");
const timerInput = document.getElementById("timer");
const timerValue = document.getElementById("timerValue");
const showFullToggle = document.getElementById("showFullToggle");
const speechToggle = document.getElementById("speechToggle");
const showNotesToggle = document.getElementById("showNotesToggle");
const recallInput = document.getElementById("recallInput");

// ----------------------------
// Load Stories
// ----------------------------
fetch("stories.json")
  .then(res => res.json())
  .then(data => {
    stories = data;
    console.log("✅ Stories loaded");
    autoPopulateMemoryNotes();
    renderCategories();
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
function getDescription(wordKey) {
  const key = wordKey.toLowerCase();
  for (const cat in memoryNotes) {
    const found = memoryNotes[cat].find(n => (n.word || "").toLowerCase() === key);
    if (found) return found.desc;
  }
  return null;
}

function appendNoteToText(word, desc) {
  return `${word} (${desc})`;
}

function renderSentence(words) {
  flashWord.innerHTML = "";
  words.forEach(word => {
    const key = word.replace(/[^a-zA-Z]/g, "");
    const span = document.createElement("span");
    span.className = "sequence-word";
    const desc = getDescription(key);
    if (desc && showNotesToggle.checked) {
      span.textContent = appendNoteToText(word, desc);
      span.classList.add("with-note");
    } else {
      span.textContent = word;
    }
    span.addEventListener("click", () => openDescriptionEditor(key, span, word));
    flashWord.appendChild(span);
    flashWord.append(" ");
  });
}

// ----------------------------
// Story Playback
// ----------------------------
function startStory() {
  const diff = document.getElementById("difficulty").value;
  const pool = [...stories[diff]];
  if (pool.length === 0) {
    flashWord.textContent = "❌ No stories available.";
    return;
  }
  currentStory = pool[Math.floor(Math.random() * pool.length)];
  sentenceIdx = 0;
  flashWord.textContent = "▶ Story started. Press Continue.";
}

function playNextSentence() {
  if (!currentStory) return;
  if (sentenceIdx >= currentStory.sentences.length) {
    flashWord.textContent = "✅ End of story.";
    return;
  }
  const words = currentStory.sentences[sentenceIdx].split(/\s+/);
  if (showFullToggle.checked) {
    renderSentence(words);
    speak(words.join(" "));
  } else {
    let wi = 0;
    const tick = () => {
      if (wi >= words.length) return;
      renderSentence([words[wi]]);
      speak(words[wi]);
      wi++;
      setTimeout(tick, wordTimer);
    };
    tick();
  }
  sentenceIdx++;
}

document.getElementById("startBtn").addEventListener("click", startStory);
document.getElementById("continueBtn").addEventListener("click", playNextSentence);
timerInput.addEventListener("input", () => {
  wordTimer = parseInt(timerInput.value);
  timerValue.textContent = wordTimer;
});
document.getElementById("showSequence").addEventListener("click", () => {
  if (!currentStory) return;
  flashWord.innerHTML = currentStory.sentences.join(" ");
});

// ----------------------------
// Recall Checking (simple version)
// ----------------------------
function checkRecall() {
  if (!currentStory) return;
  const reference = currentStory.sentences.join(" ").toLowerCase();
  const attempt = recallInput.value.toLowerCase();
  const matched = attempt.split(/\s+/).filter(w => reference.includes(w)).length;
  const total = reference.split(/\s+/).length;
  document.getElementById("recallResult").textContent =
    `Matched: ${matched}/${total}`;
}
document.getElementById("checkRecall").addEventListener("click", checkRecall);

// ----------------------------
// Memory Notes Auto-Populate
// ----------------------------
const memoryHeader = document.getElementById("memoryHeader");
const memoryContent = document.getElementById("memoryContent");
const categoriesDiv = document.getElementById("categories");

memoryHeader.addEventListener("click", () => {
  memoryContent.style.display = memoryContent.style.display === "none" ? "block" : "none";
});

function saveNotes() {
  localStorage.setItem("memoryNotes", JSON.stringify(memoryNotes));
}

function autoPopulateMemoryNotes() {
  const stopWords = ["the","a","an","and","in","on","at","with","of","to","from","for","by","is","was","were"];
  const categories = { Nouns: [], Verbs: [], Descriptors: [] };

  function classifyWord(word) {
    const w = word.toLowerCase().replace(/[^a-z]/g, "");
    if (!w || stopWords.includes(w)) return null;
    if (w.endsWith("ed") || w.endsWith("s") || ["went","made","took","saw","ran"].includes(w)) return "Verbs";
    if (w.endsWith("ly") || ["big","small","red","blue","happy","sad","quiet","loud"].includes(w)) return "Descriptors";
    return "Nouns";
  }

  ["simple","medium","hard"].forEach(level => {
    stories[level].forEach(story => {
      story.sentences.forEach(s => {
        s.split(/\s+/).forEach(word => {
          const cat = classifyWord(word);
          if (cat) {
            if (!memoryNotes[cat]) memoryNotes[cat] = [];
            if (!memoryNotes[cat].find(n => n.word.toLowerCase() === word.toLowerCase())) {
              memoryNotes[cat].push({ word, desc: "" });
            }
          }
        });
      });
    });
  });

  saveNotes();
}

// ----------------------------
// Memory Notes Rendering
// ----------------------------
function renderCategories() {
  categoriesDiv.innerHTML = "";
  for (const cat in memoryNotes) {
    const div = document.createElement("div");
    div.className = "category-block";

    const header = document.createElement("h4");
    header.textContent = cat;

    const ul = document.createElement("ul");
    memoryNotes[cat].forEach((note, idx) => {
      const li = document.createElement("li");
      li.textContent = `${note.word} → ${note.desc || "(no description)"}`;
      ul.appendChild(li);
    });

    header.addEventListener("click", () => {
      ul.style.display = ul.style.display === "none" ? "block" : "none";
    });

    div.appendChild(header);
    div.appendChild(ul);
    categoriesDiv.appendChild(div);
  }
}

// ----------------------------
// Inline Description Editor
// ----------------------------
function openDescriptionEditor(wordKey, span, originalWord) {
  const existing = span.parentElement.querySelector(".description-box");
  if (existing) existing.remove();

  const editor = document.createElement("div");
  editor.className = "description-box";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Description";
  const current = getDescription(wordKey);
  if (current) input.value = current;

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";

  saveBtn.onclick = () => {
    if (!memoryNotes["Nouns"]) memoryNotes["Nouns"] = [];
    let note = null;
    for (const cat in memoryNotes) {
      note = memoryNotes[cat].find(n => n.word.toLowerCase() === wordKey.toLowerCase());
      if (note) {
        note.desc = input.value;
        break;
      }
    }
    if (!note) {
      memoryNotes["Nouns"].push({ word: wordKey, desc: input.value });
    }
    saveNotes();
    renderCategories();
    editor.remove();
    span.textContent = input.value && showNotesToggle.checked
      ? appendNoteToText(originalWord, input.value)
      : originalWord;
  };

  editor.appendChild(input);
  editor.appendChild(saveBtn);
  span.insertAdjacentElement("afterend", editor);
}
