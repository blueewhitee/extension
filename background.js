console.log("Service worker started.");

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

// State for category timers
let categoryTimers = {};

// Analytics tracking
let sessionAnalytics = {
    startTime: new Date().toISOString(),
    totalVideos: 0,
    productiveVideos: 0,
    distractingVideos: 0,
    totalTime: 0,  // In seconds
    categories: {},
    videoHistory: []
};

// Current video tracking
let currentVideo = {
    videoId: null,
    category: null,
    startTime: null,
    isProductive: false
};

// Initialize state when extension starts
function initializeState() {
    // Reset timers based on settings
    chrome.storage.local.get(['settings'], (result) => {
        const settings = result.settings || defaultSettings;
        
        // Initialize timers for each category in the settings
        Object.keys(settings.timeLimits).forEach(category => {
            const limitInMinutes = settings.timeLimits[category];
            categoryTimers[category] = {
                limit: limitInMinutes * 60, // Convert to seconds
                remaining: limitInMinutes * 60,
                active: false,
                blocked: false
            };
        });
        
        console.log("Timers initialized:", categoryTimers);
    });
    
    // Initialize analytics for this session
    sessionAnalytics = {
        startTime: new Date().toISOString(),
        totalVideos: 0,
        productiveVideos: 0,
        distractingVideos: 0,
        totalTime: 0,
        categories: {},
        videoHistory: []
    };
}

// Start timer for a specific category
function startCategoryTimer(category) {
    if (!categoryTimers[category]) {
        console.log(`Timer for category ${category} not found. Using default.`);
        // Use Entertainment as default if category not found
        category = "Entertainment";
    }
    
    // Stop any other active timers
    Object.keys(categoryTimers).forEach(cat => {
        if (cat !== category && categoryTimers[cat].active) {
            categoryTimers[cat].active = false;
        }
    });
    
    // Start timer for this category if not blocked
    if (!categoryTimers[category].blocked) {
        categoryTimers[category].active = true;
        console.log(`Timer started for category: ${category}`);
    } else {
        console.log(`Category ${category} is blocked. Timer not started.`);
    }
}

// Stop all active timers
function stopAllTimers() {
    Object.keys(categoryTimers).forEach(category => {
        categoryTimers[category].active = false;
    });
    console.log("All timers stopped");
}

// Update timer values (called every second)
function updateTimers() {
    Object.keys(categoryTimers).forEach(category => {
        if (categoryTimers[category].active && categoryTimers[category].remaining > 0) {
            categoryTimers[category].remaining -= 1;
            
            // Check if timer has reached zero
            if (categoryTimers[category].remaining <= 0) {
                categoryTimers[category].remaining = 0;
                categoryTimers[category].active = false;
                categoryTimers[category].blocked = true;
                
                console.log(`Timer for ${category} has expired. Category blocked.`);
                
                // Notify active tabs about blocked category
                chrome.tabs.query({}, (tabs) => {
                    tabs.forEach(tab => {
                        if (tab.url?.includes('youtube.com')) {
                            chrome.tabs.sendMessage(tab.id, { 
                                action: "categoryBlocked", 
                                category: category 
                            });
                        }
                    });
                });
            }
        }
    });
}

// Process new video data from content script
function processVideoChange(videoData) {
    // Stop current timer if there was one
    if (currentVideo.category && currentVideo.startTime) {
        const duration = Math.floor((Date.now() - currentVideo.startTime) / 1000);
        
        // Update analytics with previous video data
        if (duration > 0) {
            sessionAnalytics.totalTime += duration;
            
            if (!sessionAnalytics.categories[currentVideo.category]) {
                sessionAnalytics.categories[currentVideo.category] = 0;
            }
            sessionAnalytics.categories[currentVideo.category] += duration;
        }
    }
    
    // Reset current video data
    currentVideo = {
        videoId: videoData.videoId,
        category: videoData.category,
        startTime: Date.now(),
        isProductive: videoData.isProductive
    };
    
    // Update session analytics
    sessionAnalytics.totalVideos++;
    if (videoData.isProductive) {
        sessionAnalytics.productiveVideos++;
    } else {
        sessionAnalytics.distractingVideos++;
        
        // Start timer for this category
        startCategoryTimer(videoData.category);
    }
    
    // Add to video history
    sessionAnalytics.videoHistory.push({
        videoId: videoData.videoId,
        title: videoData.title,
        category: videoData.category,
        timestamp: new Date().toISOString(),
        isProductive: videoData.isProductive
    });
    
    console.log("Video change processed:", videoData.title);
}

// Process watch history data
function processWatchHistory(historyData) {
    console.log("Processing watch history with", historyData.length, "entries");
    
    try {
        // Extract categories, channels, and patterns from history
        const categoryCounts = {};
        const channelCounts = {};
        const totalEntries = historyData.length;
        
        // Process each history entry
        historyData.forEach(entry => {
            // Count entries by category (if we can determine it)
            const title = entry.title || "";
            const channelName = entry.subtitles?.[0]?.name || "Unknown";
            
            // Try to guess category from title or other data
            let inferredCategory = inferCategoryFromTitle(title);
            
            if (inferredCategory) {
                if (!categoryCounts[inferredCategory]) {
                    categoryCounts[inferredCategory] = 0;
                }
                categoryCounts[inferredCategory]++;
            }
            
            // Count by channel
            if (!channelCounts[channelName]) {
                channelCounts[channelName] = 0;
            }
            channelCounts[channelName]++;
        });
        
        // Create history analysis summary
        const historyAnalysis = {
            totalEntries,
            categories: categoryCounts,
            topChannels: Object.entries(channelCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([channel, count]) => ({ channel, count })),
            lastUpdated: new Date().toISOString()
        };
        
        // Store analysis for future use
        chrome.storage.local.set({ historyAnalysis }, () => {
            console.log("Watch history analysis saved");
        });
        
        return {
            success: true,
            analysis: historyAnalysis
        };
    } catch (error) {
        console.error("Error processing watch history:", error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Infer video category from title (simple keyword-based approach)
function inferCategoryFromTitle(title) {
    const lowerTitle = title.toLowerCase();
    
    // Gaming keywords
    if (lowerTitle.includes("gameplay") || 
        lowerTitle.includes("gaming") || 
        lowerTitle.includes("playthrough") || 
        lowerTitle.includes("game review")) {
        return "Gaming";
    }
    
    // Music keywords
    if (lowerTitle.includes("official music video") || 
        lowerTitle.includes("audio") || 
        lowerTitle.includes("live performance") ||
        lowerTitle.includes("lyrics")) {
        return "Music";
    }
    
    // Entertainment
    if (lowerTitle.includes("vlog") || 
        lowerTitle.includes("prank") || 
        lowerTitle.includes("reaction") || 
        lowerTitle.includes("challenge")) {
        return "Entertainment";
    }
    
    // Education/Productive
    if (lowerTitle.includes("tutorial") || 
        lowerTitle.includes("how to") || 
        lowerTitle.includes("learn") || 
        lowerTitle.includes("explained") ||
        lowerTitle.includes("documentary")) {
        return "Education";
    }
    
    // News
    if (lowerTitle.includes("news") || 
        lowerTitle.includes("update") || 
        lowerTitle.includes("report")) {
        return "News & Politics";
    }
    
    // Default to Entertainment if we can't determine
    return "Entertainment";
}

// Determine if a video is productive based on its category
function isProductiveCategory(category) {
    const productiveCategories = [
        "Education", 
        "Science & Technology", 
        "News & Politics",
        "Howto & Style"
    ];
    
    return productiveCategories.includes(category);
}

// Startup initialization
chrome.runtime.onStartup.addListener(() => {
    initializeState();
    
    // Set up timer interval
    setInterval(updateTimers, 1000);
});

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed.");
    initializeState();
    
    // Set up timer interval
    setInterval(updateTimers, 1000);
    
    // Initialize with default settings if not already set
    chrome.storage.local.get(['settings'], (result) => {
        if (!result.settings) {
            chrome.storage.local.set({ settings: defaultSettings });
        }
    });
});

// Message listeners
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Background received message:", message.action);
    
    if (message.action === "videoChange") {
        processVideoChange(message.videoData);
        sendResponse({ success: true });
    } 
    else if (message.action === "getTimers") {
        sendResponse({ success: true, timers: categoryTimers });
    } 
    else if (message.action === "getAnalytics") {
        // Calculate productive percentage
        let productivePercentage = 0;
        if (sessionAnalytics.totalVideos > 0) {
            productivePercentage = Math.round(
                (sessionAnalytics.productiveVideos / sessionAnalytics.totalVideos) * 100
            );
        }
        
        // Format time
        const totalMinutes = Math.floor(sessionAnalytics.totalTime / 60);
        const formattedTime = totalMinutes + " mins";
        
        sendResponse({ 
            success: true, 
            analytics: {
                ...sessionAnalytics,
                productivePercentage,
                totalTime: formattedTime
            } 
        });
    } 
    else if (message.action === "updateTimerLimits") {
        const settings = message.settings;
        
        // Update timer limits while preserving current state
        Object.keys(settings.timeLimits).forEach(category => {
            const newLimitInSeconds = settings.timeLimits[category] * 60;
            
            if (categoryTimers[category]) {
                // If timer already exists, update it
                const oldRemaining = categoryTimers[category].remaining;
                const oldLimit = categoryTimers[category].limit;
                const remainingPercentage = oldRemaining / oldLimit;
                
                // Update limit and calculate new remaining time
                categoryTimers[category].limit = newLimitInSeconds;
                categoryTimers[category].remaining = Math.round(newLimitInSeconds * remainingPercentage);
            } else {
                // Create new timer for this category
                categoryTimers[category] = {
                    limit: newLimitInSeconds,
                    remaining: newLimitInSeconds,
                    active: false,
                    blocked: false
                };
            }
        });
        
        sendResponse({ success: true });
    } 
    else if (message.action === "processWatchHistory") {
        const result = processWatchHistory(message.historyData);
        sendResponse(result);
    } 
    else if (message.action === "exportAnalytics") {
        // Prepare data for export
        const exportData = {
            sessionData: sessionAnalytics,
            timerData: categoryTimers,
            exportDate: new Date().toISOString()
        };
        
        sendResponse({ success: true, data: exportData });
    }
    
    // Return true for async response
    return true;
});

// Reset timers on YouTube navigation away
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        const isYouTube = changeInfo.url.includes('youtube.com');
        
        if (!isYouTube) {
            // User navigated away from YouTube
            stopAllTimers();
        }
    }
});

// Store the YouTube API key
chrome.storage.sync.set({ youtubeApiKey: 'AIzaSyDBBQfrtsRQdnWyFZ9cZHp_JaC4GgeJ_Gs' }, function() {
    console.log('API Key is set');
});