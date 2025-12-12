import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateEmployeeData } from './generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function parseSize(sizeStr) {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(MB|KB|GB)?$/i);
  if (!match) return null;
  
  const value = parseFloat(match[1]);
  const unit = (match[2] || 'MB').toUpperCase();
  
  const multipliers = {
    'KB': 1024,
    'MB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024
  };
  
  return Math.floor(value * multipliers[unit]);
}

function estimateEmployeesForSize(targetSize, calendarYear) {
  // Generate a small sample to estimate size per employee
  const sampleSize = 10;
  const sample = generateEmployeeData(sampleSize, calendarYear);
  const sampleJson = JSON.stringify(sample, null, 2);
  const bytesPerEmployee = sampleJson.length / sampleSize;
  
  // Add some buffer for variability
  const estimatedEmployees = Math.ceil(targetSize / bytesPerEmployee * 1.1);
  return estimatedEmployees;
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: node generate.js <count|size> <year>');
    console.error('Examples:');
    console.error('  node generate.js 100 2024');
    console.error('  node generate.js 0.5MB 2024');
    console.error('  node generate.js 10MB 2024');
    process.exit(1);
  }
  
  const countOrSize = args[0];
  const calendarYear = args[1];
  
  if (!/^\d{4}$/.test(calendarYear)) {
    console.error('Error: Year must be 4 digits (e.g., 2024)');
    process.exit(1);
  }
  
  let numEmployees;
  let outputFilename;
  
  // Check if it's a size specification (must have MB, KB, or GB unit)
  if (/^\d+(?:\.\d+)?\s*(MB|KB|GB)$/i.test(countOrSize)) {
    const targetSize = parseSize(countOrSize);
    if (!targetSize) {
      console.error('Error: Invalid size format. Use format like: 0.5MB, 10MB, 1GB');
      process.exit(1);
    }
    
    console.log(`Generating data to reach approximately ${countOrSize}...`);
    numEmployees = estimateEmployeesForSize(targetSize, calendarYear);
    outputFilename = `employees_${countOrSize}_${calendarYear}.json`;
  } else {
    // It's a count
    numEmployees = parseInt(countOrSize, 10);
    if (isNaN(numEmployees) || numEmployees <= 0) {
      console.error('Error: Employee count must be a positive integer');
      process.exit(1);
    }
    outputFilename = `employees_${numEmployees}_${calendarYear}.json`;
  }
  
  console.log(`Generating data for ${numEmployees} employees for year ${calendarYear}...`);
  
  const startTime = Date.now();
  const data = generateEmployeeData(numEmployees, calendarYear);
  const generationTime = Date.now() - startTime;
  
  // Ensure data directory exists
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const outputPath = path.join(dataDir, outputFilename);
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(outputPath, json, 'utf8');
  
  const fileSize = fs.statSync(outputPath).size;
  const totalW2s = data.employees.reduce((sum, emp) => sum + emp.w2s.Report_Entry.length, 0);
  const totalW2Cs = data.employees.reduce((sum, emp) => sum + emp.w2cs.Report_Entry.length, 0);
  
  console.log('\nGeneration complete!');
  console.log(`  Employees: ${numEmployees}`);
  console.log(`  Total W2s: ${totalW2s}`);
  console.log(`  Total W2Cs: ${totalW2Cs}`);
  console.log(`  File size: ${formatBytes(fileSize)}`);
  console.log(`  Generation time: ${generationTime}ms`);
  console.log(`  Output file: ${outputPath}`);
}

main();

