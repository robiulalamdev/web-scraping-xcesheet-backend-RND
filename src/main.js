const express = require("express");
const cors = require("cors");
const { getDescription } = require("./scrape");
const { SSE } = require("./sse/sseServer");

const app = express();
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://admin.computer-spot.com",
      "https://scraping-xcelsheet.vercel.app",
    ],
    credentials: true,
  })
);
app.use(express.json());

app.get("/sse-connect/:id", SSE.initialize);

app.post("/scrape", async (req, res) => {
  const { sheets = [], connectionId = "" } = req.body;

  if (!sheets || sheets?.length === 0) {
    return res
      .status(400)
      .json({ success: false, error: "Sheets are required" });
  }

  try {
    let newData = await getDescription(sheets);

    return res.status(200).json({ success: true, data: newData });
  } catch (error) {
    console.error("Error processing file:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/", (req, res) => {
  res.send("API version 1.0.0");
});

app.listen(9700, () => console.log("Server running on port 9700"));
