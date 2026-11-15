import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIcs } from '../public/js/lib/ics.js';

const cal = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');

test('día completo, UTC, con TZID y flotante, en la hora de Madrid', () => {
  const out = parseIcs(cal(
    ['SUMMARY:Todo el día', 'DTSTART;VALUE=DATE:20261120'],
    ['SUMMARY:En UTC', 'DTSTART:20261120T090000Z'],
    ['SUMMARY:Nueva York', 'DTSTART;TZID=America/New_York:20261120T090000'],
    ['SUMMARY:Flotante', 'DTSTART:20261120T083000'],
  ), '2026-11-01', '2026-11-30');
  assert.deepEqual(out, [
    { title: 'Todo el día', date: '2026-11-20', time: null },
    { title: 'Flotante', date: '2026-11-20', time: '08:30' },
    { title: 'En UTC', date: '2026-11-20', time: '10:00' },
    { title: 'Nueva York', date: '2026-11-20', time: '15:00' },
  ]);
});

test('una zona que no es IANA (Outlook) se toma como hora local', () => {
  const [e] = parseIcs(cal(['SUMMARY:Outlook', 'DTSTART;TZID="Romance Standard Time":20261120T090000']), '2026-11-01', '2026-11-30');
  assert.equal(e.time, '09:00');
});

test('texto escapado, líneas plegadas y dos puntos entre comillas', () => {
  const [e] = parseIcs(cal(['SUMMARY:Cena\\, amigos\\ny ', ' postre', 'DTSTART;X-NOTA="a las 9:00";TZID=Europe/Madrid:20261121T210000']), '2026-11-01', '2026-11-30');
  assert.deepEqual(e, { title: 'Cena, amigos y postre', date: '2026-11-21', time: '21:00' });
});

test('fuera quedan los repetidos, los cancelados, los de fuera del rango y las alarmas', () => {
  const out = parseIcs(cal(
    ['SUMMARY:Semanal', 'DTSTART:20261120T090000Z', 'RRULE:FREQ=WEEKLY'],
    ['SUMMARY:Cancelado', 'DTSTART:20261120T090000Z', 'STATUS:CANCELLED'],
    ['SUMMARY:Diciembre', 'DTSTART:20261201T090000Z'],
    ['SUMMARY:Con alarma', 'DTSTART:20261122T090000Z', 'BEGIN:VALARM', 'SUMMARY:No soy el título', 'END:VALARM'],
    ['DTSTART:20261123T090000Z'],
  ), '2026-11-01', '2026-11-30');
  assert.deepEqual(out.map((e) => e.title), ['Con alarma', '(sin título)']);
});
