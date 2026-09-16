const path = require('path');
const { formatIngredient } = require(path.join(__dirname, '..', '..', 'lijstjes', 'backend', 'src', 'ha', 'mealie'));

// Vormen zoals Home Assistant ze teruggeeft: asdict() over de aiomealie
// dataclasses, dus snake_case attribuutnamen.
const food = (name, plural) => ({ food_id: 'f1', name, plural_name: plural || null, description: '', aliases: [] });
const unit = (name, opts = {}) => ({
  unit_id: 'u1',
  name,
  description: '',
  aliases: [],
  plural_name: opts.plural || null,
  abbreviation: opts.abbr || null,
  plural_abbreviation: opts.pluralAbbr || null,
  use_abbreviation: !!opts.useAbbr,
  fraction: false,
});

const gevallen = [
  ['heel getal met eenheid', { quantity: 2, unit: unit('stuk', { plural: 'stuks' }), food: food('ui', 'uien'), note: '', display: '2 stuks uien' }],
  ['gewicht met afkorting', { quantity: 500, unit: unit('gram', { abbr: 'g', useAbbr: true }), food: food('gehakt'), note: '', display: '500 g gehakt' }],
  ['enkelvoud', { quantity: 1, unit: unit('stuk', { plural: 'stuks' }), food: food('citroen', 'citroenen'), note: '', display: '1 stuk citroen' }],
  ['halve eenheid', { quantity: 0.5, unit: unit('liter', { abbr: 'l', useAbbr: true }), food: food('melk'), note: '', display: '0.5 l melk' }],
  ['kwart', { quantity: 0.25, unit: unit('theelepel', { abbr: 'tl', useAbbr: true }), food: food('zout'), note: '', display: '' }],
  ['anderhalf', { quantity: 1.5, unit: unit('kilogram', { abbr: 'kg', useAbbr: true }), food: food('aardappel', 'aardappelen'), note: '', display: '' }],
  ['zonder eenheid', { quantity: 3, unit: null, food: food('paprika', "paprika's"), note: '', display: '3 paprika’s' }],
  ['zonder hoeveelheid', { quantity: null, unit: null, food: food('peper'), note: 'naar smaak', display: 'peper naar smaak' }],
  ['vrije tekst (geen food)', { quantity: null, unit: null, food: null, note: 'snufje kaneel', display: 'snufje kaneel' }],
  ['vrije tekst met hoeveelheid in de tekst', { quantity: 2, unit: null, food: null, note: '2 blikken tomaten', display: '2 blikken tomaten' }],
  ['alleen display', { quantity: null, unit: null, food: null, note: '', display: 'scheutje olijfolie', original_text: 'scheutje olijfolie' }],
  ['helemaal leeg', { quantity: null, unit: null, food: null, note: '', display: '', original_text: '' }],
  ['rare decimale hoeveelheid', { quantity: 2.37, unit: unit('gram', { abbr: 'g', useAbbr: true }), food: food('saffraan'), note: '', display: '' }],
];

let fouten = 0;
for (const [omschrijving, ingredient] of gevallen) {
  const uitkomst = formatIngredient(ingredient);
  console.log(String(omschrijving).padEnd(38), '->', JSON.stringify(uitkomst));
  if (uitkomst !== null && !uitkomst.trim()) fouten++;
}
console.log('\nlege uitkomsten (moeten null zijn, geen spaties):', fouten === 0 ? 'geen' : fouten);
