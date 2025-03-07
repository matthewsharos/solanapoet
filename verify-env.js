/**
 * Vercel Environment Variables Verification Script
 * 
 * This script checks that all required environment variables are set correctly
 * for the Vercel production environment.
 */

function checkEnvVar(name, value, validator = (v) => !!v) {
  const exists = value !== undefined && value !== null && value !== '';
  const valid = exists && validator(value);
  return { exists, valid };
}

function verifyEnvironment() {
  console.log('⚙️ Verifying environment variables for Vercel deployment...\n');
  
  // Required environment variables for Google Sheets
  const googleSheets = {
    GOOGLE_CLIENT_EMAIL: checkEnvVar(
      'GOOGLE_CLIENT_EMAIL', 
      process.env.GOOGLE_CLIENT_EMAIL,
      (v) => v.includes('@') && v.includes('.') // Basic email validation
    ),
    
    GOOGLE_PRIVATE_KEY: checkEnvVar(
      'GOOGLE_PRIVATE_KEY',
      process.env.GOOGLE_PRIVATE_KEY,
      (v) => v.includes('BEGIN PRIVATE KEY') && v.includes('END PRIVATE KEY')
    ),
    
    GOOGLE_SHEETS_SPREADSHEET_ID: checkEnvVar(
      'GOOGLE_SHEETS_SPREADSHEET_ID',
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      (v) => v.length > 20 // Spreadsheet IDs are typically long strings
    ),
  };
  
  // Required environment variables for Helius API
  const helius = {
    HELIUS_API_KEY: checkEnvVar(
      'HELIUS_API_KEY',
      process.env.HELIUS_API_KEY,
      (v) => v.length > 10 // API keys are typically long
    )
  };
  
  // Required environment variables for Solana
  const solana = {
    SOLANA_RPC_URL: checkEnvVar(
      'SOLANA_RPC_URL',
      process.env.SOLANA_RPC_URL,
      (v) => v.startsWith('http') && (v.includes('helius') || v.includes('solana'))
    )
  };
  
  // Required environment variables for Google Drive
  const googleDrive = {
    GOOGLE_DRIVE_FOLDER_ID: checkEnvVar(
      'GOOGLE_DRIVE_FOLDER_ID',
      process.env.GOOGLE_DRIVE_FOLDER_ID,
      (v) => v.length > 10 // Folder IDs are typically long
    )
  };
  
  // Display results
  console.log('📊 Verification Results:\n');
  
  console.log('🔑 Google Sheets API:');
  Object.entries(googleSheets).forEach(([name, status]) => {
    console.log(`  ${formatStatus(status)} ${name}`);
  });
  
  console.log('\n🔑 Helius API:');
  Object.entries(helius).forEach(([name, status]) => {
    console.log(`  ${formatStatus(status)} ${name}`);
  });
  
  console.log('\n🔑 Solana:');
  Object.entries(solana).forEach(([name, status]) => {
    console.log(`  ${formatStatus(status)} ${name}`);
  });
  
  console.log('\n🔑 Google Drive:');
  Object.entries(googleDrive).forEach(([name, status]) => {
    console.log(`  ${formatStatus(status)} ${name}`);
  });
  
  // Verify newlines in Google Private Key
  if (googleSheets.GOOGLE_PRIVATE_KEY.exists) {
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const hasProperNewlines = privateKey.includes('\n');
    console.log('\n🔍 Google Private Key Format Check:');
    console.log(`  ${hasProperNewlines ? '✅' : '❌'} Contains proper newline characters`);
    
    if (!hasProperNewlines) {
      console.log('\n⚠️ WARNING: Your Google Private Key might not have proper newline characters.');
      console.log('   In Vercel, ensure you include literal newlines or properly escape them.');
      console.log('   Example: -----BEGIN PRIVATE KEY-----\\nkey-content\\n-----END PRIVATE KEY-----');
    }
  }
  
  // Overall status
  const allValid = Object.values({...googleSheets, ...helius, ...solana, ...googleDrive})
    .every(status => status.valid);
  
  console.log('\n📋 Overall Status:');
  console.log(`  ${allValid ? '✅ All environment variables are properly configured!' : '❌ Some environment variables are missing or invalid'}`);
  
  if (!allValid) {
    console.log('\n🛠️ Recommendation:');
    console.log('  1. Go to your Vercel project settings');
    console.log('  2. Navigate to the "Environment Variables" section');
    console.log('  3. Add or update the missing/invalid variables');
    console.log('  4. Redeploy your application');
  }
}

function formatStatus({ exists, valid }) {
  if (!exists) return '❌';  // Doesn't exist
  if (!valid) return '⚠️';   // Exists but not valid
  return '✅';               // Exists and valid
}

// Run the verification
verifyEnvironment(); 