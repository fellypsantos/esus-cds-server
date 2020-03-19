const fs = require('fs');
const express = require('express');
const axiosLib = require('axios');
const moment = require('moment');
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
let axios = axiosLib.create({
  baseURL: 'http://sisregiii.saude.gov.br/cgi-bin/cadweb50?url=/cgi-bin/marcar',
  timeout: 30000,
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
});

moment.locale('pt');
action.keepAliveCookie(axiosLib);

const serverLog = message => {
  if (message === undefined) 
    console.log('\n');
  else
    console.log(`[${requester}]`, message);
}

/**
 * Send a Telegram message with the error and html page body
 * @param {*} content 
 */
const sendMessage = content => axios.get(telegramURI + encodeURIComponent(content));

/**
 * Generate a object to use as response error
 * @param {*} error 
 * @param {*} description 
 */
const createError = (error, description) => ({ error, description });

server.use((req, res, next) => {
  serverLog();
  console.log(`[${ moment().format('LTS') }]`);
  next();
});

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

  serverLog('[INFOR] Starting new query...');
  serverLog(`[QUERY] Searcing for ${id}...`);

  try {
    // Try connect to SISREGIII using current cookie data
    sisregiii = await axios({
      headers: { 'Cookie': cookieData },
      data: `nu_cns=${id}&etapa=DETALHAR&url=%2Fcgi-bin%2Fmarcar`
    })
    .catch(error => {
      if (error.message.search(/ETIMEDOUT/i) > -1)
        return res.json(createError('ETIMEDOUT', 'O SISREG demorou muito pra responder.'));

      rb.print(`[${requester}] [REQUEST] SISREGIII: ${ error.message }`, rb.colors.FgRed);
      return false;
    });

    serverLog('[QUERY] Analysing response...');
    serverLog(`[RESPONSE] ${typeof(sisregiii)}`);

    // Check sisregiii response
    if (sisregiii === undefined || typeof(sisregiii) === 'boolean'){
      serverLog('[RESPONSE] SISREGIII: Disconnected');
      return res.json(createError('CONNECTION_PROBLEMS', 'Ocorreram problemas na conexão.'));
    }

    let root = parse(sisregiii.data);
    let user = root.querySelectorAll('td');

    if (user.length == 0) {

      // Invalid CNS
      if ( sisregiii.data.search(/CNS Invalido/i) > -1 ) {
        rb.print(`[${requester}] [ERROR] Invalid CNS number.`, rb.colors.FgRed);
        return res.json(createError('CNS', 'Cartão do SUS incorreto.'));
      }

      // Cookie expired
      if ( sisregiii.data.search(/Efetue o logon novamente/i) > -1 ) {
        rb.print(`[${requester}] [ERROR] SISREG cookie expired.`, rb.colors.FgRed);
        return res.json(createError('COOKIE_EXPIRED', 'Conexão com o SISREG expirou.'));
      }

      // No user found
      if ( sisregiii.data.search(/n&atilde;o foi encontrado na base/i) > -1) {
        rb.print(`[${requester}] [ERROR] No user found.`, rb.colors.FgRed);
        return res.json(createError('NO_USER', 'Nenhum usuário encontrado na base com esse cartão.'));
      }

      // Non specific error, shows the content of <BODY></BODY> 
      const body = sisregiii.data.split('<BODY')[1].split('</BODY>');
      console.log(body);
      sendMessage(`CNS: *${id}*\n\nHTML: ${body}`);

      // Non specific error
      return res.json(createError('UNDEFINED', 'Ocorreu um erro desconhecido.'));
    }

    let indexInfo = {
      cns: 2,
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

    jsonData.cns = jsonData.cns.replace('\n*', '');
    jsonData.nascimento = jsonData.nascimento.split(' ')[0];
    jsonData.cor = ( jsonData.cor === null ) ? 'PARDA' : jsonData.cor;

    serverLog(`[COUNT] ${++totalSuccessRequests}`);
    serverLog(jsonData);
    
    res.send(jsonData);
  }
  catch(error) {
    console.log('[ERROR] Failed to get user info using CNS.')
    return res.json(createError('UNDEFINED', 'Ocorreu um erro desconhecido.'));
  }

});

server.post('/search/', async (req, res) => {

  let sisregiiiByName;
  const { name, birthday, mother } = req.body;

  console.log(`[SEARCHING] ${name}`, birthday, mother);

  // try to find some user by name
  sisregiiiByName = await axios({
    headers: { 'Cookie': cookieData },
    data: `nome_paciente=${name.toUpperCase()}&dt_nascimento=${birthday}&nome_mae=${mother.toUpperCase()}&etapa=LISTAR&url=/cgi-bin/marcar`
  })
  .catch(error => {
    rb.print(`[${requester}] [REQUEST] SISREGIIIBYNAME: ${ error.message }`, rb.colors.FgRed);
    return false;
  });

  // Check response
  if (sisregiiiByName === undefined || typeof(sisregiiiByName) === 'boolean'){
    serverLog('[RESPONSE] SISREGIII: Disconnected');
    return res.json(createError('CONNECTION_PROBLEMS', 'Ocorreram problemas na conexão.'));
  }

  const response = sisregiiiByName.data.toLowerCase();

  // Check expired session alert
  if ( response.match(/sess&atilde;o expirou|logon novamente/g)) {
    rb.print('Conexão expirada com SISREG, login necessário.', rb.colors.FgRed);
    return res.send(createError('COOKIE_EXPIRED', 'A conexão com SISREG expirou, login necessário.'));
  }

  // Parse response to access page elements
  let root = parse(sisregiiiByName.data.toLowerCase());
  let users = root.querySelectorAll('table td');
  let jsonUsers = [];

  users.forEach(user => {
    // ignore specified lines
    if (user.text.indexOf('encontrados') > -1 || user.text.length == 3) return;

    let userData = {}

    user.innerHTML
      .replace(/\n|\t|●/g, '')
      .split('</b>')
      .map(info => {
        info = info.trim();
        key = info.match(/usuário|mãe|cns|nascimento|naturalidade/);

        if (key == null) return;

        // remove trash strings
        key.input = key.input.replace(/.*: <b>|\n/, '').toUpperCase();

        switch(key[0]) {
          case 'usuário':
            userData['nome'] = key.input;
            break;

          case 'mãe':
            userData['mae'] = key.input;
            break;

          case 'cns':
            userData['cns'] = key.input;
            break;

          case 'nascimento':
            userData['nascimento'] = key.input;
            break;

          case 'naturalidade':
            userData['municipio'] = key.input;
            break;          
        }
      });

    // add to list
    jsonUsers.push( userData );
  });

  console.log(`[SEARCHING] Found ${jsonUsers.length} users`);
  // console.log(jsonUsers);
  return res.json( jsonUsers );
});

server.post('/log', (req, res) => {
  const { cad_type, computer } = req.body;
  const hour = moment().format('LTS');
  const date = moment().format('L');
  const filename = date.replace(/\//g, '-');
  const logMessage = `${date} ${hour} : [${computer}] - Cadastro Individual.\n`;

  console.log('Registrando salvamento de cadastro.');

  fs.appendFileSync(`${filename}.txt`, logMessage);
  res.send().status(200);
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