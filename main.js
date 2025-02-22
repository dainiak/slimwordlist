// Define the current storage version.
const STORAGE_VERSION = "1.0";

// Tunable scheduling parameters:
const REQUIRED_APPEARANCES = 2;  // k: required forced appearances when a word is forgotten.
const WINDOW_SIZE = 8;           // K: within the next K cards.
const BONUS_FACTOR = 1000;       // Multiplier to boost priority for words that need repetition.
const EXTRA_BONUS = 500;         // Additional bonus if the forced deadline is already passed.

const isInDarkMode = false;

// Global state variables
let wordList = [];         // Array of word objects.
// Each word object: { word, weight, timesShown, timesRemembered, lastShownStep, dueCount, dueDeadline }
let currentStep = 0;       // Global counter of how many cards have been shown.
let currentWord = null;    // The currently displayed word.

// Global key bindings (defaults) loaded from localStorage if available.
let keyBindings = { remember: '+', forgot: '-' };

/* =============================
   Persistence Functions
============================= */
/**
 * Saves the current key bindings to localStorage.
 */
function persistKeyBindings() {
    localStorage.setItem('keyBindings', JSON.stringify(keyBindings));
}

/**
 * Loads key bindings from localStorage, if they exist, and updates the modal inputs.
 */
function loadKeyBindings() {
    const stored = localStorage.getItem('keyBindings');
    if (stored) {
        keyBindings = JSON.parse(stored);
        document.getElementById('rememberKeyModal').value = keyBindings.remember;
        document.getElementById('forgotKeyModal').value = keyBindings.forgot;
    }
}

/**
 * Saves the current state (word stats and scheduling info) to localStorage.
 */
function autoSaveState() {
    const currentState = {
        version: STORAGE_VERSION,
        wordList,
        currentStep
    };
    localStorage.setItem('currentState', JSON.stringify(currentState));
}

/**
 * Loads the saved state from localStorage, if available.
 */
function loadCurrentState() {
    const saved = localStorage.getItem('currentState');
    if (saved) {
        const state = JSON.parse(saved);
        if (state.version === STORAGE_VERSION) {
            wordList = state.wordList;
            currentStep = state.currentStep;
            displayNextWord();
            updateHistogram();
        }
    }
}

/* =============================
   Utility Functions
============================= */
// Returns a random integer between min and max (inclusive)
function randomDelay(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Shows a Bootstrap toast with the given message and title.
 * @param {string} message - The message to display in the toast body.
 * @param {string} [title=''] - Optional title for the toast header.
 */
function showToast(message, title = '') {
    const container = document.getElementById('toastContainer');
    const toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');
    toastEl.innerHTML = `
        <div class="toast-header">
            <strong class="me-auto">${title}</strong>
            <small>just now</small>
            <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body">
            ${message}
        </div>
    `;
    container.appendChild(toastEl);

    // Initialize and show the toast with a 5-second delay
    const bsToast = new bootstrap.Toast(toastEl, { delay: 5000 });
    bsToast.show();

    // Remove the toast element from the DOM after it hides.
    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });
}

/* =============================
   Scheduling Functions
============================= */
/**
 * Computes a priority score for a word.
 *
 * The score is based on:
 * - How long it’s been since the word was last shown (the longer, the higher the score).
 * - A bonus if the word has pending forced repetitions (dueCount).
 * - An extra bonus if the forced deadline (dueDeadline) has passed.
 */
function computePriority(word) {
    const lastShown = word.lastShownStep || 0;
    const gap = currentStep - lastShown; // How many steps since last shown.
    let score = gap;
    if (word.dueCount && word.dueCount > 0) {
        score += BONUS_FACTOR * word.dueCount;
        if (currentStep >= word.dueDeadline) {
            score += EXTRA_BONUS;
        }
    }
    return score;
}

/**
 * Scans the entire word list and returns the word with the highest computed priority.
 * If a word has pending forced repetitions (dueCount), we also decrement it.
 */
function chooseNextWord() {
    if (wordList.length === 0) return null;

    // Determine candidates.
    let candidates = wordList;
    if (wordList.length > 1 && currentWord) {
        candidates = wordList.filter(word => word.word !== currentWord.word);
    }

    let bestWord = null;
    let bestScore = -Infinity;
    for (let word of candidates) {
        const score = computePriority(word);
        if (score > bestScore) {
            bestScore = score;
            bestWord = word;
        }
    }

    // Fallback if no candidate is found.
    if (!bestWord) {
        bestWord = wordList[0];
    }

    // Update the chosen word's lastShownStep.
    bestWord.lastShownStep = currentStep;
    // Decrement dueCount if necessary.
    if (bestWord.dueCount && bestWord.dueCount > 0) {
        bestWord.dueCount = Math.max(0, bestWord.dueCount - 1);
    }

    return bestWord;
}

/**
 * Displays the next word by scanning the whole word list.
 */
function displayNextWord() {
    const displayElem = document.getElementById('wordDisplay');
    const next = chooseNextWord();
    if (!next) {
        displayElem.innerText = "No words loaded.";
        currentWord = null;
        return;
    }
    currentWord = next;
    displayElem.innerText = next.word;
    autoSaveState();
}

/* =============================
   Histogram Functions
============================= */
/**
 * Updates the Vega-Lite histogram showing performance.
 */
function updateHistogram() {
    const chartData = [];
    wordList.forEach(item => {
        chartData.push({
            word: item.word,
            type: "Correct",
            count: item.timesRemembered || 0
        });
        chartData.push({
            word: item.word,
            type: "Incorrect",
            count: (item.timesShown || 0) - (item.timesRemembered || 0)
        });
    });

    const spec = {
        $schema: "https://vega.github.io/schema/vega-lite/v5.20.1.json",
        description: "Histogram of correct and incorrect answers",
        title: "Histogram of correct answers",
        data: { values: chartData },
        width: "container",
        height: 300,
        config: {view: {continuousWidth: 300, continuousHeight: 300}},
        mark: {type: "bar"},
        encoding: {
            x: {
                field: "word",
                type: "nominal",
                axis: { labelAngle: -45, title: "Word" }
            },
            y: {
                field: "count",
                type: "quantitative",
                title: "Count"
            },
            color: {
                field: "type",
                type: "nominal"
            }
        }
    };

    vegaEmbed("#vegaChart", spec, {
        actions: false,
        renderer: "svg",
        theme: isInDarkMode ? "dark" : "default",
    }).catch(console.error);
}

/* =============================
   Profile Functions
============================= */
/**
 * Saves the current profile (word list and state) into localStorage.
 */
function saveProfile() {
    const name = document.getElementById('profileName').value.trim();
    if (!name) {
        alert('Please enter a profile name.');
        return;
    }
    const profiles = JSON.parse(localStorage.getItem('profiles') || '{}');
    const profileData = {
        version: STORAGE_VERSION,
        wordList,
        currentStep
    };
    profiles[name] = profileData;
    localStorage.setItem('profiles', JSON.stringify(profiles));
    updateProfileSelect();
    showToast('Profile saved!');
    autoSaveState();
}

/**
 * Loads a selected profile from localStorage and updates the word list textarea.
 */
function loadProfile() {
    const profileName = document.getElementById('profileSelect').value;
    if (!profileName) {
        alert('Please select a profile to load.');
        return;
    }
    const profiles = JSON.parse(localStorage.getItem('profiles') || '{}');
    if (profiles[profileName]) {
        const profileData = profiles[profileName];
        if (!profileData.version || profileData.version !== STORAGE_VERSION) {
            console.warn('Profile version mismatch. Attempting to load legacy profile.');
        }
        wordList = profileData.wordList;
        currentStep = profileData.currentStep;
        // Populate the word input textarea with words from the loaded profile.
        document.getElementById('wordInput').value = wordList.map(item => item.word).join('\n');
        displayNextWord();
        updateHistogram();
        showToast('Profile loaded!');
        autoSaveState();
    }
}

/**
 * Deletes the selected profile.
 */
function deleteProfile() {
    const profileSelect = document.getElementById('profileSelect');
    const profileName = profileSelect.value;
    if (!profileName) {
        alert('Please select a profile to delete.');
        return;
    }
    if (!confirm(`Are you sure you want to delete profile "${profileName}"?`)) {
        return;
    }
    const profiles = JSON.parse(localStorage.getItem('profiles') || '{}');
    delete profiles[profileName];
    localStorage.setItem('profiles', JSON.stringify(profiles));
    updateProfileSelect();
    showToast(`Profile "${profileName}" deleted.`);
}

/**
 * Renames the selected profile.
 */
function renameProfile() {
    const profileSelect = document.getElementById('profileSelect');
    const oldName = profileSelect.value;
    if (!oldName) {
        alert('Please select a profile to rename.');
        return;
    }
    const newName = prompt("Enter new name for the profile:", oldName);
    if (!newName || newName.trim() === "") {
        alert("Invalid profile name.");
        return;
    }
    const profiles = JSON.parse(localStorage.getItem('profiles') || '{}');
    if (profiles[newName]) {
        alert("A profile with that name already exists.");
        return;
    }
    // Save the profile data under the new name and remove the old one.
    profiles[newName] = profiles[oldName];
    delete profiles[oldName];
    localStorage.setItem('profiles', JSON.stringify(profiles));
    updateProfileSelect();
    showToast(`Profile renamed to "${newName}".`);
}

/**
 * Updates the profile selection dropdown.
 */
function updateProfileSelect() {
    const profiles = JSON.parse(localStorage.getItem('profiles') || '{}');
    const profileSelect = document.getElementById('profileSelect');
    profileSelect.innerHTML = '<option value="">Select Profile</option>';
    for (let key in profiles) {
        const option = document.createElement('option');
        option.value = key;
        option.innerText = key;
        profileSelect.appendChild(option);
    }
}

/**
 * Automatically saves the new word list as a new profile.
 */
function autoSaveNewProfile() {
    const profiles = JSON.parse(localStorage.getItem('profiles') || '{}');
    const autoProfileName = "AutoProfile " + Date.now();
    const profileData = {
        version: STORAGE_VERSION,
        wordList,
        currentStep
    };
    profiles[autoProfileName] = profileData;
    localStorage.setItem('profiles', JSON.stringify(profiles));
    updateProfileSelect();
    showToast(`Profile auto-saved as "${autoProfileName}"`);
}

/* =============================
   Word List Functions
============================= */
/**
 * Loads the word list from the textarea and initializes each word.
 * Also auto-saves the new word list as a profile.
 */
function loadWordsHandler() {
    const input = document.getElementById('wordInput').value.trim();
    if (!input) return;
    const words = input.split('\n').map(w => w.trim()).filter(w => w !== "");
    // Initialize each word.
    wordList = words.map(word => ({
        word: word,
        weight: 1,
        timesShown: 0,
        timesRemembered: 0,
        lastShownStep: 0,
        dueCount: 0,
        dueDeadline: 0
    }));
    currentStep = 0;
    displayNextWord();
    updateHistogram();
    autoSaveState();
    showToast("Words loaded");
    // Automatically save as a new profile.
    autoSaveNewProfile();
}

/* =============================
   Clear Stats Function
============================= */
/**
 * Clears statistics for the current word list while preserving the words.
 */
function clearStats() {
    wordList.forEach(word => {
        word.timesShown = 0;
        word.timesRemembered = 0;
        word.lastShownStep = 0;
        word.dueCount = 0;
        word.dueDeadline = 0;
    });
    currentStep = 0;
    updateHistogram();
    autoSaveState();
    showToast("Stats cleared for current word list.");
}

/* =============================
   Export/Import Functions
============================= */
/**
 * Exports the currently selected (or current) profile as a JSON file.
 */
function exportProfile() {
    // Try to export the profile selected in the dropdown,
    // otherwise export the current state.
    const profileSelect = document.getElementById('profileSelect');
    let profileName = profileSelect.value;
    let profileData;
    if (profileName) {
        const profiles = JSON.parse(localStorage.getItem('profiles') || '{}');
        profileData = profiles[profileName];
        if (!profileData) {
            alert("Profile not found for export.");
            return;
        }
        profileData.profileName = profileName;
    } else {
        profileData = {
            profileName: "CurrentProfile",
            version: STORAGE_VERSION,
            wordList,
            currentStep
        };
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(profileData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", (profileData.profileName || "profile") + ".json");
    document.body.appendChild(downloadAnchorNode); // Required for Firefox.
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

/**
 * Handles a dropped JSON file to import a profile.
 */
function handleFileDrop(e) {
    e.preventDefault();
    if (e.dataTransfer.items) {
        for (let i = 0; i < e.dataTransfer.items.length; i++) {
            if (e.dataTransfer.items[i].kind === 'file') {
                let file = e.dataTransfer.items[i].getAsFile();
                if (file.type === "application/json" || file.name.endsWith(".json")) {
                    let reader = new FileReader();
                    reader.onload = function(event) {
                        try {
                            const importedProfile = JSON.parse(event.target.result);
                            // Validate the imported profile.
                            if (!importedProfile.version || !importedProfile.wordList || importedProfile.currentStep === undefined) {
                                alert("Invalid profile format.");
                                return;
                            }
                            let profileName = importedProfile.profileName || prompt("Enter a name for the imported profile:", "ImportedProfile");
                            if (!profileName) {
                                alert("Profile import cancelled: no name provided.");
                                return;
                            }
                            const profiles = JSON.parse(localStorage.getItem('profiles') || '{}');
                            if (profiles[profileName]) {
                                if (!confirm("A profile with this name already exists. Overwrite?")) {
                                    return;
                                }
                            }
                            profiles[profileName] = importedProfile;
                            localStorage.setItem('profiles', JSON.stringify(profiles));
                            updateProfileSelect();
                            showToast(`Profile "${profileName}" imported successfully.`);
                        } catch (err) {
                            alert("Error parsing JSON: " + err);
                        }
                    }
                    reader.readAsText(file);
                } else {
                    alert("Please drop a valid JSON file.");
                }
            }
        }
    }
}

/* =============================
   Answer Processing Functions
============================= */
/**
 * Processes the answer for the current word, provides visual feedback,
 * updates the word's statistics and forced-repetition info, and then displays the next word.
 */
function processAnswer(answerType) {
    if (!currentWord) return;
    const cardElem = document.getElementById('wordCard');
    const feedbackColor = (answerType === 'remember') ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 255, 0, 0.3)';
    cardElem.style.backgroundColor = feedbackColor;

    // Update timesShown.
    currentWord.timesShown = (currentWord.timesShown || 0) + 1;

    if (answerType === 'remember') {
        currentWord.timesRemembered = (currentWord.timesRemembered || 0) + 1;
        // Clear any pending forced repetitions.
        currentWord.dueCount = 0;
    } else if (answerType === 'forgot') {
        // Set up forced repetitions.
        currentWord.dueCount = REQUIRED_APPEARANCES;
        currentWord.dueDeadline = currentStep + WINDOW_SIZE;
    }

    // After 0.5 seconds, reset feedback, increment the step, and update display.
    setTimeout(() => {
        cardElem.style.backgroundColor = '';
        currentStep++;  // Increment global step.
        displayNextWord();
        updateHistogram();
        autoSaveState();
    }, 500);
}

/* =============================
   Key Bindings Functions
============================= */
/**
 * Handles key press events using the configured key bindings.
 */
function handleKeyPress(e) {
    if (!currentWord) return;
    if (e.key === keyBindings.remember) {
        processAnswer('remember');
    } else if (e.key === keyBindings.forgot) {
        processAnswer('forgot');
    }
}

/**
 * Saves key bindings from the modal into a global variable and persists them.
 */
function saveKeyBindings() {
    const rememberKey = document.getElementById('rememberKeyModal').value.trim() || '+';
    const forgotKey = document.getElementById('forgotKeyModal').value.trim() || '-';
    keyBindings = { remember: rememberKey, forgot: forgotKey };
    persistKeyBindings();
}

/* =============================
   Event Listeners & Initialization
============================= */
document.getElementById('loadWords').addEventListener('click', loadWordsHandler);
document.getElementById('saveProfile').addEventListener('click', saveProfile);
document.getElementById('loadProfile').addEventListener('click', loadProfile);
document.getElementById('deleteProfile').addEventListener('click', deleteProfile);
document.getElementById('renameProfile').addEventListener('click', renameProfile);
document.getElementById('clearStats').addEventListener('click', clearStats);
document.getElementById('exportProfile').addEventListener('click', exportProfile);
document.getElementById('saveKeyBindings').addEventListener('click', saveKeyBindings);
document.getElementById('toggleSidebar').addEventListener('click', function() {
    const sidebar = document.getElementById('sidebar');
    const restore = document.getElementById('restoreSidebar');
    if (sidebar.style.display === 'none') {
        sidebar.style.display = 'block';
        restore.style.display = 'none';
        this.innerText = 'Hide Sidebar';
    } else {
        sidebar.style.display = 'none';
        restore.style.display = 'block';
        this.innerText = 'Show Sidebar';
    }
});

// Restore sidebar when the restore widget is clicked.
document.getElementById('restoreSidebar').addEventListener('click', function() {
    const sidebar = document.getElementById('sidebar');
    sidebar.style.display = 'block';
    this.style.display = 'none';
    document.getElementById('toggleSidebar').innerText = 'Hide Sidebar';
});

// Add global event listeners for drag & drop (for importing profiles).
document.addEventListener('dragover', function(e) {
    e.preventDefault();
});
document.addEventListener('drop', function(e) {
    e.preventDefault();
    handleFileDrop(e);
});

document.addEventListener('keydown', handleKeyPress);

loadKeyBindings();
loadCurrentState();
updateProfileSelect();
