const chromeLoggerLib = require("./logging.js");
const chromePuppeteerLib = require("./puppeteer.js");
const { importMetaMaskWallet } = require("./helper");
const fs = require("fs");
const path = require("path");
const loog = require("./logger");
const readline = require("readline");

const { onWalletTargetCreated } = require("./handleWallet");
const { text } = require("stream/consumers");

// Read stuff from the csv
const DATA_CSV = path.resolve(__dirname, "../wallet-info.csv");

let walletInfoMap = {};

function unquote(str) {
  // remove any number of " at start or end
  return str.replace(/^"+|"+$/g, "");
}

loog.info("Reading wallet info from CSV file...");
// Only try to load if the file actually exists
if (fs.existsSync(DATA_CSV)) {
  try {
    const text = fs.readFileSync(DATA_CSV, "utf8");
    const rows = text.replace(/\r/g, "").trim().split("\n");
    for (let i = 1; i < rows.length; i++) {
      // name	extensionID	address	service_worker	pathID
      // name,notes,extensionID,address,service_worker,password,homePage,pathID
      let [
        rawName,
        rawNotes,
        rawExtensionID,
        rawAddress,
        rawServiceWorker,
        rawPassword,
        rawHomePage,
        rawPathID,
      ] = rows[i].split(",");

      // unquote each
      const walletName = unquote(rawName);
      const notes = unquote(rawNotes);
      const extensionID = unquote(rawExtensionID);
      const walletAddress = unquote(rawAddress);
      const serviceWorker = unquote(rawServiceWorker);
      const password = unquote(rawPassword);
      const pathID = unquote(rawPathID).split("/r")[0];
      const homePage = unquote(rawHomePage).trim();

      walletInfoMap[pathID] = {
        walletName,
        notes,
        walletAddress,
        extensionID,
        serviceWorker,
        homePage,
        password,
      };
    }
    loog.success(
      `[INFO] Loaded ${Object.keys(walletInfoMap).length} entries from CSV`,
    );
  } catch (err) {
    console.warn(`[WARN] Failed to parse ${DATA_CSV}: ${err.message}`);
  }
} else {
  console.log(
    `[INFO] No ${path.basename(DATA_CSV)} found—falling back to manual input`,
  );
}

function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time * 1000));
}

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function removeDuplicates(arr) {
  return arr.filter((item, index) => arr.indexOf(item) === index);
}

function removeEmptyStrings(arr) {
  return arr.filter((n) => n);
}

function normalizeHeaders(headers) {
  const normalized = {};
  Object.keys(headers).forEach((name) => {
    normalized[name.toLowerCase().trim()] = headers[name];
  });
  return normalized;
}

const onRequest = async (options, requestLog, request) => {
  let requestContext = [];

  const frame = request.frame();
  if (frame) {
    if (options.printFrameHierarchy) {
      requestContext = [];
      let parentFrame = frame;
      while (parentFrame) {
        requestContext.push(parentFrame.url());
        parentFrame = await parentFrame.parentFrame();
      }
    } else {
      requestContext.push(frame.url());
    }
  }

  const requestUrl = request.url();
  const requestType =
    request.resourceType()[0].toUpperCase() +
    request.resourceType().substring(1);
  const requestMethod = request.method();
  const requestHeaders = normalizeHeaders(request.headers());

  let requestPostData = request.postData();
  if (requestPostData === undefined) {
    requestPostData = "";
  }

  requestLog.requests.push({
    requestContext,
    id: request._requestId,
    ts: Date.now(),
    url: requestUrl,
    type: requestType,
    status: undefined,
    method: requestMethod,
    headers: requestHeaders,
    postData: requestPostData,
    responseHeaders: {},
  });

  const numRequests = requestLog.requests.length;
  const logger = chromeLoggerLib.getLoggerForLevel(options.debugLevel);
  logger.debug(
    "Request " +
      numRequests +
      ": \x1b[94m" +
      requestUrl.split("?", 1).toString().split(";", 1) +
      "\x1b[0m",
  );
};

const handleWebSocketCreated = async (
  options,
  requestLog,
  webSockets,
  request,
) => {
  let requestContext = [];

  if (request.initiator.stack.callFrames.length > 0) {
    const frame = request.initiator.stack.callFrames[0];
    if (frame) {
      if (options.printFrameHierarchy) {
        requestContext = [];
        for (let i = 0; i < request.initiator.stack.callFrames.length; i++) {
          let frame = request.initiator.stack.callFrames[i];
          if (!requestContext.includes(frame.url)) {
            requestContext.push(frame.url);
          }
        }
      } else {
        requestContext.push(frame.url);
      }
    }
  }

  request["requestContext"] = requestContext;
  webSockets.push(request);
};

const handleWebSocketFrameSent = async (
  options,
  requestLog,
  webSockets,
  request,
) => {
  for (let i = 0; i < webSockets.length; i++) {
    if (webSockets[i].requestId === request.requestId) {
      requestUrl = webSockets[i].url;
      requestContext = webSockets[i].requestContext;
      requestLog.requests.push({
        requestContext,
        id: request.requestId,
        url: requestUrl,
        type: "WebSocket",
        status: undefined,
        method: "",
        headers: "",
        postData: request.response.payloadData,
        responseHeaders: {},
      });
      const numRequests = requestLog.requests.length;
      const logger = chromeLoggerLib.getLoggerForLevel(options.debugLevel);
      logger.debug(
        "Request " +
          numRequests +
          ": \x1b[94m" +
          requestUrl.split("?", 1).toString().split(";", 1) +
          "\x1b[0m",
      );
      break;
    }
  }
};

const handleResponse = async (options, requestLog, request) => {
  for (let i = 0; i < requestLog.requests.length; i++) {
    if (requestLog.requests[i].id === request.requestId) {
      requestLog.requests[i].status = request.response.status;
      requestLog.requests[i].responseHeaders = normalizeHeaders(
        request.response.headers,
      );
      break;
    }
  }
};

const handleResponseExtraInfo = async (options, requestLog, response) => {
  for (let i = 0; i < requestLog.requests.length; i++) {
    if (requestLog.requests[i].id === response.requestId) {
      requestLog.requests[i].responseHeaders = normalizeHeaders(
        response.headers,
      );
      break;
    }
  }
};

const onClose = async (options, page) => {
  console.log("Page closed: \x1b[94m" + page.url() + "\x1b[0m");
};

const onTargetCreated = async (
  options,
  requestLog,
  requestsFromWallet,
  webSockets,
  cdpClients,
  target,
) => {
  /****************
   * NEW: Handle service worker targets
   ********************
   * This block handles the creation of service worker targets,
   * specifically for wallet extensions.
   * It checks if the target is a service worker or background page,
   * and if it is a Chrome extension.
   * If so, it binds the `onWalletTargetCreated` function to handle requests from
   * these targets.
   */
  if (
    (target.type() === "service_worker" ||
      target.type() === "background_page") &&
    target.url().startsWith("chrome-extension://")
  ) {
    loog.success(`${target.type()} target created: ${target.url()}`);

    const extensionId = target.url().split("/")[2];
    loog.debug(`Extension ID: ${extensionId}`);

    requestsFromWallet.serviceWorker = target.type();
    requestsFromWallet.extensionID = extensionId;

    const boundWalletTargetHandler = onWalletTargetCreated.bind(
      undefined,
      undefined,
      requestsFromWallet,
      webSockets,
      cdpClients,
    );

    boundWalletTargetHandler(target);
  }

  if (target.type() !== "page") {
    return;
  }
  const page = await target.page();
  page.on("request", onRequest.bind(undefined, options, requestLog));
  page.on("close", onClose.bind(undefined, options, page));

  let cdpClient;
  try {
    cdpClient = await page.target().createCDPSession();
  } catch (err) {
    loog.warn("[WARN] Failed to attach to target:", page.url(), err.message);
    return;
  }

  await cdpClient.send("Network.enable");
  await cdpClient.send("Page.enable");
  cdpClient.on(
    "Network.webSocketCreated",
    handleWebSocketCreated.bind(undefined, options, requestLog, webSockets),
  );
  cdpClient.on(
    "Network.webSocketFrameSent",
    handleWebSocketFrameSent.bind(undefined, options, requestLog, webSockets),
  );
  cdpClient.on(
    "Network.responseReceived",
    handleResponse.bind(undefined, options, requestLog),
  );
  cdpClient.on(
    "Network.responseReceivedExtraInfo",
    handleResponseExtraInfo.bind(undefined, options, requestLog),
  );
  cdpClients.push(cdpClient);

  const logger = chromeLoggerLib.getLoggerForLevel(options.debugLevel);
  logger.debug("Completed configuring new page. (" + page.url() + ")");
};

const crawl = async (args) => {
  const logger = chromeLoggerLib.getLoggerForLevel(args.debugLevel);
  const log = Object.create(null);
  let homePage;

  log.arguments = args;
  const pathID = args.walletPath.split("/").pop();
  loog.success("Path ID: " + pathID);
  log.pathID = pathID;
  log.timestamps = {
    start: Date.now(),
    end: undefined,
  };
  log.walletAddress = "";
  log.walletName = "";
  log.notes = "";
  log.extensionID = "";
  log.password = "";
  log.requests = [];

  let cdpClients = [];
  let webSockets = [];

  let browser;

  let requestsFromWallet = {
    arguments: args,
    timestamps: {
      start: log.timestamps.start,
      end: undefined,
    },
    extensionID: "",
    serviceWorker: "",
    walletName: "",
    notes: "",
    walletAddress: "",
    password: "",
    pathID: pathID,
    requests: [],
  };

  try {
    loog.info("Check if walletPath exists: " + args.walletPath);
    let manifest = {};
    const manifestPath = path.join(args.walletPath, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      console.error(`No manifest.json found in ${args.walletPath}`);
      log.walletName = "none";
      requestsFromWallet.walletName = "none";
      throw new Error(
        `No manifest.json found in ${args.walletPath}. Please check the path. dead`,
      );
    } else {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      // … use manifest
      loog.success(
        `Manifest loaded successfully from ${manifestPath}. Version: ${manifest.version}`,
      );
    }

    if (walletInfoMap.hasOwnProperty(pathID)) {
      loog.success(
        "Found wallet info in CSV file for path ID: " +
          pathID +
          walletInfoMap[pathID].walletName,
      );
      // Otherwise, read [walletName, extensionID, walletAddress, serviceWorker, password] from the walletInfoMap
      const info = walletInfoMap[pathID];
      log.walletName = info.walletName;
      log.notes = info.notes;
      log.extensionID = info.extensionID;
      log.walletAddress = info.walletAddress;
      log.password = info.password || "Default1Password1!"; // Default password if not provided
      requestsFromWallet.extensionID = log.extensionID;
      requestsFromWallet.notes = log.notes;
      requestsFromWallet.walletAddress = log.walletAddress;
      requestsFromWallet.walletName = log.walletName;
      requestsFromWallet.serviceWorker = info.serviceWorker;
      requestsFromWallet.password = log.password;

      if (info.notes.includes("dead")) {
        // exit the whole program
        console.error(
          `[ERROR] Found 'dead' wallet address in CSV for path ID: ${pathID}. Exiting...`,
        );
        // throw an error to stop the program
        throw new Error(
          `Found 'dead' wallet address in CSV for path ID: ${pathID}. Exiting...`,
        );
      }
    }

    browser = await chromePuppeteerLib.launch(args);
    browser.on(
      "targetcreated",
      onTargetCreated.bind(
        undefined,
        args,
        log,
        requestsFromWallet,
        webSockets,
        cdpClients,
      ),
    );

    browser.on("targetdestroyed", (target) => {
      console.log("[INFO] Target destroyed:", target.url());
    });

    /******************
     * NEW: Capture existing service worker targets
     * This block captures any existing service worker targets (like wallet extensions)
     * that were already running when the browser was launched.
     * It will look for targets of type 'background_page' or 'service_worker'
     * and will bind the 'onWalletTargetCreated' function to handle requests from them.
     */
    // --------------------- Service Worker Request Capture ---------------------
    const existingTargets = await browser.targets();

    for (let target of existingTargets) {
      // Check if the target is a 'background_page', which includes service workers (like wallet extensions)
      if (
        (target.type() === "background_page" || // v2
          target.type() === "service_worker") && // v3
        target.url().startsWith("chrome-extension://") // Ensure that the target is a Chrome extension
      ) {
        const extensionId = target.url().split("/")[2];
        loog.success(
          `Existing targets found background page target: ${target.url()} (${target.type()})`,
        );
        loog.success(`Extension ID: ${extensionId}`);

        requestsFromWallet.serviceWorker = target.type();
        requestsFromWallet.extensionID = extensionId;

        // Bind the 'onWalletTargetCreated' function to the specific arguments (requestsFromWallet, webSockets, cdpClients).
        // This handler will process any wallet-related requests coming from this background page.
        const boundWalletTargetHandler = onWalletTargetCreated.bind(
          undefined,
          undefined,
          requestsFromWallet,
          webSockets,
          cdpClients,
        );

        // Call the handler for the currently found background page target to start capturing its requests.
        boundWalletTargetHandler(target);
      }
    }
    // -------------------- End of Service Worker Capture Block -------------------

    // Check if the information of the wallet is already in the CSV file

    if (!walletInfoMap.hasOwnProperty(pathID)) {
      loog.warn(
        "No wallet info found in CSV file for path ID: " +
          pathID +
          ". Use default input",
      );

      log.walletName = "metamask";

      if (log.walletAddress == "") {
        log.walletAddress = [
          "0x033a5379bc3d5edd92b9b1da762688e97cef154c",
          "0x4A981186BbFBeC244E0F7260529528D294EC04Ed",
          "0x196E98A561479ff97D533401Cc10e95b238e1a2A",
        ].join(";");
      }

      if (log.password == "") {
        log.password = "Default1Password1!";
      }

      requestsFromWallet.password = log.password;
      requestsFromWallet.walletName = log.walletName;
      requestsFromWallet.walletAddress = log.walletAddress;
      requestsFromWallet.notes = log.notes;
    }

    let pages = await browser.pages();
    let page = await pages[0];
    await page.goto("chrome://extensions/", {
      waitUntil: "domcontentloaded",
    });

    // Open the wallet page
    if (requestsFromWallet.extensionID === "") {
      log.extensionID = await new Promise((resolve) => {
        const readInput = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        readInput.question("Please enter extension ID: ", (answer) => {
          readInput.close();
          resolve(answer);
        });
      });
      if (log.extensionID == "dead") {
        throw new Error(
          "You have entered 'dead' as the extension ID. Exiting...",
        );
      }
      requestsFromWallet.extensionID = log.extensionID;
    } else {
      log.extensionID = requestsFromWallet.extensionID;
    }

    // page.close();
    page = await browser.newPage();
    let default_popup;

    if (walletInfoMap.hasOwnProperty(pathID)) {
      loog.success("yes");
      if (walletInfoMap[pathID].homePage) {
        loog.success("yes");

        default_popup = walletInfoMap[pathID].homePage;
        homePage = walletInfoMap[pathID].homePage;
        loog.info(
          "Using homePage from walletInfoMap: " +
            default_popup +
            " from manifest",
        );
      }
    }

    if (!default_popup) {
      if (manifest.hasOwnProperty("browser_action")) {
        default_popup = manifest.browser_action.default_popup;
      } else {
        loog.info(
          "No browser_action found in manifest, using action.default_popup",
        );
        if (manifest.hasOwnProperty("action")) {
          default_popup = manifest.action.default_popup;
          loog.info(
            "Using action.default_popup: " + default_popup + " from manifest",
          );
        }
      }
    }

    if (!default_popup) {
      loog.warn(
        "No browser_action or action found in manifest, trying to find homepage url",
      );

      // No where to find the homepage url, so we will ask the user to input it
      homePage = await new Promise((resolve) => {
        const readInput = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        readInput.question("Please enter home page url: ", (answer) => {
          readInput.close();
          resolve(answer);
        });
      });

      default_popup = homePage;
    }

    // Wait for wallet page to load
    await sleep(2);
    pages = await browser.pages();

    const wallet = await pages[pages.length - 1];
    await wallet.bringToFront();

    // Import wallet
    console.log("Importing wallet...");
    try {
      await sleep(4);
      const unlockExists = await wallet.evaluate(() => {
        return [...document.querySelectorAll("button")].some((btn) =>
          btn.innerText.trim().toLowerCase().includes("unlock"),
        );
      });

      if (unlockExists) {
        logger.info("Unlock button found");
        throw new Error("Unlock button found");
      }
      wallet.setDefaultNavigationTimeout(0);
      await importMetaMaskWallet(logger, wallet);
    } catch {
      logger.debug("Failed to import wallet!");
      /****************************
       * Try to input the password
       ****************************/

      try {
        // 2) Wait for the password input field
        const PASS_SELECTOR =
          'input[type="password"], input[placeholder*="assword"], input[id*="pass"]';
        loog.info(`Password input found with selector: ${PASS_SELECTOR}`);

        // 3) Fill in the password
        const PASSWORD = log.password;
        await wallet.focus(PASS_SELECTOR);
        await wallet.keyboard.type(PASSWORD);
        loog.debug(`Typed password into ${PASS_SELECTOR}`);

        // 4) Wait for (and click) the submit/login button
        const BTN_SELECTOR = "button, button.login, button.btn-primary";
        const buttonInput = await wallet.$(BTN_SELECTOR);

        loog.info(`Login button found with selector: ${buttonInput}`);
        if (!buttonInput) {
          loog.error(`Login button not found with selector: ${buttonInput}`);
          log.password = await new Promise((resolve) => {
            const readInput = readline.createInterface({
              input: process.stdin,
              output: process.stdout,
            });
            readInput.question("Please enter password: ", (answer) => {
              readInput.close();
              resolve(answer);
            });
          });
        } else {
          await buttonInput.click();

          loog.debug(`Clicked login button ${buttonInput}`);

          // 5) Now wait for whatever comes next (e.g. a success indicator or new button set)
          try {
            await wallet.waitForNavigation({
              waitUntil: "networkidle2",
              timeout: 2000,
            });
            loog.debug("Post-login navigation complete.");
          } catch {
            loog.debug(
              "No actual navigation after login (timeout), continuing…",
            );
          }
        }
      } catch (error) {
        console.error(`Failed to input password for path ID: ${pathID}`);
        log.password = await new Promise((resolve) => {
          const readInput = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          readInput.question("Please enter password yourself \n", (answer) => {
            readInput.close();
            resolve(answer);
          });
        });
      }
    }

    /*********************
     * Interact with wallet extension
     *********************
     * This part will click on random elements in the wallet extension popup.
     * It will click on buttons, divs, and spans.
     */

    const walletPage =
      "chrome-extension://" + log.extensionID + "/" + default_popup;
    await Promise.all([
      page.waitForNavigation(),
      page.goto(walletPage, {
        waitUntil: "networkidle0",
        timeout: 3000,
      }),
      loog.success("Navigated to browser action popup: " + walletPage),
      page.bringToFront(),
    ]).catch(async (e) => {
      // try to visit the homepage if the popup navigation fails
      loog.debug(
        `Failed to navigate to browser action popup here: ${e.toString()}`,
      );
    });
    let elements = [];
    let clickable_rects = [];

    elements = await page.$$("button");
    for (const element of elements) {
      let boundingBox = await element.boundingBox();
      if (boundingBox != null) {
        const rect = await page.evaluate((el) => {
          const { x, y } = el.getBoundingClientRect();
          return { x, y };
        }, element);
        clickable_rects.push(rect);
      }
    }

    elements = await page.$$("div");
    for (const element of elements) {
      let boundingBox = await element.boundingBox();
      if (boundingBox != null) {
        const rect = await page.evaluate((el) => {
          const { x, y } = el.getBoundingClientRect();
          return { x, y };
        }, element);
        clickable_rects.push(rect);
      }
    }

    elements = await page.$$("span");
    for (const element of elements) {
      let boundingBox = await element.boundingBox();
      if (boundingBox != null) {
        const rect = await page.evaluate((el) => {
          const { x, y } = el.getBoundingClientRect();
          return { x, y };
        }, element);
        clickable_rects.push(rect);
      }
    }

    logger.debug("Found " + clickable_rects.length + " clickable elements.");

    let clicked_rects = [];
    const start = Date.now();
    loog.success(start);
    while (
      clicked_rects.length < args.links &&
      Date.now() - start < 60 * 1000
    ) {
      let clickable_rect = getRandomItem(clickable_rects);
      if (!clicked_rects.includes(clickable_rect)) {
        clicked_rects.push(clickable_rect);
        try {
          await page.mouse.click(clickable_rect.x + 1, clickable_rect.y + 1);
          await sleep(2);
        } catch {}

        await page
          .goto("chrome-extension://" + log.extensionID + "/" + default_popup, {
            waitUntil: "networkidle0",
            timeout: 3000,
          })
          .catch((e) => {
            logger.debug(
              "\x1b[91mFailed to navigate to browser action popup *: " +
                e.toString() +
                "\x1b[0m",
            );
          });
      }
    }

    logger.debug("Finished interacting with wallet extension.");
    log.success = true;
    requestsFromWallet.success = true;
  } catch (error) {
    log.success = false;
    requestsFromWallet.success = false;
    requestsFromWallet.msg = error.toString();
    log.msg = error.toString();
    logger.debug(
      "\x1b[91mCaught error when crawling: for " + log.msg + "\x1b[0m",
    );
  }

  try {
    logger.debug("Trying to shutdown");
    await browser.close();
  } catch (e) {
    logger.debug(
      "\x1b[91mError when shutting down: " + e.toString() + "\x1b[0m",
    );
  }

  log.timestamps.end = Date.now();
  requestsFromWallet.timestamps.end = log.timestamps.end;
  return {
    crawlLog: log,
    walletLog: requestsFromWallet,
    walletInfo: [
      log.walletName,
      log.notes,
      log.extensionID,
      log.walletAddress,
      requestsFromWallet.serviceWorker,
      log.password,
      homePage || "",
    ],
  };
};

module.exports = {
  crawl,
};
