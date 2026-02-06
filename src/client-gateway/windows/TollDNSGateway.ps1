param(
  [string]$ResolverUrl = "http://localhost:8787",
  [string]$QueryName = "example.com",
  [string]$QueryType = "A",
  [string]$VoucherJson
)

if (-not $VoucherJson) {
  throw "VoucherJson is required"
}

$body = @{
  voucher = (ConvertFrom-Json $VoucherJson)
  query = @{
    name = $QueryName
    type = $QueryType
    needsGateway = $true
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -Uri "$ResolverUrl/v1/resolve" -ContentType "application/json" -Body $body
