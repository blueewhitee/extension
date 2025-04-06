const fs = require('fs');
const path = require('path');

try {
    // Use the full path to your watch-history.json
    const filePath = "C:\\Users\\tosh9\\Downloads\\Compressed\\takeout-20250219T183057Z-001\\Takeout\\YouTube and YouTube Music\\history\\watch-history.json";
    
    // Read and parse the file
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Create simplified data
    const simplifiedData = data.map(entry => ({
        title: entry.title,
        name: entry.subtitles?.[0]?.name || null
    }));

    // Write the new file to the same directory
    const outputPath = path.join(path.dirname(filePath), 'simplified-watch-history.json');
    fs.writeFileSync(outputPath, JSON.stringify(simplifiedData, null, 2));
    
    console.log('Simplified JSON created successfully at:', outputPath);
} catch (error) {
    console.error('Error processing JSON file:', error.message);
}