/**
 * Converts the sprint-graph base64 image stored in each form response into
 * a real file in Google Drive, then adds a one-click "🖼️ ดูรูป" link to
 * that file in a dedicated column. Finds the graph column by its content
 * (a data:image/png;base64,... prefix) rather than by header text, so it
 * keeps working even if the question is renamed or reordered.
 *
 * Important: the link goes into a SEPARATE column, not over the original
 * cell — the team dashboard (dashboard.html) reads that raw base64 value
 * directly, so it must stay intact.
 */

const GRAPH_DATA_URL_PREFIX = 'data:image/png;base64,';
const DRIVE_FOLDER_NAME = 'Sprint Graph Images';
const LINK_COLUMN_HEADER = 'ดูรูป (ลิงก์)';

/** Runs automatically on every new form submission (needs the trigger set up below). */
function onFormSubmit(e) {
  const namedValues = e.namedValues;
  let graphQuestionTitle = null;

  for (const title in namedValues) {
    const value = namedValues[title][0] || '';
    if (value.indexOf(GRAPH_DATA_URL_PREFIX) === 0) {
      graphQuestionTitle = title;
      break;
    }
  }
  if (!graphQuestionTitle) return; // this response had no drawing

  const sheet = e.range.getSheet();
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colIndex = headerRow.indexOf(graphQuestionTitle) + 1;
  if (colIndex === 0) return;

  addImageLink_(sheet, e.range.getRow(), colIndex);
}

/** One-time manual cleanup for rows submitted before this script existed. Run this by hand once. */
function backfillExistingRows() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = sheet.getDataRange().getValues();

  let colIndex = -1;
  outer:
  for (let c = 0; c < data[0].length; c += 1) {
    for (let r = 1; r < data.length; r += 1) {
      const value = data[r][c];
      if (typeof value === 'string' && value.indexOf(GRAPH_DATA_URL_PREFIX) === 0) {
        colIndex = c + 1; // convert to 1-based
        break outer;
      }
    }
  }

  if (colIndex === -1) {
    Logger.log('No graph column found — nothing to backfill.');
    return;
  }

  for (let r = 1; r < data.length; r += 1) {
    const value = data[r][colIndex - 1];
    if (typeof value === 'string' && value.indexOf(GRAPH_DATA_URL_PREFIX) === 0) {
      addImageLink_(sheet, r + 1, colIndex);
    }
  }
}

function addImageLink_(sheet, row, graphCol) {
  const cell = sheet.getRange(row, graphCol);
  const dataUrl = cell.getValue();
  if (typeof dataUrl !== 'string' || dataUrl.indexOf(GRAPH_DATA_URL_PREFIX) !== 0) return;

  const base64 = dataUrl.substring(GRAPH_DATA_URL_PREFIX.length);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/png', `sprint-graph-row${row}.png`);

  const folder = getOrCreateFolder_(DRIVE_FOLDER_NAME);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const viewUrl = `https://drive.google.com/file/d/${file.getId()}/view`;
  const linkCol = getOrCreateLinkColumn_(sheet);
  sheet.getRange(row, linkCol).setFormula(`=HYPERLINK("${viewUrl}", "🖼️ ดูรูป")`);
}

function getOrCreateLinkColumn_(sheet) {
  const lastCol = sheet.getLastColumn();
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const existingIndex = header.indexOf(LINK_COLUMN_HEADER);
  if (existingIndex !== -1) return existingIndex + 1;

  const newCol = lastCol + 1;
  sheet.getRange(1, newCol).setValue(LINK_COLUMN_HEADER);
  return newCol;
}

function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}
