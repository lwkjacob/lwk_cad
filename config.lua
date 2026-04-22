Config = {}

-- ─── Controls ────────────────────────────────────────────────────────────────

-- Chat command to toggle the MDT open/close
Config.Command = 'mdt'

-- Keybind to toggle the MDT (players can rebind in FiveM settings)
Config.OpenKey = 'F7'

-- ERS service types permitted to open the MDT
-- Valid values: "police", "fire", "ambulance", "tow"
Config.AllowedServices = { "police" }

-- Optional ACE permission node — set to nil to skip the check entirely
-- Example: "lwk_cad.use"
Config.AcePermission = nil

-- ACE permission required to clear any officer's active dispatch call
Config.AdminAce = 'group.admin'

-- ─── Dispatch ────────────────────────────────────────────────────────────────

-- Keywords that determine call priority (case-insensitive, matched against callout name).
-- Priority 1 = highest urgency, 4 = lowest. Anything not matched falls back to 4.
Config.DispatchPriority = {
    [1] = { 'shooting', 'shots fired', 'robbery', 'hostage', 'fire', 'pursuit', 'explosion', 'officer down', 'active shooter' },
    [2] = { 'assault', 'disturbance', 'domestic', 'accident', 'crash', 'fight', 'stabbing' },
    [3] = { 'theft', 'suspicious', 'alarm', 'trespassing', 'vandalism', 'noise complaint' },
    -- [4] is the automatic fallback — no entry needed
}

-- Hours before CLOSED/COMPLETED dispatch rows are deleted from the database
Config.DispatchPurgeHours = 2

-- How often (minutes) stale active-unit rows are cleaned up
Config.StaleUnitCleanupMinutes = 5

-- Maximum rows returned per query
Config.MaxPersonResults   = 20
Config.MaxDispatchResults = 50
Config.MaxReportResults   = 100

-- ─── Officers ────────────────────────────────────────────────────────────────

-- Default radio status code assigned when an officer goes on shift
Config.DefaultStatusCode = '10-8'

-- ERS wanted level at or above which a civilian is auto-flagged has_warrant = 1
Config.WantedLevelWarrantThreshold = 2

-- ─── UI / Loading ─────────────────────────────────────────────────────────────

-- Simulated loading delay range (milliseconds) for queries, login, and form submission.
-- Gives the MDT a realistic "connecting to database" feel.
-- Set both to 0 to disable entirely.
Config.LoadingDelayMin = 500
Config.LoadingDelayMax = 1000

-- ─── Departments ─────────────────────────────────────────────────────────────

-- Display info for each department shown in MDT form headers and the login screen.
-- Keys must match the <option value="..."> in the login dropdown (ui/index.html.html).
-- seal: path relative to ui/ — must also appear in fxmanifest.lua files{}.
Config.Departments = {
    nypd = {
        name = 'NEW YORK POLICE DEPARTMENT',
        sub  = 'New York · Manhattan Division · NYPD',
        seal = 'images/nypd_logo.png'
    },
    nysp = {
        name = 'NEW YORK STATE POLICE',
        sub  = 'New York State · Troop NYC · NYSP',
        seal = 'images/nysp_logo.png'
    }
}
