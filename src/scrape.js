const puppeteer = require("puppeteer");

let browser = null;

async function initBrowser() {
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      console.log("Error closing existing browser:", error);
    }
  }
  browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
    ],
  });
  return browser;
}

const getDescription = async (partNumber) => {
  console.log(`Starting scraping process for part number: ${partNumber}`);
  if (!partNumber) {
    console.log("No part number provided");
    return {
      part: partNumber,
      description: "Not found",
    };
  }

  const url = `https://partsurfer.hp.com`;

  // Initialize the browser and page
  //   const browser = await initBrowser();
  let browser;
  try {
    console.log("Launching browser...");
    // browser = await puppeteer.launch({
    //   executablePath: "/usr/bin/google-chrome",
    //   headless: true,
    //   defaultViewport: null,
    //   args: [
    //     "--no-sandbox",
    //     "--disable-setuid-sandbox",
    //     "--disable-dev-shm-usage",
    //     "--disable-accelerated-2d-canvas",
    //     "--disable-gpu",
    //   ],
    // });
    browser = await puppeteer
      .launch({
        headless: "new", // Ensure headless mode is compatible
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, // Ensure it uses the installed Chromium
        defaultViewport: null,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
        ],
      })
      .catch((err) => {
        console.error("Puppeteer failed to launch:", err);
        process.exit(1);
      });
    console.log("Browser launched successfully");
  } catch (error) {
    console.error("Failed to launch browser:", error);
    throw error;
  }
  let page;
  let cdp;
  try {
    console.log("Creating new page...");
    page = await browser.newPage();
    cdp = await page.target().createCDPSession();
    console.log("Page and CDP session created successfully");
  } catch (error) {
    console.error("Failed to create page or CDP session:", error);
    await browser.close();
    throw error;
  }

  // Enable Network domain to track requests
  await cdp.send("Network.enable");
  await cdp.send("Page.enable");

  // Create a promise that resolves when all requests are complete
  const pendingRequests = new Set();
  let isNavigationComplete = false;

  const waitForAllRequests = () => {
    return new Promise((resolve, reject) => {
      let timeoutId;
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        cdp.removeAllListeners("Network.requestWillBeSent");
        cdp.removeAllListeners("Network.loadingFinished");
        cdp.removeAllListeners("Network.loadingFailed");
      };

      const checkComplete = () => {
        if (isNavigationComplete && pendingRequests.size === 0) {
          cleanup();
          resolve();
        }
      };

      const onRequestSent = ({ requestId }) => {
        pendingRequests.add(requestId);
      };

      const onRequestFinished = ({ requestId }) => {
        pendingRequests.delete(requestId);
        checkComplete();
      };

      const onRequestFailed = ({ requestId }) => {
        pendingRequests.delete(requestId);
        checkComplete();
      };

      cdp.on("Network.requestWillBeSent", onRequestSent);
      cdp.on("Network.loadingFinished", onRequestFinished);
      cdp.on("Network.loadingFailed", onRequestFailed);

      // Set a timeout to prevent hanging
      timeoutId = setTimeout(() => {
        console.log("Request timeout reached - cleaning up resources");
        cleanup();
        resolve();
      }, 30000); // 30 seconds timeout
    });
  };

  // Start tracking requests
  const requestsPromise = waitForAllRequests();

  // Navigate to the page
  try {
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "networkidle0" });
    console.log("Navigation completed");
  } catch (error) {
    console.error("Failed to navigate to page:", error);
    await cleanup(browser, page, cdp);
    throw error;
  }

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

  try {
    console.log("Waiting for form elements...");
    await page.waitForSelector("form .form-control", { visible: true });
    await page.waitForSelector('form button[type="submit"]', { visible: true });
    await page.waitForSelector("form input", { visible: true });
    console.log("Form elements found");

    console.log(`Typing part number: ${partNumber}`);
    await page.type("form input", partNumber);
    console.log("Part number entered successfully");

    console.log("Submitting form...");
    await page.click('form button[type="submit"]');
    console.log("Form submitted successfully");
  } catch (error) {
    console.error("Failed to interact with form:", error);
    await cleanup(browser, page, cdp);
    throw error;
  }

  try {
    console.log("Waiting for results table...");
    await page.waitForFunction(
      () => document.querySelectorAll("table").length > 0,
      { timeout: 30000 }
    );
    console.log("Results table found");

    isNavigationComplete = true;

    // Wait for all pending requests to complete
    await requestsPromise;

    console.log("Extracting description data...");
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

    console.log("Description data extracted successfully");
    await cleanup(browser, page, cdp);
    console.log("Resources cleaned up");

    return {
      part: partNumber,
      description: pageData,
    };
  } catch (error) {
    console.error("Failed to extract data:", error);
    await cleanup(browser, page, cdp);
    throw error;
  }
};

async function cleanup(browser, page, cdp) {
  try {
    if (cdp) await cdp.detach();
    if (page) await page.close();
    if (browser) await browser.close();
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
}

module.exports = {
  getDescription,
};
