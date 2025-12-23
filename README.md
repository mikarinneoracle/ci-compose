# CI Compose

CI Compose is a comprehensive management tool designed for Oracle Cloud Infrastructure (OCI) Container Instances. It provides an intuitive interface for creating, configuring, and managing container instances with support for multiple containers, sidecars, volumes, and networking configurations.

> **Notice:** This software (version 0.1.0) is currently intended for experimental use and evaluation purposes. It is not recommended for production environments at this time.

## Features

- Create and manage OCI Container Instances
- Configure containers with custom images, sidecars, resource limits, and environment variables
- Manage sidecars from the Sidecar Gallery (stock and custom sidecars)
- Configure networking with port mappings and subnet selection. Subnet security lists are not modified automatically and must be updated manually as required.
- Manage volumes and volume mounts shared between containers for data exchange
- View container logs (using OCI Logging sidecar) and instance details
- Edit, restart, stop, and delete container instances
- Export Container Instances configurations to OCI Resource Manager (Terraform)

## Custom Sidecars

If you want to add a custom sidecar to this project, please contact [@mikarinneoracle](https://github.com/mikarinneoracle).

## License

This software is licensed under the Universal Permissive License (UPL), Version 1.0.

The Universal Permissive License (UPL) is a permissive open source license that allows you to use, modify, and distribute the software with minimal restrictions.

## Contact

For questions, support, or inquiries, please contact:

**Mika Rinne**  
[@mikarinneoracle](https://github.com/mikarinneoracle)

## Getting Started

### Prerequisites

Before you begin, ensure you have:

- **Node.js** installed (version 14 or higher recommended)
- **Oracle Cloud Infrastructure (OCI) CLI** properly configured with valid credentials
- Access to an OCI tenancy with the appropriate permissions to use Container Instances, Networking, Logging, Vault, and Object Storage services, where applicable
- OCI SDK credentials configured (via `~/.oci/config` or environment variables)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/mikarinneoracle/ci-compose.git
   cd ci-compose
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the application:**
   ```bash
   npm run dev
   ```
   
   For production use:
   ```bash
   npm run prod
   ```
   
   The application will start on `http://localhost:3000` by default.

### Configuration

Once the application is running, access the Configuration menu to set up your environment:

1. **CI Name:** Enter a name for your container instance deployments and respective settings. This name will be used as a prefix for all container instances you create and will help organize your deployments.

2. **Compartment:** Select the OCI compartment where you want to create and manage your container instances.

3. **Default Subnet:** Choose the default subnet for your container instances. This subnet is preselected during instance creation but can be overridden on a per-instance basis if required.

   When using a private subnet for container instance creation, access must be provided through an OCI API Gateway or Load Balancer, with the corresponding security rules configured manually. Using a private subnet is generally recommended as a best practice for improved security.

4. **Default Log Group (Optional):** Select a default log group if you want to view container logs through the web interface using the OCI Logging sidecar. This configuration is optional.

5. **Additional Settings:** Configure other settings such as:
   - OCI Config File Path (default: `~/.oci/config`)
   - OCI Config Profile (default: `DEFAULT`)
   - Region (auto-loaded from config file when available)
   - Auto-Reload Time (in seconds, 0 to disable)

After completing the configuration, you can start creating and managing container instances through the web interface.

## Requirements

- Node.js
- OCI SDK credentials configured (via `~/.oci/config` or environment variables)
- Access to Oracle Cloud Infrastructure with appropriate permissions for Container Instances
