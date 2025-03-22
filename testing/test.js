const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");

const app = express();
const PORT = 9700;

app.use(cors({ origin: ["http://localhost:3000", "http://localhost:3001"] }));
app.use(express.json());

let browser = null;

// Initialize Puppeteer browser once
async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
      ],
    });
  }
  return browser;
}

// Block unnecessary resources
async function blockResources(page) {
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const resourceType = req.resourceType();
    if (["image", "stylesheet", "font"].includes(resourceType)) {
      req.abort();
    } else {
      req.continue();
    }
  });
}

app.get("/scrape", async (req, res) => {
  const partNumber = req.query.part;
  if (!partNumber) {
    return res
      .status(400)
      .json({ error: "partNumber query parameter is required" });
  }

  try {
    const browser = await initBrowser();
    const page = await browser.newPage();
    await blockResources(page); // Speed up by blocking images, stylesheets, fonts

    const url = `https://partsurfer.hp.com/?searchtext=${partNumber}&searchby=part`;
    await page.goto(url, { waitUntil: "load", timeout: 30000 });

    // Close cookie popup if it exists
    try {
      const cookieButton = await page.waitForSelector(
        "#onetrust-close-btn-container button.onetrust-close-btn-handler",
        { timeout: 5000 }
      );
      if (cookieButton) {
        await cookieButton.click();
        await page.waitForTimeout(500);
      }
    } catch (error) {
      console.log("No cookie popup found or already closed.");
    }

    // Wait for the form fields and submit button
    await page.waitForSelector("form .form-control", {
      visible: true,
      timeout: 10000,
    });
    await page.waitForSelector('form button[type="submit"]', {
      visible: true,
      timeout: 10000,
    });

    // Fill in the part number and submit the form
    await page.type("form .form-control", partNumber, { delay: 50 });
    await page.click('form button[type="submit"]');

    // Wait for the table to appear, fallback timeout to 30 seconds
    await page.waitForSelector("table", { visible: true, timeout: 30000 });

    // Extract description from the first table row
    const description = await page.evaluate(() => {
      const row = document.querySelector("table tbody tr");
      return row
        ? row.querySelector("td:nth-child(4)")?.innerText.trim() ||
            "Description not found"
        : "No data available";
    });

    await page.close(); // Close only the page

    res.json({
      part: partNumber,
      description,
    });
  } catch (error) {
    console.error("Error fetching description:", error);
    res
      .status(500)
      .json({
        error:
          "Failed to fetch description. The page might have changed or is slow to load.",
      });
  }
});

// Graceful shutdown
process.on("SIGINT", async () => {
  if (browser) {
    await browser.close();
  }
  process.exit();
});

app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
