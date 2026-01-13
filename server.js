const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');

// OCI SDK imports
const identity = require('oci-identity');
const core = require('oci-core');
const objectstorage = require('oci-objectstorage');
const containerinstances = require('oci-containerinstances');
const logging = require('oci-logging');
const loggingsearch = require('oci-loggingsearch');
const resourcemanager = require('oci-resourcemanager');
const vault = require('oci-vault');
const secrets = require('oci-secrets');
const common = require('oci-common');

// Docker Compose Parser
const dockerComposeParser = require('./server/utils/docker-compose-parser');
const yaml = require('js-yaml');

const app = express();
const PORT = process.env.PORT || 3000;

// OCI Configuration Provider
// This will read from environment variables or use default profile from ~/.oci/config
const configurationFilePath = process.env.OCI_CONFIG_FILE || '~/.oci/config';
const profile = process.env.OCI_CONFIG_PROFILE || 'DEFAULT';
const provider = new common.ConfigFileAuthenticationDetailsProvider(
  configurationFilePath,
  profile
);

// Initialize OCI Clients
const identityClient = new identity.IdentityClient({
  authenticationDetailsProvider: provider
});

const computeClient = new core.ComputeClient({
  authenticationDetailsProvider: provider
});

const objectStorageClient = new objectstorage.ObjectStorageClient({
  authenticationDetailsProvider: provider
});

const containerInstancesClient = new containerinstances.ContainerInstanceClient({
  authenticationDetailsProvider: provider
});

const virtualNetworkClient = new core.VirtualNetworkClient({
  authenticationDetailsProvider: provider
});

const loggingManagementClient = new logging.LoggingManagementClient({
  authenticationDetailsProvider: provider
});

const logSearchClient = new loggingsearch.LogSearchClient({
  authenticationDetailsProvider: provider
});

const resourceManagerClient = new resourcemanager.ResourceManagerClient({
  authenticationDetailsProvider: provider
});

const vaultClient = new vault.VaultsClient({
  authenticationDetailsProvider: provider
});

const secretsClient = new secrets.SecretsClient({
  authenticationDetailsProvider: provider
});

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to read OCI config file
function readOCIConfig(configPath, profile) {
  try {
    // Expand ~ to home directory
    const expandedPath = configPath.replace('~', os.homedir());
    
    if (!fs.existsSync(expandedPath)) {
      return null;
    }
    
    const configContent = fs.readFileSync(expandedPath, 'utf8');
    const lines = configContent.split('\n');
    
    let currentProfile = null;
    const config = {};
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip comments and empty lines
      if (trimmedLine.startsWith('#') || trimmedLine === '') {
        continue;
      }
      
      // Check if this is a profile header
      if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
        currentProfile = trimmedLine.slice(1, -1);
        continue;
      }
      
      // If we're in the target profile, parse key-value pairs
      if (currentProfile === profile && trimmedLine.includes('=')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        const value = valueParts.join('=').trim();
        config[key.trim()] = value;
      }
    }
    
    return config;
  } catch (error) {
    console.error('Error reading OCI config:', error);
    return null;
  }
}

// Sample API routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Get OCI config region
app.get('/api/oci/config/region', (req, res) => {
  try {
    const configPath = req.query.configPath || process.env.OCI_CONFIG_FILE || '~/.oci/config';
    const profile = req.query.profile || process.env.OCI_CONFIG_PROFILE || 'DEFAULT';
    
    // Create a provider for the requested config/profile
    const requestProvider = new common.ConfigFileAuthenticationDetailsProvider(
      configPath,
      profile
    );
    
    // Get region from provider
    let region;
    try {
      const regionObj = requestProvider.getRegion();
      region = regionObj ? regionObj.regionId : null;
    } catch (e) {
      // If getRegion() fails, fall back to reading config file directly
      const config = readOCIConfig(configPath, profile);
      region = config ? config.region : null;
    }
    
    if (!region) {
      return res.status(404).json({ error: 'Region not found in config file' });
    }
    
    res.json({
      success: true,
      region: region,
      configPath: configPath,
      profile: profile
    });
  } catch (error) {
    console.error('Error getting region from config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get OCI namespace from Object Storage service
app.get('/api/oci/config/namespace', async (req, res) => {
  try {
    const configPath = req.query.configPath || process.env.OCI_CONFIG_FILE || '~/.oci/config';
    const profile = req.query.profile || process.env.OCI_CONFIG_PROFILE || 'DEFAULT';
    
    // Create a provider for the requested config/profile
    const requestProvider = new common.ConfigFileAuthenticationDetailsProvider(
      configPath,
      profile
    );
    
    // Create Object Storage client with the provider
    const osClient = new objectstorage.ObjectStorageClient({
      authenticationDetailsProvider: requestProvider
    });
    
    // Get namespace from Object Storage API
    const getNamespaceRequest = {};
    const response = await osClient.getNamespace(getNamespaceRequest);
    
    res.json({
      success: true,
      namespace: response.value,
      configPath: configPath,
      profile: profile
    });
  } catch (error) {
    console.error('Error getting namespace:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get OCI tenancy ID from config
app.get('/api/oci/config/tenancy', (req, res) => {
  try {
    const configPath = req.query.configPath || process.env.OCI_CONFIG_FILE || '~/.oci/config';
    const profile = req.query.profile || process.env.OCI_CONFIG_PROFILE || 'DEFAULT';
    
    // Create a provider for the requested config/profile
    const requestProvider = new common.ConfigFileAuthenticationDetailsProvider(
      configPath,
      profile
    );
    
    // Get tenancy ID from provider
    let tenancyId;
    try {
      tenancyId = requestProvider.getTenantId();
    } catch (e) {
      // If getTenantId() fails, fall back to reading config file directly
      const config = readOCIConfig(configPath, profile);
      tenancyId = config ? config.tenancy : null;
    }
    
    if (!tenancyId) {
      return res.status(404).json({ error: 'Tenancy ID not found in config file' });
    }
    
    res.json({
      success: true,
      tenancyId: tenancyId,
      configPath: configPath,
      profile: profile
    });
  } catch (error) {
    console.error('Error getting tenancy ID from config:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all compartments for a tenancy
app.get('/api/oci/compartments', async (req, res) => {
  try {
    const configPath = req.query.configPath || process.env.OCI_CONFIG_FILE || '~/.oci/config';
    const profile = req.query.profile || process.env.OCI_CONFIG_PROFILE || 'DEFAULT';
    const tenancyId = req.query.tenancyId;
    
    if (!tenancyId) {
      return res.status(400).json({ error: 'tenancyId is required' });
    }
    
    // Create a provider for the requested config/profile
    const requestProvider = new common.ConfigFileAuthenticationDetailsProvider(
      configPath,
      profile
    );
    
    // Create Identity client with the provider
    const idClient = new identity.IdentityClient({
      authenticationDetailsProvider: requestProvider
    });
    
    // List all compartments
    const listCompartmentsRequest = {
      compartmentId: tenancyId,
      compartmentIdInSubtree: true,
      accessLevel: 'ACCESSIBLE'
    };
    
    const response = await idClient.listCompartments(listCompartmentsRequest);
    
    res.json({
      success: true,
      compartments: response.items
    });
  } catch (error) {
    console.error('Error listing compartments:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get compartment details by compartment ID
app.get('/api/oci/compartments/:compartmentId', async (req, res) => {
  try {
    const compartmentId = req.params.compartmentId;
    
    const getCompartmentRequest = {
      compartmentId: compartmentId
    };
    
    const response = await identityClient.getCompartment(getCompartmentRequest);
    
    res.json({
      success: true,
      data: response.compartment
    });
  } catch (error) {
    console.error('Error getting compartment:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/data', (req, res) => {
  res.json({
    message: 'Hello from the backend!',
    timestamp: new Date().toISOString(),
    data: ['Item 1', 'Item 2', 'Item 3']
  });
});

app.post('/api/data', (req, res) => {
  const { message } = req.body;
  res.json({
    success: true,
    message: `Received: ${message}`,
    timestamp: new Date().toISOString()
  });
});

// OCI API Routes

// Identity Service - List Availability Domains
app.get('/api/oci/availability-domains', async (req, res) => {
  try {
    const compartmentId = process.env.OCI_COMPARTMENT_ID || req.query.compartmentId;
    if (!compartmentId) {
      return res.status(400).json({ error: 'compartmentId is required' });
    }

    const listAvailabilityDomainsRequest = {
      compartmentId: compartmentId
    };

    const response = await identityClient.listAvailabilityDomains(listAvailabilityDomainsRequest);
    res.json({
      success: true,
      data: response.items
    });
  } catch (error) {
    console.error('Error listing availability domains:', error);
    res.status(500).json({ error: error.message });
  }
});

// Core Service - List Instances
app.get('/api/oci/instances', async (req, res) => {
  try {
    const compartmentId = process.env.OCI_COMPARTMENT_ID || req.query.compartmentId;
    if (!compartmentId) {
      return res.status(400).json({ error: 'compartmentId is required' });
    }

    const listInstancesRequest = {
      compartmentId: compartmentId
    };

    const response = await computeClient.listInstances(listInstancesRequest);
    res.json({
      success: true,
      data: response.items
    });
  } catch (error) {
    console.error('Error listing instances:', error);
    res.status(500).json({ error: error.message });
  }
});

// Object Storage - List Namespaces
app.get('/api/oci/object-storage/namespaces', async (req, res) => {
  try {
    const getNamespaceRequest = {};
    const response = await objectStorageClient.getNamespace(getNamespaceRequest);
    res.json({
      success: true,
      namespace: response.value
    });
  } catch (error) {
    console.error('Error getting namespace:', error);
    res.status(500).json({ error: error.message });
  }
});

// Object Storage - List Buckets
app.get('/api/oci/object-storage/buckets', async (req, res) => {
  try {
    const namespaceName = process.env.OCI_NAMESPACE || req.query.namespace;
    const compartmentId = process.env.OCI_COMPARTMENT_ID || req.query.compartmentId;
    
    if (!namespaceName || !compartmentId) {
      return res.status(400).json({ 
        error: 'namespace and compartmentId are required' 
      });
    }

    const listBucketsRequest = {
      namespaceName: namespaceName,
      compartmentId: compartmentId
    };

    const response = await objectStorageClient.listBuckets(listBucketsRequest);
    res.json({
      success: true,
      data: response.items
    });
  } catch (error) {
    console.error('Error listing buckets:', error);
    res.status(500).json({ error: error.message });
  }
});

// Container Instances - List Container Instances
app.get('/api/oci/container-instances', async (req, res) => {
  try {
    const compartmentId = process.env.OCI_COMPARTMENT_ID || req.query.compartmentId;
    if (!compartmentId) {
      return res.status(400).json({ error: 'compartmentId is required' });
    }

    const listContainerInstancesRequest = {
      compartmentId: compartmentId
    };

    const response = await containerInstancesClient.listContainerInstances(listContainerInstancesRequest);
    res.json({
      success: true,
      data: response.containerInstanceCollection.items
    });
  } catch (error) {
    console.error('Error listing container instances:', error);
    res.status(500).json({ error: error.message });
  }
});

// Logging - List Log Groups
app.get('/api/oci/logging/log-groups', async (req, res) => {
  try {
    const compartmentId = process.env.OCI_COMPARTMENT_ID || req.query.compartmentId;
    if (!compartmentId) {
      return res.status(400).json({ error: 'compartmentId is required' });
    }

    const listLogGroupsRequest = {
      compartmentId: compartmentId
    };

    const response = await loggingManagementClient.listLogGroups(listLogGroupsRequest);
    res.json({
      success: true,
      data: response.items || []
    });
  } catch (error) {
    console.error('Error listing log groups:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sidecar validation functions
async function validateBucketExists(bucketName, compartmentId, namespaceName, tenancyId) {
  try {
    // First try in the specified compartment
    let listBucketsRequest = {
      namespaceName: namespaceName,
      compartmentId: compartmentId
    };
    let response = await objectStorageClient.listBuckets(listBucketsRequest);
    let bucket = response.items.find(b => b.name === bucketName);
    
    // If not found and tenancyId is available, search in all accessible compartments
    if (!bucket && tenancyId) {
      listBucketsRequest = {
        namespaceName: namespaceName,
        compartmentId: tenancyId,
        compartmentIdInSubtree: true
      };
      response = await objectStorageClient.listBuckets(listBucketsRequest);
      bucket = response.items.find(b => b.name === bucketName);
    }
    
    if (!bucket) {
      throw new Error(`Bucket '${bucketName}' not found in compartment ${compartmentId} or accessible compartments`);
    }
    return true;
  } catch (error) {
    throw new Error(`Failed to validate bucket '${bucketName}': ${error.message}`);
  }
}

async function validateLogExists(logOcid, logGroupId) {
  try {
    // Validate log OCID format - log OCIDs start with "ocid1.log."
    if (!logOcid || typeof logOcid !== 'string') {
      throw new Error(`Invalid log OCID: must be a string`);
    }
    
    if (!logOcid.startsWith('ocid1.log.')) {
      throw new Error(`Invalid log OCID format: '${logOcid}' (must start with 'ocid1.log.')`);
    }
    
    // If logGroupId is provided, attempt to fetch the log to verify it exists
    if (logGroupId) {
      try {
        const getLogRequest = {
          logGroupId: logGroupId,
          logId: logOcid
        };
        await loggingManagementClient.getLog(getLogRequest);
        return true;
      } catch (error) {
        if (error.statusCode === 404) {
          throw new Error(`Log with OCID '${logOcid}' not found in log group '${logGroupId}'`);
        }
        throw new Error(`Failed to validate log '${logOcid}': ${error.message}`);
      }
    }
    
    // If no logGroupId, just validate the OCID format
    // The actual log will be validated when used with the logGroupId from config
    return true;
  } catch (error) {
    throw new Error(`Failed to validate log OCID '${logOcid}': ${error.message}`);
  }
}

async function validateVaultExists(vaultOcid) {
  try {
    // Validate vault OCID format - vault OCIDs start with "ocid1.vault."
    // Note: VaultsClient doesn't have getVault() method, so we validate format only
    // The actual vault will be validated when the secret is used
    if (!vaultOcid || typeof vaultOcid !== 'string') {
      throw new Error(`Invalid vault OCID: must be a string`);
    }
    
    if (!vaultOcid.startsWith('ocid1.vault.')) {
      throw new Error(`Invalid vault OCID format: '${vaultOcid}' (must start with 'ocid1.vault.')`);
    }
    
    // OCID format is valid - we can't verify existence without additional API calls,
    // but the format check is sufficient for sidecar validation
    // The actual vault will be validated when the secret is accessed
    return true;
  } catch (error) {
    throw new Error(`Failed to validate vault OCID '${vaultOcid}': ${error.message}`);
  }
}

async function getVaultOcidFromSecret(secretOcid) {
  try {
    // Use VaultsClient.getSecret() to get secret metadata including vaultId
    // VaultsClient manages secrets and vaults, SecretsClient only retrieves secret content via getSecretBundle()
    const getSecretRequest = {
      secretId: secretOcid
    };
    const secretResponse = await vaultClient.getSecret(getSecretRequest);
    const vaultId = secretResponse.secret.vaultId;
    if (!vaultId) {
      throw new Error(`Secret '${secretOcid}' does not have a vaultId`);
    }
    return vaultId;
  } catch (error) {
    if (error.statusCode === 404) {
      throw new Error(`Secret with OCID '${secretOcid}' not found`);
    }
    throw new Error(`Failed to get vault OCID from secret '${secretOcid}': ${error.message}`);
  }
}

async function validateSidecarConfigs(containers, compartmentId, tenancyId, logGroupId) {
  const errors = [];
  const warnings = [];
  
  // Get namespace for bucket validation
  let namespaceName;
  try {
    const getNamespaceRequest = {};
    const namespaceResponse = await objectStorageClient.getNamespace(getNamespaceRequest);
    namespaceName = namespaceResponse.value;
  } catch (error) {
    warnings.push(`Could not get namespace for bucket validation: ${error.message}`);
  }
  
  for (const container of containers) {
    if (!container.environmentVariables || typeof container.environmentVariables !== 'object') {
      continue;
    }
    
    const envVars = container.environmentVariables;
    const containerName = container.displayName || 'Unknown';
    
    // Check for OsReader sidecar (os_bucket)
    if (envVars.os_bucket) {
      const bucketName = envVars.os_bucket;
      // Skip validation if bucket name is a placeholder
      if (bucketName && !bucketName.includes('***') && !bucketName.includes('put here')) {
        if (!namespaceName) {
          errors.push(`Container '${containerName}': Cannot validate bucket '${bucketName}' - namespace not available`);
        } else {
          try {
            await validateBucketExists(bucketName, compartmentId, namespaceName, tenancyId);
          } catch (error) {
            errors.push(`Container '${containerName}': ${error.message}`);
          }
        }
      }
    }
    
    // Check for LogWriter sidecar (log_ocid)
    // Note: The log group ID comes from the application configuration, but the log_ocid
    // (specific log OCID) comes from the sidecar environment variables and should be validated.
    if (envVars.log_ocid) {
      const logOcid = envVars.log_ocid;
      // Skip validation if log OCID is a placeholder
      if (logOcid && !logOcid.includes('***') && !logOcid.includes('put here')) {
        try {
          await validateLogExists(logOcid, logGroupId);
        } catch (error) {
          errors.push(`Container '${containerName}': ${error.message}`);
        }
      }
    }
    
    // Check for VaultReader sidecar (secret_ocid -> vault)
    if (envVars.secret_ocid) {
      const secretOcid = envVars.secret_ocid;
      // Skip validation if secret OCID is a placeholder
      if (secretOcid && !secretOcid.includes('***') && !secretOcid.includes('put here')) {
        try {
          const vaultOcid = await getVaultOcidFromSecret(secretOcid);
          await validateVaultExists(vaultOcid);
        } catch (error) {
          errors.push(`Container '${containerName}': ${error.message}`);
        }
      }
    }
  }
  
  return { errors, warnings };
}

// Container Instances - Validate Sidecar Configs (before create/update)
app.post('/api/oci/container-instances/validate', async (req, res) => {
  try {
    const {
      containers,
      compartmentId,
      tenancyId,
      logGroupId
    } = req.body;

    if (!containers || containers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one container is required'
      });
    }

    if (!compartmentId) {
      return res.status(400).json({
        success: false,
        error: 'compartmentId is required'
      });
    }

    // Get tenancyId from config if not provided
    let tenancyIdToUse = tenancyId;
    if (!tenancyIdToUse) {
      const configPath = process.env.OCI_CONFIG_FILE || '~/.oci/config';
      const profile = process.env.OCI_CONFIG_PROFILE || 'DEFAULT';
      const ociConfig = readOCIConfig(configPath, profile);
      tenancyIdToUse = ociConfig?.tenancy;
    }

    const validationResult = await validateSidecarConfigs(containers, compartmentId, tenancyIdToUse, logGroupId);
    
    res.json({
      success: validationResult.errors.length === 0,
      errors: validationResult.errors,
      warnings: validationResult.warnings
    });
  } catch (error) {
    console.error('Error validating sidecar configs:', error);
    res.status(500).json({
      success: false,
      error: `Validation error: ${error.message}`,
      errors: [error.message],
      warnings: []
    });
  }
});

// Container Instances - Create Container Instance
app.post('/api/oci/container-instances', async (req, res) => {
  try {
    
    const {
      displayName,
      compartmentId,
      shape,
      shapeConfig,
      subnetId,
      containers,
      volumes,
      containerRestartPolicy,
      ingressIps,
      freeformTags,
      logGroupId
    } = req.body;

    if (!displayName || !compartmentId || !shape || !subnetId || !containers || containers.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: displayName, compartmentId, shape, subnetId, and at least one container are required' 
      });
    }

    // Get availability domain - required for container instances
    // Extract tenancy ID from config file
    const configPath = process.env.OCI_CONFIG_FILE || '~/.oci/config';
    const profile = process.env.OCI_CONFIG_PROFILE || 'DEFAULT';
    const ociConfig = readOCIConfig(configPath, profile);
    const tenancyId = ociConfig?.tenancy || req.body.tenancyId;
    
    // Validate sidecar configurations (bucket, log, vault)
    try {
      const validationResult = await validateSidecarConfigs(containers, compartmentId, tenancyId, logGroupId);
      if (validationResult.errors.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Sidecar configuration validation failed',
          details: validationResult.errors,
          warnings: validationResult.warnings
        });
      }
      // Log warnings if any
      if (validationResult.warnings.length > 0) {
        console.warn('Sidecar validation warnings:', validationResult.warnings);
      }
    } catch (validationError) {
      return res.status(500).json({
        success: false,
        error: `Sidecar validation error: ${validationError.message}`
      });
    }
    
    if (!tenancyId) {
      return res.status(400).json({
        success: false,
        error: 'Tenancy ID is required to get availability domain. Please ensure OCI config file is properly configured.'
      });
    }
    
    const listAvailabilityDomainsRequest = {
      compartmentId: tenancyId
    };
    const adResponse = await identityClient.listAvailabilityDomains(listAvailabilityDomainsRequest);
    if (!adResponse.items || adResponse.items.length === 0) {
      throw new Error('No availability domains found for tenancy');
    }
    // Use the first availability domain
    const availabilityDomain = adResponse.items[0].name;

    // Build containers array - ensure all fields are properly formatted
    const containerDetails = containers.map((container, idx) => {
      // Container resourceConfig uses vcpusLimit and memoryLimitInGBs (not vcpus and memoryInGBs)
      // Ensure values are valid numbers (not NaN, Infinity, etc.)
      let memoryLimitInGBs = parseFloat(container.resourceConfig?.memoryInGBs || container.resourceConfig?.memoryLimitInGBs) || 1;
      let vcpusLimit = parseFloat(container.resourceConfig?.vcpus || container.resourceConfig?.vcpusLimit) || 1;
      
      // Validate and ensure minimum values
      if (!isFinite(memoryLimitInGBs) || memoryLimitInGBs <= 0) memoryLimitInGBs = 1;
      if (!isFinite(vcpusLimit) || vcpusLimit <= 0) vcpusLimit = 1;
      
      const containerDetail = {
        displayName: container.displayName,
        imageUrl: container.imageUrl,
        isResourcePrincipalDisabled: false,
        resourceConfig: {
          memoryLimitInGBs: memoryLimitInGBs,
          vcpusLimit: vcpusLimit
        }
      };

      // Only include environmentVariables if they exist and have values
      if (container.environmentVariables && typeof container.environmentVariables === 'object' && Object.keys(container.environmentVariables).length > 0) {
        containerDetail.environmentVariables = container.environmentVariables;
      }

      // Only include optional fields if they have values and are arrays
      if (container.arguments && Array.isArray(container.arguments) && container.arguments.length > 0) {
        containerDetail.arguments = container.arguments;
      }
      if (container.command && Array.isArray(container.command) && container.command.length > 0) {
        containerDetail.command = container.command;
      }
      if (container.volumeMounts && Array.isArray(container.volumeMounts) && container.volumeMounts.length > 0) {
        containerDetail.volumeMounts = container.volumeMounts;
      }
      
      // Add freeformTags to container if provided (e.g., port information)
      if (container.freeformTags && typeof container.freeformTags === 'object' && Object.keys(container.freeformTags).length > 0) {
        containerDetail.freeformTags = container.freeformTags;
      }

      return containerDetail;
    });

    // Use shapeConfig from request, or calculate from containers if not provided
    let shapeConfigToUse;
    if (shapeConfig && shapeConfig.memoryInGBs && shapeConfig.ocpus) {
      // Use provided shapeConfig
      shapeConfigToUse = {
        memoryInGBs: parseFloat(shapeConfig.memoryInGBs),
        ocpus: parseFloat(shapeConfig.ocpus)
      };
    } else {
      // Fallback: Calculate total resources needed from all containers
      let totalMemoryInGBs = 0;
      let totalVcpus = 0;
      containerDetails.forEach(container => {
        if (container.resourceConfig) {
          totalMemoryInGBs += container.resourceConfig.memoryLimitInGBs || 0;
          totalVcpus += container.resourceConfig.vcpusLimit || 0;
        }
      });
      
      // Ensure minimum values
      totalVcpus = Math.max(Math.ceil(totalVcpus), 1);
      totalMemoryInGBs = Math.max(Math.ceil(totalMemoryInGBs), Math.max(totalVcpus, 1));
      
      shapeConfigToUse = {
        memoryInGBs: totalMemoryInGBs,
        ocpus: totalVcpus
      };
    }
    
    // Validate that values are finite numbers
    if (!isFinite(shapeConfigToUse.ocpus) || !isFinite(shapeConfigToUse.memoryInGBs)) {
      throw new Error('Invalid resource values: ocpus and memoryInGBs must be valid numbers');
    }

    // Check if subnet is private (prohibits public IP assignment)
    let isPublicIpAssigned = true; // Default to true for public subnets
    try {
      const getSubnetRequest = {
        subnetId: subnetId
      };
      const subnetResponse = await virtualNetworkClient.getSubnet(getSubnetRequest);
      const subnet = subnetResponse.subnet;
      
      // If prohibitPublicIpOnVnic is true, the subnet is private and we cannot assign a public IP
      if (subnet.prohibitPublicIpOnVnic === true) {
        isPublicIpAssigned = false;
      } else {
      }
    } catch (subnetError) {
      // Default to true if we can't check (backward compatibility)
      isPublicIpAssigned = true;
    }

    // Build container instance configuration
    // Note: OCI SDK accepts plain objects, but ensure all required fields are present
    const containerInstanceDetails = {
      displayName: displayName,
      compartmentId: compartmentId,
      availabilityDomain: availabilityDomain,
      shape: shape,
      shapeConfig: {
        ocpus: shapeConfigToUse.ocpus,
        memoryInGBs: shapeConfigToUse.memoryInGBs
      },
      containers: containerDetails,
      vnics: [{
        subnetId: subnetId,
        isPublicIpAssigned: isPublicIpAssigned
      }],
      containerRestartPolicy: containerRestartPolicy || 'NEVER'
    };
    
    // Add freeformTags to container instance if provided
    if (freeformTags && typeof freeformTags === 'object' && Object.keys(freeformTags).length > 0) {
      containerInstanceDetails.freeformTags = freeformTags;
    }

    // Add volumes if provided
    if (volumes && volumes.length > 0) {
      containerInstanceDetails.volumes = volumes.map((volume, index) => {
        const volumeName = volume.name || `volume-${index}`;
        return {
          name: volumeName,
          volumeType: volume.volumeType || 'EMPTYDIR',
          backingStore: volume.backingStore || 'EPHEMERAL_STORAGE'
        };
      });
      
      // Validate volumeMounts - ensure volumeName references exist in volumes array
      // Frontend should already set volumeMounts correctly, but we validate here
      const volumeNames = volumes.map((v, idx) => v.name || `volume-${idx}`);
      containerDetails.forEach((container) => {
        if (container.volumeMounts && container.volumeMounts.length > 0) {
          // Just ensure volumeMounts structure is correct - volumeName should match a volume in the volumes array
          container.volumeMounts = container.volumeMounts.map((mount) => {
            // Validate that mountPath and volumeName are present
            if (!mount.mountPath || !mount.volumeName) {
              throw new Error(`Invalid volumeMount: mountPath and volumeName are required`);
            }
            // Check if volumeName exists in volumes (optional validation)
            if (!volumeNames.includes(mount.volumeName)) {
            }
            return {
              mountPath: mount.mountPath,
              volumeName: mount.volumeName
            };
          });
        }
      });
    }

    // Note: ingressIps are assigned by OCI after creation, not during creation
    // Ports should be specified in the container configuration if needed
    // We skip ingressIps in the creation request

    const createContainerInstanceRequest = {
      createContainerInstanceDetails: containerInstanceDetails
    };

    containerDetails.forEach((cd, idx) => {
    });

    const response = await containerInstancesClient.createContainerInstance(createContainerInstanceRequest);
    
    res.json({
      success: true,
      data: response.containerInstance
    });
  } catch (error) {
    console.error('Error creating container instance:', error);
    console.error('Error details:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Container Instances - Get Container Instance Details
app.get('/api/oci/container-instances/:instanceId', async (req, res) => {
  try {
    const instanceId = req.params.instanceId;

    const getContainerInstanceRequest = {
      containerInstanceId: instanceId
    };

    const response = await containerInstancesClient.getContainerInstance(getContainerInstanceRequest);
    if (response.containerInstance.containers && response.containerInstance.containers.length > 0) {
    }
    res.json({
      success: true,
      data: response.containerInstance
    });
  } catch (error) {
    console.error('Error getting container instance details:', error);
    res.status(500).json({ error: error.message });
  }
});

// Container Instances - Delete Container Instance
app.delete('/api/oci/container-instances/:instanceId', async (req, res) => {
  try {
    const instanceId = req.params.instanceId;

    const deleteContainerInstanceRequest = {
      containerInstanceId: instanceId
    };

    const response = await containerInstancesClient.deleteContainerInstance(deleteContainerInstanceRequest);
    
    res.json({
      success: true,
      message: 'Container instance deletion initiated'
    });
  } catch (error) {
    console.error('Error deleting container instance:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Container Instances - Restart Container Instance
app.post('/api/oci/container-instances/:instanceId/restart', async (req, res) => {
  try {
    const instanceId = req.params.instanceId;

    const restartContainerInstanceRequest = {
      containerInstanceId: instanceId
    };

    const response = await containerInstancesClient.restartContainerInstance(restartContainerInstanceRequest);
    
    res.json({
      success: true,
      message: 'Container instance restart initiated'
    });
  } catch (error) {
    console.error('Error restarting container instance:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/oci/container-instances/:instanceId/stop', async (req, res) => {
  try {
    const instanceId = req.params.instanceId;

    const stopContainerInstanceRequest = {
      containerInstanceId: instanceId
    };

    const response = await containerInstancesClient.stopContainerInstance(stopContainerInstanceRequest);
    
    res.json({
      success: true,
      message: 'Container instance stop initiated'
    });
  } catch (error) {
    console.error('Error stopping container instance:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Container Instances - Get Container Details
app.get('/api/oci/containers/:containerId', async (req, res) => {
  try {
    const containerId = req.params.containerId;

    const getContainerRequest = {
      containerId: containerId
    };

    const response = await containerInstancesClient.getContainer(getContainerRequest);
    res.json({
      success: true,
      data: response.container
    });
  } catch (error) {
    console.error('Error getting container details:', error);
    res.status(500).json({ error: error.message });
  }
});

// Logging Service - Get Log Content by Log OCID
// Note: OCI Logging Management API doesn't have a direct method to retrieve log content
// We'll use the Unified Logging Search API via REST call
app.get('/api/oci/logging/logs/:logOcid', async (req, res) => {
  try {
    const logOcid = req.params.logOcid;
    const tail = parseInt(req.query.tail) || 10; // Default to last 10 lines
    const logGroupIdFromQuery = req.query.logGroupId; // Optional: allow log group ID from query param
    
    // getLog requires logGroupId as a path parameter
    // Try to get log details if we have logGroupId from config
    // Otherwise, we'll skip getLog and search directly using the log OCID
    let log = null;
    let logGroupIdToUse = logGroupIdFromQuery;
    let compartmentId = null;
    
    if (logGroupIdToUse) {
      // We have logGroupId from config, so we can call getLog properly
      try {
        // getLog requires both logGroupId and logId as path parameters
        const getLogRequest = {
          logGroupId: logGroupIdToUse,
          logId: logOcid
        };
        const logResponse = await loggingManagementClient.getLog(getLogRequest);
        log = logResponse.log;
        if (log) {
          compartmentId = log.compartmentId;
          // Use logGroupId from log object if available (more reliable)
          if (log.logGroupId) {
            logGroupIdToUse = log.logGroupId;
          }
        }
      } catch (getLogError) {
        console.error('Error in getLog call:');
        console.error('Error message:', getLogError.message);
        console.error('Error code:', getLogError.code);
        console.error('Error stack:', getLogError.stack);
        // Continue without log object - we'll use searchLogs directly
      }
    }
    
    // If we don't have logGroupId yet, try to get it from the log object
    // (This would only work if getLog succeeded above)
    if (!logGroupIdToUse && log && log.logGroupId) {
      logGroupIdToUse = log.logGroupId;
    }
    
    // If we still don't have logGroupId, we can try searching without it
    // by using the log OCID directly in the search query
    if (!logGroupIdToUse) {
      // Try searching with just the log OCID - this might work if the search API
      // can resolve it, or we can search all logs and filter
      logGroupIdToUse = null; // Will search without log group ID
    }

    // Use LogSearchClient to retrieve log content
    // Initialize searchQuery early to avoid undefined errors
    let searchQuery = '';
    try {
      // Create search query for the specific log
      const timeStart = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
      const timeEnd = new Date();
      
      // Compartment ID should already be set from log object if we got it
      // If not, we'll try searching without it
      
      // Build search query according to Oracle documentation:
      // Format: search "<compartment_OCID>/<log_group_OCID>/<log_OCID>" for specific log
      // Reference: https://docs.oracle.com/en-us/iaas/Content/Logging/Concepts/using_the_api_searchlogs.htm
      if (compartmentId && logGroupIdToUse && logOcid) {
        // Best case: Use the documented format for searching a specific log
        searchQuery = `search "${compartmentId}/${logGroupIdToUse}/${logOcid}" | sort by datetime desc`;
      } else if (compartmentId && logGroupIdToUse) {
        // Fallback: search log group and filter by log OCID
        searchQuery = `search "${compartmentId}/${logGroupIdToUse}" | sort by datetime desc`;
      } else if (logGroupIdToUse) {
        // Fallback: try with just log group ID
        searchQuery = `search "${logGroupIdToUse}" | sort by datetime desc`;
      } else if (compartmentId && logOcid) {
        // Try searching with compartment and log OCID (no log group)
        searchQuery = `search "${compartmentId}" | where oracle.logid = "${logOcid}" | sort by datetime desc`;
      } else if (logOcid) {
        // Last resort: try searching all logs and filter by log OCID
        searchQuery = `search * | where oracle.logid = "${logOcid}" | sort by datetime desc`;
      } else {
        throw new Error('Missing required information: need log OCID at minimum');
      }
      
      // SearchLogsDetails according to Oracle documentation
      // Reference: https://docs.oracle.com/en-us/iaas/Content/Logging/Concepts/using_the_api_searchlogs.htm
      const searchLogsDetails = {
        timeStart: timeStart,
        timeEnd: timeEnd,
        searchQuery: searchQuery,
        isReturnFieldInfo: false // Optional, as shown in docs
      };

      // SearchLogsRequest structure from documentation
      const searchLogsRequest = {
        searchLogsDetails: searchLogsDetails,
        limit: tail
        // page is optional, omitting it
      };
      
      const searchResponse = await logSearchClient.searchLogs(searchLogsRequest);
      
      // Extract log entries from response
      const logEntries = searchResponse.searchResponse?.results || [];
      let logContent = '';
      
      // If we searched for a specific log (with log OCID in query), all results should be from that log
      // Otherwise, filter entries to only include logs from the specific log OCID
      let entriesToProcess = logEntries;
      if (!searchQuery.includes(`/${logOcid}"`)) {
        // We searched the log group, so filter by log OCID
        entriesToProcess = logEntries.filter(entry => {
          const entryLogId = entry.data?.logContent?.oracle?.logid || 
                            entry.logContent?.oracle?.logid ||
                            entry.oracle?.logid;
          return entryLogId === logOcid;
        });
      }
      
      if (entriesToProcess.length > 0) {
        logContent = entriesToProcess.map(entry => {
          // Extract the actual log message/content
          const logData = entry.data?.logContent || entry.logContent || entry;
          
          // Try to get the message/data field (based on actual response structure)
          if (logData.data?.message) {
            return logData.data.message;
          } else if (logData.data?.data?.message) {
            return logData.data.data.message;
          } else if (logData.message) {
            return logData.message;
          } else if (typeof logData.data === 'string') {
            return logData.data;
          } else if (entry.data?.message) {
            return entry.data.message;
          } else if (entry.message) {
            return entry.message;
          } else if (entry.content) {
            return entry.content;
          } else {
            // Return formatted JSON for complex structures
            return JSON.stringify(logData, null, 2);
          }
        }).join('\n');
      } else {
        logContent = 'No log entries found for the specified time range.';
      }

      res.json({
        success: true,
        data: logContent || 'No log entries found'
      });
    } catch (searchError) {
      console.error('=== ERROR in searchLogs try block ===');
      console.error('Error name:', searchError.name);
      console.error('Error message:', searchError.message);
      console.error('Error code:', searchError.code);
      console.error('Error stack:', searchError.stack);
      console.error('Full error object:', JSON.stringify(searchError, Object.getOwnPropertyNames(searchError)));
      console.error('Context:');
      console.error('  - Log OCID:', logOcid);
      console.error('  - Log Group ID:', logGroupIdToUse);
      console.error('  - Compartment ID:', compartmentId);
      console.error('  - Search Query:', searchQuery);
      
      // Return error in the format the frontend expects
      res.status(500).json({
        success: false,
        error: searchError.message || 'Error retrieving log content',
        errorName: searchError.name,
        errorCode: searchError.code,
        details: {
          logOcid: logOcid,
          logGroupId: logGroupIdToUse,
          compartmentId: compartmentId,
          searchQuery: searchQuery
        }
      });
    }
  } catch (error) {
    console.error('=== ERROR in outer catch block (getLog or other) ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error stack:', error.stack);
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    res.status(500).json({ 
      success: false,
      error: error.message || 'Unknown error',
      errorName: error.name,
      errorCode: error.code
    });
  }
});

// Logging Service - Test Search Logs by Log Group ID (for testing)
app.get('/api/oci/logging/test-search/:logGroupId', async (req, res) => {
  try {
    const logGroupId = req.params.logGroupId;
    const tail = parseInt(req.query.tail) || 100; // Default to last 100 lines
    
    // Use LogSearchClient to retrieve log content
    try {
      // Create search query to get all logs from the log group
      const timeStart = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
      const timeEnd = new Date();
      
      // First, get the log group to find the compartment ID
      const getLogGroupRequest = {
        logGroupId: logGroupId
      };
      
      let compartmentId = null;
      try {
        const logGroupResponse = await loggingManagementClient.getLogGroup(getLogGroupRequest);
        compartmentId = logGroupResponse.logGroup?.compartmentId;
      } catch (err) {
      }
      
      // Build search query - OCI GSL syntax
      // Format: search "<compartment_OCID>/<log_group_OCID>" for all logs in a log group
      // Or: search "<compartment_OCID>/<log_group_OCID>/<log_OCID>" for specific log
      // Use double quotes, not single quotes
      let searchQuery;
      if (compartmentId) {
        // Search all logs in the log group: search "<compartment>/<loggroup>"
        searchQuery = `search "${compartmentId}/${logGroupId}" | sort by datetime desc`;
      } else {
        // Fallback: try with just log group (may not work)
        searchQuery = `search "${logGroupId}" | sort by datetime desc`;
      }
      
      // SearchLogsDetails is a plain object
      const searchLogsDetails = {
        timeStart: timeStart,
        timeEnd: timeEnd,
        searchQuery: searchQuery
      };

      const searchLogsRequest = {
        searchLogsDetails: searchLogsDetails,
        limit: tail,
        page: undefined
      };

      const searchResponse = await logSearchClient.searchLogs(searchLogsRequest);
      
      // Extract log entries from response
      const logEntries = searchResponse.searchResponse?.results || [];
      let logContent = '';
      
      if (logEntries.length > 0) {
        logContent = logEntries.map((entry, index) => {
          return `Entry ${index + 1}:\n${JSON.stringify(entry, null, 2)}`;
        }).join('\n\n');
      } else {
        logContent = 'No log entries found for the specified time range.';
      }

      res.json({
        success: true,
        logGroupId: logGroupId,
        entryCount: logEntries.length,
        data: logContent,
        rawResponse: searchResponse
      });
    } catch (searchError) {
      console.error('Error searching logs:', searchError);
      res.status(500).json({
        success: false,
        error: searchError.message,
        stack: searchError.stack,
        logGroupId: logGroupId
      });
    }
  } catch (error) {
    console.error('Error in test search:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Networking Service - List VCNs
app.get('/api/oci/networking/vcns', async (req, res) => {
  try {
    const compartmentId = process.env.OCI_COMPARTMENT_ID || req.query.compartmentId;
    if (!compartmentId) {
      return res.status(400).json({ error: 'compartmentId is required' });
    }

    const listVcnsRequest = {
      compartmentId: compartmentId
    };

    const response = await virtualNetworkClient.listVcns(listVcnsRequest);
    res.json({
      success: true,
      data: response.items
    });
  } catch (error) {
    console.error('Error listing VCNs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Networking Service - List Subnets
app.get('/api/oci/networking/subnets', async (req, res) => {
  try {
    const compartmentId = process.env.OCI_COMPARTMENT_ID || req.query.compartmentId;
    const vcnId = req.query.vcnId;
    const subnetId = req.query.subnetId;
    
    // If subnetId is provided, get specific subnet details
    if (subnetId) {
      const getSubnetRequest = {
        subnetId: subnetId
      };
      const response = await virtualNetworkClient.getSubnet(getSubnetRequest);
      return res.json({
        success: true,
        data: response.subnet
      });
    }
    
    if (!compartmentId) {
      return res.status(400).json({ error: 'compartmentId is required' });
    }

    const listSubnetsRequest = {
      compartmentId: compartmentId,
      vcnId: vcnId
    };

    const response = await virtualNetworkClient.listSubnets(listSubnetsRequest);
    res.json({
      success: true,
      data: response.items
    });
  } catch (error) {
    console.error('Error listing subnets:', error);
    res.status(500).json({ error: error.message });
  }
});

// Networking Service - List Security Lists
app.get('/api/oci/networking/security-lists', async (req, res) => {
  try {
    const compartmentId = process.env.OCI_COMPARTMENT_ID || req.query.compartmentId;
    const vcnId = req.query.vcnId;
    
    if (!compartmentId) {
      return res.status(400).json({ error: 'compartmentId is required' });
    }

    const listSecurityListsRequest = {
      compartmentId: compartmentId,
      vcnId: vcnId
    };

    const response = await virtualNetworkClient.listSecurityLists(listSecurityListsRequest);
    res.json({
      success: true,
      data: response.items
    });
  } catch (error) {
    console.error('Error listing security lists:', error);
    res.status(500).json({ error: error.message });
  }
});

// Networking Service - Get VCN Details
app.get('/api/oci/networking/vcns/:vcnId', async (req, res) => {
  try {
    const vcnId = req.params.vcnId;
    
    const getVcnRequest = {
      vcnId: vcnId
    };

    const response = await virtualNetworkClient.getVcn(getVcnRequest);
    res.json({
      success: true,
      data: response.vcn
    });
  } catch (error) {
    console.error('Error getting VCN:', error);
    res.status(500).json({ error: error.message });
  }
});

// Networking Service - Get VNIC Details
app.get('/api/oci/networking/vnics/:vnicId', async (req, res) => {
  try {
    const vnicId = req.params.vnicId;
    
    const getVnicRequest = {
      vnicId: vnicId
    };

    const response = await virtualNetworkClient.getVnic(getVnicRequest);
    // Return the full response structure including vnic property
    res.json({
      success: true,
      vnic: response.vnic,
      data: response.vnic // Also include as data for backward compatibility
    });
  } catch (error) {
    console.error('Error getting VNIC:', error);
    res.status(500).json({ error: error.message });
  }
});

// Resource Manager - Create Stack
app.post('/api/oci/resource-manager/stacks', async (req, res) => {
  try {
    const {
      displayName,
      description,
      compartmentId,
      terraformConfig
    } = req.body;

    if (!displayName || !compartmentId || !terraformConfig) {
      return res.status(400).json({
        success: false,
        error: 'displayName, compartmentId, and terraformConfig are required'
      });
    }

    const createStackDetails = {
      compartmentId: compartmentId,
      displayName: displayName,
      description: description || `Container Instance configuration for ${displayName}`,
      configSource: {
        configSourceType: 'ZIP_UPLOAD'
      },
      terraformVersion: '1.5.x',
      variables: {},
      freeformTags: {}
    };

    // Create a ZIP file with the Terraform configuration
    const archiver = require('archiver');
    const stream = require('stream');
    
    // Create a readable stream for the ZIP
    const zipStream = new stream.PassThrough();
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.on('error', (error) => {
      console.error('Error creating ZIP:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create ZIP file: ' + error.message
      });
    });
    
    archive.pipe(zipStream);
    archive.append(terraformConfig, { name: 'main.tf' });
    archive.finalize();

    // Convert stream to buffer
    const chunks = [];
    zipStream.on('data', (chunk) => chunks.push(chunk));
    zipStream.on('end', async () => {
      try {
        const zipBuffer = Buffer.concat(chunks);
        
        // Create stack with ZIP_UPLOAD config source
        const createStackRequest = {
          createStackDetails: {
            compartmentId: compartmentId,
            displayName: displayName,
            description: description || `Container Instance configuration for ${displayName}`,
            configSource: {
              configSourceType: 'ZIP_UPLOAD',
              zipFileBase64Encoded: zipBuffer.toString('base64')
            },
            terraformVersion: '1.5.x',
            variables: {},
            freeformTags: {}
          }
        };

        const response = await resourceManagerClient.createStack(createStackRequest);
        
        res.json({
          success: true,
          data: {
            id: response.stack.id,
            displayName: response.stack.displayName,
            lifecycleState: response.stack.lifecycleState,
            compartmentId: response.stack.compartmentId
          }
        });
      } catch (error) {
        console.error('Error creating Resource Manager stack:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
    
    zipStream.on('error', (error) => {
      console.error('Error in ZIP stream:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create ZIP file: ' + error.message
      });
    });
  } catch (error) {
    console.error('Error in Resource Manager stack creation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Docker Compose - Parse YAML to OCI payload
app.post('/api/docker-compose/parse', (req, res) => {
  try {
    const { yaml: yamlString, ociConfig } = req.body;

    if (!yamlString) {
      return res.status(400).json({
        success: false,
        error: 'YAML string is required'
      });
    }

    if (!ociConfig || !ociConfig.compartmentId || !ociConfig.subnetId) {
      return res.status(400).json({
        success: false,
        error: 'ociConfig with compartmentId and subnetId is required'
      });
    }

    // Parse YAML
    const composeObject = dockerComposeParser.parseDockerCompose(yamlString);

    // Validate structure
    const validation = dockerComposeParser.validateDockerCompose(composeObject);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Docker Compose structure',
        errors: validation.errors
      });
    }

    // Convert to OCI payload
    const { payload, warnings } = dockerComposeParser.convertToOCIPayload(composeObject, ociConfig);

    res.json({
      success: true,
      payload: payload,
      warnings: warnings
    });
  } catch (error) {
    console.error('Error parsing Docker Compose:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Docker Compose - Export OCI instance to YAML
app.post('/api/docker-compose/export', async (req, res) => {
  try {
    const { instanceId, payload } = req.body;

    let ociPayload = payload;

    // If instanceId provided, fetch from OCI
    if (instanceId && !payload) {
      const getContainerInstanceRequest = {
        containerInstanceId: instanceId
      };

      const response = await containerInstancesClient.getContainerInstance(getContainerInstanceRequest);
      const instance = response.containerInstance;

      // Convert instance to payload format
      ociPayload = {
        displayName: instance.displayName,
        containers: instance.containers || [],
        volumes: instance.volumes || [],
        freeformTags: instance.freeformTags || {}
      };
    }

    if (!ociPayload) {
      return res.status(400).json({
        success: false,
        error: 'Either instanceId or payload is required'
      });
    }

    // Convert OCI payload to Docker Compose YAML
    const composeObject = {
      version: '3.8',
      services: {}
    };

    const containers = ociPayload.containers || [];
    const volumes = ociPayload.volumes || [];
    const freeformTags = ociPayload.freeformTags || {};

    // Convert containers to services
    containers.forEach(container => {
      const serviceName = container.displayName || 'container';
      const service = {
        image: container.imageUrl
      };

      // Container name
      if (container.displayName) {
        service.container_name = container.displayName;
      }

      // Ports (from freeformTags)
      if (freeformTags[container.displayName]) {
        const portNum = parseInt(freeformTags[container.displayName]);
        if (!isNaN(portNum)) {
          service.ports = [`${portNum}:${portNum}`];
        }
      }

      // Environment variables
      if (container.environmentVariables && Object.keys(container.environmentVariables).length > 0) {
        service.environment = Object.entries(container.environmentVariables).map(([key, value]) => `${key}=${value}`);
      }

      // Command
      if (container.command && Array.isArray(container.command) && container.command.length > 0) {
        service.command = container.command;
      }

      // Volumes (from volumeMounts)
      if (container.volumeMounts && container.volumeMounts.length > 0) {
        service.volumes = container.volumeMounts.map(mount => {
          const volume = volumes.find(v => v.name === mount.volumeName);
          if (volume) {
            return `${mount.volumeName}:${mount.mountPath}`;
          }
          return mount.mountPath;
        });
      }

      composeObject.services[serviceName] = service;
    });

    // Add volumes section
    if (volumes.length > 0) {
      composeObject.volumes = {};
      volumes.forEach(vol => {
        composeObject.volumes[vol.name] = {
          driver: 'local'
        };
      });
    }

    // Generate YAML
    const yamlString = yaml.dump(composeObject, { 
      indent: 2,
      lineWidth: -1,
      noRefs: true
    });

    const filename = `${ociPayload.displayName || 'container-instance'}-docker-compose.yaml`;

    res.json({
      success: true,
      yaml: yamlString,
      filename: filename
    });
  } catch (error) {
    console.error('Error exporting Docker Compose:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Serve labs HTML files
app.get('/labs.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'labs', 'labs.html'));
});

app.get('/nginx.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'labs', 'nginx.html'));
});

app.get('/26ai-ords.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'labs', '26ai-ords.html'));
});

app.get('/springboot-grafana.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'labs', 'springboot-grafana.html'));
});

app.get('/nodejs-postgresql-vault.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'labs', 'nodejs-postgresql-vault.html'));
});

// Serve labs images
app.use('/images', express.static(path.join(__dirname, 'labs', 'images')));

// Static files middleware - serve after all API routes
app.use(express.static(path.join(__dirname, 'public')));

// Serve the frontend for all other routes (excluding API routes)
app.get('*', (req, res) => {
  // Don't serve HTML for API routes - return 404 instead
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
});
