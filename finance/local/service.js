// `npm run install-service`: start Books when you log in, and restart it if it stops.
// macOS: LaunchAgent. Windows: a logon task in Task Scheduler. Linux: a systemd user service.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT } = require('./config.js');

const node = process.execPath;
const entry = path.join(ROOT, 'local', 'server.js');
const logDir = path.join(ROOT, 'data');
fs.mkdirSync(logDir, { recursive: true });
const remove = process.argv.includes('--remove');

if (process.platform === 'darwin') {
  const plist = path.join(os.homedir(), 'Library/LaunchAgents/com.books.ledger.plist');
  if (remove) { try { execFileSync('launchctl', ['unload', plist]); } catch (_) {} fs.rmSync(plist, { force: true }); console.log('Removed.'); process.exit(0); }
  fs.mkdirSync(path.dirname(plist), { recursive: true });
  fs.writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.books.ledger</string>
  <key>ProgramArguments</key><array><string>${node}</string><string>--disable-warning=ExperimentalWarning</string><string>${entry}</string></array>
  <key>WorkingDirectory</key><string>${ROOT}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${path.join(logDir, 'books.log')}</string>
  <key>StandardErrorPath</key><string>${path.join(logDir, 'books.log')}</string>
</dict></plist>
`);
  try { execFileSync('launchctl', ['unload', plist], { stdio: 'ignore' }); } catch (_) {}
  execFileSync('launchctl', ['load', plist]);
  console.log(`Installed. Books now starts when you log in. Log: ${path.join(logDir, 'books.log')}\nRemove with: npm run install-service -- --remove`);
} else if (process.platform === 'win32') {
  const cmd = path.join(ROOT, 'data', 'books-start.cmd');
  if (remove) { try { execFileSync('schtasks', ['/Delete', '/TN', 'Books', '/F']); } catch (_) {} console.log('Removed.'); process.exit(0); }
  fs.writeFileSync(cmd, `@echo off\r\ncd /d "${ROOT}"\r\n:loop\r\n"${node}" --disable-warning=ExperimentalWarning "${entry}" >> "${path.join(logDir, 'books.log')}" 2>&1\r\ntimeout /t 10 /nobreak >nul\r\ngoto loop\r\n`);
  execFileSync('schtasks', ['/Create', '/TN', 'Books', '/TR', `"${cmd}"`, '/SC', 'ONLOGON', '/RL', 'LIMITED', '/F']);
  execFileSync('schtasks', ['/Run', '/TN', 'Books']);
  console.log(`Installed. Books now starts when you log in. Log: ${path.join(logDir, 'books.log')}\nRemove with: npm run install-service -- --remove`);
} else {
  const unit = path.join(os.homedir(), '.config/systemd/user/books.service');
  if (remove) { try { execFileSync('systemctl', ['--user', 'disable', '--now', 'books']); } catch (_) {} fs.rmSync(unit, { force: true }); console.log('Removed.'); process.exit(0); }
  fs.mkdirSync(path.dirname(unit), { recursive: true });
  fs.writeFileSync(unit, `[Unit]\nDescription=Books ledger\n\n[Service]\nWorkingDirectory=${ROOT}\nExecStart=${node} --disable-warning=ExperimentalWarning ${entry}\nRestart=always\nRestartSec=10\n\n[Install]\nWantedBy=default.target\n`);
  execFileSync('systemctl', ['--user', 'daemon-reload']);
  execFileSync('systemctl', ['--user', 'enable', '--now', 'books']);
  console.log('Installed as a systemd user service. Logs: journalctl --user -u books -f');
}
