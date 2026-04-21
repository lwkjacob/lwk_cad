# ⚠️ WORK IN PROGRESS ⚠️

> **This resource is actively under development. Features may be incomplete, broken, or subject to change without notice.**

---

# lwk_cad — Police CAD / MDT

A standalone FiveM police CAD/MDT resource with a full database backend and live integration with **Nights Software ERS** (`night_ers`). Officers open a laptop-style MDT overlay to run person/vehicle queries, monitor active units, watch a live dispatch feed, and submit official police reports — all backed by a persistent MySQL database.

---

## Features

- Laptop-style windowed NUI overlay (not full-screen) with department login (NYPD / NYSP)
- Person lookup — queries ERS-populated civilian records (flags, warrants, licenses, medical state, phone, email)
- Vehicle lookup — queries ERS-populated vehicle records (BOLO, stolen, registration, insurance, owner)
- Active units board — live view of all on-shift officers, updated automatically on shift toggle
- Live dispatch feed with full call lifecycle: PENDING → ACTIVE → ON SCENE → CLOSED/COMPLETED
- Police report forms — Written Warning, Traffic Citation, Arrest Report, Incident Report, Search Warrant, Tow Sheet — all saved to the database
- Automatic civilian and vehicle record accumulation from ERS NPC interactions
- No framework dependency — standalone, works without ESX or QBCore

---

## Requirements

| Dependency | Notes |
|---|---|
| [oxmysql](https://github.com/overextended/oxmysql) | Database layer |
| [night_ers](https://store.nights-software.com/) | Nights Software ERS — provides NPC/vehicle data and shift events |

---

## Installation

1. Drop the `lwk_cad` folder into your `resources/[scripts]/` directory.
2. Add the following to your `server.cfg`, **after** `ensure night_ers`:

```
ensure night_ers
ensure lwk_cad
```

3. Ensure `oxmysql` is also ensured before `lwk_cad`.
4. Start/restart your server. All database tables are created automatically on first run — no SQL import needed.

---

## Configuration

All options are in [`config.lua`](config.lua).

```lua
Config.OpenKey = 'F7'
```
Keybind to toggle the MDT open/close. Players can rebind this in their FiveM settings.

```lua
Config.AllowedServices = { "police" }
```
ERS service types permitted to open the MDT. Valid values: `"police"`, `"fire"`, `"ambulance"`, `"tow"`.

```lua
Config.AcePermission = nil
```
Optional ACE permission node (e.g. `"lwk_cad.use"`). Set to `nil` to skip the ACE check entirely.

```lua
Config.WantedLevelWarrantThreshold = 2
```
ERS wanted level at or above which a civilian is automatically flagged `has_warrant = 1` in the database.

---

## Usage

### Opening the MDT
Press `F7` (or your configured key), or run `/mdt` in chat. The MDT only opens if the player is on an allowed ERS service type.

### Logging in
Select your department, enter your officer name and callsign, then click **Log In**. Your name and callsign are stored server-side and used to populate dispatch rows, active unit entries, and report signatures for the rest of your session.

### Person Lookup
Enter last name and/or first name, then click **Query**. DOB is not required. Results show flags, warrant status, driver's license, commercial vehicle license, phone, email, nationality, and medical state. Records accumulate automatically as ERS NPCs are interacted with.

### Vehicle Lookup
Enter a plate number and click **Query**. Returns registration, insurance, stolen/BOLO status, and registered owner details.

### Active Units
Automatically updated when officers toggle their ERS shift on/off. Click **Refresh** to manually pull the latest list.

### Dispatch Feed
Calls progress through a full lifecycle driven by ERS events:

| Status | Colour | Trigger |
|---|---|---|
| PENDING | grey | Callout offered to officer |
| ACTIVE | green | Officer accepts / traffic stop / pursuit begins |
| ON SCENE | blue | Officer arrives at callout |
| CLOSED | dim | Call ended |
| COMPLETED | green | Callout completed successfully |

Priority levels: **1** = shots/fire/robbery/pursuit, **2** = assault/disturbance/accident, **3** = theft/suspicious/alarm, **4** = everything else.

### Forms
Select a form type from the left sidebar, fill it out, and click **Save & Submit**. The report is saved to `lwk_reports` with your officer name, callsign, report number, and the full form content as JSON.

---

## Database Tables

All tables are created automatically with `CREATE TABLE IF NOT EXISTS` on server start.

| Table | Purpose |
|---|---|
| `lwk_civilians` | NPC records accumulated from ERS interactions (includes full raw ERS data) |
| `lwk_vehicles` | Vehicle records accumulated from ERS interactions |
| `lwk_active_units` | Officers currently on shift |
| `lwk_dispatch` | Active, pending, on-scene, and recent calls |
| `lwk_reports` | Submitted MDT forms |

Old closed/completed dispatch rows are automatically purged after 2 hours. Stale unit rows (players who disconnected without toggling off shift) are cleaned up every 5 minutes.

---

## ERS Integration Events

lwk_cad hooks the following server-side ERS events. **Do not edit `night_ers`** — all integration is handled from lwk_cad's own server script.

| ERS Event | Action |
|---|---|
| `OnFirstNPCInteraction` | Upsert civilian record with full ERS data |
| `OnFirstVehicleInteraction` | Upsert vehicle record |
| `OnIsOfferedCallout` | Create dispatch row as **PENDING** |
| `OnAcceptedCalloutOffer` | Update dispatch to **ACTIVE**, assign officer callsign |
| `OnArrivedAtCallout` | Update dispatch to **ON SCENE** |
| `OnEndedACallout` | Close dispatch row (**CLOSED**) |
| `OnCalloutCompletedSuccesfully` | Close dispatch row (**COMPLETED**) |
| `OnPullover` | Upsert civilian + vehicle, create **ACTIVE** TRAFFIC STOP dispatch |
| `OnPulloverEnded` | Close TRAFFIC STOP dispatch |
| `OnPursuitStarted` | Create **ACTIVE** VEHICLE PURSUIT dispatch (priority 1) |
| `OnPursuitEnded` | Close VEHICLE PURSUIT dispatch |
| `OnToggleShift` | Upsert/remove active unit row |

Each dispatch row is tracked by a server-side event number keyed to the player source, so `OnEndedACallout` (which sends no callout data) can still close the correct row.

---

## File Structure

```
lwk_cad/
├── fxmanifest.lua
├── config.lua
├── README.md
├── server/
│   └── server.lua          — DB init, ERS hooks, NUI request handlers
├── client/
│   └── client.lua          — MDT open/close, NUI callbacks, live push handlers
└── ui/
    ├── index.html.html     — MDT frontend (do not edit)
    ├── nui.js              — NUI bridge: postToLua helper, message router, UI wiring
    └── images/
        ├── nypd_logo.png
        └── nysp_logo.png
```

---

## License

MIT License — Copyright (c) 2026 lwkjacob. See [LICENSE](LICENSE) for full terms.
