---
name: ci-compose-rest
description: Operate a locally running CI Compose server through its REST API instead of the browser UI. Use for querying OCI configuration and resources, importing or exporting Docker Compose, and managing OCI Container Instances, IAM policies, and Resource Manager stacks through CI Compose.
---

# CI Compose REST

Use this skill only against the locally running CI Compose server. Read `../../LOCAL_REST_ENDPOINTS.md` before selecting an endpoint; it is the complete, versioned contract for all supported `/api/` routes.

## Start and call the API

1. Confirm the server is available with `GET /api/health`.
2. Run `scripts/invoke-ci-compose-api.ps1` for every request. The local PowerShell policy requires the `-ExecutionPolicy Bypass` form below. The helper prints a JSON response and supports query parameters plus JSON request bodies.
3. Pass OCI connection settings (`configPath`, `profile`, `region`) whenever they are needed. The defaults are `~/.oci/config`, `DEFAULT`, and the configured region.
4. Discover OCIDs with the read-only listing endpoints before using an action endpoint.

Use `GET /api/configs` to list the shared UI/API configurations, then `GET /api/configs/:configId` to retrieve one. Create a configuration with `POST /api/configs`; update it with `PUT /api/configs/:configId` and the revision returned by GET. The shared configuration contains no OCI secrets.

Treat `projectResources` in the selected configuration as the UI's shared deployment definition. When Codex creates or changes a deployment, update `projectName` and the matching `projectResources.ports`, `projectResources.volumes`, and `projectResources.fileStorages` in the same configuration. For an FSS definition, include at least `name`, `mountPath`, `mountTargetId`, `exportId`, `subnetId`, and `isEncryptedInTransit`. This keeps the UI cards consistent with REST-created resources.

Example calls from the repository root:

```powershell
# Health check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\skills\ci-compose-rest\scripts\invoke-ci-compose-api.ps1 -Path /api/health

# List OCI CLI profiles
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\skills\ci-compose-rest\scripts\invoke-ci-compose-api.ps1 -Path /api/oci/config/profiles

# List Container Instances in a compartment
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\skills\ci-compose-rest\scripts\invoke-ci-compose-api.ps1 -Path /api/oci/container-instances -Query 'compartmentId=ocid1.compartment...&profile=DEFAULT'
```

Use `-Query 'key=value&other=value'` for query parameters. `-QueryJson` is also available when a JSON object is more convenient. Use `-BodyJson` for a small JSON payload or `-BodyFile` for a JSON file. Use `-BaseUrl` only when CI Compose was launched with a non-default `PORT`.

## Safety workflow

Treat these operations as state-changing and show the target OCI resources and payload summary, then obtain the user's explicit confirmation immediately before calling them:

- Create or update a dynamic group or policy.
- Create, delete, restart, or stop a Container Instance.
- Create a Resource Manager stack.

`/api/oci/container-instances/validate`, `/api/docker-compose/parse`, and `/api/docker-compose/export` are non-mutating and may be used to validate a planned action first. Do not expose OCI private keys, config contents, or other secrets in responses.

## FSS preflight

Before creating a Container Instance with an `OCI_FSS_FILE_SYSTEM` volume, perform these read-only checks. Do not submit the create request until every check passes:

1. Use the FSS export route to resolve the selected export and confirm it is `ACTIVE`, `READ_WRITE`, and every export client option has `requirePrivilegedSourcePort: true`.
2. Use the subnet route to find the workload subnet CIDR and attached security-list IDs. Use the security-lists route to verify ingress permits that CIDR (or a broader source) on both TCP and UDP ports `111` and `2048-2051`.
3. Confirm the mount target is `ACTIVE` and is reachable from the workload subnet. Prefer the same availability domain.
4. Include the FSS volume's mount target OCID, export OCID, and a matching `volumeMounts` entry in the create payload.

If a check fails, report the exact missing export option or protocol/port range and ask the user to correct it before creating or recreating the Container Instance.

## Endpoint selection

- Use configuration, compartment, availability-domain, network, FSS, logging, and instance-listing routes to discover input values.
- For an Object Storage demo, obtain the namespace first, list buckets to avoid a name collision, then create the private bucket and upload text content with the Object Storage routes. For cleanup, delete each demo object before deleting its now-empty bucket.
- Use `POST /api/docker-compose/parse` to turn Compose YAML into a Container Instance payload; validate that payload before creation.
- Use `POST /api/docker-compose/export` to obtain Compose YAML from an instance or payload.
- Use the Container Instance detail route before lifecycle actions and after them to verify the result.
- Return the API result concisely, including OCI request errors and status codes when present.
