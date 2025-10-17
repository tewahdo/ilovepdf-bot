import TelegramBot from "node-telegram-bot-api";
import fs from "fs-extra";
import path from "path";
import { PDFDocument } from "pdf-lib";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { mergePDFs } from "./utils/merge.js";
import { splitPDF } from "./utils/split.js";

// Load environment variables
dotenv.config();
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN. Set it in .env or Render environment variables.");
  process.exit(1);
}

// Polling bot
const bot = new TelegramBot(TOKEN, { polling: true });

// Global state
const userAction = {};
const userFiles = {};

// /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Welcome to iLovePDF Bot! 📝\nChoose an action:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Merge PDF", callback_data: "merge" }],
        [{ text: "Split PDF", callback_data: "split" }],
        [{ text: "Compress PDF", callback_data: "compress" }],
        [{ text: "Cancel / Reset", callback_data: "cancel" }],
      ],
    },
  });
});

// Handle button clicks
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;

  if (action === "cancel") {
    userAction[chatId] = null;
    if (userFiles[chatId]) {
      for (const f of userFiles[chatId]) await fs.remove(f);
      userFiles[chatId] = [];
    }
    return bot.sendMessage(chatId, "✅ Operation cancelled.");
  }

  userAction[chatId] = action;
  if (action === "merge") userFiles[chatId] = [];

  bot.sendMessage(chatId, `You selected: ${action}\nPlease upload your file(s). When done, type /done.`);
});

// Handle uploaded PDFs
bot.on("document", async (msg) => {
  const chatId = msg.chat.id;
  const action = userAction[chatId];

  if (!action) return bot.sendMessage(chatId, "Please select an action first using /start.");

  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name;
  await fs.ensureDir("./tmp");
  const tempPath = path.join("./tmp", `${chatId}_${Date.now()}_${fileName}`);

  const fileLink = await bot.getFileLink(fileId);
  const response = await fetch(fileLink);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(tempPath, buffer);

  if (action === "merge") {
    if (!userFiles[chatId]) userFiles[chatId] = [];
    userFiles[chatId].push(tempPath);
    return bot.sendMessage(chatId, `File added: ${fileName}. Upload more or type /done to merge.`);
  }

  await bot.sendMessage(chatId, `Processing ${fileName}...`);
  try {
    switch (action) {
      case "split":
        await handleSplit(chatId, tempPath);
        break;
      case "compress":
        await handleCompress(chatId, tempPath);
        break;
      default:
        bot.sendMessage(chatId, "Unknown action.");
    }
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "❌ Error processing your file.");
  } finally {
    await fs.remove(tempPath);
  }
});

// /done for merging
bot.onText(/\/done/, async (msg) => {
  const chatId = msg.chat.id;
  if (!userFiles[chatId] || userFiles[chatId].length === 0) {
    return bot.sendMessage(chatId, "No files to merge. Upload files first.");
  }

  await bot.sendMessage(chatId, "Merging your PDFs...");

  try {
    const mergedPath = path.join("./tmp", `merged_${chatId}.pdf`);
    await mergePDFs(userFiles[chatId], mergedPath);
    await bot.sendDocument(chatId, mergedPath);
    await fs.remove(mergedPath);

    for (const f of userFiles[chatId]) await fs.remove(f);
    userFiles[chatId] = [];
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "❌ Error merging PDFs.");
  }
});

// Handlers
async function handleSplit(chatId, filePath) {
  const outDir = path.join("./tmp", `split_${chatId}_${Date.now()}`);
  const files = await splitPDF(filePath, outDir);
  for (const f of files) {
    await bot.sendDocument(chatId, f);
    await fs.remove(f);
  }
}

async function handleCompress(chatId, filePath) {
  const pdfBytes = await fs.readFile(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const compressedBytes = await pdfDoc.save({ useObjectStreams: true });
  const outPath = filePath.replace(".pdf", "_compressed.pdf");
  await fs.writeFile(outPath, compressedBytes);
  await bot.sendDocument(chatId, outPath);
  await fs.remove(outPath);
}
