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

-- ─── UI / Loading ─────────────────────────────────────────────────────────────

-- Simulated loading delay range (milliseconds) for queries, login, and form submission.
-- Gives the MDT a realistic "connecting to database" feel.
-- Set both to 0 to disable entirely.
Config.LoadingDelayMin = 500
Config.LoadingDelayMax = 1000

-- ─── Form Location Dropdowns ─────────────────────────────────────────────────

-- City options shown in city dropdown on forms
Config.Cities = {
    'Manhattan',
    'Brooklyn',
    'Queens',
    'The Bronx',
    'Staten Island',
}

-- County options shown in county dropdown on forms (Traffic Citation)
Config.Counties = {
    'New York County',
    'Kings County',
    'Queens County',
    'Bronx County',
    'Richmond County',
}

-- ─── Departments ─────────────────────────────────────────────────────────────

-- ─── Live Map ────────────────────────────────────────────────────────────────

-- Two-point calibration for the live map marker positions.
-- Pick any two recognisable landmarks (far apart = more accurate).
--   px, py  = pixel position on lcmap.png  (0,0 = top-left; measure in any image editor)
--   wx, wy  = in-game /coords at that exact spot
Config.MapCalibration = {
    { px = 1180,    py = 1700,    wx = 3878.47, wy = -1522.55  },
    { px = 4270, py = 4730, wx = 6533.78, wy = -4128.59 },
}

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
