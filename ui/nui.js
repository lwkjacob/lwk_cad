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
            if (msg.deptConfig) window.lwkDeptConfig = msg.deptConfig;
            if (msg.loadingDelayMin !== undefined) window.lwkDelayMin = msg.loadingDelayMin;
            if (msg.loadingDelayMax !== undefined) window.lwkDelayMax = msg.loadingDelayMax;
            document.getElementById('lwk-laptop').style.display = 'flex';
            if (window.lwkOfficer) {
                document.querySelector('.app').style.display = 'flex';
                document.getElementById('login-screen').style.display = 'none';
            } else {
                var _ls = document.getElementById('login-screen');
                _ls.style.transition = 'none';
                _ls.style.opacity    = '1';
                _ls.style.display    = 'flex';
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
            if (msg.data && msg.data.records && msg.data.records.length > 0) {
                window.lwkLastPerson = msg.data.records[0];
            }
            break;

        case 'vehicleResult':
            window.dispatchEvent(new CustomEvent('lwk:vehicleResult', { detail: msg.data }));
            renderVehicleResult(msg.data);
            if (msg.data && msg.data.record) {
                window.lwkLastVehicle = msg.data.record;
            }
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

        case 'reportsResult':
            renderReportsList(msg.data && msg.data.reports);
            break;

        case 'reportDetailResult':
            renderReportDetail(msg.data);
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

function applyDeptToForms(deptKey) {
    var depts = window.lwkDeptConfig || {};
    var d = depts[deptKey];
    if (!d) return;
    document.querySelectorAll('.ag-name').forEach(function(el) { el.textContent = d.name; });
    document.querySelectorAll('.ag-sub').forEach(function(el)  { el.textContent = d.sub;  });
    if (d.seal) {
        document.querySelectorAll('.doc-seal').forEach(function(el) {
            el.innerHTML = '<img src="' + d.seal + '" style="width:54px;height:54px;object-fit:contain">';
        });
    }
}

function renderReportsList(reports) {
    var listEl = document.getElementById('rpt-list-view');
    var detailEl = document.getElementById('rpt-detail-view');
    if (!listEl) return;
    if (detailEl) { detailEl.style.display = 'none'; listEl.style.display = 'block'; }

    if (!reports || reports.length === 0) {
        listEl.innerHTML = '<div style="padding:20px;color:#888;text-align:center">No saved reports found.</div>';
        return;
    }

    var html = '<table class="grid g-disp" style="width:100%"><thead><tr>'
        + '<th>Rpt #</th><th>Type</th><th>Officer</th><th>Callsign</th><th>Subject</th><th>Date</th><th></th>'
        + '</tr></thead><tbody>';
    reports.forEach(function(r) {
        var dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString() : '—';
        html += '<tr>'
            + '<td class="c-blue">' + esc(r.report_number) + '</td>'
            + '<td>' + esc(r.report_type) + '</td>'
            + '<td>' + esc(r.officer_name) + '</td>'
            + '<td>' + esc(r.callsign) + '</td>'
            + '<td>' + esc(r.subject_name || '—') + '</td>'
            + '<td>' + dateStr + '</td>'
            + '<td><button class="fbtn" data-rpt-id="' + r.id + '">View</button></td>'
            + '</tr>';
    });
    html += '</tbody></table>';
    listEl.innerHTML = html;

    listEl.querySelectorAll('[data-rpt-id]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            postToLua('getReportDetail', { id: parseInt(btn.dataset.rptId) });
        });
    });
}

function renderReportDetail(data) {
    var listEl   = document.getElementById('rpt-list-view');
    var detailEl = document.getElementById('rpt-detail-view');
    var contentEl = document.getElementById('rpt-detail-content');
    if (!detailEl || !contentEl) return;

    if (!data || !data.found) {
        contentEl.innerHTML = '<div style="padding:20px;color:#888">Report not found.</div>';
    } else {
        var r = data.report;
        var fields = {};
        try { fields = JSON.parse(r.content_json || '{}'); } catch(e) {}

        var rows = '';
        Object.keys(fields).forEach(function(k) {
            if (fields[k] && fields[k] !== '') {
                rows += '<tr><td style="font-weight:600;padding:3px 8px;white-space:nowrap;color:#444">' + esc(k) + '</td>'
                    + '<td style="padding:3px 8px">' + esc(fields[k]) + '</td></tr>';
            }
        });

        contentEl.innerHTML = '<div style="padding:8px 10px;background:#f4f6fa;border-bottom:1px solid #ccc;margin-bottom:8px">'
            + '<span style="font-weight:700;font-size:12px">' + esc(r.report_type) + '</span>'
            + ' &nbsp;·&nbsp; Rpt #: <strong>' + esc(r.report_number) + '</strong>'
            + ' &nbsp;·&nbsp; Officer: ' + esc(r.officer_name) + ' (' + esc(r.callsign) + ')'
            + (r.subject_name ? ' &nbsp;·&nbsp; Subject: ' + esc(r.subject_name) : '')
            + '</div>'
            + (rows ? '<table style="width:100%;border-collapse:collapse;font-size:11px">' + rows + '</table>'
                    : '<div style="padding:12px;color:#888">No field data recorded.</div>');
    }

    if (listEl) listEl.style.display = 'none';
    detailEl.style.display = 'flex';
}

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

function normLicStatus(raw, isValid) {
    if (!raw || raw === 'No license') return 'No License';
    var s = raw.toLowerCase();
    if (s.indexOf('revoked')    !== -1) return 'Revoked';
    if (s.indexOf('suspended')  !== -1) return 'Suspended';
    if (s.indexOf('expired')    !== -1) return 'Expired';
    if (s.indexOf('invalid')    !== -1) return 'Invalid';
    if (s.indexOf('restricted') !== -1) return 'Restricted';
    return isValid ? 'Valid' : 'Invalid';
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

        // ── header row ──
        html += '<div class="rec-hdr"><div style="flex:1">'
            +   '<div class="rec-name">' + esc(r.last_name) + ', ' + esc(r.first_name) + '</div>'
            +   '<div class="rec-sub">DOB: ' + esc(r.dob) + ' · ' + esc(r.gender)
            +   (raw.Nationality ? ' · ' + esc(raw.Nationality) : '')
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
            if (carStatus)   html += '<span class="flag ' + licClass(carValid, carStatus)     + '">Driver\'s License: '    + esc(normLicStatus(carStatus,   carValid))   + '</span>';
            if (truckStatus) html += '<span class="flag ' + licClass(truckValid, truckStatus) + '">Commercial Vehicle: '  + esc(normLicStatus(truckStatus, truckValid)) + '</span>';
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
    else flags += '<span class="flag flag-amber">REG: INVALID</span> ';

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
        + '<span class="rl">Reg Status:</span><span class="rv ' + (r.reg_status === 'VALID' ? 'c-green' : 'c-orange') + '">' + (r.reg_status === 'VALID' ? 'VALID' : 'INVALID') + '</span>'
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
    var countEl = document.querySelector('#tab-dispatch .panel-hdr span[style*="color:#555"]');
    if (calls.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;padding:12px">No active calls in system</td></tr>';
        if (countEl) countEl.textContent = '(0 active)';
        return;
    }

    var html = '';
    calls.forEach(function(c) {
        dispatchRows[c.event_number] = c;
        html += buildDispatchRow(c);
    });
    tbody.innerHTML = html;

    if (countEl) countEl.textContent = '(' + calls.length + ' active)';
}

function prependDispatchRow(c) {
    if (!c) return;
    var tbody = document.querySelector('#tab-dispatch .g-disp tbody');
    if (!tbody) return;

    var finished = (c.status === 'CLOSED' || c.status === 'COMPLETED');
    var existing = c.event_number ? tbody.querySelector('tr[data-ev="' + c.event_number + '"]') : null;

    if (existing) {
        if (finished) {
            existing.remove();
            delete dispatchRows[c.event_number];
        } else {
            // merge updated fields and re-render in place
            var merged = Object.assign({}, dispatchRows[c.event_number] || {}, c);
            dispatchRows[c.event_number] = merged;
            existing.outerHTML = buildDispatchRow(merged);
        }
    } else if (!finished) {
        var empty = tbody.querySelector('td[colspan]');
        if (empty) tbody.innerHTML = '';
        dispatchRows[c.event_number] = c;
        tbody.insertAdjacentHTML('afterbegin', buildDispatchRow(c));
    }

    // update the active count label
    var countEl = document.querySelector('#tab-dispatch .panel-hdr span[style*="color:#555"]');
    if (countEl) {
        var rows = tbody.querySelectorAll('tr[data-ev]');
        countEl.textContent = '(' + rows.length + ' active)';
    }
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
    var clearBtn  = '<button class="fbtn disp-clear-btn"  data-ev="' + esc(c.event_number) + '" style="font-size:9px;padding:1px 5px;margin-left:4px;vertical-align:middle">Clear</button>';
    var assignBtn = '<button class="fbtn disp-assign-btn" data-ev="' + esc(c.event_number) + '" style="font-size:9px;padding:1px 5px;margin-left:2px;vertical-align:middle">+Me</button>';
    return '<tr data-ev="' + esc(c.event_number) + '">'
        + '<td><span class="' + priClass + '">' + esc(c.priority) + '</span></td>'
        + '<td class="c-blue">' + esc(c.event_number) + '</td>'
        + '<td class="' + typeClass + '">' + esc(c.call_type) + '</td>'
        + '<td>' + esc(c.location) + '</td>'
        + '<td>' + esc(c.assigned_units || '—') + '</td>'
        + '<td>' + timeStr + '</td>'
        + '<td>' + statusHtml + clearBtn + assignBtn + '</td>'
        + '</tr>';
}

// ── Simulated latency helpers ─────────────────────────────────────────────────

function fakeDelay(cb) {
    var lo = (window.lwkDelayMin !== undefined) ? window.lwkDelayMin : 500;
    var hi = (window.lwkDelayMax !== undefined) ? window.lwkDelayMax : 1000;
    if (lo === 0 && hi === 0) { cb(); return; }
    setTimeout(cb, lo + Math.floor(Math.random() * Math.max(1, hi - lo)));
}

function randomMsg(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function lwkLoadingHtml(msg) {
    return '<div class="lwk-loading"><div class="lwk-spinner"></div><span>' + esc(msg) + '</span></div>';
}

var LWK_QUERY_MSGS  = ['Querying database...', 'Searching records...', 'Connecting to NCIC...', 'Retrieving data...'];
var LWK_SUBMIT_MSGS = ['Transmitting report...', 'Uploading to database...', 'Saving record...'];
var LWK_LOGIN_MSGS  = ['Authenticating credentials...', 'Verifying department access...', 'Establishing secure session...'];

// ── NY Charges data ───────────────────────────────────────────────────────────

var NY_CHARGES = [
    // HOMICIDE
    { cat:'Homicide', sec:'PL 125.27', desc:'Murder in the First Degree',                cls:'Felony' },
    { cat:'Homicide', sec:'PL 125.25', desc:'Murder in the Second Degree',               cls:'Felony' },
    { cat:'Homicide', sec:'PL 125.22', desc:'Aggravated Murder',                         cls:'Felony' },
    { cat:'Homicide', sec:'PL 125.20', desc:'Manslaughter in the First Degree',          cls:'Felony' },
    { cat:'Homicide', sec:'PL 125.15', desc:'Manslaughter in the Second Degree',         cls:'Felony' },
    { cat:'Homicide', sec:'PL 125.12', desc:'Vehicular Manslaughter in the First Degree',cls:'Felony' },
    { cat:'Homicide', sec:'PL 125.11', desc:'Vehicular Manslaughter in the Second Degree',cls:'Felony' },
    { cat:'Homicide', sec:'PL 125.10', desc:'Criminally Negligent Homicide',             cls:'Felony' },
    // ASSAULT
    { cat:'Assault & Battery', sec:'PL 120.10', desc:'Assault in the First Degree',      cls:'Felony' },
    { cat:'Assault & Battery', sec:'PL 120.06', desc:'Gang Assault in the First Degree', cls:'Felony' },
    { cat:'Assault & Battery', sec:'PL 120.07', desc:'Gang Assault in the Second Degree',cls:'Felony' },
    { cat:'Assault & Battery', sec:'PL 120.05', desc:'Assault in the Second Degree',     cls:'Felony' },
    { cat:'Assault & Battery', sec:'PL 120.00', desc:'Assault in the Third Degree',      cls:'Misdemeanor' },
    { cat:'Assault & Battery', sec:'PL 120.13', desc:'Menacing in the First Degree',     cls:'Felony' },
    { cat:'Assault & Battery', sec:'PL 120.14', desc:'Menacing in the Second Degree',    cls:'Misdemeanor' },
    { cat:'Assault & Battery', sec:'PL 120.15', desc:'Menacing in the Third Degree',     cls:'Misdemeanor' },
    { cat:'Assault & Battery', sec:'PL 120.55', desc:'Stalking in the Second Degree',    cls:'Felony' },
    { cat:'Assault & Battery', sec:'PL 120.50', desc:'Stalking in the Third Degree',     cls:'Misdemeanor' },
    { cat:'Assault & Battery', sec:'PL 120.45', desc:'Stalking in the Fourth Degree',    cls:'Misdemeanor' },
    { cat:'Assault & Battery', sec:'PL 120.20', desc:'Reckless Endangerment in the First Degree', cls:'Felony' },
    { cat:'Assault & Battery', sec:'PL 120.25', desc:'Reckless Endangerment in the Second Degree',cls:'Misdemeanor' },
    // KIDNAPPING & CONFINEMENT
    { cat:'Kidnapping & Confinement', sec:'PL 135.25', desc:'Kidnapping in the First Degree',      cls:'Felony' },
    { cat:'Kidnapping & Confinement', sec:'PL 135.20', desc:'Kidnapping in the Second Degree',     cls:'Felony' },
    { cat:'Kidnapping & Confinement', sec:'PL 135.10', desc:'Unlawful Imprisonment in the First Degree',  cls:'Felony' },
    { cat:'Kidnapping & Confinement', sec:'PL 135.05', desc:'Unlawful Imprisonment in the Second Degree', cls:'Misdemeanor' },
    { cat:'Kidnapping & Confinement', sec:'PL 135.65', desc:'Coercion in the First Degree',        cls:'Felony' },
    { cat:'Kidnapping & Confinement', sec:'PL 135.60', desc:'Coercion in the Second Degree',       cls:'Misdemeanor' },
    // SEXUAL OFFENSES
    { cat:'Sexual Offenses', sec:'PL 130.95', desc:'Predatory Sexual Assault',           cls:'Felony' },
    { cat:'Sexual Offenses', sec:'PL 130.35', desc:'Rape in the First Degree',           cls:'Felony' },
    { cat:'Sexual Offenses', sec:'PL 130.30', desc:'Rape in the Second Degree',          cls:'Felony' },
    { cat:'Sexual Offenses', sec:'PL 130.25', desc:'Rape in the Third Degree',           cls:'Felony' },
    { cat:'Sexual Offenses', sec:'PL 130.70', desc:'Aggravated Sexual Abuse in the First Degree', cls:'Felony' },
    { cat:'Sexual Offenses', sec:'PL 130.67', desc:'Aggravated Sexual Abuse in the Second Degree',cls:'Felony' },
    { cat:'Sexual Offenses', sec:'PL 130.65', desc:'Sexual Abuse in the First Degree',   cls:'Felony' },
    { cat:'Sexual Offenses', sec:'PL 130.60', desc:'Sexual Abuse in the Second Degree',  cls:'Misdemeanor' },
    { cat:'Sexual Offenses', sec:'PL 130.55', desc:'Sexual Abuse in the Third Degree',   cls:'Misdemeanor' },
    { cat:'Sexual Offenses', sec:'PL 130.52', desc:'Forcible Touching',                  cls:'Misdemeanor' },
    // ROBBERY
    { cat:'Robbery', sec:'PL 160.15', desc:'Robbery in the First Degree',                cls:'Felony' },
    { cat:'Robbery', sec:'PL 160.10', desc:'Robbery in the Second Degree',               cls:'Felony' },
    { cat:'Robbery', sec:'PL 160.05', desc:'Robbery in the Third Degree',                cls:'Felony' },
    // BURGLARY & TRESPASS
    { cat:'Burglary & Trespass', sec:'PL 140.30', desc:'Burglary in the First Degree',   cls:'Felony' },
    { cat:'Burglary & Trespass', sec:'PL 140.25', desc:'Burglary in the Second Degree',  cls:'Felony' },
    { cat:'Burglary & Trespass', sec:'PL 140.20', desc:'Burglary in the Third Degree',   cls:'Felony' },
    { cat:'Burglary & Trespass', sec:'PL 140.17', desc:'Criminal Trespass in the First Degree',  cls:'Felony' },
    { cat:'Burglary & Trespass', sec:'PL 140.15', desc:'Criminal Trespass in the Second Degree', cls:'Misdemeanor' },
    { cat:'Burglary & Trespass', sec:'PL 140.10', desc:'Criminal Trespass in the Third Degree',  cls:'Misdemeanor' },
    { cat:'Burglary & Trespass', sec:'PL 140.00', desc:'Trespass',                       cls:'Infraction' },
    // LARCENY & THEFT
    { cat:'Larceny & Theft', sec:'PL 155.42', desc:'Grand Larceny in the First Degree',  cls:'Felony' },
    { cat:'Larceny & Theft', sec:'PL 155.40', desc:'Grand Larceny in the Second Degree', cls:'Felony' },
    { cat:'Larceny & Theft', sec:'PL 155.35', desc:'Grand Larceny in the Third Degree',  cls:'Felony' },
    { cat:'Larceny & Theft', sec:'PL 155.30', desc:'Grand Larceny in the Fourth Degree', cls:'Felony' },
    { cat:'Larceny & Theft', sec:'PL 155.43', desc:'Grand Larceny of a Motor Vehicle',   cls:'Felony' },
    { cat:'Larceny & Theft', sec:'PL 155.25', desc:'Petit Larceny',                      cls:'Misdemeanor' },
    { cat:'Larceny & Theft', sec:'PL 165.06', desc:'Unauthorized Use of a Vehicle 2nd',  cls:'Misdemeanor' },
    { cat:'Larceny & Theft', sec:'PL 165.08', desc:'Unauthorized Use of a Vehicle 1st',  cls:'Felony' },
    { cat:'Larceny & Theft', sec:'PL 165.15', desc:'Theft of Services',                  cls:'Misdemeanor' },
    { cat:'Larceny & Theft', sec:'PL 165.54', desc:'Criminal Possession of Stolen Property 1st', cls:'Felony' },
    { cat:'Larceny & Theft', sec:'PL 165.52', desc:'Criminal Possession of Stolen Property 2nd', cls:'Felony' },
    { cat:'Larceny & Theft', sec:'PL 165.50', desc:'Criminal Possession of Stolen Property 3rd', cls:'Felony' },
    { cat:'Larceny & Theft', sec:'PL 165.45', desc:'Criminal Possession of Stolen Property 4th', cls:'Felony' },
    { cat:'Larceny & Theft', sec:'PL 165.40', desc:'Criminal Possession of Stolen Property 5th', cls:'Misdemeanor' },
    // FRAUD & FORGERY
    { cat:'Fraud & Forgery', sec:'PL 170.30', desc:'Criminal Possession of a Forged Instrument 1st', cls:'Felony' },
    { cat:'Fraud & Forgery', sec:'PL 170.25', desc:'Criminal Possession of a Forged Instrument 2nd', cls:'Felony' },
    { cat:'Fraud & Forgery', sec:'PL 170.20', desc:'Criminal Possession of a Forged Instrument 3rd', cls:'Misdemeanor' },
    { cat:'Fraud & Forgery', sec:'PL 190.80', desc:'Identity Theft in the First Degree',  cls:'Felony' },
    { cat:'Fraud & Forgery', sec:'PL 190.79', desc:'Identity Theft in the Second Degree', cls:'Felony' },
    { cat:'Fraud & Forgery', sec:'PL 190.78', desc:'Identity Theft in the Third Degree',  cls:'Misdemeanor' },
    { cat:'Fraud & Forgery', sec:'PL 190.26', desc:'Criminal Impersonation in the First Degree',  cls:'Felony' },
    { cat:'Fraud & Forgery', sec:'PL 190.25', desc:'Criminal Impersonation in the Second Degree', cls:'Misdemeanor' },
    { cat:'Fraud & Forgery', sec:'PL 190.65', desc:'Scheme to Defraud in the First Degree',  cls:'Felony' },
    { cat:'Fraud & Forgery', sec:'PL 190.60', desc:'Scheme to Defraud in the Second Degree', cls:'Misdemeanor' },
    // CRIMINAL MISCHIEF
    { cat:'Criminal Mischief & Arson', sec:'PL 145.12', desc:'Criminal Mischief in the First Degree',  cls:'Felony' },
    { cat:'Criminal Mischief & Arson', sec:'PL 145.10', desc:'Criminal Mischief in the Second Degree', cls:'Felony' },
    { cat:'Criminal Mischief & Arson', sec:'PL 145.05', desc:'Criminal Mischief in the Third Degree',  cls:'Felony' },
    { cat:'Criminal Mischief & Arson', sec:'PL 145.00', desc:'Criminal Mischief in the Fourth Degree', cls:'Misdemeanor' },
    { cat:'Criminal Mischief & Arson', sec:'PL 150.20', desc:'Arson in the First Degree',   cls:'Felony' },
    { cat:'Criminal Mischief & Arson', sec:'PL 150.15', desc:'Arson in the Second Degree',  cls:'Felony' },
    { cat:'Criminal Mischief & Arson', sec:'PL 150.10', desc:'Arson in the Third Degree',   cls:'Felony' },
    { cat:'Criminal Mischief & Arson', sec:'PL 150.05', desc:'Arson in the Fourth Degree',  cls:'Felony' },
    { cat:'Criminal Mischief & Arson', sec:'PL 150.01', desc:'Arson in the Fifth Degree',   cls:'Misdemeanor' },
    // WEAPONS
    { cat:'Weapons', sec:'PL 265.04',   desc:'Criminal Possession of a Weapon 1st Degree',   cls:'Felony' },
    { cat:'Weapons', sec:'PL 265.09',   desc:'Criminal Use of a Firearm 1st Degree',          cls:'Felony' },
    { cat:'Weapons', sec:'PL 265.08',   desc:'Criminal Use of a Firearm 2nd Degree',          cls:'Felony' },
    { cat:'Weapons', sec:'PL 265.03',   desc:'Criminal Possession of a Weapon 2nd Degree',   cls:'Felony' },
    { cat:'Weapons', sec:'PL 265.02',   desc:'Criminal Possession of a Weapon 3rd Degree',   cls:'Felony' },
    { cat:'Weapons', sec:'PL 265.01-b', desc:'Criminal Possession of a Firearm',              cls:'Felony' },
    { cat:'Weapons', sec:'PL 265.01',   desc:'Criminal Possession of a Weapon 4th Degree',   cls:'Misdemeanor' },
    { cat:'Weapons', sec:'PL 265.35',   desc:'Prohibited Use of Weapons',                    cls:'Misdemeanor' },
    // DRUGS
    { cat:'Drugs / Controlled Substances', sec:'PL 220.18', desc:'Criminal Possession of a Controlled Substance 2nd Degree', cls:'Felony' },
    { cat:'Drugs / Controlled Substances', sec:'PL 220.16', desc:'Criminal Possession of a Controlled Substance 3rd Degree', cls:'Felony' },
    { cat:'Drugs / Controlled Substances', sec:'PL 220.09', desc:'Criminal Possession of a Controlled Substance 4th Degree', cls:'Felony' },
    { cat:'Drugs / Controlled Substances', sec:'PL 220.06', desc:'Criminal Possession of a Controlled Substance 5th Degree', cls:'Felony' },
    { cat:'Drugs / Controlled Substances', sec:'PL 220.03', desc:'Criminal Possession of a Controlled Substance 7th Degree', cls:'Misdemeanor' },
    { cat:'Drugs / Controlled Substances', sec:'PL 220.41', desc:'Criminal Sale of a Controlled Substance 2nd Degree', cls:'Felony' },
    { cat:'Drugs / Controlled Substances', sec:'PL 220.39', desc:'Criminal Sale of a Controlled Substance 3rd Degree', cls:'Felony' },
    { cat:'Drugs / Controlled Substances', sec:'PL 220.34', desc:'Criminal Sale of a Controlled Substance 4th Degree', cls:'Felony' },
    { cat:'Drugs / Controlled Substances', sec:'PL 220.31', desc:'Criminal Sale of a Controlled Substance 5th Degree', cls:'Felony' },
    { cat:'Drugs / Controlled Substances', sec:'PL 221.10', desc:'Criminal Possession of Marihuana 5th Degree',        cls:'Misdemeanor' },
    { cat:'Drugs / Controlled Substances', sec:'PL 221.40', desc:'Criminal Sale of Marihuana 4th Degree',              cls:'Misdemeanor' },
    // PUBLIC ORDER & OBSTRUCTION
    { cat:'Public Order & Obstruction', sec:'PL 205.30', desc:'Resisting Arrest',                   cls:'Misdemeanor' },
    { cat:'Public Order & Obstruction', sec:'PL 195.07', desc:'Obstructing Governmental Administration 1st Degree', cls:'Felony' },
    { cat:'Public Order & Obstruction', sec:'PL 195.05', desc:'Obstructing Governmental Administration 2nd Degree', cls:'Misdemeanor' },
    { cat:'Public Order & Obstruction', sec:'PL 270.35', desc:'Unlawful Fleeing a Police Officer in a Motor Vehicle', cls:'Felony' },
    { cat:'Public Order & Obstruction', sec:'PL 215.51', desc:'Criminal Contempt in the First Degree',  cls:'Felony' },
    { cat:'Public Order & Obstruction', sec:'PL 215.50', desc:'Criminal Contempt in the Second Degree', cls:'Misdemeanor' },
    { cat:'Public Order & Obstruction', sec:'PL 240.30', desc:'Aggravated Harassment in the Second Degree', cls:'Misdemeanor' },
    { cat:'Public Order & Obstruction', sec:'PL 240.25', desc:'Harassment in the Second Degree',     cls:'Infraction' },
    { cat:'Public Order & Obstruction', sec:'PL 240.20', desc:'Disorderly Conduct',                  cls:'Infraction' },
    { cat:'Public Order & Obstruction', sec:'PL 240.50', desc:'Falsely Reporting an Incident',       cls:'Misdemeanor' },
    { cat:'Public Order & Obstruction', sec:'PL 215.40', desc:'Tampering with Physical Evidence',    cls:'Felony' },
    { cat:'Public Order & Obstruction', sec:'PL 210.15', desc:'Perjury in the First Degree',         cls:'Felony' },
    { cat:'Public Order & Obstruction', sec:'PL 210.10', desc:'Perjury in the Second Degree',        cls:'Misdemeanor' },
    { cat:'Public Order & Obstruction', sec:'PL 175.30', desc:'Offering a False Instrument for Filing', cls:'Misdemeanor' },
    // ORGANIZED CRIME
    { cat:'Organized Crime', sec:'PL 460.20', desc:'Enterprise Corruption',                          cls:'Felony' },
    { cat:'Organized Crime', sec:'PL 470.20', desc:'Money Laundering in the First Degree',           cls:'Felony' },
    { cat:'Organized Crime', sec:'PL 470.15', desc:'Money Laundering in the Second Degree',          cls:'Felony' },
    { cat:'Organized Crime', sec:'PL 470.10', desc:'Money Laundering in the Third Degree',           cls:'Felony' },
    { cat:'Organized Crime', sec:'PL 470.05', desc:'Money Laundering in the Fourth Degree',          cls:'Felony' },
    { cat:'Organized Crime', sec:'PL 200.04', desc:'Bribery in the First Degree',                    cls:'Felony' },
    { cat:'Organized Crime', sec:'PL 200.00', desc:'Bribery in the Third Degree',                    cls:'Felony' },
    // VEHICLE & TRAFFIC (VTL)
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 1192.1',   desc:'Driving While Ability Impaired (DWAI)',          cls:'Infraction' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 1192.2',   desc:'Driving While Intoxicated — Per Se',             cls:'Misdemeanor' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 1192.3',   desc:'Driving While Intoxicated — Common Law',         cls:'Misdemeanor' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 1192.4',   desc:'Driving While Ability Impaired by Drugs',        cls:'Misdemeanor' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 1193.1(c)','desc':'Aggravated DWI / Felony DWI',                  cls:'Felony' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 1300(b)',  desc:'Fleeing a Police Officer in a Motor Vehicle',     cls:'Felony' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 511(3)',   desc:'Aggravated Unlicensed Operation 1st Degree',      cls:'Felony' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 511',      desc:'Aggravated Unlicensed Operation 3rd Degree',      cls:'Misdemeanor' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 509',      desc:'Unlicensed Operation of a Motor Vehicle',         cls:'Misdemeanor' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 600(2)',   desc:'Leaving the Scene of an Accident with Injury',    cls:'Felony' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 600(1)',   desc:'Leaving the Scene of an Accident',                cls:'Misdemeanor' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 401(1)(a)', desc:'Operating Unregistered Motor Vehicle',            cls:'Misdemeanor' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 319',      desc:'Operating Uninsured Motor Vehicle',               cls:'Misdemeanor' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 1180(d)',  desc:'Speeding',                                        cls:'Infraction' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 1180(f)',  desc:'Speeding in a School Zone',                       cls:'Infraction' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 1212',     desc:'Reckless Driving',                                cls:'Misdemeanor' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 1129(a)',  desc:'Following Too Closely',                           cls:'Infraction' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 1163(a)',  desc:'Failure to Signal',                               cls:'Infraction' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 1111(d)',  desc:'Failure to Obey Traffic Signal',                  cls:'Infraction' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 1125',     desc:'Failure to Yield Right of Way',                   cls:'Infraction' },
    { cat:'Vehicle & Traffic (VTL)', sec:'VTL 375',      desc:'Equipment / Safety Violation',                    cls:'Infraction' },
];

// ── Toast notification ────────────────────────────────────────────────────────

function lwkToast(msg, type) {
    var screen = document.getElementById('lwk-screen');
    if (!screen) return;
    var toast = document.createElement('div');
    var bg = (type === 'error') ? '#8a0000' : (type === 'ok') ? '#0a5a1a' : '#1a3a6e';
    toast.style.cssText = 'position:absolute;bottom:28px;left:50%;transform:translateX(-50%);'
        + 'background:' + bg + ';color:#fff;font:700 11px Tahoma,sans-serif;'
        + 'padding:6px 16px;border-radius:3px;z-index:9999;white-space:nowrap;'
        + 'box-shadow:2px 4px 12px rgba(0,0,0,0.7);pointer-events:none;'
        + 'animation:lwk-fadein .15s ease';
    toast.textContent = msg;
    screen.appendChild(toast);
    setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 2800);
}

// ── Form field helpers ────────────────────────────────────────────────────────

function findFieldInDoc(doc, labelText) {
    var spans = doc.querySelectorAll('.fl');
    for (var i = 0; i < spans.length; i++) {
        if (spans[i].textContent.trim() === labelText) {
            return spans[i].parentElement.querySelector('input.fi, textarea.fi, select.fi');
        }
    }
    return null;
}

function setField(doc, labelText, value) {
    if (!value && value !== 0) return;
    var el = findFieldInDoc(doc, labelText);
    if (el) el.value = value;
}

function applyPersonToForm(doc, person) {
    if (!person) return;
    var fullName = (person.last_name || '') + (person.first_name ? ', ' + person.first_name : '');
    setField(doc, 'Last Name',  person.last_name  || '');
    setField(doc, 'First Name', person.first_name || '');
    // Common fields
    setField(doc, 'Date of Birth',       person.dob         || '');
    setField(doc, 'DOB',                 person.dob         || '');
    setField(doc, 'Residential Address', person.address     || '');
    setField(doc, 'Driver License #',    person.dl_number   || '');
    setField(doc, 'Driver License Number', person.dl_number || '');
    setField(doc, 'State ID',            person.dl_number   || '');
    setField(doc, 'Sex',                 person.gender      || '');
    setField(doc, 'Gender',              person.gender      || '');
    // Search Warrant
    setField(doc, 'Subject Name (if applicable)', fullName);
}

function applyVehicleToForm(doc, vehicle) {
    if (!vehicle) return;
    var ownerName = vehicle.owner_last ? (vehicle.owner_last + ', ' + (vehicle.owner_first || '')) : '';
    setField(doc, 'Vehicle Plate',   vehicle.plate || '');
    setField(doc, 'License Plate',   vehicle.plate || '');
    setField(doc, 'Make / Model',    (vehicle.make || '') + ' ' + (vehicle.model || ''));
    setField(doc, 'Make',            vehicle.make  || '');
    setField(doc, 'Model',           vehicle.model || '');
    setField(doc, 'Year',            vehicle.year  || '');
    setField(doc, 'Color',           vehicle.color || '');
    setField(doc, 'Registered Owner', ownerName);
    setField(doc, 'DL / ID #',       vehicle.owner_dl || '');
    // Citation vehicle plate
    if (!findFieldInDoc(doc, 'Vehicle Plate')) setField(doc, 'License Plate', vehicle.plate || '');
    // Search warrant
    setField(doc, 'Vehicle Plate (if applicable)', vehicle.plate || '');
    setField(doc, 'Vehicle Description', (vehicle.year || '') + ' ' + (vehicle.make || '') + ' ' + (vehicle.model || '') + ' — ' + (vehicle.color || ''));
}

function applyChargesToForm(doc, charges) {
    if (!charges || charges.length === 0) return;
    var c1 = charges[0], c2 = charges[1], c3 = charges[2];

    // Arrest Report — 3 charge rows with selects
    var primary     = findFieldInDoc(doc, 'Primary Charge — PC Section');
    var primaryDesc = findFieldInDoc(doc, 'Charge Description');
    var add2Sec  = findFieldInDoc(doc, 'Additional Charge 2');
    var add2Desc = null, add3Sec = null, add3Desc = null;

    // Walk through all .fl labels to find "Description" after "Additional Charge 2"
    var fls = doc.querySelectorAll('.fl');
    var foundAdd2 = false, foundAdd3 = false;
    for (var i = 0; i < fls.length; i++) {
        var t = fls[i].textContent.trim();
        if (t === 'Additional Charge 2') { foundAdd2 = true; continue; }
        if (foundAdd2 && !add2Desc && t === 'Description') {
            add2Desc = fls[i].parentElement.querySelector('input.fi');
            foundAdd2 = false;
        }
        if (t === 'Additional Charge 3') { foundAdd3 = true; continue; }
        if (foundAdd3 && !add3Desc && t === 'Description') {
            add3Sec  = findFieldInDoc(doc, 'Additional Charge 3');
            add3Desc = fls[i].parentElement.querySelector('input.fi');
            foundAdd3 = false;
        }
    }

    if (primary) {
        primary.value = c1.sec;
        if (primaryDesc) primaryDesc.value = c1.desc;
        var row1Select = primary.closest('tr') ? primary.closest('tr').querySelector('select.fi') : null;
        if (row1Select) row1Select.value = c1.cls;
    }
    if (c2 && add2Sec) {
        add2Sec.value = c2.sec;
        if (add2Desc) add2Desc.value = c2.desc;
        var row2 = add2Sec.closest('tr');
        if (row2) { var s2 = row2.querySelector('select.fi'); if (s2) s2.value = c2.cls; }
    }
    if (c3 && add3Sec) {
        add3Sec.value = c3.sec;
        if (add3Desc) add3Desc.value = c3.desc;
        var row3 = add3Sec.closest('tr');
        if (row3) { var s3 = row3.querySelector('select.fi'); if (s3) s3.value = c3.cls; }
    }

    // Written Warning — "Violation Code / Section" + "Violation Description"
    var warnSec  = findFieldInDoc(doc, 'Violation Code / Section');
    var warnDesc = findFieldInDoc(doc, 'Violation Description');
    if (warnSec)  warnSec.value  = c1.sec;
    if (warnDesc) warnDesc.value = c1.desc;

    // Citation — "Section" + "Violation" + classification checkboxes
    var citSec  = findFieldInDoc(doc, 'Section');
    var citViol = findFieldInDoc(doc, 'Violation');
    if (citSec)  citSec.value  = c1.sec;
    if (citViol) citViol.value = c1.desc;
    // set citation classification checkboxes (only present in citation form)
    if (citSec || citViol) {
        var clsLower = c1.cls.toLowerCase();
        doc.querySelectorAll('input[type=checkbox].cb').forEach(function(cb) {
            var lbl = cb.parentElement ? cb.parentElement.textContent.trim().toLowerCase() : '';
            cb.checked = lbl.indexOf(clsLower) !== -1;
        });
    }
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

        /* loading spinner / toast */
        '@keyframes lwk-spin{to{transform:rotate(360deg)}}',
        '@keyframes lwk-fadein{from{opacity:0;transform:translateX(-50%) translateY(6px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}',
        '.lwk-spinner{width:14px;height:14px;border:2px solid #c0cce0;border-top-color:#285e8e;border-radius:50%;animation:lwk-spin .65s linear infinite;flex-shrink:0}',
        '.lwk-loading{display:flex;align-items:center;gap:10px;padding:24px 20px;color:#555;font-size:11px;justify-content:center}',

        /* override login-screen and .app to fill #lwk-screen, not the viewport */
        '#login-screen{position:absolute!important;inset:0!important;}',
        '.app{width:100%!important;height:100%!important;}',

        /* fix department select clipping */
        '.login-field select{height:auto!important;min-height:26px!important;padding:4px 6px!important;line-height:normal!important;}',

        /* auto-uppercase person and vehicle search inputs */
        '#tab-person .search-bar .field input,#tab-vehicle .search-bar .field input{text-transform:uppercase;}',

        /* status update dropdown panel */
        '#lwk-status-panel{background:#f4f2e3;border:1px solid #a8a594;box-shadow:2px 4px 10px rgba(0,0,0,.4);padding:8px 10px;min-width:230px;white-space:normal;}',

        /* widen dispatch last column to fit Clear + Assign buttons */
        '.g-disp col.du{width:17%}',
        '.g-disp col.lo{width:20%}',

        /* callsign edit panel */
        '#lwk-cs-panel{background:#f4f2e3;border:1px solid #a8a594;box-shadow:2px 4px 10px rgba(0,0,0,.4);padding:8px 10px;min-width:200px;white-space:normal;}',

        /* logout button red tint */
        '#lwk-logout-btn{color:#8a0000!important;border-color:#c08080!important;}',
        '#lwk-logout-btn:hover{background:#fff0f0!important;border-color:#c01515!important;}',
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

    // Login loading overlay
    var loginOverlay = document.createElement('div');
    loginOverlay.id = 'login-loading';
    loginOverlay.style.cssText = 'display:none;position:absolute;inset:0;background:rgba(240,244,252,0.94);z-index:20;align-items:center;justify-content:center;flex-direction:column;gap:10px';
    loginOverlay.innerHTML = '<div class="lwk-spinner" style="width:20px;height:20px;border-width:3px"></div>'
        + '<div id="login-load-msg" style="font-size:11px;font-weight:600;color:#1a3a6e;letter-spacing:.03em">Authenticating...</div>';
    loginScreen.appendChild(loginOverlay);

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

    // ── remove LSPDN network indicator and "Source:" labels ──────────────────
    var netSpan = document.querySelector('.net');
    if (netSpan) netSpan.remove();
    document.querySelectorAll('.panel-hdr .lbl').forEach(function(el) {
        if (el.textContent.indexOf('LSPDN') !== -1 || el.textContent.indexOf('SA-DMV') !== -1) {
            el.remove();
        }
    });

    // ── status update control (identity bar) ─────────────────────────────────
    var clockEl = document.getElementById('clock');
    if (clockEl) {
        var statusWrap = document.createElement('div');
        statusWrap.id = 'lwk-status-wrap';
        statusWrap.style.cssText = 'position:relative;display:flex;align-items:center;gap:4px;flex-shrink:0';
        statusWrap.innerHTML = ''
            + '<span class="lbl">Status:</span>'
            + '<span id="lwk-my-status" class="st st-8">10-8</span>'
            + '<button class="tool" id="lwk-status-btn" style="padding:0 5px;height:16px;font-size:10px">▾</button>'
            + '<div id="lwk-status-panel" style="display:none;position:absolute;top:100%;right:0;margin-top:2px;z-index:200">'
            +   '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#555;margin-bottom:6px">Update My Status</div>'
            +   '<div class="field" style="margin-bottom:5px"><label>Status Code</label>'
            +     '<select id="lwk-status-select" style="width:100%;height:22px">'
            +       '<option value="10-8">10-8 — Available</option>'
            +       '<option value="10-6">10-6 — Busy</option>'
            +       '<option value="10-97">10-97 — On Scene</option>'
            +       '<option value="10-7">10-7 — Out of Service</option>'
            +       '<option value="10-15">10-15 — Prisoner Transport</option>'
            +       '<option value="10-0">10-0 — Officer Down</option>'
            +     '</select>'
            +   '</div>'
            +   '<div class="field" style="margin-bottom:6px"><label>Location</label>'
            +     '<input type="text" id="lwk-status-location" placeholder="e.g. ALTA ST / POWER ST" style="width:100%">'
            +   '</div>'
            +   '<div style="text-align:right">'
            +     '<button class="fbtn primary" id="lwk-status-submit">Update ▶</button>'
            +   '</div>'
            + '</div>';
        clockEl.parentNode.insertBefore(statusWrap, clockEl);

        document.getElementById('lwk-status-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            var panel = document.getElementById('lwk-status-panel');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });

        document.getElementById('lwk-status-submit').addEventListener('click', function() {
            var code = document.getElementById('lwk-status-select').value || '10-8';
            var loc  = document.getElementById('lwk-status-location').value.trim();
            postToLua('updateStatus', { statusCode: code, location: loc, assignment: '' });
            var badge = document.getElementById('lwk-my-status');
            if (badge) {
                badge.textContent = code;
                badge.className = 'st st-' + code.replace(/[^0-9]/g, '');
            }
            document.getElementById('lwk-status-panel').style.display = 'none';
        });
    }

    // ── change callsign button ────────────────────────────────────────────────
    var csWrap = document.createElement('div');
    csWrap.id = 'lwk-cs-wrap';
    csWrap.style.cssText = 'position:relative;display:flex;align-items:center;flex-shrink:0;margin-left:4px';
    csWrap.innerHTML = ''
        + '<button class="tool" id="lwk-cs-btn" title="Change Callsign" style="padding:0 5px;height:16px;font-size:10px">↺ CS</button>'
        + '<div id="lwk-cs-panel" style="display:none;position:absolute;top:100%;right:0;margin-top:2px;z-index:200">'
        +   '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#555;margin-bottom:6px">Change Callsign</div>'
        +   '<div class="field" style="margin-bottom:6px"><label>New Callsign</label>'
        +     '<input type="text" id="lwk-cs-input" placeholder="e.g. 3-ADAM-14" style="width:100%;text-transform:uppercase">'
        +   '</div>'
        +   '<div style="text-align:right">'
        +     '<button class="fbtn primary" id="lwk-cs-submit">Update ▶</button>'
        +   '</div>'
        + '</div>';

    if (clockEl) {
        clockEl.parentNode.insertBefore(csWrap, clockEl);
    }

    var csBtnEl = document.getElementById('lwk-cs-btn');
    if (csBtnEl) csBtnEl.addEventListener('click', function(e) {
        e.stopPropagation();
        var panel = document.getElementById('lwk-cs-panel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        if (panel.style.display === 'block') {
            var inp = document.getElementById('lwk-cs-input');
            if (inp) { inp.value = (window.lwkOfficer && window.lwkOfficer.callsign) || ''; inp.focus(); }
        }
    });

    var csSubmitEl = document.getElementById('lwk-cs-submit');
    if (csSubmitEl) csSubmitEl.addEventListener('click', function() {
        var newCs = (document.getElementById('lwk-cs-input').value || '').trim().toUpperCase();
        if (!newCs) return;
        if (window.lwkOfficer) window.lwkOfficer.callsign = newCs;
        var unitEl = document.getElementById('ident-unit');
        if (unitEl) unitEl.textContent = newCs;
        postToLua('updateCallsign', { callsign: newCs });
        try { var s = JSON.parse(localStorage.getItem('lwk_login') || '{}'); s.callsign = newCs; localStorage.setItem('lwk_login', JSON.stringify(s)); } catch(e) {}
        document.getElementById('lwk-cs-panel').style.display = 'none';
    });

    // ── logout button ─────────────────────────────────────────────────────────
    var logoutBtn = document.createElement('button');
    logoutBtn.className = 'tool';
    logoutBtn.id = 'lwk-logout-btn';
    logoutBtn.title = 'Log Out of MDT';
    logoutBtn.style.cssText = 'padding:0 5px;height:16px;font-size:10px;margin-left:4px;flex-shrink:0';
    logoutBtn.textContent = '⏻ Logout';
    if (clockEl) clockEl.parentNode.insertBefore(logoutBtn, clockEl);

    logoutBtn.addEventListener('click', function() {
        postToLua('officerLogout', {});
        window.lwkOfficer = null;
        try { localStorage.removeItem('lwk_login'); } catch(e) {}
        document.querySelector('.app').style.display = 'none';
        var ls = document.getElementById('login-screen');
        ls.style.transition = 'none';
        ls.style.opacity    = '1';
        ls.style.display    = 'flex';
        var loginOverlay = document.getElementById('login-loading');
        if (loginOverlay) loginOverlay.style.display = 'none';
    });

    // close callsign panel on outside click
    document.addEventListener('click', function(e) {
        var wrap  = document.getElementById('lwk-cs-wrap');
        var panel = document.getElementById('lwk-cs-panel');
        if (wrap && panel && !wrap.contains(e.target)) {
            panel.style.display = 'none';
        }
    });

    // ── inject Saved Reports sidebar button ───────────────────────────────────
    var sidebar = document.querySelector('.form-sidebar');
    if (sidebar) {
        var sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:#444;margin:6px 0';
        var rptHdr = document.createElement('div');
        rptHdr.className = 'fs-hdr';
        rptHdr.textContent = 'Records';
        var rptBtn = document.createElement('button');
        rptBtn.className = 'fs-btn';
        rptBtn.id = 'btn-saved-reports';
        rptBtn.textContent = 'Saved Reports';
        sidebar.appendChild(sep);
        sidebar.appendChild(rptHdr);
        sidebar.appendChild(rptBtn);
    }

    // ── inject Saved Reports panel into form-main ────────────────────────────
    var formMain = document.querySelector('.form-main');
    if (formMain) {
        var rptPanel = document.createElement('div');
        rptPanel.id = 'form-reports';
        rptPanel.style.cssText = 'display:none;flex-direction:column;flex:1;min-height:0';
        rptPanel.innerHTML = ''
            + '<div class="form-toolbar">'
            +   '<span class="ft-title">Saved Reports</span>'
            +   '<span class="sp"></span>'
            +   '<button class="fbtn" id="rpt-refresh-btn">↻ Refresh</button>'
            + '</div>'
            + '<div id="rpt-list-view" style="overflow-y:auto;flex:1;padding:8px"></div>'
            + '<div id="rpt-detail-view" style="display:none;flex-direction:column;flex:1;min-height:0">'
            +   '<div style="padding:4px 8px;border-bottom:1px solid #ccc">'
            +     '<button class="fbtn" id="rpt-back-btn">← Back to List</button>'
            +   '</div>'
            +   '<div id="rpt-detail-content" style="overflow-y:auto;flex:1;padding:4px 0"></div>'
            + '</div>';
        formMain.appendChild(rptPanel);

        // wire up Saved Reports sidebar button
        var btnSaved = document.getElementById('btn-saved-reports');
        if (btnSaved) {
            btnSaved.addEventListener('click', function() {
                document.querySelectorAll('.fs-btn').forEach(function(b) { b.classList.remove('active'); });
                btnSaved.classList.add('active');
                document.getElementById('form-no-sel').style.display = 'none';
                document.getElementById('form-area').style.display   = 'none';
                rptPanel.style.display = 'flex';
                postToLua('getReports', {});
            });
        }

        // wire up Refresh button
        document.addEventListener('click', function(e) {
            if (e.target && e.target.id === 'rpt-refresh-btn') {
                postToLua('getReports', {});
            }
            if (e.target && e.target.id === 'rpt-back-btn') {
                var listEl   = document.getElementById('rpt-list-view');
                var detailEl = document.getElementById('rpt-detail-view');
                if (listEl)   listEl.style.display   = 'block';
                if (detailEl) detailEl.style.display  = 'none';
            }
        });
    }

    // ── person search ─────────────────────────────────────────────────────────
    var personBar = document.querySelector('#tab-person .search-bar');
    if (personBar) {
        var pInputs = personBar.querySelectorAll('.field input');
        var pBtns   = personBar.querySelectorAll('.qbtn');

        if (pBtns[0]) {
            pBtns[0].addEventListener('click', function() {
                var lastName  = ((pInputs[0] && pInputs[0].value.trim()) || '').toUpperCase();
                var firstName = ((pInputs[1] && pInputs[1].value.trim()) || '').toUpperCase();
                if (!lastName && !firstName) return;
                var rec = document.querySelector('#tab-person .panel:nth-child(2) .record');
                var hdr = document.querySelector('#tab-person .panel:nth-child(2) .ph-title');
                if (hdr) hdr.textContent = 'Searching...';
                if (rec) rec.innerHTML = lwkLoadingHtml(randomMsg(LWK_QUERY_MSGS));
                pBtns[0].disabled = true;
                fakeDelay(function() {
                    pBtns[0].disabled = false;
                    postToLua('lookupPerson', {
                        lastName:  lastName,
                        firstName: firstName,
                        dob:       (pInputs[2] && pInputs[2].value.trim()) || ''
                    });
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
                var plate = (vPlate && vPlate.value.trim().toUpperCase()) || '';
                if (!plate) return;
                var rec = document.querySelector('#tab-vehicle .panel:nth-child(2) .record');
                var hdr = document.querySelector('#tab-vehicle .panel:nth-child(2) .ph-title');
                if (hdr) hdr.textContent = 'Searching...';
                if (rec) rec.innerHTML = lwkLoadingHtml(randomMsg(LWK_QUERY_MSGS));
                vBtns[0].disabled = true;
                fakeDelay(function() {
                    vBtns[0].disabled = false;
                    postToLua('lookupVehicle', { plate: plate });
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

    // ── patch selectForm to hide the reports panel when a form type is picked ─
    var origSelectForm = window.selectForm;
    if (origSelectForm) {
        window.selectForm = function(key, btn) {
            origSelectForm(key, btn);
            var rptPanel = document.getElementById('form-reports');
            if (rptPanel) rptPanel.style.display = 'none';
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
            var deptVal = (document.getElementById('login-dept')     || {}).value        || '';
            var nameVal = (document.getElementById('login-name')     || {}).value.trim() || '';
            var csVal   = (document.getElementById('login-callsign') || {}).value.trim() || '';
            if (!deptVal || !nameVal || !csVal) {
                origDoLogin(); // show validation error immediately
                return;
            }
            // show loading overlay and cycle messages
            var overlay = document.getElementById('login-loading');
            var msgEl   = document.getElementById('login-load-msg');
            if (overlay) overlay.style.display = 'flex';
            var step = 0;
            if (msgEl) msgEl.textContent = LWK_LOGIN_MSGS[0];
            var msgInterval = setInterval(function() {
                step++;
                if (step < LWK_LOGIN_MSGS.length && msgEl) msgEl.textContent = LWK_LOGIN_MSGS[step];
            }, 700);
            fakeDelay(function() {
                clearInterval(msgInterval);
                origDoLogin();
                var payload = { name: nameVal, callsign: csVal, department: deptVal };
                window.lwkOfficer = payload;
                postToLua('officerLogin', payload);
                applyDeptToForms(deptVal);
                try { localStorage.setItem('lwk_login', JSON.stringify(payload)); } catch(e) {}
            });
        };
    }

    // ── patch saveForm to persist report to DB ────────────────────────────────
    var origSaveForm = window.saveForm;
    if (origSaveForm) {
        window.saveForm = function() {
            var activeDoc = document.querySelector('.f-doc[style*="block"]');
            if (!activeDoc) return;

            // snapshot form values immediately before any delay
            var rptNum    = (document.getElementById('form-rpt') || {}).textContent || '';
            var activeBtn = document.querySelector('.fs-btn.active');
            var rptType   = activeBtn ? activeBtn.textContent.trim() : '';
            var officer   = window.lwkOfficer || {};
            var formData  = {};
            activeDoc.querySelectorAll('input[type=text], textarea').forEach(function(el, i) {
                var label = el.closest('.field, td');
                var lbl = label ? (label.querySelector('label,.fl') || {}).textContent : null;
                formData[lbl || ('field_' + i)] = el.value;
            });

            // show transmitting state
            var st = document.getElementById('form-status');
            if (st) { st.className = 'form-status ok'; st.textContent = randomMsg(LWK_SUBMIT_MSGS); }
            var submitBtn = document.querySelector('#form-area .fbtn.primary');
            var origBtnText = submitBtn ? submitBtn.textContent : 'Save & Submit ▶';
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Transmitting...'; }

            fakeDelay(function() {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origBtnText; }
                origSaveForm();
                postToLua('submitReport', {
                    reportType:   rptType,
                    reportNumber: rptNum,
                    officerName:  officer.name || '',
                    callsign:     officer.callsign || '',
                    subjectName:  '',
                    plate:        '',
                    contentJson:  JSON.stringify(formData)
                });
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

    // ── dispatch Clear button ─────────────────────────────────────────────────
    document.addEventListener('click', function(e) {
        var btn = e.target.closest('.disp-clear-btn');
        if (!btn) return;
        postToLua('clearDispatch', { eventNumber: btn.dataset.ev });
    });

    // ── dispatch Assign Me button ─────────────────────────────────────────────
    document.addEventListener('click', function(e) {
        var btn = e.target.closest('.disp-assign-btn');
        if (!btn) return;
        postToLua('assignToCall', { eventNumber: btn.dataset.ev });
    });

    // ── close status panel on outside click ───────────────────────────────────
    document.addEventListener('click', function(e) {
        var wrap  = document.getElementById('lwk-status-wrap');
        var panel = document.getElementById('lwk-status-panel');
        if (wrap && panel && !wrap.contains(e.target)) {
            panel.style.display = 'none';
        }
    });

    // ── form toolbar import buttons ───────────────────────────────────────────
    var clearFormBtn = document.querySelector('#form-area .form-toolbar .fbtn');
    if (clearFormBtn) {
        var toolbar = clearFormBtn.parentNode;

        function makeToolbarBtn(id, label, title) {
            var b = document.createElement('button');
            b.className = 'fbtn'; b.id = id; b.title = title;
            b.style.cssText = 'margin-left:4px';
            b.textContent = label;
            toolbar.insertBefore(b, clearFormBtn);
            return b;
        }

        var btnImportVehicle = makeToolbarBtn('lwk-import-vehicle', '🚗 Import Vehicle', 'Fill vehicle fields from last Vehicle Lookup');
        var btnImportPerson  = makeToolbarBtn('lwk-import-person',  '👤 Import Person',  'Fill person fields from last Person Lookup');
        var btnImportCharges = makeToolbarBtn('lwk-import-charges', '⚖ Import Charges',  'Select NY charges to fill into this form');

        btnImportCharges.addEventListener('click', function() {
            var modal = document.getElementById('lwk-charges-modal');
            if (modal) {
                window.lwkSelectedCharges = [];
                renderChargesList('');
                document.getElementById('lwk-chrg-search').value = '';
                updateChargeCount();
                modal.style.display = 'flex';
                document.getElementById('lwk-chrg-search').focus();
            }
        });

        btnImportPerson.addEventListener('click', function() {
            var p = window.lwkLastPerson;
            if (!p) { lwkToast('No person on file — run a Person Lookup first.', 'error'); return; }
            var doc = document.querySelector('.f-doc[style*="block"]');
            if (!doc) { lwkToast('No form is open.', 'error'); return; }
            applyPersonToForm(doc, p);
        });

        btnImportVehicle.addEventListener('click', function() {
            var v = window.lwkLastVehicle;
            if (!v) { lwkToast('No vehicle on file — run a Vehicle Lookup first.', 'error'); return; }
            var doc = document.querySelector('.f-doc[style*="block"]');
            if (!doc) { lwkToast('No form is open.', 'error'); return; }
            applyVehicleToForm(doc, v);
        });
    }

    // ── charges modal ─────────────────────────────────────────────────────────
    var chargesModal = document.createElement('div');
    chargesModal.id  = 'lwk-charges-modal';
    chargesModal.style.cssText = 'display:none;position:absolute;inset:0;z-index:600;background:rgba(0,0,0,0.72);align-items:center;justify-content:center;flex-direction:column';
    chargesModal.innerHTML = ''
        + '<div style="background:#f4f2e3;border:2px outset #d0ccb0;width:82%;max-height:84%;display:flex;flex-direction:column;box-shadow:6px 10px 28px rgba(0,0,0,0.8)">'
        +   '<div style="padding:5px 10px;background:linear-gradient(#1a4fb8,#0f3494);display:flex;align-items:center;gap:8px;flex-shrink:0">'
        +     '<span style="font-weight:700;font-size:12px;color:#fff;flex:1">Import Charges — New York Penal Law / VTL</span>'
        +     '<span id="lwk-chrg-sel-count" style="font-size:10px;color:#c0d0ff;margin-right:8px">0 of 3 selected</span>'
        +     '<button class="fbtn" id="lwk-chrg-close" style="font-size:10px">✕ Close</button>'
        +     '<button class="fbtn primary" id="lwk-chrg-apply" style="font-size:10px">Apply ▶</button>'
        +   '</div>'
        +   '<div style="padding:5px 8px;border-bottom:1px solid #b5b29c;background:#eae8d5;flex-shrink:0">'
        +     '<input type="text" id="lwk-chrg-search" placeholder="Search by section number, charge name, or keyword..." style="width:100%;padding:4px 6px;font:11px Tahoma,sans-serif;border:1px inset #a8a594;background:#fff">'
        +   '</div>'
        +   '<div id="lwk-chrg-list" style="overflow-y:auto;flex:1;padding:4px 8px;font-size:11px;background:#fff"></div>'
        + '</div>';

    var lwkScreen = document.getElementById('lwk-screen');
    if (lwkScreen) lwkScreen.appendChild(chargesModal);

    window.lwkSelectedCharges = [];

    function updateChargeCount() {
        var el = document.getElementById('lwk-chrg-sel-count');
        if (el) el.textContent = window.lwkSelectedCharges.length + ' of 3 selected';
    }

    var CLS_COLOR = { Felony: '#c01515', Misdemeanor: '#b86000', Infraction: '#1a4fb8' };

    function renderChargesList(query) {
        var listEl = document.getElementById('lwk-chrg-list');
        if (!listEl) return;
        var q = (query || '').toLowerCase().trim();

        // group into categories
        var cats = {};
        NY_CHARGES.forEach(function(ch) {
            var match = !q
                || ch.sec.toLowerCase().indexOf(q) !== -1
                || ch.desc.toLowerCase().indexOf(q) !== -1
                || ch.cls.toLowerCase().indexOf(q) !== -1
                || ch.cat.toLowerCase().indexOf(q) !== -1;
            if (!match) return;
            if (!cats[ch.cat]) cats[ch.cat] = [];
            cats[ch.cat].push(ch);
        });

        var html = '';
        Object.keys(cats).forEach(function(cat) {
            html += '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#555;'
                +   'padding:6px 6px 2px;border-bottom:1px solid #ddd;margin-top:4px;background:#f0eed8">' + esc(cat) + '</div>';
            cats[cat].forEach(function(ch) {
                var idx = window.lwkSelectedCharges.findIndex(function(s) { return s.sec === ch.sec; });
                var checked = idx !== -1;
                var clsColor = CLS_COLOR[ch.cls] || '#333';
                html += '<div class="lwk-charge-row" data-sec="' + esc(ch.sec) + '" style="display:flex;align-items:center;gap:8px;padding:3px 6px;border-bottom:1px solid #f0eed8;cursor:pointer' + (checked ? ';background:#e8f0ff' : '') + '">'
                    +   '<input type="checkbox" data-sec="' + esc(ch.sec) + '"' + (checked ? ' checked' : '') + ' style="flex-shrink:0;cursor:pointer">'
                    +   '<span style="flex-shrink:0;min-width:100px;font-weight:700;color:#1a4fb8">' + esc(ch.sec) + '</span>'
                    +   '<span style="flex:1">' + esc(ch.desc) + '</span>'
                    +   '<span style="flex-shrink:0;font-size:10px;font-weight:700;color:' + clsColor + ';min-width:82px;text-align:right">' + esc(ch.cls) + '</span>'
                    + '</div>';
            });
        });

        if (!html) html = '<div style="padding:24px;text-align:center;color:#888">No charges match your search.</div>';
        listEl.innerHTML = html;

        listEl.querySelectorAll('.lwk-charge-row').forEach(function(row) {
            row.addEventListener('click', function(e) {
                var sec = row.dataset.sec;
                var charge = NY_CHARGES.find(function(c) { return c.sec === sec; });
                if (!charge) return;
                var existIdx = window.lwkSelectedCharges.findIndex(function(s) { return s.sec === sec; });
                if (existIdx !== -1) {
                    window.lwkSelectedCharges.splice(existIdx, 1);
                } else {
                    if (window.lwkSelectedCharges.length >= 3) {
                        window.lwkSelectedCharges.shift(); // drop oldest if over limit
                    }
                    window.lwkSelectedCharges.push(charge);
                }
                updateChargeCount();
                renderChargesList(document.getElementById('lwk-chrg-search').value);
            });
        });
    }

    document.addEventListener('click', function(e) {
        var closeBtn = e.target.closest('#lwk-chrg-close');
        if (closeBtn) { document.getElementById('lwk-charges-modal').style.display = 'none'; return; }

        var applyBtn = e.target.closest('#lwk-chrg-apply');
        if (applyBtn) {
            var doc = document.querySelector('.f-doc[style*="block"]');
            if (!doc) { lwkToast('No form is open.', 'error'); return; }
            applyChargesToForm(doc, window.lwkSelectedCharges);
            document.getElementById('lwk-charges-modal').style.display = 'none';
            return;
        }
    });

    var chrgSearch = document.getElementById('lwk-chrg-search');
    if (chrgSearch) {
        chrgSearch.addEventListener('input', function() {
            renderChargesList(this.value);
        });
    }

    // ── restore last login ────────────────────────────────────────────────────
    try {
        var saved = JSON.parse(localStorage.getItem('lwk_login') || 'null');
        if (saved) {
            var deptEl = document.getElementById('login-dept');
            var nameEl = document.getElementById('login-name');
            var csEl   = document.getElementById('login-callsign');
            if (deptEl && saved.department) { deptEl.value = saved.department; window.updateDept && window.updateDept(); }
            if (nameEl && saved.name)       nameEl.value = saved.name;
            if (csEl   && saved.callsign)   csEl.value   = saved.callsign;
        }
    } catch(e) {}

});
