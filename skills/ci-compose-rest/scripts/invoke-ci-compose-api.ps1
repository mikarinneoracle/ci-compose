[CmdletBinding()]
param(
  [ValidateSet('GET', 'POST', 'PUT', 'DELETE')]
  [string]$Method = 'GET',

  [Parameter(Mandatory = $true)]
  [string]$Path,

  [string]$Query,
  [string]$QueryJson,
  [string]$BodyJson,
  [string]$BodyFile,
  [string]$BaseUrl = 'http://localhost:3000'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($BodyJson -and $BodyFile) {
  throw 'Use either -BodyJson or -BodyFile, not both.'
}

if ($Query -and $QueryJson) {
  throw 'Use either -Query or -QueryJson, not both.'
}

if (-not $Path.StartsWith('/api/')) {
  throw 'Path must start with /api/.'
}

$uri = $BaseUrl.TrimEnd('/') + $Path
$pairs = @()
if ($Query) {
  foreach ($item in $Query -split '&') {
    $parts = $item -split '=', 2
    if ($parts.Count -ne 2 -or [string]::IsNullOrWhiteSpace($parts[0])) {
      throw "Query values must use key=value syntax: $item"
    }
    $pairs += '{0}={1}' -f [uri]::EscapeDataString($parts[0]), [uri]::EscapeDataString($parts[1])
  }
} elseif ($QueryJson) {
  $query = $QueryJson | ConvertFrom-Json
  $pairs = @($query.PSObject.Properties | ForEach-Object {
    if ($null -ne $_.Value) {
      '{0}={1}' -f [uri]::EscapeDataString($_.Name), [uri]::EscapeDataString([string]$_.Value)
    }
  })
}
if ($pairs) {
  $uri += '?' + ($pairs -join '&')
}

if ($BodyFile) {
  $BodyJson = Get-Content -LiteralPath $BodyFile -Raw
}

$request = @{
  Uri = $uri
  Method = $Method
  Headers = @{ Accept = 'application/json' }
}
if ($BodyJson) {
  $request.ContentType = 'application/json'
  $request.Body = $BodyJson
}

try {
  $response = Invoke-RestMethod @request
  $response | ConvertTo-Json -Depth 50
} catch {
  $statusCode = $null
  $responseText = $null
  if ($_.Exception.Response) {
    $statusCode = [int]$_.Exception.Response.StatusCode
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    $responseText = $reader.ReadToEnd()
    $reader.Dispose()
  }
  if ($responseText) {
    throw "CI Compose returned HTTP ${statusCode}: $responseText"
  }
  throw "CI Compose request failed: $($_.Exception.Message)"
}
