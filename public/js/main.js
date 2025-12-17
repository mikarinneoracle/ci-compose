// Check server status on page load
document.addEventListener('DOMContentLoaded', function() {
    loadPageContent();
});

async function loadPageContent() {
    const config = getConfiguration();
    
    // Display project name
    displayProjectName(config.projectName);
    
    // Load container instances if we have required config
    if (config.compartmentId && config.projectName) {
        await loadContainerInstances();
    } else {
        document.getElementById('containerInstancesContent').innerHTML = 
            '<p class="text-muted">Please configure compartment and project name to view container instances.</p>';
    }
}

function displayProjectName(projectName) {
    const projectNameDisplay = document.getElementById('projectNameDisplay');
    if (projectName) {
        projectNameDisplay.textContent = projectName;
    } else {
        projectNameDisplay.textContent = 'Project Name (Not Set)';
        projectNameDisplay.classList.add('text-muted');
    }
}

// Configuration management functions
function loadConfiguration() {
    const config = JSON.parse(localStorage.getItem('appConfig') || '{}');
    
    // Compartment and subnet will be set after they are loaded
    if (config.projectName) document.getElementById('projectName').value = config.projectName;
    if (config.region) document.getElementById('region').value = config.region;
    if (config.ociConfigFile) document.getElementById('ociConfigFile').value = config.ociConfigFile;
    if (config.ociConfigProfile) document.getElementById('ociConfigProfile').value = config.ociConfigProfile;
}

function saveConfiguration() {
    const config = {
        projectName: document.getElementById('projectName').value.trim(),
        compartmentId: document.getElementById('compartmentId').value.trim(),
        subnetId: document.getElementById('subnetId').value.trim(),
        region: document.getElementById('region').value.trim(),
        ociConfigFile: document.getElementById('ociConfigFile').value.trim() || '~/.oci/config',
        ociConfigProfile: document.getElementById('ociConfigProfile').value.trim() || 'DEFAULT'
    };
    
    // Validate required fields
    if (!config.compartmentId) {
        alert('Compartment is required');
        return;
    }
    
    if (!config.subnetId) {
        alert('Subnet is required');
        return;
    }
    
    // Save to localStorage
    localStorage.setItem('appConfig', JSON.stringify(config));
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('configModal'));
    modal.hide();
    
    // Show success message
    showNotification('Configuration saved successfully!', 'success');
    
    // Reload page content to reflect changes
    loadPageContent();
}

function getConfiguration() {
    const config = JSON.parse(localStorage.getItem('appConfig') || '{}');
    return config;
}

async function showConfigModal() {
    loadConfiguration();
    
    // Fetch region and compartments from OCI config
    await Promise.all([
        loadRegionFromConfig(),
        loadCompartments()
    ]);
    
    const modal = new bootstrap.Modal(document.getElementById('configModal'));
    modal.show();
}

async function loadRegionFromConfig() {
    try {
        const config = getConfiguration();
        const params = new URLSearchParams();
        
        if (config.ociConfigFile) {
            params.append('configPath', config.ociConfigFile);
        }
        if (config.ociConfigProfile) {
            params.append('profile', config.ociConfigProfile);
        }
        
        const response = await fetch(`/api/oci/config/region?${params.toString()}`);
        const data = await response.json();
        
        if (data.success && data.region) {
            document.getElementById('region').value = data.region;
        }
    } catch (error) {
        console.log('Could not load region from config file:', error);
        // Silently fail - user can still manually enter region
    }
}

async function loadCompartments() {
    try {
        const config = getConfiguration();
        const params = new URLSearchParams();
        
        if (config.ociConfigFile) {
            params.append('configPath', config.ociConfigFile);
        }
        if (config.ociConfigProfile) {
            params.append('profile', config.ociConfigProfile);
        }
        
        // First get the tenancy ID
        const tenancyResponse = await fetch(`/api/oci/config/tenancy?${params.toString()}`);
        const tenancyData = await tenancyResponse.json();
        
        if (!tenancyData.success || !tenancyData.tenancyId) {
            throw new Error('Could not get tenancy ID');
        }
        
        // Then get compartments
        params.append('tenancyId', tenancyData.tenancyId);
        const response = await fetch(`/api/oci/compartments?${params.toString()}`);
        const data = await response.json();
        
        const compartmentSelect = document.getElementById('compartmentId');
        
        if (data.success && data.compartments) {
            // Clear existing options
            compartmentSelect.innerHTML = '<option value="">Select a compartment...</option>';
            
            // Add compartments to dropdown
            data.compartments.forEach(comp => {
                const option = document.createElement('option');
                option.value = comp.id;
                option.textContent = comp.name + (comp.description ? ` - ${comp.description}` : '');
                compartmentSelect.appendChild(option);
            });
            
            // Restore saved compartment if exists
            const savedConfig = getConfiguration();
            if (savedConfig.compartmentId) {
                compartmentSelect.value = savedConfig.compartmentId;
                // Load subnets after compartment is selected
                if (savedConfig.compartmentId) {
                    loadSubnets();
                }
            }
        } else {
            compartmentSelect.innerHTML = '<option value="">Error loading compartments</option>';
        }
    } catch (error) {
        console.error('Could not load compartments:', error);
        const compartmentSelect = document.getElementById('compartmentId');
        compartmentSelect.innerHTML = '<option value="">Error: ' + error.message + '</option>';
    }
}

async function loadSubnets() {
    const compartmentId = document.getElementById('compartmentId').value;
    const subnetSelect = document.getElementById('subnetId');
    
    if (!compartmentId) {
        subnetSelect.innerHTML = '<option value="">Select a compartment first...</option>';
        return;
    }
    
    try {
        subnetSelect.innerHTML = '<option value="">Loading subnets...</option>';
        
        const params = new URLSearchParams();
        params.append('compartmentId', compartmentId);
        
        const response = await fetch(`/api/oci/networking/subnets?${params.toString()}`);
        const data = await response.json();
        
        if (data.success && data.data && data.data.length > 0) {
            // Clear existing options
            subnetSelect.innerHTML = '<option value="">Select a subnet...</option>';
            
            // Add subnets to dropdown
            data.data.forEach(subnet => {
                const option = document.createElement('option');
                option.value = subnet.id;
                option.textContent = subnet.displayName || subnet.id;
                if (subnet.cidrBlock) {
                    option.textContent += ` (${subnet.cidrBlock})`;
                }
                subnetSelect.appendChild(option);
            });
            
            // Restore saved subnet if exists
            const savedConfig = getConfiguration();
            if (savedConfig.subnetId) {
                subnetSelect.value = savedConfig.subnetId;
            }
        } else {
            subnetSelect.innerHTML = '<option value="">No subnets found</option>';
        }
    } catch (error) {
        console.error('Could not load subnets:', error);
        subnetSelect.innerHTML = '<option value="">Error loading subnets</option>';
    }
}

function showNotification(message, type = 'info') {
    const alertClass = type === 'success' ? 'alert-success' : 'alert-info';
    const notification = document.createElement('div');
    notification.className = `alert ${alertClass} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
    notification.style.zIndex = '9999';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Check server health
async function checkServerStatus() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        
        const statusAlert = document.getElementById('statusAlert');
        statusAlert.className = 'alert alert-success';
        statusAlert.textContent = `✅ ${data.message} - ${data.status}`;
    } catch (error) {
        const statusAlert = document.getElementById('statusAlert');
        statusAlert.className = 'alert alert-danger';
        statusAlert.textContent = '❌ Server is not responding';
        console.error('Error:', error);
    }
}

// Helper function to build query string with configuration
function buildQueryString(additionalParams = {}) {
    const config = getConfiguration();
    const params = new URLSearchParams();
    
    if (config.compartmentId) params.append('compartmentId', config.compartmentId);
    if (config.namespace) params.append('namespace', config.namespace);
    
    // Add any additional parameters
    Object.keys(additionalParams).forEach(key => {
        if (additionalParams[key]) {
            params.append(key, additionalParams[key]);
        }
    });
    
    return params.toString();
}

// Load and display container instances
async function loadContainerInstances() {
    const contentDiv = document.getElementById('containerInstancesContent');
    const config = getConfiguration();
    
    if (!config.compartmentId) {
        contentDiv.innerHTML = '<p class="text-muted">Compartment ID is required. Please configure it first.</p>';
        return;
    }
    
    if (!config.projectName) {
        contentDiv.innerHTML = '<p class="text-muted">Project name is required. Please configure it first.</p>';
        return;
    }
    
    try {
        contentDiv.innerHTML = '<p class="text-muted">Loading container instances...</p>';
        
        const params = buildQueryString();
        const response = await fetch(`/api/oci/container-instances?${params}`);
        const data = await response.json();
        
        if (data.success && data.data && data.data.length > 0) {
            // Filter container instances that match the project name
            const projectName = config.projectName.toLowerCase();
            const matchingInstances = data.data.filter(instance => {
                // Check if displayName contains the project name
                const displayName = (instance.displayName || '').toLowerCase();
                // Also check freeformTags for project name if available
                const tags = instance.freeformTags || {};
                const tagValues = Object.values(tags).join(' ').toLowerCase();
                
                return displayName.includes(projectName) || tagValues.includes(projectName);
            });
            
            if (matchingInstances.length > 0) {
                // Store the count of matching instances for default CI name
                containerInstancesCount = matchingInstances.length;
                
                // Sort by creation date (most recent first) and limit to last 5
                const sortedInstances = matchingInstances
                    .sort((a, b) => {
                        const dateA = a.timeCreated ? new Date(a.timeCreated).getTime() : 0;
                        const dateB = b.timeCreated ? new Date(b.timeCreated).getTime() : 0;
                        return dateB - dateA; // Descending order (newest first)
                    })
                    .slice(0, 5); // Get last 5 (most recent)
                
                // Fetch details for each instance to get vnic information
                await displayContainerInstancesWithDetails(sortedInstances);
            } else {
                containerInstancesCount = 0;
                contentDiv.innerHTML = `<p class="text-muted">No container instances found matching project name "${config.projectName}".</p>`;
            }
        } else {
            containerInstancesCount = 0;
            contentDiv.innerHTML = '<p class="text-muted">No container instances found.</p>';
        }
    } catch (error) {
        console.error('Error loading container instances:', error);
        contentDiv.innerHTML = `<div class="alert alert-danger">Error loading container instances: ${error.message}</div>`;
    }
}

async function displayContainerInstancesWithDetails(instances) {
    const contentDiv = document.getElementById('containerInstancesContent');
    
    if (instances.length === 0) {
        contentDiv.innerHTML = '<p class="text-muted">No container instances to display.</p>';
        return;
    }
    
    // Fetch details for each instance and get VNIC information
    const instancesWithDetails = await Promise.all(
        instances.map(async (instance) => {
            try {
                const response = await fetch(`/api/oci/container-instances/${instance.id}`);
                const data = await response.json();
                if (data.success && data.data) {
                    const instanceDetails = data.data;
                    
                    // If we have a VNIC ID, fetch VNIC details to get private IP
                    if (instanceDetails.vnics && instanceDetails.vnics.length > 0 && instanceDetails.vnics[0].vnicId) {
                        try {
                            const vnicId = instanceDetails.vnics[0].vnicId;
                            const vnicResponse = await fetch(`/api/oci/networking/vnics/${vnicId}`);
                            const vnicData = await vnicResponse.json();
                            // Try vnic property first, then fallback to data
                            const privateIp = (vnicData.vnic && vnicData.vnic.privateIp) || (vnicData.data && vnicData.data.privateIp);
                            if (privateIp) {
                                // Add private IP to the vnic object
                                instanceDetails.vnics[0].privateIp = privateIp;
                            }
                        } catch (vnicError) {
                            console.error(`Error fetching VNIC details for ${instanceDetails.vnics[0].vnicId}:`, vnicError);
                        }
                    }
                    
                    return instanceDetails;
                }
            } catch (error) {
                console.error(`Error fetching details for instance ${instance.id}:`, error);
            }
            return instance; // Fallback to original instance if details fetch fails
        })
    );
    
    let html = `<p class="text-muted mb-3">Showing last ${instancesWithDetails.length} container instance(s)</p>`;
    html += '<div class="table-responsive"><table class="table table-hover">';
    html += '<thead><tr><th>Display Name</th><th>State</th><th>Private IP</th><th>Created</th></tr></thead>';
    html += '<tbody>';
    
    instancesWithDetails.forEach(instance => {
        // Get private IP from vnics[0].privateIp or try alternative paths
        let privateIp = 'N/A';
        if (instance.vnics && instance.vnics.length > 0) {
            const vnic = instance.vnics[0];
            privateIp = vnic.privateIp || vnic.privateIpAddress || 'N/A';
        }
        
        html += '<tr style="cursor: pointer;" onclick="showContainerInstanceDetails(\'' + instance.id + '\')">';
        html += `<td><strong>${instance.displayName || 'N/A'}</strong></td>`;
        html += `<td><span class="badge bg-${getStateColor(instance.lifecycleState)}">${instance.lifecycleState || 'N/A'}</span></td>`;
        html += `<td>${privateIp}</td>`;
        html += `<td>${instance.timeCreated ? new Date(instance.timeCreated).toLocaleString() : 'N/A'}</td>`;
        html += '</tr>';
    });
    
    html += '</tbody></table></div>';
    contentDiv.innerHTML = html;
}

async function showContainerInstanceDetails(instanceId) {
    const modal = new bootstrap.Modal(document.getElementById('containerInstanceModal'));
    const detailsDiv = document.getElementById('containerInstanceDetails');
    
    modal.show();
    detailsDiv.innerHTML = '<p class="text-muted">Loading container instance details...</p>';
    
    try {
        const response = await fetch(`/api/oci/container-instances/${instanceId}`);
        const data = await response.json();
        
        if (data.success && data.data) {
            const instanceDetails = data.data;
            
            console.log('Instance details response:', instanceDetails);
            console.log('Containers in instance:', instanceDetails.containers);
            
            // If we have a VNIC ID, fetch VNIC details to get private IP and subnet ID
            if (instanceDetails.vnics && instanceDetails.vnics.length > 0 && instanceDetails.vnics[0].vnicId) {
                try {
                    const vnicId = instanceDetails.vnics[0].vnicId;
                    const vnicResponse = await fetch(`/api/oci/networking/vnics/${vnicId}`);
                    const vnicData = await vnicResponse.json();
                    // Try vnic property first, then fallback to data
                    const vnic = vnicData.vnic || vnicData.data;
                    if (vnic) {
                        const privateIp = vnic.privateIp;
                        if (privateIp) {
                            // Add private IP to the vnic object
                            instanceDetails.vnics[0].privateIp = privateIp;
                        }
                        // Get subnet ID from VNIC
                        if (vnic.subnetId) {
                            instanceDetails.subnetId = vnic.subnetId;
                        }
                    }
                } catch (vnicError) {
                    console.error(`Error fetching VNIC details for ${instanceDetails.vnics[0].vnicId}:`, vnicError);
                }
            }
            
            // Fetch subnet details to get subnet name
            if (instanceDetails.subnetId) {
                try {
                    const subnetResponse = await fetch(`/api/oci/networking/subnets?subnetId=${instanceDetails.subnetId}`);
                    const subnetData = await subnetResponse.json();
                    if (subnetData.success && subnetData.data) {
                        instanceDetails.subnetName = subnetData.data.displayName || subnetData.data.name;
                    }
                } catch (subnetError) {
                    console.error(`Error fetching subnet details for ${instanceDetails.subnetId}:`, subnetError);
                }
            }
            
            // Fetch compartment details to get compartment name
            if (instanceDetails.compartmentId) {
                try {
                    const compartmentResponse = await fetch(`/api/oci/compartments/${instanceDetails.compartmentId}`);
                    const compartmentData = await compartmentResponse.json();
                    if (compartmentData.success && compartmentData.data) {
                        instanceDetails.compartmentName = compartmentData.data.name;
                    }
                } catch (compartmentError) {
                    console.error(`Error fetching compartment details for ${instanceDetails.compartmentId}:`, compartmentError);
                }
            }
            
            // The container instance details should already include full container information
            // But if containers only have id and displayName, try fetching details for each
            if (instanceDetails.containers && instanceDetails.containers.length > 0) {
                // Check if containers already have full details (imageUrl, resourceConfig, etc.)
                const firstContainer = instanceDetails.containers[0];
                const hasFullDetails = firstContainer.imageUrl || (firstContainer.resourceConfig && Object.keys(firstContainer.resourceConfig).length > 0);
                
                console.log('First container:', firstContainer);
                console.log('Has full details?', hasFullDetails);
                
                if (!hasFullDetails) {
                    // Need to fetch container details - containers use containerId, not id
                    console.log('Fetching container details for', instanceDetails.containers.length, 'containers');
                    const containersWithDetails = await Promise.all(
                        instanceDetails.containers.map(async (container) => {
                            const containerId = container.containerId || container.id;
                            if (containerId) {
                                try {
                                    console.log(`Fetching details for container ${containerId}...`);
                                    const containerResponse = await fetch(`/api/oci/containers/${containerId}`);
                                    const containerData = await containerResponse.json();
                                    console.log(`Container details response for ${containerId}:`, containerData);
                                    
                                    if (containerData.success && containerData.data) {
                                        console.log(`Container details data keys:`, Object.keys(containerData.data));
                                        console.log(`Container details full data:`, JSON.stringify(containerData.data, null, 2));
                                        
                                        // The container details might have a different structure
                                        // Try to extract imageUrl, resourceConfig, environmentVariables from the response
                                        const containerDetails = containerData.data;
                                        
                                        // Merge the details with the original container to preserve displayName and containerId
                                        const merged = {
                                            ...container,
                                            ...containerDetails,
                                            displayName: container.displayName || containerDetails.displayName,
                                            containerId: containerId
                                        };
                                        
                                        console.log('Merged container:', merged);
                                        return merged;
                                    } else {
                                        console.warn(`No data in container response for ${containerId}`);
                                    }
                                } catch (containerError) {
                                    console.error(`Error fetching container details for ${containerId}:`, containerError);
                                }
                            } else {
                                console.warn('Container has no containerId or id:', container);
                            }
                            return container; // Fallback to original container if fetch fails
                        })
                    );
                    console.log('All containers with details:', containersWithDetails);
                    instanceDetails.containers = containersWithDetails;
                } else {
                    console.log('Containers already have full details');
                }
            }
            
            displayContainerInstanceDetails(instanceDetails);
        } else {
            detailsDiv.innerHTML = '<div class="alert alert-danger">Error loading container instance details.</div>';
        }
    } catch (error) {
        console.error('Error fetching container instance details:', error);
        detailsDiv.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    }
}

function displayContainerInstanceDetails(instance) {
    const detailsDiv = document.getElementById('containerInstanceDetails');
    
    let html = '<div class="row">';
    
    // Basic Information
    html += '<div class="col-md-6 mb-4">';
    html += '<h5 class="border-bottom pb-2 mb-3">Basic Information</h5>';
    html += '<dl class="row">';
    html += `<dt class="col-sm-4">Display Name:</dt><dd class="col-sm-8"><strong>${instance.displayName || 'N/A'}</strong></dd>`;
    html += `<dt class="col-sm-4">State:</dt><dd class="col-sm-8"><span class="badge bg-${getStateColor(instance.lifecycleState)}">${instance.lifecycleState || 'N/A'}</span></dd>`;
    html += `<dt class="col-sm-4">Compartment:</dt><dd class="col-sm-8">${instance.compartmentName || 'N/A'}</dd>`;
    html += `<dt class="col-sm-4">Created:</dt><dd class="col-sm-8">${instance.timeCreated ? new Date(instance.timeCreated).toLocaleString() : 'N/A'}</dd>`;
    html += `<dt class="col-sm-4">Updated:</dt><dd class="col-sm-8">${instance.timeUpdated ? new Date(instance.timeUpdated).toLocaleString() : 'N/A'}</dd>`;
    html += '</dl>';
    html += '</div>';
    
    // Network Information
    html += '<div class="col-md-6 mb-4">';
    html += '<h5 class="border-bottom pb-2 mb-3">Network Information</h5>';
    html += '<dl class="row">';
    html += `<dt class="col-sm-4">Subnet Name:</dt><dd class="col-sm-8">${instance.subnetName || 'N/A'}</dd>`;
    if (instance.vnics && instance.vnics.length > 0) {
        const vnic = instance.vnics[0];
        const privateIp = vnic.privateIp || vnic.privateIpAddress || 'N/A';
        html += `<dt class="col-sm-4">Private IP:</dt><dd class="col-sm-8">${privateIp}</dd>`;
    }
    html += '</dl>';
    html += '</div>';
    
    html += '</div>';
    
    // Containers Information
    html += '<div class="row">';
    html += '<div class="col-12 mb-4">';
    html += '<h5 class="border-bottom pb-2 mb-3">Containers</h5>';
    
    if (instance.containers && instance.containers.length > 0) {
        html += '<div class="table-responsive"><table class="table table-sm">';
        html += '<thead><tr><th>State</th><th>Name</th><th>Image</th><th>Resource Config</th><th>Environment Variables</th></tr></thead>';
        html += '<tbody>';
        
        instance.containers.forEach(container => {
            console.log('Processing container in display:', container);
            html += '<tr>';
            
            // State - first column
            html += `<td><span class="badge bg-${getStateColor(container.lifecycleState)}">${container.lifecycleState || 'N/A'}</span></td>`;
            
            // Container name with text-primary class
            html += `<td><strong class="text-primary">${container.displayName || container.name || 'N/A'}</strong></td>`;
            
            // Image URL - check multiple possible field names
            const imageName = container.imageUrl || container.image || container.imageName || 'N/A';
            console.log('Container imageName:', imageName, 'from container:', container);
            html += `<td><code>${imageName}</code></td>`;
            
            // Resource Config - check both old and new field names
            const resourceConfig = container.resourceConfig || {};
            console.log('Container resourceConfig:', resourceConfig);
            html += `<td>`;
            // Memory: try memoryInGBs first (standard), then memoryLimitInGBs
            const memory = resourceConfig.memoryInGBs || resourceConfig.memoryLimitInGBs;
            html += `Memory: ${memory ? memory + ' GB' : 'N/A'}<br>`;
            // VCPUs: try vcpus first (standard), then vcpusLimit
            const vcpus = resourceConfig.vcpus || resourceConfig.vcpusLimit;
            html += `VCPUs: ${vcpus || 'N/A'}`;
            html += `</td>`;
            
            // Environment Variables - handle both array and object formats
            const envVars = container.environmentVariables;
            console.log('Container environmentVariables:', envVars);
            if (envVars) {
                if (Array.isArray(envVars) && envVars.length > 0) {
                    // Array format: [{name: 'KEY', value: 'VALUE'}, ...]
                    html += '<td><small>';
                    envVars.forEach(env => {
                        const key = env.name || env.key || '';
                        const value = env.value || '';
                        if (key) {
                            html += `${key}=${value}<br>`;
                        }
                    });
                    html += '</small></td>';
                } else if (typeof envVars === 'object' && Object.keys(envVars).length > 0) {
                    // Object format: {KEY: 'VALUE', ...}
                    html += '<td><small>';
                    Object.entries(envVars).forEach(([key, value]) => {
                        html += `${key}=${value}<br>`;
                    });
                    html += '</small></td>';
                } else {
                    html += '<td class="text-muted">None</td>';
                }
            } else {
                html += '<td class="text-muted">None</td>';
            }
            
            html += '</tr>';
        });
        
        html += '</tbody></table></div>';
    } else {
        html += '<p class="text-muted">No containers found.</p>';
    }
    
    html += '</div>';
    html += '</div>';
    
    // Shape and Resource Information
    html += '<div class="row mt-4">';
    html += '<div class="col-md-6 mb-4">';
    html += '<h5 class="border-bottom pb-2 mb-3">Shape Configuration</h5>';
    html += '<dl class="row">';
    html += `<dt class="col-sm-4">Shape:</dt><dd class="col-sm-8">${instance.shape || 'N/A'}</dd>`;
    html += `<dt class="col-sm-4">Shape Config:</dt><dd class="col-sm-8">`;
    if (instance.shapeConfig) {
        html += `Memory: ${instance.shapeConfig.memoryInGBs || 'N/A'} GB<br>`;
        html += `OCPUs: ${instance.shapeConfig.ocpus || 'N/A'}`;
    } else {
        html += 'N/A';
    }
    html += `</dd>`;
    html += '</dl>';
    html += '</div>';
    
    // Tags
    html += '<div class="col-md-6 mb-4">';
    html += '<h5 class="border-bottom pb-2 mb-3">Tags</h5>';
    if (instance.freeformTags && Object.keys(instance.freeformTags).length > 0) {
        html += '<dl class="row">';
        Object.entries(instance.freeformTags).forEach(([key, value]) => {
            html += `<dt class="col-sm-4">${key}:</dt><dd class="col-sm-8">${value}</dd>`;
        });
        html += '</dl>';
    } else {
        html += '<p class="text-muted">No tags</p>';
    }
    html += '</div>';
    
    html += '</div>';
    
    detailsDiv.innerHTML = html;
}

function getStateColor(state) {
    if (!state) return 'secondary';
    const stateLower = state.toLowerCase();
    if (stateLower === 'active' || stateLower === 'running') return 'success';
    if (stateLower === 'creating' || stateLower === 'updating') return 'warning';
    if (stateLower === 'stopped' || stateLower === 'stopping') return 'info';
    if (stateLower === 'failed' || stateLower === 'deleted') return 'danger';
    return 'secondary';
}

// Container Instance Creation Functions
let containersData = []; // Array to store container data for creation
let volumesData = []; // Array to store volume data for creation
let portsData = []; // Array to store port data for creation
let containerInstancesCount = 0; // Count of container instances found on front page

// Predefined sidecars
const sidecars = [
    {
        name: 'OsReader',
        image: 'iad.ocir.io/oracle/oci-reader/os-reader:latest',
        mem: '0.5',
        ocpu: '0.5',
        envs: {
            'OCI_OS_BUCKET': '',
            'OCI_OS_PREFIX': ''
        }
    },
    {
        name: 'VaultReader',
        image: 'iad.ocir.io/oracle/oci-reader/vault-reader:latest',
        mem: '0.5',
        ocpu: '0.5',
        envs: {
            'OCI_VAULT_ID': '',
            'OCI_VAULT_SECRET_ID': ''
        }
    },
    {
        name: 'LogWriter',
        image: 'iad.ocir.io/oracle/oci-reader/log-writer:latest',
        mem: '0.5',
        ocpu: '0.5',
        envs: {
            'OCI_LOG_ID': ''
        }
    }
];

// Shape configurations with max resources
const shapeConfigs = {
    'CI.Standard.E2.Flex': { maxMemory: 8, maxVcpu: 1 },
    'CI.Standard.E3.Flex': { maxMemory: 16, maxVcpu: 2 },
    'CI.Standard.E4.Flex': { maxMemory: 32, maxVcpu: 4 },
    'CI.Standard.E5.Flex': { maxMemory: 64, maxVcpu: 8 }
};

async function showCreateContainerInstanceModal() {
    // Reset form, containers, volumes, and ports
    containersData = [];
    volumesData = [];
    portsData = [];
    document.getElementById('createContainerInstanceForm').reset();
    
    // Set default CI name: projectName-(count + 1)
    const config = getConfiguration();
    const defaultName = config.projectName ? `${config.projectName}-${containerInstancesCount + 1}` : '';
    document.getElementById('ciName').value = defaultName;
    
    // Set default shape to CI.Standard.E4.Flex
    document.getElementById('ciShape').value = 'CI.Standard.E4.Flex';
    updateShapeInfo();
    
    // Load compartment and subnet names
    try {
        if (config.compartmentId) {
            const compResponse = await fetch(`/api/oci/compartments/${config.compartmentId}`);
            const compData = await compResponse.json();
            if (compData.success && compData.data) {
                document.getElementById('ciCompartmentName').value = compData.data.name || config.compartmentId;
            } else {
                document.getElementById('ciCompartmentName').value = config.compartmentId;
            }
        }
        
        if (config.subnetId) {
            const subnetResponse = await fetch(`/api/oci/networking/subnets?subnetId=${config.subnetId}`);
            const subnetData = await subnetResponse.json();
            if (subnetData.success && subnetData.data && subnetData.data.length > 0) {
                document.getElementById('ciSubnetName').value = subnetData.data[0].displayName || config.subnetId;
            } else {
                document.getElementById('ciSubnetName').value = config.subnetId;
            }
        }
    } catch (error) {
        console.error('Error loading compartment/subnet names:', error);
    }
    
    // Update tables
    updateContainersTable();
    updateVolumesTable();
    updatePortsTable();
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('createContainerInstanceModal'));
    modal.show();
}

function updateShapeInfo() {
    const shapeSelect = document.getElementById('ciShape');
    const shapeInfo = document.getElementById('shapeInfo');
    const selectedShape = shapeSelect.value;
    
    if (selectedShape && shapeConfigs[selectedShape]) {
        const config = shapeConfigs[selectedShape];
        shapeInfo.textContent = `Max resources: ${config.maxMemory} GB memory, ${config.maxVcpu} vOCPU`;
    } else {
        shapeInfo.textContent = 'Select a shape to see max resources';
    }
}

// Container CRUD functions
function addContainerToTable() {
    // Reset edit form
    document.getElementById('editContainerForm').reset();
    document.getElementById('editContainerIndex').value = '';
    
    // Reset tabs to first tab
    const envTab = document.getElementById('env-tab');
    const envPane = document.getElementById('env-pane');
    envTab.classList.add('active');
    envPane.classList.add('show', 'active');
    
    const argsTab = document.getElementById('args-tab');
    const cmdTab = document.getElementById('cmd-tab');
    const argsPane = document.getElementById('args-pane');
    const cmdPane = document.getElementById('cmd-pane');
    argsTab.classList.remove('active');
    cmdTab.classList.remove('active');
    argsPane.classList.remove('show', 'active');
    cmdPane.classList.remove('show', 'active');
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('editContainerModal'));
    modal.show();
}

function editContainer(index) {
    const container = containersData[index];
    
    document.getElementById('editContainerIndex').value = index;
    document.getElementById('editContainerName').value = container.displayName || '';
    document.getElementById('editContainerImage').value = container.imageUrl || '';
    document.getElementById('editContainerMemory').value = container.resourceConfig?.memoryInGBs || '';
    document.getElementById('editContainerVcpus').value = container.resourceConfig?.vcpus || '';
    
    // Convert env vars object to comma-separated KEY=VALUE string
    if (container.environmentVariables && typeof container.environmentVariables === 'object') {
        const envArray = Object.entries(container.environmentVariables).map(([key, value]) => `${key}=${value}`);
        document.getElementById('editContainerEnvVars').value = envArray.join(', ');
    } else {
        document.getElementById('editContainerEnvVars').value = '';
    }
    
    // Convert args array to comma-separated string
    if (Array.isArray(container.arguments) && container.arguments.length > 0) {
        document.getElementById('editContainerArgs').value = container.arguments.join(', ');
    } else {
        document.getElementById('editContainerArgs').value = '';
    }
    
    // Convert command array to comma-separated string
    if (Array.isArray(container.command) && container.command.length > 0) {
        document.getElementById('editContainerCmd').value = container.command.join(', ');
    } else {
        document.getElementById('editContainerCmd').value = '';
    }
    
    // Reset tabs to first tab
    const envTab = document.getElementById('env-tab');
    const envPane = document.getElementById('env-pane');
    envTab.classList.add('active');
    envPane.classList.add('show', 'active');
    
    const argsTab = document.getElementById('args-tab');
    const cmdTab = document.getElementById('cmd-tab');
    const argsPane = document.getElementById('args-pane');
    const cmdPane = document.getElementById('cmd-pane');
    argsTab.classList.remove('active');
    cmdTab.classList.remove('active');
    argsPane.classList.remove('show', 'active');
    cmdPane.classList.remove('show', 'active');
    
    const modal = new bootstrap.Modal(document.getElementById('editContainerModal'));
    modal.show();
}

function deleteContainer(index) {
    if (confirm('Are you sure you want to delete this container?')) {
        containersData.splice(index, 1);
        updateContainersTable();
    }
}

function saveEditedContainer() {
    const form = document.getElementById('editContainerForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const index = document.getElementById('editContainerIndex').value;
    const container = {
        displayName: document.getElementById('editContainerName').value.trim(),
        imageUrl: document.getElementById('editContainerImage').value.trim(),
        resourceConfig: {
            memoryInGBs: parseFloat(document.getElementById('editContainerMemory').value),
            vcpus: parseFloat(document.getElementById('editContainerVcpus').value)
        }
    };
    
    // Parse environment variables (comma-separated KEY=VALUE pairs)
    const envVarsStr = document.getElementById('editContainerEnvVars').value.trim();
    if (envVarsStr) {
        const envVars = {};
        envVarsStr.split(',').forEach(pair => {
            const trimmed = pair.trim();
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex > 0) {
                const key = trimmed.substring(0, eqIndex).trim();
                const value = trimmed.substring(eqIndex + 1).trim();
                if (key) {
                    envVars[key] = value;
                }
            }
        });
        if (Object.keys(envVars).length > 0) {
            container.environmentVariables = envVars;
        }
    }
    
    // Parse arguments (comma-separated values)
    const argsStr = document.getElementById('editContainerArgs').value.trim();
    if (argsStr) {
        container.arguments = argsStr.split(',').map(arg => arg.trim()).filter(arg => arg.length > 0);
    }
    
    // Parse command (comma-separated values)
    const cmdStr = document.getElementById('editContainerCmd').value.trim();
    if (cmdStr) {
        container.command = cmdStr.split(',').map(cmd => cmd.trim()).filter(cmd => cmd.length > 0);
    }
    
    if (index === '' || index === null) {
        // Add new container
        containersData.push(container);
    } else {
        // Update existing container
        containersData[parseInt(index)] = container;
    }
    
    updateContainersTable();
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('editContainerModal'));
    modal.hide();
}

function updateContainersTable() {
    const tbody = document.getElementById('containersTableBody');
    
    if (containersData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No containers added yet. Click "Add Container" to add one.</td></tr>';
        return;
    }
    
    tbody.innerHTML = containersData.map((container, index) => {
        const memory = container.resourceConfig?.memoryInGBs || 'N/A';
        const vcpus = container.resourceConfig?.vcpus || 'N/A';
        return `
            <tr>
                <td>${container.displayName || 'N/A'}</td>
                <td><code>${container.imageUrl || 'N/A'}</code></td>
                <td>${memory}</td>
                <td>${vcpus}</td>
                <td>
                    <button class="btn btn-info btn-sm me-1" onclick="editContainer(${index})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteContainer(${index})">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Sidecar functions
function showAddSidecarModal() {
    const modal = new bootstrap.Modal(document.getElementById('addSidecarModal'));
    modal.show();
}

function addSidecar(index) {
    const sidecar = sidecars[index];
    if (!sidecar) return;
    
    const container = {
        displayName: sidecar.name,
        imageUrl: sidecar.image,
        resourceConfig: {
            memoryInGBs: parseFloat(sidecar.mem),
            vcpus: parseFloat(sidecar.ocpu)
        },
        environmentVariables: { ...sidecar.envs }
    };
    
    containersData.push(container);
    updateContainersTable();
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('addSidecarModal'));
    modal.hide();
}

// Volume CRUD functions
function addVolumeToTable() {
    document.getElementById('editVolumeForm').reset();
    document.getElementById('editVolumeIndex').value = '';
    
    const modal = new bootstrap.Modal(document.getElementById('editVolumeModal'));
    modal.show();
}

function editVolume(index) {
    const volume = volumesData[index];
    
    document.getElementById('editVolumeIndex').value = index;
    document.getElementById('editVolumeName').value = volume.name || '';
    document.getElementById('editVolumePath').value = volume.path || '';
    
    const modal = new bootstrap.Modal(document.getElementById('editVolumeModal'));
    modal.show();
}

function deleteVolume(index) {
    if (confirm('Are you sure you want to delete this volume?')) {
        volumesData.splice(index, 1);
        updateVolumesTable();
    }
}

function saveEditedVolume() {
    const form = document.getElementById('editVolumeForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const index = document.getElementById('editVolumeIndex').value;
    const volume = {
        path: document.getElementById('editVolumePath').value.trim()
    };
    
    const name = document.getElementById('editVolumeName').value.trim();
    if (name) {
        volume.name = name;
    }
    
    if (index === '' || index === null) {
        volumesData.push(volume);
    } else {
        volumesData[parseInt(index)] = volume;
    }
    
    updateVolumesTable();
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('editVolumeModal'));
    modal.hide();
}

function updateVolumesTable() {
    const tbody = document.getElementById('volumesTableBody');
    
    if (volumesData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No volumes added yet. Click "Add Volume" to add one.</td></tr>';
        return;
    }
    
    tbody.innerHTML = volumesData.map((volume, index) => {
        return `
            <tr>
                <td>${volume.name || '-'}</td>
                <td><code>${volume.path || 'N/A'}</code></td>
                <td>
                    <button class="btn btn-success btn-sm me-1" onclick="editVolume(${index})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteVolume(${index})">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Port CRUD functions
function addPortToTable() {
    document.getElementById('editPortForm').reset();
    document.getElementById('editPortIndex').value = '';
    
    const modal = new bootstrap.Modal(document.getElementById('editPortModal'));
    modal.show();
}

function editPort(index) {
    const port = portsData[index];
    
    document.getElementById('editPortIndex').value = index;
    document.getElementById('editPortName').value = port.name || '';
    document.getElementById('editPortNumber').value = port.port || '';
    
    const modal = new bootstrap.Modal(document.getElementById('editPortModal'));
    modal.show();
}

function deletePort(index) {
    if (confirm('Are you sure you want to delete this port?')) {
        portsData.splice(index, 1);
        updatePortsTable();
    }
}

function saveEditedPort() {
    const form = document.getElementById('editPortForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const index = document.getElementById('editPortIndex').value;
    const port = {
        port: parseInt(document.getElementById('editPortNumber').value)
    };
    
    const name = document.getElementById('editPortName').value.trim();
    if (name) {
        port.name = name;
    }
    
    if (index === '' || index === null) {
        portsData.push(port);
    } else {
        portsData[parseInt(index)] = port;
    }
    
    updatePortsTable();
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('editPortModal'));
    modal.hide();
}

function updatePortsTable() {
    const tbody = document.getElementById('portsTableBody');
    
    if (portsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No ports added yet. Click "Add Port" to add one.</td></tr>';
        return;
    }
    
    tbody.innerHTML = portsData.map((port, index) => {
        return `
            <tr>
                <td>${port.name || '-'}</td>
                <td>${port.port || 'N/A'}</td>
                <td>
                    <button class="btn btn-warning btn-sm me-1" onclick="editPort(${index})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deletePort(${index})">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Create container instance
async function createContainerInstance() {
    const form = document.getElementById('createContainerInstanceForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    if (containersData.length === 0) {
        alert('Please add at least one container before creating the container instance.');
        return;
    }
    
    const config = getConfiguration();
    
    const payload = {
        displayName: document.getElementById('ciName').value.trim(),
        compartmentId: config.compartmentId,
        shape: document.getElementById('ciShape').value,
        subnetId: config.subnetId,
        containers: containersData,
        containerRestartPolicy: 'NEVER'
    };
    
    // Add volumes if any
    if (volumesData.length > 0) {
        payload.volumes = volumesData.map(v => ({
            name: v.name,
            volumeType: 'EMPTYDIR',
            backingStore: 'EPHEMERAL_STORAGE'
        }));
        
        // Map volumes to containers (simplified - attach all volumes to first container)
        if (payload.containers.length > 0) {
            payload.containers[0].volumeMounts = volumesData.map((v, idx) => ({
                mountPath: v.path,
                volumeName: v.name || `volume-${idx}`
            }));
        }
    }
    
    // Add ports as ingress IPs if any
    if (portsData.length > 0) {
        payload.ingressIps = portsData.map(p => ({
            name: p.name || `port-${p.port}`,
            port: p.port
        }));
    }
    
    try {
        const response = await fetch('/api/oci/container-instances', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Container instance created successfully!');
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('createContainerInstanceModal'));
            modal.hide();
            
            // Reload container instances
            await loadContainerInstances();
        } else {
            alert(`Error creating container instance: ${data.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error creating container instance:', error);
        alert(`Error creating container instance: ${error.message}`);
    }
}

// Fetch data from API
async function fetchData() {
    try {
        const response = await fetch('/api/data');
        const data = await response.json();
        
        const dataDisplay = document.getElementById('dataDisplay');
        dataDisplay.innerHTML = `
            <div class="card fade-in">
                <div class="card-body">
                    <h5 class="card-title">API Response</h5>
                    <p class="card-text"><strong>Message:</strong> ${data.message}</p>
                    <p class="card-text"><strong>Timestamp:</strong> ${data.timestamp}</p>
                    <p class="card-text"><strong>Data:</strong></p>
                    <ul class="list-group">
                        ${data.data.map(item => `<li class="list-group-item">${item}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;
    } catch (error) {
        const dataDisplay = document.getElementById('dataDisplay');
        dataDisplay.innerHTML = `
            <div class="alert alert-danger fade-in">
                Error fetching data: ${error.message}
            </div>
        `;
        console.error('Error:', error);
    }
}

// Show form modal
function showForm() {
    const modal = new bootstrap.Modal(document.getElementById('dataModal'));
    modal.show();
}

// Handle form submission (only if element exists)
const dataForm = document.getElementById('dataForm');
if (dataForm) {
    dataForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value;
    
    try {
        const response = await fetch('/api/data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: message })
        });
        
        const data = await response.json();
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('dataModal'));
        modal.hide();
        
        // Show success message
        const dataDisplay = document.getElementById('dataDisplay');
        dataDisplay.innerHTML = `
            <div class="alert alert-success fade-in">
                <h5>Success!</h5>
                <p><strong>Response:</strong> ${data.message}</p>
                <p><strong>Timestamp:</strong> ${data.timestamp}</p>
            </div>
        `;
        
        // Clear form
        messageInput.value = '';
    } catch (error) {
        const dataDisplay = document.getElementById('dataDisplay');
        dataDisplay.innerHTML = `
            <div class="alert alert-danger fade-in">
                Error sending data: ${error.message}
            </div>
        `;
        console.error('Error:', error);
    }
    });
}

