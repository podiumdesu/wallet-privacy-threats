import fs from "fs/promises";
import path from "path";
import readline from "readline/promises";
import {
  provisionGenericWalletNew,
  type ProvisionResult,
} from "../provision-permission-generic.js";
import type { ExtensionInfo } from "../types.js";

async function _safeCloneProfile(baseDir: string, tempDir: string) {
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.access(baseDir);
  await fs.cp(baseDir, tempDir, { recursive: true });
}

// wait for user to press ENTER (or type a keyword) in the console
async function _waitForConsoleSignal(
  promptText = "Press ENTER to continue…",
  keyword?: string
): Promise<boolean> {
  console.log(
    "[DEBUG] entering _waitForConsoleSignal, isTTY:",
    process.stdin.isTTY
  );
  if (process.stdin.isTTY) {
    try {
      (process.stdin as any).setRawMode?.(false);
    } catch {}
  }
  process.stdin.resume();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  console.log("[DEBUG] before rl.question");
  const result = await new Promise<boolean>((resolve) => {
    const want = keyword?.toLowerCase();

    const onLine = (answer: string) => {
      console.log("[DEBUG] in line handler");
      console.log(`[DEBUG] User input: ${JSON.stringify(answer)}`);
      rl.removeListener("SIGINT", onSigint);
      rl.close();
      const trimmed = (answer ?? "").trim().toLowerCase();
      resolve(want ? trimmed === want : true);
    };

    const onSigint = () => {
      console.log("[DEBUG] SIGINT");
      rl.removeListener("line", onLine);
      rl.close();
      resolve(false);
    };

    rl.once("line", onLine);
    rl.once("SIGINT", onSigint);

    // show prompt and wait for Enter
    rl.setPrompt(`${promptText}\n> `);
    rl.prompt();
  });

  return result;
}

async function _pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// check if manifest.json exists in the current folder
async function _isExtensionFolder(extPath: string): Promise<boolean> {
  return fs
    .access(path.join(extPath, "manifest.json"))
    .then(() => true)
    .catch(() => false);
}

// detect if the manifest version is 2 or 3
async function _detectManifestVersion(extPath: string): Promise<boolean> {
  const raw = await fs.readFile(path.join(extPath, "manifest.json"), "utf8");
  const manifest = JSON.parse(raw);
  return manifest.manifest_version == 3 ? true : false;
}

export const errorCheck = (err: any): Error => {
  if (err instanceof Error) {
    console.error("Error:", err.message);
    return err; // now TypeScript knows it's an Error
  } else {
    console.error("Unknown error:");
    return new Error(String(err).slice(0, 100));
  }
};

export async function preparation(
  info: ExtensionInfo,
  copyTempPath = false
): Promise<
  | Error
  | {
      seed: string;
      password: string;
      extID: string;
      walletSettingUpRes: ProvisionResult | null; // if it is null, means there was no wallet setup involved
    }
> {
  const { extPath, pathID, seed, password, baseProfileDir, tempProfileDir } =
    info;
  try {
    // ✅ Make sure extension exists
    const isExtensionFolderRes = await _isExtensionFolder(extPath);
    if (!isExtensionFolderRes) {
      throw new Error(`Extension folder missing: ${extPath}`);
    }

    // ✅ Check manifest
    const isManifestV3 = await _detectManifestVersion(extPath);
    if (!isManifestV3) {
      throw new Error(`Extension manifest version is not 3: ${extPath}`);
    }
  } catch (err: any) {
    return errorCheck(err);
  }

  if (!(await _pathExists(baseProfileDir))) {
    // ✅ Clone profile before using it
    if (!copyTempPath) {
      console.log(`[run] baseProfileDir=${baseProfileDir}`);
      console.log(`[run] tempProfileDir=${tempProfileDir}`);
    }
    try {
      let res: ProvisionResult;

      console.warn(
        `[warn] Base profile missing for ${pathID}. Initializing at: ${baseProfileDir}`
      );

      // --- OPTIONAL: print helpful steps for you to follow while it's paused
      console.log(`
            🔧 Manual setup required (one-time) for ${pathID}
            1) Launch your browser using this profile directory:
              ${baseProfileDir}
            2) Install your wallet extension from:
              ${extPath}
            3) Complete onboarding (import seed, set password, unlock, approve as needed).
            4) Close the browser to flush the state to disk.
            `);

      // create the tempProfileDir
      await fs.mkdir(tempProfileDir, { recursive: true });

      // Here set up the profile and open the browser
      let walletSettingUpRes: ProvisionResult = await provisionGenericWalletNew(
        info,
        seed,
        password
      );
      info.id = walletSettingUpRes.extId;

      if (walletSettingUpRes.res === false) {
        console.log(
          "THERE IS ERROR FROM AUTOMATICALLY SETTING UP THE WALLET",
          walletSettingUpRes.notes
        );
      } else {
        res = walletSettingUpRes;
      } // This is just a way to automatically set up the extension. So the result wont cause the script to fail

      // ⏸️ Pause the script here until you signal it's ready
      const ready = await _waitForConsoleSignal(
        "When the base profile is ready, type 'done' to continue… The new-set profile will be cloned to the base profile.",
        "done"
      );
      if (!ready) {
        console.error(`[fail] Base profile not ready for ${pathID}`);
        throw new Error("Base profile not ready");
      } else {
        // we have set up the correct profile, continue
        await _safeCloneProfile(tempProfileDir, baseProfileDir);
        console.log(`[clone] temp → base OK for ${pathID}`);
      }
      // Base exists (now) → clone and proceed
      // await _safeCloneProfile(baseProfileDir, tempProfileDir);
      // console.log(`[clone] Base → temp OK for ${pathID}`);
      // shut down the browser
      return {
        extID: info.id,
        seed,
        password,
        walletSettingUpRes,
      };
    } catch (err) {
      return errorCheck(err);
    }
  } else {
    // Base already exists → clone and proceed
    if (copyTempPath) {
      await _safeCloneProfile(baseProfileDir, tempProfileDir);
      console.log(
        `[clone] Base → temp OK for ${pathID}, using ${tempProfileDir
          .split("/")
          .pop()}`
      );
    }
    return {
      extID: info.id,
      seed,
      password,
      walletSettingUpRes: null,
    };
  }
}
