// Check server status on page load
document.addEventListener('DOMContentLoaded', function() {
    checkServerStatus();
    loadConfiguration();
});

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

// Handle form submission
document.getElementById('dataForm').addEventListener('submit', async function(e) {
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

