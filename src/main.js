const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { getDescription } = require("./scrape");

const app = express();
app.use(cors());
app.use(express.json());

// if not exist uploads/ folder, create it
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}
const upload = multer({ dest: "uploads/" });

// Upload & Process Excel File
app.post("/upload-excel", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    const filePath = req.file.path;
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    let data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Ensure "description" exists in each object

    let newData = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      console.log("No: ", i, "  ", row?.Part);
      if (row?.Part) {
        const result = await getDescription(row?.Part);
        newData.push({
          ...row,
          description: result?.description || "Not found",
        });
      } else {
        newData.push({
          ...row,
          description: "Not found",
        });
      }
    }
    // const result = await getDescription("M87686-601");
    // newData.push({
    //   ...data[0],
    //   description: result?.description || "Not found",
    // });

    data = newData;

    // Convert updated data back to Excel
    const newWorkbook = xlsx.utils.book_new();
    const newWorksheet = xlsx.utils.json_to_sheet(data);
    xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, "UpdatedData");

    // Save the updated file
    const newFilePath = `uploads/updated_${req.file.originalname}`;
    xlsx.writeFile(newWorkbook, newFilePath);

    // Delete the original file
    fs.unlinkSync(filePath);

    res.json({ filePath: newFilePath, data });
  } catch (error) {
    console.error("Error processing file:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Serve files for download
app.get("/download/:fileName", (req, res) => {
  const filePath = path.join(__dirname, "../uploads", req.params.fileName);
  console.log(filePath);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

// Delete file
app.delete("/delete/:fileName", (req, res) => {
  const filePath = path.join(__dirname, "uploads", req.params.fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ message: "File deleted successfully" });
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

app.listen(9700, () => console.log("Server running on port 3000"));
