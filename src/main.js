const express = require("express");
const cors = require("cors");
const { getDescription } = require("./scrape");
const { SSE } = require("./sse/sseServer");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/sse-connect/:id", SSE.initialize);

app.post("/scrape", async (req, res) => {
  const { sheets = [], connectionId } = req.body;
  if (!sheets || sheets?.length === 0) {
    return res
      .status(400)
      .json({ success: false, error: "Sheets are required" });
  }

  try {
    let newData = [];
    for (let i = 0; i < sheets.length; i++) {
      const row = sheets[i];
      console.log("No: ", i, "  ", row?.Part);

      let newRow = null;

      if (row?.Part) {
        const result = await getDescription(row?.Part);
        newRow = {
          ...row,
          description: result?.description,
          category: result?.category,
        };
      } else {
        newRow = {
          ...row,
          description: "Not found",
          category: "Not found",
        };
      }

      if (newRow) {
        newData.push(newRow);
        // now will send the data to the client
        SSE.sendMessage(
          connectionId,
          JSON.stringify({
            row: newRow,
          })
        );
      }
    }

    res.status(200).json({ success: true, data: newData });
  } catch (error) {
    console.error("Error processing file:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/", (req, res) => {
  res.send("API version 1.0.0");
});

app.listen(9700, () => console.log("Server running on port 3000"));
