const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");

const app = express();
const PORT = 9700;

// Allow requests from frontend on ports 3000 and 3001
app.use(cors({ origin: ["http://localhost:3000", "http://localhost:3001"] }));
app.use(express.json()); // Enable JSON parsing

// Global browser instance
let browser = null;

// // Initialize browser
async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
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

app.get("/scrape", async (req, res) => {
  const partNumber = req.query.part;

  if (!partNumber) {
    return res
      .status(400)
      .json({ error: "partNumber query parameter is required" });
  }

  const url = `https://partsurfer.hp.com`;

  try {
    // Initialize the browser and page
    const browser = await initBrowser();
    const page = await browser.newPage();
    const cdp = await page.target().createCDPSession();

    // Enable Network domain to track requests
    await cdp.send("Network.enable");
    await cdp.send("Page.enable");

    // Create a promise that resolves when all requests are complete
    const pendingRequests = new Set();
    let isNavigationComplete = false;

    const waitForAllRequests = () => {
      return new Promise((resolve) => {
        const checkComplete = () => {
          if (isNavigationComplete && pendingRequests.size === 0) {
            resolve();
          }
        };

        cdp.on("Network.requestWillBeSent", ({ requestId }) => {
          pendingRequests.add(requestId);
        });

        cdp.on("Network.loadingFinished", ({ requestId }) => {
          pendingRequests.delete(requestId);
          checkComplete();
        });

        cdp.on("Network.loadingFailed", ({ requestId }) => {
          pendingRequests.delete(requestId);
          checkComplete();
        });

        // Set a timeout to prevent hanging
        setTimeout(() => {
          console.log("Request timeout reached");
          resolve();
        }, 30000); // 30 seconds timeout
      });
    };

    // Start tracking requests
    const requestsPromise = waitForAllRequests();

    // Navigate to the page
    await page.goto(url, { waitUntil: "networkidle0" });

    // Handle cookie popup
    try {
      await page.waitForSelector(
        "#onetrust-close-btn-container button.onetrust-close-btn-handler",
        { timeout: 5000 }
      );
      await page.click(
        "#onetrust-close-btn-container button.onetrust-close-btn-handler"
      );
      await page.waitForTimeout(1000); // Wait for popup animation
      await page.reload({ waitUntil: "networkidle0" }); // Refresh the page
    } catch (error) {
      console.log("No cookie popup found or already closed");
    }

    // Wait for the search form and submit button to be visible
    await page.waitForSelector("form .form-control", { visible: true });
    await page.waitForSelector('form button[type="submit"]', { visible: true });

    await page.waitForSelector("form input", { visible: true });
    // Fill in the part number and submit the form
    await page.type("form input", partNumber);

    // Fill in the part number and submit the form
    // await page.type("form .form-control", partNumber);
    await page.click('form button[type="submit"]');

    // Wait for the results to load
    await page.waitForFunction(
      () => document.querySelectorAll("table").length > 0,
      { timeout: 30000 }
    );

    isNavigationComplete = true;

    // Wait for all pending requests to complete
    await requestsPromise;

    // Now that all requests are complete, query the document
    const pageData = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll("table"));
      const descriptions = [];
      if (tables.length > 0) {
        const table = tables[0];
        // Get all rows from the first table body
        const rows = table.querySelectorAll("tbody tr");

        // Iterate through each row and extract the Description column (which is the 4th column)
        rows.forEach((row) => {
          const descriptionCell = row.querySelector("td:nth-child(4)"); // Select the 4th column (Description)
          if (descriptionCell) {
            descriptions.push(descriptionCell.innerText.trim()); // Get the text and trim extra spaces
          }
        });
      }

      return descriptions?.length > 0 ? descriptions[0] : "";
    });

    await browser.close();

    res.json({
      part: partNumber,
      description: pageData,
    });
  } catch (error) {
    console.error("Error fetching description:", error);
    res.status(500).json({ error: "Failed to fetch description" });
  }
});

// Cleanup on server shutdown
process.on("SIGINT", async () => {
  if (browser) {
    await browser.close();
  }
  process.exit();
});

app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
