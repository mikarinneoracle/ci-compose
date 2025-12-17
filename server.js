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
