// utils/merge.js
import fs from "fs";
import path from "path";
import PDFMerger from "pdf-merger-js";

/**
 * Merge multiple PDF files into one
 * @param {string[]} filePaths - Array of PDF file paths
 * @param {string} outputPath - Full output path (e.g. ./tmp/merged_123.pdf)
 * @returns {Promise<string>} - Returns the path of the merged PDF
 */
export async function mergePDFs(filePaths, outputPath) {
  try {
    const existingFiles = filePaths.filter((file) => fs.existsSync(file));
    if (existingFiles.length < 2)
      throw new Error("At least 2 valid PDF files are required to merge.");

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const merger = new PDFMerger();
    console.log("🔗 Merging the following files:");
    existingFiles.forEach((f) => console.log(" -", f));

    for (const file of existingFiles) {
      await merger.add(file);
    }

    await merger.save(outputPath);
    console.log(`✅ Merge complete → ${outputPath}`);
    return outputPath;
  } catch (err) {
    console.error("❌ PDF merge failed:", err);
    throw err;
  }
}
