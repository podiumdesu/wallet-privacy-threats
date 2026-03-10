#!/usr/bin/env node
const fs = require("fs");
const argparseLib = require("argparse");
const pathLib = require("path");

const rawCliArgs = process.argv.slice(2);
const useAuto = rawCliArgs.includes("auto");
const filteredCliArgs = rawCliArgs.filter((arg) => arg !== "auto");

const crawlerModulePath = useAuto
  ? "./chrome/auto-new-crawl.js"
  : "./chrome/new-crawl.js";

const chromeCrawlLib = require(crawlerModulePath);
const chromeLoggerLib = require("./chrome/logging.js");
const chromeValidateLib = require("./chrome/validate.js");

const defaultDebugSetting = "none";

const parser = new argparseLib.ArgumentParser({
  add_help: true,
  description: "CLI tool for recording requests made when visiting a URL.",
});
parser.add_argument("-b", "--binary", {
  required: false,
  help: "Path to a puppeteer compatible browser.",
});
parser.add_argument("--debug", {
  help: `Print debugging information. Default: ${defaultDebugSetting}.`,
  choices: ["none", "debug", "verbose"],
  default: defaultDebugSetting,
});
parser.add_argument("-u", "--url", {
  help: "The URL to record requests",
  required: false,
});
parser.add_argument("-p", "--profile", {
  help: "Path to use and store profile data to.",
  required: false,
});
parser.add_argument("-a", "--ancestors", {
  help:
    "Log each requests frame hierarchy, not just the immediate parent. " +
    "(frame URLs are recorded from immediate frame to top most frame)",
  action: "store_true",
});
parser.add_argument("--interactive", {
  help: "Show the browser when recording (by default runs headless).",
  action: "store_true",
});
group = parser.add_mutually_exclusive_group({ required: true });
group.add_argument("-t", "--secs", {
  help: `The dwell time in seconds.`,
  type: "int",
});
group.add_argument("-l", "--links", {
  help: `The maximum number of links to follow.`,
  type: "int",
});
parser.add_argument("-w", "--wallet", {
  help: "Path to the wallet extension.",
  required: true,
});
parser.add_argument("-d", "--destination", {
  help: "Path where to log intercepted requests.",
  required: false,
});
parser.add_argument("-f", "--force", {
  help: "Force override if results file already exists.",
  action: "store_true",
});

const rawArgs = parser.parse_args(filteredCliArgs);
const [isValid, errorOrArgs] = chromeValidateLib.validate(rawArgs);
if (!isValid) {
  throw errorOrArgs;
}

const appendToCSV = (filePath, headers, rowData, pathID) => {
  const exists = fs.existsSync(filePath);
  const writeHeaders = !exists;

  const row =
    rowData.map((item) => `"${item}"`).join(",") + "," + pathID + "\n";

  if (writeHeaders) {
    const headerRow = headers.join(",") + "\n";
    fs.writeFileSync(filePath, headerRow + row);
  } else {
    fs.appendFileSync(filePath, row);
  }
};

(async (_) => {
  const logger = chromeLoggerLib.getLoggerForLevel(errorOrArgs.debugLevel);
  let id;
  if (errorOrArgs.url == undefined) {
    id = errorOrArgs.walletPath.slice(
      errorOrArgs.walletPath.lastIndexOf("/") + 1,
    );
  } else {
    id = errorOrArgs.url.split("//")[1].split("?")[0].split("/")[0];
  }

  // // Add for profile path
  // errorOrArgs.profilePath = errorOrArgs.profile;

  // Ensure profile path directory exists
  if (errorOrArgs.profilePath) {
    const absProfilePath = pathLib.resolve(errorOrArgs.profilePath);
    if (!fs.existsSync(absProfilePath)) {
      fs.mkdirSync(absProfilePath, { recursive: true });
      console.log("[INFO] Created new profile directory at:", absProfilePath);
    } else {
      console.log("[INFO] Using existing profile directory:", absProfilePath);
    }
    errorOrArgs.profilePath = absProfilePath;
  }

  // const tsForFile = new Date().toISOString().replace(/[:.]/g, "-");
  // // const destinationPath = errorOrArgs.destination + "/" + tsForFile;
  const destinationPath = errorOrArgs.destination;
  if (!fs.existsSync(destinationPath)) {
    fs.mkdirSync(destinationPath, { recursive: true }); // ✅ creates nested directories too
  }

  const path = destinationPath + "/" + id + ".json";
  const walletPath = destinationPath + "/" + id + "-wallet.json";
  const walletInfoPath = destinationPath + "/" + "wallet-info.csv";

  if (!fs.existsSync(path) || errorOrArgs.force) {
    const { crawlLog, walletLog, walletInfo } =
      await chromeCrawlLib.crawl(errorOrArgs);
    try {
      fs.writeFileSync(path, JSON.stringify(crawlLog, null, 4));
      fs.writeFileSync(walletPath, JSON.stringify(walletLog, null, 4));
      console.log("Crawl log saved to:", path);
      console.log("Wallet log saved to:", walletPath);

      const headers = [
        "name",
        "notes",
        "extensionID",
        "address",
        "service_worker",
        "password",
        "homePage",
        "pathID",
      ];

      appendToCSV(walletInfoPath, headers, walletInfo, id);

      console.log("✅ Wallet info saved to:", walletInfoPath);
    } catch (err) {
      console.error(err);
    }
    process.exit(crawlLog.success === true ? 0 : 1);
  } else {
    console.log("File " + path + " already exists!");
  }
})();
