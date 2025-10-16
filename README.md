iLovePDF Telegram Bot

This repository contains a simple Telegram bot that can merge, split and compress PDFs using `pdf-lib` and other utilities.

Quick notes for Render.com deployment

- This project uses ES modules (`type: "module"` in `package.json`).
- The bot reads the Telegram token from the environment variable `TELEGRAM_BOT_TOKEN`.
- Render should run this app as a Background Worker (not a Web Service) because the bot uses polling.

Steps to deploy on Render

1. Push your repository to GitHub (or connect your existing repo).

2. On Render dashboard, create a new "Background Worker" service:
   - Environment: Node
   - Build Command: npm install
   - Start Command: npm start
   - Branch: select your branch (e.g., main)

3. Add an Environment Variable in Render for the Telegram token:
   - Key: TELEGRAM_BOT_TOKEN
   - Value: <your-telegram-bot-token>

4. Deploy. Render will run `npm install` then `npm start` (which executes `node bot.js`). Since this bot uses polling, it will connect to Telegram from the worker.

Local development

1. Create a `.env` file in the repository root with:

TELEGRAM_BOT_TOKEN=your_token_here

2. Install dependencies and run locally:

```bash
npm install
npm start
```

Notes and next steps

- If you prefer webhooks instead of polling (recommended for large scale), you'll need to expose a web server and set the webhook URL in Telegram. Render's Web Service with a public HTTPS endpoint is suitable for webhooks.
- Keep your token secret. Do not commit `.env` to git.

That's it — the repo is ready to be deployed on Render.
