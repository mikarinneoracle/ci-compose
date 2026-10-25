const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const yaml = require('js-yaml');
const tags = require('../public/js/container-port-tags');
const parser = require('../server/utils/docker-compose-parser');

test('port keys support spaces, periods, Unicode and literal escape sequences without collisions', () => {
    const names = ['Super Jet', 'Super_Jet', 'Super%20Jet', 'super.jet', 'Suihkukone ä', 'nginx'];
    const keys = names.map(tags.key);
    assert.equal(new Set(keys).size, names.length);
    keys.forEach((key, index) => {
        assert.match(key, /^[\x21-\x7E]+$/);
        assert.ok(!key.includes('.'));
        assert.equal(tags.name(key), names[index]);
    });
    assert.equal(tags.key('Super Jet'), 'Super%20Jet');
    assert.equal(tags.key('nginx'), 'nginx');
});

test('port readers prefer encoded keys and still support legacy keys', () => {
    assert.equal(tags.port({ 'Super%20Jet': '8080' }, 'Super Jet'), '8080');
    assert.equal(tags.port({ 'Super Jet': '8081' }, 'Super Jet'), '8081');
    assert.equal(tags.port({ 'super.jet': '8082' }, 'super.jet'), '8082');
    assert.equal(tags.port({ nginx: '80' }, 'nginx'), '80');
    assert.equal(tags.port(undefined, 'Super Jet'), undefined);
    assert.equal(tags.name('100%ready'), '100%ready');
});

test('normalization repairs saved port tags without mutating the source or metadata', () => {
    const original = { architecture: 'ARM64', volumes: 'wallet:/wallet', 'Super Jet': '8080' };
    const containers = [{ displayName: 'Super Jet' }, { displayName: 'AdbWallet' }];
    const normalized = tags.normalize(original, containers);
    assert.deepEqual(normalized, {
        architecture: 'ARM64', volumes: 'wallet:/wallet', 'Super%20Jet': '8080'
    });
    assert.equal(original['Super Jet'], '8080');
    assert.deepEqual(tags.normalize(normalized, containers), normalized);
    assert.throws(() => tags.normalize({ 'Super Jet': '80', 'Super%20Jet': '81' }, containers), /Conflicting/);
});

test('the shared helper works as a browser script', () => {
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/container-port-tags.js'), 'utf8'), context);
    assert.equal(context.ContainerPortTags.key('Super Jet'), 'Super%20Jet');
    assert.equal(context.ContainerPortTags.port({ 'Super%20Jet': '8080' }, 'Super Jet'), '8080');
});

// Register the real REST handlers without opening a listener or loading OCI clients.
function serverHandlers() {
    const routes = new Map();
    const app = {
        use() {}, listen() {},
        get(route, handler) { routes.set(`GET ${route}`, handler); },
        post(route, handler) { routes.set(`POST ${route}`, handler); },
        put(route, handler) { routes.set(`PUT ${route}`, handler); },
        delete(route, handler) { routes.set(`DELETE ${route}`, handler); }
    };
    const express = Object.assign(() => app, { json() {}, static() {} });
    const serverPath = path.join(__dirname, '../server.js');
    const serverRequire = createRequire(serverPath);
    let submitted;
    const context = vm.createContext({
        require(name) {
            if (name === 'express') return express;
            if (name.startsWith('oci-')) return {}; // No real OCI access in these tests.
            return serverRequire(name);
        },
        __dirname: path.dirname(serverPath), process, console,
        testClients: {
            identityClient: { async listAvailabilityDomains() { return { items: [{ name: 'test-ad' }] }; } },
            virtualNetworkClient: { async getSubnet() { return { subnet: { prohibitPublicIpOnVnic: true } }; } },
            containerInstancesClient: {
                async createContainerInstance(request) {
                    submitted = JSON.parse(JSON.stringify(request.createContainerInstanceDetails));
                    return { containerInstance: submitted };
                }
            }
        }
    });
    vm.runInContext(fs.readFileSync(serverPath, 'utf8'), context, { filename: serverPath });
    vm.runInContext(`
        createOCIClients = () => testClients;
        readOCIConfig = () => ({ tenancy: 'test-tenancy' });
        validateSidecarConfigs = async () => ({ errors: [], warnings: [] });
    `, context);
    return { routes, submitted: () => submitted };
}

async function call(handler, body) {
    let result;
    const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(value) { result = value; }
    };
    await handler({ body, query: {} }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(result));
    return result;
}

test('create REST route submits valid matching port tags while preserving all display names', async () => {
    const server = serverHandlers();
    const freeformTags = { architecture: 'ARM64', 'Super Jet': '8080', volumes: 'wallet:/wallet' };
    const names = ['Super Jet', 'AdbWallet', 'LogWriter'];
    await call(server.routes.get('POST /api/oci/container-instances'), {
        displayName: 'Super Jet 1', compartmentId: 'test-compartment', subnetId: 'test-subnet',
        shape: 'CI.Standard.A1.Flex', shapeConfig: { ocpus: 1, memoryInGBs: 6 }, freeformTags,
        containers: names.map(displayName => ({ displayName, imageUrl: 'example/image:1', freeformTags }))
    });
    const payload = server.submitted();
    assert.equal(payload.displayName, 'Super Jet 1');
    assert.deepEqual(payload.containers.map(container => container.displayName), names);
    assert.equal(payload.freeformTags['Super%20Jet'], '8080');
    assert.ok(!Object.hasOwn(payload.freeformTags, 'Super Jet'));
    payload.containers.forEach(container => assert.deepEqual(container.freeformTags, payload.freeformTags));
});

test('Compose import and export retain ports with encoded and legacy tags', async () => {
    const { payload } = parser.convertToOCIPayload({
        services: { jet: { image: 'example/jet:1', container_name: 'Super Jet', ports: ['8080:8080'] } }
    }, { compartmentId: 'test-compartment', subnetId: 'test-subnet' });
    assert.equal(payload.containers[0].displayName, 'Super Jet');
    assert.equal(payload.freeformTags['Super%20Jet'], '8080');
    assert.equal(payload.containers[0].freeformTags['Super%20Jet'], '8080');
    const server = serverHandlers();
    for (const freeformTags of [payload.freeformTags, { 'Super Jet': '8080' }]) {
        const result = await call(server.routes.get('POST /api/docker-compose/export'), {
            payload: { ...payload, freeformTags }
        });
        const compose = yaml.load(result.yaml);
        assert.equal(compose.services['Super Jet'].container_name, 'Super Jet');
        assert.deepEqual(compose.services['Super Jet'].ports, ['8080:8080']);
    }
});
