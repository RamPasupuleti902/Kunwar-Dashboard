/*
 * Each "site" is a separate pair of Sales / Campaigns tabs that the
 * dashboard can switch between via the Site dropdown in the UI.
 *
 * Add more sites here later by adding another key with its own
 * salesSheet / campaignsSheet / convertCurrency.
 */
const SITES = {
  uk: {
    label: 'UK',
    salesSheet: 'Sales',
    campaignsSheet: 'Campaigns',
    geoSheet: 'Geo wise',          // Google Ads "Matched locations report" blocks
    convertCurrency: true   // Sales revenue is in GBP, converted to USD below
  },
  airhub: {
    label: 'Airhub',
    salesSheet: 'Airhub Sales',
    campaignsSheet: 'Airhub Campaigns',
    geoSheet: 'Airhub Geo wise',
    convertCurrency: false  // Assumed already in USD. Set to true if Airhub revenue is GBP too.
  }
};

const DEFAULT_SITE = 'uk';

/*
 * How numeric text dates are written in your sheets.
 * 'DMY' = 12/09/2026 is 12 September 2026 (India/UK)
 * 'MDY' = 12/09/2026 is 9 December 2026 (US)
 */
const DATE_ORDER = 'DMY';

/*
 * true  = trust cells that Google Sheets already stores as real dates.
 * false = ignore stored date values and re-parse the DISPLAYED text
 *         using DATE_ORDER. Use this if the sheet locale was US when the
 *         dates were pasted, so Sheets itself swapped day and month.
 */
const TRUST_SHEET_DATES = false;

/* =========================================================
 * ACCESS CONTROL (Google sign-in + email allowlist)
 *
 * Only the Google accounts below can open the dashboard or load
 * its data. Anyone else sees an "Access denied" page.
 *
 * Deploy settings (Deploy > Manage deployments > Edit):
 *   Execute as:      User accessing the web app
 *   Who has access:  Anyone with Google account
 *
 * Share this spreadsheet as VIEWER with the same emails, otherwise
 * the script cannot read the sheets on their behalf.
 *
 * To add or remove someone: edit this list, save, then
 * Deploy > Manage deployments > Edit > Version: New version > Deploy.
 * ========================================================= */

/*
 * false = email restriction OFF: anyone who can open the web app
 *         link sees the dashboard (ALLOWED_EMAILS is ignored).
 * true  = only the emails in ALLOWED_EMAILS can open it.
 */
const RESTRICT_ACCESS = true;

const ALLOWED_EMAILS = [
  'khichineeraj1@gmail.com',
  'kunwarsingh1920@gmail.com',
  'marketing5@clay.co.in',
  'ram.p@clay.co.in',
  'kumar.k@clay.co.in'
  // add more emails here, then redeploy a new version
];

/*
 * Must match the deployment: true when the web app is deployed as
 * "Execute as: User accessing the web app" (see appsscript.json).
 *
 * Only in that mode is the effective user the same person as the
 * visitor, so it is safe to use as a fallback when Google hides the
 * active user's email (cross-domain accounts, editor runs).
 * NEVER set this to true if you deploy as "Execute as: Me", or every
 * visitor would be treated as the script owner.
 */
const EXECUTES_AS_USER = true;

function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function currentUserEmail_() {

  var email = '';

  /*
   * 1. Active user (the normal case).
   */
  try {
    email = normalizeEmail_(Session.getActiveUser().getEmail());
  } catch (e) {
    email = '';
  }

  if (email) {
    return email;
  }

  /*
   * 2. Effective user. Same person as the visitor only when the
   *    web app executes as the user accessing it.
   */
  if (EXECUTES_AS_USER) {
    try {
      email = normalizeEmail_(Session.getEffectiveUser().getEmail());
    } catch (e) {
      email = '';
    }
  }

  if (email) {
    return email;
  }

  /*
   * 3. Google userinfo endpoint with the current OAuth token
   *    (needs the userinfo.email scope in appsscript.json).
   */
  if (EXECUTES_AS_USER) {
    try {
      var res = UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) {
        email = normalizeEmail_(JSON.parse(res.getContentText()).email);
      }
    } catch (e) {
      email = '';
    }
  }

  return email;
}

function isAllowed_(email) {
  if (!RESTRICT_ACCESS) return true;
  var target = normalizeEmail_(email);
  if (!target) return false;
  return ALLOWED_EMAILS
    .map(normalizeEmail_)
    .indexOf(target) !== -1;
}

/*
 * Server-side guard for every call from the browser.
 */
function requireAccess_() {
  var email = currentUserEmail_();
  if (!isAllowed_(email)) {
    throw new Error(
      'ACCESS_DENIED: ' + (email || 'unknown account') +
      ' is not allowed to view this dashboard.' +
      (email ? '' : ' Google did not return an email - run whoAmI() and check appsscript.json scopes.')
    );
  }
  return email;
}

/*
 * Run manually from the editor while signed in as the person
 * having trouble. Shows what Google returns for each method.
 */
function whoAmI() {

  var active = '', effective = '';

  try { active = Session.getActiveUser().getEmail(); } catch (e) { active = 'ERROR: ' + e; }
  try { effective = Session.getEffectiveUser().getEmail(); } catch (e) { effective = 'ERROR: ' + e; }

  var resolved = currentUserEmail_();

  var result = {
    activeUser: active || '(blank)',
    effectiveUser: effective || '(blank)',
    resolvedEmail: resolved || '(blank)',
    allowed: isAllowed_(resolved),
    executesAsUser: EXECUTES_AS_USER
  };

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}

function escapeHtml_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function accessDeniedPage_(email) {

  var who = email
    ? 'You are signed in as <strong>' + escapeHtml_(email) + '</strong>, which does not have access.'
    : 'We could not read your Google account. Sign in to Google and reload this page.';

  var html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>' +
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;padding:16px;box-sizing:border-box}' +
    '.box{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;max-width:420px;' +
    'box-shadow:0 2px 10px rgba(0,0,0,.06);text-align:center}' +
    'h2{margin:0 0 10px;font-size:20px}p{margin:0 0 10px;color:#6b7280;font-size:14px;line-height:1.5}' +
    '</style></head><body><div class="box">' +
    '<h2>Access denied</h2>' +
    '<p>' + who + '</p>' +
    '<p>If you should have access, switch to your approved Google account or ask the dashboard owner to add you.</p>' +
    '</div></body></html>';

  return HtmlService
    .createHtmlOutput(html)
    .setTitle('Access denied')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/* =========================================================
 * WEB APP
 * ========================================================= */

function doGet() {

  var email = currentUserEmail_();

  if (!isAllowed_(email)) {
    return accessDeniedPage_(email);
  }

  var template = HtmlService.createTemplateFromFile('index');
  template.userEmail = email;

  return template
    .evaluate()
    .setTitle('Campaign & Sales Dashboard')
    .setXFrameOptionsMode(
      HtmlService.XFrameOptionsMode.ALLOWALL
    );
}


/* =========================================================
 * SITE HELPERS
 * ========================================================= */

function resolveSite_(siteKey) {
  return SITES[siteKey] || SITES[DEFAULT_SITE];
}

function getSiteList_() {
  return Object.keys(SITES).map(function(key) {
    return { key: key, label: SITES[key].label };
  });
}


/* =========================================================
 * BASIC HELPERS
 * ========================================================= */

function cleanId_(value) {

  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .trim()
    .replace(/^['"]+|['"]+$/g, '');
}


function num_(value) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return 0;
  }

  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value;
  }

  var text = String(value)
    .trim()
    .replace(/[$,£€₹]/g, '')
    .replace(/%/g, '');

  if (!text) {
    return 0;
  }

  var n = parseFloat(text);

  return isNaN(n) ? 0 : n;
}


function normalizeHeader_(value) {

  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.,:]/g, '')
    .replace(/[\s_\-]+/g, '');
}


function findHeaderIndex_(headers, possibleNames) {

  var normalized =
    headers.map(normalizeHeader_);

  for (var i = 0; i < possibleNames.length; i++) {

    var index =
      normalized.indexOf(
        normalizeHeader_(possibleNames[i])
      );

    if (index !== -1) {
      return index;
    }
  }

  return -1;
}


/* =========================================================
 * TIMEZONE
 * ========================================================= */

var TZ_CACHE_ = null;

function tz_() {

  if (!TZ_CACHE_) {

    try {
      TZ_CACHE_ =
        SpreadsheetApp
          .getActiveSpreadsheet()
          .getSpreadsheetTimeZone();
    } catch (e) {
      TZ_CACHE_ = null;
    }

    if (!TZ_CACHE_) {
      TZ_CACHE_ = Session.getScriptTimeZone();
    }
  }

  return TZ_CACHE_;
}


/*
 * Builds a validated date at 12:00 noon so no timezone
 * offset can push it into the previous/next day.
 */
function makeDate_(year, month, day) {

  if (year < 100) {
    year += 2000;
  }

  if (
    month < 1 || month > 12 ||
    day < 1 || day > 31
  ) {
    return null;
  }

  var d = new Date(year, month - 1, day, 12, 0, 0);

  /*
   * Reject rollovers like 31/02/2026.
   */
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }

  return d;
}

var MONTH_NUM_ = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};


function monthNameToNum_(name) {

  if (!name) {
    return 0;
  }

  return MONTH_NUM_[
    String(name).toLowerCase().slice(0, 3)
  ] || 0;
}


function parseDate_(value) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  /*
   * Real date values from the sheet.
   */
  if (
    Object.prototype.toString.call(value) ===
    '[object Date]'
  ) {
    return isNaN(value.getTime()) ? null : value;
  }

  var text =
    String(value).trim();

  if (!text) {
    return null;
  }

  var m;

  /*
   * ISO: yyyy-mm-dd / yyyy/mm/dd (optional time after)
   */
  m = text.match(
    /^(\d{4})[\-\/.](\d{1,2})[\-\/.](\d{1,2})(?!\d)/
  );

  if (m) {
    return makeDate_(
      parseInt(m[1], 10),
      parseInt(m[2], 10),
      parseInt(m[3], 10)
    );
  }

  /*
   * Numeric: dd/mm/yyyy or mm/dd/yyyy (per DATE_ORDER)
   * Separators / - . ; optional time after.
   */
  m = text.match(
    /^(\d{1,2})[\-\/.](\d{1,2})[\-\/.](\d{2,4})(?!\d)/
  );

  if (m) {

    var a = parseInt(m[1], 10);
    var b = parseInt(m[2], 10);
    var y = parseInt(m[3], 10);

    /*
     * If the configured order gives an impossible date
     * (e.g. 1/15/2026 as DMY), fall back to the other order.
     */
    if (DATE_ORDER === 'MDY') {
      return makeDate_(y, a, b) || makeDate_(y, b, a);
    }

    return makeDate_(y, b, a) || makeDate_(y, a, b);
  }

  /*
   * 12 Sep 2026 / 12-Sep-2026 / 12 September, 2026
   */
  m = text.match(
    /^(\d{1,2})(?:st|nd|rd|th)?[\s\-\/]+([a-z]{3,9})\.?[\s\-\/,]+(\d{2,4})/i
  );

  if (m && monthNameToNum_(m[2])) {
    return makeDate_(
      parseInt(m[3], 10),
      monthNameToNum_(m[2]),
      parseInt(m[1], 10)
    );
  }

  /*
   * Sep 12, 2026 / September 12 2026
   */
  m = text.match(
    /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i
  );

  if (m && monthNameToNum_(m[1])) {
    return makeDate_(
      parseInt(m[3], 10),
      monthNameToNum_(m[1]),
      parseInt(m[2], 10)
    );
  }

  /*
   * Last resort only.
   */
  var d = new Date(text);

  if (!isNaN(d.getTime())) {
    return d;
  }

  return null;
}


function monthKeyFromDate_(date) {

  if (!date) {
    return '';
  }

  return Utilities.formatDate(
    date,
    tz_(),
    'yyyy-MM'
  );
}


function monthLabel_(monthKey) {

  if (!monthKey) {
    return '';
  }

  var parts =
    monthKey.split('-');

  if (parts.length !== 2) {
    return monthKey;
  }

  var date =
    new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      15,
      12
    );

  return Utilities.formatDate(
    date,
    tz_(),
    'MMM yyyy'
  );
}


function sortMonths_(months) {

  return months.sort(function(a, b) {
    return a.localeCompare(b);
  });
}


function getSheetOrThrow_(sheetName) {

  var sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(sheetName);

  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }

  return sheet;
}


/* =========================================================
 * ROS
 *
 * ROS = Revenue / Cost * 100
 * ========================================================= */

function calculateRos_(revenue, cost) {

  revenue = num_(revenue);
  cost = num_(cost);

  if (cost === 0) {
    return null;
  }

  return (revenue / cost) * 100;
}


/* =========================================================
 * CAMPAIGN REPORT PARSER
 * ========================================================= */

function getCampaignsBlocks_(sheetName) {

  var sheet =
    getSheetOrThrow_(sheetName);

  var values =
    sheet.getDataRange().getValues();

  var output = [];

  if (!values.length) {
    return output;
  }

  for (var r = 0; r < values.length; r++) {

    var firstCell =
      String(values[r][0] || '').trim();

    if (firstCell.toLowerCase() !== 'campaign report') {
      continue;
    }

    /*
     * Row 1: Campaign report
     * Row 2: Date range
     * Row 3: Headers
     * Row 4+: Data
     */
    var dateRangeRow = r + 1;
    var headerRow = r + 2;

    if (headerRow >= values.length) {
      continue;
    }

    var dateRangeCell =
      values[dateRangeRow]
        ? values[dateRangeRow][0]
        : '';

    var month =
      parseDateRangeToMonth_(dateRangeCell);

    var headers =
      values[headerRow];

    var campaignIndex =
      findHeaderIndex_(headers, [
        'Campaign',
        'Campaign Name',
        'CampaignName'
      ]);

    var statusIndex =
      findHeaderIndex_(headers, [
        'Status',
        'Campaign Status',
        'CampaignStatus',
        'State'
      ]);

    var impressionsIndex =
      findHeaderIndex_(headers, [
        'Impressions',
        'Impr.',
        'Impr',
        'Impression',
        'Total Impressions',
        'Total Impr.'
      ]);

    var costIndex =
      findHeaderIndex_(headers, [
        'Cost',
        'Spend',
        'Amount Spent',
        'Campaign Cost'
      ]);

    var campaignIdIndex =
      findHeaderIndex_(headers, [
        'Campaign ID',
        'CampaignId',
        'Campaign Id',
        'ID'
      ]);

    if (campaignIndex === -1) {
      continue;
    }

    for (
      var rowIndex = headerRow + 1;
      rowIndex < values.length;
      rowIndex++
    ) {

      var row =
        values[rowIndex];

      var first =
        String(row[0] || '').trim();

      if (first.toLowerCase() === 'campaign report') {
        break;
      }

      var hasData =
        row.some(function(cell) {
          return (
            cell !== '' &&
            cell !== null &&
            cell !== undefined
          );
        });

      if (!hasData) {
        break;
      }

      var campaignName =
        String(row[campaignIndex] || '').trim();

      if (!campaignName) {
        continue;
      }

      output.push({

        month:
          month,

        name:
          campaignName,

        id:
          campaignIdIndex !== -1
            ? cleanId_(row[campaignIdIndex])
            : '',

        status:
          (
            statusIndex !== -1
              ? String(row[statusIndex] || '').trim()
              : ''
          ) || 'Unknown',

        impressions:
          impressionsIndex !== -1
            ? num_(row[impressionsIndex])
            : 0,

        cost:
          costIndex !== -1
            ? num_(row[costIndex])
            : 0

      });
    }
  }

  return output;
}


/* =========================================================
 * CAMPAIGN DATE RANGE
 * ========================================================= */

function parseDateRangeToMonth_(value) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '';
  }

  /*
   * Cell may already be a real date.
   */
  if (
    Object.prototype.toString.call(value) ===
    '[object Date]'
  ) {
    return monthKeyFromDate_(parseDate_(value));
  }

  var text =
    String(value).trim();

  /*
   * First date of the range.
   */
  var firstPart =
    text.split(/\s+to\s+|\s+-\s+|\s+–\s+|\s+—\s+/i)[0];

  var date =
    parseDate_(firstPart);

  if (date) {
    return monthKeyFromDate_(date);
  }

  /*
   * yyyy-mm
   */
  var ym =
    text.match(/(20\d{2})[\-\/](0?[1-9]|1[0-2])(?!\d)/);

  if (ym) {
    return (
      ym[1] + '-' +
      String(parseInt(ym[2], 10)).padStart(2, '0')
    );
  }

  /*
   * "September 2026" / "Sep 2026"
   */
  var match =
    text.toLowerCase().match(
      /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})/
    );

  if (match) {
    return (
      match[2] + '-' +
      String(monthNameToNum_(match[1])).padStart(2, '0')
    );
  }

  return '';
}


/* =========================================================
 * SALES PARSER
 * ========================================================= */

function getSaleDate_(rawValue, displayValue) {

  if (
    TRUST_SHEET_DATES &&
    Object.prototype.toString.call(rawValue) === '[object Date]'
  ) {
    return parseDate_(rawValue);
  }

  /*
   * Text cells (or untrusted date cells): parse the text
   * exactly as it appears in the sheet.
   */
  var fromDisplay =
    parseDate_(displayValue);

  if (fromDisplay) {
    return fromDisplay;
  }

  return parseDate_(rawValue);
}


function getSalesRows_(sheetName) {

  var sheet =
    getSheetOrThrow_(sheetName);

  var range =
    sheet.getDataRange();

  var values =
    range.getValues();

  var display =
    range.getDisplayValues();

  var output = [];

  if (values.length < 2) {
    return output;
  }

  var headers =
    values[0];

  var saleDateIndex =
    findHeaderIndex_(headers, [
      'Sale date',
      'Sale Date',
      'Purchase Date',
      'PurchaseDate',
      'Date'
    ]);

  var revenueIndex =
    findHeaderIndex_(headers, [
      'Total Revenue',
      'Revenue',
      'TotalRevenue'
    ]);

  var planIndex =
    findHeaderIndex_(headers, [
      'Plan',
      'Plan Name',
      'PlanName'
    ]);

  var countryIndex =
    findHeaderIndex_(headers, [
      'Country',
      'Country Name',
      'CountryName'
    ]);

  var buyerOriginIndex =
    findHeaderIndex_(headers, [
      'Buyer Origin',
      'BuyerOrigin',
      'Origin'
    ]);

  /*
   * Utm_Campaign holds the Google Ads Campaign ID
   * (matched to "Campaign ID" in the Campaigns tab).
   */
  var campaignIndex =
    findHeaderIndex_(headers, SALES_CAMPAIGN_HEADERS);

  if (saleDateIndex === -1) {
    throw new Error(
      'Sale date column not found in Sales sheet.'
    );
  }

  for (var r = 1; r < values.length; r++) {

    var row =
      values[r];

    var saleDate =
      getSaleDate_(
        row[saleDateIndex],
        display[r][saleDateIndex]
      );

    if (!saleDate) {
      continue;
    }

    var plan =
      planIndex !== -1
        ? String(row[planIndex] || '').trim()
        : '';

    var country =
      countryIndex !== -1
        ? String(row[countryIndex] || '').trim()
        : '';

    var buyerOrigin =
      buyerOriginIndex !== -1
        ? String(row[buyerOriginIndex] || '').trim()
        : '';

    output.push({

      month:
        monthKeyFromDate_(saleDate),

      /*
       * Raw Utm_Campaign value; resolved to a campaign
       * in getDashboardData().
       */
      campaignRaw:
        campaignIndex !== -1
          ? campaignCellText_(row[campaignIndex], display[r][campaignIndex])
          : '',

      campaignId: '',

      campaignName: '',

      plan:
        plan || 'Unknown',

      country:
        country || 'Unknown',

      region:
        buyerOrigin || 'Unknown',

      salesCount:
        1,

      /*
       * Revenue as entered. Converted to USD in
       * convertSalesRevenue_() before any totals, when the
       * site's convertCurrency flag is true.
       */
      revenueOriginal:
        revenueIndex !== -1
          ? num_(row[revenueIndex])
          : 0,

      revenue:
        revenueIndex !== -1
          ? num_(row[revenueIndex])
          : 0,

      saleDay:
        Utilities.formatDate(saleDate, tz_(), 'yyyy-MM-dd')

    });
  }

  return output;
}


/* =========================================================
 * CAMPAIGN MATCHING (Sales Utm_Campaign → Campaigns tab)
 * ========================================================= */

/*
 * Text of a campaign cell. Numbers are written out in full
 * so long IDs never become 2.17E+10.
 */
function campaignCellText_(raw, shown) {

  if (typeof raw === 'number' && isFinite(raw)) {
    return String(Math.round(raw));
  }

  var text = String(raw === null || raw === undefined ? '' : raw).trim();

  if (!text) {
    text = String(shown || '').trim();
  }

  return text.replace(/^['"]+|['"]+$/g, '');
}


/*
 * Lookup tables built from every Campaign report block.
 */
function buildCampaignLookup_(campaignRows) {

  var byId = {};
  var byName = {};

  campaignRows.forEach(function(row) {

    var id = cleanId_(row.id);
    var name = String(row.name || '').trim();

    if (id) {
      byId[id] = { id: id, name: name || byId[id] && byId[id].name || id };
    }

    if (name) {
      byName[name.toLowerCase()] = { id: id, name: name };
    }
  });

  return { byId: byId, byName: byName };
}


/*
 * Utm_Campaign value → { id, name, how }
 * how: 'id' | 'id-in-text' | 'name' | 'unmatched' | 'blank'
 */
function resolveCampaign_(raw, lookup) {

  var text = String(raw || '').trim();

  if (!text || /^\(?not set\)?$/i.test(text) || text === '{campaignid}') {
    return { id: '', name: '', how: 'blank' };
  }

  var cleaned = cleanId_(text).replace(/\.0+$/, '');

  /*
   * 1. Exact Campaign ID
   */
  if (lookup.byId[cleaned]) {
    return { id: cleaned, name: lookup.byId[cleaned].name, how: 'id' };
  }

  /*
   * 2. Campaign ID inside the text (e.g. "cid_21734567890")
   */
  var digits = text.match(/\d{8,}/g) || [];

  for (var i = 0; i < digits.length; i++) {
    if (lookup.byId[digits[i]]) {
      return { id: digits[i], name: lookup.byId[digits[i]].name, how: 'id-in-text' };
    }
  }

  /*
   * 3. Campaign name
   */
  var byName = lookup.byName[text.toLowerCase()];

  if (byName) {
    return { id: byName.id, name: byName.name, how: 'name' };
  }

  /*
   * 4. Not in any campaign report: keep the value itself
   */
  return {
    id: /^\d+$/.test(cleaned) ? cleaned : '',
    name: /^\d+$/.test(cleaned) ? cleaned + ' (not in Campaigns tab)' : text,
    how: 'unmatched'
  };
}


/* =========================================================
 * FX CONVERSION (GBP → USD)
 * ========================================================= */

const REVENUE_CURRENCY = 'GBP';
const REPORT_CURRENCY = 'USD';

const FX_MODE = 'DAILY';

/*
 * Fallback / fixed rate: 1 GBP = x USD. Set this to your own rate.
 */
const FIXED_GBP_TO_USD = 1.30;

/*
 * Optional monthly rates, e.g. '2026-01': 1.27
 */
const MONTHLY_GBP_TO_USD = {
  // '2026-01': 1.27,
  // '2026-02': 1.28
};

/*
 * Sales-tab column that holds the campaign (Google Ads Campaign ID).
 * First header found wins.
 */
const SALES_CAMPAIGN_HEADERS = [
  'Utm_Campaign',
  'UTM Campaign',
  'utm_campaign',
  'Utm Campaign ID',
  'Utm_Campaign_ID',
  'Campaign ID',
  'CampaignId'
];

/*
 * Daily rates { 'yyyy-MM-dd': rate } for a date range.
 * Cached for 6 hours. Returns {} if the rate service is unreachable.
 */
function getDailyFxRates_(fromDay, toDay) {

  var cacheKey = 'fx_' + REVENUE_CURRENCY + REPORT_CURRENCY + '_' + fromDay + '_' + toDay;
  var cache = CacheService.getScriptCache();
  var cached = cache.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  var urls = [
    'https://api.frankfurter.app/' + fromDay + '..' + toDay +
      '?from=' + REVENUE_CURRENCY + '&to=' + REPORT_CURRENCY,
    'https://api.frankfurter.dev/v1/' + fromDay + '..' + toDay +
      '?base=' + REVENUE_CURRENCY + '&symbols=' + REPORT_CURRENCY
  ];

  for (var i = 0; i < urls.length; i++) {

    try {

      var res = UrlFetchApp.fetch(urls[i], { muteHttpExceptions: true });

      if (res.getResponseCode() !== 200) {
        continue;
      }

      var json = JSON.parse(res.getContentText());
      var rates = {};

      Object.keys(json.rates || {}).forEach(function(day) {
        var r = json.rates[day][REPORT_CURRENCY];
        if (r) rates[day] = r;
      });

      if (Object.keys(rates).length) {
        cache.put(cacheKey, JSON.stringify(rates), 21600);
        return rates;
      }

    } catch (e) {
      Logger.log('FX fetch failed: ' + e);
    }
  }

  return {};
}


/*
 * Rate for one sale. Weekends/holidays use the latest earlier
 * business day (up to 7 days back).
 */
function fxRateFor_(day, monthKey, daily) {

  if (FX_MODE === 'DAILY' && day && daily) {

    var d = new Date(day + 'T12:00:00Z');

    for (var i = 0; i < 8; i++) {

      var key = Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');

      if (daily[key]) {
        return { rate: daily[key], source: 'daily' };
      }

      d.setUTCDate(d.getUTCDate() - 1);
    }
  }

  if (FX_MODE !== 'FIXED' && MONTHLY_GBP_TO_USD[monthKey]) {
    return { rate: MONTHLY_GBP_TO_USD[monthKey], source: 'monthly' };
  }

  return { rate: FIXED_GBP_TO_USD, source: 'fixed' };
}


/*
 * Converts row.revenue from REVENUE_CURRENCY to REPORT_CURRENCY
 * in place, when doConvert is true for the current site. Returns
 * a summary for the dashboard note.
 */
function convertSalesRevenue_(salesRows, doConvert) {

  var info = {
    from: REVENUE_CURRENCY,
    to: REPORT_CURRENCY,
    mode: FX_MODE,
    fixedRate: FIXED_GBP_TO_USD,
    daily: 0,
    monthly: 0,
    fixed: 0
  };

  if (!doConvert || REVENUE_CURRENCY === REPORT_CURRENCY) {
    info.mode = 'NONE';
    return info;
  }

  var daily = null;

  if (FX_MODE === 'DAILY' && salesRows.length) {

    var days = salesRows
      .map(function(r) { return r.saleDay; })
      .filter(Boolean)
      .sort();

    if (days.length) {

      /*
       * Start 7 days early so the first sales can use an
       * earlier business-day rate; end no later than today.
       */
      var start = new Date(days[0] + 'T12:00:00Z');
      start.setUTCDate(start.getUTCDate() - 7);

      var today = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
      var end = days[days.length - 1] > today ? today : days[days.length - 1];

      daily = getDailyFxRates_(
        Utilities.formatDate(start, 'UTC', 'yyyy-MM-dd'),
        end
      );
    }
  }

  salesRows.forEach(function(row) {

    var fx = fxRateFor_(row.saleDay, row.month, daily);

    row.fxRate = fx.rate;
    row.revenue = num_(row.revenueOriginal) * fx.rate;

    info[fx.source]++;
  });

  return info;
}


/*
 * One key format for campaigns everywhere:
 * digits-only Campaign ID, else lower-case name.
 */
function campaignKey_(id, name) {

  var digits = String(id || '').replace(/\D/g, '');

  if (digits) {
    return 'id:' + digits;
  }

  var n = String(name || '').trim().toLowerCase();

  return n ? 'name:' + n : '';
}


/*
 * Key of the campaign row in this month that a sale belongs to.
 * 1. Same Campaign ID   2. Same campaign name   3. New key
 */
function findMonthCampaignKey_(month, id, name) {

  var key = campaignKey_(id, name);

  if (!key) {
    return '';
  }

  if (month.campaigns[key]) {
    return key;
  }

  var lowerName = String(name || '').trim().toLowerCase();
  var digits = String(id || '').replace(/\D/g, '');

  var keys = Object.keys(month.campaigns);

  for (var i = 0; i < keys.length; i++) {

    var c = month.campaigns[keys[i]];

    if (digits && String(c.id || '').replace(/\D/g, '') === digits) {
      return keys[i];
    }

    if (lowerName && String(c.name || '').trim().toLowerCase() === lowerName) {
      return keys[i];
    }
  }

  return key;
}


/* =========================================================
 * GEO-WISE REPORT (Google Ads "Matched locations report")
 *
 * Same layout as the Campaigns tab, one block per month:
 *   Row 1: Matched locations report
 *   Row 2: September 1, 2026 - September 28, 2026
 *   Row 3: Matched location | Clicks | Impr. | CTR | Cost
 *   Row 4+: one row per country
 *
 * Joined with Sales → Buyer Origin (sales + revenue) by country
 * name, so each country gets CTR, Cost, Sales, Revenue and ROAS.
 * ========================================================= */

var GEO_TITLE_RE = /^(matched\s+locations?|user\s+locations?|locations?|geographic|geo)\s*(report)?$/i;

/*
 * Country names that differ between Google Ads and the Sales tab.
 * Left = any spelling, right = one shared key.
 */
var GEO_ALIASES = {
  'turkey': 'turkiye',
  'uk': 'united kingdom',
  'great britain': 'united kingdom',
  'gb': 'united kingdom',
  'usa': 'united states',
  'us': 'united states',
  'united states of america': 'united states',
  'uae': 'united arab emirates',
  'czech republic': 'czechia',
  'ivory coast': 'cote d ivoire',
  'korea republic of': 'south korea',
  'republic of korea': 'south korea',
  'korea': 'south korea',
  'russian federation': 'russia',
  'viet nam': 'vietnam',
  'macau': 'macao',
  'hong kong sar': 'hong kong',
  'hong kong sar china': 'hong kong',
  'the netherlands': 'netherlands',
  'holland': 'netherlands',
  'democratic republic of the congo': 'dr congo',
  'congo drc': 'dr congo',
  'congo kinshasa': 'dr congo',
  'republic of the congo': 'congo',
  'congo republic': 'congo',
  'congo brazzaville': 'congo',
  'bosnia herzegovina': 'bosnia and herzegovina',
  'north macedonia': 'macedonia',
  'eswatini': 'swaziland',
  'myanmar burma': 'myanmar',
  'st lucia': 'saint lucia',
  'st kitts and nevis': 'saint kitts and nevis',
  'st vincent and the grenadines': 'saint vincent and the grenadines',
  'us virgin islands': 'u s virgin islands',
  'u s virgin islands': 'u s virgin islands'
};

function geoKey_(name) {

  var s = String(name == null ? '' : name);

  try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}

  s = s.toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return GEO_ALIASES[s] || s;
}


/*
 * Returns null when the tab does not exist (so the dashboard can
 * say so), otherwise one row per country per month.
 */
function getGeoBlocks_(sheetName) {

  var sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(sheetName);

  if (!sheet) {
    return null;
  }

  var values = sheet.getDataRange().getValues();
  var output = [];

  for (var r = 0; r < values.length; r++) {

    var title = String(values[r][0] || '').trim();

    if (!GEO_TITLE_RE.test(title)) {
      continue;
    }

    var headerRow = r + 2;

    if (headerRow >= values.length) {
      continue;
    }

    var month = parseDateRangeToMonth_(values[r + 1] ? values[r + 1][0] : '');
    var headers = values[headerRow];

    var locIndex = findHeaderIndex_(headers, [
      'Matched location', 'Matched locations', 'Location', 'Locations',
      'Country/Territory', 'Country / Territory', 'Country', 'Countries',
      'Country/Territory (User location)', 'Country/Territory (Matched location)'
    ]);

    var clicksIndex = findHeaderIndex_(headers, ['Clicks', 'Click']);
    var imprIndex = findHeaderIndex_(headers, ['Impr.', 'Impr', 'Impressions', 'Impression']);
    var costIndex = findHeaderIndex_(headers, ['Cost', 'Spend', 'Amount Spent']);

    if (locIndex === -1) {
      continue;
    }

    for (var i = headerRow + 1; i < values.length; i++) {

      var row = values[i];
      var first = String(row[0] || '').trim();

      if (GEO_TITLE_RE.test(first)) break;

      var hasData = row.some(function(cell) {
        return cell !== '' && cell !== null && cell !== undefined;
      });

      if (!hasData) break;

      var country = String(row[locIndex] || '').trim();

      if (!country || /^total/i.test(country)) continue;

      output.push({
        month: month,
        country: country,
        clicks: clicksIndex !== -1 ? num_(row[clicksIndex]) : 0,
        impr: imprIndex !== -1 ? num_(row[imprIndex]) : 0,
        cost: costIndex !== -1 ? num_(row[costIndex]) : 0
      });
    }
  }

  return output;
}


/*
 * Month object → geo array joined with Buyer Origin sales/revenue.
 */
function buildMonthGeo_(month) {

  var map = {};
  var raw = month.geoRaw || {};

  Object.keys(raw).forEach(function(k) {
    map[k] = {
      country: raw[k].country,
      clicks: raw[k].clicks,
      impr: raw[k].impr,
      cost: raw[k].cost,
      sales: 0,
      revenue: 0
    };
  });

  Object.keys(month.region || {}).forEach(function(origin) {

    if (!origin || origin === 'Unknown') return;

    var k = geoKey_(origin);

    if (!map[k]) {
      map[k] = { country: origin, clicks: 0, impr: 0, cost: 0, sales: 0, revenue: 0 };
    }

    map[k].sales += num_(month.region[origin].sales);
    map[k].revenue += num_(month.region[origin].revenue);
  });

  var totals = { clicks: 0, impr: 0, cost: 0, sales: 0, revenue: 0 };

  var list = Object.keys(map).map(function(k) {

    var g = map[k];

    g.ctr = g.impr > 0 ? g.clicks / g.impr * 100 : null;
    g.roas = calculateRos_(g.revenue, g.cost);
    g.cpc = g.clicks > 0 ? g.cost / g.clicks : null;
    g.cr = g.clicks > 0 ? g.sales / g.clicks * 100 : null;
    g.key = k;

    totals.clicks += g.clicks;
    totals.impr += g.impr;
    totals.cost += g.cost;
    totals.sales += g.sales;
    totals.revenue += g.revenue;

    return g;
  });

  totals.ctr = totals.impr > 0 ? totals.clicks / totals.impr * 100 : null;
  totals.roas = calculateRos_(totals.revenue, totals.cost);
  totals.cpc = totals.clicks > 0 ? totals.cost / totals.clicks : null;
  totals.cr = totals.clicks > 0 ? totals.sales / totals.clicks * 100 : null;

  month.geo = list;
  month.geoTotals = totals;
  delete month.geoRaw;
}


/* =========================================================
 * DASHBOARD DATA
 * ========================================================= */

/*
 * Called from the dashboard page. Checks the signed-in account
 * against ALLOWED_EMAILS before returning any data.
 */
function getDashboardData(siteKey) {
  requireAccess_();
  return buildDashboardData_(siteKey);
}


function buildDashboardData_(siteKey) {

  var site = resolveSite_(siteKey);

  var campaignRows =
    getCampaignsBlocks_(site.campaignsSheet);

  var salesRows =
    getSalesRows_(site.salesSheet);

  /*
   * GBP → USD before any totals, ROS or charts (site-dependent).
   */
  var fxInfo =
    convertSalesRevenue_(salesRows, site.convertCurrency);

  var campaignLookup =
    buildCampaignLookup_(campaignRows);

  salesRows.forEach(function(row) {
    var res = resolveCampaign_(row.campaignRaw, campaignLookup);
    row.campaignId = res.id;
    row.campaignName = res.name;
  });

  var months = {};

  function ensureMonth_(month) {

    if (!month) {
      return null;
    }

    if (!months[month]) {

      months[month] = {

        totals: {
          impressions: 0,
          cost: 0,
          sales: 0,
          revenue: 0,
          ros: null,
          unattributedSales: 0,
          unattributedRevenue: 0
        },

        campaigns: {},

        region: {},

        plans: {},

        campaignOrigins: {},

        /*
         * true when this month has a Campaign report block
         * in the Campaigns tab.
         */
        hasCampaignReport: false

      };
    }

    return months[month];
  }

  function newCampaign_(name, id, status) {

    return {
      name: name,
      id: id,
      status: status,
      impressions: 0,
      cost: 0,
      sales: 0,
      revenue: 0,
      orders: 0
    };
  }


  /* =======================================================
   * CAMPAIGN DATA
   * ======================================================= */

  campaignRows.forEach(function(row) {

    if (!row.month) {
      return;
    }

    var month =
      ensureMonth_(row.month);

    month.totals.impressions +=
      num_(row.impressions);

    month.totals.cost +=
      num_(row.cost);

    month.hasCampaignReport = true;

    var key =
      campaignKey_(row.id, row.name);

    if (!month.campaigns[key]) {
      month.campaigns[key] =
        newCampaign_(
          row.name || 'Unknown',
          row.id || '',
          row.status || 'Unknown'
        );
    }

    var campaign =
      month.campaigns[key];

    campaign.impressions +=
      num_(row.impressions);

    campaign.cost +=
      num_(row.cost);

    if (row.status) {
      campaign.status = row.status;
    }
  });


  /* =======================================================
   * SALES DATA
   * ======================================================= */

  salesRows.forEach(function(row) {

    if (!row.month) {
      return;
    }

    var month =
      ensureMonth_(row.month);

    month.totals.sales +=
      num_(row.salesCount);

    month.totals.revenue +=
      num_(row.revenue);

    /*
     * Buyer Origin
     */
    var region =
      row.region || 'Unknown';

    if (!month.region[region]) {
      month.region[region] = {
        sales: 0,
        revenue: 0
      };
    }

    month.region[region].sales +=
      num_(row.salesCount);

    month.region[region].revenue +=
      num_(row.revenue);

    /*
     * Plan
     */
    var plan =
      row.plan || 'Unknown';

    if (!month.plans[plan]) {
      month.plans[plan] = {
        sales: 0,
        revenue: 0
      };
    }

    month.plans[plan].sales +=
      num_(row.salesCount);

    month.plans[plan].revenue +=
      num_(row.revenue);

    /*
     * Find the matching campaign-report row in THIS month
     * (by ID, then by name) so sales and cost land on one row.
     */
    var campaignKey =
      findMonthCampaignKey_(month, row.campaignId, row.campaignName);

    /*
     * Campaign × Buyer Origin
     */
    var coKey =
      campaignKey || '(No campaign)';

    /*
     * Sales with a blank Utm_Campaign can't be linked to a campaign.
     */
    if (!campaignKey) {
      month.totals.unattributedSales += num_(row.salesCount);
      month.totals.unattributedRevenue += num_(row.revenue);
    }

    if (!month.campaignOrigins[coKey]) {
      month.campaignOrigins[coKey] = {
        key: coKey,
        id: row.campaignId || '',
        name: row.campaignName || (coKey === '(No campaign)' ? '(No campaign)' : ''),
        sales: 0,
        revenue: 0,
        origins: {}
      };
    }

    var co = month.campaignOrigins[coKey];

    co.sales += num_(row.salesCount);
    co.revenue += num_(row.revenue);

    if (!co.origins[region]) {
      co.origins[region] = { sales: 0, revenue: 0 };
    }

    co.origins[region].sales += num_(row.salesCount);
    co.origins[region].revenue += num_(row.revenue);

    /*
     * Campaign
     */
    if (campaignKey) {

      if (!month.campaigns[campaignKey]) {
        /*
         * Sale from a campaign that has no row in this month's
         * campaign report (e.g. ended / paused / report missing).
         */
        month.campaigns[campaignKey] =
          newCampaign_(
            row.campaignName || campaignKey,
            row.campaignId || '',
            'Not in report'
          );
      }

      month.campaigns[campaignKey].sales +=
        num_(row.salesCount);

      month.campaigns[campaignKey].revenue +=
        num_(row.revenue);

      month.campaigns[campaignKey].orders +=
        num_(row.salesCount);
    }
  });


  /* =======================================================
   * GEO-WISE DATA (Matched locations report)
   * ======================================================= */

  var geoRows =
    site.geoSheet ? getGeoBlocks_(site.geoSheet) : null;

  (geoRows || []).forEach(function(row) {

    if (!row.month) {
      return;
    }

    var month = ensureMonth_(row.month);

    month.hasGeoReport = true;
    month.geoRaw = month.geoRaw || {};

    var k = geoKey_(row.country);

    if (!month.geoRaw[k]) {
      month.geoRaw[k] = { country: row.country, clicks: 0, impr: 0, cost: 0 };
    }

    month.geoRaw[k].clicks += row.clicks;
    month.geoRaw[k].impr += row.impr;
    month.geoRaw[k].cost += row.cost;
  });


  /* =======================================================
   * FINAL CALCULATIONS
   * ======================================================= */

  Object.keys(months).forEach(function(monthKey) {

    var month =
      months[monthKey];

    buildMonthGeo_(month);

    month.totals.ros =
      calculateRos_(
        month.totals.revenue,
        month.totals.cost
      );

    /*
     * Campaign × Buyer Origin → array, with the campaign name
     * and ID taken from the campaign report where available.
     */
    month.campaignOrigins =
      Object.keys(month.campaignOrigins).map(function(key) {

        var co = month.campaignOrigins[key];
        var camp = month.campaigns[key];

        if (camp) {
          co.name = camp.name || co.name;
          co.id = camp.id || co.id;
        }

        if (!co.name) {
          co.name = co.id || key;
        }

        co.origins =
          Object.keys(co.origins).map(function(origin) {
            return {
              origin: origin,
              sales: co.origins[origin].sales,
              revenue: co.origins[origin].revenue
            };
          });

        return co;
      });

    month.campaigns =
      Object.keys(month.campaigns).map(function(key) {

        var campaign =
          month.campaigns[key];

        campaign.ros =
          calculateRos_(
            campaign.revenue,
            campaign.cost
          );

        return campaign;
      });
  });


  /* =======================================================
   * MONTH LIST
   * ======================================================= */

  var monthList =
    sortMonths_(Object.keys(months));

  var monthLabels = {};

  monthList.forEach(function(month) {
    monthLabels[month] = monthLabel_(month);
  });

  return {
    site: (SITES[siteKey] ? siteKey : DEFAULT_SITE),
    sites: getSiteList_(),
    months: months,
    monthList: monthList,
    monthLabels: monthLabels,
    fx: fxInfo,
    geoSheet: site.geoSheet || '',
    geoSheetFound: geoRows !== null
  };
}


/* =========================================================
 * DEBUG FUNCTIONS
 * (run manually from the Apps Script editor; pass a siteKey
 *  such as 'uk' or 'airhub', defaults to DEFAULT_SITE)
 * ========================================================= */

function checkSheetNames() {

  return SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheets()
    .map(function(sheet) {
      return sheet.getName();
    });
}


function checkCampaignHeaders(siteKey) {

  var site = resolveSite_(siteKey);

  var values =
    getSheetOrThrow_(site.campaignsSheet)
      .getDataRange()
      .getValues();

  var results = [];

  for (var r = 0; r < values.length; r++) {

    var first =
      String(values[r][0] || '').trim();

    if (first.toLowerCase() === 'campaign report') {

      var headerRow = r + 2;

      if (headerRow < values.length) {
        results.push({
          row: headerRow + 1,
          dateRange: values[r + 1] ? values[r + 1][0] : '',
          parsedMonth: parseDateRangeToMonth_(
            values[r + 1] ? values[r + 1][0] : ''
          ),
          headers: values[headerRow]
        });
      }
    }
  }

  Logger.log(JSON.stringify(results, null, 2));

  return results;
}


/*
 * Run manually. Logs sales count per month and up to 3
 * sample raw/display values per month, plus unparsed rows.
 * Use it to confirm dates land in the right months.
 */
function debugSalesMonths(siteKey) {

  var site = resolveSite_(siteKey);

  var sheet =
    getSheetOrThrow_(site.salesSheet);

  var range =
    sheet.getDataRange();

  var values =
    range.getValues();

  var display =
    range.getDisplayValues();

  var idx =
    findHeaderIndex_(values[0], [
      'Sale date',
      'Sale Date',
      'Purchase Date',
      'PurchaseDate',
      'Date'
    ]);

  if (idx === -1) {
    Logger.log('Sale date column not found.');
    return;
  }

  var summary = {};
  var unparsed = [];

  for (var r = 1; r < values.length; r++) {

    var raw = values[r][idx];
    var shown = display[r][idx];

    if (raw === '' || raw === null) {
      continue;
    }

    var d = getSaleDate_(raw, shown);

    if (!d) {
      if (unparsed.length < 20) {
        unparsed.push({ row: r + 1, display: shown });
      }
      continue;
    }

    var key = monthKeyFromDate_(d);

    if (!summary[key]) {
      summary[key] = { count: 0, samples: [] };
    }

    summary[key].count++;

    if (summary[key].samples.length < 3) {
      summary[key].samples.push({
        row: r + 1,
        type: Object.prototype.toString.call(raw) === '[object Date]'
          ? 'date-cell'
          : 'text-cell',
        display: shown
      });
    }
  }

  var result = {
    site: site.label,
    timezone: tz_(),
    dateOrder: DATE_ORDER,
    trustSheetDates: TRUST_SHEET_DATES,
    months: summary,
    unparsed: unparsed
  };

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}



/*
 * Run manually. Shows how Sales → Utm_Campaign values were
 * matched to campaigns in the Campaigns tab.
 */
function debugCampaignMatching(siteKey) {

  var site = resolveSite_(siteKey);

  var salesSheet = getSheetOrThrow_(site.salesSheet);
  var headers = salesSheet.getRange(1, 1, 1, salesSheet.getLastColumn()).getValues()[0];
  var idx = findHeaderIndex_(headers, SALES_CAMPAIGN_HEADERS);

  var campaignRows = getCampaignsBlocks_(site.campaignsSheet);
  var lookup = buildCampaignLookup_(campaignRows);
  var salesRows = getSalesRows_(site.salesSheet);

  var counts = { id: 0, 'id-in-text': 0, name: 0, unmatched: 0, blank: 0 };
  var unmatched = {};
  var perMonth = {};

  salesRows.forEach(function(row) {

    var res = resolveCampaign_(row.campaignRaw, lookup);

    counts[res.how]++;

    perMonth[row.month] = perMonth[row.month] || { matched: 0, unmatched: 0, blank: 0 };

    if (res.how === 'blank') perMonth[row.month].blank++;
    else if (res.how === 'unmatched') perMonth[row.month].unmatched++;
    else perMonth[row.month].matched++;

    if (res.how === 'unmatched') {
      unmatched[row.campaignRaw] = (unmatched[row.campaignRaw] || 0) + 1;
    }
  });

  var topUnmatched = Object.keys(unmatched)
    .sort(function(a, b) { return unmatched[b] - unmatched[a]; })
    .slice(0, 20)
    .map(function(k) { return k + ' = ' + unmatched[k]; });

  var result = {
    site: site.label,
    salesCampaignColumn: idx === -1 ? 'NOT FOUND' : headers[idx],
    campaignIdsInCampaignsTab: Object.keys(lookup.byId).length,
    sampleCampaignIds: Object.keys(lookup.byId).slice(0, 5),
    salesRows: salesRows.length,
    matchedById: counts.id,
    matchedByIdInText: counts['id-in-text'],
    matchedByName: counts.name,
    unmatched: counts.unmatched,
    blank: counts.blank,
    perMonth: perMonth,
    topUnmatchedValues: topUnmatched
  };

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}


/*
 * Run manually. For each month, lists campaigns that have sales
 * but no row in that month's campaign report (cost/impressions 0).
 */
function debugCampaignsNotInReport(siteKey) {

  // Manual/internal debug call from the editor: skips the email check.
  var data = buildDashboardData_(siteKey);
  var result = {};

  data.monthList.forEach(function(m) {

    var missing = data.months[m].campaigns
      .filter(function(c) { return c.status === 'Not in report'; })
      .map(function(c) { return (c.id || '-') + ' | ' + c.name + ' | sales ' + c.sales; });

    var inReport = data.months[m].campaigns
      .filter(function(c) { return c.status !== 'Not in report'; }).length;

    result[m] = {
      campaignsInReport: inReport,
      salesCampaignsNotInReport: missing
    };
  });

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}



/*
 * Run manually. Shows the GBP→USD rates used, per month
 * (only meaningful for a site with convertCurrency: true).
 */
function debugFx(siteKey) {

  var site = resolveSite_(siteKey);

  var rows = getSalesRows_(site.salesSheet);
  var info = convertSalesRevenue_(rows, site.convertCurrency);
  var perMonth = {};

  rows.forEach(function(r) {

    var m = perMonth[r.month] || (perMonth[r.month] = {
      sales: 0, revenueOriginal: 0, revenueConverted: 0, minRate: null, maxRate: null
    });

    m.sales++;
    m.revenueOriginal += r.revenueOriginal;
    m.revenueConverted += r.revenue;
    m.minRate = m.minRate === null ? r.fxRate : Math.min(m.minRate, r.fxRate || m.minRate);
    m.maxRate = m.maxRate === null ? r.fxRate : Math.max(m.maxRate, r.fxRate || m.maxRate);
  });

  Object.keys(perMonth).forEach(function(k) {
    perMonth[k].revenueOriginal = Math.round(perMonth[k].revenueOriginal * 100) / 100;
    perMonth[k].revenueConverted = Math.round(perMonth[k].revenueConverted * 100) / 100;
  });

  var result = { site: site.label, summary: info, perMonth: perMonth };

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}


/*
 * Run manually. Shows each geo month and which Google Ads countries
 * did / did not match a Buyer Origin name in the Sales tab.
 */
function debugGeo(siteKey) {

  var site = resolveSite_(siteKey);
  var rows = getGeoBlocks_(site.geoSheet);

  if (rows === null) {
    Logger.log('Tab not found: ' + site.geoSheet);
    return;
  }

  var sales = getSalesRows_(site.salesSheet);
  var origins = {};
  sales.forEach(function(r) { origins[geoKey_(r.region)] = r.region; });

  var perMonth = {};

  rows.forEach(function(r) {
    var m = perMonth[r.month || '(no month — check date row)'] ||
      (perMonth[r.month || '(no month — check date row)'] = { countries: 0, cost: 0, notInSales: [] });
    m.countries++;
    m.cost += r.cost;
    if (!origins[geoKey_(r.country)] && r.cost > 0 && m.notInSales.length < 25) {
      m.notInSales.push(r.country);
    }
  });

  Logger.log(JSON.stringify({ site: site.label, sheet: site.geoSheet, months: perMonth }, null, 2));

  return perMonth;
}