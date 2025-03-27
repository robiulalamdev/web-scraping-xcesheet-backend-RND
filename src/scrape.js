const puppeteer = require("puppeteer");
const {
  getCategory,
  handlePopupClose,
  waitForAllRequests,
} = require("./lib/services");

const getDescription = async (sheets = []) => {
  const url = `https://partsurfer.hp.com`;

  let browser;
  try {
    console.log("Launching browser...");
    browser = await puppeteer.launch({
      executablePath:
        process.env.NODE_ENV === "production"
          ? "/usr/bin/chromium-browser"
          : puppeteer.executablePath(),
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
    console.log("Browser launched successfully");
  } catch (error) {
    console.error("Failed to launch browser:", error);
    throw error;
  }
  let page;
  let cdp;
  try {
    page = await browser.newPage();
    cdp = await page.target().createCDPSession();
  } catch (error) {
    console.error("Failed to create page or CDP session:", error);
    await browser.close();
    throw error;
  }

  // Enable Network domain to track requests
  await cdp.send("Network.enable");
  await cdp.send("Page.enable");

  // Navigate to the page
  try {
    await page.goto(url, { waitUntil: "networkidle0" });
  } catch (error) {
    console.error("Failed to navigate to page:", error);
    await cleanup(browser, page, cdp);
    throw error;
  }

  const requestsPromise = waitForAllRequests(cdp);

  // Handle cookie popup
  await handlePopupClose(page);

  let newData = [];

  for (let i = 0; i < sheets.length; i++) {
    const Row = sheets[i];
    console.log(i + 1, "  -  ", "START: ", Row.Part);
    try {
      await page.waitForSelector("form .form-control", { visible: true });
      await page.waitForSelector('form button[type="submit"]', {
        visible: true,
      });
      await page.waitForSelector("form input", { visible: true });

      await page.type("form input", Row.Part);

      await page.click('form button[type="submit"]');
    } catch (error) {
      console.error("Failed to interact with form:", error);
      await cleanup(browser, page, cdp);
    }

    await requestsPromise;
    await (async () => {
      try {
        await page.waitForFunction(
          () => document.querySelectorAll("table").length > 0,
          { timeout: 30000 }
        );
        await page.waitForSelector("table tbody tr", {
          timeout: 30000,
          visible: true,
        });
      } catch (error) {
        console.warn(
          "Warning: Table not found within timeout. Proceeding without error."
        );
      }
    })();

    const descriptionData = await page.evaluate(() => {
      try {
        // Select all tables on the page
        const tables = Array.from(document.querySelectorAll("table"));
        console.log("tables length: ", tables.length); // Log the number of tables

        const descriptions = [];
        if (tables.length > 0) {
          const table = tables[0]; // Select the first table
          const rows = table.querySelectorAll("tbody tr");

          rows.forEach((row, index) => {
            // Select the 4th column (Description) from each row
            const descriptionCell = row.querySelector("td:nth-child(4)");
            if (descriptionCell) {
              // If the 4th column is found, push the trimmed text to descriptions array
              descriptions.push(descriptionCell.innerText.trim());
              console.log(
                `Row ${index + 1} description: `,
                descriptionCell.innerText
              ); // Log each row's description
            }
          });
        }

        // Return the first description or an empty string if none were found
        return descriptions.length > 0 ? descriptions[0] : "";
      } catch (error) {
        console.error("Error inside evaluate function: ", error);
        return ""; // Return empty string in case of an error
      }
    });

    const category = await getCategory(descriptionData);

    const result = {
      ...Row,
      Description: descriptionData || "Not found",
      Category: category || "Other",
    };

    newData.push(result);

    console.log(i + 1, "  -  ", "END: ", Row.Part, "\n\n");
    // set input value to empty
    await page.evaluate(() => {
      const input = document.querySelector("form input");
      if (input) {
        input.value = "";
      }
    });
  }

  try {
    await cleanup(browser, page, cdp);
    return newData;
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
    return;
  } catch (error) {
    console.error("Error during cleanup:", error);
    return;
  }
}

module.exports = {
  getDescription,
};
