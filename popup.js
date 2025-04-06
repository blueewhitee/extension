document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('scrapeButton').addEventListener('click', async () => {
        const resultsDiv = document.getElementById('results');
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.includes('youtube.com/watch') && !tab.url.includes('youtube.com/shorts')) {
                resultsDiv.innerHTML = '<p class="error">Please open a YouTube video or short first.</p>';
                return;
            }

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

    // Add a new button to the popup.html file
    const exportButton = document.createElement('button');
    exportButton.id = 'exportButton';
    exportButton.textContent = 'Export Data for Analysis';
    exportButton.style.marginTop = '10px';
    document.getElementById('scrapeButton').after(exportButton);
    
    exportButton.addEventListener('click', async () => {
        const resultsDiv = document.getElementById('results');
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            resultsDiv.innerHTML = 'Exporting data...';
            
            const response = await chrome.tabs.sendMessage(tab.id, { 
                action: "getLLMData"
            });

            if (response.success) {
                const videoCount = Object.keys(response.data.scrapedVideos).length;
                
                let categorySummary = '';
                const categories = response.data.sessionSummary.categories;
                for (const category in categories) {
                    categorySummary += `<li>${category}: ${categories[category]} video(s)</li>`;
                }
                
                resultsDiv.innerHTML = `
                    <h3>Data Ready for LLM Analysis</h3>
                    <p>Collected data on ${videoCount} video(s) in this session.</p>
                    <p><strong>Categories watched:</strong></p>
                    <ul>${categorySummary}</ul>
                    <p>Data will be processed by LLM to generate viewing recommendations.</p>
                `;
                
                // You can add code here to send the data to your LLM
                console.log('Data for LLM:', response.data);
            } else {
                resultsDiv.innerHTML = `<p class="error">Error: ${response.error}</p>`;
            }
        } catch (error) {
            resultsDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        }
    });

    // Add a diagnostic button
    const diagnosticButton = document.createElement('button');
    diagnosticButton.id = 'diagnosticButton';
    diagnosticButton.textContent = 'Test Storage';
    diagnosticButton.style.marginTop = '10px';
    document.getElementById('scrapeButton').after(diagnosticButton);

    diagnosticButton.addEventListener('click', async () => {
        const resultsDiv = document.getElementById('results');
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            resultsDiv.innerHTML = 'Testing storage...';
            
            const response = await chrome.tabs.sendMessage(tab.id, { 
                action: "testStorage"
            });

            if (response && response.success) {
                resultsDiv.innerHTML = `
                    <p style="color: green">✓ Storage test passed!</p>
                    <p>Session storage is working correctly.</p>
                `;
            } else {
                resultsDiv.innerHTML = `
                    <p style="color: red">✗ Storage test failed!</p>
                    <p>Falling back to chrome.storage.local.</p>
                    <p>This is still OK, but data will persist between sessions.</p>
                `;
            }
        } catch (error) {
            resultsDiv.innerHTML = `
                <p style="color: red">✗ Storage test error!</p>
                <p>Error: ${error.message}</p>
                <p>Check if you're on a YouTube page and try again.</p>
            `;
        }
    });
});