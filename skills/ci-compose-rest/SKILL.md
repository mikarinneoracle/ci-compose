---
name: ci-compose-rest
description: Manage CI Compose deployments through its local REST API, with OCI access restricted to Container Instances, Object Storage, FSS, and logs in the selected configuration scope.
---

# CI Compose REST

Use this skill only against the locally running CI Compose server. Read `../../LOCAL_REST_ENDPOINTS.md` before selecting an endpoint.

## Scope boundary — enforce this

The CI Compose REST API is the skill's exclusive OCI access path. Never invoke the OCI CLI directly. The skill may use only these CI Compose REST-backed resources:

- Object Storage buckets and objects in the selected configuration's compartment.
- Existing File Storage Service mount targets and exports in that compartment, when needed by a deployment.
- Read-only logs in the selected configuration's `logGroupId`.
- Read-only Autonomous Database, Vault, and Vault Secret names plus OCIDs in that compartment, only to configure the `AdbWallet` and `VaultReader` sidecars.
- Read-only VCN and subnet discovery through CI Compose REST only.

Do not use any OCI CLI command or a CI Compose endpoint for any other OCI service. In particular, do not access or change Compute, IAM, Resource Manager, Functions, Kubernetes, Database resources beyond the allowed name/OCID listing, or Vault and Secret resources beyond the allowed name/OCID listing. Never retrieve Secret contents. Networking may be listed only through the REST endpoints below, and networking resources must never be changed. Do not create, alter, or delete FSS infrastructure; use existing mount targets and exports only.

When a request is outside this boundary, do not call an OCI command or API. Reply: `Blocked: CI Compose skills are restricted to Container Instance deployments, Object Storage, existing FSS, logs, sidecar-only ADB/Vault/Secret name and OCID discovery, and read-only VCN/subnet discovery in the selected configuration scope.`

## Establish the selected scope

1. Confirm the local server with `GET /api/health`.
2. Load the selected shared configuration with `GET /api/configs` and `GET /api/configs/:configId`.
3. Resolve the tenancy with `GET /api/oci/config/tenancy`, then discover available targets only with `GET /api/oci/compartments?tenancyId=<tenancyId>`. This lists active, accessible compartments recursively.
4. Require the user to select one returned compartment. Use only that configuration's `compartmentId` for Object Storage, FSS, and Container Instance requests. For log reads, require the configuration's `logGroupId`; do not read another log group.

If the user selects a different returned compartment, update the shared configuration with `PUT /api/configs/:configId` and its latest revision before making scoped calls. Use the resulting `configId` for every scoped discovery endpoint and the configuration's compartment for the deployment. Never infer a compartment or log group from a similar name. Do not reveal OCI private keys, config contents, or other secrets.

## Networking discovery

Use CI Compose REST, never OCI CLI, to choose or verify deployment networking in the selected compartment:

- `GET /api/oci/networking/vcns?compartmentId=<compartmentId>` lists VCNs.
- `GET /api/oci/networking/vcns/:vcnId` retrieves one VCN.
- `GET /api/oci/networking/subnets?compartmentId=<compartmentId>&vcnId=<vcnId>` lists a VCN's subnets.
- `GET /api/oci/networking/subnets?compartmentId=<compartmentId>&subnetId=<subnetId>` retrieves one subnet.

Use the selected or configured subnet in the deployment payload. These calls are discovery-only: do not create, modify, or delete VCNs, subnets, route tables, gateways, security lists, or NSGs.

## Shared configurations

Use `GET /api/configs` to list shared UI/API configurations, then `GET /api/configs/:configId` to retrieve one. Create a configuration with `POST /api/configs`; update it with `PUT /api/configs/:configId` and the `revision` returned by GET. The shared configuration contains no OCI secrets.

Treat `projectResources` in the selected configuration as the UI's shared deployment definition. When Codex creates or changes a deployment, update `projectName` and the matching `projectResources.ports`, `projectResources.volumes`, and `projectResources.fileStorages` in the same configuration. This is mandatory, not a best-effort UI enhancement. For an FSS definition, include at least `name`, `mountPath`, `mountTargetId`, `exportId`, `subnetId`, and `isEncryptedInTransit`. This keeps the UI cards consistent with REST-created resources.

For create and update, use this shape:

```json
{
  "name": "my-ci",
  "revision": 1,
  "config": { "projectName": "my-ci", "compartmentId": "ocid1.compartment..." },
  "projectResources": { "ports": [], "volumes": [], "fileStorages": [] }
}
```

`revision` is required only for `PUT`. A `409 CONFIG_CONFLICT` means another UI or skill update won; fetch the configuration again, merge intentionally, and ask before retrying. Do not overwrite a `409 CONFIG_EXISTS` configuration without confirmation.

## Container Instance deployment tags

For every new or replacement deployment, build `freeformTags` exactly as the CI Compose UI does. Attach the same complete tag set to the Container Instance and every container:

- `architecture`: the selected architecture; preserve the existing value on replacement, otherwise use the selected deployment architecture.
- `composeImport`: preserve this tag only when the source deployment was imported from Docker Compose.
- `volumes`: when non-empty, a comma-separated list of `volumeName:mountPath` entries.
- `fileSystems`: when non-empty, a comma-separated list of `fileSystemName:mountPath` entries.
- One tag per exposed container port: key is the container `displayName`, value is its port number as a string.

Build a fresh tag set for a replacement so stale volume, FSS, or container-port tags are removed. Preserve only supported existing tags (`architecture` and, when applicable, `composeImport`).

## Match CI Compose UI behavior

For operations that CI Compose UI supports, use the same data model, discovery order, payload construction, validation, and post-action verification as the UI. This skill's scope boundary and explicit-confirmation requirements remain mandatory.

For a new deployment, derive the display name from the selected configuration's `projectName`; do not invent a different base name. First list Container Instances in the selected compartment, including deleted instances. Match names case-insensitively against `^<projectName>\s*(<number>)$`, select one greater than the highest matched number, and use `<projectName> <nextNumber>`. Use `1` when no numbered deployment exists. For example, after `nginx 1` and `nginx 2`, create `nginx 3`.

For an update, retain the existing deployment display name while following the create-first replacement workflow below.

Example calls from the repository root:

```powershell
# Health check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\skills\ci-compose-rest\scripts\invoke-ci-compose-api.ps1 -Path /api/health

# List OCI CLI profiles
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\skills\ci-compose-rest\scripts\invoke-ci-compose-api.ps1 -Path /api/oci/config/profiles

# List Container Instances in a compartment
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\skills\ci-compose-rest\scripts\invoke-ci-compose-api.ps1 -Path /api/oci/container-instances -Query 'compartmentId=ocid1.compartment...&profile=DEFAULT'
```

```bash
# macOS/Linux: health check
./skills/ci-compose-rest/scripts/invoke-ci-compose-api.sh --path /api/health

# macOS/Linux: list shared configurations
./skills/ci-compose-rest/scripts/invoke-ci-compose-api.sh --path /api/configs

# macOS/Linux: update a configuration from a JSON file
./skills/ci-compose-rest/scripts/invoke-ci-compose-api.sh \
  --method PUT --path /api/configs/<configId> --body-file /path/to/config.json
```

For PowerShell use `-Query 'key=value&other=value'`, `-QueryJson`, `-BodyJson`, `-BodyFile`, and `-BaseUrl`. For Bash use `--query`, `--body-json`, `--body-file`, and `--base-url`. Use a non-default base URL only when CI Compose was launched with a non-default `PORT`.

## Create and update deployments

There is no in-place deployment update. Match CI Compose UI behavior:

- **Create:** complete the input preflight below, validate the complete payload, show the target compartment, Container Instance name, resources, FSS mounts, and tags, then obtain explicit confirmation before `POST /api/oci/container-instances`.
- **Update:** first retrieve the existing Container Instance. Build, validate, and show the complete replacement payload and its tags. Explain that the replacement is created first with the same display name while the original remains running. Obtain explicit confirmation before `POST /api/oci/container-instances`. Immediately after a successful create response, fetch the selected configuration's latest revision and persist the exact replacement `projectResources` with `PUT /api/configs/:configId`, so the UI reflects the new desired deployment without waiting for readiness. If this configuration save conflicts or otherwise fails, leave the original untouched and report the issue. After the configuration save succeeds, delete the original immediately with `DELETE /api/oci/container-instances/:instanceId`; do not ask for or wait for a visibility confirmation, and do not poll, wait for readiness, or test the new instance.

For a standalone delete request, always ask an explicit `Are you sure you want to delete <instance name>?` confirmation before calling `DELETE /api/oci/container-instances/:instanceId`.

Do not restart or stop a Container Instance as a substitute for an update. Do not delete a deployment except after its replacement configuration has been saved successfully, or after explicit confirmation for a standalone delete request.

Before any deployment containing `OCI_FSS_FILE_SYSTEM`, use only the allowed FSS discovery routes to confirm the selected export is active and read-write, the mount target is active, and the payload contains matching mount target, export, subnet, and `volumeMounts` values. If these checks cannot be completed within the allowed scope, stop and report the missing information.

### New deployment input preflight

Ports are optional, but an omitted port must be an explicit decision. When no port is supplied, retrieve the selected subnet with `GET /api/oci/networking/subnets?compartmentId=<compartmentId>&subnetId=<subnetId>`. Ask whether the deployment needs an exposed port unless the subnet is explicitly confirmed private by the user or its response has `prohibitPublicIpOnVnic: true`. The user may then leave ports empty; do not infer a port.

Inspect every selected sidecar and require its non-placeholder inputs before payload validation. Stop and list the missing values instead of creating a partial deployment:

- `OsReader`: `os_bucket`.
- `VaultReader`: `secret_ocid`.
- `LogWriter`: `log_ocid`, `log_file`, and `log_header`.
- `AdbWallet`: `adb_ocid` and `wallet_password`.

The sidecar defaults `data_path`, `reload_delay`, `wallet_path`, and `secrets_file` may be retained unless the user requests a change. Never accept placeholder text such as `***put here ...***` as a value.

## Sidecar discovery and required inputs

For `AdbWallet`, use `GET /api/oci/database/autonomous-databases?configId=<configId>` to show each database `displayName` and OCID. Use the selected database OCID as `adb_ocid`; do not retrieve or create a wallet. The user must provide the `wallet_password`; retain the default `wallet_path` unless they request another path.

For `VaultReader`, use `GET /api/oci/key-management/vaults?configId=<configId>` to show each vault `displayName` and OCID. After the user selects a vault, use `GET /api/oci/key-management/secrets?configId=<configId>&vaultId=<vaultId>` to show its active `secretName` values and OCIDs. Use the selected Secret OCID as `secret_ocid`. This endpoint returns metadata only: never retrieve, display, or otherwise handle Secret contents. Retain the default `secrets_file` path unless the user requests another path.

For `OsReader`, select a bucket in the selected compartment with the REST bucket endpoint and list its files with `GET /api/oci/object-storage/objects?configId=<configId>&namespace=<namespace>&bucketName=<bucketName>`; set `os_bucket` only after this check. Keep `data_path` and `reload_delay` at their UI defaults unless the user requests changes. For `LogWriter`, discover the available log names and OCIDs with `GET /api/oci/logging/logs?configId=<configId>` and require the user to select one. The route is limited to the selected configuration's `logGroupId`. Use the selected OCID as `log_ocid`, then set `log_file` and `log_header`.

## Object Storage, FSS, and logs

For Object Storage, operate only on buckets and objects in the selected compartment through REST; discover the namespace and existing bucket first. For FSS, use only existing mount targets and exports in the selected compartment through REST. For logs, use `GET /api/oci/logging/logs/:logOcid` or `GET /api/oci/logging/test-search/:logGroupId` only when the requested group matches the selected configuration's `logGroupId`.

Use `scripts/invoke-ci-compose-api.ps1` on Windows or `scripts/invoke-ci-compose-api.sh` on macOS/Linux for local REST calls. Report OCI status codes and errors concisely.
