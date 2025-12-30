# CI Compose Labs

Experimental features and advanced container instance configurations

## Lab Configurations

### [NGINX with Object Storage and Logs](../nginx.html)

A high-performance web server configuration with Object Storage integration and centralized logging capabilities.

**Components:**
- **NGINX** - Web server and reverse proxy
- **Object Storage Sidecar** - Site content retrieval
- **Logs Sidecar** - Centralized log collection and monitoring

**Technologies:** Web Server, Object Storage, Logging

---

### 26ai Database with ORDS and Object Storage

A database-driven application stack with Oracle REST Data Services and Object Storage integration for scalable data processing and storage.

**Components:**
- **26ai Database** - Database system
- **ORDS** - Oracle REST Data Services
- **SQLcli** - Executes SQL scripts for final setup
- **Object Storage Sidecar** - SQL retrieval for database configuration

**Technologies:** Database, ORDS, Object Storage

---

### Java Spring Boot with Monitoring Stack

A complete Java application with comprehensive monitoring, metrics collection, and visualization using Prometheus and Grafana.

**Components:**
- **Java Spring Boot** - Enterprise Java application
- **Node Exporter** - System metrics exporter
- **Prometheus** - Metrics collection and storage
- **Grafana** - Metrics visualization and dashboards
- **Object Storage Sidecar** - Prometheus and Grafana configuration
- **Logs Sidecar** - Application log aggregation

**Technologies:** Java, Prometheus, Grafana, Monitoring

---

### NodeJS Swagger API with PostgreSQL and Vault

A secure RESTful API built with Node.js, featuring API documentation, PostgreSQL database, and secrets management.

**Components:**
- **NodeJS Swagger API** - RESTful API with OpenAPI documentation
- **PostgreSQL** - Relational database, OCI managed
- **Vault Sidecar** - Secure storage retrieval for PostgreSQL connection string
- **Logs Sidecar** - API and application logging

**Technologies:** Node.js, PostgreSQL, Vault, API

---

## About Sidecars

**Object Storage (OS)**, **Logs**, and **Vault** are sidecars available from the Sidecar Gallery. These sidecars provide additional functionality such as file storage, centralized logging, and secrets management to your container instances.
