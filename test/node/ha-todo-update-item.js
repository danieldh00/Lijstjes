// Regressietest voor een echte productiebug: HA's todo.update_item wijst een
// lege due_date/due_datetime af met 400 Bad Request (cv.date/cv.datetime
// accepteren geen lege string), waardoor zo goed als elke bewerking van een
// item zonder einddatum mislukte. Test tegen een nagebootste haFetch dat dit
// zou afkeuren, zodat een toekomstige regressie hier meteen zichtbaar wordt.
const Module = require('module');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'lijstjes', 'backend', 'src');
const calls = [];

const origLoad = Module._load;
Module._load = function (request, parent) {
  if (parent && parent.filename && parent.filename.endsWith(path.join('ha', 'todo.js'))) {
    if (request === './client') {
      return {
        haFetch: async (endpoint, options = {}) => {
          calls.push({ endpoint, body: options.body });
          // Bootst HA's schema-validatie na: een lege due_date/due_datetime
          // is geen geldige datum/tijd en levert een 400 op.
          if (options.body?.due_date === '' || options.body?.due_datetime === '') {
            const err = new Error('Home Assistant API-fout (400 op /services/todo/update_item): 400: Bad Request');
            err.status = 400;
            throw err;
          }
          return null;
        },
      };
    }
  }
  return origLoad.apply(this, arguments);
};

const todo = require(path.join(SRC, 'ha', 'todo.js'));

(async () => {
  calls.length = 0;
  await todo.updateItem('todo.a', 'u1', { summary: 'Melk (halfvol)', description: '', due_date: '' });
  console.log('bewerking zonder einddatum lukt:', 'ja');
  console.log('  verstuurde body:', JSON.stringify(calls[0].body));
  console.log(
    '  due_date niet meegestuurd:',
    !('due_date' in calls[0].body) ? 'ja' : 'NEE'
  );

  calls.length = 0;
  await todo.updateItem('todo.a', 'u1', { due_datetime: '' });
  console.log(
    '\ndue_datetime niet meegestuurd als leeg:',
    !('due_datetime' in calls[0].body) ? 'ja' : 'NEE'
  );

  calls.length = 0;
  await todo.updateItem('todo.a', 'u1', { due_date: '2026-12-24' });
  console.log('\neen echte datum wordt wél meegestuurd:', calls[0].body.due_date === '2026-12-24' ? 'ja' : 'NEE');

  calls.length = 0;
  await todo.updateItem('todo.a', 'u1', { status: 'completed', description: 'notitie' });
  console.log(
    '\nstatus en (lege of gevulde) omschrijving werken nog steeds:',
    calls[0].body.status === 'completed' && calls[0].body.description === 'notitie' ? 'ja' : 'NEE'
  );
})();
