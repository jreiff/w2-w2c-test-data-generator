import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extract W2s from various formats
function extractW2s(data) {
  const w2s = [];
  
  // Handle triple-nested arrays: [[[{W2}]]]
  if (Array.isArray(data) && data.length > 0) {
    if (Array.isArray(data[0]) && Array.isArray(data[0][0])) {
      // Triple nested
      for (const outer of data) {
        for (const middle of outer) {
          for (const w2 of middle) {
            if (w2 && typeof w2 === 'object') {
              w2s.push(w2);
            }
          }
        }
      }
      return w2s;
    }
    
    // Double-nested arrays: [[{W2}]]
    if (Array.isArray(data[0])) {
      for (const outer of data) {
        for (const w2 of outer) {
          if (w2 && typeof w2 === 'object') {
            w2s.push(w2);
          }
        }
      }
      return w2s;
    }
    
    // Single array: [{W2}]
    if (data[0] && typeof data[0] === 'object') {
      return data;
    }
  }
  
  // Handle Report_Entry format: {Report_Entry: [w2, ...]}
  if (data.Report_Entry && Array.isArray(data.Report_Entry)) {
    return data.Report_Entry;
  }
  
  // Handle employees structure: {employees: [{w2s: {Report_Entry: [w2]}}]}
  if (data.employees && Array.isArray(data.employees)) {
    for (const emp of data.employees) {
      if (emp.w2s && emp.w2s.Report_Entry) {
        w2s.push(...emp.w2s.Report_Entry);
      }
    }
    return w2s;
  }
  
  return [];
}

// Extract W2Cs from various formats
function extractW2Cs(data) {
  const w2cs = [];
  
  // Handle employees structure: {employees: [{w2cs: {Report_Entry: [w2c]}}]}
  if (data.employees && Array.isArray(data.employees)) {
    for (const emp of data.employees) {
      if (emp.w2cs && emp.w2cs.Report_Entry) {
        w2cs.push(...emp.w2cs.Report_Entry);
      }
    }
    return w2cs;
  }
  
  // Handle Report_Entry format: {Report_Entry: [w2c, ...]}
  if (data.Report_Entry && Array.isArray(data.Report_Entry)) {
    return data.Report_Entry;
  }
  
  return [];
}

// Helper to get local wages field (without period)
function getLocalWages1(w2) {
  return w2["XMLNAME_18_-_Local_wages__tips__etc_1"];
}

function getLocalWages2(w2) {
  return w2["XMLNAME_18_-_Local_wages__tips__etc_2"];
}

// Match localities according to Workday rules:
// - If W2C locality is NONE/empty → matches
// - If W2 locality is NONE → matches
// - If both have the same locality → matches
// - Otherwise → no match
function localitiesMatch(w2cLocality, w2Locality) {
  const w2cIsNone = !w2cLocality || w2cLocality === '';
  const w2IsNone = !w2Locality || w2Locality === '';
  
  // If either is NONE/empty, they match
  if (w2cIsNone || w2IsNone) {
    return true;
  }
  
  // If both have values, they must be the same
  return w2cLocality === w2Locality;
}

// Match W2Cs to W2s by Company, State, Locality (NOT Employee_ID)
// Workday orchestration logic
function matchW2CToW2(w2c, w2s) {
  const w2cCompany = w2c.Company;
  const w2cState = w2c["XMLNAME_15_-_Payroll_Tax_State_Code"];
  const w2cLocality1 = w2c["XMLNAME_20_-_Locality_name_1"] || '';
  const w2cLocality2 = w2c["XMLNAME_20_-_Locality_name_2"] || '';
  const w2cOriginalStateWages = w2c["XMLNAME_16_-_State_Wages_tips__etc_group"];
  const w2cHasLocal1 = !!getLocalWages1(w2c);
  const w2cHasLocal2 = !!getLocalWages2(w2c);
  
  const candidates = [];
  
  for (const w2 of w2s) {
    // Must match Company and State
    if (w2.Company !== w2cCompany) continue;
    if (w2["XMLNAME_15_-_Payroll_Tax_State_Code"] !== w2cState) continue;
    
    // Get W2 localities
    const w2Locality1 = w2["XMLNAME_20_-_Locality_name_1"] || '';
    const w2Locality2 = w2["XMLNAME_20_-_Locality_name_2"] || '';
    const w2HasLocal1 = !!getLocalWages1(w2);
    const w2HasLocal2 = !!getLocalWages2(w2);
    
    // Both localities must match
    if (localitiesMatch(w2cLocality1, w2Locality1) && 
        localitiesMatch(w2cLocality2, w2Locality2)) {
      candidates.push(w2);
    }
  }
  
  if (candidates.length === 0) {
    return null;
  }
  
  // If only one candidate, return it
  if (candidates.length === 1) {
    return candidates[0];
  }
  
  // Multiple candidates - use original state wages to disambiguate
  // This helps match to the W2 that the W2C was actually generated from
  if (w2cOriginalStateWages) {
    for (const w2 of candidates) {
      const w2StateWages = w2["XMLNAME_16_-_State_Wages_tips__etc_group"];
      if (w2StateWages === w2cOriginalStateWages) {
        return w2;
      }
    }
  }
  
  // If still multiple candidates and can't disambiguate, return first
  // This indicates potential data quality issue
  return candidates[0];
}

// Match W2 to W2 for validation
// Uses Employee_ID, Company, State, Calendar_Year
function matchW2ToW2(originalW2, finalW2s) {
  for (const finalW2 of finalW2s) {
    if (originalW2.Employee_ID !== finalW2.Employee_ID) continue;
    if (originalW2.Company !== finalW2.Company) continue;
    if (originalW2["XMLNAME_15_-_Payroll_Tax_State_Code"] !== finalW2["XMLNAME_15_-_Payroll_Tax_State_Code"]) continue;
    if (originalW2.Calendar_Year !== finalW2.Calendar_Year) continue;
    
    return finalW2;
  }
  
  return null;
}

// Check if value is numeric but should be string
function isNumericButShouldBeString(value) {
  return typeof value === 'number';
}

// Validate W2 structure
function validateW2(w2, index) {
  const issues = [];
  
  // Check for incomplete entries (missing Employee_ID)
  if (!w2.Employee_ID) {
    issues.push(`Missing Employee_ID`);
  }
  
  // Check for numeric fields that should be strings
  const numericFields = [];
  for (const [key, value] of Object.entries(w2)) {
    if (isNumericButShouldBeString(value)) {
      numericFields.push(key);
    }
  }
  
  if (numericFields.length > 0) {
    issues.push(`Numeric fields that should be strings: ${numericFields.join(', ')}`);
  }
  
  return issues;
}

// Validate W2C correction
function validateW2CCorrection(w2c, w2) {
  const issues = [];
  
  if (!w2) {
    issues.push('No matching W2 found');
    return issues;
  }
  
  // Check state wages correction
  // Both W2 and W2C use "etc_group" (without period)
  const w2StateWagesStr = w2["XMLNAME_16_-_State_Wages_tips__etc_group"] || "0";
  const originalStateWages = parseFloat(w2StateWagesStr);
  const correctedStateWages = parseFloat(w2c["XMLNAME_16_-_State_Wages_tips__etc_group_W2C"] || "0");
  const reportedOriginal = parseFloat(w2c["XMLNAME_16_-_State_Wages_tips__etc_group"] || "0");
  
  if (Math.abs(originalStateWages - reportedOriginal) > 0.01) {
    issues.push(`State wages mismatch: W2 (Employee ${w2.Employee_ID || 'UNKNOWN'}) has ${w2StateWagesStr}, W2C reports original as ${w2c["XMLNAME_16_-_State_Wages_tips__etc_group"]}`);
  }
  
  // Check local wages corrections
  // Both W2 and W2C use "etc_1" and "etc_2" (without period)
  const originalLocal1 = getLocalWages1(w2);
  if (originalLocal1) {
    const originalLocal1Value = parseFloat(originalLocal1 || "0");
    const w2cLocalField = w2c["XMLNAME_18_-_Local_wages__tips__etc_1"];
    if (w2cLocalField) {
      const reportedOriginalLocal1 = parseFloat(w2cLocalField || "0");
      if (Math.abs(originalLocal1Value - reportedOriginalLocal1) > 0.01) {
        issues.push(`Local wages 1 mismatch: W2 has ${originalLocal1Value}, W2C reports original as ${reportedOriginalLocal1}`);
      }
    }
  }
  
  const originalLocal2 = getLocalWages2(w2);
  if (originalLocal2) {
    const originalLocal2Value = parseFloat(originalLocal2 || "0");
    const w2cLocalField = w2c["XMLNAME_18_-_Local_wages__tips__etc_2"];
    if (w2cLocalField) {
      const reportedOriginalLocal2 = parseFloat(w2cLocalField || "0");
      if (Math.abs(originalLocal2Value - reportedOriginalLocal2) > 0.01) {
        issues.push(`Local wages 2 mismatch: W2 has ${originalLocal2Value}, W2C reports original as ${reportedOriginalLocal2}`);
      }
    }
  }
  
  return issues;
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: node validate.js <input_file> [orchestration_output_file]');
    console.error('Examples:');
    console.error('  node validate.js data/employees_100_2024.json');
    console.error('  node validate.js data/employees_100_2024.json data/orchestration_output.json');
    process.exit(1);
  }
  
  const inputFile = args[0];
  const orchestrationFile = args[1];
  
  if (!fs.existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }
  
  console.log(`Reading input file: ${inputFile}`);
  const inputData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  
  // Check if data has employee structure - if so, validate within each employee's group
  const hasEmployeeStructure = inputData.employees && Array.isArray(inputData.employees);
  
  // Extract W2s and W2Cs from input
  const inputW2s = extractW2s(inputData);
  const inputW2Cs = extractW2Cs(inputData);
  
  console.log(`Found ${inputW2s.length} W2s and ${inputW2Cs.length} W2Cs in input file`);
  if (hasEmployeeStructure) {
    console.log(`Data has employee structure - validating within employee groups`);
  }
  
  let orchestrationW2s = [];
  if (orchestrationFile) {
    if (!fs.existsSync(orchestrationFile)) {
      console.error(`Error: File not found: ${orchestrationFile}`);
      process.exit(1);
    }
    
    console.log(`Reading orchestration file: ${orchestrationFile}`);
    const orchestrationData = JSON.parse(fs.readFileSync(orchestrationFile, 'utf8'));
    orchestrationW2s = extractW2s(orchestrationData);
    console.log(`Found ${orchestrationW2s.length} W2s in orchestration file`);
  }
  
  // Validate W2s
  console.log('\n=== Validating W2s ===');
  const w2Issues = [];
  for (let i = 0; i < inputW2s.length; i++) {
    const issues = validateW2(inputW2s[i], i);
    if (issues.length > 0) {
      w2Issues.push({ index: i, w2: inputW2s[i], issues });
    }
  }
  
  if (w2Issues.length > 0) {
    console.log(`\nFound ${w2Issues.length} W2s with issues:`);
    for (const { index, w2, issues } of w2Issues) {
      console.log(`\nW2 #${index} (Employee: ${w2.Employee_ID || 'MISSING'}, Company: ${w2.Company}):`);
      for (const issue of issues) {
        console.log(`  - ${issue}`);
      }
    }
  } else {
    console.log('All W2s are valid!');
  }
  
  // Validate W2Cs
  console.log('\n=== Validating W2Cs ===');
  const w2cIssues = [];
  let matchedCount = 0;
  let unmatchedCount = 0;
  
  if (hasEmployeeStructure) {
    // Validate within each employee's group
    for (const emp of inputData.employees) {
      const empW2s = emp.w2s?.Report_Entry || [];
      const empW2Cs = emp.w2cs?.Report_Entry || [];
      
      for (let i = 0; i < empW2Cs.length; i++) {
        const w2c = empW2Cs[i];
        // First try to match within this employee's W2s
        let matchedW2 = matchW2CToW2(w2c, empW2s);
        
        // If no match in employee's group, try all W2s (for cross-employee scenarios)
        if (!matchedW2) {
          matchedW2 = matchW2CToW2(w2c, inputW2s);
        }
        
        if (!matchedW2) {
          unmatchedCount++;
          w2cIssues.push({
            index: i,
            w2c,
            issues: ['No matching W2 found']
          });
        } else {
          matchedCount++;
          const issues = validateW2CCorrection(w2c, matchedW2);
          if (issues.length > 0) {
            w2cIssues.push({ index: i, w2c, issues });
          }
        }
      }
    }
  } else {
    // Flat structure - match against all W2s
    for (let i = 0; i < inputW2Cs.length; i++) {
      const w2c = inputW2Cs[i];
      const matchedW2 = matchW2CToW2(w2c, inputW2s);
      
      if (!matchedW2) {
        unmatchedCount++;
        w2cIssues.push({
          index: i,
          w2c,
          issues: ['No matching W2 found']
        });
      } else {
        matchedCount++;
        const issues = validateW2CCorrection(w2c, matchedW2);
        if (issues.length > 0) {
          w2cIssues.push({ index: i, w2c, issues });
        }
      }
    }
  }
  
  console.log(`Matched ${matchedCount} W2Cs to W2s`);
  console.log(`Unmatched ${unmatchedCount} W2Cs`);
  
  if (w2cIssues.length > 0) {
    console.log(`\nFound ${w2cIssues.length} W2Cs with issues:`);
    for (const { index, w2c, issues } of w2cIssues) {
      console.log(`\nW2C #${index} (Employee: ${w2c.Employee_ID || 'MISSING'}, Company: ${w2c.Company}):`);
      for (const issue of issues) {
        console.log(`  - ${issue}`);
      }
    }
  } else {
    console.log('All W2Cs are valid!');
  }
  
  // If orchestration file provided, compare
  if (orchestrationFile && orchestrationW2s.length > 0) {
    console.log('\n=== Comparing with Orchestration Output ===');
    console.log(`Orchestration output has ${orchestrationW2s.length} W2s`);
    
    // Check for incomplete entries in orchestration
    const incompleteOrchestration = orchestrationW2s.filter(w2 => !w2.Employee_ID);
    if (incompleteOrchestration.length > 0) {
      console.log(`\nFound ${incompleteOrchestration.length} incomplete W2 entries (missing Employee_ID) in orchestration output`);
    }
    
    // Check for numeric fields
    const numericIssues = [];
    for (let i = 0; i < orchestrationW2s.length; i++) {
      const w2 = orchestrationW2s[i];
      for (const [key, value] of Object.entries(w2)) {
        if (isNumericButShouldBeString(value)) {
          numericIssues.push({ index: i, field: key, value });
        }
      }
    }
    
    if (numericIssues.length > 0) {
      console.log(`\nFound ${numericIssues.length} numeric fields that should be strings in orchestration output:`);
      const fieldCounts = {};
      for (const { field } of numericIssues) {
        fieldCounts[field] = (fieldCounts[field] || 0) + 1;
      }
      for (const [field, count] of Object.entries(fieldCounts)) {
        console.log(`  - ${field}: ${count} occurrences`);
      }
    }
  }
  
  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total W2s: ${inputW2s.length}`);
  console.log(`W2s with issues: ${w2Issues.length}`);
  console.log(`Total W2Cs: ${inputW2Cs.length}`);
  console.log(`W2Cs with issues: ${w2cIssues.length}`);
  console.log(`W2Cs matched: ${matchedCount}`);
  console.log(`W2Cs unmatched: ${unmatchedCount}`);
  
  if (w2Issues.length === 0 && w2cIssues.length === 0 && unmatchedCount === 0) {
    console.log('\n✓ All validations passed!');
    process.exit(0);
  } else {
    console.log('\n✗ Some validations failed. See details above.');
    process.exit(1);
  }
}

main();

