const { defineConfig } = require("cypress");

module.exports = defineConfig({
  chromeWebSecurity: false,

  allowCypressEnv: false, // 👈 ДОБАВЬ ЭТУ СТРОКУ

  e2e: {
    baseUrl: 'https://b2b.metatrip.asia/sign-in',
    watchForFileChanges: false,
    viewportWidth: 1280,
    viewportHeight: 800,
    defaultCommandTimeout: 10000,
    requestTimeout: 15000,
    video: false,
    screenshotOnRunFailure: true,

    setupNodeEvents(on, config) {
      on('before:browser:launch', (browser = {}, launchOptions) => {
        if (browser.family === 'chromium' && browser.name !== 'electron') {
          launchOptions.args.push('--user-agent=Mozilla/5.0');
        }
        return launchOptions;
      });
      return config;
    },
  },
});