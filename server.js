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
const common = require('oci-common');

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

// Container Instances - Create Container Instance
app.post('/api/oci/container-instances', async (req, res) => {
  try {
    console.log('=== Container Instance Creation Request Received ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
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
      freeformTags
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
    console.log('Using availability domain:', availabilityDomain);

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
        console.log(`Subnet ${subnetId} is private (prohibitPublicIpOnVnic=true), setting isPublicIpAssigned=false`);
      } else {
        console.log(`Subnet ${subnetId} allows public IPs, setting isPublicIpAssigned=true`);
      }
    } catch (subnetError) {
      console.warn(`Could not fetch subnet details for ${subnetId}, defaulting to isPublicIpAssigned=true:`, subnetError.message);
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
              console.warn(`Warning: volumeName ${mount.volumeName} not found in volumes array`);
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

    console.log('Creating container instance with request:', JSON.stringify(createContainerInstanceRequest, null, 2));
    console.log('Container details count:', containerDetails.length);
    containerDetails.forEach((cd, idx) => {
      console.log(`Container ${idx}:`, JSON.stringify(cd, null, 2));
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
    console.log('Container instance response:', JSON.stringify(response.containerInstance, null, 2));
    console.log('Containers in response:', response.containerInstance.containers);
    if (response.containerInstance.containers && response.containerInstance.containers.length > 0) {
      console.log('First container keys:', Object.keys(response.containerInstance.containers[0]));
      console.log('First container:', JSON.stringify(response.containerInstance.containers[0], null, 2));
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

// Container Instances - Get Container Details
app.get('/api/oci/containers/:containerId', async (req, res) => {
  try {
    const containerId = req.params.containerId;

    const getContainerRequest = {
      containerId: containerId
    };

    const response = await containerInstancesClient.getContainer(getContainerRequest);
    console.log('Container details response:', JSON.stringify(response, null, 2));
    console.log('Container object:', response.container);
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
    const tail = parseInt(req.query.tail) || 500; // Default to last 500 lines
    const logGroupIdFromQuery = req.query.logGroupId; // Optional: allow log group ID from query param
    
    // Try to get log group ID from config (if provided in request body or headers)
    // For now, we'll use query param or get it from the log object

    // First, get the log to find the log group OCID
    // According to OCI SDK, getLog might need logId as path parameter
    let log;
    try {
      // Try with request object first
      const getLogRequest = {
        logId: logOcid
      };
      console.log('Calling getLog with request:', JSON.stringify(getLogRequest));
      const logResponse = await loggingManagementClient.getLog(getLogRequest);
      log = logResponse.log;
    } catch (getLogError) {
      console.error('Error in getLog call:');
      console.error('Error message:', getLogError.message);
      console.error('Error code:', getLogError.code);
      console.error('Error stack:', getLogError.stack);
      
      // Try alternative: pass logId as path parameter
      try {
        console.log('Trying getLog with logId as path parameter:', logOcid);
        const logResponse = await loggingManagementClient.getLog(logOcid);
        log = logResponse.log;
      } catch (getLogError2) {
        console.error('Both getLog methods failed:', getLogError2.message);
        return res.status(500).json({
          success: false,
          error: `Failed to get log details: ${getLogError.message}`,
          details: {
            logOcid: logOcid,
            error: getLogError.message
          }
        });
      }
    }
    
    if (!log) {
      return res.status(404).json({
        success: false,
        error: 'Log not found'
      });
    }

    console.log('Log object details:');
    console.log('  - ID:', log.id);
    console.log('  - Display Name:', log.displayName);
    console.log('  - Log Group ID:', log.logGroupId);
    console.log('  - Compartment ID:', log.compartmentId);

    // Use log group ID from query param (config) if provided, otherwise from log object
    const logGroupIdToUse = logGroupIdFromQuery || log.logGroupId;
    
    if (!logGroupIdToUse) {
      return res.status(400).json({
        success: false,
        error: 'Log group ID not found. Please set it in configuration or ensure the log has a log group ID.'
      });
    }
    
    console.log('Using log group ID:', logGroupIdToUse);

    // Use LogSearchClient to retrieve log content
    try {
      // Create search query for the specific log
      const timeStart = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
      const timeEnd = new Date();
      
      // Get compartment ID - try from log first
      let compartmentId = log.compartmentId;
      
      console.log('Initial compartment ID from log:', compartmentId);
      console.log('Log group ID to use:', logGroupIdToUse);
      
      // Skip getLogGroup call entirely - it's causing "Missing required path parameter" error
      // Instead, use compartment ID from log object if available
      // If not available, try searching without compartment ID (may work with just log group ID)
      if (!compartmentId) {
        console.warn('No compartment ID in log object. Will try search with just log group ID.');
        console.warn('Note: This may not work, but avoids the getLogGroup error.');
      } else {
        console.log('Using compartment ID from log object (skipping getLogGroup call)');
      }
      
      // Build search query - use the exact same format as the test endpoint that works
      // The test endpoint uses: search "<compartment>/<loggroup>"
      if (!logGroupIdToUse) {
        throw new Error(`Missing log group ID. Please set it in configuration.`);
      }
      
      // Build search query according to Oracle documentation:
      // Format: search "<compartment_OCID>/<log_group_OCID>/<log_OCID>" for specific log
      // Reference: https://docs.oracle.com/en-us/iaas/Content/Logging/Concepts/using_the_api_searchlogs.htm
      let searchQuery;
      if (compartmentId && logGroupIdToUse && logOcid) {
        // Use the documented format for searching a specific log
        searchQuery = `search "${compartmentId}/${logGroupIdToUse}/${logOcid}" | sort by datetime desc`;
        console.log('Using specific log search format (compartment/loggroup/log)');
      } else if (compartmentId && logGroupIdToUse) {
        // Fallback: search log group and filter by log OCID
        searchQuery = `search "${compartmentId}/${logGroupIdToUse}" | sort by datetime desc`;
        console.log('Using log group search format (compartment/loggroup), will filter by log OCID');
      } else if (logGroupIdToUse) {
        // Last resort: try with just log group ID
        console.warn('No compartment ID available, trying search with just log group ID');
        searchQuery = `search "${logGroupIdToUse}" | sort by datetime desc`;
      } else {
        throw new Error('Missing required information: need at least log group ID');
      }
      
      console.log('Search query:', searchQuery);
      console.log('Compartment ID:', compartmentId);
      console.log('Log Group ID:', logGroupIdToUse);
      console.log('Log OCID:', logOcid);
      
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
      
      console.log('Calling searchLogs with request:', JSON.stringify({
        searchLogsDetails: {
          timeStart: timeStart.toISOString(),
          timeEnd: timeEnd.toISOString(),
          searchQuery: searchQuery,
          isReturnFieldInfo: false
        },
        limit: tail
      }, null, 2));
      
      const searchResponse = await logSearchClient.searchLogs(searchLogsRequest);
      
      // Extract log entries from response
      const logEntries = searchResponse.searchResponse?.results || [];
      let logContent = '';
      
      // If we searched for a specific log (with log OCID in query), all results should be from that log
      // Otherwise, filter entries to only include logs from the specific log OCID
      let entriesToProcess = logEntries;
      if (!searchQuery.includes(`/${logOcid}"`)) {
        // We searched the log group, so filter by log OCID
        console.log('Filtering results by log OCID:', logOcid);
        entriesToProcess = logEntries.filter(entry => {
          const entryLogId = entry.data?.logContent?.oracle?.logid || 
                            entry.logContent?.oracle?.logid ||
                            entry.oracle?.logid;
          return entryLogId === logOcid;
        });
        console.log(`Filtered ${logEntries.length} entries to ${entriesToProcess.length} entries for log ${logOcid}`);
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
        console.log('No log entries found in search results');
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
    console.error('Error getting log content:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
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
        console.log('Log group compartment ID:', compartmentId);
      } catch (err) {
        console.log('Could not get log group details:', err.message);
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

      console.log('Test search logs - logGroupId:', logGroupId);
      console.log('Test search logs - request:', JSON.stringify(searchLogsRequest, null, 2));
      
      const searchResponse = await logSearchClient.searchLogs(searchLogsRequest);
      
      console.log('Test search response:', JSON.stringify(searchResponse, null, 2));
      
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
  console.log(`Server is running on http://localhost:${PORT}`);
});
