const fs = require('fs');

const loadCookieFile = () => {
  try {
    const cookie = fs.readFileSync('sisregiii-cookie.txt', 'utf-8');
    return cookie;
  }
  catch(error) {
    if ( error.message.search(/ENOENT/i) > -1 ) {
      console.log('[ERROR] Cookie file not found.');
    }
  }
}

const saveCookieFile = data => {
  try {
    fs.writeFileSync('sisregiii-cookie.txt', data, 'utf-8');
  }
  catch(error) {
      console.log('[ERROR] Can\'t save new cookie.');
      console.log(error.message);
  }
}

module.exports = {
  loadCookieFile,
  saveCookieFile,
}