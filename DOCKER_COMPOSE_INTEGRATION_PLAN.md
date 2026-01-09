# Docker Compose YAML Integration Plan

## Executive Summary

This document outlines a plan to integrate Docker Compose YAML import/export functionality into the CI Compose application. This will allow users to:
- Import existing Docker Compose files to quickly set up OCI Container Instances
- Export current CI Compose configurations as Docker Compose YAML files
- Bridge the gap between Docker Compose workflows and OCI Container Instances

## Supported Features (Scope)

The integration will support the following Docker Compose features:

1. **`services.*.image`** - Container images
2. **`services.*.command`** - Container command
3. **`services.*.entrypoint`** - Container entrypoint (combined with command)
4. **`services.*.environment`** - Environment variables
5. **`services.*.ports`** - Port mappings (extract container ports)
6. **`services.*.volumes`** - Volume mounts (ephemeral/shared volumes)
7. **`services.*.depends_on`** - Container startup order enforcement via command scripting (no actual dependency enforcement)

**Not Supported:**
- Other Docker Compose services/definitions (networks, build contexts, healthchecks, etc.)
- Resource limits (deploy.resources) - will use defaults
- Restart policies - will use OCI defaults
- Networks - OCI uses VCN/subnets
- Build contexts - requires pre-built images

## Current Architecture Analysis

### Current Data Structures

**Container Instance Structure:**
```javascript
{
  displayName: string,
  compartmentId: string,
  shape: 'CI.Standard.E4.Flex' | 'CI.Standard.A1.Flex',
  shapeConfig: {
    memoryInGBs: number,
    ocpus: number
  },
  subnetId: string,
  containers: [{
    displayName: string,
    imageUrl: string,
    resourceConfig: {
      memoryInGBs: number,
      vcpusLimit: number
    },
    environmentVariables: { [key: string]: string },
    command: string[],
    arguments: string[],
    volumeMounts: [{
      mountPath: string,
      volumeName: string
    }],
    freeformTags: {
      architecture: 'x86' | 'ARM64',
      volumes: string,  // "name1:path1,name2:path2"
      [containerName]: string  // port number
    }
  }],
  volumes: [{
    name: string,
    volumeType: 'EMPTYDIR',
    backingStore: 'EPHEMERAL_STORAGE'
  }],
  containerRestartPolicy: 'NEVER' | 'ALWAYS' | 'ON_FAILURE',
  freeformTags: {
    architecture: 'x86' | 'ARM64',
    volumes: string,
    [containerName]: string
  }
}
```

**Sidecars:**
- Special containers loaded from `public/sidecars.json`
- Include: OsReader, VaultReader, LogWriter
- Have predefined images, volumes, and environment variables
- Architecture-specific (x86 vs ARM64)

### Current UI Flow

1. **Configuration Modal**: Set CI name, compartment, subnet, log group
2. **Create CI Modal**: 
   - Select architecture (x86/ARM64)
   - Set shape config (memory, OCPUs)
   - Add containers (name, image, ports, env vars, command, args, resources)
   - Add sidecars (from gallery)
   - Add volumes (name, path)
   - Review summary
3. **Details Modal**: View/edit existing CI instances

## Docker Compose YAML Structure

### Standard Docker Compose Format

```yaml
version: '3.8'  # or '3.9', '3.10', etc.

services:
  service-name:
    image: registry/image:tag
    container_name: optional-name
    ports:
      - "8080:8080"  # host:container
      - "3000:3000"
    environment:
      - KEY=value
      - KEY2=value2
    env_file:
      - .env
    command: ["command", "arg1", "arg2"]
    entrypoint: ["/bin/sh", "-c"]
    volumes:
      - volume-name:/path/in/container
      - /host/path:/container/path
      - ./local/path:/container/path
    networks:
      - network-name
    depends_on:
      - other-service
    restart: always | no | on-failure | unless-stopped
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  volume-name:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /host/path

networks:
  network-name:
    driver: bridge
```

## Mapping Strategy

### Docker Compose → OCI Container Instances

| Docker Compose | OCI Container Instance | Notes |
|---------------|------------------------|-------|
| `services.*.image` | `containers[].imageUrl` | **SUPPORTED** - Direct mapping |
| `services.*.container_name` | `containers[].displayName` | Use service name if not provided |
| `services.*.command` | `containers[].command` | **SUPPORTED** - Array mapping |
| `services.*.entrypoint` | `containers[].command` | **SUPPORTED** - Prepend to command array |
| `services.*.environment` | `containers[].environmentVariables` | **SUPPORTED** - Convert array/object to object |
| `services.*.ports` | `freeformTags[containerName]` | **SUPPORTED** - Extract container port from "host:container" |
| `services.*.volumes` | `volumes[]` + `volumeMounts[]` | **SUPPORTED** - Parse named volumes and bind mounts |
| `services.*.depends_on` | Command scripting + container order | **SUPPORTED** - Wait script prepended to command to enforce startup order |
| `volumes.*` | `volumes[]` | Map named volumes to EMPTYDIR |
| N/A | `shapeConfig` | Use defaults or user-provided |
| N/A | `subnetId` | User must provide (OCI-specific) |
| N/A | `compartmentId` | User must provide (OCI-specific) |
| N/A | `architecture` | User must provide or default to x86 |
| N/A | `resourceConfig` | Use defaults (16GB, 1 OCPU per container) |
| N/A | Sidecars | Not in Docker Compose, handled separately |

**Key Implementation Details:**
- **Entrypoint + Command**: If both exist, combine as `[entrypoint[0], entrypoint[1], ...entrypoint[n], ...command]`
- **Ports**: Parse `"8080:8080"` format, extract container port (right side), store in freeformTags
- **Volumes**: 
  - Named volumes (`volume-name:/path`) → Create volume, mount at path
  - Bind mounts (`/host:/container`) → Create EMPTYDIR volume, mount at container path
- **Depends_on**: Sort containers array based on dependency graph (topological sort), but OCI doesn't enforce startup order

### OCI Container Instances → Docker Compose

| OCI Container Instance | Docker Compose | Notes |
|------------------------|----------------|-------|
| `containers[].displayName` | `services.*.container_name` | Direct mapping |
| `containers[].imageUrl` | `services.*.image` | **SUPPORTED** - Direct mapping |
| `containers[].command` | `services.*.command` | **SUPPORTED** - Direct mapping |
| `containers[].arguments` | `services.*.command` | Append to command array |
| `containers[].environmentVariables` | `services.*.environment` | **SUPPORTED** - Convert object to array format |
| `freeformTags[containerName]` | `services.*.ports` | **SUPPORTED** - Reconstruct as "containerPort:containerPort" |
| `volumes[]` + `volumeMounts[]` | `services.*.volumes` + `volumes.*` | **SUPPORTED** - Reconstruct volume definitions |
| Container array order + wait scripts | `services.*.depends_on` | **SUPPORTED** - Generate depends_on based on order (wait scripts not exported as they're OCI-specific) |
| Sidecars | N/A | Excluded from export (OCI-specific) |

**Export Limitations:**
- No `entrypoint` export (OCI doesn't distinguish entrypoint from command)
- Ports exported as `"port:port"` (no host port mapping)
- Volumes exported as named volumes (no bind mount info preserved)
- No `depends_on` export (OCI doesn't track dependencies)

## Implementation Plan

### Phase 1: Backend YAML Parser (Server-side)

#### 1.1 Install Dependencies
```bash
npm install js-yaml --save
```

#### 1.2 Create YAML Parser Module
**File**: `server/utils/docker-compose-parser.js`

**Functions:**
- `parseDockerCompose(yamlString)`: Parse YAML string to object
- `validateDockerCompose(composeObject)`: Validate structure
- `convertToOCIPayload(composeObject, ociConfig)`: Convert to OCI format
  - `ociConfig`: { compartmentId, subnetId, architecture, shapeConfig? }

**Key Conversion Logic:**
```javascript
// Port parsing: "8080:8080" -> extract container port (8080)
function parsePorts(portsArray) {
  // Handle: "8080:8080", "3000:3000", etc.
  // Extract container port (right side of colon)
  // Store in freeformTags as containerName: portNumber
}

// Volume parsing: "volume-name:/path" or "/host:/container" -> { name, path }
function parseVolumes(volumesArray) {
  // Handle:
  // - Named volumes: "volume-name:/path" -> { name: "volume-name", path: "/path" }
  // - Bind mounts: "/host:/container" -> { name: generated, path: "/container" }
  // All volumes become EMPTYDIR in OCI
}

// Entrypoint + Command combination
function combineEntrypointAndCommand(entrypoint, command) {
  // If entrypoint exists, prepend to command
  // Result: [entrypoint[0], entrypoint[1], ...entrypoint[n], ...command]
}

// Environment variables: array or object -> object
function parseEnvironment(env) {
  // Handle:
  // - Array: ["KEY=value", "KEY2=value2"] -> { KEY: "value", KEY2: "value2" }
  // - Object: { KEY: "value" } -> { KEY: "value" }
}

// Depends_on: topological sort + command scripting for startup order
function processDependsOn(services, orderedServices) {
  // 1. Build dependency map
  const dependencyMap = {};
  Object.entries(services).forEach(([serviceName, config]) => {
    if (config.depends_on) {
      const deps = Array.isArray(config.depends_on) 
        ? config.depends_on 
        : Object.keys(config.depends_on);
      dependencyMap[serviceName] = deps;
    }
  });
  
  // 2. For each service with dependencies, add wait script to command
  const processedServices = orderedServices.map(serviceName => {
    const service = services[serviceName];
    const dependencies = dependencyMap[serviceName];
    
    if (dependencies && dependencies.length > 0) {
      // Add wait script to command
      const modifiedService = {
        ...service,
        command: addWaitScriptToCommand(service, dependencies, orderedServices, services)
      };
      return { name: serviceName, config: modifiedService };
    }
    
    return { name: serviceName, config: service };
  });
  
  return processedServices;
}

function addWaitScriptToCommand(service, dependencies, allServiceNames, allServices) {
  // Get dependency ports from service configs
  // Only use port if dependency has exactly ONE port defined
  const dependencyInfo = dependencies.map(depName => {
    const depService = allServices[depName];
    // Get port from ports config (first port only)
    const ports = depService?.ports || [];
    // Only use port if there's exactly one port
    const port = (ports.length === 1) ? extractContainerPort(ports[0]) : null;
    return { name: depName, port: port };
  });
  
  // Generate wait script (port check for single port, delay otherwise)
  const waitScript = generateWaitScript(dependencyInfo);
  
  // Get original command/entrypoint
  const originalEntrypoint = service.entrypoint || [];
  const originalCommand = service.command || [];
  
  // Combine: wait script + original command
  if (originalEntrypoint.length > 0 || originalCommand.length > 0) {
    const fullOriginalCmd = [...originalEntrypoint, ...originalCommand];
    // Escape command for shell
    const cmdStr = fullOriginalCmd.map(cmd => 
      cmd.includes(' ') || cmd.includes('$') || cmd.includes('"') 
        ? `"${cmd.replace(/"/g, '\\"')}"` 
        : cmd
    ).join(' ');
    
    // Return shell command that waits then executes original
    return ['sh', '-c', `${waitScript} && exec ${cmdStr}`];
  } else {
    // No original command, just wait (unlikely but handle it)
    return ['sh', '-c', waitScript];
  }
}

function generateWaitScript(dependencyInfo) {
  // Strategy: Port check ONLY for dependencies with single port
  // Delay for dependencies without port or with multiple ports
  
  // Port-based checks (only for single port)
  const portChecks = dependencyInfo
    .filter(dep => dep.port !== null) // Only dependencies with exactly one port
    .map(dep => {
      return `
        echo "Waiting for ${dep.name} on port ${dep.port}..."
        timeout=60
        elapsed=0
        while ! (command -v nc >/dev/null 2>&1 && nc -z ${dep.name} ${dep.port} 2>/dev/null); do
          if [ $elapsed -ge $timeout ]; then
            echo "ERROR: Timeout waiting for ${dep.name} on port ${dep.port}"
            exit 1
          fi
          sleep 2
          elapsed=$((elapsed + 2))
        done
        echo "${dep.name} is ready"
      `;
    });
  
  // Dependencies without port (use delay)
  const delayDeps = dependencyInfo
    .filter(dep => dep.port === null)
    .map(dep => dep.name);
  
  let waitScript = '';
  
  // Add port checks
  if (portChecks.length > 0) {
    waitScript += portChecks.join('\n');
  }
  
  // Add delay for dependencies without ports
  if (delayDeps.length > 0) {
    const delaySeconds = Math.max(10, delayDeps.length * 5); // Min 10s, or 5s per dep
    waitScript += `
      echo "Waiting for dependencies without ports: ${delayDeps.join(', ')}..."
      sleep ${delaySeconds}
      echo "Dependencies should be ready"
    `;
  }
  
  // Fallback if no dependencies (shouldn't happen)
  if (waitScript.trim() === '') {
    return 'echo "No dependencies to wait for"';
  }
  
  return waitScript;
}

function extractContainerPort(portConfig) {
  // Extract container port from "host:container" or just port number
  if (typeof portConfig === 'string') {
    if (portConfig.includes(':')) {
      return parseInt(portConfig.split(':')[1]);
    }
    return parseInt(portConfig);
  }
  if (typeof portConfig === 'number') {
    return portConfig;
  }
  return null;
}
```

#### 1.3 Create API Endpoints

**POST `/api/docker-compose/parse`**
- Input: `{ yaml: string, ociConfig: { compartmentId, subnetId, architecture? } }`
- Output: `{ success: boolean, payload: OCI payload, warnings: string[] }`
- Validates and converts Docker Compose to OCI format

**POST `/api/docker-compose/export`**
- Input: `{ instanceId: string }` or `{ payload: OCI payload }`
- Output: `{ success: boolean, yaml: string }`
- Converts OCI format to Docker Compose YAML

### Phase 2: Frontend Import Functionality

#### 2.1 Add Import Button
**Location**: `public/index.html` - Container Instances card header
```html
<button class="btn btn-info btn-sm" onclick="showImportDockerComposeModal()">
  <i class="bi bi-upload"></i> Import Compose
</button>
```

#### 2.2 Create Import Modal
**File**: `public/index.html` - Add new modal

**Features:**
- Textarea for pasting YAML
- File upload option
- OCI-specific fields (pre-filled from current configuration, same as CI create modal):
  - Compartment (dropdown, pre-filled from `config.compartmentId`)
  - Subnet (dropdown, pre-filled from `config.defaultSubnetId` or `config.subnetId`)
  - Architecture (radio: x86/ARM64, pre-filled from current config or default to x86)
  - Shape config override (optional, can be calculated from container resources)
- Preview/validation before import
- Error display for parsing issues
- Warning display for unsupported features
- User can modify OCI-specific fields before parsing

#### 2.3 Import Handler Function
**File**: `public/js/main.js`

**Function**: `async function importDockerCompose(yamlString, ociConfig)`
1. Load current configuration using `getConfiguration()` (same as CI create modal)
2. Pre-fill OCI-specific fields from config:
   - `compartmentId` from `config.compartmentId`
   - `subnetId` from `config.defaultSubnetId` or `config.subnetId`
   - `architecture` from config or default to x86
3. Send YAML + OCI config to `/api/docker-compose/parse`
4. Handle errors and warnings
5. Populate create CI modal with parsed data:
   - Set containers data
   - Set volumes data
   - Set ports data
   - Set architecture (from config or parsed)
   - Set shape config (if provided or calculated)
6. Open create CI modal for review/editing (with all fields pre-filled)
7. User can modify before creating

#### 2.4 Integration Points
- Hook into existing `confirmCreateContainerInstance()` flow
- Reuse existing container/volume/port data structures
- Validate against existing validation rules

### Phase 3: Frontend Export Functionality

#### 3.1 Add Export Button
**Location**: 
- CI Details Modal: Export button next to Restart/Delete
- CI Table: Export button in actions column (optional)

#### 3.2 Export Handler Function
**File**: `public/js/main.js`

**Function**: `async function exportDockerCompose(instanceId)`
1. Fetch full CI instance details
2. Send to `/api/docker-compose/export`
3. Download YAML file or show in modal for copy
4. Filename: `{ci-name}-docker-compose.yaml`

#### 3.3 Export Modal/Download
- Option 1: Direct download
- Option 2: Show in modal with copy button
- Option 3: Both (default to download, show option to view)

### Phase 4: Edge Cases & Limitations

#### 4.1 Supported Features Implementation Details

**Image:**
- Direct mapping: `services.*.image` → `containers[].imageUrl`
- Must be a valid image reference (registry/image:tag)

**Command & Entrypoint:**
- If `entrypoint` exists: `[entrypoint..., ...command]`
- If only `command` exists: use `command` as-is
- If only `entrypoint` exists: use `entrypoint` as-is
- Both are arrays in Docker Compose, map directly to OCI `command` array

**Environment Variables:**
- Support both formats:
  - Array: `["KEY=value", "KEY2=value2"]`
  - Object: `{ KEY: "value", KEY2: "value2" }`
- Convert to OCI object format: `{ KEY: "value", KEY2: "value2" }`

**Ports:**
- Parse format: `"8080:8080"` or `8080:8080`
- Extract container port (right side of colon)
- Store in `freeformTags[containerName] = portNumber`
- **Single port only**: If multiple ports are defined, use the first port for `depends_on` port checks
- Multiple ports in Docker Compose: Only the first port is used for dependency checks

**Volumes:**
- Named volumes: `volume-name:/path/in/container`
  - Create volume with name `volume-name`
  - Mount at `/path/in/container`
- Bind mounts: `/host/path:/container/path`
  - Create EMPTYDIR volume with generated name
  - Mount at `/container/path`
- Anonymous volumes: `:/path` or `/path`
  - Create EMPTYDIR volume with generated name
  - Mount at `/path`
- All volumes become `EMPTYDIR` with `EPHEMERAL_STORAGE` in OCI

**Depends_on (Startup Order Enforcement via Command Scripting):**
- Build dependency graph from `depends_on` declarations
- Perform topological sort to determine container order
- **Enhancement**: Add command scripting to delay container startup until dependencies are ready
- For containers with `depends_on`, prepend a wait script to their command
- The wait script checks if dependency containers are ready before proceeding
- Implementation approach:
  ```javascript
  function orderContainersByDependencies(services) {
    // 1. Build adjacency list from depends_on
    const graph = {};
    const inDegree = {};
    
    // 2. Initialize graph
    Object.keys(services).forEach(service => {
      graph[service] = [];
      inDegree[service] = 0;
    });
    
    // 3. Build edges from depends_on
    Object.entries(services).forEach(([service, config]) => {
      if (config.depends_on) {
        const deps = Array.isArray(config.depends_on) 
          ? config.depends_on 
          : Object.keys(config.depends_on);
        deps.forEach(dep => {
          if (graph[dep]) {
            graph[dep].push(service);
            inDegree[service]++;
          }
        });
      }
    });
    
    // 4. Topological sort (Kahn's algorithm)
    const queue = [];
    const result = [];
    
    Object.keys(inDegree).forEach(service => {
      if (inDegree[service] === 0) queue.push(service);
    });
    
    while (queue.length > 0) {
      const service = queue.shift();
      result.push(service);
      
      graph[service].forEach(dependent => {
        inDegree[dependent]--;
        if (inDegree[dependent] === 0) {
          queue.push(dependent);
        }
      });
    }
    
    // 5. Handle cycles (if result.length < total services)
    if (result.length < Object.keys(services).length) {
      // Add remaining services in original order
      Object.keys(services).forEach(service => {
        if (!result.includes(service)) {
          result.push(service);
        }
      });
      return { ordered: result, hasCycle: true };
    }
    
    return { ordered: result, hasCycle: false };
  }
  ```
- If circular dependencies exist, use original order and warn user

**Command Scripting for Startup Order:**
- For each container with `depends_on`, generate a wait command
- The wait command checks if dependency containers are ready
- Prepend wait script to original command using shell wrapper
- Implementation:
  ```javascript
  function addWaitScriptToCommand(container, dependencies, allContainers) {
    // Get dependency container names and their ports
    const dependencyPorts = dependencies.map(depName => {
      const depContainer = allContainers.find(c => c.displayName === depName);
      const depPort = depContainer?.freeformTags?.[depName] || 
                     extractPortFromContainer(depContainer);
      return { name: depName, port: depPort, hostname: depName };
    });
    
    // Generate wait script
    const waitScript = generateWaitScript(dependencyPorts);
    
    // Get original command
    const originalCommand = container.command || [];
    const originalEntrypoint = container.entrypoint || [];
    
    // Combine: wait script + original entrypoint + original command
    // Use shell wrapper: sh -c "wait-script && exec original-command"
    if (originalEntrypoint.length > 0 || originalCommand.length > 0) {
      // If there's an entrypoint, we need to preserve it
      const fullCommand = [...originalEntrypoint, ...originalCommand];
      const commandStr = fullCommand.map(cmd => 
        cmd.includes(' ') ? `"${cmd}"` : cmd
      ).join(' ');
      
      return [
        'sh', '-c',
        `${waitScript} && exec ${commandStr}`
      ];
    } else {
      // No original command, just wait
      return ['sh', '-c', waitScript];
    }
  }
  
  function generateWaitScript(dependencyPorts) {
    // Generate a wait script that checks if dependencies are ready
    // Option 1: Port-based check (if ports are available)
    // Option 2: Health check endpoint (if available)
    // Option 3: Simple delay with retries
    
    const checks = dependencyPorts
      .filter(dep => dep.port)
      .map(dep => {
        // Use nc (netcat) or similar to check port availability
        // Fallback to timeout-based check if nc not available
        return `
          echo "Waiting for ${dep.name} on port ${dep.port}..."
          timeout=60
          elapsed=0
          while ! nc -z ${dep.hostname} ${dep.port} 2>/dev/null; do
            if [ $elapsed -ge $timeout ]; then
              echo "Timeout waiting for ${dep.name}"
              exit 1
            fi
            sleep 2
            elapsed=$((elapsed + 2))
          done
          echo "${dep.name} is ready"
        `;
      })
      .join('\n');
    
    // If no ports available, use simple delay
    if (checks.trim() === '') {
      return `
        echo "Waiting for dependencies to start..."
        sleep 10
      `;
    }
    
    return checks;
  }
  
  // Alternative: Use wait-for-it style script (more robust)
  function generateWaitForItScript(dependencyPorts) {
    // Use a wait-for-it.sh style approach
    // This checks TCP connectivity to dependency ports
    const waitCommands = dependencyPorts
      .filter(dep => dep.port)
      .map(dep => {
        return `
          wait-for-it.sh ${dep.hostname}:${dep.port} --timeout=60 --strict -- echo "${dep.name} is ready"
        `;
      })
      .join(' && ');
    
    if (waitCommands.trim() === '') {
      return 'sleep 10'; // Fallback delay
    }
    
    return waitCommands;
  }
  ```

**Wait Script Options:**
1. **Port-based check (Recommended)**: Use `nc` (netcat) or `wait-for-it.sh` to check if dependency containers are listening on their ports
   - Requires dependency containers to expose ports
   - More reliable than fixed delays
   - Works with containers in the same Container Instance (shared network)

2. **Health check endpoint**: If dependencies expose health endpoints, check those
   - More accurate than port checks
   - Requires dependencies to implement health endpoints

3. **Fixed delay (Fallback)**: Simple sleep if no ports/health checks available
   - Less reliable but always works
   - May cause unnecessary delays or race conditions

**Implementation Notes:**
- Containers in OCI Container Instances share a network, so they can reach each other by container name
- The wait script runs before the original command
- If wait fails (timeout), container startup fails (which is desired behavior)
- The wait script should be lightweight and not require additional tools (use built-in shell commands)
- Consider adding `wait-for-it.sh` or similar as a base image layer if needed, or use standard tools like `nc`, `curl`, or `wget`

#### 4.2 Unsupported/Ignored Features
- **Networks**: Ignored (OCI uses VCN/subnets)
- **Build contexts**: Ignored (requires pre-built images)
- **Healthchecks**: Ignored (not supported in OCI)
- **Restart policies**: Ignored (use OCI defaults)
- **Resource limits** (`deploy.resources`): Ignored (use defaults)
- **Secrets/Configs**: Ignored (suggest OCI Vault)
- **Other services/definitions**: Ignored (only single compose file, no external references)

#### 4.3 OCI-Specific Features Not in Docker Compose
- **Sidecars**: Excluded from export (OCI-specific)
- **FreeformTags**: Added as comments in exported YAML
- **Architecture**: Added as comment in exported YAML
- **Subnet/Compartment**: Added as comments in exported YAML

#### 4.4 Default Values
- **Resource Config**: Default to 16GB memory, 1 OCPU per container
- **Shape Config**: Sum container resources or use user-provided values
- **Architecture**: Default to x86 if not specified

#### 4.5 Wait Script Implementation Details

**Wait Script Strategy:**
The wait script is prepended to the container's original command to ensure dependencies are ready before the container starts its main process.

**Port-Based Wait (When Single Port Defined):**
- **Condition**: Only used when dependency container has exactly **one port** defined
- **Method**: Uses netcat (nc) to check if dependency is listening on its port
```bash
# Check if dependency container is listening on its port
# Uses netcat (nc)
while ! nc -z dependency-name port-number; do
  sleep 2
done
```

**Delay-Based Wait (When No Port or Multiple Ports):**
- **Condition**: Used when dependency container has **no port** or **multiple ports** defined
- **Method**: Fixed delay before starting (default: 10 seconds minimum, or 5 seconds per dependency)
```bash
# Simple delay for dependencies without ports
sleep 10  # or calculated delay based on number of dependencies
```

**Decision Logic:**
1. Check if dependency has a port in `freeformTags[containerName]`
2. If single port exists → Use port check (nc)
3. If no port or multiple ports → Use fixed delay

**Command Wrapping:**
- Original command: `["nginx", "-g", "daemon off;"]`
- With wait script: `["sh", "-c", "wait-script && exec nginx -g 'daemon off;'"]`

**Considerations:**
- **Base Image Compatibility**: Wait script uses standard shell commands (`sh`, `nc`, `timeout`, `bash`)
- **Container Names**: Containers in OCI Container Instances can reach each other by their `displayName`
- **Network**: All containers share the same network namespace, so hostname resolution works
- **Timeout**: Default 60 seconds wait time for port checks (configurable)
- **Error Handling**: If port check times out, container fails to start (desired behavior)
- **Port Requirements**: 
  - Port check (nc) only used when dependency has **exactly one port** defined
  - If no port or multiple ports → Use fixed delay instead
- **Delay Calculation**: 
  - Minimum 10 seconds delay
  - Or 5 seconds per dependency without port (whichever is greater)
- **Single Port Only**: Multiple ports in Docker Compose are supported, but only first port is used for dependency checks

**Example Generated Command:**
```yaml
# Original Docker Compose:
services:
  app:
    image: myapp:latest
    command: ["node", "server.js"]
    depends_on:
      - db
      - redis

# Generated OCI Command:
command: [
  "sh", "-c",
  "echo 'Waiting for db on port 5432...' && " +
  "timeout=60 && elapsed=0 && " +
  "while ! nc -z db 5432 2>/dev/null; do " +
  "  if [ $elapsed -ge $timeout ]; then exit 1; fi; " +
  "  sleep 2; elapsed=$((elapsed + 2)); " +
  "done && " +
  "echo 'db is ready' && " +
  "echo 'Waiting for redis on port 6379...' && " +
  "timeout=60 && elapsed=0 && " +
  "while ! nc -z redis 6379 2>/dev/null; do " +
  "  if [ $elapsed -ge $timeout ]; then exit 1; fi; " +
  "  sleep 2; elapsed=$((elapsed + 2)); " +
  "done && " +
  "echo 'redis is ready' && " +
  "exec node server.js"
]
```

**Limitations:**
- Requires dependency containers to expose ports (for port-based checks)
- Wait script adds startup overhead (2-60 seconds depending on dependency startup time)
- If dependencies don't start within timeout, dependent container fails
- Works best when dependencies expose ports and start quickly

### Phase 5: Enhanced Features (Future)

#### 5.1 Docker Compose Extensions
Use `x-oci-*` extensions for OCI-specific features:
```yaml
services:
  app:
    image: myapp:latest
    x-oci-architecture: ARM64
    x-oci-subnet-id: ocid1.subnet.oc1...
    x-oci-compartment-id: ocid1.compartment.oc1...
    x-oci-shape-config:
      memory-in-gbs: 32
      ocpus: 2
```

#### 5.2 Sidecar Integration
- Allow sidecars in Docker Compose via `x-oci-sidecars`:
```yaml
services:
  app:
    image: myapp:latest
    x-oci-sidecars:
      - name: OsReader
        env:
          data_path: /etc
          os_bucket: my-bucket
```

#### 5.3 Validation & Warnings
- Validate YAML syntax
- Check for required OCI fields (compartment, subnet)
- Warn about unsupported features
- Suggest alternatives (e.g., use OCI Vault for secrets)

## File Structure

```
ci-compose/
├── server/
│   ├── utils/
│   │   └── docker-compose-parser.js  (NEW)
│   └── server.js  (MODIFY - add endpoints)
├── public/
│   ├── js/
│   │   └── main.js  (MODIFY - add import/export functions)
│   └── index.html  (MODIFY - add modals and buttons)
└── package.json  (MODIFY - add js-yaml dependency)
```

## API Endpoints

### POST `/api/docker-compose/parse`
**Request:**
```json
{
  "yaml": "version: '3.8'\nservices:\n  app:\n    image: nginx:latest",
  "ociConfig": {
    "compartmentId": "ocid1.compartment.oc1...",
    "subnetId": "ocid1.subnet.oc1...",
    "architecture": "x86",
    "shapeConfig": {
      "memoryInGBs": 32,
      "ocpus": 2
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "payload": {
    "displayName": "app",
    "compartmentId": "...",
    "subnetId": "...",
    "shape": "CI.Standard.E4.Flex",
    "shapeConfig": { "memoryInGBs": 16, "ocpus": 1 },
    "containers": [
      {
        "displayName": "app",
        "imageUrl": "nginx:latest",
        "command": ["nginx", "-g", "daemon off;"],
        "environmentVariables": { "ENV": "production" },
        "resourceConfig": { "memoryInGBs": 16, "vcpusLimit": 1 }
      }
    ],
    "volumes": [
      { "name": "data", "volumeType": "EMPTYDIR", "backingStore": "EPHEMERAL_STORAGE" }
    ],
    "freeformTags": {
      "architecture": "x86",
      "app": "8080",
      "volumes": "data:/usr/share/nginx/html"
    }
  },
  "warnings": [
    "Unsupported feature: networks - will use OCI subnet",
    "Unsupported feature: build - requires pre-built images"
  ]
}
```

### POST `/api/docker-compose/export`
**Request:**
```json
{
  "instanceId": "ocid1.containerinstance.oc1..."
}
```

**Response:**
```json
{
  "success": true,
  "yaml": "version: '3.8'\nservices:\n  app:\n    image: nginx:latest\n    ...",
  "filename": "my-ci-docker-compose.yaml"
}
```

## Testing Strategy

### Unit Tests
- YAML parsing (valid/invalid YAML)
- Port parsing (various formats)
- Memory conversion (M, G, GB formats)
- Volume parsing (named, bind, anonymous)
- Resource calculation
- OCI payload generation

### Integration Tests
- Full import flow (YAML → OCI payload → Create CI)
- Full export flow (OCI instance → YAML)
- Round-trip test (Import → Export → Compare)

### Manual Testing
- Import various Docker Compose files
- Export various CI configurations
- Test edge cases (unsupported features)
- Test error handling

## User Experience Flow

### Import Flow
1. User clicks "Import Compose" button
2. Modal opens with YAML textarea and file upload
3. User pastes/uploads Docker Compose YAML
4. OCI-specific fields are pre-filled from current configuration (same as CI create modal):
   - Compartment: Pre-filled from `config.compartmentId`
   - Subnet: Pre-filled from `config.defaultSubnetId` or `config.subnetId`
   - Architecture: Pre-filled from current config or default to x86
   - User can modify these fields if needed
5. User clicks "Parse & Preview"
6. System validates and converts, shows warnings
7. User reviews converted configuration
8. User clicks "Import to Create CI"
9. Create CI modal opens with pre-filled data (containers, volumes, ports, etc.)
10. User can modify before creating

### Export Flow
1. User opens CI Details modal
2. User clicks "Export as Docker Compose"
3. System fetches full CI details
4. System converts to Docker Compose YAML
5. YAML file downloads or shows in modal
6. User can copy or save file

## Implementation Priority

### Phase 1 (MVP): Core Features Import/Export
1. ✅ Backend parser for supported Docker Compose features
2. ✅ Import modal with YAML paste
3. ✅ Export button in details modal
4. ✅ Core feature conversion:
   - ✅ `services.*.image`
   - ✅ `services.*.command` and `entrypoint`
   - ✅ `services.*.environment`
   - ✅ `services.*.ports`
   - ✅ `services.*.volumes` (ephemeral/shared)
   - ✅ `services.*.depends_on` (startup order enforcement via command scripting)

### Phase 2: Enhanced Features
1. File upload for import
2. Resource limits conversion
3. Better error messages
4. Warning system for unsupported features

### Phase 3: Advanced Features
1. Docker Compose extensions (x-oci-*)
2. Sidecar support in YAML
3. Round-trip validation
4. Template library

## Dependencies

### New NPM Packages
- `js-yaml`: YAML parsing and generation
  - Version: `^4.1.0`
  - Usage: Parse Docker Compose YAML, generate YAML from objects

### No Breaking Changes
- All changes are additive
- Existing functionality remains unchanged
- Import/export are optional features

## Security Considerations

1. **YAML Parsing**: Use safe YAML parser (js-yaml safeLoad)
2. **File Upload**: Validate file size and type
3. **Input Validation**: Validate all parsed values before creating CI
4. **Error Handling**: Don't expose internal errors to users

## Documentation Updates

1. **README.md**: Add Docker Compose import/export section
2. **About Modal**: Mention Docker Compose support
3. **Labs**: Add example Docker Compose files
4. **API Docs**: Document new endpoints (if creating separate docs)

## Success Criteria

1. ✅ Users can import standard Docker Compose files
2. ✅ Users can export CI configurations as Docker Compose
3. ✅ Imported configurations create valid OCI Container Instances
4. ✅ Exported YAML is valid and can be used with Docker Compose (with limitations)
5. ✅ Clear warnings for unsupported features
6. ✅ No breaking changes to existing functionality

## Timeline Estimate

- **Phase 1 (MVP)**: 2-3 days
  - Backend parser: 1 day
  - Import UI: 0.5 days
  - Export UI: 0.5 days
  - Testing: 1 day

- **Phase 2**: 1-2 days
- **Phase 3**: 2-3 days

**Total MVP**: ~1 week
**Total with enhancements**: ~2 weeks
