const fs = require('fs');

const ensureDirectoryExists = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};
module.exports = {
    ensureDirectoryExists
}