import { google } from 'googleapis';

async function testGoogleSheets() {
  try {
    console.log('Starting Google Sheets test...');
    
    // Configuration
    const GOOGLE_CLIENT_EMAIL = 'degenpoet@hazel-logic-452717-h3.iam.gserviceaccount.com';
    const GOOGLE_SHEETS_SPREADSHEET_ID = '1A6kggkeDD2tpiUoSs5kqSVEINlsNLrZ6ne5azS2_sF0';
    const GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDbuapMacQ4b2aO\nF3Dyzw0Fd2tb+hja45iJlDCeVA0q4Sg+jYYGDUJd3u37GpT1XZIJjcmdIodtd4yj\nFjjRZeaaD3Rh2JOndmWjuDYy9Mp432kcgJjmAY/1vO5HWkHFJRwOeQd2Ozw4vteO\nvOXXUZ02H4YoEpIUo6/qf46P4V+pNSywLxWJm8U7kt6wRhw2nlRUT6TwKsPFCSRQ\na8LLOG/jN7zBToGSLDsPJ+OB4vh033ucWn0u67TjmZ+FnXRNQvPwt3HnLX6uUURG\nOHDuxdbViupSTUT+reaBi68Y90X4zlzsK924xt/CRp+o4w6icAfPw2o2/H/5t4YD\nJaX6t96PAgMBAAECggEAAJO/jlZl7R5O7xTmHA0pv3M2tWgjxEm1Cm94yKZAuget\nqKtCyCWSxOk1tWNI6k7vCkQ9ylSWLHq4n7R4POEjyOyq5XLmCqy1XjVvzd2adEKJ\n9/+gMFTCuC+F24+M/PYB2ZK9PUdDaRa/PVgHGxiuf3YKBb5aLCm0w0zHVKf9m1W9\nmmk5LXPT54/Hv2XLyMMpy7iqtau5rgw3eRaxrp1EvAzBtm0Wk9dB/C9RPRSHLjon\noPteNjcP3kLU8k98vy8AP/5p6HytDurQEnc53jG/5UwmOd9TgDuXesktG7lblFup\nHCaGl/i7OxFV/rwOk3GH8zcE1GS7RhJofVS+I13FUQKBgQD2Lp5Tfs2UGUn8vS3G\nvIYmytSdSAWCm4kPe32QhJPYV4s7pjUz/qHD7nwLtSKO/+teHk9tR45mlDbDhHAB\na77ssrp+eRBG30/jvfju1eVqp41RqwmJ8132phazY3b0tl7awue15iXKBK8BetL1\npcA8ETwimZK4gU6Fl2BUtwZ/9wKBgQDkfO/ow9cCPbv+k/WlltpgDw9QqWkkLopa\nsrC3BbURp5+vkpQXuFOzOscLQihWEC3nHWJNfxH5s0ILzmUGYmwDo2au9P/wZMK4\nfxgiS5VLZIXYx8w0XuEKs5qIErXT6bM4gpx9Vknkifl2j0lr8orhyq8nWM7DFrty\nQZKxxCWgKQKBgB3hzMAPzT5jz3JJOEw+R/5fcm1g96JB5OInODeZkCSbg8AKzbxw\n9QvGX/I/22EGOXikLznxjJxw8zDKW5ogjP1IOJDvewVPR/A5+ARtnDpU+jdmjnLb\nQpWU1X6S3TaZCGx/agbPV9jstp10XjUJGItyAB2nDIMu1uwqUrwVt0lDAoGBAICN\nzsmOjkVDiKdGhhpBkuIi9wHyHybtTIiVKxn+iw7A2faFqO7jlawssNqjwWASwFDd\nVna1vN5Zvho4aNy7uXwejmJ3lBykBG6bi2+YSQpfJ3N9jmYUz9cekB5pMIZnYZ+0\n1OksCG0eOA49thiXIQ7C4+NmcwaOnq49OJTuACFpAoGBAL9Uf8vitp1qJX0+zDAi\nsKIhNH8pMXMFs6gxhbFJHgDmV/kC73zCt/gWmZbIKjrYJ/42uLAWC7hVpGhYOEWk\nHquWbu0Wzz0CUq8zAYEjaPpBfWIGjuDCKEIm84lDVKXZ+OMGIKCwMGsp03iGgJtm\nWvw5pIfo5fI1vmwJianBbxW9\n-----END PRIVATE KEY-----\n';

    // Initialize Google Sheets client
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: GOOGLE_CLIENT_EMAIL,
        private_key: GOOGLE_PRIVATE_KEY,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    console.log('Auth client created, initializing sheets client...');
    const sheets = google.sheets({ version: 'v4', auth });

    // Test the connection
    console.log('Testing connection...');
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID
    });
    console.log('Successfully connected to spreadsheet:', spreadsheet.data.properties.title);

    // Fetch collections data
    console.log('\nFetching collections data...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID,
      range: 'collections!A:G',
    });

    const rows = response.data.values || [];
    console.log('\nRaw data from sheet:');
    console.log('Total rows:', rows.length);
    console.log('Headers:', rows[0]);
    
    // Process the data - get all collections but mark which ones are ultimates
    const allCollections = rows.slice(1).map(row => ({
      address: row[0] || '',
      name: row[1] || '',
      image: row[2] || '',
      description: row[3] || '',
      addedAt: row[4] ? Number(row[4]) : Date.now(),
      creationDate: row[5] || new Date().toISOString(),
      ultimates: row[6] === 'TRUE' || row[6] === 'true',
      collectionId: row[0] || ''
    })).filter(collection => collection.address && collection.name);

    // Separate collections into ultimates and regular
    const ultimateCollections = allCollections.filter(collection => collection.ultimates);
    const regularCollections = allCollections.filter(collection => !collection.ultimates);

    console.log('\nAll valid collections:', allCollections.length);
    console.log('Ultimate collections (not to be fetched):', ultimateCollections.length);
    console.log('Regular collections (to be fetched):', regularCollections.length);
    
    console.log('\nUltimate collections:');
    console.log(JSON.stringify(ultimateCollections, null, 2));
    
    console.log('\nRegular collections:');
    console.log(JSON.stringify(regularCollections, null, 2));

  } catch (error) {
    console.error('Error:', error);
    console.error('Stack trace:', error.stack);
  }
}

testGoogleSheets();
