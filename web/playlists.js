const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'playlists.json');

function loadAll() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveAll(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function save(name, items) {
  const data = loadAll();
  data[name] = { name, items, savedAt: Date.now() };
  saveAll(data);
}

function list() {
  const data = loadAll();
  return Object.values(data)
    .sort((a, b) => b.savedAt - a.savedAt)
    .map(p => ({ name: p.name, count: p.items.length, savedAt: p.savedAt }));
}

function load(name) {
  const data = loadAll();
  return data[name]?.items ?? null;
}

function del(name) {
  const data = loadAll();
  delete data[name];
  saveAll(data);
}

module.exports = { save, list, load, del };
