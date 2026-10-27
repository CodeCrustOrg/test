// One-time setup: `npm run setup`. Asks for each credential, tests it, writes finance/.env.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline/promises');
const { ROOT, load } = require('./config.js');
const { Gmail } = require('./gmail.js');
const { Telegram } = require('./telegram.js');
const { LLM } = require('./llm.js');
const { Store } = require('./store.js');

const ENV = path.join(ROOT, '.env');

async function main() {
  const old = fs.existsSync(ENV) ? Object.fromEntries(fs.readFileSync(ENV, 'utf8').split('\n').filter(l => /^\w+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])) : {};
  const env = { ...old };
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q, def = '') => (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim() || def;
  const secret = (v) => (v ? v.slice(0, 4) + '…' : '');
  const say = s => console.log('\n' + s);

  say('Books setup. Press Enter to keep the value in [brackets].');

  // 1. Gmail
  say('1/4 Gmail. Books reads your bank alert emails over IMAP with an app password (read-only).\n   Create one at https://myaccount.google.com/apppasswords (needs 2-Step Verification on your Google account).');
  for (;;) {
    env.GMAIL_USER = await ask('Gmail address', env.GMAIL_USER);
    const pass = await ask('App password (16 letters)', secret(env.GMAIL_APP_PASSWORD));
    if (pass && !pass.endsWith('…')) env.GMAIL_APP_PASSWORD = pass.replace(/\s+/g, '');
    process.stdout.write('   Testing Gmail… ');
    try { const r = await new Gmail({ user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD }).check('2026-04-01'); console.log(`ok, ${r.alerts} bank alert emails since 1 Apr 2026.`); break; }
    catch (e) { console.log('failed: ' + e.message); if ((await ask('Try again? (y/n)', 'y')) !== 'y') break; }
  }

  // 2. Telegram
  say('2/4 Telegram. In Telegram, message @BotFather, send /newbot, pick a name, and paste the token it gives you.');
  env.TELEGRAM_BOT_TOKEN = await ask('Bot token', env.TELEGRAM_BOT_TOKEN);
  if (env.TELEGRAM_BOT_TOKEN) {
    const tg = new Telegram({ token: env.TELEGRAM_BOT_TOKEN });
    try {
      const me = await tg.api('getMe');
      say(`   Now open Telegram on your iPhone, find @${me.username}, and send it /start. Waiting up to 2 minutes…`);
      let chat = null; const until = Date.now() + 120000; let offset = 0;
      while (!chat && Date.now() < until) {
        for (const u of await tg.api('getUpdates', { offset, timeout: 20 })) { offset = u.update_id + 1; if (u.message && u.message.chat) chat = u.message.chat; }
      }
      await tg.api('getUpdates', { offset, timeout: 0 });
      if (chat) {
        env.TELEGRAM_CHAT_ID = String(chat.id);
        tg.chatId = env.TELEGRAM_CHAT_ID;
        await tg.send('✅ Books is connected. New bank transactions for CodeCrust and AITA will show up here.');
        console.log(`   Connected to ${chat.first_name || chat.title || 'your chat'}. Only this chat can control the bot.`);
      } else console.log('   No /start received. Run setup again when ready.');
    } catch (e) { console.log('   Telegram error: ' + e.message); }
  }

  // 3. OpenRouter
  say('3/4 OpenRouter (optional, for AI help). Create a key at https://openrouter.ai/keys and set a credit limit on it.\n   Pick a model that supports structured outputs (filter "structured outputs" on https://openrouter.ai/models).');
  const key = await ask('API key (leave empty to skip AI)', secret(env.OPENROUTER_API_KEY));
  if (key && !key.endsWith('…')) env.OPENROUTER_API_KEY = key;
  if (env.OPENROUTER_API_KEY) {
    env.OPENROUTER_MODEL = await ask('Model id, e.g. provider/model-name', env.OPENROUTER_MODEL);
    env.LLM_DAILY_LIMIT = await ask('Maximum AI calls per day', env.LLM_DAILY_LIMIT || '200');
    env.LLM_PDF = (await ask('Allow sending PDF statement text to the model? (y/n)', env.LLM_PDF === '0' ? 'n' : 'y')) === 'y' ? '1' : '0';
    process.stdout.write('   Testing OpenRouter… ');
    try {
      const llm = new LLM({ key: env.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL, dailyLimit: 5 }, new Store(':memory:'));
      const s = await llm.suggestCategory({ dir: 'out', paise: 49900, party: 'GitHub' }, ['Software & subscriptions', 'Other expense'], ['Other income']);
      console.log(`ok (suggested "${s.cat || s.kind}" for GitHub).`);
    } catch (e) { console.log('failed: ' + e.message + '\n   Check the key and that the model supports structured outputs.'); }
  }

  // 4. Dashboard access
  say('4/4 Dashboard. It always opens on this computer at http://localhost:8787.');
  const lan = (await ask('Also allow your iPhone on the same Wi-Fi to open it? (y/n)', env.LAN_ACCESS === '1' ? 'y' : 'n')) === 'y';
  env.LAN_ACCESS = lan ? '1' : '0';
  if (lan && !env.ACCESS_TOKEN) env.ACCESS_TOKEN = crypto.randomBytes(18).toString('base64url');
  env.PORT = env.PORT || '8787';
  env.DIGEST_TIME = await ask('Daily summary time (24h, India time)', env.DIGEST_TIME || '09:00');

  const order = ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'LLM_DAILY_LIMIT', 'LLM_PDF', 'PORT', 'LAN_ACCESS', 'ACCESS_TOKEN', 'DIGEST_TIME', 'SYNC_MINUTES', 'DATA_DIR'];
  const keys = [...new Set(order.concat(Object.keys(env)))].filter(k => env[k] != null && env[k] !== '');
  fs.writeFileSync(ENV, keys.map(k => `${k}=${env[k]}`).join('\n') + '\n', { mode: 0o600 });

  // Accounts: which bank account belongs to which company.
  const cfg = load(ENV);
  const store = new Store(cfg.dbFile);
  for (const [id, bank, last4, entity, label] of [['hdfc-1366', 'hdfc', '1366', 'codecrust', 'HDFC ••1366'], ['indusind-9477', 'indusind', '9477', 'aita', 'IndusInd ••9477']]) {
    if (store.get('accounts/' + id)) continue;
    const ans = await ask(`${label} belongs to (codecrust / aita / ignore)`, entity);
    store.set('accounts/' + id, { id, bank, last4, entity: ans, firstSeen: Date.now() });
  }
  if (!(store.get('meta/settings') || {}).since) store.set('meta/settings', { since: '2026-04-01' });
  store.close();
  rl.close();

  say(`Saved settings to ${ENV} (only your user can read it).`);
  say(`Start Books with:  npm start\nThen open http://localhost:${env.PORT}/` + (lan ? `\nOn your iPhone (same Wi-Fi): http://<this computer's name>.local:${env.PORT}/?token=${env.ACCESS_TOKEN}\n(Keep that link private: it opens your books.)` : ''));
  say('To start Books automatically when you log in:  npm run install-service');
}

main().catch(e => { console.error(e); process.exit(1); });
