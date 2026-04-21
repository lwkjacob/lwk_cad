// nui.js — FiveM NUI bridge for lwk_cad

function postToLua(endpoint, data) {
    return fetch('https://lwk_cad/' + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(data || {})
    }).then(function(r) { return r.json(); }).catch(function() { return {}; });
}

// ── Lua → NUI message router ──────────────────────────────────────────────────

window.addEventListener('message', function(event) {
    var msg = event.data;
    if (!msg || !msg.action) return;

    switch (msg.action) {

        case 'open':
            document.getElementById('lwk-laptop').style.display = 'flex';
            if (window.lwkOfficer) {
                document.querySelector('.app').style.display = 'flex';
                document.getElementById('login-screen').style.display = 'none';
            } else {
                document.getElementById('login-screen').style.display = 'flex';
            }
            break;

        case 'close':
            document.getElementById('lwk-laptop').style.display = 'none';
            document.querySelector('.app').style.display = 'none';
            document.getElementById('login-screen').style.display = 'none';
            break;

        case 'loginSuccess':
            window.lwkOfficer = msg.data;
            break;

        case 'personResult':
            window.dispatchEvent(new CustomEvent('lwk:personResult', { detail: msg.data }));
            renderPersonResult(msg.data);
            break;

        case 'vehicleResult':
            window.dispatchEvent(new CustomEvent('lwk:vehicleResult', { detail: msg.data }));
            renderVehicleResult(msg.data);
            break;

        case 'unitsResult':
            window.dispatchEvent(new CustomEvent('lwk:unitsResult', { detail: msg.data }));
            renderUnitsTable(msg.data);
            break;

        case 'dispatchResult':
            window.dispatchEvent(new CustomEvent('lwk:dispatchResult', { detail: msg.data }));
            renderDispatchTable(msg.data);
            break;

        case 'dispatchPush':
            window.dispatchEvent(new CustomEvent('lwk:dispatchPush', { detail: msg.data }));
            prependDispatchRow(msg.data);
            break;

        case 'unitUpdate':
            window.dispatchEvent(new CustomEvent('lwk:unitUpdate', { detail: msg.data }));
            applyUnitUpdate(msg.data);
            break;

        case 'reportSaved':
            window.dispatchEvent(new CustomEvent('lwk:reportSaved', { detail: msg.data }));
            if (msg.data && msg.data.success) {
                var st = document.getElementById('form-status');
                if (st) {
                    st.className = 'form-status ok';
                    st.textContent = '✓ Saved to database — ' + (document.getElementById('form-rpt') || {}).textContent;
                    setTimeout(function() { st.className = 'form-status'; st.textContent = ''; }, 4000);
                }
            }
            break;
    }
});

// ── Escape key closes MDT ─────────────────────────────────────────────────────

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        postToLua('closeNUI', {});
    }
});

// ── Render helpers ────────────────────────────────────────────────────────────

function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

var FLAG_LABELS = {
    active_warrant:      { label: '⚑ ACTIVE WARRANT',     cls: 'flag-red'   },
    wanted_person:       { label: '⚑ WANTED PERSON',       cls: 'flag-red'   },
    armed_and_dangerous: { label: '⚠ ARMED & DANGEROUS',   cls: 'flag-red'   },
    homicide:            { label: '⚠ HOMICIDE',            cls: 'flag-red'   },
    terrorism:           { label: '⚠ TERRORISM',           cls: 'flag-red'   },
    kidnapping:          { label: '⚠ KIDNAPPING',          cls: 'flag-red'   },
    sex_offense:         { label: '⚠ SEX OFFENDER',        cls: 'flag-amber' },
    assault:             { label: '⚠ ASSAULT HISTORY',     cls: 'flag-amber' },
    gang_affiliation:    { label: '⚠ GANG AFFILIATION',    cls: 'flag-amber' },
    burglary:            { label: '⚠ BURGLARY',            cls: 'flag-amber' },
    mental_health_issues:{ label: '⚠ MENTAL HEALTH',       cls: 'flag-amber' },
    drug_related:        { label: '⚠ DRUG RELATED',        cls: 'flag-amber' },
    theft:               { label: '⚠ THEFT HISTORY',       cls: 'flag-amber' },
    traffic_violation:   { label: '⚠ TRAFFIC VIOLATIONS',  cls: 'flag-amber' }
};

function licClass(isValid, status) {
    if (!status || status === 'No license') return 'flag-blue';
    return isValid ? 'flag-green' : 'flag-red';
}

function renderPersonResult(data) {
    var panel = document.querySelector('#tab-person .panel:nth-child(2)');
    if (!panel) return;
    var hdr = panel.querySelector('.panel-hdr .ph-title');

    if (!data || !data.found) {
        if (hdr) hdr.textContent = 'Query Result — No Records Found';
        var rec = panel.querySelector('.record');
        if (rec) rec.innerHTML = '<div style="padding:20px;color:#888;text-align:center">No records matching your query were found in the system.</div>';
        return;
    }

    var records = data.records || [];
    if (hdr) hdr.textContent = 'Query Result — ' + records.length + ' Record' + (records.length !== 1 ? 's' : '') + ' Found';

    var html = '';
    records.forEach(function(r) {
        var raw = {};
        try { raw = JSON.parse(r.raw_data || '{}'); } catch(e) {}

        var flagsObj = {};
        try { flagsObj = JSON.parse(r.flags || '{}'); } catch(e) {}

        var inventory = [];
        try { inventory = JSON.parse(r.priors || '[]'); } catch(e) {}

        // ── flag badges ──
        var flagBadges = '';
        Object.keys(FLAG_LABELS).forEach(function(key) {
            if (flagsObj[key]) {
                var f = FLAG_LABELS[key];
                flagBadges += '<span class="flag ' + f.cls + '">' + f.label + '</span> ';
            }
        });
        var medical = [];
        if (raw.isDrunk)   medical.push('<span class="flag flag-amber">⚠ INTOXICATED</span>');
        if (raw.isDrugged) medical.push('<span class="flag flag-amber">⚠ UNDER INFLUENCE</span>');

        // ── header row ──
        html += '<div class="rec-hdr"><div style="flex:1">'
            +   '<div class="rec-name">' + esc(r.last_name) + ', ' + esc(r.first_name) + '</div>'
            +   '<div class="rec-sub">DOB: ' + esc(r.dob) + ' · ' + esc(r.gender)
            +   (raw.Nationality ? ' · ' + esc(raw.Nationality) : '')
            +   (raw.BehaviourState && raw.BehaviourState.label ? ' · ' + esc(raw.BehaviourState.label) : '')
            +   '</div>'
            +   (flagBadges   ? '<div class="flags">' + flagBadges + '</div>' : '')
            +   (medical.length ? '<div class="flags">' + medical.join(' ') + '</div>' : '')
            + '</div>'
            + '<div style="text-align:right;font-size:11px;min-width:110px">'
            +   '<div class="lbl" style="font-size:10px">UNIQUE ID</div>'
            +   '<div class="val" style="font-size:11px">' + esc(r.dl_number || '—') + '</div>'
            + '</div>'
            + '</div>';

        // ── warrant box ──
        if (r.has_warrant) {
            html += '<div class="warn-box" style="background:#fff8f8;border-color:#c01515;margin:4px 0">'
                + '<span style="font-weight:700;color:#8a0000">⚑ ' + esc(r.warrant_reason) + '</span>'
                + '</div>';
        }

        // ── identifying info ──
        html += '<div class="sec-hdr">Identifying Information</div><div class="rec-grid">';
        html += '<span class="rl">Address:</span><span class="rv">' + esc(r.address) + (raw.PostalCode ? ' · ' + esc(raw.PostalCode) : '') + '</span>';
        if (raw.Country)     html += '<span class="rl">Country:</span><span class="rv">' + esc(raw.Country) + '</span>';
        if (raw.Email)       html += '<span class="rl">Email:</span><span class="rv">' + esc(raw.Email) + '</span>';
        if (raw.PhoneNumber) html += '<span class="rl">Phone:</span><span class="rv">' + esc(raw.PhoneNumber) + '</span>';
        html += '</div>';

        // ── licenses — driver's license (Car) and commercial (Truck) only ──
        var carValid  = raw.License_Car_Is_Valid;
        var carStatus = raw.License_Car  || '';
        var truckValid  = raw.License_Truck_Is_Valid;
        var truckStatus = raw.License_Truck || '';
        if (carStatus || truckStatus) {
            html += '<div class="sec-hdr">Licenses</div><div style="padding:5px 8px;display:flex;flex-wrap:wrap;gap:4px">';
            if (carStatus)   html += '<span class="flag ' + licClass(carValid, carStatus)   + '">Driver\'s License: ' + esc(carStatus)   + '</span>';
            if (truckStatus) html += '<span class="flag ' + licClass(truckValid, truckStatus) + '">Commercial Vehicle: ' + esc(truckStatus) + '</span>';
            html += '</div>';
        }
    });

    var rec = panel.querySelector('.record');
    if (!rec) {
        rec = document.createElement('div');
        rec.className = 'record';
        panel.appendChild(rec);
    }
    rec.innerHTML = html;
}

function renderVehicleResult(data) {
    var panel = document.querySelector('#tab-vehicle .panel:nth-child(2)');
    if (!panel) return;
    var hdr = panel.querySelector('.panel-hdr .ph-title');

    if (!data || !data.found) {
        if (hdr) hdr.textContent = 'Query Result — No Record Found';
        var rec = panel.querySelector('.record');
        if (rec) rec.innerHTML = '<div style="padding:20px;color:#888;text-align:center">No vehicle record found for that plate.</div>';
        return;
    }

    var r = data.record;
    if (hdr) hdr.textContent = 'Query Result — 1 Record Found';

    var flags = '';
    if (r.stolen)  flags += '<span class="flag flag-red">⚑ STOLEN</span> ';
    if (r.bolo)    flags += '<span class="flag flag-amber">⚑ BOLO</span> ';
    if (r.reg_status && r.reg_status.toUpperCase() === 'VALID') flags += '<span class="flag flag-blue">REG: VALID</span> ';
    else flags += '<span class="flag flag-amber">REG: ' + esc(r.reg_status) + '</span> ';

    var boloBlock = '';
    if (r.bolo) {
        boloBlock = '<div style="background:#fff4c2;border:1px solid #c09a00;padding:5px 9px;margin-bottom:10px">'
            + '<span style="font-weight:700;color:#5a3a00">⚑ BOLO ACTIVE</span> '
            + '<span style="color:#5a3a00">' + esc(r.bolo_reason) + '</span>'
            + '</div>';
    }

    var html = boloBlock
        + '<div class="rec-hdr"><div style="flex:1">'
        +   '<div class="rec-name">' + esc(r.year) + ' ' + esc(r.make) + ' ' + esc(r.model) + ' — ' + esc(r.color) + '</div>'
        +   '<div class="rec-sub">Plate: <strong>' + esc(r.plate) + '</strong></div>'
        +   '<div class="flags" style="margin-top:5px">' + flags + '</div>'
        + '</div></div>'
        + '<div class="sec-hdr">Registration Details</div>'
        + '<div class="rec-grid">'
        + '<span class="rl">Year / Make / Model:</span><span class="rv">' + esc(r.year) + ' ' + esc(r.make) + ' ' + esc(r.model) + '</span>'
        + '<span class="rl">Color:</span><span class="rv">' + esc(r.color) + '</span>'
        + '<span class="rl">Reg Status:</span><span class="rv ' + (r.reg_status === 'VALID' ? 'c-green' : 'c-orange') + '">' + esc(r.reg_status) + '</span>'
        + '<span class="rl">Insurance:</span><span class="rv ' + (r.ins_status === 'VALID' ? 'c-green' : 'c-orange') + '">' + esc(r.ins_status) + '</span>'
        + '</div>'
        + '<div class="sec-hdr">Registered Owner</div>'
        + '<div class="rec-grid">'
        + '<span class="rl">Name:</span><span class="rv">' + esc(r.owner_last) + ', ' + esc(r.owner_first) + '</span>'
        + '<span class="rl">DLN:</span><span class="rv">' + esc(r.owner_dl) + '</span>'
        + '</div>';

    var rec = panel.querySelector('.record');
    if (!rec) {
        rec = document.createElement('div');
        rec.className = 'record';
        panel.appendChild(rec);
    }
    rec.innerHTML = html;
}

function renderUnitsTable(data) {
    var tbody = document.querySelector('#tab-units .g-units tbody');
    if (!tbody) return;
    var units = (data && data.units) || [];

    if (units.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;padding:12px">No active units on shift</td></tr>';
        return;
    }

    var html = '';
    units.forEach(function(u) {
        var stClass = 'st st-' + (u.status_code || '10-8').replace(/[^0-9]/g, '');
        html += '<tr>'
            + '<td class="c-blue">' + esc(u.callsign) + '</td>'
            + '<td>' + esc(u.officer_name) + '</td>'
            + '<td><span class="' + stClass + '">' + esc(u.status_code) + '</span></td>'
            + '<td>' + esc(u.assignment || '—') + '</td>'
            + '<td>' + esc(u.location || '—') + '</td>'
            + '<td>—</td>'
            + '<td>' + esc(u.department) + '</td>'
            + '</tr>';
    });
    tbody.innerHTML = html;

    var countEl = document.querySelector('#tab-units .panel-hdr span[style*="color:#555"]');
    if (countEl) countEl.textContent = '(' + units.length + ' unit' + (units.length !== 1 ? 's' : '') + ' logged in)';
}

function applyUnitUpdate(unit) {
    if (!unit) return;
    if (unit.status_code === 'OFF') {
        // remove row for this source
        var tbody = document.querySelector('#tab-units .g-units tbody');
        if (!tbody) return;
        var rows = tbody.querySelectorAll('tr[data-src]');
        rows.forEach(function(row) {
            if (row.dataset.src === String(unit.source_id)) row.remove();
        });
        return;
    }
    // live update or add: just re-request full list for simplicity
    postToLua('getActiveUnits', {});
}

var dispatchRows = {};

function renderDispatchTable(data) {
    var tbody = document.querySelector('#tab-dispatch .g-disp tbody');
    if (!tbody) return;
    var calls = (data && data.calls) || [];

    dispatchRows = {};
    if (calls.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;padding:12px">No active calls in system</td></tr>';
        return;
    }

    var html = '';
    calls.forEach(function(c) {
        dispatchRows[c.id] = c;
        html += buildDispatchRow(c);
    });
    tbody.innerHTML = html;

    var countEl = document.querySelector('#tab-dispatch .panel-hdr span[style*="color:#555"]');
    if (countEl) countEl.textContent = '(' + calls.length + ' active)';
}

function prependDispatchRow(c) {
    if (!c) return;
    var tbody = document.querySelector('#tab-dispatch .g-disp tbody');
    if (!tbody) return;
    var empty = tbody.querySelector('td[colspan]');
    if (empty) tbody.innerHTML = '';
    dispatchRows[c.id] = c;
    tbody.insertAdjacentHTML('afterbegin', buildDispatchRow(c));
}

function buildDispatchRow(c) {
    var priClass  = 'pri pri-' + (c.priority || 3);
    var typeClass = c.priority === 1 ? 'c-red' : c.priority === 2 ? 'c-orange' : 'c-blue';
    var timeStr   = c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
    var statusMap = {
        'PENDING':   '<span style="color:#888;font-weight:600">PENDING</span>',
        'ACTIVE':    '<span class="c-green" style="font-weight:600">ACTIVE</span>',
        'ON SCENE':  '<span class="c-blue" style="font-weight:600">ON SCENE</span>',
        'CLOSED':    '<span class="c-dim">CLOSED</span>',
        'COMPLETED': '<span class="c-green">COMPLETED</span>'
    };
    var statusHtml = statusMap[c.status] || esc(c.status);
    return '<tr>'
        + '<td><span class="' + priClass + '">' + esc(c.priority) + '</span></td>'
        + '<td class="c-blue">' + esc(c.event_number) + '</td>'
        + '<td class="' + typeClass + '">' + esc(c.call_type) + '</td>'
        + '<td>' + esc(c.location) + '</td>'
        + '<td>' + esc(c.assigned_units || '—') + '</td>'
        + '<td>' + timeStr + '</td>'
        + '<td>' + statusHtml + '</td>'
        + '</tr>';
}

// ── DOMContentLoaded — wire all interactive elements ─────────────────────────

document.addEventListener('DOMContentLoaded', function() {

    // ── Laptop frame styles ───────────────────────────────────────────────────
    var style = document.createElement('style');
    style.textContent = [
        'html,body{margin:0;padding:0;background:transparent!important;overflow:hidden}',

        '#lwk-laptop{',
        '  display:none;position:fixed;inset:0;z-index:9000;',
        '  align-items:center;justify-content:center;flex-direction:column;',
        '  background:rgba(0,0,0,0.78);',
        '}',

        /* top camera notch */
        '#lwk-lid{',
        '  width:91vw;',
        '  background:#161616;',
        '  border-radius:10px 10px 0 0;',
        '  padding:10px 10px 0;',
        '  box-shadow:inset 0 0 0 1px #2e2e2e;',
        '  display:flex;flex-direction:column;align-items:center;',
        '}',
        '#lwk-camera{',
        '  width:7px;height:7px;border-radius:50%;',
        '  background:#252525;border:1px solid #333;margin-bottom:8px;',
        '}',

        /* screen area */
        '#lwk-screen{',
        '  width:100%;height:82vh;',
        '  position:relative;overflow:hidden;',
        '  background:#285e8e;',
        '  border:2px solid #0a0a0a;',
        '}',

        /* laptop base / trackpad bar */
        '#lwk-base{',
        '  width:91vw;height:22px;',
        '  background:linear-gradient(to bottom,#1e1e1e,#141414);',
        '  border-radius:0 0 10px 10px;',
        '  box-shadow:0 8px 32px rgba(0,0,0,0.8),inset 0 0 0 1px #2a2a2a;',
        '  display:flex;align-items:center;justify-content:center;',
        '}',
        '#lwk-base::after{',
        '  content:"";width:80px;height:5px;',
        '  background:#202020;border-radius:3px;',
        '  border:1px solid #2e2e2e;',
        '}',

        /* override login-screen and .app to fill #lwk-screen, not the viewport */
        '#login-screen{position:absolute!important;inset:0!important;}',
        '.app{width:100%!important;height:100%!important;}',
    ].join('');
    document.head.appendChild(style);

    // ── Build laptop wrapper and move app + login inside it ───────────────────
    var laptop   = document.createElement('div'); laptop.id = 'lwk-laptop';
    var lid      = document.createElement('div'); lid.id    = 'lwk-lid';
    var camera   = document.createElement('div'); camera.id = 'lwk-camera';
    var screen   = document.createElement('div'); screen.id = 'lwk-screen';
    var base     = document.createElement('div'); base.id   = 'lwk-base';

    var loginScreen = document.getElementById('login-screen');
    var app         = document.querySelector('.app');

    // move elements into the screen div (preserves all existing event listeners)
    screen.appendChild(loginScreen);
    screen.appendChild(app);

    lid.appendChild(camera);
    lid.appendChild(screen);
    laptop.appendChild(lid);
    laptop.appendChild(base);
    document.body.appendChild(laptop);

    // Hide everything on load
    loginScreen.style.display = 'none';
    app.style.display = 'none';

    // Clear hardcoded example data so panels start empty
    var personRecord = document.querySelector('#tab-person .panel:nth-child(2) .record');
    if (personRecord) personRecord.innerHTML = '<div style="padding:20px;color:#888;text-align:center">Enter search criteria above and click Query.</div>';
    var personResultHdr = document.querySelector('#tab-person .panel:nth-child(2) .ph-title');
    if (personResultHdr) personResultHdr.textContent = 'Query Result';

    var vehicleRecord = document.querySelector('#tab-vehicle .panel:nth-child(2) .record');
    if (vehicleRecord) vehicleRecord.innerHTML = '<div style="padding:20px;color:#888;text-align:center">Enter a plate number above and click Query.</div>';
    var vehicleResultHdr = document.querySelector('#tab-vehicle .panel:nth-child(2) .ph-title');
    if (vehicleResultHdr) vehicleResultHdr.textContent = 'Query Result';

    var unitsTbody = document.querySelector('#tab-units .g-units tbody');
    if (unitsTbody) unitsTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;padding:12px">No active units. Open this tab after logging in to refresh.</td></tr>';
    var unitsCount = document.querySelector('#tab-units .panel-hdr span[style*="color:#555"]');
    if (unitsCount) unitsCount.textContent = '';

    var dispatchTbody = document.querySelector('#tab-dispatch .g-disp tbody');
    if (dispatchTbody) dispatchTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;padding:12px">No active calls.</td></tr>';
    var dispatchCount = document.querySelector('#tab-dispatch .panel-hdr span[style*="color:#555"]');
    if (dispatchCount) dispatchCount.textContent = '';

    // ── person search ─────────────────────────────────────────────────────────
    var personBar = document.querySelector('#tab-person .search-bar');
    if (personBar) {
        var pInputs = personBar.querySelectorAll('.field input');
        var pBtns   = personBar.querySelectorAll('.qbtn');

        if (pBtns[0]) {
            pBtns[0].addEventListener('click', function() {
                postToLua('lookupPerson', {
                    lastName:  (pInputs[0] && pInputs[0].value.trim()) || '',
                    firstName: (pInputs[1] && pInputs[1].value.trim()) || '',
                    dob:       (pInputs[2] && pInputs[2].value.trim()) || ''
                });
            });
        }
        if (pBtns[1]) {
            pBtns[1].addEventListener('click', function() {
                pInputs.forEach(function(i) { i.value = ''; });
                var rec = document.querySelector('#tab-person .panel:nth-child(2) .record');
                if (rec) rec.innerHTML = '<div style="padding:20px;color:#888;text-align:center">Enter search criteria above and click Query.</div>';
                var hdr = document.querySelector('#tab-person .panel:nth-child(2) .ph-title');
                if (hdr) hdr.textContent = 'Query Result';
            });
        }
    }

    // ── vehicle search ────────────────────────────────────────────────────────
    var vehicleBar = document.querySelector('#tab-vehicle .search-bar');
    if (vehicleBar) {
        var vPlate = vehicleBar.querySelector('.field:nth-child(1) input');
        var vBtns  = vehicleBar.querySelectorAll('.qbtn');

        if (vBtns[0]) {
            vBtns[0].addEventListener('click', function() {
                postToLua('lookupVehicle', {
                    plate: (vPlate && vPlate.value.trim().toUpperCase()) || ''
                });
            });
        }
        if (vBtns[1]) {
            vBtns[1].addEventListener('click', function() {
                vehicleBar.querySelectorAll('.field input').forEach(function(i) { i.value = ''; });
                var rec = document.querySelector('#tab-vehicle .panel:nth-child(2) .record');
                if (rec) rec.innerHTML = '<div style="padding:20px;color:#888;text-align:center">Enter a plate number above and click Query.</div>';
                var hdr = document.querySelector('#tab-vehicle .panel:nth-child(2) .ph-title');
                if (hdr) hdr.textContent = 'Query Result';
            });
        }
    }

    // ── tab switch intercept — fetch data when entering units/dispatch tabs ───
    var origSwitchTab = window.switchTab;
    if (origSwitchTab) {
        window.switchTab = function(name, btn) {
            origSwitchTab(name, btn);
            if (name === 'units')    postToLua('getActiveUnits', {});
            if (name === 'dispatch') postToLua('getDispatchFeed', {});
        };
    }

    // ── fix state dropdown to NY only ────────────────────────────────────────
    var stateSelect = document.querySelector('#tab-vehicle .search-bar select');
    if (stateSelect) {
        stateSelect.innerHTML = '<option value="NY">NY</option>';
    }

    // ── clear hardcoded example values from search inputs ────────────────────
    var personInputs = document.querySelectorAll('#tab-person .search-bar .field input');
    personInputs.forEach(function(i) { i.value = ''; });
    var vehicleInputs = document.querySelectorAll('#tab-vehicle .search-bar .field input');
    vehicleInputs.forEach(function(i) { i.value = ''; });

    // ── replace SVG dept seals with real logo images ──────────────────────────
    var IMG_MAP = { nypd: 'images/nypd_logo.png', nysp: 'images/nysp_logo.png' };
    var origUpdateDept = window.updateDept;
    window.updateDept = function() {
        origUpdateDept();
        var key = (document.getElementById('login-dept') || {}).value;
        var sealEl = document.getElementById('login-seal');
        if (sealEl && IMG_MAP[key]) {
            sealEl.innerHTML = '<img src="' + IMG_MAP[key] + '" style="width:68px;height:68px;object-fit:contain">';
        }
    };

    // ── patch doLogin to send officer info to Lua ─────────────────────────────
    var origDoLogin = window.doLogin;
    if (origDoLogin) {
        window.doLogin = function() {
            origDoLogin();
            var dept = document.getElementById('login-dept');
            var name = document.getElementById('login-name');
            var cs   = document.getElementById('login-callsign');
            var deptVal = dept && dept.value;
            var nameVal = name && name.value.trim();
            var csVal   = cs   && cs.value.trim();
            if (deptVal && nameVal && csVal) {
                var payload = { name: nameVal, callsign: csVal, department: deptVal };
                window.lwkOfficer = payload;
                postToLua('officerLogin', payload);
            }
        };
    }

    // ── patch saveForm to persist report to DB ────────────────────────────────
    var origSaveForm = window.saveForm;
    if (origSaveForm) {
        window.saveForm = function() {
            origSaveForm();
            var activeDoc = document.querySelector('.f-doc[style*="block"]');
            if (!activeDoc) return;

            var rptNum    = (document.getElementById('form-rpt') || {}).textContent || '';
            var activeBtn = document.querySelector('.fs-btn.active');
            var rptType   = activeBtn ? activeBtn.textContent : '';
            var officer   = window.lwkOfficer || {};

            // Collect all text inputs as a flat JSON blob
            var formData = {};
            activeDoc.querySelectorAll('input[type=text], textarea').forEach(function(el, i) {
                var label = el.closest('.field, td');
                var lbl = label ? (label.querySelector('label,.fl') || {}).textContent : null;
                formData[lbl || ('field_' + i)] = el.value;
            });

            postToLua('submitReport', {
                reportType:  rptType,
                reportNumber: rptNum,
                officerName: officer.name || '',
                callsign:    officer.callsign || '',
                subjectName: '',
                plate:       '',
                contentJson: JSON.stringify(formData)
            });
        };
    }

    // ── active units Refresh tool ─────────────────────────────────────────────
    var refreshBtn = document.querySelector('#tab-units .tool');
    if (refreshBtn && refreshBtn.textContent.trim() === 'Refresh') {
        refreshBtn.addEventListener('click', function() {
            postToLua('getActiveUnits', {});
        });
    }

});
