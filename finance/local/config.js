// Settings come from finance/.env (see .env.example). Nothing secret lives in the code.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function load(envFile = path.join(ROOT, '.env')) {
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  const e = process.env;
  const num = (v, d) => (v == null || v === '' ? d : Number(v));
  const dataDir = path.resolve(ROOT, e.DATA_DIR || 'data');
  return {
    root: ROOT,
    dataDir,
    dbFile: path.join(dataDir, 'books.sqlite'),
    filesDir: path.join(dataDir, 'files'),
    port: num(e.PORT, 8787),
    lanAccess: e.LAN_ACCESS === '1',
    accessToken: e.ACCESS_TOKEN || '',
    syncMinutes: num(e.SYNC_MINUTES, 15),
    digestTime: e.DIGEST_TIME || '09:00',
    timezone: e.TZ_NAME || 'Asia/Kolkata',
    gmail: { user: e.GMAIL_USER || '', pass: (e.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '') },
    telegram: { token: e.TELEGRAM_BOT_TOKEN || '', chatId: e.TELEGRAM_CHAT_ID || '' },
    llm: {
      key: e.OPENROUTER_API_KEY || '',
      model: e.OPENROUTER_MODEL || '',
      dailyLimit: num(e.LLM_DAILY_LIMIT, 200),
      pdf: e.LLM_PDF !== '0',
    },
  };
}

module.exports = { load, ROOT };
