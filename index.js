const express = require('express');
const axios = require('axios');
const cors = require('cors');
const server = express().use(express.json()).use(cors());
const { parse } = require('node-html-parser');
const message = '..:: Servidor de Consulta ao SISREGIII ::..';
const action = require('./actions');
const rb = require('./rainbown');
const telegramURI = 'https://api.telegram.org/bot894685284:AAHH1YhaGuVimpzEE0CIFjR7_McjuSKBePg/sendMessage?chat_id=514228109&parse_mode=markdown&text=';

let totalSuccessRequests = 0;
let cookieData = action.loadCookieFile();
let sisregiii = ''
let requester = '';

action.keepAliveCookie(axios);

const serverLog = message => {
  if (message === undefined) 
    console.log('\n');
  else
    console.log(`[${requester}]`, message);
}

const sendMessage = content => axios.get(telegramURI + encodeURIComponent(content));

/**
 * ROOT
 */
server.get('/', (req, res) => res.send(message));

/**
 * Query user info
 * id = CNS | CPF
 */
server.get('/get/:id/:computer?', async (req, res) => {

  const { id, computer } = req.params;

  requester = (computer == undefined) ? 'ANONIMO' : computer;

  serverLog();
  serverLog('[INFOR] Starting new query...');
  serverLog(`[QUERY] Searcing for ${id}...`);

  // Try connect to SISREGIII using current cookie data
  sisregiii = await axios({
    url: 'http://sisregiii.saude.gov.br/cgi-bin/cadweb50?url=/cgi-bin/marcar',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieData
    },
    data: `nu_cns=${id}&etapa=DETALHAR&url=%2Fcgi-bin%2Fmarcar`
  }).catch(error => {

    if (error.message.search(/ETIMEDOUT/i) > -1) {
      return res.json({
        error: 'ETIMEDOUT',
        description: 'O servidor demorou muito pra responder.'
      });
    }

    rb.print(`[${requester}] [REQUEST] SISREGIII: ${ error.message }`, rb.colors.FgRed);
    return false;
  });

  serverLog('[QUERY] Analysing response...');
  serverLog(`[RESPONSE] ${typeof(sisregiii)}`);

  // Check sisregiii response
  if (sisregiii === undefined || typeof(sisregiii) === 'boolean'){
    serverLog('[RESPONSE] SISREGIII: Disconnected');
    return res.json({
      error: 'DISCONNECTED',
      description: 'Disconectado do SISREG.'
    });
  }

  let root = parse(sisregiii.data);
  let user = root.querySelectorAll('td');

  if (user.length == 0) {

    // Invalid CNS
    if ( sisregiii.data.search(/CNS Invalido/i) > -1 ) {
      rb.print(`[${requester}] [ERROR] Invalid CNS number.`, rb.colors.FgRed);
      return res.json({
        error: 'CNS',
        description: 'Cartão do SUS incorreto.'
      });
    }

    // Cookie expired
    if ( sisregiii.data.search(/Efetue o logon novamente/i) > -1 ) {
      rb.print(`[${requester}] [ERROR] SISREG cookie expired.`, rb.colors.FgRed)
      return res.json({
        error: 'COOKIE_EXPIRED',
        description: 'Conexão com o SISREG expirou.'
      });
    }

    // No user found
    if ( sisregiii.data.search(/n&atilde;o foi encontrado na base/i) > -1) {
      rb.print(`[${requester}] [ERROR] No user found.`, rb.colors.FgRed)
      return res.json({
        error: 'NO_USER',
        description: 'Nenhum usuário encontrado na base com esse cartão.'
      });
    }

    // Non specific error, shows the content of <BODY></BODY> 
    const body = sisregiii.data.split('<BODY')[1].split('</BODY>');
    console.log(body);
    sendMessage(`CNS: *${id}*\n\nHTML: ${body}`);

    // Non specific error 
    return res.json({
      error: 'UNDEFINED',
      description: 'Ocorreu um erro desconhecido.'
    });
  }

  let indexInfo = {
    nome: 5,
    mae: 9,
    pai: 10,
    sexo: 13,
    cor: 14,
    nascimento: 17,
    nacionalidade: 21,
    municipio: 22,
  }

  let jsonData = {};

  for(item in indexInfo) {
    let index = indexInfo[item];
    let data = user[index].text.trim();
    jsonData[item] = ( data.search(/sem info|--/i) >= 0 ) ? null : data;
  }

  jsonData.nascimento = jsonData.nascimento.split(' ')[0];
  jsonData.cor = ( jsonData.cor === null ) ? 'PARDA' : jsonData.cor;

  // totalSuccessRequests++;

  // console.log(`[${computer}][COUNT] ${++totalSuccessRequests}`);
  // console.log(`[${computer}][USER] `, jsonData);

  serverLog(`[COUNT] ${++totalSuccessRequests}`);
  serverLog(jsonData);
  
  res.send(jsonData);

});

/**
 * Read cookie from sisregiii-cookie.txt file
 */
server.get('/cookie/get', (req, res) => {
  res.send(cookieData);
});

/**
 * Write new authenticated cookie
 */
server.post('/cookie/set', (req, res) => {
  const {cookie: newCookie} = req.body;

  cookieData = newCookie;

  rb.print(
    (newCookie != '') ? '[SUCCESS] Connected to SISREGIII.' : '[ERROR] Connection cookie is empty.',
    (newCookie != '') ? rb.colors.FgGreen : rb.colors.FgRed
  );
  
  action.saveCookieFile(newCookie);
  res.send(`Cookie: ${newCookie}`);
});

server.listen(5433, () => console.log(message));
