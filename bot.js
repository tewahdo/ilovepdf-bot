// ====== IMPORTS ======
import express from "express";
import bodyParser from "body-parser";
import fs from "fs-extra";
import path from "path";
import { PDFDocument } from "pdf-lib";
import dotenv from "dotenv";

// ====== ENVIRONMENT VARIABLES ======
dotenv.config();
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const URL = process.env.RENDER_EXTERNAL_URL; // Render auto URL
if (!TOKEN || !URL) {
  console.error("Missing TELEGRAM_BOT_TOKEN or RENDER_EXTERNAL_URL!");
  process.exit(1);
}

// ====== TELEGRAM SETUP ======
import TelegramBot from "node-telegram-bot-api";
const bot = new TelegramBot(TOKEN);
const webhookPath = `/webhook/${TOKEN}`;
bot.setWebHook(`${URL}${webhookPath}`);

// ====== EXPRESS SETUP ======
const app = express();
app.use(bodyParser.json());

// ====== GLOBAL STATE ======
const userAction = {};
const userFiles = {};

// ====== HELPER FUNCTIONS ======
async function handleMerge(chatId) {
  if (!userFiles[chatId] || userFiles[chatId].length < 2) {
    return bot.sendMessage(chatId, "❌ Upload at least 2 PDFs to merge.");
  }
  const mergedPdf = await PDFDocument.create();
  for (const filePath of userFiles[chatId]) {
    const pdfBytes = await fs.readFile(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
    pages.forEach((p) => mergedPdf.addPage(p));
  }
  const outPath = path.join("./tmp", `merged_${chatId}.pdf`);
  await fs.ensureDir("./tmp");
  await fs.writeFile(outPath, await mergedPdf.save());
  await bot.sendDocument(chatId, outPath);
  userFiles[chatId].forEach(async (f) => await fs.remove(f));
  userFiles[chatId] = [];
  await fs.remove(outPath);
}

async function handleSplit(chatId, filePath) {
  const pdfBytes = await fs.readFile(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const totalPages = pdfDoc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const newPdf = await PDFDocument.create();
    const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
    newPdf.addPage(copiedPage);
    const outPath = path.join("./tmp", `split_${chatId}_page${i + 1}.pdf`);
    await fs.writeFile(outPath, await newPdf.save());
    await bot.sendDocument(chatId, outPath);
    await fs.remove(outPath);
  }
}

async function handleCompress(chatId, filePath) {
  const pdfBytes = await fs.readFile(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const compressed = await pdfDoc.save({ useObjectStreams: true });
  const outPath = path.join("./tmp", `compressed_${chatId}.pdf`);
  await fs.writeFile(outPath, compressed);
  await bot.sendDocument(chatId, outPath);
  await fs.remove(outPath);
}

// ====== TELEGRAM WEBHOOK HANDLER ======
app.post(webhookPath, async (req, res) => {
  const update = req.body;

  // ====== Messages ======
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;

    // Handle commands
    if (msg.text === "/start") {
      return bot.sendMessage(chatId, "Welcome to iLovePDF Bot 📝", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Merge PDF", callback_data: "merge" }],
            [{ text: "Split PDF", callback_data: "split" }],
            [{ text: "Compress PDF", callback_data: "compress" }],
            [{ text: "Cancel / Reset", callback_data: "cancel" }],
          ],
        },
      });
    }

    if (msg.text === "/done") {
      if (userAction[chatId] === "merge") {
        return handleMerge(chatId);
      } else {
        return bot.sendMessage(chatId, "❌ No merge in progress.");
      }
    }
  }

  // ====== Callback Queries (buttons) ======
  if (update.callback_query) {
    const query = update.callback_query;
    const chatId = query.message.chat.id;
    const action = query.data;

    if (action === "cancel") {
      userAction[chatId] = null;
      if (userFiles[chatId]) {
        userFiles[chatId].forEach(async (f) => await fs.remove(f));
        userFiles[chatId] = [];
      }
      return bot.sendMessage(chatId, "✅ Operation cancelled.");
    }

    userAction[chatId] = action;
    if (action === "merge") userFiles[chatId] = [];
    return bot.sendMessage(chatId, `Selected: ${action}. Upload files and type /done when ready.`);
  }

  // ====== File uploads ======
  if (update.message && update.message.document) {
    const doc = update.message.document;
    const chatId = update.message.chat.id;
    const action = userAction[chatId];
    if (!action) return bot.sendMessage(chatId, "❌ Select an action first with /start.");

    const fileLink = await bot.getFileLink(doc.file_id);
    const buffer = Buffer.from(await (await fetch(fileLink)).arrayBuffer());
    const tempPath = path.join("./tmp", `${chatId}_${Date.now()}_${doc.file_name}`);
    await fs.ensureDir("./tmp");
    await fs.writeFile(tempPath, buffer);

    if (action === "merge") {
      if (!userFiles[chatId]) userFiles[chatId] = [];
      userFiles[chatId].push(tempPath);
      return bot.sendMessage(chatId, `File added: ${doc.file_name}. Upload more or type /done.`);
    }

    if (action === "split") return handleSplit(chatId, tempPath);
    if (action === "compress") return handleCompress(chatId, tempPath);
  }

  res.sendStatus(200);
});

// ====== START EXPRESS SERVER ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
