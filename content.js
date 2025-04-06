let videoCategories = { categories: {} };

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

// Load video categories
fetch(chrome.runtime.getURL('videoCategories.json'))
    .then(response => response.json())
    .then(data => videoCategories = data)
    .catch(error => console.error('Error loading categories:', error));

// Function to redirect the user to the GIF
function redirectToGif() {
    window.location.href = "https://media1.tenor.com/m/KNdfR6T6kOIAAAAC/nonono-no.gif";
}

// Function to check the current URL and redirect if it matches the specific Shorts URL
function checkAndRedirect() {
    console.log('Checking URL:', window.location.href);
    if (window.location.href.includes('https://www.youtube.com/shorts/5283IAD3GSs')) {
        console.log('Redirecting to GIF...');
        redirectToGif();
    }
}

// Function to normalize Shorts URLs
function normalizeShortsUrl(url) {
    return url.replace('/shorts/', '/watch?v=');
}

// Function to hide all Shorts
function hideAllShorts() {
    const shortsBadgeSelector = 'ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]';
    const shortBadges = document.querySelectorAll(shortsBadgeSelector);
    shortBadges?.forEach(badge => {
        badge.closest('ytd-compact-video-renderer')?.setAttribute('is_short', '');
        badge.closest('ytd-grid-video-renderer')?.setAttribute('is_short', '');
        badge.closest('ytd-rich-item-renderer')?.setAttribute('is_short', '');
    });

    const shortsShelfSelector = '*[is-shorts]';
    const shortsShelves = document.querySelectorAll(shortsShelfSelector);
    shortsShelves?.forEach(shelf => {
        shelf.closest('ytd-rich-section-renderer')?.setAttribute('is_short', '');
    });
}

// Function to handle Shorts on the subscriptions page
function handleShortsOnSubsPage() {
    const shortsBadgeSelector = 'ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]';
    const shortBadges = document.querySelectorAll(shortsBadgeSelector);
    shortBadges.forEach(badge => {
        const video = badge.closest('ytd-grid-video-renderer');
        const updatedGridVideo = badge.closest('ytd-rich-item-renderer');
        video?.setAttribute('is_sub_short', '');
        updatedGridVideo?.setAttribute('is_sub_short', '');
    });
}

// Function to hide Shorts on the results page
function hideShortsOnResultsPage() {
    const shortResults = document.querySelectorAll('a[href^="/shorts/"]:not([marked_as_short])');
    shortResults.forEach(sr => {
        sr.setAttribute('marked_as_short', true);
        const result = sr.closest('ytd-video-renderer');
        result?.setAttribute('is_short', true);

        // Mobile
        const mobileResult = sr.closest('ytm-video-with-context-renderer');
        mobileResult?.setAttribute('is_short', true);
    });
}

// Main function to apply Shorts logic
function applyShortsLogic() {
    const url = window.location.href;
    const onShorts = url.includes('/shorts/');
    const onSubs = url.includes('/feed/subscriptions');
    const onResultsPage = url.includes('/results');

    // Normalize Shorts URLs
    if (onShorts) {
        const newUrl = normalizeShortsUrl(url);
        window.location.replace(newUrl);
    }

    // Hide all Shorts
    hideAllShorts();

    // Handle Shorts on the subscriptions page
    if (onSubs) {
        handleShortsOnSubsPage();
    }

    // Hide Shorts on the results page
    if (onResultsPage) {
        hideShortsOnResultsPage();
    }
}

// Monitor URL changes dynamically
function monitorUrlChanges() {
    let previousUrl = window.location.href;

    const observer = new MutationObserver(() => {
        if (window.location.href !== previousUrl) {
            previousUrl = window.location.href;
            applyShortsLogic();
        }
    });

    // Observe changes to the body and its descendants
    observer.observe(document.body, { childList: true, subtree: true });

    // Also observe changes to the URL in the address bar
    window.addEventListener('popstate', () => {
        if (window.location.href !== previousUrl) {
            previousUrl = window.location.href;
            applyShortsLogic();
        }
    });
}

// Initial check when the script loads
applyShortsLogic();

// Start monitoring URL changes
monitorUrlChanges();

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
    "Anime/Animation": 20,
    "Action/Adventure": 20,
    "Classics": 20,
    "Documentary": 30,
    "Drama": 20,
    "Family": 20,
    "Foreign": 20,
    "Horror": 15,
    "Sci-Fi/Fantasy": 20,
    "Thriller": 20,
    "Shorts": 5,
    "Shows": 30,
    "Trailers": 5
};

// Default viewing time for unknown categories (in minutes)
const DEFAULT_VIEWING_TIME = 15;

// Function to estimate recommended viewing time based on category
function estimateViewingTime(category) {
    return categoryTimeRecommendations[category] || DEFAULT_VIEWING_TIME;
}

// Enhanced storage function with fallback options
function storeMetadata(videoId, metadata) {
    try {
        // Add recommended viewing time
        metadata.recommendedViewingTime = estimateViewingTime(metadata.category);
        metadata.timestamp = new Date().toISOString();
        
        // Try using sessionStorage first
        try {
            const scrapedData = JSON.parse(sessionStorage.getItem('scrapedData')) || {};
            scrapedData[videoId] = metadata;
            sessionStorage.setItem('scrapedData', JSON.stringify(scrapedData));
            console.log('Metadata stored in session storage for video:', videoId);
        } catch (error) {
            // Fallback to chrome.storage.local if sessionStorage fails
            console.warn('Session storage failed, using chrome.storage.local instead:', error.message);
            
            chrome.storage.local.get(['scrapedData'], function(result) {
                const scrapedData = result.scrapedData || {};
                scrapedData[videoId] = metadata;
                chrome.storage.local.set({ 'scrapedData': scrapedData }, function() {
                    console.log('Metadata stored in chrome.storage.local for video:', videoId);
                });
            });
        }
    } catch (error) {
        console.error('Error storing metadata:', error);
    }
}

// Function to retrieve scraped metadata from session storage
function getMetadata(videoId) {
    const scrapedData = JSON.parse(sessionStorage.getItem('scrapedData')) || {};
    return scrapedData[videoId];
}

// Function to detect video changes and auto-scrape
function setupVideoChangeDetection() {
    let lastVideoId = '';
    
    // Function to check for video ID changes
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
        
        // If we have a new video ID and it's different from the last one
        if (currentVideoId && currentVideoId !== lastVideoId) {
            console.log('Video changed, auto-scraping metadata for:', currentVideoId);
            lastVideoId = currentVideoId;
            autoScrapeMetadata(currentVideoId);
        }
    }
    
    // Set up interval to check for video changes
    setInterval(checkForVideoChange, 1000);
    
    // Also check when URL changes
    const pushState = history.pushState;
    history.pushState = function() {
        pushState.apply(history, arguments);
        setTimeout(checkForVideoChange, 500);
    };
    
    window.addEventListener('popstate', () => {
        setTimeout(checkForVideoChange, 500);
    });
    
    // Initial check
    checkForVideoChange();
}

// Function to auto-scrape metadata when video changes
function autoScrapeMetadata(videoId) {
    chrome.storage.sync.get(['youtubeApiKey'], function(result) {
        const apiKey = result.youtubeApiKey;
        if (!apiKey) {
            console.error('API Key not found');
            return;
        }

        fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${apiKey}`)
            .then(response => response.json())
            .then(data => {
                if (!data.items || data.items.length === 0) {
                    throw new Error('No video data available');
                }

                const snippet = data.items[0].snippet;
                const stats = data.items[0].statistics;
                const categoryId = snippet.categoryId;
                
                const metadata = {
                    success: true,
                    title: snippet.title,
                    channelTitle: snippet.channelTitle,
                    description: snippet.description,
                    category: videoCategories.categories[categoryId] || 'Unknown',
                    tags: snippet.tags || [],
                    views: stats.viewCount,
                    likes: stats.likeCount,
                    publishedAt: snippet.publishedAt
                };
                
                // Store the metadata in session storage with time estimation
                storeMetadata(videoId, metadata);
                
                // Log the data for debugging
                console.log('Auto-scraped metadata:', metadata);
            })
            .catch(error => {
                console.error('Auto-scrape API Error:', error);
            });
    });
}

// Function to export data for LLM processing
function exportDataForLLM() {
    return new Promise((resolve, reject) => {
        try {
            // Try session storage first
            const sessionData = sessionStorage.getItem('scrapedData');
            if (sessionData) {
                const scrapedData = JSON.parse(sessionData) || {};
                const llmData = formatDataForLLM(scrapedData);
                resolve(llmData);
                return;
            }
            
            // Fallback to chrome.storage.local
            chrome.storage.local.get(['scrapedData'], function(result) {
                const scrapedData = result.scrapedData || {};
                const llmData = formatDataForLLM(scrapedData);
                resolve(llmData);
            });
        } catch (error) {
            console.error('Error exporting data for LLM:', error);
            reject(error);
        }
    });
}

// Helper function to format data consistently
function formatDataForLLM(scrapedData) {
    // Create a formatted object with all needed data for the LLM
    const llmData = {
        scrapedVideos: scrapedData,
        timestamp: new Date().toISOString(),
        sessionSummary: {
            totalVideos: Object.keys(scrapedData).length,
            categories: {}
        }
    };
    
    // Count videos by category
    Object.values(scrapedData).forEach(video => {
        if (!llmData.sessionSummary.categories[video.category]) {
            llmData.sessionSummary.categories[video.category] = 0;
        }
        llmData.sessionSummary.categories[video.category]++;
    });
    
    return llmData;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scrapeMetadata") {
        try {
            let videoId;
            if (window.location.href.includes('/shorts/')) {
                videoId = window.location.href.split('/shorts/')[1];
            } else {
                videoId = new URLSearchParams(window.location.search).get('v');
            }

            // Retrieve the API key from chrome.storage
            chrome.storage.sync.get(['youtubeApiKey'], function(result) {
                const apiKey = result.youtubeApiKey;
                if (!apiKey) {
                    sendResponse({ 
                        success: false, 
                        error: 'API Key not found' 
                    });
                    return;
                }

                fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${apiKey}`)
                    .then(response => response.json())
                    .then(data => {
                        if (!data.items || data.items.length === 0) {
                            throw new Error('No video data available');
                        }

                        const snippet = data.items[0].snippet;
                        const stats = data.items[0].statistics;
                        const categoryId = snippet.categoryId;
                        
                        const metadata = {
                            success: true,
                            title: snippet.title,
                            channelTitle: snippet.channelTitle,
                            category: videoCategories.categories[categoryId] || 'Unknown',
                            tags: snippet.tags || []
                        };
                        
                        // Store the metadata in session storage
                        storeMetadata(videoId, metadata);

                        sendResponse(metadata);
                    })
                    .catch(error => {
                        console.error('API Error:', error);
                        sendResponse({ 
                            success: false, 
                            error: 'Failed to fetch video data' 
                        });
                    });
            });

            return true; // Required for async response
        } catch (error) {
            console.error('Error:', error);
            sendResponse({ 
                success: false, 
                error: error.message 
            });
        }
    } else if (request.action === "getLLMData") {
        // Export the stored data for LLM processing
        const llmData = exportDataForLLM();
        sendResponse({ success: true, data: llmData });
    }
    return true;
});

let retries = 3;

function connect() {
  const port = chrome.runtime.connect();
  port.onDisconnect.addListener(() => {
    if (retries > 0) {
      setTimeout(connect, 1000);
      retries--;
    }
  });
}

connect();

function logStoredData() {
    const scrapedData = JSON.parse(sessionStorage.getItem('scrapedData')) || {};
    console.log('Stored Scraped Data:', scrapedData);
}

// Call this function to log the stored data
logStoredData();

// Initialize the video change detection
setupVideoChangeDetection();