Config = {}

-- Keybind to open/close MDT (default F6)
Config.OpenKey = 'F7'

-- Only players with these ERS service types can open the MDT
-- ERS service types: "police", "fire", "ambulance", "tow"
Config.AllowedServices = { "police" }

-- ACE permission node (optional — set to nil to disable ACE check)
-- Example: "lwk_cad.use"
Config.AcePermission = nil

-- Auto-populate warrant flags for peds with these ERS wanted levels (1–5)
-- Any ped with wantedLevel >= this value gets flagged in the DB
Config.WantedLevelWarrantThreshold = 2
