const express = require('express');
const axios = require('axios');
const cors = require('cors');
const moment = require('moment'); // For date handling

const app = express();
const port = 3000;
const dotenv = require('dotenv');
dotenv.config();  // Load .env variables

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_FILE_PATH = process.env.GITHUB_FILE_PATH;
// Enable CORS
app.use(cors());

// Fetch data from private GitHub repo (with better error handling)
const fetchGitHubData = async () => {
    const filePaths = [
        "youtube/video/json/mostliked.json",
        "youtube/video/json/mostliked0.json",
    ];

    const fileFetches = filePaths.map(async (filePath) => {
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
        console.log(`Fetching file: ${url}`);
        try {
            const fileResponse = await axios.get(url, {
                headers: {
                    Authorization: `token ${GITHUB_TOKEN}`,
                    Accept: "application/vnd.github.v3.raw",
                },
            });

            const rawData = fileResponse.data;

            try {
                const parsedData = JSON.parse(rawData); // Validate JSON format
                console.log(`Successfully parsed data from: ${filePath}`);
                return parsedData;
            } catch (jsonError) {
                console.error(`Error parsing JSON for file ${filePath}:`, rawData);
                return []; // Skip this file and return an empty array
            }
        } catch (fetchError) {
            console.error(`Error fetching data from ${filePath}:`, fetchError.message);
            return []; // Skip this file and return an empty array
        }
    });

    const allData = await Promise.all(fileFetches);
    return allData.flat(); // Combine data from all successfully parsed files
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

        // Fetch data from GitHub
        let githubData = await fetchGitHubData();

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
