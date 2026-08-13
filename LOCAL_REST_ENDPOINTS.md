# Local REST API endpoints

The application listens on `http://localhost:3000` by default; set the `PORT` environment variable to use another port. This document covers all 37 `/api/` routes in `server.js`. It does not cover static UI or lab resources.

## Shared conventions

- OCI-backed routes accept `configPath`, `profile`, and `region` where applicable, either as query parameters or in the JSON request body. Defaults are `~/.oci/config`, `DEFAULT`, and the region in the configuration file.
- Many listing routes accept `compartmentId` as a query parameter. When set, `OCI_COMPARTMENT_ID` takes precedence. Similarly, `OCI_NAMESPACE` takes precedence over the `namespace` parameter of the buckets route.
- Responses are JSON. OCI routes generally return `success: true` with a `data` or service-specific field on success. Errors generally use a `4xx` or `5xx` status and an `error` field.
- `:name` in a path denotes a required URL path parameter.

## Basic and configuration routes

| Method | Route | Input | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | – | Service health check. |
| GET | `/api/data` | – | Sample data and a timestamp. |
| POST | `/api/data` | JSON: `message` | Returns the received message and a timestamp. |
| GET | `/api/oci/config/profiles` | `configPath` | Reads the profiles from the OCI configuration file. |
| GET | `/api/oci/config/region` | `configPath`, `profile` | Returns the region for the selected profile. |
| GET | `/api/oci/config/namespace` | OCI connection settings | Retrieves the Object Storage namespace. |
| GET | `/api/oci/config/tenancy` | `configPath`, `profile` | Returns the tenancy OCID for the selected profile. |

## IAM and resource listing

| Method | Route | Input | Purpose |
| --- | --- | --- | --- |
| GET | `/api/oci/compartments` | `tenancyId` (required) | Lists active, accessible compartments recursively. |
| GET | `/api/oci/compartments/:compartmentId` | path: `compartmentId` | Retrieves compartment details. |
| GET | `/api/oci/identity/active-domain` | OCI connection settings | Returns the first active IAM domain in the tenancy root. |
| POST | `/api/oci/identity/dynamic-group` | JSON: `name`, `matchingRule` (required), `description` | Creates a dynamic group or updates one with the same name. |
| POST | `/api/oci/identity/policies` | JSON: `compartmentId`, non-empty `policies` array | Creates or updates the fixed-name `ci-compose` policy in the compartment. |
| GET | `/api/oci/availability-domains` | `compartmentId` | Lists availability domains. Required unless supplied through the environment. |
| GET | `/api/oci/instances` | `compartmentId` | Lists Compute instances. |
| GET | `/api/oci/object-storage/namespaces` | OCI connection settings | Retrieves the Object Storage namespace. |
| GET | `/api/oci/object-storage/buckets` | `namespace`, `compartmentId` | Lists Object Storage buckets. |
| GET | `/api/oci/logging/log-groups` | `compartmentId` | Lists Logging log groups. |

## Container Instances

| Method | Route | Input | Purpose |
| --- | --- | --- | --- |
| GET | `/api/oci/container-instances` | `compartmentId` | Lists Container Instances from newest to oldest. |
| GET | `/api/oci/container-instances/:instanceId` | path: `instanceId` | Retrieves complete Container Instance details. |
| POST | `/api/oci/container-instances/validate` | JSON: `containers`, `compartmentId` (required); `tenancyId`, `logGroupId` | Validates sidecar configuration before creation. |
| POST | `/api/oci/container-instances` | JSON: `displayName`, `compartmentId`, `shape`, `subnetId` or a primary member of `vnics[]`, and `containers[]` (required); optional `shapeConfig`, `volumes`, `containerRestartPolicy`, `freeformTags`, `logGroupId`, `tenancyId` | Creates a Container Instance. `shapeConfig` is calculated from the containers when omitted. An FSS volume with `volumeType: "OCI_FSS_FILE_SYSTEM"` requires `mountTarget.id` and `export.id`. |
| DELETE | `/api/oci/container-instances/:instanceId` | path: `instanceId` | Initiates Container Instance deletion. |
| POST | `/api/oci/container-instances/:instanceId/restart` | path: `instanceId` | Initiates a restart. |
| POST | `/api/oci/container-instances/:instanceId/stop` | path: `instanceId` | Initiates a stop. |
| GET | `/api/oci/containers/:containerId` | path: `containerId` | Retrieves a single container's details. |

Each `containers[]` item supports `displayName`, `imageUrl`, `resourceConfig` (`vcpus`/`vcpusLimit`, `memoryInGBs`/`memoryLimitInGBs`), `environmentVariables`, `arguments`, `command`, `volumeMounts`, and `freeformTags`. The create route normalizes resource limits to OCI's `vcpusLimit` and `memoryLimitInGBs` fields.

## Logging, networking, and FSS

| Method | Route | Input | Purpose |
| --- | --- | --- | --- |
| GET | `/api/oci/logging/logs/:logOcid` | path: `logOcid`; optional `tail` (default 10), `logGroupId` | Retrieves log content from the last 24 hours through Unified Logging Search. |
| GET | `/api/oci/logging/test-search/:logGroupId` | path: `logGroupId`; optional `tail` (default 100) | Retrieves log entries from the last 24 hours from a log group, for testing. |
| GET | `/api/oci/networking/vcns` | `compartmentId` | Lists VCNs. |
| GET | `/api/oci/networking/vcns/:vcnId` | path: `vcnId` | Retrieves VCN details. |
| GET | `/api/oci/networking/subnets` | `compartmentId`; optional `vcnId`, `subnetId` | Lists subnets; `subnetId` retrieves one subnet. |
| GET | `/api/oci/networking/vnics/:vnicId` | path: `vnicId` | Retrieves VNIC details. |
| GET | `/api/oci/networking/security-lists` | `compartmentId`; optional `vcnId` | Lists security lists. |
| GET | `/api/oci/filestorage/mount-targets` | `compartmentId`; optional `availabilityDomain`, `tenancyId` | Lists active FSS mount targets. Without an availability domain parameter, a tenancy OCID is needed to list availability domains. |
| GET | `/api/oci/filestorage/exports` | one of `exportSetId`, `mountTargetId`, or `compartmentId` | Lists active FSS exports and their export options. |

## Docker Compose and Resource Manager

| Method | Route | Input | Purpose |
| --- | --- | --- | --- |
| POST | `/api/docker-compose/parse` | JSON: `yaml`, `ociConfig.compartmentId`, and `ociConfig.subnetId` | Parses and validates Docker Compose YAML, then converts it to an OCI Container Instance payload. |
| POST | `/api/docker-compose/export` | JSON: either `instanceId` or `payload` | Converts an OCI Container Instance payload to Docker Compose YAML. When `payload` is omitted, `instanceId` is fetched from OCI first. |
| POST | `/api/oci/resource-manager/stacks` | JSON: `displayName`, `compartmentId`, `terraformConfig` (required); `description` | Packages the Terraform configuration as `main.tf` and creates an OCI Resource Manager stack. |

## Other local HTTP routes

The following are UI or static-file routes, not REST API endpoints: `/labs.html`, `/nginx.html`, `/26ai-ords.html`, `/springboot-grafana.html`, `/nodejs-postgresql-vault.html`, `/images/*`, and files served from `public/` (for example, `/` and `/sidecars.json`). An unknown `/api/*` path returns a JSON `404` error.
