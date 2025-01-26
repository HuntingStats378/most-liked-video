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

// API endpoint to get data
app.get('/api/data', async (req, res) => {
    try {
        const { timePeriod } = req.query;

        // Split file paths from .env into an array
        const filePaths = GITHUB_FILE_PATH.split(',');

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

