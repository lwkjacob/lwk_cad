local isOpen    = false
local isLoggedIn = false
local officerData = nil

-- pending server requests keyed by requestId → { action = 'nuiAction' }
local pendingRequests = {}

-- ─── permission check ─────────────────────────────────────────────────────────

local function canOpenMDT()
    -- ACE permission gate (optional)
    if Config.AcePermission then
        if not IsPlayerAceAllowed(PlayerId(), Config.AcePermission) then
            return false
        end
    end

    -- ERS service type gate
    local ok, serviceType = pcall(function()
        return exports['night_ers']:getPlayerActiveServiceType()
    end)
    if ok and serviceType then
        for _, allowed in ipairs(Config.AllowedServices) do
            if string.lower(tostring(serviceType)) == string.lower(allowed) then
                return true
            end
        end
        return false
    end

    -- If ERS export unavailable, allow access (solo testing / ERS not running)
    return true
end

-- ─── open / close ─────────────────────────────────────────────────────────────

local function openMDT()
    if isOpen then return end
    if not canOpenMDT() then
        -- silent fail — officer not on an allowed service
        return
    end
    isOpen = true
    SetNuiFocus(true, true)
    local streetName = ''
    local coords = GetEntityCoords(PlayerPedId())
    local streetHash, _ = GetStreetNameAtCoord(coords.x, coords.y, coords.z)
    if streetHash then
        streetName = GetStreetNameFromHashKey(streetHash) or ''
    end
    SendNUIMessage({
        action           = 'open',
        officerData      = officerData,
        deptConfig       = Config.Departments,
        loadingDelayMin  = Config.LoadingDelayMin,
        loadingDelayMax  = Config.LoadingDelayMax,
        streetName       = streetName,
        cities           = Config.Cities   or {},
        counties         = Config.Counties or {}
    })
end

local function closeMDT()
    if not isOpen then return end
    isOpen = false
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'close' })
end

-- ─── command + keybind ────────────────────────────────────────────────────────

RegisterCommand(Config.Command, function()
    if isOpen then closeMDT() else openMDT() end
end, false)

RegisterKeyMapping(Config.Command, 'Open / Close MDT', 'keyboard', Config.OpenKey)

-- ─── generic server response handler ─────────────────────────────────────────

RegisterNetEvent('lwk_cad:response')
AddEventHandler('lwk_cad:response', function(requestId, data)
    local pending = pendingRequests[requestId]
    if not pending then return end
    pendingRequests[requestId] = nil
    SendNUIMessage({ action = pending.action, data = data })
end)

-- ─── live push handlers ───────────────────────────────────────────────────────

RegisterNetEvent('lwk_cad:pushDispatch')
AddEventHandler('lwk_cad:pushDispatch', function(dispatchRow)
    if isOpen then
        SendNUIMessage({ action = 'dispatchPush', data = dispatchRow })
    end
end)

RegisterNetEvent('lwk_cad:pushUnitUpdate')
AddEventHandler('lwk_cad:pushUnitUpdate', function(unitRow)
    if isOpen then
        SendNUIMessage({ action = 'unitUpdate', data = unitRow })
    end
end)

-- ─── NUI callbacks ────────────────────────────────────────────────────────────

RegisterNUICallback('officerLogin', function(data, cb)
    if not data or not data.name or data.name == '' then
        cb({ ok = false })
        return
    end
    local streetName = ''
    local coords = GetEntityCoords(PlayerPedId())
    local streetHash, _ = GetStreetNameAtCoord(coords.x, coords.y, coords.z)
    if streetHash then streetName = GetStreetNameFromHashKey(streetHash) or '' end
    officerData = {
        name       = data.name,
        callsign   = data.callsign or '',
        department = data.department or '',
        location   = streetName
    }
    isLoggedIn = true
    TriggerServerEvent('lwk_cad:setOfficerInfo', officerData)
    -- loginSuccess is handled by nui.js patch on doLogin(); no push needed here
    cb({ ok = true })
end)

-- ─── periodic location update ─────────────────────────────────────────────────

Citizen.CreateThread(function()
    while true do
        Citizen.Wait(30000)
        if isLoggedIn then
            local coords = GetEntityCoords(PlayerPedId())
            local streetHash, _ = GetStreetNameAtCoord(coords.x, coords.y, coords.z)
            local streetName = streetHash and GetStreetNameFromHashKey(streetHash) or ''
            if streetName ~= '' then
                TriggerServerEvent('lwk_cad:updateUnitLocation', streetName)
            end
        end
    end
end)

RegisterNUICallback('lookupPerson', function(data, cb)
    local requestId = tostring(GetGameTimer()) .. '_' .. tostring(math.random(10000, 99999))
    pendingRequests[requestId] = { action = 'personResult' }
    TriggerServerEvent('lwk_cad:lookupPerson', data, requestId)
    cb({})
end)

RegisterNUICallback('lookupVehicle', function(data, cb)
    local requestId = tostring(GetGameTimer()) .. '_' .. tostring(math.random(10000, 99999))
    pendingRequests[requestId] = { action = 'vehicleResult' }
    TriggerServerEvent('lwk_cad:lookupVehicle', data, requestId)
    cb({})
end)

RegisterNUICallback('getActiveUnits', function(data, cb)
    local requestId = tostring(GetGameTimer()) .. '_' .. tostring(math.random(10000, 99999))
    pendingRequests[requestId] = { action = 'unitsResult' }
    TriggerServerEvent('lwk_cad:getActiveUnits', data or {}, requestId)
    cb({})
end)

RegisterNUICallback('getDispatchFeed', function(data, cb)
    local requestId = tostring(GetGameTimer()) .. '_' .. tostring(math.random(10000, 99999))
    pendingRequests[requestId] = { action = 'dispatchResult' }
    TriggerServerEvent('lwk_cad:getDispatchFeed', data or {}, requestId)
    cb({})
end)

RegisterNUICallback('submitReport', function(data, cb)
    local requestId = tostring(GetGameTimer()) .. '_' .. tostring(math.random(10000, 99999))
    pendingRequests[requestId] = { action = 'reportSaved' }
    TriggerServerEvent('lwk_cad:submitReport', data, requestId)
    cb({})
end)

RegisterNUICallback('getReports', function(data, cb)
    local requestId = tostring(GetGameTimer()) .. '_' .. tostring(math.random(10000, 99999))
    pendingRequests[requestId] = { action = 'reportsResult' }
    TriggerServerEvent('lwk_cad:getReports', data or {}, requestId)
    cb({})
end)

RegisterNUICallback('getReportDetail', function(data, cb)
    local requestId = tostring(GetGameTimer()) .. '_' .. tostring(math.random(10000, 99999))
    pendingRequests[requestId] = { action = 'reportDetailResult' }
    TriggerServerEvent('lwk_cad:getReportDetail', data or {}, requestId)
    cb({})
end)

RegisterNUICallback('updateStatus', function(data, cb)
    local requestId = tostring(GetGameTimer()) .. '_' .. tostring(math.random(10000, 99999))
    pendingRequests[requestId] = { action = 'statusUpdated' }
    TriggerServerEvent('lwk_cad:updateUnitStatus', data, requestId)
    cb({})
end)

RegisterNUICallback('clearDispatch', function(data, cb)
    TriggerServerEvent('lwk_cad:clearDispatch', data)
    cb({})
end)

RegisterNUICallback('assignToCall', function(data, cb)
    TriggerServerEvent('lwk_cad:assignToCall', data)
    cb({})
end)

RegisterNUICallback('closeNUI', function(data, cb)
    cb({})
    closeMDT()
end)

RegisterNUICallback('officerLogout', function(data, cb)
    officerData = nil
    isLoggedIn  = false
    TriggerServerEvent('lwk_cad:officerLogout')
    cb({})
end)

RegisterNUICallback('getLocation', function(data, cb)
    local streetName = ''
    local coords = GetEntityCoords(PlayerPedId())
    local streetHash, _ = GetStreetNameAtCoord(coords.x, coords.y, coords.z)
    if streetHash then
        streetName = GetStreetNameFromHashKey(streetHash) or ''
    end
    cb({ streetName = streetName })
end)

RegisterNUICallback('updateCallsign', function(data, cb)
    if data and data.callsign and data.callsign ~= '' then
        if officerData then officerData.callsign = data.callsign end
        TriggerServerEvent('lwk_cad:updateCallsign', data)
    end
    cb({})
end)

