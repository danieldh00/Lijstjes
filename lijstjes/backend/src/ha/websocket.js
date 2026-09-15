const WebSocket = require('ws');
const { getOperatingCredential } = require('../config');

// Home Assistant's REST-API kan een bestaande lijst niet hernoemen: de
// config-entries-API kent daar alleen GET, DELETE en reload, en de
// entiteitenregistratie is helemaal niet via REST te bereiken. Hernoemen kan
// dus alleen via de WebSocket-API.
//
// Omdat hernoemen zelden gebeurt, zetten we daar per keer een korte verbinding
// voor op in plaats van er permanent een open te houden: geen herverbind- of
// hartslaglogica nodig, en niets dat blijft draaien als het misgaat.
//
// De URL volgt in beide bedrijfsmodi uit de REST-basis-URL: als add-on is dat
// http://supervisor/core/api (Supervisor proxyt /core/api/websocket), en los
// daarvan http://<host>:8123/api. In allebei de gevallen is het dus de
// basis-URL met ws:// en /websocket erachter.
const TIMEOUT_MS = 15000;

function sendCommands(commands) {
  const credential = getOperatingCredential();
  if (!credential) {
    return Promise.reject(new Error('Geen koppeling met Home Assistant.'));
  }

  const url = `${credential.baseUrl.replace(/^http/, 'ws')}/websocket`;

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const queue = commands.slice();
    const results = [];
    let nextId = 1;
    let settled = false;

    const timer = setTimeout(
      () => finish(new Error('Home Assistant reageerde niet op tijd.')),
      TIMEOUT_MS
    );

    function finish(err, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (err) reject(err);
      else resolve(value);
    }

    function sendNext() {
      if (!queue.length) return finish(null, results);
      socket.send(JSON.stringify({ id: nextId++, ...queue.shift() }));
    }

    socket.on('error', (err) => finish(new Error(`Geen WebSocket-verbinding met Home Assistant: ${err.message}`)));
    socket.on('close', () => finish(new Error('Home Assistant verbrak de verbinding.')));

    socket.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw);
      } catch (err) {
        return finish(new Error('Onleesbaar antwoord van Home Assistant.'));
      }

      if (message.type === 'auth_required') {
        return socket.send(JSON.stringify({ type: 'auth', access_token: credential.token }));
      }
      if (message.type === 'auth_invalid') {
        return finish(new Error('Home Assistant accepteerde de koppeling niet.'));
      }
      if (message.type === 'auth_ok') {
        return sendNext();
      }
      if (message.type === 'result') {
        if (!message.success) {
          const reason = (message.error && message.error.message) || 'onbekende fout';
          return finish(new Error(`Home Assistant wees het verzoek af: ${reason}`));
        }
        results.push(message.result);
        return sendNext();
      }
    });
  });
}

module.exports = { sendCommands };
