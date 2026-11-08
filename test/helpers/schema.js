'use strict';

const fs = require('node:fs');
const path = require('node:path');

function loadSchema(filePath) {
  const file = filePath || path.resolve(__dirname, '..', 'fixtures', 'Story_database.snapshot.txt');
  const raw = fs.readFileSync(file, 'utf8');
  const newline = raw.indexOf('\n');
  if (newline === -1) throw new Error('Schema dump is missing the full_public_schema header');
  const header = raw.slice(0, newline).trim();
  if (header !== 'full_public_schema') throw new Error(`Unexpected schema header: ${header}`);
  let quotedJson = raw.slice(newline + 1).trim();
  if (quotedJson.startsWith('"')) quotedJson = quotedJson.slice(1);
  if (quotedJson.endsWith('"')) quotedJson = quotedJson.slice(0, -1);
  const tables = JSON.parse(quotedJson.replace(/""/g, '"'));
  if (!Array.isArray(tables)) throw new Error('Schema payload is not an array');
  const byName = new Map(tables.map((table) => [table.table_name, table]));
  return { tables, byName };
}

function columnMap(table) {
  return new Map((table.columns || []).map((column) => [column.col, column]));
}

function columnNames(table) {
  return (table.columns || []).map((column) => column.col);
}

module.exports = { loadSchema, columnMap, columnNames };
