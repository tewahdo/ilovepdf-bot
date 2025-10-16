// utils/split.js
import fs from "fs";
import { PDFDocument } from "pdf-lib";
import path from "path";

/**
 * Split a PDF into separate pages or by range
 * @param {string} inputPath - PDF file path
 * @param {string} outputDir - Folder to save output PDFs
 * @param {string} range - Optional range like "1-3"
 * @returns {Promise<string[]>} - Array of output file paths
 */
export async function splitPDF(inputPath, outputDir, range = null) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const data = fs.readFileSync(inputPath);
  const pdfDoc = await PDFDocument.load(data);
  const totalPages = pdfDoc.getPageCount();
  let outputFiles = [];

  if (range) {
    // Split by range
    const [start, end] = range.split("-").map((x) => parseInt(x.trim()) - 1);
    if (start < 0 || end >= totalPages || start > end)
      throw new Error("Invalid range");

    const newPdf = await PDFDocument.create();
    for (let i = start; i <= end; i++) {
      const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
      newPdf.addPage(copiedPage);
    }
    const outPath = path.join(outputDir, `split_${Date.now()}.pdf`);
    fs.writeFileSync(outPath, await newPdf.save());
    outputFiles.push(outPath);
  } else {
    // Split each page
    for (let i = 0; i < totalPages; i++) {
      const newPdf = await PDFDocument.create();
      const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
      newPdf.addPage(copiedPage);
      const outPath = path.join(outputDir, `page_${i + 1}.pdf`);
      fs.writeFileSync(outPath, await newPdf.save());
      outputFiles.push(outPath);
    }
  }

  return outputFiles;
}
