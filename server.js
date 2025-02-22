const express = require('express');
const axios = require('axios');
const cors = require('cors');
const moment = require('moment'); // For date handling
const dotenv = require('dotenv');

dotenv.config(); // Load .env variables

const app = express();
const port = 3000;

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_FILE_PATHS = process.env.GITHUB_FILE_PATH; // Comma-separated paths

// Enable CORS
app.use(cors());

// Fetch data from multiple GitHub files
const fetchGitHubData = async (filePaths) => {
    try {
        const fileFetchPromises = filePaths.map(async (filePath) => {
            const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
            const response = await axios.get(url, {
                headers: {
                    Authorization: `token ${GITHUB_TOKEN}`,
                    Accept: "application/vnd.github.v3.raw",
                },
            });
            return response.data; // JSON content of the file
        });

        // Wait for all file fetches to complete
        const filesData = await Promise.all(fileFetchPromises);

        // Combine all data into a single array
        return filesData.flat();
    } catch (error) {
        console.error("Error fetching data from GitHub:", error.message);
        throw new Error("Failed to fetch data from GitHub");
    }
};

// Fetch video details from YouTube in batches
const fetchYouTubeDetails = async (videoIds) => {
    const batchSize = 50; // Max videos per request
    const videoDetails = [];

    for (let i = 0; i < videoIds.length && i < 150; i += batchSize) {
        const batch = videoIds.slice(i, i + batchSize);
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${batch.join(",")}&key=${YOUTUBE_API_KEY}`;
        try {
            const response = await axios.get(url);
            const batchDetails = response.data.items.map((item) => ({
                videoId: item.id,
                title: item.snippet.title,
                thumbnail: item.snippet.thumbnails.default.url,
            }));
            videoDetails.push(...batchDetails);
        } catch (error) {
            console.error("Error fetching data from YouTube:", error.message);
            throw new Error("Failed to fetch data from YouTube");
        }
    }

    return videoDetails;
};

// Filter data based on time period
const filterByTimePeriod = (data, timePeriod) => {
    const [start, end] = timePeriod.split(',');
    const startTime = start ? moment(start) : null;
    const endTime = end ? moment(end) : null;

    return data.filter((item) => {
        const timestamp = moment(item[3]); // Index 3 is the timestamp
        if (startTime && timestamp.isBefore(startTime)) return false;
        if (endTime && timestamp.isAfter(endTime)) return false;
        return true;
    });
};

// API endpoint to get data
app.get('/api/data', async (req, res) => {
    try {
        const { timePeriod } = req.query;

        // Split file paths from .env into an array
        const filePaths = GITHUB_FILE_PATHS.split(',');

        // Fetch data from GitHub files
        let githubData = await fetchGitHubData(filePaths);

        // Filter data based on time period if provided
        if (timePeriod) {
            githubData = filterByTimePeriod(githubData, timePeriod);
        }

        // Extract video IDs from the JSON data
        const videoIds = [...new Set(githubData.map((item) => item[4]))]; // Unique video IDs

        // Fetch video details from YouTube (in up to 3 requests)
        const videoDetails = await fetchYouTubeDetails(videoIds);

        // Combine GitHub data with YouTube details
        const combinedData = githubData.map((item) => {
            const videoDetail = videoDetails.find((v) => v.videoId === item[4]);
            return {
                views: item[0], // Index 0: Views
                likes: item[1], // Index 1: Likes
                comments: item[2], // Index 2: Comments
                timestamp: item[3], // Index 3: Timestamp
                videoId: item[4], // Index 4: Video ID
                title: videoDetail?.title || "Unknown Title",
                thumbnail: videoDetail?.thumbnail || "",
            };
        });

        res.json(combinedData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on PORT:${port}`);
});
