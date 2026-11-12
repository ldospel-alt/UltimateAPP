const RESULTS_SHEET = "results";
const RESULT_HEADERS = ["id", "season", "type", "date", "a", "b", "result", "costume", "note", "author", "createdAt"];

function doGet(event) {
  const season = String(event.parameter.season || "");
  const type = String(event.parameter.type || "");
  const records = readRecords().filter((record) =>
    (!season || record.season === season) && (!type || record.type === type)
  );
  return json({ ok: true, records: records });
}

function doPost(event) {
  try {
    const request = JSON.parse(event.postData.contents || "{}");
    if (String(request.code || "") !== coachCode()) {
      return json({ ok: false, error: "Neplatný trenérský kód." });
    }

    if (request.action === "validate") return json({ ok: true });

    const record = normalizeRecord(request.record);
    if (!record) return json({ ok: false, error: "Neplatný záznam." });

    const sheet = resultsSheet();
    const rows = sheet.getDataRange().getValues();
    const rowIndex = rows.findIndex((row, index) => index > 0 && String(row[0]) === record.id);

    if (request.action === "create") {
      record.createdAt = new Date().toISOString();
      sheet.appendRow(recordToRow(record));
    } else if (request.action === "update" && rowIndex > 0) {
      const current = rowToRecord(rows[rowIndex]);
      record.author = current.author;
      record.createdAt = current.createdAt;
      sheet.getRange(rowIndex + 1, 1, 1, RESULT_HEADERS.length).setValues([recordToRow(record)]);
    } else if (request.action === "delete" && rowIndex > 0) {
      sheet.deleteRow(rowIndex + 1);
    } else {
      return json({ ok: false, error: "Záznam nebyl nalezen." });
    }

    return json({
      ok: true,
      records: readRecords().filter((item) => item.season === record.season && item.type === record.type),
    });
  } catch (error) {
    return json({ ok: false, error: error.message || "Serverová chyba." });
  }
}

function coachCode() {
  return PropertiesService.getScriptProperties().getProperty("COACH_CODE") || "SaberAdmin";
}

function resultsSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(RESULTS_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(RESULTS_SHEET);
    sheet.appendRow(RESULT_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readRecords() {
  const values = resultsSheet().getDataRange().getValues();
  return values.slice(1).filter((row) => row[0]).map(rowToRecord);
}

function rowToRecord(row) {
  return RESULT_HEADERS.reduce((record, key, index) => {
    record[key] = key === "costume" ? String(row[index]).toLowerCase() === "true" : String(row[index] || "");
    return record;
  }, {});
}

function recordToRow(record) {
  return RESULT_HEADERS.map((key) => record[key]);
}

function normalizeRecord(value) {
  if (!value || !/^\d{4}$/.test(String(value.season)) || !["championship", "league"].includes(value.type)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value.date)) || !String(value.a || "").trim() || !String(value.b || "").trim() || !String(value.result || "").trim()) return null;
  return {
    id: String(value.id || Utilities.getUuid()),
    season: String(value.season),
    type: String(value.type),
    date: String(value.date),
    a: String(value.a).trim(),
    b: String(value.b).trim(),
    result: String(value.result).trim(),
    costume: Boolean(value.costume),
    note: String(value.note || "").trim(),
    author: String(value.author || "neznámý").trim() || "neznámý",
    createdAt: String(value.createdAt || ""),
  };
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
