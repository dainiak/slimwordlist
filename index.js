// Define the current storage version.
const STORAGE_VERSION = "1.0";

// Global state variables
let wordList = [];         // Original list with word objects
let scheduledWords = [];   // Words scheduled for review
let currentIndex = 0;      // Scheduling counter
let isFirstCycle = true;   // Until every word has been seen once, ignore weight-based delays
let currentWord = null;    // Currently displayed word

// Utility: returns a random integer between min and max (inclusive)
function randomDelay(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Computes the delay until the next review.
 * For remembered words (after the first cycle), we use a multiplier based on weight.
 * A cap (e.g. effective weight of 10) is used to avoid extreme delays in long lists.
 * For forgotten words (or during the first cycle), a short delay is used.
 */
function getDelay(wordObj, remembered) {
    if (isFirstCycle) {
        return randomDelay(2, 4);
    }
    if (remembered) {
        const effectiveWeight = Math.min(wordObj.weight, 10);
        return randomDelay(4, 6) * effectiveWeight;
    }
    return randomDelay(2, 4);
}

/**
 * Displays the next word by sorting scheduledWords based on nextReview index.
 * If the next word isn’t “ready” (its nextReview is ahead of currentIndex),
 * we jump the currentIndex forward.
 */
function displayNextWord() {
    const displayElem = document.getElementById('wordDisplay');
    if (scheduledWords.length === 0) {
        displayElem.innerText = "No words scheduled.";
        currentWord = null;
        return;
    }
    // Sort scheduled words by nextReview
    scheduledWords.sort((a, b) => a.nextReview - b.nextReview);
    if (scheduledWords[0].nextReview > currentIndex) {
        currentIndex = scheduledWords[0].nextReview;
    }
    const next = scheduledWords.shift();
    next.timesShown++;
    displayElem.innerText = next.word;
    currentWord = next;
}

// Event: Load word list from textarea.
document.getElementById('loadWords').addEventListener('click', () => {
    const input = document.getElementById('wordInput').value.trim();
    if (!input) return;
    const words = input.split('\n').map(w => w.trim()).filter(w => w !== "");
    // Initialize each word with default weight and review stats.
    wordList = words.map(word => ({
        word: word,
        weight: 1,
        timesShown: 0,
        timesRemembered: 0,
        nextReview: 0
    }));
    scheduledWords = [];
    currentIndex = 0;
    isFirstCycle = true;
    // Initially schedule all words immediately.
    wordList.forEach(item => {
        item.nextReview = currentIndex;
        scheduledWords.push(item);
    });
    displayNextWord();
});

// Event: Handle key presses (+ or -)
document.addEventListener('keydown', (e) => {
    if (!currentWord) return;
    let delay = 0;
    if (e.key === '+') {
        currentWord.timesRemembered++;
        if (!isFirstCycle) {
            currentWord.weight++;  // Increase weight so that the delay grows.
        }
        delay = getDelay(currentWord, true);
    } else if (e.key === '-') {
        if (!isFirstCycle) {
            currentWord.weight = Math.max(1, currentWord.weight - 1); // Ensure weight never drops below 1.
        }
        delay = getDelay(currentWord, false);
    } else {
        return; // Ignore other keys.
    }
    // Schedule currentWord for its next review.
    currentWord.nextReview = currentIndex + delay;
    scheduledWords.push(currentWord);
    currentIndex++;
    // Once every word has been shown at least once, exit first cycle mode.
    if (isFirstCycle && wordList.every(item => item.timesShown > 0)) {
        isFirstCycle = false;
    }
    displayNextWord();
});

// Toggle sidebar visibility.
document.getElementById('toggleSidebar').addEventListener('click', function() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar.style.display === 'none') {
        sidebar.style.display = 'block';
        this.innerText = 'Hide Sidebar';
    } else {
        sidebar.style.display = 'none';
        this.innerText = 'Show Sidebar';
    }
});

/* ------------------------------
   Profile Saving & Loading
   ------------------------------
   The profile data is versioned so that future changes to the storage
   format can be managed gracefully.
*/

// Refresh the profile selector based on localStorage.
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

// Save the current state under a profile name.
document.getElementById('saveProfile').addEventListener('click', () => {
    const name = document.getElementById('profileName').value.trim();
    if (!name) {
        alert('Please enter a profile name.');
        return;
    }
    const profiles = JSON.parse(localStorage.getItem('profiles') || '{}');
    // Package the current state along with a version number.
    const profileData = {
        version: STORAGE_VERSION,
        wordList: wordList,
        scheduledWords: scheduledWords,
        currentIndex: currentIndex,
        isFirstCycle: isFirstCycle
    };
    profiles[name] = profileData;
    localStorage.setItem('profiles', JSON.stringify(profiles));
    updateProfileSelect();
    alert('Profile saved!');
});

// Load a profile from localStorage.
document.getElementById('loadProfile').addEventListener('click', () => {
    const profileName = document.getElementById('profileSelect').value;
    if (!profileName) {
        alert('Please select a profile to load.');
        return;
    }
    const profiles = JSON.parse(localStorage.getItem('profiles') || '{}');
    if (profiles[profileName]) {
        const profileData = profiles[profileName];
        // Check for version mismatches
        if (!profileData.version || profileData.version !== STORAGE_VERSION) {
            console.warn('Profile version mismatch. Attempting to load legacy profile.');
            // Optionally, include migration logic here.
        }
        wordList = profileData.wordList;
        scheduledWords = profileData.scheduledWords;
        currentIndex = profileData.currentIndex;
        isFirstCycle = profileData.isFirstCycle;
        displayNextWord();
        alert('Profile loaded!');
    }
});

// Initialize the profile selection dropdown on page load.
updateProfileSelect();
