// see https://github.com/electron/electron/issues/18738
exports.default = function(context) {
  if (context.electronPlatformName === 'darwin') {
    return;
  }
  let fs = require('fs');
  let localeDir = context.appOutDir+'/locales/';
  for (const file of fs.readdirSync(localeDir)) {
    switch (file) {
      case "en-US.pak":
      case "ja.pak":
        break;
      default:
        fs.unlinkSync(localeDir + file);
        break;
    }
  }
}
