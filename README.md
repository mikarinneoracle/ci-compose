# CI Compose

CI Compose is a comprehensive management tool designed for Oracle Cloud Infrastructure (OCI) Container Instances. It provides an intuitive interface for creating, configuring, and managing container instances with support for multiple containers, sidecars, volumes, and networking configurations.

> **Notice:** This software (version 0.1.0) is currently intended for experimental use and evaluation purposes. It is not recommended for production environments at this time.

## Features

- Create and manage OCI Container Instances
- Configure containers with custom images, resource limits, and environment variables
- Manage sidecars from the Sidecar Gallery (stock and custom sidecars)
- Configure networking with port mappings and subnet selection
- Manage volumes and volume mounts
- View container logs (using OCI Logging sidecar) and instance details
- Edit, restart, and delete container instances

## Custom Sidecars

If you want to add a custom sidecar to this project, please contact [mika.rinne@oracle.com](mailto:mika.rinne@oracle.com).

## License

This software is licensed under the Universal Permissive License (UPL), Version 1.0.

The Universal Permissive License (UPL) is a permissive open source license that allows you to use, modify, and distribute the software with minimal restrictions.

## Contact

For questions, support, or inquiries, please contact:

**Mika Rinne**  
[mika.rinne@oracle.com](mailto:mika.rinne@oracle.com)

## Installation

```bash
npm install
```

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm run prod
```

The application will start on `http://localhost:3000` by default.

## Requirements

- Node.js
- OCI SDK credentials configured (via `~/.oci/config` or environment variables)
- Access to Oracle Cloud Infrastructure with appropriate permissions for Container Instances

