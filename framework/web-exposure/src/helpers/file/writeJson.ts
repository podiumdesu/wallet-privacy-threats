import path from "path";
import fs from "fs/promises";

export async function writeJsonResult(result: {}, filePath: string) {
  const abs = path.resolve(filePath);
  const data = JSON.stringify(result, null, 2); // pretty-print
  await fs.writeFile(abs, data, "utf8");
  console.log(`Result written to ${abs}`);
}
