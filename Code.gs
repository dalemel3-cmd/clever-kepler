function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Athletics App')
    .addItem('Open Tracker', 'showSidebar')
    .addToUi();
}

function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Shiloh Athletics Tracker')
    .setWidth(400);
  SpreadsheetApp.getUi().showSidebar(html);
}

function getAthletes() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Athletes');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  // Assuming header: Name, Sport, Team, Position
  const athletes = [];
  for (let i = 1; i < data.length; i++) {
    athletes.push({
      id: 'a' + i,
      name: data[i][0] || '',
      sport: data[i][1] || '',
      team: data[i][2] || '',
      position: data[i][3] || ''
    });
  }
  return athletes;
}

function saveWeighIn(athleteName, sport, weight, sleep) {
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Weigh-ins');
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Weigh-ins');
    sheet.appendRow(['Timestamp', 'Athlete Name', 'Sport', 'Body Weight (lbs)', 'Sleep (hrs)']);
  }
  
  sheet.appendRow([new Date(), athleteName, sport, weight, sleep]);
  return true;
}

function getHistory() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Weigh-ins');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  // Format: [Timestamp, Athlete Name, Sport, Body Weight (lbs), Sleep (hrs)]
  const history = data.slice(1).map(row => ({
    date: row[0],
    name: row[1],
    sport: row[2],
    weight: row[3],
    sleep: row[4]
  }));
  return history;
}
