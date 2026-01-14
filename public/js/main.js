// Track currently viewed instance in modal

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Helper function to escape JSON for HTML attributes
function escapeHtmlAttribute(jsonString) {
    if (!jsonString) return '';
    return String(jsonString)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Helper function to throttle API calls - process in batches with delays
async function throttleApiCalls(items, batchSize, delayMs, asyncFn) {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(asyncFn));
        results.push(...batchResults);
        
        // Add delay between batches (except for the last batch)
        if (i + batchSize < items.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    return results;
}

// Helper function to add delay between API calls
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Handle modal stacking so nested modals/backdrops overlay correctly
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('show.bs.modal', (event) => {
        const modal = event.target;
        const openCount = document.querySelectorAll('.modal.show').length; // modals already open before this one
        
        // Defer to ensure backdrop is in DOM
        setTimeout(() => {
            const backdrops = document.querySelectorAll('.modal-backdrop');
            const latestBackdrop = backdrops[backdrops.length - 1];

            // Normalize classes
            modal.classList.remove('modal-level-2', 'modal-level-3');
            if (latestBackdrop) latestBackdrop.classList.remove('modal-backdrop-level-2', 'modal-backdrop-level-3');

            // If another modal is already open, bump the new modal/backdrop; 2 levels => level-3
            if (openCount === 1) {
                modal.classList.add('modal-level-2');
                if (latestBackdrop) latestBackdrop.classList.add('modal-backdrop-level-2');
            } else if (openCount >= 2) {
                modal.classList.add('modal-level-3');
                if (latestBackdrop) latestBackdrop.classList.add('modal-backdrop-level-3');
            }
        }, 0);
    });
    
    document.addEventListener('hidden.bs.modal', (event) => {
        const closedModal = event.target;
        
        // Clean up classes from the closed modal
        closedModal.classList.remove('modal-level-2', 'modal-level-3');
        
        // Find and remove the backdrop that belongs to this modal (the last one before it was removed)
        // Bootstrap removes the backdrop when modal closes, but we need to re-evaluate remaining modals
        setTimeout(() => {
            // Re-evaluate remaining open modals and assign correct levels
            const openModals = document.querySelectorAll('.modal.show');
            const backdrops = document.querySelectorAll('.modal-backdrop');
            
            openModals.forEach((modal, index) => {
                // Normalize classes first
                modal.classList.remove('modal-level-2', 'modal-level-3');
                
                // Find corresponding backdrop (backdrops are in same order as modals)
                const backdrop = backdrops[index];
                
                if (backdrop) {
                    backdrop.classList.remove('modal-backdrop-level-2', 'modal-backdrop-level-3');
                }
                
                // Assign correct level based on how many modals are before this one
                if (index === 0) {
                    // First modal - no level classes needed (base level)
                } else if (index === 1) {
                    // Second modal - level-2
                    modal.classList.add('modal-level-2');
                    if (backdrop) backdrop.classList.add('modal-backdrop-level-2');
                } else if (index >= 2) {
                    // Third+ modal - level-3
                    modal.classList.add('modal-level-3');
                    if (backdrop) backdrop.classList.add('modal-backdrop-level-3');
                }
            });
        }, 0);
    });
});

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
            let envVarsJson = newRow.getAttribute('data-env-vars');
            let cmdJson = newRow.getAttribute('data-cmd');
            let argsJson = newRow.getAttribute('data-args');
            
            if (!envVarsJson && !cmdJson && !argsJson) return;
            
            // Unescape HTML entities
            function unescapeHtmlAttribute(str) {
                if (!str) return str;
                return String(str)
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&');
            }
            
            if (envVarsJson) envVarsJson = unescapeHtmlAttribute(envVarsJson);
            if (cmdJson) cmdJson = unescapeHtmlAttribute(cmdJson);
            if (argsJson) argsJson = unescapeHtmlAttribute(argsJson);
            
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

// Store main page auto-reload interval ID
let mainPageAutoReloadInterval = null;

// Function to start/restart main page auto-reload
function startMainPageAutoReload() {
    // Clear existing interval if any
    if (mainPageAutoReloadInterval) {
        clearInterval(mainPageAutoReloadInterval);
        mainPageAutoReloadInterval = null;
    }
    
    const config = getConfiguration();
    const autoReloadTime = config.autoReloadTime !== undefined ? config.autoReloadTime : 5;
    
    // Only start interval if autoReloadTime > 0
    if (autoReloadTime > 0) {
        mainPageAutoReloadInterval = setInterval(async () => {
            const currentConfig = getConfiguration();
            if (currentConfig.compartmentId && currentConfig.projectName) {
                await loadContainerInstances();
            }
        }, autoReloadTime * 1000);
    }
}

// Check server status on page load
document.addEventListener('DOMContentLoaded', function() {
    loadPageContent();
    startMainPageAutoReload();
});

async function loadPageContent() {
    const config = getConfiguration();
    
    // Display CI name
    displayProjectName(config.projectName);
    
    // Update footer with compartment and CI name
    updateContainerInstancesFooter();
    
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

function updateContainerInstancesFooter() {
    const config = getConfiguration();
    const footerText = document.getElementById('containerInstancesFooterText');
    
    if (!footerText) return;
    
    let compartmentName = 'N/A';
    const ciName = config.projectName || 'N/A';
    
    // Try to get compartment name from the dropdown if available
    const compartmentSelect = document.getElementById('compartmentId');
    if (compartmentSelect && compartmentSelect.value) {
        const selectedOption = compartmentSelect.options[compartmentSelect.selectedIndex];
        if (selectedOption && selectedOption.textContent) {
            // Extract just the name (before any description)
            compartmentName = selectedOption.textContent.split(' - ')[0];
        }
    }
    
    // If dropdown not available, try to get from config or use compartmentId
    if (compartmentName === 'N/A' && config.compartmentId) {
        // Try to fetch compartment name from API
        fetchCompartmentName(config.compartmentId).then(name => {
            if (name) {
                compartmentName = name;
                footerText.textContent = `Showing Containers Instances deployments in compartment ${compartmentName} with name: ${ciName}`;
            } else {
                footerText.textContent = `Showing Containers Instances deployments in compartment ${config.compartmentId} with name: ${ciName}`;
            }
        }).catch(() => {
            footerText.textContent = `Showing Containers Instances deployments in compartment ${config.compartmentId} with name: ${ciName}`;
        });
        return;
    }
    
    footerText.textContent = `Showing Containers Instances deployments in compartment ${compartmentName} with name: ${ciName}`;
}

async function fetchCompartmentName(compartmentId) {
    try {
        const config = getConfiguration();
        const params = new URLSearchParams();
        
        if (config.ociConfigFile) {
            params.append('configPath', config.ociConfigFile);
        }
        if (config.ociConfigProfile) {
            params.append('profile', config.ociConfigProfile);
        }
        
        const response = await fetch(`/api/oci/compartments/${compartmentId}?${params.toString()}`);
        const data = await response.json();
        
        if (data.success && data.data && data.data.name) {
            return data.data.name;
        }
    } catch (error) {
        console.error('Error fetching compartment name:', error);
    }
    return null;
}

// Configuration management functions
function loadConfiguration() {
    const config = JSON.parse(localStorage.getItem('appConfig') || '{}');
    
    // Compartment and subnet will be set after they are loaded
    if (config.projectName) document.getElementById('projectName').value = config.projectName;
    if (config.region) document.getElementById('region').value = config.region;
    if (config.ociConfigFile) document.getElementById('ociConfigFile').value = config.ociConfigFile;
    if (config.ociConfigProfile) document.getElementById('ociConfigProfile').value = config.ociConfigProfile;
    if (config.logGroupId) {
        const logGroupSelect = document.getElementById('logGroupId');
        logGroupSelect.value = config.logGroupId;
    }
    if (config.autoReloadTime !== undefined) {
        document.getElementById('autoReloadTime').value = config.autoReloadTime;
    }
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
        logGroupId: document.getElementById('logGroupId').value.trim() || '',
        autoReloadTime: (() => {
            const value = parseInt(document.getElementById('autoReloadTime').value);
            return isNaN(value) ? 5 : value;
        })()
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
    
    // Restart auto-reload with new interval
    startMainPageAutoReload();
    
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
    
    // Update footer with compartment and CI name
    updateContainerInstancesFooter();
    
    // Always reload container instances table if we have valid config
    // Force refresh by clearing previous states and reloading
    if (config.compartmentId && config.projectName) {
        // Show spinner when config has changed (CI name or compartment changed)
        const showSpinner = ciNameChanged || compartmentChanged;
        await loadContainerInstances(showSpinner);
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
function loadPortsAndVolumesForCIName(ciName, updateTables = true) {
    if (!ciName) {
        volumesData = [];
        portsData = [];
        if (updateTables) {
            updatePortsTable();
            updateVolumesTable();
        }
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
            if (updateTables) {
                updatePortsTable();
                updateVolumesTable();
            }
        } catch (error) {
            console.error('Error loading ports and volumes:', error);
            volumesData = [];
            portsData = [];
            if (updateTables) {
                updatePortsTable();
                updateVolumesTable();
            }
        }
    } else {
        console.log(`No saved ports/volumes found for CI name: ${ciName}`);
        volumesData = [];
        portsData = [];
        if (updateTables) {
            updatePortsTable();
            updateVolumesTable();
        }
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
                    loadLogGroups();
                }
                // Update footer with compartment name
                updateContainerInstancesFooter();
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

async function loadLogGroups() {
    const compartmentId = document.getElementById('compartmentId').value;
    const logGroupSelect = document.getElementById('logGroupId');
    
    if (!logGroupSelect) {
        return;
    }
    
    if (!compartmentId) {
        logGroupSelect.innerHTML = '<option value="">Select a compartment first...</option>';
        return;
    }
    
    try {
        logGroupSelect.innerHTML = '<option value="">Loading log groups...</option>';
        
        const config = getConfiguration();
        const params = new URLSearchParams();
        params.append('compartmentId', compartmentId);
        
        const response = await fetch(`/api/oci/logging/log-groups?${params.toString()}`);
        const data = await response.json();
        
        if (data.success && data.data) {
            logGroupSelect.innerHTML = '<option value="">Select a default log group...</option>';
            data.data.forEach(logGroup => {
                const option = document.createElement('option');
                option.value = logGroup.id;
                option.textContent = logGroup.displayName || logGroup.id;
                logGroupSelect.appendChild(option);
            });
            
            // Restore saved value if exists
            const savedConfig = JSON.parse(localStorage.getItem('appConfig') || '{}');
            if (savedConfig.logGroupId) {
                logGroupSelect.value = savedConfig.logGroupId;
            }
        } else {
            logGroupSelect.innerHTML = '<option value="">No log groups found</option>';
        }
    } catch (error) {
        console.error('Could not load log groups:', error);
        logGroupSelect.innerHTML = '<option value="">Error loading log groups</option>';
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
async function loadSubnetsForDetails(compartmentId, currentSubnetId, providedDefaultSubnetId = null) {
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
            
            // Ensure default subnet exists as an option
            // Preselect current subnet (the one used when CI was created)
            // For failed CIs without subnet, use default subnet from config
            const config = getConfiguration();
            const defaultSubnetId = providedDefaultSubnetId || config.defaultSubnetId || config.subnetId;
            const isFailed = currentEditingInstance?.lifecycleState === 'FAILED';
            const hasNoSubnet = !currentSubnetId || currentSubnetId === '' || currentSubnetId === null;
            
            console.log('loadSubnetsForDetails:', { 
                isFailed, 
                hasNoSubnet, 
                currentSubnetId, 
                defaultSubnetId: config.defaultSubnetId,
                lifecycleState: currentEditingInstance?.lifecycleState 
            });
            
            // Ensure default subnet exists as an option if we have one
            if (defaultSubnetId) {
                const existingDefault = subnetSelect.querySelector(`option[value="${defaultSubnetId}"]`);
                if (!existingDefault) {
                    const opt = document.createElement('option');
                    opt.value = defaultSubnetId;
                    opt.textContent = 'Default Subnet (from config)';
                    subnetSelect.appendChild(opt);
                    console.log('Added default subnet option:', defaultSubnetId);
                }
            }
            
            // Set the selected value after options are added
            let selected = false;
            if (currentSubnetId && currentSubnetId !== null && currentSubnetId !== '') {
                const option = subnetSelect.querySelector(`option[value="${currentSubnetId}"]`);
                if (option) {
                    subnetSelect.value = currentSubnetId;
                    selected = true;
                    console.log('Selected existing subnet:', currentSubnetId);
                }
            }
            
            // For failed CIs without subnet, preselect default subnet
            if (!selected && isFailed && hasNoSubnet && defaultSubnetId) {
                const defaultOption = subnetSelect.querySelector(`option[value="${defaultSubnetId}"]`);
                if (defaultOption) {
                    subnetSelect.value = defaultSubnetId;
                    // Verify the value was set
                    if (subnetSelect.value === defaultSubnetId) {
                        selected = true;
                        console.log('Selected default subnet for failed CI:', defaultSubnetId);
                    } else {
                        console.error('Failed to set subnet value, retrying...');
                        // Retry after a brief delay
                        setTimeout(() => {
                            subnetSelect.value = defaultSubnetId;
                            if (subnetSelect.value === defaultSubnetId) {
                                console.log('Successfully set subnet value on retry');
                            }
                        }, 100);
                    }
                } else {
                    console.warn('Default subnet option not found after adding:', defaultSubnetId);
                }
            }
            
            // Fallback to default subnet if available and nothing selected
            if (!selected && defaultSubnetId) {
                const defaultOption = subnetSelect.querySelector(`option[value="${defaultSubnetId}"]`);
                if (defaultOption) {
                    subnetSelect.value = defaultSubnetId;
                    if (subnetSelect.value === defaultSubnetId) {
                        selected = true;
                        console.log('Selected default subnet as fallback:', defaultSubnetId);
                    }
                }
            }
            
            // If still nothing selected, disable the placeholder option to force a choice
            const firstOption = subnetSelect.querySelector('option[value=""]');
            if (firstOption) {
                firstOption.disabled = true;
                firstOption.textContent = 'Select a subnet (required)';
            }
            
            console.log('Final subnet selection:', subnetSelect.value, 'selected:', selected, 'required:', subnetSelect.required);
            
            // Force validation - trigger change event to ensure form validation works
            subnetSelect.dispatchEvent(new Event('change', { bubbles: true }));
            subnetSelect.dispatchEvent(new Event('input', { bubbles: true }));
            
            // If nothing selected after all attempts, focus the dropdown
            if (!subnetSelect.value || subnetSelect.value === '') {
                subnetSelect.focus();
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
async function loadContainerInstances(showSpinner = false) {
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
    
    // Show spinner if requested
    if (showSpinner) {
        contentDiv.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div><p class="text-muted mt-2">Loading container instances...</p></div>';
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
                
                // Skip fetching details on initial load to avoid rate limiting
                // Details will be fetched when user clicks on an instance
                // Only check states from the list response (may not be 100% accurate but avoids extra API calls)
                const instancesWithDetails = sortedInstances;
                
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
                // Always update the message with the current CI name
                    contentDiv.innerHTML = `<p class="text-muted">No container instances found matching CI name "${config.projectName}".</p>`;
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
    
    // Fetch instance details first to get vnicId, then fetch VNIC details for IPs
    // Throttle to avoid rate limiting: process 2 at a time with 300ms delay
    const instancesWithDetails = await throttleApiCalls(
        instancesToDisplay,
        2, // batch size (smaller to reduce load)
        300, // delay between batches in ms
        async (instance) => {
            // First, fetch instance details to get vnicId if not in list response
            let vnicId = null;
            if (instance.vnics && instance.vnics.length > 0) {
                vnicId = instance.vnics[0].vnicId || instance.vnics[0].id;
            }
            
            // If vnicId not in list response, fetch instance details
            if (!vnicId && instance.id) {
                try {
                    const instanceResponse = await fetch(`/api/oci/container-instances/${instance.id}`);
                    const instanceData = await instanceResponse.json();
                    if (instanceData.success && instanceData.data && instanceData.data.vnics && instanceData.data.vnics.length > 0) {
                        vnicId = instanceData.data.vnics[0].vnicId || instanceData.data.vnics[0].id;
                        // Update instance with vnics from detail response
                        if (!instance.vnics) {
                            instance.vnics = instanceData.data.vnics;
                        } else if (instanceData.data.vnics[0].vnicId) {
                            instance.vnics[0].vnicId = instanceData.data.vnics[0].vnicId;
                        }
                        // Also get containers from detail response if not in list
                        if (!instance.containers && instanceData.data.containers) {
                            instance.containers = instanceData.data.containers;
                        }
                    }
                } catch (instanceError) {
                    console.error(`Error fetching instance details for ${instance.id}:`, instanceError);
                }
            }
            
            // Now fetch VNIC details to get IPs
            if (vnicId) {
                try {
                    const vnicResponse = await fetch(`/api/oci/networking/vnics/${vnicId}`);
                    const vnicData = await vnicResponse.json();
                    const vnic = vnicData.vnic || vnicData.data;
                    if (vnic) {
                        // Initialize vnics array if needed
                        if (!instance.vnics || instance.vnics.length === 0) {
                            instance.vnics = [{}];
                        }
                        // Add private IP
                        if (vnic.privateIp) {
                            instance.vnics[0].privateIp = vnic.privateIp;
                        } else if (vnic.privateIpAddress) {
                            instance.vnics[0].privateIp = vnic.privateIpAddress;
                        }
                        // Add public IP
                        if (vnic.publicIp) {
                            instance.vnics[0].publicIp = vnic.publicIp;
                        } else if (vnic.publicIpAddress) {
                            instance.vnics[0].publicIp = vnic.publicIpAddress;
                        }
                    }
                } catch (vnicError) {
                    console.error(`Error fetching VNIC details for ${vnicId}:`, vnicError);
                }
            }
            return instance;
        }
    );
    
    let html = `<p class="text-muted mb-3">Showing ${instancesWithDetails.length} of ${instances.length} container instance(s)`;
    if (!showDeletedCIs && instances.length > instancesWithDetails.length) {
        html += ` (${instances.length - instancesWithDetails.length} deleted hidden)`;
    }
    html += `</p>`;
    html += '<div class="table-responsive"><table class="table table-hover">';
    html += '<thead class="table-light"><tr><th>State</th><th>Name</th><th>IP Address</th><th>Containers</th><th>Created</th></tr></thead>';
    html += '<tbody>';
    
    instancesWithDetails.forEach(instance => {
        // Get private and public IP from vnics[0] - should be populated from VNIC detail fetch above
        let privateIp = 'N/A';
        let publicIp = 'N/A';
        if (instance.vnics && instance.vnics.length > 0) {
            const vnic = instance.vnics[0];
            privateIp = vnic.privateIp || vnic.privateIpAddress || 'N/A';
            publicIp = vnic.publicIp || vnic.publicIpAddress || 'N/A';
        }
        
        // Format IP display: show both private and public if available
        let ipDisplay = privateIp;
        if (publicIp !== 'N/A' && publicIp) {
            ipDisplay = `${privateIp} / ${publicIp}`;
        }
        
        // Show all containers - first try from instance.containers, then fall back to tags
        const freeformTags = instance.freeformTags || {};
        const containers = instance.containers || [];
        const containersList = [];
        
        // First, try to get containers from instance.containers array
        if (containers.length > 0) {
            // Containers are in the response, show all and append port from tags if available
            containers.forEach(container => {
                const containerName = container.displayName || container.name || 'N/A';
                // Look for port in freeformTags using container name as key
                const port = freeformTags[containerName];
                if (port && /^\d+$/.test(port)) {
                    containersList.push({ name: containerName, port: port });
                } else {
                    // If no port found in tags, just show container name
                    containersList.push({ name: containerName, port: null });
                }
            });
        }
        
        // Also parse containers from tags (in case containers array is empty or missing)
        // This ensures we show all containers even if list response doesn't include them
        Object.entries(freeformTags).forEach(([key, value]) => {
            // Skip 'volumes' tag, only process container name -> port mappings
            if (key !== 'volumes' && typeof value === 'string' && /^\d+$/.test(value)) {
                // Only add if not already in list (avoid duplicates)
                const exists = containersList.some(c => c.name === key);
                if (!exists) {
                    containersList.push({ name: key, port: value });
                }
            }
        });
        
        // Build containers display with links when public IP and port exist
        let containersDisplay = 'N/A';
        if (containersList.length > 0) {
            const hasPublicIp = publicIp !== 'N/A' && publicIp && publicIp.trim() !== '';
            const containerElements = containersList.map(container => {
                const containerName = escapeHtml(container.name);
                if (hasPublicIp && container.port) {
                    // Create link in form http://public_ip:port
                    const url = `http://${publicIp}:${container.port}`;
                    return `<a href="${url}" target="_blank" onclick="event.stopPropagation();" class="text-decoration-none">${containerName}:${container.port}</a>`;
                } else if (container.port) {
                    // Has port but no public IP, show as text
                    return `${containerName}:${container.port}`;
                } else {
                    // No port, just show name
                    return containerName;
                }
            });
            containersDisplay = containerElements.join(', ');
        }
        
        html += '<tr style="cursor: pointer;" onclick="showContainerInstanceDetails(\'' + instance.id + '\')">';
        html += `<td>${getStateBadgeHtml(instance.lifecycleState)}</td>`;
        html += `<td><strong>${instance.displayName || 'N/A'}</strong></td>`;
        html += `<td>${ipDisplay}</td>`;
        html += `<td><small>${containersDisplay}</small></td>`;
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
        // Reload container instances to apply the filter with spinner
        loadContainerInstances(true);
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
    
    // Set up interval to refresh modal content based on config
    const config = getConfiguration();
    const autoReloadTime = config.autoReloadTime !== undefined ? config.autoReloadTime : 5;
    
    let modalRefreshInterval = null;
    if (autoReloadTime > 0) {
        modalRefreshInterval = setInterval(async () => {
            const modalInstance = bootstrap.Modal.getInstance(modalElement);
            // Only refresh if modal is still open, viewing the same instance, and not in edit mode
            if (modalInstance && modalElement.classList.contains('show') && currentModalInstanceId === instanceId && !isInEditMode) {
                await refreshContainerInstanceModal(instanceId);
            } else {
                // Modal closed, clear interval
                if (modalRefreshInterval) {
                    clearInterval(modalRefreshInterval);
                }
                currentModalInstanceId = null;
            }
        }, autoReloadTime * 1000);
    }
    
    // Store interval ID so we can clear it when modal closes
    if (modalRefreshInterval) {
        modalElement.setAttribute('data-refresh-interval-id', modalRefreshInterval);
    }
    
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
            // Add delay to avoid rate limiting
            if (instanceDetails.vnics && instanceDetails.vnics.length > 0 && instanceDetails.vnics[0].vnicId) {
                await delay(100); // Small delay before VNIC call
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
            // Add delay to avoid rate limiting
            if (instanceDetails.subnetId) {
                await delay(100); // Small delay before subnet call
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
            // Add delay to avoid rate limiting
            if (instanceDetails.compartmentId) {
                await delay(100); // Small delay before compartment call
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
                    // Throttle API calls to avoid rate limiting: process 2 at a time with 150ms delay
                    const containersWithDetails = await throttleApiCalls(
                        instanceDetails.containers,
                        2, // batch size
                        150, // delay between batches in ms
                        async (container) => {
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
                        }
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
        lifecycleState: instance.lifecycleState,
        freeformTags: instance.freeformTags || {}
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
    html += `<select class="form-select form-select-sm" id="detailsSubnetId" style="display: none;" required>`;
    html += `<option value="">Loading subnets...</option>`;
    html += `</select></dd>`;
    html += `<dt class="col-5 text-muted">Shape:</dt><dd class="col-7">${instance.shape || 'N/A'}</dd>`;
    if (instance.shapeConfig) {
        const memoryValue = instance.shapeConfig.memoryInGBs || '16';
        const ocpusValue = instance.shapeConfig.ocpus || '1';
        
        // Architecture - read-only display (on top)
        const architectureValue = instance.freeformTags?.architecture || 'x86';
        html += `<dt class="col-5 text-muted">Architecture:</dt>`;
        html += `<dd class="col-7">${architectureValue}</dd>`;
        
        // OCPUs - show dropdown in edit mode, text in view mode
        html += `<dt class="col-5 text-muted">OCPUs:</dt>`;
        html += `<dd class="col-7">`;
        html += `<span id="detailsOcpusDisplay">${ocpusValue}</span>`;
        html += `<select class="form-select form-select-sm" id="detailsShapeOcpus" style="display: none;">`;
        if (architectureValue === 'ARM64') {
            // ARM64: 1-16
            for (let ocpu = 1; ocpu <= 16; ocpu++) {
                html += `<option value="${ocpu}" ${ocpusValue == ocpu.toString() ? 'selected' : ''}>${ocpu} OCPU</option>`;
            }
        } else {
            // x86: 1-8
            for (let ocpu = 1; ocpu <= 8; ocpu++) {
                html += `<option value="${ocpu}" ${ocpusValue == ocpu.toString() ? 'selected' : ''}>${ocpu} OCPU</option>`;
            }
        }
        html += `</select></dd>`;
        
        // Memory - show dropdown in edit mode, text in view mode
        html += `<dt class="col-5 text-muted">Memory:</dt>`;
        html += `<dd class="col-7">`;
        html += `<span id="detailsMemoryDisplay">${memoryValue} GB</span>`;
        html += `<select class="form-select form-select-sm" id="detailsShapeMemory" style="display: none;">`;
        if (architectureValue === 'ARM64') {
            // ARM64: 6 to 96 in increments of 6
            for (let mem = 6; mem <= 96; mem += 6) {
                html += `<option value="${mem}" ${memoryValue == mem.toString() ? 'selected' : ''}>${mem} GB</option>`;
            }
        } else {
            // x86: 16, 32, 64, 96, 128
            const x86MemoryOptions = [16, 32, 64, 96, 128];
            x86MemoryOptions.forEach(mem => {
                html += `<option value="${mem}" ${memoryValue == mem.toString() ? 'selected' : ''}>${mem} GB</option>`;
            });
        }
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
    
    // Store ports data for this instance - initialize before containers table
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
        // Check if log column should be shown (need to check at least one container)
        const config = getConfiguration();
        const hasLogColumn = !isInEditMode && detailsContainersData.some(container => {
            const envVars = container.environmentVariables || {};
            return envVars.log_ocid && config.logGroupId;
        });
        
        // Image header spans 2 columns (Image + Actions/Log) to extend border to right edge
        // No separate Actions header - Image header covers both Image and Actions/Log columns
        const imageColspan = (isInEditMode || hasLogColumn) ? 2 : 1;
        
        html += '<table class="table table-sm" style="width: 100%; table-layout: auto;">';
        html += `<thead class="table-light"><tr><th>State</th><th>Name</th><th>Port</th><th colspan="${imageColspan}">Image</th></tr></thead>`;
        html += '<tbody id="detailsContainersTableBody">';
        
        detailsContainersData.forEach((container, idx) => {
            const containerName = container.displayName;
            
            // Store tooltip data in data attributes
            const envVars = container.environmentVariables || {};
            const cmd = container.command || [];
            const args = container.arguments || [];
            
            const envVarsJson = escapeHtmlAttribute(JSON.stringify(envVars));
            const cmdJson = escapeHtmlAttribute(JSON.stringify(cmd));
            const argsJson = escapeHtmlAttribute(JSON.stringify(args));
            
            html += `<tr class="container-row-hover" data-env-vars="${envVarsJson}" data-cmd="${cmdJson}" data-args="${argsJson}">`;
            
            // State - first column
            html += `<td style="border-bottom: 1px solid #dee2e6;">${getStateBadgeHtml(container.lifecycleState)}</td>`;
            
            // Container name with text-primary class
            html += `<td style="border-bottom: 1px solid #dee2e6;"><strong class="text-primary">${containerName}</strong></td>`;
            
            // Port - show "name(port)" or just "port" if name is empty
            let portDisplay = '-';
            if (container.port) {
                const portNum = parseInt(container.port);
                const portData = detailsPortsData.find(p => p.port === portNum);
                if (portData) {
                    portDisplay = portData.name && portData.name.trim() ? `${portData.name} (${portNum})` : `${portNum}`;
                } else {
                    portDisplay = `${portNum}`;
                }
            }
            html += `<td style="border-bottom: 1px solid #dee2e6;">${portDisplay}</td>`;
            
            // Image URL
            html += `<td style="border-bottom: 1px solid #dee2e6;"><code>${container.imageUrl}</code></td>`;
            
            // Actions column - only show CRUD buttons in edit mode
            html += `<td id="containerActions_${idx}" style="display: ${isInEditMode ? 'table-cell' : 'none'}; white-space: nowrap; text-align: right; border-bottom: 1px solid #dee2e6;">`;
            html += `<button class="btn btn-info btn-sm me-1" onclick="editContainerInDetails(${idx}, '${containerInstanceId}')">Edit</button>`;
            html += `<button class="btn btn-danger btn-sm" onclick="deleteContainerInDetails(${idx}, '${containerInstanceId}')">Delete</button>`;
            html += `</td>`;
            
            // Log button - only show in non-edit mode, if container has log_ocid env var, and log group is configured
            if (!isInEditMode) {
                const logOcid = envVars.log_ocid;
                const config = getConfiguration();
                if (logOcid && config.logGroupId) {
                    html += `<td style="white-space: nowrap;">`;
                    html += `<button class="btn btn-secondary btn-sm" onclick="showContainerLogs('${escapeHtml(logOcid)}', '${escapeHtml(containerName)}')" title="View container logs">`;
                    html += `<i class="bi bi-file-text"></i> Log`;
                    html += `</button>`;
                    html += `</td>`;
                } else if (hasLogColumn) {
                    // Add empty cell to maintain column alignment if log column exists but this container doesn't have logs
                    html += `<td></td>`;
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
    
    // Store ports data globally for this instance (already initialized above)
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
    html += '<p class="text-muted small mb-2">Volumes are accessible to all containers in the deployment via their mounted paths.</p>';
    
    // Store volumes data for CRUD operations
    // volumesList was potentially updated above from localStorage
    const detailsVolumesData = volumesList.map((volume, idx) => ({
        index: idx,
        name: volume.name || '',
        path: volume.path || ''
    }));
    
    window[`detailsVolumes_${containerInstanceId}`] = detailsVolumesData;
    
    if (detailsVolumesData.length > 0) {
        html += '<div class="table-responsive"><table class="table table-sm">';
        // Path header spans over Actions column (always, since Actions column always exists in view mode too)
        html += `<thead class="table-light"><tr><th>Name</th><th colspan="2">Path</th></tr></thead>`;
        html += '<tbody id="detailsVolumesTableBody_' + containerInstanceId + '">';
        
        detailsVolumesData.forEach((volume, idx) => {
            html += '<tr>';
            html += `<td style="border-bottom: 1px solid #dee2e6;">${volume.name || '-'}</td>`;
            html += `<td style="border-bottom: 1px solid #dee2e6;"><code>${volume.path || 'N/A'}</code></td>`;
            // Actions column - only show CRUD buttons in edit mode
            html += `<td id="volumeActions_${idx}" style="display: none; border-bottom: 1px solid #dee2e6;">`;
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
    const isDeleted = (instance.lifecycleState || '').toUpperCase() === 'DELETED';
    const canEdit = instance.lifecycleState !== 'UPDATING' && instance.lifecycleState !== 'CREATING' && instance.lifecycleState !== 'DELETING' && instance.lifecycleState !== 'DELETED';
    const editDisabledAttr = canEdit ? '' : 'disabled';
    // For deleted CIs, always enable the restart button (which will restore)
    // For active CIs, enable restart if not in a transitional state
    const canRestart = isDeleted ? true : (instance.lifecycleState !== 'UPDATING' && instance.lifecycleState !== 'CREATING' && instance.lifecycleState !== 'DELETING' && instance.lifecycleState !== 'DELETED' && instance.lifecycleState !== 'FAILED');
    const restartDisabledAttr = canRestart ? '' : 'disabled';
    const canDelete = instance.lifecycleState !== 'UPDATING' && instance.lifecycleState !== 'CREATING' && instance.lifecycleState !== 'DELETING' && instance.lifecycleState !== 'DELETED';
    const deleteDisabledAttr = canDelete ? '' : 'disabled';
    html += '<div class="row mt-4">';
    html += '<div class="col-12 text-end">';
    html += `<button class="btn btn-success me-2" id="detailsSaveResourceManagerBtn" onclick="saveToResourceManager('${containerInstanceId}')" style="display: inline-block;">`;
    html += '<i class="bi bi-cloud-upload"></i> Save in Resource Manager';
    html += '</button>';
    html += `<button class="btn ${isDeleted ? 'btn-primary' : 'btn-info'} me-2" id="detailsRestartBtn" onclick="restartContainerInstance('${containerInstanceId}')" ${restartDisabledAttr}>`;
    html += `<i class="bi ${isDeleted ? 'bi-arrow-counterclockwise' : 'bi-arrow-clockwise'}"></i> ${isDeleted ? 'Restore' : 'Restart'}`;
    html += '</button>';
    html += `<button class="btn btn-light me-2" id="detailsStopBtn" onclick="stopContainerInstance('${containerInstanceId}')" ${restartDisabledAttr}>`;
    html += '<i class="bi bi-stop"></i> Stop';
    html += '</button>';
    html += `<button class="btn btn-danger me-2" id="detailsDeleteBtn" onclick="deleteContainerInstance('${containerInstanceId}')" ${deleteDisabledAttr}>`;
    html += '<i class="bi bi-trash"></i> Delete';
    html += '</button>';
    html += `<button class="btn btn-warning me-2" id="detailsEditBtn" onclick="isInEditMode = true; enterEditMode('${containerInstanceId}')" ${editDisabledAttr}>`;
    html += '<i class="bi bi-pencil"></i> Edit';
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
    
    const stopBtn = document.getElementById('detailsStopBtn');
    if (stopBtn) stopBtn.style.display = 'none';
    
    const deleteBtn = document.getElementById('detailsDeleteBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';
    
    const saveResourceManagerBtn = document.getElementById('detailsSaveResourceManagerBtn');
    if (saveResourceManagerBtn) saveResourceManagerBtn.style.display = 'none';
    
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
        // Make subnet required
        subnetSelect.setAttribute('required', 'required');
        // Remove any existing required attribute to avoid duplicates
        subnetSelect.required = true;
        
        // Load subnets for the compartment
        const config = getConfiguration();
        const defaultSubnetId = config.defaultSubnetId || config.subnetId;
        if (config.compartmentId && currentEditingInstance) {
            // For failed CIs, pass null as currentSubnetId to trigger default subnet selection
            const currentSubnetId = currentEditingInstance.lifecycleState === 'FAILED' && !currentEditingInstance.subnetId 
                ? null 
                : currentEditingInstance.subnetId;
            
            console.log('enterEditMode - calling loadSubnetsForDetails:', {
                compartmentId: config.compartmentId,
                currentSubnetId,
                lifecycleState: currentEditingInstance.lifecycleState,
                hasSubnetId: !!currentEditingInstance.subnetId
            });
            
            loadSubnetsForDetails(config.compartmentId, currentSubnetId, defaultSubnetId);
        }
    }
}

// Helper function to populate VCPU dropdown based on architecture
function populateContainerVcpuDropdown(architecture, selectedValue = null) {
    const vcpuSelect = document.getElementById('editContainerVcpus');
    if (!vcpuSelect) return;
    
    vcpuSelect.innerHTML = '';
    const defaultVcpu = '1';
    const valueToSelect = selectedValue || defaultVcpu;
    
    if (architecture === 'ARM64') {
        // ARM64: 1-16 OCPU
        for (let i = 1; i <= 16; i++) {
            const option = document.createElement('option');
            option.value = i.toString();
            option.textContent = `${i} vOCPU`;
            if (i.toString() === valueToSelect.toString()) {
                option.selected = true;
            }
            vcpuSelect.appendChild(option);
        }
    } else {
        // x86: 1-8 OCPU (current options)
        for (let i = 1; i <= 8; i++) {
            const option = document.createElement('option');
            option.value = i.toString();
            option.textContent = `${i} vOCPU`;
            if (i.toString() === valueToSelect.toString()) {
                option.selected = true;
            }
            vcpuSelect.appendChild(option);
        }
    }
    // If no option was selected (value doesn't match), select the first one
    if (!vcpuSelect.value && vcpuSelect.options.length > 0) {
        vcpuSelect.selectedIndex = 0;
    }
}

// Helper function to populate memory dropdown based on architecture
function populateContainerMemoryDropdown(architecture, selectedValue = null) {
    const memorySelect = document.getElementById('editContainerMemory');
    if (!memorySelect) return;
    
    memorySelect.innerHTML = '';
    const defaultMemory = architecture === 'ARM64' ? '6' : '16';
    const valueToSelect = selectedValue || defaultMemory;
    
    if (architecture === 'ARM64') {
        // ARM64: 6 to 96 in increments of 6
        for (let mem = 6; mem <= 96; mem += 6) {
            const option = document.createElement('option');
            option.value = mem.toString();
            option.textContent = `${mem} GB`;
            if (mem.toString() === valueToSelect.toString()) {
                option.selected = true;
            }
            memorySelect.appendChild(option);
        }
    } else {
        // x86: 16, 32, 64, 96, 128
        const x86MemoryOptions = [16, 32, 64, 96, 128];
        x86MemoryOptions.forEach(mem => {
            const option = document.createElement('option');
            option.value = mem.toString();
            option.textContent = `${mem} GB`;
            if (mem.toString() === valueToSelect.toString()) {
                option.selected = true;
            }
            memorySelect.appendChild(option);
        });
    }
    // If no option was selected (value doesn't match), select the first one
    if (!memorySelect.value && memorySelect.options.length > 0) {
        memorySelect.selectedIndex = 0;
    }
}

function addContainerToDetails() {
    // Ensure we're in edit mode
    if (!isInEditMode) {
        isInEditMode = true;
    }
    
    // Set editing context
    const instanceId = currentEditingInstance?.id;
    if (!instanceId) return;
    
    editingDetailsContext = { type: 'details', instanceId: instanceId };
    
    // Reset edit form
    document.getElementById('editContainerForm').reset();
    document.getElementById('editContainerIndex').value = '';
    
    // Set modal title to "Add Container"
    const modalTitle = document.getElementById('editContainerModalTitle');
    if (modalTitle) {
        modalTitle.textContent = 'Add Container';
    }
    
    // Populate memory dropdown based on CI architecture
    const architecture = currentEditingInstance?.freeformTags?.architecture || 'x86';
    
    // Get CI's memory and OCPU as defaults
    const ciMemory = currentEditingInstance?.shapeConfig?.memoryInGBs || (architecture === 'ARM64' ? '6' : '16');
    const ciOcpus = currentEditingInstance?.shapeConfig?.ocpus || '1';
    
    populateContainerMemoryDropdown(architecture, ciMemory);
    populateContainerVcpuDropdown(architecture, ciOcpus);
    
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
    
    // Set modal title to "Edit Container"
    const modalTitle = document.getElementById('editContainerModalTitle');
    if (modalTitle) {
        modalTitle.textContent = 'Edit Container';
    }
    
    // Populate edit form with container data
    document.getElementById('editContainerIndex').value = index;
    document.getElementById('editContainerName').value = container.displayName || '';
    document.getElementById('editContainerImage').value = container.imageUrl || '';
    
    // Get architecture from CI to populate memory dropdown correctly
    const architecture = currentEditingInstance?.freeformTags?.architecture || 'x86';
    const memoryValue = container.resourceConfig?.memoryInGBs || (architecture === 'ARM64' ? '6' : '16');
    const vcpuValue = container.resourceConfig?.vcpus || '1';
    
    // Update memory and VCPU dropdowns based on architecture
    populateContainerMemoryDropdown(architecture, memoryValue);
    populateContainerVcpuDropdown(architecture, vcpuValue);
    
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
            // Also ensure the Actions header is visible
            const table = document.getElementById('detailsContainersTableBody')?.closest('table');
            if (table) {
                const thead = table.querySelector('thead tr');
                if (thead) {
                    const headers = thead.querySelectorAll('th');
                    if (headers.length > 5) {
                        const actionsHeader = headers[headers.length - 2];
                        if (actionsHeader) {
                            actionsHeader.style.display = 'table-cell';
                            actionsHeader.style.borderBottom = '1px solid #dee2e6';
                        }
                    }
                }
            }
        }, 100);
    }
}

function refreshDetailsContainersTable(instanceId) {
    const tbody = document.getElementById('detailsContainersTableBody');
    if (!tbody) return;
    
    const containers = window[`detailsContainers_${instanceId}`] || [];
    
    // Check if log column should be shown
    const config = getConfiguration();
    const hasLogColumn = !isInEditMode && containers.some(c => {
        const cEnvVars = c.environmentVariables || {};
        return cEnvVars.log_ocid && config.logGroupId;
    });
    
    // Get instance state from currentEditingInstance
    const instanceCanEdit = currentEditingInstance && currentEditingInstance.id === instanceId
        ? (currentEditingInstance.lifecycleState !== 'UPDATING' && currentEditingInstance.lifecycleState !== 'CREATING' && currentEditingInstance.lifecycleState !== 'DELETING')
        : true; // Default to true if we can't determine state
    
    if (containers.length === 0) {
        // 4 base columns (State, Name, Port, Image) + 1 conditional column (Actions/Log in edit/view mode)
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No containers</td></tr>';
        return;
    }
    
    // Detect overlapping ports
    const portMap = new Map(); // port number -> array of container indices
    const detailsPorts = window[`detailsPorts_${instanceId}`] || [];
    
    containers.forEach((container, idx) => {
        let portNum = null;
        if (container.port) {
            portNum = parseInt(container.port);
        } else if (container.portIndex !== undefined && container.portIndex !== null && container.portIndex !== '') {
            const portIndex = parseInt(container.portIndex);
            if (detailsPorts[portIndex]) {
                const port = detailsPorts[portIndex];
                portNum = typeof port.port === 'number' ? port.port : parseInt(port.port);
            }
        }
        
        if (portNum !== null && !isNaN(portNum)) {
            if (!portMap.has(portNum)) {
                portMap.set(portNum, []);
            }
            portMap.get(portNum).push(idx);
        }
    });
    
    // Find containers with overlapping ports
    const overlappingIndices = new Set();
    let hasOverlapping = false;
    portMap.forEach((indices, portNum) => {
        if (indices.length > 1) {
            hasOverlapping = true;
            indices.forEach(idx => overlappingIndices.add(idx));
        }
    });
    
    // Show notification if overlapping ports detected
    if (hasOverlapping) {
        showNotification('Warning: Some containers have overlapping port numbers. Please ensure each container uses a unique port.', 'warning', 5000);
    }
    
    // Ensure table doesn't have table-bordered class (we only want horizontal borders)
    const table = tbody.closest('table');
    if (table) {
        if (table.classList.contains('table-bordered')) {
            table.classList.remove('table-bordered');
        }
        
        // Ensure thead has table-light class for light gray background
        const thead = table.querySelector('thead');
        if (thead && !thead.classList.contains('table-light')) {
            thead.classList.add('table-light');
        }
        
        // Show/hide Actions column header and ensure horizontal borders only
        const theadRow = table.querySelector('thead tr');
        if (theadRow) {
            const headers = theadRow.querySelectorAll('th');
            headers.forEach(header => {
                header.style.borderBottom = '1px solid #dee2e6';
                header.style.borderLeft = 'none';
                header.style.borderRight = 'none';
                header.style.borderTop = 'none';
            });
            
            // Update Image header colspan based on whether Actions/Log column exists
            const imageHeader = Array.from(headers).find(h => h.textContent.includes('Image'));
            if (imageHeader) {
                const hasActionsOrLog = isInEditMode || hasLogColumn;
                imageHeader.setAttribute('colspan', hasActionsOrLog ? '2' : '1');
            }
        }
    }
    
    tbody.innerHTML = containers.map((container, idx) => {
        const containerName = container.displayName;
        
        // Store tooltip data in data attributes
        const envVars = container.environmentVariables || {};
        const cmd = container.command || [];
        const args = container.arguments || [];
        
        const envVarsJson = escapeHtmlAttribute(JSON.stringify(envVars));
        const cmdJson = escapeHtmlAttribute(JSON.stringify(cmd));
        const argsJson = escapeHtmlAttribute(JSON.stringify(args));
        
        // Get port from portIndex if port is not set
        // Get port display - show "name(port)" or just "port" if name is empty
        let portDisplay = '-';
        if (container.port) {
            const portNum = parseInt(container.port);
            const detailsPorts = window[`detailsPorts_${instanceId}`] || [];
            const portData = detailsPorts.find(p => {
                const pPortNum = typeof p.port === 'number' ? p.port : parseInt(p.port);
                return pPortNum === portNum;
            });
            if (portData) {
                portDisplay = portData.name && portData.name.trim() ? `${portData.name} (${portNum})` : `${portNum}`;
            } else {
                portDisplay = `${portNum}`;
            }
        } else if (container.portIndex !== undefined && container.portIndex !== null && container.portIndex !== '') {
            const detailsPorts = window[`detailsPorts_${instanceId}`] || [];
            const portIndex = parseInt(container.portIndex);
            if (detailsPorts[portIndex]) {
                const port = detailsPorts[portIndex];
                const portNum = typeof port.port === 'number' ? port.port : parseInt(port.port);
                portDisplay = port.name && port.name.trim() ? `${port.name} (${portNum})` : `${portNum}`;
            }
        }
        
        // Check if log column should be shown
        const config = getConfiguration();
        const hasLogColumn = !isInEditMode && containers.some(c => {
            const cEnvVars = c.environmentVariables || {};
            return cEnvVars.log_ocid && config.logGroupId;
        });
        
        // Apply red background if port overlaps
        const isOverlapping = overlappingIndices.has(idx);
        const cellStyle = isOverlapping ? 'background-color: #ffcdd2 !important;' : '';
        const rowStyle = isOverlapping ? 'background-color: #ffcdd2 !important;' : '';
        
        let html = `<tr class="container-row-hover" style="${rowStyle}" data-env-vars="${envVarsJson}" data-cmd="${cmdJson}" data-args="${argsJson}">`;
        
        html += `<td style="border-bottom: 1px solid #dee2e6; ${cellStyle}">${getStateBadgeHtml(container.lifecycleState)}</td>`;
        html += `<td style="border-bottom: 1px solid #dee2e6; ${cellStyle}"><strong class="text-primary">${containerName}</strong></td>`;
        html += `<td style="border-bottom: 1px solid #dee2e6; ${cellStyle}">${portDisplay}</td>`;
        html += `<td style="border-bottom: 1px solid #dee2e6; ${cellStyle}"><code>${container.imageUrl}</code></td>`;
        
        // Actions column - visibility controlled by edit mode
        const actionsDisplay = isInEditMode ? 'table-cell' : 'none';
        html += `<td id="containerActions_${idx}" style="display: ${actionsDisplay}; white-space: nowrap; text-align: right; border-bottom: 1px solid #dee2e6; ${cellStyle}">`;
        html += `<button class="btn btn-info btn-sm me-1" onclick="editContainerInDetails(${idx}, '${instanceId}')">Edit</button>`;
        html += `<button class="btn btn-danger btn-sm" onclick="deleteContainerInDetails(${idx}, '${instanceId}')">Delete</button>`;
        html += `</td>`;
        
        // Log button - only show in non-edit mode, if container has log_ocid env var, and log group is configured
        if (!isInEditMode) {
            const logOcid = envVars.log_ocid;
            if (logOcid && config.logGroupId) {
                html += `<td style="white-space: nowrap; border-bottom: 1px solid #dee2e6; ${cellStyle}">`;
                html += `<button class="btn btn-secondary btn-sm" onclick="showContainerLogs('${escapeHtml(logOcid)}', '${escapeHtml(containerName)}')" title="View container logs">`;
                html += `<i class="bi bi-file-text"></i> Log`;
                html += `</button>`;
                html += `</td>`;
            } else if (hasLogColumn) {
                // Add empty cell to maintain column alignment if log column exists but this container doesn't have logs
                html += `<td style="border-bottom: 1px solid #dee2e6; ${cellStyle}"></td>`;
            }
        }
        
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
    const volumeModalTitle = document.querySelector('#editVolumeModal .modal-title');
    if (volumeModalTitle) volumeModalTitle.textContent = 'Add Volume';
    
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
    const volumeModalTitle = document.querySelector('#editVolumeModal .modal-title');
    if (volumeModalTitle) volumeModalTitle.textContent = 'Edit Volume';
    
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
    const portModalTitle = document.querySelector('#editPortModal .modal-title');
    if (portModalTitle) portModalTitle.textContent = 'Add Port';
    
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
        // Path header spans over Actions column (always, since Actions column always exists)
        const tableHtml = `
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead class="table-light">
                        <tr><th style="border-bottom: 1px solid #dee2e6;">Name</th><th colspan="2" style="border-bottom: 1px solid #dee2e6;">Path</th></tr>
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
    
    // Path header always spans 2 columns (over Actions column)
    const table = tbody.closest('table');
    if (table) {
        const thead = table.querySelector('thead');
        if (thead) {
            const pathHeader = thead.querySelector('th:nth-child(2)'); // Path is the 2nd header
            if (pathHeader) {
                pathHeader.setAttribute('colspan', '2');
            }
        }
    }
    
    // Get instance state from currentEditingInstance
    const canEditVolumesRefresh = currentEditingInstance && currentEditingInstance.id === instanceId 
        ? (currentEditingInstance.lifecycleState !== 'UPDATING' && currentEditingInstance.lifecycleState !== 'CREATING' && currentEditingInstance.lifecycleState !== 'DELETING')
        : true; // Default to true if we can't determine state
    
    if (volumes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted" style="border-bottom: 1px solid #dee2e6;">No volumes</td></tr>';
        return;
    }
    
    // Actions column visibility controlled by edit mode
    const actionsDisplay = isInEditMode ? 'table-cell' : 'none';
    
    tbody.innerHTML = volumes.map((volume, idx) => {
        return `
            <tr>
                <td style="border-bottom: 1px solid #dee2e6;">${volume.name || '-'}</td>
                <td style="border-bottom: 1px solid #dee2e6;"><code>${volume.path || 'N/A'}</code></td>
                <td id="volumeActions_${idx}" style="display: ${actionsDisplay}; border-bottom: 1px solid #dee2e6;">
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
    
    // Validate subnet before showing confirmation (mandatory field)
    const subnetSelect = document.getElementById('detailsSubnetId');
    if (subnetSelect) {
        // Check HTML5 validation
        if (!subnetSelect.checkValidity()) {
            showNotification('Error: Subnet is required. Please select a subnet from the dropdown.', 'error');
            subnetSelect.focus();
            subnetSelect.reportValidity();
            return;
        }
        
        // Double-check value is not empty
        if (!subnetSelect.value || subnetSelect.value === '' || subnetSelect.value === null) {
            showNotification('Error: Subnet is required. Please select a subnet from the dropdown.', 'error');
            subnetSelect.focus();
            return;
        }
    } else {
        showNotification('Error: Subnet dropdown not found. Please refresh and try again.', 'error');
        return;
    }
    
    try {
        const config = getConfiguration();
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
                    memoryInGBs: parseFloat(container.resourceConfig?.memoryInGBs) || 16,
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
        
        // Build freeformTags (architecture, volumes and ports)
        const baseFreeformTags = {};
        
        // Add architecture tag from current instance or default to x86
        const architecture = currentEditingInstance.freeformTags?.architecture || 'x86';
        baseFreeformTags.architecture = architecture;
        
        // Preserve composeImport tag if it exists
        if (currentEditingInstance.freeformTags?.composeImport) {
            baseFreeformTags.composeImport = currentEditingInstance.freeformTags.composeImport;
        }
        
        if (volumes.length > 0) {
            const volumesTag = volumes.map((v, idx) => {
                const volumeName = v.name || `volume-${idx}`;
                return `${volumeName}:${v.path}`;
            }).join(',');
            baseFreeformTags.volumes = volumesTag;
        }
        
        // Add port mappings - resolve from portIndex if port is not set
        const detailsPorts = window[`detailsPorts_${instanceId}`] || [];
        containers.forEach((container) => {
            let portValue = container.port;
            
            // If port is not set but portIndex is, resolve it from detailsPorts
            if (!portValue && container.portIndex !== undefined && container.portIndex !== null && container.portIndex !== '') {
                const portIndex = parseInt(container.portIndex);
                if (detailsPorts[portIndex]) {
                    portValue = detailsPorts[portIndex].port.toString();
                }
            }
            
            // Add to tags if port is available
            if (portValue) {
                baseFreeformTags[container.displayName] = portValue;
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
        
        // Get required fields with fallbacks for failed CIs
        const displayName = currentEditingInstance.displayName || document.getElementById('ciName')?.value || config.projectName || 'CI';
        const compartmentId = currentEditingInstance.compartmentId || config.compartmentId;
        
        // Get subnet - validate it's selected (required field)
        const subnetSelect = document.getElementById('detailsSubnetId');
        let subnetId = null;
        
        // Subnet is mandatory - must be selected from dropdown
        if (!subnetSelect) {
            showNotification('Error: Subnet dropdown not found. Please refresh and try again.', 'error');
            return;
        }
        
        // Check if subnet is selected (empty string or null means not selected)
        if (!subnetSelect.value || subnetSelect.value === '' || subnetSelect.value === null) {
            showNotification('Error: Subnet is required. Please select a subnet from the dropdown.', 'error');
            // Focus the subnet dropdown to help user
            subnetSelect.focus();
            return;
        }
        
        subnetId = subnetSelect.value;
        
        // Final validation - ensure we have a subnet ID
        if (!subnetId) {
            showNotification('Error: Subnet is required. Please select a subnet from the dropdown.', 'error');
            subnetSelect.focus();
            return;
        }
        
        // Determine shape from architecture tag or instance shape, with fallback
        let shape = currentEditingInstance.shape;
        if (!shape) {
            // Try to get architecture from freeformTags or determine from shape name
            const architecture = baseFreeformTags.architecture || 'x86';
            shape = architecture === 'ARM64' ? 'CI.Standard.A1.Flex' : 'CI.Standard.E4.Flex';
        }
        
        // Validate required fields
        if (!displayName || !compartmentId || !shape) {
            const missingFields = [];
            if (!displayName) missingFields.push('displayName');
            if (!compartmentId) missingFields.push('compartmentId');
            if (!shape) missingFields.push('shape');
            throw new Error(`Missing required fields: ${missingFields.join(', ')}. Please ensure the container instance has all required information or check your configuration.`);
        }
        
        const payload = {
            displayName: displayName,
            compartmentId: compartmentId,
            shape: shape,
            shapeConfig: shapeConfig,
            subnetId: subnetId,
            containers: cleanedContainers,
            containerRestartPolicy: currentEditingInstance.containerRestartPolicy || 'NEVER',
            volumes: volumesPayload,
            freeformTags: Object.keys(baseFreeformTags).length > 0 ? baseFreeformTags : undefined,
            logGroupId: config.logGroupId || null
        };
        
        // Validate sidecar configurations before proceeding with delete
        showNotification('Validating sidecar configurations...', 'info');
        const tenancyResponse = await fetch('/api/oci/config/tenancy').catch(() => null);
        const tenancyData = tenancyResponse ? await tenancyResponse.json().catch(() => ({})) : {};
        const tenancyId = tenancyData.tenancyId || config.tenancyId;
        
        const validateResponse = await fetch('/api/oci/container-instances/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                containers: cleanedContainers,
                compartmentId: compartmentId,
                tenancyId: tenancyId,
                logGroupId: config.logGroupId || null
            })
        });
        
        const validateData = await validateResponse.json();
        
        if (!validateData.success) {
            // Show all validation errors using the notification system
            if (validateData.errors && validateData.errors.length > 0) {
                validateData.errors.forEach(error => {
                    showNotification(error, 'error', 8000);
                });
            } else {
                showNotification(validateData.error || 'Sidecar configuration validation failed', 'error', 8000);
            }
            
            // Show warnings if any
            if (validateData.warnings && validateData.warnings.length > 0) {
                validateData.warnings.forEach(warning => {
                    showNotification(warning, 'warning', 6000);
                });
            }
            
            // Don't proceed with delete - return early
            return;
        }
        
        // Show warnings if any (but validation passed)
        if (validateData.warnings && validateData.warnings.length > 0) {
            validateData.warnings.forEach(warning => {
                showNotification(warning, 'warning', 6000);
            });
        }
        
        // Confirm with user that delete/create will happen (only after validation passes)
        if (!confirm('Warning: This will delete the current container instance and create a new one with the same name. All changes will be saved. Continue?')) {
            return;
        }
        
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
            
            showNotification('Container Instance edit submitted succesfully!', 'success');
            
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
    
    const stopBtn = document.getElementById('detailsStopBtn');
    if (stopBtn) stopBtn.style.display = 'inline-block';
    
    const deleteBtn = document.getElementById('detailsDeleteBtn');
    if (deleteBtn) deleteBtn.style.display = 'inline-block';
    
    const closeBtn = document.getElementById('detailsCloseBtn');
    if (closeBtn) closeBtn.style.display = 'inline-block';
    
    const saveResourceManagerBtn = document.getElementById('detailsSaveResourceManagerBtn');
    if (saveResourceManagerBtn) saveResourceManagerBtn.style.display = 'inline-block';
    
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
        
        // Set up interval to refresh modal content based on config
        const currentConfig = getConfiguration();
        const autoReloadTime = currentConfig.autoReloadTime !== undefined ? currentConfig.autoReloadTime : 5;
        
        let modalRefreshInterval = null;
        if (autoReloadTime > 0) {
            modalRefreshInterval = setInterval(async () => {
                const modalInstance = bootstrap.Modal.getInstance(modalElement);
                // Only refresh if modal is still open, viewing the same instance, and not in edit mode
                if (modalInstance && modalElement.classList.contains('show') && currentModalInstanceId === instanceId && !isInEditMode) {
                    await refreshContainerInstanceModal(instanceId);
                } else {
                    // Modal closed, clear interval
                    if (modalRefreshInterval) {
                        clearInterval(modalRefreshInterval);
                    }
                    currentModalInstanceId = null;
                }
            }, autoReloadTime * 1000);
        }
        
        // Store interval ID so we can clear it when modal closes
        if (modalRefreshInterval) {
            modalElement.setAttribute('data-refresh-interval-id', modalRefreshInterval);
        }
        
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

// Restart container instance (or restore if deleted)
async function restartContainerInstance(instanceId) {
    try {
        // First, check the actual instance state
        const instanceResponse = await fetch(`/api/oci/container-instances/${instanceId}`);
        const instanceData = await instanceResponse.json();
        
        let isDeleted = false;
        let instance = null;
        
        if (instanceData.success && instanceData.data) {
            instance = instanceData.data;
            const lifecycleState = (instance.lifecycleState || '').toUpperCase();
            isDeleted = lifecycleState === 'DELETED' || lifecycleState === 'DELETING';
        }
        
        if (isDeleted && instance) {
            // Restore the deleted CI using instance data
            if (!confirm('Are you sure you want to restore this container instance? A new instance will be created with the same configuration. Volumes will be recreated from the current configuration.')) {
                return;
            }
            
            try {
                // Build restore configuration from instance data
                const restoreConfig = {
                    displayName: instance.displayName,
                    compartmentId: instance.compartmentId,
                    shape: instance.shape,
                    shapeConfig: instance.shapeConfig,
                    subnetId: instance.subnetId || (instance.vnics && instance.vnics.length > 0 ? instance.vnics[0].subnetId : null),
                    containerRestartPolicy: instance.containerRestartPolicy || 'NEVER',
                    freeformTags: instance.freeformTags || {},
                    containers: [],
                    volumes: []
                };
                
                // Get volumes from current config (localStorage) for the CI name, not from deleted container
                const config = getConfiguration();
                // Use current CI name from config, not the deleted instance's displayName
                const ciName = config.projectName || restoreConfig.displayName;
                const savedPortsVolumes = loadPortsAndVolumesForCINameForDetails(ciName);
                const volumesFromStorage = savedPortsVolumes.volumes || [];
                
                console.log('Loading volumes for restore:', {
                    ciName: ciName,
                    volumesFromStorage: volumesFromStorage,
                    volumesCount: volumesFromStorage.length
                });
                
                if (volumesFromStorage.length > 0) {
                    restoreConfig.volumes = volumesFromStorage.map((vol, idx) => {
                        // Ensure both name and path are present, use temporary names if missing
                        const volumeName = (vol.name && vol.name.trim()) || `volume-${idx}`;
                        const volumePath = (vol.path && vol.path.trim()) || `/mnt/${volumeName}`;
                        return {
                            name: volumeName,
                            path: volumePath
                        };
                    });
                    console.log('Restore volumes set from current config:', restoreConfig.volumes);
                } else {
                    restoreConfig.volumes = [];
                    console.log('No volumes found in current config for CI name:', ciName);
                }
                
                // Fetch container details to get full configuration
                // Note: We'll replace volumeMounts later with volumes from current config
                if (instance.containers && instance.containers.length > 0) {
                    for (const container of instance.containers) {
                        const containerId = container.containerId || container.id;
                        if (containerId) {
                            try {
                                const containerResponse = await fetch(`/api/oci/containers/${containerId}`);
                                const containerData = await containerResponse.json();
                                
                                if (containerData.success && containerData.data) {
                                    const containerDetails = containerData.data;
                                    restoreConfig.containers.push({
                                        displayName: containerDetails.displayName || container.displayName,
                                        imageUrl: containerDetails.imageUrl,
                                        resourceConfig: containerDetails.resourceConfig,
                                        environmentVariables: containerDetails.environmentVariables || {},
                                        command: containerDetails.command,
                                        arguments: containerDetails.arguments,
                                        // Don't include volumeMounts here - we'll set them from current config volumes
                                        volumeMounts: []
                                    });
                                } else {
                                    // Fallback to basic container info
                                    restoreConfig.containers.push({
                                        displayName: container.displayName,
                                        imageUrl: container.imageUrl,
                                        resourceConfig: container.resourceConfig || { memoryInGBs: 16, vcpus: 1 },
                                        environmentVariables: container.environmentVariables || {},
                                        command: container.command,
                                        arguments: container.arguments,
                                        // Don't include volumeMounts here - we'll set them from current config volumes
                                        volumeMounts: []
                                    });
                                }
                            } catch (containerError) {
                                console.error(`Error fetching container details for ${containerId}:`, containerError);
                                // Fallback to basic container info
                                restoreConfig.containers.push({
                                    displayName: container.displayName,
                                    imageUrl: container.imageUrl,
                                    resourceConfig: container.resourceConfig || { memoryInGBs: 16, vcpus: 1 },
                                    environmentVariables: container.environmentVariables || {},
                                    command: container.command,
                                    arguments: container.arguments,
                                    // Don't include volumeMounts here - we'll set them from current config volumes
                                    volumeMounts: []
                                });
                            }
                        }
                    }
                }
                
                // Use default subnet from config if subnetId is missing
                if (!restoreConfig.subnetId) {
                    const config = getConfiguration();
                    const defaultSubnetId = config.defaultSubnetId || config.subnetId;
                    if (defaultSubnetId) {
                        restoreConfig.subnetId = defaultSubnetId;
                        console.log('Using default subnet from config:', defaultSubnetId);
                    }
                }
                
                // Validate required fields with detailed debugging
                const missingFields = [];
                if (!restoreConfig.displayName) missingFields.push('displayName');
                if (!restoreConfig.compartmentId) missingFields.push('compartmentId');
                if (!restoreConfig.shape) missingFields.push('shape');
                if (!restoreConfig.subnetId) missingFields.push('subnetId');
                if (!restoreConfig.containers || restoreConfig.containers.length === 0) missingFields.push('containers (or empty)');
                
                if (missingFields.length > 0) {
                    console.error('Restore config validation failed. Missing fields:', missingFields);
                    console.error('Restore config:', JSON.stringify(restoreConfig, null, 2));
                    console.error('Instance data:', JSON.stringify(instance, null, 2));
                    showNotification(`Error: Invalid restore configuration. Missing required fields: ${missingFields.join(', ')}`, 'error');
                    return;
                }
                
                console.log('Restore config validation passed:', {
                    displayName: restoreConfig.displayName,
                    compartmentId: restoreConfig.compartmentId,
                    shape: restoreConfig.shape,
                    subnetId: restoreConfig.subnetId,
                    containersCount: restoreConfig.containers.length,
                    volumesCount: restoreConfig.volumes?.length || 0
                });
                
                showNotification('Restoring container instance...', 'info');
                
                // Build base freeformTags (preserve from original)
                const baseFreeformTags = restoreConfig.freeformTags || {};
                
                // Ensure architecture tag is set
                if (!baseFreeformTags.architecture) {
                    // Determine from shape
                    baseFreeformTags.architecture = restoreConfig.shape === 'CI.Standard.A1.Flex' ? 'ARM64' : 'x86';
                }
                
                // Update volumes tag from current config (not from deleted container)
                if (restoreConfig.volumes && restoreConfig.volumes.length > 0) {
                    const volumesTag = restoreConfig.volumes.map((v, idx) => {
                        const volumeName = (v.name && v.name.trim()) || `volume-${idx}`;
                        return `${volumeName}:${v.path}`;
                    }).join(',');
                    baseFreeformTags.volumes = volumesTag;
                } else {
                    // Remove volumes tag if no volumes
                    delete baseFreeformTags.volumes;
                }
                
                // Clean containers data
                const cleanedContainers = restoreConfig.containers.map(container => {
                    const cleaned = {
                        displayName: container.displayName,
                        imageUrl: container.imageUrl,
                        resourceConfig: container.resourceConfig || {
                            memoryInGBs: 16,
                            vcpus: 1
                        }
                    };
                    
                    // Add freeformTags to containers (OCI requirement)
                    if (Object.keys(baseFreeformTags).length > 0) {
                        cleaned.freeformTags = { ...baseFreeformTags };
                    }
                    
                    // Include optional fields if they exist
                    if (container.environmentVariables && Object.keys(container.environmentVariables).length > 0) {
                        cleaned.environmentVariables = container.environmentVariables;
                    }
                    if (container.command && Array.isArray(container.command) && container.command.length > 0) {
                        cleaned.command = container.command;
                    }
                    if (container.arguments && Array.isArray(container.arguments) && container.arguments.length > 0) {
                        cleaned.arguments = container.arguments;
                    }
                    
                    return cleaned;
                });
                
                // Build volumes array from restore config (from current config/localStorage)
                let volumesArray = [];
                if (restoreConfig.volumes && restoreConfig.volumes.length > 0) {
                    volumesArray = restoreConfig.volumes.map((vol) => {
                        const volumeName = (vol.name && vol.name.trim()) || vol.name;
                        return {
                            name: volumeName,
                            volumeType: 'EMPTYDIR',
                            backingStore: 'EPHEMERAL_STORAGE'
                        };
                    });
                    
                    // Map volumes from current config to all containers as volumeMounts
                    // Don't use old volumeMounts from deleted container - recreate from current volumes config
                    console.log('Mapping volumes to containers:', {
                        volumesCount: restoreConfig.volumes.length,
                        containersCount: cleanedContainers.length,
                        volumes: restoreConfig.volumes
                    });
                    
                    cleanedContainers.forEach(container => {
                        container.volumeMounts = restoreConfig.volumes.map((vol) => {
                            // Ensure both mountPath and volumeName are present and valid
                            const volumeName = (vol.name && vol.name.trim()) || `volume-${Date.now()}`;
                            const mountPath = (vol.path && vol.path.trim()) || `/mnt/${volumeName}`;
                            
                            if (!volumeName || !mountPath) {
                                console.error('Invalid volume mapping:', vol);
                                throw new Error(`Invalid volume: name="${volumeName}", path="${mountPath}"`);
                            }
                            
                            return {
                                mountPath: mountPath,
                                volumeName: volumeName
                            };
                        });
                        console.log(`Set volumeMounts for container ${container.displayName}:`, container.volumeMounts);
                    });
                } else {
                    console.log('No volumes to map - volumes array is empty');
                }
                
                // Build payload
                const payload = {
                    displayName: restoreConfig.displayName,
                    compartmentId: restoreConfig.compartmentId,
                    shape: restoreConfig.shape,
                    shapeConfig: restoreConfig.shapeConfig || {
                        memoryInGBs: 32,
                        ocpus: 2
                    },
                    subnetId: restoreConfig.subnetId,
                    containers: cleanedContainers,
                    containerRestartPolicy: restoreConfig.containerRestartPolicy || 'NEVER'
                };
                
                // Add freeformTags
                if (Object.keys(baseFreeformTags).length > 0) {
                    payload.freeformTags = baseFreeformTags;
                }
                
                // Add volumes if any
                if (volumesArray.length > 0) {
                    payload.volumes = volumesArray;
                }
                
                // Create the container instance
                const response = await fetch('/api/oci/container-instances', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showNotification('Container Instance restored successfully!', 'success');
                    
                    // Close the modal
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
                    throw new Error(data.error || 'Failed to restore container instance');
                }
            } catch (restoreError) {
                console.error('Error restoring container instance:', restoreError);
                showNotification(`Error restoring container instance: ${restoreError.message}`, 'error');
            }
        } else {
            // Normal restart for active CI
    // Confirm restart action
    if (!confirm('Are you sure you want to restart this container instance?')) {
        return;
    }
    
    try {
        showNotification('Restarting container instance...', 'info');
        
        const response = await fetch(`/api/oci/container-instances/${instanceId}/restart`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Container instance restart initiated successfully!', 'success');
            
            // Close the modal
            const modalElement = document.getElementById('containerInstanceModal');
            if (modalElement) {
                const modal = bootstrap.Modal.getInstance(modalElement);
                if (modal) {
                    modal.hide();
                }
            }
            
            // Reload container instances to reflect the new state
            await loadContainerInstances();
        } else {
            throw new Error(data.error || 'Failed to restart container instance');
                }
            } catch (restartError) {
                console.error('Error restarting container instance:', restartError);
                showNotification(`Error restarting container instance: ${restartError.message}`, 'error');
            }
        }
    } catch (error) {
        console.error('Error in restartContainerInstance:', error);
        showNotification(`Error: ${error.message}`, 'error');
    }
}

// Stop container instance
async function stopContainerInstance(instanceId) {
    // Confirm stop action
    if (!confirm('Are you sure you want to stop this container instance?')) {
        return;
    }
    
    try {
        showNotification('Stopping container instance...', 'info');
        
        const response = await fetch(`/api/oci/container-instances/${instanceId}/stop`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Container instance stop initiated successfully!', 'success');
            
            // Close the modal
            const modalElement = document.getElementById('containerInstanceModal');
            if (modalElement) {
                const modal = bootstrap.Modal.getInstance(modalElement);
                if (modal) {
                    modal.hide();
                }
            }
            
            // Reload container instances to reflect the new state
            await loadContainerInstances();
        } else {
            throw new Error(data.error || 'Failed to stop container instance');
        }
    } catch (error) {
        console.error('Error stopping container instance:', error);
        showNotification(`Error stopping container instance: ${error.message}`, 'error');
    }
}

// Save to Resource Manager
async function saveToResourceManager(instanceId) {
    if (!currentEditingInstance || currentEditingInstance.id !== instanceId) {
        showNotification('Error: Instance data not available', 'error');
        return;
    }
    
    try {
        // Get current instance data
        const containers = window[`detailsContainers_${instanceId}`] || [];
        const volumes = window[`detailsVolumes_${instanceId}`] || [];
        const ports = window[`detailsPorts_${instanceId}`] || [];
        
        // Build Terraform configuration
        const config = getConfiguration();
        const architecture = currentEditingInstance.freeformTags?.architecture || 'x86';
        const shape = architecture === 'ARM64' ? 'CI.Standard.A1.Flex' : 'CI.Standard.E4.Flex';
        
        // Get region from config or extract from subnet OCID
        let region = config.region || '';
        if (!region && currentEditingInstance.subnetId) {
            // Extract region from subnet OCID (format: ocid1.subnet.oc1.<region>...)
            const subnetMatch = currentEditingInstance.subnetId.match(/ocid1\.subnet\.oc1\.([^.]+)/);
            if (subnetMatch) {
                region = subnetMatch[1];
            }
        }
        // Fallback to common regions if still not found
        if (!region) {
            region = 'us-ashburn-1'; // Default fallback
        }
        
        // Get shape config
        const memorySelect = document.getElementById('detailsShapeMemory');
        const ocpusSelect = document.getElementById('detailsShapeOcpus');
        const shapeMemory = memorySelect ? memorySelect.value : (currentEditingInstance.shapeConfig?.memoryInGBs || '16');
        const shapeOcpus = ocpusSelect ? ocpusSelect.value : (currentEditingInstance.shapeConfig?.ocpus || '1');
        
        // Get subnet
        const subnetSelect = document.getElementById('detailsSubnetId');
        const subnetId = subnetSelect && subnetSelect.value ? subnetSelect.value : currentEditingInstance.subnetId;
        
        // Build containers configuration
        const containersConfig = containers.map((container, idx) => {
            const containerConfig = {
                display_name: container.displayName,
                image_url: container.imageUrl,
                resource_config: {
                    memory_limit_in_gbs: container.resourceConfig?.memoryInGBs || 16,
                    vcpus_limit: container.resourceConfig?.vcpus || 1
                },
                is_resource_principal_disabled: "false"
            };
            
            if (container.environmentVariables && Object.keys(container.environmentVariables).length > 0) {
                containerConfig.environment_variables = container.environmentVariables;
            }
            
            if (container.command && Array.isArray(container.command) && container.command.length > 0) {
                containerConfig.command = container.command;
            }
            
            if (container.arguments && Array.isArray(container.arguments) && container.arguments.length > 0) {
                containerConfig.arguments = container.arguments;
            }
            
            // Add volume mounts (will be generated as blocks in Terraform)
            if (volumes.length > 0) {
                containerConfig.volume_mounts = volumes.map((v, volIdx) => ({
                    mount_path: v.path,
                    volume_name: v.name || `volume-${volIdx}`
                }));
            }
            
            return containerConfig;
        });
        
        // Build volumes configuration
        const volumesConfig = volumes.map((v, idx) => ({
            name: v.name || `volume-${idx}`,
            volume_type: 'EMPTYDIR',
            backing_store: 'EPHEMERAL_STORAGE'
        }));
        
        // Get availability domain - use data source to get first AD
        // In Terraform, we'll use a data source to get availability domains
        const terraformConfig = `# Terraform configuration for Container Instance: ${currentEditingInstance.displayName}
# Generated by CI Compose

# Provider configuration for OCI Resource Manager
# Uses instance principal authentication (automatic in Resource Manager)
provider "oci" {
  region = var.region
}

# Get availability domain
data "oci_identity_availability_domain" "oci_ad" {
  compartment_id = "${currentEditingInstance.compartmentId}"
  ad_number      = 1
}

resource "oci_container_instances_container_instance" "this" {
  availability_domain = data.oci_identity_availability_domain.oci_ad.name
  compartment_id      = "${currentEditingInstance.compartmentId}"
  display_name        = "${currentEditingInstance.displayName}"
  shape               = "${shape}"
  
  shape_config {
    memory_in_gbs = ${shapeMemory}
    ocpus         = ${shapeOcpus}
  }
  
  ${architecture !== 'x86' ? `architecture = "${architecture}"` : ''}
  
  vnics {
    subnet_id = "${subnetId}"
  }
  
  container_restart_policy = "${currentEditingInstance.containerRestartPolicy || 'NEVER'}"
  
  graceful_shutdown_timeout_in_seconds = "10"
  
  state = "ACTIVE"
  
${containersConfig.map((container, idx) => {
    let containerBlock = `  containers {
    image_url    = "${container.image_url}"
    display_name = "${container.display_name}"
    
    is_resource_principal_disabled = "${container.is_resource_principal_disabled}"
    
    resource_config {
      memory_limit_in_gbs = "${container.resource_config.memory_limit_in_gbs}"
      vcpus_limit         = "${container.resource_config.vcpus_limit}"
    }`;
    
    if (container.environment_variables && Object.keys(container.environment_variables).length > 0) {
        containerBlock += `\n    environment_variables = {\n${Object.entries(container.environment_variables).map(([k, v]) => `      "${k}" = "${String(v).replace(/"/g, '\\"')}"`).join('\n')}\n    }`;
    }
    
    if (container.command && Array.isArray(container.command) && container.command.length > 0) {
        containerBlock += `\n    command = ${JSON.stringify(container.command)}`;
    }
    
    if (container.arguments && Array.isArray(container.arguments) && container.arguments.length > 0) {
        containerBlock += `\n    arguments = ${JSON.stringify(container.arguments)}`;
    }
    
    if (container.volume_mounts && container.volume_mounts.length > 0) {
        containerBlock += `\n${container.volume_mounts.map(vm => `    volume_mounts {\n      mount_path  = "${vm.mount_path}"\n      volume_name = "${vm.volume_name}"\n    }`).join('\n')}`;
    }
    
    containerBlock += `\n  }`;
    return containerBlock;
}).join('\n\n')}
${volumesConfig.length > 0 ? volumesConfig.map(vol => `  volumes {
    name         = "${vol.name}"
    volume_type  = "${vol.volume_type}"
    backing_store = "${vol.backing_store}"
  }`).join('\n\n') : ''}
  
  freeform_tags = {
${Object.entries(currentEditingInstance.freeformTags || {}).map(([k, v]) => `    "${k}" = "${String(v).replace(/"/g, '\\"')}"`).join('\n')}
  }
}

# Variable for region (required by provider)
variable "region" {
  type        = string
  default     = "${region}"
  description = "OCI region"
}
`;
        
        // Send to backend to create Resource Manager stack
        showNotification('Creating Resource Manager stack...', 'info');
        
        const response = await fetch('/api/oci/resource-manager/stacks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                displayName: `${currentEditingInstance.displayName}-stack`,
                description: `Container Instance configuration stack for ${currentEditingInstance.displayName}`,
                compartmentId: currentEditingInstance.compartmentId,
                terraformConfig: terraformConfig
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Resource Manager stack created successfully! Stack ID: ${data.data.id}`, 'success');
        } else {
            throw new Error(data.error || 'Failed to create Resource Manager stack');
        }
    } catch (error) {
        console.error('Error saving to Resource Manager:', error);
        showNotification(`Error saving to Resource Manager: ${error.message}`, 'error');
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
            showNotification('Container Instance delete submitted succesfully!', 'success');
            
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


// Sidecar data storage
let defaultSidecars = [];
let customSidecars = [];
let sidecars = []; // Combined array for backward compatibility

// Load sidecars from JSON and localStorage
async function loadSidecars() {
    try {
        // Load default sidecars from JSON
        const response = await fetch('/sidecars.json');
        if (response.ok) {
            defaultSidecars = await response.json();
            // Mark as default
            defaultSidecars.forEach(sidecar => {
                sidecar.isDefault = true;
            });
        } else {
            console.error('Failed to load sidecars.json');
            defaultSidecars = [];
        }
    } catch (error) {
        console.error('Error loading sidecars.json:', error);
        defaultSidecars = [];
    }
    
    // Load custom sidecars from localStorage
    try {
        const savedCustomSidecars = localStorage.getItem('customSidecars');
        if (savedCustomSidecars) {
            customSidecars = JSON.parse(savedCustomSidecars);
        } else {
            customSidecars = [];
        }
    } catch (error) {
        console.error('Error loading custom sidecars:', error);
        customSidecars = [];
    }
    
    // Combine for backward compatibility
    sidecars = [...defaultSidecars, ...customSidecars];
}

// Initialize sidecars on page load
loadSidecars();

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
    // Set default architecture to x86
    const archX86 = document.getElementById('ciArchX86');
    const archARM64 = document.getElementById('ciArchARM64');
    if (archX86) archX86.checked = true;
    if (archARM64) archARM64.checked = false;
    
    // Track previous architecture to detect changes
    let previousArchitecture = 'x86';
    
    // Function to update memory and OCPU dropdowns based on architecture
    const updateMemoryAndOcpuDropdowns = (architecture) => {
        const memorySelect = document.getElementById('ciShapeMemory');
        const ocpusSelect = document.getElementById('ciShapeOcpus');
        
        if (memorySelect) {
            memorySelect.innerHTML = '';
            if (architecture === 'ARM64') {
                // ARM64: 6 to 96 in increments of 6
                for (let mem = 6; mem <= 96; mem += 6) {
                    const option = document.createElement('option');
                    option.value = mem.toString();
                    option.textContent = `${mem} GB`;
                    if (mem === 6) option.selected = true; // Default to 6
                    memorySelect.appendChild(option);
                }
            } else {
                // x86: 16, 32, 64, 96, 128
                const x86MemoryOptions = [16, 32, 64, 96, 128];
                x86MemoryOptions.forEach(mem => {
                    const option = document.createElement('option');
                    option.value = mem.toString();
                    option.textContent = `${mem} GB`;
                    if (mem === 16) option.selected = true; // Default to 16
                    memorySelect.appendChild(option);
                });
            }
        }
        
        if (ocpusSelect) {
            ocpusSelect.innerHTML = '';
            if (architecture === 'ARM64') {
                // ARM64: 1-16
                for (let ocpu = 1; ocpu <= 16; ocpu++) {
                    const option = document.createElement('option');
                    option.value = ocpu.toString();
                    option.textContent = `${ocpu} OCPU`;
                    if (ocpu === 1) option.selected = true; // Default to 1
                    ocpusSelect.appendChild(option);
                }
            } else {
                // x86: 1-8
                for (let ocpu = 1; ocpu <= 8; ocpu++) {
                    const option = document.createElement('option');
                    option.value = ocpu.toString();
                    option.textContent = `${ocpu} OCPU`;
                    if (ocpu === 1) option.selected = true; // Default to 1
                    ocpusSelect.appendChild(option);
                }
            }
        }
    };
    
    // Add event listeners to update shape and dropdowns when architecture changes
    const updateShapeFromArchitecture = () => {
        const selectedArch = document.querySelector('input[name="ciArchitecture"]:checked')?.value || 'x86';
        
        // Check if architecture actually changed and containers are already added
        if (selectedArch !== previousArchitecture && containersData && containersData.length > 0) {
            showNotification('You are changing the deployment architecture. Please make sure containers are compatible with this change.', 'warning', 8000);
        }
        
        // Update previous architecture
        previousArchitecture = selectedArch;
        
        const shapeField = document.getElementById('ciShape');
        if (shapeField) {
            shapeField.value = selectedArch === 'ARM64' ? 'CI.Standard.A1.Flex' : 'CI.Standard.E4.Flex';
        }
        // Update memory and OCPU dropdowns
        updateMemoryAndOcpuDropdowns(selectedArch);
    };
    
    // Initialize dropdowns for default architecture (x86)
    updateMemoryAndOcpuDropdowns('x86');
    
    // Remove existing listeners to avoid duplicates
    if (archX86) {
        archX86.removeEventListener('change', updateShapeFromArchitecture);
        archX86.addEventListener('change', updateShapeFromArchitecture);
    }
    if (archARM64) {
        archARM64.removeEventListener('change', updateShapeFromArchitecture);
        archARM64.addEventListener('change', updateShapeFromArchitecture);
    }
    
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
    
    // Save current selection before rebuilding (by port number if possible)
    let currentSelection = portSelect.value;
    let currentPortNumber = null;
    if (currentSelection && currentSelection !== '') {
        const selectedOption = portSelect.options[portSelect.selectedIndex];
        if (selectedOption && selectedOption.textContent) {
            // Try to extract port number from selected option text
            const portMatch = selectedOption.textContent.match(/\((\d+)\)|Port (\d+)/);
            if (portMatch) {
                currentPortNumber = parseInt(portMatch[1] || portMatch[2]);
            }
        }
    }
    
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
    let restoredIndex = -1;
    portsToUse.forEach((port, index) => {
        const option = document.createElement('option');
        option.value = index.toString();
        const portNum = typeof port.port === 'number' ? port.port : parseInt(port.port);
        const displayText = port.name ? `${port.name} (${portNum})` : `Port ${portNum}`;
        option.textContent = displayText;
        portSelect.appendChild(option);
        
        // If we had a selection, try to restore it by matching port number
        if (currentPortNumber !== null && portNum === currentPortNumber) {
            restoredIndex = index;
        }
    });
    
    // Restore selection if we had one
    if (restoredIndex >= 0) {
        portSelect.value = restoredIndex.toString();
        portSelect.selectedIndex = restoredIndex + 1; // +1 because of "No port" option
    } else if (currentSelection && currentSelection !== '') {
        // Try to restore by index if port number didn't match
        const indexNum = parseInt(currentSelection);
        if (!isNaN(indexNum) && indexNum >= 0 && indexNum < portsToUse.length) {
            portSelect.value = currentSelection;
            portSelect.selectedIndex = indexNum + 1; // +1 because of "No port" option
        }
    }
    
    // Also check for data-selected-port attribute and restore selection
    const selectedPortAttr = portSelect.getAttribute('data-selected-port');
    if (selectedPortAttr) {
        const targetPortNum = parseInt(selectedPortAttr);
        for (let i = 0; i < portsToUse.length; i++) {
            const port = portsToUse[i];
            const portNum = typeof port.port === 'number' ? port.port : parseInt(port.port);
            if (portNum === targetPortNum) {
                portSelect.value = i.toString();
                portSelect.selectedIndex = i + 1; // +1 because of "No port" option
                break;
            }
        }
    }
}

// Container CRUD functions
function addContainerToTable() {
    // Reset edit form
    document.getElementById('editContainerForm').reset();
    document.getElementById('editContainerIndex').value = '';
    
    // Set modal title to "Add Container"
    const modalTitle = document.getElementById('editContainerModalTitle');
    if (modalTitle) {
        modalTitle.textContent = 'Add Container';
    }
    
    // Populate memory dropdown based on CI architecture
    const archRadio = document.querySelector('input[name="ciArchitecture"]:checked');
    const architecture = archRadio ? archRadio.value : 'x86';
    
    // Get CI's memory and OCPU as defaults
    const ciMemory = document.getElementById('ciShapeMemory')?.value || (architecture === 'ARM64' ? '6' : '16');
    const ciOcpus = document.getElementById('ciShapeOcpus')?.value || '1';
    
    populateContainerMemoryDropdown(architecture, ciMemory);
    populateContainerVcpuDropdown(architecture, ciOcpus);
    
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
    
    // Set modal title to "Edit Container"
    const modalTitle = document.getElementById('editContainerModalTitle');
    if (modalTitle) {
        modalTitle.textContent = 'Edit Container';
    }
    
    document.getElementById('editContainerIndex').value = index;
    document.getElementById('editContainerName').value = container.displayName || '';
    document.getElementById('editContainerImage').value = container.imageUrl || '';
    
    // Populate memory dropdown based on CI architecture
    const archRadio = document.querySelector('input[name="ciArchitecture"]:checked');
    const architecture = archRadio ? archRadio.value : 'x86';
    const memoryValue = container.resourceConfig?.memoryInGBs || (architecture === 'ARM64' ? '6' : '16');
    const vcpuValue = container.resourceConfig?.vcpus || '1';
    
    populateContainerMemoryDropdown(architecture, memoryValue);
    populateContainerVcpuDropdown(architecture, vcpuValue);
    
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
    // Store selected port index - handle 0 as valid index
    const portSelect = document.getElementById('editContainerPort');
    let portIndex = '';
    
    // First, try to get from editing context (set when port was added)
    if (editingDetailsContext && editingDetailsContext.selectedPortIndex !== undefined) {
        portIndex = editingDetailsContext.selectedPortIndex.toString();
        // Clear it after using
        delete editingDetailsContext.selectedPortIndex;
    }
    
    // If not in context, try reading from dropdown
    if ((!portIndex || portIndex === '') && portSelect) {
        // Try value first
        portIndex = portSelect.value;
        // If value is empty but selectedIndex is set, use that
        if ((!portIndex || portIndex === '') && portSelect.selectedIndex > 0) {
            portIndex = portSelect.options[portSelect.selectedIndex].value;
        }
        // If still empty, try to find by data-selected-port attribute
        if ((!portIndex || portIndex === '') && portSelect.hasAttribute('data-selected-port')) {
            const selectedPortNum = parseInt(portSelect.getAttribute('data-selected-port'));
            // Find the port in the dropdown by port number
            for (let i = 0; i < portSelect.options.length; i++) {
                const option = portSelect.options[i];
                if (option.value !== '') {
                    const portMatch = option.textContent.match(/\((\d+)\)|Port (\d+)/);
                    if (portMatch && (parseInt(portMatch[1] || portMatch[2]) === selectedPortNum)) {
                        portIndex = option.value;
                        break;
                    }
                }
            }
        }
    }
    
    if (portIndex !== '' && portIndex !== null && portIndex !== undefined && !isNaN(parseInt(portIndex))) {
        container.portIndex = parseInt(portIndex);
    } else {
        container.portIndex = null;
    }
    
    // Clear the data attribute after reading
    if (portSelect) {
        portSelect.removeAttribute('data-selected-port');
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
        // Use the same merged ports array logic as updateContainerPortDropdown
        if (container.portIndex !== undefined && container.portIndex !== null) {
            const detailsPorts = window[`detailsPorts_${instanceId}`] || [];
            let portsToUse = detailsPorts;
            
            // Merge with localStorage ports (same logic as dropdown)
            const config = getConfiguration();
            if (config.projectName) {
                const existingData = loadPortsAndVolumesForCINameForDetails(config.projectName);
                const localStoragePorts = existingData.ports || [];
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
            }
            
            // Use the merged array to look up the port by index
            const portIndex = parseInt(container.portIndex);
            if (portsToUse[portIndex]) {
                container.port = portsToUse[portIndex].port.toString();
                // Preserve portIndex for saveCIChanges
                container.portIndex = portIndex;
            } else {
                // If portIndex doesn't match, clear port and portIndex
                container.port = null;
                container.portIndex = null;
            }
        } else {
            // If no portIndex selected, clear port and portIndex
            container.port = null;
            container.portIndex = null;
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
                // Also ensure the Actions header is visible
                const table = document.getElementById('detailsContainersTableBody')?.closest('table');
                if (table) {
                    const thead = table.querySelector('thead tr');
                    if (thead) {
                        const headers = thead.querySelectorAll('th');
                        if (headers.length > 5) {
                            const actionsHeader = headers[headers.length - 2];
                            if (actionsHeader) {
                                actionsHeader.style.display = 'table-cell';
                                actionsHeader.style.borderBottom = '1px solid #dee2e6';
                            }
                        }
                    }
                }
            }, 100);
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
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="border-bottom: 1px solid #dee2e6;">No containers added yet. Click "Add Container" to add one.</td></tr>';
        return;
    }
    
    // Detect overlapping ports
    const portMap = new Map(); // port number -> array of container indices
    containersData.forEach((container, index) => {
        if (container.portIndex !== undefined && container.portIndex !== null && container.portIndex !== '') {
            const portIndex = parseInt(container.portIndex);
            if (portsData[portIndex]) {
                const port = portsData[portIndex];
                const portNum = typeof port.port === 'number' ? port.port : parseInt(port.port);
                if (!isNaN(portNum)) {
                    if (!portMap.has(portNum)) {
                        portMap.set(portNum, []);
                    }
                    portMap.get(portNum).push(index);
                }
            }
        }
    });
    
    // Find containers with overlapping ports
    const overlappingIndices = new Set();
    let hasOverlapping = false;
    portMap.forEach((indices, portNum) => {
        if (indices.length > 1) {
            hasOverlapping = true;
            indices.forEach(idx => overlappingIndices.add(idx));
        }
    });
    
    // Show notification if overlapping ports detected
    if (hasOverlapping) {
        showNotification('Warning: Some containers have overlapping port numbers. Please ensure each container uses a unique port.', 'warning', 5000);
    }
    
    tbody.innerHTML = containersData.map((container, index) => {
        const memory = container.resourceConfig?.memoryInGBs || 'N/A';
        const vcpus = container.resourceConfig?.vcpus || 'N/A';
        
        // Get port display text - show "name(port)" or just "port" if name is empty
        let portDisplay = '-';
        if (container.portIndex !== undefined && container.portIndex !== null && container.portIndex !== '') {
            const portIndex = parseInt(container.portIndex);
            if (portsData[portIndex]) {
                const port = portsData[portIndex];
                portDisplay = port.name && port.name.trim() ? `${port.name} (${port.port})` : `${port.port}`;
            }
        }
        
        // Apply red background if port overlaps
        const isOverlapping = overlappingIndices.has(index);
        const cellStyle = isOverlapping ? 'background-color: #ffcdd2 !important;' : '';
        const rowStyle = isOverlapping ? 'background-color: #ffcdd2 !important;' : '';
        
        // Prepare tooltip data attributes
        const envVars = container.environmentVariables || {};
        const cmd = container.command || [];
        const args = container.arguments || [];
        const envVarsJson = escapeHtmlAttribute(JSON.stringify(envVars));
        const cmdJson = escapeHtmlAttribute(JSON.stringify(cmd));
        const argsJson = escapeHtmlAttribute(JSON.stringify(args));
        
        return `
            <tr class="container-row-hover" style="${rowStyle}" data-env-vars="${envVarsJson}" data-cmd="${cmdJson}" data-args="${argsJson}">
                <td style="border-bottom: 1px solid #dee2e6; ${cellStyle}">${container.displayName || 'N/A'}</td>
                <td style="border-bottom: 1px solid #dee2e6; ${cellStyle}"><code>${container.imageUrl || 'N/A'}</code></td>
                <td style="border-bottom: 1px solid #dee2e6; ${cellStyle}">${portDisplay}</td>
                <td style="border-bottom: 1px solid #dee2e6; ${cellStyle}">${memory}</td>
                <td style="border-bottom: 1px solid #dee2e6; ${cellStyle}">${vcpus}</td>
                <td style="border-bottom: 1px solid #dee2e6; ${cellStyle}">
                    <button type="button" class="btn btn-info btn-sm me-1" onclick="editContainer(${index})"><i class="bi bi-pencil"></i></button>
                    <button type="button" class="btn btn-danger btn-sm" onclick="deleteContainer(${index})"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Initialize hover tooltips for container rows
    setTimeout(() => {
        initializeContainerTooltips();
    }, 100);
}

// Sidecar functions
async function showAddSidecarModal() {
    await loadSidecars();
    populateAddSidecarModal();
    const modal = new bootstrap.Modal(document.getElementById('addSidecarModal'));
    modal.show();
}

function populateAddSidecarModal() {
    const container = document.getElementById('addSidecarModalBody');
    if (sidecars.length === 0) {
        container.innerHTML = '<p class="text-muted">No sidecars available. Please add sidecars in the Sidecar Gallery.</p>';
        return;
    }
    
    // Get architecture from CI create modal or CI edit mode
    let selectedArchitecture = 'x86'; // default
    if (editingDetailsContext && editingDetailsContext.type === 'details') {
        // In CI edit mode, get architecture from currentEditingInstance
        // First try freeformTags, then fall back to shape
        selectedArchitecture = currentEditingInstance?.freeformTags?.architecture;
        if (!selectedArchitecture && currentEditingInstance?.shape) {
            // Determine architecture from shape: CI.Standard.A1.Flex is ARM64, others are x86
            selectedArchitecture = currentEditingInstance.shape === 'CI.Standard.A1.Flex' ? 'ARM64' : 'x86';
        }
        selectedArchitecture = selectedArchitecture || 'x86';
    } else {
        // In CI create mode, get architecture from radio buttons
        const archRadio = document.querySelector('input[name="ciArchitecture"]:checked');
        selectedArchitecture = archRadio ? archRadio.value : 'x86';
    }
    
    // Filter sidecars by architecture (only based on arch field, ignore image tag)
    // Map sidecars to their original index in the full sidecars array
    const filteredSidecars = sidecars
        .map((sidecar, originalIndex) => ({ sidecar, originalIndex }))
        .filter(({ sidecar }) => {
            const sidecarArch = sidecar.arch || 'x86'; // Default to x86 if not specified
            
            // Normalize architecture comparison (case-insensitive)
            const normalizedSidecarArch = sidecarArch.toUpperCase();
            const normalizedSelectedArch = selectedArchitecture.toUpperCase();
            
            // Filter only based on arch field, ignore image tag
            return normalizedSidecarArch === normalizedSelectedArch;
        });
    
    if (filteredSidecars.length === 0) {
        container.innerHTML = `<p class="text-muted">No sidecars available for ${selectedArchitecture} architecture. Please add sidecars in the Sidecar Gallery.</p>`;
        return;
    }
    
    container.innerHTML = filteredSidecars.map(({ sidecar, originalIndex }) => `
        <div class="col-md-6">
            <div class="card h-100">
                <div class="card-body">
                    <h6 class="card-title">${sidecar.name}</h6>
                    <p class="card-text small text-muted">${sidecar.image}</p>
                    <button type="button" class="btn btn-secondary btn-sm w-100" onclick="addSidecar(${originalIndex})">
                        Add ${sidecar.name}
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function addSidecar(index) {
    const sidecar = sidecars[index];
    if (!sidecar) return;
    
    // Check if we're in details edit mode
    if (editingDetailsContext && editingDetailsContext.type === 'details' && editingDetailsContext.itemType === 'sidecar') {
        addSidecarToDetails(index);
        return;
    }
    
    // Get config early for use throughout the function
    const config = getConfiguration();
    
    // Check for saved defaults (only for default sidecars)
    let effectiveSidecar = { ...sidecar };
    if (sidecar.isDefault) {
        try {
            const savedDefaults = localStorage.getItem(`sidecarDefaults_${sidecar.id}`);
            if (savedDefaults) {
                const defaults = JSON.parse(savedDefaults);
                // Merge defaults with original sidecar (defaults override)
                effectiveSidecar = {
                    ...sidecar,
                    port: defaults.port || sidecar.port || '',
                    mem: defaults.mem || sidecar.mem || '16',
                    ocpu: defaults.ocpu || sidecar.ocpu || '1',
                    envs: defaults.envs && defaults.envs.length > 0 ? defaults.envs : sidecar.envs,
                    volumes: defaults.volumes && defaults.volumes.length > 0 ? defaults.volumes : (sidecar.volumes || [])
                };
            }
        } catch (error) {
            console.error('Error loading sidecar defaults:', error);
        }
    }
    
    // Convert envs array to object format
    const environmentVariables = {};
    if (Array.isArray(effectiveSidecar.envs)) {
        effectiveSidecar.envs.forEach(env => {
            if (env.var && env.value !== undefined) {
                environmentVariables[env.var] = env.value;
            }
        });
    }
    
    // Handle port: add to ports list if it doesn't exist, then preselect it
    let portIndex = null;
    if (effectiveSidecar.port && effectiveSidecar.port.trim()) {
        const portNum = parseInt(effectiveSidecar.port.trim());
        if (!isNaN(portNum)) {
            // Check if port already exists in portsData
            const existingPortIndex = portsData.findIndex(p => {
                const pPortNum = typeof p.port === 'number' ? p.port : parseInt(p.port);
                return pPortNum === portNum;
            });
            
            if (existingPortIndex !== -1) {
                portIndex = existingPortIndex;
            } else {
                // Add port to portsData (name can be empty)
                const newPort = { port: portNum };
                portsData.push(newPort);
                portIndex = portsData.length - 1;
                
                // Save ports to localStorage
                savePortsAndVolumesForCIName(config.projectName);
                updatePortsTable();
            }
        }
    }
    
    // Merge volumes from sidecar into volumesData (avoid duplicates by path)
    // Skip volume merging if CI was created from Docker Compose (check parsedComposeData for create flow)
    const isComposeImport = parsedComposeData !== null;
    
    // Ensure volumes is an array
    const sidecarVolumes = effectiveSidecar.volumes || sidecar.volumes || [];
    
    if (!isComposeImport && Array.isArray(sidecarVolumes) && sidecarVolumes.length > 0) {
        // Get enabled volumes from defaults if available
        let enabledVolumes = sidecarVolumes;
        if (sidecar.isDefault) {
            try {
                const savedDefaults = localStorage.getItem(`sidecarDefaults_${sidecar.id}`);
                if (savedDefaults) {
                    const defaults = JSON.parse(savedDefaults);
                    if (defaults.volumes && defaults.volumes.length > 0) {
                        // Use volumes from defaults, filtering by enabled flag
                        enabledVolumes = defaults.volumes.filter(vol => vol.enabled !== false);
                    }
                }
            } catch (error) {
                console.error('Error loading sidecar volume defaults:', error);
            }
        } else {
            // For custom sidecars, filter by enabled flag directly from volumes
            enabledVolumes = sidecarVolumes.filter(vol => vol.enabled !== false);
        }
        
        enabledVolumes.forEach(sidecarVolume => {
            if (sidecarVolume.path) {
                // Check if volume with same path already exists
                const existingVolumeIndex = volumesData.findIndex(v => v.path === sidecarVolume.path);
                if (existingVolumeIndex === -1) {
                    // Add new volume
                    volumesData.push({
                        name: sidecarVolume.name || '',
                        path: sidecarVolume.path
                    });
                } else {
                    // Update name if sidecar volume has a name and existing doesn't
                    if (sidecarVolume.name && sidecarVolume.name.trim() && (!volumesData[existingVolumeIndex].name || !volumesData[existingVolumeIndex].name.trim())) {
                        volumesData[existingVolumeIndex].name = sidecarVolume.name.trim();
                    }
                }
            }
        });
        
        // Save volumes to localStorage
        savePortsAndVolumesForCIName(config.projectName);
        
        // Force update the main page volumes table immediately using a helper function
        const updateMainVolumesTable = () => {
            const tbody = document.getElementById('volumesTableBody');
            if (tbody) {
                if (volumesData.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted" style="border-bottom: 1px solid #dee2e6;">No volumes added yet. Click "Add Volume" to add one.</td></tr>';
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
                                <td style="border-bottom: 1px solid #dee2e6;">
                                    <span 
                                        data-bs-toggle="tooltip" 
                                        data-bs-placement="top" 
                                        data-bs-title="${escapedPath}"
                                        style="cursor: default;"
                                    >${escapeHtml(displayText)}</span>
                                </td>
                                <td style="border-bottom: 1px solid #dee2e6;">
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
            } else {
                console.warn('volumesTableBody not found in DOM');
            }
        };
        
        // Update immediately
        updateMainVolumesTable();
        
        // Also update after a very short delay to ensure DOM is ready
        setTimeout(updateMainVolumesTable, 50);
    }
    
    const container = {
        displayName: effectiveSidecar.name,
        imageUrl: effectiveSidecar.image,
        resourceConfig: {
            memoryInGBs: parseFloat(effectiveSidecar.mem || '16'),
            vcpus: parseFloat(effectiveSidecar.ocpu || '1')
        },
        environmentVariables: environmentVariables,
        portIndex: portIndex !== null ? portIndex.toString() : null
    };
    
    containersData.push(container);
    updateContainersTable();
    
    // Show notification if sidecar has environment variables that need configuration
    if (effectiveSidecar.envs && Array.isArray(effectiveSidecar.envs) && effectiveSidecar.envs.length > 0) {
        showNotification('Sidecar has been added. Please configure its environment variables and add any required volumes for proper operation.', 'info', 10000);
    }
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('addSidecarModal'));
    
    // Update volumes table using the function as well
    updateVolumesTable();
    
    modal.hide();
    
    // Update volumes table after modal closes to ensure it's visible
    modal._element.addEventListener('hidden.bs.modal', function() {
        // Reload from localStorage to ensure we have the latest data (updateTables=true by default)
        const config = getConfiguration();
        loadPortsAndVolumesForCIName(config.projectName, true); // This will call updateVolumesTable() internally
        
        // Also update after a short delay to be absolutely sure
        setTimeout(() => {
            loadPortsAndVolumesForCIName(config.projectName, true); // This will call updateVolumesTable() internally
        }, 300);
    }, { once: true });
}

// Show sidecar modal for details edit mode
async function showAddSidecarModalToDetails() {
    // Ensure we're in edit mode
    if (!isInEditMode) {
        isInEditMode = true;
    }
    
    // Store context that we're adding to details BEFORE populating modal
    // This ensures populateAddSidecarModal() can detect we're in details edit mode
    editingDetailsContext = { type: 'details', instanceId: currentEditingInstance?.id, itemType: 'sidecar' };
    
    // Load and populate sidecars before showing modal
    await loadSidecars();
    populateAddSidecarModal();
    
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
    
    // Get config early for use throughout the function
    const config = getConfiguration();
    
    // Check for saved defaults (only for default sidecars)
    let effectiveSidecar = { ...sidecar };
    if (sidecar.isDefault) {
        try {
            const savedDefaults = localStorage.getItem(`sidecarDefaults_${sidecar.id}`);
            if (savedDefaults) {
                const defaults = JSON.parse(savedDefaults);
                // Merge defaults with original sidecar (defaults override)
                effectiveSidecar = {
                    ...sidecar,
                    port: defaults.port || sidecar.port || '',
                    mem: defaults.mem || sidecar.mem || '16',
                    ocpu: defaults.ocpu || sidecar.ocpu || '1',
                    envs: defaults.envs && defaults.envs.length > 0 ? defaults.envs : sidecar.envs,
                    volumes: defaults.volumes && defaults.volumes.length > 0 ? defaults.volumes : (sidecar.volumes || [])
                };
            }
        } catch (error) {
            console.error('Error loading sidecar defaults:', error);
        }
    }
    
    // Convert envs array to object format
    const environmentVariables = {};
    if (Array.isArray(effectiveSidecar.envs)) {
        effectiveSidecar.envs.forEach(env => {
            if (env.var && env.value !== undefined) {
                environmentVariables[env.var] = env.value;
            }
        });
    }
    
    // Handle port: add to detailsPorts if it doesn't exist, then preselect it
    let portIndex = null;
    if (effectiveSidecar.port && effectiveSidecar.port.trim()) {
        const portNum = parseInt(effectiveSidecar.port.trim());
        if (!isNaN(portNum)) {
            let detailsPorts = window[`detailsPorts_${instanceId}`] || [];
            
            // Check if port already exists in detailsPorts
            const existingPortIndex = detailsPorts.findIndex(p => {
                const pPortNum = typeof p.port === 'number' ? p.port : parseInt(p.port);
                return pPortNum === portNum;
            });
            
            if (existingPortIndex !== -1) {
                portIndex = existingPortIndex;
            } else {
                // Add port to detailsPorts (name can be empty)
                const newPort = { port: portNum };
                detailsPorts.push(newPort);
                portIndex = detailsPorts.length - 1;
                window[`detailsPorts_${instanceId}`] = detailsPorts;
                
                // Also save to localStorage
                const config = getConfiguration();
                if (config.projectName) {
                    const existingData = loadPortsAndVolumesForCINameForDetails(config.projectName);
                    volumesData = existingData.volumes || [];
                    portsData = detailsPorts.map(p => {
                        const portObj = {
                            port: typeof p.port === 'number' ? p.port : parseInt(p.port)
                        };
                        if (p.name && p.name.trim()) {
                            portObj.name = p.name.trim();
                        }
                        return portObj;
                    });
                    savePortsAndVolumesForCIName(config.projectName);
                    updatePortsTable();
                }
                
                // Update port dropdown
                updateContainerPortDropdown();
            }
        }
    }
    
    // Merge volumes from sidecar into volumesData (avoid duplicates by path)
    // Always allow volume merging when editing an existing CI (even if originally created from compose)
    let detailsVolumes = window[`detailsVolumes_${instanceId}`] || [];
    if (effectiveSidecar.volumes && Array.isArray(effectiveSidecar.volumes) && effectiveSidecar.volumes.length > 0) {
        // Get enabled volumes from defaults if available
        let enabledVolumes = effectiveSidecar.volumes;
        if (sidecar.isDefault) {
            try {
                const savedDefaults = localStorage.getItem(`sidecarDefaults_${sidecar.id}`);
                if (savedDefaults) {
                    const defaults = JSON.parse(savedDefaults);
                    if (defaults.volumes && defaults.volumes.length > 0) {
                        // Use volumes from defaults, filtering by enabled flag
                        enabledVolumes = defaults.volumes.filter(vol => vol.enabled !== false);
                    }
                }
            } catch (error) {
                console.error('Error loading sidecar volume defaults:', error);
            }
        } else {
            // For custom sidecars, filter by enabled flag directly from volumes
            enabledVolumes = effectiveSidecar.volumes.filter(vol => vol.enabled !== false);
        }
        
        enabledVolumes.forEach(sidecarVolume => {
            if (sidecarVolume.path) {
                // Check if volume with same path already exists
                const existingVolumeIndex = detailsVolumes.findIndex(v => v.path === sidecarVolume.path);
                if (existingVolumeIndex === -1) {
                    // Add new volume
                    detailsVolumes.push({
                        name: sidecarVolume.name || '',
                        path: sidecarVolume.path
                    });
                } else {
                    // Update name if sidecar volume has a name and existing doesn't
                    if (sidecarVolume.name && sidecarVolume.name.trim() && (!detailsVolumes[existingVolumeIndex].name || !detailsVolumes[existingVolumeIndex].name.trim())) {
                        detailsVolumes[existingVolumeIndex].name = sidecarVolume.name.trim();
                    }
                }
            }
        });
        
        window[`detailsVolumes_${instanceId}`] = detailsVolumes;
        
        // Also save to localStorage
        if (config.projectName) {
            const existingData = loadPortsAndVolumesForCINameForDetails(config.projectName);
            volumesData = detailsVolumes;
            savePortsAndVolumesForCIName(config.projectName);
            // Reload volumesData from localStorage to ensure consistency
            loadPortsAndVolumesForCIName(config.projectName);
            // Refresh details volumes table
            setTimeout(() => {
                refreshDetailsVolumesTable(instanceId);
            }, 100);
        }
    }
    
    const container = {
        displayName: effectiveSidecar.name,
        imageUrl: effectiveSidecar.image,
        resourceConfig: {
            memoryInGBs: parseFloat(effectiveSidecar.mem || '16'),
            vcpus: parseFloat(effectiveSidecar.ocpu || '1')
        },
        environmentVariables: environmentVariables,
        lifecycleState: 'ACTIVE',
        portIndex: portIndex !== null ? portIndex.toString() : null
    };
    
    const containers = window[`detailsContainers_${instanceId}`] || [];
    containers.push(container);
    window[`detailsContainers_${instanceId}`] = containers;
    
    // Show notification if sidecar has environment variables that need configuration
    if (effectiveSidecar.envs && Array.isArray(effectiveSidecar.envs) && effectiveSidecar.envs.length > 0) {
        showNotification('Sidecar has been added. Please configure its environment variables and add any required volumes for proper operation.', 'info', 10000);
    }
    
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
            // Also ensure the Actions header is visible
            const table = document.getElementById('detailsContainersTableBody')?.closest('table');
            if (table) {
                const thead = table.querySelector('thead tr');
                if (thead) {
                    const headers = thead.querySelectorAll('th');
                    if (headers.length > 5) {
                        const actionsHeader = headers[headers.length - 2];
                        if (actionsHeader) {
                            actionsHeader.style.display = 'table-cell';
                            actionsHeader.style.borderBottom = '1px solid #dee2e6';
                        }
                    }
                }
            }
        }, 100);
    }
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('addSidecarModal'));
    modal.hide();
    
    editingDetailsContext = null;
    // Don't reset isInEditMode - we're still in edit mode
}

// Show About modal
function showAboutModal() {
    const modal = new bootstrap.Modal(document.getElementById('aboutModal'));
    modal.show();
}

// Sidecar Gallery functions
async function showSidecarGalleryModal() {
    await loadSidecars();
    displaySidecarGallery();
    const modal = new bootstrap.Modal(document.getElementById('sidecarGalleryModal'));
    modal.show();
}

function displaySidecarGallery() {
    const defaultContainer = document.getElementById('defaultSidecarsContainer');
    const customContainer = document.getElementById('customSidecarsContainer');
    
    // Display stock sidecars
    if (defaultSidecars.length === 0) {
        defaultContainer.innerHTML = '<p class="text-muted">No stock sidecars available.</p>';
    } else {
        defaultContainer.innerHTML = defaultSidecars.map((sidecar, index) => `
            <div class="col-md-4">
                <div class="card h-100">
                    <div class="card-body">
                        <div class="mb-2">
                            <h6 class="card-title mb-1">${sidecar.name}</h6>
                            <p class="card-text small text-muted mb-0">${sidecar.image}</p>
                        </div>
                        <div class="mb-2 small">
                            <span class="text-muted">Arch:</span> ${sidecar.arch || 'N/A'} | 
                            <span class="text-muted">Mem:</span> ${sidecar.mem || 'N/A'} GB | 
                            <span class="text-muted">OCPU:</span> ${sidecar.ocpu || 'N/A'} | 
                            <span class="text-muted">Port:</span> ${sidecar.port || '(none)'}
                        </div>
                        <button type="button" class="btn btn-secondary btn-sm w-100" onclick="viewSidecar('default', ${index})">
                            View Details
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    // Display custom sidecars
    if (customSidecars.length === 0) {
        customContainer.innerHTML = '<p class="text-muted">No custom sidecars yet. Click "Add Custom Sidecar" to create one.</p>';
    } else {
        customContainer.innerHTML = customSidecars.map((sidecar, index) => `
            <div class="col-md-4">
                <div class="card h-100">
                    <div class="card-body">
                        <div class="mb-2">
                            <h6 class="card-title mb-1">${sidecar.name}</h6>
                            <p class="card-text small text-muted mb-0">${sidecar.image}</p>
                        </div>
                        <div class="mb-2 small">
                            <span class="text-muted">Arch:</span> ${sidecar.arch || 'N/A'} | 
                            <span class="text-muted">Mem:</span> ${sidecar.mem || 'N/A'} GB | 
                            <span class="text-muted">OCPU:</span> ${sidecar.ocpu || 'N/A'} | 
                            <span class="text-muted">Port:</span> ${sidecar.port || '(none)'}
                        </div>
                        <button type="button" class="btn btn-secondary btn-sm w-100" onclick="viewSidecar('custom', ${index})">
                            View Details
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

function viewSidecar(type, index) {
    // Only handle default sidecars; custom sidecars go directly to edit
    if (type !== 'default') {
        editCustomSidecarByIndex(index);
        return;
    }
    
    const sidecar = defaultSidecars[index];
    if (!sidecar) return;
    
    // Populate view modal
    document.getElementById('viewSidecarId').value = sidecar.id;
    document.getElementById('viewSidecarIsDefault').value = 'true';
    document.getElementById('viewSidecarName').value = sidecar.name || '';
    document.getElementById('viewSidecarImage').value = sidecar.image || '';
    // Show "(none)" when port is empty for stock sidecars
    const portValue = sidecar.port && sidecar.port.trim() ? sidecar.port : '(none)';
    document.getElementById('viewSidecarPort').value = portValue;
    document.getElementById('viewSidecarMem').value = sidecar.mem || '';
    document.getElementById('viewSidecarOcpu').value = sidecar.ocpu || '';
    document.getElementById('viewSidecarArch').value = sidecar.arch || '';
    
    // Display environment variables
    const envsContainer = document.getElementById('viewSidecarEnvs');
    if (sidecar.envs && sidecar.envs.length > 0) {
        envsContainer.innerHTML = sidecar.envs.map(env => 
            `<div class="mb-1"><strong>${env.var}:</strong> ${env.value || ''}</div>`
        ).join('');
    } else {
        envsContainer.innerHTML = '<p class="text-muted mb-0">No environment variables</p>';
    }
    
    // Hide custom sidecar buttons, show defaults button
    document.getElementById('deleteCustomSidecarBtn').style.display = 'none';
    document.getElementById('editCustomSidecarBtn').style.display = 'none';
    document.getElementById('saveDefaultsBtn').style.display = 'inline-block';
    document.getElementById('defaultSidecarDefaultsSection').style.display = 'block';
    
    // Load saved defaults for default sidecars
        loadSidecarDefaults(sidecar.id);
    
    document.getElementById('viewSidecarModalTitle').textContent = `Sidecar: ${sidecar.name}`;
    const modal = new bootstrap.Modal(document.getElementById('viewSidecarModal'));
    modal.show();
}

function loadSidecarDefaults(sidecarId) {
    try {
        const savedDefaults = localStorage.getItem(`sidecarDefaults_${sidecarId}`);
        if (savedDefaults) {
            const defaults = JSON.parse(savedDefaults);
            document.getElementById('defaultSidecarPort').value = defaults.port || '';
            document.getElementById('defaultSidecarMem').value = defaults.mem || '';
            document.getElementById('defaultSidecarOcpu').value = defaults.ocpu || '';
            
            // Display environment variable defaults
            const envsContainer = document.getElementById('defaultSidecarEnvs');
            if (defaults.envs && defaults.envs.length > 0) {
                envsContainer.innerHTML = defaults.envs.map((env, idx) => `
                    <div class="mb-2">
                        <div class="input-group input-group-sm">
                            <span class="input-group-text">${env.var}</span>
                            <input type="text" class="form-control" id="defaultEnv_${idx}" value="${env.value || ''}" data-var="${env.var}">
                        </div>
                    </div>
                `).join('');
            } else {
                // Load from original sidecar
                const sidecar = defaultSidecars.find(s => s.id === sidecarId);
                if (sidecar && sidecar.envs && sidecar.envs.length > 0) {
                    envsContainer.innerHTML = sidecar.envs.map((env, idx) => `
                        <div class="mb-2">
                            <div class="input-group input-group-sm">
                                <span class="input-group-text">${env.var}</span>
                                <input type="text" class="form-control" id="defaultEnv_${idx}" value="${env.value || ''}" data-var="${env.var}">
                            </div>
                        </div>
                    `).join('');
                } else {
                    envsContainer.innerHTML = '<p class="text-muted mb-0">No environment variables</p>';
                }
            }
            
            // Display volume defaults
            const volumesContainer = document.getElementById('defaultSidecarVolumes');
            if (defaults.volumes && defaults.volumes.length > 0) {
                volumesContainer.innerHTML = defaults.volumes.map((vol, idx) => `
                    <div class="mb-2 volume-row">
                        <div class="input-group input-group-sm">
                            <span class="input-group-text">
                                <input type="checkbox" class="form-check-input" data-volume-enabled ${vol.enabled !== false ? 'checked' : ''} title="Enable automatic volume merging">
                            </span>
                            <span class="input-group-text">Name</span>
                            <input type="text" class="form-control" data-volume-name value="${vol.name || ''}" placeholder="e.g., data">
                            <span class="input-group-text">Path</span>
                            <input type="text" class="form-control" data-volume-path value="${vol.path || ''}" placeholder="e.g., /data" required>
                        </div>
                    </div>
                `).join('');
            } else {
                // Load from original sidecar
                const sidecar = defaultSidecars.find(s => s.id === sidecarId);
                if (sidecar && sidecar.volumes && sidecar.volumes.length > 0) {
                    volumesContainer.innerHTML = sidecar.volumes.map((vol, idx) => `
                        <div class="mb-2 volume-row">
                            <div class="input-group input-group-sm">
                                <span class="input-group-text">
                                    <input type="checkbox" class="form-check-input" data-volume-enabled checked title="Enable automatic volume merging">
                                </span>
                                <span class="input-group-text">Name</span>
                                <input type="text" class="form-control" data-volume-name value="${vol.name || ''}" placeholder="e.g., data">
                                <span class="input-group-text">Path</span>
                                <input type="text" class="form-control" data-volume-path value="${vol.path || ''}" placeholder="e.g., /data" required>
                            </div>
                        </div>
                    `).join('');
                } else {
                    volumesContainer.innerHTML = '<p class="text-muted mb-0">No volumes</p>';
                }
            }
        } else {
            // Load from original sidecar
            const sidecar = defaultSidecars.find(s => s.id === sidecarId);
            if (sidecar) {
                document.getElementById('defaultSidecarPort').value = sidecar.port || '';
                document.getElementById('defaultSidecarMem').value = sidecar.mem || '';
                document.getElementById('defaultSidecarOcpu').value = sidecar.ocpu || '';
                
                const envsContainer = document.getElementById('defaultSidecarEnvs');
                if (sidecar.envs && sidecar.envs.length > 0) {
                    envsContainer.innerHTML = sidecar.envs.map((env, idx) => `
                        <div class="mb-2">
                            <div class="input-group input-group-sm">
                                <span class="input-group-text">${env.var}</span>
                                <input type="text" class="form-control" id="defaultEnv_${idx}" value="${env.value || ''}" data-var="${env.var}">
                            </div>
                        </div>
                    `).join('');
                } else {
                    envsContainer.innerHTML = '<p class="text-muted mb-0">No environment variables</p>';
                }
                
                // Load volumes from original sidecar
                const volumesContainer = document.getElementById('defaultSidecarVolumes');
                if (sidecar.volumes && sidecar.volumes.length > 0) {
                    volumesContainer.innerHTML = sidecar.volumes.map((vol, idx) => `
                        <div class="mb-2 volume-row">
                            <div class="input-group input-group-sm">
                                <span class="input-group-text">
                                    <input type="checkbox" class="form-check-input" data-volume-enabled checked title="Enable automatic volume merging">
                                </span>
                                <span class="input-group-text">Name</span>
                                <input type="text" class="form-control" data-volume-name value="${vol.name || ''}" placeholder="e.g., data">
                                <span class="input-group-text">Path</span>
                                <input type="text" class="form-control" data-volume-path value="${vol.path || ''}" placeholder="e.g., /data" required>
                            </div>
                        </div>
                    `).join('');
                } else {
                    volumesContainer.innerHTML = '<p class="text-muted mb-0">No volumes</p>';
                }
            }
        }
    } catch (error) {
        console.error('Error loading sidecar defaults:', error);
    }
}

function saveSidecarDefaults() {
    const sidecarId = document.getElementById('viewSidecarId').value;
    const defaults = {
        port: document.getElementById('defaultSidecarPort').value,
        mem: document.getElementById('defaultSidecarMem').value,
        ocpu: document.getElementById('defaultSidecarOcpu').value,
        envs: [],
        volumes: []
    };
    
    // Collect environment variable defaults
    const envsContainer = document.getElementById('defaultSidecarEnvs');
    const envInputs = envsContainer.querySelectorAll('input[data-var]');
    envInputs.forEach(input => {
        defaults.envs.push({
            var: input.getAttribute('data-var'),
            value: input.value
        });
    });
    
    // Collect volume defaults
    const volumesContainer = document.getElementById('defaultSidecarVolumes');
    const volumeRows = volumesContainer.querySelectorAll('.volume-row');
    volumeRows.forEach(row => {
        const nameInput = row.querySelector('input[data-volume-name]');
        const pathInput = row.querySelector('input[data-volume-path]');
        const enabledCheckbox = row.querySelector('input[data-volume-enabled]');
        if (pathInput && pathInput.value.trim()) {
            defaults.volumes.push({
                name: nameInput ? nameInput.value.trim() : '',
                path: pathInput.value.trim(),
                enabled: enabledCheckbox ? enabledCheckbox.checked : true
            });
        }
    });
    
    try {
        localStorage.setItem(`sidecarDefaults_${sidecarId}`, JSON.stringify(defaults));
        showNotification('Default values saved successfully!', 'success');
        
        // Close the view modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('viewSidecarModal'));
        modal.hide();
    } catch (error) {
        console.error('Error saving sidecar defaults:', error);
        showNotification('Error saving defaults', 'error');
    }
}

function showAddCustomSidecarModal() {
    document.getElementById('addEditCustomSidecarForm').reset();
    document.getElementById('editCustomSidecarId').value = '';
    document.getElementById('addEditCustomSidecarModalTitle').textContent = 'Add Custom Sidecar';
    document.getElementById('editCustomSidecarEnvs').innerHTML = '<p class="text-muted mb-2">No environment variables added</p>';
    document.getElementById('editCustomSidecarVolumes').innerHTML = '<p class="text-muted mb-2">No volumes added</p>';
    document.getElementById('editCustomSidecarArch').value = '';
    
    // Hide delete button when adding new sidecar
    document.getElementById('deleteCustomSidecarBtnInEdit').style.display = 'none';
    
    const modal = new bootstrap.Modal(document.getElementById('addEditCustomSidecarModal'));
    modal.show();
}

function editCustomSidecarByIndex(index) {
    const sidecar = customSidecars[index];
    if (!sidecar) return;
    
    // Populate edit form
    document.getElementById('editCustomSidecarId').value = sidecar.id;
    document.getElementById('editCustomSidecarName').value = sidecar.name || '';
    document.getElementById('editCustomSidecarImage').value = sidecar.image || '';
    document.getElementById('editCustomSidecarPort').value = sidecar.port || '';
    document.getElementById('editCustomSidecarMem').value = sidecar.mem || '';
    document.getElementById('editCustomSidecarOcpu').value = sidecar.ocpu || '';
    document.getElementById('editCustomSidecarArch').value = sidecar.arch || '';
    
    // Display environment variables
    const envsContainer = document.getElementById('editCustomSidecarEnvs');
    if (sidecar.envs && sidecar.envs.length > 0) {
        envsContainer.innerHTML = sidecar.envs.map((env, idx) => `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <div class="flex-grow-1 me-2">
                    <input type="text" class="form-control form-control-sm" placeholder="Variable name" value="${env.var || ''}" data-env-var="${idx}">
                </div>
                <div class="flex-grow-1 me-2">
                    <input type="text" class="form-control form-control-sm" placeholder="Value" value="${env.value || ''}" data-env-value="${idx}">
                </div>
                <button type="button" class="btn btn-sm btn-danger" onclick="removeEnvFromCustomSidecar(${idx})">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `).join('');
        window.currentCustomSidecarEnvs = [...sidecar.envs];
    } else {
        envsContainer.innerHTML = '<p class="text-muted mb-2">No environment variables added</p>';
        window.currentCustomSidecarEnvs = [];
    }
    
    // Display volumes
    const volumesContainer = document.getElementById('editCustomSidecarVolumes');
    if (sidecar.volumes && sidecar.volumes.length > 0) {
        volumesContainer.innerHTML = sidecar.volumes.map((vol, idx) => `
            <div class="mb-2 volume-row">
                <div class="input-group input-group-sm">
                    <span class="input-group-text">
                        <input type="checkbox" class="form-check-input" data-volume-enabled ${vol.enabled !== false ? 'checked' : ''} title="Enable automatic volume merging">
                    </span>
                    <span class="input-group-text">Name</span>
                    <input type="text" class="form-control" data-volume-name value="${vol.name || ''}" placeholder="e.g., data">
                    <span class="input-group-text">Path</span>
                    <input type="text" class="form-control" data-volume-path value="${vol.path || ''}" placeholder="e.g., /data" required>
                    <button type="button" class="btn btn-outline-danger btn-sm" onclick="removeVolumeFromCustomSidecar(${idx})">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    } else {
        volumesContainer.innerHTML = '<p class="text-muted mb-2">No volumes added</p>';
    }
    
    // Show delete button and set modal title
    document.getElementById('deleteCustomSidecarBtnInEdit').style.display = 'inline-block';
    document.getElementById('addEditCustomSidecarModalTitle').textContent = 'Edit Custom Sidecar';
    
    const editModal = new bootstrap.Modal(document.getElementById('addEditCustomSidecarModal'));
    editModal.show();
}

function editCustomSidecar() {
    // Legacy function - called from view modal for default sidecars (shouldn't happen now)
    const sidecarId = document.getElementById('viewSidecarId').value;
    const sidecar = customSidecars.find(s => s.id === sidecarId);
    if (!sidecar) return;
    
    editCustomSidecarByIndex(customSidecars.findIndex(s => s.id === sidecarId));
}

function deleteCustomSidecarFromEdit() {
    const sidecarId = document.getElementById('editCustomSidecarId').value;
    const sidecar = customSidecars.find(s => s.id === sidecarId);
    if (!sidecar) return;
    
    if (!confirm(`Are you sure you want to delete the sidecar "${sidecar.name}"?`)) {
        return;
    }
    
    customSidecars = customSidecars.filter(s => s.id !== sidecarId);
    try {
        localStorage.setItem('customSidecars', JSON.stringify(customSidecars));
        sidecars = [...defaultSidecars, ...customSidecars];
        showNotification('Sidecar deleted successfully!', 'success');
        
        // Close modal and refresh gallery
        const modal = bootstrap.Modal.getInstance(document.getElementById('addEditCustomSidecarModal'));
        modal.hide();
        displaySidecarGallery();
    } catch (error) {
        console.error('Error deleting sidecar:', error);
        showNotification('Error deleting sidecar', 'error');
    }
}

function deleteCustomSidecar() {
    // Legacy function - kept for backward compatibility
    const sidecarId = document.getElementById('viewSidecarId').value;
    const sidecar = customSidecars.find(s => s.id === sidecarId);
    if (!sidecar) return;
    
    if (!confirm(`Are you sure you want to delete the sidecar "${sidecar.name}"?`)) {
        return;
    }
    
    customSidecars = customSidecars.filter(s => s.id !== sidecarId);
    try {
        localStorage.setItem('customSidecars', JSON.stringify(customSidecars));
        sidecars = [...defaultSidecars, ...customSidecars];
        showNotification('Sidecar deleted successfully!', 'success');
        
        // Close modal and refresh gallery
        const modal = bootstrap.Modal.getInstance(document.getElementById('viewSidecarModal'));
        modal.hide();
        displaySidecarGallery();
    } catch (error) {
        console.error('Error deleting sidecar:', error);
        showNotification('Error deleting sidecar', 'error');
    }
}

function addVolumeToCustomSidecar() {
    const volumesContainer = document.getElementById('editCustomSidecarVolumes');
    const volumeRow = document.createElement('div');
    volumeRow.className = 'mb-2 volume-row';
    const index = volumesContainer.querySelectorAll('.volume-row').length;
    volumeRow.innerHTML = `
        <div class="input-group input-group-sm">
            <span class="input-group-text">
                <input type="checkbox" class="form-check-input" data-volume-enabled checked title="Enable automatic volume merging">
            </span>
            <span class="input-group-text">Name</span>
            <input type="text" class="form-control" data-volume-name placeholder="e.g., data">
            <span class="input-group-text">Path</span>
            <input type="text" class="form-control" data-volume-path placeholder="e.g., /data" required>
            <button type="button" class="btn btn-outline-danger btn-sm" onclick="removeVolumeFromCustomSidecar(${index})">
                <i class="bi bi-trash"></i>
            </button>
        </div>
    `;
    
    // Remove "No volumes" message if present
    const noVolumesMsg = volumesContainer.querySelector('p.text-muted');
    if (noVolumesMsg) {
        noVolumesMsg.remove();
    }
    
    volumesContainer.appendChild(volumeRow);
}

function removeVolumeFromCustomSidecar(index) {
        const volumesContainer = document.getElementById('editCustomSidecarVolumes');
    const volumeRows = volumesContainer.querySelectorAll('.volume-row');
    if (volumeRows[index]) {
        volumeRows[index].remove();
        
        // Update display
        if (volumesContainer.querySelectorAll('.volume-row').length === 0) {
            volumesContainer.innerHTML = '<p class="text-muted mb-2">No volumes added</p>';
        }
    }
}

function addEnvToCustomSidecar() {
    if (!window.currentCustomSidecarEnvs) {
        window.currentCustomSidecarEnvs = [];
    }
    window.currentCustomSidecarEnvs.push({ var: '', value: '' });
    
    const envsContainer = document.getElementById('editCustomSidecarEnvs');
    envsContainer.innerHTML = window.currentCustomSidecarEnvs.map((env, idx) => `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <div class="flex-grow-1 me-2">
                <input type="text" class="form-control form-control-sm" placeholder="Variable name" value="${env.var || ''}" data-env-var="${idx}">
            </div>
            <div class="flex-grow-1 me-2">
                <input type="text" class="form-control form-control-sm" placeholder="Value" value="${env.value || ''}" data-env-value="${idx}">
            </div>
            <button type="button" class="btn btn-sm btn-danger" onclick="removeEnvFromCustomSidecar(${idx})">
                <i class="bi bi-trash"></i>
            </button>
        </div>
    `).join('');
}

function removeEnvFromCustomSidecar(index) {
    if (window.currentCustomSidecarEnvs) {
        window.currentCustomSidecarEnvs.splice(index, 1);
        const envsContainer = document.getElementById('editCustomSidecarEnvs');
        if (window.currentCustomSidecarEnvs.length === 0) {
            envsContainer.innerHTML = '<p class="text-muted mb-2">No environment variables added</p>';
        } else {
            envsContainer.innerHTML = window.currentCustomSidecarEnvs.map((env, idx) => `
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div class="flex-grow-1 me-2">
                        <input type="text" class="form-control form-control-sm" placeholder="Variable name" value="${env.var || ''}" data-env-var="${idx}">
                    </div>
                    <div class="flex-grow-1 me-2">
                        <input type="text" class="form-control form-control-sm" placeholder="Value" value="${env.value || ''}" data-env-value="${idx}">
                    </div>
                    <button type="button" class="btn btn-sm btn-danger" onclick="removeEnvFromCustomSidecar(${idx})">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            `).join('');
        }
    }
}

function saveCustomSidecar() {
    const form = document.getElementById('addEditCustomSidecarForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const sidecarId = document.getElementById('editCustomSidecarId').value;
    const isEdit = sidecarId !== '';
    
    // Collect form data
    const sidecar = {
        id: isEdit ? sidecarId : `custom_${Date.now()}`,
        name: document.getElementById('editCustomSidecarName').value,
        image: document.getElementById('editCustomSidecarImage').value,
        port: document.getElementById('editCustomSidecarPort').value,
        mem: document.getElementById('editCustomSidecarMem').value,
        ocpu: document.getElementById('editCustomSidecarOcpu').value,
        arch: document.getElementById('editCustomSidecarArch').value,
        envs: [],
        volumes: []
    };
    
    // Collect environment variables
    const envsContainer = document.getElementById('editCustomSidecarEnvs');
    const varInputs = envsContainer.querySelectorAll('input[data-env-var]');
    const valueInputs = envsContainer.querySelectorAll('input[data-env-value]');
    
    for (let i = 0; i < varInputs.length; i++) {
        const varInput = varInputs[i];
        const valueInput = valueInputs[i];
        if (varInput.value.trim()) {
            sidecar.envs.push({
                var: varInput.value.trim(),
                value: valueInput.value || ''
            });
        }
    }
    
    // Collect volumes
    const volumesContainer = document.getElementById('editCustomSidecarVolumes');
    const volumeRows = volumesContainer.querySelectorAll('.volume-row');
    volumeRows.forEach(row => {
        const nameInput = row.querySelector('input[data-volume-name]');
        const pathInput = row.querySelector('input[data-volume-path]');
        const enabledCheckbox = row.querySelector('input[data-volume-enabled]');
        if (pathInput && pathInput.value.trim()) {
            sidecar.volumes.push({
                name: nameInput ? nameInput.value.trim() : '',
                path: pathInput.value.trim(),
                enabled: enabledCheckbox ? enabledCheckbox.checked : true
            });
        }
    });
    
    if (isEdit) {
        // Update existing sidecar
        const index = customSidecars.findIndex(s => s.id === sidecarId);
        if (index !== -1) {
            customSidecars[index] = sidecar;
        }
    } else {
        // Add new sidecar
        customSidecars.push(sidecar);
    }
    
    try {
        localStorage.setItem('customSidecars', JSON.stringify(customSidecars));
        sidecars = [...defaultSidecars, ...customSidecars];
        showNotification(isEdit ? 'Sidecar updated successfully!' : 'Sidecar created successfully!', 'success');
        
        // Close modal and refresh gallery
        const modal = bootstrap.Modal.getInstance(document.getElementById('addEditCustomSidecarModal'));
        modal.hide();
        displaySidecarGallery();
    } catch (error) {
        console.error('Error saving custom sidecar:', error);
        showNotification('Error saving sidecar', 'error');
    }
}

// Volume CRUD functions
function addVolumeToTable() {
    document.getElementById('editVolumeForm').reset();
    document.getElementById('editVolumeIndex').value = '';
    const volumeModalTitle = document.querySelector('#editVolumeModal .modal-title');
    if (volumeModalTitle) volumeModalTitle.textContent = 'Add Volume';
    
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
    const volumeModalTitle = document.querySelector('#editVolumeModal .modal-title');
    if (volumeModalTitle) volumeModalTitle.textContent = 'Edit Volume';
    
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
            tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted" style="border-bottom: 1px solid #dee2e6;">No volumes added yet. Click "Add Volume" to add one.</td></tr>';
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
                        <td style="border-bottom: 1px solid #dee2e6;">
                            <span 
                                data-bs-toggle="tooltip" 
                                data-bs-placement="top" 
                                data-bs-title="${escapedPath}"
                                style="cursor: default;"
                            >${escapeHtml(displayText)}</span>
                        </td>
                        <td style="border-bottom: 1px solid #dee2e6;">
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
            createTbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted" style="border-bottom: 1px solid #dee2e6;">No volumes added yet. Click "Add Volume" to add one.</td></tr>';
        } else {
            createTbody.innerHTML = volumesData.map((volume, index) => {
                return `
                    <tr>
                        <td style="border-bottom: 1px solid #dee2e6;">${escapeHtml(volume.name || '-')}</td>
                        <td style="border-bottom: 1px solid #dee2e6;"><code>${escapeHtml(volume.path || 'N/A')}</code></td>
                        <td style="border-bottom: 1px solid #dee2e6;">
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
    const portModalTitle = document.querySelector('#editPortModal .modal-title');
    if (portModalTitle) portModalTitle.textContent = 'Add Port';
    
    const modalElement = document.getElementById('editPortModal');
    const modal = new bootstrap.Modal(modalElement);
    modal.show();
}

function editPort(index) {
    const port = portsData[index];
    
    document.getElementById('editPortIndex').value = index;
    document.getElementById('editPortName').value = port.name || '';
    document.getElementById('editPortNumber').value = port.port || '';
    const portModalTitle = document.querySelector('#editPortModal .modal-title');
    if (portModalTitle) portModalTitle.textContent = 'Edit Port';
    
    const modalElement = document.getElementById('editPortModal');
    const modal = new bootstrap.Modal(modalElement);
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
            
            // Don't reload from localStorage - we just saved and portsData is already updated
            // Reloading might cause timing issues or overwrite the new port
            
            // Update index page tables
            updatePortsTable();
            updateVolumesTable();
        }
        
        // If container edit modal is open, store the port number to select BEFORE updating dropdown
        const portNumber = port.port;
        const containerModal = document.getElementById('editContainerModal');
        if (containerModal && containerModal.classList.contains('show')) {
            const containerPortSelect = document.getElementById('editContainerPort');
            if (containerPortSelect) {
                // Store the port number to select in a data attribute BEFORE dropdown update
                containerPortSelect.setAttribute('data-selected-port', portNumber.toString());
            }
        }
        
        // Update port dropdown in container edit modal if it's open
        // This will restore the selection from the data attribute
        updateContainerPortDropdown();
        
        // Also explicitly select the port after dropdown update and store in editing context
        // Calculate the port index in the merged array that will be used by the dropdown
        let calculatedPortIndex = -1;
        if (editingDetailsContext && editingDetailsContext.type === 'details') {
            const instanceId = editingDetailsContext.instanceId;
            const detailsPorts = window[`detailsPorts_${instanceId}`] || [];
            const config = getConfiguration();
            let mergedPorts = [...detailsPorts];
            
            // Merge with localStorage ports (same logic as updateContainerPortDropdown)
            if (config.projectName) {
                const existingData = loadPortsAndVolumesForCINameForDetails(config.projectName);
                const localStoragePorts = existingData.ports || [];
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
            }
            
            // Find the index of the newly added port in the merged array
            const portNumber = port.port;
            for (let i = 0; i < mergedPorts.length; i++) {
                const p = mergedPorts[i];
                const pPortNum = typeof p.port === 'number' ? p.port : parseInt(p.port);
                if (pPortNum === portNumber) {
                    calculatedPortIndex = i;
                    break;
                }
            }
            
            // Store in editing context for save function to use
            if (calculatedPortIndex >= 0) {
                editingDetailsContext.selectedPortIndex = calculatedPortIndex;
            }
        }
        
        const selectPort = () => {
            const containerModal = document.getElementById('editContainerModal');
            if (containerModal && containerModal.classList.contains('show')) {
                const containerPortSelect = document.getElementById('editContainerPort');
                if (containerPortSelect) {
                    // Get the port number to select from data attribute
                    const portToSelect = containerPortSelect.getAttribute('data-selected-port');
                    if (portToSelect) {
                        const targetPortNum = parseInt(portToSelect);
                        
                        // Find the port by port number in the dropdown options
                    for (let i = 0; i < containerPortSelect.options.length; i++) {
                        const option = containerPortSelect.options[i];
                        if (option.value !== '') {
                            // Check if this option matches the port number
                            // Format can be "Port 8080" or "name (8080)"
                            const portMatch = option.textContent.match(/\((\d+)\)|Port (\d+)/);
                                if (portMatch && (parseInt(portMatch[1] || portMatch[2]) === targetPortNum)) {
                                    const portIndexValue = option.value;
                                    containerPortSelect.value = portIndexValue;
                                    containerPortSelect.selectedIndex = i;
                                    // Also set the option as selected
                                    option.selected = true;
                                    
                                    // Update editing context with the actual index from dropdown
                                    if (editingDetailsContext && editingDetailsContext.type === 'details') {
                                        editingDetailsContext.selectedPortIndex = parseInt(portIndexValue);
                                    }
                                    
                                    // Trigger change event to ensure the value is properly set
                                    containerPortSelect.dispatchEvent(new Event('change', { bubbles: true }));
                                    return true; // Found and selected
                                }
                            }
                        }
                    }
                }
            }
            return false; // Not found yet
        };
        
        // Try immediately, then with delays to ensure selection
        setTimeout(() => {
            if (!selectPort()) {
                setTimeout(() => {
                    selectPort();
                }, 100);
            }
        }, 50);
        
        // Don't clear editingDetailsContext here - we need it for container save
        // Only clear the itemType since we're done with port editing
        if (editingDetailsContext) {
            editingDetailsContext.itemType = null;
        }
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
        
        // If container edit modal is open, pre-select the newly created port
        // Store the port number in a data attribute so it persists across dropdown updates
        const portNumber = port.port;
            const containerModal = document.getElementById('editContainerModal');
            if (containerModal && containerModal.classList.contains('show')) {
                const containerPortSelect = document.getElementById('editContainerPort');
            if (containerPortSelect) {
                // Store the port number to select in a data attribute
                containerPortSelect.setAttribute('data-selected-port', portNumber.toString());
            }
        }
        
        // Update and select the port
        const selectPort = () => {
            const containerModal = document.getElementById('editContainerModal');
            if (containerModal && containerModal.classList.contains('show')) {
                const containerPortSelect = document.getElementById('editContainerPort');
                if (containerPortSelect) {
                    // Get the port number to select from data attribute or use the new port
                    const portToSelect = containerPortSelect.getAttribute('data-selected-port') || portNumber.toString();
                    const targetPortNum = parseInt(portToSelect);
                    
                    // Find the port by port number in the dropdown options
                    for (let i = 0; i < containerPortSelect.options.length; i++) {
                        const option = containerPortSelect.options[i];
                        if (option.value !== '') {
                            // Check if this option matches the port number
                            // Format can be "Port 8080" or "name (8080)"
                            const portMatch = option.textContent.match(/\((\d+)\)|Port (\d+)/);
                            if (portMatch && (parseInt(portMatch[1] || portMatch[2]) === targetPortNum)) {
                                containerPortSelect.value = option.value;
                                containerPortSelect.selectedIndex = i;
                                // Also set the option as selected
                                option.selected = true;
                                // Keep the data attribute
                                containerPortSelect.setAttribute('data-selected-port', targetPortNum.toString());
                                // Trigger change event to ensure the value is properly set
                                containerPortSelect.dispatchEvent(new Event('change', { bubbles: true }));
                                return true; // Found and selected
                            }
                        }
                    }
                }
            }
            return false; // Not found yet
        };
        
        // Try immediately, then with delays
        if (!selectPort()) {
            setTimeout(() => {
                if (!selectPort()) {
                    setTimeout(() => {
                        selectPort();
                    }, 100);
                }
            }, 100);
        }
    }
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('editPortModal'));
    modal.hide();
}

function updatePortsTable() {
    const tbody = document.getElementById('portsTableBody');
    
    if (portsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted" style="border-bottom: 1px solid #dee2e6;">No ports added yet. Click "Add Port" to add one.</td></tr>';
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
                <td style="border-bottom: 1px solid #dee2e6;">${displayText}</td>
                <td style="border-bottom: 1px solid #dee2e6;">
                    <button type="button" class="btn btn-success btn-sm me-1" onclick="editPort(${index})"><i class="bi bi-pencil"></i></button>
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
    const ciArchitecture = document.querySelector('input[name="ciArchitecture"]:checked')?.value || 'x86';
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
    html += `<dt class="col-sm-4">Subnet:</dt><dd class="col-sm-8">${subnetName}</dd>`;
    html += `<dt class="col-sm-4">Shape:</dt><dd class="col-sm-8">${ciShape}</dd>`;
    html += `<dt class="col-sm-4">Architecture:</dt><dd class="col-sm-8">${ciArchitecture}</dd>`;
    html += `<dt class="col-sm-4">Shape Memory:</dt><dd class="col-sm-8">${ciShapeMemory} GB</dd>`;
    html += `<dt class="col-sm-4">Shape OCPUs:</dt><dd class="col-sm-8">${ciShapeOcpus}</dd>`;
    html += `<dt class="col-sm-4">Compartment:</dt><dd class="col-sm-8">${compartmentName}</dd>`;
    html += '</dl>';
    html += '</div>';
    
    html += '</div>';
    
    // Containers with Ports
    html += '<div class="row mb-4">';
    html += '<div class="col-12">';
    html += '<h5 class="border-bottom pb-2 mb-3">Containers</h5>';
    html += '<div class="table-responsive"><table class="table table-sm">';
    html += '<thead class="table-light"><tr><th>Name</th><th>Image</th><th>Port</th><th>Memory (GB)</th><th>VCPUs</th></tr></thead>';
    html += '<tbody>';
    
    containersData.forEach(container => {
        const memory = container.resourceConfig?.memoryInGBs || 'N/A';
        const vcpus = container.resourceConfig?.vcpus || 'N/A';
        
        // Get port display text - show "name(port)" or just "port" if name is empty
        let portDisplay = '-';
        if (container.portIndex !== undefined && container.portIndex !== null && container.portIndex !== '') {
            const portIndex = parseInt(container.portIndex);
            if (portsData[portIndex]) {
                const port = portsData[portIndex];
                portDisplay = port.name && port.name.trim() ? `${port.name} (${port.port})` : `${port.port}`;
            }
        }
        
        html += `<tr>`;
        html += `<td><strong>${container.displayName || 'N/A'}</strong></td>`;
        html += `<td><code>${container.imageUrl || 'N/A'}</code></td>`;
        html += `<td>${portDisplay}</td>`;
        html += `<td>${memory}</td>`;
        html += `<td>${vcpus}</td>`;
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
        html += '<div class="table-responsive"><table class="table table-sm">';
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

// Go back to create CI modal from summary
function goBackToCreateCI() {
    // Close summary modal
    const summaryModalElement = document.getElementById('ciSummaryModal');
    const summaryModal = bootstrap.Modal.getInstance(summaryModalElement);
    
    if (summaryModal) {
        // Remove backdrop if it exists
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) {
            backdrop.remove();
        }
        
        // Hide the modal
        summaryModal.hide();
        
        // Wait for modal to be fully hidden, then show create modal
        summaryModalElement.addEventListener('hidden.bs.modal', function onHidden() {
            summaryModalElement.removeEventListener('hidden.bs.modal', onHidden);
            
            // Remove any remaining backdrop
            const remainingBackdrop = document.querySelector('.modal-backdrop');
            if (remainingBackdrop) {
                remainingBackdrop.remove();
            }
            
            // Remove modal-open class from body if present
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
            
            // Reopen create modal
            const createModal = new bootstrap.Modal(document.getElementById('createContainerInstanceModal'));
            createModal.show();
        }, { once: true });
    } else {
        // If no modal instance, just show create modal directly
        const createModal = new bootstrap.Modal(document.getElementById('createContainerInstanceModal'));
        createModal.show();
    }
}

// Create container instance (called from summary modal)
async function confirmCreateContainerInstance() {
    const config = getConfiguration();
    
    // Get architecture value
    const ciArchitecture = document.querySelector('input[name="ciArchitecture"]:checked')?.value || 'x86';
    
    // Build base freeformTags for CI instance (volumes, ports, and architecture)
    // Note: OCI requires all containers to have the same tags as the instance
    const baseFreeformTags = {};
    
    // Add architecture tag
    baseFreeformTags.architecture = ciArchitecture;
    
    // Add composeImport tag if this CI was created from Docker Compose
    if (parsedComposeData) {
        baseFreeformTags.composeImport = 'true';
    }
    
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
        const memoryInGBs = parseFloat(container.resourceConfig?.memoryInGBs) || 16;
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
        // So we add the same base tags (volumes, ports, and architecture) to all containers
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
    
    // Set shape based on architecture
    const ciShape = ciArchitecture === 'ARM64' ? 'CI.Standard.A1.Flex' : 'CI.Standard.E4.Flex';
    
    const payload = {
        displayName: document.getElementById('ciName').value.trim(),
        compartmentId: config.compartmentId,
        shape: ciShape,
        shapeConfig: {
            memoryInGBs: parseFloat(document.getElementById('ciShapeMemory').value),
            ocpus: parseFloat(document.getElementById('ciShapeOcpus').value)
        },
        architecture: ciArchitecture,
        subnetId: document.getElementById('ciSubnetId').value,
        containers: cleanedContainers,
        containerRestartPolicy: 'NEVER',
        logGroupId: config.logGroupId || null
    };
    
    // Add freeformTags to CI instance (must match container tags per OCI requirement)
    // baseFreeformTags already includes arch, volumes, and ports
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
        // Validate sidecar configurations before creating
        showNotification('Validating sidecar configurations...', 'info');
        const tenancyResponse = await fetch('/api/oci/config/tenancy').catch(() => null);
        const tenancyData = tenancyResponse ? await tenancyResponse.json().catch(() => ({})) : {};
        const tenancyId = tenancyData.tenancyId || config.tenancyId;
        
        const validateResponse = await fetch('/api/oci/container-instances/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                containers: cleanedContainers,
                compartmentId: config.compartmentId,
                tenancyId: tenancyId,
                logGroupId: config.logGroupId || null
            })
        });
        
        const validateData = await validateResponse.json();
        
        if (!validateData.success) {
            // Show all validation errors using the notification system
            if (validateData.errors && validateData.errors.length > 0) {
                validateData.errors.forEach(error => {
                    showNotification(error, 'error', 8000);
                });
            } else {
                showNotification(validateData.error || 'Sidecar configuration validation failed', 'error', 8000);
            }
            
            // Show warnings if any
            if (validateData.warnings && validateData.warnings.length > 0) {
                validateData.warnings.forEach(warning => {
                    showNotification(warning, 'warning', 6000);
                });
            }
            
            // Don't proceed with create - return early
            return;
        }
        
        // Show warnings if any (but validation passed)
        if (validateData.warnings && validateData.warnings.length > 0) {
            validateData.warnings.forEach(warning => {
                showNotification(warning, 'warning', 6000);
            });
        }
        
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
            showNotification('Container Instance create submitted succesfully!', 'success');
            
            // Reload container instances
            await loadContainerInstances();
        } else {
            // Show all errors from the response
            if (data.details && Array.isArray(data.details) && data.details.length > 0) {
                data.details.forEach(error => {
                    showNotification(error, 'error', 8000);
                });
            } else {
                showNotification(`Error creating container instance: ${data.error || 'Unknown error'}`, 'error', 8000);
            }
            
            // Show warnings if any
            if (data.warnings && Array.isArray(data.warnings) && data.warnings.length > 0) {
                data.warnings.forEach(warning => {
                    showNotification(warning, 'warning', 6000);
                });
            }
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
    logsContent.innerHTML = '<p style="color: #ffffff;">Loading logs...</p>';
    
    modal.show();
    
    try {
        // Get log group ID from config if available
        const config = getConfiguration();
        const params = new URLSearchParams();
        params.append('tail', '10');
        if (config.logGroupId) {
            params.append('logGroupId', config.logGroupId);
        }
        
        const response = await fetch(`/api/oci/logging/logs/${encodeURIComponent(logOcid)}?${params.toString()}`);
        const data = await response.json();
        
        if (data.success && data.data) {
            const logs = data.data;
            let logsHtml = '<pre style="background-color: #000000; color: #ffffff; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 12px; white-space: pre-wrap; word-wrap: break-word;">';
            
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

// Docker Compose Import Functions

// Store parsed data for import
let parsedComposeData = null;

// Show Import Docker Compose Modal
async function showImportDockerComposeModal() {
    const modal = new bootstrap.Modal(document.getElementById('importDockerComposeModal'));
    
    // Reset form
    document.getElementById('composeYaml').value = '';
    document.getElementById('composeFileUpload').value = '';
    document.getElementById('importWarnings').style.display = 'none';
    document.getElementById('importErrors').style.display = 'none';
    parsedComposeData = null;
    
    // Load current configuration
    const config = getConfiguration();
    
    // Load compartments
    await loadImportCompartments();
    
    // Pre-fill OCI fields from config
    if (config.compartmentId) {
        const compartmentSelect = document.getElementById('importCompartmentId');
        compartmentSelect.value = config.compartmentId;
        await loadImportSubnets(config.compartmentId);
    }
    
    if (config.subnetId || config.defaultSubnetId) {
        const subnetSelect = document.getElementById('importSubnetId');
        subnetSelect.value = config.subnetId || config.defaultSubnetId;
    }
    
    // Set architecture (default to x86)
    const architecture = config.architecture || 'x86';
    document.getElementById(`importArchitecture${architecture === 'ARM64' ? 'ARM64' : 'X86'}`).checked = true;
    
    // Set dependency delay (default: 10)
    document.getElementById('importDependencyDelay').value = 10;
    
    // Handle file upload
    document.getElementById('composeFileUpload').addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (file) {
            const text = await file.text();
            document.getElementById('composeYaml').value = text;
        }
    });
    
    modal.show();
}

// Load compartments for import modal
async function loadImportCompartments() {
    try {
        const config = getConfiguration();
        const params = new URLSearchParams();
        
        if (config.ociConfigFile) {
            params.append('configPath', config.ociConfigFile);
        }
        if (config.ociConfigProfile) {
            params.append('profile', config.ociConfigProfile);
        }
        
        // Get tenancy ID
        const tenancyResponse = await fetch(`/api/oci/config/tenancy?${params.toString()}`);
        const tenancyData = await tenancyResponse.json();
        
        if (!tenancyData.success || !tenancyData.tenancyId) {
            throw new Error('Could not get tenancy ID');
        }
        
        // Get compartments
        params.append('tenancyId', tenancyData.tenancyId);
        const response = await fetch(`/api/oci/compartments?${params.toString()}`);
        const data = await response.json();
        
        const compartmentSelect = document.getElementById('importCompartmentId');
        
        if (data.success && data.compartments) {
            compartmentSelect.innerHTML = '<option value="">Select a compartment...</option>';
            
            data.compartments.forEach(comp => {
                const option = document.createElement('option');
                option.value = comp.id;
                option.textContent = comp.name + (comp.description ? ` - ${comp.description}` : '');
                compartmentSelect.appendChild(option);
            });
            
            // Pre-select from config
            const savedConfig = getConfiguration();
            if (savedConfig.compartmentId) {
                compartmentSelect.value = savedConfig.compartmentId;
                await loadImportSubnets(savedConfig.compartmentId);
            }
        } else {
            compartmentSelect.innerHTML = '<option value="">Error loading compartments</option>';
        }
        
        // Add change listener
        compartmentSelect.addEventListener('change', async function() {
            await loadImportSubnets(this.value);
        });
    } catch (error) {
        console.error('Could not load compartments:', error);
        const compartmentSelect = document.getElementById('importCompartmentId');
        compartmentSelect.innerHTML = '<option value="">Error: ' + error.message + '</option>';
    }
}

// Load subnets for import modal
async function loadImportSubnets(compartmentId) {
    const subnetSelect = document.getElementById('importSubnetId');
    
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
            subnetSelect.innerHTML = '<option value="">Select a subnet...</option>';
            
            data.data.forEach(subnet => {
                const option = document.createElement('option');
                option.value = subnet.id;
                option.textContent = subnet.displayName || subnet.id;
                if (subnet.cidrBlock) {
                    option.textContent += ` (${subnet.cidrBlock})`;
                }
                subnetSelect.appendChild(option);
            });
            
            // Pre-select from config
            const savedConfig = getConfiguration();
            if (savedConfig.subnetId || savedConfig.defaultSubnetId) {
                subnetSelect.value = savedConfig.subnetId || savedConfig.defaultSubnetId;
            }
        } else {
            subnetSelect.innerHTML = '<option value="">No subnets found</option>';
        }
    } catch (error) {
        console.error('Could not load subnets:', error);
        subnetSelect.innerHTML = '<option value="">Error loading subnets</option>';
    }
}

// Parse Docker Compose YAML (internal function, called by importToCreateCI)
async function parseDockerCompose() {
    const yamlText = document.getElementById('composeYaml').value.trim();
    const compartmentId = document.getElementById('importCompartmentId').value;
    const subnetId = document.getElementById('importSubnetId').value;
    const architecture = document.querySelector('input[name="importArchitecture"]:checked')?.value || 'x86';
    const dependencyDelaySeconds = parseInt(document.getElementById('importDependencyDelay').value) || 10;
    
    // Hide previous errors/warnings
    document.getElementById('importWarnings').style.display = 'none';
    document.getElementById('importErrors').style.display = 'none';
    
    // Validate inputs
    if (!yamlText) {
        throw new Error('Please provide Docker Compose YAML content or upload a file.');
    }
    
    if (!compartmentId) {
        throw new Error('Please select a compartment.');
    }
    
    if (!subnetId) {
        throw new Error('Please select a subnet.');
    }
    
    // Send to parse API
    const response = await fetch('/api/docker-compose/parse', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            yaml: yamlText,
            ociConfig: {
                compartmentId: compartmentId,
                subnetId: subnetId,
                architecture: architecture,
                dependencyDelaySeconds: dependencyDelaySeconds
            }
        })
    });
    
    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.error || 'Failed to parse Docker Compose');
    }
    
    // Store parsed data
    parsedComposeData = data.payload;
    
    // Show warnings if any
    if (data.warnings && data.warnings.length > 0) {
        const warningsList = document.getElementById('importWarningsList');
        warningsList.innerHTML = '';
        data.warnings.forEach(warning => {
            const li = document.createElement('li');
            li.textContent = warning;
            warningsList.appendChild(li);
        });
        document.getElementById('importWarnings').style.display = 'block';
    }
    
    return parsedComposeData;
}

// Show import error
function showImportError(message) {
    const errorsList = document.getElementById('importErrorsList');
    errorsList.innerHTML = '';
    const li = document.createElement('li');
    li.textContent = message;
    errorsList.appendChild(li);
    document.getElementById('importErrors').style.display = 'block';
}

// Merge volumes with existing data
function mergeVolumes(existingVolumes, newVolumes) {
    const merged = [...existingVolumes];
    
    newVolumes.forEach(newVol => {
        // Check for duplicate by path (primary identifier)
        const exists = merged.some(existing => existing.path === newVol.path);
        if (!exists) {
            merged.push(newVol);
        } else {
            console.log(`Skipping duplicate volume with path: ${newVol.path}`);
        }
    });
    
    return merged;
}

// Merge ports with existing data
function mergePorts(existingPorts, newPorts) {
    const merged = [...existingPorts];
    
    newPorts.forEach(newPort => {
        // Check for duplicate by port number (primary identifier)
        const portNum = typeof newPort.port === 'number' ? newPort.port : parseInt(newPort.port);
        const exists = merged.some(existing => {
            const existingPortNum = typeof existing.port === 'number' ? existing.port : parseInt(existing.port);
            return existingPortNum === portNum;
        });
        if (!exists) {
            merged.push(newPort);
        } else {
            console.log(`Skipping duplicate port: ${portNum}`);
        }
    });
    
    return merged;
}

// Import to Create CI
async function importToCreateCI() {
    try {
        // Parse Docker Compose first (implicit parsing)
        await parseDockerCompose();
        
        if (!parsedComposeData) {
            showNotification('Failed to parse Docker Compose.', 'error');
            return;
        }
        const config = getConfiguration();
        
        // Load existing volumes and ports from localStorage
        loadPortsAndVolumesForCIName(config.projectName);
        
        // Extract volumes and ports from parsed data
        // Volumes from parsed data are in format: { name, volumeType, backingStore }
        // We need to get mount paths from container volumeMounts
        const parsedVolumesMap = new Map();
        (parsedComposeData.containers || []).forEach(container => {
            if (container.volumeMounts) {
                container.volumeMounts.forEach(mount => {
                    if (!parsedVolumesMap.has(mount.volumeName)) {
                        parsedVolumesMap.set(mount.volumeName, mount.mountPath);
                    }
                });
            }
        });
        
        const parsedVolumes = (parsedComposeData.volumes || []).map(vol => ({
            name: vol.name || `volume-${volumesData.length}`,
            path: parsedVolumesMap.get(vol.name) || `/mnt/${vol.name}`
        }));
        
        const parsedPorts = [];
        // Extract ports from freeformTags
        if (parsedComposeData.freeformTags) {
            Object.entries(parsedComposeData.freeformTags).forEach(([key, value]) => {
                if (key !== 'architecture' && key !== 'volumes' && !isNaN(parseInt(value))) {
                    parsedPorts.push({
                        port: parseInt(value),
                        name: key
                    });
                }
            });
        }
        
        // Merge with existing data
        volumesData = mergeVolumes(volumesData, parsedVolumes);
        portsData = mergePorts(portsData, parsedPorts);
        
        // Save merged data to localStorage
        savePortsAndVolumesForCIName(config.projectName);
        
        // Update UI tables
        updateVolumesTable();
        updatePortsTable();
        
        // Close import modal first
        const importModal = bootstrap.Modal.getInstance(document.getElementById('importDockerComposeModal'));
        importModal.hide();
        
        // Open create CI modal (this will reset containersData and reload volumes/ports, so we populate after)
        showCreateContainerInstanceModal();
        
        // Re-load volumes/ports after modal opens (to get the merged data we just saved)
        loadPortsAndVolumesForCIName(config.projectName);
        updateVolumesTable();
        updatePortsTable();
        
        // Populate containers data AFTER modal is opened (to avoid being cleared)
        console.log('Importing containers from parsed data:', parsedComposeData.containers);
        
        // Get architecture for minimum resource defaults
        const architecture = parsedComposeData.freeformTags?.architecture || 'x86';
        const minMemory = architecture === 'ARM64' ? 6 : 16;
        
        containersData = (parsedComposeData.containers || []).map(container => {
            // Find port index for this container
            let portIndex = null;
            if (container.freeformTags && container.freeformTags[container.displayName]) {
                const portNum = parseInt(container.freeformTags[container.displayName]);
                portIndex = portsData.findIndex(p => {
                    const pNum = typeof p.port === 'number' ? p.port : parseInt(p.port);
                    return pNum === portNum;
                });
                if (portIndex === -1) portIndex = null;
            }
            
            // Normalize resourceConfig from parser format (memoryLimitInGBs/vcpusLimit) to UI format (memoryInGBs/vcpus)
            const parserResourceConfig = container.resourceConfig || {};
            const memoryFromParser = parserResourceConfig.memoryLimitInGBs || parserResourceConfig.memoryInGBs;
            const vcpusFromParser = parserResourceConfig.vcpusLimit || parserResourceConfig.vcpus;
            
            // Use parsed values or defaults based on architecture
            const resourceConfig = {
                memoryInGBs: memoryFromParser || minMemory,
                vcpus: vcpusFromParser || 1
            };
            
            return {
                displayName: container.displayName,
                imageUrl: container.imageUrl,
                resourceConfig: resourceConfig,
                environmentVariables: container.environmentVariables || {},
                command: container.command || [],
                arguments: container.arguments || [],
                portIndex: portIndex
            };
        });
        
        // Update containers table
        console.log('Populated containersData:', containersData);
        updateContainersTable();
        
        // Set architecture (reuse architecture variable from above)
        const archRadio = document.querySelector(`input[name="ciArchitecture"][value="${architecture}"]`);
        if (archRadio) {
            archRadio.checked = true;
        }
        
        // Set shape config if available
        const memorySelect = document.getElementById('ciShapeMemory');
        const ocpusSelect = document.getElementById('ciShapeOcpus');
        
        console.log('Setting CI shape config from parsed data:', parsedComposeData.shapeConfig);
        
        if (parsedComposeData.shapeConfig) {
            // Set OCPU (should always be valid)
            if (ocpusSelect) {
                ocpusSelect.value = (parsedComposeData.shapeConfig.ocpus || 1).toString();
            }
            
            // Set memory - ensure value exists in dropdown (create modal has fixed options: 16, 32, 64, 96, 128)
            if (memorySelect) {
                const memoryValue = parsedComposeData.shapeConfig.memoryInGBs || 16;
                // Check if value exists in dropdown options
                const optionExists = Array.from(memorySelect.options).some(opt => opt.value === memoryValue.toString());
                if (optionExists) {
                    memorySelect.value = memoryValue.toString();
                } else {
                    // Use 16GB as minimum (lowest available option in create modal dropdown)
                    memorySelect.value = '16';
                }
            }
        } else {
            // No shapeConfig from parser, use architecture-specific defaults
            // Note: Create modal dropdown only has 16, 32, 64, 96, 128, so use 16GB as minimum
            if (memorySelect) {
                memorySelect.value = '16';
            }
            if (ocpusSelect) {
                ocpusSelect.value = '1';
            }
        }
        
        // Set subnet
        const subnetSelect = document.getElementById('ciSubnetId');
        if (subnetSelect && parsedComposeData.subnetId) {
            // Load subnets if needed
            if (subnetSelect.options.length === 0 || subnetSelect.value !== parsedComposeData.subnetId) {
                await loadSubnetsForCI(parsedComposeData.compartmentId);
            }
            subnetSelect.value = parsedComposeData.subnetId;
        }
        
        showNotification('Docker Compose imported successfully! Review and create the Container Instance.', 'success');
    } catch (error) {
        console.error('Error importing to Create CI:', error);
        showImportError(error.message || 'Error importing Docker Compose');
        showNotification(`Error importing: ${error.message}`, 'error');
    }
}



// Paste Docker Compose YAML from clipboard
async function pasteComposeYaml() {
    try {
        const text = await navigator.clipboard.readText();
        const composeYamlTextarea = document.getElementById("composeYaml");
        if (composeYamlTextarea) {
            composeYamlTextarea.value = text;
            showNotification("Docker Compose YAML pasted from clipboard!", "success", 2000);
        } else {
            showNotification("Compose YAML textarea not found", "error");
        }
    } catch (error) {
        console.error("Error pasting from clipboard:", error);
        showNotification("Failed to paste from clipboard. Please paste manually.", "error");
    }
}

