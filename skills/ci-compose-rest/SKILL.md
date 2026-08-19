---
name: ci-compose-rest
description: Manage CI Compose deployments through its local REST API, with OCI access restricted to Container Instances, Object Storage, FSS, and logs in the selected configuration scope.
---

# CI Compose REST

Use this skill only against the locally running CI Compose server. Read `../../LOCAL_REST_ENDPOINTS.md` before selecting an endpoint.

## Scope boundary — enforce this

Container Instance deployment lifecycle calls are allowed only through the local CI Compose REST API. The local OCI CLI may access only:

- Object Storage buckets and objects in the selected configuration's compartment.
- Existing File Storage Service mount targets and exports in that compartment, when needed by a deployment.
- Read-only logs in the selected configuration's `logGroupId`.

Do not use the OCI CLI or a CI Compose endpoint for any other OCI service. In particular, do not access or change Compute, Networking, IAM, Resource Manager, Vault, Functions, Kubernetes, Database, or any other service. Do not create, alter, or delete FSS infrastructure; use existing mount targets and exports only.

When a request is outside this boundary, do not call an OCI command or API. Reply: `Blocked: CI Compose skills are restricted to Container Instance deployments, Object Storage, existing FSS, and logs in the selected configuration scope.`

## Establish the selected scope

1. Confirm the local server with `GET /api/health`.
2. Load the selected shared configuration with `GET /api/configs` and `GET /api/configs/:configId`.
3. Resolve the tenancy with `GET /api/oci/config/tenancy`, then discover available targets only with `GET /api/oci/compartments?tenancyId=<tenancyId>`. This lists active, accessible compartments recursively.
4. Require the user to select one returned compartment. Use only that configuration's `compartmentId` for Object Storage, FSS, and Container Instance requests. For log reads, require the configuration's `logGroupId`; do not read another log group.

Never infer a compartment or log group from a similar name. Do not reveal OCI private keys, config contents, or other secrets.

## Shared configurations

Use `GET /api/configs` to list shared UI/API configurations, then `GET /api/configs/:configId` to retrieve one. Create a configuration with `POST /api/configs`; update it with `PUT /api/configs/:configId` and the `revision` returned by GET. The shared configuration contains no OCI secrets.

Treat `projectResources` in the selected configuration as the UI's shared deployment definition. When Codex creates or changes a deployment, update `projectName` and the matching `projectResources.ports`, `projectResources.volumes`, and `projectResources.fileStorages` in the same configuration. For an FSS definition, include at least `name`, `mountPath`, `mountTargetId`, `exportId`, `subnetId`, and `isEncryptedInTransit`. This keeps the UI cards consistent with REST-created resources.

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

For an update, retain the existing deployment display name while following the delete-then-create replacement workflow below.

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

- **Create:** validate the complete payload, show the target compartment, Container Instance name, resources, FSS mounts, and tags, then obtain explicit confirmation before `POST /api/oci/container-instances`.
- **Update:** first retrieve the existing Container Instance. Build, validate, and show the complete replacement payload and its tags. Explain that the operation deletes the existing Container Instance and creates a replacement with the same display name. Obtain explicit confirmation immediately before calling `DELETE /api/oci/container-instances/:instanceId`; wait for deletion to complete, then create the replacement with `POST /api/oci/container-instances`.

Do not restart or stop a Container Instance as a substitute for an update. Do not delete a deployment except as the confirmed first step of a requested update or a separately confirmed delete request.

Before any deployment containing `OCI_FSS_FILE_SYSTEM`, use only the allowed FSS discovery routes to confirm the selected export is active and read-write, the mount target is active, and the payload contains matching mount target, export, subnet, and `volumeMounts` values. If these checks cannot be completed within the allowed scope, stop and report the missing information.

## Object Storage, FSS, and logs

Use the selected configuration's OCI CLI profile and region. For Object Storage, operate only on buckets and objects in the selected compartment; discover the namespace and existing bucket first. For FSS, use only existing mount targets and exports in the selected compartment. For logs, use `GET /api/oci/logging/logs/:logOcid` or `GET /api/oci/logging/test-search/:logGroupId` only when the requested group matches the selected configuration's `logGroupId`.

Use `scripts/invoke-ci-compose-api.ps1` on Windows or `scripts/invoke-ci-compose-api.sh` on macOS/Linux for local REST calls. Report OCI status codes and errors concisely.
