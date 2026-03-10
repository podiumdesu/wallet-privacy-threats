import path from "node:path";
// import readline from "node:readline";
import fs from "fs/promises";
// import {
//   provisionGenericWallet,
//   type ProvisionResult,
// } from "./provision-generic.js";
import type { ExtensionInfo } from "./src/types.js";

const EXT_LIST_FILE = "./preparation/extensions.json";
const UNZIPPED_BASE = "../../datasets/cws-10k-85";
const PROFILES_BASE = "./profiles";
const RESULTS_BASE = "./results";
// const DAPPS_LIST = "./preparation/dapps.json";

import { errorCheck, preparation } from "./src/browser/profilePreparation.js";
import { writeEIP6963Result } from "./src/helpers/dapp/main.js";
import { testWalletWithDapps } from "./src/testWalletWithDapps.js";

// import type { EIP6963baseRes } from "./src/helpers/dapp/main.js";

const SEED =
  "eye glide secret fence bread rotate viable anger child leader select razor";
const PASSWORD = "Default1Password1!";

function nowTag() {
  const d = new Date();
  // e.g. 2025-09-04_153012
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(
    2,
    "0",
  )}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(
    2,
    "0",
  )}`;
}

async function readExtensionIds(file: string): Promise<string[]> {
  const raw = await fs.readFile(file, "utf8");
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("#"));
}
export type ExtensionEntry = { id: string; name: string };

export async function readExtensionList(
  file: string,
): Promise<ExtensionEntry[]> {
  const raw = await fs.readFile(file, "utf8");
  const arr = JSON.parse(raw);

  if (!Array.isArray(arr)) throw new Error("Invalid JSON: expected array");

  return arr.filter(
    (x): x is ExtensionEntry =>
      x &&
      typeof x.id === "string" &&
      typeof x.name === "string" &&
      !x.id.trim().startsWith("#"), // 👈 exclude commented-out entries
  );
}

// --- CSV helper ---
function csvEscape(v: string) {
  const s = v ?? "";
  return `"${s.replace(/"/g, '""')}"`;
}

async function writeCsvResults(
  timestamp: string,
  rows: Array<{
    // extPath: string;
    tempProfileDir: string;
    res: boolean;
    detectedExtId: string;
    addresses: string;
    notes: string;
  }>,
) {
  const RESULTS_FILE = path.join(RESULTS_BASE, `/results-${timestamp}.csv`);
  await fs.mkdir(path.dirname(RESULTS_FILE), { recursive: true });

  const header = [
    "timestamp",
    // "extPath",
    "profileDir",
    "res",
    "detectedExtId",
    "addresses",
    "notes",
  ].join(",");

  const body = rows
    .map((r) =>
      [
        csvEscape(new Date().toISOString()),
        // csvEscape(r.extPath),
        csvEscape(r.tempProfileDir),
        csvEscape(String(r.res)),
        csvEscape(r.detectedExtId),
        csvEscape(r.addresses),
        csvEscape(r.notes),
      ].join(","),
    )
    .join("\n");

  // check if file exists → decide append vs write header
  try {
    await fs.access(RESULTS_FILE);
    // file exists → append only
    await fs.appendFile(RESULTS_FILE, body + "\n", "utf8");
  } catch {
    // file missing → write header + body
    await fs.writeFile(RESULTS_FILE, header + "\n" + body + "\n", "utf8");
  }

  console.log(`✅ CSV updated: ${RESULTS_FILE}`);
}

async function main(nowTs: string) {
  const extensions = await readExtensionList(EXT_LIST_FILE);
  // Use this to write the results (it will be put tgt with all the profiles of the wallets)
  if (extensions.length === 0) {
    console.error(`No extension IDs found in ${EXT_LIST_FILE}`);
    process.exit(1);
  }

  const idLength = extensions.length;
  let idx = 0;

  const walletInfoMap = new Map<string, ExtensionInfo>(); // pathID and the information
  console.log(
    `────────────────── (0) CHECK IF PROFILE EXISTS ──────────────────────────────────────────────────`,
  );
  for (const { id: pathID, name: extName } of extensions) {
    idx++;
    const extPath = path.resolve(UNZIPPED_BASE, pathID);
    // const extName = await getWalletNameById(pathID);
    const baseProfileDir = path.resolve(PROFILES_BASE, "base", pathID);
    const tempProfileDir = path.resolve(
      PROFILES_BASE,
      `temp/${nowTs}/${pathID}-temp-${nowTs}`,
    );
    const info: ExtensionInfo = {
      id: "",
      name: extName,
      pathID,
      baseProfileDir,
      tempProfileDir,
      extPath,
      password: PASSWORD,
      seed: SEED,
    };
    // I need to find the id!!!!

    console.log(`─${idx}/${idLength}── ${pathID}`);
    try {
      const preparationRes = await preparation(info, false);
      const profileName =
        info.tempProfileDir
          .split("/")
          .filter((x) => x)
          .pop() || "";

      const resultFolder = path.resolve("./per-wallet-results");
      const walletFolder = `${resultFolder}/${extName}/${profileName}`;
      fs.mkdir(walletFolder, { recursive: true });

      if (preparationRes instanceof Error) {
        console.error(`[fail] ${pathID} → ${String(preparationRes)}`);
        // write the setup result
      } else {
        // Update the necessary information of the wallet
        info.id = preparationRes.extID;
        info.seed = preparationRes.seed;
        info.password = preparationRes.password;
        // write the setup result
      }

      // rows.push();
    } catch (err: any) {
      console.error(err);
      // Preparation went wrong
      await writeCsvResults(nowTs, [
        {
          //   extPath: id,
          tempProfileDir: info.tempProfileDir,
          res: false,
          detectedExtId: info.id,
          addresses: "",
          notes: String(err),
        },
      ]);
    }
    console.log("[ok] profile prepared");
    walletInfoMap.set(pathID, info);
    // It works well
    await writeCsvResults(nowTs, [
      {
        //   extPath: id,
        tempProfileDir: info.tempProfileDir,
        res: true,
        detectedExtId: info.id,
        addresses: "",
        notes: "",
      },
    ]);
  }
  console.log("✅ Done processing all extensions listed in extension.txt");
  console.log(
    "─────────────────────(0) END ──────────────────────────────────────────────────────────────────────────",
  );

  console.log(
    "─────────────────────(1) COPY FILES ────────────────────────────────────────────────────────────────────",
  );
  for (const pathID of walletInfoMap.keys()) {
    // All the profiles got copied
    await preparation(walletInfoMap.get(pathID)!, true);
  }

  // Now we can start to connect the wallet with the dapp! Using the tempProfileDir and try to get the results!!
  // Every time the profile is clean from the copy!! so its fine!

  console.log(
    "─────────────────────(2) Connect each wallet with a dapp ─────────────────────────────────────────────",
  );
  const tempBaseDir = path.resolve(PROFILES_BASE, `temp/${nowTs}`);

  const uniqueDapps = new Set<string>();
  const dappUrls = [
    // "https://www.worldofdypians.com/",
    // "https://game.pixudi.com",
    // "https://meteora.ag/",
    // "https://pump.fun/",
    // "https://stake.lido.fi/",
    // "https://swap.thorchain.org/", //no coinbase
    "https://app.uniswap.org/swap",
  ];

  // const data = JSON.parse(await fs.readFile(DAPPS_LIST, "utf8"));

  // read the txt by line

  // const raw = await fs.readFile(DAPPS_TXT, "utf8");
  // const data = raw
  //   .split(/\r?\n/)
  //   .map((line) => line.trim())
  //   .filter((line) => line.length > 0);

  // console.log("length", data.length);
  // dappUrls.push(...data);

  // wait for 100s
  // dappUrls.push("https://www.google.com/");
  console.log(`Start testing ${dappUrls.length} dapps...`);
  // await new Promise((resolve) => setTimeout(resolve, 10000));

  let i = 0;
  for (const dappUrl of dappUrls) {
    console.log(`testing ${dappUrl}, ${i}`);
    i = i + 1;
    if (!dappUrl) continue; // skip empty dappUrl
    const origin = new URL(dappUrl).origin;
    if (uniqueDapps.has(origin)) {
      console.log(`skip ${dappUrl}`);
      continue;
    }
    uniqueDapps.add(origin);
    for (const pathID of walletInfoMap.keys()) {
      const { name, extPath } = walletInfoMap.get(pathID)!;
      const fileName = `${pathID}-${dappUrl.replace(/[^a-z0-9]/gi, "_")}`;

      console.log(`Connecting ${name} with ${dappUrl}`);

      const payload: any = {
        err: null,
        baseRes: null,
        dappUrl,
        extName: name,
        extPath,
        notes: [] as string[],
        addresses: [],
        phaseTiming: null,
        cookieAndLocalStorage: null,
        objectEventLogs: null,
        pageRequests: null,
      };

      let prefix = "";

      try {
        const r = await testWalletWithDapps(
          walletInfoMap.get(pathID)!,
          dappUrl,
        );
        if (r.err instanceof Error) {
          // there is error
          throw r;
        }

        prefix = r.prefix;
        payload.baseRes = r.baseRes;
        payload.notes = r.notes;
        payload.addresses = r.addresses;
        payload.phaseTiming = r.phaseTiming;
        payload.cookieAndLocalStorage = r.cookieAndLocalStorage;
        payload.objectEventLogs = r.objectEventLogs;
        payload.pageRequests = r.pageRequests;
      } catch (res: any) {
        payload.prefix = prefix;
        payload.err = String(res.err);
      }
      const writtenFileName =
        payload.err == null
          ? `${fileName}.json`
          : `error-${prefix}-${fileName}.json`;

      writeEIP6963Result(payload, path.join(tempBaseDir, writtenFileName));
    }
  }
}

const nowTs = nowTag();
main(nowTs).catch((e) => {
  console.error(e);
  process.exit(1);
});
