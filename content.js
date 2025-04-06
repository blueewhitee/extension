// Variables to track current video
let currentVideoId = null;
let currentVideoCategory = null;
let currentAnalysis = null;
let videoCategories = { categories: {} };
let blockOverlayActive = false;

// Test session storage functionality
function testSessionStorage() {
  try {
    // Test if sessionStorage is available
    sessionStorage.setItem('test', 'test');
    const testValue = sessionStorage.getItem('test');
    sessionStorage.removeItem('test');
    
    console.log('Session storage test result:', testValue === 'test' ? 'WORKING' : 'FAILED');
    return testValue === 'test';
  } catch (error) {
    console.error('Session storage test ERROR:', error.message);
    return false;
  }
}

// Run test immediately
const sessionStorageWorking = testSessionStorage();
console.log('Session storage available:', sessionStorageWorking);

// Simplified list of productive categories
const productiveCategories = [
    "Education",
    "Science & Technology",
    "News & Politics",
    "Howto & Style",
    "Documentary"
];

// Configuration for recommended viewing times (in minutes) based on category
const categoryTimeRecommendations = {
    "Film & Animation": 20,
    "Autos & Vehicles": 15,
    "Music": 10,
    "Pets & Animals": 10,
    "Sports": 15,
    "Short Movies": 10,
    "Travel & Events": 15,
    "Gaming": 20,
    "Videoblogging": 10,
    "People & Blogs": 15,
    "Comedy": 15,
    "Entertainment": 15,
    "News & Politics": 15,
    "Howto & Style": 20,
    "Education": 30,
    "Science & Technology": 25,
    "Movies": 30,
    "Documentary": 30
};

// Default viewing time for unknown categories (in minutes)
const DEFAULT_VIEWING_TIME = 15;

// Load video categories
fetch(chrome.runtime.getURL('videoCategories.json'))
    .then(response => response.json())
    .then(data => {
        console.log('Loaded Video Categories:', data);
        videoCategories = data;
    })
    .catch(error => console.error('Error loading categories:', error));

// Import config with API key and system prompt
import { CONFIG } from './config.js';

// Global variable to store user watch history
let userWatchHistory = null;

// Global variable to store user analysis data
let userAnalysisData = null;

// Initialize watch history on content script load
function initializeWatchHistory() {
    // Try to load user's custom watch history first
    chrome.storage.local.get(['watchHistory'], function(result) {
        if (result.watchHistory) {
            console.log('Loaded custom watch history');
            userWatchHistory = result.watchHistory;
        } else {
            // If no custom history, load the base template
            console.log('Loading base watch history template');
            loadBaseWatchHistory();
        }
    });
}

// Function to load user analysis data
function initializeUserAnalysis() {
    chrome.storage.local.get(['userAnalysis'], function(result) {
        if (result.userAnalysis) {
            console.log('Loaded user analysis data');
            userAnalysisData = result.userAnalysis;
        } else {
            console.log('No user analysis data found');
        }
    });
}

// Load base watch history template
function loadBaseWatchHistory() {
    fetch(chrome.runtime.getURL('baseHistory.json'))
        .then(response => response.json())
        .then(data => {
            userWatchHistory = data;
            console.log('Loaded base watch history template');
        })
        .catch(error => {
            console.error('Error loading base watch history:', error);
            // Create minimal watch history if loading fails
            userWatchHistory = {
                watchHistory: [],
                userPreferences: {
                    productiveCategories: ["Education", "Science & Technology", "News & Politics"],
                    timeSpentByCategory: {}
                },
                analysisVersion: "1.0"
            };
        });
}

// Function to detect video changes and auto-scrape
function setupVideoChangeDetection() {
    let lastVideoId = '';

    function checkForVideoChange() {
        let currentVideoId = '';

        if (window.location.href.includes('/shorts/')) {
            currentVideoId = window.location.href.split('/shorts/')[1];
            if (currentVideoId.includes('?')) {
                currentVideoId = currentVideoId.split('?')[0];
            }
        } else if (window.location.href.includes('/watch')) {
            currentVideoId = new URLSearchParams(window.location.search).get('v');
        }

        if (currentVideoId && currentVideoId !== lastVideoId) {
            console.log('Video changed, analyzing metadata for:', currentVideoId);
            lastVideoId = currentVideoId;
            analyzeCurrentVideo(currentVideoId);
        } else if (!currentVideoId) {
            console.warn('No video ID detected in the current URL.');
            return; // Skip analysis if no video ID is found
        }
    }

    setInterval(checkForVideoChange, 1000);

    const pushState = history.pushState;
    history.pushState = function() {
        pushState.apply(history, arguments);
        setTimeout(checkForVideoChange, 500);
    };

    window.addEventListener('popstate', () => {
        setTimeout(checkForVideoChange, 500);
    });

    checkForVideoChange();
}

// Function to analyze current video metadata
function analyzeCurrentVideo(videoId) {
    chrome.storage.sync.get(['youtubeApiKey'], function(result) {
        const apiKey = result.youtubeApiKey;
        if (!apiKey) {
            console.error('API Key not found');
            return;
        }

        fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=AIzaSyDBBQfrtsRQdnWyFZ9cZHp_JaC4GgeJ_Gs`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`API Error: ${response.status} ${response.statusText}`);
                }
                return response.json();
            })
            .then(async data => {
                console.log('API Response:', data);
                if (!data.items || data.items.length === 0) {
                    throw new Error('No video data available');
                }

                const snippet = data.items[0].snippet;
                const stats = data.items[0].statistics;
                const contentDetails = data.items[0].contentDetails;
                const categoryId = snippet.categoryId;
                const category = videoCategories.categories[categoryId] || 'Unknown';
                
                // Get duration if available
                let duration = 0;
                if (contentDetails && contentDetails.duration) {
                    duration = parseDuration(contentDetails.duration);
                }
                
                // Create video metadata
                const videoData = {
                    videoId: videoId,
                    title: snippet.title,
                    channelTitle: snippet.channelTitle,
                    category: category,
                    categoryId: categoryId,
                    views: stats.viewCount || '0',
                    likes: stats.likeCount || '0',
                    publishedAt: snippet.publishedAt,
                    duration: duration,
                    isShort: window.location.href.includes('/shorts/') || duration < 60
                };
                
                // Enhanced analysis with Gemini and user patterns
                const enhancedData = await analyzeVideoWithGemini(videoData);
                
                // Save current video info
                currentVideoId = videoId;
                currentVideoCategory = category;
                currentAnalysis = {
                    isProductive: enhancedData.isProductive,
                    category: category,
                    recommendedTime: enhancedData.recommendedTime,
                    reason: enhancedData.analysisReason,
                    potentialTransitions: enhancedData.potentialTransitions
                };
                
                console.log('Enhanced video analysis:', enhancedData);
                
                // Send video data to background script
                chrome.runtime.sendMessage({ 
                    action: "videoChange", 
                    videoData: enhancedData 
                });
                
                // Check if category is blocked and show overlay if needed
                checkCategoryBlocking(category);
            })
            .catch(error => {
                console.error('Video analysis error:', error);
            });
    });
}

// Helper function to parse ISO 8601 duration
function parseDuration(duration) {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    
    const hours = (match[1] && match[1].slice(0, -1)) || 0;
    const minutes = (match[2] && match[2].slice(0, -1)) || 0;
    const seconds = (match[3] && match[3].slice(0, -1)) || 0;
    
    return hours * 3600 + minutes * 60 + seconds * 1;
}

// Extract relevant aspects of user analysis for video assessment
function extractRelevantAnalysis(videoCategory) {
    if (!userAnalysisData) return null;
    
    try {
        // Extract top categories (limit to 5)
        const topCategories = userAnalysisData.categories
            .slice(0, 5)
            .map(cat => `${cat.name} (${Math.round(cat.percentage * 100)}%)`);
        
        // Get format preferences
        const formatPreference = userAnalysisData.formatDistribution;
        
        // Get relevant psychological patterns (those with high evidence)
        const relevantPatterns = userAnalysisData.psychologicalPatterns
            .filter(pattern => pattern.evidenceStrength > 0.55)
            .map(pattern => ({
                title: pattern.title,
                description: pattern.description.split('.')[0] + '.',  // First sentence only
                strength: pattern.evidenceStrength
            }));
        
        // Get relevant transitions (from this category or to this category)
        const relevantTransitions = userAnalysisData.categoryTransitions
            .filter(transition => 
                transition.from === videoCategory || 
                transition.to === videoCategory)
            .map(transition => ({
                from: transition.from,
                to: transition.to,
                strength: transition.strength
            }));
        
        // Key insights
        const insights = userAnalysisData.keyInsights;
        
        // Create a condensed context
        return {
            topCategories,
            formatPreference,
            relevantPatterns: relevantPatterns.slice(0, 3),  // Limit to 3 patterns
            relevantTransitions: relevantTransitions.slice(0, 3),  // Limit to 3 transitions
            dominantTopics: userAnalysisData.dominantTopics.slice(0, 3),  // Top 3 topics
            categoryInsight: insights.categoryInsight,
            formatInsight: insights.formatInsight
        };
    } catch (error) {
        console.error('Error extracting relevant analysis:', error);
        return null;
    }
}

// Format the analysis data for the Gemini prompt
function formatAnalysisForPrompt(analysisData, videoMetadata) {
    if (!analysisData) return "No personal viewing data available.";
    
    let promptContext = `USER VIEWING PATTERNS:

Top Categories: ${analysisData.topCategories.join(', ')}

Format Preference: ${analysisData.formatPreference.shortForm}% short-form, ${analysisData.formatPreference.longForm}% long-form

`;

    if (analysisData.relevantPatterns.length > 0) {
        promptContext += `Psychological Patterns:
${analysisData.relevantPatterns.map(p => `- ${p.title} (Strength: ${p.strength}): ${p.description}`).join('\n')}

`;
    }

    if (analysisData.relevantTransitions.length > 0) {
        promptContext += `Relevant Category Transitions:
${analysisData.relevantTransitions.map(t => `- From ${t.from} to ${t.to} (Strength: ${t.strength})`).join('\n')}

`;
    }

    promptContext += `Dominant Topics: ${analysisData.dominantTopics.map(t => t.name).join(', ')}

Key Insights: 
- ${analysisData.categoryInsight.split('.')[0]}.
- ${analysisData.formatInsight.split('.')[0]}.`;

    return promptContext;
}

// Analyze video with Gemini API using rich analysis context
async function analyzeVideoWithGemini(videoMetadata) {
    try {
        console.log('Analyzing video with Gemini:', videoMetadata.title);
        
        // Extract relevant analysis based on video category
        const relevantAnalysis = extractRelevantAnalysis(videoMetadata.category);
        
        // Format analysis for prompt
        const analysisContext = formatAnalysisForPrompt(relevantAnalysis, videoMetadata);
        
        // Determine if this is short or long form content
        const isShortForm = window.location.href.includes('/shorts/') || 
                           (videoMetadata.duration && videoMetadata.duration < 60);
        const contentFormat = isShortForm ? "short-form" : "long-form";
        
        // Create prompt for Gemini
        const prompt = {
            contents: [
                {
                    role: "system",
                    parts: [{ text: CONFIG.SYSTEM_PROMPT }]
                },
                {
                    role: "user",
                    parts: [{ 
                        text: `Analyze this YouTube video based on the video metadata and user viewing patterns:
                        
VIDEO METADATA:
Title: ${videoMetadata.title}
Channel: ${videoMetadata.channelTitle}
Category: ${videoMetadata.category}
Format: ${contentFormat}
Views: ${videoMetadata.views || 'Unknown'}
Publication Date: ${videoMetadata.publishedAt || 'Unknown'}

${analysisContext}`
                    }]
                }
            ]
        };
        console.log("Content script loaded on:", window.location.href);
        // Call Gemini API
        const response = await fetch(`${CONFIG.API_ENDPOINT}?key=${CONFIG.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(prompt)
        });
        
        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Extract analysis from Gemini response
        const analysisText = data.candidates[0].content.parts[0].text;
        
        // Clean the response text (remove markdown formatting if present)
        const cleanedText = analysisText.replace(/```json|```/g, '').trim();
        
        // Parse the JSON response
        const analysis = JSON.parse(cleanedText);
        
        console.log('Gemini analysis:', analysis);
        
        // Update video metadata with analysis
        videoMetadata.isProductive = analysis.classification === "productive";
        videoMetadata.recommendedTime = analysis.recommendedTime;
        videoMetadata.analysisReason = analysis.reason;
        videoMetadata.potentialTransitions = analysis.potentialTransitions;
        
        // Show recommendation to user
        showTimeRecommendation(videoMetadata, analysis);
        
        return videoMetadata;
    } catch (error) {
        console.error('Error analyzing with Gemini:', error);
        
        // Fallback to basic category-based analysis
        videoMetadata.isProductive = isProductiveCategory(videoMetadata.category);
        videoMetadata.recommendedTime = getCategoryDefaultTime(videoMetadata.category);
        videoMetadata.analysisReason = "Based on video category (fallback analysis)";
        
        showTimeRecommendation(videoMetadata, {
            classification: videoMetadata.isProductive ? "productive" : "distracting",
            recommendedTime: videoMetadata.recommendedTime,
            reason: videoMetadata.analysisReason
        });
        
        return videoMetadata;
    }
}

// Get default time recommendation based on category
function getCategoryDefaultTime(category) {
    const defaultTimes = {
        "Entertainment": 15,
        "Music": 10,
        "Gaming": 20,
        "Comedy": 15,
        "People & Blogs": 15,
        "Film & Animation": 20,
        "News & Politics": 15,
        "Education": 25,
        "Science & Technology": 25,
        "Howto & Style": 20
    };
    
    return defaultTimes[category] || 15; // Default to 15 minutes
}

// Function to display time recommendation to user
function showTimeRecommendation(videoData, analysis) {
    // Remove any existing notification
    const existingNotification = document.getElementById('wellbeing-time-recommendation');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create new notification
    const notification = document.createElement('div');
    notification.id = 'wellbeing-time-recommendation';
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.backgroundColor = 'rgba(33, 33, 33, 0.9)';
    notification.style.color = 'white';
    notification.style.padding = '15px';
    notification.style.borderRadius = '4px';
    notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    notification.style.zIndex = '9999';
    notification.style.width = '300px';
    
    // Set notification content
    const productiveLabel = analysis.classification === 'productive' ? 
        '<span style="color: #4CAF50;">Productive</span>' : 
        '<span style="color: #FF9800;">Distracting</span>';
    
    notification.innerHTML = `
        <h3 style="margin-top: 0; margin-bottom: 10px; font-size: 16px;">Recommendation</h3>
        <p style="margin: 5px 0; font-size: 14px;">This content is ${productiveLabel}</p>
        <p style="margin: 5px 0; font-size: 14px;">Recommended viewing time: <strong>${analysis.recommendedTime} minutes</strong></p>
        <p style="margin: 5px 0; font-size: 12px; color: #CCC;">${analysis.reason || ''}</p>
    `;
    
    // Add close button
    const closeButton = document.createElement('div');
    closeButton.innerHTML = '×';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '5px';
    closeButton.style.right = '10px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.fontSize = '20px';
    closeButton.onclick = () => notification.remove();
    
    notification.appendChild(closeButton);
    notification.style.position = 'relative';
    
    // Add to page
    document.body.appendChild(notification);
    
    // Update current video section in popup
    updateCurrentVideoSection(videoData.title, videoData.category);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 10000);
}

// Function to update current video section in popup
function updateCurrentVideoSection(title, category) {
    // Send updated information to popup
    chrome.runtime.sendMessage({
        action: "updateCurrentVideo",
        data: {
            title: title || "Not available",
            category: category || "Unknown"
        }
    });
}

// Function to check if the category is blocked
function checkCategoryBlocking(category) {
    chrome.runtime.sendMessage({ action: "getTimers" }, (response) => {
        if (!response || !response.timers) return;
        
        const timers = response.timers;
        
        // Check if this category is blocked
        if (timers[category] && timers[category].blocked) {
            console.log(`Category ${category} is blocked. Showing overlay.`);
            showBlockingOverlay(category);
        } else {
            // Make sure overlay is removed if category is not blocked
            removeBlockingOverlay();
        }
    });
}

// Function to determine if a category is productive
function isProductiveCategory(category) {
    return productiveCategories.includes(category);
}

// Function to show blocking overlay
function showBlockingOverlay(category) {
    if (blockOverlayActive) return;
    
    // Create overlay element
    const overlay = document.createElement('div');
    overlay.id = 'wellbeing-block-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.color = 'white';
    overlay.style.fontFamily = 'Arial, sans-serif';
    overlay.style.textAlign = 'center';
    overlay.style.padding = '20px';
    
    // Add content to overlay
    overlay.innerHTML = `
        <h1 style="font-size: 24px; margin-bottom: 20px;">Time Limit Reached</h1>
        <p style="font-size: 18px; margin-bottom: 15px;">You've reached your daily limit for <strong>${category}</strong> videos.</p>
        <p style="font-size: 16px; margin-bottom: 30px;">Consider watching something more productive instead!</p>
        <div style="display: flex; gap: 15px;">
            <button id="wellbeing-suggestions-btn" style="padding: 10px 15px; background-color: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">Show Productive Alternatives</button>
            <button id="wellbeing-override-btn" style="padding: 10px 15px; background-color: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">Override (15 minutes)</button>
        </div>
    `;
    
    // Add to body
    document.body.appendChild(overlay);
    blockOverlayActive = true;
    
    // Pause video if playing
    const video = document.querySelector('video');
    if (video && !video.paused) {
        video.pause();
    }
    
    // Add event listeners
    document.getElementById('wellbeing-suggestions-btn').addEventListener('click', showProductiveSuggestions);
    document.getElementById('wellbeing-override-btn').addEventListener('click', temporaryOverride);
}

// Function to remove blocking overlay
function removeBlockingOverlay() {
    const overlay = document.getElementById('wellbeing-block-overlay');
    if (overlay) {
        overlay.remove();
        blockOverlayActive = false;
    }
}

// Function to show productive alternatives
function showProductiveSuggestions() {
    // Replace overlay content with suggestions
    const overlay = document.getElementById('wellbeing-block-overlay');
    if (!overlay) return;
    
    // Get related keywords from current video title
    const videoTitle = document.querySelector('h1.title.style-scope.ytd-video-primary-info-renderer')?.textContent || '';
    const keywords = extractKeywords(videoTitle);
    
    // Create suggestion content
    overlay.innerHTML = `
        <h1 style="font-size: 24px; margin-bottom: 20px;">Productive Alternatives</h1>
        <p style="font-size: 16px; margin-bottom: 20px;">Here are some educational alternatives related to your interests:</p>
        <div id="wellbeing-suggestions" style="display: flex; flex-direction: column; gap: 15px; margin-bottom: 20px;">
            <p>Loading suggestions...</p>
        </div>
        <button id="wellbeing-close-btn" style="padding: 10px 15px; background-color: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">Back to YouTube</button>
    `;
    
    // Add event listener for close button
    document.getElementById('wellbeing-close-btn').addEventListener('click', () => {
        removeBlockingOverlay();
        
        // Redirect to YouTube homepage
        window.location.href = 'https://www.youtube.com/';
    });
    
    // Generate educational suggestions based on keywords
    generateSuggestions(keywords);
}

// Function to extract keywords from title
function extractKeywords(title) {
    // Remove common filler words
    const fillerWords = ['the', 'and', 'or', 'but', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'with', 'by'];
    
    // Split title into words and filter out filler words
    const words = title.toLowerCase().split(/\s+/);
    const keywords = words.filter(word => {
        // Remove punctuation
        const cleanWord = word.replace(/[^\w\s]/gi, '');
        // Check if it's not a filler word and at least 3 characters
        return cleanWord.length >= 3 && !fillerWords.includes(cleanWord);
    });
    
    // Return up to 3 keywords
    return keywords.slice(0, 3);
}

// Function to generate productive video suggestions
function generateSuggestions(keywords) {
    const searchTerm = keywords.join(' ') + ' tutorial';
    
    chrome.storage.sync.get(['youtubeApiKey'], function(result) {
        const apiKey = result.youtubeApiKey;
        if (!apiKey) {
            console.error('API Key not found');
            return;
        }
        
        // Search for educational videos related to keywords
        fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchTerm)}&type=video&videoCategoryId=27&maxResults=3&key=${apiKey}`)
            .then(response => response.json())
            .then(data => {
                if (!data.items || data.items.length === 0) {
                    throw new Error('No suggestions available');
                }
                
                // Populate suggestions
                const suggestionsDiv = document.getElementById('wellbeing-suggestions');
                suggestionsDiv.innerHTML = '';
                
                data.items.forEach(item => {
                    const videoId = item.id.videoId;
                    const title = item.snippet.title;
                    const thumbnail = item.snippet.thumbnails.medium.url;
                    const channelTitle = item.snippet.channelTitle;
                    
                    const suggestionItem = document.createElement('div');
                    suggestionItem.style.display = 'flex';
                    suggestionItem.style.gap = '10px';
                    suggestionItem.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                    suggestionItem.style.padding = '10px';
                    suggestionItem.style.borderRadius = '4px';
                    suggestionItem.style.cursor = 'pointer';
                    
                    suggestionItem.innerHTML = `
                        <img src="${thumbnail}" style="width: 120px; height: 68px; object-fit: cover;">
                        <div style="display: flex; flex-direction: column; justify-content: center; text-align: left;">
                            <div style="font-weight: bold; margin-bottom: 5px;">${title}</div>
                            <div style="font-size: 12px;">${channelTitle}</div>
                        </div>
                    `;
                    
                    suggestionItem.addEventListener('click', () => {
                        window.location.href = `https://www.youtube.com/watch?v=${videoId}`;
                    });
                    
                    suggestionsDiv.appendChild(suggestionItem);
                });
            })
            .catch(error => {
                console.error('Error generating suggestions:', error);
                
                // Show error message
                const suggestionsDiv = document.getElementById('wellbeing-suggestions');
                suggestionsDiv.innerHTML = '<p>Could not load suggestions. Try searching for educational content.</p>';
            });
    });
}

// Function to temporarily override blocking
function temporaryOverride() {
    // Send message to background script to temporarily unblock this category
    chrome.runtime.sendMessage({ 
        action: "temporaryOverride", 
        category: currentVideoCategory 
    }, (response) => {
        if (response && response.success) {
            removeBlockingOverlay();
            
            // Show temporary notification
            const notification = document.createElement('div');
            notification.style.position = 'fixed';
            notification.style.bottom = '20px';
            notification.style.right = '20px';
            notification.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            notification.style.color = 'white';
            notification.style.padding = '10px 15px';
            notification.style.borderRadius = '4px';
            notification.style.zIndex = '9998';
            notification.textContent = 'Override active: 15 minute extension granted';
            
            document.body.appendChild(notification);
            
            // Remove notification after 5 seconds
            setTimeout(() => {
                notification.remove();
            }, 5000);
        }
    });
}

// Function to handle category blocked message
function handleCategoryBlocked(category) {
    if (currentVideoCategory === category) {
        showBlockingOverlay(category);
    }
    
    // Also hide recommendations for this category
    hideBlockedCategoryRecommendations(category);
}

// Function to hide recommendations for blocked categories
function hideBlockedCategoryRecommendations(blockedCategory) {
    // Get all video recommendations
    const observer = new MutationObserver((mutations) => {
        // Process all recommendation sections
        processRecommendations(blockedCategory);
    });
    
    // Start observing changes to the body
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Initial processing
    processRecommendations(blockedCategory);
}

// Function to process recommendations and hide blocked category videos
function processRecommendations(blockedCategory) {
    // Process sidebar recommendations
    const sidebarItems = document.querySelectorAll('ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer');
    
    sidebarItems.forEach(item => {
        // Check if this item has already been processed
        if (item.hasAttribute('data-category-processed')) {
            return;
        }
        
        // Mark as processed
        item.setAttribute('data-category-processed', 'true');
        
        // Get video ID
        const videoLink = item.querySelector('a#thumbnail');
        if (!videoLink) return;
        
        const href = videoLink.href || '';
        let videoId = '';
        
        if (href.includes('/watch?v=')) {
            videoId = new URLSearchParams(href.split('?')[1]).get('v');
        } else if (href.includes('/shorts/')) {
            videoId = href.split('/shorts/')[1];
        }
        
        if (!videoId) return;
        
        // Check this video's category
        checkVideoCategory(videoId, (category) => {
            if (category === blockedCategory) {
                // Hide this recommendation
                item.style.opacity = '0.3';
                item.style.pointerEvents = 'none';
                
                // Add a blocked indicator
                const overlay = document.createElement('div');
                overlay.textContent = 'BLOCKED';
                overlay.style.position = 'absolute';
                overlay.style.top = '50%';
                overlay.style.left = '50%';
                overlay.style.transform = 'translate(-50%, -50%)';
                overlay.style.color = 'white';
                overlay.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
                overlay.style.padding = '5px 10px';
                overlay.style.borderRadius = '4px';
                overlay.style.zIndex = '1';
                
                const thumbnailContainer = item.querySelector('#thumbnail');
                if (thumbnailContainer) {
                    thumbnailContainer.style.position = 'relative';
                    thumbnailContainer.appendChild(overlay);
                }
            }
        });
    });
}

// Function to check a video's category
function checkVideoCategory(videoId, callback) {
    chrome.storage.sync.get(['youtubeApiKey'], function(result) {
        const apiKey = result.youtubeApiKey;
        if (!apiKey) {
            console.error('API Key not found');
            return callback('Unknown');
        }

        fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`)
            .then(response => response.json())
            .then(data => {
                if (!data.items || data.items.length === 0) {
                    throw new Error('No video data available');
                }

                const snippet = data.items[0].snippet;
                const categoryId = snippet.categoryId;
                const category = videoCategories.categories[categoryId] || 'Unknown';
                
                callback(category);
            })
            .catch(error => {
                console.error('Error checking video category:', error);
                callback('Unknown');
            });
    });
}

// Function to create or update floating timer display
function updateFloatingTimerDisplay() {
    let timerDisplay = document.getElementById('wellbeing-floating-timer');
    
    // Create display if it doesn't exist
    if (!timerDisplay) {
        timerDisplay = document.createElement('div');
        timerDisplay.id = 'wellbeing-floating-timer';
        timerDisplay.className = 'wellbeing-timer-display';
        document.body.appendChild(timerDisplay);
    }
    
    // Get current video info and timers
    chrome.runtime.sendMessage({ action: "getTimers" }, (response) => {
        if (!response || !response.timers) return;
        
        const timers = response.timers;
        
        // Update display content
        let displayHTML = '<div class="wellbeing-timer-title">Time Remaining</div>';
        
        // Add current analysis if available
        if (currentAnalysis) {
            const classification = currentAnalysis.isProductive ? 
                '<span style="color: #4CAF50;">Productive</span>' : 
                '<span style="color: #FF9800;">Distracting</span>';
                
            displayHTML += `
                <div style="margin-bottom: 8px; font-size: 12px; text-align: center;">
                    Current: ${classification}<br>
                    Recommended: ${currentAnalysis.recommendedTime} mins
                </div>
            `;
        }
        
        // Add timers for each category
        Object.keys(timers).forEach(category => {
            const timer = timers[category];
            const minutes = Math.floor(timer.remaining / 60);
            const seconds = timer.remaining % 60;
            const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            // Determine timer state for styling
            let timerClass = '';
            const percentage = (timer.remaining / timer.limit) * 100;
            if (percentage < 25) {
                timerClass = 'low';
            } else if (percentage < 50) {
                timerClass = 'warning';
            }
            
            displayHTML += `
                <div class="wellbeing-timer-item ${timerClass}">
                    <span class="wellbeing-timer-category">${category}</span>
                    <span class="wellbeing-timer-time">${timeDisplay}</span>
                </div>
            `;
        });
        
        timerDisplay.innerHTML = displayHTML;
    });
}

// Set up interval to update floating timer
setInterval(updateFloatingTimerDisplay, 1000);

// Process uploaded watch history JSON
function processUploadedWatchHistory(historyData) {
    userWatchHistory = historyData;
    chrome.storage.local.set({ watchHistory: historyData });
    console.log('Watch history updated from upload');
    
    // Return success message to popup
    return {
        success: true,
        message: "Watch history updated successfully"
    };
}

// Message listeners
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Message received in content script:", request);
    if (request.action === "categoryBlocked") {
        handleCategoryBlocked(request.category);
        sendResponse({ success: true });
    } 
    else if (request.action === "getCurrentVideoInfo") {
        console.log('Current Video Info Request:', currentVideoId, currentAnalysis);
        if (currentVideoId && currentAnalysis) {
            let videoTitle = document.querySelector('h1.title.style-scope.ytd-video-primary-info-renderer')?.textContent || document.querySelector('h1.title')?.textContent || 'Unknown Title';
            sendResponse({
                success: true,
                videoId: currentVideoId,
                title: videoTitle,
                category: currentAnalysis.category || 'Unknown',
                isProductive: currentAnalysis.isProductive
            });
        } else {
            sendResponse({ 
                success: false, 
                error: "Video information not yet available" 
            });
        }
    } 
    else if (request.action === "processWatchHistory") {
        const result = processUploadedWatchHistory(request.historyData);
        sendResponse(result);
        return true;
    }
    
    return true;
});

// Initialize
function initialize() {
    console.log("YouTube Digital Wellbeing Extension initialized");
    initializeWatchHistory();
    initializeUserAnalysis();
    setupVideoChangeDetection();
    console.log("Content script initialized");
}

// Run initialization
initialize();