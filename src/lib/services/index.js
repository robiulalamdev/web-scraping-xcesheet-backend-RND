const { RFQ_Queries } = require("../data");

const getCategory = async (description = "") => {
  if (!description) return "Other";

  description = description.toLowerCase();

  for (const query of RFQ_Queries) {
    if (
      query.rfq
        .toLowerCase()
        .split(" ")
        .some((word) => description.includes(word))
    ) {
      return query.category;
    }
  }

  return "Other";
};

// handle popup close
const handlePopupClose = async (page) => {
  try {
    const closeBtnSelector =
      "#onetrust-close-btn-container button.onetrust-close-btn-handler";

    // Check if the element exists
    const closeBtn = await page.$(closeBtnSelector);
    if (closeBtn) {
      await page.click(closeBtnSelector);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for animation
      // await page.reload({ waitUntil: "networkidle0" }); // Refresh page after closing
    } else {
      console.warn(
        "Warning: Cookie close button not found. Proceeding without closing."
      );
    }
  } catch (error) {
    console.warn("Unexpected error while handling cookie banner:", error);
  }

  return true; // Always return true for consistent function behavior
};

const waitForAllRequests = async (cdp) => {
  return new Promise((resolve) => {
    const pendingRequests = new Set();

    const cleanup = () => {
      cdp.removeAllListeners("Network.requestWillBeSent");
      cdp.removeAllListeners("Network.loadingFinished");
      cdp.removeAllListeners("Network.loadingFailed");
    };

    const checkComplete = () => {
      if (pendingRequests.size === 0) {
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
  });
};

module.exports = {
  getCategory,
  handlePopupClose,
  waitForAllRequests,
};
