let videoCategories = { categories: {} };

// Tab functionality
function openTab(evt, tabName) {
    let tabcontent = document.getElementsByClassName("tabcontent");
    for (let i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    let tablinks = document.getElementsByClassName("tablinks");
    for (let i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }

    const tabElement = document.getElementById(tabName);
    if (tabElement) {
        tabElement.style.display = "block";
        evt.currentTarget.className += " active";
    } else {
        console.error(`Tab with ID '${tabName}' not found.`);
    }
}

// Default settings
const defaultSettings = {
    timeLimits: {
        "Entertainment": 30,
        "Music": 15,
        "Gaming": 20,
        "Comedy": 15,
        "People & Blogs": 15,
        "Film & Animation": 20,
        "News & Politics": 15
    },
    options: {
        enableAutoblock: true,
        hideRecommendations: true
    }
};

// Initialize settings on load
let currentSettings = {};

// Initialize UI when popup loads
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('scrapeButton').addEventListener('click', async () => {
        const resultsDiv = document.getElementById('results');
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.match(/^https?:\/\/www\.youtube\.com\/(watch|shorts)/)) {
                resultsDiv.innerHTML = '<p class="error">Please open a YouTube video or short first.</p>';
                return;
            }

            // Dynamically inject content script if not already present
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });

            resultsDiv.innerHTML = 'Loading...';
            
            const response = await chrome.tabs.sendMessage(tab.id, { 
                action: "scrapeMetadata"
            });

            if (response.success) {
                resultsDiv.innerHTML = `
                    <h3>${response.title}</h3>
                    <p><strong>Channel:</strong> ${response.channelTitle}</p>
                    <p><strong>Category:</strong> ${response.category || 'N/A'}</p>
                    <p><strong>Tags:</strong> ${response.tags?.join(', ') || 'No tags available'}</p>
                    <p><strong>Description:</strong> ${response.description}</p>
                `;
            } else {
                resultsDiv.innerHTML = `<p class="error">Error: ${response.error}</p>`;
            }
        } catch (error) {
            resultsDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        }
    });

    // Initialize tab functionality
    document.getElementById('timerTabButton').addEventListener('click', (e) => openTab(e, 'TimerTab'));
    document.getElementById('analyticsTabButton').addEventListener('click', (e) => openTab(e, 'AnalyticsTab'));
    document.getElementById('settingsTabButton').addEventListener('click', (e) => openTab(e, 'SettingsTab'));
    
    // Get current timers
    updateTimerDisplay();
    
    // Get current video info
    getCurrentVideoInfo();
    
    // Load analytics data
    loadAnalytics();
    
    // Add other event listeners
    if (document.getElementById('exportDataButton')) {
        document.getElementById('exportDataButton').addEventListener('click', exportAnalyticsData);
    }
    
    if (document.getElementById('saveSettingsButton')) {
        document.getElementById('saveSettingsButton').addEventListener('click', saveSettings);
    }
    
    // Update timer display periodically
    setInterval(updateTimerDisplay, 1000);
});

// Update Settings UI based on loaded settings
function updateSettingsUI() {
    // Update time inputs
    document.getElementById('entertainment-limit').value =
        currentSettings.timeLimits["Entertainment"] || defaultSettings.timeLimits["Entertainment"];
    document.getElementById('music-limit').value =
        currentSettings.timeLimits["Music"] || defaultSettings.timeLimits["Music"];
    document.getElementById('gaming-limit').value =
        currentSettings.timeLimits["Gaming"] || defaultSettings.timeLimits["Gaming"];

    // Update checkboxes
    document.getElementById('enable-autoblock').checked =
        currentSettings.options?.enableAutoblock ?? defaultSettings.options.enableAutoblock;
    document.getElementById('hide-recommendations').checked =
        currentSettings.options?.hideRecommendations ?? defaultSettings.options.hideRecommendations;
}

// Save user settings
function saveSettings() {
    const newSettings = {
        timeLimits: {
            "Entertainment": parseInt(document.getElementById('entertainment-limit').value, 10),
            "Music": parseInt(document.getElementById('music-limit').value, 10),
            "Gaming": parseInt(document.getElementById('gaming-limit').value, 10),
            "Comedy": currentSettings.timeLimits["Comedy"] || defaultSettings.timeLimits["Comedy"],
            "People & Blogs": currentSettings.timeLimits["People & Blogs"] || defaultSettings.timeLimits["People & Blogs"],
            "Film & Animation": currentSettings.timeLimits["Film & Animation"] || defaultSettings.timeLimits["Film & Animation"],
            "News & Politics": currentSettings.timeLimits["News & Politics"] || defaultSettings.timeLimits["News & Politics"]
        },
        options: {
            enableAutoblock: document.getElementById('enable-autoblock').checked,
            hideRecommendations: document.getElementById('hide-recommendations').checked
        }
    };

    // Save to storage
    chrome.storage.local.set({ settings: newSettings }, () => {
        currentSettings = newSettings;

        // Show confirmation
        const settingsSection = document.querySelector('.settings-section');
        const confirmMessage = document.createElement('div');
        confirmMessage.textContent = "Settings saved!";
        confirmMessage.className = "success";
        settingsSection.appendChild(confirmMessage);

        // Remove confirmation message after 2 seconds
        setTimeout(() => {
            settingsSection.removeChild(confirmMessage);
        }, 2000);

        // Update timers with new settings
        chrome.runtime.sendMessage({ action: "updateTimerLimits", settings: newSettings });
    });
}

// Handle YouTube history upload
function handleHistoryUpload() {
    const fileInput = document.getElementById('historyUpload');
    const statusElement = document.getElementById('upload-status');

    if (!fileInput.files || fileInput.files.length === 0) {
        statusElement.textContent = "Please select a file first.";
        statusElement.className = "error";
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    statusElement.textContent = "Reading file...";
    statusElement.className = "";

    reader.onload = (event) => {
        try {
            const historyData = JSON.parse(event.target.result);

            // Process and analyze the history data
            statusElement.textContent = "Processing watch history...";

            // Convert standard YouTube Takeout format to our format if needed
            const processedHistory = convertYouTubeTakeoutFormat(historyData);

            // Send to background script for processing
            chrome.runtime.sendMessage(
                { action: "processWatchHistory", historyData: processedHistory },
                (response) => {
                    if (response && response.success) {
                        statusElement.textContent = "History analysis complete! Your experience is now personalized.";
                        statusElement.className = "success";

                        // Refresh analytics display
                        loadAnalytics();
                    } else {
                        statusElement.textContent = "Error processing history: " + (response?.error || "Unknown error");
                        statusElement.className = "error";
                    }
                }
            );
        } catch (error) {
            statusElement.textContent = "Error parsing file. Please make sure it's a valid JSON file.";
            statusElement.className = "error";
            console.error('JSON Parse Error:', error);
        }
    };

    reader.onerror = () => {
        statusElement.textContent = "Error reading file.";
        statusElement.className = "error";
    };

    reader.readAsText(file);
}

// Convert YouTube Takeout format to our internal format
function convertYouTubeTakeoutFormat(rawData) {
    // Check if this is already in our format
    if (rawData.watchHistory && rawData.userPreferences) {
        return rawData; // Already in our expected format
    }

    // Process YouTube Takeout format
    try {
        // Initialize our format
        const processedData = {
            watchHistory: [],
            userPreferences: {
                productiveCategories: ["Education", "Science & Technology", "News & Politics", "Howto & Style"],
                timeSpentByCategory: {},
                averageSessionLength: 15
            },
            analysisVersion: "1.0"
        };

        // Handle array format from YouTube Takeout
        const historyEntries = Array.isArray(rawData) ? rawData : [];

        // Extract information from each entry
        historyEntries.forEach(entry => {
            // Only process watch history entries (not searches, etc.)
            if (entry.titleUrl && entry.title) {
                // Extract video ID from URL if possible
                let videoId = "";
                if (entry.titleUrl.includes("watch?v=")) {
                    videoId = new URLSearchParams(entry.titleUrl.split("?")[1]).get("v");
                }

                // Guess a category based on title keywords
                const guessedCategory = guessVideoCategory(entry.title);

                // Add to watch history
                processedData.watchHistory.push({
                    title: entry.title,
                    channelTitle: entry.subtitles && entry.subtitles[0] ? entry.subtitles[0].name : "Unknown",
                    videoId: videoId,
                    category: guessedCategory,
                    timestamp: entry.time || new Date().toISOString(),
                    watchDuration: 300 // Default 5 minutes
                });

                // Update category stats
                if (!processedData.userPreferences.timeSpentByCategory[guessedCategory]) {
                    processedData.userPreferences.timeSpentByCategory[guessedCategory] = 0;
                }
                processedData.userPreferences.timeSpentByCategory[guessedCategory] += 300;
            }
        });

        // Limit to most recent 100 videos
        if (processedData.watchHistory.length > 100) {
            processedData.watchHistory = processedData.watchHistory.slice(-100);
        }

        return processedData;
    } catch (error) {
        console.error("Error converting history format:", error);
        // Return base template with original data attached for debugging
        return {
            watchHistory: [],
            userPreferences: {
                productiveCategories: ["Education", "Science & Technology", "News & Politics"],
                timeSpentByCategory: {},
                averageSessionLength: 15
            },
            analysisVersion: "1.0",
            originalData: rawData
        };
    }
}

// Guess video category from title
function guessVideoCategory(title) {
    const lowerTitle = title.toLowerCase();

    // Simple keyword matching for categories
    if (lowerTitle.includes("learn") || lowerTitle.includes("tutorial") ||
        lowerTitle.includes("course") || lowerTitle.includes("lecture") ||
        lowerTitle.includes("how to") || lowerTitle.includes("explained")) {
        return "Education";
    }

    if (lowerTitle.includes("gameplay") || lowerTitle.includes("gaming") ||
        lowerTitle.includes("playthrough") || lowerTitle.includes("game review")) {
        return "Gaming";
    }

    if (lowerTitle.includes("music video") || lowerTitle.includes("song") ||
        lowerTitle.includes("audio") || lowerTitle.includes("official video") ||
        lowerTitle.includes("lyrics")) {
        return "Music";
    }

    if (lowerTitle.includes("news") || lowerTitle.includes("report") ||
        lowerTitle.includes("coverage") || lowerTitle.includes("latest")) {
        return "News & Politics";
    }

    if (lowerTitle.includes("comedy") || lowerTitle.includes("funny") ||
        lowerTitle.includes("prank") || lowerTitle.includes("joke")) {
        return "Comedy";
    }

    if (lowerTitle.includes("tech") || lowerTitle.includes("technology") ||
        lowerTitle.includes("review") || lowerTitle.includes("unboxing")) {
        return "Science & Technology";
    }

    if (lowerTitle.includes("vlog") || lowerTitle.includes("day in the life") ||
        lowerTitle.includes("reaction") || lowerTitle.includes("challenge")) {
        return "People & Blogs";
    }

    // Default category if no match
    return "Entertainment";
}

// Update timer display
function updateTimerDisplay() {
    chrome.runtime.sendMessage({ action: "getTimers" }, (response) => {
        if (!response || !response.timers) return;

        const timers = response.timers;

        // Update entertainment timer
        if (timers["Entertainment"]) {
            const minutes = Math.floor(timers["Entertainment"].remaining / 60);
            const seconds = timers["Entertainment"].remaining % 60;
            document.getElementById('entertainment-timer').textContent =
                `${minutes}:${seconds.toString().padStart(2, '0')}`;

            // Update progress bar
            const percentage = (timers["Entertainment"].remaining / timers["Entertainment"].limit) * 100;
            const progressBar = document.getElementById('entertainment-progress');
            progressBar.value = percentage;

            // Change color based on remaining time
            if (percentage < 25) {
                progressBar.style.accentColor = "red";
            } else if (percentage < 50) {
                progressBar.style.accentColor = "orange";
            } else {
                progressBar.style.accentColor = "";
            }
        }

        // Update music timer
        if (timers["Music"]) {
            const minutes = Math.floor(timers["Music"].remaining / 60);
            const seconds = timers["Music"].remaining % 60;
            document.getElementById('music-timer').textContent =
                `${minutes}:${seconds.toString().padStart(2, '0')}`;

            // Update progress bar
            const percentage = (timers["Music"].remaining / timers["Music"].limit) * 100;
            document.getElementById('music-progress').value = percentage;

            // Change color based on remaining time
            const progressBar = document.getElementById('music-progress');
            if (percentage < 25) {
                progressBar.style.accentColor = "red";
            } else if (percentage < 50) {
                progressBar.style.accentColor = "orange";
            } else {
                progressBar.style.accentColor = "";
            }
        }

        // Update gaming timer
        if (timers["Gaming"]) {
            const minutes = Math.floor(timers["Gaming"].remaining / 60);
            const seconds = timers["Gaming"].remaining % 60;
            document.getElementById('gaming-timer').textContent =
                `${minutes}:${seconds.toString().padStart(2, '0')}`;

            // Update progress bar
            const percentage = (timers["Gaming"].remaining / timers["Gaming"].limit) * 100;
            document.getElementById('gaming-progress').value = percentage;

            // Change color based on remaining time
            const progressBar = document.getElementById('gaming-progress');
            if (percentage < 25) {
                progressBar.style.accentColor = "red";
            } else if (percentage < 50) {
                progressBar.style.accentColor = "orange";
            } else {
                progressBar.style.accentColor = "";
            }
        }
    });
}

// Load analytics data
function loadAnalytics() {
    chrome.runtime.sendMessage({ action: "getAnalytics" }, (response) => {
        if (!response || !response.analytics) {
            document.getElementById('analytics-summary').textContent =
                "No analytics data available yet. Start watching videos or upload your watch history.";
            return;
        }

        const analytics = response.analytics;
        const summaryElem = document.getElementById('analytics-summary');
        const breakdownElem = document.getElementById('category-breakdown');

        // Clear previous content
        summaryElem.innerHTML = '';
        breakdownElem.innerHTML = '';

        // Add summary stats
        const totalVideos = analytics.totalVideos || 0;
        const productivePercent = analytics.productivePercentage || 0;

        summaryElem.innerHTML = `
            <p>Videos watched this session: <strong>${totalVideos}</strong></p>
            <p>Productive content: <strong>${productivePercent}%</strong></p>
            <p>Total viewing time: <strong>${analytics.totalTime || '0 mins'}</strong></p>
        `;

        // Add category breakdown
        if (analytics.categories) {
            Object.keys(analytics.categories).forEach(category => {
                const categoryDiv = document.createElement('div');
                categoryDiv.className = 'category-item';

                const minutes = Math.floor(analytics.categories[category] / 60);

                categoryDiv.innerHTML = `
                    <span>${category}</span>
                    <span>${minutes} mins</span>
                `;

                breakdownElem.appendChild(categoryDiv);
            });
        }
    });
}

// Get current video information
function getCurrentVideoInfo() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (!tabs || tabs.length === 0) {
            console.error("No active tab found.");
            return;
        }

        const tab = tabs[0];
        if (!tab.url || !tab.url.includes('youtube.com')) {
            document.getElementById('video-title').textContent = "Not on YouTube";
            document.getElementById('video-category').textContent = "Category: N/A";
            document.getElementById('video-classification').textContent = "Classification: N/A";
            return;
        }

        // Send message to content script
        chrome.tabs.sendMessage(tab.id, { action: "getCurrentVideoInfo" }, function(response) {
            if (chrome.runtime.lastError) {
                console.error("Error getting video info:", chrome.runtime.lastError.message);
                document.getElementById('video-title').textContent = "Error loading info";
                return;
            }

            if (response && response.success) {
                // Just display title and category
                document.getElementById('video-title').textContent = response.title;
                document.getElementById('video-category').textContent = "Category: " + response.category;
                document.getElementById('video-classification').textContent = 
                    "Classification: " + (response.isProductive ? "Productive" : "Distracting");
            } else {
                document.getElementById('video-title').textContent = "No video detected";
                document.getElementById('video-category').textContent = "Category: Unknown";
                document.getElementById('video-classification').textContent = "Classification: Unknown";
            }
        });
    });
}

// Export analytics data
function exportAnalyticsData() {
    chrome.runtime.sendMessage({ action: "exportAnalytics" }, (response) => {
        if (!response || !response.success) {
            alert("Error exporting analytics data.");
            return;
        }

        // Create download link
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(response.data, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "youtube-wellbeing-data.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    });
}