const express = require('express');
const axios = require('axios');
const server = express();
const { parse } = require('node-html-parser');
const message = '..:: Servidor de Consulta ao SISREGIII ::..';
const miniwebServerIP = 'localhost';

let totalSuccessRequests = 0;

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
  let cookie_file;
  let sisregiii;

  console.log(`\n[${computer}][INFOR] Starting new query...`);

  cookie_file = await axios.get(`http://${ miniwebServerIP }:8000/cookie/sisregiii.txt`)
    .catch(error => {
      console.log(`[${computer}][ERROR] Cookie Request: (${ error.message })`);
      return false;
    })
  
  // If Miniweb Server is not running...
  if (!cookie_file) {
    return res.json({
      error: 'ECONNREFUSED',
      description: 'Servidor de cookie não está executando.'
    });
  }

  // Cookie collected
  const { data: cookieData } = cookie_file;

  console.log(`[${computer}][INFOR] Cookie length: ${ (!cookie_file) ? 'NO_COOKIE' : cookieData.length }`);

  console.log(`[${computer}][QUERY] Searcing for ${id}...`);

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
    console.log(`[${computer}][REQUEST] SISREGIII: ${ error.message }`);
    return false;
  });

  console.log(`[${computer}][QUERY] Analysing response...`);
  // console.log(sisregiii);

  // Check sisregiii response
  if (sisregiii === undefined){
    console.log(`[${computer}][RESPONSE] SISREGIII: undefined`);
    return res.json({ error: 'DISCONNECTED' });
  }

  let root = parse(sisregiii.data);
  let user = root.querySelectorAll('td');

  if (user.length == 0) {

    // Check CNS Error
    if ( sisregiii.data.search(/CNS Invalido/i) > -1 ) {
      console.log(`[${computer}][ERROR] Invalid CNS number.`);
      return res.json({
        error: 'CNS',
        description: 'Cartão do SUS incorreto.'
      });
    }

    if ( sisregiii.data.search(/Efetue o logon novamente/i) > -1 ) {
      console.log(`[${computer}][ERROR] SISREG cookie expired.`);
      return res.json({
        error: 'COOKIE_EXPIRED',
        description: 'Conexão com o SISREG expirou.'
      });
    }

    // Non specific error, shows the content of <BODY></BODY> 
    const body = sisregiii.data.split('<BODY')[1].split('</BODY>');
    console.log(body);

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

  console.log(`[${computer}][COUNT] ${++totalSuccessRequests}`);
  console.log(`[${computer}][USER] `, jsonData);
  
  res.send(jsonData);

});

server.listen(5433, () => console.log(message));