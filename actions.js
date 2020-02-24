const fs = require('fs');

const loadCookieFile = () => {
  try {
    const cookie = fs.readFileSync('sisregiii-cookie.txt', 'utf-8');
    return cookie;
  }
  catch(error) {
    if ( error.message.search(/ENOENT/i) > -1 ) {
      console.log('[INFOR] Cookie file not found.');
      console.log('[INFOR] Login to SISREGIII to create and load the cookie file.');
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

const keepAliveCookie = axios => {
  setInterval(() => {
    console.log('[COOKIE] KeepAlive.');
    axios.get('http://sisregiii.saude.gov.br/cgi-bin/index');
  }, 1000 * 60 * 30);
}

module.exports = {
  loadCookieFile,
  saveCookieFile,
  keepAliveCookie,
}