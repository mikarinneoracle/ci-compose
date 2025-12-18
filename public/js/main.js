// Track currently viewed instance in modal

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize hover tooltips for container rows
function initializeContainerTooltips() {
    // Remove existing tooltip if any
    const existingTooltip = document.querySelector('.container-tooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }
    
    const containerRows = document.querySelectorAll('.container-row-hover');
    containerRows.forEach(row => {
        // Remove existing event listeners by cloning
        const newRow = row.cloneNode(true);
        row.parentNode.replaceChild(newRow, row);
        
        let tooltip = null;
        
        newRow.addEventListener('mouseenter', function(e) {
            if (tooltip) {
                tooltip.remove();
            }
            
            // Get data from attributes
            const envVarsJson = newRow.getAttribute('data-env-vars');
            const cmdJson = newRow.getAttribute('data-cmd');
            const argsJson = newRow.getAttribute('data-args');
            
            if (!envVarsJson && !cmdJson && !argsJson) return;
            
            // Parse JSON data
            let envVars = {};
            let cmd = [];
            let args = [];
            
            try {
                if (envVarsJson) envVars = JSON.parse(envVarsJson);
                if (cmdJson) cmd = JSON.parse(cmdJson);
                if (argsJson) args = JSON.parse(argsJson);
            } catch (e) {
                console.error('Error parsing tooltip data:', e);
                return;
            }
            
            // Build tooltip content
            let tooltipContent = '';
            
            if (envVars && typeof envVars === 'object' && Object.keys(envVars).length > 0) {
                tooltipContent += '<strong>Environment Variables:</strong><br>';
                Object.entries(envVars).forEach(([key, value]) => {
                    tooltipContent += `<code>${escapeHtml(key)}=${escapeHtml(String(value))}</code><br>`;
                });
                tooltipContent += '<br>';
            }
            
            if (cmd && cmd.length > 0) {
                tooltipContent += '<strong>Command:</strong><br><code>' + escapeHtml(cmd.join(' ')) + '</code><br><br>';
            }
            
            if (args && args.length > 0) {
                tooltipContent += '<strong>Arguments:</strong><br><code>' + escapeHtml(args.join(' ')) + '</code>';
            }
            
            if (!tooltipContent) {
                tooltipContent = '<em class="text-muted">No environment variables, command, or arguments</em>';
            }
            
            tooltip = document.createElement('div');
            tooltip.className = 'container-tooltip';
            tooltip.innerHTML = tooltipContent;
            document.body.appendChild(tooltip);
            
            // Position tooltip - wait a moment for tooltip to be rendered to get accurate dimensions
            setTimeout(() => {
                const rect = newRow.getBoundingClientRect();
                const tooltipRect = tooltip.getBoundingClientRect();
                
                // Try to position to the right of the row first
                let left = rect.right + 15;
                let top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
                
                // Adjust if tooltip would go off screen to the right
                if (left + tooltipRect.width > window.innerWidth - 10) {
                    // Try left side
                    left = rect.left - tooltipRect.width - 15;
                    // If still off screen, position it below the row
                    if (left < 10) {
                        left = rect.left + 10;
                        top = rect.bottom + 10;
                    }
                }
                
                // Ensure tooltip doesn't go off screen vertically
                if (top + tooltipRect.height > window.innerHeight - 10) {
                    top = window.innerHeight - tooltipRect.height - 10;
                }
                
                if (top < 10) {
                    top = 10;
                }
                
                // Ensure tooltip doesn't go off screen horizontally
                if (left < 10) {
                    left = 10;
                }
                if (left + tooltipRect.width > window.innerWidth - 10) {
                    left = window.innerWidth - tooltipRect.width - 10;
                }
                
                tooltip.style.left = left + 'px';
                tooltip.style.top = top + 'px';
            }, 0);
            
            // Show tooltip with slight delay for smooth animation
            setTimeout(() => {
                if (tooltip) {
                    tooltip.classList.add('show');
                }
            }, 10);
        });
        
        newRow.addEventListener('mouseleave', function() {
            if (tooltip) {
                tooltip.classList.remove('show');
                setTimeout(() => {
                    if (tooltip && tooltip.parentNode) {
                        tooltip.remove();
                    }
                    tooltip = null;
                }, 200);
            }
        });
    });
}
let currentModalInstanceId = null;

// Track previous container instance states to detect changes
let previousInstanceStates = new Map(); // Map of instanceId -> lifecycleState

// Check server status on page load
document.addEventListener('DOMContentLoaded', function() {
    loadPageContent();
    
    // Auto-reload container instances every 5 seconds
    setInterval(async () => {
        const config = getConfiguration();
        if (config.compartmentId && config.projectName) {
            await loadContainerInstances();
        }
    }, 5000);
});

async function loadPageContent() {
    const config = getConfiguration();
    
    // Display CI name
    displayProjectName(config.projectName);
    
    // Load ports and volumes for the CI name
    if (config.projectName) {
        loadPortsAndVolumesForCIName(config.projectName);
        updatePortsTable();
        updateVolumesTable();
    }
    
    // Load container instances if we have required config
    if (config.compartmentId && config.projectName) {
        await loadContainerInstances();
    } else {
        document.getElementById('containerInstancesContent').innerHTML = 
            '<p class="text-muted">Please configure compartment and CI name to view container instances.</p>';
    }
}

function displayProjectName(projectName) {
    const projectNameDisplay = document.getElementById('projectNameDisplay');
    if (projectName) {
        projectNameDisplay.textContent = projectName;
    } else {
        projectNameDisplay.textContent = 'CI Name (Not Set)';
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
    if (config.logGroupId) document.getElementById('logGroupId').value = config.logGroupId;
}

async function saveConfiguration() {
    const oldConfig = getConfiguration();
    const oldProjectName = oldConfig.projectName;
    
    const config = {
        projectName: document.getElementById('projectName').value.trim(),
        compartmentId: document.getElementById('compartmentId').value.trim(),
        subnetId: document.getElementById('subnetId').value.trim(),
        region: document.getElementById('region').value.trim(),
        ociConfigFile: document.getElementById('ociConfigFile').value.trim() || '~/.oci/config',
        ociConfigProfile: document.getElementById('ociConfigProfile').value.trim() || 'DEFAULT',
        logGroupId: document.getElementById('logGroupId').value.trim()
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
    
    // If projectName (CI name) changed, save current ports/volumes under old name
    // and load ports/volumes for new name (if any exist)
    const ciNameChanged = oldProjectName && oldProjectName !== config.projectName;
    const compartmentChanged = oldConfig.compartmentId !== config.compartmentId;
    
    // Clear previous instance states if CI name or compartment changed to force refresh
    if (ciNameChanged || compartmentChanged) {
        previousInstanceStates.clear();
    }
    
    if (ciNameChanged) {
        // Save current ports/volumes under old name before switching
        savePortsAndVolumesForCIName(oldProjectName);
        // Load ports/volumes for new CI name
        loadPortsAndVolumesForCIName(config.projectName);
        updatePortsTable();
        updateVolumesTable();
    }
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('configModal'));
    modal.hide();
    
    // Show success message
    showNotification('Configuration saved successfully!', 'success');
    
    // Update displayed CI name
    displayProjectName(config.projectName);
    
    // Always reload container instances table if we have valid config
    // Force refresh by clearing previous states and reloading
    if (config.compartmentId && config.projectName) {
        previousInstanceStates.clear();
        await loadContainerInstances();
    } else {
        // If config is invalid, show message
        document.getElementById('containerInstancesContent').innerHTML = 
            '<p class="text-muted">Please configure compartment and CI name to view container instances.</p>';
    }
}

function getConfiguration() {
    const config = JSON.parse(localStorage.getItem('appConfig') || '{}');
    return config;
}

// Container Instance Creation Functions - declare arrays early so they're accessible to save/load functions
let containersData = []; // Array to store container data for creation
let volumesData = []; // Array to store volume data for creation
let portsData = []; // Array to store port data for creation
let containerInstancesCount = 0; // Count of container instances found on front page (total including deleted)
let showDeletedCIs = false; // Toggle state for showing/hiding deleted CIs

// Save ports and volumes for a specific CI name (projectName)
function savePortsAndVolumesForCIName(ciName) {
    if (!ciName) return;
    
    const key = `ciPortsVolumes_${ciName}`;
    const data = {
        ports: portsData,
        volumes: volumesData
    };
    localStorage.setItem(key, JSON.stringify(data));
    console.log(`Saved ${portsData.length} ports and ${volumesData.length} volumes for CI name: ${ciName}`);
}

// Load ports and volumes for a specific CI name (projectName)
function loadPortsAndVolumesForCIName(ciName) {
    if (!ciName) {
        volumesData = [];
        portsData = [];
        return;
    }
    
    const key = `ciPortsVolumes_${ciName}`;
    const saved = localStorage.getItem(key);
    
    if (saved) {
        try {
            const data = JSON.parse(saved);
            portsData = data.ports || [];
            volumesData = data.volumes || [];
            console.log(`Loaded ${portsData.length} ports and ${volumesData.length} volumes for CI name: ${ciName}`);
        } catch (error) {
            console.error('Error loading ports and volumes:', error);
            volumesData = [];
            portsData = [];
        }
    } else {
        console.log(`No saved ports/volumes found for CI name: ${ciName}`);
        volumesData = [];
        portsData = [];
    }
}

// Load ports and volumes for details edit mode (returns data, doesn't modify global variables)
function loadPortsAndVolumesForCINameForDetails(ciName) {
    if (!ciName) {
        return { ports: [], volumes: [] };
    }
    
    const key = `ciPortsVolumes_${ciName}`;
    const saved = localStorage.getItem(key);
    
    if (saved) {
        try {
            const data = JSON.parse(saved);
            return {
                ports: data.ports || [],
                volumes: data.volumes || []
            };
        } catch (error) {
            console.error('Error loading ports and volumes:', error);
            return { ports: [], volumes: [] };
        }
    } else {
        return { ports: [], volumes: [] };
    }
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

// Load subnets for CI create/edit modals
async function loadSubnetsForCI(compartmentId) {
    const subnetSelect = document.getElementById('ciSubnetId');
    
    if (!subnetSelect) {
        return;
    }
    
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
            
            // Preselect default subnet from config
            const config = getConfiguration();
            if (config.subnetId) {
                subnetSelect.value = config.subnetId;
            }
        } else {
            subnetSelect.innerHTML = '<option value="">No subnets found</option>';
        }
    } catch (error) {
        console.error('Could not load subnets:', error);
        subnetSelect.innerHTML = '<option value="">Error loading subnets</option>';
    }
}

// Load subnets for CI details edit mode
async function loadSubnetsForDetails(compartmentId, currentSubnetId) {
    const subnetSelect = document.getElementById('detailsSubnetId');
    
    if (!subnetSelect) {
        return;
    }
    
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
            
            // Preselect current subnet (the one used when CI was created)
            // Only use default from config if currentSubnetId is not available
            if (currentSubnetId) {
                subnetSelect.value = currentSubnetId;
            }
        } else {
            subnetSelect.innerHTML = '<option value="">No subnets found</option>';
        }
    } catch (error) {
        console.error('Could not load subnets:', error);
        subnetSelect.innerHTML = '<option value="">Error loading subnets</option>';
    }
}

function showNotification(message, type = 'info', duration = null) {
    let alertClass;
    if (type === 'success') {
        alertClass = 'alert-success';
    } else if (type === 'error') {
        alertClass = 'alert-danger';
    } else if (type === 'warning') {
        alertClass = 'alert-warning';
    } else {
        alertClass = 'alert-info';
    }
    
    // Default durations: warnings stay longer (15s), others default to 3s
    const defaultDuration = type === 'warning' ? 15000 : 3000;
    const timeoutDuration = duration !== null ? duration : defaultDuration;
    
    const notification = document.createElement('div');
    notification.className = `alert ${alertClass} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
    notification.style.zIndex = '9999';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(notification);
    
    // Store reference to warning notifications so they can be dismissed when exiting edit mode
    if (type === 'warning') {
        warningNotificationElement = notification;
    }
    
    setTimeout(() => {
        notification.remove();
        // Clear reference if it was the warning notification
        if (notification === warningNotificationElement) {
            warningNotificationElement = null;
        }
    }, timeoutDuration);
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
        contentDiv.innerHTML = '<p class="text-muted">CI name is required. Please configure it first.</p>';
        return;
    }
    
    try {
        const params = buildQueryString();
        const response = await fetch(`/api/oci/container-instances?${params}`);
        const data = await response.json();
        
        if (data.success && data.data && data.data.length > 0) {
            // Filter container instances that match the CI name
            const projectName = config.projectName.toLowerCase();
            const matchingInstances = data.data.filter(instance => {
                // Check if displayName contains the CI name
                const displayName = (instance.displayName || '').toLowerCase();
                // Also check freeformTags for CI name if available
                const tags = instance.freeformTags || {};
                const tagValues = Object.values(tags).join(' ').toLowerCase();
                
                return displayName.includes(projectName) || tagValues.includes(projectName);
            });
            
            if (matchingInstances.length > 0) {
                // Store the count of unique display names (including deleted) for default CI name
                // Multiple CIs with the same name count as 1
                const uniqueNames = new Set(matchingInstances.map(instance => instance.displayName || ''));
                containerInstancesCount = uniqueNames.size;
                
                // Sort by creation date (most recent first) and limit to last 10
                const sortedInstances = matchingInstances
                    .sort((a, b) => {
                        const dateA = a.timeCreated ? new Date(a.timeCreated).getTime() : 0;
                        const dateB = b.timeCreated ? new Date(b.timeCreated).getTime() : 0;
                        return dateB - dateA; // Descending order (newest first)
                    })
                    .slice(0, 10); // Get last 10 (most recent)
                
                // Fetch details to get accurate states, then check if states changed
                const instancesWithDetails = await Promise.all(
                    sortedInstances.map(async (instance) => {
                        try {
                            const response = await fetch(`/api/oci/container-instances/${instance.id}`);
                            const data = await response.json();
                            if (data.success && data.data) {
                                return data.data;
                            }
                        } catch (error) {
                            console.error(`Error fetching details for instance ${instance.id}:`, error);
                        }
                        return instance;
                    })
                );
                
                // Check if any instance states have changed
                let hasStateChange = false;
                const currentStates = new Map();
                
                instancesWithDetails.forEach(instance => {
                    const currentState = instance.lifecycleState || 'UNKNOWN';
                    currentStates.set(instance.id, currentState);
                    const previousState = previousInstanceStates.get(instance.id);
                    if (previousState !== currentState) {
                        hasStateChange = true;
                    }
                });
                
                // Only update the display if there's a state change or if this is the first load
                if (hasStateChange || previousInstanceStates.size === 0) {
                    // Update previous states
                    previousInstanceStates = currentStates;
                    
                    // Display instances with VNIC details (this function will fetch VNIC info and apply filter)
                    await displayContainerInstancesWithDetails(instancesWithDetails);
                }
                // If no state change, silently skip the update to avoid unnecessary DOM manipulation
            } else {
                containerInstancesCount = 0;
                // Only update if content div is empty or shows error
                if (contentDiv.innerHTML.includes('No container instances found matching CI name') === false) {
                    contentDiv.innerHTML = `<p class="text-muted">No container instances found matching CI name "${config.projectName}".</p>`;
                }
            }
        } else {
            containerInstancesCount = 0;
            // Only update if content div is empty or shows error
            if (contentDiv.innerHTML.includes('No container instances found.') === false) {
                contentDiv.innerHTML = '<p class="text-muted">No container instances found.</p>';
            }
        }
    } catch (error) {
        console.error('Error loading container instances:', error);
        contentDiv.innerHTML = `<div class="alert alert-danger">Error loading container instances: ${error.message}</div>`;
    }
}

async function displayContainerInstancesWithDetails(instances) {
    const contentDiv = document.getElementById('containerInstancesContent');
    
    // Filter out DELETED instances if toggle is off
    let instancesToDisplay = instances;
    if (!showDeletedCIs) {
        instancesToDisplay = instances.filter(instance => {
            const state = instance.lifecycleState || 'UNKNOWN';
            return state !== 'DELETED';
        });
    }
    
    if (instancesToDisplay.length === 0) {
        if (instances.length > 0 && !showDeletedCIs) {
            contentDiv.innerHTML = '<p class="text-muted">No container instances to display (deleted instances are hidden).</p>';
        } else {
            contentDiv.innerHTML = '<p class="text-muted">No container instances to display.</p>';
        }
        return;
    }
    
    // Fetch VNIC details for each instance to get IP addresses
    const instancesWithDetails = await Promise.all(
        instancesToDisplay.map(async (instance) => {
            // If we have a VNIC ID, fetch VNIC details to get private IP and public IP
            if (instance.vnics && instance.vnics.length > 0 && instance.vnics[0].vnicId) {
                try {
                    const vnicId = instance.vnics[0].vnicId;
                    const vnicResponse = await fetch(`/api/oci/networking/vnics/${vnicId}`);
                    const vnicData = await vnicResponse.json();
                    // Try vnic property first, then fallback to data
                    const vnic = vnicData.vnic || vnicData.data;
                    if (vnic) {
                        // Add private IP to the vnic object
                        if (vnic.privateIp) {
                            instance.vnics[0].privateIp = vnic.privateIp;
                        }
                        // Add public IP to the vnic object if it exists
                        if (vnic.publicIp) {
                            instance.vnics[0].publicIp = vnic.publicIp;
                        }
                    }
                } catch (vnicError) {
                    console.error(`Error fetching VNIC details for ${instance.vnics[0].vnicId}:`, vnicError);
                }
            }
            
            return instance;
        })
    );
    
    let html = `<p class="text-muted mb-3">Showing ${instancesWithDetails.length} of ${instances.length} container instance(s)`;
    if (!showDeletedCIs && instances.length > instancesWithDetails.length) {
        html += ` (${instances.length - instancesWithDetails.length} deleted hidden)`;
    }
    html += `</p>`;
    html += '<div class="table-responsive"><table class="table table-hover">';
    html += '<thead><tr><th>Display Name</th><th>State</th><th>Private IP</th><th>Public IP</th><th>Created</th></tr></thead>';
    html += '<tbody>';
    
    instancesWithDetails.forEach(instance => {
        // Get private IP and public IP from vnics[0]
        let privateIp = 'N/A';
        let publicIp = 'N/A';
        if (instance.vnics && instance.vnics.length > 0) {
            const vnic = instance.vnics[0];
            privateIp = vnic.privateIp || vnic.privateIpAddress || 'N/A';
            publicIp = vnic.publicIp || vnic.publicIpAddress || 'N/A';
        }
        
        html += '<tr style="cursor: pointer;" onclick="showContainerInstanceDetails(\'' + instance.id + '\')">';
        html += `<td><strong>${instance.displayName || 'N/A'}</strong></td>`;
        html += `<td>${getStateBadgeHtml(instance.lifecycleState)}</td>`;
        html += `<td>${privateIp}</td>`;
        html += `<td>${publicIp}</td>`;
        html += `<td>${instance.timeCreated ? new Date(instance.timeCreated).toLocaleString() : 'N/A'}</td>`;
        html += '</tr>';
    });
    
    html += '</tbody></table></div>';
    contentDiv.innerHTML = html;
}

// Toggle function to show/hide deleted container instances
function toggleDeletedCIs() {
    const toggle = document.getElementById('showDeletedToggle');
    if (toggle) {
        showDeletedCIs = toggle.checked;
        // Force reload by clearing previous states to trigger display update
        previousInstanceStates.clear();
        // Reload container instances to apply the filter
        loadContainerInstances();
    }
}

async function showContainerInstanceDetails(instanceId) {
    const modalElement = document.getElementById('containerInstanceModal');
    const modal = new bootstrap.Modal(modalElement);
    const detailsDiv = document.getElementById('containerInstanceDetails');
    
    // Track which instance is currently being viewed
    currentModalInstanceId = instanceId;
    
    // Clean up any existing interval when modal closes
    modalElement.addEventListener('hidden.bs.modal', function() {
        const existingIntervalId = modalElement.getAttribute('data-refresh-interval-id');
        if (existingIntervalId) {
            clearInterval(parseInt(existingIntervalId));
            modalElement.removeAttribute('data-refresh-interval-id');
        }
        currentModalInstanceId = null;
        exitEditMode(); // Exit edit mode and reset flags when modal closes
        editingDetailsContext = null;
        
        // Dismiss warning notification if it exists
        if (warningNotificationElement) {
            warningNotificationElement.remove();
            warningNotificationElement = null;
        }
    }, { once: true });
    
    // Set up interval to refresh modal content every 5 seconds while modal is open
    const modalRefreshInterval = setInterval(async () => {
        const modalInstance = bootstrap.Modal.getInstance(modalElement);
        // Only refresh if modal is still open, viewing the same instance, and not in edit mode
        if (modalInstance && modalElement.classList.contains('show') && currentModalInstanceId === instanceId && !isInEditMode) {
            await refreshContainerInstanceModal(instanceId);
        } else {
            // Modal closed, clear interval
            clearInterval(modalRefreshInterval);
            currentModalInstanceId = null;
        }
    }, 5000);
    
    // Store interval ID so we can clear it when modal closes
    modalElement.setAttribute('data-refresh-interval-id', modalRefreshInterval);
    
    modal.show();
    detailsDiv.innerHTML = '<p class="text-muted">Loading container instance details...</p>';
    
    await refreshContainerInstanceModal(instanceId);
}

// Helper function to refresh container instance modal content
async function refreshContainerInstanceModal(instanceId) {
    // Don't refresh if we're in edit mode to prevent resetting the page
    if (isInEditMode) {
        return;
    }
    
    const detailsDiv = document.getElementById('containerInstanceDetails');
    
    try {
        const response = await fetch(`/api/oci/container-instances/${instanceId}`);
        const data = await response.json();
        
        if (data.success && data.data) {
            const instanceDetails = data.data;
            
            // If we have a VNIC ID, fetch VNIC details to get private IP, public IP, and subnet ID
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
                        // Add public IP to the vnic object if it exists
                        if (vnic.publicIp) {
                            instanceDetails.vnics[0].publicIp = vnic.publicIp;
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
                
                if (!hasFullDetails) {
                    // Need to fetch container details - containers use containerId, not id
                    const containersWithDetails = await Promise.all(
                        instanceDetails.containers.map(async (container) => {
                            const containerId = container.containerId || container.id;
                            if (containerId) {
                                try {
                                    const containerResponse = await fetch(`/api/oci/containers/${containerId}`);
                                    const containerData = await containerResponse.json();
                                    
                                    if (containerData.success && containerData.data) {
                                        const containerDetails = containerData.data;
                                        
                                        // Merge the details with the original container to preserve displayName and containerId
                                        const merged = {
                                            ...container,
                                            ...containerDetails,
                                            displayName: container.displayName || containerDetails.displayName,
                                            containerId: containerId
                                        };
                                        
                                        return merged;
                                    }
                                } catch (containerError) {
                                    console.error(`Error fetching container details for ${containerId}:`, containerError);
                                }
                            }
                            return container; // Fallback to original container if fetch fails
                        })
                    );
                    instanceDetails.containers = containersWithDetails;
                }
            }
            
            // Double-check we're not in edit mode before refreshing (async operations might have completed after we entered edit mode)
            if (!isInEditMode) {
                displayContainerInstanceDetails(instanceDetails);
            }
        } else {
            detailsDiv.innerHTML = '<div class="alert alert-danger">Error loading container instance details.</div>';
        }
    } catch (error) {
        console.error('Error fetching container instance details:', error);
        detailsDiv.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    }
}

// Store original instance data for edit operations
let currentEditingInstance = null;
// Track if we're in edit mode to prevent auto-refresh
let isInEditMode = false;
// Store reference to warning notification so it can be dismissed
let warningNotificationElement = null;

function displayContainerInstanceDetails(instance) {
    // Don't rebuild the modal if we're in edit mode - this would reset all user changes
    if (isInEditMode) {
        return;
    }
    
    const detailsDiv = document.getElementById('containerInstanceDetails');
    
    // Store the original instance data for later use in save operation
    currentEditingInstance = {
        id: instance.id,
        displayName: instance.displayName,
        compartmentId: instance.compartmentId,
        subnetId: instance.subnetId,
        shape: instance.shape,
        shapeConfig: instance.shapeConfig,
        containerRestartPolicy: instance.containerRestartPolicy || 'NEVER',
        lifecycleState: instance.lifecycleState
    };
    
    let html = '<div class="row">';
    
    // Basic Information
    html += '<div class="col-md-6 mb-4">';
    html += '<h5 class="border-bottom pb-2 mb-3">Basic Information</h5>';
    html += '<dl class="row">';
    html += `<dt class="col-sm-4">Display Name:</dt><dd class="col-sm-8"><strong>${instance.displayName || 'N/A'}</strong></dd>`;
    html += `<dt class="col-sm-4">State:</dt><dd class="col-sm-8">${getStateBadgeHtml(instance.lifecycleState)}</dd>`;
    html += '</dl>';
    
    // Compact details section
    html += '<div class="mt-3 pt-3 border-top">';
    html += '<dl class="row small mb-0">';
    html += `<dt class="col-5 text-muted">Compartment:</dt><dd class="col-7">${instance.compartmentName || 'N/A'}</dd>`;
    html += `<dt class="col-5 text-muted">Created:</dt><dd class="col-7">${instance.timeCreated ? new Date(instance.timeCreated).toLocaleString() : 'N/A'}</dd>`;
    html += `<dt class="col-5 text-muted">Updated:</dt><dd class="col-7">${instance.timeUpdated ? new Date(instance.timeUpdated).toLocaleString() : 'N/A'}</dd>`;
    html += '</dl>';
    html += '</div>';
    
    html += '</div>';
    
    // Network Information
    html += '<div class="col-md-6 mb-4">';
    html += '<h5 class="border-bottom pb-2 mb-3">Network Information</h5>';
    html += '<dl class="row">';
    if (instance.vnics && instance.vnics.length > 0) {
        const vnic = instance.vnics[0];
        const privateIp = vnic.privateIp || vnic.privateIpAddress || 'N/A';
        const publicIp = vnic.publicIp || vnic.publicIpAddress || 'N/A';
        html += `<dt class="col-sm-4">Private IP:</dt><dd class="col-sm-8">${privateIp}</dd>`;
        html += `<dt class="col-sm-4">Public IP:</dt><dd class="col-sm-8">${publicIp}</dd>`;
    }
    html += '</dl>';
    
    // Compact subnet and shape section
    html += '<div class="mt-3 pt-3 border-top">';
    html += '<dl class="row small mb-0">';
    html += `<dt class="col-5 text-muted">Subnet:</dt>`;
    html += `<dd class="col-7">`;
    html += `<span id="detailsSubnetDisplay">${instance.subnetName || 'N/A'}</span>`;
    html += `<select class="form-select form-select-sm" id="detailsSubnetId" style="display: none;">`;
    html += `<option value="">Loading subnets...</option>`;
    html += `</select></dd>`;
    html += `<dt class="col-5 text-muted">Shape:</dt><dd class="col-7">${instance.shape || 'N/A'}</dd>`;
    if (instance.shapeConfig) {
        const memoryValue = instance.shapeConfig.memoryInGBs || '16';
        const ocpusValue = instance.shapeConfig.ocpus || '1';
        
        // Memory - show dropdown in edit mode, text in view mode
        html += `<dt class="col-5 text-muted">Memory:</dt>`;
        html += `<dd class="col-7">`;
        html += `<span id="detailsMemoryDisplay">${memoryValue} GB</span>`;
        html += `<select class="form-select form-select-sm" id="detailsShapeMemory" style="display: none;">`;
        html += `<option value="1" ${memoryValue == '1' ? 'selected' : ''}>1 GB</option>`;
        html += `<option value="2" ${memoryValue == '2' ? 'selected' : ''}>2 GB</option>`;
        html += `<option value="4" ${memoryValue == '4' ? 'selected' : ''}>4 GB</option>`;
        html += `<option value="8" ${memoryValue == '8' ? 'selected' : ''}>8 GB</option>`;
        html += `<option value="16" ${memoryValue == '16' ? 'selected' : ''}>16 GB</option>`;
        html += `<option value="32" ${memoryValue == '32' ? 'selected' : ''}>32 GB</option>`;
        html += `<option value="64" ${memoryValue == '64' ? 'selected' : ''}>64 GB</option>`;
        html += `</select></dd>`;
        
        // OCPUs - show dropdown in edit mode, text in view mode
        html += `<dt class="col-5 text-muted">OCPUs:</dt>`;
        html += `<dd class="col-7">`;
        html += `<span id="detailsOcpusDisplay">${ocpusValue}</span>`;
        html += `<select class="form-select form-select-sm" id="detailsShapeOcpus" style="display: none;">`;
        html += `<option value="1" ${ocpusValue == '1' ? 'selected' : ''}>1 OCPU</option>`;
        html += `<option value="2" ${ocpusValue == '2' ? 'selected' : ''}>2 OCPU</option>`;
        html += `<option value="3" ${ocpusValue == '3' ? 'selected' : ''}>3 OCPU</option>`;
        html += `<option value="4" ${ocpusValue == '4' ? 'selected' : ''}>4 OCPU</option>`;
        html += `<option value="5" ${ocpusValue == '5' ? 'selected' : ''}>5 OCPU</option>`;
        html += `<option value="6" ${ocpusValue == '6' ? 'selected' : ''}>6 OCPU</option>`;
        html += `<option value="7" ${ocpusValue == '7' ? 'selected' : ''}>7 OCPU</option>`;
        html += `<option value="8" ${ocpusValue == '8' ? 'selected' : ''}>8 OCPU</option>`;
        html += `</select></dd>`;
    }
    html += '</dl>';
    html += '</div>';
    
    html += '</div>';
    
    html += '</div>';
    
    // Parse freeformTags to extract volumes and port mappings
    const freeformTags = instance.freeformTags || {};
    let volumesList = [];
    const portMap = {}; // containerName -> port
    
    // Parse volumes tag (format: "name1:path1,name2:path2")
    if (freeformTags.volumes) {
        const volumesStr = freeformTags.volumes;
        volumesStr.split(',').forEach(volumeStr => {
            const parts = volumeStr.split(':');
            if (parts.length >= 2) {
                const name = parts[0].trim();
                const path = parts.slice(1).join(':'); // Handle paths that might contain ':'
                volumesList.push({ name, path });
            }
        });
    }
    
    // Parse port mappings (containerName -> port)
    Object.entries(freeformTags).forEach(([key, value]) => {
        if (key !== 'volumes' && typeof value === 'string' && /^\d+$/.test(value)) {
            // If value is a number (port), it's a container name -> port mapping
            portMap[key] = value;
        }
    });
    
    // Containers Information
    html += '<div class="row">';
    html += '<div class="col-12 mb-4">';
    html += '<div class="d-flex justify-content-between align-items-center mb-3">';
    html += '<h5 class="border-bottom pb-2 mb-0">Containers</h5>';
    // CRUD buttons only visible in edit mode (controlled by isInEditMode flag) - grouped together
    html += '<div class="d-flex">';
    html += `<button class="btn btn-info btn-sm me-1" id="detailsAddContainerBtn" onclick="addContainerToDetails()" style="display: none;"><i class="bi bi-plus"></i> Add Container</button>`;
    html += `<button class="btn btn-secondary btn-sm me-1" id="detailsAddSidecarBtn" onclick="showAddSidecarModalToDetails()" style="display: none;"><i class="bi bi-plus"></i> Add Sidecar</button>`;
    html += '</div>';
    html += '</div>';
    
    // Store containers data for CRUD operations (convert to editable format)
    const detailsContainersData = (instance.containers || []).map((container, idx) => {
        const containerName = container.displayName || container.name || 'N/A';
        const resourceConfig = container.resourceConfig || {};
        const memory = resourceConfig.memoryInGBs || resourceConfig.memoryLimitInGBs || 1;
        const vcpus = resourceConfig.vcpus || resourceConfig.vcpusLimit || 1;
        
        const portNum = portMap[containerName] || null;
        return {
            index: idx,
            containerId: container.containerId || container.id, // Preserve containerId for logs
            displayName: containerName,
            imageUrl: container.imageUrl || container.image || container.imageName || 'N/A',
            resourceConfig: {
                memoryInGBs: memory,
                vcpus: vcpus
            },
            environmentVariables: container.environmentVariables || {},
            arguments: container.arguments || [],
            command: container.command || [],
            lifecycleState: container.lifecycleState,
            port: portNum ? portNum.toString() : null,
            portIndex: null // Will be set when editing if port matches a port in detailsPortsData
        };
    });
    
    // Store in data attribute for access by CRUD functions
    const containerInstanceId = instance.id;
    
    if (detailsContainersData.length > 0) {
        html += '<table class="table table-sm" style="width: 100%; table-layout: auto;">';
        // Actions column header - only show in edit mode
        // Log column header - only show in non-edit mode
        const actionsHeader = isInEditMode ? '<th style="width: auto; white-space: nowrap; text-align: right;">Actions</th>' : '';
        const logHeader = !isInEditMode ? '<th style="border-bottom: 1px solid #dee2e6;">Logs</th>' : '';
        html += `<thead style="border-bottom: 1px solid #dee2e6;"><tr><th style="border-bottom: 1px solid #dee2e6;">State</th><th style="border-bottom: 1px solid #dee2e6;">Name</th><th style="border-bottom: 1px solid #dee2e6;">Port</th><th style="border-bottom: 1px solid #dee2e6;">Image</th><th style="border-bottom: 1px solid #dee2e6;">Resource Config</th>${actionsHeader ? '<th style="border-bottom: 1px solid #dee2e6; width: auto; white-space: nowrap; text-align: right;">Actions</th>' : ''}${logHeader}</tr></thead>`;
        html += '<tbody id="detailsContainersTableBody">';
        
        detailsContainersData.forEach((container, idx) => {
            const containerName = container.displayName;
            
            // Store tooltip data in data attributes
            const envVars = container.environmentVariables || {};
            const cmd = container.command || [];
            const args = container.arguments || [];
            
            const envVarsJson = JSON.stringify(envVars);
            const cmdJson = JSON.stringify(cmd);
            const argsJson = JSON.stringify(args);
            
            html += `<tr class="container-row-hover" data-env-vars='${envVarsJson}' data-cmd='${cmdJson}' data-args='${argsJson}'>`;
            
            // State - first column
            html += `<td>${getStateBadgeHtml(container.lifecycleState)}</td>`;
            
            // Container name with text-primary class
            html += `<td><strong class="text-primary">${containerName}</strong></td>`;
            
            // Port
            html += `<td>${container.port || '-'}</td>`;
            
            // Image URL
            html += `<td><code>${container.imageUrl}</code></td>`;
            
            // Resource Config
            html += `<td>`;
            html += `Memory: ${container.resourceConfig.memoryInGBs || 'N/A'} GB<br>`;
            html += `VCPUs: ${container.resourceConfig.vcpus || 'N/A'}`;
            html += `</td>`;
            
            // Actions column - only show CRUD buttons in edit mode
            html += `<td id="containerActions_${idx}" style="display: none; white-space: nowrap; text-align: right;">`;
            html += `<button class="btn btn-info btn-sm me-1" onclick="editContainerInDetails(${idx}, '${containerInstanceId}')">Edit</button>`;
            html += `<button class="btn btn-danger btn-sm" onclick="deleteContainerInDetails(${idx}, '${containerInstanceId}')">Delete</button>`;
            html += `</td>`;
            
            // Log column - only show in non-edit mode and if container has log_ocid env var
            if (!isInEditMode) {
                const logOcid = envVars.log_ocid;
                if (logOcid) {
                    html += `<td>`;
                    html += `<button class="btn btn-secondary btn-sm" onclick="showContainerLogs('${escapeHtml(logOcid)}', '${escapeHtml(containerName)}')" title="View container logs">`;
                    html += `<i class="bi bi-file-text"></i> Log`;
                    html += `</button>`;
                    html += `</td>`;
                } else {
                    html += `<td>-</td>`;
                }
            }
            
            html += '</tr>';
        });
        
        html += '</tbody></table>';
    } else {
        html += '<p class="text-muted">No containers found.</p>';
        html += '<tbody id="detailsContainersTableBody"></tbody>';
    }
    
    // Store containers data globally for this instance
    window[`detailsContainers_${containerInstanceId}`] = detailsContainersData;
    
    // Initialize hover tooltips for container rows
    setTimeout(() => {
        initializeContainerTooltips();
    }, 100);
    
    // Store ports data for this instance
    // First try to load from localStorage (if CI was edited before)
    let detailsPortsData = [];
    const config = getConfiguration();
    if (config.projectName) {
        const existingData = loadPortsAndVolumesForCINameForDetails(config.projectName);
        detailsPortsData = existingData.ports || [];
    }
    
    // Merge with ports from portMap (tags) - add any missing ports
    const portsFromTags = new Set();
    Object.entries(portMap).forEach(([containerName, portNum]) => {
        portsFromTags.add(parseInt(portNum));
    });
    
    // Add any ports from tags that aren't already in detailsPortsData
    portsFromTags.forEach(portNum => {
        const exists = detailsPortsData.some(p => p.port === portNum);
        if (!exists) {
            detailsPortsData.push({
                port: portNum,
                name: null // We don't have port names in the tags, just numbers
            });
        }
    });
    
    window[`detailsPorts_${containerInstanceId}`] = detailsPortsData;
    
    // Also load volumes from localStorage if available
    if (config.projectName) {
        const existingData = loadPortsAndVolumesForCINameForDetails(config.projectName);
        if (existingData.volumes && existingData.volumes.length > 0) {
            // Use volumes from localStorage (they may have been edited previously)
            const mergedVolumes = existingData.volumes.map((v, idx) => ({
                index: idx,
                name: v.name || '',
                path: v.path || ''
            }));
            window[`detailsVolumes_${containerInstanceId}`] = mergedVolumes;
            // Update the volumes list used in display
            volumesList = existingData.volumes.map(v => ({ name: v.name || '', path: v.path || '' }));
        }
    }
    
    html += '</div>';
    html += '</div>';
    
    // Volumes Information
    html += '<div class="row mt-3">';
    html += '<div class="col-12 mb-4">';
    html += '<div class="d-flex justify-content-between align-items-center mb-3">';
    html += '<h5 class="border-bottom pb-2 mb-0">Volumes</h5>';
    // CRUD buttons only visible in edit mode
    html += `<button class="btn btn-success btn-sm" id="detailsAddVolumeBtn" onclick="addVolumeToDetails('${containerInstanceId}')" style="display: none;"><i class="bi bi-plus"></i> Add Volume</button>`;
    html += '</div>';
    
    // Store volumes data for CRUD operations
    // volumesList was potentially updated above from localStorage
    const detailsVolumesData = volumesList.map((volume, idx) => ({
        index: idx,
        name: volume.name || '',
        path: volume.path || ''
    }));
    
    window[`detailsVolumes_${containerInstanceId}`] = detailsVolumesData;
    
    if (detailsVolumesData.length > 0) {
        html += '<div class="table-responsive"><table class="table table-sm table-bordered">';
        // Actions column header - only show in edit mode
        const actionsHeader = isInEditMode ? '<th>Actions</th>' : '';
        html += `<thead class="table-light"><tr><th>Name</th><th>Path</th>${actionsHeader}</tr></thead>`;
        html += '<tbody id="detailsVolumesTableBody_' + containerInstanceId + '">';
        
        detailsVolumesData.forEach((volume, idx) => {
            html += '<tr>';
            html += `<td>${volume.name || '-'}</td>`;
            html += `<td><code>${volume.path || 'N/A'}</code></td>`;
            // Actions column - only show CRUD buttons in edit mode
            html += `<td id="volumeActions_${idx}" style="display: none;">`;
            html += `<button class="btn btn-success btn-sm me-1" onclick="editVolumeInDetails(${idx}, '${containerInstanceId}')"><i class="bi bi-pencil"></i></button>`;
            html += `<button class="btn btn-danger btn-sm" onclick="deleteVolumeInDetails(${idx}, '${containerInstanceId}')"><i class="bi bi-trash"></i></button>`;
            html += `</td>`;
            html += '</tr>';
        });
        
        html += '</tbody></table></div>';
    } else {
        html += '<p class="text-muted">No volumes found.</p>';
        html += '<tbody id="detailsVolumesTableBody_' + containerInstanceId + '"></tbody>';
    }
    
    html += '</div>';
    html += '</div>';
    
    // Edit, Save, Cancel, Restart, Delete, and Close buttons
    const canEdit = instance.lifecycleState !== 'UPDATING' && instance.lifecycleState !== 'CREATING' && instance.lifecycleState !== 'DELETING' && instance.lifecycleState !== 'DELETED';
    const editDisabledAttr = canEdit ? '' : 'disabled';
    const canRestart = instance.lifecycleState !== 'UPDATING' && instance.lifecycleState !== 'CREATING' && instance.lifecycleState !== 'DELETING' && instance.lifecycleState !== 'DELETED';
    const restartDisabledAttr = canRestart ? '' : 'disabled';
    const canDelete = instance.lifecycleState !== 'UPDATING' && instance.lifecycleState !== 'CREATING' && instance.lifecycleState !== 'DELETING' && instance.lifecycleState !== 'DELETED';
    const deleteDisabledAttr = canDelete ? '' : 'disabled';
    html += '<div class="row mt-4">';
    html += '<div class="col-12 text-end">';
    html += `<button class="btn btn-warning me-2" id="detailsEditBtn" onclick="isInEditMode = true; enterEditMode('${containerInstanceId}')" ${editDisabledAttr}>`;
    html += '<i class="bi bi-pencil"></i> Edit';
    html += '</button>';
    html += `<button class="btn btn-info me-2" id="detailsRestartBtn" onclick="restartContainerInstance('${containerInstanceId}')" ${restartDisabledAttr}>`;
    html += '<i class="bi bi-arrow-clockwise"></i> Restart';
    html += '</button>';
    html += `<button class="btn btn-danger me-2" id="detailsDeleteBtn" onclick="deleteContainerInstance('${containerInstanceId}')" ${deleteDisabledAttr}>`;
    html += '<i class="bi bi-trash"></i> Delete';
    html += '</button>';
    html += `<button class="btn btn-secondary me-2" id="detailsCloseBtn" onclick="closeDetailsModal()" style="display: inline-block;">`;
    html += 'Close';
    html += '</button>';
    html += `<button class="btn btn-warning me-2" id="detailsCancelBtn" onclick="exitEditMode()" style="display: none;">`;
    html += 'Cancel';
    html += '</button>';
    html += `<button class="btn btn-primary me-2" id="detailsSaveBtn" onclick="saveCIChanges('${containerInstanceId}')" style="display: none;">`;
    html += 'Save';
    html += '</button>';
    html += '</div>';
    html += '</div>';
    
    detailsDiv.innerHTML = html;
}

// CRUD functions for Containers in Details Modal
let editingDetailsContext = null; // Store { type: 'details', instanceId: '...' } when editing in details modal

// Enter edit mode - show CRUD buttons
function enterEditMode(instanceId) {
    isInEditMode = true;
    
    // Clear the modal refresh interval to prevent any auto-reload during edit mode
    const modalElement = document.getElementById('containerInstanceModal');
    if (modalElement) {
        const existingIntervalId = modalElement.getAttribute('data-refresh-interval-id');
        if (existingIntervalId) {
            clearInterval(parseInt(existingIntervalId));
            modalElement.removeAttribute('data-refresh-interval-id');
        }
    }
    
    // Show warning about delete-create (5 second duration)
    showNotification('Warning: Saving changes will delete the current container instance and create a new one with the same name.', 'warning', 5000);
    
    // Show Add buttons
    const addContainerBtn = document.getElementById('detailsAddContainerBtn');
    if (addContainerBtn) addContainerBtn.style.display = 'inline-block';
    
    const addSidecarBtn = document.getElementById('detailsAddSidecarBtn');
    if (addSidecarBtn) addSidecarBtn.style.display = 'inline-block';
    
    const addVolumeBtn = document.getElementById('detailsAddVolumeBtn');
    if (addVolumeBtn) addVolumeBtn.style.display = 'inline-block';
    
    // Initialize and display volumes table
    refreshDetailsVolumesTable(instanceId);
    
    // Refresh containers table to hide log column and show action buttons
    refreshDetailsContainersTable(instanceId);
    
    // Show Edit/Delete buttons for volumes
    const volumes = window[`detailsVolumes_${instanceId}`] || [];
    volumes.forEach((volume, idx) => {
        const actionsCell = document.getElementById(`volumeActions_${idx}`);
        if (actionsCell) actionsCell.style.display = 'table-cell';
    });
    
    // Show Save, Cancel buttons; hide Edit, Restart, Delete, and Close buttons
    const editBtn = document.getElementById('detailsEditBtn');
    if (editBtn) editBtn.style.display = 'none';
    
    const closeBtn = document.getElementById('detailsCloseBtn');
    if (closeBtn) closeBtn.style.display = 'none';
    
    const restartBtn = document.getElementById('detailsRestartBtn');
    if (restartBtn) restartBtn.style.display = 'none';
    
    const deleteBtn = document.getElementById('detailsDeleteBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';
    
    const saveBtn = document.getElementById('detailsSaveBtn');
    if (saveBtn) saveBtn.style.display = 'inline-block';
    
    const cancelBtn = document.getElementById('detailsCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'inline-block';
    
    // Show editable dropdowns for Memory and OCPUs
    const memoryDisplay = document.getElementById('detailsMemoryDisplay');
    const memorySelect = document.getElementById('detailsShapeMemory');
    if (memoryDisplay) memoryDisplay.style.display = 'none';
    if (memorySelect) memorySelect.style.display = 'block';
    
    const ocpusDisplay = document.getElementById('detailsOcpusDisplay');
    const ocpusSelect = document.getElementById('detailsShapeOcpus');
    if (ocpusDisplay) ocpusDisplay.style.display = 'none';
    if (ocpusSelect) ocpusSelect.style.display = 'block';
    
    // Load and show subnet dropdown
    const subnetDisplay = document.getElementById('detailsSubnetDisplay');
    const subnetSelect = document.getElementById('detailsSubnetId');
    if (subnetDisplay && subnetSelect) {
        subnetDisplay.style.display = 'none';
        subnetSelect.style.display = 'inline-block';
        // Load subnets for the compartment
        const config = getConfiguration();
        if (config.compartmentId && currentEditingInstance) {
            loadSubnetsForDetails(config.compartmentId, currentEditingInstance.subnetId);
        }
    }
}

function addContainerToDetails() {
    // Set editing context
    const instanceId = currentEditingInstance?.id;
    if (!instanceId) return;
    
    editingDetailsContext = { type: 'details', instanceId: instanceId };
    
    // Reset edit form
    document.getElementById('editContainerForm').reset();
    document.getElementById('editContainerIndex').value = '';
    
    // Load ports from localStorage for this CI name and update port dropdown
    let detailsPorts = [];
    const config = getConfiguration();
    if (config.projectName) {
        const existingData = loadPortsAndVolumesForCINameForDetails(config.projectName);
        detailsPorts = (existingData.ports || []).map(p => ({
            port: typeof p.port === 'number' ? p.port : parseInt(p.port),
            name: p.name || null
        }));
    }
    
    // Also include ports from detailsPorts (from tags)
    const portsFromTags = window[`detailsPorts_${instanceId}`] || [];
    // Merge: add ports from tags that don't already exist in localStorage ports
    portsFromTags.forEach(tagPort => {
        const tagPortNum = typeof tagPort.port === 'number' ? tagPort.port : parseInt(tagPort.port);
        const exists = detailsPorts.some(p => {
            const pPortNum = typeof p.port === 'number' ? p.port : parseInt(p.port);
            return pPortNum === tagPortNum;
        });
        if (!exists) {
            detailsPorts.push({
                port: tagPortNum,
                name: tagPort.name || null
            });
        }
    });
    
    // Update port dropdown
    const portSelect = document.getElementById('editContainerPort');
    if (portSelect) {
        portSelect.innerHTML = '<option value="">No port</option>';
        detailsPorts.forEach((port, index) => {
            const option = document.createElement('option');
            option.value = index.toString();
            const portNum = typeof port.port === 'number' ? port.port : parseInt(port.port);
            const displayText = port.name ? `${port.name} (${portNum})` : `Port ${portNum}`;
            option.textContent = displayText;
            portSelect.appendChild(option);
        });
    }
    
    // Reset tabs to first tab
    const envTab = document.getElementById('env-tab');
    const envPane = document.getElementById('env-pane');
    if (envTab) envTab.classList.add('active');
    if (envPane) envPane.classList.add('show', 'active');
    
    const argsTab = document.getElementById('args-tab');
    const cmdTab = document.getElementById('cmd-tab');
    const argsPane = document.getElementById('args-pane');
    const cmdPane = document.getElementById('cmd-pane');
    if (argsTab) argsTab.classList.remove('active');
    if (cmdTab) cmdTab.classList.remove('active');
    if (argsPane) argsPane.classList.remove('show', 'active');
    if (cmdPane) cmdPane.classList.remove('show', 'active');
    
    const modalElement = document.getElementById('editContainerModal');
    const modal = new bootstrap.Modal(modalElement);
    
    // Reset edit mode when modal is closed without saving
    modalElement.addEventListener('hidden.bs.modal', function() {
        if (editingDetailsContext && editingDetailsContext.type === 'details') {
            isInEditMode = false;
            editingDetailsContext = null;
        }
    }, { once: true });
    
    modal.show();
}

function editContainerInDetails(index, instanceId) {
    const containers = window[`detailsContainers_${instanceId}`] || [];
    const container = containers[index];
    if (!container) return;
    
    // Set edit mode flag to prevent auto-refresh
    isInEditMode = true;
    
    // Set editing context
    editingDetailsContext = { type: 'details', instanceId: instanceId, index: index };
    
    // Populate edit form with container data
    document.getElementById('editContainerIndex').value = index;
    document.getElementById('editContainerName').value = container.displayName || '';
    document.getElementById('editContainerImage').value = container.imageUrl || '';
    document.getElementById('editContainerMemory').value = container.resourceConfig?.memoryInGBs || '1';
    document.getElementById('editContainerVcpus').value = container.resourceConfig?.vcpus || '1';
    
    // Load ports from localStorage for this CI name and update port dropdown
    let detailsPorts = [];
    const config = getConfiguration();
    if (config.projectName) {
        const existingData = loadPortsAndVolumesForCINameForDetails(config.projectName);
        detailsPorts = (existingData.ports || []).map(p => ({
            port: typeof p.port === 'number' ? p.port : parseInt(p.port),
            name: p.name || null
        }));
    }
    
    // Also include ports from detailsPorts (from tags)
    const portsFromTags = window[`detailsPorts_${instanceId}`] || [];
    // Merge: add ports from tags that don't already exist in localStorage ports
    portsFromTags.forEach(tagPort => {
        const tagPortNum = typeof tagPort.port === 'number' ? tagPort.port : parseInt(tagPort.port);
        const exists = detailsPorts.some(p => {
            const pPortNum = typeof p.port === 'number' ? p.port : parseInt(p.port);
            return pPortNum === tagPortNum;
        });
        if (!exists) {
            detailsPorts.push({
                port: tagPortNum,
                name: tagPort.name || null
            });
        }
    });
    
    // Update port dropdown
    const portSelect = document.getElementById('editContainerPort');
    if (portSelect) {
        portSelect.innerHTML = '<option value="">No port</option>';
        let selectedPortIndex = '';
        detailsPorts.forEach((port, idx) => {
            const option = document.createElement('option');
            option.value = idx.toString();
            const portNum = typeof port.port === 'number' ? port.port : parseInt(port.port);
            const displayText = port.name ? `${port.name} (${portNum})` : `Port ${portNum}`;
            option.textContent = displayText;
            const containerPortNum = container.port ? parseInt(container.port) : null;
            if (containerPortNum && portNum === containerPortNum) {
                option.selected = true;
                selectedPortIndex = idx.toString();
            }
            portSelect.appendChild(option);
        });
        // Set the selected value
        if (selectedPortIndex) {
            portSelect.value = selectedPortIndex;
            container.portIndex = parseInt(selectedPortIndex);
        }
    }
    
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
    if (envTab) envTab.classList.add('active');
    if (envPane) envPane.classList.add('show', 'active');
    
    const argsTab = document.getElementById('args-tab');
    const cmdTab = document.getElementById('cmd-tab');
    const argsPane = document.getElementById('args-pane');
    const cmdPane = document.getElementById('cmd-pane');
    if (argsTab) argsTab.classList.remove('active');
    if (cmdTab) cmdTab.classList.remove('active');
    if (argsPane) argsPane.classList.remove('show', 'active');
    if (cmdPane) cmdPane.classList.remove('show', 'active');
    
    const modalElement = document.getElementById('editContainerModal');
    const modal = new bootstrap.Modal(modalElement);
    
    // Reset edit mode when modal is closed without saving
    modalElement.addEventListener('hidden.bs.modal', function() {
        if (editingDetailsContext && editingDetailsContext.type === 'details') {
            isInEditMode = false;
            editingDetailsContext = null;
        }
    }, { once: true });
    
    modal.show();
}

function deleteContainerInDetails(index, instanceId) {
    const containers = window[`detailsContainers_${instanceId}`] || [];
    const container = containers[index];
    if (!container) return;
    
    // Remove from local array and refresh display
    containers.splice(index, 1);
    window[`detailsContainers_${instanceId}`] = containers;
    
    // Refresh the display by re-rendering the containers table
    refreshDetailsContainersTable(instanceId);
    
    // Ensure buttons are still visible after refresh if in edit mode
    // Use setTimeout to ensure the table has been fully rendered
    if (isInEditMode) {
        setTimeout(() => {
            const updatedContainers = window[`detailsContainers_${instanceId}`] || [];
            updatedContainers.forEach((container, idx) => {
                const actionsCell = document.getElementById(`containerActions_${idx}`);
                if (actionsCell) {
                    actionsCell.style.display = 'table-cell';
                }
            });
        }, 50);
    }
}

function refreshDetailsContainersTable(instanceId) {
    const tbody = document.getElementById('detailsContainersTableBody');
    if (!tbody) return;
    
    const containers = window[`detailsContainers_${instanceId}`] || [];
    
    // Get instance state from currentEditingInstance
    const instanceCanEdit = currentEditingInstance && currentEditingInstance.id === instanceId
        ? (currentEditingInstance.lifecycleState !== 'UPDATING' && currentEditingInstance.lifecycleState !== 'CREATING' && currentEditingInstance.lifecycleState !== 'DELETING')
        : true; // Default to true if we can't determine state
    
    if (containers.length === 0) {
        // 5 base columns + 1 conditional column (Actions in edit mode)
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No containers</td></tr>';
        return;
    }
    
    // Show/hide Actions and Log column headers
    const table = tbody.closest('table');
    if (table) {
        const thead = table.querySelector('thead tr');
        if (thead) {
            const headers = thead.querySelectorAll('th');
            // Actions header is second to last (before Log if it exists)
            // Log header is last (if it exists)
            if (headers.length > 5) {
                const actionsHeader = headers[headers.length - 2]; // Second to last
                const logHeader = headers[headers.length - 1]; // Last
                if (actionsHeader) {
                    actionsHeader.style.display = isInEditMode ? 'table-cell' : 'none';
                    // Ensure border is maintained when visible
                    if (isInEditMode) {
                        actionsHeader.style.borderBottom = '1px solid #dee2e6';
                    }
                }
                if (logHeader) {
                    logHeader.style.display = !isInEditMode ? 'table-cell' : 'none';
                    // Ensure border is maintained when visible
                    if (!isInEditMode) {
                        logHeader.style.borderBottom = '1px solid #dee2e6';
                    }
                }
            }
        }
    }
    
    tbody.innerHTML = containers.map((container, idx) => {
        const containerName = container.displayName;
        
        // Store tooltip data in data attributes
        const envVars = container.environmentVariables || {};
        const cmd = container.command || [];
        const args = container.arguments || [];
        
        const envVarsJson = JSON.stringify(envVars);
        const cmdJson = JSON.stringify(cmd);
        const argsJson = JSON.stringify(args);
        
        let html = `<tr class="container-row-hover" data-env-vars='${envVarsJson}' data-cmd='${cmdJson}' data-args='${argsJson}'>`;
        
        html += `<td>${getStateBadgeHtml(container.lifecycleState)}</td>`;
        html += `<td><strong class="text-primary">${containerName}</strong></td>`;
        html += `<td>${container.port || '-'}</td>`;
        html += `<td><code>${container.imageUrl}</code></td>`;
        html += `<td>Memory: ${container.resourceConfig.memoryInGBs || 'N/A'} GB<br>VCPUs: ${container.resourceConfig.vcpus || 'N/A'}</td>`;
        
        // Actions column - visibility controlled by edit mode
        const actionsDisplay = isInEditMode ? 'table-cell' : 'none';
        html += `<td id="containerActions_${idx}" style="display: ${actionsDisplay}; white-space: nowrap; text-align: right;">`;
        html += `<button class="btn btn-info btn-sm me-1" onclick="editContainerInDetails(${idx}, '${instanceId}')">Edit</button>`;
        html += `<button class="btn btn-danger btn-sm" onclick="deleteContainerInDetails(${idx}, '${instanceId}')">Delete</button>`;
        html += `</td>`;
        html += '</tr>';
        return html;
    }).join('');
    
    // Initialize hover tooltips for container rows
    setTimeout(() => {
        initializeContainerTooltips();
    }, 100);
}

// CRUD functions for Volumes in Details Modal
function addVolumeToDetails(instanceId) {
    // Set edit mode flag to prevent auto-refresh
    isInEditMode = true;
    
    // Set editing context
    editingDetailsContext = { type: 'details', instanceId: instanceId, itemType: 'volume' };
    
    // Reset edit form
    document.getElementById('editVolumeForm').reset();
    document.getElementById('editVolumeIndex').value = '';
    
    const modalElement = document.getElementById('editVolumeModal');
    const modal = new bootstrap.Modal(modalElement);
    
    // Reset edit mode when modal is closed without saving
    modalElement.addEventListener('hidden.bs.modal', function() {
        if (editingDetailsContext && editingDetailsContext.type === 'details' && editingDetailsContext.itemType === 'volume') {
            isInEditMode = false;
            editingDetailsContext = null;
        }
    }, { once: true });
    
    modal.show();
}

function editVolumeInDetails(index, instanceId) {
    const volumes = window[`detailsVolumes_${instanceId}`] || [];
    const volume = volumes[index];
    if (!volume) return;
    
    // Set edit mode flag to prevent auto-refresh
    isInEditMode = true;
    
    // Set editing context
    editingDetailsContext = { type: 'details', instanceId: instanceId, index: index, itemType: 'volume' };
    
    // Populate edit form
    document.getElementById('editVolumeIndex').value = index;
    document.getElementById('editVolumeName').value = volume.name || '';
    document.getElementById('editVolumePath').value = volume.path || '';
    
    const modalElement = document.getElementById('editVolumeModal');
    const modal = new bootstrap.Modal(modalElement);
    
    // Reset edit mode when modal is closed without saving
    modalElement.addEventListener('hidden.bs.modal', function() {
        if (editingDetailsContext && editingDetailsContext.type === 'details' && editingDetailsContext.itemType === 'volume') {
            isInEditMode = false;
            editingDetailsContext = null;
        }
    }, { once: true });
    
    modal.show();
}

function deleteVolumeInDetails(index, instanceId) {
    const volumes = window[`detailsVolumes_${instanceId}`] || [];
    const volume = volumes[index];
    if (!volume) return;
    
    if (confirm('Are you sure you want to delete this volume?')) {
        // Remove from local array and refresh display
        volumes.splice(index, 1);
        window[`detailsVolumes_${instanceId}`] = volumes;
        
        // Save volumes to localStorage using CI name from configuration
        const config = getConfiguration();
        if (config.projectName) {
            const existingData = loadPortsAndVolumesForCINameForDetails(config.projectName);
            volumesData = volumes.map(v => ({ name: v.name, path: v.path }));
            portsData = existingData.ports || [];
            savePortsAndVolumesForCIName(config.projectName);
            
            // Reload from localStorage to ensure consistency
            loadPortsAndVolumesForCIName(config.projectName);
            
            // Update index page tables
            updatePortsTable();
            updateVolumesTable();
        }
        
        // Refresh the display by re-rendering the volumes table
        refreshDetailsVolumesTable(instanceId);
    }
}

// Port CRUD functions for Details Modal
function addPortToDetails(instanceId) {
    // Set edit mode flag to prevent auto-refresh
    isInEditMode = true;
    
    // Set editing context
    editingDetailsContext = { type: 'details', instanceId: instanceId, itemType: 'port' };
    
    // Reset edit form
    document.getElementById('editPortForm').reset();
    document.getElementById('editPortIndex').value = '';
    
    const modalElement = document.getElementById('editPortModal');
    const modal = new bootstrap.Modal(modalElement);
    
    // Reset edit mode when modal is closed without saving
    modalElement.addEventListener('hidden.bs.modal', function() {
        if (editingDetailsContext && editingDetailsContext.type === 'details' && editingDetailsContext.itemType === 'port') {
            isInEditMode = false;
            editingDetailsContext = null;
        }
    }, { once: true });
    
    modal.show();
}

function refreshDetailsVolumesTable(instanceId) {
    let tbody = document.getElementById(`detailsVolumesTableBody_${instanceId}`);
    const volumes = window[`detailsVolumes_${instanceId}`] || [];
    
    // If tbody doesn't exist or is not inside a table, we need to create/fix the table structure
    if (!tbody || !tbody.closest('table')) {
        // Find the volumes section
        const addVolumeBtn = document.getElementById('detailsAddVolumeBtn');
        const volumesContainer = addVolumeBtn?.closest('.col-12');
        
        if (!volumesContainer) {
            console.error('Could not find volumes container');
            return;
        }
        
        // Remove "No volumes found" message if it exists
        const noVolumesMsg = volumesContainer.querySelector('p.text-muted');
        if (noVolumesMsg) {
            noVolumesMsg.remove();
        }
        
        // Remove orphaned tbody if it exists
        if (tbody && !tbody.closest('table')) {
            tbody.remove();
        }
        
        // Create table structure
        const tableHtml = `
            <div class="table-responsive">
                <table class="table table-sm table-bordered">
                    <thead class="table-light">
                        <tr><th>Name</th><th>Path</th><th id="volumesActionsHeader" style="display: none;">Actions</th></tr>
                    </thead>
                    <tbody id="detailsVolumesTableBody_${instanceId}"></tbody>
                </table>
            </div>
        `;
        
        // Insert table after the header row (which contains the Add Volume button)
        const headerRow = volumesContainer.querySelector('.d-flex');
        if (headerRow) {
            headerRow.insertAdjacentHTML('afterend', tableHtml);
        } else {
            volumesContainer.insertAdjacentHTML('beforeend', tableHtml);
        }
        
        // Get the newly created tbody
        tbody = document.getElementById(`detailsVolumesTableBody_${instanceId}`);
    }
    
    if (!tbody) {
        console.error('Could not find or create volumes table body');
        return;
    }
    
    // Get instance state from currentEditingInstance
    const canEditVolumesRefresh = currentEditingInstance && currentEditingInstance.id === instanceId 
        ? (currentEditingInstance.lifecycleState !== 'UPDATING' && currentEditingInstance.lifecycleState !== 'CREATING' && currentEditingInstance.lifecycleState !== 'DELETING')
        : true; // Default to true if we can't determine state
    
    if (volumes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No volumes</td></tr>';
        return;
    }
    
    // Actions column visibility controlled by edit mode
    const actionsDisplay = isInEditMode ? 'table-cell' : 'none';
    
    // Show/hide Actions column header
    const actionsHeader = document.getElementById('volumesActionsHeader');
    if (actionsHeader) {
        actionsHeader.style.display = actionsDisplay;
    }
    
    tbody.innerHTML = volumes.map((volume, idx) => {
        return `
            <tr>
                <td>${volume.name || '-'}</td>
                <td><code>${volume.path || 'N/A'}</code></td>
                <td id="volumeActions_${idx}" style="display: ${actionsDisplay};">
                    <button class="btn btn-success btn-sm me-1" onclick="editVolumeInDetails(${idx}, '${instanceId}')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="deleteVolumeInDetails(${idx}, '${instanceId}')"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

// Save CI changes by deleting old CI and creating new one with same name
async function saveCIChanges(instanceId) {
    if (!currentEditingInstance || currentEditingInstance.id !== instanceId) {
        showNotification('Error: Instance data not available', 'error');
        return;
    }
    
    // Confirm with user that delete/create will happen
    if (!confirm('Warning: This will delete the current container instance and create a new one with the same name. All changes will be saved. Continue?')) {
        return;
    }
    
    try {
        // Get updated containers and volumes
        const containers = window[`detailsContainers_${instanceId}`] || [];
        const volumes = window[`detailsVolumes_${instanceId}`] || [];
        const ports = window[`detailsPorts_${instanceId}`] || [];
        
        if (containers.length === 0) {
            showNotification('Error: At least one container is required', 'error');
            return;
        }
        
        // Build containers payload (similar to confirmCreateContainerInstance)
        const cleanedContainers = containers.map(container => {
            const cleaned = {
                displayName: container.displayName,
                imageUrl: container.imageUrl,
                resourceConfig: {
                    memoryInGBs: parseFloat(container.resourceConfig?.memoryInGBs) || 1,
                    vcpus: parseFloat(container.resourceConfig?.vcpus) || 1
                }
            };
            
            if (container.environmentVariables && typeof container.environmentVariables === 'object' && Object.keys(container.environmentVariables).length > 0) {
                cleaned.environmentVariables = container.environmentVariables;
            }
            if (container.arguments && Array.isArray(container.arguments) && container.arguments.length > 0) {
                cleaned.arguments = container.arguments;
            }
            if (container.command && Array.isArray(container.command) && container.command.length > 0) {
                cleaned.command = container.command;
            }
            
            return cleaned;
        });
        
        // Build volumes payload
        const volumesPayload = volumes.map((v, idx) => ({
            name: v.name || `volume-${idx}`,
            volumeType: 'EMPTYDIR',
            backingStore: 'EPHEMERAL_STORAGE'
        }));
        
        // Map volumes to containers
        if (volumesPayload.length > 0) {
            cleanedContainers.forEach(container => {
                container.volumeMounts = volumesPayload.map((v, idx) => ({
                    mountPath: volumes[idx].path,
                    volumeName: v.name
                }));
            });
        }
        
        // Build freeformTags (volumes and ports)
        const baseFreeformTags = {};
        if (volumes.length > 0) {
            const volumesTag = volumes.map((v, idx) => {
                const volumeName = v.name || `volume-${idx}`;
                return `${volumeName}:${v.path}`;
            }).join(',');
            baseFreeformTags.volumes = volumesTag;
        }
        
        // Add port mappings - use port string directly if available
        containers.forEach((container) => {
            if (container.port) {
                baseFreeformTags[container.displayName] = container.port;
            }
        });
        
        // Get shape config from dropdowns if in edit mode, otherwise use current values
        let shapeConfig = currentEditingInstance.shapeConfig || { memoryInGBs: 16, ocpus: 1 };
        const memorySelect = document.getElementById('detailsShapeMemory');
        const ocpusSelect = document.getElementById('detailsShapeOcpus');
        if (memorySelect && ocpusSelect && isInEditMode) {
            shapeConfig = {
                memoryInGBs: parseFloat(memorySelect.value) || shapeConfig.memoryInGBs,
                ocpus: parseFloat(ocpusSelect.value) || shapeConfig.ocpus
            };
        }
        
        const payload = {
            displayName: currentEditingInstance.displayName,
            compartmentId: currentEditingInstance.compartmentId,
            shape: currentEditingInstance.shape,
            shapeConfig: shapeConfig,
            subnetId: (() => {
                const subnetSelect = document.getElementById('detailsSubnetId');
                return subnetSelect && subnetSelect.value ? subnetSelect.value : currentEditingInstance.subnetId;
            })(),
            containers: cleanedContainers,
            containerRestartPolicy: currentEditingInstance.containerRestartPolicy || 'NEVER',
            volumes: volumesPayload,
            freeformTags: Object.keys(baseFreeformTags).length > 0 ? baseFreeformTags : undefined
        };
        
        // Step 1: Delete the old container instance
        showNotification('Deleting old container instance...', 'info');
        const deleteResponse = await fetch(`/api/oci/container-instances/${instanceId}`, {
            method: 'DELETE'
        });
        
        const deleteData = await deleteResponse.json();
        if (!deleteData.success) {
            throw new Error(deleteData.error || 'Failed to delete container instance');
        }
        
        // Wait a bit for deletion to process
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Step 2: Create new container instance with same name
        showNotification('Creating new container instance...', 'info');
        const createResponse = await fetch('/api/oci/container-instances', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const createData = await createResponse.json();
        
        if (createData.success) {
            // Close the details modal
            const detailsModal = bootstrap.Modal.getInstance(document.getElementById('containerInstanceModal'));
            if (detailsModal) {
                detailsModal.hide();
            }
            
            showNotification('Container instance updated successfully!', 'success');
            
            // Exit edit mode
            exitEditMode();
            
            // Reload container instances
            await loadContainerInstances();
        } else {
            throw new Error(createData.error || 'Failed to create new container instance');
        }
    } catch (error) {
        console.error('Error saving CI changes:', error);
        showNotification(`Error saving changes: ${error.message}`, 'error');
        // Exit edit mode on error too
        exitEditMode();
    }
}

// Exit edit mode - hide CRUD buttons
function exitEditMode() {
    isInEditMode = false;
    
    // Dismiss warning notification if it exists
    if (warningNotificationElement) {
        warningNotificationElement.remove();
        warningNotificationElement = null;
    }
    
    // Hide Add buttons
    const addContainerBtn = document.getElementById('detailsAddContainerBtn');
    if (addContainerBtn) addContainerBtn.style.display = 'none';
    
    const addSidecarBtn = document.getElementById('detailsAddSidecarBtn');
    if (addSidecarBtn) addSidecarBtn.style.display = 'none';
    
    const addVolumeBtn = document.getElementById('detailsAddVolumeBtn');
    if (addVolumeBtn) addVolumeBtn.style.display = 'none';
    
    // Hide all container action buttons
    const containerActions = document.querySelectorAll('[id^="containerActions_"]');
    containerActions.forEach(el => el.style.display = 'none');
    
    // Hide all volume action buttons
    const volumeActions = document.querySelectorAll('[id^="volumeActions_"]');
    volumeActions.forEach(el => el.style.display = 'none');
    
    // Refresh containers table to show log column and hide action buttons
    if (currentEditingInstance && currentEditingInstance.id) {
        refreshDetailsContainersTable(currentEditingInstance.id);
    }
    
    // Show Edit, Restart, Delete, and Close buttons; hide Save and Cancel buttons
    const editBtn = document.getElementById('detailsEditBtn');
    if (editBtn) editBtn.style.display = 'inline-block';
    
    const restartBtn = document.getElementById('detailsRestartBtn');
    if (restartBtn) restartBtn.style.display = 'inline-block';
    
    const deleteBtn = document.getElementById('detailsDeleteBtn');
    if (deleteBtn) deleteBtn.style.display = 'inline-block';
    
    const closeBtn = document.getElementById('detailsCloseBtn');
    if (closeBtn) closeBtn.style.display = 'inline-block';
    
    const saveBtn = document.getElementById('detailsSaveBtn');
    if (saveBtn) saveBtn.style.display = 'none';
    
    const cancelBtn = document.getElementById('detailsCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';
    
    // Hide editable dropdowns for Memory and OCPUs, show read-only text
    const memoryDisplay = document.getElementById('detailsMemoryDisplay');
    const memorySelect = document.getElementById('detailsShapeMemory');
    if (memoryDisplay) memoryDisplay.style.display = 'inline';
    if (memorySelect) memorySelect.style.display = 'none';
    
    const ocpusDisplay = document.getElementById('detailsOcpusDisplay');
    const ocpusSelect = document.getElementById('detailsShapeOcpus');
    if (ocpusDisplay) ocpusDisplay.style.display = 'inline';
    if (ocpusSelect) ocpusSelect.style.display = 'none';
    
    // Hide subnet dropdown and show display
    const subnetDisplay = document.getElementById('detailsSubnetDisplay');
    const subnetSelect = document.getElementById('detailsSubnetId');
    if (subnetDisplay && subnetSelect) {
        subnetDisplay.style.display = 'inline';
        subnetSelect.style.display = 'none';
    }
    
    // Restart the modal refresh interval if modal is still open
    const modalElement = document.getElementById('containerInstanceModal');
    if (modalElement && modalElement.classList.contains('show') && currentEditingInstance && currentEditingInstance.id) {
        const instanceId = currentEditingInstance.id;
        currentModalInstanceId = instanceId;
        
        // Set up interval to refresh modal content every 5 seconds while modal is open
        const modalRefreshInterval = setInterval(async () => {
            const modalInstance = bootstrap.Modal.getInstance(modalElement);
            // Only refresh if modal is still open, viewing the same instance, and not in edit mode
            if (modalInstance && modalElement.classList.contains('show') && currentModalInstanceId === instanceId && !isInEditMode) {
                await refreshContainerInstanceModal(instanceId);
            } else {
                // Modal closed, clear interval
                clearInterval(modalRefreshInterval);
                currentModalInstanceId = null;
            }
        }, 5000);
        
        // Store interval ID so we can clear it when modal closes
        modalElement.setAttribute('data-refresh-interval-id', modalRefreshInterval);
        
        // Reload the modal content to get fresh data
        // Wait a bit to ensure state has updated on the server
        setTimeout(async () => {
            await refreshContainerInstanceModal(instanceId);
        }, 1000);
    }
}

// Close details modal
function closeDetailsModal() {
    const modalElement = document.getElementById('containerInstanceModal');
    if (modalElement) {
        const modal = bootstrap.Modal.getInstance(modalElement);
        if (modal) {
            modal.hide();
        }
    }
}

// Restart container instance
async function restartContainerInstance(instanceId) {
    try {
        showNotification('Restarting container instance...', 'info');
        
        const response = await fetch(`/api/oci/container-instances/${instanceId}/restart`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Container instance restart initiated successfully!', 'success');
            // Reload container instances to reflect the new state
            await loadContainerInstances();
            
            // Refresh modal if it's still open and showing this instance, and not in edit mode
            const modalElement = document.getElementById('containerInstanceModal');
            if (modalElement && modalElement.classList.contains('show') && currentModalInstanceId === instanceId && !isInEditMode) {
                // Wait a bit for the state to update on the server, then refresh
                setTimeout(async () => {
                    await refreshContainerInstanceModal(instanceId);
                }, 2000);
            }
        } else {
            throw new Error(data.error || 'Failed to restart container instance');
        }
    } catch (error) {
        console.error('Error restarting container instance:', error);
        showNotification(`Error restarting container instance: ${error.message}`, 'error');
    }
}

// Delete container instance
async function deleteContainerInstance(instanceId) {
    if (!confirm('Are you sure you want to delete this container instance?')) {
        return;
    }
    
    try {
        showNotification('Deleting container instance...', 'info');
        
        const response = await fetch(`/api/oci/container-instances/${instanceId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Container instance deletion initiated successfully!', 'success');
            
            // Close the details modal
            const modalElement = document.getElementById('containerInstanceModal');
            if (modalElement) {
                const modal = bootstrap.Modal.getInstance(modalElement);
                if (modal) {
                    modal.hide();
                }
            }
            
            // Reload container instances
            await loadContainerInstances();
        } else {
            throw new Error(data.error || 'Failed to delete container instance');
        }
    } catch (error) {
        console.error('Error deleting container instance:', error);
        showNotification(`Error deleting container instance: ${error.message}`, 'error');
    }
}

function getStateColor(state) {
    if (!state) return 'secondary';
    const stateLower = state.toLowerCase();
    if (stateLower === 'active' || stateLower === 'running') return 'success';
    if (stateLower === 'creating' || stateLower === 'updating' || stateLower === 'inactive') return 'warning';
    if (stateLower === 'stopped' || stateLower === 'stopping') return 'info';
    if (stateLower === 'failed' || stateLower === 'deleting') return 'danger';
    if (stateLower === 'deleted') return 'secondary';
    return 'secondary';
}

// Check if state should show a spinner
function shouldShowSpinner(state) {
    if (!state) return false;
    const stateLower = state.toLowerCase();
    return stateLower === 'creating' || stateLower === 'updating' || stateLower === 'deleting';
}

// Get state badge HTML with optional spinner
function getStateBadgeHtml(state) {
    const stateLower = (state || '').toLowerCase();
    const spinnerHtml = shouldShowSpinner(state) 
        ? '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>'
        : '';
    return `<span class="badge bg-${getStateColor(state)}">${spinnerHtml}${state || 'N/A'}</span>`;
}


// Predefined sidecars
const sidecars = [
    {
        id: '1',
        name: 'OsReader',
        image: 'mikarinneoracle/ci-sidecar-os:0.1.0',
        port: '',
        volumes: [{ name: 'data' }],
        envs: [
            { var: 'data_path', value: '/data' },
            { var: 'os_bucket', value: '***put here your OS bucket name****' },
            { var: 'reload_delay', value: '30000' }
        ],
        mem: '1',
        ocpu: '1'
    },
    {
        id: '2',
        name: 'VaultReader',
        image: 'mikarinneoracle/ci-sidecar-vault:0.1.0',
        port: '',
        volumes: [{ name: 'db-config' }],
        envs: [
            { var: 'secrets_file', value: '/secrets/connection.txt' },
            { var: 'secret_ocid', value: '***put here secrets OCID***' }
        ],
        mem: '1',
        ocpu: '1'
    },
    {
        id: '3',
        name: 'LogWriter',
        image: 'mikarinneoracle/ci-sidecar-log:0.1.0',
        port: '',
        volumes: [{ name: 'logs' }],
        envs: [
            { var: 'log_file', value: '/var/log/app.log' },
            { var: 'log_ocid', value: '***put here log OCID***' },
            { var: 'log_header', value: '***logs header***' }
        ],
        mem: '1',
        ocpu: '1'
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
    // Reset form and containers
    containersData = [];
    document.getElementById('createContainerInstanceForm').reset();
    
    // Load ports and volumes for the current CI name (projectName) from localStorage
    const config = getConfiguration();
    loadPortsAndVolumesForCIName(config.projectName);
    
    // Set default CI name: projectName (count + 1)
    const defaultName = config.projectName ? `${config.projectName} ${containerInstancesCount + 1}` : '';
    document.getElementById('ciName').value = defaultName;
    
    // Set default shape config: CI.Standard.E4.Flex (readonly), memory 16GB, ocpus 1
    document.getElementById('ciShape').value = 'CI.Standard.E4.Flex';
    document.getElementById('ciShapeMemory').value = '16';
    document.getElementById('ciShapeOcpus').value = '1';
    
    // Load compartment name
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
    } catch (error) {
        console.error('Error loading compartment name:', error);
    }
    
    // Load subnets dropdown
    await loadSubnetsForCI(config.compartmentId);
    
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

// Update port dropdown in container edit modal
function updateContainerPortDropdown() {
    const portSelect = document.getElementById('editContainerPort');
    if (!portSelect) return;
    
    // Clear existing options except "No port"
    portSelect.innerHTML = '<option value="">No port</option>';
    
    // Determine which ports to use based on context
    let portsToUse = portsData;
    
    // If we're in CI edit mode (details context), use details ports
    if (editingDetailsContext && editingDetailsContext.type === 'details') {
        const instanceId = editingDetailsContext.instanceId || currentEditingInstance?.id;
        if (instanceId) {
            const detailsPorts = window[`detailsPorts_${instanceId}`] || [];
            // Also load from localStorage for this CI name
            const config = getConfiguration();
            if (config.projectName) {
                const existingData = loadPortsAndVolumesForCINameForDetails(config.projectName);
                const localStoragePorts = existingData.ports || [];
                // Merge: use detailsPorts from tags, but also include localStorage ports that don't exist
                const mergedPorts = [...detailsPorts];
                localStoragePorts.forEach(localPort => {
                    const portNum = typeof localPort.port === 'number' ? localPort.port : parseInt(localPort.port);
                    const exists = mergedPorts.some(p => {
                        const pPortNum = typeof p.port === 'number' ? p.port : parseInt(p.port);
                        return pPortNum === portNum;
                    });
                    if (!exists) {
                        mergedPorts.push({
                            port: portNum,
                            name: localPort.name || null
                        });
                    }
                });
                portsToUse = mergedPorts;
            } else {
                portsToUse = detailsPorts;
            }
        }
    }
    
    // Add options for each port
    portsToUse.forEach((port, index) => {
        const option = document.createElement('option');
        option.value = index.toString();
        const portNum = typeof port.port === 'number' ? port.port : parseInt(port.port);
        const displayText = port.name ? `${port.name} (${portNum})` : `Port ${portNum}`;
        option.textContent = displayText;
        portSelect.appendChild(option);
    });
}

// Container CRUD functions
function addContainerToTable() {
    // Reset edit form
    document.getElementById('editContainerForm').reset();
    document.getElementById('editContainerIndex').value = '';
    
    // Update port dropdown
    updateContainerPortDropdown();
    
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
    const modalElement = document.getElementById('editContainerModal');
    const modal = new bootstrap.Modal(modalElement);
    
    // Reset edit mode when modal is closed without saving
    modalElement.addEventListener('hidden.bs.modal', function() {
        if (editingDetailsContext && editingDetailsContext.type === 'details') {
            isInEditMode = false;
            editingDetailsContext = null;
        }
    }, { once: true });
    
    modal.show();
}

function editContainer(index) {
    const container = containersData[index];
    
    document.getElementById('editContainerIndex').value = index;
    document.getElementById('editContainerName').value = container.displayName || '';
    document.getElementById('editContainerImage').value = container.imageUrl || '';
    document.getElementById('editContainerMemory').value = container.resourceConfig?.memoryInGBs || '';
    document.getElementById('editContainerVcpus').value = container.resourceConfig?.vcpus || '';
    
    // Update port dropdown
    updateContainerPortDropdown();
    
    // Set selected port if container has one
    if (container.portIndex !== undefined && container.portIndex !== null && container.portIndex !== '') {
        document.getElementById('editContainerPort').value = container.portIndex.toString();
    } else {
        document.getElementById('editContainerPort').value = '';
    }
    
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
    
    const modalElement = document.getElementById('editContainerModal');
    const modal = new bootstrap.Modal(modalElement);
    
    // Reset edit mode when modal is closed without saving
    modalElement.addEventListener('hidden.bs.modal', function() {
        if (editingDetailsContext && editingDetailsContext.type === 'details') {
            isInEditMode = false;
            editingDetailsContext = null;
        }
    }, { once: true });
    
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
    
    // Store selected port index
    const portIndex = document.getElementById('editContainerPort').value;
    if (portIndex && portIndex !== '') {
        container.portIndex = parseInt(portIndex);
    }
    
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
    
    // Check if we're editing in details modal context
    if (editingDetailsContext && editingDetailsContext.type === 'details') {
        const instanceId = editingDetailsContext.instanceId;
        const containers = window[`detailsContainers_${instanceId}`] || [];
        
        // Add port info from details ports - use portIndex if set, otherwise keep existing port
        if (container.portIndex !== undefined && container.portIndex !== null && container.portIndex !== '') {
            const detailsPorts = window[`detailsPorts_${instanceId}`] || [];
            if (detailsPorts[container.portIndex]) {
                container.port = detailsPorts[container.portIndex].port.toString();
            } else {
                // If portIndex doesn't match, clear port
                container.port = null;
            }
        } else {
            // If no portIndex selected, clear port
            container.port = null;
        }
        
        // Preserve lifecycleState
        if (index !== '' && index !== null && containers[parseInt(index)]) {
            container.lifecycleState = containers[parseInt(index)].lifecycleState;
        }
        
        if (index === '' || index === null) {
            // Add new container
            containers.push(container);
        } else {
            // Update existing container
            containers[parseInt(index)] = container;
        }
        
        window[`detailsContainers_${instanceId}`] = containers;
        refreshDetailsContainersTable(instanceId);
        editingDetailsContext = null;
        // Don't reset isInEditMode - we're still in edit mode after saving a container
        // Ensure buttons are still visible after refresh
        // Use setTimeout to ensure the table has been fully rendered
        if (isInEditMode) {
            setTimeout(() => {
                const updatedContainers = window[`detailsContainers_${instanceId}`] || [];
                updatedContainers.forEach((container, idx) => {
                    const actionsCell = document.getElementById(`containerActions_${idx}`);
                    if (actionsCell) {
                        actionsCell.style.display = 'table-cell';
                    }
                });
            }, 50);
        }
    } else {
        // Normal creation flow
        if (index === '' || index === null) {
            // Add new container
            containersData.push(container);
        } else {
            // Update existing container
            containersData[parseInt(index)] = container;
        }
        
        updateContainersTable();
    }
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('editContainerModal'));
    modal.hide();
}

function updateContainersTable() {
    const tbody = document.getElementById('containersTableBody');
    
    if (containersData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No containers added yet. Click "Add Container" to add one.</td></tr>';
        return;
    }
    
    tbody.innerHTML = containersData.map((container, index) => {
        const memory = container.resourceConfig?.memoryInGBs || 'N/A';
        const vcpus = container.resourceConfig?.vcpus || 'N/A';
        
        // Get port display text
        let portDisplay = '-';
        if (container.portIndex !== undefined && container.portIndex !== null && container.portIndex !== '') {
            const portIndex = parseInt(container.portIndex);
            if (portsData[portIndex]) {
                const port = portsData[portIndex];
                portDisplay = port.name ? `${port.name} (${port.port})` : `Port ${port.port}`;
            }
        }
        
        return `
            <tr>
                <td>${container.displayName || 'N/A'}</td>
                <td><code>${container.imageUrl || 'N/A'}</code></td>
                <td>${memory}</td>
                <td>${vcpus}</td>
                <td>${portDisplay}</td>
                <td>
                    <button type="button" class="btn btn-info btn-sm me-1" onclick="editContainer(${index})"><i class="bi bi-pencil"></i></button>
                    <button type="button" class="btn btn-danger btn-sm" onclick="deleteContainer(${index})"><i class="bi bi-trash"></i></button>
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
    
    // Check if we're in details edit mode
    if (editingDetailsContext && editingDetailsContext.type === 'details' && editingDetailsContext.itemType === 'sidecar') {
        addSidecarToDetails(index);
        return;
    }
    
    // Convert envs array to object format
    const environmentVariables = {};
    if (Array.isArray(sidecar.envs)) {
        sidecar.envs.forEach(env => {
            if (env.var && env.value !== undefined) {
                environmentVariables[env.var] = env.value;
            }
        });
    }
    
    const container = {
        displayName: sidecar.name,
        imageUrl: sidecar.image,
        resourceConfig: {
            memoryInGBs: parseFloat(sidecar.mem),
            vcpus: parseFloat(sidecar.ocpu)
        },
        environmentVariables: environmentVariables
    };
    
    containersData.push(container);
    updateContainersTable();
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('addSidecarModal'));
    modal.hide();
}

// Show sidecar modal for details edit mode
function showAddSidecarModalToDetails() {
    // Store context that we're adding to details
    editingDetailsContext = { type: 'details', instanceId: currentEditingInstance?.id, itemType: 'sidecar' };
    const modal = new bootstrap.Modal(document.getElementById('addSidecarModal'));
    modal.show();
}

// Add sidecar to details (edit mode)
function addSidecarToDetails(index) {
    const sidecar = sidecars[index];
    if (!sidecar) return;
    
    if (!editingDetailsContext || editingDetailsContext.type !== 'details' || editingDetailsContext.itemType !== 'sidecar') {
        // Fallback to normal creation flow
        addSidecar(index);
        return;
    }
    
    const instanceId = editingDetailsContext.instanceId;
    if (!instanceId) return;
    
    // Convert envs array to object format
    const environmentVariables = {};
    if (Array.isArray(sidecar.envs)) {
        sidecar.envs.forEach(env => {
            if (env.var && env.value !== undefined) {
                environmentVariables[env.var] = env.value;
            }
        });
    }
    
    const container = {
        displayName: sidecar.name,
        imageUrl: sidecar.image,
        resourceConfig: {
            memoryInGBs: parseFloat(sidecar.mem),
            vcpus: parseFloat(sidecar.ocpu)
        },
        environmentVariables: environmentVariables,
        lifecycleState: 'ACTIVE'
    };
    
    const containers = window[`detailsContainers_${instanceId}`] || [];
    containers.push(container);
    window[`detailsContainers_${instanceId}`] = containers;
    
    refreshDetailsContainersTable(instanceId);
    
    // Show action buttons for all containers (including the newly added one) if in edit mode
    // Use setTimeout to ensure the table has been fully rendered
    if (isInEditMode) {
        setTimeout(() => {
            const updatedContainers = window[`detailsContainers_${instanceId}`] || [];
            updatedContainers.forEach((container, idx) => {
                const actionsCell = document.getElementById(`containerActions_${idx}`);
                if (actionsCell) {
                    actionsCell.style.display = 'table-cell';
                }
            });
        }, 50);
    }
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('addSidecarModal'));
    modal.hide();
    
    editingDetailsContext = null;
    // Don't reset isInEditMode - we're still in edit mode
}

// Volume CRUD functions
function addVolumeToTable() {
    document.getElementById('editVolumeForm').reset();
    document.getElementById('editVolumeIndex').value = '';
    
    const modalElement = document.getElementById('editVolumeModal');
    const modal = new bootstrap.Modal(modalElement);
    
    // Reset edit mode when modal is closed without saving
    modalElement.addEventListener('hidden.bs.modal', function() {
        if (editingDetailsContext && editingDetailsContext.type === 'details' && editingDetailsContext.itemType === 'volume') {
            isInEditMode = false;
            editingDetailsContext = null;
        }
    }, { once: true });
    
    modal.show();
}

function editVolume(index) {
    const volume = volumesData[index];
    
    document.getElementById('editVolumeIndex').value = index;
    document.getElementById('editVolumeName').value = volume.name || '';
    document.getElementById('editVolumePath').value = volume.path || '';
    
    const modalElement = document.getElementById('editVolumeModal');
    const modal = new bootstrap.Modal(modalElement);
    
    // Reset edit mode when modal is closed without saving
    modalElement.addEventListener('hidden.bs.modal', function() {
        if (editingDetailsContext && editingDetailsContext.type === 'details' && editingDetailsContext.itemType === 'volume') {
            isInEditMode = false;
            editingDetailsContext = null;
        }
    }, { once: true });
    
    modal.show();
}

function deleteVolume(index) {
    if (confirm('Are you sure you want to delete this volume?')) {
        volumesData.splice(index, 1);
        
        // Save volumes to localStorage for current CI name
        const config = getConfiguration();
        savePortsAndVolumesForCIName(config.projectName);
        
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
    
    // Check if we're editing in details modal context
    if (editingDetailsContext && editingDetailsContext.type === 'details' && editingDetailsContext.itemType === 'volume') {
        const instanceId = editingDetailsContext.instanceId;
        const volumes = window[`detailsVolumes_${instanceId}`] || [];
        
        if (index === '' || index === null) {
            volumes.push(volume);
        } else {
            volumes[parseInt(index)] = volume;
        }
        
        window[`detailsVolumes_${instanceId}`] = volumes;
        refreshDetailsVolumesTable(instanceId);
        
        // Ensure buttons are visible after refresh if in edit mode
        if (isInEditMode) {
            volumes.forEach((volume, idx) => {
                const actionsCell = document.getElementById(`volumeActions_${idx}`);
                if (actionsCell) actionsCell.style.display = 'table-cell';
            });
        }
        
        // Save volumes to localStorage using CI name from configuration
        const config = getConfiguration();
        if (config.projectName) {
            const existingData = loadPortsAndVolumesForCINameForDetails(config.projectName);
            volumesData = volumes.map(v => ({ name: v.name, path: v.path }));
            portsData = existingData.ports || [];
            savePortsAndVolumesForCIName(config.projectName);
            
            // Reload from localStorage to ensure consistency
            loadPortsAndVolumesForCIName(config.projectName);
            
            // Update index page tables
            updatePortsTable();
            updateVolumesTable();
        }
        
        editingDetailsContext = null;
        // Don't set isInEditMode = false here, we're still in edit mode
    } else {
        // Normal creation flow
        if (index === '' || index === null) {
            volumesData.push(volume);
        } else {
            volumesData[parseInt(index)] = volume;
        }
        
        // Save volumes to localStorage for current CI name
        const config = getConfiguration();
        savePortsAndVolumesForCIName(config.projectName);
        
        updateVolumesTable();
    }
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('editVolumeModal'));
    modal.hide();
}

function updateVolumesTable() {
    // Update index page volumes table
    const tbody = document.getElementById('volumesTableBody');
    if (tbody) {
        if (volumesData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted">No volumes added yet. Click "Add Volume" to add one.</td></tr>';
        } else {
            // Dispose of existing tooltips before updating
            const existingTooltips = tbody.querySelectorAll('[data-bs-toggle="tooltip"]');
            existingTooltips.forEach(el => {
                const tooltipInstance = bootstrap.Tooltip.getInstance(el);
                if (tooltipInstance) {
                    tooltipInstance.dispose();
                }
            });
            
            tbody.innerHTML = volumesData.map((volume, index) => {
                const path = volume.path || 'N/A';
                const escapedPath = escapeHtml(path);
                // If name is empty, show path instead; otherwise show name
                const displayText = volume.name && volume.name.trim() ? volume.name : path;
                
                return `
                    <tr>
                        <td>
                            <span 
                                data-bs-toggle="tooltip" 
                                data-bs-placement="top" 
                                data-bs-title="${escapedPath}"
                                style="cursor: help;"
                            >${escapeHtml(displayText)}</span>
                        </td>
                        <td>
                            <button type="button" class="btn btn-success btn-sm me-1" onclick="editVolume(${index})"><i class="bi bi-pencil"></i></button>
                            <button type="button" class="btn btn-danger btn-sm" onclick="deleteVolume(${index})"><i class="bi bi-trash"></i></button>
                        </td>
                    </tr>
                `;
            }).join('');
            
            // Initialize Bootstrap tooltips for the volume paths
            const tooltipTriggerList = tbody.querySelectorAll('[data-bs-toggle="tooltip"]');
            const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
        }
    }
    
    // Update create modal volumes table
    const createTbody = document.getElementById('createVolumesTableBody');
    if (createTbody) {
        if (volumesData.length === 0) {
            createTbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No volumes added yet. Click "Add Volume" to add one.</td></tr>';
        } else {
            createTbody.innerHTML = volumesData.map((volume, index) => {
                return `
                    <tr>
                        <td>${escapeHtml(volume.name || '-')}</td>
                        <td><code>${escapeHtml(volume.path || 'N/A')}</code></td>
                        <td>
                            <button type="button" class="btn btn-success btn-sm me-1" onclick="editVolume(${index})"><i class="bi bi-pencil"></i></button>
                            <button type="button" class="btn btn-danger btn-sm" onclick="deleteVolume(${index})"><i class="bi bi-trash"></i></button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }
}

// Port CRUD functions
// Show Add Port modal from container edit - handles both CI create and CI edit contexts
function showAddPortFromContainerEdit() {
    // Check if we're in CI edit mode (details context)
    if (editingDetailsContext && editingDetailsContext.type === 'details') {
        const instanceId = editingDetailsContext.instanceId || currentEditingInstance?.id;
        if (instanceId) {
            addPortToDetails(instanceId);
            return;
        }
    }
    
    // Otherwise, use normal create flow
    addPortToTable();
}

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
        
        // Save ports to localStorage for current CI name
        const config = getConfiguration();
        savePortsAndVolumesForCIName(config.projectName);
        
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
    
    // Check if we're editing in details modal context
    if (editingDetailsContext && editingDetailsContext.type === 'details' && editingDetailsContext.itemType === 'port') {
        const instanceId = editingDetailsContext.instanceId;
        const ports = window[`detailsPorts_${instanceId}`] || [];
        
        if (index === '' || index === null) {
            ports.push(port);
        } else {
            ports[parseInt(index)] = port;
        }
        
        window[`detailsPorts_${instanceId}`] = ports;
        
        // Save ports to localStorage using CI name from configuration
        const config = getConfiguration();
        if (config.projectName) {
            const existingData = loadPortsAndVolumesForCINameForDetails(config.projectName);
            volumesData = existingData.volumes || [];
            // Ensure ports have proper structure for localStorage
            portsData = ports.map(p => {
                const portObj = {
                    port: typeof p.port === 'number' ? p.port : parseInt(p.port)
                };
                if (p.name && p.name.trim()) {
                    portObj.name = p.name.trim();
                }
                return portObj;
            });
            savePortsAndVolumesForCIName(config.projectName);
            
            // Reload from localStorage to ensure consistency
            loadPortsAndVolumesForCIName(config.projectName);
            
            // Update index page tables
            updatePortsTable();
            updateVolumesTable();
        }
        
        // Update port dropdown in container edit modal if it's open
        updateContainerPortDropdown();
        
        editingDetailsContext = null;
        // Don't set isInEditMode = false here, we're still in edit mode
    } else {
        // Normal creation flow
        if (index === '' || index === null) {
            portsData.push(port);
        } else {
            portsData[parseInt(index)] = port;
        }
        
        // Save ports to localStorage for current CI name
        const config = getConfiguration();
        savePortsAndVolumesForCIName(config.projectName);
        
        updatePortsTable();
        
        // Update port dropdown in container edit modal if it's open
        updateContainerPortDropdown();
    }
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('editPortModal'));
    modal.hide();
}

function updatePortsTable() {
    const tbody = document.getElementById('portsTableBody');
    
    if (portsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted">No ports added yet. Click "Add Port" to add one.</td></tr>';
        return;
    }
    
    tbody.innerHTML = portsData.map((port, index) => {
        // Show "name(port)" if name exists, otherwise just show port
        const portNumber = port.port || 'N/A';
        const displayText = port.name && port.name.trim() 
            ? `${escapeHtml(port.name)} (${portNumber})` 
            : portNumber;
        
        return `
            <tr>
                <td>${displayText}</td>
                <td>
                    <button type="button" class="btn btn-warning btn-sm me-1" onclick="editPort(${index})"><i class="bi bi-pencil"></i></button>
                    <button type="button" class="btn btn-danger btn-sm" onclick="deletePort(${index})"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Update port dropdown in container edit modal if it's open
    updateContainerPortDropdown();
}

// Show CI summary modal
function showCISummaryModal() {
    const form = document.getElementById('createContainerInstanceForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    if (containersData.length === 0) {
        showNotification('Please add at least one container before creating the container instance.', 'error');
        return;
    }
    
    const config = getConfiguration();
    const ciName = document.getElementById('ciName').value.trim();
    const ciShape = document.getElementById('ciShape').value;
    const ciShapeMemory = document.getElementById('ciShapeMemory').value;
    const ciShapeOcpus = document.getElementById('ciShapeOcpus').value;
    const compartmentName = document.getElementById('ciCompartmentName').value;
    const subnetId = document.getElementById('ciSubnetId').value;
    if (!subnetId) {
        showNotification('Please select a subnet', 'error');
        return;
    }
    
    // Get subnet name for display
    const subnetSelect = document.getElementById('ciSubnetId');
    const subnetName = subnetSelect.options[subnetSelect.selectedIndex].text;
    
    // Build summary HTML
    let html = '<div class="row mb-4">';
    
    // Basic Information
    html += '<div class="col-md-6">';
    html += '<h5 class="border-bottom pb-2 mb-3">Basic Information</h5>';
    html += '<dl class="row">';
    html += `<dt class="col-sm-4">Name:</dt><dd class="col-sm-8"><strong>${ciName}</strong></dd>`;
    html += `<dt class="col-sm-4">Shape:</dt><dd class="col-sm-8">${ciShape}</dd>`;
    html += `<dt class="col-sm-4">Shape Memory:</dt><dd class="col-sm-8">${ciShapeMemory} GB</dd>`;
    html += `<dt class="col-sm-4">Shape OCPUs:</dt><dd class="col-sm-8">${ciShapeOcpus}</dd>`;
    html += `<dt class="col-sm-4">Compartment:</dt><dd class="col-sm-8">${compartmentName}</dd>`;
    html += `<dt class="col-sm-4">Subnet:</dt><dd class="col-sm-8">${subnetName}</dd>`;
    html += '</dl>';
    html += '</div>';
    
    html += '</div>';
    
    // Containers with Ports
    html += '<div class="row mb-4">';
    html += '<div class="col-12">';
    html += '<h5 class="border-bottom pb-2 mb-3">Containers</h5>';
    html += '<div class="table-responsive"><table class="table table-sm table-bordered">';
    html += '<thead class="table-light"><tr><th>Name</th><th>Image</th><th>Memory (GB)</th><th>VCPUs</th><th>Port</th></tr></thead>';
    html += '<tbody>';
    
    containersData.forEach(container => {
        const memory = container.resourceConfig?.memoryInGBs || 'N/A';
        const vcpus = container.resourceConfig?.vcpus || 'N/A';
        
        // Get port display text
        let portDisplay = '-';
        if (container.portIndex !== undefined && container.portIndex !== null && container.portIndex !== '') {
            const portIndex = parseInt(container.portIndex);
            if (portsData[portIndex]) {
                const port = portsData[portIndex];
                portDisplay = port.name ? `${port.name} (${port.port})` : `Port ${port.port}`;
            }
        }
        
        html += `<tr>`;
        html += `<td><strong>${container.displayName || 'N/A'}</strong></td>`;
        html += `<td><code>${container.imageUrl || 'N/A'}</code></td>`;
        html += `<td>${memory}</td>`;
        html += `<td>${vcpus}</td>`;
        html += `<td>${portDisplay}</td>`;
        html += `</tr>`;
        
        // Show environment variables, command, and arguments if not empty
        let hasAdditionalInfo = false;
        let additionalInfoHtml = '';
        
        // Environment Variables
        if (container.environmentVariables && typeof container.environmentVariables === 'object' && Object.keys(container.environmentVariables).length > 0) {
            hasAdditionalInfo = true;
            const envEntries = Object.entries(container.environmentVariables).map(([key, value]) => `${key}=${value}`);
            additionalInfoHtml += `<tr><td colspan="5" class="small text-muted"><strong>Environment Variables:</strong> ${envEntries.join(', ')}</td></tr>`;
        }
        
        // Arguments
        if (container.arguments && Array.isArray(container.arguments) && container.arguments.length > 0) {
            hasAdditionalInfo = true;
            additionalInfoHtml += `<tr><td colspan="5" class="small text-muted"><strong>Arguments:</strong> ${container.arguments.join(', ')}</td></tr>`;
        }
        
        // Command
        if (container.command && Array.isArray(container.command) && container.command.length > 0) {
            hasAdditionalInfo = true;
            additionalInfoHtml += `<tr><td colspan="5" class="small text-muted"><strong>Command:</strong> ${container.command.join(', ')}</td></tr>`;
        }
        
        if (hasAdditionalInfo) {
            html += additionalInfoHtml;
        }
    });
    
    html += '</tbody></table></div>';
    html += '</div>';
    html += '</div>';
    
    // Volumes
    if (volumesData.length > 0) {
        html += '<div class="row mb-4">';
        html += '<div class="col-12">';
        html += '<h5 class="border-bottom pb-2 mb-3">Volumes</h5>';
        html += '<div class="table-responsive"><table class="table table-sm table-bordered">';
        html += '<thead class="table-light"><tr><th>Name</th><th>Path</th></tr></thead>';
        html += '<tbody>';
        
        volumesData.forEach(volume => {
            html += `<tr>`;
            html += `<td>${volume.name || '-'}</td>`;
            html += `<td><code>${volume.path || 'N/A'}</code></td>`;
            html += `</tr>`;
        });
        
        html += '</tbody></table></div>';
        html += '</div>';
        html += '</div>';
    } else {
        html += '<div class="row mb-4">';
        html += '<div class="col-12">';
        html += '<h5 class="border-bottom pb-2 mb-3">Volumes</h5>';
        html += '<p class="text-muted">No volumes configured</p>';
        html += '</div>';
        html += '</div>';
    }
    
    document.getElementById('ciSummaryContent').innerHTML = html;
    
    // Show summary modal
    const summaryModal = new bootstrap.Modal(document.getElementById('ciSummaryModal'));
    summaryModal.show();
}

// Create container instance (called from summary modal)
async function confirmCreateContainerInstance() {
    const config = getConfiguration();
    
    // Build base freeformTags for CI instance (volumes and ports)
    // Note: OCI requires all containers to have the same tags as the instance
    const baseFreeformTags = {};
    
    // Add volumes tag
    if (volumesData.length > 0) {
        const volumesTag = volumesData.map((v, idx) => {
            const volumeName = (v.name && v.name.trim()) || `volume-${idx}`;
            return `${volumeName}:${v.path}`;
        }).join(',');
        baseFreeformTags.volumes = volumesTag;
    }
    
    // Collect ports per container and add to tags as containerName=port pairs
    containersData.forEach((container, idx) => {
        if (container.portIndex !== undefined && container.portIndex !== null && container.portIndex !== '' && portsData[container.portIndex]) {
            const port = portsData[container.portIndex];
            const containerName = container.displayName || `container-${idx}`;
            // Use container name as tag key, port number as value
            baseFreeformTags[containerName] = port.port.toString();
        }
    });
    
    // Clean containers data - remove frontend-only fields like portIndex
    const cleanedContainers = containersData.map((container, containerIdx) => {
        // Ensure resourceConfig values are numbers
        const memoryInGBs = parseFloat(container.resourceConfig?.memoryInGBs) || 1;
        const vcpus = parseFloat(container.resourceConfig?.vcpus) || 1;
        
        const cleaned = {
            displayName: container.displayName,
            imageUrl: container.imageUrl,
            resourceConfig: {
                memoryInGBs: memoryInGBs,
                vcpus: vcpus
            }
        };
        
        // OCI requires all containers to have the same freeformTags as the instance
        // So we add the same base tags (volumes and ports) to all containers
        if (Object.keys(baseFreeformTags).length > 0) {
            cleaned.freeformTags = { ...baseFreeformTags };
        }
        
        // Only include environmentVariables if they exist and have values
        if (container.environmentVariables && typeof container.environmentVariables === 'object' && Object.keys(container.environmentVariables).length > 0) {
            cleaned.environmentVariables = container.environmentVariables;
        }
        
        // Only include optional fields if they have values
        if (container.arguments && Array.isArray(container.arguments) && container.arguments.length > 0) {
            cleaned.arguments = container.arguments;
        }
        if (container.command && Array.isArray(container.command) && container.command.length > 0) {
            cleaned.command = container.command;
        }
        if (container.volumeMounts && Array.isArray(container.volumeMounts) && container.volumeMounts.length > 0) {
            cleaned.volumeMounts = container.volumeMounts;
        }
        
        return cleaned;
    });
    
    const payload = {
        displayName: document.getElementById('ciName').value.trim(),
        compartmentId: config.compartmentId,
        shape: document.getElementById('ciShape').value,
        shapeConfig: {
            memoryInGBs: parseFloat(document.getElementById('ciShapeMemory').value),
            ocpus: parseFloat(document.getElementById('ciShapeOcpus').value)
        },
        subnetId: document.getElementById('ciSubnetId').value,
        containers: cleanedContainers,
        containerRestartPolicy: 'NEVER'
    };
    
    // Add freeformTags to CI instance (must match container tags per OCI requirement)
    // Use the same base tags that containers have (volumes), but collect all unique port info
    if (Object.keys(baseFreeformTags).length > 0) {
        payload.freeformTags = baseFreeformTags;
    }
    
    // Add volumes if any
    if (volumesData.length > 0) {
        payload.volumes = volumesData.map((v, idx) => {
            // Ensure every volume has a name
            const volumeName = (v.name && v.name.trim()) || `volume-${idx}`;
            return {
                name: volumeName,
                volumeType: 'EMPTYDIR',
                backingStore: 'EPHEMERAL_STORAGE'
            };
        });
        
        // Map volumes to all containers - attach all volumes to each container
        cleanedContainers.forEach(container => {
            container.volumeMounts = volumesData.map((v, idx) => {
                const volumeName = (v.name && v.name.trim()) || `volume-${idx}`;
                return {
                    mountPath: v.path,
                    volumeName: volumeName
                };
            });
        });
    }
    
    // Note: Ports/ingress IPs are assigned by OCI after container instance creation
    // They cannot be specified during creation - OCI assigns them automatically
    
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
            // Close both modals
            const summaryModal = bootstrap.Modal.getInstance(document.getElementById('ciSummaryModal'));
            summaryModal.hide();
            
            const createModal = bootstrap.Modal.getInstance(document.getElementById('createContainerInstanceModal'));
            createModal.hide();
            
            // Show success notification
            showNotification('Container instance created successfully!', 'success');
            
            // Reload container instances
            await loadContainerInstances();
        } else {
            // Show error notification
            showNotification(`Error creating container instance: ${data.error || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        console.error('Error creating container instance:', error);
        showNotification(`Error creating container instance: ${error.message}`, 'error');
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

// Show container logs modal using log OCID
async function showContainerLogs(logOcid, containerName) {
    const modalElement = document.getElementById('containerLogsModal');
    const modal = new bootstrap.Modal(modalElement);
    const logsContent = document.getElementById('containerLogsContent');
    const modalTitle = document.getElementById('containerLogsModalTitle');
    
    // Set modal title
    modalTitle.textContent = `Logs: ${containerName}`;
    
    // Show loading state
    logsContent.innerHTML = '<p class="text-muted">Loading logs...</p>';
    
    modal.show();
    
    try {
        // Get log group ID from config if available
        const config = getConfiguration();
        const params = new URLSearchParams();
        params.append('tail', '500');
        if (config.logGroupId) {
            params.append('logGroupId', config.logGroupId);
        }
        
        const response = await fetch(`/api/oci/logging/logs/${encodeURIComponent(logOcid)}?${params.toString()}`);
        const data = await response.json();
        
        if (data.success && data.data) {
            const logs = data.data;
            let logsHtml = '<pre style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 12px; white-space: pre-wrap; word-wrap: break-word;">';
            
            // Handle different log formats
            if (logs.content) {
                // If logs have a content property
                logsHtml += escapeHtml(logs.content);
            } else if (Array.isArray(logs)) {
                // If logs is an array
                logs.forEach(log => {
                    if (typeof log === 'string') {
                        logsHtml += escapeHtml(log) + '\n';
                    } else if (log.content) {
                        logsHtml += escapeHtml(log.content) + '\n';
                    } else if (log.message) {
                        logsHtml += escapeHtml(log.message) + '\n';
                    } else if (log.data) {
                        logsHtml += escapeHtml(log.data) + '\n';
                    }
                });
            } else if (typeof logs === 'string') {
                logsHtml += escapeHtml(logs);
            } else if (logs.data) {
                // If logs have a data property
                logsHtml += escapeHtml(logs.data);
            } else {
                logsHtml += escapeHtml(JSON.stringify(logs, null, 2));
            }
            
            logsHtml += '</pre>';
            logsContent.innerHTML = logsHtml;
        } else {
            logsContent.innerHTML = `<div class="alert alert-warning">No logs available or error: ${data.error || 'Unknown error'}</div>`;
        }
    } catch (error) {
        console.error('Error fetching container logs:', error);
        logsContent.innerHTML = `<div class="alert alert-danger">Error loading logs: ${error.message}</div>`;
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

