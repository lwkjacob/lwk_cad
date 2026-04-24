--[[
  lwk_cad — server.lua
  server.cfg load order:
    ensure night_ers
    ensure lwk_cad
]]

-- Stores officer info submitted from the MDT login screen, keyed by source id
local ActiveOfficerInfo = {}

-- ─── helpers ──────────────────────────────────────────────────────────────────

local function safeStr(v)
    if type(v) == 'table' then return json.encode(v) end
    return tostring(v or '')
end

local function safeBool(v)
    return (v and v ~= false and v ~= 0) and 1 or 0
end

local function genEventNumber()
    return 'P/' .. os.date('%Y') .. '-' .. math.random(10000, 99999)
end

local function getCalloutPriority(calloutData)
    local name = string.lower(calloutData.CalloutName or calloutData.calloutId or calloutData.calloutName or '')
    for priority = 1, 3 do
        local keywords = Config.DispatchPriority[priority] or {}
        for _, kw in ipairs(keywords) do
            if name:find(string.lower(kw), 1, true) then
                return priority
            end
        end
    end
    return 4
end

local function getOfficerCallsign(src)
    local info = ActiveOfficerInfo[src]
    return info and info.callsign or ('UNIT-' .. tostring(src))
end

local function getOfficerName(src)
    local info = ActiveOfficerInfo[src]
    return info and info.name or ('OFFICER-' .. tostring(src))
end

local function getOfficerDept(src)
    local info = ActiveOfficerInfo[src]
    return info and info.department or 'UNKNOWN'
end

local function cleanStaleUnits()
    local players = GetPlayers()
    if #players == 0 then
        MySQL.query('DELETE FROM lwk_active_units')
        return
    end
    local placeholders = {}
    local ids = {}
    for _, id in ipairs(players) do
        placeholders[#placeholders + 1] = '?'
        ids[#ids + 1] = tonumber(id)
    end
    MySQL.query(
        'DELETE FROM lwk_active_units WHERE source_id NOT IN (' .. table.concat(placeholders, ',') .. ')',
        ids
    )
end

-- ─── civilian upsert ──────────────────────────────────────────────────────────

local function upsertCivilian(pedData)
    if not pedData or type(pedData) ~= 'table' then return end
    CreateThread(function()
        local ok, err = pcall(function()
            local flags    = pedData.FlagsOrMarkers or {}
            local hasWarrant = (flags.active_warrant or flags.wanted_person) and 1 or 0
            local warrantReason = ''
            if flags.active_warrant then warrantReason = 'Active Warrant'
            elseif flags.wanted_person then warrantReason = 'Wanted Person' end

            local dlStatus = safeStr(pedData.License_Car or 'Valid')

            local address = safeStr(pedData.Address)
            if pedData.City and pedData.City ~= '' then
                address = address .. ', ' .. safeStr(pedData.City)
            end
            if pedData.State and pedData.State ~= '' then
                address = address .. ', ' .. safeStr(pedData.State)
            end

            MySQL.query.await([[
                INSERT INTO lwk_civilians
                    (first_name, last_name, dob, gender, address, ped_model,
                     has_warrant, warrant_reason, flags, priors, dl_number, dl_status, raw_data)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    dob            = VALUES(dob),
                    gender         = VALUES(gender),
                    address        = VALUES(address),
                    has_warrant    = VALUES(has_warrant),
                    warrant_reason = VALUES(warrant_reason),
                    flags          = VALUES(flags),
                    priors         = VALUES(priors),
                    dl_number      = VALUES(dl_number),
                    dl_status      = VALUES(dl_status),
                    raw_data       = VALUES(raw_data)
            ]], {
                safeStr(pedData.FirstName),
                safeStr(pedData.LastName),
                safeStr(pedData.DOB),
                safeStr(pedData.Gender),
                address,
                safeStr(pedData.entityModel),
                hasWarrant,
                warrantReason,
                json.encode(flags),
                json.encode(pedData.Inventory or {}),
                safeStr(pedData.uniqueId),
                dlStatus,
                json.encode(pedData)
            })
        end)
        if not ok then
            print('[lwk_cad] civilian upsert error: ' .. tostring(err))
        end
    end)
end

-- ─── vehicle upsert ───────────────────────────────────────────────────────────

local function upsertVehicle(vehicleData)
    if not vehicleData then return end
    local plate = safeStr(vehicleData.license_plate)
    if plate == '' then return end

    -- split "Firstname Lastname" into two columns
    local ownerName  = safeStr(vehicleData.owner_name)
    local ownerFirst, ownerLast = '', ownerName
    local sp = ownerName:find(' ')
    if sp then ownerFirst = ownerName:sub(1, sp - 1); ownerLast = ownerName:sub(sp + 1) end

    -- mot = roadworthy, tax = taxed — both must be true for VALID registration
    local regStatus = (vehicleData.mot and vehicleData.tax) and 'VALID'
                      or (not vehicleData.mot)              and 'UNROADWORTHY'
                      or 'UNTAXED'
    local insStatus = vehicleData.insurance and 'VALID' or 'UNINSURED'

    CreateThread(function()
        local ok, err = pcall(function()
            MySQL.query.await([[
                INSERT INTO lwk_vehicles
                    (plate, model, make, color, year, owner_first, owner_last,
                     owner_dl, reg_status, ins_status, stolen)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    model       = VALUES(model),
                    make        = VALUES(make),
                    color       = VALUES(color),
                    year        = VALUES(year),
                    owner_first = VALUES(owner_first),
                    owner_last  = VALUES(owner_last),
                    reg_status  = VALUES(reg_status),
                    ins_status  = VALUES(ins_status),
                    stolen      = VALUES(stolen)
            ]], {
                plate,
                safeStr(vehicleData.model),
                safeStr(vehicleData.make),
                safeStr(vehicleData.color),
                safeStr(vehicleData.build_year),
                ownerFirst,
                ownerLast,
                '',
                regStatus,
                insStatus,
                safeBool(vehicleData.stolen)
            })
        end)
        if not ok then
            print('[lwk_cad] vehicle upsert error: ' .. tostring(err))
        end
    end)
end

-- ─── dispatch insert + broadcast ──────────────────────────────────────────────

-- Tracks the active dispatch event_number per player source
-- so OnEndedACallout (which sends no calloutData) can close the right row
local ActiveCallouts  = {}  -- [playerSrc] = event_number  (callouts)
local ActivePullovers = {}  -- [playerSrc] = event_number  (traffic stops)
local ActivePursuits  = {}  -- [playerSrc] = event_number  (pursuits)

local function insertDispatchWithStatus(eventNum, callType, location, priority, status, callsign, calloutData)
    local row = {
        event_number   = eventNum,
        call_type      = callType,
        location       = location or '',
        priority       = priority or 3,
        status         = status,
        assigned_units = callsign or '',
        callout_data   = calloutData and json.encode(calloutData) or ''
    }
    CreateThread(function()
        local ok, err = pcall(function()
            local id = MySQL.insert.await([[
                INSERT INTO lwk_dispatch
                    (event_number, call_type, location, priority, status, assigned_units, callout_data)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ]], {
                row.event_number, row.call_type, row.location,
                row.priority, row.status, row.assigned_units, row.callout_data
            })
            row.id = id
        end)
        if not ok then print('[lwk_cad] dispatch insert error: ' .. tostring(err)) end
        TriggerClientEvent('lwk_cad:pushDispatch', -1, row)
    end)
end

local function updateDispatchStatus(eventNum, status, callsign)
    CreateThread(function()
        MySQL.query.await(
            'UPDATE lwk_dispatch SET status = ?, assigned_units = COALESCE(NULLIF(?, \'\'), assigned_units) WHERE event_number = ?',
            { status, callsign or '', eventNum }
        )
        TriggerClientEvent('lwk_cad:pushDispatch', -1, { event_number = eventNum, status = status, assigned_units = callsign })
    end)
end

-- ─── ERS integration events ───────────────────────────────────────────────────
-- ERS fires these server-side via TriggerEvent(eventName, playerSrc, data).
-- First arg is always the player source ID; second arg is the payload table.

AddEventHandler('ErsIntegration::OnFirstNPCInteraction', function(playerSrc, pedData)
    upsertCivilian(pedData)
end)

AddEventHandler('ErsIntegration::OnFirstVehicleInteraction', function(playerSrc, vehicleData)
    upsertVehicle(vehicleData)
end)

-- ── Callouts ──────────────────────────────────────────────────────────────────

local function getCalloutName(calloutData)
    return string.upper(safeStr(calloutData.CalloutName or calloutData.calloutId or 'CALLOUT'))
end

local function getCalloutLocation(calloutData)
    return safeStr(calloutData.StreetName or calloutData.location or calloutData.street or '')
end

RegisterNetEvent('ErsIntegration::OnIsOfferedCallout')
AddEventHandler('ErsIntegration::OnIsOfferedCallout', function(calloutData)
    local playerSrc = source
    if not calloutData then return end
    local eventNum = genEventNumber()
    ActiveCallouts[playerSrc] = eventNum
    insertDispatchWithStatus(eventNum, getCalloutName(calloutData), getCalloutLocation(calloutData), getCalloutPriority(calloutData), 'PENDING', '', calloutData)
end)

RegisterNetEvent('ErsIntegration::OnAcceptedCalloutOffer')
AddEventHandler('ErsIntegration::OnAcceptedCalloutOffer', function(calloutData)
    local playerSrc = source
    local callsign  = getOfficerCallsign(playerSrc)
    local eventNum  = ActiveCallouts[playerSrc]
    if eventNum then
        updateDispatchStatus(eventNum, 'ACTIVE', callsign)
    else
        if not calloutData then return end
        eventNum = genEventNumber()
        ActiveCallouts[playerSrc] = eventNum
        insertDispatchWithStatus(eventNum, getCalloutName(calloutData), getCalloutLocation(calloutData), getCalloutPriority(calloutData), 'ACTIVE', callsign, calloutData)
    end
end)

RegisterNetEvent('ErsIntegration::OnArrivedAtCallout')
AddEventHandler('ErsIntegration::OnArrivedAtCallout', function(calloutData)
    local playerSrc = source
    local callsign  = getOfficerCallsign(playerSrc)
    local eventNum  = ActiveCallouts[playerSrc]
    if eventNum then
        updateDispatchStatus(eventNum, 'ON SCENE', callsign)
    else
        if not calloutData then return end
        eventNum = genEventNumber()
        ActiveCallouts[playerSrc] = eventNum
        insertDispatchWithStatus(eventNum, getCalloutName(calloutData), getCalloutLocation(calloutData), getCalloutPriority(calloutData), 'ON SCENE', callsign, calloutData)
    end
end)

RegisterNetEvent('ErsIntegration::OnEndedACallout')
AddEventHandler('ErsIntegration::OnEndedACallout', function()
    local playerSrc = source
    local eventNum  = ActiveCallouts[playerSrc]
    if eventNum then
        updateDispatchStatus(eventNum, 'CLOSED', nil)
        ActiveCallouts[playerSrc] = nil
    end
end)

RegisterNetEvent('ErsIntegration::OnCalloutCompletedSuccesfully')
AddEventHandler('ErsIntegration::OnCalloutCompletedSuccesfully', function(calloutData)
    local playerSrc = source
    local eventNum  = ActiveCallouts[playerSrc]
    if eventNum then
        updateDispatchStatus(eventNum, 'COMPLETED', nil)
        ActiveCallouts[playerSrc] = nil
    end
end)

-- ── Traffic stops ─────────────────────────────────────────────────────────────

RegisterNetEvent('ErsIntegration::OnPullover')
AddEventHandler('ErsIntegration::OnPullover', function(pedData, vehicleData)
    local playerSrc = source
    upsertCivilian(pedData)
    upsertVehicle(vehicleData)
    local plate    = vehicleData and safeStr(vehicleData.plate) or ''
    local location = pedData and safeStr(pedData.Address or pedData.address) or ''
    local eventNum = genEventNumber()
    ActivePullovers[playerSrc] = eventNum
    insertDispatchWithStatus(eventNum, 'TRAFFIC STOP', location, 3, 'ACTIVE', getOfficerCallsign(playerSrc), { plate = plate })
end)

RegisterNetEvent('ErsIntegration::OnPulloverEnded')
AddEventHandler('ErsIntegration::OnPulloverEnded', function(pedData, vehicleData)
    local playerSrc = source
    local eventNum = ActivePullovers[playerSrc]
    if eventNum then
        updateDispatchStatus(eventNum, 'CLOSED', nil)
        ActivePullovers[playerSrc] = nil
    end
end)

-- ── Pursuits ──────────────────────────────────────────────────────────────────

RegisterNetEvent('ErsIntegration::OnPursuitStarted')
AddEventHandler('ErsIntegration::OnPursuitStarted', function(pedData, vehicleData)
    local playerSrc = source
    local location = pedData and safeStr(pedData.Address or pedData.address) or ''
    local eventNum = genEventNumber()
    ActivePursuits[playerSrc] = eventNum
    insertDispatchWithStatus(eventNum, 'VEHICLE PURSUIT', location, 1, 'ACTIVE', getOfficerCallsign(playerSrc), pedData)
end)

RegisterNetEvent('ErsIntegration::OnPursuitEnded')
AddEventHandler('ErsIntegration::OnPursuitEnded', function(pedData, vehicleData)
    local playerSrc = source
    local eventNum = ActivePursuits[playerSrc]
    if eventNum then
        updateDispatchStatus(eventNum, 'CLOSED', nil)
        ActivePursuits[playerSrc] = nil
    end
end)

RegisterNetEvent('ErsIntegration::OnToggleShift')
AddEventHandler('ErsIntegration::OnToggleShift', function(arg1, arg2, arg3)
    -- ERS fires server-side on resource start: (playerSrc, isOnShift, serviceType)
    -- ERS fires client-side on manual toggle:  (isOnShift, serviceType) — source is the player
    local playerSrc, isOnShift, serviceType
    if type(arg1) == 'number' and arg1 > 0 then
        playerSrc, isOnShift, serviceType = arg1, arg2, arg3
    else
        playerSrc, isOnShift, serviceType = source, arg1, arg2
    end
    cleanStaleUnits()
    if isOnShift then
        local info = ActiveOfficerInfo[playerSrc] or {}
        CreateThread(function()
            local ok, err = pcall(function()
                MySQL.query.await([[
                    INSERT INTO lwk_active_units
                        (source_id, officer_name, callsign, department, service_type, status_code)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        officer_name   = VALUES(officer_name),
                        callsign       = VALUES(callsign),
                        department     = VALUES(department),
                        service_type   = VALUES(service_type),
                        status_code    = VALUES(status_code),
                        on_shift_since = CURRENT_TIMESTAMP
                ]], {
                    tonumber(playerSrc),
                    info.name or ('OFFICER-' .. tostring(playerSrc)),
                    info.callsign or ('UNIT-' .. tostring(playerSrc)),
                    info.department or safeStr(serviceType or 'police'),
                    safeStr(serviceType or 'police'),
                    Config.DefaultStatusCode
                })
            end)
            if not ok then
                print('[lwk_cad] active_units upsert error: ' .. tostring(err))
            end
            local unit = {
                source_id    = tonumber(playerSrc),
                officer_name = info.name or '',
                callsign     = info.callsign or '',
                department   = info.department or '',
                service_type = safeStr(serviceType or 'police'),
                status_code  = Config.DefaultStatusCode
            }
            TriggerClientEvent('lwk_cad:pushUnitUpdate', -1, unit)
        end)
    else
        MySQL.query('DELETE FROM lwk_active_units WHERE source_id = ?', { tonumber(playerSrc) })
        TriggerClientEvent('lwk_cad:pushUnitUpdate', -1, { source_id = tonumber(playerSrc), status_code = 'OFF' })
    end
end)

-- ─── officer info from client MDT login ───────────────────────────────────────

RegisterNetEvent('lwk_cad:setOfficerInfo')
AddEventHandler('lwk_cad:setOfficerInfo', function(data)
    if not data then return end
    ActiveOfficerInfo[source] = {
        name       = safeStr(data.name),
        callsign   = safeStr(data.callsign),
        department = safeStr(data.department)
    }
    -- update DB row if already on shift
    MySQL.query(
        'UPDATE lwk_active_units SET officer_name = ?, callsign = ?, department = ? WHERE source_id = ?',
        { safeStr(data.name), safeStr(data.callsign), safeStr(data.department), tonumber(source) }
    )
end)

RegisterNetEvent('lwk_cad:officerLogout')
AddEventHandler('lwk_cad:officerLogout', function()
    -- clears the MDT session; ERS shift state is unaffected
    ActiveOfficerInfo[source] = nil
end)

RegisterNetEvent('lwk_cad:updateCallsign')
AddEventHandler('lwk_cad:updateCallsign', function(data)
    local src = source
    if not data or not data.callsign or data.callsign == '' then return end
    local newCs = string.upper(string.sub(tostring(data.callsign), 1, 20))
    if ActiveOfficerInfo[src] then
        ActiveOfficerInfo[src].callsign = newCs
    end
    MySQL.query('UPDATE lwk_active_units SET callsign = ? WHERE source_id = ?', { newCs, tonumber(src) })
    CreateThread(function()
        local rows = MySQL.query.await('SELECT * FROM lwk_active_units WHERE source_id = ? LIMIT 1', { tonumber(src) })
        if rows and #rows > 0 then
            TriggerClientEvent('lwk_cad:pushUnitUpdate', -1, rows[1])
        end
    end)
end)

AddEventHandler('playerDropped', function()
    local src = source
    ActiveOfficerInfo[src] = nil
    ActiveCallouts[src]    = nil
    ActivePullovers[src]   = nil
    ActivePursuits[src]    = nil
    MySQL.query('DELETE FROM lwk_active_units WHERE source_id = ?', { tonumber(src) })
end)

-- ─── NUI request/response handlers ───────────────────────────────────────────

RegisterNetEvent('lwk_cad:lookupPerson')
AddEventHandler('lwk_cad:lookupPerson', function(data, requestId)
    local src = source
    if not data or not requestId then return end
    CreateThread(function()
        local where, params = {}, {}
        if data.lastName and data.lastName ~= '' then
            where[#where + 1] = 'LOWER(last_name) LIKE LOWER(?)'
            params[#params + 1] = data.lastName .. '%'
        end
        if data.firstName and data.firstName ~= '' then
            where[#where + 1] = 'LOWER(first_name) LIKE LOWER(?)'
            params[#params + 1] = data.firstName .. '%'
        end
        -- DOB is optional — skip it to avoid format mismatch (ERS may store dashes, UI uses slashes)
        local sql = 'SELECT * FROM lwk_civilians'
        if #where > 0 then
            sql = sql .. ' WHERE ' .. table.concat(where, ' AND ')
        end
        sql = sql .. ' LIMIT ' .. tostring(Config.MaxPersonResults)
        local results = MySQL.query.await(sql, params)
        if not results or #results == 0 then
            TriggerClientEvent('lwk_cad:response', src, requestId, { found = false })
        else
            TriggerClientEvent('lwk_cad:response', src, requestId, { found = true, records = results })
        end
    end)
end)

RegisterNetEvent('lwk_cad:lookupVehicle')
AddEventHandler('lwk_cad:lookupVehicle', function(data, requestId)
    local src = source
    if not data or not requestId then return end
    CreateThread(function()
        local plate = string.upper(safeStr(data.plate))
        if plate == '' then
            TriggerClientEvent('lwk_cad:response', src, requestId, { found = false })
            return
        end
        local results = MySQL.query.await('SELECT * FROM lwk_vehicles WHERE plate = ? LIMIT 1', { plate })
        if not results or #results == 0 then
            TriggerClientEvent('lwk_cad:response', src, requestId, { found = false })
        else
            TriggerClientEvent('lwk_cad:response', src, requestId, { found = true, record = results[1] })
        end
    end)
end)

RegisterNetEvent('lwk_cad:getActiveUnits')
AddEventHandler('lwk_cad:getActiveUnits', function(data, requestId)
    local src = source
    if not requestId then return end
    CreateThread(function()
        local results = MySQL.query.await(
            'SELECT * FROM lwk_active_units ORDER BY service_type, callsign',
            {}
        )
        TriggerClientEvent('lwk_cad:response', src, requestId, { units = results or {} })
    end)
end)

RegisterNetEvent('lwk_cad:getDispatchFeed')
AddEventHandler('lwk_cad:getDispatchFeed', function(data, requestId)
    local src = source
    if not requestId then return end
    CreateThread(function()
        local results = MySQL.query.await(
            "SELECT * FROM lwk_dispatch WHERE status IN ('PENDING','ACTIVE','ON SCENE') ORDER BY priority ASC, created_at DESC LIMIT " .. tostring(Config.MaxDispatchResults),
            {}
        )
        TriggerClientEvent('lwk_cad:response', src, requestId, { calls = results or {} })
    end)
end)

RegisterNetEvent('lwk_cad:submitReport')
AddEventHandler('lwk_cad:submitReport', function(data, requestId)
    local src = source
    if not data or not requestId then return end
    CreateThread(function()
        local ok, err = pcall(function()
            local id = MySQL.insert.await([[
                INSERT INTO lwk_reports
                    (report_number, report_type, officer_name, callsign,
                     subject_name, plate, content_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ]], {
                safeStr(data.reportNumber),
                safeStr(data.reportType),
                safeStr(data.officerName),
                safeStr(data.callsign),
                safeStr(data.subjectName),
                safeStr(data.plate),
                safeStr(data.contentJson)
            })
            TriggerClientEvent('lwk_cad:response', src, requestId, { success = true, id = id })
        end)
        if not ok then
            print('[lwk_cad] submit report error: ' .. tostring(err))
            TriggerClientEvent('lwk_cad:response', src, requestId, { success = false, error = tostring(err) })
        end
    end)
end)

RegisterNetEvent('lwk_cad:getReports')
AddEventHandler('lwk_cad:getReports', function(data, requestId)
    local src = source
    if not requestId then return end
    CreateThread(function()
        local where, params = {}, {}
        if data and data.reportType and data.reportType ~= '' then
            where[#where + 1] = 'report_type = ?'
            params[#params + 1] = data.reportType
        end
        if data and data.officerName and data.officerName ~= '' then
            where[#where + 1] = 'LOWER(officer_name) LIKE LOWER(?)'
            params[#params + 1] = '%' .. data.officerName .. '%'
        end
        local sql = 'SELECT id, report_number, report_type, officer_name, callsign, subject_name, plate, created_at FROM lwk_reports'
        if #where > 0 then
            sql = sql .. ' WHERE ' .. table.concat(where, ' AND ')
        end
        sql = sql .. ' ORDER BY created_at DESC LIMIT ' .. tostring(Config.MaxReportResults)
        local results = MySQL.query.await(sql, params)
        TriggerClientEvent('lwk_cad:response', src, requestId, { reports = results or {} })
    end)
end)

RegisterNetEvent('lwk_cad:getReportDetail')
AddEventHandler('lwk_cad:getReportDetail', function(data, requestId)
    local src = source
    if not data or not data.id or not requestId then return end
    CreateThread(function()
        local results = MySQL.query.await('SELECT * FROM lwk_reports WHERE id = ? LIMIT 1', { tonumber(data.id) })
        if results and #results > 0 then
            TriggerClientEvent('lwk_cad:response', src, requestId, { found = true, report = results[1] })
        else
            TriggerClientEvent('lwk_cad:response', src, requestId, { found = false })
        end
    end)
end)

RegisterNetEvent('lwk_cad:updateUnitStatus')
AddEventHandler('lwk_cad:updateUnitStatus', function(data, requestId)
    local src = source
    if not data then return end
    CreateThread(function()
        local ok, err = pcall(function()
            MySQL.query.await(
                'UPDATE lwk_active_units SET status_code = ?, location = ?, assignment = ? WHERE source_id = ?',
                {
                    safeStr(data.statusCode or Config.DefaultStatusCode),
                    safeStr(data.location),
                    safeStr(data.assignment),
                    tonumber(src)
                }
            )
        end)
        if not ok then
            print('[lwk_cad] update unit status error: ' .. tostring(err))
        end
        if requestId then
            TriggerClientEvent('lwk_cad:response', src, requestId, { success = ok })
        end
        local unit = {
            source_id   = tonumber(src),
            status_code = safeStr(data.statusCode or Config.DefaultStatusCode),
            location    = safeStr(data.location),
            assignment  = safeStr(data.assignment)
        }
        TriggerClientEvent('lwk_cad:pushUnitUpdate', -1, unit)
    end)
end)

-- ─── clear dispatch (officer clears own call; admin clears any) ───────────────

RegisterNetEvent('lwk_cad:clearDispatch')
AddEventHandler('lwk_cad:clearDispatch', function(data)
    local src = source
    if not data or not data.eventNumber then return end

    local isAdmin = IsPlayerAceAllowed(tostring(src), Config.AdminAce or 'group.admin')
    if not isAdmin then
        -- any officer who is MDT-logged-in can clear a call
        if not ActiveOfficerInfo[src] then return end
    end

    updateDispatchStatus(data.eventNumber, 'COMPLETED', nil)
    -- clear tracking so stale event_numbers don't linger
    for s, ev in pairs(ActiveCallouts)  do if ev == data.eventNumber then ActiveCallouts[s]  = nil end end
    for s, ev in pairs(ActivePullovers) do if ev == data.eventNumber then ActivePullovers[s] = nil end end
    for s, ev in pairs(ActivePursuits)  do if ev == data.eventNumber then ActivePursuits[s]  = nil end end
end)

-- ─── assign self to dispatch call ────────────────────────────────────────────

RegisterNetEvent('lwk_cad:assignToCall')
AddEventHandler('lwk_cad:assignToCall', function(data)
    local src = source
    if not data or not data.eventNumber then return end
    local callsign = getOfficerCallsign(src)
    if callsign == '' then return end
    CreateThread(function()
        local rows = MySQL.query.await(
            "SELECT assigned_units FROM lwk_dispatch WHERE event_number = ? AND status NOT IN ('CLOSED','COMPLETED') LIMIT 1",
            { data.eventNumber }
        )
        if not rows or #rows == 0 then return end
        local assigned = rows[1].assigned_units or ''
        if assigned:find(callsign, 1, true) then return end
        local newAssigned = assigned == '' and callsign or (assigned .. ', ' .. callsign)
        MySQL.query.await('UPDATE lwk_dispatch SET assigned_units = ? WHERE event_number = ?', { newAssigned, data.eventNumber })
        TriggerClientEvent('lwk_cad:pushDispatch', -1, { event_number = data.eventNumber, assigned_units = newAssigned })
    end)
end)

-- ─── dispatch/unit cleanup loop ───────────────────────────────────────────────

CreateThread(function()
    while true do
        Wait(Config.StaleUnitCleanupMinutes * 60000)
        MySQL.query(
            "DELETE FROM lwk_dispatch WHERE status IN ('CLOSED','COMPLETED') AND updated_at < NOW() - INTERVAL " .. tostring(Config.DispatchPurgeHours) .. " HOUR"
        )
        cleanStaleUnits()
    end
end)

-- ─── database schema init ─────────────────────────────────────────────────────

CreateThread(function()
    Wait(2000)

    MySQL.query([[
        CREATE TABLE IF NOT EXISTS `lwk_civilians` (
            `id`             INT AUTO_INCREMENT PRIMARY KEY,
            `first_name`     VARCHAR(64)  NOT NULL DEFAULT '',
            `last_name`      VARCHAR(64)  NOT NULL DEFAULT '',
            `dob`            VARCHAR(32)  NOT NULL DEFAULT '',
            `gender`         VARCHAR(16)  NOT NULL DEFAULT '',
            `address`        VARCHAR(128) NOT NULL DEFAULT '',
            `ped_model`      VARCHAR(64)  NOT NULL DEFAULT '',
            `has_warrant`    TINYINT(1)   NOT NULL DEFAULT 0,
            `warrant_reason` VARCHAR(255) NOT NULL DEFAULT '',
            `flags`          TEXT,
            `priors`         TEXT,
            `dl_number`      VARCHAR(32)  NOT NULL DEFAULT '',
            `dl_status`      VARCHAR(32)  NOT NULL DEFAULT 'VALID',
            `raw_data`       LONGTEXT,
            `last_seen`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY `ped_identity` (`ped_model`(32), `first_name`(32), `last_name`(32))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ]])

    -- Add raw_data column to existing tables that predate this version
    MySQL.query('ALTER TABLE `lwk_civilians` ADD COLUMN IF NOT EXISTS `raw_data` LONGTEXT')

    MySQL.query([[
        CREATE TABLE IF NOT EXISTS `lwk_vehicles` (
            `id`          INT AUTO_INCREMENT PRIMARY KEY,
            `plate`       VARCHAR(16)  NOT NULL DEFAULT '',
            `model`       VARCHAR(64)  NOT NULL DEFAULT '',
            `make`        VARCHAR(64)  NOT NULL DEFAULT '',
            `color`       VARCHAR(64)  NOT NULL DEFAULT '',
            `year`        VARCHAR(8)   NOT NULL DEFAULT '',
            `owner_first` VARCHAR(64)  NOT NULL DEFAULT '',
            `owner_last`  VARCHAR(64)  NOT NULL DEFAULT '',
            `owner_dl`    VARCHAR(32)  NOT NULL DEFAULT '',
            `reg_status`  VARCHAR(32)  NOT NULL DEFAULT 'VALID',
            `ins_status`  VARCHAR(32)  NOT NULL DEFAULT 'VALID',
            `stolen`      TINYINT(1)   NOT NULL DEFAULT 0,
            `bolo`        TINYINT(1)   NOT NULL DEFAULT 0,
            `bolo_reason` VARCHAR(255) NOT NULL DEFAULT '',
            `last_seen`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY `plate` (`plate`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ]])

    MySQL.query([[
        CREATE TABLE IF NOT EXISTS `lwk_active_units` (
            `id`             INT AUTO_INCREMENT PRIMARY KEY,
            `source_id`      INT          NOT NULL,
            `officer_name`   VARCHAR(128) NOT NULL DEFAULT '',
            `callsign`       VARCHAR(64)  NOT NULL DEFAULT '',
            `department`     VARCHAR(64)  NOT NULL DEFAULT '',
            `service_type`   VARCHAR(32)  NOT NULL DEFAULT 'police',
            `status_code`    VARCHAR(16)  NOT NULL DEFAULT '10-8',
            `location`       VARCHAR(128) NOT NULL DEFAULT '',
            `assignment`     VARCHAR(255) NOT NULL DEFAULT '',
            `on_shift_since` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY `source_id` (`source_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ]])

    MySQL.query([[
        CREATE TABLE IF NOT EXISTS `lwk_dispatch` (
            `id`             INT AUTO_INCREMENT PRIMARY KEY,
            `event_number`   VARCHAR(32)  NOT NULL DEFAULT '',
            `call_type`      VARCHAR(128) NOT NULL DEFAULT '',
            `location`       VARCHAR(255) NOT NULL DEFAULT '',
            `priority`       INT          NOT NULL DEFAULT 3,
            `status`         VARCHAR(32)  NOT NULL DEFAULT 'ACTIVE',
            `assigned_units` VARCHAR(255) NOT NULL DEFAULT '',
            `callout_data`   LONGTEXT,
            `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ]])

    MySQL.query([[
        CREATE TABLE IF NOT EXISTS `lwk_reports` (
            `id`            INT AUTO_INCREMENT PRIMARY KEY,
            `report_number` VARCHAR(32)  NOT NULL DEFAULT '',
            `report_type`   VARCHAR(64)  NOT NULL DEFAULT '',
            `officer_name`  VARCHAR(128) NOT NULL DEFAULT '',
            `callsign`      VARCHAR(64)  NOT NULL DEFAULT '',
            `subject_name`  VARCHAR(128) NOT NULL DEFAULT '',
            `plate`         VARCHAR(16)  NOT NULL DEFAULT '',
            `content_json`  LONGTEXT,
            `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ]])

    print('[lwk_cad] database schema ready')

    -- Reset open calls and units so stale rows from a previous session don't persist
    MySQL.query("UPDATE lwk_dispatch SET status = 'CLOSED' WHERE status IN ('PENDING','ACTIVE','ON SCENE')")
    MySQL.query("DELETE FROM lwk_active_units")
    print('[lwk_cad] cleared stale active calls and units')
end)
