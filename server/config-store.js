const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_DIRECTORY = path.join(__dirname, '..', '.ci-compose');
const CONFIG_FILE = path.join(CONFIG_DIRECTORY, 'configs.json');

function emptyStore() {
  return { schemaVersion: 1, configs: [] };
}

function readStore() {
  if (!fs.existsSync(CONFIG_FILE)) return emptyStore();
  const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.configs)) {
    throw new Error('Unsupported CI Compose configuration file format');
  }
  return parsed;
}

function writeStore(store) {
  fs.mkdirSync(CONFIG_DIRECTORY, { recursive: true });
  const temporaryFile = `${CONFIG_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryFile, CONFIG_FILE);
}

function normaliseName(name) {
  return String(name || '').trim().toLocaleLowerCase();
}

function validatePayload(payload = {}) {
  const name = String(payload.name || payload.config?.projectName || '').trim();
  if (!name) throw new Error('Configuration name is required');
  const projectResources = payload.projectResources || {};
  for (const field of ['ports', 'volumes', 'fileStorages']) {
    if (projectResources[field] !== undefined && !Array.isArray(projectResources[field])) {
      throw new Error(`projectResources.${field} must be an array`);
    }
  }
  for (const port of projectResources.ports || []) {
    if (!Number.isInteger(Number(port.port)) || Number(port.port) < 1 || Number(port.port) > 65535) {
      throw new Error('Every port must be an integer between 1 and 65535');
    }
  }
  for (const fss of projectResources.fileStorages || []) {
    if (!fss.mountPath || !fss.mountTargetId || !fss.exportId || !fss.subnetId) {
      throw new Error('Every file system requires mountPath, mountTargetId, exportId, and subnetId');
    }
  }
  return { name, config: { ...(payload.config || {}), projectName: name }, projectResources: {
    ports: projectResources.ports || [], volumes: projectResources.volumes || [], fileStorages: projectResources.fileStorages || []
  } };
}

function list() {
  return readStore().configs.map(({ id, name, revision, updatedAt }) => ({ id, name, revision, updatedAt }));
}

function get(id) { return readStore().configs.find(config => config.id === id) || null; }

function create(payload) {
  const store = readStore();
  const value = validatePayload(payload);
  if (store.configs.some(config => normaliseName(config.name) === normaliseName(value.name))) {
    const error = new Error('A configuration with this name already exists'); error.code = 'CONFIG_EXISTS'; throw error;
  }
  const config = { id: crypto.randomUUID(), ...value, revision: 1, updatedAt: new Date().toISOString() };
  store.configs.push(config); writeStore(store); return config;
}

function update(id, payload) {
  const store = readStore(); const index = store.configs.findIndex(config => config.id === id);
  if (index < 0) return null;
  if (Number(payload.revision) !== store.configs[index].revision) { const error = new Error('Configuration changed externally'); error.code = 'CONFIG_CONFLICT'; throw error; }
  const value = validatePayload(payload);
  if (store.configs.some((config, i) => i !== index && normaliseName(config.name) === normaliseName(value.name))) { const error = new Error('A configuration with this name already exists'); error.code = 'CONFIG_EXISTS'; throw error; }
  const config = { ...store.configs[index], ...value, revision: store.configs[index].revision + 1, updatedAt: new Date().toISOString() };
  store.configs[index] = config; writeStore(store); return config;
}

function remove(id, revision) {
  const store = readStore(); const index = store.configs.findIndex(config => config.id === id);
  if (index < 0) return null;
  if (Number(revision) !== store.configs[index].revision) {
    const error = new Error('Configuration changed externally'); error.code = 'CONFIG_CONFLICT'; throw error;
  }
  const [removed] = store.configs.splice(index, 1);
  writeStore(store);
  return removed;
}

module.exports = { list, get, create, update, remove };
