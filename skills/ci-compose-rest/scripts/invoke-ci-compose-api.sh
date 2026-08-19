#!/usr/bin/env bash
set -euo pipefail

method=GET
path=
query=
body_json=
body_file=
base_url=http://localhost:3000

usage() {
  echo 'Usage: invoke-ci-compose-api.sh --path /api/... [--method GET|POST|PUT|DELETE] [--query key=value&other=value] [--body-json JSON | --body-file PATH] [--base-url URL]' >&2
}

while (($#)); do
  case "$1" in
    --method) method=$2; shift 2 ;;
    --path) path=$2; shift 2 ;;
    --query) query=$2; shift 2 ;;
    --body-json) body_json=$2; shift 2 ;;
    --body-file) body_file=$2; shift 2 ;;
    --base-url) base_url=$2; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
done

[[ "$method" =~ ^(GET|POST|PUT|DELETE)$ ]] || { echo 'Unsupported HTTP method' >&2; exit 2; }
[[ "$path" == /api/* ]] || { echo 'Path must start with /api/' >&2; exit 2; }
[[ -z "$body_json" || -z "$body_file" ]] || { echo 'Use either --body-json or --body-file, not both' >&2; exit 2; }
[[ -z "$body_file" ]] || body_json=$(<"$body_file")

url="${base_url%/}${path}"
[[ -z "$query" ]] || url+="?$query"
args=(-sS --fail-with-body -X "$method" -H 'Accept: application/json')
if [[ -n "$body_json" ]]; then args+=(-H 'Content-Type: application/json' --data "$body_json"); fi
curl "${args[@]}" "$url"
