const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const https = require('https');

const APP_URL = 'https://script.google.com/a/macros/talabat.com/s/AKfycbz4CGr7nC6tYyZmPTg2T92grTVJPGr5MvHtW9R1Xrks-Ze6dK3Hdob9YzUM6aCpn0lpPg/exec';
const DATA_URL = APP_URL + '?page=data';

const AI_CONFIG = {
  proxyUrl: 'https://litellm.dhhmena.com/v1/chat/completions',
  apiKey: 'sk-E7DxbLTj3qVQuMVL5f51rQ',
  model: 'gemini-2.5-flash'
};

app.commandLine.appendSwitch('disable-features', 'SameSiteByDefaultCookies');

let mainWin = null;
let sheetData = null;

function createWindow() {
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(true));

  mainWin = new BrowserWindow({
    width: 1400, height: 900, title: 'LS-Support',
    show: false, backgroundColor: '#FF5A00',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'persist:lssupport', preload: path.join(__dirname, 'preload.js'), sandbox: false }
  });

  Menu.setApplicationMenu(null);

  const splash = new BrowserWindow({
    width: 500, height: 350, frame: false, transparent: true, alwaysOnTop: true, center: true, resizable: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!DOCTYPE html><html><head><style>@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap");*{margin:0;padding:0;box-sizing:border-box}body{display:flex;align-items:center;justify-content:center;height:100vh;background:transparent;font-family:Inter,sans-serif;-webkit-app-region:drag}.c{background:#fff;border-radius:24px;padding:50px 60px;box-shadow:0 20px 60px rgba(0,0,0,.15);display:flex;flex-direction:column;align-items:center;gap:20px;animation:s .6s ease-out}@keyframes s{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}.l{font-size:42px;font-weight:800;background:linear-gradient(135deg,#FF5A00,#FF8C42);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.b{width:200px;height:4px;background:#F1F5F9;border-radius:4px;overflow:hidden}.f{height:100%;width:30%;background:linear-gradient(90deg,#FF5A00,#FF8C42);border-radius:4px;animation:l 2s ease-in-out infinite}@keyframes l{0%{width:0;margin-left:0}50%{width:60%;margin-left:20%}100%{width:0;margin-left:100%}}</style></head><body><div class="c"><div class="l">LS-Support</div><div style="font-size:13px;color:#64748B;font-weight:600;letter-spacing:2px;text-transform:uppercase">Local Shops Operations</div><div class="b"><div class="f"></div></div><div style="font-size:11px;color:#94A3B8">Powered by talabat</div></div></body></html>'));

  mainWin.loadURL(APP_URL);

  mainWin.webContents.setWindowOpenHandler(function({url}) {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        webPreferences: { partition: 'persist:lssupport' }
      }
    };
  });

  const { dialog, shell } = require('electron');
  const fs = require('fs');
  mainWin.webContents.session.on('will-download', function(event, item) {
    var filename = item.getFilename();
    var ext = path.extname(filename).toLowerCase();
    var filters = [{ name: 'All Files', extensions: ['*'] }];
    if (ext === '.csv') filters = [{ name: 'CSV', extensions: ['csv'] }];
    else if (ext === '.xlsx' || ext === '.xls') filters = [{ name: 'Excel', extensions: ['xlsx', 'xls'] }];
    else if (ext === '.pdf') filters = [{ name: 'PDF', extensions: ['pdf'] }];
    var savePath = dialog.showSaveDialogSync(mainWin, { defaultPath: filename, filters: filters });
    if (savePath) {
      item.setSavePath(savePath);
      item.once('done', function(e, state) {
        if (state === 'completed') shell.showItemInFolder(savePath);
      });
    } else {
      item.cancel();
    }
  });
  mainWin.webContents.on('did-create-window', function(childWin) {
    childWin.webContents.session.on('will-download', function(event, item) {
      var filename = item.getFilename();
      var savePath = dialog.showSaveDialogSync(mainWin, { defaultPath: filename });
      if (savePath) { item.setSavePath(savePath); } else { item.cancel(); }
    });
  });

  fetchSheetData();

  mainWin.webContents.on('did-finish-load', function() {
    mainWin.webContents.setZoomFactor(0.8);
    setTimeout(function() { try { if(splash && !splash.isDestroyed()) splash.close(); if(mainWin && !mainWin.isDestroyed()) { mainWin.show(); mainWin.maximize(); } } catch(e){} }, 2500);
  });

  setTimeout(function() {
    try {
      if (splash && !splash.isDestroyed()) splash.close();
      if (mainWin && !mainWin.isDestroyed() && !mainWin.isVisible()) { mainWin.show(); mainWin.maximize(); }
    } catch(e) {}
  }, 15000);
}

function fetchSheetData() {
  const url = new URL(DATA_URL);
  https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
    if (res.statusCode === 302 || res.statusCode === 301) {
      https.get(res.headers.location, (res2) => {
        let d = '';
        res2.on('data', (chunk) => { d += chunk; });
        res2.on('end', () => { parseSheetData(d); });
      }).on('error', () => {});
      return;
    }
    let d = '';
    res.on('data', (chunk) => { d += chunk; });
    res.on('end', () => { parseSheetData(d); });
  }).on('error', () => {});
}

function parseSheetData(raw) {
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data.length > 0) {
      let context = 'TALABAT LOCAL SHOPS DATA (' + data.length + ' store entries):\n\n';
      const sups = {};
      data.forEach(r => {
        if (!sups[r.supervisor]) sups[r.supervisor] = { stores: 0, orders: 0, pickers: 0, champions: {}, chains: {} };
        sups[r.supervisor].stores++;
        sups[r.supervisor].orders += r.orders || 0;
        sups[r.supervisor].pickers += r.pickers || 0;
        sups[r.supervisor].champions[r.championName] = (sups[r.supervisor].champions[r.championName] || 0) + 1;
        sups[r.supervisor].chains[r.chainName] = 1;
      });

      context += 'SUPERVISORS:\n';
      Object.keys(sups).forEach(s => {
        const d = sups[s];
        context += s + ': ' + d.stores + ' stores, ' + d.orders + ' daily orders, ' + d.pickers + ' pickers, ' +
          Object.keys(d.champions).length + ' champions (' + Object.keys(d.champions).join(', ') + '), ' +
          'chains: ' + Object.keys(d.chains).join(', ') + '\n';
      });

      context += '\nALL STORE DETAILS:\n';
      data.slice(0, 100).forEach(r => {
        context += r.championName + ' | ' + r.supervisor + ' | ' + r.chainName + ' | ' +
          r.locationName + ' | Orders:' + (r.orders||0) + ' | Pickers:' + (r.pickers||0) + '\n';
      });

      sheetData = context;
    }
  } catch(e) {
    sheetData = getHardcodedData();
  }
}

function getHardcodedData() {
  return `TALABAT LOCAL SHOPS DATA:
SUPERVISORS:
- Darshan: 19 champions, stores in Sharjah/NE/Dubai
- Mahmoud Elessawy: 12 champions, stores in Abu Dhabi
- Rodelon Jay Cinco: 10 champions, stores in Dubai
- Shifan: 11 champions, stores in Abu Dhabi/Al Ain
- Vivek Sahni: 16 champions, stores in Dubai
CHAINS: LuLu Hypermarket(39), Viva Supermarket(56), Carrefour(17), Carrefour Market(10), SAVA(13), Safeer(12), Union Coop(8), ADCOOP(5)
METRICS: Successful Orders, OOS%, Unhealthy%, Late%, Replacement%, FailRate%, PartialRefund%`;
}

app.whenReady().then(function() {
  ipcMain.handle('call-ai', async (event, message) => {
    const context = sheetData || getHardcodedData();

    const systemPrompt = 'You are LS-Support — talabat Local Shops senior operations AI copilot for UAE. You serve as the strategic intelligence layer for the Local Shops operations team.\n\n' +
      'IDENTITY: Name=LS-Support. Tone=Professional, confident, data-driven. Understand broken English, Arabizi, shorthand.\n\n' +
      'RESPONSE FORMAT — EXECUTIVE BRIEF STYLE (HTML with inline CSS):\n' +
      '- Header: <div style="background:linear-gradient(135deg,#FF5A00,#FF8C42);padding:20px 24px;border-radius:12px 12px 0 0;margin-bottom:0"><h2 style="color:#fff;margin:0;font-size:18px;font-weight:800">[TITLE]</h2><p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:12px">[Period] | talabat Local Shops UAE</p></div>\n' +
      '- Section: <h4 style="color:#FF5A00;margin:18px 0 8px;font-size:15px;font-weight:700;border-bottom:2px solid #FFF5F0;padding-bottom:6px">[Title]</h4>\n' +
      '- Tables: <table style="width:100%;border-collapse:collapse;margin:10px 0;font-size:12px"> with orange headers\n' +
      '- KPI Cards: Flex boxes — Green(#F0FDF4/#16A34A)=good, Orange(#FFFBEB/#F59E0B)=watch, Red(#FEF2F2/#EF4444)=critical\n' +
      '- Bar Charts: CSS div bars with gradient #FF5A00->#FF8C42\n' +
      '- Status: green ▲=good, orange ▶=watch, red ▼=critical. Arrows: ↑↓→\n' +
      '- ALWAYS end with Key Insights box (orange left border) + Action Items box (blue left border)\n\n' +
      'EMAIL: When drafting emails, use styled template with From/To/Subject header bar, data tables, signed "Local Shops Operations | talabat UAE"\n\n' +
      'ANALYSIS: DoD(day-over-day), WoW(week-over-week), MoM(month-over-month) at Supervisor→Champion→Vendor→Chain→City levels\n\n' +
      'TEAM: Supervisors: Darshan(Sharjah/NE Dubai), Mahmoud(Abu Dhabi), Rodelon(Dubai), Shifan(Abu Dhabi/Al Ain), Vivek(Dubai)\n' +
      'CHAINS: LuLu, Viva, Carrefour, SAVA, Safeer, Union Coop, ADCOOP, Spinneys, Choithrams, West Zone\n\n' +
      'METRICS: Orders(growth), OOS%(<5%), Unhealthy%(<3%), Late%(<8%), Fail Rate%(<2%), GMV(AED), AOV, ABV, ABS, Utilization(>85%), Pick/Dispatch/Delivery Time\n\n' +
      'LOOKER: Orders explore (fct_order_info.*), QC Vendor Performance (agg_qc_vendor_performance_daily.*) — oos_per, fail_rate, late_order_per, unhealthy_per, replacement_per\n' +
      'Dashboards: City #22714, Champion #28482 at talabat.eu.looker.com\n\n' +
      'RULES: Always HTML+inline CSS. talabat palette #FF5A00. Executive Brief header. Insights+Actions at end. Format numbers with commas, 1 decimal %. Currency AED.\n\n' +
      'LIVE DATA:\n' + context;

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        model: AI_CONFIG.model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }],
        max_tokens: 4000
      });
      const url = new URL(AI_CONFIG.proxyUrl);
      const req = https.request({
        hostname: url.hostname, port: 443, path: url.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AI_CONFIG.apiKey, 'Content-Length': Buffer.byteLength(postData) }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.choices && json.choices[0]) resolve(json.choices[0].message.content);
            else if (json.error) reject(new Error(json.error.message));
            else resolve(data.substring(0, 500));
          } catch (e) { reject(new Error('Parse error: ' + e.message)); }
        });
      });
      req.on('error', (e) => reject(new Error(e.message)));
      req.write(postData);
      req.end();
    });
  });

  ipcMain.handle('open-ai', async () => { createAIWindow(); });

  createWindow();
  const { globalShortcut } = require('electron');
  globalShortcut.register('F2', function() { createAIWindow(); });
});

function createAIWindow() {
  let aiWin = new BrowserWindow({
    width: 500, height: 700, title: 'AI Assistant',
    icon: path.join(__dirname, 'icon.png'),
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
  });
  aiWin.setMenuBarVisibility(false);
  aiWin.loadFile('ai-chat.html');
}

app.on('window-all-closed', function() { app.quit(); });
