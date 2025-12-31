<<<<<<< Updated upstream:index.js
// Імпортуємо модулі 'app' (керує життєвим циклом) 
// та 'BrowserWindow' (створює вікна)
=======
>>>>>>> Stashed changes:main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
<<<<<<< Updated upstream:index.js
    width: 800,
    height: 600
  });

  // Завантажуємо файл index.html у це вікно
  win.loadFile('index.html');
};

// Викликаємо функцію createWindow(), коли Electron готовий
app.whenReady().then(() => {
  createWindow();

  // Додатковий код для macOS:
  // Відкриваємо нове вікно, якщо немає відкритих, 
  // коли користувач клікає на іконку в доці.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
=======
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
>>>>>>> Stashed changes:main.js
    }
  });

<<<<<<< Updated upstream:index.js
// Закриваємо додаток, коли всі вікна закриті 
// (окрім macOS, де це стандартна поведінка)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
=======
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { 
  if (process.platform !== 'darwin') app.quit(); 
});
app.on('activate', () => { 
  if (BrowserWindow.getAllWindows().length === 0) createWindow(); 
});
>>>>>>> Stashed changes:main.js
