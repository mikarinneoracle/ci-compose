const yaml = require('js-yaml');

/**
 * Parse Docker Compose YAML string to object
 * @param {string} yamlString - Docker Compose YAML content
 * @returns {object} Parsed Docker Compose object
 * @throws {Error} If YAML is invalid
 */
function parseDockerCompose(yamlString) {
  try {
    const composeObject = yaml.load(yamlString, { schema: yaml.DEFAULT_SAFE_SCHEMA });
    return composeObject;
  } catch (error) {
    throw new Error(`Failed to parse YAML: ${error.message}`);
  }
}

/**
 * Validate Docker Compose structure
 * @param {object} composeObject - Parsed Docker Compose object
 * @returns {object} { valid: boolean, errors: string[] }
 */
function validateDockerCompose(composeObject) {
  const errors = [];

  if (!composeObject || typeof composeObject !== 'object') {
    errors.push('Invalid Docker Compose structure: root must be an object');
    return { valid: false, errors };
  }

  if (!composeObject.services || typeof composeObject.services !== 'object') {
    errors.push('Invalid Docker Compose structure: "services" section is required');
    return { valid: false, errors };
  }

  // Validate each service
  Object.entries(composeObject.services).forEach(([serviceName, service]) => {
    if (!service.image && !service.build) {
      errors.push(`Service "${serviceName}": "image" or "build" is required (build not supported, use pre-built images)`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Extract container port from port configuration
 * @param {string|number|object} portConfig - Port configuration (e.g., "8080:8080", 8080, or object)
 * @returns {number|null} Container port number or null
 */
function extractContainerPort(portConfig) {
  if (typeof portConfig === 'string') {
    if (portConfig.includes(':')) {
      const parts = portConfig.split(':');
      const containerPort = parts[parts.length - 1]; // Get last part (container port)
      return parseInt(containerPort);
    }
    return parseInt(portConfig);
  }
  if (typeof portConfig === 'number') {
    return portConfig;
  }
  if (typeof portConfig === 'object' && portConfig.target) {
    return parseInt(portConfig.target);
  }
  return null;
}

/**
 * Parse ports array and extract container ports
 * @param {array} portsArray - Array of port configurations
 * @returns {array} Array of container port numbers
 */
function parsePorts(portsArray) {
  if (!Array.isArray(portsArray)) {
    return [];
  }

  const containerPorts = portsArray
    .map(port => extractContainerPort(port))
    .filter(port => port !== null && !isNaN(port));

  return containerPorts;
}

/**
 * Parse volume configuration
 * @param {string} volumeConfig - Volume configuration (e.g., "volume-name:/path" or "/host:/container")
 * @returns {object|null} { name: string, path: string } or null
 */
function parseVolume(volumeConfig) {
  if (typeof volumeConfig !== 'string') {
    return null;
  }

  // Handle named volumes: "volume-name:/path"
  if (volumeConfig.includes(':')) {
    const [source, target] = volumeConfig.split(':');
    // If source doesn't start with /, it's a named volume
    if (!source.startsWith('/')) {
      return {
        name: source,
        path: target
      };
    } else {
      // Bind mount: "/host:/container" -> create EMPTYDIR with generated name
      return {
        name: `volume-${source.replace(/\//g, '-').replace(/^-/, '')}`, // Generate name from path
        path: target
      };
    }
  }

  // Anonymous volume: "/path" or ":/path"
  const path = volumeConfig.startsWith(':') ? volumeConfig.substring(1) : volumeConfig;
  return {
    name: `volume-${path.replace(/\//g, '-').replace(/^-/, '')}`,
    path: path
  };
}

/**
 * Parse volumes array
 * @param {array} volumesArray - Array of volume configurations
 * @returns {array} Array of { name: string, path: string }
 */
function parseVolumes(volumesArray) {
  if (!Array.isArray(volumesArray)) {
    return [];
  }

  return volumesArray
    .map(vol => parseVolume(vol))
    .filter(vol => vol !== null);
}

/**
 * Combine entrypoint and command
 * @param {array} entrypoint - Entrypoint array
 * @param {array} command - Command array
 * @returns {array} Combined command array
 */
function combineEntrypointAndCommand(entrypoint, command) {
  const entrypointArray = Array.isArray(entrypoint) ? entrypoint : (entrypoint ? [entrypoint] : []);
  const commandArray = Array.isArray(command) ? command : (command ? [command] : []);

  if (entrypointArray.length > 0 && commandArray.length > 0) {
    return [...entrypointArray, ...commandArray];
  } else if (entrypointArray.length > 0) {
    return entrypointArray;
  } else if (commandArray.length > 0) {
    return commandArray;
  }

  return [];
}

/**
 * Parse environment variables
 * @param {array|object} env - Environment variables (array or object format)
 * @returns {object} Environment variables as object
 */
function parseEnvironment(env) {
  if (!env) {
    return {};
  }

  // If it's already an object, return it
  if (typeof env === 'object' && !Array.isArray(env)) {
    return env;
  }

  // If it's an array, parse KEY=value format
  if (Array.isArray(env)) {
    const envObj = {};
    env.forEach(item => {
      if (typeof item === 'string' && item.includes('=')) {
        const [key, ...valueParts] = item.split('=');
        envObj[key] = valueParts.join('='); // Handle values with = in them
      }
    });
    return envObj;
  }

  return {};
}

/**
 * Topological sort for dependency ordering (Kahn's algorithm)
 * @param {object} services - Services object from Docker Compose
 * @returns {object} { ordered: string[], hasCycle: boolean }
 */
function orderContainersByDependencies(services) {
  const graph = {};
  const inDegree = {};
  const serviceNames = Object.keys(services);

  // Initialize graph and in-degree
  serviceNames.forEach(service => {
    graph[service] = [];
    inDegree[service] = 0;
  });

  // Build dependency graph
  Object.entries(services).forEach(([serviceName, config]) => {
    if (config.depends_on) {
      const deps = Array.isArray(config.depends_on)
        ? config.depends_on
        : Object.keys(config.depends_on);
      
      deps.forEach(dep => {
        if (graph[dep]) {
          graph[dep].push(serviceName);
          inDegree[serviceName]++;
        }
      });
    }
  });

  // Topological sort
  const queue = [];
  const result = [];

  // Add services with no dependencies
  Object.keys(inDegree).forEach(service => {
    if (inDegree[service] === 0) {
      queue.push(service);
    }
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

  // Check for cycles
  const hasCycle = result.length < serviceNames.length;
  if (hasCycle) {
    // Add remaining services in original order
    serviceNames.forEach(service => {
      if (!result.includes(service)) {
        result.push(service);
      }
    });
  }

  return { ordered: result, hasCycle };
}

/**
 * Generate wait script for dependencies
 * @param {array} dependencyInfo - Array of { name: string, port: number|null }
 * @param {number} dependencyDelaySeconds - Delay in seconds for deps without ports (default: 10)
 * @returns {string} Wait script as string
 */
function generateWaitScript(dependencyInfo, dependencyDelaySeconds = 10) {
  // Port-based checks (only for single port)
  // Note: Use 127.0.0.1 instead of service names since OCI CI containers share network namespace
  const portChecks = dependencyInfo
    .filter(dep => dep.port !== null)
    .map(dep => {
      return `echo "Waiting for ${dep.name} on port ${dep.port}..."
timeout=60
elapsed=0
# Try multiple methods to check port availability
port_check() {
  # Method 1: Try bash /dev/tcp (most common, no external tools needed)
  if command -v bash >/dev/null 2>&1; then
    if timeout 1 bash -c "echo > /dev/tcp/127.0.0.1/${dep.port}" 2>/dev/null; then
      return 0
    fi
  fi
  # Method 2: Try nc (netcat) if available
  if command -v nc >/dev/null 2>&1; then
    if nc -z 127.0.0.1 ${dep.port} 2>/dev/null; then
      return 0
    fi
  fi
  # Method 3: Try telnet if available
  if command -v telnet >/dev/null 2>&1; then
    if echo "" | timeout 1 telnet 127.0.0.1 ${dep.port} 2>/dev/null | grep -q "Connected"; then
      return 0
    fi
  fi
  return 1
}
echo "DEBUG: Checking port ${dep.port} on 127.0.0.1"
while ! port_check; do
  if [ \$elapsed -ge \$timeout ]; then
    echo "ERROR: Timeout waiting for ${dep.name} on port ${dep.port} (checked 127.0.0.1:${dep.port})"
    echo "DEBUG: Port check failed after \$elapsed seconds"
    exit 1
  fi
  echo "DEBUG: Port ${dep.port} not ready yet (elapsed: \$elapsed s), retrying in 2s..."
  sleep 2
  elapsed=\$((elapsed + 2))
done
echo "DEBUG: Port ${dep.port} is now open on 127.0.0.1"
echo "${dep.name} is ready"`;
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
    const delaySeconds = dependencyDelaySeconds
      ? Math.max(dependencyDelaySeconds, delayDeps.length * 5)
      : Math.max(10, delayDeps.length * 5);
    waitScript += `\necho "Waiting for dependencies without ports: ${delayDeps.join(', ')}..."
sleep ${delaySeconds}
echo "Dependencies should be ready"`;
  }

  // Fallback if no dependencies
  if (waitScript.trim() === '') {
    return 'echo "No dependencies to wait for"';
  }

  return waitScript;
}

/**
 * Add wait script to command for dependencies
 * @param {object} service - Service configuration
 * @param {array} dependencies - Array of dependency service names
 * @param {object} allServices - All services object
 * @param {number} dependencyDelaySeconds - Delay in seconds for deps without ports
 * @returns {array} Modified command array with wait script
 */
function addWaitScriptToCommand(service, dependencies, allServices, dependencyDelaySeconds = 10) {
  // Get dependency ports (only if exactly one port)
  const dependencyInfo = dependencies.map(depName => {
    const depService = allServices[depName];
    const ports = depService?.ports || [];
    // Only use port if there's exactly one port
    const port = (ports.length === 1) ? extractContainerPort(ports[0]) : null;
    return { name: depName, port: port };
  });

  // Generate wait script
  const waitScript = generateWaitScript(dependencyInfo, dependencyDelaySeconds);

  // Get original command/entrypoint
  const originalEntrypoint = service.entrypoint || [];
  const originalCommand = service.command || [];
  const combinedCommand = combineEntrypointAndCommand(originalEntrypoint, originalCommand);

  // Combine: wait script + original command
  if (combinedCommand.length > 0) {
    // Escape command for shell
    const cmdStr = combinedCommand.map(cmd => {
      const cmdStr = String(cmd);
      if (cmdStr.includes(' ') || cmdStr.includes('$') || cmdStr.includes('"')) {
        return `"${cmdStr.replace(/"/g, '\\"')}"`;
      }
      return cmdStr;
    }).join(' ');

    return ['sh', '-c', `${waitScript} && exec ${cmdStr}`];
  } else {
    // No command/entrypoint specified in compose - preserve image's default entrypoint
    // We can't add the wait script without knowing what the default entrypoint is
    // Return null to signal "don't set command" - this preserves the image's default
    // The calling code will handle this and add a warning that depends_on won't work
    return null;
  }
}

/**
 * Process depends_on and add wait scripts
 * @param {object} services - Services object
 * @param {array} orderedServices - Topologically sorted service names
 * @param {number} dependencyDelaySeconds - Delay in seconds for deps without ports
 * @returns {array} Array of { name: string, config: object }
 */
function processDependsOn(services, orderedServices, dependencyDelaySeconds = 10) {
  const dependencyMap = {};
  
  // Build dependency map
  Object.entries(services).forEach(([serviceName, config]) => {
    if (config.depends_on) {
      const deps = Array.isArray(config.depends_on)
        ? config.depends_on
        : Object.keys(config.depends_on);
      dependencyMap[serviceName] = deps;
    }
  });

  // Process each service
  return orderedServices.map(serviceName => {
    const service = services[serviceName];
    const dependencies = dependencyMap[serviceName];

    if (dependencies && dependencies.length > 0) {
      // Add wait script to command
      const modifiedService = {
        ...service,
        command: addWaitScriptToCommand(service, dependencies, services, dependencyDelaySeconds)
      };
      return { name: serviceName, config: modifiedService };
    }

    return { name: serviceName, config: service };
  });
}

/**
 * Convert Docker Compose to OCI Container Instance payload
 * @param {object} composeObject - Parsed Docker Compose object
 * @param {object} ociConfig - OCI configuration
 * @param {string} ociConfig.compartmentId - OCI compartment ID
 * @param {string} ociConfig.subnetId - OCI subnet ID
 * @param {string} ociConfig.architecture - Architecture (x86 or ARM64)
 * @param {object} ociConfig.shapeConfig - Optional shape config { memoryInGBs, ocpus }
 * @param {number} ociConfig.dependencyDelaySeconds - Optional delay for deps without ports (default: 10)
 * @returns {object} { payload: object, warnings: string[] }
 */
function convertToOCIPayload(composeObject, ociConfig) {
  const warnings = [];
  const { compartmentId, subnetId, architecture = 'x86', shapeConfig, dependencyDelaySeconds = 10 } = ociConfig;

  if (!compartmentId || !subnetId) {
    throw new Error('compartmentId and subnetId are required in ociConfig');
  }

  const services = composeObject.services || {};
  const serviceNames = Object.keys(services);

  if (serviceNames.length === 0) {
    throw new Error('No services found in Docker Compose file');
  }

  // Determine shape
  const shape = architecture === 'ARM64' ? 'CI.Standard.A1.Flex' : 'CI.Standard.E4.Flex';

  // Order services by dependencies
  const { ordered: orderedServiceNames, hasCycle } = orderContainersByDependencies(services);
  if (hasCycle) {
    warnings.push('Circular dependencies detected in depends_on. Using best-effort ordering.');
  }

  // Extract restart policy from services (before processing depends_on)
  // Docker Compose restart values: always, no, on-failure, unless-stopped
  // OCI containerRestartPolicy values: NEVER, ALWAYS, ON_FAILURE
  // Use the first service's restart policy, or default to NEVER
  let containerRestartPolicy = 'NEVER'; // Default
  const restartPolicyMap = {
    'always': 'ALWAYS',
    'no': 'NEVER',
    'never': 'NEVER',
    'on-failure': 'ON_FAILURE',
    'unless-stopped': 'ALWAYS' // Map to ALWAYS as closest match
  };
  
  // Check first service (in original order) for restart policy
  if (serviceNames.length > 0) {
    const firstServiceName = serviceNames[0];
    const firstService = services[firstServiceName];
    if (firstService && firstService.restart) {
      const restartValue = String(firstService.restart).toLowerCase();
      containerRestartPolicy = restartPolicyMap[restartValue] || 'NEVER';
    }
  }

  // Process depends_on and add wait scripts
  const processedServices = processDependsOn(services, orderedServiceNames, dependencyDelaySeconds);

  // Convert services to containers
  const containers = [];
  const allVolumes = new Map(); // Track all volumes by name
  const freeformTags = {
    architecture: architecture
  };

  processedServices.forEach(({ name: serviceName, config: service }) => {
    // Container display name
    const displayName = service.container_name || serviceName;

    // Image URL
    if (!service.image) {
      warnings.push(`Service "${serviceName}": No image specified, skipping (build not supported)`);
      return;
    }
    const imageUrl = service.image;

    // Ports
    const ports = service.ports || [];
    const containerPorts = parsePorts(ports);
    if (containerPorts.length > 0) {
      // Use first port for freeformTags (single port only for depends_on)
      freeformTags[displayName] = containerPorts[0].toString();
    }

    // Environment variables
    const environmentVariables = parseEnvironment(service.environment);

    // Command (entrypoint + command combined)
    const command = combineEntrypointAndCommand(service.entrypoint, service.command);

    // Volumes
    const serviceVolumes = parseVolumes(service.volumes || []);
    serviceVolumes.forEach(vol => {
      if (!allVolumes.has(vol.name)) {
        allVolumes.set(vol.name, vol);
      }
    });

    // Resource config (architecture-specific minimums)
    // x86: minimum 16GB memory, 1 OCPU
    // ARM64: minimum 6GB memory, 1 OCPU
    const minMemory = architecture === 'ARM64' ? 6 : 16;
    const resourceConfig = {
      memoryLimitInGBs: minMemory,
      vcpusLimit: 1
    };

    // Build container object
    const container = {
      displayName: displayName,
      imageUrl: imageUrl,
      isResourcePrincipalDisabled: false,
      resourceConfig: resourceConfig,
      freeformTags: { ...freeformTags }
    };

    // Add optional fields
    if (Object.keys(environmentVariables).length > 0) {
      container.environmentVariables = environmentVariables;
    }

    // Only set command if it's not null (null means preserve image default)
    if (command !== null && command.length > 0) {
      container.command = command;
    } else if (command === null) {
      // No command specified in compose - preserve image default, but warn about depends_on
      warnings.push(`Service "${serviceName}": No command/entrypoint specified. depends_on wait script will not run. Consider adding command/entrypoint to compose file for startup ordering.`);
    }

    containers.push(container);
  });

  // Build volumes array
  const volumes = Array.from(allVolumes.values()).map((vol, idx) => ({
    name: vol.name || `volume-${idx}`,
    volumeType: 'EMPTYDIR',
    backingStore: 'EPHEMERAL_STORAGE'
  }));

  // Add volume mounts to containers
  if (volumes.length > 0) {
    const volumesTag = volumes.map(v => `${v.name}:${allVolumes.get(v.name).path}`).join(',');
    freeformTags.volumes = volumesTag;

    // Add volume mounts to all containers
    containers.forEach(container => {
      container.volumeMounts = volumes.map(vol => ({
        mountPath: allVolumes.get(vol.name).path,
        volumeName: vol.name
      }));
      // Update freeformTags in container
      container.freeformTags = { ...freeformTags };
    });
  }

  // Calculate shape config if not provided
  let finalShapeConfig = shapeConfig;
  if (!finalShapeConfig) {
    // Use architecture-specific minimums for CI instance (not sum of containers)
    // x86: minimum 16GB memory, 1 OCPU
    // ARM64: minimum 6GB memory, 1 OCPU
    const minMemoryForCI = architecture === 'ARM64' ? 6 : 16;
    finalShapeConfig = {
      memoryInGBs: minMemoryForCI,
      ocpus: 1
    };
  }

  // Build payload
  const payload = {
    displayName: serviceNames[0], // Use first service name as CI name
    compartmentId: compartmentId,
    subnetId: subnetId,
    shape: shape,
    shapeConfig: finalShapeConfig,
    containers: containers,
    containerRestartPolicy: containerRestartPolicy, // Use extracted restart policy or default to NEVER
    freeformTags: freeformTags
  };

  if (volumes.length > 0) {
    payload.volumes = volumes;
  }

  // Add warnings for unsupported features
  Object.entries(services).forEach(([serviceName, service]) => {
    if (service.networks) {
      warnings.push(`Service "${serviceName}": networks are ignored (OCI uses VCN/subnets)`);
    }
    if (service.build) {
      warnings.push(`Service "${serviceName}": build is not supported (use pre-built images)`);
    }
    if (service.healthcheck) {
      warnings.push(`Service "${serviceName}": healthcheck is not supported in OCI. Use depends_on with port checks instead for startup ordering.`);
    }
    if (service.deploy && service.deploy.resources) {
      warnings.push(`Service "${serviceName}": deploy.resources are ignored (using defaults)`);
    }
  });

  return { payload, warnings };
}

module.exports = {
  parseDockerCompose,
  validateDockerCompose,
  convertToOCIPayload,
  extractContainerPort,
  parsePorts,
  parseVolumes,
  combineEntrypointAndCommand,
  parseEnvironment,
  orderContainersByDependencies,
  generateWaitScript,
  addWaitScriptToCommand,
  processDependsOn
};
