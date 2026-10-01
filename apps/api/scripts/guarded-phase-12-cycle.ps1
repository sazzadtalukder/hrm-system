Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-GuardedAction {
    param([Parameter(Mandatory = $true)][string]$Action)

    & node scripts/guarded-hrm-test-knex.js $Action
    if ($LASTEXITCODE -ne 0) {
        throw "Guarded database action '$Action' failed with exit code $LASTEXITCODE."
    }
}

Invoke-GuardedAction -Action "phase-12-down"
Invoke-GuardedAction -Action "phase-12-up"
Invoke-GuardedAction -Action "seed"
Invoke-GuardedAction -Action "status"
